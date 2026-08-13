import assert from "node:assert/strict";
import test from "node:test";
import { createCoreCard, createCoreDeck } from "./coreModel.ts";
import type { ReviewEvent, ReviewRating } from "./coreTypes.ts";
import { projectStatistics, type StatisticsPeriod } from "./statisticsModel.ts";
import { createStudyHeatmapWindow } from "./studyHeatmapModel.ts";

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
  assert.equal(result.difficultCards[0]?.learningItemId, "card_stats");
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
