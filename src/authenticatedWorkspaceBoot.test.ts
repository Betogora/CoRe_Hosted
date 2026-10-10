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
      version: 6,
      profile: cloudProfile,
      decks: [],
      notes: [],
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
      version: 6,
      profile: completeProfile(userId),
      decks: [],
      notes: [],
      updatedAt: "2026-08-17T10:00:00.000Z",
    },
  });
  await knownDeviceRepository.setAccountBaselineState("nonempty", 12);
  knownDeviceRepository.close();
  let resolveBootstrap: ((value: unknown) => void) | null = null;
  const cloudBootstrap = new Promise((resolve) => { resolveBootstrap = resolve; });
  const calledRpcs: string[] = [];
  const supabase = {
    auth: {},
    from() { return {}; },
    rpc(name: string) {
      calledRpcs.push(name);
      if (name === "get_account_bootstrap") return cloudBootstrap;
      return Promise.resolve({ data: null, error: new Error(`${name} ist im Test nicht verfügbar.`) });
    },
  } as unknown as SupabaseBrowserClient;

  const boot = await bootAuthenticatedWorkspace(supabase, { id: userId } as User);
  assert.equal(boot.state.version, 6);
  assert.deepEqual(boot.state.notes, []);
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
  assert.equal(calledRpcs[0], "get_account_bootstrap", "der Bootstrap läuft vor jedem Sync-RPC");
  assert.equal(boot.repository.getReplicaStatus().catalogServerCursor, 12);
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
    onSessionRejected() {},
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
    onSessionRejected() {},
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
    onSessionRejected(error) { throw error; },
    onFailure(error) { throw error; },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((bootedUser as User | null)?.id, user.id);
  cleanup();
});

function sessionClient(user: User, confirm: () => Promise<{ data: { user: User | null }; error: unknown }>) {
  const calls: string[] = [];
  const supabase = {
    auth: {
      async getSession() { calls.push("getSession"); return { data: { session: { user } }, error: null }; },
      async getUser() { calls.push("getUser"); return confirm(); },
      async signOut(options: unknown) { calls.push(`signOut:${JSON.stringify(options)}`); return { error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from() { return {}; },
  } as unknown as SupabaseBrowserClient;
  return { supabase, calls };
}

function lifecycle(supabase: SupabaseBrowserClient, events: string[]) {
  return startAuthenticatedWorkspaceSessionLifecycle({
    supabase,
    onUnavailable() { events.push("unavailable"); },
    onSignedOut() { events.push("signed-out"); },
    onRedirectError() { events.push("redirect-error"); },
    onPasswordRecovery() { events.push("recovery"); },
    async onBoot(user) { events.push(`boot:${user.id}`); },
    onSessionRejected(error) { events.push(`rejected:${error ? (error as Error).message : "null"}`); },
    onFailure(error) { events.push(`failure:${(error as Error).message}`); },
  });
}

test("session lifecycle starts the workspace from the persisted session while the server confirms it", async () => {
  const user = { id: "account-a" } as User;
  let confirmUser!: () => void;
  const { supabase, calls } = sessionClient(user, () => new Promise((resolve) => { confirmUser = () => resolve({ data: { user }, error: null }); }));
  const events: string[] = [];
  const cleanup = lifecycle(supabase, events);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ["boot:account-a"], "Der Start wartet nicht auf die Serverbestätigung.");
  confirmUser();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ["boot:account-a"]);
  assert.deepEqual(calls, ["getSession", "getUser"]);
  cleanup();
});

test("session lifecycle discards the start when the server rejects the persisted session", async () => {
  const user = { id: "account-a" } as User;
  const active =sessionClient(user, async () => ({ data: { user: null }, error: null }));
  const events: string[] = [];
  const cleanup = lifecycle(active.supabase, events);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ["boot:account-a", "rejected:null"]);
  assert.ok(active.calls.includes('signOut:{"scope":"local"}'));
  cleanup();

  const failing = sessionClient(user, async () => ({ data: { user: null }, error: new Error("Serverfehler") }));
  const failingEvents: string[] = [];
  const stop = lifecycle(failing.supabase, failingEvents);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(failingEvents, ["boot:account-a", "rejected:Serverfehler"]);
  stop();
});
