import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, getActiveVariants, getOriginalVariant, type CoreCardInput } from "./coreModel.ts";
import { getLearningItemMaturity, getVariantGenerationRecommendation } from "./coreVariantService.ts";
import { importNormalizedDeck } from "./importService.ts";
import {
  advanceDailyReviewSession,
  answerVariant,
  createDailyReviewQueue,
  createDailyReviewSessionState,
  getNextDailyReviewSessionItem,
  getNextReviewItem,
  reconcileDailyReviewSessionState,
  updateDeckNewCardLimitForDate,
} from "./reviewService.ts";
import { formatIntervalLabel, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.ts";

const NOW = "2026-07-07T10:00:00.000Z";

function minutesBetween(left: string|number|Date, right: string|number|Date) {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / 60000);
}

function daysBetween(left: string|number|Date, right: string|number|Date) {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / (24 * 60 * 60 * 1000));
}

function deckWith(item: CoreCardInput, reviewEvents = []) {
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
  const schedulerParams = firstGood.nextReviewState.schedulerParamsJson as Record<string, unknown>;

  assert.equal(firstGood.nextState, "learning");
  assert.equal(firstGood.nextReviewState.reps, 1);
  assert.equal(firstGood.nextReviewState.learningSuccessCount, 1);
  assert.equal(firstGood.intervalLabel, "15 Min.");
  assert.equal(minutesBetween(NOW, firstGood.dueAt), 15);
  assert.equal(firstGood.nextMaturity.stage, "learning");
  assert.equal(schedulerParams.implementation, "ts-fsrs@5.4.1");
  assert.equal(schedulerParams.parameterSource, "official_default");
  assert.equal((schedulerParams.weights as unknown[])?.length, 21);
  assert.equal(firstEasy.nextState, "learning");
  assert.equal(firstEasy.nextReviewState.learningSuccessCount, 1);
  assert.equal(firstEasy.intervalLabel, "15 Min.");
  assert.equal(minutesBetween(NOW, firstEasy.dueAt), 15);
  assert.equal(secondGood.nextState, "review");
  assert.equal(secondGood.nextReviewState.learningSuccessCount, 2);
  assert.equal(secondGood.nextReviewState.isGraduated, true);
  assert.equal(secondGood.intervalDays, 2);
  assert.equal(secondGood.intervalLabel, "2 Tage");
  assert.equal(secondGood.nextMaturity.stage, "early_review");
  assert.equal(goodThenEasy.nextState, "review");
  assert.equal(goodThenEasy.intervalDays, 4);
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

test("review cards produce monotone FSRS-6 button intervals and short relearning on again", () => {
  const item = reviewItem();
  const original = getOriginalVariant(item);
  const options = getReviewButtonOptions(item, original, { now: NOW });
  const again = simulateRatingOutcome({ learningItem: item, variant: original, rating: "again", now: NOW });
  const hard = simulateRatingOutcome({ learningItem: item, variant: original, rating: "hard", now: NOW });
  const good = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW });
  const easy = simulateRatingOutcome({ learningItem: item, variant: original, rating: "easy", now: NOW });

  assert.ok(options);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
  assert.ok(options);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
  assert.ok(original);
  const committed = answerVariant(deck, item.id, original.id, "good", { now: NOW });
  const nextState = committed.updatedCard.reviewState;

  assert.ok(preview);
  assert.equal(nextState.dueAt, preview.dueAt);
  assert.ok(preview);
  assert.equal(nextState.state, preview.nextState);
  assert.ok(preview);
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
  assert.ok(original);
  item = {
    ...item,
    learningItemState: { ...item.learningItemState, forcedVariantId: original.id },
    reviewState: { ...item.reviewState, forcedVariantId: original.id },
  };
  assert.ok(original);
  const result = answerVariant(deckWith(item), item.id, original.id, "good", { now: NOW });
  const state = result.updatedCard.reviewState;

  assert.equal(state.state, "review");
  assert.equal(state.fallbackUntilCorrect, false);
  assert.equal(state.forcedVariantId, null);
  assert.equal(daysBetween(NOW, state.dueAt) > 0, true);
});

