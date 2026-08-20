import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreCard, createCoreDeck } from "../coreModel.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { createViewRoute } from "../appNavigation.ts";
import { DashboardScreen } from "./DashboardScreen.tsx";

const dashboardCallbacks = {
  onNavigate: () => createViewRoute("uebersicht"),
  onStartDeck: () => undefined,
  onStartAdditionalCards: () => ({ ok: true }),
  onCreateDemo: async () => null,
  onSetDeckCoreMode: () => undefined,
  onMoveDeck: () => null,
  onOpenDeckSettings: () => undefined,
  onSetDeckExpanded: () => undefined,
};

test("empty dashboard offers only explicit first-learning paths without seeded statistics", () => {
  const state = createCoreRepository({ seedDefaultDecks: false }).getState();
  const markup = renderToStaticMarkup(
    <DashboardScreen
      state={state}
      now="2026-08-06T10:00:00.000Z"
      {...dashboardCallbacks}
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

test("populated dashboard shows the aggregated open daily learning overview", () => {
  const baseState = createCoreRepository({ seedDefaultDecks: false }).getState();
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
      {...dashboardCallbacks}
    />,
  );

  assert.match(markup, /Willkommen zurück, Noemi!/);
  assert.doesNotMatch(markup, />Heute<\//);
  assert.match(markup, /data-testid="daily-learning-overview" data-status="open"/);
  assert.match(markup, /Dein Lernen heute/);
  assert.match(markup, /data-testid="daily-learning-total">0 \/ 1 Karten/);
  assert.match(markup, /data-testid="dashboard-daily-progress"/);
  assert.match(markup, /aria-valuetext="Gelernt: 0 Karten, Neu: 1 Karte, Offen: 0 Karten, Fällig: 0 Karten"/);
  assert.match(markup, />Jetzt lernen<\//);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>[\s\S]*Plan ansehen/);
  for (const metric of ["learned", "new", "in-progress", "due"]) assert.match(markup, new RegExp(`data-daily-learning-metric="${metric}"`));
  assert.doesNotMatch(markup, /geschätzte Dauer|Dranbleiben lohnt sich|Für heute alles geschafft/);
  assert.match(markup, /data-testid="deck-summary-header"[^>]*aria-hidden="true"/);
  assert.match(markup, />Stapel<[\s\S]*>Neu<[\s\S]*>Offen<[\s\S]*>Fällig</);
  assert.doesNotMatch(markup, /Originalkarten/);
  assert.match(markup, /Alle ansehen/);
  assert.match(markup, /whitespace-nowrap[^\"]*rounded-xl[^>]*>Alle ansehen/);
  assert.match(markup, /data-testid="dashboard-deck-list-header"/);
  assert.match(markup, /core-action-ghost/);
  assert.match(markup, /<button[^>]*aria-label="Biologie lernen"/);
  assert.doesNotMatch(markup, />Lernen <svg/);
  assert.match(markup, /data-deck-count="new"/);
  assert.match(markup, /data-deck-count="in-progress"/);
  assert.match(markup, /data-deck-count="due"/);
  assert.doesNotMatch(markup, /data-deck-count="total"/);
  assert.match(markup, /data-deck-drag-source="true"/);
  assert.match(markup, /Stapeloptionen für Biologie/);
  assert.match(markup, /data-core-tooltip="Stapeloptionen für Biologie"/);
  assert.match(markup, /lucide-ellipsis/);
  assert.match(markup, /data-donut-segment="new"/);
  assert.match(markup, /Gesamtfortschritt für Biologie:/);
  assert.doesNotMatch(markup, /aktive Tage/i);
  assert.match(markup, /0 Tage Streak/);
  assert.match(markup, /aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /Frühere sieben Tage anzeigen[\s\S]*data-testid="study-heatmap-grid"[\s\S]*data-testid="study-heatmap-legend"[\s\S]*Weniger/);
  assert.equal((markup.match(/data-heatmap-day=/g) ?? []).length, 7);
  assert.match(markup, /aspect-square w-full max-w-\[4\.5rem\] rounded-xl/);
  assert.match(markup, /ring-\[3px\] ring-core-action/);
  assert.doesNotMatch(markup, /ring-inset/);
  for (let level = 0; level <= 4; level += 1) assert.match(markup, new RegExp(`core-heatmap-level-${level}`));
});

test("dashboard projects future due cards through the supplied learning time", () => {
  const baseState = createCoreRepository({ seedDefaultDecks: false }).getState();
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
    ...dashboardCallbacks,
  };

  const todayMarkup = renderToStaticMarkup(<DashboardScreen {...props} now="2026-08-06T10:00:00.000Z" />);
  const futureMarkup = renderToStaticMarkup(<DashboardScreen {...props} now="2026-08-09T10:00:00.000Z" />);

  assert.match(todayMarkup, /data-status="achieved"/);
  assert.match(todayMarkup, /data-testid="daily-learning-total">0 \/ 0 Karten/);
  assert.match(todayMarkup, /data-study-progress-segment="achieved"/);
  assert.match(futureMarkup, /data-status="open"/);
  assert.match(futureMarkup, /data-testid="daily-learning-total">0 \/ 1 Karten/);
  assert.match(futureMarkup, /Fällig:[^,\"]*1 Karte/);
});

test("achieved dashboard keeps today's completed cards in the total and success bar", () => {
  const baseState = createCoreRepository({ seedDefaultDecks: false }).getState();
  const completedCard = createCoreCard({
    id: "completed-today",
    source: "manual",
    reviewState: {
      state: "review",
      dueAt: "2026-08-07T10:00:00.000Z",
      lastReviewedAt: "2026-08-06T09:00:00.000Z",
      repetitions: 2,
    },
  });
  const deck = createCoreDeck({
    id: "completed-root",
    name: "Erledigt",
    source: "manual",
    cards: [completedCard],
    reviewEvents: [{
      id: "completed-event",
      deckId: "completed-root",
      learningItemId: completedCard.id,
      rating: "good",
      answeredAt: "2026-08-06T09:00:00.000Z",
      schedulerBefore: { card: { state: "review" } },
    }] as any,
  });

  const markup = renderToStaticMarkup(
    <DashboardScreen state={{ ...baseState, decks: [deck] }} now="2026-08-06T10:00:00.000Z" {...dashboardCallbacks} />,
  );

  assert.match(markup, /data-status="achieved"/);
  assert.match(markup, /data-testid="daily-learning-total">1 \/ 1 Karten/);
  assert.match(markup, /data-daily-learning-metric="learned"[\s\S]*?<dd[^>]*>1<\/dd>/);
  assert.match(markup, /data-study-progress-segment="achieved"/);
  assert.doesNotMatch(markup, /Keine Karten mehr fällig|Für heute alles geschafft|benötigte Zeit/);
});

test("dashboard keeps later same-day learning steps in a disabled waiting state", () => {
  const baseState = createCoreRepository({ seedDefaultDecks: false }).getState();
  const deck = createCoreDeck({
    id: "waiting",
    name: "Warten",
    source: "manual",
    cards: [createCoreCard({
      id: "waiting-card",
      source: "manual",
      reviewState: { state: "learning", dueAt: "2026-08-06T12:00:00.000Z", reps: 1 },
    })],
  });
  const markup = renderToStaticMarkup(
    <DashboardScreen
      state={{ ...baseState, decks: [deck] }}
      now="2026-08-06T10:00:00.000Z"
      {...dashboardCallbacks}
    />,
  );

  assert.match(markup, /data-status="waiting"/);
  assert.match(markup, /Offen: 1 Karte/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>[\s\S]*Später weiterlernen/);
  assert.doesNotMatch(markup, /Tagesziel erreicht/);
});

test("achieved dashboard offers additional new cards only when stock remains beyond the daily limit", () => {
  const baseState = createCoreRepository({ seedDefaultDecks: false }).getState();
  const extraDeck = createCoreDeck({
    id: "extra",
    name: "Zusatz",
    source: "manual",
    deckSettings: { newCardsPerDay: 0 },
    cards: [createCoreCard({ id: "extra-card", source: "manual", reviewState: { state: "new", dueAt: "2026-08-06T09:00:00.000Z", reps: 0 } })],
  });
  const noExtraDeck = createCoreDeck({
    id: "no-extra",
    name: "Ohne Zusatz",
    source: "manual",
    deckSettings: { newCardsPerDay: 0 },
    cards: [],
  });
  const extraMarkup = renderToStaticMarkup(<DashboardScreen state={{ ...baseState, decks: [extraDeck] }} now="2026-08-06T10:00:00.000Z" {...dashboardCallbacks} />);
  const noExtraMarkup = renderToStaticMarkup(<DashboardScreen state={{ ...baseState, decks: [noExtraDeck] }} now="2026-08-06T10:00:00.000Z" {...dashboardCallbacks} />);

  assert.match(extraMarkup, /Tagesziel erreicht/);
  assert.match(extraMarkup, /<button(?![^>]*disabled)[^>]*>[\s\S]*Zusätzliche Karten lernen/);
  assert.match(extraMarkup, /Plan für morgen ansehen/);
  assert.match(noExtraMarkup, /<button[^>]*disabled=""[^>]*>[\s\S]*Zusätzliche Karten lernen/);
});
