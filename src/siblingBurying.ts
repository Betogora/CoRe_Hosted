import type { LearningSettings } from "./coreTypes.ts";

/** The three burying options of a deck (K7.1). */
export type SiblingBuryMode = Pick<LearningSettings, "buryNewSiblings" | "buryReviewSiblings" | "buryInterdayLearningSiblings">;

/** What a sibling is today: intraday learning is never buried, so it has no kind here. */
export type SiblingKind = "new" | "review" | "interday-learning";

const optionForKind: Record<SiblingKind, keyof SiblingBuryMode> = {
  new: "buryNewSiblings",
  review: "buryReviewSiblings",
  "interday-learning": "buryInterdayLearningSiblings",
};

export function buriesSiblings(mode: SiblingBuryMode | null | undefined): boolean {
  return Boolean(mode && (mode.buryNewSiblings || mode.buryReviewSiblings || mode.buryInterdayLearningSiblings));
}

/**
 * Anki's sibling burying for one learning day. Contents are seen in queue order; the options of the decks of the
 * siblings seen before a card decide whether it waits until the next learning day. A card answered today itself never
 * waits. The queue marks every card it looks at; the counters only know today's answers.
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
    /** A card answered today: its content counts as seen with the options of the card's deck. */
    answered(cardId: string, noteId: string, deckId: string) {
      answeredCardIds.add(cardId);
      see(noteId, deckId);
    },
    /** A card the queue shows without burying it (intraday learning). */
    see,
    /** Marks the card's content as seen and tells whether the card waits because a sibling was seen before. */
    buries(card: { id: string; noteId: string; deckId: string }, kind: SiblingKind): boolean {
      return waits(card.id, see(card.noteId, card.deckId), kind);
    },
    /** Whether a card waits because of the contents seen so far, without marking it seen. */
    buriedBySeen(card: { id: string; noteId: string }, kind: SiblingKind): boolean {
      return waits(card.id, seenNotes.get(card.noteId), kind);
    },
    /** Contents seen so far whose siblings may wait. */
    buryingNoteIds: () => [...seenNotes].filter(([, mode]) => buriesSiblings(mode)).map(([noteId]) => noteId),
  };
}
