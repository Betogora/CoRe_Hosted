import { createDefaultDeckSettings, getActiveVariants, reviewStateFromCardStudy, stableContentHash } from "./coreModel.ts";
import { stripSanitizedHtml } from "./htmlSafety.ts";
import { calculateRetrievability } from "./scheduler.ts";
import type { Card, CardVariant, Note, ReviewRating, VariantFeedbackType } from "./coreTypes.ts";

type DeckSettingsInput = Parameters<typeof createDefaultDeckSettings>[0];
type DateInput = string | number | Date;
interface ReviewEventInput { cardId?: string; rating?: ReviewRating | "manual"; answeredAt?: string; createdAt?: string; variantId?: string | null }
interface VariantServiceOptions { now?: DateInput; variantSession?: boolean }

export { isAutomaticRephraseVariant, selectAutomaticReviewVariant } from "./coreVariantService/variantSelection.ts";
export { getActiveVariants } from "./coreModel.ts";

function plainText(html: string): string {
  return stripSanitizedHtml(html).replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/** Plain question and answer of a reveal card; the only source of AI rephrasings (other building blocks follow later). */
export function cardVariantSource(note: Pick<Note, "content">, card: Pick<Card, "promptKey">): { front: string; back: string } | null {
  const { content } = note;
  if (content.interaction.kind !== "reveal") return null;
  const prompt = content.interaction.prompts.find((candidate) => candidate.key === card.promptKey);
  if (!prompt) return null;
  const fieldText = (ids: string[]) => ids
    .map((id) => content.fields.find((field) => field.id === id))
    .map((field) => field ? plainText(field.html) : "")
    .filter(Boolean)
    .join(" ");
  const front = fieldText(prompt.questionFieldIds);
  const back = fieldText(prompt.answerFieldIds);
  return front && back ? { front, back } : null;
}

/** A rephrased variant shown as a transient front/back content of its card; extra and source fields stay visible. */
export function variantPresentation(note: Note, card: Card, variant: CardVariant): { note: Note; card: Card } {
  const supplements = note.content.fields.filter((field) => field.role === "extra" || field.role === "source");
  return {
    note: {
      ...note,
      content: {
        schemaVersion: 1,
        fields: [
          { id: "variant-front", name: "Vorderseite", role: "prompt", html: variant.front },
          { id: "variant-back", name: "Rückseite", role: "answer", html: variant.back },
          ...supplements,
        ],
        interaction: { kind: "reveal", prompts: [{ key: "forward", name: "Variante", instruction: "", questionFieldIds: ["variant-front"], answerFieldIds: ["variant-back"], requires: null, typeInFieldId: null }] },
        speech: [],
        tags: note.content.tags,
      },
    },
    card: { ...card, id: variant.id, promptKey: "forward" },
  };
}

export function classifyCardEligibility(note: Pick<Note, "content">, card: Pick<Card, "id" | "promptKey">, deckSettings: DeckSettingsInput = {}) {
  const settings = createDefaultDeckSettings(deckSettings);
  const reasons: string[] = [];
  if (settings.coreMode === "off") reasons.push("CoRe-Modus ist für diesen Stapel ausgeschaltet.");
  if (note.content.interaction.kind !== "reveal") reasons.push("KI-Umformulierungen sind nur für Karten mit Frage und Antwort verfügbar.");
  else if (!cardVariantSource(note, card)) reasons.push("Frage oder Antwort fehlt.");
  return { eligible: reasons.length === 0, reasons, blockedTransforms: reasons.length ? ["rephrase"] : [], cardId: card.id };
}

export function getReviewSuccessProfile(card: Card, reviewEvents: ReviewEventInput[] = []) {
  const events = reviewEvents
    .filter((event) => event.rating !== "manual" && event.cardId === card.id)
    .sort((left, right) => String(left.answeredAt ?? left.createdAt).localeCompare(String(right.answeredAt ?? right.createdAt)));
  const positive = events.filter((event) => event.rating === "good" || event.rating === "easy");
  return {
    reviewCount: events.length,
    successfulReviewCount: positive.length,
    recentFailureCount: events.slice(-5).filter((event) => event.rating === "again").length,
    lastSuccessfulVariantId: [...positive].reverse().find((event) => event.variantId)?.variantId ?? null,
  };
}

function getCardMaturity(card: Card, now: DateInput = new Date(), reviewEvents: ReviewEventInput[] = []) {
  const { study } = card;
  const profile = getReviewSuccessProfile(card, reviewEvents);
  const score = Number(study.extra.maturityXp ?? 0);
  const stage = study.extra.maturityBand ?? "new";
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
    retrievability: calculateRetrievability(reviewStateFromCardStudy(study), now),
    stability: Number(study.stability ?? 0),
    difficulty: Number(study.difficulty ?? 0),
    intervalDays: Number(study.intervalDays ?? 0),
    reps: Number(study.reps ?? 0),
    reasons: [] as string[],
  };
}

export function getVariantReadiness(card: Card, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const maturity = getCardMaturity(card, options.now, reviewEvents);
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

export function getVariantCoverage(card: Card) {
  const active = getActiveVariants(card);
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

export function createVariantReviewModel(card: Card, reviewEvents: ReviewEventInput[] = [], options: VariantServiceOptions = {}) {
  const maturity = getCardMaturity(card, options.now, reviewEvents);
  const readiness = getVariantReadiness(card, reviewEvents, options);
  const coverage = getVariantCoverage(card);
  const shouldSuggest = readiness.allowAiRephrasing && !coverage.hasEnoughVariants;
  const variantGenerationRecommendation = {
    shouldSuggest,
    shouldAutoGenerate: false,
    shouldShowInUi: true,
    mode: "manual",
    recommendedVariantCount: shouldSuggest ? 1 : 0,
    recommendedLevels: readiness.allowedLevels,
    allowedVariantTypes: ["basic"] as const,
    reason: readiness.reason,
    warnings: coverage.warnings,
    maturity,
    readiness,
    coverage,
  };
  return {
    maturity,
    readiness,
    coverage,
    variantGenerationRecommendation,
    variantGenerationPlan: { shouldGenerate: false, recommendation: variantGenerationRecommendation, cardId: card.id },
  };
}

export function getVariantFallbackTarget(_card: Card, failedVariant: CardVariant | null) {
  return { fallbackVariantId: null, fallbackReason: failedVariant ? "Nach einer falschen Antwort folgt wieder die Grundkarte." : "Grundkarte erneut zeigen.", shouldUseOriginal: true, previousVariantId: failedVariant?.id ?? null };
}

export function deactivateVariant(card: Card, variantId: string, _reason = "Nutzer hat die Variante deaktiviert."): Card {
  const updatedAt = new Date().toISOString();
  return { ...card, variants: card.variants.map((variant) => variant.id === variantId ? { ...variant, isActive: false, qualityStatus: "disabled", updatedAt, revision: variant.revision + 1 } : variant), updatedAt };
}

export function flagVariant(card: Card, variantId: string, type: VariantFeedbackType, note = ""): Card {
  const updatedAt = new Date().toISOString();
  return {
    ...card,
    variants: card.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      isActive: false,
      qualityStatus: "flagged",
      feedback: [...variant.feedback, { id: stableContentHash({ variantId, type, note, updatedAt }, "feedback"), type, note, createdAt: updatedAt }],
      updatedAt,
      revision: variant.revision + 1,
    } : variant),
    updatedAt,
  };
}
