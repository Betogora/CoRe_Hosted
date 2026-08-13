import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import type { CardContentPayload, CardEditorValue, CardField, CardType, CardVariantType, Deck, DeckSource, DraftStatus, ForeignNoteSnapshot, LearningItem, LearningItemDocumentV1, LearningItemSourceType, LearningItemStatus, NoteTypeDefinitionV1, SourceAnchor, TransformType, VariantGenerationSource, VariantQualityStatus, VersionEntry } from "../coreTypes.ts";
import { makeId, stableContentHash } from "./coreValues.ts";
import { createLearningItemState, createSourceAnchor, createSourceDocument, createVersionEntry, type SourceAnchorInput, type SourceDocument } from "./reviewState.ts";
import { createCardVariant, createCoreCard, getOriginalVariant, normalizeLearningItem } from "./learningItems.ts";
import { createCoreDeck } from "./decks.ts";
import { assertValidCardEditorValue, getCardContentPayload, getCardEditorValue, projectCardEditorContent, saveCardEditorValue, validateCardContentPayload } from "./cardEditor.ts";
import { applyLearningItemContent, createCoreNoteTypeDefinition } from "./learningItemContent.ts";

type StringMap = Record<string, unknown>;
interface LearningItemOptions { id?: string; variantId?: string; title?: string; sourceType?: LearningItemSourceType; source?: DeckSource; sourceRefId?: string | null; sourceExternalId?: string | null; cardType?: CardType; meta?: StringMap; answerOptions?: unknown; expectedAnswer?: unknown; originalVariantId?: string; reverseVariantId?: string; sourceAnchors?: SourceAnchor[]; originalFields?: CardField[]; tags?: unknown; concepts?: string[]; mediaRefs?: string[]; draftStatus?: DraftStatus; status?: LearningItemStatus; learningItemState?: unknown; reviewState?: unknown; revision?: number; deletedAt?: string | null; updatedByDeviceId?: string | null; createdAt?: string; updatedAt?: string; variantType?: CardVariantType; variantLevel?: number; generationSource?: VariantGenerationSource; explanation?: string; hintsJson?: unknown; answerOptionsJson?: unknown; expectedAnswerJson?: unknown; transformType?: TransformType; qualityStatus?: VariantQualityStatus; isActive?: boolean; anchorVariantId?: string | null; parentVariantId?: string | null; modelRunId?: string | null; learningItem?: LearningItem; items?: LearningItem[]; deck?: Deck; }
interface NormalizedVariantInput extends LearningItemOptions { front?: string; back?: string; isOriginal?: boolean; }
interface NormalizedLearningItemInput extends LearningItemOptions { canonicalQuestion?: string; canonicalAnswer?: string; front?: string; back?: string; variants?: unknown; contentDocument?: LearningItemDocumentV1; noteTypeDefinition?: NoteTypeDefinitionV1; sourceSnapshot?: ForeignNoteSnapshot; }
interface ClozePart { groupId: number; text: string; hint: string; }
interface ManualCardInput { editorValue?: CardEditorValue; cardType?: CardType; front?: string; back?: string; tags?: unknown; mediaRefs?: string[]; answerOptions?: unknown[]; correctAnswer?: unknown; expectedAnswer?: unknown; exactWordingRequired?: boolean; contentDocument?: LearningItemDocumentV1; noteTypeDefinition?: NoteTypeDefinitionV1; }
interface ManualDocumentContext { sourceAnchor?: SourceAnchorInput; selection?: string; textQuote?: string; documentId?: string | null; fileName?: string; targetField?: string; pageNumber?: number | null; charStart?: number | null; charEnd?: number | null; document?: SourceDocument | null; mimeType?: string; documentText?: string; }
interface ManualArtifactsInput { card?: ManualCardInput; documentContext?: ManualDocumentContext; createdAt?: string; }
interface ManualDeckInput { deckName: string; card: ManualCardInput; documentContext?: ManualDocumentContext; }
function objectRecord(value: unknown): StringMap { return value !== null && typeof value === "object" ? value as StringMap : {}; }
function normalizeVariantType(variantType: unknown, fallbackCardType: unknown = "basic"): CardVariantType { const mapped: Partial<Record<CardType, CardVariantType>> = { "basic-reversed": "reverse", "image-occlusion": "image_occlusion", "multiple-choice": "mcq", "case-vignette": "case", "free-text": "custom", "multi-field": "custom" }; if (typeof variantType === "string" && ["basic", "reverse", "cloze", "mcq", "transfer", "case", "image_occlusion", "custom"].includes(variantType)) return variantType as CardVariantType; return mapped[fallbackCardType as CardType] ?? (typeof fallbackCardType === "string" && ["basic", "reverse", "cloze", "mcq", "transfer", "case", "image_occlusion", "custom"].includes(fallbackCardType) ? fallbackCardType as CardVariantType : "basic"); }
const CREATABLE_CARD_TYPES = new Set<CardType>(["basic", "basic-with-images", "basic-reversed", "cloze", "multiple-choice"]);
function normalizeCreatableCardType(cardType: unknown, fallback: CardType = "basic"): CardType { return typeof cardType === "string" && CREATABLE_CARD_TYPES.has(cardType as CardType) ? cardType as CardType : fallback; }
function legacySourceFromLearningSourceType(sourceType: LearningItemSourceType): DeckSource { if (sourceType === "anki_import") return "anki-apkg"; if (sourceType === "text_import") return "text-import"; if (sourceType === "csv_import") return "csv-import"; if (sourceType === "json_import") return "json-import"; return "manual"; }
function resolveLegacySource(sourceType: LearningItemSourceType, source?: DeckSource): DeckSource {
  return source ?? legacySourceFromLearningSourceType(sourceType);
}