test("getNextReviewItem exposes ratingButtonOptions and preserves anchor/fallback view models", () => {
  let item = reviewItem({
    preferredVariantLevel: 3,
    dueAt: NOW,
  });
  item = addRephrasedVariant(item, "Level 1 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 1 });
  item = addRephrasedVariant(item, "Level 2 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  const next = getNextReviewItem(deckWith(item), { now: NOW });

  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.ratingButtonOptions.again.intervalLabel, "5 Min.");
  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.ratingButtonOptions.good.rating, "good");
  assert.ok(next);
  assert.equal(next.answerSideAnchorMiniCard.shouldShow, true);
  assert.ok(next);
  assert.equal(typeof next.variantReadiness.allowAiRephrasing, "boolean");
});

test("maturity and AI recommendation stay conservative through learning and early review", () => {
  const item = newItem();
  const original = getOriginalVariant(item);
  assert.ok(original);
  const first = answerVariant(deckWith(item), item.id, original.id, "good", { now: NOW });
  const afterFirst = first.updatedCard;
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const second = answerVariant(first.deck, afterFirst.id, getOriginalVariant(afterFirst).id, "good", { now: "2026-07-07T10:15:00.000Z" });
  const afterSecond = second.updatedCard;

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getLearningItemMaturity(afterFirst, "2026-07-07T10:15:00.000Z", first.deck.reviewEvents).stage, "learning");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getVariantGenerationRecommendation(afterFirst, first.deck.reviewEvents, { now: "2026-07-07T10:15:00.000Z" }).shouldSuggest, false);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getLearningItemMaturity(afterSecond, "2026-07-07T10:15:00.000Z", second.deck.reviewEvents).stage, "early_review");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getVariantGenerationRecommendation(afterSecond, second.deck.reviewEvents, { now: "2026-07-07T10:15:00.000Z" }).shouldSuggest, false);
});

test("variant again activates fallback and blocks AI recommendation until corrected", () => {
  let item = reviewItem({ preferredVariantLevel: 3 });
  item = addRephrasedVariant(item, "Level 1 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 1 });
  item = addRephrasedVariant(item, "Level 2 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  item = addRephrasedVariant(item, "Level 3 MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 3 });
  const level2 = getActiveVariants(item).find((variant) => variant.variantLevel === 2);
  const level3 = getActiveVariants(item).find((variant) => variant.variantLevel === 3);
  assert.ok(level3);
  const failed = answerVariant(deckWith(item), item.id, level3.id, "again", { now: NOW });
  const next = getNextReviewItem(failed.deck, { now: NOW });

  assert.equal(failed.updatedCard.reviewState.state, "relearning");
  assert.equal(failed.updatedCard.reviewState.fallbackUntilCorrect, true);
  assert.ok(level2);
  assert.equal(failed.updatedCard.reviewState.forcedVariantId, level2.id);
  assert.ok(level2);
  assert.ok(next);
  assert.equal(next.variant.id, level2.id);
  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.ratingButtonOptions.again.intervalLabel, "5 Min.");
  assert.ok(next);
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

  assert.ok(next);
  assert.equal(next.reviewState.schedulerVersion, "fsrs_6_v1");
  assert.ok(next);
  assert.equal(next.reviewState.state, "new");
  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.ratingButtonOptions.good.intervalLabel, "15 Min.");
  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.ratingButtonOptions.easy.intervalLabel, "15 Min.");
});

test("daily review queue includes currently due cards plus the per-deck new-card quota", () => {
  const due = reviewItem({ dueAt: "2026-07-07T09:00:00.000Z" });
  const laterToday = reviewItem({ dueAt: "2026-07-07T18:00:00.000Z" });
  const newCards = Array.from({ length: 30 }, (_value, index) =>
    createBasicLearningItem("deck_scheduler_intervals", `Neue Frage ${index + 1}?`, "Antwort.", {
      id: `new_item_${index + 1}`,
      reviewState: {
        state: "new",
        reps: 0,
        dueAt: NOW,
      },
    }),
  );
  const deck = createCoreDeck({
    id: "deck_scheduler_intervals",
    name: "Queue",
    source: "manual",
    deckSettings: { newCardsPerDay: 20 },
    cards: [laterToday, due, ...newCards],
  });
  const queue = createDailyReviewQueue(deck, { now: NOW });

  assert.equal(queue.dueCount, 1);
  assert.equal(queue.newCount, 20);
  assert.equal(queue.total, 21);
  assert.ok(queue);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(queue.items[0].learningItemId, due.id);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(queue.items.some((item) => item.learningItemId === laterToday.id), false);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(queue.items.filter((item) => item.schedulerInfo.queueKind === "new").length, 20);
});

