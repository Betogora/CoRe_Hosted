import { generateCardsFromDocument } from "./aiOrchestrator.ts";
import { acceptAiDraftDeck, createManualCoreDeck, createSourceDocument } from "./coreModel.ts";
import { createAnchorFromSelection, createDocumentFromFile, READABLE_SOURCE_DOCUMENT_ACCEPT, READABLE_SOURCE_DOCUMENT_LABEL } from "./documentModel.ts";
import { appendPlainTextToCardHtml, hasCardRichTextContent } from "./richText.ts";
import { importCsvAsNormalizedDeck, importTextAsNormalizedDeck } from "./importService.ts";
import { createAccountMediaStore, type MediaSyncTask } from "./mediaStore.ts";
import type { CardType, Deck, LearningItem, SourceAnchor } from "./coreTypes.ts";
import type { ApkgImportReportV1 } from "./apkgImport.ts";
import { LOCAL_APKG_MAX_BYTES, SERVER_APKG_MAX_BYTES, type ApkgImportProgress } from "./serverApkgImportContract.ts";
import type { ServerApkgImportClient } from "./serverApkgImport.ts";

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
  onStep?: (step: string) => void;
  onProgress?: (progress: ApkgImportProgress) => void;
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

export interface ServerApkgCreationPreview {
  kind: "server";
  jobId: string;
  progress: ApkgImportProgress;
  deckSummary: { name: string };
  sampleCards: [];
  warnings: string[];
  importReport: ApkgReport;
}

export type ApkgCreationPreview = LocalApkgCreationPreview | ServerApkgCreationPreview;

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

