import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, getActiveVariants, getOriginalVariant, updateLearningItemStudyState, type CoreCardInput } from "./coreModel.ts";
import { getLearningItemMaturity, getVariantGenerationRecommendation } from "./coreVariantService.ts";
import { importNormalizedDeck } from "./importService.ts";
import { DEFAULT_EASY_DAYS, EASY_DAY_KEYS } from "./easyDays.ts";
import { getLearningDayKey } from "./learningDay.ts";
import {
  advanceDailyReviewSession,
  answerVariant,
  createDailyReviewQueue,
  createDailyReviewSessionState,
  getNextDailyReviewSessionItem,
  getNextReviewItem,
  reconcileDailyReviewSessionState,
  removeDailyReviewSessionItem,
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

function dailyProgressItem(deckId: string, id: string, reviewState: Record<string, unknown>) {
  return createBasicLearningItem(deckId, `Frage ${id}`, `Antwort ${id}`, { id, reviewState });
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
  assert.equal(firstEasy.nextState, "review");
  assert.equal(firstEasy.nextReviewState.learningSuccessCount, 2);
  assert.equal(firstEasy.nextReviewState.isGraduated, true);
  assert.equal(firstEasy.intervalDays > 0, true);
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
  assert.equal(next.ratingButtonOptions.easy.intervalLabel, "8 Tage");
});

test("daily review queue includes all review cards due on the learning day plus the per-deck new-card quota", () => {
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

  assert.equal(queue.dueCount, 2);
  assert.equal(queue.newCount, 20);
  assert.equal(queue.total, 22);
  assert.ok(queue);
  assert.equal(queue.items[0].learningItemId, due.id);
  assert.equal(queue.items.some((item) => item.learningItemId === laterToday.id), true);
  assert.equal(queue.items.filter((item) => item.queueKind === "new").length, 20);
});

test("daily progress reconstructs learned, new, in-progress and due cards from saved review data", () => {
  const deckId = "deck_daily_progress";
  const newCards = Array.from({ length: 3 }, (_value, index) => dailyProgressItem(deckId, `new_${index + 1}`, {
    state: "new",
    reps: 0,
    dueAt: NOW,
  }));
  const dueCards = Array.from({ length: 7 }, (_value, index) => dailyProgressItem(deckId, `due_${index + 1}`, {
    state: "review",
    reps: 4,
    repetitions: 4,
    lapses: 0,
    stability: 6,
    difficulty: 5,
    intervalDays: 4,
    dueAt: "2026-07-07T09:00:00.000Z",
    lastReviewedAt: "2026-07-01T10:00:00.000Z",
  }));
  let deck = createCoreDeck({
    id: deckId,
    name: "Tagesfortschritt",
    source: "manual",
    deckSettings: { newCardsPerDay: 3, maximumReviewsPerDay: 7 },
    cards: [...newCards, ...dueCards],
    reviewEvents: [],
  });

  assert.deepEqual(createDailyReviewQueue(deck, { now: NOW }).dailyProgress, {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 0,
    dueCount: 7,
    total: 7,
  });

  const failedDue = deck.cards.find((item) => item.id === "due_1");
  assert.ok(failedDue);
  const failedDueVariant = getOriginalVariant(failedDue);
  assert.ok(failedDueVariant);
  deck = answerVariant(deck, failedDue.id, failedDueVariant.id, "again", { now: NOW }).deck;
  assert.deepEqual(createDailyReviewQueue(deck, { now: "2026-07-07T10:01:00.000Z" }).dailyProgress, {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 1,
    dueCount: 6,
    total: 7,
  });

  const completedDue = deck.cards.find((item) => item.id === "due_2");
  assert.ok(completedDue);
  const completedDueVariant = getOriginalVariant(completedDue);
  assert.ok(completedDueVariant);
  deck = answerVariant(deck, completedDue.id, completedDueVariant.id, "good", { now: "2026-07-07T10:01:00.000Z" }).deck;
  assert.deepEqual(createDailyReviewQueue(deck, { now: "2026-07-07T10:02:00.000Z" }).dailyProgress, {
    completedTodayCount: 1,
    newCount: 0,
    inProgressCount: 1,
    dueCount: 5,
    total: 7,
  });
});

