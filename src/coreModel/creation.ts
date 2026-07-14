import { sanitizeCardHtml } from "../htmlSafety.ts";
import type { CardField, CardType, CardVariantType, Deck, DeckSource, DraftStatus, LearningItem, LearningItemSourceType, LearningItemStatus, SourceAnchor, TransformType, VariantGenerationSource, VariantQualityStatus } from "../coreTypes.ts";
import { CORE_CARD_TYPES, makeId, stableContentHash } from "./coreValues.ts";
import { createLearningItemState, createSourceAnchor, createSourceDocument, createVersionEntry, type SourceAnchorInput, type SourceDocument } from "./reviewState.ts";
import { createCardVariant, createCoreCard, getOriginalVariant, normalizeLearningItem } from "./learningItems.ts";
import { createCoreDeck, normalizeCoreDeck } from "./decks.ts";

type StringMap = Record<string, unknown>;
interface LearningItemOptions { id?: string; variantId?: string; title?: string; sourceType?: LearningItemSourceType; source?: DeckSource; sourceRefId?: string | null; sourceExternalId?: string | null; cardType?: CardType; meta?: StringMap; answerOptions?: unknown; expectedAnswer?: unknown; originalVariantId?: string; reverseVariantId?: string; sourceAnchors?: SourceAnchor[]; originalFields?: CardField[]; tags?: unknown; concepts?: string[]; mediaRefs?: string[]; draftStatus?: DraftStatus; status?: LearningItemStatus; learningItemState?: unknown; reviewState?: unknown; revision?: number; deletedAt?: string | null; updatedByDeviceId?: string | null; createdAt?: string; updatedAt?: string; variantType?: CardVariantType; variantLevel?: number; generationSource?: VariantGenerationSource; explanation?: string; hintsJson?: unknown; answerOptionsJson?: unknown; expectedAnswerJson?: unknown; transformType?: TransformType; qualityStatus?: VariantQualityStatus; isActive?: boolean; anchorVariantId?: string | null; parentVariantId?: string | null; modelRunId?: string | null; learningItem?: LearningItem; items?: LearningItem[]; deck?: Deck; }
interface NormalizedVariantInput extends LearningItemOptions { front?: string; back?: string; isOriginal?: boolean; }
interface NormalizedLearningItemInput extends LearningItemOptions { canonicalQuestion?: string; canonicalAnswer?: string; front?: string; back?: string; variants?: unknown; }
interface ClozePart { groupId: number; text: string; hint: string; }
interface ManualCardInput { cardType?: CardType; front?: string; back?: string; tags?: unknown; mediaRefs?: string[]; answerOptions?: unknown[]; correctAnswer?: unknown; expectedAnswer?: unknown; exactWordingRequired?: boolean; }
interface ManualDocumentContext { sourceAnchor?: SourceAnchorInput; selection?: string; textQuote?: string; documentId?: string | null; fileName?: string; targetField?: string; pageNumber?: number | null; charStart?: number | null; charEnd?: number | null; document?: SourceDocument | null; mimeType?: string; documentText?: string; }
interface ManualArtifactsInput { card?: ManualCardInput; documentContext?: ManualDocumentContext; createdAt?: string; }
interface AiDraftInput { cardType?: CardType; type?: CardType; front?: string; back?: string; tags?: string[]; sourceAnchors?: SourceAnchorInput[]; confidence?: number; warnings?: unknown[]; }
interface AiDraftDeckInput { deckName: string; config: unknown; drafts: AiDraftInput[]; sourceDocuments?: SourceDocument[]; }
interface ManualDeckInput { deckName: string; card: ManualCardInput; documentContext?: ManualDocumentContext; }
type CardContentPatch = Partial<Pick<LearningItem, "canonicalQuestion" | "canonicalAnswer" | "originalFront" | "originalBack" | "tags" | "originalTags" | "cardType" | "kind">> & { front?: string; back?: string };
function objectRecord(value: unknown): StringMap { return value !== null && typeof value === "object" ? value as StringMap : {}; }
function normalizeVariantType(variantType: unknown, fallbackCardType: unknown = "basic"): CardVariantType { const mapped: Partial<Record<CardType, CardVariantType>> = { "basic-reversed": "reverse", "image-occlusion": "image_occlusion", "multiple-choice": "mcq", "case-vignette": "case", "free-text": "custom", "multi-field": "custom" }; if (typeof variantType === "string" && ["basic", "reverse", "cloze", "mcq", "transfer", "case", "image_occlusion", "custom"].includes(variantType)) return variantType as CardVariantType; return mapped[fallbackCardType as CardType] ?? (typeof fallbackCardType === "string" && ["basic", "reverse", "cloze", "mcq", "transfer", "case", "image_occlusion", "custom"].includes(fallbackCardType) ? fallbackCardType as CardVariantType : "basic"); }
const CREATABLE_CARD_TYPES = new Set<CardType>(["basic", "basic-reversed", "cloze", "multiple-choice"]);
function normalizeCreatableCardType(cardType: unknown, fallback: CardType = "basic"): CardType { return typeof cardType === "string" && CREATABLE_CARD_TYPES.has(cardType as CardType) ? cardType as CardType : fallback; }
function legacySourceFromLearningSourceType(sourceType: LearningItemSourceType): DeckSource { if (sourceType === "anki_import") return "anki-apkg"; if (sourceType === "ai_generated") return "ai-assisted"; if (sourceType === "text_import") return "text-import"; if (sourceType === "csv_import") return "csv-import"; if (sourceType === "json_import") return "json-import"; return "manual"; }
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

