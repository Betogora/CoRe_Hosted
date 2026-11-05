import type { NoteInteraction, ReviewRating } from "./coreTypes.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

const DAY_MS = 86_400_000;

/**
 * Search terms in Anki notation: `flag:1`, `tag:herz` (also finds `herz::*`), `tag:none`, `tag:leech`,
 * `tag:marked`, `is:suspended|new|learn|review|young|mature|due`, `prop:due<n` (days from today, also `<=`, `=`,
 * `>=`, `>`), `has:variant`, `did:<deck id>` and `deck:Name` (the deck with its subdecks; `*` and `_` as wildcards),
 * `added:n`, `edited:n`, `introduced:n`, `resched:n`, `rated:n` and `rated:n:1` to `4` (today and the n - 1 days before),
 * `prop:ivl|d|reps|lapses` with `<`, `<=`, `=`, `!=`, `>=`, `>`, the content form `is:reveal|choice|cloze|occlusion`
 * and `Feld:Text` for text in one named field; a leading `-` negates a term. All terms must match.
 *
 * Terms relative to today or to the deck tree are resolved against a `CardSearchContext`, so the local search and
 * the cloud RPCs evaluate the same fixed bounds and deck ids.
 */
type CardSearchTerm =
  | { kind: "flag"; value: number; negated: boolean }
  | { kind: "tag"; value: string; negated: boolean }
  | { kind: "field"; name: string; value: string; negated: boolean }
  | { kind: "state"; value: "new" | "learn" | "review"; negated: boolean }
  | { kind: "maturity"; value: "young" | "mature"; negated: boolean }
  /** Due cards that are not new, from `from` (inclusive) to `to` (exclusive); `reviewableOnly` for `is:due`. */
  | { kind: "due"; from: string | null; to: string | null; reviewableOnly: boolean; negated: boolean }
  | { kind: "deck"; ids: string[]; negated: boolean }
  /** Added, edited, first answered, rescheduled or answered (with `rating`, any rating if null) from `from` on. */
  | { kind: "since"; field: SinceField; rating: ReviewRating | null; from: string; negated: boolean }
  /** Interval and difficulty only count for cards that are not new; `value` is in days or on the scale of 1 to 10. */
  | { kind: "prop"; field: PropField; operator: PropOperator; value: number; negated: boolean }
  | { kind: "form"; value: NoteInteraction["kind"]; negated: boolean }
  | { kind: "tag-none" | "leech" | "marked" | "suspended" | "variant"; negated: boolean };

type SinceField = "added" | "edited" | "introduced" | "rescheduled" | "rated";
type PropField = "ivl" | "d" | "reps" | "lapses";
type PropOperator = "<" | "<=" | "=" | "!=" | ">=" | ">";

export interface CardSearchContext {
  /** Start of the current learning day in milliseconds. */
  todayStart: number;
  /** Deck ids of a deck and all its subdecks, keyed by the deck id of a `did:` term. */
  deckSubtrees?: Readonly<Record<string, readonly string[]>>;
  /** Deck ids matching a `deck:` pattern with their subdecks, keyed by the lower-case pattern. */
  deckMatches?: Readonly<Record<string, readonly string[]>>;
}

/** Keys of Anki's search syntax (and CoRe's `has:`); any other `name:text` searches the field of that name. */
const ANKI_SEARCH_KEYS = new Set(["added", "card", "cid", "deck", "did", "dupe", "edited", "flag", "has", "introduced", "is", "mid", "nc", "nid", "note", "preset", "prop", "rated", "re", "resched", "sc", "tag", "w"]);

export interface CardSearchQuery {
  /** Remaining words, lower case, matched as one substring of the content text. */
  text: string;
  terms: CardSearchTerm[];
}

type SearchableEntry = Pick<CardCatalogEntry, "normalizedSearchText" | "searchFields" | "ankiFlag" | "tagKeys" | "leeched" | "marked" | "reviewable" | "scheduleState" | "maturityBand" | "dueAt" | "hasActiveVariants" | "deckId"
  | "createdAt" | "editedAt" | "contentKind" | "intervalDays" | "difficulty" | "reps" | "lapses"
  | "firstReviewedAt" | "lastAgainAt" | "lastHardAt" | "lastGoodAt" | "lastEasyAt" | "lastRescheduledAt">;