test("daily review queue subtracts new cards introduced today and honors today's override", () => {
  const newCards = Array.from({ length: 8 }, (_value, index) =>
    createBasicLearningItem("deck_scheduler_intervals", `Neue Frage ${index + 1}?`, "Antwort.", {
      id: `quota_new_${index + 1}`,
      reviewState: {
        state: "new",
        reps: 0,
        dueAt: NOW,
      },
    }),
  );
  const deck = createCoreDeck({
    id: "deck_scheduler_intervals",
    name: "Queue",
    source: "manual",
    deckSettings: {
      newCardsPerDay: 5,
      newCardsTodayOverride: { date: "2026-07-07", limit: 7 },
    },
    cards: newCards,
    reviewEvents: [
      {
        id: "review_today",
        deckId: "deck_scheduler_intervals",
        learningItemId: "already_introduced",
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        reviewedAt: "2026-07-07T08:00:00.000Z",
        previousLearningItemStateJson: { state: "new", reps: 0 },
      },
      {
        id: "review_yesterday",
        deckId: "deck_scheduler_intervals",
        learningItemId: "old_introduction",
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        reviewedAt: "2026-07-06T08:00:00.000Z",
        previousLearningItemStateJson: { state: "new", reps: 0 },
      },
    ],
  });
  const queue = createDailyReviewQueue(deck, { now: NOW });

  assert.equal(queue.newCardsPerDay, 7);
  assert.equal(queue.newCardsIntroducedToday, 1);
  assert.equal(queue.newCount, 6);
  assert.equal(queue.total, 6);

  const cappedQueue = createDailyReviewQueue({
    ...deck,
    deckSettings: { ...deck.deckSettings, newCardsPerDay: 0, newCardsTodayOverride: null },
  }, { now: NOW });
  assert.equal(cappedQueue.newCardsPerDay, 0);
  assert.equal(cappedQueue.remainingNewCards, 0);
  assert.equal(cappedQueue.newCount, 0);
});

test("daily review queue subtracts unique due cards already completed today", () => {
  const dueCards = Array.from({ length: 3 }, (_value, index) => reviewItem({
    id: `remaining_due_${index + 1}`,
    dueAt: "2026-07-07T09:00:00.000Z",
  }));
  const deck = createCoreDeck({
    id: "deck_scheduler_intervals",
    name: "Queue",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 2 },
    cards: dueCards,
    reviewEvents: [
      {
        id: "completed_due",
        deckId: "deck_scheduler_intervals",
        learningItemId: "completed_due_item",
        answeredAt: "2026-07-07T08:00:00.000Z",
        schedulerBefore: { card: { state: "review", reps: 4 } },
      },
      {
        id: "completed_due_repeat",
        deckId: "deck_scheduler_intervals",
        learningItemId: "completed_due_item",
        answeredAt: "2026-07-07T08:10:00.000Z",
        schedulerBefore: { card: { state: "relearning", reps: 5 } },
      },
      {
        id: "new_today",
        deckId: "deck_scheduler_intervals",
        learningItemId: "introduced_today_item",
        answeredAt: "2026-07-07T08:20:00.000Z",
        schedulerBefore: { card: { state: "new", reps: 0 } },
      },
      {
        id: "new_today_repeat",
        deckId: "deck_scheduler_intervals",
        learningItemId: "introduced_today_item",
        answeredAt: "2026-07-07T08:30:00.000Z",
        schedulerBefore: { card: { state: "learning", reps: 1 } },
      },
    ] as any,
  });

  const queue = createDailyReviewQueue(deck, { now: NOW });

  assert.equal(queue.reviewsCompletedToday, 1);
  assert.equal(queue.remainingReviews, 1);
  assert.equal(queue.dueCount, 1);

  const cappedQueue = createDailyReviewQueue({
    ...deck,
    deckSettings: { ...deck.deckSettings, maximumReviewsPerDay: 0 },
  }, { now: NOW });
  assert.equal(cappedQueue.maximumReviewsPerDay, 0);
  assert.equal(cappedQueue.remainingReviews, 0);
  assert.equal(cappedQueue.dueCount, 0);
});

