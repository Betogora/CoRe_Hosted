import type { Deck } from "./coreTypes.ts";

const deckNameCollator = new Intl.Collator("de-DE", {
  numeric: false,
  sensitivity: "base",
});

export function compareDeckNames(left: Pick<Deck, "name">, right: Pick<Deck, "name">): number {
  return deckNameCollator.compare(left.name, right.name);
}

export function buildSortedDeckChildren(decks: readonly Deck[]): Map<string | null, Deck[]> {
  const deckIds = new Set(decks.map((deck) => deck.id));
  const childrenByParent = new Map<string | null, Deck[]>();

  for (const deck of decks) {
    const parentId = deck.parentDeckId && deckIds.has(deck.parentDeckId) ? deck.parentDeckId : null;
    const siblings = childrenByParent.get(parentId);
    if (siblings) siblings.push(deck);
    else childrenByParent.set(parentId, [deck]);
  }

  for (const siblings of childrenByParent.values()) siblings.sort(compareDeckNames);
  return childrenByParent;
}
