import { chooseReviewCard, deactivateVariant, flagVariant } from "./coreVariantService.js";
import { createVersionEntry, getOriginalVariant, makeId, normalizeLearningItem } from "./coreModel.js";
import { answerVariant } from "./reviewFlow.js";

export { answerVariant, getNextReviewItem } from "./reviewFlow.js";

function isDue(reviewState, now) {
  return new Date(reviewState?.dueAt ?? 0).getTime() <= new Date(now).getTime();
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
