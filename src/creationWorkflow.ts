import { createManualCoreDeck, createSourceDocument, normalizeTags, validateCardEditorValue } from "./coreModel.ts";
import { createAnchorFromSelection, createDocumentFromFile, READABLE_SOURCE_DOCUMENT_ACCEPT, READABLE_SOURCE_DOCUMENT_LABEL } from "./documentModel.ts";
import { appendPlainTextToCardHtml } from "./richText.ts";
import { importCsvAsNormalizedDeck, importTextAsNormalizedDeck } from "./importService.ts";
import { createAccountMediaStore, type MediaSyncTask } from "./mediaStore.ts";
import type { CardEditorValue, CardType, Deck, EditableCardType, LearningItem, SourceAnchor } from "./coreTypes.ts";
import { LOCAL_APKG_MAX_BYTES, type ApkgImportReportV1 } from "./apkgImport.ts";

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

interface ApkgOptions {
  onStep?: (step: string) => void;
  existingDecks?: Deck[];
}

interface ApkgReport {
  apkg?: ApkgImportReportV1;
  warnings?: string[];
  errors?: string[];
  duplicates?: unknown[];
  hasAnkiScheduling?: boolean;
  [key: string]: unknown;
}

export interface LocalApkgCreationPreview {
  kind: "local";
  deck: Deck;
  sampleCards: LearningItem[];
  warnings: string[];
  normalizedDeck: unknown;
  mediaFiles: unknown[];
  importReport: ApkgReport;
}

export type ApkgCreationPreview = LocalApkgCreationPreview;

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
type AccountMediaStore = ReturnType<typeof createAccountMediaStore>;

function loadApkgImport(): Promise<typeof import("./apkgImport.ts")> {
  return import("./apkgImport.ts");
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
  if (Array.isArray(value)) return value.map((option) => String(option).trim());
  return String(value ?? "")
    .split(/\n+/)
    .map((option) => option.trim());
}

const SUPPORTED_MANUAL_CARD_TYPES = new Set<CardType>(["basic", "basic-reversed", "cloze", "multiple-choice"]);

function normalizeManualCardType(cardType: unknown): EditableCardType {
  return typeof cardType === "string" && SUPPORTED_MANUAL_CARD_TYPES.has(cardType as CardType) ? cardType as EditableCardType : "basic";
}

function normalizeMultipleChoiceData(input: ManualCreationInput = {}, answerOptions: string[] = []) {
  const correctAnswer = String(input.correctAnswer ?? answerOptions[0] ?? input.back ?? "").trim();
  return {
    answerOptions,
    correctAnswer,
  };
}

function createManualDeckInput(input: ManualCreationInput = {}) {
  const requestedCardType = normalizeManualCardType(input.cardType);
  const document = input.document ?? null;
  const mcq = normalizeMultipleChoiceData(input, normalizeAnswerOptions(input.answerOptions));
  const tags = normalizeTags(input.tags);
  const editorValue: CardEditorValue = requestedCardType === "cloze"
    ? { cardType: "cloze", textWithClozes: input.front ?? "", extra: input.back ?? "", tags }
    : requestedCardType === "multiple-choice"
      ? { cardType: "multiple-choice", question: input.front ?? "", options: mcq.answerOptions, correctOptionIndex: mcq.answerOptions.indexOf(mcq.correctAnswer), explanation: input.back ?? "", tags }
      : { cardType: requestedCardType, front: input.front ?? "", back: input.back ?? "", tags };

  return {
    deckName: input.deckName ?? "Neuer Kartenstapel",
    card: {
      editorValue,
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

export function createCreationWorkflow({ mediaStore = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "local-user" }), persistImportedDecks = async (_decks: Deck[]) => {} }: { mediaStore?: AccountMediaStore; persistImportedDecks?: (decks: Deck[], options?: { mediaOnly?: boolean }) => Promise<unknown> } = {}) {
  return {
    readableSourceDocumentAccept: READABLE_SOURCE_DOCUMENT_ACCEPT,
    readableSourceDocumentLabel: READABLE_SOURCE_DOCUMENT_LABEL,

    async parseApkgFile(file: FileLike, { onStep, existingDecks = [] }: ApkgOptions = {}) {
      try {
        if (Number(file.size ?? 0) > LOCAL_APKG_MAX_BYTES) {
          throw new Error("Die APKG-Datei ist größer als 250 MiB. Bitte wähle eine kleinere Datei aus.");
        }
        const { createApkgImportPreview } = await loadApkgImport();
        const result = await createApkgImportPreview(file, onStep, { existingDecks });
        const preview = result.preview ? { ...result.preview, kind: "local" as const } : null;
        const mediaStatus = preview ? await mediaStore.cachePreviewMedia(preview.deck, preview.mediaFiles) : null;
        const mediaErrors = mediaStatus?.errors ?? [];
        const reportWarnings = result.preview?.importReport?.warnings ?? [];
        const reportErrors = result.preview?.importReport?.errors ?? [];

        return {
          preview,
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

    async commitApkgPreview(preview: ApkgCreationPreview | null, { existingDecks = [] }: ApkgOptions = {}) {
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
      const committed = await commitApkgImport(preview, { existingDecks });
      const decks = (committed.decks?.length ? committed.decks : committed.deck ? [committed.deck] : []) as Deck[];
      if (committed.report.errors.length > 0 || decks.length === 0) return { ...committed, mediaTask: null as MediaSyncTask | null };
      await persistImportedDecks(decks);
      const mediaTask = mediaStore.syncImportMedia(decks);
      void mediaTask.result.then(async (mediaResult) => {
        if (mediaResult.status !== "cloud-ready") return;
        const withReferences = decks.map((deck) => ({ ...deck, mediaAssets: mediaResult.referencesByDeck.get(deck.id) ?? deck.mediaAssets ?? [] }));
        await persistImportedDecks(withReferences, { mediaOnly: true });
      });
      return { ...committed, mediaTask };
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
      return validateCardEditorValue(createManualDeckInput({ cardType, front, back, answerOptions, correctAnswer }).card.editorValue).ok;
    },

    validateManualCard(input: ManualCreationInput = {}) {
      return validateCardEditorValue(createManualDeckInput(input).card.editorValue);
    },

    createManualDeckInput(input: ManualCreationInput = {}) {
      return createManualDeckInput(input);
    },

    createManualDeck(input: ManualCreationInput = {}) {
      return createManualCoreDeck(createManualDeckInput(input));
    },

  };
}
