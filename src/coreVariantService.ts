import { createCardVariant, createDefaultDeckSettings, getActiveVariants, stableContentHash } from "./coreModel.ts";
import { stripHtml } from "./htmlSafety.ts";
import { calculateRetrievability } from "./scheduler.ts";
import { isAutomaticRephraseVariant, selectAutomaticReviewVariant } from "./coreVariantService/variantSelection.ts";
import type { CardVariant, LearningItem, ReviewRating, VariantFeedbackType } from "./coreTypes.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];
type DateInput = string | number | Date;
interface ReviewEventInput { learningItemId?: string; sourceCardId?: string; rating?: ReviewRating | "manual"; answeredAt?: string; createdAt?: string; variantId?: string | null }
interface VariantServiceOptions { now?: DateInput; variantSession?: boolean; allowGenerate?: boolean; showGeneratedImmediately?: boolean }

export {
  CARD_VARIATION_PROMPT_TEMPLATE,
  CARD_VARIATION_PROMPT_VERSION,
  buildCardVariationPrompt,
  generateRephrasedVariantsForLearningItem,
  parseVariantGenerationResponse,
  validateVariantSuggestion,
} from "./coreVariantService/variantGeneration.ts";
export { isAutomaticRephraseVariant, selectAutomaticReviewVariant } from "./coreVariantService/variantSelection.ts";
export { getActiveVariants } from "./coreModel.ts";

function plain(value: unknown): string { return stripHtml(value).replace(/\s+/g, " ").trim(); }

export function classifyCardEligibility(card: LearningItem, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const reasons: string[] = [];
  if (settings.coreMode === "off") reasons.push("CoRe-Modus ist für diesen Stapel ausgeschaltet.");
  if (card.cardType !== "basic") reasons.push("KI-Umformulierungen sind nur für Basic-Karten verfügbar.");
  if (!plain(card.originalFront) || !plain(card.originalBack)) reasons.push("Vorder- oder Rückseite fehlt.");
  return { eligible: reasons.length === 0, reasons, blockedTransforms: reasons.length ? ["rephrase"] : [], cardId: card.id };
}

export function createRephraseVariant(card: LearningItem, options: { front?: string; back?: string; variantLevel?: number; modelRunId?: string | null; confidence?: number } = {}): CardVariant {
  return createCardVariant({
    cardId: card.id,
    front: options.front ?? card.originalFront,
    back: options.back ?? card.originalBack,
    variantLevel: options.variantLevel ?? 2,
    modelRunId: options.modelRunId ?? null,
    confidence: options.confidence ?? 0.75,
    meta: { generationSource: "ai_generated", sourceContentHash: card.contentHash },
  });
}

export function getReviewSuccessProfile(item: LearningItem, reviewEvents: ReviewEventInput[] = []) {
  const events = reviewEvents
    .filter((event) => event.rating !== "manual" && (event.learningItemId === item.id || event.sourceCardId === item.id))
    .sort((left, right) => String(left.answeredAt ?? left.createdAt).localeCompare(String(right.answeredAt ?? right.createdAt)));
  const positive = events.filter((event) => event.rating === "good" || event.rating === "easy");
  return {
    reviewCount: events.length,
    successfulReviewCount: positive.length,
    recentFailureCount: events.slice(-5).filter((event) => event.rating === "again").length,
    lastSuccessfulVariantId: [...positive].reverse().find((event) => event.variantId)?.variantId ?? null,
  };
}

export function getLearningItemMaturity(item: LearningItem, now: DateInput = new Date(), reviewEvents: ReviewEventInput[] = []) {
  const state = item.reviewState;
  const profile = getReviewSuccessProfile(item, reviewEvents);
  const score = Number(state.maturityXp ?? 0);
  const stage = state.maturityBand ?? "new";
  return {
    stage,
    score,
    label: stage,
    description: score >= 121 ? "Bereit für KI-Umformulierungen." : "Grundkarte weiter festigen.",
    isStable: score >= 121,
    isFragile: profile.recentFailureCount > 0,
    successfulReviewCount: profile.successfulReviewCount,
    consecutivePositiveReviews: profile.successfulReviewCount,
    consecutiveGoodOrEasy: profile.successfulReviewCount,
    recentFailureCount: profile.recentFailureCount,
    retrievability: calculateRetrievability(state, now),
    stability: Number(state.stability ?? 0),
    difficulty: Number(state.difficulty ?? 0),
    intervalDays: Number(state.intervalDays ?? 0),
    reps: Number(state.repetitions ?? state.reps ?? 0),
    reasons: [] as string[],
  };
}

export function getVariantReadiness(item: LearningItem, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const maturity = getLearningItemMaturity(item, options.now, reviewEvents);
  const ready = maturity.isStable && !maturity.isFragile;
  return {
    allowedLevels: ready ? [2, 3] : [] as number[],
    preferredLevel: ready ? 2 : 1,
    maxAllowedLevel: ready ? 3 : 1,
    allowAiRephrasing: ready,
    allowAdvancedVariants: false,
    shouldPreferOriginal: !ready,
    shouldFallbackToOriginal: maturity.isFragile,
    reason: ready ? "Lernstand ist stabil." : "Grundkarte hat Vorrang.",
    maturity,
  };
}

