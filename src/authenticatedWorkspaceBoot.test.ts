import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import type { User } from "@supabase/supabase-js";
import { applyBootstrapProfile, bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;

function completeProfile(userId: string) {
  return {
    userId,
    email: "cloud@example.test",
    displayName: "Cloud Profil",
    timezone: "Europe/Berlin",
    onboardingComplete: true,
    schedulerPreferences: { settingsVersion: 2, dayStartHour: 0 },
    uiPreferences: {
      dashboardCollapsedDeckIds: [],
      learnCollapsedDeckIds: [],
      deckManagerExpandedDeckIds: [],
      syncIntervalMinutes: 5 as const,
    },
  };
}

test("ein während des Bootstrap bereits versendeter Profilpatch wird nicht von einer älteren Cloud-Antwort überschrieben", async () => {
  const userId = `profile-bootstrap-race-${Date.now()}`;
  const cloudProfile = completeProfile(userId);
  const repository = await createIndexedDbCoreRepository({
    userId,
    initialState: {
      version: 4,
      profile: cloudProfile,
      decks: [],
      documents: [],
      noteTypeDefinitions: [],
      learningItemSourceSnapshots: [],
      cloudTombstones: [],
      updatedAt: "2026-08-17T10:00:00.000Z",
    },
  });
  repository.saveProfile({ ...cloudProfile, displayName: "Offline gespeichert" });
  await repository.flush();
  const pendingAtRequest = repository.outbox.listPending();
  repository.outbox.remove(pendingAtRequest.map((mutation) => mutation.id));
  await repository.outbox.flushPersistence();

  await applyBootstrapProfile(repository, cloudProfile, userId, pendingAtRequest);

  assert.equal(repository.getShellState().profile.displayName, "Offline gespeichert");
  repository.close();
});

test("liefert den lokalen Workspace, bevor der Cloud-Bootstrap beendet ist", async () => {
  const userId = `local-first-${Date.now()}`;
  const knownDeviceRepository = await createIndexedDbCoreRepository({
    userId,
    initialState: {
      version: 4,
      profile: completeProfile(userId),
      decks: [],
      documents: [],
      noteTypeDefinitions: [],
      learningItemSourceSnapshots: [],
      cloudTombstones: [],
      updatedAt: "2026-08-17T10:00:00.000Z",
    },
  });
  await knownDeviceRepository.setAccountBaselineState("nonempty", 12);
  knownDeviceRepository.close();
  let resolveBootstrap: ((value: unknown) => void) | null = null;
  const cloudBootstrap = new Promise((resolve) => { resolveBootstrap = resolve; });
  const supabase = {
    auth: {},
    from() { return {}; },
    rpc(name: string) {
      assert.equal(name, "get_account_bootstrap_v2");
      return cloudBootstrap;
    },
  } as unknown as SupabaseBrowserClient;

  const boot = await bootAuthenticatedWorkspace(supabase, { id: userId } as User);
  assert.equal(boot.state.version, 4);
  assert.equal(boot.baselineState, "nonempty");
  assert.equal(boot.state.decks.every((deck) => deck.cards.length === 0), true);
  assert.equal(boot.initialDeckSummaries.summaries.size, 0);

  let cloudSyncReady = false;
  void boot.cloudSync.then(() => { cloudSyncReady = true; });
  await Promise.resolve();
  assert.equal(cloudSyncReady, false, "normaler Sync darf die lokale Baseline nicht überholen");
  const releaseBootstrap = resolveBootstrap as ((value: unknown) => void) | null;
  releaseBootstrap?.({
    data: {
      profile: null,
      decks: [],
      nextCursor: "",
      hasMore: false,
      confirmedEmpty: false,
      conflictCount: 0,
      serverCatalogCursor: 12,
    },
    error: null,
  });
  await boot.bootstrapFirstAttempt;
  await boot.cloudSync;
  boot.stopCloudBootstrapRetry();
  boot.repository.close();
});

test("session lifecycle reports missing browser configuration without starting work", () => {
  let unavailable = false;
  const cleanup = startAuthenticatedWorkspaceSessionLifecycle({
    supabase: null,
    onUnavailable() { unavailable = true; },
    onSignedOut() {},
    onRedirectError() {},
    onPasswordRecovery() {},
    async onBoot() {},
    onFailure() {},
  });
  assert.equal(unavailable, true);
  cleanup();
});

test("session lifecycle ignores boot and recovery results after unmount", async () => {
  const user = { id: "account-a" } as User;
  let resolveUser: ((value: { data: { user: User }; error: null }) => void) | null = null;
  const pendingUser = new Promise<{ data: { user: User }; error: null }>((resolve) => { resolveUser = resolve; });
  let authListener: ((event: string, session: { user: User } | null) => void) | null = null;
  let unsubscribed = false;
  let boots = 0;
  let recoveries = 0;
  const supabase = {
    auth: {
      getUser: () => pendingUser,
      onAuthStateChange(listener: (event: string, session: { user: User } | null) => void) {
        authListener = listener;
        return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } };
      },
    },
    from() { return {}; },
  } as unknown as SupabaseBrowserClient;

  const cleanup = startAuthenticatedWorkspaceSessionLifecycle({
    supabase,
    onUnavailable() {},
    onSignedOut() {},
    onRedirectError() {},
    onPasswordRecovery() { recoveries += 1; },
    async onBoot() { boots += 1; },
    onFailure() {},
  });
  cleanup();
  assert.equal(unsubscribed, true);

  const resolvePendingUser = resolveUser as ((value: { data: { user: User }; error: null }) => void) | null;
  resolvePendingUser?.({ data: { user }, error: null });
  await pendingUser;
  await Promise.resolve();
  const lateAuthListener = authListener as ((event: string, session: { user: User } | null) => void) | null;
  lateAuthListener?.("PASSWORD_RECOVERY", { user });

  assert.equal(boots, 0);
  assert.equal(recoveries, 0);
});

test("session lifecycle cold-starts offline from the persisted Supabase session", async () => {
  const user = { id: "trusted-device-account" } as User;
  let bootedUser: User | null = null;
  const supabase = {
    auth: {
      async getUser() { return { data: { user: null }, error: new Error("Failed to fetch") }; },
      async getSession() { return { data: { session: { user } }, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from() { return {}; },
  } as unknown as SupabaseBrowserClient;

  const cleanup = startAuthenticatedWorkspaceSessionLifecycle({
    supabase,
    onUnavailable() {},
    onSignedOut() {},
    onRedirectError() {},
    onPasswordRecovery() {},
    async onBoot(nextUser) { bootedUser = nextUser; },
    onFailure(error) { throw error; },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((bootedUser as User | null)?.id, user.id);
  cleanup();
});
