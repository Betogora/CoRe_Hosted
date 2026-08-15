import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import type { User } from "@supabase/supabase-js";
import { bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;

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