export function createCreationWorkflow({ mediaStore = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "local-user" }), persistImportedDecks = async (_decks: Deck[]) => {}, serverApkgImport = null }: { mediaStore?: AccountMediaStore; persistImportedDecks?: (decks: Deck[], options?: { mediaOnly?: boolean }) => Promise<unknown>; serverApkgImport?: ServerApkgImportClient | null } = {}) {
  function serverPreview(progress: ApkgImportProgress, fallbackName = "Anki-Import"): ServerApkgCreationPreview {
    const report = progress.report ?? {};
    const apkg = report.apkg as ApkgImportReportV1 | undefined;
    return {
      kind: "server", jobId: progress.jobId, progress,
      deckSummary: { name: apkg?.decks?.[0]?.path ?? fallbackName.replace(/\.apkg$/i, "") },
      sampleCards: [], warnings: (report.warnings as string[] | undefined) ?? [], importReport: report,
    };
  }

  return {
    readableSourceDocumentAccept: READABLE_SOURCE_DOCUMENT_ACCEPT,
    readableSourceDocumentLabel: READABLE_SOURCE_DOCUMENT_LABEL,

    async parseApkgFile(file: FileLike, { onStep, onProgress, existingDecks = [] }: ApkgOptions = {}) {
      try {
        if (Number(file.size ?? 0) > SERVER_APKG_MAX_BYTES) throw new Error("Die APKG-Datei ist größer als 1 GiB.");
        if (Number(file.size ?? 0) > LOCAL_APKG_MAX_BYTES) {
          if (!serverApkgImport) throw new Error("Große APKG-Dateien benötigen eine aktive Cloud-Anmeldung.");
          const progress = await serverApkgImport.analyze(file as unknown as File, (next) => {
            onProgress?.(next);
            onStep?.(next.phase);
          });
          const report = progress.report ?? {};
          const failed = progress.status === "failed" || progress.status === "cancelled";
          return {
            preview: serverPreview(progress, file.name ?? "Anki-Import"),
            mediaStatus: null,
            job: createApkgJob(file, failed ? "error" : "preview", {
              id: progress.jobId, progress, warnings: report.warnings ?? [],
              errors: failed ? [progress.status === "cancelled" ? "Der APKG-Import wurde abgebrochen." : "Die APKG-Analyse ist fehlgeschlagen."] : report.errors ?? [],
            }),
          };
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

    async resumeApkgPreview({ onProgress, existingDecks: _existingDecks = [] }: ApkgOptions = {}) {
      const jobId = serverApkgImport?.getLastJobId();
      if (!serverApkgImport || !jobId) return null;
      const current = await serverApkgImport.get(jobId);
      onProgress?.(current);
      if (current.status === "uploading") return null;
      const progress = ["ready", "failed", "cancelled", "succeeded"].includes(current.status)
        ? current
        : ["committing", "syncing_media"].includes(current.status)
          ? await serverApkgImport.waitUntilFinished(jobId, onProgress)
          : await serverApkgImport.waitUntilReady(jobId, onProgress);
      const failed = progress.status === "failed" || progress.status === "cancelled";
      const reportErrors = Array.isArray(progress.report?.errors) ? progress.report.errors.map(String) : [];
      return {
        preview: serverPreview(progress),
        mediaStatus: null,
        job: {
          id: jobId,
          status: failed ? "error" : progress.status === "succeeded" ? "done" : "preview",
          progress,
          warnings: progress.report?.warnings ?? [],
          errors: failed
            ? [...reportErrors, progress.status === "cancelled" ? "Der APKG-Import wurde abgebrochen." : "Die APKG-Analyse ist fehlgeschlagen."]
            : reportErrors,
        },
      };
    },

    async retryApkgPreview(preview: ApkgCreationPreview, onProgress?: (progress: ApkgImportProgress) => void) {
      if (preview.kind !== "server" || !serverApkgImport) return null;
      const queued = await serverApkgImport.retry(preview.progress);
      onProgress?.(queued);
      const terminal = queued.status === "syncing_media"
        ? await serverApkgImport.waitUntilFinished(preview.jobId, onProgress)
        : await serverApkgImport.waitUntilReady(preview.jobId, onProgress);
      const next = serverPreview(terminal, preview.deckSummary.name);
      return terminal.report ? next : { ...next, warnings: preview.warnings, importReport: preview.importReport };
    },

    async cancelApkgPreview(preview: ApkgCreationPreview) {
      if (preview.kind !== "server" || !serverApkgImport) return null;
      return serverApkgImport.cancel(preview.progress);
    },

    async cancelApkgProgress(progress: ApkgImportProgress) {
      return serverApkgImport?.cancel(progress) ?? null;
    },

    async commitApkgPreview(preview: ApkgCreationPreview | null, { existingDecks = [], onProgress }: ApkgOptions = {}) {
      if (!preview) {
        return {
          deck: null,
          report: {
            warnings: [],
            errors: ["Keine APKG-Vorschau zum Importieren vorhanden."],
          },
        };
      }
      if (preview.kind === "server") {
        if (!serverApkgImport) throw new Error("Der Serverimport ist nicht verfügbar.");
        const prepared = await serverApkgImport.prepareCommit(preview.progress);
        const { createApkgPreviewFromNormalizedImport, commitApkgImport } = await loadApkgImport();
        const refreshed = await createApkgPreviewFromNormalizedImport(prepared.artifact.normalizedDeck, prepared.artifact.warnings, { existingDecks });
        if (!refreshed.preview) return { deck: null, decks: [], report: refreshed.report, mediaTask: null as MediaSyncTask | null };
        const committed = await commitApkgImport(refreshed.preview, { existingDecks });
        const decks = (committed.decks?.length ? committed.decks : committed.deck ? [committed.deck] : []) as Deck[];
        if (committed.report.errors.length > 0 || decks.length === 0) return { ...committed, mediaTask: null as MediaSyncTask | null };
        await persistImportedDecks(decks);
        const progress = await serverApkgImport.finalize(prepared.progress, onProgress);
        return { ...committed, serverProgress: progress, mediaTask: null as MediaSyncTask | null };
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
