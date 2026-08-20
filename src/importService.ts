import {
  CARD_VARIANT_TYPES,
  createCoreDeck,
  createLearningItemsFromNormalizedInput,
  normalizeCoreDeck,
  normalizeTags,
  stableContentHash,
} from "./coreModel.ts";
import { stripHtml } from "./htmlSafety.ts";

export const NORMALIZED_IMPORT_SOURCE_TYPES = ["manual", "text_import", "csv_import", "anki_import", "mixed"];
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
  anki_import: "anki-apkg",
  mixed: "manual",
};

function text(value: any, { normalizeText = true }: any = {}) {
  const trimmed = String(value ?? "").trim();
  return normalizeText ? trimmed.replace(/\s+/g, " ") : trimmed;
}
function metadata(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeSourceType(value: any, fallback: any = "mixed") {
  return NORMALIZED_IMPORT_SOURCE_TYPES.includes(value) ? value : fallback;
}

function normalizeVariantType(value: any) {
  const candidate = String(value ?? "basic").trim();
  const mapped = {
    "basic-reversed": "reverse",
    "image-occlusion": "image_occlusion",
    "single-choice": "mcq",
    "multiple-choice": "mcq",
    "case-vignette": "case",
  }[candidate] ?? candidate;

  return CARD_VARIANT_TYPES.includes(mapped as (typeof CARD_VARIANT_TYPES)[number]) ? mapped : "basic";
}

function normalizeStringList(values: any) {
  if (Array.isArray(values)) return values.map((value: any) => String(value ?? "").trim()).filter(Boolean);
  if (values === null || values === undefined || values === "") return [];
  return [String(values).trim()].filter(Boolean);
}

function createEmptyReport({ dryRun = false, sourceType = "mixed", targetDeckId = null }: any = {}): any {
  return {
    dryRun,
    createdDecks: 0,
    createdLearningItems: 0,
    createdCards: 0,
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
      skipped: 0,
      duplicates: 0,
      warnings: 0,
      errors: 0,
    },
  };
}

export function finalizeImportReport(report: any) {
  report.createdCards = report.createdLearningItems;
  report.summary = {
    ...report.summary,
    wouldCreateDecks: report.createdDecks,
    wouldCreateLearningItems: report.createdLearningItems,
    wouldCreateCards: report.createdCards,
    skipped: report.skipped.length,
    duplicates: report.duplicates.length,
    warnings: report.warnings.length,
    errors: report.errors.length,
  };
  return report;
}

function normalizeOptions(options: any = {}) {
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

function itemHasSchedulingData(item: any) {
  const meta = item?.metadataJson ?? item?.meta ?? {};
  return Boolean(item?.reviewState || item?.learningItemState || item?.scheduling || meta.scheduling || meta.reviewState || meta.learningItemState);
}

function normalizeNormalizedDeckShape(input: any = {}) {
  return {
    id: input.id ?? null,
    title: input.title ?? input.name ?? input.deckName ?? "Importierter Stapel",
    description: input.description ?? "",
    sourceType: input.sourceType ?? "mixed",
    sourceExternalId: input.sourceExternalId ?? input.externalId ?? null,
    parentDeckId: input.parentDeckId ?? null,
    hierarchyPath: input.hierarchyPath ?? null,
    originalDeckId: input.originalDeckId ?? null,
    tags: input.tags ?? [],
    metadataJson: input.metadataJson ?? input.meta ?? {},
    items: input.items ?? input.cards ?? [],
    mediaAssets: input.mediaAssets ?? input.media ?? [],
  };
}

function normalizeImportCard(input: any = {}, options: any = {}) {
  const warnings: any[] = [];
  const errors: any[] = [];
  const front = text(input.front ?? input.question ?? input.canonicalQuestion ?? "", options);
  const back = text(input.back ?? input.answer ?? input.canonicalAnswer ?? "", options);
  const cardType = normalizeVariantType(input.cardType ?? input.variantType);

  if (!front && !input.projection) errors.push("Karte ohne Vorderseite wurde abgelehnt.");
  if (!back && !input.projection) errors.push("Karte ohne Rückseite wurde abgelehnt.");

  return {
    card: {
      front,
      back,
      cardType,
      sourceExternalId: input.sourceExternalId ?? input.externalId ?? null,
      projection: input.projection && typeof input.projection === "object" ? input.projection : null,
      reviewState: input.reviewState,
      metadataJson: metadata(input.metadataJson ?? input.meta),
    },
    warnings,
    errors,
  };
}

function normalizeItemCards(input: any, canonicalQuestion: any, canonicalAnswer: any, options: any) {
  const warnings: any[] = [];
  const errors: any[] = [];
  const rawCards = Array.isArray(input.cards) ? input.cards : [];
  const cards: any[] = [];

  rawCards.forEach((candidate: any, index: any) => {
    const result = normalizeImportCard(candidate, options);
    warnings.push(...result.warnings.map((warning: any) => `Karte ${index + 1}: ${warning}`));
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((error: any) => `Karte ${index + 1}: ${error}`));
      return;
    }
    cards.push(result.card);
  });

  if (cards.length === 0 && (canonicalQuestion || canonicalAnswer)) cards.push({
    front: canonicalQuestion,
    back: canonicalAnswer,
    cardType: normalizeVariantType(input.cardType),
    sourceExternalId: input.sourceExternalId ?? null,
    projection: input.projection ?? null,
    metadataJson: metadata(input.metadataJson ?? input.meta),
  });
  return { cards, warnings, errors };
}