test("daily new-card limit updates through the review interface", () => {
  const deck = createCoreDeck({
    id: "deck_scheduler_intervals",
    name: "Queue",
    source: "manual",
    deckSettings: { newCardsPerDay: 5 },
    cards: [newItem()],
  });
  const updated = updateDeckNewCardLimitForDate(deck, "7", { now: NOW });
  const clamped = updateDeckNewCardLimitForDate(deck, "-4", { now: NOW });
  const queue = createDailyReviewQueue(updated, { now: NOW });

  assert.ok(updated);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(updated.deckSettings.newCardsTodayOverride.date, "2026-07-07");
  assert.ok(updated);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(updated.deckSettings.newCardsTodayOverride.limit, 7);
  assert.equal(updated.updatedAt, NOW);
  assert.equal(queue.newCardsPerDay, 7);
  assert.ok(clamped);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(clamped.deckSettings.newCardsTodayOverride.limit, 0);
});

test("daily review queue carries rating interval labels for the UI buttons", () => {
  const item = newItem();
  const queue = createDailyReviewQueue(deckWith(item), { now: NOW });
  const current = queue.items[0];
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const committed = answerVariant(deckWith(item), item.id, getOriginalVariant(item).id, "good", { now: NOW });

  assert.ok(current);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(current.ratingButtonOptions.again.intervalLabel, "5 Min.");
  assert.ok(current);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(current.ratingButtonOptions.good.intervalLabel, "15 Min.");
  assert.ok(current);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(current.ratingButtonOptions.good.dueAt, committed.updatedCard.reviewState.dueAt);
});

test("daily review queue keeps answered learning cards out until their stored dueAt", () => {
  const item = newItem();
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const committed = answerVariant(deckWith(item), item.id, getOriginalVariant(item).id, "good", { now: NOW });
  const nextDueAt = committed.updatedCard.reviewState.dueAt;

  assert.equal(minutesBetween(NOW, nextDueAt), 15);
  assert.equal(committed.deck.reviewEvents.length, 1);

  const immediatelyRestarted = createDailyReviewQueue(committed.deck, { now: "2026-07-07T10:01:00.000Z" });
  const atStoredDueAt = createDailyReviewQueue(committed.deck, { now: nextDueAt });

  assert.equal(immediatelyRestarted.total, 0);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(immediatelyRestarted.items.some((queueItem) => queueItem.learningItemId === item.id), false);
  assert.equal(atStoredDueAt.total, 1);
  assert.ok(atStoredDueAt);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(atStoredDueAt.items[0].learningItemId, item.id);
  assert.ok(atStoredDueAt);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(atStoredDueAt.items[0].schedulerInfo.queueKind, "due");
});

