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
  "spreadsheet-import",
];

export const CORE_MODES = ["off", "auto", "manual"];
export const DECK_VISIBILITIES = ["private", "community", "unlisted", "public"];
export const VARIANT_TRANSFORMS = ["rephrase", "front_back_style_shift", "cloze_conversion"];
export const VARIANT_STATUSES = ["draft", "active", "rejected", "flagged", "disabled"];
export const REVIEW_RATINGS = ["again", "hard", "good", "easy"];

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

  return {
    coreMode,
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

export function createReviewState({
  id = makeId("state"),
  reviewableType = "card",
  reviewableId = "",
  userId = "local-user",
  dueAt = new Date().toISOString(),
  intervalDays = 0,
  ease = 2.5,
  difficulty = null,
  stability = null,
  repetitions = 0,
  lapses = 0,
  maturityXp = 0,
  lastReviewedAt = null,
  sourceSchedulerData = null,
} = {}) {
  return {
    id,
    reviewableType,
    reviewableId,
    userId,
    dueAt,
    intervalDays,
    ease,
    difficulty,
    stability,
    repetitions,
    lapses,
    maturityXp: Math.max(0, Math.round(maturityXp)),
    maturityBand: getMaturityBand(maturityXp),
    lastReviewedAt,
    sourceSchedulerData,
  };
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
  cardType = "basic",
  source,
  sourceCardId = null,
  sourceNoteId = null,
  originalFront = "",
  originalBack = "",
  originalFields = [],
  originalTags = [],
  originalHtml,
  mediaRefs = [],
  sourceAnchors = [],
  variants = [],
  draftStatus = "accepted",
  status = "active",
  reviewState = null,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  immutableOriginal = null,
  versionLog = [],
  meta = {},
}) {
  if (!CORE_CARD_TYPES.includes(cardType)) {
    throw new Error(`Unbekannter Kartentyp: ${cardType}`);
  }

  const sanitizedFront = sanitizeCardHtml(originalFront);
  const sanitizedBack = sanitizeCardHtml(originalBack);
  const fields = originalFields.map((field) => ({
    name: field.name,
    value: sanitizeCardHtml(field.value),
  }));
  const html = sanitizeCardHtml(originalHtml ?? [sanitizedFront, sanitizedBack].filter(Boolean).join("<hr>"));
  const normalizedTags = normalizeTags(originalTags);
  const cardSource = normalizeCardSource(source);
  const contentHash = stableContentHash(
    {
      front: stripHtml(sanitizedFront).trim().toLowerCase(),
      back: stripHtml(sanitizedBack).trim().toLowerCase(),
      type: cardType,
      tags: normalizedTags,
    },
    "card",
  );
  const normalizedReviewState = reviewState
    ? createReviewState({ ...reviewState, reviewableType: "card", reviewableId: id })
    : createReviewState({ reviewableType: "card", reviewableId: id });
  const normalizedVariants = variants.map((variant) => normalizeCardVariant({ ...variant, sourceCardId: id }));
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
    draftStatus,
    status,
    contentHash,
    reviewState: normalizedReviewState,
    variants: normalizedVariants,
    versionLog: normalizeVersionLog(versionLog, createdEntry),
    coreState: {
      isCoreReady: normalizedReviewState.maturityBand === "variant_ready" || normalizedReviewState.maturityBand === "mastered",
      variantCount: normalizedVariants.filter((variant) => variant.qualityStatus === "active").length,
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
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  });
}

export function createCardVariant({
  id = makeId("variant"),
  sourceCardId,
  front = "",
  back = "",
  transformType = "rephrase",
  transformProfile = {},
  modelRunId = null,
  confidence = 0.75,
  semanticDelta = "none",
  changedRecognitionCues = [],
  qualityStatus = "active",
  sourceAnchors = [],
  reviewState = null,
  feedback = [],
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  versionLog = [],
  meta = {},
}) {
  if (!sourceCardId) {
    throw new Error("Varianten benoetigen sourceCardId.");
  }
  if (!VARIANT_TRANSFORMS.includes(transformType)) {
    throw new Error(`Unbekannte Transformationsart: ${transformType}`);
  }
  if (!VARIANT_STATUSES.includes(qualityStatus)) {
    throw new Error(`Unbekannter Variantenstatus: ${qualityStatus}`);
  }

  const sanitizedFront = sanitizeCardHtml(front);
  const sanitizedBack = sanitizeCardHtml(back);
  const contentHash = stableContentHash(
    {
      sourceCardId,
      transformType,
      transformProfile,
      front: stripHtml(sanitizedFront).trim().toLowerCase(),
      back: stripHtml(sanitizedBack).trim().toLowerCase(),
    },
    "variant",
  );
  const normalizedReviewState = reviewState
    ? createReviewState({ ...reviewState, reviewableType: "variant", reviewableId: id })
    : createReviewState({ reviewableType: "variant", reviewableId: id });
  const createdEntry = createVersionEntry({
    objectType: "variant",
    objectId: id,
    changeType: "created",
    after: { front: sanitizedFront, back: sanitizedBack, transformType },
    createdAt,
  });

  return {
    id,
    sourceCardId,
    front: sanitizedFront,
    back: sanitizedBack,
    transformType,
    transformProfile,
    modelRunId,
    confidence,
    semanticDelta,
    changedRecognitionCues,
    qualityStatus,
    contentHash,
    sourceAnchors,
    reviewState: normalizedReviewState,
    feedback,
    versionLog: normalizeVersionLog(versionLog, createdEntry),
    createdAt,
    updatedAt,
    meta,
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
    createCoreCard({
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
  const coreCard = createCoreCard({
    source: "manual",
    cardType: card.cardType,
    originalFront: card.front,
    originalBack: card.back,
    originalFields: [
      { name: "Front", value: card.front },
      { name: "Back", value: card.back },
      { name: "Source selection", value: documentContext?.selection ?? "" },
    ].filter((field) => field.value),
    originalTags: card.tags,
    mediaRefs: card.mediaRefs,
    sourceAnchors: sourceAnchor ? [sourceAnchor] : [],
    draftStatus: "accepted",
    createdAt,
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
  });

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
  const cards = drafts.map((draft) =>
    createCoreCard({
      source: "ai-assisted",
      cardType: draft.cardType ?? draft.type ?? "basic",
      originalFront: draft.front,
      originalBack: draft.back,
      originalTags: draft.tags,
      sourceAnchors: (draft.sourceAnchors ?? []).map((anchor) =>
        createSourceAnchor({
          ...anchor,
          documentName: anchor.documentName ?? sourceDocuments[0]?.fileName ?? "",
          createdAt,
        }),
      ),
      draftStatus: "draft",
      createdAt,
      meta: {
        aiConfig: config,
        reviewRequired: true,
        confidence: draft.confidence ?? 0.75,
        warnings: draft.warnings ?? [],
      },
    }),
  );

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
