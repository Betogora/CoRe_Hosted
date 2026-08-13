import {
  createCoreNoteTypeDefinition,
  createLearningItemDocumentFromLegacy,
  createManualCoreDeck,
  createSourceDocument,
  normalizeTags,
  stableContentHash,
  validateCardEditorValue,
} from "./coreModel.ts";
import { createAnchorFromSelection, createDocumentFromFile, READABLE_SOURCE_DOCUMENT_ACCEPT, READABLE_SOURCE_DOCUMENT_LABEL } from "./documentModel.ts";
import { appendPlainTextToCardHtml } from "./richText.ts";
import { importCsvAsNormalizedDeck, importNormalizedDeck, importTextAsNormalizedDeck } from "./importService.ts";
import type { CsvFieldProjection } from "./csvFieldMapping.ts";
import { createAccountMediaStore, type MediaSyncTask } from "./mediaStore.ts";
import type { CardEditorValue, CardType, Deck, EditableCardType, ImportCommitGraph, LearningItem, SourceAnchor } from "./coreTypes.ts";
import { LOCAL_APKG_MAX_BYTES, type ApkgImportReportV1 } from "./apkgImport.ts";

interface FileLike {
  name?: string;
  size?: number;
  [key: string]: unknown;
}

export interface ManualImageAttachment {
  sha1: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  blob: Blob;
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
  frontImage?: ManualImageAttachment | null;
  backImage?: ManualImageAttachment | null;
  additionalFields?: Array<{
    id?: string;
    name?: string;
    value?: string;
    placement?: "front" | "back" | "both" | "metadata";
  }>;
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
  summary: Deck;
  sampleCards: LearningItem[];
  report: ApkgReport;
  commitGraph: ImportCommitGraph;
  mediaFiles: unknown[];
}

export type ApkgCreationPreview = LocalApkgCreationPreview;

interface PasteImportInput {
  mode?: "text" | "csv" | "spreadsheet";
  deckName?: string;
  content?: string;
  dryRun?: boolean;
}