test("daily progress keeps a new card in progress until its final Good learning step", () => {
  const deckId = "deck_new_progress";
  const item = dailyProgressItem(deckId, "new_progress", { state: "new", reps: 0, dueAt: NOW });
  let deck = createCoreDeck({
    id: deckId,
    name: "Neue Karte",
    source: "manual",
    deckSettings: { newCardsPerDay: 1 },
    cards: [item],
    reviewEvents: [],
  });

  const originalVariant = getOriginalVariant(item);
  assert.ok(originalVariant);
  const first = answerVariant(deck, item.id, originalVariant.id, "good", { now: NOW });
  deck = first.deck;
  const restarted = createDailyReviewQueue(deck, { now: "2026-07-07T10:01:00.000Z" });
  assert.equal(restarted.total, 1);
  assert.deepEqual(restarted.dailyProgress, {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 1,
    dueCount: 0,
    total: 1,
  });

  const repeatedItem = deck.cards.find((candidate) => candidate.id === item.id);
  assert.ok(repeatedItem);
  const repeatedVariant = getOriginalVariant(repeatedItem);
  assert.ok(repeatedVariant);
  deck = answerVariant(deck, repeatedItem.id, repeatedVariant.id, "good", { now: first.updatedCard.reviewState.dueAt }).deck;
  assert.deepEqual(createDailyReviewQueue(deck, { now: first.updatedCard.reviewState.dueAt }).dailyProgress, {
    completedTodayCount: 1,
    newCount: 0,
    inProgressCount: 0,
    dueCount: 0,
    total: 1,
  });

  assert.equal(createDailyReviewQueue(deck, { now: "2026-07-08T10:00:00.000Z" }).dailyProgress.completedTodayCount, 0);
});

