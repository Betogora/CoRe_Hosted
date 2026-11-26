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
  frequentDeckIds: [],
  onSetPinnedDeckIds: () => undefined,
};

test("exam checklist shows at most three tasks per exam, prioritizes open tasks and only offers expansion when needed; the dashboard preview lists all open tasks", () => {
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
  assert.match(markup, /4 weitere anzeigen/);
  for (const count of [0, 1, 3]) {
    const short = render(tasks.slice(0, count));
    assert.equal((short.match(/data-exam-todo=/g) ?? []).length, count);
    assert.doesNotMatch(short, /aria-expanded|weitere anzeigen/);
  }
  const preview = render(tasks, true);
  assert.equal((preview.split("<details")[0].match(/data-exam-todo=/g) ?? []).length, 3);
  assert.match(preview, /<div class="dashboard-todos-exam"><h3>Patho<\/h3><span>in 33 Tagen<\/span><button[^>]*aria-label="Heutige Einheit lernen"[^>]*>(?:(?!<\/button>)[\s\S])*<span>Einheit lernen<\/span><\/button><\/div>/);
  assert.match(preview, /<li data-exam-todo="topic:exam:topic-4" data-exam-block="study" class="dashboard-todo" style="--dashboard-exam-color:/);
  assert.match(preview, /Erledigt im Planer \(4\)/);
  assert.doesNotMatch(preview, /weitere anzeigen|Prüfungen · Heute|offene Aufgaben/);
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
  assert.match(markup, /<h2[^>]*>Womit möchtest du starten\?<\/h2>/);
  assert.match(markup, /<img src="\/core-brain\.svg" alt=""/);
  assert.equal((markup.match(/<button type="button" class="dashboard-poster-action">[^<]+<svg[^>]*lucide-chevron-right/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /APKG-Datei|Frage und Antwort direkt/);
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

  assert.match(markup, /<p aria-hidden="true"[^>]*>Willkommen zurück,<\/p>/);
  assert.match(markup, /<h2[^>]*data-screen-heading[^>]*><span class="sr-only">Willkommen zurück, <\/span><span class="core-dashboard-name">Noemi!<\/span><\/h2>/);
  assert.match(markup, /data-tone="navy" data-testid="daily-learning-overview" data-status="open"><div class="core-section-header"><h2 class="core-section-header-title">Heute<\/h2>/);
  assert.match(markup, /<p class="dashboard-poster-goal"><span class="dashboard-poster-giant">1<\/span> <span class="dashboard-poster-subtitle">Karte noch heute<\/span><\/p>/);
  assert.match(markup, /data-testid="daily-learning-total">0 \/ 1<span class="sr-only"> Karten gelernt<\/span>/);
  assert.match(markup, /<dl class="dashboard-learning-scale" style="grid-template-columns:minmax\(max-content, 1fr\)"><div data-daily-learning-metric="new"><dt>Neu<\/dt><dd>1<\/dd><\/div><\/dl>/);
  assert.match(markup, /<button type="button" class="dashboard-poster-action dashboard-learning-action">(?:(?!<\/button>)[\s\S])*Jetzt lernen:<span class="dashboard-learning-deck">(?:(?!<\/button>)[\s\S])*<span>Biologie<\/span>(?:(?!<\/button>)[\s\S])*lucide-play/);
  assert.doesNotMatch(markup, /Plan ansehen|Plan für morgen ansehen/);
  assert.match(markup, /<h2 class="core-section-header-title">To-dos<\/h2><div class="core-section-header-action"><button[^>]*aria-label="Planer öffnen"/);
  assert.match(markup, /<button type="button" class="dashboard-poster-action dashboard-todos-add">[\s\S]*?Neue Aufgabe<\/button>/);
  assert.doesNotMatch(markup, /\d+ offen</);
  assert.doesNotMatch(markup, /geschätzte Dauer|Dranbleiben lohnt sich|Für heute alles geschafft/);
  assert.match(markup, /<h2 class="core-section-header-title">Oft gelernte Stapel<\/h2>/);
  assert.match(markup, /aria-label="Stapel anpinnen"/);
  assert.match(markup, /data-testid="suggested-deck-[^"]+"/);
  assert.match(markup, /<button[^>]*aria-label="Biologie lernen"/);
  assert.match(markup, />Alle Stapel ansehen</);
  assert.doesNotMatch(markup, /Alle Stapel öffnen|Stapelansicht/);
  const dailyOverview = markup.match(/<section[^>]*data-testid="daily-learning-overview"[\s\S]*?<\/section>/)?.[0];
  assert.ok(dailyOverview);
  assert.doesNotMatch(markup, /data-donut-|Gesamtfortschritt/);
  assert.doesNotMatch(markup, /aktive Tage/i);
  assert.match(markup, /0<\/span> <span class="core-heading-3">Tage Streak/);
  assert.match(markup, /aria-label="Heatmap-Zeitraum"/);
  assert.match(markup, /Frühere sieben Tage anzeigen[\s\S]*data-testid="study-heatmap-grid"[\s\S]*data-testid="study-heatmap-legend"[\s\S]*Gelernt[\s\S]*Fällig/);
  assert.equal((markup.match(/data-heatmap-day=/g) ?? []).length, 7);
  assert.match(markup, /class="[^"]*core-heatmap-week-track w-full max-w-\[4\.5rem\] rounded-control bg-core-subtle"/);
  assert.match(markup, /ring-2 ring-core-action/);
  assert.doesNotMatch(markup, /ring-inset/);
  for (let level = 1; level <= 4; level += 1) assert.match(markup, new RegExp(`core-heatmap-level-${level}`));
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
  assert.match(todayMarkup, /data-testid="daily-learning-total">0 \/ 0</);
  assert.match(futureMarkup, /data-status="open"/);
  assert.match(futureMarkup, /data-testid="daily-learning-total">0 \/ 1</);
  assert.match(futureMarkup, /<div data-daily-learning-metric="due"><dt>Fällig<\/dt><dd>1<\/dd><\/div>/);
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

  assert.match(markup, /data-tone="green" data-testid="daily-learning-overview" data-status="achieved"/);
  assert.match(markup, /data-testid="daily-learning-total">1 \/ 1</);
  assert.match(markup, /<span class="dashboard-poster-giant">1<\/span> <span class="dashboard-poster-subtitle">Karte gelernt\.<\/span>/);
  assert.doesNotMatch(markup.match(/data-testid="daily-learning-overview"[\s\S]*?<\/section>/)![0], /data-daily-learning-metric|Tagesziel erreicht|morgen fällig/i);
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

  assert.match(markup, /data-tone="fog" data-testid="daily-learning-overview" data-status="waiting"/);
  assert.match(markup, /<span class="dashboard-poster-giant">1<\/span> <span class="dashboard-poster-subtitle">Karte kommt später wieder\.<\/span>/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Später weiterlernen/);
  assert.doesNotMatch(markup, /Tagesziel erreicht|data-daily-learning-metric|\d+ Min\./);
});

test("dashboard fills the deck widget with four suggestions, links to all decks and has no duplicate completed legend", () => {
  const baseState = createCoreRepository().getState();
  const decks = Array.from({ length: 10 }, (_, index) => createCoreDeck({ id: `preview-${index}`, name: `Stapel ${index}`, source: "manual", cards: [] }));
  const markup = renderToStaticMarkup(<DashboardScreen state={{ ...baseState, decks }} now="2026-08-06T10:00:00.000Z" {...dashboardCallbacks} />);
  assert.equal((markup.match(/data-testid="suggested-deck-/g) ?? []).length, 4);
  assert.match(markup, />Alle Stapel ansehen</);
  assert.doesNotMatch(markup, /Hauptstapel ansehen|Alle Stapel öffnen/);
  assert.doesNotMatch(markup, /Geschafft|Grauer Balken: für heute abgeschlossen/);
  assert.equal((markup.match(/data-daily-learning-metric=/g) ?? []).length, 0);
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

  assert.match(extraMarkup, /Karten gelernt\./);
  assert.match(extraMarkup, /<button type="button" class="dashboard-poster-action dashboard-learning-action" data-shade="true">(?:(?!<\/button>)[\s\S])*Zusätzliche Karten lernen/);
  assert.doesNotMatch(extraMarkup, /Plan ansehen|Plan für morgen ansehen/);
  assert.match(noExtraMarkup, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Zusätzliche Karten lernen/);
});
