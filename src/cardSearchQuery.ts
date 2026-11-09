import type { NoteInteraction, ReviewRating } from "./coreTypes.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

const DAY_MS = 86_400_000;

/**
 * Search terms in Anki notation: `flag:1`, `tag:herz` (also finds `herz::*`), `tag:none`, `tag:leech`,
 * `tag:marked`, `is:suspended|new|learn|review|young|mature|due`, `prop:due<n` (days from today, also `<=`, `=`,
 * `>=`, `>`), `has:variant`, `did:<deck id>` and `deck:Name` (the deck with its subdecks; `*` and `_` as wildcards),
 * `added:n`, `edited:n`, `introduced:n`, `resched:n`, `rated:n` and `rated:n:1` to `4` (today and the n - 1 days before),
 * `prop:ivl|d|reps|lapses` with `<`, `<=`, `=`, `!=`, `>=`, `>`, the content form `is:reveal|choice|cloze|occlusion`,
 * `note:Name` (Anki note type, wildcards like `deck:`) and `mid:<note type id>`, `has:outdated` (an outdated variant),
 * `card:N` (number of the prompt as in Anki), `is:buried` (buried by hand today; buried siblings only exist in a session)
 * and `Feld:Text` for text in one named field; a leading `-` negates a term, a phrase or a group.
 *
 * Combination (KV2d): words and terms side by side must all match, `or` between them needs one, parentheses group,
 * `"…"` quotes a phrase or a term with spaces (`"deck:Anatomie 1"`, `deck:"Anatomie 1"`). Every query becomes a list
 * of clauses that must all match; a clause is one term, or `{ kind: "any" }` with terms of which one must match.
 *
 * Terms relative to today or to the deck tree are resolved against a `CardSearchContext`, so the local search and
 * the cloud RPCs evaluate the same fixed bounds and deck ids.
 */
export type CardSearchTerm =
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
  | { kind: "notetype"; ids: string[]; negated: boolean }
  | { kind: "card"; value: number; negated: boolean }
  /** Buried by hand from `from` (the start of today) on and not unburied since. */
  | { kind: "buried"; from: string; negated: boolean }
  | { kind: "tag-none" | "leech" | "marked" | "suspended" | "variant" | "outdated"; negated: boolean }
  /** A word or a phrase of the content text, lower case (KV2d). */
  | { kind: "text"; value: string; negated: boolean };

/** One clause of a query: a single term, or terms of which one must match. */
export type CardSearchClause = CardSearchTerm | { kind: "any"; terms: CardSearchTerm[]; negated: false };

type SinceField = "added" | "edited" | "introduced" | "rescheduled" | "rated";
type PropField = "ivl" | "d" | "s" | "reps" | "lapses";
type PropOperator = "<" | "<=" | "=" | "!=" | ">=" | ">";

export interface CardSearchContext {
  /** Start of the current learning day in milliseconds. */
  todayStart: number;
  /** Deck ids of a deck and all its subdecks, keyed by the deck id of a `did:` term. */
  deckSubtrees?: Readonly<Record<string, readonly string[]>>;
  /** Deck ids matching a `deck:` pattern with their subdecks, keyed by the lower-case pattern. */
  deckMatches?: Readonly<Record<string, readonly string[]>>;
  /** Note type ids whose name matches a `note:` pattern, keyed by the lower-case pattern. */
  noteTypeMatches?: Readonly<Record<string, readonly string[]>>;
}

/** Keys of Anki's search syntax (and CoRe's `has:`); any other `name:text` searches the field of that name. */
export const ANKI_SEARCH_KEYS = new Set(["added", "card", "cid", "deck", "did", "dupe", "edited", "flag", "has", "introduced", "is", "mid", "nc", "nid", "note", "preset", "prop", "rated", "re", "resched", "sc", "tag", "w"]);

export interface CardSearchQuery {
  /** The longest word that must match on its own, lower case: a prefilter over the content text (one index lookup). */
  text: string;
  /** Clauses that must all match. */
  terms: CardSearchClause[];
}

