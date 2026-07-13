import { generateCardsFromDocument } from "./aiOrchestrator.js";
import { acceptAiDraftDeck, createManualCoreDeck, createSourceDocument } from "./coreModel.ts";
import { createAnchorFromSelection, createDocumentFromFile } from "./documentModel.js";
import { appendPlainTextToCardHtml, hasCardRichTextContent } from "./richText.js";
import { importCsvAsNormalizedDeck, importTextAsNormalizedDeck } from "./importService.js";
import { storeDeckMedia } from "./mediaStore.js";
import type { CardType, Deck, LearningItem, SourceAnchor } from "./coreTypes.ts";

interface FileLike {
  name?: string;
  size?: number;
  [key: string]: unknown;
}

interface ManualCreationInput {
  deckName?: string;
  cardType?: CardType;
  front?: string;
  back?: string;
  tags?: unknown;
  answerOptions?: unknown;
  correctAnswer?: unknown;
  expectedAnswer?: unknown;
  document?: ReturnType<typeof createSourceDocument> | null;
  documentText?: string;
  selection?: string;
  sourceAnchor?: SourceAnchor;
  activeField?: string;
}

interface AiConfig {
  cardTypes?: CardType[];
  subject?: string;
  [key: string]: unknown;
}

interface ApkgOptions {
  onStep?: () => void;
  existingDecks?: Deck[];
}

interface PasteImportInput {
  mode?: "text" | "csv" | "spreadsheet";
  deckName?: string;
  content?: string;
  dryRun?: boolean;
}

interface SelectionInput {
  activeField?: string;
  front?: string;
  back?: string;
  document?: ReturnType<typeof createSourceDocument> | null;
  documentText?: string;
  selectedText?: string;
  sourceAnchorOptions?: Record<string, unknown>;
}

interface ManualValidationInput {
  cardType?: CardType;
  front?: string;
  back?: string;
  answerOptions?: unknown;
  correctAnswer?: unknown;
}

export type CreationWorkflow = ReturnType<typeof createCreationWorkflow>;

