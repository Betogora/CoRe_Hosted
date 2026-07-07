import {
  CARD_VARIANT_TYPES,
  VARIANT_GENERATION_SOURCES,
  createCoreDeck,
  createLearningItemsFromNormalizedInput,
  getActiveVariants,
  getOriginalVariant,
  normalizeCoreDeck,
  normalizeTags,
  stableContentHash,
} from "./coreModel.js";
import { stripHtml } from "./htmlSafety.js";

export const NORMALIZED_IMPORT_SOURCE_TYPES = ["manual", "text_import", "csv_import", "json_import", "anki_import", "ai_generated", "mixed"];
export const IMPORT_MERGE_STRATEGIES = ["create_new", "skip_duplicates", "update_existing"];

const DEFAULT_IMPORT_OPTIONS = {
  dryRun: false,
  targetDeckId: null,
  mergeStrategy: "create_new",
  importScheduling: false,
  importMedia: true,
  preserveSourceIds: true,
  normalizeText: true,
};

const DECK_SOURCE_BY_IMPORT_SOURCE = {
  manual: "manual",
  text_import: "text-import",
  csv_import: "csv-import",
  json_import: "json-import",
  anki_import: "anki-apkg",
  ai_generated: "ai-assisted",
  mixed: "manual",
};

const TRANSFORM_BY_VARIANT_TYPE = {
  reverse: "front_back_style_shift",
  cloze: "cloze_conversion",
  basic: "rephrase",
  mcq: "rephrase",
  transfer: "rephrase",
  case: "rephrase",
  image_occlusion: "rephrase",
  custom: "rephrase",
};

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === "," || char === "\t" || char === ";") && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function text(value, { normalizeText = true } = {}) {
  const trimmed = String(value ?? "").trim();
  return normalizeText ? trimmed.replace(/\s+/g, " ") : trimmed;
}

function metadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeSourceType(value, fallback = "mixed") {
  return NORMALIZED_IMPORT_SOURCE_TYPES.includes(value) ? value : fallback;
}

function normalizeVariantType(value) {
  const candidate = String(value ?? "basic").trim();
  const mapped = {
    "basic-reversed": "reverse",
    "image-occlusion": "image_occlusion",
    "multiple-choice": "mcq",
    "case-vignette": "case",
  }[candidate] ?? candidate;

  return CARD_VARIANT_TYPES.includes(mapped) ? mapped : "basic";
}

function normalizeGenerationSource(value, isOriginal = false) {
  if (!isOriginal && value === "original") return "imported";
  if (VARIANT_GENERATION_SOURCES.includes(value)) return value;
  return isOriginal ? "original" : "imported";
}

function normalizeVariantLevel(value, isOriginal = false) {
  if (!Number.isFinite(Number(value))) return isOriginal ? 1 : 2;
  return Math.min(3, Math.max(1, Math.round(Number(value))));
}

function normalizeAnchors(anchors) {
  return Array.isArray(anchors) ? anchors.filter((anchor) => anchor && typeof anchor === "object").map((anchor) => ({ ...anchor })) : [];
}

function normalizeStringList(values) {
  if (Array.isArray(values)) return values.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (values === null || values === undefined || values === "") return [];
  return [String(values).trim()].filter(Boolean);
}

function createEmptyReport({ dryRun = false, sourceType = "mixed", targetDeckId = null } = {}) {
  return {
    dryRun,
    createdDecks: 0,
    createdLearningItems: 0,
    createdCards: 0,
    createdVariants: 0,
    skipped: [],
    duplicates: [],
    warnings: [],
    errors: [],
    sourceType,
    targetDeckId,
    previewItems: [],
    summary: {
      wouldCreateDecks: 0,
      wouldCreateLearningItems: 0,
      wouldCreateCards: 0,
      wouldCreateVariants: 0,
      skipped: 0,
      duplicates: 0,
      warnings: 0,
      errors: 0,
    },
  };
}

function finalizeReport(report) {
  report.createdCards = report.createdLearningItems;
  report.summary = {
    ...report.summary,
    wouldCreateDecks: report.createdDecks,
    wouldCreateLearningItems: report.createdLearningItems,
    wouldCreateCards: report.createdCards,
    wouldCreateVariants: report.createdVariants,
    skipped: report.skipped.length,
    duplicates: report.duplicates.length,
    warnings: report.warnings.length,
    errors: report.errors.length,
  };
  return report;
}

