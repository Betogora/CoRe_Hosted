import { createStudyRoute } from "../appNavigation.ts";
import type { Card, Note } from "../coreTypes.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceStore, useWorkspaceValue } from "../useWorkspaceStore.ts";
import { DecksScreen } from "./DecksScreen.tsx";

/** The card management and a deck's content view with the card and deck commands, card editor and hit sessions. */
export function DecksScreenWiring() {
  const { navigation, settings, clock, studyStart, cardCommands, cardEditorServices, deckCommands, variantBatch, requestDeckCoreMode, hydration, cloud, mediaStore } = useAppServices();
  const workspaceStore = useWorkspaceStore();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const { focusedDeckId, selectedCardId, deckContent, deckContentTab, cardEditorTab, cardEditorReturnContext, navigateToRoute, navigateToView, navigateToViewNow } = navigation;
  if (!state) return null;
  return (
    <DecksScreen
      decks={state.decks}
      onStartDeck={studyStart.startDeck}
      contentDeckId={deckContent ? focusedDeckId : null}
      contentTab={deckContentTab}
      onOpenDeckContent={(deckId, tab = "children") => navigateToViewNow("kartenstapel", { focusedDeckId: deckId, deckContent: true, deckContentTab: tab })}
      summaryAccountId={state.profile.userId}
      learningContentCloud={cloud}
      onGenerateSummary={async (input, signal) => {
        const accountId = workspaceStore.get().state?.profile.userId;
        if (!accountId || !hydration || !cloud) throw new Error("Die Anmeldung und Kartenablage sind noch nicht bereit.");
        const { generateLearningSummary } = await import("../aiLearningSummary.ts");
        const result = await generateLearningSummary(input, async (ids, options) => {
          const loaded = await hydration.prepareContentDecks(ids, options);
          if (workspaceStore.get().state?.profile.userId !== accountId) throw new Error("Das Konto wurde gewechselt. Öffne die Zusammenfassungen erneut.");
          return loaded;
        }, workspaceStore.get().state!.decks, cloud, signal);
        if (workspaceStore.get().state?.profile.userId !== accountId) throw new Error("Das Konto wurde gewechselt. Öffne die Zusammenfassungen erneut.");
        return result;
      }}
      onRequestCardPage={cardCommands.requestCardPage}
      now={clock.learningNow}
      dayStartHour={clock.globalSchedulerPreferences.dayStartHour}
      learnAheadMinutes={clock.globalSchedulerPreferences.learnAheadMinutes}
      timeZone={clock.learningTimeZone}
      mediaStore={mediaStore}
      onSetDeckCoreMode={requestDeckCoreMode}
      onSaveNote={cardCommands.saveDeckNote}
      onSetCardStudyState={cardCommands.setCardStudyState}
      onDuplicateNote={cardCommands.duplicateDeckNote}
      onDeleteNote={cardCommands.deleteDeckNote}
      onUndoDeleteNote={cardCommands.undoDeleteDeckNote}
      onRescheduleCards={cardCommands.rescheduleDeckCards}
      onGenerateVariant={cardCommands.generateDeckCardVariant}
      onGenerateCardVariants={hydration ? (deckId, cardIds) => {
        const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === deckId);
        if (deck) variantBatch.start(deck, { cardIds });
      } : undefined}
      onRunCardBatch={hydration ? cardCommands.runDeckCardBatch : undefined}
      onPrepareTextReplace={hydration ? cardCommands.prepareDeckTextReplace : undefined}
      onStudyHits={hydration ? studyStart.startHitSession : undefined}
      onFindDuplicates={hydration?.findDuplicates}
      onLoadPracticeCards={hydration ? async (cardIds) => (await hydration.openCards(cardIds)).filter((body): body is { card: Card; note: Note } => Boolean(body)) : undefined}
      onListHitCardIds={hydration ? (request) => hydration.listCardIds(request) : undefined}
      variantGenerationRunning={variantBatch.running}
      onUpdateVariant={cardCommands.updateDeckCardVariant}
      selectedDeckId={focusedDeckId}
      selectedCardId={selectedCardId}
      cardEditorTab={cardEditorTab}
      onCardEditorTabChange={(tab) => navigateToViewNow("kartenstapel", {
        focusedDeckId,
        selectedCardId,
        cardEditorTab: tab,
        deckContent,
        deckContentTab: "cards",
        cardEditorReturnContext: cardEditorReturnContext ?? undefined,
      }, { replace: true })}
      cardEditor={cardEditorServices}
      onSelectDeck={deckContent ? (_deckId, cardId, tab) => navigateToViewNow("kartenstapel", {
        focusedDeckId,
        selectedCardId: cardId,
        cardEditorTab: tab,
        deckContent: true,
        deckContentTab: "cards",
      }) : (deckId, cardId, tab) => navigateToViewNow("kartenstapel", {
        focusedDeckId: deckId || null,
        selectedCardId: deckId && cardId ? cardId : null,
        cardEditorTab: tab,
      })}
      onCloseSelectedCard={cardEditorReturnContext ? () => navigateToRoute(createStudyRoute(
        cardEditorReturnContext.deckId,
        {
          returnContext: cardEditorReturnContext.returnContext,
        },
      ), { replace: true }) : undefined}
      onMoveDeck={deckCommands.moveDeck}
      onOpenLearn={(deckId = null) => navigateToView("lernen", { focusedDeckId: deckId || null })}
      onOpenCardSettings={() => settings.openSettings("lerntag")}
      onDraftStateChange={navigation.handleCardDraftStateChange}
      savedSearches={state.profile.uiPreferences.savedSearches}
      onSavedSearchesChange={deckCommands.saveSearches}
      onOpenDeckSettings={(deckId) => settings.openDeckSettings(deckId)}
    />
  );
}
