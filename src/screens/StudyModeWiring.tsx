import React from "react";
import { requestAiCardHelp } from "../aiCardHelp.ts";
import { reviewReturnContextToViewRoute } from "../appNavigation.ts";
import type { StudyModeProps } from "../appScreenProps.ts";
import { EXAM_SESSION_DECK_ID } from "../examPlanSettings.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { StudyMode } from "./StudyMode.tsx";

// Memoized: a shell render without changed session data leaves the running session alone.
const MemoizedStudyMode = React.memo(StudyMode);

/** The running study session; its callbacks keep their identity across shell renders. */
export function StudyModeWiring() {
  const { navigation, settings, clock, pomodoro, sync, study, cardEditorServices, cloud, mediaStore } = useAppServices();
  const { studyRequest, deckSettings, navigateToRoute, navigateToViewNow } = navigation;
  const { learningNow, learningDayKey, learningTimeZone, globalSchedulerPreferences } = clock;
  const shellDecks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const loadMoreStudyCards = useStableCallback(async () => studyRequest
    ? study.loadMore(studyRequest.deckId)
    : { decks: [], notes: [], hasMoreCards: false, bufferSize: study.bufferSize });
  const leaveStudy = useStableCallback(() => {
    sync.refresh();
    if (studyRequest) navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
  });
  const editStudyCard = useStableCallback((...[deckId, cardId, tab]: Parameters<StudyModeProps["onEditCard"]>) => studyRequest && navigateToViewNow("kartenstapel", {
    focusedDeckId: deckId, selectedCardId: cardId, cardEditorTab: tab, cardEditorReturnContext: { deckId: studyRequest.deckId, returnContext: studyRequest.returnContext },
  }));
  const editStudyDeck = useStableCallback((currentDeckId: string) => currentDeckId === EXAM_SESSION_DECK_ID ? navigateToViewNow("pruefungen") : settings.openDeckSettings(currentDeckId));
  const askStudyCardHelp = useStableCallback((...[request, signal]: Parameters<StudyModeProps["onAskCardHelp"]>) => requestAiCardHelp(request, cloud, { signal }));
  // The plan a session starts from; deck counts stay as they were at the start while it runs.
  const studyDeckSummaries = useWorkspaceValue((snapshot) => studyRequest ? snapshot.deckSummaries : undefined);
  const studySessionPlan = React.useMemo(() => {
    const session = studyRequest && shellDecks && studyDeckSummaries?.has(studyRequest.deckId)
      ? createDeckLibraryModel(shellDecks, {
          now: learningNow,
          dayStartHour: globalSchedulerPreferences.dayStartHour,
          learnAheadMinutes: globalSchedulerPreferences.learnAheadMinutes,
          timeZone: learningTimeZone,
          deckSummaries: studyDeckSummaries,
        }).rows.find((row) => row.id === studyRequest.deckId)?.dailyLearningSession
      : null;
    return session ? { progress: session.progress, initialCardCount: session.startableCount } : undefined;
    // `learningNow` moves with every sync; the plan only needs the learning day.
  }, [globalSchedulerPreferences, learningDayKey, learningTimeZone, shellDecks, studyDeckSummaries, studyRequest]);
  const studyDeck = studyRequest ? study.decks?.find((deck) => deck.id === studyRequest.deckId) ?? null : null;
  if (!studyDeck) return null;
  return (
    <MemoizedStudyMode
      deck={studyDeck}
      decks={study.decks ?? [studyDeck]}
      notes={study.notes}
      answeredToday={study.answeredToday}
      deckId={studyDeck.id}
      mediaStore={mediaStore}
      getNow={clock.getLearningNow}
      learningDayKey={learningDayKey}
      dayStartHour={globalSchedulerPreferences.dayStartHour}
      learnAheadMinutes={globalSchedulerPreferences.learnAheadMinutes}
      easyDays={globalSchedulerPreferences.easyDays}
      dueForecast={study.dueForecast}
      timeZone={learningTimeZone}
      simulationOffsetMinutes={clock.simulationOffsetMinutes}
      pomodoroTimer={pomodoro.pomodoroTimer}
      onStartPomodoro={pomodoro.startPomodoro}
      onExit={leaveStudy}
      onReturnToLearn={leaveStudy}
      onEditCard={editStudyCard}
      onEditDeck={editStudyDeck}
      shortcutsSuspended={Boolean(deckSettings)}
      flagNames={cardEditorServices.flagNames}
      onSetCardStudyState={study.setCardStudyState}
      onSetDeckReviewOrder={study.setDeckReviewOrder}
      onReview={study.recordReview}
      onAskCardHelp={askStudyCardHelp}
      sessionPlan={studySessionPlan}
      bufferSize={study.bufferSize}
      hasMoreCards={study.hasMoreCards}
      onLoadMoreCards={loadMoreStudyCards}
    />
  );
}