function normalizeOptions(options = {}) {
  const mergeStrategy = IMPORT_MERGE_STRATEGIES.includes(options.mergeStrategy) ? options.mergeStrategy : DEFAULT_IMPORT_OPTIONS.mergeStrategy;
  return {
    ...DEFAULT_IMPORT_OPTIONS,
    ...options,
    dryRun: Boolean(options.dryRun),
    targetDeckId: options.targetDeckId ?? null,
    mergeStrategy,
    importScheduling: Boolean(options.importScheduling),
    importMedia: options.importMedia ?? DEFAULT_IMPORT_OPTIONS.importMedia,
    preserveSourceIds: options.preserveSourceIds ?? DEFAULT_IMPORT_OPTIONS.preserveSourceIds,
    normalizeText: options.normalizeText ?? DEFAULT_IMPORT_OPTIONS.normalizeText,
    existingDecks: Array.isArray(options.existingDecks) ? options.existingDecks : [],
  };
}

function itemHasSchedulingData(item) {
  const meta = item?.metadataJson ?? item?.meta ?? {};
  return Boolean(item?.reviewState || item?.learningItemState || item?.scheduling || meta.scheduling || meta.reviewState || meta.learningItemState);
}

function normalizeNormalizedDeckShape(input = {}) {
  return {
    id: input.id ?? null,
    title: input.title ?? input.name ?? input.deckName ?? "Importierter Stapel",
    description: input.description ?? "",
    sourceType: input.sourceType ?? "mixed",
    sourceExternalId: input.sourceExternalId ?? input.externalId ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    parentDeckId: input.parentDeckId ?? null,
    hierarchyPath: input.hierarchyPath ?? null,
    originalDeckId: input.originalDeckId ?? null,
    tags: input.tags ?? [],
    metadataJson: input.metadataJson ?? input.meta ?? {},
    items: input.items ?? input.cards ?? [],
    mediaAssets: input.mediaAssets ?? input.media ?? [],
  };
}

export function normalizeImportVariant(input = {}, options = {}) {
  const warnings = [];
  const errors = [];
  const isOriginal = Boolean(input.isOriginal);
  const front = text(input.front ?? input.question ?? input.canonicalQuestion ?? "", options);
  const back = text(input.back ?? input.answer ?? input.canonicalAnswer ?? "", options);
  const variantType = normalizeVariantType(input.variantType ?? input.cardType);
  const generationSource = normalizeGenerationSource(input.generationSource, isOriginal);

  if (!front) errors.push("Variante ohne front wurde abgelehnt.");
  if (!back) errors.push("Variante ohne back wurde abgelehnt.");
  if (input.variantType && !CARD_VARIANT_TYPES.includes(input.variantType)) warnings.push(`variantType ${String(input.variantType)} wurde auf ${variantType} normalisiert.`);
  if (input.generationSource && !VARIANT_GENERATION_SOURCES.includes(input.generationSource)) warnings.push(`generationSource ${String(input.generationSource)} wurde normalisiert.`);

  return {
    variant: {
      front,
      back,
      variantType,
      variantLevel: normalizeVariantLevel(input.variantLevel, isOriginal),
      generationSource,
      sourceExternalId: input.sourceExternalId ?? input.externalId ?? null,
      isOriginal,
      anchorToOriginal: input.anchorToOriginal ?? !isOriginal,
      isActive: input.isActive ?? true,
      abstractionLevel: input.abstractionLevel == null ? null : Number(input.abstractionLevel),
      semanticDistanceEstimate: input.semanticDistanceEstimate == null ? null : Number(input.semanticDistanceEstimate),
      metadataJson: metadata(input.metadataJson ?? input.meta),
    },
    warnings,
    errors,
  };
}