test("daily progress treats review cards as due for their whole learning day", () => {
  const deckId = "deck_dynamic_progress";
  const deck = createCoreDeck({
    id: deckId,
    name: "Dynamischer Fortschritt",
    source: "manual",
    cards: [
      dailyProgressItem(deckId, "due_now", { state: "review", reps: 3, dueAt: "2026-07-07T09:00:00.000Z" }),
      dailyProgressItem(deckId, "due_later", { state: "review", reps: 3, dueAt: "2026-07-07T18:00:00.000Z" }),
    ],
  });

  assert.deepEqual(createDailyReviewQueue(deck, { now: NOW }).dailyProgress, {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 0,
    dueCount: 2,
    total: 2,
  });
  assert.equal(createDailyReviewQueue(deck, { now: "2026-07-07T18:00:00.000Z" }).dailyProgress.total, 2);
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
  assert.equal(queue.remainingReviews, 0);
  assert.equal(queue.dueCount, 0);

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
  const deck = deckWith(item);
  const queue = createDailyReviewQueue(deck, { now: NOW });
  const current = getNextDailyReviewSessionItem(deck, createDailyReviewSessionState(queue.items), { now: NOW });
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const committed = answerVariant(deck, item.id, getOriginalVariant(item).id, "good", { now: NOW });

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

test("daily review queue uses the configured learn-ahead window after reopening", () => {
  const item = newItem();
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const committed = answerVariant(deckWith(item), item.id, getOriginalVariant(item).id, "good", { now: NOW });
  const nextDueAt = committed.updatedCard.reviewState.dueAt;

  assert.equal(minutesBetween(NOW, nextDueAt), 15);
  assert.equal(committed.deck.reviewEvents.length, 1);

  const immediatelyRestarted = createDailyReviewQueue(committed.deck, { now: "2026-07-07T10:01:00.000Z" });
  const atStoredDueAt = createDailyReviewQueue(committed.deck, { now: nextDueAt });

  assert.equal(immediatelyRestarted.total, 1);
  assert.equal(immediatelyRestarted.items.some((queueItem) => queueItem.learningItemId === item.id), true);
  assert.equal(atStoredDueAt.total, 1);
  assert.ok(atStoredDueAt);
  assert.equal(atStoredDueAt.items[0].learningItemId, item.id);
  assert.ok(atStoredDueAt);
  assert.equal(atStoredDueAt.items[0].queueKind, "due");
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
  assert.deepEqual(session.repeatKeys, []);
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

test("removing a suspended session item does not record review progress", () => {
  const initial = createDailyReviewSessionState([
    { deckId: "deck", learningItemId: "first" },
    { deckId: "deck", learningItemId: "second" },
  ]);
  const withoutFirst = removeDailyReviewSessionItem(initial, "deck:first");

  assert.deepEqual(withoutFirst.initialKeys, ["deck:second"]);
  assert.deepEqual(withoutFirst.remainingInitialKeys, ["deck:second"]);
  assert.deepEqual(withoutFirst.completedInitialKeys, []);
  assert.deepEqual(withoutFirst.ratingCounts, initial.ratingCounts);

  const repeated = {
    ...withoutFirst,
    completedInitialKeys: ["deck:second"],
    repeatKeys: ["deck:second"],
  };
  const withoutRepeat = removeDailyReviewSessionItem(repeated, "deck:second");
  assert.deepEqual(withoutRepeat.repeatKeys, []);
  assert.deepEqual(withoutRepeat.completedInitialKeys, ["deck:second"]);
});

test("suspension removes a card from future queues and reactivation restores it", () => {
  const item = newItem();
  const suspended = updateLearningItemStudyState(item, { suspended: true });
  const suspendedQueue = createDailyReviewQueue(deckWith(suspended), { now: NOW });
  const active = updateLearningItemStudyState(suspended, { suspended: false });
  const activeQueue = createDailyReviewQueue(deckWith(active), { now: NOW });
  const queuedItem = activeQueue.items[0];

  assert.equal(suspendedQueue.total, 0);
  assert.equal(activeQueue.total, 1);
  assert.ok(queuedItem);
  assert.equal(queuedItem.learningItemId, item.id);
});

test("suspension preserves state and due date for every scheduler phase", () => {
  const states = [
    { state: "new", reps: 0, dueAt: "2026-07-07T09:00:00.000Z" },
    { state: "learning", reps: 1, dueAt: "2026-07-07T09:00:00.000Z" },
    { state: "relearning", reps: 4, dueAt: "2026-07-07T10:10:00.000Z" },
    { state: "review", reps: 4, dueAt: "2026-07-07T09:00:00.000Z" },
    { state: "review", reps: 4, dueAt: "2026-07-08T09:00:00.000Z" },
  ] as const;
  const cards = states.map((state, index) => dailyProgressItem("deck_suspension_matrix", `state_${index}`, state));
  const suspendedCards = cards.map((card) => updateLearningItemStudyState(card, { suspended: true }));
  const suspendedDeck = createCoreDeck({
    id: "deck_suspension_matrix",
    name: "Aussetzen",
    source: "manual",
    cards: suspendedCards,
  });

  assert.deepEqual(createDailyReviewQueue(suspendedDeck, { now: NOW }).dailyProgress, {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 0,
    dueCount: 0,
    total: 0,
  });

  const reactivatedCards = suspendedCards.map((card, index) => {
    const reactivated = updateLearningItemStudyState(card, { suspended: false });
    assert.deepEqual(reactivated.reviewState, cards[index].reviewState);
    assert.deepEqual(reactivated.learningItemState, cards[index].learningItemState);
    return reactivated;
  });
  const reactivatedQueue = createDailyReviewQueue({ ...suspendedDeck, cards: reactivatedCards }, { now: NOW });

  assert.equal(reactivatedQueue.dailyProgress.newCount, 1);
  assert.equal(reactivatedQueue.dailyProgress.inProgressCount, 2);
  assert.equal(reactivatedQueue.dailyProgress.dueCount, 1);
});

test("learn-ahead respects zero, its strict boundary, and the local day boundary", () => {
  const deckId = "deck_learn_ahead";
  const learningCard = (id: string, dueAt: string) => dailyProgressItem(deckId, id, {
    state: "learning",
    reps: 1,
    learningStepIndex: 0,
    dueAt,
  });
  const now = new Date(2026, 6, 7, 12, 0, 0);
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
  const deck = createCoreDeck({
    id: deckId,
    name: "Vorziehen",
    source: "manual",
    cards: [learningCard("inside", at(19)), learningCard("boundary", at(20)), learningCard("outside", at(21))],
  });
  const queue = createDailyReviewQueue(deck, { now, learnAheadMinutes: 20 });

  assert.deepEqual(queue.items.map((item) => item?.learningItemId), ["inside"]);
  assert.equal(queue.dailyProgress.inProgressCount, 3);
  assert.equal(createDailyReviewQueue(deck, { now, learnAheadMinutes: 0 }).total, 0);

  const beforeMidnight = new Date(2026, 6, 7, 23, 50, 0);
  const acrossMidnight = learningCard("tomorrow", new Date(beforeMidnight.getTime() + 10 * 60_000).toISOString());
  const dayBoundaryQueue = createDailyReviewQueue({ ...deck, cards: [acrossMidnight] }, { now: beforeMidnight });
  assert.equal(dayBoundaryQueue.total, 0);
  assert.equal(dayBoundaryQueue.dailyProgress.inProgressCount, 0);
});

test("a configured rollover controls review due days, daily accounting and learn-ahead", () => {
  const deckId = "deck_shifted_day";
  const options = { dayStartHour: 3, timeZone: "Europe/Berlin" };
  const duePreviousDay = dailyProgressItem(deckId, "due_previous", {
    state: "review",
    reps: 4,
    dueAt: "2026-07-10T20:00:00.000Z",
  });
  const dueNewDay = dailyProgressItem(deckId, "due_new", {
    state: "review",
    reps: 4,
    dueAt: "2026-07-11T08:00:00.000Z",
  });
  const crossingLearningStep = dailyProgressItem(deckId, "learning_new_day", {
    state: "learning",
    reps: 1,
    dueAt: "2026-07-11T01:05:00.000Z",
  });
  const deck = createCoreDeck({
    id: deckId,
    name: "Verschobener Tag",
    source: "manual",
    deckSettings: { learnAheadMinutes: 20 },
    cards: [duePreviousDay, dueNewDay, crossingLearningStep],
    reviewEvents: [{
      id: "review_early_morning",
      deckId,
      learningItemId: duePreviousDay.id,
      answeredAt: "2026-07-11T00:30:00.000Z",
      schedulerBefore: { card: { state: "review", reps: 3 } },
    }] as any,
  });

  const beforeRollover = createDailyReviewQueue(deck, { ...options, now: "2026-07-11T00:50:00.000Z" });
  assert.equal(beforeRollover.dateKey, "2026-07-10");
  assert.deepEqual(beforeRollover.items.map((item) => item?.learningItemId), [duePreviousDay.id]);
  assert.equal(beforeRollover.dailyProgress.completedTodayCount, 1);
  assert.equal(beforeRollover.dailyProgress.inProgressCount, 0);

  const atRollover = createDailyReviewQueue(deck, { ...options, now: "2026-07-11T01:00:00.000Z" });
  assert.equal(atRollover.dateKey, "2026-07-11");
  assert.deepEqual(new Set(atRollover.items.map((item) => item?.learningItemId)), new Set([duePreviousDay.id, dueNewDay.id, crossingLearningStep.id]));
  assert.equal(atRollover.dailyProgress.completedTodayCount, 0);

  const updated = updateDeckNewCardLimitForDate(deck, 7, { ...options, now: "2026-07-11T00:30:00.000Z" });
  assert.equal(updated.deckSettings.newCardsTodayOverride?.date, "2026-07-10");
});

test("scheduler preview and commit record the configured learning day", () => {
  const item = newItem();
  const original = getOriginalVariant(item);
  assert.ok(original);
  const context = {
    learningItem: item,
    variant: original,
    rating: "good" as const,
    now: "2026-07-11T00:30:00.000Z",
    dayStartHour: 3,
    timeZone: "Europe/Berlin",
  };
  const preview = simulateRatingOutcome(context);
  const committed = answerVariant(deckWith(item), item.id, original.id, "good", context);

  assert.equal(preview.nextReviewState.learningDayKey, "2026-07-10");
  assert.equal(committed.updatedCard.reviewState.learningDayKey, "2026-07-10");
  assert.equal(committed.updatedCard.reviewState.dueAt, preview.nextReviewState.dueAt);
});

test("the global learn-ahead option controls the whole started subtree", () => {
  const root = createCoreDeck({
    id: "deck_ahead_root",
    name: "Root",
    source: "manual",
    cards: [],
  });
  const childCard = dailyProgressItem("deck_ahead_child", "child_learning", {
    state: "learning",
    reps: 1,
    dueAt: "2026-07-07T10:10:00.000Z",
  });
  const child = createCoreDeck({
    id: "deck_ahead_child",
    parentDeckId: root.id,
    name: "Child",
    source: "manual",
    cards: [childCard],
  });

  assert.equal(createDailyReviewQueue([root, child], { deckId: root.id, now: NOW, learnAheadMinutes: 20 }).total, 1);
  assert.equal(createDailyReviewQueue([root, child], { deckId: child.id, now: NOW, learnAheadMinutes: 20 }).total, 1);
  assert.equal(createDailyReviewQueue([root, child], { deckId: root.id, now: NOW, learnAheadMinutes: 0 }).total, 0);
});

test("an ineligible FIFO repeat does not block a later eligible repeat", () => {
  const deckId = "deck_repeat_scan";
  const later = dailyProgressItem(deckId, "later", { state: "learning", reps: 1, dueAt: "2026-07-07T10:30:00.000Z" });
  const eligible = dailyProgressItem(deckId, "eligible", { state: "learning", reps: 1, dueAt: "2026-07-07T10:10:00.000Z" });
  const deck = createCoreDeck({ id: deckId, name: "FIFO", source: "manual", cards: [later, eligible] });
  const session = {
    ...createDailyReviewSessionState(),
    repeatKeys: [`${deckId}:later`, `${deckId}:eligible`],
  };
  const next = getNextDailyReviewSessionItem(deck, session, { deckId, now: NOW });

  assert.ok(next);
  assert.equal(next.learningItemId, "eligible");
  assert.equal(next.sessionInfo.isEarlyRepeat, true);
});

test("a next-day learning step counts as completed today and returns to In Arbeit tomorrow", () => {
  const deckId = "deck_next_day_progress";
  const now = new Date(2026, 6, 7, 23, 50, 0);
  const item = dailyProgressItem(deckId, "next_day", { state: "new", reps: 0, dueAt: now.toISOString() });
  const deck = deckWith(item);
  const original = getOriginalVariant(item);
  assert.ok(original);
  const answered = answerVariant({ ...deck, id: deckId, cards: [{ ...item, deckId }] }, item.id, original.id, "good", { now }).deck;
  const today = createDailyReviewQueue(answered, { now: new Date(now.getTime() + 60_000) }).dailyProgress;
  const tomorrow = createDailyReviewQueue(answered, { now: new Date(2026, 6, 8, 0, 1, 0) }).dailyProgress;

  assert.deepEqual(today, { completedTodayCount: 1, newCount: 0, inProgressCount: 0, dueCount: 0, total: 1 });
  assert.deepEqual(tomorrow, { completedTodayCount: 0, newCount: 0, inProgressCount: 1, dueCount: 0, total: 1 });
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
  const firstGood = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW, deckSettings });
  const secondGood = simulateRatingOutcome({ previousState: firstGood.nextReviewState, variant: original, rating: "good", now: "2026-07-07T10:30:00.000Z", deckSettings });
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

test("Easy Days adjusts review previews and commits identically without changing FSRS memory state", () => {
  const item = reviewItem({ stability: 6, intervalDays: 4 });
  const original = getOriginalVariant(item);
  const raw = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW });
  assert.equal(raw.intervalDays >= 3 && raw.intervalDays <= 90, true);
  const rawDayKey = getLearningDayKey(raw.dueAt, { timeZone: "Europe/Berlin", dayStartHour: 3 });
  assert.ok(rawDayKey);
  const weekday = EASY_DAY_KEYS[(new Date(`${rawDayKey}T12:00:00.000Z`).getUTCDay() + 6) % 7];
  const easyDaysContext = {
    easyDays: { ...DEFAULT_EASY_DAYS, [weekday]: "minimum" as const },
    dueCountsByDay: new Map<string, number>(),
    timeZone: "Europe/Berlin",
    dayStartHour: 3,
  };
  const adjusted = simulateRatingOutcome({ learningItem: item, variant: original, rating: "good", now: NOW, easyDaysContext });
  const committed = answerVariant(deckWith(item), item.id, original!.id, "good", { now: NOW, easyDaysContext });

  assert.notEqual(adjusted.intervalDays, raw.intervalDays);
  assert.equal(adjusted.dueAt, committed.updatedCard.reviewState.dueAt);
  assert.equal(adjusted.intervalDays, committed.updatedCard.reviewState.intervalDays);
  assert.equal(adjusted.nextReviewState.stability, raw.nextReviewState.stability);
  assert.equal(adjusted.nextReviewState.difficulty, raw.nextReviewState.difficulty);
  assert.equal(adjusted.nextReviewState.desiredRetention, raw.nextReviewState.desiredRetention);

  const learning = newItem();
  const learningVariant = getOriginalVariant(learning);
  const rawLearning = simulateRatingOutcome({ learningItem: learning, variant: learningVariant, rating: "good", now: NOW });
  const easyLearning = simulateRatingOutcome({ learningItem: learning, variant: learningVariant, rating: "good", now: NOW, easyDaysContext });
  assert.equal(easyLearning.dueAt, rawLearning.dueAt);
  assert.equal(easyLearning.intervalMinutes, rawLearning.intervalMinutes);
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
  assert.equal(queue.newCount, 0);
  assert.equal(queue.total, 2);
  assert.equal(queue.items[0]?.queueKind, "due");
});

test("parent review sessions apply the root review limit across the subtree", () => {
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
    deckSettings: { maximumReviewsPerDay: 0 },
    cards: [reviewItem({ dueAt: "2026-07-07T08:10:00.000Z" }), reviewItem({ dueAt: "2026-07-07T08:15:00.000Z" })],
  });
  const queue = createDailyReviewQueue([root, child], { deckId: root.id, now: NOW });

  assert.equal(queue.availableDueCards, 4);
  assert.equal(queue.dueCount, 2);
  assert.deepEqual(queue.dailyProgress, {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 0,
    dueCount: 2,
    total: 2,
  });
  assert.equal(queue.items.filter((item) => item.deckId === child.id).length, 0);
  assert.deepEqual(queue.limitSummary, { hiddenDueCount: 2, hiddenNewCount: 0, reached: true });
});

