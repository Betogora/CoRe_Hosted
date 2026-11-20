import type { LearningSettings, ReviewEvent } from "./coreTypes.ts";

export type SiblingBuryMode = Pick<LearningSettings, "buryNewSiblings" | "buryReviewSiblings" | "buryInterdayLearningSiblings">;

/** What a sibling is today: intraday learning is never buried, so it has no kind here. */
export type SiblingKind = "new" | "review" | "interday-learning";

const optionForKind: Record<SiblingKind, keyof SiblingBuryMode> = {
  new: "buryNewSiblings",
  review: "buryReviewSiblings",
  "interday-learning": "buryInterdayLearningSiblings",
};

export const MANUAL_BURY_KIND = "manual_bury";
export const MANUAL_UNBURY_KIND = "manual_unbury";

/**
 * Cards the learner buried today: like buried siblings this is derived from today's events, never stored on the card.
 * The latest bury or unbury event of a card decides.
 */
export function manuallyBuriedCardIds(todayEvents: readonly Pick<ReviewEvent, "id" | "cardId" | "rating" | "answeredAt" | "flags">[]): Set<string> {
  const latest = new Map<string, { at: string; id: string; buried: boolean }>();
  for (const event of todayEvents) {
    const kind = event.rating === "manual" ? (event.flags as { kind?: unknown } | null)?.kind : null;
    if (kind !== MANUAL_BURY_KIND && kind !== MANUAL_UNBURY_KIND) continue;
    const previous = latest.get(event.cardId);
    if (previous && (previous.at > event.answeredAt || (previous.at === event.answeredAt && previous.id > event.id))) continue;
    latest.set(event.cardId, { at: event.answeredAt, id: event.id, buried: kind === MANUAL_BURY_KIND });
  }
  return new Set([...latest].filter(([, entry]) => entry.buried).map(([cardId]) => cardId));
}

export function buriesSiblings(mode: SiblingBuryMode | null | undefined): boolean {
  return Boolean(mode && (mode.buryNewSiblings || mode.buryReviewSiblings || mode.buryInterdayLearningSiblings));
}

/**
 * Contents are seen in queue order; the deck options of the siblings seen before a card decide whether it waits until
 * the next learning day. A card answered today itself never waits. The queue marks every card it looks at; the counters
 * only know today's answers.
 */
export function createSiblingBurying(modeForDeck: (deckId: string) => SiblingBuryMode | null | undefined) {
  const seenNotes = new Map<string, SiblingBuryMode>();
  const answeredCardIds = new Set<string>();

  const see = (noteId: string, deckId: string): SiblingBuryMode | undefined => {
    const mode = modeForDeck(deckId);
    const previous = seenNotes.get(noteId);
    seenNotes.set(noteId, {
      buryNewSiblings: Boolean(previous?.buryNewSiblings || mode?.buryNewSiblings),
      buryReviewSiblings: Boolean(previous?.buryReviewSiblings || mode?.buryReviewSiblings),
      buryInterdayLearningSiblings: Boolean(previous?.buryInterdayLearningSiblings || mode?.buryInterdayLearningSiblings),
    });
    return previous;
  };
  const waits = (cardId: string, mode: SiblingBuryMode | undefined, kind: SiblingKind) => !answeredCardIds.has(cardId) && Boolean(mode?.[optionForKind[kind]]);

  return {
    answered(cardId: string, noteId: string, deckId: string) {
      answeredCardIds.add(cardId);
      see(noteId, deckId);
    },
    /** A card the queue shows without burying it (intraday learning). */
    see,
    /** Also marks the card's content as seen. */
    buries(card: { id: string; noteId: string; deckId: string }, kind: SiblingKind): boolean {
      return waits(card.id, see(card.noteId, card.deckId), kind);
    },
    /** Like `buries`, without marking the content seen. */
    buriedBySeen(card: { id: string; noteId: string }, kind: SiblingKind): boolean {
      return waits(card.id, seenNotes.get(card.noteId), kind);
    },
    buryingNoteIds: () => [...seenNotes].filter(([, mode]) => buriesSiblings(mode)).map(([noteId]) => noteId),
  };
}
