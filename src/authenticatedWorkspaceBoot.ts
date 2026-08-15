import type { User } from "@supabase/supabase-js";
import { createAccountStorage, hasPendingLocalMigration, readLegacyLocalState } from "./accountStorage.ts";
import { clearCloudAuthRedirectParams, getCloudWorkspaceUser, readCloudAuthRedirectOutcome } from "./cloudAuth.ts";
import { createCoreRepository } from "./coreRepository.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { markSessionChecked } from "./appPerformance.ts";
import { createIndexedDbCoreRepository, type IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
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
  state: WorkspaceState;
  pendingCount: number;
  legacyState: LegacyLocalState | null;
  cloudBootstrap: Promise<AuthenticatedWorkspaceBootstrapResult>;
  cloudSync: Promise<AuthenticatedWorkspaceCloudResult>;
}

export interface AuthenticatedWorkspaceBootstrapResult {
  state: WorkspaceState;
  conflictCount: number;
}

export interface AuthenticatedWorkspaceCloudResult {
  syncEngine: AccountSyncEngine;
  state: WorkspaceState;
  conflictCount: number;
  pendingCount: number;
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
  const state = repository.getShellState();
  const legacyState = hasPendingLocalMigration(user.id) ? readLegacyLocalState() : null;
  const cloudBootstrap = finishAuthenticatedWorkspaceBootstrap(supabase, user, repository);
  const cloudSync = cloudBootstrap.then(() => finishAuthenticatedWorkspaceCloudSync(supabase, user.id, repository));
  return {
    repository,
    state,
    pendingCount: repository.outbox.count(),
    legacyState,
    cloudBootstrap,
    cloudSync,
  };
}

async function finishAuthenticatedWorkspaceBootstrap(
  supabase: SupabaseBrowserClient,
  user: User,
  repository: IndexedDbCoreRepository,
): Promise<AuthenticatedWorkspaceBootstrapResult> {
  const { loadAccountCloudBootstrap } = await import("./cloudRepository.ts");
  const bootstrap = await loadAccountCloudBootstrap(supabase, user);
  await repository.applyCloudPage({ table: "decks", entities: bootstrap.decks, reset: false });
  if (!repository.outbox.listPending().some((mutation) => mutation.type === "profile-patch")) {
    await repository.applyCloudProfile(bootstrap.profile);
  }
  await repository.flush();
  return { state: repository.getShellState(), conflictCount: bootstrap.conflictCount };
}

async function finishAuthenticatedWorkspaceCloudSync(
  supabase: SupabaseBrowserClient,
  userId: string,
  repository: IndexedDbCoreRepository,
): Promise<AuthenticatedWorkspaceCloudResult> {
  const [{ listAccountOriginalVariantManifest, streamAccountCloudChanges }, { createAccountSyncEngine }] = await Promise.all([
    import("./cloudRepository.ts"),
    import("./syncEngine.ts"),
  ]);
  let initialPullPending = true;
  const pullChanges = async () => {
    const cursors = repository.getCloudDeltaCursors();
    const cloud = await streamAccountCloudChanges(supabase, cursors, repository.applyCloudPage, { userId, loadProfile: !initialPullPending });
    initialPullPending = false;
    if (cloud.profile && !repository.outbox.listPending().some((mutation) => mutation.type === "profile-patch")) {
      await repository.applyCloudProfile(cloud.profile);
    }
  };
  let syncRepairManifest: { cardIds: string[]; originalVariantIds: string[] } | null = null;
  const syncEngine = createAccountSyncEngine(supabase, {
    userId,
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
      if (!repository.needsSyncRepair()) return;
      syncRepairManifest = await listAccountOriginalVariantManifest(supabase, { userId });
      await repository.repairSyncState(syncRepairManifest);
    },
  });
  await syncEngine.initialize();
  let syncResult = await syncEngine.syncNow();
  if (syncRepairManifest && repository.needsSyncRepair() && await repository.repairSyncState(syncRepairManifest) > 0) {
    syncResult = await syncEngine.syncNow();
  }
  await repository.flush();
  if (syncEngine.pendingCount() === 0) repository.confirmCloudSync();
  return {
    syncEngine,
    state: repository.getShellState(),
    conflictCount: syncResult?.conflicts?.length ?? 0,
    pendingCount: syncEngine.pendingCount(),
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
    markSessionChecked();
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
      const user = await getCloudWorkspaceUser(supabase);
      if (!active) return;
      markSessionChecked();
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
