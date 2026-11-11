import { ANKI_SEARCH_KEYS, parseTerm, tokenize, type CardSearchTerm } from "../../cardSearchQuery.ts";

// Editing the written query for the search field, its chips and the menu. Matching stays in `cardSearchQuery.ts`.

/** A top-level part of the query as written: a word or phrase, a term, a group in parentheses or `or`. */
interface QueryItem {
  source: string;
  kind: "word" | "term" | "group" | "or";
  /** Members of a group `(a or b …)` of plain terms, as the menu writes it; null for any other group. */
  members: string[] | null;
  negated: boolean;
}

function queryItems(query: string): QueryItem[] {
  const tokens = tokenize(query);
  const items: QueryItem[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "or") { items.push({ source: "or", kind: "or", members: null, negated: false }); continue; }
    if (token.type === "atom") {
      const source = query.slice(token.start, token.end);
      items.push({ source, kind: parseTerm(token.value) ? "term" : "word", members: null, negated: token.negated });
      continue;
    }
    if (token.type === "close") continue;
    // A group runs to its matching parenthesis; an unclosed one stays text until it is finished.
    let depth = 0;
    let end = index;
    for (; end < tokens.length; end += 1) {
      if (tokens[end].type === "open") depth += 1;
      if (tokens[end].type === "close") depth -= 1;
      if (depth === 0) break;
    }
    if (end >= tokens.length) {
      items.push({ source: query.slice(token.start).trim(), kind: "word", members: null, negated: false });
      break;
    }
    const inner = tokens.slice(index + 1, end);
    const plain = inner.length % 2 === 1 && inner.every((part, position) => position % 2 === 1
      ? part.type === "or"
      : part.type === "atom" && !part.negated && parseTerm(part.value) !== null);
    items.push({
      source: query.slice(token.start, tokens[end].end),
      kind: "group",
      members: plain ? inner.filter((part) => part.type === "atom").map((part) => query.slice(part.start, part.end)) : null,
      negated: token.negated,
    });
    index = end;
  }
  return items;
}

const sameTerm = (left: string, right: string) => left.toLocaleLowerCase("und") === right.toLocaleLowerCase("und");

/** Tri-state of one term in the query: `in` as written or within a menu group, `out` negated, `""` absent. */
export function cardSearchTermState(query: string, term: string): "" | "in" | "out" {
  for (const item of queryItems(String(query ?? ""))) {
    if (item.kind === "term" && sameTerm(item.source, term)) return "in";
    if (item.kind === "term" && sameTerm(item.source, `-${term}`)) return "out";
    if (item.kind === "group" && !item.negated && item.members?.some((member) => sameTerm(member, term))) return "in";
  }
  return "";
}

/**
 * Sets one term to `in`, `out` or absent and keeps the text and every other term in place. With `siblings` (the terms
 * of the same menu group) an `in` joins the siblings already set to `in` as one group: `(flag:1 or flag:2)`.
 */
export function withCardSearchTermState(query: string, term: string, state: "" | "in" | "out", siblings: readonly string[] = []): string {
  const items: Array<QueryItem | null> = queryItems(String(query ?? "")).flatMap((item): QueryItem[] => {
    if (item.kind === "term" && (sameTerm(item.source, term) || sameTerm(item.source, `-${term}`))) return [];
    if (item.kind !== "group" || item.negated || !item.members?.some((member) => sameTerm(member, term))) return [item];
    const members = item.members.filter((member) => !sameTerm(member, term));
    if (!members.length) return [];
    return [members.length === 1 ? { source: members[0], kind: "term", members: null, negated: false } : { ...item, source: `(${members.join(" or ")})`, members }];
  });
  if (state === "out") items.push({ source: `-${term}`, kind: "term", members: null, negated: true });
  if (state === "in") {
    const isSibling = (candidate: string) => siblings.some((sibling) => sameTerm(sibling, candidate));
    const joined: string[] = [];
    let place = -1;
    items.forEach((item, index) => {
      const members = item?.kind === "term" && !item.negated && isSibling(item.source) ? [item.source]
        : item?.kind === "group" && !item.negated && item.members?.every(isSibling) ? item.members : null;
      if (!members) return;
      joined.push(...members);
      if (place < 0) place = index;
      items[index] = null;
    });
    const added = joined.length ? `(${[...joined, term].join(" or ")})` : term;
    const item: QueryItem = { source: added, kind: joined.length ? "group" : "term", members: joined.length ? [...joined, term] : null, negated: false };
    if (place < 0) items.push(item);
    else items[place] = item;
  }
  return items.filter((item): item is QueryItem => Boolean(item)).map((item) => item.source).join(" ");
}

/** The query without one of its chips (a term or a group, as written). */
export function withoutCardSearchItem(query: string, source: string): string {
  return queryItems(String(query ?? "")).filter((item) => item.source !== source).map((item) => item.source).join(" ");
}

/** Free text of the query, without its terms and groups; what the search field shows. */
export function cardSearchText(query: string): string {
  return queryItems(String(query ?? "")).filter((item) => item.kind === "word" || item.kind === "or").map((item) => item.source).join(" ");
}

/** Terms of the given kinds as written (`Feld:Text` is `field`, `rated:7` is `since`), negated ones included. */
export function cardSearchTermsOfKind(query: string, kind: CardSearchTerm["kind"]): string[] {
  return queryItems(String(query ?? "")).filter((item) => item.kind === "term" && parseTerm(item.source)?.kind === kind).map((item) => item.source);
}

/** Terms and groups of the query in their written order, as the filter chips show them. */
export function cardSearchTerms(query: string): string[] {
  return queryItems(String(query ?? "")).filter((item) => item.kind === "term" || item.kind === "group").map((item) => item.source);
}

/** Members of a chip `(a or b …)` written as a menu group, else null. */
export function cardSearchGroupMembers(source: string): { members: string[]; negated: boolean } | null {
  const [item] = queryItems(source);
  return item?.kind === "group" && item.members ? { members: item.members, negated: item.negated } : null;
}

/**
 * Typing into the search field: the query keeps its terms and takes the new text; a recognized term that the user
 * finished with a space (or that is followed by more words) becomes a term and leaves the field.
 */
export function withCardSearchText(query: string, input: string): { query: string; input: string } {
  const finished = /\s$/.test(input);
  const items = queryItems(input);
  // Text with `or` stays one expression in the field; promoting its terms would change what it means.
  const combined = items.some((item) => item.kind === "or");
  const promoted = items.map((item, index) => !combined && (item.kind === "term" || item.kind === "group") && (finished || index < items.length - 1));
  const terms = items.filter((_, index) => promoted[index]).map((item) => item.source);
  const rest = items.filter((_, index) => !promoted[index]).map((item) => item.source);
  return {
    query: [...cardSearchTerms(query), ...terms, ...rest].join(" "),
    input: rest.join(" ") + (finished && rest.length ? " " : ""),
  };
}

/** Anki terms CoRe does not know yet; the search treats them as text. */
export function unsupportedCardSearchTerms(query: unknown): string[] {
  return tokenize(String(query ?? "")).filter((token) => {
    const match = token.type === "atom" ? /^([a-z]+):./i.exec(token.value) : null;
    return Boolean(match && ANKI_SEARCH_KEYS.has(match[1].toLowerCase()) && !parseTerm(token.value));
  }).map((token) => String(query).slice(token.start, token.end));
}