type SearchableEntry = Pick<CardCatalogEntry, "normalizedSearchText" | "searchFields" | "ankiFlag" | "tagKeys" | "leeched" | "marked" | "reviewable" | "scheduleState" | "maturityBand" | "dueAt" | "hasActiveVariants" | "deckId"
  | "createdAt" | "editedAt" | "contentKind" | "intervalDays" | "difficulty" | "reps" | "lapses"
  | "firstReviewedAt" | "lastAgainAt" | "lastHardAt" | "lastGoodAt" | "lastEasyAt" | "lastRescheduledAt" | "noteTypeId" | "hasOutdatedVariants" | "promptOrdinal" | "lastBuriedAt" | "lastUnburiedAt" | "durabilityDays">;

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

export function parseTerm(token: string, context?: CardSearchContext): CardSearchTerm | null {
  const field = /^(-?)([\p{L}\p{N}_]+):(.+)$/u.exec(token);
  if (field && !ANKI_SEARCH_KEYS.has(field[2].toLowerCase())) {
    return { kind: "field", name: field[2].toLocaleLowerCase("de"), value: field[3].toLocaleLowerCase("de"), negated: field[1] === "-" };
  }
  const due = /^(-?)prop:due(<=|>=|<|>|=)(-?\d{1,4})$/i.exec(token);
  if (due) return { kind: "due", ...dueRange(due[2], Number(due[3]), context), reviewableOnly: false, negated: due[1] === "-" };
  const prop = /^(-?)prop:(ivl|d|s|reps|lapses)(<=|>=|!=|<|>|=)(\d{1,5}(?:\.\d+)?)$/i.exec(token);
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
  const card = /^(-?)card:(\d{1,3})$/i.exec(token);
  if (card && Number(card[2]) >= 1) return { kind: "card", value: Number(card[2]), negated: card[1] === "-" };
  const match = /^(-?)(flag|tag|is|has|did|deck|note|mid):(.+)$/i.exec(token);
  if (!match) return null;
  const negated = match[1] === "-";
  const key = match[2].toLowerCase();
  if (key === "did") return { kind: "deck", ids: [...(context?.deckSubtrees?.[match[3]] ?? [match[3]])], negated };
  if (key === "deck") return { kind: "deck", ids: [...(context?.deckMatches?.[match[3].toLocaleLowerCase("und")] ?? [])], negated };
  if (key === "mid") return { kind: "notetype", ids: [match[3]], negated };
  if (key === "note") return { kind: "notetype", ids: [...(context?.noteTypeMatches?.[match[3].toLocaleLowerCase("und")] ?? [])], negated };
  const value = match[3].toLocaleLowerCase("und");
  if (key === "flag") return /^[0-7]$/.test(value) ? { kind: "flag", value: Number(value), negated } : null;
  if (key === "has") return value === "variant" ? { kind: "variant", negated } : value === "outdated" ? { kind: "outdated", negated } : null;
  if (key === "is") {
    if (value === "suspended") return { kind: "suspended", negated };
    if (value === "buried") return { kind: "buried", from: dayBound(context, 0), negated };
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

/** A word, phrase or term (`atom`), a parenthesis or the `or` keyword, with its place in the query. */
interface Token {
  type: "atom" | "open" | "close" | "or";
  negated: boolean;
  /** Atom text without quotes. */
  value: string;
  start: number;
  end: number;
}

export function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < query.length) {
    if (/\s/.test(query[index])) { index += 1; continue; }
    const start = index;
    const negated = query[index] === "-" && index + 1 < query.length && !/\s/.test(query[index + 1]);
    if (negated) index += 1;
    if (query[index] === "(") { tokens.push({ type: "open", negated, value: "(", start, end: index + 1 }); index += 1; continue; }
    if (query[index] === ")") { tokens.push({ type: "close", negated: false, value: ")", start, end: index + 1 }); index += 1; continue; }
    let value = "";
    let quoted = false;
    while (index < query.length && (quoted || !/[\s()]/.test(query[index]))) {
      if (query[index] === '"') quoted = !quoted;
      else value += query[index];
      index += 1;
    }
    const keyword = value.toLowerCase();
    if (!negated && keyword === "and" && query[start] !== '"') continue;
    tokens.push({ type: !negated && keyword === "or" && query[start] !== '"' ? "or" : "atom", negated, value, start, end: index });
  }
  return tokens;
}