function normalizeItemVariants(input, canonicalQuestion, canonicalAnswer, options) {
  const warnings = [];
  const errors = [];
  const rawVariants = Array.isArray(input.variants) ? input.variants : [];
  const variants = [];

  rawVariants.forEach((candidate, index) => {
    const result = normalizeImportVariant(candidate, options);
    warnings.push(...result.warnings.map((warning) => `Variante ${index + 1}: ${warning}`));
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((error) => `Variante ${index + 1}: ${error}`));
      return;
    }
    variants.push(result.variant);
  });

  if (!variants.some((variant) => variant.isOriginal)) {
    const firstOriginalCandidate = variants[0];
    if (firstOriginalCandidate && (!canonicalQuestion || !canonicalAnswer)) {
      firstOriginalCandidate.isOriginal = true;
      firstOriginalCandidate.generationSource = "original";
      firstOriginalCandidate.variantLevel = 1;
      firstOriginalCandidate.anchorToOriginal = false;
      warnings.push("Erste valide Variante wurde als Originalanker genutzt.");
    } else {
      variants.unshift({
        front: canonicalQuestion,
        back: canonicalAnswer,
        variantType: "basic",
        variantLevel: 1,
        generationSource: "original",
        sourceExternalId: input.sourceExternalId ?? null,
        isOriginal: true,
        anchorToOriginal: false,
        isActive: true,
        abstractionLevel: 1,
        semanticDistanceEstimate: 0,
        metadataJson: { derivedFromCanonical: true },
      });
    }
  }

  const originalSeen = new Set();
  const normalizedVariants = variants.map((variant) => {
    const keepOriginal = variant.isOriginal && originalSeen.size === 0;
    if (keepOriginal) originalSeen.add("original");
    return {
      ...variant,
      isOriginal: keepOriginal,
      generationSource: keepOriginal ? "original" : normalizeGenerationSource(variant.generationSource, false),
      variantLevel: normalizeVariantLevel(variant.variantLevel, keepOriginal),
      anchorToOriginal: keepOriginal ? false : variant.anchorToOriginal ?? true,
      isActive: variant.isActive ?? true,
    };
  });

  return { variants: normalizedVariants, warnings, errors };
}

export function normalizeImportItem(input = {}, options = {}) {
  const warnings = [];
  const errors = [];
  const initialCanonicalQuestion = text(input.canonicalQuestion ?? input.question ?? input.front ?? "", options);
  const initialCanonicalAnswer = text(input.canonicalAnswer ?? input.answer ?? input.back ?? "", options);

  const sourceType = normalizeSourceType(input.sourceType ?? options.sourceType, options.sourceType ?? "mixed");
  const variantResult = normalizeItemVariants(input, initialCanonicalQuestion, initialCanonicalAnswer, options);
  warnings.push(...variantResult.warnings);
  errors.push(...variantResult.errors);
  const originalCandidate = variantResult.variants.find((variant) => variant.isOriginal) ?? variantResult.variants[0] ?? null;
  const canonicalQuestion = initialCanonicalQuestion || originalCandidate?.front || "";
  const canonicalAnswer = initialCanonicalAnswer || originalCandidate?.back || "";

  if (!canonicalQuestion) errors.push("canonicalQuestion fehlt oder ist leer.");
  if (!canonicalAnswer) errors.push("canonicalAnswer fehlt oder ist leer.");

  return {
    item: {
      title: text(input.title ?? "", options),
      canonicalQuestion,
      canonicalAnswer,
      tags: normalizeTags(input.tags ?? options.tags ?? []),
      concepts: normalizeTags(input.concepts ?? []),
      sourceType,
      sourceExternalId: input.sourceExternalId ?? input.externalId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? options.sourceDocumentId ?? null,
      sourceAnchors: normalizeAnchors(input.sourceAnchors),
      variants: variantResult.variants,
      cardType: input.cardType ?? null,
      mediaRefs: normalizeStringList(input.mediaRefs),
      originalFields: Array.isArray(input.originalFields) ? input.originalFields.map((field) => ({ ...field })) : [],
      metadataJson: metadata(input.metadataJson ?? input.meta),
    },
    warnings,
    errors,
  };
}

