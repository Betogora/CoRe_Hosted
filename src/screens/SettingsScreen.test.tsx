import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createViewRoute } from "../appNavigation.ts";
import { createCoreRepository } from "../coreRepository.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { bindFieldTimingsAccount, finishFieldTiming, startFieldTiming } from "../fieldTimings.ts";
import { WorkspaceStoreContext } from "../useWorkspaceStore.ts";
import { createWorkspaceStore } from "../workspaceStore.ts";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { createConflictImpactPreview } from "./SyncConflictPanel.tsx";

type GeneralSection = React.ComponentProps<typeof SettingsScreen>["section"];

function renderSettings(section: GeneralSection = "konto", sync: { syncStatus: SyncStatus; lastSyncedAt?: string } = { syncStatus: { status: "idle" } }) {
  const state = createCoreRepository().getState();
  const profile = { ...state.profile, email: "login@example.test", displayName: "Ada", timezone: "Europe/Berlin" };
  const store = createWorkspaceStore();
  if (sync.lastSyncedAt) store.set({ syncStatus: { status: "saved", message: "Synchronisiert.", savedAt: sync.lastSyncedAt } });
  store.set({ syncStatus: sync.syncStatus });
  return renderToStaticMarkup(
    <WorkspaceStoreContext.Provider value={store}><SettingsScreen
      section={section}
      profile={profile}
      onSaveSettings={() => profile}
      onDraftStateChange={() => undefined}
      onSyncNow={async () => undefined}
      onListConflicts={async () => []}
      onResolveConflict={async () => undefined}
      onSignOut={async () => undefined}
      onNavigate={() => createViewRoute("uebersicht")}
    /></WorkspaceStoreContext.Provider>,
  );
}

test("general settings render exactly the requested dialog area without a page shell", () => {
  const headings = { konto: "Konto", darstellung: "Darstellung", daten: "Daten &amp; Synchronisierung", ueber: "Über uns" } as const;
  for (const [section, heading] of Object.entries(headings) as Array<[GeneralSection, string]>) {
    const html = renderSettings(section);
    assert.equal(html.match(/<h2 /g)?.length, 1);
    assert.match(html, new RegExp(`<h2[^>]*tabindex="-1"[^>]*>${heading}</h2>`));
    assert.doesNotMatch(html, /Allgemeine Einstellungen|>Lerneinstellungen</);
  }
});

test("appearance settings pick the heatmap color with the shared color picker", () => {
  const html = renderSettings("darstellung");
  assert.match(html, />Heatmap-Farbe</);
  assert.match(html, /aria-label="Heatmap-Farbe ändern"[^>]*><span[^>]*background-color:#b55b43/);
});

test("appearance settings choose the deck view shared by Heute and Lernen", () => {
  const group = renderSettings("darstellung").match(/<div role="group" aria-label="Stapelansicht".*?<\/div>/)?.[0] ?? "";
  assert.match(group, /aria-pressed="true"[^>]*>Liste</);
  assert.match(group, /aria-pressed="false"[^>]*>Kacheln</);
});

test("about settings contain help, legal placeholders, and the only visible version slot", () => {
  const html = renderSettings("ueber");
  assert.match(html, />Info-Seite öffnen</);
  for (const text of ["Über CoRe", "Impressum", "Datenschutzerklärung"]) assert.match(html, new RegExp(`>${text}<`));
  assert.equal(html.match(/>In Vorbereitung</g)?.length, 2);
  assert.match(html, /aria-label="Aktuelle Version">v0\.0\.0</);
  assert.equal(html.match(/v0\.0\.0/g)?.length, 1);
});

test("about settings copy performance data only once the account has measurements", (context) => {
  context.after(() => bindFieldTimingsAccount(null));
  const copyButton = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Leistungsdaten kopieren/)?.[0] ?? "";
  bindFieldTimingsAccount("settings-test");
  assert.match(copyButton(renderSettings("ueber")), /disabled=""/);

  startFieldTiming("core:answer_shown");
  finishFieldTiming("card-frame");
  const button = copyButton(renderSettings("ueber"));
  assert.ok(button);
  assert.doesNotMatch(button, /disabled/);
  assert.doesNotMatch(renderSettings("konto"), /Leistungsdaten/);
});

