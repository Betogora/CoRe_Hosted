import assert from "node:assert/strict";
import test from "node:test";
import {
  addCardToDeckStudyProjection,
  createDeckStudyProjectionContext,
  emptyDeckStudyProjectionAggregate,
} from "./deckStudyProjection.ts";

test("aggregiert lernbare Karten in kontextgebundene Fälligkeits-Buckets", () => {
  const context = createDeckStudyProjectionContext("UTC", 4);
  const aggregate = emptyDeckStudyProjectionAggregate();

  addCardToDeckStudyProjection(aggregate, {
    dueAt: "2026-08-16T03:30:00.000Z",
    reviewable: 1,
    scheduleState: "review",
    maturityBand: "mastered",
  }, context);
  addCardToDeckStudyProjection(aggregate, {
    dueAt: "2026-08-16T05:00:00.000Z",
    reviewable: 1,
    scheduleState: "learning",
    maturityBand: "learning",
  }, context);
  addCardToDeckStudyProjection(aggregate, {
    dueAt: "2026-08-16T05:00:00.000Z",
    reviewable: 0,
    scheduleState: "new",
    maturityBand: "new",
  }, context);

  assert.equal(context.key, "UTC:4");
  assert.equal(aggregate.totalCards, 2);
  assert.equal(aggregate.inProgressLearning, 1);
  assert.equal(aggregate.masteredCards, 1);
  assert.equal(aggregate.nextDueAt, "2026-08-16T03:30:00.000Z");
  assert.deepEqual(aggregate.dueByDay, {
    "2026-08-15": { reviewDueCount: 1, forecastCount: 1 },
    "2026-08-16": { reviewDueCount: 0, forecastCount: 1 },
  });
});

test("entfernt Kartenbeiträge ohne leere Bucket-Zeilen zu hinterlassen", () => {
  const context = createDeckStudyProjectionContext("UTC", 0);
  const aggregate = emptyDeckStudyProjectionAggregate();
  const card = {
    dueAt: "2026-08-17T08:00:00.000Z",
    reviewable: 1 as const,
    scheduleState: "review",
    maturityBand: "variant_ready",
  };

  addCardToDeckStudyProjection(aggregate, card, context);
  addCardToDeckStudyProjection(aggregate, card, context, -1);

  assert.equal(aggregate.totalCards, 0);
  assert.equal(aggregate.matureCards, 0);
  assert.deepEqual(aggregate.dueByDay, {});
});