export function normalizeImportDeck(input = {}, options = {}) {
  const warnings = [];
  const errors = [];
  const deckInput = normalizeNormalizedDeckShape(input);
  const sourceType = normalizeSourceType(deckInput.sourceType ?? options.sourceType, options.sourceType ?? "mixed");
  const normalizedDeck = {
    id: deckInput.id ?? null,
    title: text(deckInput.title, options) || "Importierter Stapel",
    description: text(deckInput.description, options),
    sourceType,
    sourceExternalId: deckInput.sourceExternalId ?? null,
    sourceDocumentId: deckInput.sourceDocumentId ?? null,
    parentDeckId: deckInput.parentDeckId ?? null,
    hierarchyPath: Array.isArray(deckInput.hierarchyPath) ? deckInput.hierarchyPath.map((part) => text(part, options)).filter(Boolean) : null,
    originalDeckId: deckInput.originalDeckId ?? deckInput.sourceExternalId ?? null,
    tags: normalizeTags(deckInput.tags),
    metadataJson: metadata(deckInput.metadataJson),
    items: [],
    mediaAssets: normalizeImportMediaAssets(deckInput.mediaAssets),
  };

  if (!Array.isArray(deckInput.items)) {
    errors.push("Importdeck benötigt ein items-Array.");
  } else {
    deckInput.items.forEach((candidate, index) => {
      const result = normalizeImportItem(candidate, {
        ...options,
        sourceType: candidate?.sourceType ?? sourceType,
        tags: candidate?.tags ?? normalizedDeck.tags,
        sourceDocumentId: candidate?.sourceDocumentId ?? normalizedDeck.sourceDocumentId,
      });
      warnings.push(...result.warnings.map((warning) => `Item ${index + 1}: ${warning}`));
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((error) => `Item ${index + 1}: ${error}`));
        return;
      }
      normalizedDeck.items.push(result.item);
    });
  }

  return { normalizedDeck, warnings, errors };
}

export function normalizeImportMediaAssets(mediaAssets = []) {
  if (!Array.isArray(mediaAssets)) return [];

  return mediaAssets
    .filter((asset) => asset && typeof asset === "object" && String(asset.filename ?? "").trim())
    .map((asset) => ({
      filename: String(asset.filename).trim(),
      mimeType: String(asset.mimeType ?? "application/octet-stream").trim(),
      sourceExternalId: asset.sourceExternalId ?? asset.externalId ?? null,
      storageRef: asset.storageRef ?? null,
      originalPath: asset.originalPath ?? asset.path ?? null,
      metadataJson: metadata(asset.metadataJson ?? asset.meta),
    }));
}

export function normalizeNormalizedImportPayload(input = {}, options = {}) {
  const result = normalizeImportDeck(input, options);
  const report = createEmptyReport({
    dryRun: Boolean(options.dryRun),
    sourceType: result.normalizedDeck?.sourceType ?? normalizeSourceType(input?.sourceType, "mixed"),
    targetDeckId: options.targetDeckId ?? null,
  });

  report.warnings.push(...result.warnings);
  report.errors.push(...result.errors);
  return { ...result, report: finalizeReport(report) };
}