export function normalizeImportItem(input: any = {}, options: any = {}) {
  const warnings: any[] = [];
  const errors: any[] = [];
  const initialCanonicalQuestion = text(input.canonicalQuestion ?? input.question ?? input.front ?? "", options);
  const initialCanonicalAnswer = text(input.canonicalAnswer ?? input.answer ?? input.back ?? "", options);

  const sourceType = normalizeSourceType(input.sourceType ?? options.sourceType, options.sourceType ?? "mixed");
  const cardResult = normalizeItemCards(input, initialCanonicalQuestion, initialCanonicalAnswer, options);
  warnings.push(...cardResult.warnings);
  errors.push(...cardResult.errors);
  const firstCard = cardResult.cards[0] ?? null;
  const canonicalQuestion = initialCanonicalQuestion || firstCard?.front || "";
  const canonicalAnswer = initialCanonicalAnswer || firstCard?.back || "";

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
      cards: cardResult.cards,
      cardType: input.cardType ?? null,
      mediaRefs: normalizeStringList(input.mediaRefs),
      originalFields: Array.isArray(input.originalFields) ? input.originalFields.map((field: any) => ({ ...field })) : [],
      contentDocument: input.contentDocument && typeof input.contentDocument === "object" ? input.contentDocument : undefined,
      noteTypeDefinition: input.noteTypeDefinition && typeof input.noteTypeDefinition === "object" ? input.noteTypeDefinition : undefined,
      metadataJson: metadata(input.metadataJson ?? input.meta),
    },
    warnings,
    errors,
  };
}

export function normalizeImportDeck(input: any = {}, options: any = {}): any {
  const warnings: any[] = [];
  const errors: any[] = [];
  const deckInput = normalizeNormalizedDeckShape(input);
  const sourceType = normalizeSourceType(deckInput.sourceType ?? options.sourceType, options.sourceType ?? "mixed");
  const normalizedDeck: any = {
    id: deckInput.id ?? null,
    title: text(deckInput.title, options) || "Importierter Stapel",
    description: text(deckInput.description, options),
    sourceType,
    sourceExternalId: deckInput.sourceExternalId ?? null,
    parentDeckId: deckInput.parentDeckId ?? null,
    hierarchyPath: Array.isArray(deckInput.hierarchyPath) ? deckInput.hierarchyPath.map((part: any) => text(part, options)).filter(Boolean) : null,
    originalDeckId: deckInput.originalDeckId ?? deckInput.sourceExternalId ?? null,
    tags: normalizeTags(deckInput.tags),
    metadataJson: metadata(deckInput.metadataJson),
    items: [],
    mediaAssets: normalizeImportMediaAssets(deckInput.mediaAssets),
  };

  if (!Array.isArray(deckInput.items)) {
    errors.push("Importdeck benötigt ein items-Array.");
  } else {
    deckInput.items.forEach((candidate: any, index: any) => {
      const result = normalizeImportItem(candidate, {
        ...options,
        sourceType: candidate?.sourceType ?? sourceType,
        tags: candidate?.tags ?? normalizedDeck.tags,
      });
      warnings.push(...result.warnings.map((warning: any) => `Item ${index + 1}: ${warning}`));
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((error: any) => `Item ${index + 1}: ${error}`));
        return;
      }
      normalizedDeck.items.push(result.item);
    });
  }

  return { normalizedDeck, warnings, errors };
}

