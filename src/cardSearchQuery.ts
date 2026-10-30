import type { CardCatalogEntry } from "./workspaceReplica.ts";

/**
 * Search terms in Anki notation: `flag:1`, `tag:herz` (also finds `herz::*`), `tag:none`, `tag:leech`,
 * `tag:marked`, `is:suspended`; a leading `-` negates a term. All terms must match.
 */
type CardSearchTerm =
  | { kind: "flag"; value: number; negated: boolean }
  | { kind: "tag"; value: string; negated: boolean }
  | { kind: "tag-none" | "leech" | "marked" | "suspended"; negated: boolean };

export interface CardSearchQuery {
  /** Remaining words, lower case, matched as one substring of the content text. */
  text: string;
  terms: CardSearchTerm[];
}

type SearchableEntry = Pick<CardCatalogEntry, "normalizedSearchText" | "ankiFlag" | "tagKeys" | "leeched" | "marked" | "reviewable">;

function parseTerm(token: string): CardSearchTerm | null {
  const match = /^(-?)(flag|tag|is):(.+)$/i.exec(token);
  if (!match) return null;
  const negated = match[1] === "-";
  const key = match[2].toLowerCase();
  const value = match[3].toLocaleLowerCase("und");
  if (key === "flag") return /^[0-7]$/.test(value) ? { kind: "flag", value: Number(value), negated } : null;
  if (key === "is") return value === "suspended" ? { kind: "suspended", negated } : null;
  if (value === "none") return { kind: "tag-none", negated };
  if (value === "leech") return { kind: "leech", negated };
  if (value === "marked") return { kind: "marked", negated };
  return { kind: "tag", value, negated };
}

export function parseCardSearchQuery(query: unknown): CardSearchQuery {
  const words: string[] = [];
  const terms: CardSearchTerm[] = [];
  for (const token of String(query ?? "").trim().split(/\s+/).filter(Boolean)) {
    const term = parseTerm(token);
    if (term) terms.push(term);
    else words.push(token);
  }
  return { text: words.join(" ").toLocaleLowerCase("de"), terms };
}

function termMatches(entry: SearchableEntry, term: CardSearchTerm): boolean {
  switch (term.kind) {
    case "flag": return entry.ankiFlag === term.value;
    case "tag": return entry.tagKeys.includes(term.value);
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

/** Filters of the card management, read from and written to the search terms of the query. */
export interface CardSearchFilters {
  /** 0 for cards without a flag, null for any. */
  flag: number | null;
  leech: boolean;
  tags: string[];
}

export function readCardSearchFilters(query: string): CardSearchFilters {
  const { terms } = parseCardSearchQuery(query);
  const flag = terms.find((term) => term.kind === "flag" && !term.negated);
  return {
    flag: flag?.kind === "flag" ? flag.value : null,
    leech: terms.some((term) => term.kind === "leech" && !term.negated),
    tags: terms.flatMap((term) => term.kind === "tag" && !term.negated ? [term.value] : []),
  };
}

/** Replaces the positive terms of one filter and keeps the text and every other term in place. */
export function withCardSearchFilter(query: string, filter: keyof CardSearchFilters, value: CardSearchFilters[keyof CardSearchFilters]): string {
  const owned = (token: string) => {
    const term = parseTerm(token);
    if (!term || term.negated) return false;
    return filter === "flag" ? term.kind === "flag" : filter === "leech" ? term.kind === "leech" : term.kind === "tag";
  };
  const kept = String(query ?? "").trim().split(/\s+/).filter((token) => token && !owned(token));
  const added = filter === "flag"
    ? (typeof value === "number" ? [`flag:${value}`] : [])
    : filter === "leech"
      ? (value === true ? ["tag:leech"] : [])
      : (Array.isArray(value) ? value.map((tag) => `tag:${tag}`) : []);
  return [...kept, ...added].join(" ");
}
