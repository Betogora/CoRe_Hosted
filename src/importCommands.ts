import type { ImportCommitGraph, ImportMediaFile } from "./apkgImport.ts";
import type { ImportVerificationScope } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { ImportedDeckPersistence } from "./creationWorkflow.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import { createGlobalDefaultDeckSettings } from "./globalLearningDefaults.ts";
import { createImportCloudSyncTask, type ImportCloudSyncTask } from "./importCloudSyncTask.ts";
import type { IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import type { WorkspaceHydrationService } from "./workspaceHydrationService.ts";
import type { WorkspaceStore } from "./workspaceStore.ts";

interface ImportCommandsContext {
  store: WorkspaceStore;
  repository: IndexedDbCoreRepository;
  /** The service follows the media store, which arrives after the workspace opened. */
  hydration: () => WorkspaceHydrationService | null;
  cloud: ReturnType<typeof createSupabaseBrowserClient> | null;
  syncEngine: () => AccountSyncEngine | null;
  /** Applies the repository's shell state to the store and returns it. */
  refresh: (options?: { preserveCardPages?: boolean }) => WorkspaceState | null;
}

export type ImportCommands = ReturnType<typeof createImportCommands>;

/** A cloud confirmation and the workspace it runs in; it moves along when the account opens a new workspace. */
interface PendingConfirmation {
  task: ImportCloudSyncTask;
  workspace: Pick<ImportCommandsContext, "repository" | "cloud" | "syncEngine">;
}

const pendingByCommands = new WeakMap<ImportCommands, Set<PendingConfirmation>>();
const isWaiting = ({ task }: PendingConfirmation) => task.status !== "cloud-ready" && task.status !== "blocked";
const accountOf = (workspace: PendingConfirmation["workspace"]) => workspace.repository.getShellState()?.profile.userId;

/**
 * Imports into the open workspace: an import graph committed chunk by chunk with the global defaults for new decks,
 * the demo collection, and the cloud confirmation that follows each import and retries after every saved sync while
 * it waits locally, also in the account's next workspace; plus the one-time re-translation of unedited imports after a
 * translator release.
 */
export function createImportCommands(context: ImportCommandsContext) {
  const { store, repository, hydration, cloud, syncEngine, refresh } = context;
  const pending = new Set<PendingConfirmation>();

  function createTrackedImportCloudTask(verificationScope: ImportVerificationScope) {
    const confirmation: PendingConfirmation = { workspace: context, task: createImportCloudSyncTask(async () => {
      const { repository, cloud, syncEngine } = confirmation.workspace;
      await repository.flush();
      const activeSyncEngine = syncEngine();
      if (!activeSyncEngine) {
        return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus." };
      }
      const result = await activeSyncEngine.flush({ force: true });
      if (result?.paused) {
        return { status: "blocked", message: "Die Karten sind lokal gespeichert. Ein Cloud-Konflikt verhindert den Abschluss der Synchronisierung." };
      }
      if (result?.deferred || activeSyncEngine.pendingCount() > 0) {
        return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus." };
      }
      const { ImportGraphVerificationError, verifyAccountImportGraph } = await import("./cloudRepository.ts");
      try {
        await verifyAccountImportGraph(cloud, verificationScope);
      } catch (error) {
        const status = Number((error as { status?: unknown })?.status ?? 0);
        const retryable = error instanceof ImportGraphVerificationError
          || status >= 500
          || /network|fetch|offline|timeout/i.test(String((error as Error)?.message ?? error));
        if (!retryable) throw error;
        if (error instanceof ImportGraphVerificationError) {
          await repository.requeueImportVerificationScope(verificationScope, error.repairScope);
        }
        return { status: "local-pending", message: "Die Karten sind lokal gespeichert; die vollständige Cloud-Bestätigung steht noch aus." };
      }
      return { status: "cloud-ready", message: "Karten und Wiederholungen sind in der Cloud bestätigt." };
    }) };
    pending.add(confirmation);
    void confirmation.task.retry();
    return confirmation.task;
  }

  /** Commits an import graph chunk by chunk, applies global defaults to new decks and starts the cloud confirmation. */
  async function commitImport(graph: ImportCommitGraph, { onMedia }: { onMedia: (file: ImportMediaFile) => Promise<void> }): Promise<ImportedDeckPersistence> {
    const workspaceHydrationService = hydration();
    const profile = store.get().state?.profile;
    const reimportTargets = workspaceHydrationService ? await workspaceHydrationService.prepareReimport(graph.ankiGuids) : undefined;
    const result = await repository.commitImportGraph(graph, {
      deckSettings: createGlobalDefaultDeckSettings(getGlobalSchedulerPreferences(profile)),
      reimportTargets,
      onMedia,
    });
    const nextState = refresh();
    const importedIds = new Set(result.decks.map((deck) => deck.id));
    const decks = nextState?.decks.filter((deck) => importedIds.has(deck.id)) ?? [];
    return {
      decks,
      rootDeck: decks.find((deck) => !deck.parentDeckId || !importedIds.has(deck.parentDeckId)) ?? decks[0] ?? null,
      createdCount: result.scope.cardIds.length,
      keptLocalEdits: result.keptLocalEdits,
      missingInPackage: result.missingInPackage,
      cloudTask: createTrackedImportCloudTask(result.scope),
    };
  }

  /** The world capitals as a first collection. */
  async function importDemo() {
    const { createWorldCapitalsImportGraph } = await import("./fixtures/worldCapitals.ts");
    return (await commitImport(createWorldCapitalsImportGraph(), { onMedia: async () => {} })).decks;
  }

  /** A saved sync lets the confirmations still pending locally try again; returns the unsubscribe. */
  function followSyncStatus() {
    let syncStatus = store.get().syncStatus;
    return store.subscribe(() => {
      const next = store.get().syncStatus;
      if (next === syncStatus) return;
      syncStatus = next;
      if (next.status !== "saved") return;
      for (const confirmation of pending) {
        if (!isWaiting(confirmation)) pending.delete(confirmation);
        else if (confirmation.task.status === "local-pending") void confirmation.task.retry();
      }
    });
  }

  /**
   * Takes over the confirmations still waiting in the previous workspace of the same account, which continue with
   * this workspace's repository and sync engine; those of another account lapse.
   */
  function continuePendingFrom(previous: ImportCommands) {
    const account = accountOf(context);
    const previousPending = pendingByCommands.get(previous) ?? new Set<PendingConfirmation>();
    for (const confirmation of previousPending) {
      if (!isWaiting(confirmation) || accountOf(confirmation.workspace) !== account) continue;
      confirmation.workspace = context;
      pending.add(confirmation);
    }
    previousPending.clear();
  }

  /** K5.4: after a translator release, unedited imports are re-translated once; returns how many contents changed. */
  async function retranslate() {
    if (!cloud) return 0;
    const { runAccountRetranslation } = await import("./importRetranslation.ts");
    const count = await runAccountRetranslation(cloud, repository);
    if (count > 0) {
      refresh({ preserveCardPages: true });
      syncEngine()?.requestSync();
    }
    return count;
  }

  const commands = { commitImport, importDemo, followSyncStatus, continuePendingFrom, retranslate };
  pendingByCommands.set(commands, pending);
  return commands;
}
