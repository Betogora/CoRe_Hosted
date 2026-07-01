import { REVIEW_RATINGS, createReviewState, getMaturityBand } from "./coreModel.js";

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

export function updateMaturityXp(oldXp, rating, wasVariant = false) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const variantBonus = wasVariant && (rating === "good" || rating === "easy") ? 4 : 0;
  return Math.max(0, Math.round(Number(oldXp ?? 0) + RATING_EFFECT[rating].xp + variantBonus));
}

export function applyReviewRating(reviewState, rating, context = {}) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const now = context.now ? new Date(context.now) : new Date();
  const state = createReviewState(reviewState);
  const effect = RATING_EFFECT[rating];
  const intervalDays = nextIntervalDays(state, rating, context.deckSettings);
  const maturityXp = updateMaturityXp(state.maturityXp, rating, Boolean(context.isVariant));
  const ease = Math.max(1.3, Math.min(3.3, Number(state.ease ?? 2.5) + effect.ease));

  return createReviewState({
    ...state,
    dueAt: addDays(now, intervalDays).toISOString(),
    intervalDays,
    ease,
    repetitions: Number(state.repetitions ?? 0) + 1,
    lapses: Number(state.lapses ?? 0) + effect.lapse,
    maturityXp,
    maturityBand: getMaturityBand(maturityXp),
    lastReviewedAt: now.toISOString(),
  });
}

export function listReviewableCards(deck) {
  return (deck.cards ?? []).filter((card) => card.status !== "deleted" && card.draftStatus !== "draft");
}

export function summarizeDeckReview(deck, now = new Date()) {
  const cards = listReviewableCards(deck);
  const nowTime = new Date(now).getTime();
  const dueCards = cards.filter((card) => new Date(card.reviewState?.dueAt ?? 0).getTime() <= nowTime);
  const matureCards = cards.filter((card) => ["variant_ready", "mastered"].includes(card.reviewState?.maturityBand));
  const activeVariants = cards.flatMap((card) => card.variants ?? []).filter((variant) => variant.qualityStatus === "active");
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

