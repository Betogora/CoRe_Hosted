export const authPhases = Object.freeze({
  checkingSession: "checking-session",
  configError: "config-error",
  signedOut: "signed-out",
  passwordRecovery: "password-recovery",
  loadingCloud: "loading-cloud",
  migrationChoice: "migration-choice",
  ready: "ready",
});

export function authPhaseForSession({ configured, user }) {
  if (!configured) return authPhases.configError;
  return user ? authPhases.loadingCloud : authPhases.signedOut;
}

export function shouldShowAuthGate(authPhase) {
  return authPhase === authPhases.configError || authPhase === authPhases.signedOut || authPhase === authPhases.passwordRecovery;
}

export function shouldShowAppShell(authPhase) {
  return authPhase === authPhases.ready;
}

export function createSyncIdleStatus() {
  return { status: "idle" };
}

export function createSyncPendingStatus() {
  return { status: "pending", message: "Änderungen werden gleich synchronisiert." };
}

export function createSyncSavingStatus() {
  return { status: "saving", message: "Synchronisierung läuft." };
}

export function createSyncSavedStatus(message = "Synchronisiert.", now = () => new Date().toISOString()) {
  return { status: "saved", savedAt: now(), message };
}

export function createSyncErrorStatus(message = "Synchronisierung fehlgeschlagen.") {
  return { status: "error", message };
}

export function formatSyncStatusText(syncStatus) {
  if (!syncStatus?.status || syncStatus.status === "idle") return "Noch keine Änderung synchronisiert.";
  if (syncStatus.status === "pending") return "Änderungen werden gleich synchronisiert.";
  if (syncStatus.status === "saving") return "Synchronisierung läuft.";
  if (syncStatus.status === "saved") return syncStatus.savedAt ? `Zuletzt synchronisiert: ${new Date(syncStatus.savedAt).toLocaleString("de-DE")}.` : "Synchronisiert.";
  if (syncStatus.status === "error") return syncStatus.message || "Synchronisierung fehlgeschlagen.";
  return syncStatus.message || "Sync-Status unbekannt.";
}
