import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_EASY_DAYS } from "./easyDays.ts";
import { getGlobalSchedulerPreferences } from "./deckSettings.ts";
import {
  clearCloudAuthRedirectParams,
  createCloudProfile,
  createCloudAuthRedirectUrl,
  createPendingCloudProfile,
  createProfileRow,
  formatCloudAuthError,
  getCloudUser,
  getCloudWorkspaceUser,
  getPersistedCloudUser,
  markCloudSignedOut,
  readCloudAuthRedirectOutcome,
  resetCloudPassword,
  signInCloudAccount,
  signInWithMagicLink,
  signUpCloudAccount,
  updateCloudPassword,
} from "./cloudAuth.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "Noemi@Example.test",
  created_at: "2026-07-09T07:00:00.000Z",
};

test("cloud auth maps only active local profile fields into a Supabase profile row", () => {
  const row = createProfileRow(
    {
      displayName: "Noemi",
      email: "noemi@example.test",
      ignoredField: "nicht persistieren",
      schedulerPreferences: { profile: "standard", dayStartHour: 3 },
      uiPreferences: { learnCollapsedDeckIds: ["deck-a"] },
    },
    user,
    "2026-07-09T07:30:00.000Z",
  );

  assert.equal(row.id, user.id);
  assert.equal(row.email, "noemi@example.test");
  assert.equal(row.display_name, "Noemi");
  assert.equal(Object.hasOwn(row, "ignoredField"), false);
  assert.equal(row.updated_at, "2026-07-09T07:30:00.000Z");
  assert.deepEqual(row.scheduler_preferences, { ...getGlobalSchedulerPreferences({}), dayStartHour: 3, easyDays: DEFAULT_EASY_DAYS });
  assert.deepEqual(row.ui_preferences, { learnCollapsedDeckIds: ["deck-a"], syncIntervalMinutes: 5, flagNames: ["", "", "", "", "", "", ""], savedSearches: [], dashboardPinnedDeckIds: [], dashboardStudyDays: [] });
});

test("cloud auth creates a password-free signed-in profile", () => {
  const profile = createCloudProfile(
    {
      id: user.id,
      email: "noemi@example.test",
      display_name: "Noemi",
      scheduler_preferences: { profile: "standard", dayStartHour: 3 },
      ui_preferences: { learnCollapsedDeckIds: ["deck-a"], deckManagerExpandedDeckIds: ["deck-b"] },
    },
    user,
    {
      account: { passwordVerifier: "pw_secret" },
      ignoredField: "nicht übernehmen",
    },
    "2026-07-09T07:30:00.000Z",
  );

  assert.equal(profile.account.authProvider, "supabase");
  assert.equal(profile.account.status, "signed-in");
  assert.equal(Object.hasOwn(profile.account, "passwordVerifier"), false);
  assert.equal(profile.displayName, "Noemi");
  assert.equal(Object.hasOwn(profile, "ignoredField"), false);
  assert.deepEqual(profile.schedulerPreferences, { ...getGlobalSchedulerPreferences({}), dayStartHour: 3, easyDays: DEFAULT_EASY_DAYS });
  assert.deepEqual(profile.uiPreferences, { learnCollapsedDeckIds: ["deck-a"], syncIntervalMinutes: 5, flagNames: ["", "", "", "", "", "", ""], savedSearches: [], dashboardPinnedDeckIds: [], dashboardStudyDays: [] });
});

test("cloud sign-in creates a missing profile without overwriting an existing one", async () => {
  const upserts: { row: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const client = {
    auth: {
      async signInWithPassword() {
        return { data: { user }, error: null };
      },
    },
    from() {
      return {
        async upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
          upserts.push({ row, options });
          return { data: null, error: null };
        },
      };
    },
  };

  const signedIn = await signInCloudAccount(client, { email: user.email }, "supersecret");

  assert.equal(signedIn.id, user.id);
  assert.deepEqual(upserts[0]?.options, { onConflict: "id", ignoreDuplicates: true });
  assert.equal(upserts[0]?.row.id, user.id);
});

test("cloud auth represents pending email confirmation and signed-out state", () => {
  const pending = createPendingCloudProfile({ email: "noemi@example.test" }, user, "2026-07-09T07:30:00.000Z");
  const signedOut = markCloudSignedOut(pending, "2026-07-09T07:45:00.000Z");

  assert.equal(pending.account.status, "pending-email-confirmation");
  assert.equal(signedOut.account.status, "signed-out");
  assert.equal(signedOut.account.signedOutAt, "2026-07-09T07:45:00.000Z");
});

