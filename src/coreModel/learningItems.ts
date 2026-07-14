import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import type { CardField, CardType, CardVariant, CardVariantBase, CardVariantType, DeckSource, DraftStatus, LearningItem, LearningItemSourceType, LearningItemStatus, SourceAnchor, TransformType, VariantGenerationSource, VariantPerformance, VariantQualityStatus, VersionEntry } from "../coreTypes.ts";
import { CARD_VARIANT_TYPES, CORE_CARD_TYPES, CORE_DECK_SOURCES, LEARNING_ITEM_SOURCE_TYPES, VARIANT_GENERATION_SOURCES, VARIANT_STATUSES, VARIANT_TRANSFORMS, makeId, normalizeTags, stableContentHash, unique } from "./coreValues.ts";
import { createReviewState, createVariantPerformance, createVersionEntry, normalizeLearningItemState, normalizeVersionLog } from "./reviewState.ts";

type StringMap = Record<string, unknown>;
interface VariantPerformanceInput extends Partial<Omit<VariantPerformance, "id" | "ratingCounts" | "attempts">> { id?: string | null; ratingCounts?: Partial<Record<"again" | "hard" | "good" | "easy", number>>; attempts?: number | null; }
interface ImmutableOriginalInput { front?: string; back?: string; fields?: CardField[]; html?: string; capturedAt?: string; source?: DeckSource; contentHash?: string; }
interface CardVariantInput extends Partial<Omit<CardVariantBase, "learningItemId" | "cardId" | "sourceCardId" | "variantType" | "variantLevel" | "generationSource" | "isOriginal" | "isActive" | "parentVariantId" | "anchorVariantId" | "reviewState" | "performance">> { sourceCardId?: string | null; learningItemId?: string | null; cardId?: string | null; variantType?: CardVariantType | null; variantLevel?: number | null; generationSource?: VariantGenerationSource | null; parentVariantId?: string | null; anchorVariantId?: string | null; isOriginal?: boolean; isActive?: boolean | null; performance?: VariantPerformanceInput | null; reviewState?: unknown; meta?: StringMap; }
export interface CoreCardInput { id?: string; noteId?: string | null; deckId?: string; title?: string; cardType?: CardType; kind?: CardType; source?: DeckSource; sourceType?: LearningItemSourceType | null; sourceRefId?: string | null; sourceCardId?: string | null; sourceNoteId?: string | null; canonicalQuestion?: string | null; canonicalAnswer?: string | null; originalFront?: string; originalBack?: string; originalFields?: CardField[]; originalTags?: unknown; tags?: unknown; concepts?: unknown; originalHtml?: string; mediaRefs?: string[]; sourceAnchors?: SourceAnchor[]; variants?: CardVariantInput[]; draftStatus?: DraftStatus; status?: LearningItemStatus; reviewState?: unknown; learningItemState?: unknown; createdAt?: string; updatedAt?: string; revision?: number; deletedAt?: string | null; updatedByDeviceId?: string | null; immutableOriginal?: ImmutableOriginalInput | null; versionLog?: VersionEntry[]; meta?: StringMap; }
interface OriginalVariantSeed { id: string; cardType: CardType; sourceType: LearningItemSourceType; canonicalQuestion: string; canonicalAnswer: string; sourceAnchors?: SourceAnchor[]; createdAt: string; updatedAt: string; }
function objectRecord(value: unknown): StringMap { return value !== null && typeof value === "object" ? value as StringMap : {}; }
const CREATABLE_CARD_TYPES = new Set<CardType>(["basic", "basic-reversed", "cloze", "multiple-choice"]);
function normalizeCardSource(source: unknown): DeckSource {
  return typeof source === "string" && CORE_DECK_SOURCES.includes(source as DeckSource)
    ? source as DeckSource
    : "manual";
}

function normalizeLearningSourceType(sourceType: unknown, legacySource: DeckSource): LearningItemSourceType {
  if (typeof sourceType === "string" && LEARNING_ITEM_SOURCE_TYPES.includes(sourceType as LearningItemSourceType)) {
    return sourceType as LearningItemSourceType;
  }
  if (legacySource === "anki-apkg") return "anki_import";
  if (legacySource === "ai-assisted") return "ai_generated";
  if (legacySource === "text-import") return "text_import";
  if (legacySource === "csv-import" || legacySource === "spreadsheet-import") return "csv_import";
  if (legacySource === "json-import") return "json_import";
  if (legacySource === "manual") return "manual";
  return "mixed";
}

