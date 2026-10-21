import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMenuModel } from "../menuModel.ts";
import { createPomodoroTimer, type PomodoroTimer } from "../pomodoroTimer.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { AppNavigation } from "./AppNavigation.tsx";

const navigationItems = createMenuModel().listNavigationItems();

function renderNavigation(activeView = "uebersicht", simulationOffsetMinutes = 0, pomodoroTimer: PomodoroTimer | null = null, syncStatus: SyncStatus = { status: "idle" }) {
  return renderToStaticMarkup(
    <AppNavigation
      navigationItems={navigationItems}
      activeView={activeView}
      simulationOffsetMinutes={simulationOffsetMinutes}
      simulationDateLabel="Sonntag, 9. August 2026"
      pomodoroTimer={pomodoroTimer}
      syncStatus={syncStatus}
      onSyncNow={() => undefined}
      onNavigate={() => undefined}
      onResetSimulation={() => undefined}
    />,
  );
}

test("sync action exposes the current state in both navigation layouts", () => {
  const saved = renderNavigation("uebersicht", 0, null, { status: "saved", message: "Synchronisiert.", savedAt: "2026-08-14T16:00:00.000Z" });
  assert.equal((saved.match(/aria-label="Synchronisiert – jetzt erneut synchronisieren"/g) ?? []).length, 2);

  const conflicted = renderNavigation("uebersicht", 0, null, { status: "conflict", message: "2 Änderungen brauchen deine Entscheidung.", conflictCount: 2 });
  assert.equal((conflicted.match(/aria-label="2 Synchronisierungskonflikte klären"/g) ?? []).length, 2);
  assert.equal((conflicted.match(/>2<\/span>/g) ?? []).length, 2);

  const singularConflict = renderNavigation("uebersicht", 0, null, { status: "conflict", message: "Eine Änderung braucht deine Entscheidung.", conflictCount: 1 });
  assert.equal((singularConflict.match(/aria-label="1 Synchronisierungskonflikt klären"/g) ?? []).length, 2);
});

test("app navigation exposes five primary entries and marks learning active for the hidden cards route", () => {
  const markup = renderNavigation("kartenstapel");
  const expectedTabOrder = ["Heute", "Lernen", "Prüfungen", "Erstellen", "Statistik"];

  assert.match(markup, /data-navigation-layout="top-bar"/);
  assert.match(markup, /data-navigation-layout="mobile-header"/);
  assert.match(markup, /data-navigation-layout="bottom-bar"/);
  assert.match(markup, /hidden min-w-0 px-2 pt-2 xl:block/);
  assert.match(markup, /grid h-16 grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\] items-center gap-4 rounded-panel border border-core-border bg-core-surface px-5 shadow-floating/);
  assert.match(markup, /xl:hidden/);
  assert.doesNotMatch(markup, /md:block|md:hidden/);
  for (const label of expectedTabOrder) assert.match(markup, new RegExp(`>${label}<`));
  const topBarNavigation = markup.match(/<header[^>]*data-navigation-layout="top-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (let index = 1; index < expectedTabOrder.length; index += 1) {
    assert.ok(topBarNavigation.indexOf(`>${expectedTabOrder[index - 1]}</span>`) < topBarNavigation.indexOf(`>${expectedTabOrder[index]}</span>`));
  }
  for (const label of expectedTabOrder) assert.match(topBarNavigation, new RegExp(`</svg><span>${label}</span>`));
  const bottomBarMarkup = markup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (let index = 1; index < expectedTabOrder.length; index += 1) {
    assert.ok(bottomBarMarkup.indexOf(`>${expectedTabOrder[index - 1]}</span>`) < bottomBarMarkup.indexOf(`>${expectedTabOrder[index]}</span>`));
  }
  assert.match(bottomBarMarkup, /grid-cols-5/);
  assert.doesNotMatch(bottomBarMarkup, /lucide-layers/);
  assert.doesNotMatch(bottomBarMarkup, />Karten<\/span>/);
  assert.doesNotMatch(bottomBarMarkup, />Mehr<\/span>/);
  assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 2);
  assert.match(bottomBarMarkup, /aria-current="page"[^>]*>[\s\S]*?>Lernen<\/span>/);
  assert.match(markup, /left-\[50dvw\]/);
  assert.match(markup, /w-\[calc\(100dvw-2rem\)\]/);
  assert.match(markup, /sm:w-\[calc\(100dvw-6rem\)\]/);
  assert.match(markup, /bg-\[var\(--core-selection-track\)\]/);
  assert.match(markup, /bottom:max\(0\.75rem, env\(safe-area-inset-bottom\)\)/);
});

