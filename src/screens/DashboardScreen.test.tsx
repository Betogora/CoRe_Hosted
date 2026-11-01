import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState } from "../coreModel.ts";
import { createCoreRepository } from "../coreRepository.ts";
import { createViewRoute } from "../appNavigation.ts";
import { DASHBOARD_WIDGETS } from "../dashboardWidgets.ts";
import { createExamPlan } from "../examPlanSettings.ts";
import { withGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { DashboardScreen } from "./DashboardScreen.tsx";
import { ExamDashboardWidget } from "./ExamDashboardWidget.tsx";
import type { ExamDailyTask } from "../coreTypes.ts";

function basicCard(deckId: string, { id, front = "Frage", back = "Antwort", review = {} }: { id?: string; front?: string; back?: string; review?: Record<string, unknown> } = {}) {
  const card = createBasicNote(deckId, front, back).cards[0];
  return { ...card, id: id ?? card.id, study: cardStudyFromReviewState(createReviewState(review)) };
}

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

test("exam checklist shows at most three tasks per exam, prioritizes open tasks and only offers expansion when needed", () => {
  const base = createCoreRepository().getState();
  const date = "2026-10-18";
  const exam = { ...createExamPlan(date, Array.from({ length: 7 }, (_, index) => `topic-${index}`)), id: "exam", name: "Patho", examDate: "2026-11-20" };
  const tasks: ExamDailyTask[] = Array.from({ length: 7 }, (_, index) => ({ id: `topic:exam:topic-${index}`, date, examId: exam.id, kind: "study", deckIds: [`topic-${index}`], cardIds: [`card-${index}`], capturedAt: `${date}T08:00:00Z`, completed: index < 4 ? "manual" : null }));
  const render = (dailyTasks: ExamDailyTask[], preview?: React.ComponentProps<typeof ExamDashboardWidget>["preview"]) => renderToStaticMarkup(<ExamDashboardWidget preview={preview} state={{ ...base, profile: withGlobalSchedulerPreferences(base.profile, { examPlanning: { exams: [exam], dailyTasks } }) }} now={`${date}T12:00:00Z`} onLoad={async () => ({ cards: [] })} onStart={async () => undefined} onSaveTasks={async () => undefined} onOpen={() => undefined} />);
  const markup = render(tasks);
  assert.equal((markup.match(/data-exam-todo=/g) ?? []).length, 3);
  for (const index of [4, 5, 6]) assert.match(markup, new RegExp(`data-exam-todo="topic:exam:topic-${index}"`));
  assert.doesNotMatch(markup, /data-exam-todo="topic:exam:topic-0"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /Alle 7 Aufgaben anzeigen/);
  for (const count of [0, 1, 3]) {
    const short = render(tasks.slice(0, count));
    assert.equal((short.match(/data-exam-todo=/g) ?? []).length, count);
    assert.doesNotMatch(short, /aria-expanded|Aufgaben anzeigen/);
  }
  for (const taskLimit of [0, 1, 2, 3, null]) {
    const compact = render(tasks, { taskLimit, onOpenTaskCountChange: () => undefined });
    assert.equal((compact.split("<details")[0].match(/data-exam-todo=/g) ?? []).length, taskLimit ?? 3);
    assert.match(compact, /Erledigt im Planer \(4\)/);
    assert.doesNotMatch(compact, /Alle 7 Aufgaben anzeigen/);
  }
});

test("empty dashboard offers only explicit first-learning paths without seeded statistics", () => {
  const state = createCoreRepository().getState();
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
  assert.match(markup, /Die Originalkarte bleibt erhalten\./);
  assert.doesNotMatch(markup, /Noemi|Guten Morgen|Lern-Heatmap|Aktive Stapel/);
});

test("populated dashboard shows the aggregated open daily learning overview", () => {
  const baseState = createCoreRepository().getState();
  const deck = createCoreDeck({
    id: "biologie",
    name: "Biologie",
    source: "manual",
    cards: [basicCard("biologie", { front: "Was ist ATP?", back: "Ein Energieträger.", review: { dueAt: "2026-01-01T00:00:00.000Z" } })],
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

  assert.match(markup, /<span aria-hidden="true"[^>]*>Willkommen zurück,<\/span>/);
  assert.match(markup, /<h2[^>]*data-screen-heading[^>]*><span class="sr-only">Willkommen zurück, <\/span><span class="core-dashboard-name">Noemi!<\/span><\/h2>/);
  assert.doesNotMatch(markup, />Heute<\//);
  assert.match(markup, /data-testid="daily-learning-overview" data-status="open"/);
  assert.match(markup, /Dein Lernen heute/);
  assert.match(markup, /data-testid="daily-learning-total">0 \/ 1 Karten/);
  assert.match(markup, /data-testid="dashboard-daily-progress"/);
  assert.match(markup, /aria-valuetext="Gelernt: 0 Karten, Neu: 1 Karte, Offen: 0 Karten, Fällig: 0 Karten"/);
  assert.match(markup, /<button[^>]*aria-label="Jetzt lernen"[^>]*>[\s\S]*?lucide-play/);
  assert.doesNotMatch(markup, />Jetzt lernen<|Plan ansehen|Plan für morgen ansehen/);
  for (const metric of ["learned", "new", "in-progress", "due"]) assert.match(markup, new RegExp(`data-daily-learning-metric="${metric}"`));
  assert.doesNotMatch(markup, /geschätzte Dauer|Dranbleiben lohnt sich|Für heute alles geschafft/);
  assert.match(markup, /data-testid="deck-summary-header"[^>]*aria-hidden="true"/);
  assert.match(markup, />Stapel<[\s\S]*>Neu<[\s\S]*>Offen<[\s\S]*>Fällig</);
  assert.doesNotMatch(markup, /Originalkarten/);
  assert.match(markup, /data-testid="dashboard-deck-list-header"/);
  assert.match(markup, /data-deck-view="list"/);
  assert.match(markup, /aria-label="Alle Stapel öffnen"/);
  assert.match(markup, /<button[^>]*aria-label="Biologie lernen"/);
  assert.doesNotMatch(markup, />Lernen <svg/);
  assert.match(markup, /data-deck-count="new"/);
  assert.match(markup, /data-deck-count="in-progress"/);
  assert.match(markup, /data-deck-count="due"/);
  assert.doesNotMatch(markup, /data-deck-count="total"/);
  const dailyOverview = markup.match(/<section[^>]*data-testid="daily-learning-overview"[\s\S]*?<\/section>/)?.[0];
  assert.ok(dailyOverview);
  assert.doesNotMatch(markup, /data-donut-|Gesamtfortschritt/);
  assert.doesNotMatch(markup, /aktive Tage/i);
  assert.match(markup, /0 Tage Streak/);
  assert.match(markup, /aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /Frühere sieben Tage anzeigen[\s\S]*data-testid="study-heatmap-grid"[\s\S]*data-testid="study-heatmap-legend"[\s\S]*Weniger/);
  assert.equal((markup.match(/data-heatmap-day=/g) ?? []).length, 7);
  assert.match(markup, /aspect-square w-full max-w-\[4\.5rem\] rounded-control/);
  assert.match(markup, /ring-\[3px\] ring-core-action/);
  assert.doesNotMatch(markup, /ring-inset/);
  for (let level = 0; level <= 4; level += 1) assert.match(markup, new RegExp(`core-heatmap-level-${level}`));
});

test("dashboard renders the default widget layout and keeps planner tasks inside todos", () => {
  const baseState = createCoreRepository().getState();
  const exam = { ...createExamPlan("2026-08-06", ["biologie"]), name: "Biologie" };
  const state = {
    ...baseState,
    decks: [createCoreDeck({ id: "biologie", name: "Biologie", source: "manual", cards: [basicCard("biologie")] })],
    profile: withGlobalSchedulerPreferences(baseState.profile, { examPlanning: { exams: [exam] } }),
  };
  const markup = renderToStaticMarkup(
    <DashboardScreen
      state={state}
      now="2026-08-06T10:00:00.000Z"
      {...dashboardCallbacks}
      onStartExamUnit={async () => undefined}
      onLoadExamPlanningData={async () => { throw new Error("Not used in static rendering"); }}
      onSaveExamTasks={async () => undefined}
    />,
  );
  assert.deepEqual([...markup.matchAll(/data-dashboard-widget="([^"]+)"/g)].map((match) => match[1]), DASHBOARD_WIDGETS.map((widget) => widget.id));
  assert.match(markup, /data-dashboard-widget="todos"[\s\S]*data-testid="dashboard-exam-unit"[\s\S]*data-dashboard-widget="heatmap"/);
});

test("dashboard projects future due cards through the supplied learning time", () => {
  const baseState = createCoreRepository().getState();
  const deck = createCoreDeck({
    id: "zukunft",
    name: "Zukunft",
    source: "manual",
    cards: [basicCard("zukunft", { front: "Wann bin ich fällig?", back: "In drei Tagen.", review: { state: "review", dueAt: "2026-08-09T09:00:00.000Z", repetitions: 2 } })],
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
  const baseState = createCoreRepository().getState();
  const completedCard = basicCard("completed-root", {
    id: "completed-today",
    review: {
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
      userId: "local-user",
      deckId: "completed-root",
      cardId: completedCard.id,
      variantId: null,
      rating: "good",
      answeredAt: "2026-08-06T09:00:00.000Z",
      responseTimeMs: null,
      schedulerBefore: { card: { state: "review" } },
      schedulerAfter: null,
      flags: {},
      createdAt: "2026-08-06T09:00:00.000Z",
    }],
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
  const baseState = createCoreRepository().getState();
  const deck = createCoreDeck({
    id: "waiting",
    name: "Warten",
    source: "manual",
    cards: [basicCard("waiting", { id: "waiting-card", review: { state: "learning", dueAt: "2026-08-06T12:00:00.000Z", reps: 1 } })],
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
  assert.match(markup, /<button[^>]*disabled=""[^>]*aria-label="Später weiterlernen"/);
  assert.doesNotMatch(markup, /Tagesziel erreicht/);
});

test("dashboard limits the shared deck tree to three roots and has no duplicate completed legend", () => {
  const baseState = createCoreRepository().getState();
  const decks = Array.from({ length: 7 }, (_, index) => createCoreDeck({ id: `preview-${index}`, name: `Stapel ${index}`, source: "manual", cards: [] }));
  const markup = renderToStaticMarkup(<DashboardScreen state={{ ...baseState, decks }} now="2026-08-06T10:00:00.000Z" {...dashboardCallbacks} />);
  assert.equal((markup.match(/data-testid="dashboard-deck-row-/g) ?? []).length, 3);
  assert.match(markup, /Alle 7 Hauptstapel ansehen/);
  assert.match(markup, /Alle Stapel öffnen/);
  assert.doesNotMatch(markup, /Geschafft|Grauer Balken: für heute abgeschlossen/);
  assert.equal((markup.match(/data-daily-learning-metric=/g) ?? []).length, 4);
  assert.match(markup, /Timer zurücksetzen/);
});

test("achieved dashboard offers additional new cards only when stock remains beyond the daily limit", () => {
  const baseState = createCoreRepository().getState();
  const extraDeck = createCoreDeck({
    id: "extra",
    name: "Zusatz",
    source: "manual",
    deckSettings: { newCardsPerDay: 0 },
    cards: [basicCard("extra", { id: "extra-card", review: { state: "new", dueAt: "2026-08-06T09:00:00.000Z", reps: 0 } })],
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
  assert.match(extraMarkup, /<button(?![^>]*disabled)[^>]*aria-label="Zusätzliche Karten lernen"/);
  assert.doesNotMatch(extraMarkup, /Plan ansehen|Plan für morgen ansehen/);
  assert.match(noExtraMarkup, /<button[^>]*disabled=""[^>]*aria-label="Zusätzliche Karten lernen"/);
});
