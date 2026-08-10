import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.ts";
import type { ReviewEvent, ReviewRating } from "./coreTypes.ts";
import { createStatisticsIndex, projectStatistics, resolveStatisticsDeckScope, type StatisticsPeriod } from "./statisticsModel.ts";
import { createStudyHeatmapWindow } from "./studyHeatmapModel.ts";

function reviewEvent({
  id,
  deckId,
  learningItemId,
  rating,
  answeredAt,
  state,
  intervalDays,
  responseTimeMs = null,
}: {
  id: string;
  deckId: string;
  learningItemId: string;
  rating: ReviewRating;
  answeredAt: string;
  state: "new" | "learning" | "review" | "relearning";
  intervalDays: number;
  responseTimeMs?: number | null;
}): ReviewEvent {
  return {
    id,
    userId: "user",
    deckId,
    learningItemId,
    variantId: `${learningItemId}_original`,
    reviewableType: "variant",
    reviewableId: `${learningItemId}_original`,
    sourceCardId: learningItemId,
    rating,
    answeredAt,
    responseTimeMs,
    schedulerBefore: { card: { state, intervalDays } },
    schedulerAfter: {},
    flags: {},
    createdAt: answeredAt,
  };
}

function statisticsFixture() {
  const card = createCoreCard({
    id: "card_stats",
    source: "manual",
    title: "Hippocampus",
    originalFront: "Welche Aufgabe hat der Hippocampus?",
    originalBack: "Gedächtniskonsolidierung",
    createdAt: "2026-06-01T08:00:00.000Z",
    reviewState: {
      state: "review",
      dueAt: "2026-07-08T08:00:00.000Z",
      intervalDays: 30,
      difficulty: 6,
      stability: 25,
      reps: 5,
      repetitions: 5,
      lastReviewedAt: "2026-07-07T08:00:00.000Z",
    },
  });
  const parent = createCoreDeck({
    id: "deck_parent",
    name: "Medizin",
    source: "manual",
    cards: [],
  });
  const child = createCoreDeck({
    id: "deck_child",
    parentDeckId: parent.id,
    hierarchyPath: ["Medizin", "Neuro"],
    name: "Neuro",
    source: "manual",
    cards: [card],
    reviewEvents: [
      reviewEvent({ id: "learning", deckId: "deck_child", learningItemId: card.id, rating: "good", answeredAt: "2026-07-04T08:00:00.000Z", state: "learning", intervalDays: 0, responseTimeMs: 2_000 }),
      reviewEvent({ id: "relearning", deckId: "deck_child", learningItemId: card.id, rating: "again", answeredAt: "2026-07-05T08:00:00.000Z", state: "relearning", intervalDays: 2, responseTimeMs: 3_000 }),
      reviewEvent({ id: "young", deckId: "deck_child", learningItemId: card.id, rating: "hard", answeredAt: "2026-07-06T08:00:00.000Z", state: "review", intervalDays: 10 }),
      reviewEvent({ id: "mature", deckId: "deck_child", learningItemId: card.id, rating: "easy", answeredAt: "2026-07-07T08:00:00.000Z", state: "review", intervalDays: 30, responseTimeMs: 1_000 }),
    ],
  });
  return { parent, child };
}

test("statistics resolve parent scopes and aggregate the Anki-style categories once", () => {
  const { parent, child } = statisticsFixture();
  const index = createStatisticsIndex([parent, child]);
  assert.deepEqual(resolveStatisticsDeckScope(index, [parent.id]), [parent.id, child.id]);

  const statistics = projectStatistics(index, {
    period: "30d",
    deckIds: [parent.id, child.id],
    now: "2026-07-07T12:00:00.000Z",
    timeZone: "Europe/Berlin",
  });

  assert.deepEqual(statistics.scopeDeckIds, [parent.id, child.id]);
  assert.equal(statistics.summary.reviewCount, 4);
  assert.equal(statistics.summary.successPercent, 75);
  assert.equal(statistics.summary.timedCount, 3);
  assert.equal("timingCoveragePercent" in statistics.summary, false);
  assert.equal(statistics.summary.totalDurationMs, 6_000);
  assert.equal(statistics.activity.reduce((sum, point) => sum + point.learning, 0), 1);
  assert.equal(statistics.activity.reduce((sum, point) => sum + point.relearning, 0), 1);
  assert.equal(statistics.activity.reduce((sum, point) => sum + point.young, 0), 1);
  assert.equal(statistics.activity.reduce((sum, point) => sum + point.mature, 0), 1);
  assert.equal(statistics.activity.at(-1)?.cumulative, 4);
  assert.equal(statistics.status.activeVariants, 1);
  assert.equal(statistics.status.rows.find((row) => row.key === "mature")?.count, 1);
  assert.equal(statistics.planning.dueTomorrow, 1);
  assert.equal(statistics.studyHeatmap.forecastCountsByDay.get("2026-07-08"), 1);
  assert.equal(statistics.difficultCards[0]?.learningItemId, "card_stats");
});

