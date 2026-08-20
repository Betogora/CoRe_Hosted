import { findChoiceAnswerIndices, normalizeChoiceAnswerList } from "../choiceAnswers.ts";
import { sanitizeCardHtml, stripHtml } from "../htmlSafety.ts";
import type {
  CardContentPayload,
  CardEditorValue,
  CardField,
  CardType,
  Deck,
  DeckSource,
  DraftStatus,
  LearningItem,
  LearningItemDocumentV1,
  LearningItemSourceType,
  LearningItemStatus,
  NoteTypeDefinitionV1,
  ReviewState,
  VariantProjection,
  VariantQualityStatus,
} from "../coreTypes.ts";
import { assertValidCardEditorValue, getCardContentPayload, projectCardEditorContent, validateCardContentPayload } from "./cardEditor.ts";
import { createCoreDeck } from "./decks.ts";
import { applyLearningItemContent, projectLearningItemContent } from "./learningItemContent.ts";
import { createLearningItemDocumentFromLegacy } from "./learningItemDocument.ts";
import { createCardVariant, createCoreCard, normalizeLearningItem } from "./learningItems.ts";
import { createReviewState } from "./reviewState.ts";
import { makeId, stableContentHash } from "./coreValues.ts";

type StringMap = Record<string, unknown>;

interface LearningItemOptions {
  id?: string;
  title?: string;
  sourceType?: LearningItemSourceType;
  source?: DeckSource;
  sourceRefId?: string | null;
  sourceExternalId?: string | null;
  sourceCardId?: string | null;
  cardType?: CardType;
  projection?: VariantProjection;
  meta?: StringMap;
  answerOptions?: unknown;
  expectedAnswer?: unknown;
  originalFields?: CardField[];
  tags?: unknown;
  concepts?: string[];
  mediaRefs?: string[];
  draftStatus?: DraftStatus;
  status?: LearningItemStatus;
  reviewState?: Partial<ReviewState>;
  revision?: number;
  deletedAt?: string | null;
  updatedByDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  variantId?: string;
  variantLevel?: number;
  explanation?: string;
  transformProfile?: Record<string, unknown>;
  qualityStatus?: VariantQualityStatus;
  isActive?: boolean;
  modelRunId?: string | null;
  confidence?: number;
  semanticDelta?: string;
  changedRecognitionCues?: string[];
  learningItem?: LearningItem;
  items?: LearningItem[];
  deck?: Deck;
}

interface NormalizedCardInput extends LearningItemOptions {
  front?: string;
  back?: string;
  projection?: VariantProjection;
  metadataJson?: StringMap;
}

interface NormalizedLearningItemInput extends LearningItemOptions {
  canonicalQuestion?: string;
  canonicalAnswer?: string;
  front?: string;
  back?: string;
  cards?: unknown;
  contentDocument?: LearningItemDocumentV1;
  noteTypeDefinition?: NoteTypeDefinitionV1;
}

interface ManualCardInput {
  editorValue?: CardEditorValue;
  cardType?: CardType;
  front?: string;
  back?: string;
  tags?: unknown;
  mediaRefs?: string[];
  answerOptions?: unknown[];
  correctAnswer?: unknown;
  correctAnswers?: unknown[];
  expectedAnswer?: unknown;
  exactWordingRequired?: boolean;
  contentDocument?: LearningItemDocumentV1;
  noteTypeDefinition?: NoteTypeDefinitionV1;
}

interface ManualDocumentContext {
  selection?: string;
  textQuote?: string;
  fileName?: string;
  documentText?: string;
}

interface ManualDeckInput {
  deckName: string;
  card: ManualCardInput;
  documentContext?: ManualDocumentContext;
}

function objectRecord(value: unknown): StringMap {
  return value !== null && typeof value === "object" ? value as StringMap : {};
}

const CREATABLE_CARD_TYPES = new Set<CardType>(["basic", "basic-with-images", "basic-reversed", "cloze", "single-choice", "multiple-choice"]);