test("cloud auth formats common Supabase auth errors in German", () => {
  assert.match(formatCloudAuthError({ code: "session_expired", message: "Session expired" }), /Sitzung ist abgelaufen/);
  assert.match(formatCloudAuthError({ status: 403, message: "Session expired" }), /Sitzung ist abgelaufen/);
  assert.match(formatCloudAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), /nicht erreichbar/);
  assert.match(formatCloudAuthError({ name: "AuthRetryableFetchError", message: "{}" }), /nicht erreichbar/);
  assert.equal(formatCloudAuthError({ message: "Invalid login credentials" }), "E-Mail oder Passwort stimmt nicht.");
  assert.match(formatCloudAuthError({ message: "Email rate limit exceeded" }), /bereits eine Auth-E-Mail/);
  assert.match(formatCloudAuthError({ code: "over_email_send_rate_limit" }), /warte kurz/);
  assert.match(formatCloudAuthError({ code: "otp_expired" }), /abgelaufen oder wurde bereits verwendet/);
  assert.match(formatCloudAuthError({ code: "flow_state_not_found" }), /neuen Link/);
  assert.match(formatCloudAuthError({ code: "reauthentication_needed" }), /Identität erneut/);
  assert.match(formatCloudAuthError({ code: "reauthentication_not_valid" }), /Bestätigungscode/);
  assert.match(formatCloudAuthError({ code: "weak_password", message: "Password is compromised and pwned" }), /Datenleck/);
  assert.match(formatCloudAuthError({ code: "weak_password", message: "Password is too weak" }), /Sicherheitsanforderungen/);
  assert.match(formatCloudAuthError({ message: "Email not confirmed" }), /bestätige zuerst/);
  assert.match(formatCloudAuthError({ message: "Email signups are disabled" }), /Registrierung ist in Supabase.*deaktiviert/);
  assert.match(formatCloudAuthError({ message: "User already registered" }), /existiert wahrscheinlich schon/);
  assert.match(formatCloudAuthError({ message: "Password should be stronger" }), /gültiges Passwort/);
  assert.match(formatCloudAuthError({ code: "cloud_revision_conflict", message: "internal details" }), /anderen Gerät.*neuere Version/);
  assert.equal(
    formatCloudAuthError({ code: "sync_device_registration_failed", message: "safe", cause: { message: "database details" } }),
    "Dieses Gerät konnte nicht für die Synchronisierung registriert werden.",
  );
  assert.match(
    formatCloudAuthError({ code: "sync_device_registration_failed", cause: { name: "AuthRetryableFetchError", message: "Failed to fetch" } }),
    /nicht erreichbar/,
  );
  assert.match(
    formatCloudAuthError({ code: "sync_device_registration_failed", cause: { name: "AuthSessionMissingError", message: "Auth session missing" } }),
    /Sitzung ist abgelaufen/,
  );
  assert.match(
    formatCloudAuthError({ code: "sync_device_registration_failed", cause: { code: "session_not_found", message: "Bitte melde dich zuerst an." } }),
    /Sitzung ist abgelaufen/,
  );
});

test("cloud auth classifies and clears recovery and error redirects", () => {
  assert.deepEqual(readCloudAuthRedirectOutcome({ search: "?type=recovery", hash: "" }), { kind: "recovery" });
  assert.deepEqual(readCloudAuthRedirectOutcome({ search: "", hash: "#type=password_recovery&access_token=secret" }), { kind: "recovery" });
  assert.deepEqual(readCloudAuthRedirectOutcome({ search: "", hash: "" }), { kind: "none" });

  const expired = readCloudAuthRedirectOutcome({
    search: "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    hash: "",
  });
  assert.equal(expired.kind, "error");
  if (expired.kind === "error") {
    assert.equal(expired.code, "otp_expired");
    assert.match(expired.message, /abgelaufen/);
  }

  const calls: any[] = [];
  const cleanUrl = clearCloudAuthRedirectParams(
    { href: "https://core-hosted.vercel.app/?type=recovery&code=secret&view=lernen#error=secret" },
    { state: { keep: true }, replaceState(...args: any[]) { calls.push(args); } },
  );
  assert.equal(cleanUrl, "/?view=lernen");
  assert.deepEqual(calls[0], [{ keep: true }, "", "/?view=lernen"]);
});