export function normalizeTextForFingerprint(value) {
  return stripHtml(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function createImportFingerprint(item = {}) {
  const variants = (item.variants ?? [])
    .map((variant) => ({
      front: normalizeTextForFingerprint(variant.front),
      back: normalizeTextForFingerprint(variant.back),
      type: normalizeVariantType(variant.variantType),
    }))
    .sort((left, right) => `${left.type}:${left.front}:${left.back}`.localeCompare(`${right.type}:${right.front}:${right.back}`));

  return stableContentHash(
    {
      question: normalizeTextForFingerprint(item.canonicalQuestion ?? item.originalFront ?? item.front),
      answer: normalizeTextForFingerprint(item.canonicalAnswer ?? item.originalBack ?? item.back),
      tags: normalizeTags(item.tags ?? item.originalTags).map((tag) => tag.toLowerCase()).sort(),
      variants,
    },
    "importfp",
  );
}

function asDeckList(existingDecksOrDeck) {
  if (Array.isArray(existingDecksOrDeck)) return existingDecksOrDeck;
  if (Array.isArray(existingDecksOrDeck?.decks)) return existingDecksOrDeck.decks;
  if (existingDecksOrDeck?.cards) return [existingDecksOrDeck];
  return [];
}

function getExistingSourceExternalIds(card) {
  return [
    card.sourceExternalId,
    card.sourceRefId,
    card.sourceCardId,
    card.sourceNoteId,
    card.meta?.sourceExternalId,
    card.meta?.normalizedImport?.sourceExternalId,
    card.meta?.import?.sourceExternalId,
  ].filter(Boolean).map(String);
}

export function findDuplicateLearningItem(existingDecksOrDeck, normalizedItem) {
  const decks = asDeckList(existingDecksOrDeck);
  const sourceExternalId = normalizedItem?.sourceExternalId ? String(normalizedItem.sourceExternalId) : null;
  const fingerprint = createImportFingerprint(normalizedItem);

  for (const deck of decks) {
    for (const card of deck.cards ?? []) {
      if (sourceExternalId && getExistingSourceExternalIds(card).includes(sourceExternalId)) {
        return {
          duplicate: true,
          reason: "sourceExternalId",
          deckId: deck.id,
          learningItemId: card.id,
          fingerprint,
        };
      }

      const existingFingerprint = card.meta?.importFingerprint ?? createImportFingerprint(card);
      if (existingFingerprint === fingerprint) {
        return {
          duplicate: true,
          reason: "fingerprint",
          deckId: deck.id,
          learningItemId: card.id,
          fingerprint,
        };
      }
    }
  }

  return { duplicate: false, fingerprint };
}

function toPipelineVariant(variant) {
  return {
    sourceExternalId: variant.sourceExternalId ?? null,
    front: variant.front,
    back: variant.back,
    variantType: variant.variantType,
    variantLevel: variant.variantLevel,
    generationSource: variant.isOriginal ? "original" : variant.generationSource ?? "imported",
    isOriginal: Boolean(variant.isOriginal),
    isActive: variant.isActive ?? true,
    transformType: variant.isOriginal ? "original" : TRANSFORM_BY_VARIANT_TYPE[variant.variantType] ?? "rephrase",
    meta: {
      sourceExternalId: variant.sourceExternalId ?? null,
      abstractionLevel: variant.abstractionLevel,
      semanticDistanceEstimate: variant.semanticDistanceEstimate,
      metadataJson: variant.metadataJson,
      anchorToOriginal: variant.anchorToOriginal ?? !variant.isOriginal,
    },
  };
}

function toPipelineItem(item, options = {}) {
  const importFingerprint = createImportFingerprint(item);
  const coreSourceType = item.sourceType;

  return {
    title: item.title,
    canonicalQuestion: item.canonicalQuestion,
    canonicalAnswer: item.canonicalAnswer,
    tags: item.tags,
    concepts: item.concepts,
    sourceType: coreSourceType,
    sourceExternalId: options.preserveSourceIds ? item.sourceExternalId : null,
    sourceDocumentId: item.sourceDocumentId,
    sourceAnchors: item.sourceAnchors,
    variants: item.variants.map(toPipelineVariant),
    cardType: item.cardType ?? undefined,
    mediaRefs: item.mediaRefs ?? [],
    originalFields: item.originalFields ?? [],
    meta: {
      ...(item.metadataJson ?? {}),
      importFingerprint,
      normalizedImport: {
        sourceType: item.sourceType,
        sourceExternalId: item.sourceExternalId ?? null,
        sourceDocumentId: item.sourceDocumentId ?? null,
        metadataJson: item.metadataJson,
      },
    },
  };
}

function countNonOriginalVariants(items) {
  return items.reduce((sum, item) => sum + (item.variants ?? []).filter((variant) => !variant.isOriginal).length, 0);
}

function previewItem(item, duplicateInfo = null) {
  return {
    title: item.title,
    canonicalQuestion: item.canonicalQuestion,
    canonicalAnswer: item.canonicalAnswer,
    tags: item.tags,
    sourceType: item.sourceType,
    sourceExternalId: item.sourceExternalId,
    variantCount: (item.variants ?? []).length,
    nonOriginalVariantCount: (item.variants ?? []).filter((variant) => !variant.isOriginal).length,
    duplicate: duplicateInfo?.duplicate ?? false,
    duplicateReason: duplicateInfo?.reason ?? null,
  };
}

function deckSourceFor(sourceType, fallback = null) {
  return fallback ?? DECK_SOURCE_BY_IMPORT_SOURCE[sourceType] ?? "manual";
}

export function importNormalizedDeck(input = {}, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const normalization = normalizeImportDeck(input, normalizedOptions);
  const normalizedDeck = normalization.normalizedDeck;
  const report = createEmptyReport({
    dryRun: normalizedOptions.dryRun,
    sourceType: normalizedDeck.sourceType,
    targetDeckId: normalizedOptions.targetDeckId,
  });
  report.warnings.push(...normalization.warnings);
  report.errors.push(...normalization.errors);

  if (normalizedOptions.importScheduling === false) {
    normalizedDeck.items.forEach((item, index) => {
      if (itemHasSchedulingData(item)) {
        report.warnings.push(`Item ${index + 1}: Scheduling-Daten wurden erkannt, aber in diesem Schritt nicht uebernommen.`);
      }
    });
  }

  const targetDeck = normalizedOptions.targetDeckId
    ? normalizedOptions.existingDecks.find((deck) => deck.id === normalizedOptions.targetDeckId) ?? null
    : null;
  const duplicateScope = targetDeck ?? normalizedOptions.existingDecks;
  const importableItems = [];
  const seenImportFingerprints = new Map();

  normalizedDeck.items.forEach((item, index) => {
    const duplicateInfo = findDuplicateLearningItem(duplicateScope, item);
    const itemFingerprint = duplicateInfo.fingerprint ?? createImportFingerprint(item);
    if (!duplicateInfo.duplicate && seenImportFingerprints.has(itemFingerprint)) {
      duplicateInfo.duplicate = true;
      duplicateInfo.reason = "payload_fingerprint";
      duplicateInfo.learningItemId = null;
      duplicateInfo.deckId = null;
      duplicateInfo.fingerprint = itemFingerprint;
    }
    if (duplicateInfo.duplicate) {
      const duplicate = {
        index,
        reason: duplicateInfo.reason,
        deckId: duplicateInfo.deckId,
        learningItemId: duplicateInfo.learningItemId,
        fingerprint: duplicateInfo.fingerprint,
      };
      report.duplicates.push(duplicate);

      if (normalizedOptions.mergeStrategy === "skip_duplicates") {
        report.skipped.push({ index, reason: "duplicate", duplicate });
        report.previewItems.push(previewItem(item, duplicateInfo));
        return;
      }

      if (normalizedOptions.mergeStrategy === "update_existing") {
        report.warnings.push("mergeStrategy update_existing ist im lokalen MVP noch nicht vollstaendig implementiert; bestehende Karten wurden nicht ueberschrieben.");
        report.skipped.push({ index, reason: "update_existing_not_implemented", duplicate });
        report.previewItems.push(previewItem(item, duplicateInfo));
        return;
      }

      report.warnings.push(`Item ${index + 1}: moegliche Dublette (m\u00f6gliche Dublette) erkannt, wegen create_new trotzdem importiert.`);
    }

    importableItems.push(item);
    seenImportFingerprints.set(itemFingerprint, index);
    report.previewItems.push(previewItem(item, duplicateInfo));
  });

  report.createdDecks = targetDeck ? 0 : 1;
  report.createdLearningItems = importableItems.length;
  report.createdVariants = countNonOriginalVariants(importableItems);

  if (normalizedOptions.dryRun || report.errors.length > 0) {
    return {
      deck: null,
      normalizedDeck,
      report: finalizeReport(report),
    };
  }

  const deckId = targetDeck?.id ?? normalizedOptions.targetDeckId ?? "";
  const creation = createLearningItemsFromNormalizedInput(
    deckId,
    importableItems.map((item) => toPipelineItem(item, normalizedOptions)),
    {
      tags: normalizedDeck.tags,
      sourceType: normalizedDeck.sourceType,
      source: deckSourceFor(normalizedDeck.sourceType),
      meta: {
        importSourceType: normalizedDeck.sourceType,
        importDeckExternalId: normalizedDeck.sourceExternalId ?? null,
      },
    },
  );
  report.warnings.push(...creation.warnings);
  report.skipped.push(...creation.skipped.map((item) => ({ ...item, reason: item.reason ?? "creation_pipeline_skipped" })));

  const createdItems = creation.createdItems;
  const createdVariantCount = createdItems.reduce((sum, item) => sum + getActiveVariants(item).length, 0);
  report.createdLearningItems = createdItems.length;
  report.createdVariants = createdVariantCount;
  report.createdDecks = targetDeck ? 0 : 1;

  const importMeta = {
    creationMethod: "normalized-import",
    sourceType: normalizedDeck.sourceType,
    sourceExternalId: normalizedDeck.sourceExternalId ?? null,
    sourceDocumentId: normalizedDeck.sourceDocumentId ?? null,
    detectedCards: normalizedDeck.items.length,
    importedCards: createdItems.length,
    importedVariants: createdVariantCount,
    dryRun: false,
    warnings: report.warnings,
    errors: report.errors,
    duplicates: report.duplicates,
    summary: report.summary,
    sourceMetadata: normalizedDeck.metadataJson ?? {},
    mediaAssets: normalizedDeck.mediaAssets ?? [],
    mediaManifest: normalizedDeck.metadataJson?.mediaManifest ?? {
      format: "none",
      assets: [],
      missingAssets: [],
    },
  };
  const deck = targetDeck
    ? normalizeCoreDeck({
        ...targetDeck,
        description: targetDeck.description || normalizedDeck.description,
        tags: normalizeTags([...(targetDeck.tags ?? []), ...normalizedDeck.tags]),
        cards: [...(targetDeck.cards ?? []), ...createdItems],
        importMeta: {
          ...(targetDeck.importMeta ?? {}),
          ...importMeta,
        },
        updatedAt: new Date().toISOString(),
      })
    : createCoreDeck({
        id: normalizedOptions.targetDeckId ?? normalizedDeck.id ?? undefined,
        name: normalizedDeck.title,
        description: normalizedDeck.description,
        source: deckSourceFor(normalizedDeck.sourceType),
        parentDeckId: normalizedDeck.parentDeckId,
        hierarchyPath: normalizedDeck.hierarchyPath,
        originalDeckId: normalizedDeck.originalDeckId,
        tags: normalizedDeck.tags,
        cards: createdItems,
        importMeta,
      });

  return {
    deck,
    normalizedDeck,
    report: finalizeReport(report),
  };
}

export function parseTextToNormalizedImport({ deckName = "Text-Import", text: rawText = "", tags = [], sourceExternalId = null } = {}) {
  const warnings = [];
  const passages = String(rawText)
    .split(/\n{2,}/)
    .map((passage) => passage.trim())
    .filter((passage) => passage.length > 0);
  const items = passages.map((passage, index) => {
    const [front, ...backParts] = passage.split(/\n-+\n|\nAntwort:\s*/i);
    const back = backParts.join("\n").trim() || passage;
    if (!front.trim() || !back.trim()) warnings.push(`Textblock ${index + 1}: Frage oder Antwort war leer.`);
    return {
      title: `Textkarte ${index + 1}`,
      canonicalQuestion: front.trim() || `Textkarte ${index + 1}`,
      canonicalAnswer: back,
      tags,
      sourceType: "text_import",
      sourceExternalId: sourceExternalId ? `${sourceExternalId}:${index + 1}` : null,
      metadataJson: {
        importFormat: "text",
        rawIndex: index,
      },
    };
  });

  return {
    normalizedDeck: {
      title: deckName,
      sourceType: "text_import",
      tags,
      items,
      metadataJson: { parser: "parseTextToNormalizedImport" },
    },
    warnings,
    errors: items.length === 0 ? ["Keine importierbaren Textabschnitte erkannt."] : [],
  };
}

export function parseCsvToNormalizedImport({ deckName = "CSV-Import", csv = "", tags = [], sourceType = "csv_import", format = null } = {}) {
  const warnings = [];
  const lines = String(csv)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      normalizedDeck: { title: deckName, sourceType, tags, items: [] },
      warnings,
      errors: ["CSV enthält keine importierbaren Zeilen."],
    };
  }

  const header = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  const hasHeader = ["front", "back", "question", "answer"].some((column) => header.includes(column));
  const frontIndex = hasHeader ? Math.max(header.indexOf("front"), header.indexOf("question")) : 0;
  const backIndex = hasHeader ? Math.max(header.indexOf("back"), header.indexOf("answer")) : 1;
  const tagsIndex = hasHeader ? header.indexOf("tags") : 2;
  const variantLevelIndex = hasHeader ? header.indexOf("variantlevel") : -1;
  const variantTypeIndex = hasHeader ? header.indexOf("varianttype") : -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const items = [];

  dataLines.forEach((line, index) => {
    const columns = splitCsvLine(line);
    const front = columns[frontIndex] ?? "";
    const back = columns[backIndex] ?? "";
    if (!front.trim() || !back.trim()) {
      warnings.push(`Zeile ${index + (hasHeader ? 2 : 1)} wurde übersprungen: front/question oder back/answer fehlt.`);
      return;
    }

    items.push({
      canonicalQuestion: front,
      canonicalAnswer: back,
      tags: tagsIndex >= 0 ? columns[tagsIndex] ?? tags : tags,
      sourceType,
      variants: [
        {
          front,
          back,
          variantType: variantTypeIndex >= 0 ? columns[variantTypeIndex] : "basic",
          variantLevel: variantLevelIndex >= 0 ? columns[variantLevelIndex] : 1,
          generationSource: "original",
          isOriginal: true,
        },
      ],
      metadataJson: {
        importFormat: format ?? (sourceType === "csv_import" ? "csv" : "table"),
        rawColumns: columns,
        rawLine: index + (hasHeader ? 2 : 1),
      },
    });
  });

  return {
    normalizedDeck: {
      title: deckName,
      sourceType,
      tags,
      items,
      metadataJson: { parser: "parseCsvToNormalizedImport" },
    },
    warnings,
    errors: items.length === 0 ? ["Keine gültigen Front/Back-Zeilen erkannt."] : [],
  };
}