function normalizeExtraText(extra: unknown): string {
  if (typeof extra === "string") return extra;
  const value = objectRecord(extra);
  return String(value.explanation ?? value.back ?? value.answer ?? "");
}

function revealClozeText(text: unknown): string {
  return String(text ?? "").replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1");
}

function extractClozeGroups(text: unknown): Array<{ groupId: number; clozes: ClozePart[] }> {
  const groups = new Map<number, ClozePart[]>();
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
    .sort(([left]: any, [right]: any) => left - right)
    .map(([groupId, clozes]: any) => ({ groupId, clozes }));
}

function renderClozeFront(text: unknown, groupId: number): string {
  return String(text ?? "").replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_match: string, candidateGroup: string, value: string, hint: string | undefined) => {
    if (Number(candidateGroup) !== groupId) return value;
    return hint ? `[...] (${hint})` : "[...]";
  });
}

function normalizeNormalizedItemVariants(variants: unknown): NormalizedVariantInput[] {
  return Array.isArray(variants)
    ? variants.map((variant) => objectRecord(variant) as NormalizedVariantInput)
      .filter((variant) => String(variant.front ?? "").trim() || String(variant.back ?? "").trim())
    : [];
}

function resolveLearningItemRef(learningItemOrId: unknown, options: LearningItemOptions = {}): LearningItem | null {
  if (learningItemOrId && typeof learningItemOrId === "object") return learningItemOrId as LearningItem;

  const id = String(learningItemOrId ?? "");
  if (!id) return null;
  if (options.learningItem?.id === id) return options.learningItem;
  if (Array.isArray(options.items)) return options.items.find((item) => item.id === id) ?? null;
  if (Array.isArray(options.deck?.cards)) return options.deck.cards.find((item) => item.id === id) ?? null;
  return null;
}

export function createBasicLearningItem(deckId: string, front: string, back: string, options: LearningItemOptions = {}): LearningItem {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const id = options.id ?? makeId("card");
  const sourceType = options.sourceType ?? "manual";
  const source = resolveLegacySource(sourceType, options.source);
  const cardType = normalizeCreatableCardType(options.cardType ?? "basic");
  const normalizedFront = sanitizeCardHtml(front);
  const normalizedBack = sanitizeCardHtml(back);
  const meta = options.meta ?? {};
  const answerOptions = options.answerOptions ?? meta.answerOptions ?? null;
  const expectedAnswer = options.expectedAnswer ?? meta.correctAnswer ?? meta.expectedAnswer ?? null;
  const originalVariant = createCardVariant({
    id: options.originalVariantId ?? stableContentHash({ learningItemId: id, front: normalizedFront, back: normalizedBack, isOriginal: true }, "variant"),
    learningItemId: id,
    cardId: id,
    sourceCardId: id,
    variantType: cardType === "multiple-choice" ? normalizeVariantType(null, cardType) : "basic",
    variantLevel: 1,
    front: normalizedFront,
    back: normalizedBack,
    explanation: options.explanation ?? "",
    hintsJson: options.hintsJson ?? null,
    answerOptionsJson: answerOptions,
    expectedAnswerJson: expectedAnswer,
    generationSource: "original",
    transformType: "original",
    qualityStatus: "active",
    isOriginal: true,
    isActive: true,
    sourceAnchors: options.sourceAnchors ?? [],
    createdAt,
    updatedAt,
    meta: {
      cardType,
      sourceType,
    },
  });

  return normalizeLearningItem({
    id,
    deckId,
    title: options.title ?? "",
    cardType,
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
    revision: options.revision ?? 1,
    deletedAt: options.deletedAt ?? null,
    updatedByDeviceId: options.updatedByDeviceId ?? null,
    meta,
  });
}

