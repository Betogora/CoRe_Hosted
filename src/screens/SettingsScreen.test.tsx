import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { createConflictImpactPreview } from "./SyncConflictPanel.tsx";

function renderSettings() {
  const state = createCoreRepository({ seedDefaultDecks: false }).getState();
  const profile = { ...state.profile, email: "login@example.test", displayName: "Ada", timezone: "Europe/Berlin" };
  return renderToStaticMarkup(
    <SettingsScreen
      profile={profile}
      syncStatus={{ status: "idle" }}
      globalSchedulerPreferences={getGlobalSchedulerPreferences(profile)}
      onSaveSettings={() => profile}
      onDraftStateChange={() => undefined}
      onCreateExport={async () => "{}"}
      onImportExport={async () => undefined}
      onSyncNow={async () => undefined}
      onListConflicts={async () => []}
      onResolveConflict={async () => undefined}
      onSignOut={async () => undefined}
      onNavigate={() => createViewRoute("uebersicht")}
      simulationOffsetMinutes={3 * 24 * 60}
      simulationDateLabel="Sonntag, 9. August 2026"
      pomodoroTimer={null}
      onStartPomodoro={() => undefined}
    />,
  );
}

test("global settings expose four task-based sections and cross-navigation", () => {
  const html = renderSettings();
  for (const heading of ["Konto", "Lerntag &amp; Fokus", "Daten &amp; Synchronisierung", "Über uns"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, /aria-label="Bereiche der globalen Einstellungen"/);
  for (const target of ["settings-account", "settings-learning-day", "settings-data-sync", "settings-about"]) assert.match(html, new RegExp(`href="#${target}"`));
  assert.match(html, /data-in-page-navigation="desktop"/);
  assert.match(html, /data-in-page-navigation="compact"/);
  assert.doesNotMatch(html, /min-h-28|Alle Bereiche|\d+\s*\/\s*\d+/);
  assert.match(html, />Stapeleinstellungen</);
});

test("about settings contain help, legal placeholders, and the only visible version slot", () => {
  const html = renderSettings();
  assert.match(html, />Info-Seite öffnen</);
  for (const text of ["Über CoRe", "Impressum", "Datenschutzerklärung"]) assert.match(html, new RegExp(`>${text}<`));
  assert.equal(html.match(/>In Vorbereitung</g)?.length, 2);
  assert.match(html, /aria-label="Aktuelle Version">v0\.0\.0</);
  assert.equal(html.match(/v0\.0\.0/g)?.length, 1);
  assert.doesNotMatch(html, /Release-Information|Commit|Produktion|Entwicklung/);
});

test("account settings expose only active profile fields in one wide panel", () => {
  const html = renderSettings();
  assert.match(html, /Login-E-Mail/);
  assert.match(html, /readOnly=""[^>]*value="login@example\.test"/);
  assert.doesNotMatch(html, /Hochschule|Fachgebiet|Sprache|Deutsch \(Beta\)|Privatsphäre|Online-Status|Streaks/);
  assert.doesNotMatch(html, /xl:grid-cols-\[1fr_0\.8fr\]/);
  assert.doesNotMatch(html, /Profil speichern/);
});

test("learning-day settings contain only global scheduler context", () => {
  const html = renderSettings();
  assert.match(html, /data-testid="settings-day-start-hour"/);
  assert.match(html, /data-testid="settings-learn-ahead"/);
  assert.match(html, />Wochenrhythmus</);
  for (const weekday of ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]) assert.match(html, new RegExp(`>${weekday}<`));
  assert.match(html, /sm:grid-cols-2 lg:grid-cols-4/);
  assert.match(html, /data-testid="settings-easy-day-monday"/);
  assert.match(html, /Europe\/Berlin/);
  assert.match(html, />Simulator</);
  assert.match(html, />Pomodoro-Timer</);
  assert.doesNotMatch(html, />Hilfe</);
  assert.doesNotMatch(html, /Neue Karten pro Tag|Wiederholungen pro Tag|CoRe-Modus|Gewünschte Erinnerungsrate/);
  assert.doesNotMatch(html, /Lerntag speichern/);
});

test("data settings disclose export limits and profile portability", () => {
  const html = renderSettings();
  for (const text of ["Medienbytes", "Authdaten", "serverseitigen Sicherungskopien", "DSGVO-Auskunftsdaten nach Art. 15", "Eigene Lernprofile"]) assert.match(html, new RegExp(text));
  assert.match(html, />Export herunterladen</);
  assert.match(html, />Roh-JSON anzeigen</);
  assert.doesNotMatch(html, /Automatik speichern/);
});

test("conflict previews count only the selected direction", () => {
  const conflicts = [
    { id: "deck-add", status: "open", entityTable: "decks", localPresent: true, remotePresent: false, remoteRevision: null },
    { id: "card-update", status: "open", entityTable: "cards", localPresent: true, remotePresent: true, remoteRevision: 2 },
    { id: "variant-delete", status: "open", entityTable: "card_variants", localPresent: false, remotePresent: true, remoteRevision: 1 },
    { id: "ignored", status: "ignored", entityTable: "cards", localPresent: true, remotePresent: true, remoteRevision: 1 },
  ];

  const local = createConflictImpactPreview(conflicts, "local");
  const cloud = createConflictImpactPreview(conflicts, "cloud");

  assert.deepEqual(local.counts.decks, { add: 1, update: 0, delete: 0 });
  assert.deepEqual(local.counts.cards, { add: 0, update: 1, delete: 0 });
  assert.deepEqual(local.counts.card_variants, { add: 0, update: 0, delete: 1 });
  assert.deepEqual(cloud.counts.decks, { add: 0, update: 0, delete: 1 });
  assert.deepEqual(cloud.conflictIds, ["deck-add", "card-update", "variant-delete"]);
});
