import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.ts";
import type { ReviewEvent, ReviewRating } from "./coreTypes.ts";
import { mergeAccountStatisticsSnapshot, projectStatistics, type StatisticsPeriod } from "./statisticsModel.ts";
import { createStudyHeatmapWindow } from "./studyHeatmapModel.ts";
import type { AccountStatisticsSnapshot } from "./workspaceReplica.ts";

function reviewEvent({ id, deckId, learningItemId, rating, answeredAt, state, intervalDays, responseTimeMs = null }: {
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
    id, userId: "user", deckId, learningItemId, variantId: `${learningItemId}_original`, reviewableType: "variant",
    reviewableId: `${learningItemId}_original`, sourceCardId: learningItemId, rating, answeredAt, responseTimeMs,
    schedulerBefore: { card: { state, intervalDays } }, schedulerAfter: {}, flags: {}, createdAt: answeredAt,
  };
}

function fixture() {
  const card = createCoreCard({
    id: "card_stats",
    source: "manual",
    title: "Hippocampus",
    originalFront: "Welche Aufgabe hat der Hippocampus?",
    originalBack: "Gedächtniskonsolidierung",
    createdAt: "2026-06-01T08:00:00.000Z",
    reviewState: { state: "review", dueAt: "2026-07-08T08:00:00.000Z", intervalDays: 30, difficulty: 6, stability: 25, repetitions: 5 },
  });
  const parent = createCoreDeck({ id: "deck_parent", name: "Medizin", source: "manual", cards: [] });
  const child = createCoreDeck({
    id: "deck_child", parentDeckId: parent.id, hierarchyPath: ["Medizin", "Neuro"], name: "Neuro", source: "manual", cards: [card],
    reviewEvents: [
      reviewEvent({ id: "learning", deckId: "deck_child", learningItemId: card.id, rating: "good", answeredAt: "2026-07-04T08:00:00.000Z", state: "learning", intervalDays: 0, responseTimeMs: 2_000 }),
      reviewEvent({ id: "relearning", deckId: "deck_child", learningItemId: card.id, rating: "again", answeredAt: "2026-07-05T08:00:00.000Z", state: "relearning", intervalDays: 2, responseTimeMs: 3_000 }),
      reviewEvent({ id: "young", deckId: "deck_child", learningItemId: card.id, rating: "hard", answeredAt: "2026-07-06T08:00:00.000Z", state: "review", intervalDays: 10 }),
      reviewEvent({ id: "mature", deckId: "deck_child", learningItemId: card.id, rating: "easy", answeredAt: "2026-07-07T08:00:00.000Z", state: "review", intervalDays: 30, responseTimeMs: 1_000 }),
    ],
  });
  return { parent, child };
}