test("CoRe brand links both navigation layouts to today", () => {
  const markup = renderNavigation("neue-karten");

  assert.equal((markup.match(/<button[^>]*data-navigation-brand="true"/g) ?? []).length, 2);
});

test("bottom navigation keeps every icon above its visible label and exactly one current page", () => {
  for (const activeView of ["uebersicht", "lernen", "neue-karten", "statistik"]) {
    const markup = renderNavigation(activeView);
    const bottomBar = markup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.equal((bottomBar.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((bottomBar.match(/flex-col/g) ?? []).length, 5);
    assert.equal((bottomBar.match(/aria-hidden="true"/g) ?? []).length, 5);
    assert.doesNotMatch(bottomBar, /sr-only/);
    for (const label of ["Heute", "Lernen", "Prüfungen", "Erstellen", "Statistik"]) assert.match(bottomBar, new RegExp(`</svg><span[^>]*>${label}</span>`));
  }
});

test("help and general settings have separate utility states while card settings stay in learning", () => {
  const settingsMarkup = renderNavigation("einstellungen");
  assert.equal((settingsMarkup.match(/<button[^>]*data-navigation-utility="settings"[^>]*aria-current="page"[^>]*>/g) ?? []).length, 2);
  assert.equal((settingsMarkup.match(/<button[^>]*data-navigation-utility="help"[^>]*aria-current="page"[^>]*>/g) ?? []).length, 0);

  for (const view of ["karten-einstellungen", "simulator"]) {
    const markup = renderNavigation(view);
    const bottomBarMarkup = markup.match(/<nav[^>]*data-navigation-layout="bottom-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.equal((markup.match(/data-navigation-utility="settings"[^>]*aria-current="page"/g) ?? []).length, 0);
    assert.match(bottomBarMarkup, /aria-current="page"[^>]*>[\s\S]*?>Lernen<\/span>/);
  }

  const helpMarkup = renderNavigation("hilfe");
  assert.equal((helpMarkup.match(/<button[^>]*data-navigation-utility="help"[^>]*aria-current="page"[^>]*>/g) ?? []).length, 2);
  assert.equal((helpMarkup.match(/<button[^>]*data-navigation-utility="settings"[^>]*aria-current="page"[^>]*>/g) ?? []).length, 0);
});

test("responsive navigation shares compact settings, theme and help actions without a profile preview", () => {
  const markup = renderNavigation();
  const topBarMarkup = markup.match(/<header[^>]*data-navigation-layout="top-bar"[\s\S]*?<\/header>/)?.[0] ?? "";
  const mobileHeaderMarkup = markup.match(/<header[^>]*data-navigation-layout="mobile-header"[\s\S]*?<\/header>/)?.[0] ?? "";

  assert.equal((markup.match(/data-navigation-utilities="true"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-label="Einstellungen öffnen"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-label="Hilfe öffnen"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-label="Dark Mode einschalten"/g) ?? []).length, 2);
  assert.equal((markup.match(/lucide-circle-help/g) ?? []).length, 2);
  assert.equal((markup.match(/lucide-sun/g) ?? []).length, 2);
  assert.doesNotMatch(topBarMarkup, /Content Repetition/);
  for (const layoutMarkup of [topBarMarkup, mobileHeaderMarkup]) {
    assert.match(layoutMarkup, /class="flex shrink-0 items-center gap-1\.5" data-navigation-utilities="true"/);
    assert.ok(layoutMarkup.indexOf('data-navigation-utility="sync"') < layoutMarkup.indexOf('data-navigation-utility="theme"'));
    assert.ok(layoutMarkup.indexOf('data-navigation-utility="theme"') < layoutMarkup.indexOf('data-navigation-utility="help"'));
    assert.ok(layoutMarkup.indexOf('data-navigation-utility="help"') < layoutMarkup.indexOf('data-navigation-utility="settings"'));
  }
  assert.ok(topBarMarkup.indexOf("</nav>") < topBarMarkup.indexOf('data-navigation-utilities="true"'));
  assert.equal((markup.match(/data-navigation-utility="theme"[^>]*class="core-action-ghost[^"]*size-control/g) ?? []).length, 2);
  assert.equal((markup.match(/data-navigation-utility="theme"[^>]*core-action-secondary/g) ?? []).length, 0);
  assert.doesNotMatch(markup, /role="switch"|aria-checked=/);
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