function normalizeCreatableCardType(cardType: unknown, fallback: CardType = "basic"): CardType {
  return typeof cardType === "string" && CREATABLE_CARD_TYPES.has(cardType as CardType) ? cardType as CardType : fallback;
}

function sourceFor(sourceType: LearningItemSourceType, source?: DeckSource): DeckSource {
  if (source) return source;
  if (sourceType === "anki_import") return "anki-apkg";
  if (sourceType === "text_import") return "text-import";
  if (sourceType === "csv_import") return "csv-import";
  return "manual";
}

function resolveLearningItemRef(value: unknown, options: LearningItemOptions): LearningItem | null {
  if (value && typeof value === "object") return value as LearningItem;
  const id = String(value ?? "");
  return options.learningItem?.id === id
    ? options.learningItem
    : options.items?.find((item) => item.id === id)
      ?? options.deck?.cards.find((item) => item.id === id)
      ?? null;
}

export function createBasicLearningItem(deckId: string, front: string, back: string, options: LearningItemOptions = {}): LearningItem {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  const id = options.id ?? makeId("card");
  const cardType = normalizeCreatableCardType(options.cardType);
  const normalizedFront = sanitizeCardHtml(front);
  const normalizedBack = sanitizeCardHtml(back);
  const sourceType = options.sourceType ?? "manual";
  const document = createLearningItemDocumentFromLegacy({
    definitionVersionId: `core-${cardType}-v1`,
    fields: options.originalFields,
    front: normalizedFront,
    back: normalizedBack,
    tags: options.tags,
    mediaRefs: options.mediaRefs,
  });
  return createCoreCard({
    id,
    deckId,
    title: options.title ?? "",
    cardType: cardType === "basic-reversed" ? "basic" : cardType,
    source: sourceFor(sourceType, options.source),
    sourceType,
    sourceRefId: options.sourceRefId ?? options.sourceExternalId ?? options.sourceCardId ?? null,
    sourceCardId: options.sourceCardId ?? null,
    canonicalQuestion: normalizedFront,
    canonicalAnswer: normalizedBack,
    originalFront: normalizedFront,
    originalBack: normalizedBack,
    originalFields: document.fields.map((field) => ({ name: field.name, value: field.value })),
    originalTags: document.tags,
    tags: document.tags,
    concepts: options.concepts ?? [],
    mediaRefs: document.mediaRefs,
    projection: options.projection ?? { kind: "template", recipeId: `${document.definitionVersionId}-forward`, instanceKey: id },
    variants: [],
    draftStatus: options.draftStatus ?? "accepted",
    status: options.status ?? "active",
    reviewState: options.reviewState,
    createdAt,
    updatedAt,
    revision: options.revision ?? 1,
    deletedAt: options.deletedAt ?? null,
    updatedByDeviceId: options.updatedByDeviceId ?? null,
    contentDocument: document,
    meta: options.meta ?? {},
  });
}

export function createBasicReverseLearningItems(deckId: string, front: string, back: string, options: LearningItemOptions = {}): LearningItem[] {
  const forward = createBasicLearningItem(deckId, front, back, { ...options, cardType: "basic" });
  const reverse = createBasicLearningItem(deckId, back, front, {
    ...options,
    id: undefined,
    cardType: "basic",
    meta: { ...(options.meta ?? {}), direction: "reverse" },
  });
  return [forward, reverse];
}

function revealClozeText(text: string): string {
  return text.replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1");
}

function clozeOrdinals(text: string): number[] {
  return [...new Set([...text.matchAll(/\{\{c(\d+)::/gi)].map((match) => Number(match[1])))]
    .filter((ordinal) => ordinal > 0)
    .sort((left, right) => left - right);
}

function renderClozeFront(text: string, ordinal: number): string {
  return text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_match, candidate, answer, hint) =>
    Number(candidate) === ordinal ? `[${hint || "…"}]` : answer,
  );
}

