import type { ImportCommitGraph, ImportMediaFile } from "./apkgImport.ts";
import type { ImportVerificationScope } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { ImportedDeckPersistence, ImportSource } from "./creationWorkflow.ts";
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
  refresh: (options?: { preserveCardPages?: boolean }) => WorkspaceState | null;
}

export type ImportCommands = ReturnType<typeof createImportCommands>;

interface PendingConfirmation {
  task: ImportCloudSyncTask;
  workspace: Pick<ImportCommandsContext, "repository" | "cloud" | "syncEngine">;
}

const pendingByCommands = new WeakMap<ImportCommands, Set<PendingConfirmation>>();
const isWaiting = ({ task }: PendingConfirmation) => task.status !== "cloud-ready" && task.status !== "blocked";
const accountOf = (workspace: PendingConfirmation["workspace"]) => workspace.repository.getShellState()?.profile.userId;

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

  /** The same package file after an interrupted takeover continues it. */
  async function commitImport(graph: ImportCommitGraph, { onMedia, source }: { onMedia: (file: ImportMediaFile) => Promise<void>; source?: ImportSource }): Promise<ImportedDeckPersistence> {
    const workspaceHydrationService = hydration();
    const profile = store.get().state?.profile;
    const reimportTargets = workspaceHydrationService ? await workspaceHydrationService.prepareReimport(graph.ankiGuids) : undefined;
    const interrupted = source ? await repository.getInterruptedImport() : null;
    const result = await repository.commitImportGraph(graph, {
      deckSettings: createGlobalDefaultDeckSettings(getGlobalSchedulerPreferences(profile)),
      reimportTargets,
      onMedia,
      source,
      resume: Boolean(interrupted && source && interrupted.fileName === source.fileName && interrupted.fileSize === source.fileSize),
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

  async function importDemo() {
    const { createWorldCapitalsImportGraph } = await import("./fixtures/worldCapitals.ts");
    return (await commitImport(createWorldCapitalsImportGraph(), { onMedia: async () => {} })).decks;
  }

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

  const commands = {
    commitImport, importDemo, followSyncStatus, continuePendingFrom, retranslate,
    getInterruptedImport: () => repository.getInterruptedImport(),
  };
  pendingByCommands.set(commands, pending);
  return commands;
}