function legacySourceFromLearningSourceType(sourceType: LearningItemSourceType): DeckSource {
  if (sourceType === "anki_import") return "anki-apkg";
  if (sourceType === "ai_generated") return "ai-assisted";
  if (sourceType === "text_import") return "text-import";
  if (sourceType === "csv_import") return "csv-import";
  if (sourceType === "json_import") return "json-import";
  return "manual";
}

function normalizeVariantType(variantType: unknown, fallbackCardType: unknown = "basic"): CardVariantType {
  if (typeof variantType === "string" && CARD_VARIANT_TYPES.includes(variantType as CardVariantType)) return variantType as CardVariantType;

  const mapping: Partial<Record<CardType, CardVariantType>> = {
    "basic-reversed": "reverse",
    "image-occlusion": "image_occlusion",
    "multiple-choice": "mcq",
    "case-vignette": "case",
    "free-text": "custom",
    "multi-field": "custom",
  };
  const mapped = mapping[fallbackCardType as CardType];

  if (mapped && CARD_VARIANT_TYPES.includes(mapped as CardVariantType)) return mapped as CardVariantType;
  return typeof fallbackCardType === "string" && CARD_VARIANT_TYPES.includes(fallbackCardType as CardVariantType)
    ? fallbackCardType as CardVariantType
    : "basic";
}

function normalizeCreatableCardType(cardType: unknown, fallback: CardType = "basic"): CardType {
  return typeof cardType === "string" && CREATABLE_CARD_TYPES.has(cardType as CardType) ? cardType as CardType : fallback;
}

function normalizeGenerationSource(
  generationSource: unknown,
  { isOriginal = false, sourceType = "manual", modelRunId = null }: {
    isOriginal?: boolean;
    sourceType?: unknown;
    modelRunId?: string | null;
  } = {},
): VariantGenerationSource {
  if (typeof generationSource === "string" && VARIANT_GENERATION_SOURCES.includes(generationSource as VariantGenerationSource)) {
    return generationSource as VariantGenerationSource;
  }
  if (isOriginal) return "original";
  if (sourceType === "anki_import" || sourceType === "mixed") return "imported";
  if (sourceType === "ai_generated" || modelRunId) return "ai_generated";
  return "user_edited";
}

function normalizeVariantLevel(variantLevel: unknown, isOriginal = false): number {
  if (!Number.isFinite(Number(variantLevel))) return isOriginal ? 1 : 2;
  return Math.min(5, Math.max(1, Math.round(Number(variantLevel))));
}

function countGeneratedActiveVariants(variants: readonly CardVariant[]): number {
  return variants.filter(
    (variant) =>
      variant.qualityStatus === "active" &&
      variant.isActive !== false &&
      !variant.isOriginal &&
      variant.generationSource !== "original",
  ).length;
}

function normalizeImmutableOriginal(
  immutableOriginal: ImmutableOriginalInput | null,
  fallback: Required<ImmutableOriginalInput>,
): LearningItem["immutableOriginal"] {
  const front = sanitizeCardHtml(immutableOriginal?.front ?? fallback.front);
  const back = sanitizeCardHtml(immutableOriginal?.back ?? fallback.back);
  const fields = Array.isArray(immutableOriginal?.fields)
    ? immutableOriginal.fields.map((field) => ({
        name: field.name,
        value: sanitizeCardHtml(field.value),
      }))
    : fallback.fields;
  const html = sanitizeCardHtml(immutableOriginal?.html ?? fallback.html);

  return {
    front,
    back,
    fields,
    html,
    capturedAt: immutableOriginal?.capturedAt ?? fallback.capturedAt,
    source: normalizeCardSource(immutableOriginal?.source ?? fallback.source),
    contentHash:
      immutableOriginal?.contentHash ??
      stableContentHash(
        {
          front: stripHtml(front).trim().toLowerCase(),
          back: stripHtml(back).trim().toLowerCase(),
          fields,
        },
        "card",
      ),
  };
}