const RATINGS: readonly ReviewRating[] = ["again", "hard", "good", "easy"];
const CONTENT_FORMS: Readonly<Record<string, NoteInteraction["kind"]>> = { reveal: "reveal", choice: "choice", cloze: "cloze", occlusion: "image-occlusion" };

function todayStartOf(context?: CardSearchContext) {
  if (context) return context.todayStart;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function dayBound(context: CardSearchContext | undefined, days: number) {
  return new Date(todayStartOf(context) + days * DAY_MS).toISOString();
}

function dueRange(operator: string, days: number, context: CardSearchContext | undefined): { from: string | null; to: string | null } {
  if (operator === "<") return { from: null, to: dayBound(context, days) };
  if (operator === "<=") return { from: null, to: dayBound(context, days + 1) };
  if (operator === ">") return { from: dayBound(context, days + 1), to: null };
  if (operator === ">=") return { from: dayBound(context, days), to: null };
  return { from: dayBound(context, days), to: dayBound(context, days + 1) };
}

function parseTerm(token: string, context?: CardSearchContext): CardSearchTerm | null {
  const field = /^(-?)([\p{L}\p{N}_]+):(.+)$/u.exec(token);
  if (field && !ANKI_SEARCH_KEYS.has(field[2].toLowerCase())) {
    return { kind: "field", name: field[2].toLocaleLowerCase("de"), value: field[3].toLocaleLowerCase("de"), negated: field[1] === "-" };
  }
  const due = /^(-?)prop:due(<=|>=|<|>|=)(-?\d{1,4})$/i.exec(token);
  if (due) return { kind: "due", ...dueRange(due[2], Number(due[3]), context), reviewableOnly: false, negated: due[1] === "-" };
  const prop = /^(-?)prop:(ivl|d|reps|lapses)(<=|>=|!=|<|>|=)(\d{1,5}(?:\.\d+)?)$/i.exec(token);
  if (prop) return { kind: "prop", field: prop[2].toLowerCase() as PropField, operator: prop[3] as PropOperator, value: Number(prop[4]), negated: prop[1] === "-" };
  const since = /^(-?)(added|edited|introduced|resched|rated):(\d{1,4})(?::([1-4]))?$/i.exec(token);
  if (since && Number(since[3]) >= 1 && (!since[4] || since[2].toLowerCase() === "rated")) {
    return {
      kind: "since",
      field: since[2].toLowerCase() === "resched" ? "rescheduled" : since[2].toLowerCase() as SinceField,
      rating: since[4] ? RATINGS[Number(since[4]) - 1] : null,
      from: dayBound(context, 1 - Number(since[3])),
      negated: since[1] === "-",
    };
  }
  const match = /^(-?)(flag|tag|is|has|did|deck):(.+)$/i.exec(token);
  if (!match) return null;
  const negated = match[1] === "-";
  const key = match[2].toLowerCase();
  if (key === "did") return { kind: "deck", ids: [...(context?.deckSubtrees?.[match[3]] ?? [match[3]])], negated };
  if (key === "deck") return { kind: "deck", ids: [...(context?.deckMatches?.[match[3].toLocaleLowerCase("und")] ?? [])], negated };
  const value = match[3].toLocaleLowerCase("und");
  if (key === "flag") return /^[0-7]$/.test(value) ? { kind: "flag", value: Number(value), negated } : null;
  if (key === "has") return value === "variant" ? { kind: "variant", negated } : null;
  if (key === "is") {
    if (value === "suspended") return { kind: "suspended", negated };
    if (value === "new" || value === "learn" || value === "review") return { kind: "state", value, negated };
    if (value === "young" || value === "mature") return { kind: "maturity", value, negated };
    if (value === "due") return { kind: "due", from: null, to: dayBound(context, 1), reviewableOnly: true, negated };
    if (Object.hasOwn(CONTENT_FORMS, value)) return { kind: "form", value: CONTENT_FORMS[value], negated };
    return null;
  }
  if (value === "none") return { kind: "tag-none", negated };
  if (value === "leech") return { kind: "leech", negated };
  if (value === "marked") return { kind: "marked", negated };
  return { kind: "tag", value, negated };
}

/** Text and terms of a query; terms relative to today or to the deck tree are resolved against `context`. */
export function parseCardSearchQuery(query: unknown, context?: CardSearchContext): CardSearchQuery {
  const words: string[] = [];
  const terms: CardSearchTerm[] = [];
  for (const token of String(query ?? "").trim().split(/\s+/).filter(Boolean)) {
    const term = parseTerm(token, context);
    if (term) terms.push(term);
    else words.push(token);
  }
  return { text: words.join(" ").toLocaleLowerCase("de"), terms };
}

/** Terms in Anki notation that CoRe does not understand yet; the search treats them as plain text. */
export function unsupportedCardSearchTerms(query: unknown): string[] {
  return String(query ?? "").trim().split(/\s+/).filter((token) => {
    const match = /^-?([a-z]+):./i.exec(token);
    return Boolean(match && ANKI_SEARCH_KEYS.has(match[1].toLowerCase()) && !parseTerm(token));
  });
}

/** Deck ids of the `did:` terms and lower-case patterns of the `deck:` terms; the caller resolves both for the context. */
export function cardSearchDeckTerms(query: unknown): { ids: string[]; names: string[] } {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const token of String(query ?? "").trim().split(/\s+/)) {
    const match = /^-?(did|deck):(.+)$/i.exec(token);
    if (match?.[1].toLowerCase() === "did") ids.add(match[2]);
    else if (match) names.add(match[2].toLocaleLowerCase("und"));
  }
  return { ids: [...ids], names: [...names] };
}

