import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { ExamPlanningScreen } from "./ExamPlanningScreen.tsx";

/** `Prüfungen` with the shared exam planning data, its saves and the start of today's unit. */
export function ExamPlanningScreenWiring() {
  const { navigation, clock, studyStart, studyPreparation, deckCommands, hydration } = useAppServices();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  if (!state) return null;
  return (
    <ExamPlanningScreen
      state={state}
      now={clock.learningNow}
      onLoadPlanningData={studyPreparation.loadExamPlanningData}
      onSavePlanning={deckCommands.saveExamPlanning}
      onSaveTasks={deckCommands.saveExamTasks}
      onStartUnit={studyStart.startExamUnit}
      onLoadSummaryAvailability={studyPreparation.loadExamSummaryAvailability}
      onLoadLocalCardIds={hydration?.listLocalCardIds}
      onDraftStateChange={navigation.handleExamDraftStateChange}
    />
  );
}