test("statistics heatmap forecast follows the selected deck scope without counting variants twice", () => {
  const selectedCard = createCoreCard({
    id: "card_selected_forecast",
    source: "manual",
    reviewState: { state: "review", dueAt: "2026-07-08T08:00:00.000Z", repetitions: 2 },
    variants: [
      { id: "variant_selected_forecast", sourceCardId: "card_selected_forecast", front: "Variante", back: "Antwort", qualityStatus: "active" },
    ],
  });
  const otherCard = createCoreCard({
    id: "card_other_forecast",
    source: "manual",
    reviewState: { state: "review", dueAt: "2026-07-08T09:00:00.000Z", repetitions: 2 },
  });
  const selectedDeck = createCoreDeck({ id: "deck_selected_forecast", name: "Ausgewählt", source: "manual", cards: [selectedCard] });
  const otherDeck = createCoreDeck({ id: "deck_other_forecast", name: "Andere", source: "manual", cards: [otherCard] });
  const index = createStatisticsIndex([selectedDeck, otherDeck]);
  const selection = { period: "30d" as const, now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" };

  const selected = projectStatistics(index, { ...selection, deckIds: [selectedDeck.id] });
  const all = projectStatistics(index, { ...selection, deckIds: "all" });

  assert.equal(selected.studyHeatmap.forecastCountsByDay.get("2026-07-08"), 1);
  assert.equal(all.studyHeatmap.forecastCountsByDay.get("2026-07-08"), 2);
});

test("all global periods share the all-time sparse heatmap while keeping bounded chart ranges", () => {
  const { parent, child } = statisticsFixture();
  child.reviewEvents.push(
    reviewEvent({ id: "older", deckId: child.id, learningItemId: child.cards[0].id, rating: "good", answeredAt: "2026-05-01T08:00:00.000Z", state: "review", intervalDays: 30 }),
  );
  const index = createStatisticsIndex([parent, child]);
  const expectations: Array<[StatisticsPeriod, number]> = [
    ["30d", 4],
    ["90d", 5],
    ["365d", 5],
    ["all", 5],
  ];

  for (const [period, expectedReviewCount] of expectations) {
    const statistics = projectStatistics(index, {
      period,
      deckIds: "all",
      now: "2026-07-07T12:00:00.000Z",
      timeZone: "Europe/Berlin",
    });
    assert.equal(statistics.summary.reviewCount, expectedReviewCount);
    assert.ok(statistics.activity.length <= 240);
    assert.equal([...statistics.studyHeatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 5);
    assert.equal(statistics.studyHeatmap.firstActivityKey, "2026-05-01");
    assert.equal(statistics.studyHeatmap.currentStreak, 4);
    assert.equal(statistics.summary.currentStreak, 4);
    assert.equal("days" in statistics.studyHeatmap, false);
    const heatmapWindow = createStudyHeatmapWindow(statistics.studyHeatmap, { period: "week" });
    assert.equal(heatmapWindow.days.length, 7);
    assert.equal(heatmapWindow.rangeEndKey, "2026-07-07");
  }
});

test("true retention keeps only the first eligible variant review per local day", () => {
  const { child } = statisticsFixture();
  child.reviewEvents.push(
    reviewEvent({
      id: "same-day-second",
      deckId: child.id,
      learningItemId: child.cards[0].id,
      rating: "again",
      answeredAt: "2026-07-07T09:00:00.000Z",
      state: "review",
      intervalDays: 30,
    }),
  );
  const statistics = projectStatistics(createStatisticsIndex([child]), {
    period: "30d",
    deckIds: "all",
    now: "2026-07-07T12:00:00.000Z",
    timeZone: "Europe/Berlin",
  });

  assert.equal(statistics.summary.reviewCount, 5);
  assert.equal(statistics.summary.trueRetentionSample, 3);
  assert.equal(statistics.summary.trueRetentionPercent, 66.7);
  assert.equal(statistics.retention[0].mature.total, 1);
  assert.equal(statistics.retention[0].mature.percent, 100);
});

test("local calendar boundaries use the profile timezone", () => {
  const card = createCoreCard({ id: "card_zone", source: "manual", originalFront: "Zeit", originalBack: "Zone" });
  const deck = createCoreDeck({
    id: "deck_zone",
    name: "Zeitzone",
    source: "manual",
    cards: [card],
    reviewEvents: [
      reviewEvent({ id: "before-midnight", deckId: "deck_zone", learningItemId: card.id, rating: "good", answeredAt: "2026-03-28T22:30:00.000Z", state: "review", intervalDays: 3 }),
      reviewEvent({ id: "after-midnight", deckId: "deck_zone", learningItemId: card.id, rating: "good", answeredAt: "2026-03-28T23:30:00.000Z", state: "review", intervalDays: 3 }),
    ],
  });
  const statistics = projectStatistics(createStatisticsIndex([deck]), {
    period: "30d",
    deckIds: "all",
    now: "2026-03-29T10:00:00.000Z",
    timeZone: "Europe/Berlin",
  });

  assert.equal(statistics.studyHeatmap.countsByDay.get("2026-03-28"), 1);
  assert.equal(statistics.studyHeatmap.countsByDay.get("2026-03-29"), 1);
  assert.equal(statistics.studyHeatmap.currentStreak, 2);
  assert.equal(statistics.summary.currentStreak, 2);
});

test("bounded projections exclude distant events and invalidate the one-entry scope cache", () => {
  const { child } = statisticsFixture();
  child.reviewEvents.push(
    reviewEvent({ id: "distant", deckId: child.id, learningItemId: child.cards[0].id, rating: "good", answeredAt: "2020-01-01T08:00:00.000Z", state: "review", intervalDays: 30 }),
  );
  const siblingCard = createCoreCard({ id: "card_sibling", source: "manual", originalFront: "Nebenstapel", originalBack: "Antwort" });
  const sibling = createCoreDeck({
    id: "deck_sibling",
    name: "Nebenstapel",
    source: "manual",
    cards: [siblingCard],
    reviewEvents: [reviewEvent({ id: "sibling-review", deckId: "deck_sibling", learningItemId: siblingCard.id, rating: "easy", answeredAt: "2026-07-07T10:00:00.000Z", state: "review", intervalDays: 25 })],
  });
  const index = createStatisticsIndex([child, sibling]);
  const selection = { period: "30d" as const, now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" };

  const childStatistics = projectStatistics(index, { ...selection, deckIds: [child.id] });
  const allStatistics = projectStatistics(index, { ...selection, deckIds: "all" });
  const childStatisticsAgain = projectStatistics(index, { ...selection, deckIds: [child.id] });
  assert.equal(childStatistics.summary.reviewCount, 4);
  assert.equal([...childStatistics.studyHeatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 5);
  assert.equal(allStatistics.summary.reviewCount, 5);
  assert.equal([...allStatistics.studyHeatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 6);
  assert.equal(childStatisticsAgain.summary.reviewCount, 4);
  assert.equal([...childStatisticsAgain.studyHeatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 5);
});

test("total-history series remain bounded and current snapshots survive empty history", () => {
  const card = createCoreCard({
    id: "card_empty_history",
    source: "manual",
    originalFront: "Aktuell",
    originalBack: "Vorhanden",
    createdAt: "2000-01-01T00:00:00.000Z",
    reviewState: { state: "new", dueAt: "2026-07-07T08:00:00.000Z" },
  });
  const deck = createCoreDeck({ id: "deck_empty_history", name: "Leer", source: "manual", cards: [card] });
  const statistics = projectStatistics(createStatisticsIndex([deck]), {
    period: "all",
    deckIds: "all",
    now: "2026-07-07T12:00:00.000Z",
    timeZone: "Europe/Berlin",
  });

  assert.equal(statistics.summary.reviewCount, 0);
  assert.equal(statistics.status.activeVariants, 1);
  assert.ok(statistics.activity.length <= 240);
  assert.equal(statistics.studyHeatmap.countsByDay.size, 0);
  assert.equal("days" in statistics.studyHeatmap, false);
  assert.equal(createStudyHeatmapWindow(statistics.studyHeatmap).days.length, 7);
});