/** Whether a deck path (`A::B`) matches a `deck:` pattern like Anki: `*` any text, `_` one character, subdecks included. */
export function deckPatternMatches(pattern: string, path: string): boolean {
  const source = [...pattern].map((char) => char === "*" ? ".*" : char === "_" ? "." : char.replace(/[.+?^$()|[\]{}\\]/g, "\\$&")).join("");
  return new RegExp(`^${source}(?:::.*)?$`, "iu").test(path);
}

function sinceValue(entry: SearchableEntry, term: Extract<CardSearchTerm, { kind: "since" }>): string | null | undefined {
  if (term.field === "added") return entry.createdAt;
  if (term.field === "edited") return entry.editedAt;
  if (term.field === "introduced") return entry.firstReviewedAt;
  if (term.field === "rescheduled") return entry.lastRescheduledAt;
  const latest = { again: entry.lastAgainAt, hard: entry.lastHardAt, good: entry.lastGoodAt, easy: entry.lastEasyAt };
  if (term.rating) return latest[term.rating];
  return Object.values(latest).reduce<string | null | undefined>((max, value) => value && (!max || Date.parse(value) > Date.parse(max)) ? value : max, null);
}

function propValue(entry: SearchableEntry, field: PropField): number | undefined {
  if (field === "reps") return entry.reps;
  if (field === "lapses") return entry.lapses;
  if (entry.scheduleState === "new") return undefined;
  return field === "ivl" ? entry.intervalDays : entry.difficulty;
}

function compares(value: number, operator: PropOperator, target: number): boolean {
  if (operator === "<") return value < target;
  if (operator === "<=") return value <= target;
  if (operator === "=") return value === target;
  if (operator === "!=") return value !== target;
  if (operator === ">=") return value >= target;
  return value > target;
}

