import React from "react";
import { reviewReturnContextToViewRoute } from "../appNavigation.ts";
import type { CardDraftGuard } from "../appScreenProps.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { EXAM_SESSION_DECK_ID } from "../examPlanSettings.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { ActionDialog } from "../ui/coreUi.tsx";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { StudyMode } from "./StudyMode.tsx";
import type { StudyModeProps } from "./StudyMode.tsx";

// Memoized: a shell render without changed session data leaves the running session alone.
const MemoizedStudyMode = React.memo(StudyMode);
const DeckSummariesPanel = React.lazy(() => import("./DeckSummariesPanel.tsx").then((module) => ({ default: module.DeckSummariesPanel })));

/** Its callbacks keep their identity across shell renders. */
export function StudyModeWiring() {
  const { navigation, settings, clock, pomodoro, sync, study, cardCommands, cardEditorServices, mediaStore } = useAppServices();
  const { studyRequest, deckSettings, navigateToRoute, navigateToViewNow } = navigation;
  const { learningNow, learningDayKey, learningTimeZone, globalSchedulerPreferences } = clock;
  const shellDecks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const userId = useWorkspaceValue((snapshot) => snapshot.state?.profile.userId);
  const summaryGuardRef = React.useRef<CardDraftGuard | null>(null);
  const revealSummaryRef = React.useRef<(() => void) | null>(null);
  const [pendingLeave, setPendingLeave] = React.useState<(() => void) | null>(null);
  const [savingLeave, setSavingLeave] = React.useState(false);
  const setSummaryGuard = React.useCallback((guard: CardDraftGuard | null) => { summaryGuardRef.current = guard; }, []);
  const leaveSummary = (leave: () => void) => summaryGuardRef.current ? setPendingLeave(() => leave) : leave();
  // The draft may sit in the closed, inert panel; its focus target exists only once it is open again.
  const revealSummary = () => { revealSummaryRef.current?.(); window.setTimeout(() => summaryGuardRef.current?.focus(), 0); };
  const loadMoreStudyCards = useStableCallback(async () => studyRequest
    ? study.loadMore(studyRequest.deckId)
    : { decks: [], notes: [], hasMoreCards: false, bufferSize: study.bufferSize });
  const leaveStudy = useStableCallback(() => leaveSummary(() => {
    sync.refresh();
    if (studyRequest) navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
  }));
  const editStudyCard = useStableCallback((...[deckId, cardId, tab]: Parameters<StudyModeProps["onEditCard"]>) => studyRequest && leaveSummary(() => navigateToViewNow("kartenstapel", {
    focusedDeckId: deckId, selectedCardId: cardId, cardEditorTab: tab, cardEditorReturnContext: { deckId: studyRequest.deckId, returnContext: studyRequest.returnContext },
  })));
  const editStudyDeck = useStableCallback((currentDeckId: string) => currentDeckId === EXAM_SESSION_DECK_ID ? navigateToViewNow("pruefungen") : settings.openDeckSettings(currentDeckId));
  const summaryDecks = React.useMemo(() => {
    if (!studyRequest || studyRequest.deckId === EXAM_SESSION_DECK_ID || !shellDecks) return null;
    const treeIds = collectDeckTreeIds(shellDecks, studyRequest.deckId);
    const tree = shellDecks.filter((candidate) => treeIds.has(candidate.id));
    const root = tree.find((candidate) => candidate.id === studyRequest.deckId);
    return root ? { root, tree } : null;
  }, [shellDecks, studyRequest]);
  const renderSidePanel = useStableCallback((reveal: () => void) => {
    revealSummaryRef.current = reveal;
    return summaryDecks && userId ? <DeckSummariesPanel key={`${userId}:${summaryDecks.root.id}`} deck={summaryDecks.root} treeDecks={summaryDecks.tree} userId={userId} cloud={cardCommands.learningContentAccount()?.cloud ?? null} onDraftStateChange={setSummaryGuard} compact /> : null;
  });
  async function saveAndLeave() {
    const leave = pendingLeave, guard = summaryGuardRef.current;
    setSavingLeave(true);
    try {
      const saved = !guard || !("save" in guard) || await guard.save();
      setPendingLeave(null);
      if (saved) leave?.();
      else revealSummary();
    } finally { setSavingLeave(false); }
  }
  const askStudyCardHelp = useStableCallback((...[request, signal]: Parameters<StudyModeProps["onAskCardHelp"]>) => cardCommands.askCardHelp(request, signal));
  // The plan a session starts from; deck counts stay as they were at the start until a new learning day begins.
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
  return (<>
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
      leechThreshold={globalSchedulerPreferences.leechThreshold}
      easyDays={globalSchedulerPreferences.easyDays}
      dueForecast={study.dueForecast}
      timeZone={learningTimeZone}
      simulationOffsetMinutes={clock.simulationOffsetMinutes}
      pomodoroTimer={pomodoro.pomodoroTimer}
      onStartPomodoro={pomodoro.startPomodoro}
      onPomodoroPauseChange={pomodoro.changePomodoroPause}
      onExit={leaveStudy}
      onReturnToLearn={leaveStudy}
      onEditCard={editStudyCard}
      onEditDeck={editStudyDeck}
      shortcutsSuspended={Boolean(deckSettings)}
      flagNames={cardEditorServices.flagNames}
      onSetCardStudyState={study.setCardStudyState}
      onSetDeckReviewOrder={study.setDeckReviewOrder}
      onReview={study.recordReview}
      onUndoReview={study.undoReview}
      onAskCardHelp={askStudyCardHelp}
      sessionPlan={studySessionPlan}
      renderSidePanel={summaryDecks && userId ? renderSidePanel : undefined}
      bufferSize={study.bufferSize}
      hasMoreCards={study.hasMoreCards}
      onLoadMoreCards={loadMoreStudyCards}
    />
    <ActionDialog
      open={Boolean(pendingLeave)}
      title="Änderungen übernehmen?"
      description="Du hast ungespeicherte Änderungen an dieser Zusammenfassung. Speichere oder verwirf sie, bevor du den Lernmodus verlässt."
      confirmLabel="Speichern"
      cancelLabel="Weiter bearbeiten"
      discardLabel="Verwerfen"
      confirmLoading={savingLeave}
      onCancel={() => { if (!savingLeave) setPendingLeave(null); }}
      onDiscard={() => { const leave = pendingLeave; setPendingLeave(null); leave?.(); }}
      onConfirm={() => void saveAndLeave()}
      restoreFocus={(reason) => { if (reason === "cancel") revealSummary(); }}
    />
  </>);
}
