import { REVIEW_RATINGS, createReviewState, getMaturityBand } from "./coreModel.js";
import { normalizeLearningSettings } from "./deckSettings.js";

export const SCHEDULER_VERSION = "fsrs_v1";
export const FSRS_SCHEDULER_VERSION = "fsrs_v1";
export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const RATING_LABELS = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const RATING_EFFECT_LABELS = {
  again: "Wiederholen",
  hard: "Schwer",
  good: "Normal",
  easy: "Leicht",
};

const RATING_EFFECT = {
  again: { xp: -18, intervalMultiplier: 0.15, ease: -0.2, lapse: 1 },
  hard: { xp: 2, intervalMultiplier: 0.55, ease: -0.08, lapse: 0 },
  good: { xp: 12, intervalMultiplier: 1.35, ease: 0, lapse: 0 },
  easy: { xp: 18, intervalMultiplier: 2.15, ease: 0.08, lapse: 0 },
};

function addDays(date, days) {
  const next = new Date(date);
  next.setTime(next.getTime() + days * DAY_MS);
  return next;
}

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setTime(next.getTime() + minutes * MINUTE_MS);
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function getSchedulerProfile(deckSettings = {}) {
  return normalizeLearningSettings(deckSettings).schedulerProfile;
}

function getDesiredRetention(deckSettings, state) {
  const configuredRetention = deckSettings?.schedulerProfile?.desiredRetention;
  return configuredRetention == null
    ? clamp(state?.desiredRetention ?? 0.9, 0.7, 0.99)
    : getSchedulerProfile(deckSettings).desiredRetention;
}

function getLearningIntervals(deckSettings = {}) {
  const profile = getSchedulerProfile(deckSettings);
  const [againMinutes, goodMinutes] = profile.learningStepsMinutes;
  const shortIntervalFactor = profile.lessShortIntervalBias ? 2 : 1;

  return {
    againMinutes: againMinutes * shortIntervalFactor,
    hardMinutes: Math.max(againMinutes, Math.round((againMinutes + goodMinutes) / 2)) * shortIntervalFactor,
    goodMinutes: goodMinutes * shortIntervalFactor,
    easyMinutes: Math.max(goodMinutes * 2, 30) * shortIntervalFactor,
    relearningAgainMinutes: profile.relearningStepMinutes * shortIntervalFactor,
    relearningHardMinutes: profile.relearningStepMinutes * 2 * shortIntervalFactor,
    graduatingDays: profile.graduatingIntervalDays,
    easyGraduatingDays: profile.easyGraduatingIntervalDays,
  };
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function intervalParts({ intervalMinutes = null, intervalDays = null, intervalMs = null } = {}) {
  if (intervalMs !== null && intervalMs !== undefined && Number.isFinite(Number(intervalMs))) {
    const ms = Math.max(0, Number(intervalMs));
    return {
      intervalMs: ms,
      intervalMinutes: Math.round(ms / MINUTE_MS),
      intervalDays: ms >= DAY_MS ? round(ms / DAY_MS, 2) : 0,
    };
  }

  if (intervalMinutes !== null && intervalMinutes !== undefined && Number.isFinite(Number(intervalMinutes))) {
    const minutes = Math.max(0, Math.round(Number(intervalMinutes)));
    return {
      intervalMs: minutes * MINUTE_MS,
      intervalMinutes: minutes,
      intervalDays: minutes >= 24 * 60 ? round(minutes / (24 * 60), 2) : 0,
    };
  }

  const days = Math.max(0, Number(intervalDays ?? 0) || 0);
  return {
    intervalMs: days * DAY_MS,
    intervalMinutes: Math.round(days * 24 * 60),
    intervalDays: days,
  };
}

export function formatIntervalLabel(input = {}) {
  const parts = typeof input === "number" ? intervalParts({ intervalDays: input }) : intervalParts(input);
  const minutes = Math.max(0, Math.round(parts.intervalMs / MINUTE_MS));

  if (minutes < 60) {
    return `${Math.max(1, minutes)} Min.`;
  }

  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "1 Std." : `${hours} Std.`;
  }

  const days = Math.round(minutes / (24 * 60));
  if (days < 30) {
    return days === 1 ? "1 Tag" : `${days} Tage`;
  }

  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? "1 Monat" : `${months} Monate`;
}

