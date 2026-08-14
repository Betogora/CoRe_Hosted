import type { AuthPhase } from "./accountSession.ts";
import type { SyncStatus } from "./coreTypes.ts";
import type { SyncIntervalMinutes } from "./coreTypes.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";

export function startAppSyncLifecycle({
  authPhase,
  syncEngine,
  onStatus,
  syncIntervalMinutes,
  onSynced,
}: {
  authPhase: AuthPhase;
  syncEngine: AccountSyncEngine | null;
  onStatus: (status: SyncStatus) => void;
  syncIntervalMinutes: SyncIntervalMinutes;
  onSynced?: () => void;
}): () => void {
  if (authPhase !== "ready" || !syncEngine) return () => {};
  let active = true;
  const stop = syncEngine.startSyncLifecycle({
    intervalMinutes: syncIntervalMinutes,
    onStatus(status: SyncStatus) {
      if (active) onStatus(status);
    },
    onFlush() {
      if (active) onSynced?.();
    },
  });
  return () => {
    active = false;
    stop();
  };
}