type SearchNode = { type: "atom"; value: string; negated: boolean } | { type: "and" | "or"; nodes: SearchNode[]; negated: boolean };

/** `expr := and ("or" and)*`, `and := unary+`, `unary := "-"? (atom | "(" expr ")")`; stray tokens are skipped. */
function parseNodes(tokens: Token[]): SearchNode {
  let position = 0;
  const parseUnary = (): SearchNode | null => {
    const token = tokens[position];
    if (!token || token.type === "close" || token.type === "or") return null;
    position += 1;
    if (token.type === "atom") return { type: "atom", value: token.value, negated: token.negated };
    const inner = parseOr();
    if (tokens[position]?.type === "close") position += 1;
    return { ...inner, negated: inner.negated !== token.negated };
  };
  const parseAnd = (): SearchNode => {
    const nodes: SearchNode[] = [];
    for (let node = parseUnary(); node; node = parseUnary()) nodes.push(node);
    return { type: "and", nodes, negated: false };
  };
  const parseOr = (): SearchNode => {
    const nodes = [parseAnd()];
    while (tokens[position]?.type === "or") {
      position += 1;
      nodes.push(parseAnd());
    }
    return nodes.length === 1 ? nodes[0] : { type: "or", nodes: nodes.filter((node) => node.type !== "and" || node.nodes.length), negated: false };
  };
  const nodes: SearchNode[] = [];
  while (position < tokens.length) {
    nodes.push(parseOr());
    if (position < tokens.length) position += 1; // An unmatched `)` or `or` is skipped.
  }
  return { type: "and", nodes, negated: false };
}

/** Beyond this many clauses a query counts as too nested; it then matches nothing. */
const MAX_CLAUSES = 1024;

function leafOf(value: string, negated: boolean, context?: CardSearchContext): CardSearchTerm {
  const term = parseTerm(value, context);
  if (term) return { ...term, negated };
  return { kind: "text", value: value.toLocaleLowerCase("de"), negated };
}

/** Clauses (all must match) of terms (one must match), with every negation moved to the terms. */
function clausesOf(node: SearchNode, negate: boolean, context?: CardSearchContext): CardSearchTerm[][] {
  const negated = node.negated !== negate;
  if (node.type === "atom") return node.value ? [[leafOf(node.value, negated, context)]] : [];
  // An `and` stays a list of clauses; an `or` needs one of its parts: every combination of their clauses.
  const conjunction = (node.type === "and") !== negated;
  const parts = node.nodes.map((child) => clausesOf(child, negated, context));
  if (conjunction) return parts.flat();
  return parts.filter((part) => part.length).reduce<CardSearchTerm[][]>((combined, part) => {
    const next = combined.flatMap((left) => part.map((right) => [...left, ...right]));
    if (next.length > MAX_CLAUSES) throw new RangeError("Suche zu verschachtelt");
    return next;
  }, [[]]);
}

/** Text and terms of a query; terms relative to today or to the deck tree are resolved against `context`. */
export function parseCardSearchQuery(query: unknown, context?: CardSearchContext): CardSearchQuery {
  let clauses: CardSearchTerm[][];
  try {
    clauses = clausesOf(parseNodes(tokenize(String(query ?? ""))), false, context);
  } catch {
    return { text: "", terms: [{ kind: "any", terms: [], negated: false }] };
  }
  // The longest word that must match on its own serves as prefilter; it leaves the clauses.
  let prefilter = -1;
  clauses.forEach((clause, index) => {
    const [term] = clause;
    if (clause.length === 1 && term.kind === "text" && !term.negated && term.value && (prefilter < 0 || term.value.length > (clauses[prefilter][0] as { value: string }).value.length)) prefilter = index;
  });
  const text = prefilter < 0 ? "" : (clauses[prefilter][0] as { value: string }).value;
  const terms = clauses
    .filter((clause, index) => index !== prefilter && clause.length)
    .map((clause): CardSearchClause => clause.length === 1 ? clause[0] : { kind: "any", terms: clause, negated: false });
  return { text, terms };
}