export function getVariantCoverage(item: LearningItem) {
  const active = getActiveVariants(item);
  const levelCounts = Object.fromEntries([1, 2, 3].map((level) => [level, active.filter((variant) => variant.variantLevel === level).length]));
  return {
    originalCount: 0,
    activeRephraseCount: active.length,
    aiGeneratedCount: active.length,
    userEditedCount: 0,
    levelCounts,
    hasOriginal: false,
    hasNearRephrases: active.length > 0,
    hasEnoughVariants: active.length >= 2,
    missingRecommendedLevels: [2, 3].filter((level) => !levelCounts[level]),
    warnings: [] as string[],
  };
}

export function getVariantGenerationRecommendation(item: LearningItem, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const maturity = getLearningItemMaturity(item, options.now, reviewEvents);
  const readiness = getVariantReadiness(item, reviewEvents, options);
  const coverage = getVariantCoverage(item);
  const shouldSuggest = readiness.allowAiRephrasing && !coverage.hasEnoughVariants;
  return { shouldSuggest, shouldAutoGenerate: false, shouldShowInUi: true, mode: "manual", recommendedVariantCount: shouldSuggest ? 1 : 0, recommendedLevels: readiness.allowedLevels, allowedVariantTypes: ["basic"] as const, reason: readiness.reason, warnings: coverage.warnings, maturity, readiness, coverage };
}

export function getVariantGenerationPlan(item: LearningItem, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const recommendation = getVariantGenerationRecommendation(item, reviewEvents, options);
  return { shouldGenerate: false, recommendation, cardId: item.id };
}

export function createVariantReviewModel(item: LearningItem, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const maturity = getLearningItemMaturity(item, options.now, reviewEvents);
  const readiness = getVariantReadiness(item, reviewEvents, options);
  const coverage = getVariantCoverage(item);
  const variantGenerationRecommendation = getVariantGenerationRecommendation(item, reviewEvents, options);
  return { maturity, readiness, coverage, variantGenerationRecommendation, variantGenerationPlan: getVariantGenerationPlan(item, reviewEvents, options), generationRecommendation: variantGenerationRecommendation, generationPlan: getVariantGenerationPlan(item, reviewEvents, options) };
}

export function getVariantFallbackTarget(_item: LearningItem, failedVariant: CardVariant | null) {
  return { fallbackVariantId: null, fallbackReason: failedVariant ? "Nach einer falschen Antwort folgt wieder die Grundkarte." : "Grundkarte erneut zeigen.", shouldUseOriginal: true, previousVariantId: failedVariant?.id ?? null };
}

export function ensureVariantsForCard(card: LearningItem, deckSettings: DeckSettingsInput = {}) {
  const eligibility = classifyCardEligibility(card, deckSettings);
  return { card: { ...card, meta: { ...card.meta, eligibility }, coreState: { ...card.coreState, eligibility, variantCount: getActiveVariants(card).length } }, generated: [] as CardVariant[], eligibility };
}

export function toReviewable(card: LearningItem, variant: CardVariant | null = null) {
  return variant
    ? { id: variant.id, reviewableType: "variant" as const, sourceCardId: card.id, front: variant.front, back: variant.back, transformType: variant.transformType, isVariant: true, card, variant }
    : { id: card.id, reviewableType: "card" as const, sourceCardId: card.id, front: card.originalFront, back: card.originalBack, isVariant: false, card, variant: null };
}

export function chooseReviewCard(card: LearningItem, deckSettings: DeckSettingsInput = {}, options: VariantServiceOptions = {}) {
  const eligibility = classifyCardEligibility(card, deckSettings);
  const variant = eligibility.eligible ? selectAutomaticReviewVariant(card, { allowLearningVariant: true, preferredVariantLevel: options.variantSession ? 3 : undefined }) : null;
  return { card, reviewable: toReviewable(card, variant), generated: [] as CardVariant[], eligibility };
}

export function deactivateVariant(card: LearningItem, variantId: string, _reason = "Nutzer hat die Variante deaktiviert."): LearningItem {
  const updatedAt = new Date().toISOString();
  return { ...card, variants: card.variants.map((variant) => variant.id === variantId ? { ...variant, isActive: false, qualityStatus: "disabled", updatedAt } : variant), updatedAt };
}

export function flagVariant(card: LearningItem, variantId: string, type: VariantFeedbackType, note = ""): LearningItem {
  const updatedAt = new Date().toISOString();
  return {
    ...card,
    variants: card.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      isActive: false,
      qualityStatus: "flagged",
      feedback: [...variant.feedback, { id: stableContentHash({ variantId, type, note, updatedAt }, "feedback"), type, note, createdAt: updatedAt }],
      updatedAt,
    } : variant),
    updatedAt,
  };
}