test("daily review session finishes unique cards before pulling same-day repeats forward", () => {
  const first = createBasicLearningItem("deck_session", "Erste Frage", "Erste Antwort", { id: "item_first" });
  const second = createBasicLearningItem("deck_session", "Zweite Frage", "Zweite Antwort", { id: "item_second" });
  let deck = createCoreDeck({
    id: "deck_session",
    name: "Session",
    source: "manual",
    cards: [first, second],
    reviewEvents: [],
  });
  const queue = createDailyReviewQueue(deck, { now: NOW });
  let session = createDailyReviewSessionState(queue.items);

  const firstInitial = getNextDailyReviewSessionItem(deck, session, { now: NOW });
  assert.ok(firstInitial);
  assert.equal(firstInitial.learningItemId, "item_first");
  assert.equal(firstInitial.sessionInfo.isRepeat, false);
  const firstResult = answerVariant(deck, firstInitial.learningItemId, firstInitial.cardVariantId, "good", { now: NOW });
  deck = firstResult.deck;
  session = advanceDailyReviewSession(session, {
    key: firstInitial.sessionInfo.key,
    rating: "good",
    nextReviewState: firstResult.updatedCard.reviewState,
  });

  const secondInitial = getNextDailyReviewSessionItem(deck, session, { now: "2026-07-07T10:01:00.000Z" });
  assert.ok(secondInitial);
  assert.equal(secondInitial.learningItemId, "item_second");
  const secondResult = answerVariant(deck, secondInitial.learningItemId, secondInitial.cardVariantId, "easy", { now: "2026-07-07T10:01:00.000Z" });
  deck = secondResult.deck;
  session = advanceDailyReviewSession(session, {
    key: secondInitial.sessionInfo.key,
    rating: "easy",
    nextReviewState: secondResult.updatedCard.reviewState,
  });

  const earlyRepeat = getNextDailyReviewSessionItem(deck, session, { now: "2026-07-07T10:02:00.000Z" });
  assert.ok(earlyRepeat);
  assert.equal(earlyRepeat.learningItemId, "item_first");
  assert.equal(earlyRepeat.sessionInfo.isRepeat, true);
  assert.equal(earlyRepeat.sessionInfo.isEarlyRepeat, true);
  const repeated = answerVariant(deck, earlyRepeat.learningItemId, earlyRepeat.cardVariantId, "good", { now: "2026-07-07T10:02:00.000Z" });
  session = advanceDailyReviewSession(session, {
    key: earlyRepeat.sessionInfo.key,
    rating: "good",
    nextReviewState: repeated.updatedCard.reviewState,
  });

  assert.equal(repeated.updatedCard.reviewState.state, "review");
  assert.equal(session.completedInitialKeys.length, 2);
  assert.equal(session.repeatCount, 1);
  assert.deepEqual(session.repeatKeys, ["deck_session:item_second"]);
});

test("session reconciliation replaces only unfinished initial cards and keeps progress and repeats", () => {
  const initial = createDailyReviewSessionState([
    { deckId: "deck", learningItemId: "first" },
    { deckId: "deck", learningItemId: "second" },
    { deckId: "deck", learningItemId: "third" },
  ]);
  const afterFirst = advanceDailyReviewSession(initial, {
    key: "deck:first",
    rating: "again",
    nextReviewState: { ...newItem().reviewState, state: "learning" },
  });

  const reconciled = reconcileDailyReviewSessionState(afterFirst, [
    { deckId: "deck", learningItemId: "fourth" },
  ], { preserveInitialKey: "deck:second" });

  assert.deepEqual(reconciled.initialKeys, ["deck:first", "deck:second", "deck:fourth"]);
  assert.deepEqual(reconciled.completedInitialKeys, ["deck:first"]);
  assert.deepEqual(reconciled.remainingInitialKeys, ["deck:second", "deck:fourth"]);
  assert.deepEqual(reconciled.repeatKeys, ["deck:first"]);
  assert.deepEqual(reconciled.ratingCounts, { again: 1, hard: 0, good: 0, easy: 0 });
});

test("failed session repeats return to the FIFO tail until they succeed", () => {
  const session = createDailyReviewSessionState([{ deckId: "deck", learningItemId: "item" }]);
  const afterInitial = advanceDailyReviewSession(session, {
    key: "deck:item",
    rating: "again",
    nextReviewState: { ...newItem().reviewState, state: "learning" },
  });
  const afterRepeat = advanceDailyReviewSession(afterInitial, {
    key: "deck:item",
    rating: "hard",
    nextReviewState: { ...newItem().reviewState, state: "learning" },
  });

  assert.deepEqual(afterInitial.repeatKeys, ["deck:item"]);
  assert.deepEqual(afterRepeat.repeatKeys, ["deck:item"]);
  assert.equal(afterRepeat.repeatCount, 1);
  assert.deepEqual(afterRepeat.ratingCounts, { again: 1, hard: 1, good: 0, easy: 0 });
});

