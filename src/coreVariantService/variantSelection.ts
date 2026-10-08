import { getActiveVariants } from "../coreModel.ts";
import type { Card, CardVariant } from "../coreTypes.ts";

interface VariantSelectionOptions {
  maxVariantLevel?: number;
  preferredVariantLevel?: number;
  allowLearningVariant?: boolean;
}

function rotate(candidates: CardVariant[], repetitions: number): CardVariant | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((left, right) => left.variantLevel - right.variantLevel || left.id.localeCompare(right.id));
  return sorted[Math.abs(repetitions) % sorted.length];
}

export function isAutomaticRephraseVariant(variant: CardVariant | null | undefined, options: VariantSelectionOptions = {}): boolean {
  if (!variant || variant.qualityStatus !== "active" || !variant.isActive || variant.deletedAt) return false;
  if (variant.variantLevel > (options.maxVariantLevel ?? 3)) return false;
  if (variant.meta.containsNewFacts === true) return false;
  return variant.meta.relationToOriginal == null || variant.meta.relationToOriginal === "same_card_rephrasing";
}

export function selectAutomaticReviewVariant(card: Card, options: VariantSelectionOptions = {}): CardVariant | null {
  const { study } = card;
  const candidates = getActiveVariants(card).filter((variant) => isAutomaticRephraseVariant(variant, options));
  const forced = study.extra.forcedVariantId ? candidates.find((variant) => variant.id === study.extra.forcedVariantId) ?? null : null;
  if (study.extra.fallbackUntilCorrect || forced) return forced;
  const phase = study.state === "new" && study.reps > 0 ? "review" : study.state;
  if (phase === "new" || (phase === "learning" || phase === "relearning") && !options.allowLearningVariant) return null;
  const preferredLevel = Math.min(3, Math.max(2, Math.round(Number(options.preferredVariantLevel ?? study.extra.preferredVariantLevel ?? 2))));
  const eligible = candidates.filter((variant) => variant.variantLevel <= preferredLevel);
  return rotate(eligible, study.reps);
}