test("statistics aggregate a parent scope once and keep every public series bounded", () => {
  const { parent, child } = fixture();
  const result = projectStatistics([parent, child], { period: "30d", deckIds: [parent.id], now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" });
  assert.deepEqual(result.scopeDeckIds, [parent.id, child.id]);
  assert.equal(result.summary.reviewCount, 4);
  assert.equal(result.summary.successPercent, 75);
  assert.equal(result.summary.timedCount, 3);
  assert.equal(result.summary.totalDurationMs, 6_000);
  assert.equal(result.activity.reduce((sum, point) => sum + point.learning + point.relearning + point.young + point.mature, 0), 4);
  assert.equal(result.status.activeVariants, 1);
  assert.equal(result.planning.dueTomorrow, 1);
  assert.equal(result.studyHeatmap.forecastCountsByDay.get("2026-07-08"), 1);
  assert.equal("difficultCards" in result, false);
  assert.ok(Math.max(result.activity.length, result.addedCards.length, result.planning.points.length, result.intervals.points.length) <= 240);
});

test("all periods share all-time heatmap counts while filtering the selected review count", () => {
  const { parent, child } = fixture();
  child.reviewEvents.push(reviewEvent({ id: "older", deckId: child.id, learningItemId: child.cards[0].id, rating: "good", answeredAt: "2026-05-01T08:00:00.000Z", state: "review", intervalDays: 30 }));
  const expectations: Array<[StatisticsPeriod, number]> = [["30d", 4], ["90d", 5], ["365d", 5], ["all", 5]];
  for (const [period, expected] of expectations) {
    const result = projectStatistics([parent, child], { period, deckIds: "all", now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" });
    assert.equal(result.summary.reviewCount, expected);
    assert.equal([...result.studyHeatmap.countsByDay.values()].reduce((sum, count) => sum + count, 0), 5);
    assert.equal(result.studyHeatmap.firstActivityKey, "2026-05-01");
    assert.equal(createStudyHeatmapWindow(result.studyHeatmap).days.length, 7);
  }
});

test("retention keeps the first eligible review per reviewable and local day", () => {
  const { child } = fixture();
  child.reviewEvents.push(reviewEvent({ id: "same-day-second", deckId: child.id, learningItemId: child.cards[0].id, rating: "again", answeredAt: "2026-07-07T09:00:00.000Z", state: "review", intervalDays: 30 }));
  const result = projectStatistics([child], { period: "30d", deckIds: "all", now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" });
  assert.equal(result.summary.reviewCount, 5);
  assert.equal(result.summary.trueRetentionSample, 3);
  assert.equal(result.summary.trueRetentionPercent, 66.7);
});

test("learning-day boundaries use timezone and configured start hour", () => {
  const card = createCoreCard({ id: "card_zone", source: "manual" });
  const deck = createCoreDeck({
    id: "deck_zone", name: "Zeitzone", source: "manual", cards: [card],
    reviewEvents: [reviewEvent({ id: "early", deckId: "deck_zone", learningItemId: card.id, rating: "good", answeredAt: "2026-07-11T00:30:00.000Z", state: "review", intervalDays: 3 })],
  });
  const result = projectStatistics([deck], { period: "30d", deckIds: "all", now: "2026-07-11T03:00:00.000Z", timeZone: "Europe/Berlin", dayStartHour: 3 });
  assert.equal(result.studyHeatmap.countsByDay.get("2026-07-10"), 1);
  assert.equal(result.activity.find((point) => point.key === "2026-07-10")?.total, 1);
});

test("server aggregates replace a partial local history and retain pending reviews optimistically", () => {
  const { child } = fixture();
  child.reviewEvents = [];
  const local = projectStatistics([child], { period: "30d", deckIds: "all", now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" });
  const snapshot: AccountStatisticsSnapshot = {
    cards: { total: 10, new: 4, learning: 2, mature: 3, suspended: 1 },
    reviewsByDay: {
      "2026-07-06": { total: 3, learning: 1, relearning: 0, young: 1, mature: 1, successful: 2, timedCount: 2, durationMs: 4_000, durationLearningMs: 1_000, durationRelearningMs: 0, durationYoungMs: 1_000, durationMatureMs: 2_000 },
    },
    heatmapByDay: { "2026-06-01": 2, "2026-07-06": 3 },
    addedCardsByDay: { "2026-07-01": 2 },
    forecastByDay: { "2026-07-08": { learning: 0, relearning: 0, young: 2, mature: 1, total: 3 } },
    overdue: 1,
    dueTomorrow: 3,
    dailyWorkload: 3,
    status: { activeVariants: 1, deletedItems: 0 },
    intervals: { points: [], averageDays: 4, medianDays: 3, percentile95Days: 10 },
    fsrs: { difficulty: [], stability: [], retrievability: [] },
    retention: [{ key: "selected", youngRemembered: 2, youngTotal: 3, matureRemembered: 1, matureTotal: 1 }],
    hourly: [{ hour: 10, reviews: 3, successful: 2 }],
    ratings: [{ category: "learning", rating: "good", count: 1 }],
    deckReviews: { [child.id]: { reviews: 3, successful: 2, again: 1, remembered: 3, retentionTotal: 4, intervalTotal: 12, intervalCount: 3, nextDueAt: "2026-07-08T10:00:00.000Z" } },
    generatedAt: "2026-07-07T12:00:00.000Z",
  };
  const merged = mergeAccountStatisticsSnapshot(local, snapshot, [reviewEvent({ id: "pending", deckId: child.id, learningItemId: child.cards[0].id, rating: "easy", answeredAt: "2026-07-07T08:00:00.000Z", state: "review", intervalDays: 30, responseTimeMs: 1_000 })]);
  const allTime = mergeAccountStatisticsSnapshot(
    projectStatistics([child], { period: "all", deckIds: "all", now: "2026-07-07T12:00:00.000Z", timeZone: "Europe/Berlin" }),
    snapshot,
  );

  assert.equal(merged.summary.reviewCount, 4);
  assert.equal(merged.summary.totalDurationMs, 5_000);
  assert.equal(merged.status.learningItems, 10);
  assert.equal(merged.studyHeatmap.countsByDay.get("2026-07-07"), 1);
  assert.equal(merged.deckRows[0].reviewCount, 3);
  assert.equal(allTime.summary.reviewCount, 3);
  assert.equal(allTime.activity[0].key <= "2026-07-01", true);
});