export function parseJsonToNormalizedImport(jsonOrObject) {
  try {
    const payload = typeof jsonOrObject === "string" ? JSON.parse(jsonOrObject) : jsonOrObject;
    const normalized = normalizeImportDeck(payload, { sourceType: payload?.sourceType ?? "json_import" });
    return normalized;
  } catch (error) {
    return {
      normalizedDeck: {
        title: "JSON-Import",
        sourceType: "json_import",
        items: [],
        tags: [],
        metadataJson: {},
        mediaAssets: [],
      },
      warnings: [],
      errors: [`JSON konnte nicht gelesen werden: ${error.message}`],
    };
  }
}

function importParsedNormalizedDeck(parsed, options = {}) {
  const report = createEmptyReport({
    dryRun: Boolean(options.dryRun),
    sourceType: parsed.normalizedDeck?.sourceType ?? "mixed",
    targetDeckId: options.targetDeckId ?? null,
  });
  report.warnings.push(...(parsed.warnings ?? []));
  report.errors.push(...(parsed.errors ?? []));

  if (report.errors.length > 0) {
    return {
      deck: null,
      normalizedDeck: parsed.normalizedDeck,
      report: finalizeReport(report),
    };
  }

  const result = importNormalizedDeck(parsed.normalizedDeck, options);
  result.report.warnings.unshift(...(parsed.warnings ?? []));
  result.report.errors.unshift(...(parsed.errors ?? []));
  return result;
}

