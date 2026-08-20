import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck, createReviewState } from "./coreModel.ts";
import { answerVariant, createDailyReviewQueue } from "./reviewService.ts";
import type { ReviewSchedulerState } from "./coreTypes.ts";

function cardInPhase(id: string, state: ReviewSchedulerState, dueAt: string) {
  return createBasicLearningItem("deck", id, "A", {
    id,
    reviewState: createReviewState({ state, dueAt, repetitions: state === "new" ? 0 : 2, reps: state === "new" ? 0 : 2 }),
  });
}

test("dueAt sperrt Karten aller Lernphasen bis zum gewählten Lerntag", () => {
  const future = "2026-08-22T04:00:00.000Z";
  const cards = (["new", "learning", "relearning", "review"] as ReviewSchedulerState[]).map((phase) => cardInPhase(phase, phase, future));
  const deck = createCoreDeck({ id: "deck", cards });
  const before = createDailyReviewQueue(deck, { now: "2026-08-21T08:00:00.000Z", dayStartHour: 6, timeZone: "Europe/Berlin" });
  const onDay = createDailyReviewQueue(deck, { now: "2026-08-22T08:00:00.000Z", dayStartHour: 6, timeZone: "Europe/Berlin" });
  assert.equal(before.total, 0);
  assert.equal(onDay.total, 4);
});

test("eine normale Bewertung aktualisiert nur den Karten-Lernstatus", () => {
  const card = createBasicLearningItem("deck", "Q", "A");
  const result = answerVariant(createCoreDeck({ id: "deck", cards: [card] }), card.id, null, "good", { now: "2026-08-20T08:00:00.000Z" });
  assert.equal(result.updatedCard.reviewState.repetitions, 1);
  assert.equal(result.event.reviewableType, "card");
  assert.equal(result.event.variantId, null);
});
