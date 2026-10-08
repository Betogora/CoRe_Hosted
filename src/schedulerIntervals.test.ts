import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createDefaultDeckSettings, createReviewState } from "./coreModel.ts";
import { applyReviewRating, calculateRetrievability, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.ts";

const now = "2026-08-21T10:00:00.000Z";

test("FSRS bietet für eine neue Karte alle vier Bewertungen an", () => {
  const [card] = createBasicNote("deck", "Q", "A").cards;
  const options = getReviewButtonOptions(card, null, { now });
  assert.deepEqual(Object.keys(options), ["again", "hard", "good", "easy"]);
  assert.equal(options.good?.nextState, "learning");
});

test("jede echte Bewertung erhöht Wiederholungen und setzt lastReviewedAt", () => {
  for (const rating of ["again", "hard", "good", "easy"] as const) {
    const state = createReviewState({ state: "review", dueAt: now, reps: 4, stability: 10, difficulty: 5 });
    const next = applyReviewRating(state, rating, { now });
    assert.equal(next.reps, 5);
    assert.equal(next.lastReviewedAt, now);
    assert.equal(next.lastRating, rating);
  }
});

test("eine KI-Darstellung ändert nicht die FSRS-Planung der Karte", () => {
  const [base] = createBasicNote("deck", "Q", "A").cards;
  const card = addCardVariant({ ...base, study: cardStudyFromReviewState(createReviewState({ state: "review", dueAt: now, reps: 4 })) }, { front: "Q2", back: "A2" });
  const deckSettings = createDefaultDeckSettings();
  const original = simulateRatingOutcome({ card, variant: null, rating: "good", now, deckSettings });
  const variant = simulateRatingOutcome({ card, variant: card.variants[0], rating: "good", now, deckSettings });
  assert.equal(original.previousReviewState.reps, 4);
  for (const key of ["state", "dueAt", "stability", "difficulty", "reps", "lapses", "intervalDays"] as const) {
    assert.equal(variant.nextReviewState[key], original.nextReviewState[key], key);
  }
});

test("Retrievability bleibt auf den Bereich null bis eins begrenzt", () => {
  const state = createReviewState({ state: "review", stability: 20, difficulty: 5, lastReviewedAt: "2026-08-01T10:00:00.000Z" });
  const value = calculateRetrievability(state, now);
  assert.equal(value >= 0 && value <= 1, true);
});
