import React from "react";
import { currentLearningDay, readFrequentDeckIds } from "../dashboardWidgets.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { DashboardScreen } from "./DashboardScreen.tsx";

export function DashboardScreenWiring() {
  const { navigation, clock, pomodoro, studyStart, studyPreparation, deckCommands, importCommands, hydration } = useAppServices();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const profile = state?.profile;
  // learningNow ticks, so a new learning day re-reads the study days.
  const frequentDeckIds = React.useMemo(() => profile ? readFrequentDeckIds(profile.userId, currentLearningDay(profile)) : [], [clock.learningNow, profile]);
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
      frequentDeckIds={frequentDeckIds}
      onSetPinnedDeckIds={deckCommands.saveDashboardPins}
      onStartExamUnit={studyStart.startExamUnit}
      onLoadExamPlanningData={studyPreparation.loadExamPlanningData}
      onLoadExamSummaryAvailability={studyPreparation.loadExamSummaryAvailability}
      onLoadExamLocalCardIds={hydration?.listLocalCardIds}
      onSaveExamTasks={deckCommands.saveExamTasks}
    />
  );
}
