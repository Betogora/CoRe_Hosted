import assert from "node:assert/strict";
import test from "node:test";
import {
  addRephrasedVariant,
  createBasicLearningItem,
  createCoreDeck,
  getActiveVariants,
  getOriginalVariant,
  type CoreCardInput,
} from "./coreModel.ts";
import {
  getLearningItemMaturity,
  getReviewSuccessProfile,
  getVariantCoverage,
  createVariantReviewModel,
  getVariantFallbackTarget,
  getVariantGenerationPlan,
  getVariantGenerationRecommendation,
  getVariantReadiness,
} from "./coreVariantService.ts";
import { answerVariant, getNextReviewItem } from "./reviewService.ts";
import { calculateRetrievability, scheduleWithFsrsLikeModel } from "./scheduler.ts";
import type { LearningItem,CardVariant } from "./coreTypes.ts";

function deckWith(item: CoreCardInput, reviewEvents = []) {
  return createCoreDeck({
    id: "deck_fsrs",
    name: "FSRS Deck",
    source: "manual",
    cards: [item],
    reviewEvents,
  });
}

function reviewEvent(item: LearningItem|null|undefined, variant: CardVariant|null, rating: string, reviewedAt: string) {
  assert.ok(getOriginalVariant);
  assert.ok(item);
  return {
    id: `event_${rating}_${reviewedAt}`,
    deckId: "deck_fsrs",
    learningItemId: item.id,
    cardId: item.id,
    sourceCardId: item.id,
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    variantId: variant?.id ?? getOriginalVariant(item).id,
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    cardVariantId: variant?.id ?? getOriginalVariant(item).id,
    rating,
    reviewedAt,
  };
}

function itemWithState(reviewState: { state: string; reps: number; stability?: number; lastReviewedAt?: string; intervalDays?: number; lastRating?: string; preferredVariantLevel?: number; dueAt?: string; }) {
  return createBasicLearningItem("deck_fsrs", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
    reviewState,
  });
}

test("fsrs scheduler state tracks stability difficulty retention reps and conservative variant levels", () => {
  const initial = createBasicLearningItem("deck_fsrs", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.").learningItemState;
  const baseReviewState = {
    schedulerVersion: "fsrs_v1",
    state: "review",
    reps: 3,
    repetitions: 3,
    lapses: 0,
    stability: 5,
    difficulty: 5,
    desiredRetention: 0.9,
    intervalDays: 3,
    lastReviewedAt: "2026-07-01T10:00:00.000Z",
    preferredVariantLevel: 3,
  };
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const hard = scheduleWithFsrsLikeModel(baseReviewState, "hard", { now: "2026-07-06T10:00:00.000Z" });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const good = scheduleWithFsrsLikeModel(baseReviewState, "good", { now: "2026-07-06T10:00:00.000Z" });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const easy = scheduleWithFsrsLikeModel(baseReviewState, "easy", { now: "2026-07-06T10:00:00.000Z" });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const again = scheduleWithFsrsLikeModel(baseReviewState, "again", { now: "2026-07-06T10:00:00.000Z" });

  assert.equal(initial.schedulerVersion, "fsrs_v1");
  assert.equal(typeof initial.stability, "number");
  assert.equal(typeof initial.difficulty, "number");
  assert.equal(initial.desiredRetention, 0.9);
  assert.equal(good.reps, 4);
  assert.equal(good.repetitions, 4);
  assert.equal(good.stability > hard.stability, true);
  assert.equal(easy.stability > good.stability, true);
  assert.equal(again.stability < baseReviewState.stability, true);
  assert.equal(again.difficulty > baseReviewState.difficulty, true);
  assert.equal(again.lapses, 1);
  assert.equal(good.preferredVariantLevel <= 3, true);
  assert.equal(calculateRetrievability(good, "2026-07-06T10:00:00.000Z"), 1);
});

test("learning item maturity derives stages from fsrs state and review profile", () => {
  const now = "2026-07-06T10:00:00.000Z";
  const newItem = itemWithState({ state: "new", reps: 0 });
  const learningItem = itemWithState({ state: "learning", reps: 1, stability: 0.5 });
  const earlyReview = itemWithState({ state: "review", reps: 2, stability: 2, lastReviewedAt: now });
  const variantReady = itemWithState({ state: "review", reps: 3, stability: 5, lastReviewedAt: now });
  const mature = itemWithState({ state: "review", reps: 4, stability: 12, intervalDays: 8, lastReviewedAt: now });
  const mastered = itemWithState({ state: "review", reps: 6, stability: 35, intervalDays: 24, lastReviewedAt: now });
  const relearning = itemWithState({ state: "review", reps: 5, stability: 8, lastRating: "again", lastReviewedAt: now });
  const original = getOriginalVariant(variantReady);
  const threeGoodEvents = [
    reviewEvent(variantReady, original, "easy", "2026-07-06T09:00:00.000Z"),
    reviewEvent(variantReady, original, "good", "2026-07-05T09:00:00.000Z"),
    reviewEvent(variantReady, original, "good", "2026-07-04T09:00:00.000Z"),
  ];

  assert.equal(getLearningItemMaturity(newItem, now).stage, "new");
  assert.equal(getLearningItemMaturity(learningItem, now).stage, "learning");
  assert.equal(getLearningItemMaturity(earlyReview, now).stage, "early_review");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getLearningItemMaturity(variantReady, now, threeGoodEvents).stage, "variant_ready");
  assert.equal(getLearningItemMaturity(mature, now).stage, "mature");
  assert.equal(getLearningItemMaturity(mastered, now).stage, "mastered");
  assert.equal(getLearningItemMaturity(relearning, now).stage, "relearning");
  assert.equal(getLearningItemMaturity(relearning, now).isFragile, true);
});

