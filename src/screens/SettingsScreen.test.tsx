import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { createConflictImpactPreview } from "./SyncConflictPanel.tsx";

type GeneralSection = React.ComponentProps<typeof SettingsScreen>["section"];

function renderSettings(section: GeneralSection = "konto", sync: Pick<React.ComponentProps<typeof SettingsScreen>, "syncStatus" | "lastSyncedAt"> = { syncStatus: { status: "idle" } }) {
  const state = createCoreRepository().getState();
  const profile = { ...state.profile, email: "login@example.test", displayName: "Ada", timezone: "Europe/Berlin" };
  return renderToStaticMarkup(
    <SettingsScreen
      section={section}
      profile={profile}
      syncStatus={sync.syncStatus}
      lastSyncedAt={sync.lastSyncedAt}
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

test("general settings render exactly the requested dialog area without a page shell", () => {
  const headings = { konto: "Konto", daten: "Daten &amp; Synchronisierung", ueber: "Über uns" } as const;
  for (const [section, heading] of Object.entries(headings) as Array<[GeneralSection, string]>) {
    const html = renderSettings(section);
    assert.equal(html.match(/<h2 /g)?.length, 1);
    assert.match(html, new RegExp(`<h2[^>]*tabindex="-1"[^>]*>${heading}</h2>`));
    assert.doesNotMatch(html, /Allgemeine Einstellungen|data-in-page-navigation|>Lerneinstellungen</);
  }
});

test("about settings contain help, legal placeholders, and the only visible version slot", () => {
  const html = renderSettings("ueber");
  assert.match(html, />Info-Seite öffnen</);
  for (const text of ["Über CoRe", "Impressum", "Datenschutzerklärung"]) assert.match(html, new RegExp(`>${text}<`));
  assert.equal(html.match(/>In Vorbereitung</g)?.length, 2);
  assert.match(html, /aria-label="Aktuelle Version">v0\.0\.0</);
  assert.equal(html.match(/v0\.0\.0/g)?.length, 1);
});

test("account settings show the login e-mail read-only in one wide panel", () => {
  const html = renderSettings();
  assert.match(html, /Login-E-Mail/);
  assert.match(html, /readOnly=""[^>]*value="login@example\.test"/);
  assert.doesNotMatch(html, /xl:grid-cols-\[1fr_0\.8fr\]/);
});

test("general settings do not contain global card settings", () => {
  for (const section of ["konto", "daten", "ueber"] as const) {
    assert.doesNotMatch(renderSettings(section), /Neuer Tag beginnt|Lernkarten vorziehen|Wochenrhythmus|Simulator|Pomodoro-Timer/);
  }
});

test("the conflict panel is a focusable deep-link target inside data and sync", () => {
  const html = renderSettings("daten");
  const dataSection = html.match(/<section id="settings-data-sync"[\s\S]*/)?.[0] ?? "";
  assert.match(dataSection, /<section id="settings-sync-conflicts" aria-labelledby="settings-sync-conflicts-heading"/);
  assert.match(dataSection, /<h3 id="settings-sync-conflicts-heading" tabindex="-1"[^>]*>Änderungskonflikte lösen<\/h3>/);
  assert.doesNotMatch(dataSection, /core-surface-raised|rounded-panel/);
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

test("the last successful sync stays visible while changes are pending", () => {
  const html = renderSettings("daten", { syncStatus: { status: "pending", message: "", pendingCount: 3 }, lastSyncedAt: "2026-10-12T08:30:00.000Z" });
  assert.match(html, /Zuletzt erfolgreich: /);
  assert.match(html, /Ausstehende Änderungen: 3/);
});

test("automatic sync offers its fixed intervals as segments", () => {
  const html = renderSettings("daten");
  const group = html.slice(html.indexOf('aria-label="Intervall der automatischen Synchronisierung"'));
  for (const label of ["Aus", "1", "5", "15", "30"]) assert.match(group, new RegExp(`class="core-segmented-control-option">${label}</button>`));
  assert.match(html, /data-testid="settings-sync-interval"/);
});