export function createBasicReverseLearningItem(deckId: string, front: string, back: string, options: LearningItemOptions = {}): LearningItem {
  const item = createBasicLearningItem(deckId, front, back, {
    ...options,
    cardType: "basic-reversed",
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
    variants: [...item.variants, reverseVariant],
    updatedAt: options.updatedAt ?? new Date().toISOString(),
  });
}

export function createClozeLearningItem(deckId: string, textWithClozes: string, extra: unknown = "", options: LearningItemOptions = {}): LearningItem {
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
  const clozeVariants = extractClozeGroups(textWithClozes).map(({ groupId, clozes }: any) =>
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
      hintsJson: clozes.map((cloze: { hint?: string }) => cloze.hint).filter(Boolean),
      expectedAnswerJson: clozes.map((cloze: { text: string }) => cloze.text),
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
    revision: options.revision ?? 1,
    deletedAt: options.deletedAt ?? null,
    updatedByDeviceId: options.updatedByDeviceId ?? null,
    meta: {
      ...(options.meta ?? {}),
      clozeGroupCount: clozeVariants.length,
    },
  });
}

export function createLearningItemFromEditorValue(deckId: string, editorInput: unknown, options: LearningItemOptions = {}): LearningItem {
  const value = assertValidCardEditorValue(editorInput);
  const content = projectCardEditorContent(value);
  const commonOptions: LearningItemOptions = {
    ...options,
    cardType: value.cardType,
    tags: value.tags,
    expectedAnswer: options.expectedAnswer ?? content.back,
  };

  switch (value.cardType) {
    case "basic":
    case "basic-with-images":
      return createBasicLearningItem(deckId, value.front, value.back, commonOptions);
    case "basic-reversed":
      return createBasicReverseLearningItem(deckId, value.front, value.back, commonOptions);
    case "cloze":
      return createClozeLearningItem(deckId, value.textWithClozes, value.extra, commonOptions);
    case "multiple-choice":
      return createBasicLearningItem(deckId, content.front, content.back, {
        ...commonOptions,
        answerOptions: content.answerOptions,
        expectedAnswer: content.correctAnswer,
        explanation: content.explanation,
        originalFields: [
          { name: "Frage", value: content.front },
          { name: "Antwortoptionen", value: value.options.join("\n") },
          { name: "Richtige Antwort", value: content.correctAnswer ?? "" },
          { name: "Erklärung", value: content.explanation },
        ].filter((field) => field.value),
        meta: {
          ...(options.meta ?? {}),
          answerOptions: content.answerOptions,
          correctAnswer: content.correctAnswer,
          expectedAnswer: content.correctAnswer,
          explanation: content.explanation,
        },
      });
  }
}

export function createLearningItemFromCardContentPayload(deckId: string, payloadInput: unknown): LearningItem {
  const validation = validateCardContentPayload(payloadInput);
  if (!validation.ok) throw new Error(validation.error);
  return createLearningItemFromEditorValue(deckId, validation.value.editorValue, {
    sourceType: "manual",
    source: "manual",
    mediaRefs: validation.value.mediaRefs,
  });
}

function appendCopyMarker(html: string): string {
  if (stripHtml(html).trim().endsWith("(Kopie)")) return html;
  return sanitizeCardHtml(`${html}<p>(Kopie)</p>`);
}

