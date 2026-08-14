import type { User } from "@supabase/supabase-js";
import { createAccountStorage, hasPendingLocalMigration, readLegacyLocalState } from "./accountStorage.ts";
import { clearCloudAuthRedirectParams, getCloudUser, readCloudAuthRedirectOutcome } from "./cloudAuth.ts";
import { createCoreRepository } from "./coreRepository.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createIndexedDbCoreRepository, type IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createAccountSyncEngine, type AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
import { listAccountOriginalVariantManifest, streamAccountCloudChanges } from "./cloudRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;
type LegacyLocalState = NonNullable<ReturnType<typeof readLegacyLocalState>>;

interface AuthenticatedWorkspaceSessionLifecycleOptions {
  supabase: SupabaseBrowserClient | null;
  onUnavailable: () => void;
  onSignedOut: () => void;
  onRedirectError: (message: string) => void;
  onPasswordRecovery: (user: User) => void;
  onBoot: (user: User) => Promise<void>;
  onFailure: (error: unknown) => void;
}

export interface AuthenticatedWorkspaceBootResult {
  repository: IndexedDbCoreRepository;
  syncEngine: AccountSyncEngine;
  state: WorkspaceState;
  conflictCount: number;
  pendingCount: number;
  legacyState: LegacyLocalState | null;
}

export async function bootAuthenticatedWorkspace(
  supabase: SupabaseBrowserClient,
  user: User,
): Promise<AuthenticatedWorkspaceBootResult> {
  const accountStorage = createAccountStorage(user.id);
  const legacyRepository = createCoreRepository(accountStorage, { seedDefaultDecks: false });
  const repository = await createIndexedDbCoreRepository({
    userId: user.id,
    initialState: legacyRepository.getState(),
    legacyStorage: accountStorage,
  });
  const pullChanges = async () => {
    const cursors = repository.getCloudDeltaCursors();
    const cloud = await streamAccountCloudChanges(supabase, cursors, repository.applyCloudPage);
    if (!repository.outbox.listPending().some((mutation) => mutation.type === "profile-patch")) {
      await repository.applyCloudProfile(cloud.profile);
    }
  };
  let syncRepairManifest: { cardIds: string[]; originalVariantIds: string[] } | null = null;
  const syncEngine = createAccountSyncEngine(supabase, {
    userId: user.id,
    device: createBrowserSyncDevice(),
    outbox: repository.outbox,
    beforeFlush: repository.flush,
    pullChanges,
    persistConflictState: repository.setSyncConflicts,
    persistConflictResolution: async (result: any, decision: any) => {
      await repository.prepareConflictResolution(result, decision);
      if (result?.resolvedPage) await repository.applyCloudPage(result.resolvedPage);
    },
    persistMutationAcknowledgements: repository.persistMutationAcknowledgements,
    initialize: async () => {
      syncRepairManifest = await listAccountOriginalVariantManifest(supabase);
      await repository.repairSyncState(syncRepairManifest);
    },
  });
  await syncEngine.initialize();
  await syncEngine.syncNow();
  if (syncRepairManifest && await repository.repairSyncState(syncRepairManifest) > 0) {
    await syncEngine.syncNow();
  }
  await repository.flush();
  const shell = await repository.loadShell();
  const state = {
    version: 4,
    profile: shell.profile,
    decks: shell.decks.map((deck) => ({ ...deck, cards: [], reviewEvents: [] })),
    documents: [],
    noteTypeDefinitions: [],
    learningItemSourceSnapshots: [],
    cloudTombstones: shell.cloudTombstones,
    updatedAt: shell.updatedAt,
  } as WorkspaceState;
  let conflicts: unknown[] = [];

  try {
    conflicts = await syncEngine.listConflicts();
  } catch (error) {
    if (syncEngine.pendingCount() === 0) throw error;
  }

  const legacyState = hasPendingLocalMigration(user.id) ? readLegacyLocalState() : null;
  if (syncEngine.pendingCount() === 0) repository.confirmCloudSync();
  return {
    repository,
    syncEngine,
    state,
    conflictCount: conflicts.length,
    pendingCount: syncEngine.pendingCount(),
    legacyState,
  };
}

export function startAuthenticatedWorkspaceSessionLifecycle({
  supabase,
  onUnavailable,
  onSignedOut,
  onRedirectError,
  onPasswordRecovery,
  onBoot,
  onFailure,
}: AuthenticatedWorkspaceSessionLifecycleOptions): () => void {
  if (!supabase) {
    onUnavailable();
    return () => {};
  }

  let active = true;
  const loadSession = async () => {
    try {
      const redirectOutcome = readCloudAuthRedirectOutcome();
      if (redirectOutcome.kind === "error") {
        clearCloudAuthRedirectParams();
        if (active) onRedirectError(redirectOutcome.message);
        return;
      }
      const user = await getCloudUser(supabase);
      if (!active) return;
      if (!user) {
        onSignedOut();
        return;
      }
      if (redirectOutcome.kind === "recovery") {
        onPasswordRecovery(user);
        return;
      }
      await onBoot(user);
    } catch (error) {
      if (active) onFailure(error);
    }
  };

  void loadSession();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (!active || event !== "PASSWORD_RECOVERY" || !session?.user) return;
    onPasswordRecovery(session.user);
  });

  return () => {
    active = false;
    data?.subscription?.unsubscribe?.();
  };
}
