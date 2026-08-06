import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMenuModel } from "../menuModel.ts";
import { AppNavigation } from "./AppNavigation.tsx";

const navigationItems = createMenuModel().listNavigationItems();

function renderNavigation(activeView = "uebersicht", simulationDayOffset = 0) {
  return renderToStaticMarkup(
    <AppNavigation
      navigationItems={navigationItems}
      activeView={activeView}
      displayName="Ada"
      simulationDayOffset={simulationDayOffset}
      simulationDateLabel="Sonntag, 9. August 2026"
      onNavigate={() => undefined}
      onResetSimulation={() => undefined}
    />,
  );
}

test("app navigation exposes a desktop sidebar and the five mobile tabs", () => {
  const markup = renderNavigation("kartenstapel");

  assert.match(markup, /data-navigation-layout="sidebar"/);
  assert.match(markup, /data-navigation-layout="mobile-header"/);
  assert.match(markup, /data-navigation-layout="bottom-bar"/);
  assert.match(markup, /hidden border-r[^\"]*md:block/);
  assert.match(markup, /md:hidden/);
  for (const label of ["Heute", "Lernen", "Erstellen", "Statistik", "Mehr"]) assert.match(markup, new RegExp(`>${label}<`));
  assert.match(markup, /aria-label="Kartenverwaltung öffnen"[^>]*aria-current="page"/);
  assert.match(markup, /left-\[50dvw\]/);
  assert.match(markup, /w-\[calc\(100dvw-4rem\)\]/);
  assert.match(markup, /sm:w-\[calc\(100dvw-6rem\)\]/);
  assert.match(markup, /bottom:max\(0\.75rem, env\(safe-area-inset-bottom\)\)/);
});

test("settings, help and simulator share the active utility entry", () => {
  for (const view of ["einstellungen", "hilfe", "simulator"]) {
    const markup = renderNavigation(view);
    assert.equal((markup.match(/aria-label="Einstellungen öffnen"[^>]*aria-current="page"/g) ?? []).length, 2);
  }
});

test("active simulation remains visible in both navigation layouts", () => {
  const markup = renderNavigation("uebersicht", 3);

  assert.match(markup, /Simulation aktiv/);
  assert.match(markup, /Simulation · Sonntag, 9\. August 2026 · \+3 Tage/);
  assert.equal((markup.match(/data-reset-simulation="true"/g) ?? []).length, 2);
});