test("cloud auth distinguishes a missing session from an expired session", async () => {
  const missingClient = {
    from() {},
    auth: {
      async getUser() {
        return { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing" } };
      },
    },
  };
  const expiredClient = {
    from() {},
    auth: {
      async getUser() {
        return { data: { user: null }, error: { code: "session_expired", message: "Session expired" } };
      },
    },
  };

  assert.equal(await getCloudUser(missingClient), null);
// @ts-expect-error
  await assert.rejects(() => getCloudUser(expiredClient), (error) => error?.code === "session_expired");
});

test("offline workspace start reads the persisted session without a network auth request", async () => {
  let userRequests = 0;
  const client = {
    from() {},
    auth: {
      async getUser() {
        userRequests += 1;
        return { data: { user }, error: null };
      },
      async getSession() {
        return { data: { session: { user } }, error: null };
      },
    },
  };

  assert.equal(await getCloudWorkspaceUser(client, false), user);
  assert.equal(userRequests, 0);
});

/** A session as auth-js stores it, expiring `expiresInSeconds` from now. */
function storedSession(storageKey: string, expiresInSeconds: number) {
  const memory = new Map([[storageKey, JSON.stringify({ access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds, user })]]);
  return { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
}

// A valid token keeps the installed auth-js from refreshing in the background; the test pins its storage key and format.
test("offline the workspace user comes from the session as the installed supabase-js stores it", async () => {
  const storageKey = "sb-project-auth-token";
  let requests = 0;
  const client = createClient("https://project.supabase.co", "public-key", {
    auth: { storage: storedSession(storageKey, 3600), storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    global: { fetch: async () => { requests += 1; return new Response(null, { status: 503 }); } },
  });
  assert.equal((await getCloudWorkspaceUser(client, false))?.id, user.id);
  assert.equal(requests, 0);
});

test("a refresh that fails for lack of network keeps the stored user, a rejected one still throws", async () => {
  const storageKey = "sb-project-auth-token";
  const client = (error: { name: string; message: string }) => ({
    from() {},
    auth: { storageKey, storage: storedSession(storageKey, -3600), async getUser() { return { data: { user: null }, error }; }, async getSession() { return { data: { session: null }, error }; } },
  });
  assert.equal((await getPersistedCloudUser(client({ name: "AuthRetryableFetchError", message: "Failed to fetch" })))?.id, user.id);
  await assert.rejects(getPersistedCloudUser(client({ name: "AuthApiError", message: "Invalid Refresh Token: Refresh Token Not Found" })), { message: /Invalid Refresh Token/ });
});

test("cloud auth passes the app URL into confirmation and reset email redirects", async () => {
  const signUpCalls: any[] = [];
  const resetCalls: { options: { redirectTo: unknown; }; }[]|{ email: any; options: any; }[] = [];
  const client = {
    from() {
      return {};
    },
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
      async signUp(input: any) {
        signUpCalls.push(input);
        return { data: { user, session: null }, error: null };
      },
      async resetPasswordForEmail(email: any, options: any) {
        resetCalls.push({ email, options });
        return { error: null };
      },
    },
  };

  const redirectTo = "https://core-hosted.vercel.app";
  const pending = await signUpCloudAccount(client, { displayName: "Noemi", email: "Noemi@Example.test" }, "supersecret", "2026-07-09T07:30:00.000Z", redirectTo);
  await resetCloudPassword(client, "Noemi@Example.test", redirectTo);

  assert.equal(pending.account.status, "pending-email-confirmation");
  assert.equal(signUpCalls[0].options.emailRedirectTo, redirectTo);
  assert.equal(signUpCalls[0].options.data.display_name, "Noemi");
// @ts-expect-error
  assert.equal(resetCalls[0].email, "noemi@example.test");
  assert.equal(resetCalls[0].options.redirectTo, redirectTo);
});

test("cloud auth normalizes production, preview and local origins to allowlisted root redirects", () => {
  assert.equal(createCloudAuthRedirectUrl("https://core-hosted.vercel.app"), "https://core-hosted.vercel.app/");
  assert.equal(createCloudAuthRedirectUrl("https://core-hosted-abc123-bengt2.vercel.app/lernen"), "https://core-hosted-abc123-bengt2.vercel.app/");
  assert.equal(createCloudAuthRedirectUrl("http://127.0.0.1:5190"), "http://127.0.0.1:5190/");
  assert.equal(createCloudAuthRedirectUrl("kein-url"), undefined);
});

test("cloud auth sends magic links only for existing users", async () => {
  const calls: any[] = [];
  const client = {
    from() {
      return {};
    },
    auth: {
      async signInWithOtp(input: any) {
        calls.push(input);
        return { data: {}, error: null };
      },
    },
  };

  const result = await signInWithMagicLink(client, "Noemi@Example.test", "https://core-hosted.vercel.app");

  assert.equal(result.email, "noemi@example.test");
  assert.equal(calls[0].email, "noemi@example.test");
  assert.equal(calls[0].options.emailRedirectTo, "https://core-hosted.vercel.app");
  assert.equal(calls[0].options.shouldCreateUser, false);
});

test("cloud auth updates a recovered password through Supabase", async () => {
  const calls: any[] = [];
  const client = {
    from() {
      return {};
    },
    auth: {
      async updateUser(input: any) {
        calls.push(input);
        return { data: { user }, error: null };
      },
    },
  };

  const updated = await updateCloudPassword(client, "supersecret");

  assert.equal(updated?.id, user.id);
  assert.deepEqual(calls[0], { password: "supersecret" });
  await assert.rejects(() => updateCloudPassword(client, "short"), /mindestens 8 Zeichen/);
});