test("root, child and grandchild limits all constrain the active subtree path", () => {
  const due = (deckId: string, id: string, dueAt: string) => dailyProgressItem(deckId, id, {
    state: "review",
    reps: 4,
    stability: 6,
    difficulty: 5,
    dueAt,
    lastReviewedAt: "2026-07-01T10:00:00.000Z",
  });
  const root = createCoreDeck({
    id: "limit_tree_root",
    name: "Root",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 4 },
    cards: [due("limit_tree_root", "root_1", "2026-07-07T08:00:00.000Z"), due("limit_tree_root", "root_2", "2026-07-07T08:30:00.000Z")],
  });
  const child = createCoreDeck({
    id: "limit_tree_child",
    parentDeckId: root.id,
    name: "Child",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 2 },
    cards: [due("limit_tree_child", "child_1", "2026-07-07T08:20:00.000Z"), due("limit_tree_child", "child_2", "2026-07-07T08:40:00.000Z")],
  });
  const grandchild = createCoreDeck({
    id: "limit_tree_grandchild",
    parentDeckId: child.id,
    name: "Grandchild",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 1 },
    cards: [due("limit_tree_grandchild", "grandchild_1", "2026-07-07T08:10:00.000Z"), due("limit_tree_grandchild", "grandchild_2", "2026-07-07T08:15:00.000Z")],
  });

  const queue = createDailyReviewQueue([root, child, grandchild], { deckId: root.id, now: NOW });
  assert.equal(queue.total, 4);
  assert.deepEqual(queue.items.map((item) => item?.learningItemId), ["root_1", "grandchild_1", "child_1", "root_2"]);
  assert.deepEqual(queue.limitSummary, { hiddenDueCount: 2, hiddenNewCount: 0, reached: true });
});