test("review success profile tracks streaks and variant ids", () => {
  let item = itemWithState({ state: "review", reps: 4 });
  item = addRephrasedVariant(item, "Wofuer steht MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  const original = getOriginalVariant(item);
  const variant = getActiveVariants(item)[0];
  const events = [
    reviewEvent(item, variant, "easy", "2026-07-06T09:00:00.000Z"),
    reviewEvent(item, variant, "good", "2026-07-05T09:00:00.000Z"),
    reviewEvent(item, original, "hard", "2026-07-04T09:00:00.000Z"),
    reviewEvent(item, variant, "again", "2026-07-03T09:00:00.000Z"),
  ];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const profile = getReviewSuccessProfile(item, events);

  assert.equal(profile.totalReviews, 4);
  assert.equal(profile.successfulReviews, 3);
  assert.equal(profile.consecutivePositiveReviews, 3);
  assert.equal(profile.consecutiveGoodOrEasy, 2);
  assert.equal(profile.lastRating, "easy");
  assert.equal(profile.lastSuccessfulVariantId, variant.id);
  assert.equal(profile.lastFailedVariantId, variant.id);
});

test("variant readiness coverage recommendation and plan stay near and conservative", () => {
  const now = "2026-07-06T10:00:00.000Z";
  const newItem = itemWithState({ state: "new", reps: 0 });
  const readyItem = itemWithState({ state: "review", reps: 3, stability: 5, lastReviewedAt: now });
  const original = getOriginalVariant(readyItem);
  const readyEvents = [
    reviewEvent(readyItem, original, "good", "2026-07-06T09:00:00.000Z"),
    reviewEvent(readyItem, original, "good", "2026-07-05T09:00:00.000Z"),
    reviewEvent(readyItem, original, "easy", "2026-07-04T09:00:00.000Z"),
  ];
  let coveredItem = addRephrasedVariant(readyItem, "Wofuer steht MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
    variantLevel: 2,
    generationSource: "ai_generated",
  });
  coveredItem = addRephrasedVariant(coveredItem, "Was ist mit MRSA ausgeschrieben gemeint?", "Methicillin-resistenter Staphylococcus aureus.", {
    variantLevel: 3,
    generationSource: "ai_generated",
  });
  coveredItem = addRephrasedVariant(coveredItem, "Wie behandelt man MRSA?", "Mit Antibiotika nach Resistogramm.", {
    variantType: "transfer",
    variantLevel: 3,
    generationSource: "ai_generated",
  });
  coveredItem = addRephrasedVariant(coveredItem, "Inaktive MRSA-Variante?", "Methicillin-resistenter Staphylococcus aureus.", {
    variantLevel: 1,
    qualityStatus: "disabled",
    isActive: false,
  });

  assert.deepEqual(getVariantReadiness(newItem).allowedLevels, [1]);
  assert.equal(getVariantReadiness(newItem).allowAiRephrasing, false);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getVariantReadiness(readyItem, readyEvents, { now }).allowAiRephrasing, true);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(getVariantReadiness(coveredItem, readyEvents, { now }).allowedLevels, [1, 2]);

  const coverage = getVariantCoverage(coveredItem);
  assert.equal(coverage.originalCount, 1);
  assert.equal(coverage.activeRephraseCount, 2);
  assert.equal(coverage.aiGeneratedCount, 2);
  assert.equal(coverage.hasEnoughVariants, true);

  const newRecommendation = getVariantGenerationRecommendation(newItem, [], { now });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const readyRecommendation = getVariantGenerationRecommendation(readyItem, readyEvents, { now });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const coveredRecommendation = getVariantGenerationRecommendation(coveredItem, readyEvents, { now });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const autoRecommendation = getVariantGenerationRecommendation(readyItem, readyEvents, { now, autoGenerateAllowed: true, providerConfigured: true });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const plan = getVariantGenerationPlan(readyItem, readyEvents, { now });

  assert.equal(newRecommendation.shouldSuggest, false);
  assert.equal(readyRecommendation.shouldSuggest, true);
  assert.equal(readyRecommendation.shouldAutoGenerate, false);
  assert.equal(autoRecommendation.shouldAutoGenerate, true);
  assert.equal(coveredRecommendation.shouldSuggest, false);
  assert.equal(plan.canGenerate, true);
  assert.equal(plan.promptOptions.keepCloseToOriginal, true);
  assert.equal(plan.promptOptions.allowNewFacts, false);
  assert.equal(plan.promptOptions.allowTransfer, false);
  assert.equal(plan.promptOptions.allowCaseVignette, false);
  assert.equal(plan.promptOptions.maxVariantLevel <= 3, true);
});