function hasClozeSyntax(text: unknown): boolean {
  return /\{\{c\d+::[\s\S]+?\}\}/.test(String(text ?? ""));
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
): { createdItems: LearningItem[]; warnings: string[]; skipped: Array<{ index: number; reason: string }> } {
  const createdItems: LearningItem[] = [];
  const warnings: string[] = [];
  const skipped: Array<{ index: number; reason: string }> = [];

  if (!Array.isArray(normalizedItems)) {
    return {
      createdItems,
      warnings: ["normalizedItems muss ein Array sein."],
      skipped,
    };
  }

  normalizedItems.forEach((candidate, index) => {
    try {
      const input = objectRecord(candidate) as NormalizedLearningItemInput;
      const variants = normalizeNormalizedItemVariants(input.variants);
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

  return { createdItems, warnings, skipped };
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
  const answerOptions = Array.isArray(card.answerOptions)
    ? card.answerOptions.map((option) => String(option).trim()).filter(Boolean)
    : [];
  const requestedCardType = normalizeCreatableCardType(card.cardType ?? "basic");
  const cardType = requestedCardType === "cloze" && !hasClozeSyntax(card.front) ? "basic" : requestedCardType;
  const correctAnswer = String(card.correctAnswer ?? card.back ?? "").trim();
  const expectedAnswer = cardType === "multiple-choice" ? correctAnswer : String(card.expectedAnswer ?? card.back ?? "").trim();
  const itemOptions: LearningItemOptions = {
    sourceType: "manual",
    source: "manual",
    cardType,
    tags: card.tags,
    mediaRefs: card.mediaRefs,
    sourceAnchors: sourceAnchor ? [sourceAnchor] : [],
    answerOptions,
    expectedAnswer,
    createdAt,
    updatedAt: createdAt,
    originalFields: [
      { name: "Front", value: card.front ?? "" },
      { name: "Back", value: card.back ?? "" },
      { name: "Antwortoptionen", value: answerOptions.join("\n") },
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
      answerOptions,
      correctAnswer,
      expectedAnswer,
      exactWordingRequired: Boolean(card.exactWordingRequired),
    },
  };
  const coreCard =
    cardType === "basic-reversed"
      ? createBasicReverseLearningItem("", card.front ?? "", card.back ?? "", itemOptions)
      : cardType === "cloze"
        ? createClozeLearningItem("", card.front ?? "", card.back ?? "", itemOptions)
        : createBasicLearningItem("", card.front ?? "", card.back ?? "", itemOptions);

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

export function createAiDraftDeck({ deckName, config, drafts, sourceDocuments = [] }: AiDraftDeckInput): Deck {
  const createdAt = new Date().toISOString();
  const cards = drafts.map((draft) => {
    const cardType = (draft.cardType ?? draft.type) === "cloze" ? "cloze" : "basic";
    const sourceAnchors = (draft.sourceAnchors ?? []).map((anchor) =>
      createSourceAnchor({
        ...anchor,
        documentName: anchor.documentName ?? sourceDocuments[0]?.fileName ?? "",
        createdAt,
      }),
    );
    const options: LearningItemOptions = {
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
      ? createClozeLearningItem("", draft.front ?? "", draft.back ?? "", options)
      : createBasicLearningItem("", draft.front ?? "", draft.back ?? "", options);
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

export function acceptAiDraftDeck(deck: Deck): Deck {
  const acceptedAt = new Date().toISOString();
  return normalizeCoreDeck({
    ...deck,
    cardCount: deck.cards.length,
    updatedAt: acceptedAt,
    importMeta: {
      ...objectRecord(deck.importMeta),
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

export function updateCardContent(card: LearningItem, patch: CardContentPatch, reason = "Manuelle Bearbeitung"): LearningItem {
  const updatedAt = new Date().toISOString();
  const nextFront = patch.canonicalQuestion ?? patch.originalFront ?? patch.front ?? card.canonicalQuestion ?? card.originalFront;
  const nextBack = patch.canonicalAnswer ?? patch.originalBack ?? patch.back ?? card.canonicalAnswer ?? card.originalBack;
  const nextTags = patch.tags ?? patch.originalTags ?? card.tags ?? card.originalTags;
  const nextKind = patch.cardType ?? patch.kind ?? card.cardType ?? card.kind;
  const currentOriginal = (card.variants ?? []).find((variant) => variant.isOriginal) ?? null;
  const nextOriginalVariantType = normalizeVariantType(null, nextKind);
  const updated = createCoreCard({
    ...card,
    cardType: nextKind,
    canonicalQuestion: nextFront,
    canonicalAnswer: nextBack,
    originalFront: nextFront,
    originalBack: nextBack,
    originalTags: nextTags,
    tags: nextTags,
    originalFields: [
      { name: "Front", value: nextFront },
      { name: "Back", value: nextBack },
    ],
    variants: (card.variants ?? []).map((variant) =>
      variant === currentOriginal
        ? {
            ...variant,
            front: nextFront,
            back: nextBack,
            variantType: nextOriginalVariantType,
            updatedAt,
            meta: {
              ...(variant.meta ?? {}),
              cardType: nextKind,
            },
          }
        : variant,
    ),
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

export function restoreCardVersion(card: LearningItem, versionId: string): LearningItem {
  const version = (card.versionLog ?? []).find((entry) => entry.id === versionId);
  if (!version?.before) return card;

  const before = objectRecord(version.before);
  return updateCardContent(
    card,
    {
      originalFront: typeof before.originalFront === "string" ? before.originalFront : card.originalFront,
      originalBack: typeof before.originalBack === "string" ? before.originalBack : card.originalBack,
      originalTags: Array.isArray(before.originalTags) ? before.originalTags.map(String) : card.originalTags,
      kind: typeof before.kind === "string" && CORE_CARD_TYPES.includes(before.kind as CardType) ? before.kind as CardType : card.kind,
    },
    `Restore auf Version ${versionId}`,
  );
}
