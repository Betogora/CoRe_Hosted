import assert from "node:assert/strict";
import test from "node:test";
import {
  createCloudProfile,
  createCloudAuthRedirectUrl,
  createPendingCloudProfile,
  createProfileRow,
  formatCloudAuthError,
  getCloudUser,
  markCloudSignedOut,
  resetCloudPassword,
  signInWithGoogle,
  signInWithMagicLink,
  signUpCloudAccount,
  updateCloudPassword,
} from "./cloudAuth.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "Noemi@Example.test",
  created_at: "2026-07-09T07:00:00.000Z",
};

test("cloud auth maps local profile fields into a Supabase profile row", () => {
  const row = createProfileRow(
    {
      displayName: "Noemi",
      email: "noemi@example.test",
      university: "Uni",
      fieldOfStudy: "Medizin",
      preferredLanguage: "de",
      privacy: { showOnlineStatus: true },
      schedulerPreferences: { profile: "standard" },
    },
    user,
    "2026-07-09T07:30:00.000Z",
  );

  assert.equal(row.id, user.id);
  assert.equal(row.email, "noemi@example.test");
  assert.equal(row.display_name, "Noemi");
  assert.equal(row.field_of_study, "Medizin");
  assert.ok(row);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(row.privacy.showOnlineStatus, true);
  assert.equal(row.updated_at, "2026-07-09T07:30:00.000Z");
});

test("cloud auth creates a password-free signed-in profile", () => {
  const profile = createCloudProfile(
    {
      id: user.id,
      email: "noemi@example.test",
      display_name: "Noemi",
      preferred_language: "de",
      privacy: { shareLearningProgress: false },
      scheduler_preferences: { profile: "standard" },
    },
    user,
    {
      account: { passwordVerifier: "pw_secret" },
    },
    "2026-07-09T07:30:00.000Z",
  );

  assert.equal(profile.account.authProvider, "supabase");
  assert.equal(profile.account.status, "signed-in");
  assert.equal(profile.account.passwordVerifier, undefined);
  assert.equal(profile.displayName, "Noemi");
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
  assert.equal(formatCloudAuthError({ message: "Invalid login credentials" }), "E-Mail oder Passwort stimmt nicht.");
  assert.match(formatCloudAuthError({ message: "Email rate limit exceeded" }), /zu viele Auth-E-Mails/);
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  await assert.rejects(() => getCloudUser(expiredClient), (error) => error?.code === "session_expired");
});

test("cloud auth passes the app URL into confirmation and reset email redirects", async () => {
  const signUpCalls: any[] = [];
  const resetCalls: { options: { redirectTo: unknown; }; }[]|{ email: any; options: any; }[] = [];
  const client = {
    from() {
      return {};
    },
    auth: {
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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

test("cloud auth starts Google OAuth with the configured redirect", async () => {
  const calls: any[] = [];
  const client = {
    from() {
      return {};
    },
    auth: {
      async signInWithOAuth(input: any) {
        calls.push(input);
        return { data: { url: "https://accounts.google.test" }, error: null };
      },
    },
  };

  const result = await signInWithGoogle(client, "https://core-hosted.vercel.app");

  assert.equal(result.url, "https://accounts.google.test");
  assert.equal(calls[0].provider, "google");
  assert.equal(calls[0].options.redirectTo, "https://core-hosted.vercel.app");
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

  assert.equal(updated.id, user.id);
  assert.deepEqual(calls[0], { password: "supersecret" });
  await assert.rejects(() => updateCloudPassword(client, "short"), /mindestens 8 Zeichen/);
});
