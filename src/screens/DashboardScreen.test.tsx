import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreCard, createCoreDeck } from "../coreModel.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { createViewRoute } from "../appNavigation.ts";
import { DashboardScreen } from "./DashboardScreen.tsx";

test("empty dashboard offers only explicit first-learning paths without seeded statistics", () => {
  const state = createCoreRepository(null, { seedDefaultDecks: false }).getState();
  const markup = renderToStaticMarkup(
    <DashboardScreen
      state={state}
      onNavigate={() => createViewRoute("uebersicht")}
      onStartDeck={() => undefined}
      onCreateDemo={async () => null}
      onMoveDeck={() => null}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(markup, /Willkommen bei CoRe/);
  assert.doesNotMatch(markup, />Heute<\//);
  assert.match(markup, /Anki-Stapel importieren/);
  assert.match(markup, /Erste Karte erstellen/);
  assert.match(markup, /Demo ausprobieren/);
  assert.match(markup, /Zeitlich passend wiederholen\./);
  assert.match(markup, /Später anders formuliert prüfen\./);
  assert.match(markup, /Original und Quelle bleiben sichtbar\./);
  assert.doesNotMatch(markup, /Noemi|Guten Morgen|Lern-Heatmap|Aktive Stapel/);
});

test("populated dashboard keeps today's due count without the original-card statistic", () => {
  const baseState = createCoreRepository(null, { seedDefaultDecks: false }).getState();
  const deck = createCoreDeck({
    name: "Biologie",
    source: "manual",
    cards: [
      createCoreCard({
        source: "manual",
        originalFront: "Was ist ATP?",
        originalBack: "Ein Energieträger.",
        reviewState: { dueAt: "2026-01-01T00:00:00.000Z" },
      }),
    ],
  });
  const markup = renderToStaticMarkup(
    <DashboardScreen
      state={{
        ...baseState,
        profile: { ...baseState.profile, displayName: "  Noemi  " },
        decks: [deck],
      }}
      onNavigate={() => createViewRoute("uebersicht")}
      onStartDeck={() => undefined}
      onCreateDemo={async () => null}
      onMoveDeck={() => null}
      onOpenDeckSettings={() => undefined}
    />,
  );

  assert.match(markup, /Willkommen zurück, Noemi!/);
  assert.doesNotMatch(markup, />Heute<\//);
  assert.match(markup, /Heute fällig/);
  assert.match(markup, /Heute fällig:<\/span><span class="font-semibold">1<\/span>/);
  assert.doesNotMatch(markup, /Originalkarten/);
  assert.match(markup, /Lernen öffnen/);
  assert.match(markup, /<button[^>]*aria-label="Biologie lernen"/);
  assert.doesNotMatch(markup, />Lernen <svg/);
  assert.match(markup, /data-deck-count="new"/);
  assert.match(markup, /data-deck-count="due"/);
  assert.match(markup, /data-deck-count="total"/);
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /Stapeloptionen für Biologie/);
  assert.match(markup, /conic-gradient/);
  assert.doesNotMatch(markup, /aktive Tage/i);
  assert.match(markup, /Weniger[\s\S]*Frühere Wochen anzeigen/);
  assert.match(markup, /grid-template-columns:2\.25rem repeat\(53, 19px\)/);
  assert.match(markup, /size-\[19px\] rounded-\[4px\]/);
  assert.match(markup, /ring-2 ring-inset ring-core-focus/);
});