test("directly starting a child ignores inactive parent limits", () => {
  const root = createCoreDeck({
    id: "direct_root",
    name: "Root",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 0 },
    cards: [],
  });
  const child = createCoreDeck({
    id: "direct_child",
    parentDeckId: root.id,
    name: "Child",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 2 },
    cards: [dailyProgressItem("direct_child", "direct_due_1", { state: "review", reps: 4, dueAt: NOW })],
  });
  const grandchild = createCoreDeck({
    id: "direct_grandchild",
    parentDeckId: child.id,
    name: "Grandchild",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 1 },
    cards: [dailyProgressItem("direct_grandchild", "direct_due_2", { state: "review", reps: 4, dueAt: NOW })],
  });

  assert.equal(createDailyReviewQueue([root, child, grandchild], { deckId: root.id, now: NOW }).total, 0);
  assert.equal(createDailyReviewQueue([root, child, grandchild], { deckId: child.id, now: NOW }).total, 2);
});

test("reviews reserve the shared review budget before new cards", () => {
  const dueCards = Array.from({ length: 15 }, (_value, index) => dailyProgressItem("shared_budget", `shared_due_${index}`, {
    state: "review",
    reps: 4,
    stability: 6,
    difficulty: 5,
    dueAt: NOW,
  }));
  const newCards = Array.from({ length: 10 }, (_value, index) => dailyProgressItem("shared_budget", `shared_new_${index}`, {
    state: "new",
    reps: 0,
    dueAt: NOW,
  }));
  const deck = createCoreDeck({
    id: "shared_budget",
    name: "Gemeinsames Budget",
    source: "manual",
    deckSettings: { newCardsPerDay: 10, maximumReviewsPerDay: 20, newReviewOrder: "new-first" },
    cards: [...dueCards, ...newCards],
  });

  const queue = createDailyReviewQueue(deck, { now: NOW });
  assert.equal(queue.dueCount, 15);
  assert.equal(queue.newCount, 5);
  assert.equal(queue.total, 20);
  assert.equal(queue.items[0]?.queueKind, "new");
  assert.deepEqual(queue.limitSummary, { hiddenDueCount: 0, hiddenNewCount: 5, reached: true });
});