function withInterval(state, now, interval, extra = {}) {
  const parts = intervalParts(interval);
  const dueAt =
    Number.isFinite(Number(interval.intervalMinutes)) || (Number.isFinite(Number(interval.intervalMs)) && parts.intervalMs < DAY_MS)
      ? addMinutes(now, parts.intervalMinutes).toISOString()
      : addDays(now, parts.intervalDays).toISOString();

  return {
    ...state,
    ...extra,
    dueAt,
    intervalDays: parts.intervalDays,
    intervalMinutes: parts.intervalMinutes < 24 * 60 ? parts.intervalMinutes : null,
  };
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
  const profile = getSchedulerProfile(deckSettings);
  const desiredRetention = getDesiredRetention(deckSettings, previousState);
  const retentionFactor = clamp(0.9 / desiredRetention, 0.85, 1.35);
  const maximumIntervalDays = profile.maximumIntervalDays;

  if (rating === "again") {
    return Math.min(maximumIntervalDays, profile.lessShortIntervalBias ? 0.5 : 0.1);
  }

  if (rating === "hard") {
    return Math.min(maximumIntervalDays, round(Math.max(0.5, Math.min(Math.max(current + 0.25, nextStabilityValue * 0.8), Math.max(0.5, current * 1.25 || 0.5))), 1));
  }

  if (rating === "easy") {
    return Math.min(maximumIntervalDays, round(Math.max(current + 1, profile.easyIntervalDays, nextStabilityValue * 1.6 * retentionFactor), 1));
  }

  return Math.min(maximumIntervalDays, round(Math.max(current + 0.5, profile.graduatingIntervalDays, nextStabilityValue * retentionFactor), 1));
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

function successCountForLearningDay(state, now) {
  const today = dayKey(now);
  if (state.state === "new") return 0;
  if (state.learningDayKey && state.learningDayKey !== today) return 0;
  return Math.max(0, Math.round(Number(state.learningSuccessCount ?? state.sameDaySuccessCount ?? 0) || 0));
}

function deriveOutcomeMaturity(state) {
  const reps = getStateReps(state);
  const successfulReviews = Math.max(0, reps - Number(state.lapses ?? 0));
  const stability = Number(state.stability ?? 0) || 0;
  const intervalDays = Number(state.intervalDays ?? 0) || 0;
  const recentFailure = state.lastRating === "again" || state.fallbackUntilCorrect;

  if (state.state === "relearning" || state.lastRating === "again") return { stage: "relearning", label: "Wiederlernen" };
  if (state.state === "new" || reps === 0) return { stage: "new", label: "Neu" };
  if (state.state === "learning") return { stage: "learning", label: "Lernen" };
  if (state.state === "review") {
    if ((stability >= 30 || intervalDays >= 21) && !recentFailure) return { stage: "mastered", label: "Sicher" };
    if ((stability >= 10 || intervalDays >= 7 || successfulReviews >= 4) && !recentFailure) return { stage: "mature", label: "Reif" };
    if ((stability >= 4 || successfulReviews >= 3) && !recentFailure) return { stage: "variant_ready", label: "Bereit für Varianten" };
    return { stage: "early_review", label: "Fruehes Review" };
  }

  return { stage: "new", label: "Neu" };
}

function fallbackStateForRating(state, rating, context = {}) {
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

  return {
    forcedVariantId: nextForcedVariantId,
    fallbackUntilCorrect: rating === "again" ? Boolean(context.fallbackVariantId) : shouldClearFallback ? false : Boolean(state.fallbackUntilCorrect),
    lastFailedVariantId: rating === "again" ? context.variantId ?? state.lastFailedVariantId ?? null : state.lastFailedVariantId ?? null,
    previousSuccessfulVariantId: rating === "again" ? state.previousSuccessfulVariantId ?? null : context.variantId ?? state.previousSuccessfulVariantId ?? null,
  };
}

function baseNextState(state, rating, now, context = {}) {
  const previousReps = getStateReps(state);
  const maturityXp = updateMaturityXp(state.maturityXp, rating, Boolean(context.isVariant));
  const stability = nextStability(state, rating);
  const difficulty = nextDifficulty(state.difficulty, rating);
  const retrievabilityBefore = calculateRetrievability(state, now);
  const desiredRetention = getDesiredRetention(context.deckSettings, state);
  const fallback = fallbackStateForRating(state, rating, context);

  return createReviewState({
    ...state,
    ...fallback,
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    ease: Math.max(1.3, Math.min(3.3, Number(state.ease ?? 2.5) + RATING_EFFECT[rating].ease)),
    stability,
    difficulty,
    desiredRetention,
    reps: previousReps + 1,
    repetitions: previousReps + 1,
    maturityXp,
    maturityBand: getMaturityBand(maturityXp),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
    retrievability: 1,
    schedulerParamsJson: {
      schedulerVersion: FSRS_SCHEDULER_VERSION,
      schedulerKind: "fsrs_like_default",
      rating,
      variantLevel: context.variantLevel ?? null,
      variantType: context.variantType ?? null,
      retrievabilityBefore,
      stability,
      difficulty,
      desiredRetention,
      fallbackVariantId: fallback.forcedVariantId,
    },
  });
}

function simulateLearningOutcome(state, rating, now, context = {}) {
  const today = dayKey(now);
  const priorSuccessCount = successCountForLearningDay(state, now);
  const nextBase = baseNextState(state, rating, now, context);
  const resetSuccess = rating === "again" || rating === "hard";
  const successCount = resetSuccess ? 0 : priorSuccessCount + 1;
  const intervals = getLearningIntervals(context.deckSettings);
  const common = {
    firstLearningAt: state.firstLearningAt ?? now.toISOString(),
    lastLearningStepAt: now.toISOString(),
    learningDayKey: today,
    learningSuccessCount: successCount,
    sameDaySuccessCount: successCount,
    learningStepIndex: successCount,
    preferredVariantLevel: rating === "easy" ? Math.min(2, nextPreferredVariantLevel(state, rating, context)) : 1,
  };

  if (rating === "again") {
    return withInterval(nextBase, now, { intervalMinutes: intervals.againMinutes }, {
      ...common,
      state: "learning",
      stability: Math.max(0.05, Math.min(nextBase.stability, 0.2)),
      learningSuccessCount: 0,
      sameDaySuccessCount: 0,
      learningStepIndex: 0,
    });
  }

  if (rating === "hard") {
    return withInterval(nextBase, now, { intervalMinutes: intervals.hardMinutes }, {
      ...common,
      state: "learning",
      stability: Math.max(0.1, Math.min(nextBase.stability, 0.5)),
      learningSuccessCount: priorSuccessCount,
      sameDaySuccessCount: priorSuccessCount,
      learningStepIndex: priorSuccessCount,
      preferredVariantLevel: 1,
    });
  }

  if (successCount >= 2) {
    const intervalDays = rating === "easy" ? intervals.easyGraduatingDays : intervals.graduatingDays;
    return withInterval(nextBase, now, { intervalDays }, {
      ...common,
      state: "review",
      isGraduated: true,
      graduatedAt: now.toISOString(),
      stability: rating === "easy" ? Math.max(2, nextBase.stability) : Math.max(1, nextBase.stability),
      preferredVariantLevel: rating === "easy" ? 2 : 1,
    });
  }

  return withInterval(nextBase, now, {
    intervalMinutes: rating === "easy" ? intervals.easyMinutes : intervals.goodMinutes,
  }, {
    ...common,
    state: "learning",
    stability: rating === "easy" ? Math.max(0.5, nextBase.stability) : Math.max(0.3, nextBase.stability),
  });
}

function simulateRelearningOutcome(state, rating, now, context = {}) {
  const nextBase = baseNextState(state, rating, now, context);
  const intervals = getLearningIntervals(context.deckSettings);

  if (rating === "again") {
    return withInterval(nextBase, now, { intervalMinutes: intervals.relearningAgainMinutes }, {
      state: "relearning",
      preferredVariantLevel: 1,
      stability: Math.max(0.05, nextBase.stability),
    });
  }

  if (rating === "hard") {
    return withInterval(nextBase, now, { intervalMinutes: intervals.relearningHardMinutes }, {
      state: "relearning",
      preferredVariantLevel: 1,
      stability: Math.max(0.1, nextBase.stability),
    });
  }

  const intervalDays = rating === "easy" ? intervals.easyGraduatingDays : intervals.graduatingDays;
  return withInterval(nextBase, now, { intervalDays }, {
    state: "review",
    isGraduated: true,
    graduatedAt: state.graduatedAt ?? now.toISOString(),
    preferredVariantLevel: rating === "easy" ? 2 : 1,
    stability: rating === "easy" ? Math.max(1.5, nextBase.stability) : Math.max(1, nextBase.stability),
  });
}

function simulateReviewOutcome(state, rating, now, context = {}) {
  const nextBase = baseNextState(state, rating, now, context);
  const intervals = getLearningIntervals(context.deckSettings);
  const previousWasReview = state.state === "review" || (getStateReps(state) > 0 && state.state !== "learning" && state.state !== "new");

  if (rating === "again") {
    return withInterval(nextBase, now, { intervalMinutes: intervals.relearningAgainMinutes }, {
      state: "relearning",
      lapses: Number(state.lapses ?? 0) + (previousWasReview ? RATING_EFFECT.again.lapse : 0),
      preferredVariantLevel: 1,
      stability: Math.max(0.05, nextBase.stability),
    });
  }

  const stability = nextBase.stability;
  const intervalDays = nextFsrsIntervalDays(state, rating, stability, context.deckSettings);
  return withInterval(nextBase, now, { intervalDays }, {
    state: "review",
    lapses: Number(state.lapses ?? 0),
    preferredVariantLevel: nextPreferredVariantLevel(state, rating, context),
  });
}

export function simulateRatingOutcome({
  learningItem = null,
  previousState = null,
  variant = null,
  rating,
  now = new Date().toISOString(),
  reviewEvents = [],
  deckSettings = null,
  commit = false,
  ...context
} = {}) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const nowDate = new Date(now);
  const variantContext = {
    ...context,
    deckSettings,
    reviewEvents,
    isVariant: context.isVariant ?? Boolean(variant && !variant.isOriginal),
    variantId: context.variantId ?? variant?.id ?? null,
    variantIsOriginal: context.variantIsOriginal ?? Boolean(variant?.isOriginal),
    variantLevel: context.variantLevel ?? variant?.variantLevel ?? 1,
    variantType: context.variantType ?? variant?.variantType ?? "basic",
  };
  const state = previousState
    ? createReviewState(previousState)
    : learningItem
      ? getSchedulerStateForItem(learningItem)
      : createReviewState({});
  const phase = state.state ?? (getStateReps(state) > 0 ? "review" : "new");
  const nextReviewState =
    phase === "new" || phase === "learning"
      ? simulateLearningOutcome(state, rating, nowDate, variantContext)
      : phase === "relearning"
        ? simulateRelearningOutcome(state, rating, nowDate, variantContext)
        : simulateReviewOutcome(state, rating, nowDate, variantContext);
  const interval = intervalParts({
    intervalMinutes: nextReviewState.intervalMinutes,
    intervalDays: nextReviewState.intervalMinutes == null ? nextReviewState.intervalDays : null,
  });
  const intervalLabel = formatIntervalLabel(interval);
  const nextMaturity = deriveOutcomeMaturity(nextReviewState);

  return {
    rating,
    label: RATING_LABELS[rating],
    effect: RATING_EFFECT_LABELS[rating],
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    previousReviewState: state,
    nextReviewState,
    nextLearningItemState: nextReviewState,
    nextState: nextReviewState.state,
    dueAt: nextReviewState.dueAt,
    intervalDays: nextReviewState.intervalDays,
    intervalMinutes: nextReviewState.intervalMinutes,
    intervalMs: interval.intervalMs,
    intervalLabel,
    nextMaturity,
    fallbackEffect: {
      fallbackUntilCorrect: nextReviewState.fallbackUntilCorrect,
      forcedVariantId: nextReviewState.forcedVariantId,
      lastFailedVariantId: nextReviewState.lastFailedVariantId,
    },
    commit: Boolean(commit),
  };
}

