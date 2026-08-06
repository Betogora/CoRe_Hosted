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
      now="2026-08-06T10:00:00.000Z"
      onNavigate={() => createViewRoute("uebersicht")}
      onStartDeck={() => undefined}
      onCreateDemo={async () => null}
      onSetDeckCoreMode={() => undefined}
      onMoveDeck={() => null}
      onOpenDeckSettings={() => undefined}
      onSetDeckExpanded={() => undefined}
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
      now="2026-08-06T10:00:00.000Z"
      onNavigate={() => createViewRoute("uebersicht")}
      onStartDeck={() => undefined}
      onCreateDemo={async () => null}
      onSetDeckCoreMode={() => undefined}
      onMoveDeck={() => null}
      onOpenDeckSettings={() => undefined}
      onSetDeckExpanded={() => undefined}
    />,
  );

  assert.match(markup, /Willkommen zurück, Noemi!/);
  assert.doesNotMatch(markup, />Heute<\//);
  assert.match(markup, /Heute fällig/);
  assert.match(markup, /Heute fällig:<\/span><span class="font-semibold">1<\/span>/);
  assert.doesNotMatch(markup, /Originalkarten/);
  assert.match(markup, /Alle ansehen/);
  assert.match(markup, /data-testid="dashboard-deck-list-header"/);
  assert.match(markup, /core-action-ghost/);
  assert.match(markup, /<button[^>]*aria-label="Biologie lernen"/);
  assert.doesNotMatch(markup, />Lernen <svg/);
  assert.match(markup, /data-deck-count="new"/);
  assert.match(markup, /data-deck-count="due"/);
  assert.match(markup, /data-deck-count="total"/);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.match(markup, /Stapeloptionen für Biologie/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Biologie"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /conic-gradient/);
  assert.doesNotMatch(markup, /aktive Tage/i);
  assert.match(markup, /Frühere Wochen anzeigen[\s\S]*data-testid="study-heatmap-grid"[\s\S]*data-testid="study-heatmap-legend"[\s\S]*Weniger/);
  assert.match(markup, /grid-template-columns:2\.25rem repeat\(53, 19px\)/);
  assert.match(markup, /size-\[19px\] rounded-\[4px\]/);
  assert.match(markup, /ring-2 ring-inset ring-core-focus/);
});

test("dashboard projects future due cards through the supplied learning time", () => {
  const baseState = createCoreRepository(null, { seedDefaultDecks: false }).getState();
  const deck = createCoreDeck({
    name: "Zukunft",
    source: "manual",
    cards: [
      createCoreCard({
        source: "manual",
        originalFront: "Wann bin ich fällig?",
        originalBack: "In drei Tagen.",
        reviewState: { state: "review", dueAt: "2026-08-09T09:00:00.000Z", repetitions: 2 },
      }),
    ],
  });
  const props = {
    state: { ...baseState, decks: [deck] },
    onNavigate: () => createViewRoute("uebersicht"),
    onStartDeck: () => undefined,
    onCreateDemo: async () => null,
    onSetDeckCoreMode: () => undefined,
    onMoveDeck: () => null,
    onOpenDeckSettings: () => undefined,
    onSetDeckExpanded: () => undefined,
  };

  const todayMarkup = renderToStaticMarkup(<DashboardScreen {...props} now="2026-08-06T10:00:00.000Z" />);
  const futureMarkup = renderToStaticMarkup(<DashboardScreen {...props} now="2026-08-09T10:00:00.000Z" />);

  assert.match(todayMarkup, /Heute fällig:<\/span><span class="font-semibold">0<\/span>/);
  assert.match(futureMarkup, /Heute fällig:<\/span><span class="font-semibold">1<\/span>/);
});
