import type { User } from "@supabase/supabase-js";
import { createAccountStorage, hasPendingLocalMigration, readLegacyLocalState } from "./accountStorage.ts";
import { clearCloudAuthRedirectParams, getCloudUser, readCloudAuthRedirectOutcome } from "./cloudAuth.ts";
import { createCoreRepository } from "./coreRepository.ts";
import { createCoreWorkspace, type CoreWorkspace, type WorkspaceState } from "./coreWorkspace.ts";
import { createAccountSyncEngine, type AccountSyncEngine } from "./syncEngine.ts";
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
  workspace: CoreWorkspace;
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
  const workspace = createCoreWorkspace(createCoreRepository(accountStorage, { seedDefaultDecks: false }));
  const syncEngine = createAccountSyncEngine(supabase, {
    userId: user.id,
    storage: accountStorage,
    device: createBrowserSyncDevice(),
    persistSnapshot: (nextState: WorkspaceState) => workspace.saveState(nextState),
  });
  const fallbackState = workspace.getState();
  const cloudState = await syncEngine.loadSnapshot(fallbackState);
  const state = workspace.saveState(cloudState);
  let conflicts: unknown[] = [];

  try {
    conflicts = await syncEngine.listConflicts();
  } catch (error) {
    if (syncEngine.pendingCount() === 0) throw error;
  }

  const legacyState = hasPendingLocalMigration(user.id) ? readLegacyLocalState() : null;
  return {
    workspace,
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
