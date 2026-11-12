import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { DashboardScreen } from "./DashboardScreen.tsx";

/** `Heute` with its starts, deck commands, today's exam tasks and the focus timer. */
export function DashboardScreenWiring() {
  const { navigation, settings, clock, pomodoro, studyStart, studyPreparation, deckCommands, importCommands, requestDeckCoreMode, hydration } = useAppServices();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  if (!state) return null;
  return (
    <DashboardScreen
      onResetPomodoro={pomodoro.resetPomodoro}
      onPausePomodoro={() => pomodoro.changePomodoroPause(true)}
      onResumePomodoro={() => pomodoro.changePomodoroPause(false)}
      pomodoroTimer={pomodoro.pomodoroTimer}
      onStartPomodoro={pomodoro.startPomodoro}
      state={state}
      now={clock.learningNow}
      onNavigate={navigation.navigateToView}
      onStartDeck={studyStart.startDeck}
      onStartAdditionalCards={studyStart.startAdditionalCards}
      onCreateDemo={async () => {
        const decks = await importCommands.importDemo();
        navigation.navigateToView("lernen");
        return decks;
      }}
      onSetDeckCoreMode={requestDeckCoreMode}
      onMoveDeck={deckCommands.moveDeck}
      onOpenDeckSettings={(deckId) => settings.openDeckSettings(deckId)}
      onSetDeckExpanded={deckCommands.saveDeckExpansion}
      onStartExamUnit={studyStart.startExamUnit}
      onLoadExamPlanningData={studyPreparation.loadExamPlanningData}
      onLoadExamSummaryAvailability={studyPreparation.loadExamSummaryAvailability}
      onLoadExamLocalCardIds={hydration?.listLocalCardIds}
      onSaveExamTasks={deckCommands.saveExamTasks}
    />
  );
}
