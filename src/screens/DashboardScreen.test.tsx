import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreRepository } from "../coreRepository.ts";
import { DashboardScreen } from "./DashboardScreen.tsx";

test("empty dashboard offers only explicit first-learning paths without seeded statistics", () => {
  const state = createCoreRepository(null, { seedDefaultDecks: false }).getState();
  const markup = renderToStaticMarkup(
    <DashboardScreen
      state={state}
      onNavigate={() => undefined}
      onStartDeck={() => undefined}
      onCreateDemo={() => undefined}
    />,
  );

  assert.match(markup, /Willkommen bei CoRe/);
  assert.match(markup, /Anki-Stapel importieren/);
  assert.match(markup, /Erste Karte erstellen/);
  assert.match(markup, /Demo ausprobieren/);
  assert.match(markup, /Zeitlich passend wiederholen\./);
  assert.match(markup, /Später anders formuliert prüfen\./);
  assert.match(markup, /Original und Quelle bleiben sichtbar\./);
  assert.doesNotMatch(markup, /Noemi|Guten Morgen|Lern-Heatmap|Aktive Stapel/);
});
