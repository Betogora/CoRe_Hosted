import type { CardCatalogEntry } from "./workspaceReplica.ts";

const DAY_MS = 86_400_000;

/**
 * Search terms in Anki notation: `flag:1`, `tag:herz` (also finds `herz::*`), `tag:none`, `tag:leech`,
 * `tag:marked`, `is:suspended|new|learn|review|young|mature|due`, `prop:due<n` (days from today, also `<=`, `=`,
 * `>=`, `>`), `has:variant`, `did:<deck id>` (the deck with its subdecks) and `Feld:Text` for text in one named
 * field; a leading `-` negates a term. All terms must match.
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
  | { kind: "tag-none" | "leech" | "marked" | "suspended" | "variant"; negated: boolean };

export interface CardSearchContext {
  /** Start of the current learning day in milliseconds. */
  todayStart: number;
  /** Deck ids of a deck and all its subdecks, keyed by the deck id of a `did:` term. */
  deckSubtrees?: Readonly<Record<string, readonly string[]>>;
}

/** Keys of Anki's search syntax (and CoRe's `has:`); any other `name:text` searches the field of that name. */
const ANKI_SEARCH_KEYS = new Set(["added", "card", "cid", "deck", "did", "dupe", "edited", "flag", "has", "introduced", "is", "mid", "nc", "nid", "note", "preset", "prop", "rated", "re", "resched", "sc", "tag", "w"]);

export interface CardSearchQuery {
  /** Remaining words, lower case, matched as one substring of the content text. */
  text: string;
  terms: CardSearchTerm[];
}

type SearchableEntry = Pick<CardCatalogEntry, "normalizedSearchText" | "searchFields" | "ankiFlag" | "tagKeys" | "leeched" | "marked" | "reviewable" | "scheduleState" | "maturityBand" | "dueAt" | "hasActiveVariants" | "deckId">;

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
  const match = /^(-?)(flag|tag|is|has|did):(.+)$/i.exec(token);
  if (!match) return null;
  const negated = match[1] === "-";
  const key = match[2].toLowerCase();
  if (key === "did") return { kind: "deck", ids: [...(context?.deckSubtrees?.[match[3]] ?? [match[3]])], negated };
  const value = match[3].toLocaleLowerCase("und");
  if (key === "flag") return /^[0-7]$/.test(value) ? { kind: "flag", value: Number(value), negated } : null;
  if (key === "has") return value === "variant" ? { kind: "variant", negated } : null;
  if (key === "is") {
    if (value === "suspended") return { kind: "suspended", negated };
    if (value === "new" || value === "learn" || value === "review") return { kind: "state", value, negated };
    if (value === "young" || value === "mature") return { kind: "maturity", value, negated };
    if (value === "due") return { kind: "due", from: null, to: dayBound(context, 1), reviewableOnly: true, negated };
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

/** Deck ids of every `did:` term in the query; the caller resolves them to their subtrees for the context. */
export function cardSearchDeckIds(query: unknown): string[] {
  return [...new Set(String(query ?? "").trim().split(/\s+/).flatMap((token) => {
    const match = /^-?did:(.+)$/i.exec(token);
    return match ? [match[1]] : [];
  }))];
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

/** `Feld:Text` terms of the query as written, negated ones included. */
export function cardSearchFieldTerms(query: string): string[] {
  return cardSearchTerms(query).filter((token) => parseTerm(token)?.kind === "field");
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
