import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createDefaultDeckSettings, createReviewState } from "./coreModel.ts";
import { applyReviewRating, calculateRetrievability, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.ts";

const now = "2026-08-21T10:00:00.000Z";

test("FSRS bietet für eine neue Karte alle vier Bewertungen an", () => {
  const card = createBasicLearningItem("deck", "Q", "A");
  const options = getReviewButtonOptions(card, null, { now });
  assert.deepEqual(Object.keys(options), ["again", "hard", "good", "easy"]);
  assert.equal(options.good?.nextState, "learning");
});

test("jede echte Bewertung erhöht Wiederholungen und setzt lastReviewedAt", () => {
  for (const rating of ["again", "hard", "good", "easy"] as const) {
    const state = createReviewState({ state: "review", dueAt: now, repetitions: 4, reps: 4, stability: 10, difficulty: 5 });
    const next = applyReviewRating(state, rating, { now });
    assert.equal(next.repetitions, 5);
    assert.equal(next.lastReviewedAt, now);
    assert.equal(next.lastRating, rating);
  }
});

test("eine KI-Darstellung ändert nicht den Typ des FSRS-Zustands", () => {
  const card = createBasicLearningItem("deck", "Q", "A", { reviewState: createReviewState({ state: "review", dueAt: now, repetitions: 4 }) });
  const outcome = simulateRatingOutcome({ learningItem: card, variant: null, rating: "good", now, deckSettings: createDefaultDeckSettings() });
  assert.equal(outcome.nextReviewState.reviewableType, "card");
  assert.equal(outcome.nextReviewState.learningItemId, card.id);
});

test("Retrievability bleibt auf den Bereich null bis eins begrenzt", () => {
  const state = createReviewState({ state: "review", stability: 20, difficulty: 5, lastReviewedAt: "2026-08-01T10:00:00.000Z" });
  const value = calculateRetrievability(state, now);
  assert.equal(value >= 0 && value <= 1, true);
});
