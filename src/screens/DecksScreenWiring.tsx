import { createStudyRoute } from "../appNavigation.ts";
import type { Card, Note } from "../coreTypes.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceStore, useWorkspaceValue } from "../useWorkspaceStore.ts";
import { DecksScreen } from "./DecksScreen.tsx";
import { useDeckPractice } from "./useDeckPractice.tsx";

export function DecksScreenWiring() {
  const { navigation, settings, clock, studyStart, cardCommands, cardEditorServices, deckCommands, variantBatch, requestDeckCoreMode, hydration, mediaStore } = useAppServices();
  const workspaceStore = useWorkspaceStore();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const { focusedDeckId, selectedCardId, deckContent, deckContentTab, cardEditorTab, cardEditorReturnContext, cardQuery, navigateToRoute, navigateToView, navigateToViewNow } = navigation;
  const deckPractice = useDeckPractice();
  if (!state) return null;
  const learningContentAccount = cardCommands.learningContentAccount();
  return (
    <>
      <DecksScreen
        decks={state.decks}
        onStartDeck={studyStart.startDeck}
        onPracticeDeck={deckPractice.practiceDeck}
        contentDeckId={deckContent ? focusedDeckId : null}
        contentTab={deckContentTab}
        cardQuery={cardQuery}
        onOpenDeckContent={(deckId, tab = "children") => navigateToViewNow("kartenstapel", { focusedDeckId: deckId, deckContent: true, deckContentTab: tab })}
        learningContentAccount={learningContentAccount}
        onGenerateSummary={cardCommands.generateLearningSummary}
        quiz={learningContentAccount ? { account: learningContentAccount, onGenerateQuiz: cardCommands.generateQuiz, onAskHelp: cardCommands.askCardHelp, onSaveCard: cardCommands.saveManualNote } : undefined}
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
        onGenerateVariant={cardCommands.generateDeckCardVariant}
        onGenerateCardVariants={hydration ? (deckId, cardIds) => {
          const deck = workspaceStore.get().state?.decks.find((candidate) => candidate.id === deckId);
          if (deck) variantBatch.start(deck, { cardIds });
        } : undefined}
        onRunCardBatch={hydration ? cardCommands.runDeckCardBatch : undefined}
        onPrepareTextReplace={hydration ? cardCommands.prepareDeckTextReplace : undefined}
        onStudyHits={hydration ? studyStart.startHitSession : undefined}
        onListSurplusDuplicateIds={hydration?.listSurplusDuplicateIds}
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
      {deckPractice.element}
    </>
  );
}
