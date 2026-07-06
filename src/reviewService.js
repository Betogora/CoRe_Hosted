import { SCHEDULER_VERSION, applyReviewRating } from "./scheduler.js";
import { chooseReviewCard, deactivateVariant, flagVariant, selectAutomaticReviewVariant } from "./coreVariantService.js";
import {
  createReviewState,
  createVersionEntry,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
  makeId,
  normalizeLearningItem,
  updateVariantPerformance,
} from "./coreModel.js";

function isDue(reviewState, now) {
  return new Date(reviewState?.dueAt ?? 0).getTime() <= new Date(now).getTime();
}

function updateCoreStateFromReview(card, reviewState, updatedAt = new Date().toISOString()) {
  return {
    ...card,
    learningItemState: reviewState,
    reviewState,
    coreState: {
      ...card.coreState,
      isCoreReady: ["variant_ready", "mastered"].includes(reviewState.maturityBand),
      lastReviewedAt: reviewState.lastReviewedAt,
      repetitionLevel: reviewState.repetitions,
      maturityXp: reviewState.maturityXp,
      maturityBand: reviewState.maturityBand,
      variantCount: getActiveVariants(card).length,
    },
    updatedAt,
  };
}

function isReviewBlocked(item) {
  return item.status === "suspended" || item.status === "buried" || item.meta?.suspended || item.meta?.buried;
}

function assertReviewable(item) {
  if (isReviewBlocked(item)) {
    throw new Error("Diese Grundkarte ist suspended oder buried und kann nicht reviewed werden.");
  }
  if (item.status === "deleted" || item.draftStatus === "draft") {
    throw new Error("Diese Grundkarte ist aktuell nicht reviewbar.");
  }
}

function findVariant(item, variantId) {
  const original = getOriginalVariant(item);
  if (!variantId || variantId === item.id) return original;
  return (item.variants ?? []).find((variant) => variant.id === variantId) ?? null;
}

function belongsToLearningItem(item, variant) {
  if (!item || !variant) return false;
  return [variant.learningItemId, variant.cardId, variant.sourceCardId].filter(Boolean).every((id) => id === item.id);
}

function createVariantCompatibilityState(variant, rating, now, learningItemId) {
  const previous = variant.reviewState ?? {};
  return {
    ...previous,
    id: previous.id ?? makeId("state"),
    learningItemId,
    reviewableType: "variant",
    reviewableId: variant.id,
    repetitions: Number(previous.repetitions ?? 0) + 1,
    lastReviewedAt: now,
    lastRating: rating,
    schedulerCompatibilityOnly: true,
  };
}

function resolveResponseArgs(responseTimeMsOrOptions, maybeOptions) {
  if (typeof responseTimeMsOrOptions === "object" && responseTimeMsOrOptions !== null) {
    return { responseTimeMs: responseTimeMsOrOptions.responseTimeMs ?? null, options: responseTimeMsOrOptions };
  }

  return { responseTimeMs: responseTimeMsOrOptions ?? maybeOptions?.responseTimeMs ?? null, options: maybeOptions ?? {} };
}

function createReviewEvent({ deck, item, variant, rating, responseTimeMs, now, previousState, nextState, previousVariantState, nextVariantState, anchorMiniCard, flags }) {
  return {
    id: makeId("review"),
    userId: "local-user",
    deckId: deck.id,
    learningItemId: item.id,
    cardId: item.id,
    cardVariantId: variant.id,
    variantId: variant.id,
    reviewableType: variant.isOriginal ? "card" : "variant",
    reviewableId: variant.id,
    sourceCardId: item.id,
    rating,
    reviewedAt: now,
    answeredAt: now,
    responseTimeMs,
    variantLevel: variant.variantLevel ?? 1,
    variantType: variant.variantType ?? "basic",
    previousLearningItemStateJson: previousState,
    nextLearningItemStateJson: nextState,
    schedulerVersion: SCHEDULER_VERSION,
    schedulerParamsJson: nextState.schedulerParamsJson ?? null,
    anchorVariantId: variant.anchorVariantId ?? null,
    anchorSnapshotJson: anchorMiniCard?.shouldShow ? anchorMiniCard : anchorMiniCard ?? null,
    schedulerBefore: { card: previousState, variant: previousVariantState ?? null },
    schedulerAfter: { card: nextState, variant: nextVariantState ?? null },
    flags: flags ?? {},
    createdAt: now,
  };
}