test("account settings show the login e-mail read-only in one wide panel", () => {
  const html = renderSettings();
  assert.match(html, /Login-E-Mail/);
  assert.match(html, /readOnly=""[^>]*value="login@example\.test"/);
  assert.doesNotMatch(html, /xl:grid-cols-\[1fr_0\.8fr\]/);
  assert.match(html, /<button type="button" class="core-action-secondary core-action-destructive-secondary [^"]*">(?:(?!<\/button>).)*<span>Abmelden<\/span><\/button>/);
  assert.doesNotMatch(html, /core-action-destructive"|class="core-action-destructive /);
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
  assert.doesNotMatch(dataSection, /Derselbe Inhalt wurde an zwei Stellen/);
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

test("the sync state is one tag that keeps the last successful sync while changes are pending", () => {
  const state = (html: string) => html.match(/data-testid="settings-sync-state"[^>]*>([^<]*)</)?.[1] ?? "";
  assert.match(state(renderSettings("daten", { syncStatus: { status: "pending", message: "", pendingCount: 3 }, lastSyncedAt: "2026-10-12T08:30:00.000Z" })), /^3 ausstehend · zuletzt 12\.10\., \d\d:30$/);
  assert.match(state(renderSettings("daten", { syncStatus: { status: "saved", message: "", savedAt: "2026-10-12T08:30:00.000Z" } })), /^Synchronisiert · 12\.10\., \d\d:30$/);
  assert.equal(state(renderSettings("daten")), "Noch nicht synchronisiert");
  const offline = renderSettings("daten", { syncStatus: { status: "offline", message: "Offline. Zwei Änderungen bleiben vorgemerkt.", pendingCount: 2, nextRetryAt: null } });
  assert.equal(state(offline), "Offline · 2 ausstehend");
  assert.match(offline, /aria-label="Hinweis: Offline · 2 ausstehend"[\s\S]*?>Offline\. Zwei Änderungen bleiben vorgemerkt\.</);
  assert.doesNotMatch(offline, /core-settings-row-hint/);
});

test("the device storage shows its usage and marks only storage the browser may clear", () => {
  const render = (persisted: boolean, supported = true) => {
    const store = createWorkspaceStore();
    store.set({ storageStatus: supported ? { supported, persisted, usage: 1024 * 1024, quota: 1024 * 1024 * 1024 } : { supported, persisted, usage: null, quota: null } });
    return renderToStaticMarkup(
      <WorkspaceStoreContext.Provider value={store}><SettingsScreen section="daten" profile={createCoreRepository().getState().profile} onSaveSettings={() => null} onDraftStateChange={() => undefined} onSyncNow={async () => undefined} onListConflicts={async () => []} onResolveConflict={async () => undefined} onSignOut={async () => undefined} onNavigate={() => createViewRoute("uebersicht")} /></WorkspaceStoreContext.Provider>,
    );
  };
  assert.match(render(true), /data-testid="workspace-storage-status"[\s\S]*?<span class="core-settings-row-value">[^<]+ von [^<]+<\/span>/);
  assert.doesNotMatch(render(true), /Dauerhaft|Nicht dauerhaft/);
  assert.match(render(false), />Nicht dauerhaft<[\s\S]*?aria-label="Hinweis: Nicht dauerhaft"/);
  const unsupported = render(false, false);
  assert.match(unsupported, /<span class="core-settings-row-value">Nicht unterstützt<\/span>/);
  assert.doesNotMatch(unsupported, /Nicht dauerhaft/);
});

test("automatic sync offers its fixed intervals as segments", () => {
  const html = renderSettings("daten");
  const group = html.slice(html.indexOf('aria-label="Intervall der automatischen Synchronisierung"'));
  for (const label of ["Aus", "1 Min\\.", "5 Min\\.", "15 Min\\.", "30 Min\\."]) assert.match(group, new RegExp(`class="core-segmented-control-option">${label}</button>`));
  assert.match(html, /data-testid="settings-sync-interval"/);
});
