import { settingsContentSection, type LearningSettingsSection } from "../appNavigation.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { GlobalCardSettingsScreen } from "./GlobalCardSettingsScreen.tsx";

export function GlobalCardSettingsScreenWiring() {
  const { navigation, settings, clock, pomodoro, deckCommands } = useAppServices();
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const { settingsSection } = navigation;
  if (!settingsSection || !state) return null;
  return (
    <GlobalCardSettingsScreen
      section={settingsContentSection(settingsSection) as LearningSettingsSection}
      timeZone={clock.learningTimeZone}
      globalSchedulerPreferences={clock.globalSchedulerPreferences}
      flagNames={state.profile.uiPreferences.flagNames}
      learningProfiles={clock.globalSchedulerPreferences.learningProfiles}
      onSaveLearningProfiles={deckCommands.saveLearningProfiles}
      onSaveSettings={deckCommands.saveGlobalCardSettings}
      onDraftStateChange={settings.handleSettingsDraftStateChange}
      onNavigate={navigation.navigateToView}
      decks={state.decks}
      onOpenDeckSettings={(deckId) => settings.openDeckSettings(deckId)}
      simulationOffsetMinutes={clock.simulationOffsetMinutes}
      pomodoroTimer={pomodoro.pomodoroTimer}
      onStartPomodoro={pomodoro.startPomodoro}
    />
  );
}
