import { performance } from "node:perf_hooks";
import { createCoreCard, createCoreDeck } from "../src/coreModel.ts";
import type { ReviewEvent, ReviewRating } from "../src/coreTypes.ts";
import { projectStatistics, type StatisticsPeriod } from "../src/statisticsModel.ts";

const eventCount = 250_000;
const runs = 3;
const now = "2026-08-06T12:00:00.000Z";
const card = createCoreCard({
  id: "statistics-benchmark-card",
  source: "manual",
  originalFront: "Benchmark-Frage",
  originalBack: "Benchmark-Antwort",
  reviewState: {
    state: "review",
    dueAt: "2026-08-07T12:00:00.000Z",
    intervalDays: 30,
    difficulty: 5.5,
    stability: 28,
    reps: 20,
    repetitions: 20,
    lastReviewedAt: "2026-08-05T12:00:00.000Z",
  },
});
const variantId = card.variants[0].id;
const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
const states = ["learning", "relearning", "review", "review"] as const;
const intervals = [0, 2, 12, 30];
const firstTimestamp = Date.parse(now) - eventCount * 60 * 60 * 1000;
const reviewEvents: ReviewEvent[] = Array.from({ length: eventCount }, (_, index) => {
  const answeredAt = new Date(firstTimestamp + index * 60 * 60 * 1000).toISOString();
  const categoryIndex = index % ratings.length;
  return {
    id: `statistics-benchmark-review-${index}`,
    userId: "statistics-benchmark-user",
    deckId: "statistics-benchmark-deck",
    learningItemId: card.id,
    variantId,
    reviewableType: "variant",
    reviewableId: variantId,
    sourceCardId: card.id,
    rating: ratings[categoryIndex],
    answeredAt,
    responseTimeMs: 1_500 + (index % 40) * 100,
    schedulerBefore: { card: { state: states[categoryIndex], intervalDays: intervals[categoryIndex] } },
    schedulerAfter: {},
    flags: {},
    createdAt: answeredAt,
  };
});
const deck = createCoreDeck({
  id: "statistics-benchmark-deck",
  name: "Statistik-Benchmark",
  source: "manual",
  cards: [card],
  reviewEvents,
});

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measure<T>(action: () => T) {
  const values: number[] = [];
  let result!: T;
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    result = action();
    values.push(performance.now() - startedAt);
  }
  return {
    result,
    medianMs: Math.round(median(values)),
    runsMs: values.map((value) => Math.round(value)),
  };
}

function measureProjection(period: StatisticsPeriod) {
  const measurement = measure(() => projectStatistics([deck], { period, deckIds: "all", now, timeZone: "Europe/Berlin" }));
  const projection = measurement.result;
  return {
    period,
    projectionMs: measurement.medianMs,
    runsMs: measurement.runsMs,
    reviewsProjected: projection.summary.reviewCount,
    maximumSeriesPoints: Math.max(
      projection.activity.length,
      projection.addedCards.length,
      projection.planning.points.length,
      projection.intervals.points.length,
    ),
    heatmapStoredDays: projection.studyHeatmap.countsByDay.size,
  };
}

const coldStart = measureProjection("365d");
const periodSwitches = (["30d", "90d", "365d", "all"] satisfies StatisticsPeriod[]).map(measureProjection);
const allProjection = periodSwitches.at(-1)!;
const maximumSeriesPoints = Math.max(coldStart.maximumSeriesPoints, ...periodSwitches.map((result) => result.maximumSeriesPoints));
const maximumHeatmapStoredDays = Math.max(coldStart.heatmapStoredDays, ...periodSwitches.map((result) => result.heatmapStoredDays));

console.log(JSON.stringify({
  events: eventCount,
  runs,
  projectionMs: allProjection.projectionMs,
  reviewsProjected: allProjection.reviewsProjected,
  maximumSeriesPoints,
  maximumHeatmapStoredDays,
  coldStart,
  periodSwitches,
}, null, 2));

if (maximumSeriesPoints > 240) {
  throw new Error(`Statistikreihe überschreitet das Limit: ${maximumSeriesPoints}`);
}
if (maximumHeatmapStoredDays > eventCount) {
  throw new Error("Die dünne Heatmap speichert mehr Tage als vorhandene Review-Ereignisse.");
}
if (periodSwitches.some((result) => result.heatmapStoredDays !== maximumHeatmapStoredDays)) {
  throw new Error("Die allzeitliche Heatmap darf sich beim Wechsel des Statistikzeitraums nicht verändern.");
}