interface MappedCsvImportInput {
  deckName?: string;
  records?: CsvFieldProjection[];
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

function createWorkerMediaDecks(graph: ImportCommitGraph, persistedDecks: Deck[], summary: Deck): Deck[] {
  if (graph.kind !== "worker-import" || graph.mediaTargets.length === 0) return graph.kind === "worker-import" ? [] : persistedDecks;
  const persistedByIncomingId = new Map<string, Deck>();
  for (const identity of graph.deckIdentities) {
    const persisted = persistedDecks.find((deck) => deck.id === identity.id)
      ?? persistedDecks.find((deck) => identity.originalDeckId && deck.originalDeckId === identity.originalDeckId);
    if (persisted) persistedByIncomingId.set(identity.id, persisted);
  }
  const namesByDeckId = new Map<string, Set<string>>();
  for (const target of graph.mediaTargets) {
    const persisted = persistedByIncomingId.get(target.deckId);
    if (!persisted) continue;
    const names = namesByDeckId.get(persisted.id);
    if (names) names.add(target.name);
    else namesByDeckId.set(persisted.id, new Set([target.name]));
  }
  const manifest = summary.importMeta?.mediaManifest as { assets?: Array<{ name?: string }> } | undefined;
  return persistedDecks.flatMap((deck) => {
    const names = namesByDeckId.get(deck.id);
    if (!names?.size) return [];
    return [{
      ...deck,
      cards: [],
      cardCount: Math.max(1, deck.cardCount),
      importMeta: {
        ...deck.importMeta,
        mediaManifest: {
          ...(manifest ?? {}),
          assets: (manifest?.assets ?? []).filter((asset) => names.has(String(asset.name ?? ""))),
        },
      },
    }];
  });
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

const SUPPORTED_MANUAL_CARD_TYPES = new Set<CardType>(["basic", "basic-with-images", "basic-reversed", "cloze", "multiple-choice"]);
const SHA1_PATTERN = /^[a-f0-9]{40}$/;

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

function normalizeManualImageAttachment(value: unknown): ManualImageAttachment | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ManualImageAttachment>;
  const sha1 = String(input.sha1 ?? "").toLowerCase();
  const mimeType = String(input.mimeType ?? "");
  if (!SHA1_PATTERN.test(sha1) || !mimeType.startsWith("image/") || !(input.blob instanceof Blob) || input.blob.size !== input.size) return null;
  return {
    sha1,
    name: sha1,
    originalName: String(input.originalName ?? input.name ?? "Bild"),
    size: input.blob.size,
    mimeType,
    blob: input.blob,
  };
}

function createMappedCsvDeckInput(deckName: string, records: CsvFieldProjection[]) {
  const extraFieldNames = [...new Set(records.flatMap((record) => record.fields.map((field) => field.name)))];
  const definitionVersionId = stableContentHash(
    { source: "csv-mapping", fields: ["Vorderseite", "Rückseite", ...extraFieldNames] },
    "note-type",
  );
  return {
    title: deckName,
    sourceType: "csv_import",
    metadataJson: { parser: "csv-field-mapping", mappedFieldNames: extraFieldNames },
    items: records.map((record) => {
      const valueByName = new Map(record.fields.map((field) => [field.name, field.value]));
      const document = createLearningItemDocumentFromLegacy({
        definitionVersionId,
        fields: [
          { name: "Vorderseite", value: record.front },
          { name: "Rückseite", value: record.back },
          ...extraFieldNames.map((name) => ({ name, value: valueByName.get(name) ?? "" })),
        ],
        tags: record.tags,
      });
      return {
        title: record.front,
        canonicalQuestion: record.front,
        canonicalAnswer: record.back,
        tags: record.tags,
        sourceType: "csv_import",
        sourceExternalId: record.guid,
        originalFields: document.fields.map((field) => ({ name: field.name, value: field.value })),
        contentDocument: document,
        noteTypeDefinition: createCoreNoteTypeDefinition({ document, name: "CSV-Feldschema" }),
        metadataJson: {
          importFormat: "csv-mapping",
          sourceLine: record.sourceLine,
          requestedDeck: record.deck,
        },
      };
    }),
  };
}

function appendManualImage(html: string, image: ManualImageAttachment | null, alt: string): string {
  return image ? `${html}<p><img src="${image.sha1}" alt="${alt}"></p>` : html;
}

function createManualDeckInput(input: ManualCreationInput = {}) {
  const requestedCardType = normalizeManualCardType(input.cardType);
  const document = input.document ?? null;
  const mcq = normalizeMultipleChoiceData(input, normalizeAnswerOptions(input.answerOptions));
  const tags = normalizeTags(input.tags);
  const frontImage = normalizeManualImageAttachment(input.frontImage);
  const backImage = normalizeManualImageAttachment(input.backImage);
  const front = appendManualImage(input.front ?? "", frontImage, "Bild zur Vorderseite");
  const back = appendManualImage(input.back ?? "", backImage, "Bild zur Rückseite");
  const editorValue: CardEditorValue = requestedCardType === "cloze"
    ? { cardType: "cloze", textWithClozes: front, extra: back, tags }
    : requestedCardType === "multiple-choice"
      ? { cardType: "multiple-choice", question: front, options: mcq.answerOptions, correctOptionIndex: mcq.answerOptions.indexOf(mcq.correctAnswer), explanation: back, tags }
      : { cardType: requestedCardType, front, back, tags };
  const additionalFields = Array.isArray(input.additionalFields)
    ? input.additionalFields.filter((field) => String(field.name ?? "").trim())
    : [];
  const definitionVersionId = stableContentHash({
    source: "manual-dynamic",
    fields: ["Vorderseite", "Rückseite", ...additionalFields.map((field) => [field.id, field.name, field.placement])],
    cardType: requestedCardType,
  }, "note-type");
  const baseDocument = createLearningItemDocumentFromLegacy({
    definitionVersionId,
    fields: [
      { name: "Vorderseite", value: front },
      { name: "Rückseite", value: back },
      ...additionalFields.map((field) => ({ name: String(field.name), value: String(field.value ?? "") })),
    ],
    tags,
    mediaRefs: [frontImage?.sha1, backImage?.sha1].filter((reference): reference is string => Boolean(reference)),
  });
  const contentDocument = {
    ...baseDocument,
    fields: baseDocument.fields.map((field, index) => index < 2 ? field : {
      ...field,
      id: additionalFields[index - 2]?.id || field.id,
      placement: additionalFields[index - 2]?.placement ?? "metadata",
      semanticRole: "unclassified" as const,
    }),
    ...(requestedCardType === "multiple-choice" ? { interaction: { choice: { options: mcq.answerOptions, correctAnswer: mcq.correctAnswer, explanation: back } } } : {}),
  };
  const noteTypeDefinition = createCoreNoteTypeDefinition({
    document: contentDocument,
    kind: requestedCardType === "cloze" ? "cloze" : "normal",
    interaction: requestedCardType === "multiple-choice" ? "choice" : requestedCardType === "cloze" ? "cloze" : "reveal",
    reverse: requestedCardType === "basic-reversed",
  });

  return {
    deckName: input.deckName ?? "Neuer Kartenstapel",
    card: {
      editorValue,
      mediaRefs: contentDocument.mediaRefs,
      contentDocument,
      noteTypeDefinition,
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

export function createCreationWorkflow({ mediaStore = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "local-user" }), persistImportedDecks = async (decks: Deck[]) => decks }: { mediaStore?: AccountMediaStore; persistImportedDecks?: (decks: Deck[], options?: { mediaOnly?: boolean; commitGraph?: ImportCommitGraph }) => Promise<Deck[]> } = {}) {
  return {
    readableSourceDocumentAccept: READABLE_SOURCE_DOCUMENT_ACCEPT,
    readableSourceDocumentLabel: READABLE_SOURCE_DOCUMENT_LABEL,

    async prepareManualImage(file: Blob & { name?: string }): Promise<ManualImageAttachment> {
      if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
        throw new Error("Bitte füge eine Bilddatei ein.");
      }
      if (!globalThis.crypto?.subtle) {
        throw new Error("Das Bild kann in diesem Browser nicht sicher verarbeitet werden.");
      }
      const digest = await globalThis.crypto.subtle.digest("SHA-1", await file.arrayBuffer());
      const sha1 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return {
        sha1,
        name: sha1,
        originalName: String(file.name ?? "Eingefügtes Bild"),
        size: file.size,
        mimeType: file.type,
        blob: file,
      };
    },

    async syncManualMedia(deck: Deck, attachments: Array<ManualImageAttachment | null | undefined>) {
      const uniqueAttachments = [...new Map(
        attachments
          .map(normalizeManualImageAttachment)
          .filter((attachment): attachment is ManualImageAttachment => Boolean(attachment))
          .map((attachment) => [attachment.sha1, attachment]),
      ).values()];
      if (uniqueAttachments.length === 0) {
        return { deck, status: "cloud-ready" as const, message: "", errors: [] as string[] };
      }
      try {
        const cached = await mediaStore.cachePreviewMedia(deck, uniqueAttachments);
        const result = await mediaStore.syncImportMedia([deck]).result;
        const references = result.referencesByDeck.get(deck.id);
        const updatedDeck = references ? { ...deck, mediaAssets: references } : deck;
        if (references) await persistImportedDecks([updatedDeck], { mediaOnly: true });
        return { deck: updatedDeck, status: result.status, message: result.message, errors: cached.errors };
      } catch (error) {
        return {
          deck,
          status: "blocked" as const,
          message: "Die Karte wurde gespeichert, aber mindestens ein Bild konnte nicht im Medienspeicher abgelegt werden.",
          errors: [describeError(error, "Bild konnte nicht gespeichert werden.")],
        };
      }
    },

    async parseApkgFile(file: FileLike, { onStep, existingDecks = [] }: ApkgOptions = {}) {
      try {
        if (Number(file.size ?? 0) > LOCAL_APKG_MAX_BYTES) {
          throw new Error("Die APKG-Datei ist größer als 250 MiB. Bitte wähle eine kleinere Datei aus.");
        }
        const { createApkgImportPreview } = await loadApkgImport();
        const result = await createApkgImportPreview(file, onStep, { existingDecks });
        const preview = result.preview ? { ...result.preview, kind: "local" as const } : null;
        const mediaStatus = preview ? await mediaStore.cachePreviewMedia(preview.summary, preview.mediaFiles) : null;
        const mediaErrors = mediaStatus?.errors ?? [];
        const reportWarnings = result.preview?.report?.warnings ?? [];
        const reportErrors = result.preview?.report?.errors ?? [];

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
          decks: [] as Deck[],
          commitGraph: null,
          mediaFiles: [],
          mediaTask: null as MediaSyncTask | null,
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
      const persistedDecks = await persistImportedDecks(decks, { commitGraph: committed.commitGraph });
      const persistedDeck = persistedDecks.find((deck) => deck.id === committed.deck?.id)
        ?? persistedDecks.find((deck) => deck.originalDeckId && deck.originalDeckId === committed.deck?.originalDeckId)
        ?? persistedDecks.find((deck) => deck.cardCount > 0)
        ?? persistedDecks[0]
        ?? committed.deck;
      const mediaDecks = createWorkerMediaDecks(committed.commitGraph, persistedDecks, preview.summary);
      const rawMediaTask = mediaStore.syncImportMedia(mediaDecks.length ? mediaDecks : decks);
      const mediaTask: MediaSyncTask = {
        get progress() { return rawMediaTask.progress; },
        pause: rawMediaTask.pause,
        resume: rawMediaTask.resume,
        cancel: rawMediaTask.cancel,
        subscribe: rawMediaTask.subscribe,
        result: rawMediaTask.result.then(async (mediaResult) => {
          if (mediaResult.status === "cloud-ready") {
            const withReferences = persistedDecks.map((deck) => ({ ...deck, mediaAssets: mediaResult.referencesByDeck.get(deck.id) ?? deck.mediaAssets ?? [] }));
            await persistImportedDecks(withReferences, { mediaOnly: true });
          }
          return mediaResult;
        }),
      };
      return { ...committed, deck: persistedDeck, decks: persistedDecks.length ? persistedDecks : decks, mediaTask };
    },

    importPastedDeck({ mode = "text", deckName = "Importierter Stapel", content = "", dryRun = false }: PasteImportInput = {}) {
      const normalizedMode = normalizePasteMode(mode);
      const input = createPasteImportInput({ mode: normalizedMode, deckName, content });

      return normalizedMode === "text"
        ? importTextAsNormalizedDeck(input, { dryRun })
        : importCsvAsNormalizedDeck(input, { dryRun });
    },

    importMappedCsvDeck({ deckName = "Importierter Stapel", records = [], dryRun = false }: MappedCsvImportInput = {}) {
      return importNormalizedDeck(createMappedCsvDeckInput(deckName, records), { dryRun });
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
