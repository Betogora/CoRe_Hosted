import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMenuModel } from "../menuModel.ts";
import { createPomodoroTimer, type PomodoroTimer } from "../pomodoroTimer.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { WorkspaceStoreContext } from "../useWorkspaceStore.ts";
import { createWorkspaceStore } from "../workspaceStore.ts";
import { AppNavigation } from "./AppNavigation.tsx";
import type { ShellBack } from "./shellBack.ts";

const navigationItems = createMenuModel().listNavigationItems();

function renderNavigation(activeView = "uebersicht", simulationOffsetMinutes = 0, pomodoroTimer: PomodoroTimer | null = null, syncStatus: SyncStatus = { status: "idle" }, manualSync = false, settingsOpen = false, back: ShellBack | null = null) {
  const store = createWorkspaceStore();
  store.set({ syncStatus });
  return renderToStaticMarkup(
    <WorkspaceStoreContext.Provider value={store}><AppNavigation
      navigationItems={navigationItems}
      activeView={activeView}
      simulationOffsetMinutes={simulationOffsetMinutes}
      simulationDateLabel="Sonntag, 9. August 2026"
      pomodoroTimer={pomodoroTimer}
      manualSync={manualSync}
      onSyncNow={() => undefined}
      onOpenSyncSettings={() => undefined}
      settingsOpen={settingsOpen}
      onOpenSettings={() => undefined}
      onNavigate={() => undefined}
      onResetSimulation={() => undefined}
      back={back}
    /></WorkspaceStoreContext.Provider>,
  );
}

