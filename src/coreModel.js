import { sanitizeCardHtml, stripHtml } from "./htmlSafety.js";

export const CORE_CARD_TYPES = [
  "basic",
  "basic-reversed",
  "cloze",
  "image-occlusion",
  "multiple-choice",
  "free-text",
  "multi-field",
  "case-vignette",
];

export const CORE_DECK_SOURCES = [
  "anki-apkg",
  "manual",
  "ai-assisted",
  "community",
  "text-import",
  "csv-import",
  "json-import",
  "spreadsheet-import",
];

export const CORE_MODES = ["off", "auto", "manual"];
export const DECK_VISIBILITIES = ["private", "community", "unlisted", "public"];
export const VARIANT_TRANSFORMS = ["original", "rephrase", "front_back_style_shift", "cloze_conversion"];
export const VARIANT_STATUSES = ["draft", "active", "rejected", "flagged", "disabled"];
export const REVIEW_RATINGS = ["again", "hard", "good", "easy"];
export const LEARNING_ITEM_SOURCE_TYPES = ["manual", "text_import", "csv_import", "json_import", "anki_import", "ai_generated", "mixed"];
export const CARD_VARIANT_TYPES = ["basic", "reverse", "cloze", "mcq", "transfer", "case", "image_occlusion", "custom"];
export const VARIANT_GENERATION_SOURCES = ["original", "ai_generated", "user_edited", "imported"];

export const MATURITY_BANDS = [
  { id: "new", min: 0, max: 20, label: "Neu" },
  { id: "learning", min: 21, max: 50, label: "Aufbau" },
  { id: "young", min: 51, max: 80, label: "Jung" },
  { id: "mature", min: 81, max: 120, label: "Stabil" },
  { id: "variant_ready", min: 121, max: 180, label: "CoRe-ready" },
  { id: "mastered", min: 181, max: Number.POSITIVE_INFINITY, label: "Sicher" },
];