export function normalizeImportMediaAssets(mediaAssets: any = []) {
  if (!Array.isArray(mediaAssets)) return [];

  return mediaAssets
    .filter((asset: any) => asset && typeof asset === "object" && String(asset.filename ?? "").trim())
    .map((asset: any) => ({
      filename: String(asset.filename).trim(),
      mimeType: String(asset.mimeType ?? "application/octet-stream").trim(),
      sourceExternalId: asset.sourceExternalId ?? asset.externalId ?? null,
      storageRef: asset.storageRef ?? null,
      originalPath: asset.originalPath ?? asset.path ?? null,
      metadataJson: metadata(asset.metadataJson ?? asset.meta),
    }));
}

export function normalizeNormalizedImportPayload(input: any = {}, options: any = {}): any {
  const result = normalizeImportDeck(input, options);
  const report = createEmptyReport({
    dryRun: Boolean(options.dryRun),
    sourceType: result.normalizedDeck?.sourceType ?? normalizeSourceType(input?.sourceType, "mixed"),
    targetDeckId: options.targetDeckId ?? null,
  });

  report.warnings.push(...result.warnings);
  report.errors.push(...result.errors);
  return { ...result, report: finalizeImportReport(report) };
}

export function normalizeTextForFingerprint(value: any) {
  return stripHtml(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function createImportFingerprint(item: any = {}) {
  const cards = (item.cards ?? [])
    .map((card: any) => ({
      front: normalizeTextForFingerprint(card.front),
      back: normalizeTextForFingerprint(card.back),
      type: normalizeVariantType(card.cardType),
    }))
    .sort((left: any, right: any) => `${left.type}:${left.front}:${left.back}`.localeCompare(`${right.type}:${right.front}:${right.back}`));

  return stableContentHash(
    {
      question: normalizeTextForFingerprint(item.canonicalQuestion ?? item.originalFront ?? item.front),
      answer: normalizeTextForFingerprint(item.canonicalAnswer ?? item.originalBack ?? item.back),
      tags: normalizeTags(item.tags ?? item.originalTags).map((tag: any) => tag.toLowerCase()).sort(),
      cards,
    },
    "importfp",
  );
}

function asDeckList(existingDecksOrDeck: any) {
  if (Array.isArray(existingDecksOrDeck)) return existingDecksOrDeck;
  if (Array.isArray(existingDecksOrDeck?.decks)) return existingDecksOrDeck.decks;
  if (existingDecksOrDeck?.cards) return [existingDecksOrDeck];
  return [];
}

function getExistingSourceExternalIds(card: any) {
  const identity = card.meta?.ankiImportIdentityV1 ?? card.meta?.normalizedImport?.metadataJson?.ankiImportIdentityV1;
  return [
    card.sourceExternalId,
    card.sourceRefId,
    card.sourceCardId,
    card.meta?.sourceExternalId,
    card.meta?.normalizedImport?.sourceExternalId,
    card.meta?.import?.sourceExternalId,
    identity?.cardId,
  ].filter(Boolean).map(String);
}

export function createLearningItemDuplicateIndex(existingDecksOrDeck: any) {
  const bySourceExternalId = new Map<string, { deckId: string; card: any }>();
  const byFingerprint = new Map<string, { deckId: string; card: any }>();
  for (const deck of asDeckList(existingDecksOrDeck)) {
    for (const card of deck.cards ?? []) {
      const entry = { deckId: deck.id, card };
      for (const sourceExternalId of getExistingSourceExternalIds(card)) if (!bySourceExternalId.has(sourceExternalId)) bySourceExternalId.set(sourceExternalId, entry);
      const fingerprint = card.meta?.importFingerprint ?? createImportFingerprint(card);
      if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, entry);
    }
  }
  return { bySourceExternalId, byFingerprint };
}

export function findDuplicateLearningItem(existingDecksOrDeck: any, normalizedItem: any, existingIndex = createLearningItemDuplicateIndex(existingDecksOrDeck)) {
  const sourceExternalId = normalizedItem?.sourceExternalId ? String(normalizedItem.sourceExternalId) : null;
  const fingerprint = createImportFingerprint(normalizedItem);
  const sourceMatch = sourceExternalId ? existingIndex.bySourceExternalId.get(sourceExternalId) : null;
  if (sourceMatch) return { duplicate: true, reason: "sourceExternalId", deckId: sourceMatch.deckId, learningItemId: sourceMatch.card.id, fingerprint };
  const fingerprintMatch = existingIndex.byFingerprint.get(fingerprint);
  if (fingerprintMatch) return { duplicate: true, reason: "fingerprint", deckId: fingerprintMatch.deckId, learningItemId: fingerprintMatch.card.id, fingerprint };

  return { duplicate: false, fingerprint };
}

function toPipelineItem(item: any, options: any = {}) {
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
    cards: item.cards,
    cardType: item.cardType ?? undefined,
    mediaRefs: item.mediaRefs ?? [],
    originalFields: item.originalFields ?? [],
    contentDocument: item.contentDocument,
    noteTypeDefinition: item.noteTypeDefinition,
    meta: {
      ...(item.metadataJson ?? {}),
      importFingerprint,
      normalizedImport: {
        sourceType: item.sourceType,
        sourceExternalId: item.sourceExternalId ?? null,
        metadataJson: item.metadataJson,
      },
    },
  };
}