export function answerVariant(deck, learningItemId, cardVariantId, rating, responseTimeMsOrOptions = null, maybeOptions = {}) {
  const { responseTimeMs, options } = resolveResponseArgs(responseTimeMsOrOptions, maybeOptions);
  const now = options.now ?? new Date().toISOString();
  const targetItemId = learningItemId;
  let event = null;
  let updatedCard = null;

  const cards = (deck.cards ?? []).map((card) => {
    if (card.id !== targetItemId) return card;

    const item = normalizeLearningItem(card);
    assertReviewable(item);
    const variant = findVariant(item, cardVariantId);
    if (!variant) {
      throw new Error(`Variante nicht gefunden: ${String(cardVariantId ?? "")}`);
    }
    if (!belongsToLearningItem(item, variant)) {
      throw new Error("Diese Variante gehoert nicht zur angegebenen Grundkarte.");
    }

    const previousState = createReviewState(item.learningItemState ?? item.reviewState);
    const nextState = applyReviewRating(previousState, rating, {
      now,
      deckSettings: deck.deckSettings,
      isVariant: !variant.isOriginal,
      variantLevel: variant.variantLevel ?? 1,
      variantType: variant.variantType ?? "basic",
      variantPerformance: variant.performance ?? null,
    });
    const anchorMiniCard = getAnswerSideAnchorMiniCard(item, variant);
    const previousVariantState = variant.reviewState ?? null;
    const nextVariantState = createVariantCompatibilityState(variant, rating, now, item.id);
    const nextPerformance = updateVariantPerformance(variant.performance, rating, {
      responseTimeMs,
      reviewedAt: now,
      learningItemId: item.id,
      variantId: variant.id,
    });
    const variants = (item.variants ?? []).map((candidate) =>
      candidate.id === variant.id
        ? {
            ...candidate,
            reviewState: nextVariantState,
            performance: nextPerformance,
            updatedAt: now,
          }
        : candidate,
    );
    updatedCard = updateCoreStateFromReview({ ...item, variants }, nextState, now);
    event = createReviewEvent({
      deck,
      item,
      variant,
      rating,
      responseTimeMs,
      now,
      previousState,
      nextState,
      previousVariantState,
      nextVariantState,
      anchorMiniCard,
      flags: options.flags,
    });
    return updatedCard;
  });

  if (!updatedCard || !event) {
    throw new Error(`Grundkarte nicht gefunden: ${String(targetItemId ?? "")}`);
  }

  return {
    deck: {
      ...deck,
      cards,
      reviewEvents: [event, ...(deck.reviewEvents ?? [])],
      versionLog: [
        ...(deck.versionLog ?? []),
        createVersionEntry({
          objectType: "deck",
          objectId: deck.id,
          changeType: "review_event_recorded",
          after: { eventId: event.id, rating, learningItemId: updatedCard.id, variantId: event.variantId },
          createdAt: now,
        }),
      ],
      updatedAt: now,
    },
    event,
    updatedCard,
    learningItem: updatedCard,
    variant: updatedCard.variants.find((variant) => variant.id === event.variantId) ?? null,
  };
}

export function createReviewSession(deck, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const activeCards = (deck.cards ?? []).filter((card) => card.status !== "deleted" && card.draftStatus !== "draft");
  const dueCards = activeCards.filter((card) => isDue(card.reviewState, now));
  const sessionCards = dueCards.length > 0 ? dueCards : activeCards.slice(0, Math.min(12, activeCards.length));
  const generated = [];
  const choicesByCardId = new Map();

  const cards = (deck.cards ?? []).map((card) => {
    if (!sessionCards.some((sessionCard) => sessionCard.id === card.id)) return card;
    const choice = chooseReviewCard(card, deck.deckSettings, {
      variantSession: options.variantSession,
      allowGenerate: true,
      showGeneratedImmediately: true,
      language: options.language ?? "de",
    });
    generated.push(...choice.generated);
    choicesByCardId.set(card.id, choice.reviewable);
    return choice.card;
  });
  const items = sessionCards.map((card) => choicesByCardId.get(card.id)).filter(Boolean);

  return {
    deck: {
      ...deck,
      cards,
      aiJobs:
        generated.length > 0
          ? [
              ...(deck.aiJobs ?? []),
              {
                id: makeId("job"),
                jobType: "variant_generation",
                status: "succeeded",
                deckId: deck.id,
                resultRef: { generatedVariantIds: generated.map((variant) => variant.id) },
                createdAt: now,
                finishedAt: now,
                policy: deck.deckSettings?.aiPolicy ?? {},
              },
            ]
          : deck.aiJobs ?? [],
    },
    session: {
      id: makeId("session"),
      deckId: deck.id,
      startedAt: now,
      variantSession: Boolean(options.variantSession),
      items,
      generatedVariantCount: generated.length,
    },
  };
}