test("intraday learning bypasses limits while interday learning consumes review budget", () => {
  const deck = createCoreDeck({
    id: "learning_limit_kinds",
    name: "Lernschritte",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 0 },
    cards: [
      dailyProgressItem("learning_limit_kinds", "intraday", {
        state: "learning",
        reps: 1,
        dueAt: "2026-07-07T09:55:00.000Z",
        lastReviewedAt: "2026-07-07T09:45:00.000Z",
        learningDayKey: "2026-07-07",
      }),
      dailyProgressItem("learning_limit_kinds", "interday", {
        state: "learning",
        reps: 1,
        dueAt: "2026-07-07T09:50:00.000Z",
        lastReviewedAt: "2026-07-06T09:50:00.000Z",
        learningDayKey: "2026-07-06",
      }),
    ],
  });

  const queue = createDailyReviewQueue(deck, { now: NOW });
  assert.deepEqual(queue.items.map((item) => item?.learningItemId), ["intraday"]);
  assert.deepEqual(queue.limitSummary, { hiddenDueCount: 1, hiddenNewCount: 0, reached: true });
});

test("new-card sorting is stable by age or by deterministic learning-day randomization", () => {
  const cards = Array.from({ length: 8 }, (_value, index) => createBasicLearningItem("new_sort", `Neu ${index}`, "Antwort", {
    id: `new_sort_${index}`,
    createdAt: index < 2 ? "2026-07-01T10:00:00.000Z" : `2026-07-0${index + 1}T10:00:00.000Z`,
    reviewState: { state: "new", reps: 0, dueAt: NOW },
  }));
  const baseDeck = createCoreDeck({
    id: "new_sort",
    name: "Neue Sortierung",
    source: "manual",
    deckSettings: { newCardsPerDay: 8, maximumReviewsPerDay: 8 },
    cards: [...cards].reverse(),
  });
  const oldest = createDailyReviewQueue(baseDeck, { now: NOW }).items.map((item) => item?.learningItemId);
  const randomDeck = { ...baseDeck, deckSettings: { ...baseDeck.deckSettings, newCardSortOrder: "random" as const } };
  const randomToday = createDailyReviewQueue(randomDeck, { now: NOW }).items.map((item) => item?.learningItemId);
  const randomReload = createDailyReviewQueue(randomDeck, { now: NOW }).items.map((item) => item?.learningItemId);
  const randomTomorrow = createDailyReviewQueue(randomDeck, { now: "2026-07-08T10:00:00.000Z" }).items.map((item) => item?.learningItemId);

  assert.deepEqual(oldest.slice(0, 2), ["new_sort_0", "new_sort_1"]);
  assert.deepEqual(randomReload, randomToday);
  assert.notDeepEqual(randomTomorrow, randomToday);
});

