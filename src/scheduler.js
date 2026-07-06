import { REVIEW_RATINGS, createReviewState, getMaturityBand } from "./coreModel.js";

export const SCHEDULER_VERSION = "fsrs_v1";
export const SIMPLE_SCHEDULER_VERSION = "simple_v1";
export const FSRS_SCHEDULER_VERSION = "fsrs_v1";

const RATING_EFFECT = {
  again: { xp: -18, intervalMultiplier: 0.15, ease: -0.2, lapse: 1 },
  hard: { xp: 2, intervalMultiplier: 0.55, ease: -0.08, lapse: 0 },
  good: { xp: 12, intervalMultiplier: 1.35, ease: 0, lapse: 0 },
  easy: { xp: 18, intervalMultiplier: 2.15, ease: 0.08, lapse: 0 },
};

function addDays(date, days) {
  const next = new Date(date);
  next.setTime(next.getTime() + days * 24 * 60 * 60 * 1000);
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function nextIntervalDays(state, rating, deckSettings) {
  const current = Math.max(0, Number(state.intervalDays ?? 0));

  if (rating === "again") {
    return deckSettings?.schedulerProfile?.lessShortIntervalBias ? 0.5 : 0.1;
  }

  if (current <= 0) {
    if (rating === "hard") return 0.5;
    if (rating === "easy") return deckSettings?.schedulerProfile?.easyIntervalDays ?? 4;
    return deckSettings?.schedulerProfile?.graduatingIntervalDays ?? 1;
  }

  const effect = RATING_EFFECT[rating];
  const ease = Math.max(1.3, Number(state.ease ?? 2.5) + effect.ease);
  return Math.max(0.5, Math.round(current * effect.intervalMultiplier * ease * 10) / 10);
}

function nextLearningState(oldState, rating) {
  const previousState = oldState.state ?? (Number(oldState.repetitions ?? 0) > 0 ? "review" : "new");
  if (rating === "again") return previousState === "review" ? "relearning" : "learning";
  if (rating === "hard") return previousState === "new" ? "learning" : "review";
  return "review";
}

function nextPreferredVariantLevel(oldState, rating, context = {}) {
  const currentLevel = Math.min(3, Math.max(1, Number(oldState.preferredVariantLevel ?? context.variantLevel ?? 1) || 1));
  if (rating === "again") return Math.max(1, currentLevel - 1);
  if (rating === "hard") return Math.max(1, currentLevel - 1);
  if (rating === "easy") return Math.min(3, currentLevel + 1);
  return Math.min(3, currentLevel + 1);
}

function getStateReps(state) {
  return Math.max(0, Math.round(Number(state.reps ?? state.repetitions ?? 0) || 0));
}

function nextFsrsState(previousState, rating) {
  const previous = previousState.state ?? (getStateReps(previousState) > 0 ? "review" : "new");
  if (rating === "again") return previous === "review" ? "relearning" : "learning";
  if (rating === "hard") return previous === "new" ? "learning" : "review";
  return "review";
}

function nextDifficulty(previousDifficulty, rating) {
  const current = clamp(previousDifficulty ?? 5, 1, 10);
  const delta = {
    again: 1.2,
    hard: 0.45,
    good: -0.15,
    easy: -0.6,
  }[rating];
  return round(clamp(current + delta, 1, 10));
}

function nextStability(previousState, rating) {
  const current = Math.max(0, Number(previousState.stability ?? 0) || 0);
  const difficulty = clamp(previousState.difficulty ?? 5, 1, 10);

  if (rating === "again") {
    return round(Math.max(0.05, current > 0 ? current * 0.35 : 0.05));
  }

  if (current <= 0) {
    if (rating === "hard") return 0.5;
    if (rating === "easy") return 3;
    return 1;
  }

  const difficultyFactor = clamp((11 - difficulty) / 6, 0.4, 1.6);
  if (rating === "hard") return round(Math.max(0.5, current * 1.12));
  if (rating === "easy") return round(Math.max(3, current * (1.85 + difficultyFactor * 0.35)));
  return round(Math.max(1, current * (1.35 + difficultyFactor * 0.25)));
}

function nextFsrsIntervalDays(previousState, rating, nextStabilityValue, deckSettings) {
  const current = Math.max(0, Number(previousState.intervalDays ?? 0) || 0);
  const desiredRetention = clamp(previousState.desiredRetention ?? deckSettings?.schedulerProfile?.desiredRetention ?? 0.9, 0.5, 0.99);
  const retentionFactor = clamp(0.9 / desiredRetention, 0.85, 1.35);

  if (rating === "again") {
    return deckSettings?.schedulerProfile?.lessShortIntervalBias ? 0.5 : 0.1;
  }

  if (rating === "hard") {
    return round(Math.max(0.5, Math.min(Math.max(current + 0.25, nextStabilityValue * 0.8), Math.max(0.5, current * 1.25 || 0.5))), 1);
  }

  if (rating === "easy") {
    const firstEasy = deckSettings?.schedulerProfile?.easyIntervalDays ?? 4;
    return round(Math.max(current + 1, firstEasy, nextStabilityValue * 1.6 * retentionFactor), 1);
  }

  const firstGood = deckSettings?.schedulerProfile?.graduatingIntervalDays ?? 1;
  return round(Math.max(current + 0.5, firstGood, nextStabilityValue * retentionFactor), 1);
}

export function calculateRetrievability(learningItemState, now = new Date()) {
  const state = createReviewState(learningItemState);
  const stability = Math.max(0, Number(state.stability ?? 0) || 0);
  const reviewedAt = state.lastReviewedAt ? new Date(state.lastReviewedAt).getTime() : null;

  if (!reviewedAt || stability <= 0) {
    return getStateReps(state) > 0 ? 0.5 : 0;
  }

  const elapsedDays = Math.max(0, (new Date(now).getTime() - reviewedAt) / (24 * 60 * 60 * 1000));
  return round((1 + elapsedDays / (9 * stability)) ** -1, 4);
}

export function getSchedulerStateForItem(item) {
  const rawState = item?.learningItemState ?? item?.reviewState ?? {};
  return createReviewState({
    ...rawState,
    schedulerVersion: rawState.schedulerVersion ?? FSRS_SCHEDULER_VERSION,
    learningItemId: rawState.learningItemId ?? item?.id ?? rawState.reviewableId ?? "",
    reviewableType: rawState.reviewableType ?? "card",
    reviewableId: rawState.reviewableId ?? item?.id ?? rawState.learningItemId ?? "",
  });
}

export function updateMaturityXp(oldXp, rating, wasVariant = false) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const variantBonus = wasVariant && (rating === "good" || rating === "easy") ? 4 : 0;
  return Math.max(0, Math.round(Number(oldXp ?? 0) + RATING_EFFECT[rating].xp + variantBonus));
}