function previewItem(item: any, duplicateInfo: any = null) {
  return {
    title: item.title,
    canonicalQuestion: item.canonicalQuestion,
    canonicalAnswer: item.canonicalAnswer,
    tags: item.tags,
    sourceType: item.sourceType,
    sourceExternalId: item.sourceExternalId,
    cardCount: (item.cards ?? []).length,
    duplicate: duplicateInfo?.duplicate ?? false,
    duplicateReason: duplicateInfo?.reason ?? null,
  };
}

function deckSourceFor(sourceType: any, fallback: any = null) {
  return fallback ?? (DECK_SOURCE_BY_IMPORT_SOURCE as Record<string, string>)[sourceType] ?? "manual";
}

export function importNormalizedDeck(input: any = {}, options: any = {}): any {
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
    normalizedDeck.items.forEach((item: any, index: any) => {
      if (itemHasSchedulingData(item)) {
        report.warnings.push(`Item ${index + 1}: Scheduling-Daten wurden erkannt, aber in diesem Schritt nicht übernommen.`);
      }
    });
  }

  const targetDeck = normalizedOptions.targetDeckId
    ? normalizedOptions.existingDecks.find((deck: any) => deck.id === normalizedOptions.targetDeckId) ?? null
    : null;
  const duplicateScope = targetDeck ?? normalizedOptions.existingDecks;
  const duplicateIndex = createLearningItemDuplicateIndex(duplicateScope);
  const importableItems: any[] = [];
  const seenImportFingerprints = new Map();

  normalizedDeck.items.forEach((item: any, index: any) => {
    const duplicateInfo = findDuplicateLearningItem(duplicateScope, item, duplicateIndex);
    const itemFingerprint = duplicateInfo.fingerprint ?? createImportFingerprint(item);
    if (!duplicateInfo.duplicate && seenImportFingerprints.has(itemFingerprint)) {
      duplicateInfo.duplicate = true;
      duplicateInfo.reason = "payload_fingerprint";
      duplicateInfo.learningItemId = undefined;
      duplicateInfo.deckId = undefined;
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
        report.warnings.push("mergeStrategy update_existing ist im lokalen MVP noch nicht vollständig implementiert; bestehende Karten wurden nicht überschrieben.");
        report.skipped.push({ index, reason: "update_existing_not_implemented", duplicate });
        report.previewItems.push(previewItem(item, duplicateInfo));
        return;
      }

      report.warnings.push(`Item ${index + 1}: mögliche Dublette erkannt, wegen create_new trotzdem importiert.`);
    }

    importableItems.push(item);
    seenImportFingerprints.set(itemFingerprint, index);
    report.previewItems.push(previewItem(item, duplicateInfo));
  });

  report.createdDecks = targetDeck ? 0 : 1;
  report.createdLearningItems = importableItems.length;

  if (normalizedOptions.dryRun || report.errors.length > 0) {
    return {
      deck: null,
      normalizedDeck,
      report: finalizeImportReport(report),
    };
  }

  const deckId = targetDeck?.id ?? normalizedOptions.targetDeckId ?? "";
  const creation = createLearningItemsFromNormalizedInput(
    deckId,
    importableItems.map((item: any) => toPipelineItem(item, normalizedOptions)),
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
  report.skipped.push(...creation.skipped.map((item: any) => ({ ...item, reason: item.reason ?? "creation_pipeline_skipped" })));

  const createdItems = creation.createdItems;
  report.createdLearningItems = createdItems.length;
  report.createdDecks = targetDeck ? 0 : 1;

  const importMeta = {
    creationMethod: "normalized-import",
    sourceType: normalizedDeck.sourceType,
    sourceExternalId: normalizedDeck.sourceExternalId ?? null,
    detectedCards: normalizedDeck.items.length,
    importedCards: createdItems.length,
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
    commitGraph: {
      decks: [deck],
      noteTypeDefinitions: creation.definitions,
    },
    normalizedDeck,
    report: finalizeImportReport(report),
  };
}