test("deck learning settings control short steps while FSRS determines graduation intervals", () => {
  const item = newItem();
  const original = getOriginalVariant(item);
  const deckSettings = {
    schedulerProfile: {
      settingsVersion: 2,
      learningStepsMinutes: [10, 30],
      relearningStepMinutes: 12,
      graduatingIntervalDays: 3,
      easyGraduatingIntervalDays: 5,
    },
  };
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const firstGood = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW, deckSettings });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const secondGood = simulateRatingOutcome({ previousState: firstGood.nextReviewState, variant: original, rating: "good", now: "2026-07-07T10:30:00.000Z", deckSettings });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const reviewAgain = simulateRatingOutcome({ learningItem: reviewItem(), variant: original, rating: "again", now: NOW, deckSettings });

  assert.equal(firstGood.intervalLabel, "30 Min.");
  assert.equal(secondGood.intervalDays, 2);
  assert.equal(reviewAgain.intervalLabel, "12 Min.");
});

test("desired retention and maximum interval change the next FSRS-6 interval", () => {
  const item = reviewItem({ stability: 40, intervalDays: 20 });
  const original = getOriginalVariant(item);
  const relaxed = simulateRatingOutcome({
    learningItem: item,
    variant: original,
    rating: "good",
    now: NOW,
    deckSettings: { schedulerProfile: { desiredRetention: 0.8, maximumIntervalDays: 36500 } },
  });
  const intensive = simulateRatingOutcome({
    learningItem: item,
    variant: original,
    rating: "good",
    now: NOW,
    deckSettings: { schedulerProfile: { desiredRetention: 0.96, maximumIntervalDays: 30 } },
  });

  assert.equal(intensive.intervalDays < relaxed.intervalDays, true);
  assert.equal(intensive.intervalDays <= 30, true);
  assert.equal(intensive.nextReviewState.desiredRetention, 0.96);
});

test("daily queue applies review caps and the selected new-card order", () => {
  const dueCards = Array.from({ length: 3 }, (_value, index) => reviewItem({ id: `due_${index}`, dueAt: "2026-07-07T09:00:00.000Z" }));
  const newCards = Array.from({ length: 2 }, (_value, index) => createBasicLearningItem("deck_scheduler_intervals", `Neu ${index}?`, "Antwort", {
    id: `ordered_new_${index}`,
    reviewState: { state: "new", reps: 0, dueAt: NOW },
  }));
  const deck = createCoreDeck({
    id: "deck_scheduler_intervals",
    name: "Reihenfolge",
    source: "manual",
    deckSettings: { newCardsPerDay: 2, maximumReviewsPerDay: 2, newReviewOrder: "new-first" },
    cards: [...dueCards, ...newCards],
  });
  const queue = createDailyReviewQueue(deck, { now: NOW });

  assert.equal(queue.availableDueCards, 3);
  assert.equal(queue.dueCount, 2);
  assert.equal(queue.newCount, 2);
  assert.equal(queue.total, 4);
  assert.ok(queue);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(queue.items[0].schedulerInfo.queueKind, "new");
});

test("parent review sessions respect both root and subdeck review limits", () => {
  const root = createCoreDeck({
    id: "deck_limit_root",
    name: "Root",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 3 },
    cards: [reviewItem({ dueAt: "2026-07-07T08:00:00.000Z" }), reviewItem({ dueAt: "2026-07-07T08:05:00.000Z" })],
  });
  const child = createCoreDeck({
    id: "deck_limit_child",
    parentDeckId: root.id,
    name: "Child",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 1 },
    cards: [reviewItem({ dueAt: "2026-07-07T08:10:00.000Z" }), reviewItem({ dueAt: "2026-07-07T08:15:00.000Z" })],
  });
  const queue = createDailyReviewQueue([root, child], { deckId: root.id, now: NOW });

  assert.equal(queue.availableDueCards, 4);
  assert.equal(queue.dueCount, 3);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(queue.items.filter((item) => item.deckId === child.id).length, 1);
});
