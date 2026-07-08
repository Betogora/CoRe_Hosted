import { getActiveVariants, getOriginalVariant } from "./coreModel.js";

const AUTOMATIC_REPHRASE_TYPES = new Set(["basic", "cloze", "reverse"]);

function inferLearningPhase(state = {}) {
  const repetitions = Number(state.reps ?? state.repetitions ?? 0);
  if (!state.state || (state.state === "new" && repetitions > 0)) return repetitions > 0 ? "review" : "new";
  return state.state;
}

function clampAutomaticLevel(level) {
  return Math.min(3, Math.max(1, Math.round(Number(level) || 1)));
}

function rotateVariant(candidates, state = {}) {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((left, right) => {
    const levelDiff = Number(left.variantLevel ?? 1) - Number(right.variantLevel ?? 1);
    return levelDiff || String(left.id).localeCompare(String(right.id));
  });
  const index = Math.abs(Number(state.repetitions ?? 0)) % sorted.length;
  return sorted[index];
}

function cardTypeOf(card) {
  return card?.kind ?? card?.cardType ?? "basic";
}

function primaryVariantByType(card, variantType) {
  return getActiveVariants(card).find((variant) => variant.variantType === variantType) ?? null;
}

export function isAutomaticRephraseVariant(variant, options = {}) {
  if (!variant || variant.isOriginal || variant.qualityStatus !== "active" || variant.isActive === false) return false;
  const variantType = variant.variantType ?? "basic";
  const variantLevel = Number(variant.variantLevel ?? 1);
  const explicitlyAllowedTransferLike = (variantType === "transfer" && options.allowTransfer) || (variantType === "case" && options.allowCaseVignette);
  if (!AUTOMATIC_REPHRASE_TYPES.has(variantType) && !explicitlyAllowedTransferLike) return false;
  if (variantLevel < 1 || variantLevel > (options.maxVariantLevel ?? 3)) return false;
  if (variant.meta?.relationToOriginal && variant.meta.relationToOriginal !== "same_card_rephrasing") return Boolean(options.allowTransfer);
  if (variant.meta?.containsNewFacts) return Boolean(options.allowNewFacts);
  if (Number(variant.meta?.abstractionLevel ?? 1) > 2 && !options.allowTransfer) return false;
  return true;
}

export function selectAutomaticReviewVariant(card, options = {}) {
  const original = getOriginalVariant(card);
  const state = card?.learningItemState ?? card?.reviewState ?? {};
  const cardType = cardTypeOf(card);
  const primaryReverse = cardType === "basic-reversed" ? primaryVariantByType(card, "reverse") : null;
  const clozeVariants = cardType === "cloze" ? getActiveVariants(card).filter((variant) => variant.variantType === "cloze") : [];

  if (primaryReverse) return primaryReverse;
  if (clozeVariants.length > 0) return rotateVariant(clozeVariants, state);

  const phase = inferLearningPhase(state);
  const preferredLevel = clampAutomaticLevel(options.preferredVariantLevel ?? state.preferredVariantLevel ?? 1);
  const nearVariants = getActiveVariants(card).filter((variant) =>
    isAutomaticRephraseVariant(variant, {
      maxVariantLevel: 3,
      allowNewFacts: false,
      allowTransfer: Boolean(options.allowTransfer),
      allowCaseVignette: Boolean(options.allowCaseVignette),
    }),
  );

  if (state.fallbackUntilCorrect || state.forcedVariantId) {
    const forced = (card?.variants ?? []).find((variant) => variant.id === state.forcedVariantId) ?? null;
    if (!forced || forced.isOriginal) return original;
    return isAutomaticRephraseVariant(forced) ? forced : original;
  }

  if (phase === "new") return original;

  if (state.lastRating === "again" || state.lastRating === "hard") {
    return nearVariants.find((variant) => Number(variant.variantLevel ?? 1) <= 1) ?? original;
  }

  if (phase === "learning" || phase === "relearning") {
    if (!options.allowLearningVariant) return original;
    return rotateVariant(nearVariants.filter((variant) => Number(variant.variantLevel ?? 1) <= Math.min(2, preferredLevel)), state) ?? original;
  }

  if (phase === "review") {
    const allowed = nearVariants.filter((variant) => Number(variant.variantLevel ?? 1) <= preferredLevel);
    if (state.lastRating === "good" || state.lastRating === "easy") {
      return rotateVariant(allowed.filter((variant) => Number(variant.variantLevel ?? 1) >= 2), state) ?? rotateVariant(allowed, state) ?? original;
    }
    return rotateVariant(allowed, state) ?? original;
  }

  return original;
}
