import {
  CORE_CARD_TYPES,
  createCardVariant,
  createDefaultDeckSettings,
  createVersionEntry,
  getActiveVariants,
  getOriginalVariant,
  stableContentHash,
} from "./coreModel.ts";
import { stripHtml } from "./htmlSafety.js";
import { calculateRetrievability, getSchedulerStateForItem } from "./scheduler.ts";
import { isAutomaticRephraseVariant, selectAutomaticReviewVariant } from "./coreVariantService/variantSelection.ts";
import type {
  CardVariant,
  LearningItem,
  ReviewRating,
  ReviewState,
  TransformType,
} from "./coreTypes.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];
type DateInput = string | number | Date;

interface ReviewEventInput {
  learningItemId?: string;
  cardId?: string;
  sourceCardId?: string;
  variantId?: string;
  cardVariantId?: string;
  rating?: ReviewRating;
  reviewedAt?: string;
  answeredAt?: string;
  createdAt?: string;
}

interface VariantServiceOptions {
  language?: string;
  style?: string | null;
  modelRunId?: string | null;
  confidence?: number;
  now?: DateInput;
  maturity?: VariantMaturity;
  readiness?: VariantReadiness;
  coverage?: VariantCoverage;
  recommendation?: VariantRecommendation;
  plan?: unknown;
  force?: boolean;
  providerConfigured?: boolean;
  variantProvider?: unknown;
  provider?: unknown;
  autoGenerateAllowed?: boolean;
  variantSession?: boolean;
  allowGenerate?: boolean;
  showGeneratedImmediately?: boolean;
}

interface VariantMaturity {
  stage: string;
  score: number;
  label: string;
  description: string;
  isStable: boolean;
  isFragile: boolean;
  successfulReviewCount: number;
  consecutivePositiveReviews: number;
  consecutiveGoodOrEasy: number;
  recentFailureCount: number;
  retrievability: number;
  stability: number;
  difficulty: number;
  intervalDays: number;
  reps: number;
  reasons: string[];
}

interface VariantReadiness {
  allowedLevels: number[];
  preferredLevel: number;
  maxAllowedLevel: number;
  allowAiRephrasing: boolean;
  allowAdvancedVariants: boolean;
  shouldPreferOriginal: boolean;
  shouldFallbackToOriginal: boolean;
  reason: string;
  maturity: VariantMaturity;
}

interface VariantCoverage {
  originalCount: number;
  activeRephraseCount: number;
  aiGeneratedCount: number;
  userEditedCount: number;
  levelCounts: Record<number, number>;
  hasOriginal: boolean;
  hasNearRephrases: boolean;
  hasEnoughVariants: boolean;
  missingRecommendedLevels: number[];
  warnings: string[];
}

interface VariantRecommendation {
  shouldSuggest: boolean;
  shouldAutoGenerate: boolean;
  shouldShowInUi: boolean;
  mode: string;
  recommendedVariantCount: number;
  recommendedLevels: number[];
  allowedVariantTypes: readonly string[];
  reason: string;
  warnings: string[];
  maturity: VariantMaturity;
  readiness: VariantReadiness;
  coverage: VariantCoverage;
}

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

const DEFAULT_VARIANT_TYPES = ["basic", "cloze", "reverse"];
const VOCAB_TAGS = ["vocab", "vocabulary", "vokabel", "wortschatz", "translation"];
const EXACT_WORDING_TAGS = ["exact", "wortlaut", "definition", "quote", "gesetz"];

