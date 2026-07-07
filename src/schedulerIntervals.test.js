import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, getActiveVariants, getOriginalVariant } from "./coreModel.js";
import { getLearningItemMaturity, getVariantGenerationRecommendation } from "./coreVariantService.js";
import { importNormalizedDeck } from "./importService.js";
import { answerVariant, getNextReviewItem } from "./reviewService.js";
import { formatIntervalLabel, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.js";

const NOW = "2026-07-07T10:00:00.000Z";

function minutesBetween(left, right) {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / 60000);
}

function daysBetween(left, right) {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / (24 * 60 * 60 * 1000));
}

function deckWith(item, reviewEvents = []) {
  return createCoreDeck({
    id: "deck_scheduler_intervals",
    name: "Scheduler Intervals",
    source: "manual",
    cards: [item],
    reviewEvents,
  });
}

function newItem() {
  return createBasicLearningItem("deck_scheduler_intervals", "Was ist ATP?", "Ein Energietraeger.", {
    reviewState: {
      state: "new",
      reps: 0,
      dueAt: NOW,
    },
  });
}

function reviewItem(state = {}) {
  return createBasicLearningItem("deck_scheduler_intervals", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
    reviewState: {
      state: "review",
      reps: 4,
      repetitions: 4,
      lapses: 0,
      stability: 6,
      difficulty: 5,
      intervalDays: 4,
      dueAt: NOW,
      lastReviewedAt: "2026-07-01T10:00:00.000Z",
      preferredVariantLevel: 2,
      ...state,
    },
  });
}

test("formatIntervalLabel covers minutes hours days and months", () => {
  assert.equal(formatIntervalLabel({ intervalMinutes: 5 }), "5 Min.");
  assert.equal(formatIntervalLabel({ intervalMinutes: 60 }), "1 Std.");
  assert.equal(formatIntervalLabel({ intervalMinutes: 180 }), "3 Std.");
  assert.equal(formatIntervalLabel({ intervalDays: 1 }), "1 Tag");
  assert.equal(formatIntervalLabel({ intervalDays: 14 }), "14 Tage");
  assert.equal(formatIntervalLabel({ intervalDays: 30 }), "1 Monat");
  assert.equal(formatIntervalLabel({ intervalDays: 60 }), "2 Monate");
});

test("new cards use same-day learning steps before graduating", () => {
  const item = newItem();
  const original = getOriginalVariant(item);
  const firstGood = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW });
  const firstEasy = simulateRatingOutcome({ learningItem: item, variant: original, rating: "easy", now: NOW });
  const secondGood = simulateRatingOutcome({
    previousState: firstGood.nextReviewState,
    variant: original,
    rating: "good",
    now: "2026-07-07T10:15:00.000Z",
  });
  const goodThenEasy = simulateRatingOutcome({
    previousState: firstGood.nextReviewState,
    variant: original,
    rating: "easy",
    now: "2026-07-07T10:15:00.000Z",
  });

  assert.equal(firstGood.nextState, "learning");
  assert.equal(firstGood.nextReviewState.reps, 1);
  assert.equal(firstGood.nextReviewState.learningSuccessCount, 1);
  assert.equal(firstGood.intervalLabel, "15 Min.");
  assert.equal(minutesBetween(NOW, firstGood.dueAt), 15);
  assert.equal(firstGood.nextMaturity.stage, "learning");
  assert.equal(firstEasy.nextState, "learning");
  assert.equal(firstEasy.nextReviewState.learningSuccessCount, 1);
  assert.equal(firstEasy.intervalLabel, "30 Min.");
  assert.equal(minutesBetween(NOW, firstEasy.dueAt), 30);
  assert.equal(secondGood.nextState, "review");
  assert.equal(secondGood.nextReviewState.learningSuccessCount, 2);
  assert.equal(secondGood.nextReviewState.isGraduated, true);
  assert.equal(secondGood.intervalDays, 1);
  assert.equal(secondGood.intervalLabel, "1 Tag");
  assert.equal(secondGood.nextMaturity.stage, "early_review");
  assert.equal(goodThenEasy.nextState, "review");
  assert.equal(goodThenEasy.intervalDays, 2);
});

