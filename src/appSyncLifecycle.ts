import type { AuthPhase } from "./accountSession.ts";
import type { SyncStatus } from "./coreTypes.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";

export function startAppSyncLifecycle({
  authPhase,
  syncEngine,
  onStatus,
}: {
  authPhase: AuthPhase;
  syncEngine: AccountSyncEngine | null;
  onStatus: (status: SyncStatus) => void;
}): () => void {
  if (authPhase !== "ready" || !syncEngine) return () => {};
  let active = true;
  const stop = syncEngine.startSyncLifecycle({
    onStatus(status: SyncStatus) {
      if (active) onStatus(status);
    },
  });
  return () => {
    active = false;
    stop();
  };
}
