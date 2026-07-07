import { SCHEDULER_VERSION, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.js";
import {
  chooseReviewCard,
  createVariantReviewModel,
  deactivateVariant,
  flagVariant,
  getVariantFallbackTarget,
  selectAutomaticReviewVariant,
} from "./coreVariantService.js";
import {
  createDefaultDeckSettings,
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

function localDateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfLocalDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function stateReps(state = {}) {
  return Math.max(0, Math.round(Number(state?.reps ?? state?.repetitions ?? 0) || 0));
}

function isNewLearningItem(item) {
  return stateReps(item?.learningItemState ?? item?.reviewState) === 0;
}

function activeLearningItems(deck) {
  return (deck?.cards ?? [])
    .map((card) => normalizeLearningItem(card))
    .filter((item) => item.status !== "deleted" && item.draftStatus !== "draft" && !isReviewBlocked(item));
}

function asDeckArray(decksOrDeck) {
  if (Array.isArray(decksOrDeck)) return decksOrDeck;
  return decksOrDeck ? [decksOrDeck] : [];
}

function collectDeckScope(decksOrDeck, deckId = null) {
  const decks = asDeckArray(decksOrDeck);
  if (!deckId) return decks;

  const selected = decks.find((deck) => deck.id === deckId) ?? null;
  if (!selected) return decks;

  const scopedIds = new Set([selected.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const deck of decks) {
      if (deck.parentDeckId && scopedIds.has(deck.parentDeckId) && !scopedIds.has(deck.id)) {
        scopedIds.add(deck.id);
        changed = true;
      }
    }
  }

  return decks.filter((deck) => scopedIds.has(deck.id));
}

function reviewEventDate(event) {
  return event.reviewedAt ?? event.answeredAt ?? event.createdAt;
}

function wasNewBeforeReview(event) {
  const previous = event.previousLearningItemStateJson ?? event.schedulerBefore?.card ?? {};
  return previous.state === "new" || stateReps(previous) === 0;
}

function reviewKey(deckId, learningItemId) {
  return `${deckId}:${learningItemId}`;
}

function compareQueueEntries(left, right) {
  const leftDue = new Date(left.learningItem.reviewState?.dueAt ?? left.learningItem.createdAt ?? 0).getTime();
  const rightDue = new Date(right.learningItem.reviewState?.dueAt ?? right.learningItem.createdAt ?? 0).getTime();
  return leftDue - rightDue || String(left.learningItem.createdAt ?? "").localeCompare(String(right.learningItem.createdAt ?? ""));
}

export function getLocalReviewDateKey(now = new Date()) {
  return localDateKey(now);
}

export function getEffectiveNewCardsPerDay(deck, options = {}) {
  const settings = createDefaultDeckSettings(deck?.deckSettings ?? {});
  const dateKey = options.dateKey ?? localDateKey(options.now ?? new Date());
  const override = settings.newCardsTodayOverride;

  if (override?.date === dateKey) {
    return Math.max(0, Math.round(Number(override.limit) || 0));
  }

  return settings.newCardsPerDay;
}

export function updateDeckNewCardLimitForDate(deck, limit, options = {}) {
  const now = options.now ?? new Date();
  const updatedAt = options.updatedAt ?? new Date(now).toISOString();
  const nextLimit = Math.max(0, Math.round(Number(limit) || 0));

  return {
    ...deck,
    deckSettings: {
      ...deck.deckSettings,
      newCardsTodayOverride: {
        date: getLocalReviewDateKey(now),
        limit: nextLimit,
      },
    },
    updatedAt,
  };
}

export function countNewCardsIntroducedToday(decksOrDeck, options = {}) {
  const now = options.now ?? new Date();
  const dateKey = options.dateKey ?? localDateKey(now);
  const scopeDecks = collectDeckScope(decksOrDeck, options.deckId);
  const introduced = new Set();

  for (const deck of scopeDecks) {
    for (const event of deck.reviewEvents ?? []) {
      if (localDateKey(reviewEventDate(event) ?? now) !== dateKey) continue;
      if (!wasNewBeforeReview(event)) continue;
      introduced.add(reviewKey(deck.id, event.learningItemId ?? event.cardId));
    }
  }

  return introduced.size;
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

function createReviewEvent({ deck, item, variant, rating, responseTimeMs, now, previousState, nextState, previousVariantState, nextVariantState, anchorMiniCard, fallbackInfo, flags }) {
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
    fallbackInfo: fallbackInfo ?? null,
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
      throw new Error("Diese Variante gehört nicht zur angegebenen Grundkarte.");
    }

    const previousState = createReviewState(item.learningItemState ?? item.reviewState);
    const fallbackInfo = rating === "again" ? getVariantFallbackTarget(item, variant, deck.reviewEvents ?? []) : null;
    const outcome = simulateRatingOutcome({
      learningItem: item,
      previousState,
      variant,
      rating,
      now,
      deckSettings: deck.deckSettings,
      isVariant: !variant.isOriginal,
      variantId: variant.id,
      variantIsOriginal: Boolean(variant.isOriginal),
      variantLevel: variant.variantLevel ?? 1,
      variantType: variant.variantType ?? "basic",
      variantPerformance: variant.performance ?? null,
      fallbackVariantId: fallbackInfo?.fallbackVariantId ?? null,
    });
    const nextState = outcome.nextReviewState;
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
      fallbackInfo,
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
  const variantId = reviewable.reviewableType === "variant" ? reviewable.id : getOriginalVariant(item)?.id ?? reviewable.id;

  return answerVariant(deck, sourceCardId, variantId, rating, options.responseTimeMs ?? null, options);
}

function selectVariantForLearningItem(item, options = {}) {
  return selectAutomaticReviewVariant(item, { allowLearningVariant: true, ...options }) ?? getOriginalVariant(item);
}

function createFallbackViewModel(item) {
  const state = item.learningItemState ?? item.reviewState ?? {};
  if (!state.fallbackUntilCorrect && !state.forcedVariantId) return null;

  const forcedVariant = (item.variants ?? []).find((variant) => variant.id === state.forcedVariantId) ?? getOriginalVariant(item);
  const failedVariant = (item.variants ?? []).find((variant) => variant.id === state.lastFailedVariantId) ?? null;

  return {
    active: true,
    fallbackVariantId: forcedVariant?.id ?? null,
    failedVariantId: failedVariant?.id ?? state.lastFailedVariantId ?? null,
    shouldUseOriginal: Boolean(forcedVariant?.isOriginal ?? true),
    fallbackReason: failedVariant
      ? `Nach Fehler bei Level ${failedVariant.variantLevel ?? 1}: Rückfall auf ${forcedVariant?.isOriginal ? "Originalkarte" : `Level ${forcedVariant?.variantLevel ?? 1}`}.`
      : "Fallback aktiv: CoRe nutzt Original oder eine einfachere Variante, bis wieder korrekt geantwortet wurde.",
  };
}

function createReviewItemViewModel(deck, selectedItem, options = {}) {
  if (!selectedItem) return null;

  const now = options.now ?? new Date().toISOString();
  const reviewEvents = deck.reviewEvents ?? [];
  const variantReviewModel = createVariantReviewModel(selectedItem, reviewEvents, {
    now,
    autoGenerateAllowed: options.autoGenerateAllowed,
    language: options.language ?? "de",
  });
  const fallbackInfo = createFallbackViewModel(selectedItem);
  const variant = selectVariantForLearningItem(selectedItem, { now, reviewEvents, variantSession: options.variantSession });
  if (!variant) return null;
  const fallbackTarget = getVariantFallbackTarget(selectedItem, variant, reviewEvents);
  const ratingButtonOptions = getReviewButtonOptions(selectedItem, variant, {
    now,
    reviewEvents,
    deckSettings: deck.deckSettings,
    fallbackVariantId: fallbackTarget?.fallbackVariantId ?? null,
  });

  return {
    deckId: deck.id,
    deckName: deck.name,
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
    maturity: variantReviewModel.maturity,
    variantReadiness: variantReviewModel.readiness,
    variantCoverage: variantReviewModel.coverage,
    variantGenerationRecommendation: variantReviewModel.variantGenerationRecommendation,
    variantGenerationPlan: variantReviewModel.variantGenerationPlan,
    ratingButtonOptions,
    fallbackInfo,
    answerSideAnchorMiniCard: getAnswerSideAnchorMiniCard(selectedItem, variant),
    schedulerInfo: {
      schedulerVersion: (selectedItem.learningItemState ?? selectedItem.reviewState)?.schedulerVersion ?? SCHEDULER_VERSION,
      selectedBy: options.selectedBy ?? "due_learning_item",
      queueKind: options.queueKind ?? null,
    },
  };
}

export function getNextReviewItem(deck, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const activeItems = activeLearningItems(deck);
  const dueItems = activeItems.filter((item) => isDue(item.learningItemState ?? item.reviewState, now));
  const selectedItem = dueItems[0] ?? activeItems[0] ?? null;

  if (!selectedItem) return null;

  return createReviewItemViewModel(deck, selectedItem, {
    ...options,
    selectedBy: dueItems.length > 0 ? "due_learning_item" : "fallback_learning_item",
  });
}

export function createDailyReviewQueue(decksOrDeck, options = {}) {
  const now = options.now ?? new Date();
  const rootDeckId = options.deckId ?? (Array.isArray(decksOrDeck) ? decksOrDeck[0]?.id : decksOrDeck?.id) ?? null;
  const allDecks = asDeckArray(decksOrDeck);
  const rootDeck = allDecks.find((deck) => deck.id === rootDeckId) ?? allDecks[0] ?? null;
  const scopeDecks = collectDeckScope(decksOrDeck, rootDeckId);
  const excludeKeys = new Set(options.excludeKeys ?? []);
  const dueEntries = [];
  const newEntries = [];

  for (const deck of scopeDecks) {
    for (const learningItem of activeLearningItems(deck)) {
      const key = reviewKey(deck.id, learningItem.id);
      if (excludeKeys.has(key)) continue;

      if (isNewLearningItem(learningItem)) {
        newEntries.push({ deck, learningItem, key });
        continue;
      }

      if (isDue(learningItem.learningItemState ?? learningItem.reviewState, now)) {
        dueEntries.push({ deck, learningItem, key });
      }
    }
  }

  dueEntries.sort(compareQueueEntries);
  newEntries.sort(compareQueueEntries);

  const newLimit = getEffectiveNewCardsPerDay(rootDeck, { now });
  const introducedToday = countNewCardsIntroducedToday(scopeDecks, { now });
  const remainingNewCards = Math.max(0, newLimit - introducedToday);
  const selectedEntries = [...dueEntries, ...newEntries.slice(0, remainingNewCards)];
  const items = selectedEntries
    .map((entry) =>
      createReviewItemViewModel(entry.deck, entry.learningItem, {
        ...options,
        now,
        selectedBy: entry.learningItem.reviewState?.reps === 0 || entry.learningItem.reviewState?.repetitions === 0 ? "new_learning_item" : "due_learning_item",
        queueKind: isNewLearningItem(entry.learningItem) ? "new" : "due",
      }),
    )
    .filter(Boolean);

  return {
    deckId: rootDeck?.id ?? null,
    deckName: rootDeck?.name ?? "",
    scopeDeckIds: scopeDecks.map((deck) => deck.id),
    items,
    total: items.length,
    dueCount: dueEntries.length,
    newCount: Math.min(newEntries.length, remainingNewCards),
    availableNewCards: newEntries.length,
    newCardsPerDay: newLimit,
    newCardsIntroducedToday: introducedToday,
    remainingNewCards,
    dateKey: localDateKey(now),
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