export function getReviewButtonOptions(learningItem, variant = null, nowOrOptions = new Date().toISOString(), reviewEvents = []) {
  const options = typeof nowOrOptions === "object" && nowOrOptions !== null && !(nowOrOptions instanceof Date)
    ? nowOrOptions
    : { now: nowOrOptions, reviewEvents };
  const now = options.now ?? new Date().toISOString();
  const events = options.reviewEvents ?? reviewEvents ?? [];
  const ratings = ["again", "hard", "good", "easy"];

  return ratings.reduce((result, rating) => {
    const fallbackVariantId =
      rating === "again"
        ? options.fallbackVariantIdByRating?.[rating] ?? options.fallbackVariantId ?? null
        : null;
    const outcome = simulateRatingOutcome({
      learningItem,
      variant,
      rating,
      now,
      reviewEvents: events,
      deckSettings: options.deckSettings,
      fallbackVariantId,
    });

    result[rating] = {
      rating,
      label: outcome.label,
      intervalLabel: outcome.intervalLabel,
      dueAt: outcome.dueAt,
      nextState: outcome.nextState,
      nextMaturity: outcome.nextMaturity,
      schedulerVersion: outcome.schedulerVersion,
      effect: outcome.effect,
      intervalDays: outcome.intervalDays,
      intervalMinutes: outcome.intervalMinutes,
    };
    return result;
  }, {});
}

export function scheduleWithFsrsLikeModel(previousState, rating, context = {}) {
  return simulateRatingOutcome({
    previousState,
    rating,
    now: context.now ?? new Date().toISOString(),
    deckSettings: context.deckSettings,
    ...context,
  }).nextReviewState;
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