test("review sorting supports overdue and lowest-retrievability priorities", () => {
  const oldestDue = dailyProgressItem("review_sort", "oldest_due", {
    state: "review",
    reps: 4,
    stability: 20,
    difficulty: 5,
    dueAt: "2026-07-05T10:00:00.000Z",
    lastReviewedAt: "2026-06-20T10:00:00.000Z",
  });
  const likelyForgotten = dailyProgressItem("review_sort", "likely_forgotten", {
    state: "review",
    reps: 4,
    stability: 1,
    difficulty: 5,
    dueAt: "2026-07-06T10:00:00.000Z",
    lastReviewedAt: "2026-07-05T10:00:00.000Z",
  });
  const baseDeck = createCoreDeck({
    id: "review_sort",
    name: "Review-Sortierung",
    source: "manual",
    deckSettings: { maximumReviewsPerDay: 2 },
    cards: [likelyForgotten, oldestDue],
  });

  assert.equal(createDailyReviewQueue(baseDeck, { now: NOW }).items[0]?.learningItemId, "oldest_due");
  const forgottenFirst = createDailyReviewQueue({
    ...baseDeck,
    deckSettings: { ...baseDeck.deckSettings, reviewCardSortOrder: "lowest-retrievability" },
  }, { now: NOW });
  assert.equal(forgottenFirst.items[0]?.learningItemId, "likely_forgotten");
});
