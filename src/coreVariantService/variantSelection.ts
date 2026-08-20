import { getActiveVariants } from "../coreModel.ts";
import type { CardVariant, LearningItem, ReviewSchedulerState, ReviewState } from "../coreTypes.ts";

type ReviewStateInput = Partial<ReviewState>;

interface VariantSelectionOptions {
  maxVariantLevel?: number;
  preferredVariantLevel?: number;
  allowLearningVariant?: boolean;
}

function phaseOf(state: ReviewStateInput): ReviewSchedulerState {
  const repetitions = Number(state.reps ?? state.repetitions ?? 0);
  return !state.state || state.state === "new" && repetitions > 0 ? repetitions > 0 ? "review" : "new" : state.state;
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

export function selectAutomaticReviewVariant(card: LearningItem, options: VariantSelectionOptions = {}): CardVariant | null {
  const state = card.reviewState;
  const candidates = getActiveVariants(card).filter((variant) => isAutomaticRephraseVariant(variant, options));
  const forced = state.forcedVariantId ? candidates.find((variant) => variant.id === state.forcedVariantId) ?? null : null;
  if (state.fallbackUntilCorrect || forced) return forced;
  const phase = phaseOf(state);
  if (phase === "new" || (phase === "learning" || phase === "relearning") && !options.allowLearningVariant) return null;
  const preferredLevel = Math.min(3, Math.max(2, Math.round(Number(options.preferredVariantLevel ?? state.preferredVariantLevel ?? 2))));
  const eligible = candidates.filter((variant) => variant.variantLevel <= preferredLevel);
  return rotate(eligible, state.repetitions);
}
