import React from "react";
import { createSyncErrorStatus, type AuthPhase } from "./accountSession.ts";
import { startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import { formatCloudAuthError } from "./cloudAuth.ts";
import type { SyncStatus } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import { useWorkspaceStore, useWorkspaceValue } from "./useWorkspaceStore.ts";
import type { WorkspaceHydrationService } from "./workspaceHydrationService.ts";

interface StateRefreshOptions { preserveCardPages?: boolean }

interface WorkspaceSyncContext {
  authPhase: AuthPhase;
  repository: IndexedDbCoreRepository | null;
  syncEngine: AccountSyncEngine | null;
  /** Its prepared card graphs are forgotten with every applied state. */
  hydration: WorkspaceHydrationService | null;
  /** Card page requests started before a write would show the older state. */
  abortCardPageRequests: () => void;
}

/**
 * Applying the repository's state to the workspace store and operating the sync: the sync lifecycle with its interval,
 * syncing now, and listing and resolving conflicts. Every local write and every sync ends in `setAppState`.
 */
export function useWorkspaceSync({ authPhase, repository, syncEngine, hydration, abortCardPageRequests }: WorkspaceSyncContext) {
  const workspaceStore = useWorkspaceStore();
  const syncIntervalMinutes = useWorkspaceValue((snapshot) => snapshot.state?.profile.uiPreferences.syncIntervalMinutes ?? 5);

  function setSyncStatus(status: SyncStatus) {
    workspaceStore.set({ syncStatus: status });
  }

  function setAppState(nextState: WorkspaceState | null, { preserveCardPages = false }: StateRefreshOptions = {}) {
    // Every local write and every sync ends here, so a prefetched card never shows an older version than the replica.
    hydration?.forgetPreparedGraphs();
    if (!preserveCardPages) abortCardPageRequests();
    workspaceStore.set({
      state: nextState,
      ...(repository ? { syncConflictCardIds: repository.getSyncConflictCardIds() } : {}),
      ...(preserveCardPages ? {} : { cardPages: {} }),
    });
  }

  function refresh(options?: StateRefreshOptions) {
    if (!repository) return null;
    const nextState = repository.getShellState();
    setAppState(nextState, options);
    return nextState;
  }

  async function syncNow() {
    if (!syncEngine) return;
    try {
      const result = await syncEngine.syncNow();
      if (repository) setAppState(repository.getShellState());
      return result;
    } catch (error) {
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
      throw error;
    }
  }

  const listSyncConflicts = React.useCallback(async (options: { refreshRemote?: boolean } = {}) => {
    return syncEngine ? syncEngine.listConflicts(options) : [];
  }, [syncEngine]);

  async function resolveSyncConflict(conflictId: string, decision: Record<string, unknown>) {
    if (!syncEngine || !repository) throw new Error("Synchronisierung ist noch nicht bereit.");
    try {
      const result = await syncEngine.resolveConflict(conflictId, decision);
      setAppState(repository.getShellState());
      return result;
    } catch (error) {
      if (repository) setAppState(repository.getShellState());
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Konfliktentscheidung konnte nicht gespeichert werden.")));
      throw error;
    }
  }

  React.useEffect(() => {
    return startAppSyncLifecycle({
      authPhase,
      syncEngine,
      syncIntervalMinutes,
      onStatus: setSyncStatus,
      onSynced(result) {
        if (!repository) return;
        // While the catalog is incomplete the cloud serves the card lists; they lack local changes until those are
        // uploaded, so a sync that sent changes loads them again.
        const listsFromCloud = repository.getReplicaStatus().catalogCompleteness !== "complete";
        setAppState(repository.getShellState(), { preserveCardPages: !(listsFromCloud && (result?.mutations ?? 0) > 0) });
      },
    });
  }, [authPhase, syncIntervalMinutes, syncEngine, repository]);

  return { setSyncStatus, setAppState, refresh, syncNow, listSyncConflicts, resolveSyncConflict };
}