export function makeId(prefix) {
  const cryptoPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${cryptoPart}`;
}

export function stableContentHash(value, prefix = "hash") {
  const input = JSON.stringify(value ?? "");
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return unique(tags.map((tag) => String(tag).trim()).filter(Boolean));
  }

  return unique(
    String(tags ?? "")
      .split(/[\s,;#]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

export function getMaturityBand(maturityXp = 0) {
  return MATURITY_BANDS.find((band) => maturityXp >= band.min && maturityXp <= band.max)?.id ?? "new";
}

export function createDefaultDeckSettings(settings = {}) {
  const coreMode = CORE_MODES.includes(settings.coreMode) ? settings.coreMode : "auto";
  const newCardsPerDay = Number.isFinite(Number(settings.newCardsPerDay))
    ? Math.max(0, Math.round(Number(settings.newCardsPerDay)))
    : 20;
  const override = settings.newCardsTodayOverride;
  const newCardsTodayOverride =
    override && typeof override === "object" && String(override.date ?? "").trim()
      ? {
          date: String(override.date).slice(0, 10),
          limit: Math.max(0, Math.round(Number(override.limit ?? newCardsPerDay) || 0)),
        }
      : null;

  return {
    coreMode,
    newCardsPerDay,
    newCardsTodayOverride,
    variantThresholdXp: Number.isFinite(settings.variantThresholdXp) ? settings.variantThresholdXp : 121,
    maxActiveVariantsPerCard: Number.isFinite(settings.maxActiveVariantsPerCard) ? settings.maxActiveVariantsPerCard : 2,
    schedulerProfile: {
      name: settings.schedulerProfile?.name ?? "standard",
      learningStepsMinutes: settings.schedulerProfile?.learningStepsMinutes ?? [10, 60],
      graduatingIntervalDays: settings.schedulerProfile?.graduatingIntervalDays ?? 1,
      easyIntervalDays: settings.schedulerProfile?.easyIntervalDays ?? 4,
      lessShortIntervalBias: Boolean(settings.schedulerProfile?.lessShortIntervalBias),
    },
    aiPolicy: {
      costTier: settings.aiPolicy?.costTier ?? "balanced",
      allowLocalModels: settings.aiPolicy?.allowLocalModels ?? true,
      allowExternalModels: settings.aiPolicy?.allowExternalModels ?? false,
      maxCostPerJob: settings.aiPolicy?.maxCostPerJob ?? 0,
      requireSourceAnchors: settings.aiPolicy?.requireSourceAnchors ?? true,
      requireHumanApprovalForNewCards: settings.aiPolicy?.requireHumanApprovalForNewCards ?? true,
    },
    blacklist: {
      cardTypes: settings.blacklist?.cardTypes ?? ["image-occlusion"],
      tags: settings.blacklist?.tags ?? [],
      transforms: settings.blacklist?.transforms ?? [],
      cardIds: settings.blacklist?.cardIds ?? [],
      variantIds: settings.blacklist?.variantIds ?? [],
    },
  };
}

export function createLearningItemState({
  id = makeId("state"),
  learningItemId = "",
  reviewableType = "learning_item",
  reviewableId = learningItemId,
  userId = "local-user",
  schedulerVersion = "fsrs_v1",
  state = null,
  dueAt = new Date().toISOString(),
  intervalDays = 0,
  ease = 2.5,
  difficulty = 5,
  stability = 0,
  desiredRetention = 0.9,
  retrievability = null,
  reps = null,
  repetitions = null,
  lapses = 0,
  maturityXp = 0,
  lastReviewedAt = null,
  lastRating = null,
  preferredVariantLevel = 1,
  forcedVariantId = null,
  fallbackUntilCorrect = false,
  lastFailedVariantId = null,
  previousSuccessfulVariantId = null,
  intervalMinutes = null,
  learningStepIndex = 0,
  learningSuccessCount = 0,
  firstLearningAt = null,
  lastLearningStepAt = null,
  graduatedAt = null,
  isGraduated = false,
  sameDaySuccessCount = 0,
  learningDayKey = null,
  schedulerParamsJson = null,
  sourceSchedulerData = null,
} = {}) {
  const normalizedLearningItemId = learningItemId || reviewableId || "";
  const normalizedReviewableId = reviewableId || normalizedLearningItemId;
  const normalizedMaturityXp = Math.max(0, Math.round(Number(maturityXp ?? 0)));
  const normalizedReps = Math.max(0, Math.round(Number(reps ?? repetitions ?? 0) || 0));
  const normalizedState = state ?? (normalizedReps > 0 ? "review" : "new");
  const normalizedDifficulty = Math.min(10, Math.max(1, Number(difficulty ?? 5) || 5));
  const normalizedStability = Math.max(0, Number(stability ?? 0) || 0);
  const normalizedDesiredRetention = Math.min(0.99, Math.max(0.5, Number(desiredRetention ?? 0.9) || 0.9));

  return {
    id,
    learningItemId: normalizedLearningItemId,
    reviewableType,
    reviewableId: normalizedReviewableId,
    userId,
    schedulerVersion,
    state: normalizedState,
    dueAt,
    intervalDays,
    ease,
    difficulty: normalizedDifficulty,
    stability: normalizedStability,
    desiredRetention: normalizedDesiredRetention,
    retrievability: retrievability == null ? null : Math.min(1, Math.max(0, Number(retrievability) || 0)),
    reps: normalizedReps,
    repetitions: normalizedReps,
    lapses,
    maturityXp: normalizedMaturityXp,
    maturityBand: getMaturityBand(normalizedMaturityXp),
    lastReviewedAt,
    lastRating,
    preferredVariantLevel: Math.min(3, Math.max(1, Math.round(Number(preferredVariantLevel) || 1))),
    forcedVariantId,
    fallbackUntilCorrect: Boolean(fallbackUntilCorrect),
    lastFailedVariantId,
    previousSuccessfulVariantId,
    intervalMinutes: intervalMinutes == null ? null : Math.max(0, Math.round(Number(intervalMinutes) || 0)),
    learningStepIndex: Math.max(0, Math.round(Number(learningStepIndex) || 0)),
    learningSuccessCount: Math.max(0, Math.round(Number(learningSuccessCount) || 0)),
    firstLearningAt,
    lastLearningStepAt,
    graduatedAt,
    isGraduated: Boolean(isGraduated || graduatedAt),
    sameDaySuccessCount: Math.max(0, Math.round(Number(sameDaySuccessCount) || 0)),
    learningDayKey,
    schedulerParamsJson,
    sourceSchedulerData,
  };
}

export function normalizeLearningItemState(state = {}, fallback = {}) {
  return createLearningItemState({
    ...fallback,
    ...(state ?? {}),
    learningItemId: state?.learningItemId ?? fallback.learningItemId ?? state?.reviewableId ?? fallback.reviewableId ?? "",
    reviewableType: state?.reviewableType ?? fallback.reviewableType ?? "learning_item",
    reviewableId: state?.reviewableId ?? state?.learningItemId ?? fallback.reviewableId ?? fallback.learningItemId ?? "",
  });
}

export function createReviewState(state = {}) {
  const safeState = state ?? {};
  return createLearningItemState({
    ...safeState,
    reviewableType: safeState.reviewableType ?? "card",
    reviewableId: safeState.reviewableId ?? safeState.learningItemId ?? "",
  });
}

export function createSourceDocument({
  id = makeId("doc"),
  ownerId = "local-user",
  fileName = "Dokument",
  mimeType = "text/plain",
  text = "",
  storageUrl = "",
  textExtractionStatus = text ? "success" : "pending",
  metadata = {},
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id,
    ownerId,
    fileName,
    mimeType,
    text,
    storageUrl,
    textExtractionStatus,
    metadata,
    createdAt,
  };
}

export function createSourceAnchor({
  id = makeId("anchor"),
  documentId = null,
  documentName = "",
  cardId = null,
  variantId = null,
  pageNumber = null,
  textQuote = "",
  charStart = null,
  charEnd = null,
  bbox = null,
  confidence = null,
  targetField = "",
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id,
    documentId,
    documentName,
    cardId,
    variantId,
    pageNumber,
    textQuote: String(textQuote ?? "").slice(0, 700),
    charStart,
    charEnd,
    bbox,
    confidence,
    targetField,
    createdAt,
  };
}

export function createVersionEntry({
  id = makeId("version"),
  objectType,
  objectId,
  changeType,
  before = null,
  after = null,
  actorId = "local-user",
  reason = "",
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    id,
    objectType,
    objectId,
    changeType,
    before,
    after,
    actorId,
    reason,
    createdAt,
  };
}

export function createVariantPerformance({
  id = null,
  learningItemId = "",
  variantId = "",
  userId = "local-user",
  attempts = null,
  reviewCount = 0,
  correctCount = 0,
  wrongCount = 0,
  ratingCounts = {},
  againCount = 0,
  hardCount = 0,
  goodCount = 0,
  easyCount = 0,
  avgResponseTimeMs = null,
  averageResponseTimeMs = null,
  lastReviewedAt = null,
  lastRating = null,
  localDifficultyEstimate = null,
  masterySignal = null,
  maturityXp = 0,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
} = {}) {
  const normalizedAttempts = Math.max(0, Number(attempts ?? reviewCount) || 0);
  const normalizedAverageResponseTimeMs = averageResponseTimeMs ?? avgResponseTimeMs;

  return {
    id: id ?? stableContentHash({ learningItemId, variantId, userId }, "variant_perf"),
    learningItemId,
    variantId,
    userId,
    attempts: normalizedAttempts,
    reviewCount: normalizedAttempts,
    correctCount: Math.max(0, Number(correctCount) || 0),
    wrongCount: Math.max(0, Number(wrongCount) || 0),
    ratingCounts: {
      again: Math.max(0, Number(ratingCounts.again ?? againCount) || 0),
      hard: Math.max(0, Number(ratingCounts.hard ?? hardCount) || 0),
      good: Math.max(0, Number(ratingCounts.good ?? goodCount) || 0),
      easy: Math.max(0, Number(ratingCounts.easy ?? easyCount) || 0),
    },
    avgResponseTimeMs: normalizedAverageResponseTimeMs,
    averageResponseTimeMs: normalizedAverageResponseTimeMs,
    lastReviewedAt,
    lastRating,
    localDifficultyEstimate,
    masterySignal,
    maturityXp: Math.max(0, Math.round(Number(maturityXp) || 0)),
    createdAt,
    updatedAt,
  };
}

export function updateVariantPerformance(performance = {}, rating, { responseTimeMs = null, reviewedAt = new Date().toISOString(), learningItemId = "", variantId = "" } = {}) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const previous = createVariantPerformance({ ...(performance ?? {}), learningItemId, variantId });
  const attempts = previous.attempts + 1;
  const isCorrect = rating !== "again";
  const previousAverage = Number(previous.avgResponseTimeMs ?? previous.averageResponseTimeMs ?? 0);
  const avgResponseTimeMs =
    responseTimeMs == null
      ? previous.avgResponseTimeMs
      : Math.round(((previousAverage * previous.attempts) + Number(responseTimeMs)) / attempts);
  const localDifficultyEstimate =
    rating === "again" ? "hard" : rating === "hard" ? "medium" : rating === "easy" ? "easy" : previous.localDifficultyEstimate ?? "medium";
  const masterySignal =
    rating === "easy" ? "strong" : rating === "good" ? "steady" : rating === "hard" ? "weak" : "failed";

  return createVariantPerformance({
    ...previous,
    attempts,
    reviewCount: attempts,
    correctCount: previous.correctCount + (isCorrect ? 1 : 0),
    wrongCount: previous.wrongCount + (isCorrect ? 0 : 1),
    ratingCounts: {
      ...previous.ratingCounts,
      [rating]: (previous.ratingCounts?.[rating] ?? 0) + 1,
    },
    avgResponseTimeMs,
    averageResponseTimeMs: avgResponseTimeMs,
    lastReviewedAt: reviewedAt,
    lastRating: rating,
    localDifficultyEstimate,
    masterySignal,
    updatedAt: reviewedAt,
  });
}

export function createVariantReviewEvent({
  id = makeId("review"),
  userId = "local-user",
  deckId = "",
  learningItemId = "",
  variantId = "",
  rating,
  answeredAt = new Date().toISOString(),
  responseTimeMs = null,
  schedulerBefore = null,
  schedulerAfter = null,
  flags = {},
  createdAt = answeredAt,
} = {}) {
  if (!REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  return {
    id,
    userId,
    deckId,
    learningItemId,
    variantId,
    reviewableType: "variant",
    reviewableId: variantId,
    sourceCardId: learningItemId,
    rating,
    answeredAt,
    responseTimeMs,
    schedulerBefore,
    schedulerAfter,
    flags,
    createdAt,
  };
}

function splitDeckPath(name, hierarchyPath) {
  if (Array.isArray(hierarchyPath) && hierarchyPath.length > 0) {
    return hierarchyPath.map((part) => String(part).trim()).filter(Boolean);
  }

  return String(name ?? "Neuer Kartenstapel")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeVisibility(visibility) {
  return DECK_VISIBILITIES.includes(visibility) ? visibility : "private";
}

function normalizeCardSource(source) {
  return CORE_DECK_SOURCES.includes(source) ? source : "manual";
}

function normalizeLearningSourceType(sourceType, legacySource) {
  if (LEARNING_ITEM_SOURCE_TYPES.includes(sourceType)) return sourceType;
  if (legacySource === "anki-apkg") return "anki_import";
  if (legacySource === "ai-assisted") return "ai_generated";
  if (legacySource === "text-import") return "text_import";
  if (legacySource === "csv-import" || legacySource === "spreadsheet-import") return "csv_import";
  if (legacySource === "json-import") return "json_import";
  if (legacySource === "manual") return "manual";
  return "mixed";
}

function legacySourceFromLearningSourceType(sourceType) {
  if (sourceType === "anki_import") return "anki-apkg";
  if (sourceType === "ai_generated") return "ai-assisted";
  if (sourceType === "text_import") return "text-import";
  if (sourceType === "csv_import") return "csv-import";
  if (sourceType === "json_import") return "json-import";
  return "manual";
}

function normalizeVariantType(variantType, fallbackCardType = "basic") {
  if (CARD_VARIANT_TYPES.includes(variantType)) return variantType;

  const mapped = {
    "basic-reversed": "reverse",
    "image-occlusion": "image_occlusion",
    "multiple-choice": "mcq",
    "case-vignette": "case",
    "free-text": "custom",
    "multi-field": "custom",
  }[fallbackCardType];

  return CARD_VARIANT_TYPES.includes(mapped) ? mapped : CARD_VARIANT_TYPES.includes(fallbackCardType) ? fallbackCardType : "basic";
}

function normalizeGenerationSource(generationSource, { isOriginal = false, sourceType = "manual", modelRunId = null } = {}) {
  if (VARIANT_GENERATION_SOURCES.includes(generationSource)) return generationSource;
  if (isOriginal) return "original";
  if (sourceType === "anki_import" || sourceType === "mixed") return "imported";
  if (sourceType === "ai_generated" || modelRunId) return "ai_generated";
  return "user_edited";
}

function normalizeVariantLevel(variantLevel, isOriginal = false) {
  if (!Number.isFinite(Number(variantLevel))) return isOriginal ? 1 : 2;
  return Math.min(5, Math.max(1, Math.round(Number(variantLevel))));
}

function countGeneratedActiveVariants(variants) {
  return variants.filter(
    (variant) =>
      variant.qualityStatus === "active" &&
      variant.isActive !== false &&
      !variant.isOriginal &&
      variant.generationSource !== "original",
  ).length;
}

function normalizeVersionLog(versionLog, fallbackEntry) {
  return Array.isArray(versionLog) && versionLog.length > 0 ? versionLog : [fallbackEntry];
}

function normalizeImmutableOriginal(immutableOriginal, fallback) {
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
  immutableOriginal = null,
  versionLog = [],
  meta = {},
}) {
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
    meta,
  };
}

export function normalizeCardVariant(variant) {
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
  versionLog = [],
  meta = {},
}) {
  const normalizedLearningItemId = learningItemId ?? cardId ?? sourceCardId;
  const normalizedSourceCardId = sourceCardId ?? cardId ?? learningItemId;
  if (!normalizedLearningItemId) {
    throw new Error("Varianten benötigen learningItemId, cardId oder sourceCardId.");
  }
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
    meta,
  };
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
}) {
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

function ensureOriginalVariant(variants, item) {
  const originalVariant =
    variants.find((variant) => variant.isOriginal) ??
    createOriginalVariantForItem(item);
  const withOriginal = variants.some((variant) => variant.id === originalVariant.id) ? variants : [...variants, originalVariant];

  return withOriginal.map((variant) => {
    if (variant.isOriginal) {
      return normalizeCardVariant({
        ...variant,
        learningItemId: item.id,
        cardId: item.id,
        sourceCardId: item.id,
        isOriginal: true,
        isActive: true,
        qualityStatus: variant.qualityStatus ?? "active",
      });
    }

    return normalizeCardVariant({
      ...variant,
      learningItemId: item.id,
      cardId: item.id,
      sourceCardId: item.id,
      anchorVariantId: variant.anchorVariantId ?? originalVariant.id,
      parentVariantId: variant.parentVariantId ?? originalVariant.id,
      isOriginal: false,
    });
  });
}

export function getLearningItemQuestion(item) {
  return item?.canonicalQuestion ?? item?.originalFront ?? getOriginalVariant(item)?.front ?? "";
}

export function getLearningItemAnswer(item) {
  return item?.canonicalAnswer ?? item?.originalBack ?? getOriginalVariant(item)?.back ?? "";
}

export function getOriginalVariant(item) {
  return (item?.variants ?? []).find((variant) => variant.isOriginal) ?? null;
}

export function getActiveVariants(item) {
  return (item?.variants ?? []).filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal);
}

export function getVariantAnchor(item, variant) {
  if (!item || !variant || variant.isOriginal) return null;

  const variants = item.variants ?? [];
  const anchorId = variant.anchorVariantId ?? variant.parentVariantId;
  return variants.find((candidate) => candidate.id === anchorId) ?? getOriginalVariant(item);
}

export function getAnswerSideAnchorMiniCard(item, variant) {
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

export function createCoreDeck({
  id = makeId("deck"),
  name,
  description = "",
  source,
  ownerId = "local-user",
  parentDeckId = null,
  hierarchyPath = null,
  visibility = "private",
  originalDeckId = null,
  cards = [],
  tags = [],
  importMeta = {},
  deckSettings = {},
  sourceDocuments = [],
  reviewEvents = [],
  aiJobs = [],
  graph = null,
  communityRefs = [],
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  versionLog = [],
}) {
  if (!CORE_DECK_SOURCES.includes(source)) {
    throw new Error(`Unbekannte Kartenstapel-Quelle: ${source}`);
  }

  const path = splitDeckPath(name, hierarchyPath);
  const deckName = name?.trim() || path.at(-1) || "Neuer Kartenstapel";
  const normalizedCards = cards.map((card) =>
    createCoreLearningItem({
      ...card,
      id: card.id,
      deckId: id,
      cardType: card.cardType ?? card.kind,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }),
  );
  const deckTags = unique([...normalizeTags(tags), ...normalizedCards.flatMap((card) => card.originalTags ?? [])]);
  const createdEntry = createVersionEntry({
    objectType: "deck",
    objectId: id,
    changeType: "created",
    after: { name: deckName, source },
    createdAt,
  });

  return {
    id,
    ownerId,
    parentDeckId,
    name: deckName,
    description,
    source,
    originalDeckId,
    visibility: normalizeVisibility(visibility),
    hierarchyPath: path.length > 0 ? path : [deckName],
    createdAt,
    updatedAt,
    cardCount: normalizedCards.length,
    tags: deckTags,
    importMeta,
    deckSettings: createDefaultDeckSettings(deckSettings),
    sourceDocuments,
    cards: normalizedCards,
    reviewEvents,
    aiJobs,
    graph,
    communityRefs,
    versionLog: normalizeVersionLog(versionLog, createdEntry),
  };
}

export function normalizeCoreDeck(deck) {
  return createCoreDeck({
    ...deck,
    id: deck.id,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    source: CORE_DECK_SOURCES.includes(deck.source) ? deck.source : "manual",
  });
}

export function createCoreLearningItem(item = {}) {
  return createCoreCard({
    ...item,
    source: item.source ?? legacySourceFromLearningSourceType(item.sourceType),
    cardType: item.cardType ?? item.kind ?? "basic",
  });
}

export function createLearningItem(item = {}) {
  return createCoreLearningItem(item);
}

export function normalizeLearningItem(item = {}) {
  return createCoreLearningItem({
    ...item,
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}

function resolveLegacySource(sourceType, source) {
  return source ?? legacySourceFromLearningSourceType(sourceType);
}

function normalizeExtraText(extra) {
  if (typeof extra === "string") return extra;
  return extra?.explanation ?? extra?.back ?? extra?.answer ?? "";
}

function revealClozeText(text) {
  return String(text ?? "").replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1");
}

function extractClozeGroups(text) {
  const groups = new Map();
  const pattern = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
  let match = pattern.exec(String(text ?? ""));

  while (match) {
    const groupId = Number(match[1]);
    const cloze = {
      groupId,
      text: match[2],
      hint: match[3] ?? "",
    };
    groups.set(groupId, [...(groups.get(groupId) ?? []), cloze]);
    match = pattern.exec(String(text ?? ""));
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupId, clozes]) => ({ groupId, clozes }));
}

function renderClozeFront(text, groupId) {
  return String(text ?? "").replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_match, candidateGroup, value, hint) => {
    if (Number(candidateGroup) !== groupId) return value;
    return hint ? `[...] (${hint})` : "[...]";
  });
}

function normalizeNormalizedItemVariants(variants) {
  return Array.isArray(variants)
    ? variants.filter((variant) => String(variant?.front ?? "").trim() || String(variant?.back ?? "").trim())
    : [];
}

function resolveLearningItemRef(learningItemOrId, options = {}) {
  if (learningItemOrId && typeof learningItemOrId === "object") return learningItemOrId;

  const id = String(learningItemOrId ?? "");
  if (!id) return null;
  if (options.learningItem?.id === id) return options.learningItem;
  if (Array.isArray(options.items)) return options.items.find((item) => item.id === id) ?? null;
  if (Array.isArray(options.deck?.cards)) return options.deck.cards.find((item) => item.id === id) ?? null;
  return null;
}

export function createBasicLearningItem(deckId, front, back, options = {}) {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const id = options.id ?? makeId("card");
  const sourceType = options.sourceType ?? "manual";
  const source = resolveLegacySource(sourceType, options.source);
  const normalizedFront = sanitizeCardHtml(front);
  const normalizedBack = sanitizeCardHtml(back);
  const originalVariant = createCardVariant({
    id: options.originalVariantId ?? stableContentHash({ learningItemId: id, front: normalizedFront, back: normalizedBack, isOriginal: true }, "variant"),
    learningItemId: id,
    cardId: id,
    sourceCardId: id,
    variantType: "basic",
    variantLevel: 1,
    front: normalizedFront,
    back: normalizedBack,
    generationSource: "original",
    transformType: "original",
    qualityStatus: "active",
    isOriginal: true,
    isActive: true,
    sourceAnchors: options.sourceAnchors ?? [],
    createdAt,
    updatedAt,
    meta: {
      cardType: options.cardType ?? "basic",
      sourceType,
    },
  });

  return normalizeLearningItem({
    id,
    deckId,
    title: options.title ?? "",
    cardType: options.cardType ?? "basic",
    source,
    sourceType,
    sourceRefId: options.sourceRefId ?? options.sourceExternalId ?? null,
    canonicalQuestion: normalizedFront,
    canonicalAnswer: normalizedBack,
    originalFront: normalizedFront,
    originalBack: normalizedBack,
    originalFields: options.originalFields ?? [
      { name: "Front", value: normalizedFront },
      { name: "Back", value: normalizedBack },
    ].filter((field) => field.value),
    originalTags: options.tags ?? [],
    tags: options.tags ?? [],
    concepts: options.concepts ?? [],
    mediaRefs: options.mediaRefs ?? [],
    sourceAnchors: options.sourceAnchors ?? [],
    variants: [originalVariant],
    draftStatus: options.draftStatus ?? "accepted",
    status: options.status ?? "active",
    learningItemState: options.learningItemState ?? options.reviewState ?? createLearningItemState({ learningItemId: id, reviewableType: "card", reviewableId: id }),
    createdAt,
    updatedAt,
    meta: options.meta ?? {},
  });
}

export function createBasicReverseLearningItem(deckId, front, back, options = {}) {
  const item = createBasicLearningItem(deckId, front, back, {
    ...options,
    cardType: options.cardType ?? "basic-reversed",
  });
  const originalVariant = getOriginalVariant(item);
  const reverseVariant = createCardVariant({
    id: options.reverseVariantId,
    learningItemId: item.id,
    cardId: item.id,
    sourceCardId: item.id,
    variantType: "reverse",
    variantLevel: options.variantLevel ?? 2,
    front: back,
    back: front,
    generationSource: options.generationSource ?? "original",
    transformType: "front_back_style_shift",
    qualityStatus: "active",
    isOriginal: false,
    isActive: true,
    anchorVariantId: originalVariant?.id ?? null,
    parentVariantId: originalVariant?.id ?? null,
    sourceAnchors: options.sourceAnchors ?? [],
    createdAt: options.createdAt ?? item.createdAt,
    updatedAt: options.updatedAt ?? item.updatedAt,
    meta: {
      cardType: "basic-reversed",
      sourceType: item.sourceType,
    },
  });

  return normalizeLearningItem({
    ...item,
    variants: [...getActiveVariants(item), reverseVariant, ...(originalVariant ? [originalVariant] : [])],
    updatedAt: options.updatedAt ?? new Date().toISOString(),
  });
}

export function createClozeLearningItem(deckId, textWithClozes, extra = "", options = {}) {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const id = options.id ?? makeId("card");
  const sourceType = options.sourceType ?? "manual";
  const source = resolveLegacySource(sourceType, options.source);
  const extraText = normalizeExtraText(extra);
  const revealedText = revealClozeText(textWithClozes);
  const canonicalAnswer = [revealedText, extraText].filter(Boolean).join("\n\n");
  const originalVariant = createCardVariant({
    id: options.originalVariantId ?? stableContentHash({ learningItemId: id, textWithClozes, isOriginal: true }, "variant"),
    learningItemId: id,
    cardId: id,
    sourceCardId: id,
    variantType: "cloze",
    variantLevel: 1,
    front: textWithClozes,
    back: canonicalAnswer,
    explanation: extraText,
    generationSource: "original",
    transformType: "original",
    qualityStatus: "active",
    isOriginal: true,
    isActive: true,
    sourceAnchors: options.sourceAnchors ?? [],
    createdAt,
    updatedAt,
    meta: {
      cardType: "cloze",
      sourceType,
    },
  });
  const clozeVariants = extractClozeGroups(textWithClozes).map(({ groupId, clozes }) =>
    createCardVariant({
      id: stableContentHash({ learningItemId: id, groupId, textWithClozes }, "variant"),
      learningItemId: id,
      cardId: id,
      sourceCardId: id,
      variantType: "cloze",
      variantLevel: options.variantLevel ?? 2,
      front: renderClozeFront(textWithClozes, groupId),
      back: canonicalAnswer,
      explanation: extraText,
      hintsJson: clozes.map((cloze) => cloze.hint).filter(Boolean),
      expectedAnswerJson: clozes.map((cloze) => cloze.text),
      generationSource: options.generationSource ?? "original",
      transformType: "cloze_conversion",
      qualityStatus: "active",
      isOriginal: false,
      isActive: true,
      anchorVariantId: originalVariant.id,
      parentVariantId: originalVariant.id,
      sourceAnchors: options.sourceAnchors ?? [],
      createdAt,
      updatedAt,
      meta: {
        clozeGroup: groupId,
        cardType: "cloze",
        sourceType,
      },
    }),
  );

  return normalizeLearningItem({
    id,
    deckId,
    title: options.title ?? "",
    cardType: "cloze",
    source,
    sourceType,
    sourceRefId: options.sourceRefId ?? options.sourceExternalId ?? null,
    canonicalQuestion: textWithClozes,
    canonicalAnswer,
    originalFront: textWithClozes,
    originalBack: canonicalAnswer,
    originalFields: [
      { name: "Cloze", value: textWithClozes },
      { name: "Extra", value: extraText },
    ].filter((field) => field.value),
    originalTags: options.tags ?? [],
    tags: options.tags ?? [],
    concepts: options.concepts ?? [],
    mediaRefs: options.mediaRefs ?? [],
    sourceAnchors: options.sourceAnchors ?? [],
    variants: [...clozeVariants, originalVariant],
    draftStatus: options.draftStatus ?? "accepted",
    status: options.status ?? "active",
    learningItemState: options.learningItemState ?? options.reviewState ?? createLearningItemState({ learningItemId: id, reviewableType: "card", reviewableId: id }),
    createdAt,
    updatedAt,
    meta: {
      ...(options.meta ?? {}),
      clozeGroupCount: clozeVariants.length,
    },
  });
}

export function addRephrasedVariant(learningItemOrId, front, back, options = {}) {
  const resolved = resolveLearningItemRef(learningItemOrId, options);
  if (!resolved) {
    throw new Error(`LearningItem nicht gefunden: ${String(learningItemOrId ?? "")}`);
  }

  const item = normalizeLearningItem(resolved);
  const originalVariant = getOriginalVariant(item);
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const variant = createCardVariant({
    id: options.id ?? options.variantId,
    learningItemId: item.id,
    cardId: item.id,
    sourceCardId: item.id,
    variantType: options.variantType ?? "basic",
    variantLevel: options.variantLevel ?? 2,
    front,
    back,
    explanation: options.explanation ?? "",
    hintsJson: options.hintsJson ?? null,
    answerOptionsJson: options.answerOptionsJson ?? null,
    expectedAnswerJson: options.expectedAnswerJson ?? null,
    generationSource: options.generationSource ?? "user_edited",
    transformType: options.transformType ?? "rephrase",
    qualityStatus: options.qualityStatus ?? "active",
    isOriginal: false,
    isActive: options.isActive ?? true,
    anchorVariantId: options.anchorVariantId ?? originalVariant?.id ?? null,
    parentVariantId: options.parentVariantId ?? originalVariant?.id ?? null,
    sourceAnchors: options.sourceAnchors ?? item.sourceAnchors ?? [],
    createdAt: options.createdAt ?? updatedAt,
    updatedAt,
    meta: {
      ...(options.meta ?? {}),
      nearRephrase: true,
    },
  });

  return normalizeLearningItem({
    ...item,
    variants: [...getActiveVariants(item), variant, ...(originalVariant ? [originalVariant] : [])],
    updatedAt,
  });
}

export function createLearningItemsFromNormalizedInput(deckId, normalizedItems = [], options = {}) {
  const createdItems = [];
  const warnings = [];
  const skipped = [];

  if (!Array.isArray(normalizedItems)) {
    return {
      createdItems,
      warnings: ["normalizedItems muss ein Array sein."],
      skipped,
    };
  }

  normalizedItems.forEach((input, index) => {
    try {
      const variants = normalizeNormalizedItemVariants(input?.variants);
      const originalInput = variants.find((variant) => variant.isOriginal) ?? variants[0] ?? null;
      const canonicalQuestion = input?.canonicalQuestion ?? input?.front ?? originalInput?.front ?? "";
      const canonicalAnswer = input?.canonicalAnswer ?? input?.back ?? originalInput?.back ?? "";
      const anchorQuestion = originalInput?.front ?? canonicalQuestion;
      const anchorAnswer = originalInput?.back ?? canonicalAnswer;
      if (!String(canonicalQuestion).trim() && !String(canonicalAnswer).trim()) {
        skipped.push({ index, reason: "Keine canonicalQuestion/canonicalAnswer oder valide Variante." });
        warnings.push(`Item ${index + 1} wurde übersprungen: keine valide Frage/Antwort.`);
        return;
      }

      const commonOptions = {
        id: input.id,
        title: input.title,
        tags: input.tags ?? options.tags ?? [],
        concepts: input.concepts ?? options.concepts ?? [],
        sourceType: input.sourceType ?? options.sourceType ?? "mixed",
        source: input.source ?? options.source,
        sourceRefId: input.sourceRefId ?? input.sourceExternalId ?? options.sourceRefId ?? null,
        sourceExternalId: input.sourceExternalId,
        cardType: input.cardType ?? options.cardType,
        mediaRefs: input.mediaRefs ?? options.mediaRefs ?? [],
        originalFields: input.originalFields ?? options.originalFields ?? [],
        sourceAnchors: input.sourceAnchors ?? options.sourceAnchors ?? [],
        createdAt: input.createdAt ?? options.createdAt,
        updatedAt: input.updatedAt ?? options.updatedAt,
        meta: {
          ...(options.meta ?? {}),
          ...(input.meta ?? {}),
        },
      };
      const isCloze = input.cardType === "cloze" || /\{\{c\d+::/.test(String(canonicalQuestion));
      let item = isCloze
        ? createClozeLearningItem(deckId, anchorQuestion, anchorAnswer, commonOptions)
        : createBasicLearningItem(deckId, anchorQuestion, anchorAnswer, {
            ...commonOptions,
            cardType: input.cardType ?? "basic",
          });
      item = normalizeLearningItem({
        ...item,
        canonicalQuestion,
        canonicalAnswer,
      });
      const originalVariant = getOriginalVariant(item);
      variants
        .filter((variant) => variant !== originalInput)
        .forEach((variant) => {
          if (!String(variant.front ?? "").trim() && !String(variant.back ?? "").trim()) {
            warnings.push(`Item ${index + 1}: Leere Variante übersprungen.`);
            return;
          }
          item = addRephrasedVariant(item, variant.front ?? canonicalQuestion, variant.back ?? canonicalAnswer, {
            variantType: variant.variantType ?? "basic",
            variantLevel: variant.variantLevel ?? 2,
            generationSource: variant.generationSource ?? "imported",
            anchorVariantId: variant.anchorVariantId ?? originalVariant?.id,
            parentVariantId: variant.parentVariantId ?? originalVariant?.id,
            isActive: variant.isActive ?? true,
            transformType: variant.transformType ?? (variant.variantType === "cloze" ? "cloze_conversion" : "rephrase"),
            explanation: variant.explanation ?? "",
            hintsJson: variant.hintsJson ?? null,
            answerOptionsJson: variant.answerOptionsJson ?? null,
            expectedAnswerJson: variant.expectedAnswerJson ?? null,
            meta: {
              ...(variant.meta ?? {}),
              normalizedInputIndex: index,
              sourceVariantId: variant.id ?? null,
              sourceVariantExternalId: variant.sourceExternalId ?? null,
            },
          });
        });
      createdItems.push(item);
    } catch (error) {
      skipped.push({ index, reason: error.message });
      warnings.push(`Item ${index + 1} wurde übersprungen: ${error.message}`);
    }
  });

  return { createdItems, warnings, skipped };
}

export function createManualCoreDeck({ deckName, card, documentContext }) {
  const createdAt = new Date().toISOString();
  const sourceAnchor =
    documentContext?.selection || documentContext?.textQuote
      ? createSourceAnchor({
          documentId: documentContext.documentId ?? null,
          documentName: documentContext.fileName ?? "",
          textQuote: documentContext.selection ?? documentContext.textQuote,
          targetField: documentContext.targetField ?? "front",
          pageNumber: documentContext.pageNumber ?? null,
          charStart: documentContext.charStart ?? null,
          charEnd: documentContext.charEnd ?? null,
          confidence: 1,
          createdAt,
        })
      : null;
  const sourceDocument = documentContext?.document
    ? documentContext.document
    : documentContext?.fileName
      ? createSourceDocument({
          id: documentContext.documentId ?? makeId("doc"),
          fileName: documentContext.fileName,
          mimeType: documentContext.mimeType ?? "text/plain",
          text: documentContext.documentText ?? "",
          textExtractionStatus: documentContext.documentText ? "success" : "pending",
          createdAt,
        })
      : null;
  const itemOptions = {
    sourceType: "manual",
    source: "manual",
    cardType: card.cardType,
    tags: card.tags,
    mediaRefs: card.mediaRefs,
    sourceAnchors: sourceAnchor ? [sourceAnchor] : [],
    createdAt,
    updatedAt: createdAt,
    originalFields: [
      { name: "Front", value: card.front },
      { name: "Back", value: card.back },
      { name: "Source selection", value: documentContext?.selection ?? "" },
    ].filter((field) => field.value),
    meta: {
      documentContext: documentContext
        ? {
            fileName: documentContext.fileName,
            pageNumber: documentContext.pageNumber ?? null,
            selection: documentContext.selection ?? "",
          }
        : null,
      answerOptions: card.answerOptions ?? [],
      exactWordingRequired: Boolean(card.exactWordingRequired),
    },
  };
  const coreCard =
    card.cardType === "basic-reversed"
      ? createBasicReverseLearningItem("", card.front, card.back, itemOptions)
      : card.cardType === "cloze"
        ? createClozeLearningItem("", card.front, card.back, itemOptions)
        : createBasicLearningItem("", card.front, card.back, itemOptions);

  return createCoreDeck({
    name: deckName,
    source: "manual",
    cards: [coreCard],
    sourceDocuments: sourceDocument ? [sourceDocument] : [],
    createdAt,
    importMeta: {
      creationMethod: "manual",
      documentAssisted: Boolean(sourceAnchor),
    },
  });
}

export function createAiDraftDeck({ deckName, config, drafts, sourceDocuments = [] }) {
  const createdAt = new Date().toISOString();
  const cards = drafts.map((draft) => {
    const cardType = draft.cardType ?? draft.type ?? "basic";
    const sourceAnchors = (draft.sourceAnchors ?? []).map((anchor) =>
      createSourceAnchor({
        ...anchor,
        documentName: anchor.documentName ?? sourceDocuments[0]?.fileName ?? "",
        createdAt,
      }),
    );
    const options = {
      source: "ai-assisted",
      sourceType: "ai_generated",
      cardType,
      tags: draft.tags,
      sourceAnchors,
      draftStatus: "draft",
      createdAt,
      updatedAt: createdAt,
      meta: {
        aiConfig: config,
        reviewRequired: true,
        confidence: draft.confidence ?? 0.75,
        warnings: draft.warnings ?? [],
      },
    };

    return cardType === "cloze"
      ? createClozeLearningItem("", draft.front, draft.back, options)
      : createBasicLearningItem("", draft.front, draft.back, options);
  });

  return createCoreDeck({
    name: deckName,
    source: "ai-assisted",
    cards,
    sourceDocuments,
    createdAt,
    importMeta: {
      creationMethod: "ai-assisted",
      draftOnly: true,
      config,
    },
  });
}

export function acceptAiDraftDeck(deck) {
  const acceptedAt = new Date().toISOString();
  return normalizeCoreDeck({
    ...deck,
    cardCount: deck.cards.length,
    updatedAt: acceptedAt,
    importMeta: {
      ...deck.importMeta,
      draftOnly: false,
      acceptedAt,
    },
    cards: deck.cards.map((card) => ({
      ...card,
      draftStatus: "accepted",
      versionLog: [
        ...(card.versionLog ?? []),
        createVersionEntry({
          objectType: "card",
          objectId: card.id,
          changeType: "ai_draft_accepted",
          before: { draftStatus: card.draftStatus },
          after: { draftStatus: "accepted" },
          createdAt: acceptedAt,
        }),
      ],
    })),
  });
}

export function updateCardContent(card, patch, reason = "Manuelle Bearbeitung") {
  const updatedAt = new Date().toISOString();
  const nextFront = patch.originalFront ?? patch.front ?? card.originalFront;
  const nextBack = patch.originalBack ?? patch.back ?? card.originalBack;
  const nextTags = patch.originalTags ?? patch.tags ?? card.originalTags;
  const nextKind = patch.kind ?? patch.cardType ?? card.kind;
  const updated = createCoreCard({
    ...card,
    cardType: nextKind,
    originalFront: nextFront,
    originalBack: nextBack,
    originalTags: nextTags,
    originalFields: [
      { name: "Front", value: nextFront },
      { name: "Back", value: nextBack },
    ],
    createdAt: card.createdAt,
    updatedAt,
  });

  return {
    ...updated,
    immutableOriginal: card.immutableOriginal,
    versionLog: [
      ...(card.versionLog ?? []),
      createVersionEntry({
        objectType: "card",
        objectId: card.id,
        changeType: "content_updated",
        before: {
          originalFront: card.originalFront,
          originalBack: card.originalBack,
          originalTags: card.originalTags,
          kind: card.kind,
        },
        after: {
          originalFront: updated.originalFront,
          originalBack: updated.originalBack,
          originalTags: updated.originalTags,
          kind: updated.kind,
        },
        reason,
        createdAt: updatedAt,
      }),
    ],
  };
}

export function restoreCardVersion(card, versionId) {
  const version = (card.versionLog ?? []).find((entry) => entry.id === versionId);
  if (!version?.before) return card;

  return updateCardContent(
    card,
    {
      originalFront: version.before.originalFront,
      originalBack: version.before.originalBack,
      originalTags: version.before.originalTags,
      kind: version.before.kind,
    },
    `Restore auf Version ${versionId}`,
  );
}
