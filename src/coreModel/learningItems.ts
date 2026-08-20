import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import type {
  CardField,
  CardType,
  CardVariant,
  DeckSource,
  DraftStatus,
  LearningItem,
  LearningItemDocumentV1,
  LearningItemSourceType,
  LearningItemStatus,
  LearningItemStudyStatePatch,
  ReviewState,
  VariantPerformance,
  VariantProjection,
} from "../coreTypes.ts";
import {
  CORE_CARD_TYPES,
  CORE_DECK_SOURCES,
  LEARNING_ITEM_SOURCE_TYPES,
  VARIANT_STATUSES,
  makeId,
  normalizeTags,
  stableContentHash,
} from "./coreValues.ts";
import { normalizeLearningItemDocument, projectDocumentSide } from "./learningItemDocument.ts";
import { createVariantPerformance, normalizeLearningItemState } from "./reviewState.ts";

type StringMap = Record<string, unknown>;
interface VariantPerformanceInput extends Partial<Omit<VariantPerformance, "id" | "ratingCounts" | "attempts">> {
  id?: string | null;
  ratingCounts?: Partial<Record<"again" | "hard" | "good" | "easy", number>>;
  attempts?: number | null;
}
interface CardVariantInput extends Partial<Omit<CardVariant, "cardId" | "performance">> {
  cardId?: string | null;
  performance?: VariantPerformanceInput | null;
}
export interface CoreCardInput {
  id?: string;
  deckId?: string;
  title?: string;
  cardType?: CardType;
  kind?: CardType;
  source?: DeckSource;
  sourceType?: LearningItemSourceType | null;
  sourceRefId?: string | null;
  sourceCardId?: string | null;
  canonicalQuestion?: string | null;
  canonicalAnswer?: string | null;
  originalFront?: string;
  originalBack?: string;
  originalFields?: CardField[];
  originalTags?: unknown;
  tags?: unknown;
  concepts?: unknown;
  originalHtml?: string;
  mediaRefs?: string[];
  variants?: CardVariantInput[];
  projection?: VariantProjection | null;
  draftStatus?: DraftStatus;
  status?: LearningItemStatus;
  reviewState?: unknown;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
  deletedAt?: string | null;
  updatedByDeviceId?: string | null;
  meta?: StringMap;
  noteTypeDefinitionId?: string;
  contentDocument?: LearningItemDocumentV1 | null;
  contentRevision?: number;
}

function objectRecord(value: unknown): StringMap {
  return value !== null && typeof value === "object" ? value as StringMap : {};
}

function normalizeCardSource(source: unknown): DeckSource {
  return typeof source === "string" && CORE_DECK_SOURCES.includes(source as DeckSource)
    ? source as DeckSource
    : "manual";
}

function normalizeLearningSourceType(sourceType: unknown, source: DeckSource): LearningItemSourceType {
  if (typeof sourceType === "string" && LEARNING_ITEM_SOURCE_TYPES.includes(sourceType as LearningItemSourceType)) {
    return sourceType as LearningItemSourceType;
  }
  if (source === "anki-apkg") return "anki_import";
  if (source === "text-import") return "text_import";
  if (source === "csv-import" || source === "spreadsheet-import") return "csv_import";
  return "manual";
}

function legacySourceFromLearningSourceType(sourceType: LearningItemSourceType): DeckSource {
  if (sourceType === "anki_import") return "anki-apkg";
  if (sourceType === "text_import") return "text-import";
  if (sourceType === "csv_import") return "csv-import";
  return "manual";
}

function normalizeProjection(value: unknown, cardType: CardType, id: string, meta: StringMap): VariantProjection {
  const input = objectRecord(value);
  const recipeId = String(input.recipeId ?? meta.recipeId ?? `core-${cardType}`);
  if (input.kind === "cloze" || cardType === "cloze") {
    const ordinal = Number(input.clozeOrdinal ?? meta.clozeGroup ?? 1);
    return { kind: "cloze", recipeId, clozeOrdinal: Number.isFinite(ordinal) && ordinal > 0 ? Math.floor(ordinal) : 1 };
  }
  if (input.kind === "image-occlusion" || cardType === "image-occlusion") {
    return { kind: "image-occlusion", recipeId, regionKey: String(input.regionKey ?? meta.regionKey ?? id) };
  }
  return { kind: "template", recipeId, instanceKey: String(input.instanceKey ?? meta.instanceKey ?? id) };
}