function termMatches(entry: SearchableEntry, term: CardSearchTerm): boolean {
  switch (term.kind) {
    case "flag": return entry.ankiFlag === term.value;
    case "tag": return entry.tagKeys.includes(term.value);
    case "field": return Boolean(entry.searchFields?.some((field) => field.name === term.name && field.text.includes(term.value)));
    case "state":
      return term.value === "learn" ? entry.scheduleState === "learning" || entry.scheduleState === "relearning" : entry.scheduleState === term.value;
    case "maturity": return entry.maturityBand === term.value;
    case "due": {
      if (entry.scheduleState === "new" || !entry.dueAt || (term.reviewableOnly && !entry.reviewable)) return false;
      const dueAt = Date.parse(entry.dueAt);
      return (term.from === null || dueAt >= Date.parse(term.from)) && (term.to === null || dueAt < Date.parse(term.to));
    }
    case "deck": return term.ids.includes(entry.deckId);
    case "variant": return entry.hasActiveVariants;
    case "since": {
      const value = sinceValue(entry, term);
      return Boolean(value) && Date.parse(value!) >= Date.parse(term.from);
    }
    case "prop": {
      const value = propValue(entry, term.field);
      return value !== undefined && compares(value, term.operator, term.value);
    }
    case "form": return entry.contentKind === term.value;
    case "tag-none": return entry.tagKeys.length === 0;
    case "leech": return entry.leeched;
    case "marked": return entry.marked;
    case "suspended": return !entry.reviewable;
  }
}

/** Offline counterpart of the catalog search in `list_account_card_catalog` and `search_account_card_catalog`. */
export function matchesCardSearch(entry: SearchableEntry, search: CardSearchQuery): boolean {
  return (!search.text || entry.normalizedSearchText.includes(search.text))
    && search.terms.every((term) => termMatches(entry, term) !== term.negated);
}

export function isEmptyCardSearch(search: CardSearchQuery): boolean {
  return !search.text && search.terms.length === 0;
}

/** Whether a search token is a term (`flag:1`, `-tag:x`, `Feld:Text` …) rather than free text. */
export function isCardSearchTerm(token: string): boolean {
  return parseTerm(token) !== null;
}

/** Tri-state of one term in the query: `in` as written, `out` negated, `""` absent. */
export function cardSearchTermState(query: string, term: string): "" | "in" | "out" {
  const tokens = String(query ?? "").trim().split(/\s+/);
  const key = term.toLocaleLowerCase("und");
  if (tokens.some((token) => token.toLocaleLowerCase("und") === key)) return "in";
  if (tokens.some((token) => token.toLocaleLowerCase("und") === `-${key}`)) return "out";
  return "";
}

/** Sets one term to `in`, `out` or absent and keeps the text and every other term in place. */
export function withCardSearchTermState(query: string, term: string, state: "" | "in" | "out"): string {
  const key = term.toLocaleLowerCase("und");
  const kept = String(query ?? "").trim().split(/\s+/).filter((token) => {
    const normalized = token.toLocaleLowerCase("und");
    return token && normalized !== key && normalized !== `-${key}`;
  });
  return [...kept, ...(state === "in" ? [term] : state === "out" ? [`-${term}`] : [])].join(" ");
}

/** Free text of the query, without its terms; what the search field shows. */
export function cardSearchText(query: string): string {
  return String(query ?? "").split(/\s+/).filter((token) => token && !isCardSearchTerm(token)).join(" ");
}

/** Terms of the given kinds as written (`Feld:Text` is `field`, `rated:7` is `since`), negated ones included. */
export function cardSearchTermsOfKind(query: string, kind: CardSearchTerm["kind"]): string[] {
  return cardSearchTerms(query).filter((token) => parseTerm(token)?.kind === kind);
}

/** Terms of the query in their written order, as the filter chips show them. */
export function cardSearchTerms(query: string): string[] {
  return String(query ?? "").trim().split(/\s+/).filter((token) => token && isCardSearchTerm(token));
}

/**
 * Typing into the search field: the query keeps its terms and takes the new text; a recognized term that the user
 * finished with a space (or that is followed by more words) becomes a term and leaves the field.
 */
export function withCardSearchText(query: string, input: string): { query: string; input: string } {
  const finished = /\s$/.test(input);
  const words = input.split(/\s+/).filter(Boolean);
  const promoted = words.map((word, index) => isCardSearchTerm(word) && (finished || index < words.length - 1));
  const terms = words.filter((_, index) => promoted[index]);
  const rest = words.filter((_, index) => !promoted[index]);
  return {
    query: [...cardSearchTerms(query), ...terms, ...rest].join(" "),
    input: rest.join(" ") + (finished && rest.length ? " " : ""),
  };
}
