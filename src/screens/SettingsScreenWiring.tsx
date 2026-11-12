import { settingsContentSection, type GeneralSettingsSection } from "../appNavigation.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";

/** The general settings areas with the sync operation and sign-out. */
export function SettingsScreenWiring() {
  const { navigation, settings, sync, deckCommands, signOut } = useAppServices();
  const profile = useWorkspaceValue((snapshot) => snapshot.state?.profile);
  const { settingsSection } = navigation;
  if (!settingsSection || !profile) return null;
  return (
    <SettingsScreen
      section={settingsContentSection(settingsSection) as GeneralSettingsSection}
      focusConflicts={settingsSection === "konflikte"}
      profile={profile}
      onSaveSettings={deckCommands.saveGeneralSettings}
      onDraftStateChange={settings.handleSettingsDraftStateChange}
      onSyncNow={sync.syncNow}
      onListConflicts={sync.listSyncConflicts}
      onResolveConflict={sync.resolveSyncConflict}
      onSignOut={() => settings.requestSettingsContextAction(signOut) ?? Promise.resolve()}
      onNavigate={navigation.navigateToView}
    />
  );
}
