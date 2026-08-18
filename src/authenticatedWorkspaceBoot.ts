import type { User } from "@supabase/supabase-js";
import { clearCloudAuthRedirectParams, getCloudWorkspaceUser, readCloudAuthRedirectOutcome } from "./cloudAuth.ts";
import { createCoreRepository } from "./coreRepository.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { markReplicaStartupGate, markSessionChecked } from "./appPerformance.ts";
import { createIndexedDbCoreRepository, type IndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";
import { profileForBootstrap } from "./profileIntegrity.ts";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;
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
  initialDeckSummaries: Awaited<ReturnType<IndexedDbCoreRepository["listDeckSummaries"]>>;
  pendingCount: number;
  baselineState: ReturnType<IndexedDbCoreRepository["getReplicaStatus"]>["accountBaselineState"];
  bootstrapFirstAttempt: Promise<AuthenticatedWorkspaceBootstrapResult>;
  cloudBootstrap: Promise<AuthenticatedWorkspaceBootstrapResult>;
  cloudSync: Promise<AuthenticatedWorkspaceCloudResult>;
  retryCloudBootstrap: () => void;
  stopCloudBootstrapRetry: () => void;
}

export interface AuthenticatedWorkspaceBootstrapResult {
  conflictCount: number;
}

export interface AuthenticatedWorkspaceCloudResult {
  syncEngine: AccountSyncEngine;
  conflictCount: number;
  pendingCount: number;
}

export async function bootAuthenticatedWorkspace(
  supabase: SupabaseBrowserClient,
  user: User,
): Promise<AuthenticatedWorkspaceBootResult> {
  const seedRepository = createCoreRepository({ seedDefaultDecks: false });
  const repository = await createIndexedDbCoreRepository({
    userId: user.id,
    initialState: seedRepository.getState(),
  });
  const state = repository.getShellState();
  const initialDeckSummaries = await repository.listDeckSummaries({
    dayStartHour: Number(state.profile.schedulerPreferences?.dayStartHour ?? 0),
    timeZone: state.profile.timezone,
  });
  const bootstrap = createBootstrapRetryCoordinator(supabase, user, repository);
  const cloudSync = bootstrap.ready.then(() => finishAuthenticatedWorkspaceCloudSync(supabase, user.id, repository));
  return {
    repository,
    state,
    initialDeckSummaries,
    pendingCount: repository.outbox.count(),
    baselineState: repository.getReplicaStatus().accountBaselineState,
    bootstrapFirstAttempt: bootstrap.firstAttempt,
    cloudBootstrap: bootstrap.ready,
    cloudSync,
    retryCloudBootstrap: bootstrap.retry,
    stopCloudBootstrapRetry: bootstrap.stop,
  };
}

function createBootstrapRetryCoordinator(
  supabase: SupabaseBrowserClient,
  user: User,
  repository: IndexedDbCoreRepository,
) {
  const retryDelays = [2_000, 10_000, 30_000, 120_000];
  let retryIndex = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let baselineReady = false;
  let running: Promise<AuthenticatedWorkspaceBootstrapResult> | null = null;
  let settleFirstResolve!: (value: AuthenticatedWorkspaceBootstrapResult) => void;
  let settleFirstReject!: (error: unknown) => void;
  let settleReady!: (value: AuthenticatedWorkspaceBootstrapResult) => void;
  const firstAttempt = new Promise<AuthenticatedWorkspaceBootstrapResult>((resolve, reject) => {
    settleFirstResolve = resolve;
    settleFirstReject = reject;
  });
  const ready = new Promise<AuthenticatedWorkspaceBootstrapResult>((resolve) => { settleReady = resolve; });
  let firstSettled = false;

  const clearRetry = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    if (stopped || timer !== null) return;
    const base = retryDelays[retryIndex] ?? 5 * 60_000;
    retryIndex += 1;
    const jittered = Math.round(base * (0.8 + Math.random() * 0.4));
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, jittered);
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  const run = () => {
    if (stopped) return Promise.reject(new Error("Cloud-Bootstrap wurde beendet."));
    if (running) return running;
    clearRetry();
    running = finishAuthenticatedWorkspaceBootstrap(supabase, user, repository)
      .then((result) => {
        baselineReady = true;
        clearRetry();
        detachListeners();
        retryIndex = 0;
        if (!firstSettled) {
          firstSettled = true;
          settleFirstResolve(result);
        }
        settleReady(result);
        return result;
      })
      .catch((error) => {
        if (!firstSettled) {
          firstSettled = true;
          settleFirstReject(error);
        }
        schedule();
        throw error;
      })
      .finally(() => { running = null; });
    running.catch(() => undefined);
    return running;
  };
  const retry = () => {
    if (baselineReady) return;
    retryIndex = 0;
    clearRetry();
    void run();
  };
  const online = () => retry();
  const focus = () => retry();
  const visibility = () => { if (globalThis.document?.visibilityState === "visible") retry(); };
  const detachListeners = () => {
    globalThis.removeEventListener?.("online", online);
    globalThis.removeEventListener?.("focus", focus);
    globalThis.document?.removeEventListener?.("visibilitychange", visibility);
  };
  globalThis.addEventListener?.("online", online);
  globalThis.addEventListener?.("focus", focus);
  globalThis.document?.addEventListener?.("visibilitychange", visibility);
  void run();
  return {
    firstAttempt,
    ready,
    retry,
    stop() {
      stopped = true;
      clearRetry();
      detachListeners();
    },
  };
}

