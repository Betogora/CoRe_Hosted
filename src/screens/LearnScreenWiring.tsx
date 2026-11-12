import type { DeckCommands } from "../deckCommands.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { LearnScreen } from "./LearnScreen.tsx";

/** `Lernen` with the deck tree, deck creation and the starts of its decks. */
export function LearnScreenWiring() {
  const { navigation, settings, clock, studyStart, deckCommands, requestDeckCoreMode } = useAppServices();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const { focusedDeckId, deckCreationParentId, navigateToView, navigateToViewNow } = navigation;
  if (!state) return null;

  function openLearn(deckId: string | null = null) {
    navigateToView("lernen", { focusedDeckId: deckId || null });
  }

  function createDeck(input?: Parameters<DeckCommands["createDeck"]>[0]) {
    const saved = deckCommands.createDeck(input);
    if (saved) navigateToViewNow("lernen", { focusedDeckId: saved.id }, { replace: true });
    return saved;
  }

  return (
    <LearnScreen
      decks={state.decks}
      now={clock.learningNow}
      dayStartHour={clock.globalSchedulerPreferences.dayStartHour}
      learnAheadMinutes={clock.globalSchedulerPreferences.learnAheadMinutes}
      timeZone={clock.learningTimeZone}
      onStartDeck={studyStart.startDeck}
      onCreateDeck={createDeck}
      focusedDeckId={focusedDeckId}
      initialParentDeckId={deckCreationParentId}
      onDeckCreationHandled={() => navigateToViewNow("lernen", { focusedDeckId }, { replace: true })}
      onFocusDeck={openLearn}
      onOpenCardCreation={() => navigateToView("neue-karten", { creationMethod: "manual", creationDeckId: focusedDeckId || null })}
      onOpenDecks={(deckId = null, cardId = null) => navigateToViewNow("kartenstapel", {
        focusedDeckId: deckId || null,
        selectedCardId: deckId && cardId ? cardId : null,
      })}
      onOpenDeckContent={(deckId) => navigateToView("kartenstapel", { focusedDeckId: deckId, deckContent: true })}
      onOpenCardSettings={() => settings.openSettings("lerntag")}
      onOpenDeckSettings={(deckId) => settings.openDeckSettings(deckId)}
      onSetDeckCoreMode={requestDeckCoreMode}
      onMoveDeck={deckCommands.moveDeck}
      collapsedDeckIds={state.profile.uiPreferences.learnCollapsedDeckIds}
      onSetDeckExpanded={deckCommands.saveDeckExpansion}
    />
  );
}
