import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import type { User } from "@supabase/supabase-js";
import { bootAuthenticatedWorkspace, repairBootstrapProfile, startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
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

test("repariert ausschließlich alte unvollständige Profilpatches nach erfolgreichem Bootstrap", async () => {
  const userId = `profile-repair-${Date.now()}`;
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
      updatedAt: "2026-08-15T10:00:00.000Z",
    },
  });
  const otherMutation = repository.outbox.enqueue({
    id: "card-mutation",
    type: "entity-mutation",
    table: "cards",
    entityId: "card-1",
    payload: { table: "cards", entity: { id: "card-1", originalFront: "Unverändert" } },
  });
  repository.outbox.enqueue({
    id: "broken-profile",
    type: "profile-patch",
    table: "profiles",
    entityId: userId,
    payload: {
      profile: {
        uiPreferences: { ...cloudProfile.uiPreferences, dashboardCollapsedDeckIds: ["deck-1"] },
      },
    },
  });
  await repository.outbox.flushPersistence();

  await repairBootstrapProfile(repository, cloudProfile, userId);

  assert.deepEqual(repository.getShellState().profile, {
    ...cloudProfile,
    uiPreferences: { ...cloudProfile.uiPreferences, dashboardCollapsedDeckIds: ["deck-1"] },
  });
  const pending = repository.outbox.listPending();
  assert.equal(pending.some((mutation) => mutation.id === "broken-profile"), false);
  assert.deepEqual(pending.find((mutation) => mutation.id === otherMutation.id), otherMutation);
  const repairedPatch = pending.find((mutation) => mutation.type === "profile-patch");
  assert.ok(repairedPatch);
  assert.deepEqual((repairedPatch.payload as any).profile, repository.getShellState().profile);
  repository.close();
});

test("liefert den lokalen Workspace, bevor der Cloud-Bootstrap beendet ist", async () => {
  let rejectBootstrap: ((reason: Error) => void) | null = null;
  const cloudBootstrap = new Promise<never>((_resolve, reject) => { rejectBootstrap = reject; });
  const supabase = {
    auth: {},
    from() { return {}; },
    rpc(name: string) {
      assert.equal(name, "get_account_bootstrap");
      return cloudBootstrap;
    },
  } as unknown as SupabaseBrowserClient;

  const boot = await bootAuthenticatedWorkspace(supabase, { id: `local-first-${Date.now()}` } as User);
  assert.equal(boot.state.version, 4);
  assert.equal(boot.state.decks.every((deck) => deck.cards.length === 0), true);

  const rejectPendingBootstrap = rejectBootstrap as ((reason: Error) => void) | null;
  rejectPendingBootstrap?.(new Error("Cloud absichtlich angehalten"));
  await assert.rejects(boot.cloudBootstrap, /absichtlich angehalten/);
  await assert.rejects(boot.cloudSync, /absichtlich angehalten/);
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