async function finishAuthenticatedWorkspaceBootstrap(
  supabase: SupabaseBrowserClient,
  user: User,
  repository: IndexedDbCoreRepository,
): Promise<AuthenticatedWorkspaceBootstrapResult> {
  const pendingMutationsAtRequest = repository.outbox.listPending();
  const { loadAccountCloudBootstrapV2 } = await import("./cloudRepository.ts");
  const bootstrap = await loadAccountCloudBootstrapV2(supabase, user);
  const localCatalogCursor = repository.getReplicaStatus().catalogCursor;
  await repository.applyCloudCatalogPage({ table: "decks", entities: bootstrap.decks.map((entry) => entry.deck), reset: false, cursor: localCatalogCursor });
  await repository.applyCloudCatalogPage({ table: "deck_study_summaries", entities: bootstrap.decks.map((entry) => entry.summary), reset: false, cursor: localCatalogCursor });
  if (bootstrap.studyOverview) await repository.applyAccountStudyOverview(bootstrap.studyOverview);
  await applyBootstrapProfile(repository, bootstrap.profile, user.id, pendingMutationsAtRequest);
  await repository.setAccountBaselineState(bootstrap.confirmedEmpty ? "confirmed-empty" : "nonempty", bootstrap.serverCatalogCursor);
  markReplicaStartupGate("accountBaselineReady", { deckCount: bootstrap.decks.length });
  return { conflictCount: bootstrap.conflictCount };
}

export async function applyBootstrapProfile(
  repository: IndexedDbCoreRepository,
  cloudProfile: unknown,
  userId: string,
  pendingMutationsAtRequest: ReturnType<IndexedDbCoreRepository["outbox"]["listPending"]> = [],
): Promise<void> {
  const pendingById = new Map(pendingMutationsAtRequest.map((mutation) => [mutation.id, mutation]));
  for (const mutation of repository.outbox.listPending()) pendingById.set(mutation.id, mutation);
  await repository.applyCloudProfile(profileForBootstrap(cloudProfile, [...pendingById.values()], userId));
  await repository.flush();
}

async function finishAuthenticatedWorkspaceCloudSync(
  supabase: SupabaseBrowserClient,
  userId: string,
  repository: IndexedDbCoreRepository,
): Promise<AuthenticatedWorkspaceCloudResult> {
  const [{ streamAccountCatalogChanges }, { createAccountSyncEngine }] = await Promise.all([
    import("./cloudRepository.ts"),
    import("./syncEngine.ts"),
  ]);
  const pullChanges = async () => {
    const nextCursor = await streamAccountCatalogChanges(
      supabase,
      repository.getReplicaStatus().catalogCursor,
      repository.applyCloudCatalogPage,
    );
    await repository.completeCatalogReconciliation(nextCursor);
    markReplicaStartupGate("catalogReconciled", { cursor: nextCursor });
  };
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
  });
  try {
    await syncEngine.initialize();
  } catch {
    // Die Lifecycle-Retries dürfen auch dann installiert werden, wenn die erste Geräte-Registrierung offline scheitert.
  }
  let syncResult: Awaited<ReturnType<typeof syncEngine.syncNow>> | null = null;
  try {
    syncResult = await syncEngine.syncNow();
  } catch {
    // Der Coordinator wird trotzdem an React übergeben; Fokus-, Online- und Intervall-Retries bleiben damit aktiv.
  }
  await repository.flush();
  return {
    syncEngine,
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