export function createClozeLearningItems(deckId: string, textWithClozes: string, extra: unknown = "", options: LearningItemOptions = {}): LearningItem[] {
  const extraText = typeof extra === "string" ? extra : String(objectRecord(extra).explanation ?? "");
  const answer = [revealClozeText(textWithClozes), extraText].filter(Boolean).join("\n\n");
  const ordinals = clozeOrdinals(textWithClozes);
  return (ordinals.length ? ordinals : [1]).map((ordinal, index) => createBasicLearningItem(
    deckId,
    renderClozeFront(textWithClozes, ordinal),
    answer,
    {
      ...options,
      id: index === 0 ? options.id : undefined,
      cardType: "cloze",
      originalFields: [
        { name: "Cloze", value: textWithClozes },
        { name: "Extra", value: extraText },
      ].filter((field) => field.value),
      projection: { kind: "cloze", recipeId: "core-cloze-v1-forward", clozeOrdinal: ordinal },
      meta: { ...(options.meta ?? {}), clozeGroup: ordinal },
    },
  ));
}

export function createLearningItemsFromEditorValue(deckId: string, editorInput: unknown, options: LearningItemOptions = {}): LearningItem[] {
  const value = assertValidCardEditorValue(editorInput);
  const content = projectCardEditorContent(value);
  const common = { ...options, tags: value.tags };
  if (value.cardType === "basic-reversed") return createBasicReverseLearningItems(deckId, value.front, value.back, common);
  if (value.cardType === "cloze") return createClozeLearningItems(deckId, value.textWithClozes, value.extra, common);
  if (value.cardType === "single-choice" || value.cardType === "multiple-choice") {
    return [createBasicLearningItem(deckId, content.front, content.back, {
      ...common,
      cardType: value.cardType,
      answerOptions: content.answerOptions,
      expectedAnswer: content.correctAnswers,
      originalFields: [
        { name: "Frage", value: content.front },
        { name: "Antwortoptionen", value: value.options.join("\n") },
        { name: "Richtige Antworten", value: content.correctAnswers.join("\n") },
        { name: "Erklärung", value: content.explanation },
      ].filter((field) => field.value),
      meta: {
        ...(options.meta ?? {}),
        answerOptions: content.answerOptions,
        correctAnswers: content.correctAnswers,
        expectedAnswer: content.correctAnswers,
        explanation: content.explanation,
      },
    })];
  }
  return [createBasicLearningItem(deckId, value.front, value.back, { ...common, cardType: value.cardType })];
}

export function createLearningItemFromEditorValue(deckId: string, editorInput: unknown, options: LearningItemOptions = {}): LearningItem {
  return createLearningItemsFromEditorValue(deckId, editorInput, options)[0];
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
  return stripHtml(html).trim().endsWith("(Kopie)") ? html : sanitizeCardHtml(`${html}<p>(Kopie)</p>`);
}

function copyMarkedPayload(payload: CardContentPayload): CardContentPayload {
  const value = payload.editorValue;
  const editorValue: CardEditorValue = value.cardType === "single-choice" || value.cardType === "multiple-choice"
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
  const item = resolveLearningItemRef(learningItemOrId, options);
  if (!item) throw new Error(`LearningItem nicht gefunden: ${String(learningItemOrId ?? "")}`);
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const variant = createCardVariant({
    id: options.id ?? options.variantId,
    cardId: item.id,
    variantType: "basic",
    variantLevel: options.variantLevel ?? 2,
    front,
    back,
    explanation: options.explanation ?? "",
    transformType: "rephrase",
    transformProfile: options.transformProfile ?? {},
    qualityStatus: options.qualityStatus ?? "active",
    isActive: options.isActive ?? true,
    modelRunId: options.modelRunId ?? null,
    confidence: options.confidence,
    semanticDelta: options.semanticDelta,
    changedRecognitionCues: options.changedRecognitionCues,
    createdAt: options.createdAt ?? updatedAt,
    updatedAt,
    meta: {
      ...(options.meta ?? {}),
      generationSource: "ai_generated",
      sourceContentHash: item.contentHash,
    },
  });
  return normalizeLearningItem({ ...item, variants: [...item.variants, variant], updatedAt });
}