test("again and hard in learning stay short and do not increase success count", () => {
  const item = newItem();
  const original = getOriginalVariant(item);
  const firstGood = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW });
  const again = simulateRatingOutcome({ previousState: firstGood.nextReviewState, variant: original, rating: "again", now: "2026-07-07T10:15:00.000Z" });
  const hard = simulateRatingOutcome({ previousState: firstGood.nextReviewState, variant: original, rating: "hard", now: "2026-07-07T10:15:00.000Z" });

  assert.equal(again.nextState, "learning");
  assert.equal(again.nextReviewState.learningSuccessCount, 0);
  assert.equal(again.nextReviewState.preferredVariantLevel, 1);
  assert.equal(again.intervalLabel, "5 Min.");
  assert.equal(hard.nextState, "learning");
  assert.equal(hard.nextReviewState.learningSuccessCount, 1);
  assert.equal(hard.intervalLabel, "10 Min.");
});

test("review cards produce monotone FSRS-like button intervals and short relearning on again", () => {
  const item = reviewItem();
  const original = getOriginalVariant(item);
  const options = getReviewButtonOptions(item, original, { now: NOW });
  const again = simulateRatingOutcome({ learningItem: item, variant: original, rating: "again", now: NOW });
  const hard = simulateRatingOutcome({ learningItem: item, variant: original, rating: "hard", now: NOW });
  const good = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW });
  const easy = simulateRatingOutcome({ learningItem: item, variant: original, rating: "easy", now: NOW });

  assert.equal(options.again.intervalLabel, "5 Min.");
  assert.equal(again.nextState, "relearning");
  assert.equal(again.nextReviewState.lapses, 1);
  assert.equal(minutesBetween(NOW, again.dueAt), 5);
  assert.equal(hard.intervalMs <= good.intervalMs, true);
  assert.equal(good.intervalMs <= easy.intervalMs, true);
  assert.equal(hard.nextReviewState.stability <= good.nextReviewState.stability, true);
  assert.equal(good.nextReviewState.stability <= easy.nextReviewState.stability, true);
  assert.equal(hard.intervalLabel.length > 0, true);
  assert.equal(good.intervalLabel.length > 0, true);
  assert.equal(easy.intervalLabel.length > 0, true);
});

