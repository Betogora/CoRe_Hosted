import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalE2ERuntimeEnvironment,
  isLocalSupabaseUrl,
  parseSupabaseStatusEnvironment,
} from "../scripts/localE2EEnvironment.ts";
import { ensureLocalE2EAccount } from "../tests/e2e/support/e2eEnvironment.ts";

test("parseSupabaseStatusEnvironment reads quoted Supabase CLI env output", () => {
  assert.deepEqual(
    parseSupabaseStatusEnvironment('API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="sb_publishable_local"\n'),
    {
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "sb_publishable_local",
    },
  );
});

test("parseSupabaseStatusEnvironment reads current Supabase CLI JSON output", () => {
  assert.deepEqual(
    parseSupabaseStatusEnvironment(
      JSON.stringify({
        API_URL: "http://127.0.0.1:54321",
        PUBLISHABLE_KEY: "sb_publishable_local",
        SERVICE_ROLE_KEY: "must-not-be-used-by-the-runner",
      }),
    ),
    {
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "sb_publishable_local",
      SERVICE_ROLE_KEY: "must-not-be-used-by-the-runner",
    },
  );
});

test("isLocalSupabaseUrl only accepts loopback Supabase targets", () => {
  assert.equal(isLocalSupabaseUrl("http://127.0.0.1:54321"), true);
  assert.equal(isLocalSupabaseUrl("http://localhost:54321"), true);
  assert.equal(isLocalSupabaseUrl("https://project.supabase.co"), false);
});

test("createLocalE2ERuntimeEnvironment builds isolated non-secret local credentials", () => {
  const environment = createLocalE2ERuntimeEnvironment(
    {
      API_URL: "http://127.0.0.1:54321/",
      ANON_KEY: "local-anon-key",
      SERVICE_ROLE_KEY: "status-secret-must-not-be-forwarded",
    },
    {
      PATH: "test-path",
      SUPABASE_ACCESS_TOKEN: "management-token-must-not-be-forwarded",
      SUPABASE_SERVICE_ROLE_KEY: "base-secret-must-not-be-forwarded",
    },
  );

  assert.equal(environment.VITE_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(environment.VITE_SUPABASE_PUBLISHABLE_KEY, "local-anon-key");
  assert.equal(environment.CORE_E2E_ALLOW_ACCOUNT_RESET, "true");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.match(environment.CORE_E2E_EMAIL, /@example\.com$/);
  assert.ok(environment);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.ok(environment.CORE_E2E_PASSWORD.length >= 12);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.match(environment.CORE_RLS_USER_B_EMAIL, /@example\.com$/);
  assert.ok(environment);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.ok(environment.CORE_RLS_USER_B_PASSWORD.length >= 12);
  assert.equal(environment.PATH, "test-path");
  assert.equal("SERVICE_ROLE_KEY" in environment, false);
  assert.equal("SUPABASE_SERVICE_ROLE_KEY" in environment, false);
  assert.equal("SUPABASE_ACCESS_TOKEN" in environment, false);
});

test("createLocalE2ERuntimeEnvironment rejects hosted projects", () => {
  assert.throws(
    () =>
      createLocalE2ERuntimeEnvironment({
        API_URL: "https://project.supabase.co",
        PUBLISHABLE_KEY: "sb_publishable_hosted",
      }),
    /ausschließlich/,
  );
});

test("ensureLocalE2EAccount never creates accounts on hosted projects", async () => {
  let factoryCalls = 0;
  const created = await ensureLocalE2EAccount(
    {
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_hosted",
      email: "test@example.com",
      password: "password",
    },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    () => {
      factoryCalls += 1;
      return {};
    },
  );

  assert.equal(created, false);
  assert.equal(factoryCalls, 0);
});

test("ensureLocalE2EAccount creates and verifies a missing loopback account", async () => {
  let signInCalls = 0;
  let signUpCalls = 0;
  let signOutCalls = 0;
  let disposeCalls = 0;
  const client = {
    auth: {
      async signInWithPassword() {
        signInCalls += 1;
        return signInCalls === 1 ? { error: new Error("missing") } : { error: null };
      },
      async signUp() {
        signUpCalls += 1;
        return { error: null };
      },
      async signOut() {
        signOutCalls += 1;
      },
      dispose() {
        disposeCalls += 1;
      },
    },
  };

  const created = await ensureLocalE2EAccount(
    {
      supabaseUrl: "http://127.0.0.1:54321",
      publishableKey: "local-key",
      email: "core-e2e-local@example.com",
      password: "local-password",
    },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    () => client,
  );

  assert.equal(created, true);
  assert.equal(signInCalls, 2);
  assert.equal(signUpCalls, 1);
  assert.equal(signOutCalls, 2);
  assert.equal(disposeCalls, 1);
});