function copyMarkedPayload(payload: CardContentPayload): CardContentPayload {
  const value = payload.editorValue;
  const editorValue: CardEditorValue = value.cardType === "multiple-choice"
    ? { ...value, question: appendCopyMarker(value.question), options: [...value.options], tags: [...value.tags] }
    : value.cardType === "cloze"
      ? { ...value, textWithClozes: appendCopyMarker(value.textWithClozes), tags: [...value.tags] }
      : { ...value, front: appendCopyMarker(value.front), tags: [...value.tags] };
  return { editorValue, mediaRefs: [...payload.mediaRefs] };
}

export function duplicateLearningItemContent(card: LearningItem): LearningItem | null {
  const payload = getCardContentPayload(card);
  return payload ? createLearningItemFromCardContentPayload(card.deckId, copyMarkedPayload(payload)) : null;
}

export function addRephrasedVariant(learningItemOrId: unknown, front: string, back: string, options: LearningItemOptions = {}): LearningItem {
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
    variants: [...item.variants, variant],
    updatedAt,
  });
}

export function createLearningItemsFromNormalizedInput(
  deckId: string,
  normalizedItems: unknown = [],
  options: LearningItemOptions = {},
): {
  createdItems: LearningItem[];
  definitions: NoteTypeDefinitionV1[];
  sourceSnapshots: ForeignNoteSnapshot[];
  warnings: string[];
  skipped: Array<{ index: number; reason: string }>;
} {
  const createdItems: LearningItem[] = [];
  const definitions = new Map<string, NoteTypeDefinitionV1>();
  const sourceSnapshots = new Map<string, ForeignNoteSnapshot>();
  const warnings: string[] = [];
  const skipped: Array<{ index: number; reason: string }> = [];

  if (!Array.isArray(normalizedItems)) {
    return {
      createdItems,
      warnings: ["normalizedItems muss ein Array sein."],
      skipped,
      definitions: [],
      sourceSnapshots: [],
    };
  }

  normalizedItems.forEach((candidate, index) => {
    try {
      const input = objectRecord(candidate) as NormalizedLearningItemInput;
      const variants = normalizeNormalizedItemVariants(input.variants);
      if (input.contentDocument && input.noteTypeDefinition) {
        const applied = applyLearningItemContent({
          previous: null,
          document: input.contentDocument,
          definition: input.noteTypeDefinition,
          sourceSnapshot: input.sourceSnapshot ?? null,
          reason: input.sourceType === "anki_import" ? "import" : "create",
        });
        definitions.set(applied.definition.id, applied.definition);
        if (applied.sourceSnapshot) sourceSnapshots.set(applied.sourceSnapshot.id, applied.sourceSnapshot);
        const sourceByProjection = new Map(variants
          .filter((variant: any) => variant.projection)
          .map((variant: any) => [JSON.stringify(variant.projection), variant]));
        const appliedByProjection = new Map(applied.item.variants.map((variant) => [JSON.stringify(variant.projection), variant]));
        const baseImageOcclusionVariant = applied.item.variants.find((variant) => variant.projection.kind === "image-occlusion") ?? null;
        const enrichedVariants = sourceByProjection.size
          ? variants.flatMap((sourceVariant: NormalizedVariantInput & { metadataJson?: Record<string, unknown>; projection?: any }, variantIndex) => {
              const projectionKey = JSON.stringify(sourceVariant.projection);
              const exactVariant = appliedByProjection.get(projectionKey);
              const variant = exactVariant ?? (sourceVariant.projection?.kind === "image-occlusion" ? baseImageOcclusionVariant : null);
              if (!variant) return [];
              return [{
                ...variant,
                ...(!exactVariant ? {
                  id: stableContentHash({ learningItemId: applied.item.id, projection: sourceVariant.projection }, "variant"),
                  projection: sourceVariant.projection,
                } : {}),
                front: sourceVariant.front ?? variant.front,
                back: sourceVariant.back ?? variant.back,
                variantType: sourceVariant.variantType ?? variant.variantType,
                variantLevel: sourceVariant.variantLevel ?? variant.variantLevel,
                isOriginal: variantIndex === 0,
                generationSource: variantIndex === 0 ? "original" : sourceVariant.generationSource ?? "imported",
                meta: {
                  ...variant.meta,
                  ...(sourceVariant.meta ?? sourceVariant.metadataJson ?? {}),
                  sourceExternalId: sourceVariant.sourceExternalId ?? null,
                },
              }];
            })
          : applied.item.variants.map((variant, variantIndex) => {
              const sourceVariant = variants[variantIndex] as (NormalizedVariantInput & { metadataJson?: Record<string, unknown> }) | undefined;
              return {
                ...variant,
                meta: {
                  ...variant.meta,
                  ...(sourceVariant?.meta ?? sourceVariant?.metadataJson ?? {}),
                  sourceExternalId: sourceVariant?.sourceExternalId ?? null,
                },
              };
            });
        const anchoredVariants = enrichedVariants.map((variant, variantIndex) => ({
          ...variant,
          isOriginal: variantIndex === 0,
          parentVariantId: variantIndex === 0 ? null : enrichedVariants[0]?.id ?? null,
          anchorVariantId: variantIndex === 0 ? null : enrichedVariants[0]?.id ?? null,
        }));
        createdItems.push(normalizeLearningItem({
          ...applied.item,
          deckId,
          title: input.title ?? applied.item.title,
          source: input.source ?? (input.sourceType === "anki_import" ? "anki-apkg" : applied.item.source),
          sourceType: input.sourceType ?? applied.item.sourceType,
          sourceRefId: input.sourceRefId ?? input.sourceExternalId ?? applied.item.sourceRefId,
          sourceAnchors: input.sourceAnchors ?? applied.item.sourceAnchors,
          variants: anchoredVariants,
          meta: {
            ...(input.meta ?? {}),
            ...applied.item.meta,
            importFingerprint: input.meta?.importFingerprint ?? null,
          },
        }));
        return;
      }
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
        cardType: normalizeCreatableCardType(input.cardType ?? options.cardType),
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
      const normalizedCardType = commonOptions.cardType;
      const isCloze = normalizedCardType === "cloze" || /\{\{c\d+::/.test(String(canonicalQuestion));
      let item = isCloze && variants.length === 0
        ? createClozeLearningItem(deckId, anchorQuestion, anchorAnswer, commonOptions)
        : createBasicLearningItem(deckId, anchorQuestion, anchorAnswer, {
            ...commonOptions,
            cardType: normalizedCardType,
          });
      item = normalizeLearningItem({
        ...item,
        canonicalQuestion,
        canonicalAnswer,
      });
      const createdOriginalVariant = getOriginalVariant(item);
      if (createdOriginalVariant && originalInput) {
        item = normalizeLearningItem({
          ...item,
          variants: item.variants.map((variant) =>
            variant.id === createdOriginalVariant.id
              ? {
                  ...variant,
                  variantType: originalInput.variantType ?? variant.variantType,
                  variantLevel: originalInput.variantLevel ?? variant.variantLevel,
                  meta: {
                    ...(variant.meta ?? {}),
                    ...(originalInput.meta ?? {}),
                    normalizedInputIndex: index,
                    sourceVariantId: originalInput.id ?? null,
                    sourceVariantExternalId: originalInput.sourceExternalId ?? null,
                  },
                }
              : variant,
          ),
        });
      }
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
      const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
      skipped.push({ index, reason: message });
      warnings.push(`Item ${index + 1} wurde übersprungen: ${message}`);
    }
  });

  return { createdItems, definitions: [...definitions.values()], sourceSnapshots: [...sourceSnapshots.values()], warnings, skipped };
}

function createManualCardArtifacts(
  { card = {}, documentContext = {}, createdAt = new Date().toISOString() }: ManualArtifactsInput = {},
): { coreCard: LearningItem; sourceDocument: SourceDocument | null; sourceAnchor: SourceAnchor | null } {
  const sourceAnchor =
    documentContext?.sourceAnchor
      ? createSourceAnchor({ ...documentContext.sourceAnchor, createdAt: documentContext.sourceAnchor.createdAt ?? createdAt })
      : documentContext?.selection || documentContext?.textQuote
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
  const answerOptions = Array.isArray(card.answerOptions) ? card.answerOptions.map((option) => String(option).trim()) : [];
  const requestedCardType = normalizeCreatableCardType(card.cardType ?? "basic");
  const correctAnswer = String(card.correctAnswer ?? answerOptions[0] ?? card.back ?? "").trim();
  const editorValue = card.editorValue ?? (requestedCardType === "cloze"
    ? { cardType: "cloze", textWithClozes: card.front ?? "", extra: card.back ?? "", tags: card.tags }
    : requestedCardType === "multiple-choice"
      ? { cardType: "multiple-choice", question: card.front ?? "", options: answerOptions, correctOptionIndex: answerOptions.indexOf(correctAnswer), explanation: card.back ?? "", tags: card.tags }
      : { cardType: requestedCardType, front: card.front ?? "", back: card.back ?? "", tags: card.tags });
  const validatedEditorValue = assertValidCardEditorValue(editorValue);
  const itemOptions: LearningItemOptions = {
    sourceType: "manual",
    source: "manual",
    cardType: validatedEditorValue.cardType,
    tags: validatedEditorValue.tags,
    mediaRefs: card.mediaRefs,
    sourceAnchors: sourceAnchor ? [sourceAnchor] : [],
    createdAt,
    updatedAt: createdAt,
    meta: {
      documentContext: documentContext
        ? {
            fileName: documentContext.fileName,
            pageNumber: documentContext.pageNumber ?? null,
            selection: documentContext.selection ?? "",
          }
        : null,
      exactWordingRequired: Boolean(card.exactWordingRequired),
    },
  };
  const coreCard = card.contentDocument && card.noteTypeDefinition
    ? applyLearningItemContent({
        previous: null,
        base: {
          deckId: "",
          cardType: validatedEditorValue.cardType,
          source: "manual",
          sourceType: "manual",
          sourceAnchors: itemOptions.sourceAnchors,
          createdAt,
          updatedAt: createdAt,
          meta: itemOptions.meta,
        },
        document: card.contentDocument,
        definition: card.noteTypeDefinition,
        reason: "create",
      }).item
    : createLearningItemFromEditorValue("", validatedEditorValue, itemOptions);

  return { coreCard, sourceDocument, sourceAnchor };
}

export function createManualCoreDeck({ deckName, card, documentContext }: ManualDeckInput): Deck {
  const createdAt = new Date().toISOString();
  const { coreCard, sourceDocument, sourceAnchor } = createManualCardArtifacts({ card, documentContext, createdAt });

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

export function restoreCardVersion(card: LearningItem, versionId: string, storedDefinition?: NoteTypeDefinitionV1): LearningItem {
  const version = (card.versionLog ?? []).find((entry) => entry.id === versionId);
  if (!version?.before) return card;

  const before = objectRecord(version.before);
  let restored: LearningItem;
  if (before.schemaVersion === 1 && Array.isArray(before.fields)) {
    const document = before as unknown as LearningItemDocumentV1;
    const definition = storedDefinition ?? createCoreNoteTypeDefinition({
      document,
      kind: card.cardType === "cloze" ? "cloze" : "normal",
      interaction: card.cardType === "multiple-choice" ? "choice" : card.cardType === "cloze" ? "cloze" : "reveal",
      reverse: card.cardType === "basic-reversed",
      createdAt: card.createdAt,
    });
    restored = applyLearningItemContent({ previous: card, document, definition, reason: "edit" }).item;
  } else if (before.editorValue) {
    restored = saveCardEditorValue(card, before.editorValue, storedDefinition);
  } else {
    const current = getCardEditorValue(card);
    if (!current) return card;
    const tags = Array.isArray(before.originalTags) ? before.originalTags.map(String) : current.tags;
    const front = typeof before.originalFront === "string" ? before.originalFront : card.originalFront;
    const back = typeof before.originalBack === "string" ? before.originalBack : card.originalBack;
    const editorValue: CardEditorValue = current.cardType === "cloze"
      ? { ...current, textWithClozes: front, extra: back, tags }
      : current.cardType === "multiple-choice"
        ? { ...current, question: front, explanation: back, tags }
        : { ...current, front, back, tags };
    restored = saveCardEditorValue(card, editorValue, storedDefinition);
  }
  const restoreEntry = restored.versionLog.at(-1);

  return {
    ...restored,
    versionLog: [
      ...restored.versionLog.slice(0, -1),
      restoreEntry ? { ...restoreEntry, changeType: "version_restored" } : restoreEntry,
    ].filter((entry): entry is VersionEntry => Boolean(entry)),
  };
}
