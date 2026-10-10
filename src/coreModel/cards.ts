import { sanitizeNoteHtml, stripSanitizedHtml } from "../htmlSafety.ts";
import type { Card, CardVariant, VariantPerformance } from "../coreTypes.ts";
import { VARIANT_STATUSES, makeId, stableContentHash } from "./coreValues.ts";
import { createVariantPerformance } from "./reviewState.ts";

interface VariantPerformanceInput extends Partial<Omit<VariantPerformance, "id" | "attempts">> {
  id?: string | null;
  attempts?: number | null;
}
export interface CardVariantInput extends Partial<Omit<CardVariant, "cardId" | "performance">> {
  cardId?: string | null;
  performance?: VariantPerformanceInput | null;
}

export function createCardVariant({
  id = makeId("variant"),
  cardId,
  variantType = "basic",
  variantLevel = 2,
  front = "",
  back = "",
  explanation = "",
  isActive = true,
  transformType = "rephrase",
  transformProfile = {},
  modelRunId = null,
  confidence = 0.75,
  semanticDelta = "none",
  changedRecognitionCues = [],
  qualityStatus = "active",
  performance = null,
  feedback = [],
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
  meta = {},
}: CardVariantInput): CardVariant {
  if (!cardId) throw new Error("Varianten benötigen eine Karten-ID.");
  if (variantType !== "basic") throw new Error(`Unbekannte Variantenart: ${variantType}`);
  if (transformType !== "rephrase") throw new Error(`Unbekannte Transformationsart: ${transformType}`);
  if (!VARIANT_STATUSES.includes(qualityStatus)) throw new Error(`Unbekannter Variantenstatus: ${qualityStatus}`);
  const sanitizedFront = sanitizeNoteHtml(front);
  const sanitizedBack = sanitizeNoteHtml(back);
  const active = Boolean(isActive) && qualityStatus === "active" && deletedAt === null;
  return {
    id,
    cardId,
    variantType: "basic",
    variantLevel: Math.min(3, Math.max(1, Math.round(Number(variantLevel) || 2))),
    front: sanitizedFront,
    back: sanitizedBack,
    explanation,
    isActive: active,
    transformType: "rephrase",
    transformProfile,
    modelRunId,
    confidence: Math.min(1, Math.max(0, Number(confidence) || 0)),
    semanticDelta,
    changedRecognitionCues,
    qualityStatus: active ? "active" : qualityStatus === "active" ? "disabled" : qualityStatus,
    contentHash: stableContentHash({
      cardId,
      front: stripSanitizedHtml(sanitizedFront).trim().toLowerCase(),
      back: stripSanitizedHtml(sanitizedBack).trim().toLowerCase(),
    }, "variant"),
    performance: createVariantPerformance({ ...(performance ?? {}), cardId, variantId: id }),
    feedback,
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    meta,
  };
}

/** Adds a generated rephrasing to its card; it shares the card's study state and due date. */
export function addCardVariant(card: Card, input: CardVariantInput, updatedAt = new Date().toISOString()): Card {
  const variant = createCardVariant({ ...input, cardId: card.id, createdAt: input.createdAt ?? updatedAt, updatedAt: input.updatedAt ?? updatedAt });
  return { ...card, variants: [...card.variants, variant], updatedAt };
}

/** A new rephrasing replaces the card's outdated ones (K6.4); they are deleted like any removed variant. */
export function replaceOutdatedVariants(card: Card, input: CardVariantInput, updatedAt = new Date().toISOString()): Card {
  const variants = card.variants.map((variant) => variant.meta.outdated === true && !variant.deletedAt
    ? { ...variant, deletedAt: updatedAt, updatedAt, revision: variant.revision + 1 }
    : variant);
  return addCardVariant({ ...card, variants }, input, updatedAt);
}

export function getActiveVariants(card: Pick<Card, "variants"> | null | undefined): CardVariant[] {
  return (card?.variants ?? []).filter((variant) => variant.qualityStatus === "active" && variant.isActive && !variant.deletedAt);
}

export function isCardReviewBlocked(card: Pick<Card, "status" | "deletedAt"> | null | undefined): boolean {
  return !card || card.status !== "active" || card.deletedAt !== null;
}

/** Suspension keeps study state and due date unchanged and only bumps the entity revision. */
export function setCardSuspended(card: Card, suspended: boolean, updatedAt = new Date().toISOString()): Card {
  const status = suspended ? "suspended" : "active";
  if (card.status === status) return card;
  return { ...card, status, updatedAt, revision: card.revision + 1 };
}

/** Manual reschedule changes only the due date; phase and memory stay, suspension stays. */
export function rescheduleCard(card: Card, dueAt: string, occurredAt = new Date().toISOString()): Card {
  const dueTimestamp = Date.parse(dueAt);
  const occurredTimestamp = Date.parse(occurredAt);
  if (!Number.isFinite(dueTimestamp) || !Number.isFinite(occurredTimestamp)) {
    throw new Error("Der neue Fälligkeitstermin ist ungültig.");
  }
  if (card.study.dueAt === dueAt) return card;
  if (dueTimestamp <= occurredTimestamp) throw new Error("Der neue Fälligkeitstermin muss in der Zukunft liegen.");
  return { ...card, study: { ...card.study, dueAt }, studyRevision: card.studyRevision + 1, updatedAt: occurredAt };
}