export function createCoreCard({
  id = makeId("card"),
  noteId = null,
  deckId = "",
  title = "",
  cardType = "basic",
  source,
  sourceType = null,
  sourceRefId = null,
  sourceCardId = null,
  sourceNoteId = null,
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
  sourceAnchors = [],
  variants = [],
  draftStatus = "accepted",
  status = "active",
  reviewState = null,
  learningItemState = null,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
  immutableOriginal = null,
  versionLog = [],
  meta = {},
}: CoreCardInput): LearningItem {
  if (!CORE_CARD_TYPES.includes(cardType)) {
    throw new Error(`Unbekannter Kartentyp: ${cardType}`);
  }

  const sanitizedFront = sanitizeCardHtml(originalFront || canonicalQuestion || "");
  const sanitizedBack = sanitizeCardHtml(originalBack || canonicalAnswer || "");
  const normalizedCanonicalQuestion = sanitizeCardHtml(canonicalQuestion ?? sanitizedFront);
  const normalizedCanonicalAnswer = sanitizeCardHtml(canonicalAnswer ?? sanitizedBack);
  const fields = originalFields.map((field) => ({
    name: field.name,
    value: sanitizeCardHtml(field.value),
  }));
  const html = sanitizeCardHtml(originalHtml ?? [sanitizedFront, sanitizedBack].filter(Boolean).join("<hr>"));
  const normalizedTags = normalizeTags(tags ?? originalTags);
  const cardSource = normalizeCardSource(source);
  const normalizedSourceType = normalizeLearningSourceType(sourceType, cardSource);
  const contentHash = stableContentHash(
    {
      front: stripHtml(normalizedCanonicalQuestion).trim().toLowerCase(),
      back: stripHtml(normalizedCanonicalAnswer).trim().toLowerCase(),
      type: cardType,
      tags: normalizedTags,
    },
    "card",
  );
  const normalizedReviewState = normalizeLearningItemState(learningItemState ?? reviewState, {
    learningItemId: id,
    reviewableType: "card",
    reviewableId: id,
  });
  const normalizedVariants = ensureOriginalVariant(
    variants.map((variant) =>
      normalizeCardVariant({
        ...variant,
        sourceCardId: variant.sourceCardId ?? id,
        learningItemId: variant.learningItemId ?? id,
        cardId: variant.cardId ?? id,
      }),
    ),
    {
      id,
      cardType,
      sourceType: normalizedSourceType,
      canonicalQuestion: normalizedCanonicalQuestion,
      canonicalAnswer: normalizedCanonicalAnswer,
      sourceAnchors,
      createdAt,
      updatedAt,
    },
  );
  const fallbackImmutableOriginal = {
    front: sanitizedFront,
    back: sanitizedBack,
    fields,
    html,
    capturedAt: createdAt,
    source: cardSource,
    contentHash,
  };
  const createdEntry = createVersionEntry({
    objectType: "card",
    objectId: id,
    changeType: "created",
    after: { front: sanitizedFront, back: sanitizedBack, cardType },
    createdAt,
  });

  return {
    id,
    noteId,
    deckId,
    title,
    canonicalQuestion: normalizedCanonicalQuestion,
    canonicalAnswer: normalizedCanonicalAnswer,
    tags: normalizedTags,
    concepts: normalizeTags(concepts),
    sourceType: normalizedSourceType,
    sourceRefId: sourceRefId ?? sourceCardId ?? sourceNoteId ?? null,
    source: cardSource,
    sourceCardId,
    sourceNoteId,
    originalFront: sanitizedFront,
    originalBack: sanitizedBack,
    originalFields: fields,
    originalTags: normalizedTags,
    originalHtml: html,
    immutableOriginal: normalizeImmutableOriginal(immutableOriginal, fallbackImmutableOriginal),
    mediaRefs: unique(mediaRefs),
    sourceAnchors,
    kind: cardType,
    cardType,
    draftStatus,
    status,
    contentHash,
    learningItemState: normalizedReviewState,
    reviewState: normalizedReviewState,
    variants: normalizedVariants,
    versionLog: normalizeVersionLog(versionLog, createdEntry),
    coreState: {
      isCoreReady: normalizedReviewState.maturityBand === "variant_ready" || normalizedReviewState.maturityBand === "mastered",
      variantCount: countGeneratedActiveVariants(normalizedVariants),
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
  };
}

export function normalizeCardVariant(variant: CardVariantInput): CardVariant {
  return createCardVariant({
    ...variant,
    id: variant.id,
    sourceCardId: variant.sourceCardId,
    learningItemId: variant.learningItemId,
    cardId: variant.cardId,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  });
}

export function createCardVariant({
  id = makeId("variant"),
  sourceCardId,
  learningItemId = null,
  cardId = null,
  variantType = null,
  variantLevel = null,
  front = "",
  back = "",
  explanation = "",
  hintsJson = null,
  answerOptionsJson = null,
  expectedAnswerJson = null,
  generationSource = null,
  parentVariantId = null,
  anchorVariantId = null,
  isOriginal = false,
  isActive = null,
  transformType = "rephrase",
  transformProfile = {},
  modelRunId = null,
  confidence = 0.75,
  semanticDelta = "none",
  changedRecognitionCues = [],
  qualityStatus = "active",
  sourceAnchors = [],
  reviewState = null,
  performance = null,
  feedback = [],
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
  versionLog = [],
  meta = {},
}: CardVariantInput): CardVariant {
  const normalizedLearningItemId = learningItemId ?? cardId ?? sourceCardId;
  if (!normalizedLearningItemId) {
    throw new Error("Varianten benötigen learningItemId, cardId oder sourceCardId.");
  }
  const normalizedSourceCardId = sourceCardId ?? cardId ?? normalizedLearningItemId;
  if (!VARIANT_TRANSFORMS.includes(transformType)) {
    throw new Error(`Unbekannte Transformationsart: ${transformType}`);
  }
  if (!VARIANT_STATUSES.includes(qualityStatus)) {
    throw new Error(`Unbekannter Variantenstatus: ${qualityStatus}`);
  }

  const sanitizedFront = sanitizeCardHtml(front);
  const sanitizedBack = sanitizeCardHtml(back);
  const normalizedIsActive = isActive ?? qualityStatus === "active";
  const normalizedQualityStatus = normalizedIsActive || qualityStatus !== "active" ? qualityStatus : "disabled";
  const normalizedVariantType = normalizeVariantType(variantType, meta.cardType ?? "basic");
  const normalizedGenerationSource = normalizeGenerationSource(generationSource, {
    isOriginal,
    sourceType: meta.sourceType,
    modelRunId,
  });
  const contentHash = stableContentHash(
    {
      learningItemId: normalizedLearningItemId,
      transformType,
      transformProfile,
      front: stripHtml(sanitizedFront).trim().toLowerCase(),
      back: stripHtml(sanitizedBack).trim().toLowerCase(),
    },
    "variant",
  );
  const normalizedReviewState = reviewState
    ? createReviewState({ ...reviewState, learningItemId: normalizedLearningItemId, reviewableType: "variant", reviewableId: id })
    : null;
  const createdEntry = createVersionEntry({
    objectType: "variant",
    objectId: id,
    changeType: "created",
    after: { front: sanitizedFront, back: sanitizedBack, transformType },
    createdAt,
  });

  return {
    id,
    learningItemId: normalizedLearningItemId,
    cardId: normalizedSourceCardId,
    sourceCardId: normalizedSourceCardId,
    variantType: normalizedVariantType,
    variantLevel: normalizeVariantLevel(variantLevel, isOriginal),
    front: sanitizedFront,
    back: sanitizedBack,
    explanation,
    hintsJson,
    answerOptionsJson,
    expectedAnswerJson,
    generationSource: normalizedGenerationSource,
    parentVariantId,
    anchorVariantId,
    isOriginal: Boolean(isOriginal),
    isActive: Boolean(normalizedIsActive),
    transformType,
    transformProfile,
    modelRunId,
    confidence,
    semanticDelta,
    changedRecognitionCues,
    qualityStatus: normalizedQualityStatus,
    contentHash,
    sourceAnchors,
    reviewState: normalizedReviewState,
    performance: createVariantPerformance({ ...(performance ?? {}), learningItemId: normalizedLearningItemId, variantId: id }),
    feedback,
    versionLog: normalizeVersionLog(versionLog, createdEntry),
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
    meta,
  } as CardVariant;
}

function createOriginalVariantForItem({
  id,
  cardType,
  sourceType,
  canonicalQuestion,
  canonicalAnswer,
  sourceAnchors = [],
  createdAt,
  updatedAt,
}: OriginalVariantSeed): CardVariant {
  const variantId = stableContentHash(
    {
      learningItemId: id,
      front: stripHtml(canonicalQuestion).trim().toLowerCase(),
      back: stripHtml(canonicalAnswer).trim().toLowerCase(),
      isOriginal: true,
    },
    "variant",
  );

  return createCardVariant({
    id: variantId,
    learningItemId: id,
    cardId: id,
    sourceCardId: id,
    variantType: normalizeVariantType(null, cardType),
    variantLevel: 1,
    front: canonicalQuestion,
    back: canonicalAnswer,
    generationSource: "original",
    transformType: "original",
    qualityStatus: "active",
    isOriginal: true,
    isActive: true,
    sourceAnchors,
    createdAt,
    updatedAt,
    meta: {
      cardType,
      sourceType,
    },
  });
}

function ensureOriginalVariant(variants: CardVariant[], item: OriginalVariantSeed): CardVariant[] {
  const originalVariant =
    variants.find((variant) => variant.isOriginal) ??
    createOriginalVariantForItem(item);
  const withOriginal = variants.some((variant) => variant.id === originalVariant.id) ? variants : [...variants, originalVariant];
  const variantIds = new Set(withOriginal.map((variant) => variant.id));

  return withOriginal.map((variant) => {
    if (variant === originalVariant) {
      return normalizeCardVariant({
        ...variant,
        learningItemId: item.id,
        cardId: item.id,
        sourceCardId: item.id,
        anchorVariantId: null,
        parentVariantId: null,
        generationSource: "original",
        transformType: "original",
        variantLevel: 1,
        isOriginal: true,
        isActive: true,
        qualityStatus: variant.qualityStatus ?? "active",
      });
    }

    const wasMarkedOriginal = variant.isOriginal as boolean;
    return normalizeCardVariant({
      ...variant,
      learningItemId: item.id,
      cardId: item.id,
      sourceCardId: item.id,
      anchorVariantId: originalVariant.id,
      parentVariantId:
        variant.parentVariantId && variant.parentVariantId !== variant.id && variantIds.has(variant.parentVariantId)
          ? variant.parentVariantId
          : originalVariant.id,
      generationSource: wasMarkedOriginal && variant.generationSource === "original" ? undefined : variant.generationSource,
      transformType: wasMarkedOriginal && variant.transformType === "original" ? "rephrase" : variant.transformType,
      isOriginal: false,
    });
  });
}

export function getLearningItemQuestion(item: LearningItem | null | undefined): string {
  return item?.canonicalQuestion ?? item?.originalFront ?? getOriginalVariant(item)?.front ?? "";
}

export function getLearningItemAnswer(item: LearningItem | null | undefined): string {
  return item?.canonicalAnswer ?? item?.originalBack ?? getOriginalVariant(item)?.back ?? "";
}

export function getOriginalVariant(item: LearningItem | null | undefined): CardVariant | null {
  return (item?.variants ?? []).find((variant) => variant.isOriginal) ?? null;
}

export function getActiveVariants(item: LearningItem | null | undefined): CardVariant[] {
  return (item?.variants ?? []).filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal);
}

export function getVariantAnchor(item: LearningItem | null | undefined, variant: CardVariant | null | undefined): CardVariant | null {
  if (!item || !variant || variant.isOriginal) return null;

  const variants = item.variants ?? [];
  const derivedVariant = variant as CardVariantBase & { anchorVariantId: string; parentVariantId: string };
  const anchorId = derivedVariant.anchorVariantId ?? derivedVariant.parentVariantId;
  return variants.find((candidate) => candidate.id === anchorId) ?? getOriginalVariant(item);
}

export function getAnswerSideAnchorMiniCard(item: LearningItem | null | undefined, variant: CardVariant | null | undefined) {
  const anchor = getVariantAnchor(item, variant);

  if (!anchor) {
    return {
      shouldShow: false,
      label: "Originalkarte",
      front: "",
      back: "",
      variantId: null,
      generationSource: null,
    };
  }

  return {
    shouldShow: Boolean(variant && !variant.isOriginal),
    label: anchor.isOriginal ? "Originalkarte" : "Ursprungskarte",
    front: anchor.front,
    back: anchor.back,
    variantId: anchor.id,
    generationSource: anchor.generationSource,
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
  return createCoreLearningItem({
    ...input,
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}