test("subpages turn the floating card into the docked bar with back and title, keeping both groups mounted", () => {
  const hub = renderNavigation();
  assert.equal((hub.match(/data-shell-mode="hub"/g) ?? []).length, 2);
  for (const group of hub.match(/<div class="core-shell-(brand|back)[^"]*"[^>]*>/g) ?? []) {
    assert.equal(group.includes("inert"), group.includes("core-shell-back"));
  }

  const app = renderNavigation("erstellen", 0, null, { status: "idle" }, false, false, { title: "Karte selbst erstellen", label: "Erstellen", onSelect: () => undefined });
  assert.equal((app.match(/data-shell-mode="app"/g) ?? []).length, 2);
  const groups = app.match(/<div class="core-shell-(brand|back)[^"]*"[^>]*>/g) ?? [];
  assert.equal(groups.length, 4);
  for (const group of groups) assert.equal(group.includes("inert"), group.includes("core-shell-brand"));
  assert.equal((app.match(/<button[^>]*aria-label="Zurück zu Erstellen"[^>]*>[\s\S]*?Karte selbst erstellen<\/span><\/button>/g) ?? []).length, 2);
  assert.equal((app.match(/<h1 class="core-shell-lead/g) ?? []).length, 2);

  const withIcon = renderNavigation("kartenstapel", 0, null, { status: "idle" }, false, false, { title: "Kapitel", label: "Lernen", icon: <span data-deck-icon="true" />, onSelect: () => undefined });
  assert.equal((withIcon.match(/<button[^>]*aria-label="Zurück zu Lernen"[^>]*>[\s\S]*?data-deck-icon="true"[\s\S]*?Kapitel<\/span><\/button>/g) ?? []).length, 2);
});

test("automatic sync stays out of the header until something needs attention", () => {
  for (const syncStatus of [
    { status: "idle" },
    { status: "saving", message: "Synchronisiert gerade." },
    { status: "pending", message: "Ausstehend.", pendingCount: 2 },
    { status: "saved", message: "Synchronisiert.", savedAt: "2026-08-14T16:00:00.000Z" },
  ] satisfies SyncStatus[]) {
    const markup = renderNavigation("uebersicht", 0, null, syncStatus);
    assert.doesNotMatch(markup, /data-navigation-utility="sync"/);
    assert.equal((markup.match(new RegExp(`data-navigation-utilities="true" data-sync-status="${syncStatus.status}"`, "g")) ?? []).length, 2);
  }

  const offline = renderNavigation("uebersicht", 0, null, { status: "offline", message: "Offline.", pendingCount: 1, nextRetryAt: null });
  assert.equal((offline.match(/aria-label="Offline – Synchronisierung ansehen"/g) ?? []).length, 2);
  assert.equal((offline.match(/lucide-cloud-off/g) ?? []).length, 2);

  const failed = renderNavigation("uebersicht", 0, null, { status: "error", message: "Fehler." });
  assert.equal((failed.match(/aria-label="Synchronisierung fehlgeschlagen – Details ansehen"/g) ?? []).length, 2);
  assert.equal((failed.match(/data-sync-status="error"/g) ?? []).length, 2);

  const conflicted = renderNavigation("uebersicht", 0, null, { status: "conflict", message: "2 Änderungen brauchen deine Entscheidung.", conflictCount: 2 });
  assert.equal((conflicted.match(/aria-label="2 Synchronisierungskonflikte klären"/g) ?? []).length, 2);
  assert.equal((conflicted.match(/>2<\/span>/g) ?? []).length, 2);

  const singularConflict = renderNavigation("uebersicht", 0, null, { status: "conflict", message: "Eine Änderung braucht deine Entscheidung.", conflictCount: 1 });
  assert.equal((singularConflict.match(/aria-label="1 Synchronisierungskonflikt klären"/g) ?? []).length, 2);
});

test("manual sync keeps a direct sync action that marks pending changes", () => {
  const saved = renderNavigation("uebersicht", 0, null, { status: "saved", message: "Synchronisiert.", savedAt: "2026-08-14T16:00:00.000Z" }, true);
  assert.equal((saved.match(/aria-label="Jetzt synchronisieren"/g) ?? []).length, 2);
  assert.doesNotMatch(saved, /<\/button><span[^>]*aria-hidden="true"><\/span>/);

  const pending = renderNavigation("uebersicht", 0, null, { status: "pending", message: "Ausstehend.", pendingCount: 2 }, true);
  assert.equal((pending.match(/aria-label="Ausstehende Änderungen synchronisieren"/g) ?? []).length, 2);
  assert.equal((pending.match(/aria-label="Ausstehende Änderungen synchronisieren"[^>]*>[\s\S]*?<\/button><span[^>]*aria-hidden="true"><\/span>/g) ?? []).length, 2);

  const saving = renderNavigation("uebersicht", 0, null, { status: "saving", message: "Synchronisiert gerade." }, true);
  assert.equal((saving.match(/<button[^>]*disabled=""[^>]*aria-label="Synchronisiert gerade"|<button[^>]*aria-label="Synchronisiert gerade"[^>]*disabled=""/g) ?? []).length, 2);
});

test("app navigation exposes five primary entries and marks card management as its own tab", () => {
  const markup = renderNavigation("kartenstapel");
  const expectedTabOrder = ["Heute", "Lernen", "Erstellen", "Karten", "Prüfung"];

  assert.match(markup, /data-navigation-layout="top-bar"/);
  assert.match(markup, /data-navigation-layout="mobile-header"/);
  assert.match(markup, /data-navigation-layout="bottom-bar"/);
  const topBarNavigation = markup.match(/<header[^>]*data-navigation-layout="top-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (let index = 1; index < expectedTabOrder.length; index += 1) {
    assert.ok(topBarNavigation.indexOf(`>${expectedTabOrder[index - 1]}</span>`) < topBarNavigation.indexOf(`>${expectedTabOrder[index]}</span>`));
  }
  for (const label of expectedTabOrder) assert.match(topBarNavigation, new RegExp(`</svg><span>${label}</span>`));
  const bottomBarMarkup = markup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (const label of expectedTabOrder) assert.equal((bottomBarMarkup.match(new RegExp(`>${label}</span>`, "g")) ?? []).length, 1);
  for (let index = 1; index < expectedTabOrder.length; index += 1) {
    assert.ok(bottomBarMarkup.indexOf(`>${expectedTabOrder[index - 1]}</span>`) < bottomBarMarkup.indexOf(`>${expectedTabOrder[index]}</span>`));
  }
  assert.equal((bottomBarMarkup.match(/<button/g) ?? []).length, 5);
  assert.match(bottomBarMarkup, /lucide-layers/);
  assert.doesNotMatch(markup, />Statistik</);
  assert.doesNotMatch(bottomBarMarkup, />Mehr<\/span>/);
  assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 2);
  assert.match(topBarNavigation, /aria-current="page"[^>]*>[\s\S]*?>Karten<\/span>/);
  assert.match(bottomBarMarkup, /aria-current="page"[^>]*>[\s\S]*?>Karten<\/span>/);
  assert.match(markup, /bottom:max\(0\.75rem, env\(safe-area-inset-bottom\)\)/);
});

test("CoRe brand links both navigation layouts to today", () => {
  const markup = renderNavigation("neue-karten");

  const brandButtons = markup.match(/<button[^>]*data-navigation-brand="true"[\s\S]*?<\/button>/g) ?? [];
  assert.equal(brandButtons.length, 2);
  for (const brand of brandButtons) {
    assert.match(brand, /<img src="\/core-brain\.svg" alt=""/);
    assert.equal(brand.replace(/<[^>]+>/g, ""), "CoRe");
  }
});

test("bottom navigation keeps every icon before its visible label and exactly one current page", () => {
  for (const activeView of ["uebersicht", "lernen", "neue-karten", "kartenstapel", "pruefungen"]) {
    const markup = renderNavigation(activeView);
    const bottomBar = markup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.equal((bottomBar.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((bottomBar.match(/aria-hidden="true"/g) ?? []).length, 5);
    assert.doesNotMatch(bottomBar, /sr-only/);
    for (const label of ["Heute", "Lernen", "Erstellen", "Karten", "Prüfung"]) assert.match(bottomBar, new RegExp(`</svg><span[^>]*>${label}</span>`));
  }
});

test("the menu button marks an open settings dialog or a menu page while the bottom bar keeps its main target", () => {
  const activeMenuButtons = (markup: string) => (markup.match(/<button[^>]*data-navigation-utility="menu"[^>]*>/g) ?? []).filter((button) => button.includes("!text-core-action")).length;
  const settingsMarkup = renderNavigation("lernen", 0, null, { status: "idle" }, false, true);
  const settingsBottomBar = settingsMarkup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.equal(activeMenuButtons(settingsMarkup), 2);
  assert.match(settingsBottomBar, /aria-current="page"[^>]*>[\s\S]*?>Lernen<\/span>/);
  assert.equal(activeMenuButtons(renderNavigation("lernen")), 0);
  assert.equal(activeMenuButtons(renderNavigation("statistik")), 2);
  assert.equal(activeMenuButtons(renderNavigation("hilfe")), 2);
  assert.equal((renderNavigation("statistik").match(/aria-current="page"/g) ?? []).length, 0);

  const simulatorMarkup = renderNavigation("simulator");
  const bottomBarMarkup = simulatorMarkup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.match(bottomBarMarkup, /aria-current="page"[^>]*>[\s\S]*?>Lernen<\/span>/);
});

test("responsive navigation keeps sync and one menu button as its only utilities", () => {
  const markup = renderNavigation("uebersicht", 0, null, { status: "idle" }, true);
  const topBarMarkup = markup.match(/<header[^>]*data-navigation-layout="top-bar"[\s\S]*?<\/header>/)?.[0] ?? "";
  const mobileHeaderMarkup = markup.match(/<header[^>]*data-navigation-layout="mobile-header"[\s\S]*?<\/header>/)?.[0] ?? "";

  assert.equal((markup.match(/data-navigation-utilities="true"/g) ?? []).length, 2);
  const menuButtons = markup.match(/<button[^>]*data-navigation-utility="menu"[^>]*>/g) ?? [];
  assert.equal(menuButtons.length, 2);
  for (const button of menuButtons) assert.match(button, /aria-label="Menü"/);
  assert.doesNotMatch(markup, /Einstellungen öffnen|Hilfe öffnen|Statistik öffnen|Mode einschalten|data-navigation-utility="(theme|statistics|help|settings)"/);
  assert.doesNotMatch(topBarMarkup, /Content Repetition/);
  for (const layoutMarkup of [topBarMarkup, mobileHeaderMarkup]) {
    assert.match(layoutMarkup, /data-navigation-utilities="true" data-sync-status="idle"/);
    assert.ok(layoutMarkup.indexOf('data-navigation-utility="sync"') < layoutMarkup.indexOf('data-navigation-utility="menu"'));
  }
  assert.ok(topBarMarkup.indexOf("</nav>") < topBarMarkup.indexOf('data-navigation-utilities="true"'));
  assert.doesNotMatch(markup, />Ada<|>AD</);
});

test("active simulation remains visible in both navigation layouts", () => {
  const markup = renderNavigation("uebersicht", 3 * 24 * 60);

  assert.equal((markup.match(/Simulation · Sonntag, 9\. August 2026 · \+3 Tage/g) ?? []).length, 2);
  assert.equal((markup.match(/data-reset-simulation="true"/g) ?? []).length, 2);

  const minuteMarkup = renderNavigation("uebersicht", 10);
  assert.match(minuteMarkup, /\+10 Minuten/);
});

test("active Pomodoro timer appears in the desktop top bar and mobile header", () => {
  const timer = createPomodoroTimer(25, Date.now(), "pomodoro_navigation");
  assert.ok(timer);
  const markup = renderNavigation("uebersicht", 0, timer);

  assert.equal((markup.match(/data-pomodoro-progress="header"/g) ?? []).length, 2);
  assert.equal((markup.match(/Noch 25 Min\./g) ?? []).length, 4);
});
