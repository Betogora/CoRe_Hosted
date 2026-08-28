import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { createConflictImpactPreview } from "./SyncConflictPanel.tsx";

function renderSettings() {
  const state = createCoreRepository({ seedDefaultDecks: false }).getState();
  const profile = { ...state.profile, email: "login@example.test", displayName: "Ada", timezone: "Europe/Berlin" };
  return renderToStaticMarkup(
    <SettingsScreen
      profile={profile}
      syncStatus={{ status: "idle" }}
      onSaveSettings={() => profile}
      onDraftStateChange={() => undefined}
      onSyncNow={async () => undefined}
      onListConflicts={async () => []}
      onResolveConflict={async () => undefined}
      onSignOut={async () => undefined}
      onNavigate={() => createViewRoute("uebersicht")}
    />,
  );
}

test("general settings expose three task-based sections and card-settings navigation", () => {
  const html = renderSettings();
  for (const heading of ["Konto", "Daten &amp; Synchronisierung", "Über uns"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.match(html, />Allgemeine Einstellungen</);
  assert.match(html, /aria-label="Bereiche der allgemeinen Einstellungen"/);
  for (const target of ["settings-account", "settings-data-sync", "settings-about"]) assert.match(html, new RegExp(`href="#${target}"`));
  assert.match(html, /data-in-page-navigation="desktop"/);
  assert.match(html, /data-in-page-navigation="compact"/);
  assert.doesNotMatch(html, /min-h-28|Alle Bereiche|\d+\s*\/\s*\d+/);
  assert.match(html, />Karteneinstellungen</);
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

test("general settings do not contain global card settings", () => {
  const html = renderSettings();
  assert.doesNotMatch(html, /Neuer Tag beginnt|Lernkarten vorziehen|Wochenrhythmus|Simulator|Pomodoro-Timer/);
});

test("data settings omit the removed CoRe JSON portability controls", () => {
  const html = renderSettings();
  assert.doesNotMatch(html, /Export herunterladen|Roh-JSON anzeigen|JSON importieren|portable-import-json/);
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