function plain(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function lowerTags(card: LearningItem): string[] {
  return (card.originalTags ?? []).map((tag) => String(tag).toLowerCase());
}

function containsMathLikeText(text: string): boolean {
  return /(\$[^$]+\$|\\\(|\\\[|=>|<=|>=|[a-z]\s*=\s*[^?]+)/i.test(text);
}

function isVeryShort(front: string, back: string): boolean {
  const combinedLength = `${front} ${back}`.trim().length;
  return front.length < 10 || back.length < 8 || combinedLength < 34;
}

function blockedByDeckSettings(card: LearningItem, deckSettings: ReturnType<typeof createDefaultDeckSettings>, transformType: TransformType): boolean {
  const blacklist = deckSettings.blacklist ?? {};
  const tags = lowerTags(card);

  return (
    blacklist.cardTypes?.includes(card.kind) ||
    blacklist.cardIds?.includes(card.id) ||
    blacklist.transforms?.includes(transformType) ||
    tags.some((tag) => blacklist.tags?.map((value) => String(value).toLowerCase()).includes(tag))
  );
}

export function classifyCardEligibility(card: LearningItem, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const front = plain(card.originalFront);
  const back = plain(card.originalBack);
  const tags = lowerTags(card);
  const reasons: string[] = [];
  const blockedTransforms: string[] = [];

  if (!CORE_CARD_TYPES.includes(card.kind)) {
    reasons.push("Unbekannter Kartentyp.");
  }
  if (settings.coreMode === "off") {
    reasons.push("CoRe-Modus ist für diesen Stapel ausgeschaltet.");
  }
  if (blockedByDeckSettings(card, settings, "rephrase")) {
    reasons.push("Deck-, Karten- oder Transformations-Blacklist greift.");
    blockedTransforms.push("rephrase");
  }
  if (tags.some((tag) => VOCAB_TAGS.includes(tag))) {
    reasons.push("Vokabel- oder reine Übersetzungskarte.");
  }
  if (tags.some((tag) => EXACT_WORDING_TAGS.includes(tag)) || card.meta?.exactWordingRequired) {
    reasons.push("Exakter Wortlaut ist wahrscheinlich Lernziel.");
  }
  if (card.kind === "image-occlusion") {
    reasons.push("Bildvariation ist im MVP nicht aktiv.");
    blockedTransforms.push("image_variation");
  }
  if (isVeryShort(front, back)) {
    reasons.push("Zu wenig textlicher Kontext für robuste Variation.");
  }
  if (containsMathLikeText(`${front} ${back}`)) {
    reasons.push("Mathematische oder formelartige Karte braucht manuelle Freigabe.");
  }

  const eligible = reasons.length === 0;
  const allowedTransforms = eligible
    ? ["rephrase", ...(card.kind === "basic" ? ["front_back_style_shift", "cloze_conversion"] : [])]
    : [];
  const score = eligible ? Math.min(0.95, 0.58 + Math.min(0.3, (front.length + back.length) / 700)) : Math.max(0.08, 0.42 - reasons.length * 0.07);

  return {
    eligible,
    score: Math.round(score * 100) / 100,
    allowedTransforms,
    blockedTransforms,
    reason: eligible ? "Ausreichend textlicher Kontext und kein Blacklist-Treffer." : reasons.join(" "),
    recommendedCoreMode: eligible ? settings.coreMode : "off_or_original_only",
  };
}

function rephraseQuestion(front: unknown): string {
  const clean = plain(front).replace(/\?+$/, "");

  if (/^was\s+ist\s+/i.test(clean)) {
    return clean.replace(/^was\s+ist\s+/i, "Wie lässt sich ") + " beschreiben?";
  }
  if (/^welche\s+/i.test(clean)) {
    return clean.replace(/^welche\s+/i, "Nenne die ") + ".";
  }
  if (/^warum\s+/i.test(clean)) {
    return clean.replace(/^warum\s+/i, "Begründe, weshalb ") + ".";
  }
  if (/^wie\s+/i.test(clean)) {
    return clean.replace(/^wie\s+/i, "Beschreibe, wie ") + ".";
  }

  return `Formuliere den Kerninhalt zu: ${clean}`;
}

export function createRephraseVariant(card: LearningItem, options: VariantServiceOptions = {}): CardVariant {
  const profile = {
    language: options.language ?? "de",
    preserveMeaning: true,
    reduceVisualRecognition: true,
    maxVariants: 1,
    style: options.style ?? "careful-local-rephrase",
  };
  const variantFront = rephraseQuestion(card.originalFront);
  const variantBack = card.originalBack;

  return createCardVariant({
    sourceCardId: card.id,
    learningItemId: card.id,
    cardId: card.id,
    variantType: "basic",
    variantLevel: 2,
    front: variantFront,
    back: variantBack,
    transformType: "rephrase",
    transformProfile: profile,
    generationSource: "ai_generated",
    isOriginal: false,
    modelRunId: options.modelRunId ?? null,
    confidence: options.confidence ?? 0.82,
    semanticDelta: "none",
    changedRecognitionCues: ["opening", "ending", "case_pattern"],
    sourceAnchors: card.sourceAnchors ?? [],
    meta: {
      generatedBy: "local-core-variant-service",
      sourceContentHash: card.contentHash,
    },
  });
}

function reviewTimestamp(event: ReviewEventInput): number {
  return new Date(event?.reviewedAt ?? event?.answeredAt ?? event?.createdAt ?? 0).getTime();
}

function getItemReviewEvents(item: LearningItem, reviewEvents: ReviewEventInput[] = []): ReviewEventInput[] {
  return (reviewEvents ?? [])
    .filter((event) => [event.learningItemId, event.cardId, event.sourceCardId].includes(item?.id))
    .sort((left, right) => reviewTimestamp(right) - reviewTimestamp(left));
}

function isPositiveRating(rating: ReviewRating | null | undefined): boolean {
  return rating != null && (["hard", "good", "easy"] as ReviewRating[]).includes(rating);
}

function isStrongPositiveRating(rating: ReviewRating | null | undefined): boolean {
  return rating != null && (["good", "easy"] as ReviewRating[]).includes(rating);
}

function successfulReviewCountFromState(state: Partial<ReviewState>): number {
  return Math.max(0, Number(state.reps ?? state.repetitions ?? 0) - Number(state.lapses ?? 0));
}

export function getReviewSuccessProfile(item: LearningItem, reviewEvents: ReviewEventInput[] = []) {
  const events = getItemReviewEvents(item, reviewEvents);
  const state = getSchedulerStateForItem(item);
  const totalReviews = events.length > 0 ? events.length : Number(state.reps ?? state.repetitions ?? 0);
  const successfulReviews = events.length > 0
    ? events.filter((event) => isPositiveRating(event.rating)).length
    : successfulReviewCountFromState(state);
  let consecutivePositiveReviews = 0;
  let consecutiveGoodOrEasy = 0;

  for (const event of events) {
    if (isPositiveRating(event.rating)) consecutivePositiveReviews += 1;
    else break;
  }

  for (const event of events) {
    if (isStrongPositiveRating(event.rating)) consecutiveGoodOrEasy += 1;
    else break;
  }

  if (events.length === 0 && isPositiveRating(state.lastRating)) {
    consecutivePositiveReviews = successfulReviews;
    consecutiveGoodOrEasy = isStrongPositiveRating(state.lastRating) ? successfulReviews : 0;
  }

  const lastFailure = events.find((event) => event.rating === "again") ?? null;
  const lastSuccess = events.find((event) => isPositiveRating(event.rating)) ?? null;
  const recentEvents = events.slice(0, 5);
  const inferredRecentFailure = state.lastRating === "again" ? 1 : 0;

  return {
    totalReviews,
    successfulReviews,
    consecutivePositiveReviews,
    consecutiveGoodOrEasy,
    lastRating: events[0]?.rating ?? state.lastRating ?? null,
    recentFailureCount: events.length > 0 ? recentEvents.filter((event) => event.rating === "again").length : inferredRecentFailure,
    lastReviewedVariantId: events[0]?.variantId ?? events[0]?.cardVariantId ?? null,
    lastSuccessfulVariantId: lastSuccess?.variantId ?? lastSuccess?.cardVariantId ?? state.previousSuccessfulVariantId ?? null,
    lastFailedVariantId: lastFailure?.variantId ?? lastFailure?.cardVariantId ?? state.lastFailedVariantId ?? null,
  };
}

export function getLearningItemMaturity(
  item: LearningItem,
  now: DateInput | ReviewEventInput[] = new Date(),
  reviewEvents: ReviewEventInput[] = [],
): VariantMaturity {
  if (Array.isArray(now)) {
    reviewEvents = now;
    now = new Date();
  }

  const state = getSchedulerStateForItem(item);
  const rawState = item?.learningItemState ?? item?.reviewState ?? {};
  const hasExplicitStability = rawState.stability != null;
  const hasFsrsReviewSignal = Boolean(state.lastReviewedAt);
  const profile = getReviewSuccessProfile(item, reviewEvents);
  const reps = Number(state.reps ?? state.repetitions ?? 0);
  const stability = Number(state.stability ?? 0);
  const difficulty = Number(state.difficulty ?? 5);
  const intervalDays = Number(state.intervalDays ?? 0);
  const retrievability = calculateRetrievability(state, now);
  const successfulReviewCount = Math.max(profile.successfulReviews, successfulReviewCountFromState(state));
  const recentFailureCount = profile.recentFailureCount;
  const reasons: string[] = [];
  let stage = "new";

  const isFragile =
    state.state === "relearning" ||
    state.lastRating === "again" ||
    recentFailureCount > 0 ||
    (reps > 0 && hasExplicitStability && hasFsrsReviewSignal && stability < 0.75) ||
    (reps > 0 && hasExplicitStability && hasFsrsReviewSignal && retrievability < 0.55) ||
    difficulty >= 8.5;
  const isStable = state.state === "review" && !isFragile && stability >= 4 && retrievability >= 0.7;

  if (state.state === "relearning" || state.lastRating === "again") {
    stage = "relearning";
    reasons.push("Zuletzt falsch beantwortet oder im Relearning.");
  } else if (reps === 0 || state.state === "new") {
    stage = "new";
    reasons.push("Noch keine Wiederholung.");
  } else if (state.state === "learning") {
    stage = "learning";
    reasons.push("Noch im Lernzustand.");
  } else if (state.state === "review") {
    if (stability >= 30 || (intervalDays >= 21 && successfulReviewCount >= 5 && recentFailureCount === 0)) {
      stage = "mastered";
      reasons.push("Hohe Stabilität oder langes Intervall ohne aktuelle Fehler.");
    } else if ((successfulReviewCount >= 4 || stability >= 10 || intervalDays >= 7) && recentFailureCount === 0) {
      stage = "mature";
      reasons.push("Mehrere erfolgreiche Reviews oder stabile FSRS-Werte.");
    } else if ((profile.consecutiveGoodOrEasy >= 3 || successfulReviewCount >= 3 || stability >= 4) && !isFragile) {
      stage = "variant_ready";
      reasons.push("Mindestens drei gute Abrufe oder vergleichbare Stabilität.");
    } else {
      stage = "early_review";
      reasons.push("Review begonnen, aber noch nicht robust genug für automatische Varianten.");
    }
  } else {
    stage = reps > 0 ? "early_review" : "new";
    reasons.push("Legacy-State wurde konservativ eingeordnet.");
  }

  const score = Math.min(
    100,
    Math.max(
      0,
      Math.round(successfulReviewCount * 14 + Math.min(36, stability * 3) + Math.min(20, intervalDays) + retrievability * 20 - recentFailureCount * 18),
    ),
  );
  const labels: Record<string, string> = {
    new: "Neu",
    learning: "Lernen",
    early_review: "Frühes Review",
    variant_ready: "Bereit für Varianten",
    mature: "Reif",
    mastered: "Sicher",
    relearning: "Wiederlernen",
  };

  return {
    stage,
    score,
    label: labels[stage],
    description: reasons[0],
    isStable,
    isFragile,
    successfulReviewCount,
    consecutivePositiveReviews: profile.consecutivePositiveReviews,
    consecutiveGoodOrEasy: profile.consecutiveGoodOrEasy,
    recentFailureCount,
    retrievability,
    stability,
    difficulty,
    intervalDays,
    reps,
    reasons,
  };
}

export function getVariantReadiness(
  item: LearningItem,
  reviewEvents: ReviewEventInput[] = [],
  options: VariantServiceOptions = {},
): VariantReadiness {
  const maturity = options.maturity ?? getLearningItemMaturity(item, options.now ?? new Date(), reviewEvents);
  const state = getSchedulerStateForItem(item);
  const base = {
    allowedLevels: [1],
    preferredLevel: 1,
    maxAllowedLevel: 1,
    allowAiRephrasing: false,
    allowAdvancedVariants: false,
    shouldPreferOriginal: true,
    shouldFallbackToOriginal: false,
    reason: "Erst die Originalkarte stabil lernen.",
    maturity,
  };

  if (state.fallbackUntilCorrect || state.forcedVariantId) {
    return {
      ...base,
      shouldFallbackToOriginal: true,
      reason: "Fallback aktiv: erst Original oder einfachere Variante stabil beantworten.",
    };
  }

  if (maturity.stage === "early_review") {
    return {
      ...base,
      allowedLevels: [1, 2],
      maxAllowedLevel: 2,
      reason: "Frühes Review: nur Original oder sehr nahe Umformulierung.",
    };
  }

  if (maturity.stage === "variant_ready") {
    return {
      ...base,
      allowedLevels: [1, 2],
      preferredLevel: Math.min(2, Number(state.preferredVariantLevel ?? 2) || 2),
      maxAllowedLevel: 2,
      allowAiRephrasing: true,
      shouldPreferOriginal: false,
      reason: "Die Grundkarte ist stabil genug für eine nahe KI-Umformulierung.",
    };
  }

  if (maturity.stage === "mature") {
    return {
      ...base,
      allowedLevels: [1, 2, 3],
      preferredLevel: Math.min(3, Math.max(2, Number(state.preferredVariantLevel ?? 2) || 2)),
      maxAllowedLevel: 3,
      allowAiRephrasing: true,
      shouldPreferOriginal: false,
      reason: "Reife Grundkarte: nahe Level-2/3-Varianten dürfen rotieren.",
    };
  }

  if (maturity.stage === "mastered") {
    return {
      ...base,
      allowedLevels: [1, 2, 3],
      preferredLevel: 3,
      maxAllowedLevel: 3,
      allowAiRephrasing: true,
      shouldPreferOriginal: false,
      reason: "Sehr stabile Grundkarte: nahe Varianten sind sicher möglich.",
    };
  }

  if (maturity.stage === "relearning") {
    return {
      ...base,
      shouldFallbackToOriginal: true,
      reason: "Nach Fehlern fällt CoRe auf Original oder Level 1 zurück.",
    };
  }

  return base;
}

export function getVariantCoverage(item: LearningItem): VariantCoverage {
  const variants = item?.variants ?? [];
  const originals = variants.filter((variant) => variant.isOriginal);
  const activeNearVariants = getActiveVariants(item).filter((variant) => isAutomaticRephraseVariant(variant));
  const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const warnings: string[] = [];

  for (const variant of activeNearVariants) {
    const level = Math.min(3, Math.max(1, Number(variant.variantLevel ?? 1) || 1));
    levelCounts[level] += 1;
  }

  if (originals.length === 0) warnings.push("Keine Originalvariante gefunden.");
  if (activeNearVariants.length > 3) warnings.push("Variantenflut vermeiden: mehr als drei aktive nahe Varianten.");

  return {
    originalCount: originals.length,
    activeRephraseCount: activeNearVariants.length,
    aiGeneratedCount: activeNearVariants.filter((variant) => variant.generationSource === "ai_generated").length,
    userEditedCount: activeNearVariants.filter((variant) => variant.generationSource === "user_edited").length,
    levelCounts,
    hasOriginal: originals.length > 0,
    hasNearRephrases: activeNearVariants.length > 0,
    hasEnoughVariants: activeNearVariants.length >= 2,
    missingRecommendedLevels: [1, 2, 3].filter((level) => levelCounts[level] === 0),
    warnings,
  };
}

function recommendedCoverageTarget(stage: string): number {
  if (stage === "variant_ready") return 1;
  if (stage === "mature" || stage === "mastered") return 2;
  return 0;
}

function recommendedLevelsFor(readiness: VariantReadiness, coverage: VariantCoverage, count: number): number[] {
  const levels = readiness.allowedLevels.filter((level) => level > 1 && coverage.levelCounts[level] === 0);
  const fallback = readiness.allowedLevels.filter((level) => level > 1);
  return (levels.length > 0 ? levels : fallback).slice(0, Math.max(0, count));
}

export function getVariantGenerationRecommendation(
  item: LearningItem,
  reviewEvents: ReviewEventInput[] = [],
  options: VariantServiceOptions = {},
): VariantRecommendation {
  const maturity = options.maturity ?? getLearningItemMaturity(item, options.now ?? new Date(), reviewEvents);
  const readiness = options.readiness ?? getVariantReadiness(item, reviewEvents, { ...options, maturity });
  const coverage = options.coverage ?? getVariantCoverage(item);
  const warnings = [...coverage.warnings];
  const coverageTarget = recommendedCoverageTarget(maturity.stage);
  const enoughForStage = coverage.activeRephraseCount >= coverageTarget;
  const state = getSchedulerStateForItem(item);
  const recentFailure = maturity.recentFailureCount > 0 || maturity.stage === "relearning" || state.fallbackUntilCorrect || Boolean(state.forcedVariantId);
  let shouldSuggest = false;
  let mode = "none";
  let reason = readiness.reason;

  if (coverage.activeRephraseCount > 3) {
    warnings.push("Keine weitere automatische Empfehlung: Variantenflut vermeiden.");
  } else if (readiness.allowAiRephrasing && !enoughForStage && !recentFailure) {
    shouldSuggest = true;
    mode = "generate_near_rephrases";
    reason = "Reifegrad passt und nahe Varianten fehlen.";
  } else if (options.force && recentFailure) {
    shouldSuggest = true;
    mode = "generate_simpler_rephrase";
    reason = "Erzwungene einfache Variante nach Fehlern.";
  } else if (options.force && !enoughForStage) {
    shouldSuggest = true;
    mode = "suggest_prompt";
    reason = "Erzwungene Vorschau trotz konservativer Standardlogik.";
  } else if (enoughForStage && coverageTarget > 0) {
    reason = "Genug nahe Varianten vorhanden.";
  }

  const missingCount = Math.max(0, coverageTarget - coverage.activeRephraseCount);
  const recommendedVariantCount = shouldSuggest ? Math.min(2, Math.max(1, missingCount || 1)) : 0;
  const recommendedLevels = recommendedLevelsFor(readiness, coverage, recommendedVariantCount);
  const providerConfigured = Boolean(options.providerConfigured || options.variantProvider || options.provider);
  const shouldAutoGenerate = Boolean(shouldSuggest && options.autoGenerateAllowed && providerConfigured);

  return {
    shouldSuggest,
    shouldAutoGenerate,
    shouldShowInUi: shouldSuggest,
    mode,
    recommendedVariantCount,
    recommendedLevels,
    allowedVariantTypes: DEFAULT_VARIANT_TYPES,
    reason,
    warnings,
    maturity,
    readiness,
    coverage,
  };
}

export function getVariantGenerationPlan(item: LearningItem, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const recommendation = options.recommendation ?? getVariantGenerationRecommendation(item, reviewEvents, options);
  const canGenerate = Boolean(recommendation.shouldSuggest || options.force);
  const maxVariantLevel = Math.min(3, recommendation.readiness.maxAllowedLevel || 1);

  return {
    canGenerate,
    reason: canGenerate ? recommendation.reason : `Keine Varianten-Erzeugung: ${recommendation.reason}`,
    promptOptions: {
      numberOfVariants: canGenerate ? Math.max(1, recommendation.recommendedVariantCount || 1) : 0,
      language: options.language ?? "de",
      maxVariantLevel,
      allowedVariantTypes: DEFAULT_VARIANT_TYPES,
      keepCloseToOriginal: true,
      allowNewFacts: false,
      allowTransfer: false,
      allowCaseVignette: false,
      recommendedLevels: recommendation.recommendedLevels,
    },
    recommendation,
    maturity: recommendation.maturity,
    readiness: recommendation.readiness,
    coverage: recommendation.coverage,
  };
}

export function createVariantReviewModel(item: LearningItem, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const now = options.now ?? new Date();
  const maturity = options.maturity ?? getLearningItemMaturity(item, now, reviewEvents);
  const readiness = options.readiness ?? getVariantReadiness(item, reviewEvents, { ...options, now, maturity });
  const coverage = options.coverage ?? getVariantCoverage(item);
  const variantGenerationRecommendation =
    options.recommendation ??
    getVariantGenerationRecommendation(item, reviewEvents, {
      ...options,
      now,
      maturity,
      readiness,
      coverage,
    });
  const variantGenerationPlan =
    options.plan ??
    getVariantGenerationPlan(item, reviewEvents, {
      ...options,
      now,
      recommendation: variantGenerationRecommendation,
    });

  return {
    maturity,
    readiness,
    coverage,
    variantGenerationRecommendation,
    variantGenerationPlan,
    generationRecommendation: variantGenerationRecommendation,
    generationPlan: variantGenerationPlan,
  };
}

export function getVariantFallbackTarget(item: LearningItem, failedVariant: CardVariant | null, reviewEvents: ReviewEventInput[] = []) {
  const original = getOriginalVariant(item);
  const profile = getReviewSuccessProfile(item, reviewEvents);
  const failed = failedVariant ?? original;
  const failedLevel = Number(failed?.variantLevel ?? 1) || 1;
  const activeNearVariants = getActiveVariants(item)
    .filter((variant) => isAutomaticRephraseVariant(variant))
    .sort((left, right) => Number(right.variantLevel ?? 1) - Number(left.variantLevel ?? 1));

  if (!failed || failed.isOriginal) {
    return {
      fallbackVariantId: original?.id ?? null,
      fallbackReason: "Originalvariante falsch beantwortet: beim Original bleiben.",
      shouldUseOriginal: true,
      previousVariantId: profile.lastSuccessfulVariantId,
    };
  }

  const targetLevel = failedLevel >= 3 ? 2 : failedLevel >= 2 ? 1 : 0;
  const fallback = targetLevel > 0
    ? activeNearVariants.find((variant) => Number(variant.variantLevel ?? 1) <= targetLevel)
    : null;
  const target = fallback ?? original ?? failed;

  return {
    fallbackVariantId: target?.id ?? null,
    fallbackReason: fallback
      ? `Level-${failedLevel}-Variante falsch beantwortet: Rückfall auf Level ${fallback.variantLevel}.`
      : `Level-${failedLevel}-Variante falsch beantwortet: Rückfall auf Originalkarte.`,
    shouldUseOriginal: !fallback,
    previousVariantId: profile.lastSuccessfulVariantId,
  };
}

export function ensureVariantsForCard(card: LearningItem, deckSettings: DeckSettingsInput = {}, options: VariantServiceOptions = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const eligibility = classifyCardEligibility(card, settings);
  const activeVariants = getActiveVariants(card);

  if (!eligibility.eligible || activeVariants.length >= settings.maxActiveVariantsPerCard) {
    return {
      card: {
        ...card,
        meta: { ...card.meta, eligibility },
        coreState: { ...card.coreState, eligibility, variantCount: activeVariants.length },
      },
      generated: [],
      eligibility,
    };
  }

  const nextVariant = createRephraseVariant(card, options);
  const existingHashes = new Set((card.variants ?? []).map((variant) => variant.contentHash));
  const generated = existingHashes.has(nextVariant.contentHash) ? [] : [nextVariant];
  const existingGeneratedVariants = (card.variants ?? []).filter((variant) => !variant.isOriginal);
  const originalVariants = (card.variants ?? []).filter((variant) => variant.isOriginal);
  const variants = [...existingGeneratedVariants, ...generated, ...originalVariants];

  return {
    card: {
      ...card,
      variants,
      meta: { ...card.meta, eligibility },
      coreState: {
        ...card.coreState,
        eligibility,
        variantCount: variants.filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal).length,
      },
      updatedAt: new Date().toISOString(),
    },
    generated,
    eligibility,
  };
}

export function toReviewable(card: LearningItem, variant: CardVariant | null = null) {
  if (!variant) {
    return {
      id: card.id,
      reviewableType: "card",
      sourceCardId: card.id,
      front: card.originalFront,
      back: card.originalBack,
      sourceAnchors: card.sourceAnchors ?? [],
      isVariant: false,
      card,
    };
  }

  return {
    id: variant.id,
    reviewableType: "variant",
    sourceCardId: card.id,
    front: variant.front,
    back: variant.back,
    sourceAnchors: variant.sourceAnchors ?? card.sourceAnchors ?? [],
    transformType: variant.transformType,
    isVariant: true,
    card,
    variant,
  };
}

export function chooseReviewCard(card: LearningItem, deckSettings: DeckSettingsInput = {}, options: VariantServiceOptions = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const baseEligibility = classifyCardEligibility(card, settings);
  let nextCard = {
    ...card,
    meta: { ...card.meta, eligibility: baseEligibility },
    coreState: { ...card.coreState, eligibility: baseEligibility },
  };

  if (settings.coreMode === "off" || !baseEligibility.eligible) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  const maturityXp = Number(card.reviewState?.maturityXp ?? card.coreState?.maturityXp ?? 0);
  if (maturityXp < settings.variantThresholdXp) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  if (settings.coreMode === "manual" && !options.variantSession) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  const activeVariant = selectAutomaticReviewVariant(nextCard, { allowLearningVariant: true });
  if (activeVariant && !activeVariant.isOriginal) {
    return { card: nextCard, reviewable: toReviewable(nextCard, activeVariant), generated: [], eligibility: baseEligibility };
  }

  if (options.allowGenerate === false) {
    return { card: nextCard, reviewable: toReviewable(nextCard), generated: [], eligibility: baseEligibility };
  }

  const ensured = ensureVariantsForCard(nextCard, settings, options);
  nextCard = ensured.card;
  const generatedVariant = ensured.generated[0] ?? null;

  return {
    card: nextCard,
    reviewable: generatedVariant && options.showGeneratedImmediately !== false ? toReviewable(nextCard, generatedVariant) : toReviewable(nextCard),
    generated: ensured.generated,
    eligibility: ensured.eligibility,
  };
}

export function deactivateVariant(card: LearningItem, variantId: string, reason = "Nutzer hat die Variante deaktiviert."): LearningItem {
  const updatedAt = new Date().toISOString();
  return {
    ...card,
    variants: (card.variants ?? []).map((variant) =>
      variant.id === variantId
        ? {
            ...variant,
            qualityStatus: "disabled",
            updatedAt,
            versionLog: [
              ...(variant.versionLog ?? []),
              createVersionEntry({
                objectType: "variant",
                objectId: variant.id,
                changeType: "disabled",
                before: { qualityStatus: variant.qualityStatus },
                after: { qualityStatus: "disabled" },
                reason,
                createdAt: updatedAt,
              }),
            ],
          }
        : variant,
    ),
    updatedAt,
  };
}

export function flagVariant(card: LearningItem, variantId: string, feedbackType: string, note = ""): LearningItem {
  const updatedAt = new Date().toISOString();
  const feedback = {
    id: stableContentHash({ variantId, feedbackType, note, updatedAt }, "feedback"),
    type: feedbackType,
    note,
    createdAt: updatedAt,
  };

  return {
    ...card,
    variants: (card.variants ?? []).map((variant) =>
      variant.id === variantId
        ? {
            ...variant,
            qualityStatus: "flagged",
            feedback: [...(variant.feedback ?? []), feedback],
            updatedAt,
            versionLog: [
              ...(variant.versionLog ?? []),
              createVersionEntry({
                objectType: "variant",
                objectId: variant.id,
                changeType: "flagged",
                before: { qualityStatus: variant.qualityStatus },
                after: { qualityStatus: "flagged", feedbackType },
                reason: note,
                createdAt: updatedAt,
              }),
            ],
          }
        : variant,
    ),
    updatedAt,
  };
}