function activeVariantCount(variants: readonly CardVariant[]): number {
  return variants.filter((variant) => variant.qualityStatus === "active" && variant.isActive && !variant.deletedAt).length;
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
  const sanitizedFront = sanitizeCardHtml(front);
  const sanitizedBack = sanitizeCardHtml(back);
  const active = Boolean(isActive) && qualityStatus === "active" && deletedAt === null;
  return {
    id,
    cardId,
    variantType: "basic",
    variantLevel: Math.min(5, Math.max(2, Math.round(Number(variantLevel) || 2))),
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
      front: stripHtml(sanitizedFront).trim().toLowerCase(),
      back: stripHtml(sanitizedBack).trim().toLowerCase(),
    }, "variant"),
    performance: createVariantPerformance({ ...(performance ?? {}), learningItemId: cardId, variantId: id }),
    feedback,
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    meta,
  };
}

export function createCoreCard({
  id = makeId("card"),
  deckId = "",
  title = "",
  cardType = "basic",
  source,
  sourceType = null,
  sourceRefId = null,
  sourceCardId = null,
  canonicalQuestion = null,
  canonicalAnswer = null,
  originalFront = "",
  originalBack = "",
  originalFields = [],
  originalTags = [],
  tags = null,
  concepts = [],
  originalHtml,
  mediaRefs = [],
  variants = [],
  projection = null,
  draftStatus = "accepted",
  status = "active",
  reviewState = null,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
  meta = {},
  noteTypeDefinitionId = "",
  contentDocument = null,
  contentRevision = 1,
}: CoreCardInput): LearningItem {
  if (!CORE_CARD_TYPES.includes(cardType)) throw new Error(`Unbekannter Kartentyp: ${cardType}`);
  const normalizedTags = normalizeTags(tags ?? originalTags);
  const definitionId = noteTypeDefinitionId || contentDocument?.definitionVersionId || `core-${cardType}-v1`;
  const document = normalizeLearningItemDocument(contentDocument, {
    definitionVersionId: definitionId,
    fields: originalFields,
    front: originalFront || canonicalQuestion || "",
    back: originalBack || canonicalAnswer || "",
    tags: normalizedTags,
    mediaRefs,
  });
  const front = sanitizeCardHtml(originalFront || canonicalQuestion || projectDocumentSide(document, "front"));
  const back = sanitizeCardHtml(originalBack || canonicalAnswer || projectDocumentSide(document, "back"));
  const question = sanitizeCardHtml(canonicalQuestion ?? front);
  const answer = sanitizeCardHtml(canonicalAnswer ?? back);
  const cardSource = normalizeCardSource(source);
  const normalizedSourceType = normalizeLearningSourceType(sourceType, cardSource);
  const normalizedReviewState = normalizeLearningItemState(reviewState, {
    learningItemId: id,
    reviewableType: "card",
    reviewableId: id,
  });
  const normalizedVariants = variants.map((variant) => createCardVariant({ ...variant, cardId: id }));
  const contentHash = stableContentHash({
    question: stripHtml(question).trim().toLowerCase(),
    answer: stripHtml(answer).trim().toLowerCase(),
    cardType,
    tags: document.tags,
    fields: document.fields.map((field) => ({ id: field.id, value: stripHtml(field.value).trim() })),
  }, "card");
  return {
    id,
    deckId,
    title,
    canonicalQuestion: question,
    canonicalAnswer: answer,
    tags: document.tags,
    concepts: normalizeTags(concepts),
    sourceType: normalizedSourceType,
    sourceRefId: sourceRefId ?? sourceCardId,
    source: cardSource,
    sourceCardId,
    originalFront: front,
    originalBack: back,
    originalFields: document.fields.map((field) => ({ name: field.name, value: field.value })),
    originalTags: document.tags,
    originalHtml: sanitizeCardHtml(originalHtml ?? [front, back].filter(Boolean).join("<hr>")),
    mediaRefs: document.mediaRefs,
    kind: cardType,
    cardType,
    draftStatus,
    status,
    contentHash,
    reviewState: normalizedReviewState,
    variants: normalizedVariants,
    projection: normalizeProjection(projection, cardType, id, meta),
    coreState: {
      isCoreReady: ["variant_ready", "mastered"].includes(normalizedReviewState.maturityBand),
      variantCount: activeVariantCount(normalizedVariants),
      lastReviewedAt: normalizedReviewState.lastReviewedAt,
      repetitionLevel: normalizedReviewState.repetitions,
      maturityXp: normalizedReviewState.maturityXp,
      maturityBand: normalizedReviewState.maturityBand,
      eligibility: meta.eligibility ?? null,
    },
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    meta,
    noteTypeDefinitionId: definitionId,
    contentDocument: document,
    contentRevision: Number.isFinite(Number(contentRevision)) && Number(contentRevision) > 0
      ? Math.floor(Number(contentRevision))
      : 1,
  };
}

