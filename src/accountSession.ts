import type { SyncStatus } from "./coreTypes.ts";

export const authPhases = Object.freeze({
  checkingSession: "checking-session",
  configError: "config-error",
  signedOut: "signed-out",
  passwordRecovery: "password-recovery",
  loadingCloud: "loading-cloud",
  migrationChoice: "migration-choice",
  ready: "ready",
});

export type AuthPhase = (typeof authPhases)[keyof typeof authPhases];

export function authPhaseForSession({ configured, user }: { configured: boolean; user: unknown }): AuthPhase {
  if (!configured) return authPhases.configError;
  return user ? authPhases.loadingCloud : authPhases.signedOut;
}

export function shouldShowAuthGate(authPhase: AuthPhase) {
  return authPhase === authPhases.configError || authPhase === authPhases.signedOut || authPhase === authPhases.passwordRecovery;
}

export function shouldShowAppShell(authPhase: AuthPhase) {
  return authPhase === authPhases.ready;
}

export function createSyncIdleStatus(): SyncStatus {
  return { status: "idle" };
}

export function createSyncPendingStatus(): SyncStatus {
  return { status: "pending", message: "Änderungen werden gleich synchronisiert." };
}

export function createSyncOfflineStatus({ pendingCount = 0, nextRetryAt = null }: { pendingCount?: number; nextRetryAt?: string | null } = {}): SyncStatus {
  const normalizedPendingCount = Math.max(0, Number(pendingCount) || 0);
  const parsedRetryAt = nextRetryAt ? Date.parse(nextRetryAt) : Number.NaN;
  const normalizedNextRetryAt = Number.isFinite(parsedRetryAt) ? new Date(parsedRetryAt).toISOString() : null;
  const pendingMessage = normalizedPendingCount === 1
    ? "Offline. Eine Änderung bleibt vorgemerkt und wird automatisch synchronisiert."
    : normalizedPendingCount > 1
      ? `Offline. ${normalizedPendingCount} Änderungen bleiben vorgemerkt und werden automatisch synchronisiert.`
      : "Offline. Die Verbindung wird automatisch erneut geprüft.";
  const retryMessage = normalizedNextRetryAt
    ? ` Nächster Versuch: ${new Date(normalizedNextRetryAt).toLocaleTimeString("de-DE")}.`
    : "";
  return {
    status: "offline",
    pendingCount: normalizedPendingCount,
    nextRetryAt: normalizedNextRetryAt,
    message: `${pendingMessage}${retryMessage}`,
  };
}

export function createSyncSavingStatus(): SyncStatus {
  return { status: "saving", message: "Synchronisierung läuft." };
}

export function createSyncSavedStatus(message = "Synchronisiert.", now: () => string = () => new Date().toISOString()): SyncStatus {
  return { status: "saved", savedAt: now(), message };
}

export function createSyncErrorStatus(message = "Synchronisierung fehlgeschlagen."): SyncStatus {
  return { status: "error", message };
}

export function createSyncConflictStatus(count = 1): SyncStatus {
  const conflictCount = Math.max(1, Number(count) || 1);
  return {
    status: "conflict",
    conflictCount,
    message: conflictCount === 1
      ? "Eine Änderung braucht deine Entscheidung."
      : `${conflictCount} Änderungen brauchen deine Entscheidung.`,
  };
}

export function formatSyncStatusText(syncStatus: SyncStatus) {
  switch (syncStatus.status) {
    case "idle":
      return "Noch keine Änderung synchronisiert.";
    case "pending":
      return "Änderungen werden gleich synchronisiert.";
    case "saving":
      return "Synchronisierung läuft.";
    case "saved":
      return syncStatus.savedAt ? `Zuletzt synchronisiert: ${new Date(syncStatus.savedAt).toLocaleString("de-DE")}.` : "Synchronisiert.";
    case "offline":
      return syncStatus.message || "Offline. Änderungen werden automatisch synchronisiert, sobald die Verbindung wieder da ist.";
    case "conflict":
      return syncStatus.message || "Eine Änderung braucht deine Entscheidung.";
    case "error":
      return syncStatus.message || "Synchronisierung fehlgeschlagen.";
    default: {
      const exhaustiveStatus: never = syncStatus;
      return exhaustiveStatus;
    }
  }
}