export function recordReviewRating(deck, reviewable, rating, options = {}) {
  const sourceCardId = reviewable.sourceCardId ?? reviewable.card?.id ?? reviewable.id;
  const card = (deck.cards ?? []).find((candidate) => candidate.id === sourceCardId);
  const item = card ? normalizeLearningItem(card) : null;
  const variantId =
    reviewable.reviewableType === "variant"
      ? reviewable.id
      : getOriginalVariant(item)?.id ?? reviewable.id;

  return answerVariant(deck, sourceCardId, variantId, rating, options.responseTimeMs ?? null, options);
}

function selectVariantForLearningItem(item) {
  return selectAutomaticReviewVariant(item, { allowLearningVariant: true }) ?? getOriginalVariant(item);
}

export function getNextReviewItem(deck, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const activeItems = (deck.cards ?? [])
    .map((card) => normalizeLearningItem(card))
    .filter((item) => item.status !== "deleted" && item.draftStatus !== "draft" && !isReviewBlocked(item));
  const dueItems = activeItems.filter((item) => isDue(item.learningItemState ?? item.reviewState, now));
  const selectedItem = dueItems[0] ?? activeItems[0] ?? null;

  if (!selectedItem) return null;

  const variant = selectVariantForLearningItem(selectedItem);
  if (!variant) return null;

  return {
    deckId: deck.id,
    learningItem: selectedItem,
    card: selectedItem,
    learningItemId: selectedItem.id,
    cardId: selectedItem.id,
    variant,
    cardVariantId: variant.id,
    variantId: variant.id,
    front: variant.front || getLearningItemQuestion(selectedItem),
    back: variant.back || getLearningItemAnswer(selectedItem),
    state: selectedItem.learningItemState ?? selectedItem.reviewState,
    reviewState: selectedItem.learningItemState ?? selectedItem.reviewState,
    answerSideAnchorMiniCard: getAnswerSideAnchorMiniCard(selectedItem, variant),
    schedulerInfo: {
      schedulerVersion: (selectedItem.learningItemState ?? selectedItem.reviewState)?.schedulerVersion ?? SCHEDULER_VERSION,
      selectedBy: dueItems.length > 0 ? "due_learning_item" : "fallback_learning_item",
    },
  };
}

export function recordVariantFeedback(deck, reviewable, options = {}) {
  const now = options.now ?? new Date().toISOString();
  if (!reviewable?.isVariant || !reviewable.sourceCardId) {
    return { deck, updatedCard: null };
  }

  let updatedCard = null;
  const cards = (deck.cards ?? []).map((card) => {
    if (card.id !== reviewable.sourceCardId) return card;
    if (!(card.variants ?? []).some((variant) => variant.id === reviewable.id)) return card;

    updatedCard =
      options.action === "disable"
        ? deactivateVariant(card, reviewable.id, options.reason ?? "Nutzer hat die Variante deaktiviert.")
        : flagVariant(card, reviewable.id, options.feedbackType ?? "fachlich_falsch", options.note ?? "");
    return updatedCard;
  });

  if (!updatedCard) {
    return { deck, updatedCard: null };
  }

  return {
    deck: {
      ...deck,
      cards,
      versionLog: [
        ...(deck.versionLog ?? []),
        createVersionEntry({
          objectType: "deck",
          objectId: deck.id,
          changeType: options.action === "disable" ? "variant_disabled" : "variant_flagged",
          after: { cardId: reviewable.sourceCardId, variantId: reviewable.id },
          createdAt: now,
        }),
      ],
      updatedAt: now,
    },
    updatedCard,
  };
}