/** Every word, phrase and term of the query (inside groups too), without quotes and leading `-`. */
function atomValues(query: unknown): string[] {
  return tokenize(String(query ?? "")).filter((token) => token.type === "atom").map((token) => token.value);
}

/** Values of the `did:`, `deck:` and `note:` terms (patterns in lower case); the caller resolves them for the context. */
export function cardSearchContextTerms(query: unknown): { deckIds: string[]; deckNames: string[]; noteTypeNames: string[] } {
  const found = { did: new Set<string>(), deck: new Set<string>(), note: new Set<string>() };
  for (const value of atomValues(query)) {
    const match = /^(did|deck|note):(.+)$/i.exec(value);
    if (!match) continue;
    const key = match[1].toLowerCase() as keyof typeof found;
    found[key].add(key === "did" ? match[2] : match[2].toLocaleLowerCase("und"));
  }
  return { deckIds: [...found.did], deckNames: [...found.deck], noteTypeNames: [...found.note] };
}

function wildcardSource(pattern: string): string {
  return [...pattern].map((char) => char === "*" ? ".*" : char === "_" ? "." : char.replace(/[.+?^$()|[\]{}\\]/g, "\\$&")).join("");
}

/** Whether a deck path (`A::B`) matches a `deck:` pattern like Anki: `*` any text, `_` one character, subdecks included. */
export function deckPatternMatches(pattern: string, path: string): boolean {
  return new RegExp(`^${wildcardSource(pattern)}(?:::.*)?$`, "iu").test(path);
}

/** Whether a note type name matches a `note:` pattern with the same wildcards. */
export function namePatternMatches(pattern: string, name: string): boolean {
  return new RegExp(`^${wildcardSource(pattern)}$`, "iu").test(name);
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
  // Durability (`s`) is known once the card was answered by a client that stores it (KV2e).
  return field === "ivl" ? entry.intervalDays : field === "s" ? entry.durabilityDays ?? undefined : entry.difficulty;
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
    case "notetype": return Boolean(entry.noteTypeId) && term.ids.includes(entry.noteTypeId!);
    case "outdated": return entry.hasOutdatedVariants === true;
    case "card": return entry.promptOrdinal === term.value;
    case "text": return entry.normalizedSearchText.includes(term.value);
    case "buried":
      return Boolean(entry.lastBuriedAt) && Date.parse(entry.lastBuriedAt!) >= Date.parse(term.from)
        && (!entry.lastUnburiedAt || Date.parse(entry.lastUnburiedAt) < Date.parse(entry.lastBuriedAt!));
    case "tag-none": return entry.tagKeys.length === 0;
    case "leech": return entry.leeched;
    case "marked": return entry.marked;
    case "suspended": return !entry.reviewable;
  }
}

/** Offline counterpart of the catalog search in `list_account_card_catalog` and `search_account_card_catalog`. */
export function matchesCardSearch(entry: SearchableEntry, search: CardSearchQuery): boolean {
  const matches = (term: CardSearchTerm) => termMatches(entry, term) !== term.negated;
  return (!search.text || entry.normalizedSearchText.includes(search.text))
    && search.terms.every((clause) => clause.kind === "any" ? clause.terms.some(matches) : matches(clause));
}

/** Words that must each match on their own (prefilter and plain text clauses); a deck path containing all matches. */
function cardSearchWords(search: CardSearchQuery): string[] {
  return [search.text, ...search.terms.flatMap((clause) => clause.kind === "text" && !clause.negated ? [clause.value] : [])].filter(Boolean);
}

/** The search without its plain words: what a deck whose path contains them still filters its cards by. */
export function withoutCardSearchWords(search: CardSearchQuery): CardSearchQuery {
  return { text: "", terms: search.terms.filter((clause) => clause.kind !== "text" || clause.negated) };
}

/** A deck path that contains every word of the search (`medizin anatomie`, also `medizin / anatomie`). */
export function pathMatchesCardSearch(path: string, search: CardSearchQuery): boolean {
  const words = cardSearchWords(search);
  const normalizedPath = path.trim().toLowerCase();
  return words.length > 0 && words.every((word) => normalizedPath.includes(word));
}

export function isEmptyCardSearch(search: CardSearchQuery): boolean {
  return !search.text && search.terms.length === 0;
}
