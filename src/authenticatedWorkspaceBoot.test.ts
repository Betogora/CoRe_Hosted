import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
import type { createSupabaseBrowserClient } from "./supabaseClient.ts";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;

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