test("button previews do not mutate state events or variant performance", () => {
  let item = reviewItem();
  item = addRephrasedVariant(item, "Wofuer steht MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  const variant = getActiveVariants(item)[0];
  const beforeItem = JSON.stringify(item);
  const deck = deckWith(item);
  const beforeEvents = JSON.stringify(deck.reviewEvents);
  const options = getReviewButtonOptions(item, variant, { now: NOW, reviewEvents: deck.reviewEvents });

  assert.deepEqual(Object.keys(options), ["again", "hard", "good", "easy"]);
  assert.equal(options.good.intervalLabel.length > 0, true);
  assert.equal(JSON.stringify(item), beforeItem);
  assert.equal(JSON.stringify(deck.reviewEvents), beforeEvents);
  assert.equal(variant.performance?.attempts ?? 0, 0);
});

test("answerVariant uses the same simulation as button preview", () => {
  const item = reviewItem();
  const original = getOriginalVariant(item);
  const deck = deckWith(item);
  const preview = getReviewButtonOptions(item, original, { now: NOW, reviewEvents: deck.reviewEvents }).good;
  const committed = answerVariant(deck, item.id, original.id, "good", { now: NOW });
  const nextState = committed.updatedCard.reviewState;

  assert.equal(nextState.dueAt, preview.dueAt);
  assert.equal(nextState.state, preview.nextState);
  assert.equal(nextState.intervalDays, preview.intervalDays);
  assert.equal(committed.deck.reviewEvents.length, 1);
});

test("relearning good returns to review and clears fallback when fallback target is correct", () => {
  let item = reviewItem({
    state: "relearning",
    fallbackUntilCorrect: true,
    forcedVariantId: null,
    lastRating: "again",
    lapses: 1,
    preferredVariantLevel: 1,
  });
  const original = getOriginalVariant(item);
  item = {
    ...item,
    learningItemState: { ...item.learningItemState, forcedVariantId: original.id },
    reviewState: { ...item.reviewState, forcedVariantId: original.id },
  };
  const result = answerVariant(deckWith(item), item.id, original.id, "good", { now: NOW });
  const state = result.updatedCard.reviewState;

  assert.equal(state.state, "review");
  assert.equal(state.fallbackUntilCorrect, false);
  assert.equal(state.forcedVariantId, null);
  assert.equal(daysBetween(NOW, state.dueAt), 1);
});

test("getNextReviewItem exposes ratingButtonOptions and preserves anchor/fallback view models", () => {
  let item = reviewItem({
    preferredVariantLevel: 3,
    dueAt: NOW,
  });
  item = addRephrasedVariant(item, "Level 1 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 1 });
  item = addRephrasedVariant(item, "Level 2 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  const next = getNextReviewItem(deckWith(item), { now: NOW });

  assert.equal(next.ratingButtonOptions.again.intervalLabel, "5 Min.");
  assert.equal(next.ratingButtonOptions.good.rating, "good");
  assert.equal(next.answerSideAnchorMiniCard.shouldShow, true);
  assert.equal(typeof next.variantReadiness.allowAiRephrasing, "boolean");
});

test("maturity and AI recommendation stay conservative through learning and early review", () => {
  const item = newItem();
  const original = getOriginalVariant(item);
  const first = answerVariant(deckWith(item), item.id, original.id, "good", { now: NOW });
  const afterFirst = first.updatedCard;
  const second = answerVariant(first.deck, afterFirst.id, getOriginalVariant(afterFirst).id, "good", { now: "2026-07-07T10:15:00.000Z" });
  const afterSecond = second.updatedCard;

  assert.equal(getLearningItemMaturity(afterFirst, "2026-07-07T10:15:00.000Z", first.deck.reviewEvents).stage, "learning");
  assert.equal(getVariantGenerationRecommendation(afterFirst, first.deck.reviewEvents, { now: "2026-07-07T10:15:00.000Z" }).shouldSuggest, false);
  assert.equal(getLearningItemMaturity(afterSecond, "2026-07-07T10:15:00.000Z", second.deck.reviewEvents).stage, "early_review");
  assert.equal(getVariantGenerationRecommendation(afterSecond, second.deck.reviewEvents, { now: "2026-07-07T10:15:00.000Z" }).shouldSuggest, false);
});

test("variant again activates fallback and blocks AI recommendation until corrected", () => {
  let item = reviewItem({ preferredVariantLevel: 3 });
  item = addRephrasedVariant(item, "Level 1 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 1 });
  item = addRephrasedVariant(item, "Level 2 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  item = addRephrasedVariant(item, "Level 3 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 3 });
  const level2 = getActiveVariants(item).find((variant) => variant.variantLevel === 2);
  const level3 = getActiveVariants(item).find((variant) => variant.variantLevel === 3);
  const failed = answerVariant(deckWith(item), item.id, level3.id, "again", { now: NOW });
  const next = getNextReviewItem(failed.deck, { now: NOW });

  assert.equal(failed.updatedCard.reviewState.state, "relearning");
  assert.equal(failed.updatedCard.reviewState.fallbackUntilCorrect, true);
  assert.equal(failed.updatedCard.reviewState.forcedVariantId, level2.id);
  assert.equal(next.variant.id, level2.id);
  assert.equal(next.ratingButtonOptions.again.intervalLabel, "5 Min.");
  assert.equal(next.variantGenerationRecommendation.shouldSuggest, false);
});

test("normalized imported cards start with learning-step button options", () => {
  const imported = importNormalizedDeck({
    title: "Import",
    sourceType: "json_import",
    items: [
      {
        canonicalQuestion: "Importierte Frage?",
        canonicalAnswer: "Importierte Antwort.",
      },
    ],
  });
  const next = getNextReviewItem(imported.deck, { now: NOW });

  assert.equal(next.reviewState.schedulerVersion, "fsrs_v1");
  assert.equal(next.reviewState.state, "new");
  assert.equal(next.ratingButtonOptions.good.intervalLabel, "15 Min.");
  assert.equal(next.ratingButtonOptions.easy.intervalLabel, "30 Min.");
});
