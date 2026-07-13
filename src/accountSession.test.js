import assert from "node:assert/strict";
import test from "node:test";
import { authPhaseForSession, createSyncConflictStatus, createSyncErrorStatus, createSyncOfflineStatus, createSyncSavedStatus, formatSyncStatusText, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.js";

test("login gate blocks the app shell without a Supabase session", () => {
  const signedOutPhase = authPhaseForSession({ configured: true, user: null });

  assert.equal(signedOutPhase, "signed-out");
  assert.equal(shouldShowAuthGate(signedOutPhase), true);
  assert.equal(shouldShowAppShell(signedOutPhase), false);
});

test("missing Supabase config also stays behind the login gate", () => {
  const phase = authPhaseForSession({ configured: false, user: null });

  assert.equal(phase, "config-error");
  assert.equal(shouldShowAuthGate(phase), true);
  assert.equal(shouldShowAppShell(phase), false);
});

test("only the ready phase can show account data", () => {
  assert.equal(shouldShowAppShell("checking-session"), false);
  assert.equal(shouldShowAppShell("loading-cloud"), false);
  assert.equal(shouldShowAppShell("migration-choice"), false);
  assert.equal(shouldShowAppShell("password-recovery"), false);
  assert.equal(shouldShowAppShell("signed-out"), false);
  assert.equal(shouldShowAppShell("ready"), true);
});

test("password recovery stays in the auth gate until a new password is saved", () => {
  assert.equal(shouldShowAuthGate("password-recovery"), true);
  assert.equal(shouldShowAppShell("password-recovery"), false);
});

test("autosave errors create a visible retry status", () => {
  const status = createSyncErrorStatus("Cloud-Speichern fehlgeschlagen. Bitte erneut versuchen.");

  assert.equal(status.status, "error");
  assert.equal(formatSyncStatusText(status), "Cloud-Speichern fehlgeschlagen. Bitte erneut versuchen.");
});

test("saved sync status records the save time without exposing account tokens", () => {
  const status = createSyncSavedStatus("Synchronisiert.", () => "2026-07-09T08:00:00.000Z");

  assert.equal(status.status, "saved");
  assert.equal(status.savedAt, "2026-07-09T08:00:00.000Z");
  assert.equal(Object.hasOwn(status, "access_token"), false);
  assert.equal(Object.hasOwn(status, "refresh_token"), false);
});

test("conflict sync status explains that a user decision is required", () => {
  const status = createSyncConflictStatus(2);

  assert.equal(status.status, "conflict");
  assert.equal(status.conflictCount, 2);
  assert.equal(formatSyncStatusText(status), "2 Änderungen brauchen deine Entscheidung.");
});

test("offline sync status keeps pending changes visible without exposing technical errors", () => {
  const status = createSyncOfflineStatus({ pendingCount: 2, nextRetryAt: "2026-07-13T12:00:30.000Z" });

  assert.equal(status.status, "offline");
  assert.equal(status.pendingCount, 2);
  assert.equal(status.nextRetryAt, "2026-07-13T12:00:30.000Z");
  assert.match(formatSyncStatusText(status), /^Offline\. 2 Änderungen bleiben vorgemerkt und werden automatisch synchronisiert\. Nächster Versuch: .+\.$/);
});