export function scheduleWithFsrsLikeModel(previousState, rating, context = {}) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const now = context.now ? new Date(context.now) : new Date();
  const state = createReviewState(previousState);
  const previousReps = getStateReps(state);
  const nextState = nextFsrsState(state, rating);
  const stability = nextStability(state, rating);
  const difficulty = nextDifficulty(state.difficulty, rating);
  const intervalDays = nextFsrsIntervalDays(state, rating, stability, context.deckSettings);
  const maturityXp = updateMaturityXp(state.maturityXp, rating, Boolean(context.isVariant));
  const ease = Math.max(1.3, Math.min(3.3, Number(state.ease ?? 2.5) + RATING_EFFECT[rating].ease));
  const preferredVariantLevel = nextPreferredVariantLevel(state, rating, context);
  const previousWasReview = state.state === "review" || (previousReps > 0 && state.state !== "learning");
  const shouldClearFallback =
    rating !== "again" &&
    Boolean(state.fallbackUntilCorrect) &&
    (!state.forcedVariantId || state.forcedVariantId === context.variantId || context.variantIsOriginal);
  const nextForcedVariantId =
    rating === "again"
      ? context.fallbackVariantId ?? state.forcedVariantId ?? null
      : shouldClearFallback
        ? null
        : state.forcedVariantId ?? null;

  return createReviewState({
    ...state,
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    state: nextState,
    dueAt: addDays(now, intervalDays).toISOString(),
    intervalDays,
    ease,
    stability,
    difficulty,
    desiredRetention: state.desiredRetention ?? context.deckSettings?.schedulerProfile?.desiredRetention ?? 0.9,
    reps: previousReps + 1,
    repetitions: previousReps + 1,
    lapses: Number(state.lapses ?? 0) + (rating === "again" && previousWasReview ? RATING_EFFECT[rating].lapse : 0),
    maturityXp,
    maturityBand: getMaturityBand(maturityXp),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
    preferredVariantLevel,
    forcedVariantId: nextForcedVariantId,
    fallbackUntilCorrect: rating === "again" ? Boolean(context.fallbackVariantId) : shouldClearFallback ? false : Boolean(state.fallbackUntilCorrect),
    lastFailedVariantId: rating === "again" ? context.variantId ?? state.lastFailedVariantId ?? null : state.lastFailedVariantId ?? null,
    previousSuccessfulVariantId: rating === "again" ? state.previousSuccessfulVariantId ?? null : context.variantId ?? state.previousSuccessfulVariantId ?? null,
    schedulerParamsJson: {
      schedulerVersion: FSRS_SCHEDULER_VERSION,
      rating,
      variantLevel: context.variantLevel ?? null,
      variantType: context.variantType ?? null,
      retrievabilityBefore: calculateRetrievability(state, now),
      stability,
      difficulty,
      desiredRetention: state.desiredRetention ?? context.deckSettings?.schedulerProfile?.desiredRetention ?? 0.9,
      fallbackVariantId: nextForcedVariantId,
    },
  });
}

export function applyReviewRating(reviewState, rating, context = {}) {
  return scheduleWithFsrsLikeModel(reviewState, rating, context);
}

export function listReviewableCards(deck) {
  return (deck.cards ?? []).filter((card) => card.status !== "deleted" && card.draftStatus !== "draft");
}

export function summarizeDeckReview(deck, now = new Date()) {
  const cards = listReviewableCards(deck);
  const nowTime = new Date(now).getTime();
  const dueCards = cards.filter((card) => new Date(card.reviewState?.dueAt ?? 0).getTime() <= nowTime);
  const matureCards = cards.filter((card) => ["variant_ready", "mastered"].includes(card.reviewState?.maturityBand));
  const activeVariants = cards
    .flatMap((card) => card.variants ?? [])
    .filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal);
  const newCards = cards.filter((card) => Number(card.reviewState?.repetitions ?? 0) === 0);

  return {
    totalCards: cards.length,
    dueCards: dueCards.length,
    newCards: newCards.length,
    matureCards: matureCards.length,
    activeVariants: activeVariants.length,
    averageMaturityXp: cards.length
      ? Math.round(cards.reduce((sum, card) => sum + Number(card.reviewState?.maturityXp ?? 0), 0) / cards.length)
      : 0,
  };
}