test("variant review model bundles maturity readiness coverage and generation plan behind one interface", () => {
  const now = "2026-07-06T10:00:00.000Z";
  const item = itemWithState({ state: "review", reps: 3, stability: 5, lastReviewedAt: now });
  const original = getOriginalVariant(item);
  const events = [
    reviewEvent(item, original, "good", "2026-07-06T09:00:00.000Z"),
    reviewEvent(item, original, "good", "2026-07-05T09:00:00.000Z"),
    reviewEvent(item, original, "easy", "2026-07-04T09:00:00.000Z"),
  ];
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const model = createVariantReviewModel(item, events, { now, language: "de" });

  assert.equal(model.maturity.stage, "variant_ready");
  assert.equal(model.readiness.allowAiRephrasing, true);
  assert.equal(model.coverage.hasOriginal, true);
  assert.equal(model.variantGenerationRecommendation.shouldSuggest, true);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(model.variantGenerationPlan.promptOptions.keepCloseToOriginal, true);
  assert.equal(model.generationPlan, model.variantGenerationPlan);
});

test("fallback chooses simpler variants and getNextReviewItem honors it until corrected", () => {
  let item = itemWithState({
    state: "review",
    reps: 5,
    stability: 10,
    intervalDays: 6,
    lastRating: "good",
    preferredVariantLevel: 3,
    lastReviewedAt: "2026-07-06T08:00:00.000Z",
    dueAt: "2026-07-06T08:00:00.000Z",
  });
  item = addRephrasedVariant(item, "Wofuer steht MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 1 });
  item = addRephrasedVariant(item, "Was ist mit MRSA ausgeschrieben gemeint?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 2 });
  item = addRephrasedVariant(item, "Welcher Erreger verbirgt sich hinter MRSA?", "Methicillin-resistenter Staphylococcus aureus.", { variantLevel: 3 });
  const variants = getActiveVariants(item);
  const level1 = variants.find((variant) => variant.variantLevel === 1);
  const level2 = variants.find((variant) => variant.variantLevel === 2);
  const level3 = variants.find((variant) => variant.variantLevel === 3);
  const original = getOriginalVariant(item);

  assert.ok(level2);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getVariantFallbackTarget(item, level3).fallbackVariantId, level2.id);
  assert.ok(level1);
  assert.equal(getVariantFallbackTarget(item, level2).fallbackVariantId, level1.id);
  assert.ok(original);
  assert.equal(getVariantFallbackTarget(item, original).fallbackVariantId, original.id);

  assert.ok(level3);
  const failed = answerVariant(deckWith(item), item.id, level3.id, "again", {
    now: "2026-07-06T10:00:00.000Z",
  });
  const failedState = failed.deck.cards[0].learningItemState;
  const next = getNextReviewItem(failed.deck, { now: "2026-07-06T10:00:00.000Z" });

  assert.equal(failedState.fallbackUntilCorrect, true);
  assert.ok(level2);
  assert.equal(failedState.forcedVariantId, level2.id);
  assert.ok(level2);
  assert.ok(next);
  assert.equal(next.variant.id, level2.id);
  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.fallbackInfo.active, true);
  assert.ok(next);
  assert.equal(next.variantGenerationRecommendation.shouldSuggest, false);

  assert.ok(level2);
  const corrected = answerVariant(failed.deck, item.id, level2.id, "good", {
    now: "2026-07-06T11:00:00.000Z",
  });
  assert.equal(corrected.deck.cards[0].learningItemState.fallbackUntilCorrect, false);
  assert.equal(corrected.deck.cards[0].learningItemState.forcedVariantId, null);
});

test("getNextReviewItem exposes maturity readiness recommendation and anchor data for prompt 5", () => {
  let item = itemWithState({
    state: "review",
    reps: 3,
    stability: 5,
    lastReviewedAt: "2026-07-06T08:00:00.000Z",
    lastRating: "good",
    preferredVariantLevel: 2,
    dueAt: "2026-07-06T08:00:00.000Z",
  });
  item = addRephrasedVariant(item, "Wofuer steht MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
    variantLevel: 2,
    generationSource: "ai_generated",
  });
  const next = getNextReviewItem(deckWith(item), { now: "2026-07-06T10:00:00.000Z" });

  assert.ok(next);
  assert.equal(next.maturity.stage, "variant_ready");
  assert.ok(next);
  assert.equal(next.variantReadiness.allowAiRephrasing, true);
  assert.ok(next);
  assert.equal(typeof next.variantGenerationRecommendation.shouldSuggest, "boolean");
  assert.ok(next);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(next.variantGenerationPlan.promptOptions.keepCloseToOriginal, true);
  assert.ok(next);
  assert.equal(next.answerSideAnchorMiniCard.shouldShow, true);
});
