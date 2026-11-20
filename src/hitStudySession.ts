import { createCoreDeck } from "./coreModel.ts";
import type { Card, Deck } from "./coreTypes.ts";

/** Transient study root; like the exam unit it is never persisted. */
export const HIT_SESSION_DECK_ID = "hit-session";

export type HitStudyOrder = "list" | "shuffled";

/** `advance` writes reviews through the normal session; `practice` writes nothing. */
export type HitStudyMode = "advance" | "practice";

export function orderHits<T>(items: readonly T[], order: HitStudyOrder, random: () => number = Math.random): T[] {
  const ordered = [...items];
  if (order === "shuffled") {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
    }
  }
  return ordered;
}

export function hitStudyQuery(query: string): string {
  return `${query.trim()} -is:suspended -is:buried`.trim();
}

/**
 * A transient root over the hits' own decks, which keep their settings, so every review follows the scheduler options
 * of its deck.
 */
export function createHitSessionDecks(decks: readonly Deck[], cards: readonly Card[], order: HitStudyOrder, createdAt: string, random: () => number = Math.random): Deck[] {
  const cardIds = orderHits(cards.map((card) => card.id), order, random);
  const root = createCoreDeck({ id: HIT_SESSION_DECK_ID, name: "Treffer lernen", createdAt, updatedAt: createdAt });
  const session: Deck[] = [{ ...root, plannedOrder: true, hitSession: { cardIds } }];
  for (const deckId of new Set(cards.map((card) => card.deckId))) {
    const deck = decks.find((candidate) => candidate.id === deckId);
    if (deck) session.push({ ...deck, parentDeckId: HIT_SESSION_DECK_ID, cards: cards.filter((card) => card.deckId === deckId), reviewEvents: [] });
  }
  return session;
}

const PRACTICE_AGAIN_GAP = 3;

export interface PracticeState {
  /** Card ids still to show; the first is on screen. */
  queue: readonly string[];
  known: readonly string[];
  againCounts: Readonly<Record<string, number>>;
  difficult: readonly string[];
}

export function createPractice(cardIds: readonly string[]): PracticeState {
  return { queue: [...new Set(cardIds)], known: [], againCounts: {}, difficult: [] };
}

export function answerPractice(state: PracticeState, rating: "again" | "hard" | "good" | "easy"): PracticeState {
  const [cardId, ...rest] = state.queue;
  if (!cardId) return state;
  if (rating === "good" || rating === "easy") return { ...state, queue: rest, known: [...state.known, cardId] };
  const difficult = state.difficult.includes(cardId) ? state.difficult : [...state.difficult, cardId];
  if (rating === "hard") return { ...state, queue: [...rest, cardId], difficult };
  const at = Math.min(PRACTICE_AGAIN_GAP, rest.length);
  return {
    ...state,
    queue: [...rest.slice(0, at), cardId, ...rest.slice(at)],
    againCounts: { ...state.againCounts, [cardId]: (state.againCounts[cardId] ?? 0) + 1 },
    difficult,
  };
}
