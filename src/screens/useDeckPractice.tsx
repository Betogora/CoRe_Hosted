import React from "react";
import type { Card, Deck, Note } from "../coreTypes.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { hitStudyQuery } from "../hitStudySession.ts";
import { createCardSearchContext, DEFAULT_CARD_TABLE_SORT } from "../libraryModel.ts";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceStore } from "../useWorkspaceStore.ts";
import { HitStudyFlow } from "./cardList/HitStudyFlow.tsx";

/** `practiceDeck` is missing while the card catalog is unavailable. */
export function useDeckPractice() {
  const { clock, hydration, mediaStore } = useAppServices();
  const workspaceStore = useWorkspaceStore();
  const [deck, setDeck] = React.useState<Deck | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const loadCardIds = useStableCallback(async () => {
    const decks = workspaceStore.get().state?.decks ?? [];
    const query = hitStudyQuery("");
    return hydration!.listCardIds({
      deckIds: [...collectDeckTreeIds(decks, deck!.id)],
      query,
      searchContext: createCardSearchContext(query, decks, { now: clock.learningNow, dayStartHour: clock.globalSchedulerPreferences.dayStartHour, timeZone: clock.learningTimeZone }),
      sort: DEFAULT_CARD_TABLE_SORT,
    });
  });

  const element = deck && hydration ? (
    <HitStudyFlow
      title="Alle Karten frei üben"
      practiceDeckName={deck.name}
      loadCardIds={loadCardIds}
      loadPracticeCards={async (cardIds) => (await hydration.openCards(cardIds)).filter((body): body is { card: Card; note: Note } => Boolean(body))}
      mediaStore={mediaStore}
      returnFocusRef={returnFocusRef}
      onClose={() => setDeck(null)}
    />
  ) : null;

  return {
    practiceDeck: hydration ? (practised: Deck, returnFocus: HTMLElement | null) => {
      returnFocusRef.current = returnFocus;
      setDeck(practised);
    } : undefined,
    element,
  };
}