export function importTextAsNormalizedDeck(input = {}, options = {}) {
  return importParsedNormalizedDeck(parseTextToNormalizedImport(input), options);
}

export function importCsvAsNormalizedDeck(input = {}, options = {}) {
  return importParsedNormalizedDeck(parseCsvToNormalizedImport(input), options);
}

export function importJsonAsNormalizedDeck(jsonOrObject, options = {}) {
  return importParsedNormalizedDeck(parseJsonToNormalizedImport(jsonOrObject), options);
}

export function createTextImportDeck({ deckName = "Text-Import", text = "", tags = [] }) {
  const result = importTextAsNormalizedDeck({ deckName, text, tags }, { dryRun: false });
  return result.deck ?? createCoreDeck({
    name: deckName,
    source: "text-import",
    tags,
    cards: [],
    importMeta: {
      creationMethod: "text-import",
      detectedCards: 0,
      warnings: result.report.warnings,
      errors: result.report.errors,
    },
  });
}

export function createCsvImportDeck({ deckName = "CSV-Import", csv = "" }) {
  return createTableImportDeck({ deckName, table: csv, format: "csv" });
}

export function createTableImportDeck({ deckName = "Tabellen-Import", table = "", format = "spreadsheet" }) {
  const sourceType = format === "csv" ? "csv_import" : "csv_import";
  const result = importCsvAsNormalizedDeck({ deckName, csv: table, sourceType, format }, { dryRun: false });
  return result.deck ?? createCoreDeck({
    name: deckName,
    source: format === "csv" ? "csv-import" : "spreadsheet-import",
    cards: [],
    importMeta: {
      creationMethod: `${format}-import`,
      detectedCards: 0,
      warnings: result.report.warnings,
      errors: result.report.errors,
    },
  });
}
