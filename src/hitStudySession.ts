import { createCoreDeck } from "./coreModel.ts";
import type { Card, Deck } from "./coreTypes.ts";

/** Transient study root of `Treffer lernen` (KV5); like the exam unit it is never persisted. */
export const HIT_SESSION_DECK_ID = "hit-session";

/** `Wie die Liste` or `Gemischt`. */
export type HitStudyOrder = "list" | "shuffled";

/** Leaves out suspended and buried cards, which `Treffer lernen` never studies; top-level terms all apply. */
export function hitStudyQuery(query: string): string {
  return `${query.trim()} -is:suspended -is:buried`.trim();
}

/**
 * Session decks of `Treffer lernen`: a transient root over the hits' own decks, which keep their settings, so every
 * review follows the scheduler options of its deck. The root learns the cards in the given order or shuffled.
 */
export function createHitSessionDecks(decks: readonly Deck[], cards: readonly Card[], order: HitStudyOrder, createdAt: string, random: () => number = Math.random): Deck[] {
  const cardIds = cards.map((card) => card.id);
  if (order === "shuffled") {
    for (let index = cardIds.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [cardIds[index], cardIds[other]] = [cardIds[other], cardIds[index]];
    }
  }
  const root = createCoreDeck({ id: HIT_SESSION_DECK_ID, name: "Treffer lernen", createdAt, updatedAt: createdAt });
  const session: Deck[] = [{ ...root, plannedOrder: true, hitSession: { cardIds } }];
  for (const deckId of new Set(cards.map((card) => card.deckId))) {
    const deck = decks.find((candidate) => candidate.id === deckId);
    if (deck) session.push({ ...deck, parentDeckId: HIT_SESSION_DECK_ID, cards: cards.filter((card) => card.deckId === deckId), reviewEvents: [] });
  }
  return session;
}