function loadApkgImport(): Promise<typeof import("./apkgImport.js")> {
  return import("./apkgImport.js");
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createApkgJob(file: FileLike, status: string, overrides: Record<string, unknown> = {}) {
  return {
    fileName: file?.name ?? "APKG-Datei",
    fileSize: file?.size ?? 0,
    status,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function normalizePasteMode(mode: unknown): "text" | "csv" | "spreadsheet" {
  return mode === "csv" || mode === "spreadsheet" ? mode : "text";
}

function createPasteImportInput({ mode, deckName, content }: { mode: unknown; deckName: string; content: string }) {
  const normalizedMode = normalizePasteMode(mode);
  if (normalizedMode === "text") return { deckName, text: content };

  return {
    deckName,
    csv: content,
    sourceType: "csv_import",
    format: normalizedMode === "spreadsheet" ? "spreadsheet" : "csv",
  };
}

function normalizeAnswerOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((option) => String(option).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/\n+/)
    .map((option) => option.trim())
    .filter(Boolean);
}

const SUPPORTED_MANUAL_CARD_TYPES = new Set<CardType>(["basic", "basic-reversed", "cloze", "multiple-choice"]);

function normalizeManualCardType(cardType: unknown): CardType {
  return typeof cardType === "string" && SUPPORTED_MANUAL_CARD_TYPES.has(cardType as CardType) ? cardType as CardType : "basic";
}

function hasClozeSyntax(value: unknown): boolean {
  return /\{\{c\d+::[\s\S]+?\}\}/.test(String(value ?? ""));
}

function normalizeMultipleChoiceData(input: ManualCreationInput = {}, answerOptions: string[] = []) {
  const correctAnswer = String(input.correctAnswer ?? answerOptions[0] ?? input.back ?? "").trim();
  const options = [...answerOptions];

  if (correctAnswer && !options.includes(correctAnswer)) {
    options.push(correctAnswer);
  }

  return {
    answerOptions: [...new Set(options)],
    correctAnswer,
  };
}

function createManualDeckInput(input: ManualCreationInput = {}) {
  const requestedCardType = normalizeManualCardType(input.cardType);
  const cardType = requestedCardType === "cloze" && !hasClozeSyntax(input.front) ? "basic" : requestedCardType;
  const document = input.document ?? null;
  const mcq = normalizeMultipleChoiceData(input, normalizeAnswerOptions(input.answerOptions));
  const answerOptions = cardType === "multiple-choice" ? mcq.answerOptions : [];
  const correctAnswer = mcq.correctAnswer;
  const rawExpectedAnswer = String(input.expectedAnswer ?? input.back ?? "").trim();
  const expectedAnswer = rawExpectedAnswer || correctAnswer;
  const back = cardType === "multiple-choice" ? String(input.back || correctAnswer).trim() : input.back;

  return {
    deckName: input.deckName ?? "Neuer Kartenstapel",
    card: {
      cardType,
      front: input.front ?? "",
      back: back ?? "",
      tags: input.tags,
      answerOptions,
      correctAnswer,
      expectedAnswer,
      mediaRefs: [],
    },
    documentContext: {
      document,
      documentId: document?.id,
      fileName: document?.fileName,
      mimeType: document?.mimeType,
      documentText: input.documentText,
      selection: input.selection,
      sourceAnchor: input.sourceAnchor,
      targetField: input.activeField ?? "front",
    },
  };
}

export function createCreationWorkflow() {
  return {
    async parseApkgFile(file: FileLike, { onStep, existingDecks = [] }: ApkgOptions = {}) {
      try {
        const { createApkgImportPreview } = await loadApkgImport();
        const result = await createApkgImportPreview(file, onStep, { existingDecks });
        const mediaStatus = result.preview ? await storeDeckMedia(result.preview.deck, result.preview.mediaFiles) : null;
        const mediaErrors = mediaStatus?.errors ?? [];
        const reportWarnings = result.preview?.importReport?.warnings ?? [];
        const reportErrors = result.preview?.importReport?.errors ?? [];

        return {
          preview: result.preview,
          mediaStatus,
          job: {
            ...result.job,
            status: reportErrors.length > 0 ? "error" : result.job.status,
            warnings: [...new Set([...(result.job.warnings ?? []), ...reportWarnings, ...mediaErrors])],
            errors: [...new Set([...(result.job.errors ?? []), ...reportErrors])],
          },
        };
      } catch (error) {
        return {
          preview: null,
          mediaStatus: null,
          job: createApkgJob(file, "error", {
            errors: [describeError(error, "Der Import ist fehlgeschlagen.")],
          }),
        };
      }
    },

    async commitApkgPreview(preview: unknown, { existingDecks = [] }: ApkgOptions = {}) {
      if (!preview) {
        return {
          deck: null,
          report: {
            warnings: [],
            errors: ["Keine APKG-Vorschau zum Importieren vorhanden."],
          },
        };
      }
      const { commitApkgImport } = await loadApkgImport();
      return commitApkgImport(preview, { existingDecks });
    },

    importPastedDeck({ mode = "text", deckName = "Importierter Stapel", content = "", dryRun = false }: PasteImportInput = {}) {
      const normalizedMode = normalizePasteMode(mode);
      const input = createPasteImportInput({ mode: normalizedMode, deckName, content });

      return normalizedMode === "text"
        ? importTextAsNormalizedDeck(input, { dryRun })
        : importCsvAsNormalizedDeck(input, { dryRun });
    },

    async readSourceDocument(file: FileLike) {
      return createDocumentFromFile(file);
    },

    captureManualSelection({ activeField = "front", front = "", back = "", document = null, documentText = "", selectedText = "", sourceAnchorOptions = {} }: SelectionInput = {}) {
      const selection = String(selectedText ?? "").trim();
      if (!selection) return { changed: false, front, back, selection: "" };
      const sourceAnchor = document ? createAnchorFromSelection({ ...document, text: documentText || document.text }, selection, activeField, sourceAnchorOptions) : null;

      return {
        changed: true,
        selection,
        sourceAnchor,
        front: activeField === "back" ? front : appendPlainTextToCardHtml(front, selection),
        back: activeField === "back" ? appendPlainTextToCardHtml(back, selection) : back,
      };
    },

    canCreateManualCard({ cardType = "basic", front = "", back = "", answerOptions = [], correctAnswer = "" }: ManualValidationInput = {}) {
      const normalizedCardType = normalizeManualCardType(cardType);
      const hasFront = hasCardRichTextContent(front);
      if (normalizedCardType === "cloze") return hasFront && hasClozeSyntax(front);
      if (normalizedCardType === "multiple-choice") {
        const mcq = normalizeMultipleChoiceData({ correctAnswer, back }, normalizeAnswerOptions(answerOptions));
        return hasFront && mcq.answerOptions.length >= 2 && Boolean(mcq.correctAnswer);
      }
      return hasFront && hasCardRichTextContent(back);
    },

    createManualDeckInput(input: ManualCreationInput = {}) {
      return createManualDeckInput(input);
    },

    createManualDeck(input: ManualCreationInput = {}) {
      return createManualCoreDeck(createManualDeckInput(input));
    },

    createInitialAiDocument(overrides: Partial<ReturnType<typeof createSourceDocument>> = {}) {
      return createSourceDocument({
        fileName: "Textquelle",
        text: "",
        textExtractionStatus: "success",
        ...overrides,
      });
    },

    updateAiDocumentText(document: ReturnType<typeof createSourceDocument>, text: string) {
      return {
        ...document,
        text,
        textExtractionStatus: text ? "success" : document?.textExtractionStatus,
      };
    },

    toggleAiCardType(config: AiConfig = {}, cardType: CardType) {
      const currentTypes = Array.isArray(config.cardTypes) ? config.cardTypes : ["basic"];
      const cardTypes = currentTypes.includes(cardType)
        ? currentTypes.filter((value) => value !== cardType)
        : [...currentTypes, cardType];
      return { ...config, cardTypes: cardTypes.length ? cardTypes : ["basic"] };
    },

    generateAiDrafts({ document, config = {}, deckName = "" }: {
      document?: ReturnType<typeof createSourceDocument>;
      config?: AiConfig;
      deckName?: string;
    } = {}) {
      const result = generateCardsFromDocument({
        document,
        config,
        deckName: deckName || config.subject || "KI-Entwürfe",
      });

      return {
        ...result,
        statusMessage: result.validation.valid
          ? `${result.draftDeck?.cards.length ?? 0} Entwürfe generiert.`
          : result.validation.errors.join(" "),
      };
    },

    updateDraftCard(cards: LearningItem[] = [], cardId: string, patch: Partial<LearningItem> = {}): LearningItem[] {
      return cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card));
    },

    acceptAiDrafts(draftDeck: Deck | null, draftCards: LearningItem[] = []): Deck | null {
      if (!draftDeck || draftCards.length === 0) return null;
      return acceptAiDraftDeck({ ...draftDeck, cards: draftCards });
    },
  };
}
