import { sanitizeNoteHtml, stripSanitizedHtml } from "../htmlSafety.ts";
import type { Card, CardVariant, CardVariantRefusal, Note, VariantPerformance } from "../coreTypes.ts";
import { VARIANT_STATUSES, makeId, stableContentHash } from "./coreValues.ts";
import { createCardStudy, createVariantPerformance } from "./reviewState.ts";

interface VariantPerformanceInput extends Partial<Omit<VariantPerformance, "id" | "attempts">> {
  id?: string | null;
  attempts?: number | null;
}
interface CardVariantInput extends Partial<Omit<CardVariant, "cardId" | "performance">> {
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
  isActive = true,
  transformType = "rephrase",
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
    isActive: active,
    transformType: "rephrase",
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

export function addCardVariant(card: Card, input: CardVariantInput, updatedAt = new Date().toISOString()): Card {
  const variant = createCardVariant({ ...input, cardId: card.id, createdAt: input.createdAt ?? updatedAt, updatedAt: input.updatedAt ?? updatedAt });
  return { ...card, variants: [...card.variants, variant], updatedAt };
}

export function replaceOutdatedVariants(card: Card, input: CardVariantInput, updatedAt = new Date().toISOString()): Card {
  const variants = card.variants.map((variant) => variant.meta.outdated === true && !variant.deletedAt
    ? { ...variant, deletedAt: updatedAt, updatedAt, revision: variant.revision + 1 }
    : variant);
  return addCardVariant({ ...card, variants }, input, updatedAt);
}

export const VARIANT_FAILURE_LIMIT = 3;

/** Failures of another prompt version or note content do not count towards the limit. */
export function recordVariantOutcome(
  card: Card,
  outcome: "created" | "not_rephrasable" | "rejected",
  { promptVersion, contentRevision }: Pick<CardVariantRefusal, "promptVersion" | "contentRevision">,
  updatedAt = new Date().toISOString(),
): Card {
  if (outcome === "created") {
    if (!card.variantRefusal) return card;
    const { variantRefusal: _refusal, ...rest } = card;
    return { ...rest, updatedAt, revision: card.revision + 1 };
  }
  const previous = card.variantRefusal?.promptVersion === promptVersion && card.variantRefusal.contentRevision === contentRevision ? card.variantRefusal : null;
  const failures = (previous?.failures ?? 0) + (outcome === "rejected" ? 1 : 0);
  const state = outcome === "not_rephrasable" ? "not_rephrasable" : failures >= VARIANT_FAILURE_LIMIT ? "failing" : previous?.state ?? null;
  return { ...card, variantRefusal: { state, failures, promptVersion, contentRevision, updatedAt }, updatedAt, revision: card.revision + 1 };
}

/** Null once the note's content changed since the refusal. */
export function activeVariantRefusal(note: Pick<Note, "contentRevision">, card: Pick<Card, "variantRefusal">): CardVariantRefusal["state"] {
  return card.variantRefusal?.contentRevision === note.contentRevision ? card.variantRefusal.state : null;
}

export function getActiveVariants(card: Pick<Card, "variants"> | null | undefined): CardVariant[] {
  return (card?.variants ?? []).filter((variant) => variant.qualityStatus === "active" && variant.isActive && !variant.deletedAt);
}

export function isCardReviewBlocked(card: Pick<Card, "status" | "deletedAt"> | null | undefined): boolean {
  return !card || card.status !== "active" || card.deletedAt !== null;
}

export function setCardSuspended(card: Card, suspended: boolean, updatedAt = new Date().toISOString()): Card {
  const status = suspended ? "suspended" : "active";
  if (card.status === status) return card;
  return { ...card, status, updatedAt, revision: card.revision + 1 };
}

/** Anki flag 0–7; 0 removes it. */
export function setCardFlag(card: Card, flag: number, updatedAt = new Date().toISOString()): Card {
  if (!Number.isInteger(flag) || flag < 0 || flag > 7) throw new Error("Die Flagge ist ungültig.");
  if (card.ankiFlag === flag) return card;
  return { ...card, ankiFlag: flag, updatedAt, revision: card.revision + 1 };
}

export function moveCardToDeck(card: Card, deckId: string, updatedAt = new Date().toISOString()): Card {
  if (!deckId.trim()) throw new Error("Der Zielstapel fehlt.");
  if (card.deckId === deckId) return card;
  return { ...card, deckId, updatedAt, revision: card.revision + 1 };
}

/** New cards keep their creation order, so the card returns to its original place among them. */
export function resetCardStudy(card: Card, occurredAt = new Date().toISOString()): Card {
  const { study } = card;
  if (study.state === "new" && study.reps === 0 && study.lapses === 0 && study.leechedAt === null) return card;
  return { ...card, study: createCardStudy(occurredAt), studyRevision: card.studyRevision + 1, updatedAt: occurredAt };
}

/** null lifts the leech state; it is part of the study state, so it travels like a review. */
export function setCardLeech(card: Card, leechedAt: string | null, occurredAt = new Date().toISOString()): Card {
  if (card.study.leechedAt === leechedAt) return card;
  return { ...card, study: { ...card.study, leechedAt }, studyRevision: card.studyRevision + 1, updatedAt: occurredAt };
}

/** The revision still counts forward. */
export function restoreCardStudy(card: Card, study: Card["study"], occurredAt = new Date().toISOString()): Card {
  if (JSON.stringify(card.study) === JSON.stringify(study)) return card;
  return { ...card, study, studyRevision: card.studyRevision + 1, updatedAt: occurredAt };
}

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