function normalizedCards(value: unknown): NormalizedCardInput[] {
  return Array.isArray(value)
    ? value.map((item) => objectRecord(item) as NormalizedCardInput)
      .filter((item) => item.projection || String(item.front ?? "").trim() || String(item.back ?? "").trim())
    : [];
}

function sourceCardIdOf(input: NormalizedCardInput): string | null {
  const metadata = { ...objectRecord(input.meta), ...objectRecord(input.metadataJson) };
  const raw = input.sourceCardId ?? metadata.ankiCardId ?? input.sourceExternalId ?? null;
  return raw == null ? null : String(raw).replace(/^anki-card-/, "");
}

export function createLearningItemsFromNormalizedInput(
  deckId: string,
  normalizedItems: unknown = [],
  options: LearningItemOptions = {},
): {
  createdItems: LearningItem[];
  definitions: NoteTypeDefinitionV1[];
  warnings: string[];
  skipped: Array<{ index: number; reason: string }>;
} {
  const createdItems: LearningItem[] = [];
  const definitions = new Map<string, NoteTypeDefinitionV1>();
  const warnings: string[] = [];
  const skipped: Array<{ index: number; reason: string }> = [];
  if (!Array.isArray(normalizedItems)) return { createdItems, definitions: [], warnings: ["normalizedItems muss ein Array sein."], skipped };

  normalizedItems.forEach((candidate, index) => {
    try {
      const input = objectRecord(candidate) as NormalizedLearningItemInput;
      const sourceCards = normalizedCards(input.cards);
      if (input.contentDocument && input.noteTypeDefinition) {
        const projection = projectLearningItemContent({ document: input.contentDocument, definition: input.noteTypeDefinition });
        definitions.set(projection.definition.id, projection.definition);
        const cards: NormalizedCardInput[] = sourceCards.length ? sourceCards : projection.cards.map((card) => ({ projection: card.projection }));
        for (const [cardIndex, sourceCard] of cards.entries()) {
          const projected = projection.cards.find((card) => sourceCard.projection && JSON.stringify(card.projection) === JSON.stringify(sourceCard.projection))
            ?? projection.cards[cardIndex]
            ?? projection.cards[0];
          if (!projected) continue;
          const sourceCardId = sourceCardIdOf(sourceCard);
          const id = sourceCard.id ?? (sourceCardId ? stableContentHash({ deckId, sourceCardId }, "card") : makeId("card"));
          const applied = applyLearningItemContent({
            previous: null,
            base: {
              id,
              deckId,
              title: input.title ?? "",
              source: input.source ?? (input.sourceType === "anki_import" ? "anki-apkg" : options.source),
              sourceType: input.sourceType ?? options.sourceType,
              sourceRefId: sourceCardId ?? input.sourceRefId ?? input.sourceExternalId ?? null,
              sourceCardId,
              projection: sourceCard.projection ?? projected.projection,
              tags: Array.isArray(input.tags ?? options.tags) ? ((input.tags ?? options.tags) as unknown[]).map(String) : [],
              mediaRefs: input.mediaRefs ?? options.mediaRefs,
              reviewState: createReviewState(sourceCard.reviewState ?? input.reviewState),
              createdAt: input.createdAt ?? options.createdAt,
              updatedAt: input.updatedAt ?? options.updatedAt,
              meta: {
                ...(options.meta ?? {}),
                ...(input.meta ?? {}),
                ...(sourceCard.meta ?? sourceCard.metadataJson ?? {}),
              },
            },
            document: input.contentDocument,
            definition: input.noteTypeDefinition,
            reason: input.sourceType === "anki_import" ? "import" : "create",
          });
          createdItems.push(applied.item);
        }
        return;
      }

      const cards = sourceCards.length ? sourceCards : [{ front: input.front ?? input.canonicalQuestion, back: input.back ?? input.canonicalAnswer }];
      for (const sourceCard of cards) {
        const front = String(sourceCard.front ?? input.canonicalQuestion ?? input.front ?? "");
        const back = String(sourceCard.back ?? input.canonicalAnswer ?? input.back ?? "");
        if (!front.trim() && !back.trim()) continue;
        const sourceCardId = sourceCardIdOf(sourceCard);
        createdItems.push(createBasicLearningItem(deckId, front, back, {
          ...options,
          ...input,
          id: sourceCard.id,
          sourceCardId,
          sourceRefId: sourceCardId ?? input.sourceRefId ?? input.sourceExternalId,
          cardType: normalizeCreatableCardType(input.cardType),
          projection: sourceCard.projection,
          meta: { ...(options.meta ?? {}), ...(input.meta ?? {}), ...(sourceCard.meta ?? sourceCard.metadataJson ?? {}) },
        }));
      }
      if (cards.length === 0) throw new Error("Keine valide Frage oder Antwort.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unbekannter Fehler.";
      skipped.push({ index, reason });
      warnings.push(`Item ${index + 1} wurde übersprungen: ${reason}`);
    }
  });
  return { createdItems, definitions: [...definitions.values()], warnings, skipped };
}

function manualEditorValue(card: ManualCardInput): CardEditorValue {
  if (card.editorValue) return assertValidCardEditorValue(card.editorValue);
  const cardType = normalizeCreatableCardType(card.cardType);
  const answers = Array.isArray(card.answerOptions) ? card.answerOptions.map(String) : [];
  const correctAnswers = normalizeChoiceAnswerList(card.correctAnswers ?? card.correctAnswer ?? answers[0] ?? card.back ?? "");
  const correctIndices = findChoiceAnswerIndices(answers, correctAnswers);
  if (cardType === "cloze") return assertValidCardEditorValue({ cardType, textWithClozes: card.front ?? "", extra: card.back ?? "", tags: card.tags });
  if (cardType === "single-choice") return assertValidCardEditorValue({ cardType, question: card.front ?? "", options: answers, correctOptionIndex: correctIndices[0] ?? -1, explanation: card.back ?? "", tags: card.tags });
  if (cardType === "multiple-choice") return assertValidCardEditorValue({ cardType, question: card.front ?? "", options: answers, correctOptionIndices: correctIndices, explanation: card.back ?? "", tags: card.tags });
  return assertValidCardEditorValue({ cardType, front: card.front ?? "", back: card.back ?? "", tags: card.tags });
}

export function createManualCoreDeck({ deckName, card, documentContext }: ManualDeckInput): Deck {
  const createdAt = new Date().toISOString();
  let cards: LearningItem[];
  if (card.contentDocument && card.noteTypeDefinition) {
    const projection = projectLearningItemContent({ document: card.contentDocument, definition: card.noteTypeDefinition });
    cards = projection.cards.map((projected) => applyLearningItemContent({
      previous: null,
      base: {
        deckId: "",
        projection: projected.projection,
        source: "manual",
        sourceType: "manual",
        createdAt,
        updatedAt: createdAt,
        meta: { exactWordingRequired: Boolean(card.exactWordingRequired) },
      },
      document: card.contentDocument!,
      definition: card.noteTypeDefinition!,
      reason: "create",
    }).item);
  } else {
    cards = createLearningItemsFromEditorValue("", manualEditorValue(card), {
      source: "manual",
      sourceType: "manual",
      mediaRefs: card.mediaRefs,
      createdAt,
      updatedAt: createdAt,
      meta: { exactWordingRequired: Boolean(card.exactWordingRequired) },
    });
  }
  return createCoreDeck({
    name: deckName,
    source: "manual",
    cards,
    createdAt,
    importMeta: {
      creationMethod: "manual",
      documentAssisted: Boolean(documentContext?.selection || documentContext?.textQuote || documentContext?.fileName || documentContext?.documentText),
    },
  });
}