export function isLearningItemMarked(item: Pick<LearningItem, "meta"> | null | undefined): boolean {
  return item?.meta?.marked === true;
}

export function isLearningItemReviewBlocked(item: Pick<LearningItem, "status" | "meta"> | null | undefined): boolean {
  return item?.status === "suspended"
    || String(item?.status) === "buried"
    || item?.meta?.suspended === true
    || item?.meta?.buried === true;
}

export function updateLearningItemStudyState(
  item: LearningItem,
  patch: LearningItemStudyStatePatch,
  updatedAt = new Date().toISOString(),
): LearningItem {
  const marked = patch.marked ?? isLearningItemMarked(item);
  const suspended = patch.suspended ?? item.status === "suspended";
  const status = item.status === "deleted" ? "deleted" : suspended ? "suspended" : "active";
  if (marked === isLearningItemMarked(item) && status === item.status) return item;
  return { ...item, status, meta: { ...item.meta, marked }, updatedAt, revision: item.revision + 1 };
}

export function rescheduleLearningItem(item: LearningItem, dueAt: string, occurredAt = new Date().toISOString()): LearningItem {
  const dueTimestamp = Date.parse(dueAt);
  const occurredTimestamp = Date.parse(occurredAt);
  if (!Number.isFinite(dueTimestamp) || !Number.isFinite(occurredTimestamp)) {
    throw new Error("Der neue Fälligkeitstermin ist ungültig.");
  }
  if (item.reviewState.dueAt === dueAt) return item;
  if (dueTimestamp <= occurredTimestamp) throw new Error("Der neue Fälligkeitstermin muss in der Zukunft liegen.");
  return { ...item, reviewState: { ...item.reviewState, dueAt } as ReviewState, updatedAt: occurredAt };
}

export function getLearningItemQuestion(item: LearningItem | null | undefined): string {
  return item?.canonicalQuestion ?? item?.originalFront ?? "";
}

export function getLearningItemAnswer(item: LearningItem | null | undefined): string {
  return item?.canonicalAnswer ?? item?.originalBack ?? "";
}

export function getActiveVariants(item: LearningItem | null | undefined): CardVariant[] {
  return (item?.variants ?? []).filter((variant) => variant.qualityStatus === "active" && variant.isActive && !variant.deletedAt);
}

export function getAnswerSideAnchorMiniCard(item: LearningItem | null | undefined, variant: CardVariant | null | undefined) {
  return {
    shouldShow: Boolean(item && variant),
    label: "Grundkarte",
    front: getLearningItemQuestion(item),
    back: getLearningItemAnswer(item),
    variantId: null,
  };
}

export function createCoreLearningItem(item: CoreCardInput = {}): LearningItem {
  return createCoreCard({
    ...item,
    source: item.source ?? legacySourceFromLearningSourceType(item.sourceType ?? "manual"),
    cardType: item.cardType ?? item.kind ?? "basic",
  });
}

export function normalizeLearningItem(item: unknown = {}): LearningItem {
  const input = objectRecord(item) as CoreCardInput;
  return createCoreLearningItem({ ...input, id: input.id, createdAt: input.createdAt, updatedAt: input.updatedAt });
}
