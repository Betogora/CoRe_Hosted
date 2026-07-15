import type { AuthPhase } from "./accountSession.ts";
import { createSyncErrorStatus } from "./accountSession.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { SyncStatus } from "./coreTypes.ts";
import { SYNC_MUTATION_TYPES, type AccountSyncEngine } from "./syncEngine.ts";

export interface SyncFlushProjection {
  saved?: { state?: WorkspaceState } | null;
}

interface SyncLifecycleOptions {
  authPhase: AuthPhase;
  syncEngine: AccountSyncEngine | null;
  getLatestState: () => WorkspaceState | null;
  getRunId: () => number;
  onStatus: (status: SyncStatus) => void;
  onAcknowledged: (snapshot: WorkspaceState | null, state: WorkspaceState | undefined, runId: number) => void;
}

export function startAppSyncLifecycle({
  authPhase,
  syncEngine,
  getLatestState,
  getRunId,
  onStatus,
  onAcknowledged,
}: SyncLifecycleOptions): () => void {
  if (authPhase !== "ready" || !syncEngine) return () => {};
  const runId = getRunId();
  let active = true;
  const stop = syncEngine.startSyncLifecycle({
    onStatus(status: SyncStatus) {
      if (active) onStatus(status);
    },
    onFlush(result: SyncFlushProjection) {
      if (active) onAcknowledged(getLatestState(), result.saved?.state, runId);
    },
  });
  return () => {
    active = false;
    stop();
  };
}

interface AutosaveLifecycleOptions {
  authPhase: AuthPhase;
  syncEngine: AccountSyncEngine | null;
  state: WorkspaceState | null;
  lastAcknowledgedState: WorkspaceState | null;
  runId: number;
  delayMs: number;
  onAcknowledged: (snapshot: WorkspaceState, state: WorkspaceState | undefined, runId: number) => void;
  onStatus: (status: SyncStatus) => void;
  formatError: (error: unknown) => string;
  setTimer?: typeof globalThis.setTimeout;
  clearTimer?: typeof globalThis.clearTimeout;
}

export function startAppAutosaveLifecycle({
  authPhase,
  syncEngine,
  state,
  lastAcknowledgedState,
  runId,
  delayMs,
  onAcknowledged,
  onStatus,
  formatError,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}: AutosaveLifecycleOptions): () => void {
  if (authPhase !== "ready" || !syncEngine || !state || state === lastAcknowledgedState) return () => {};
  let cancelled = false;
  const snapshot = state;
  const timer = setTimer(async () => {
    try {
      syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
      const result = await syncEngine.flush() as SyncFlushProjection;
      if (!cancelled) onAcknowledged(snapshot, result.saved?.state, runId);
    } catch (error) {
      if (!cancelled) onStatus(createSyncErrorStatus(formatError(error)));
    }
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimer(timer);
  };
}
