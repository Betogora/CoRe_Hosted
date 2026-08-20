import {
  createCoreNoteTypeDefinition,
  createLearningItemDocumentFromLegacy,
  createManualCoreDeck,
  normalizeTags,
  stableContentHash,
  validateCardEditorValue,
} from "./coreModel.ts";
import { findChoiceAnswerIndices, normalizeChoiceAnswerList } from "./choiceAnswers.ts";
import { createDocumentFromFile, READABLE_SOURCE_DOCUMENT_ACCEPT, READABLE_SOURCE_DOCUMENT_LABEL, type TransientSourceDocument } from "./documentModel.ts";
import { appendPlainTextToCardHtml } from "./richText.ts";
import { createAccountMediaStore, type MediaObjectUploadPlan, type MediaSyncProgress, type MediaSyncResult, type MediaSyncTask } from "./mediaStore.ts";
import type { CardEditorValue, CardType, Deck, EditableCardType, ImportCommitGraph, LearningItem } from "./coreTypes.ts";
import { LOCAL_APKG_MAX_BYTES, type ApkgImportReportV1 } from "./apkgImport.ts";
import { createImportCloudSyncTask, type ImportCloudSyncTask } from "./importCloudSyncTask.ts";
export { createImportCloudSyncTask } from "./importCloudSyncTask.ts";
export type { ImportCloudSyncResult, ImportCloudSyncStatus, ImportCloudSyncTask } from "./importCloudSyncTask.ts";

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

export interface ManualMediaSyncProgress extends MediaSyncProgress {
  phase: "uploading" | "persisting-references";
}

interface ManualCreationInput {
  deckName?: string;
  cardType?: CardType;
  front?: string;
  back?: string;
  tags?: unknown;
  answerOptions?: unknown;
  correctAnswer?: unknown;
  correctAnswers?: unknown;
  expectedAnswer?: unknown;
  document?: TransientSourceDocument | null;
  documentText?: string;
  selection?: string;
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
  onProgress?: (percent: number) => void;
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

interface SelectionInput {
  activeField?: string;
  front?: string;
  back?: string;
  document?: TransientSourceDocument | null;
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
  correctAnswers?: unknown;
}

export type CreationWorkflow = ReturnType<typeof createCreationWorkflow>;
type AccountMediaStore = ReturnType<typeof createAccountMediaStore>;

export interface ImportedDeckPersistence {
  decks: Deck[];
  cloudTask: ImportCloudSyncTask;
}

export interface ImportCompletion {
  deck: Deck;
  createdCount: number;
}

function createReadyCloudTask(): ImportCloudSyncTask {
  const task = createImportCloudSyncTask(async () => ({ status: "cloud-ready", message: "Cloud-Daten sind synchronisiert." }));
  void task.retry();
  return task;
}

function loadApkgImport(): Promise<typeof import("./apkgImport.ts")> {
  return import("./apkgImport.ts");
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createProgressReporter(onProgress?: (percent: number) => void) {
  let reported = -1;
  return (percent: number) => {
    const next = Math.max(0, Math.min(100, Math.round(percent)));
    if (next <= reported) return;
    reported = next;
    onProgress?.(next);
  };
}

function withCommitProgress(graph: ImportCommitGraph, reportProgress: (percent: number) => void): ImportCommitGraph {
  if (graph.kind !== "worker-import") return graph;
  let processedCards = 0;
  return {
    ...graph,
    async streamChunks(visit: (chunk: unknown) => Promise<void>) {
      reportProgress(10);
      await graph.streamChunks(async (value) => {
        await visit(value);
        const chunk = value && typeof value === "object" ? value as { kind?: unknown; values?: unknown } : null;
        if (chunk?.kind === "cards" && Array.isArray(chunk.values)) {
          processedCards += chunk.values.length;
          const cardProgress = graph.cardCount > 0 ? processedCards / graph.cardCount : 1;
          reportProgress(10 + Math.min(1, cardProgress) * 70);
        } else if (chunk?.kind === "outbox") {
          reportProgress(80);
        }
      });
      reportProgress(80);
    },
  };
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

function createWorkerMediaPlan(graph: ImportCommitGraph, persistedDecks: Deck[], summary: Deck): {
  decks: Deck[];
  objectUploads: MediaObjectUploadPlan | null;
  expectedReferences: number;
  expectedOperations: number;
} {
  if (graph.kind !== "worker-import") {
    return { decks: persistedDecks, objectUploads: null, expectedReferences: 0, expectedOperations: 0 };
  }
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
  const referencedNames = new Set([...namesByDeckId.values()].flatMap((names) => [...names]));
  const decks = persistedDecks.map((deck) => {
    const names = namesByDeckId.get(deck.id);
    return {
      ...deck,
      cards: [],
      cardCount: Math.max(1, deck.cardCount),
      importMeta: {
        ...deck.importMeta,
        mediaManifest: {
          ...(manifest ?? {}),
          assets: (manifest?.assets ?? []).filter((asset) => names?.has(String(asset.name ?? ""))),
        },
      },
    };
  });
  const objectOnlyAssets = (manifest?.assets ?? []).filter((asset) => !referencedNames.has(String(asset.name ?? "")));
  const ownerDeckId = persistedByIncomingId.get(graph.deckIdentities[0]?.id)?.id ?? persistedDecks[0]?.id ?? "";
  const objectUploads = ownerDeckId && objectOnlyAssets.length ? { deckId: ownerDeckId, assets: objectOnlyAssets } : null;
  const expectedReferences = [...namesByDeckId.values()].reduce((sum, names) => sum + names.size, 0);
  return {
    decks,
    objectUploads,
    expectedReferences,
    expectedOperations: expectedReferences + objectOnlyAssets.length,
  };
}

function verifiedMediaResult(result: MediaSyncResult, expectedReferences: number, expectedOperations: number): MediaSyncResult {
  if (result.status !== "cloud-ready") return result;
  const activeReferences = [...result.referencesByDeck.values()].reduce((sum, references) => sum + references.filter((reference) => !reference.deletedAt).length, 0);
  if (result.progress.completed !== expectedOperations || result.progress.total !== expectedOperations || activeReferences !== expectedReferences) {
    return {
      ...result,
      status: "blocked",
      failureKind: "integrity",
      message: "Medienobjekte und Medienreferenzen konnten nicht vollständig bestätigt werden.",
    };
  }
  return result;
}

function normalizeAnswerOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((option) => String(option).trim());
  return String(value ?? "")
    .split(/\n+/)
    .map((option) => option.trim());
}

const SUPPORTED_MANUAL_CARD_TYPES = new Set<CardType>(["basic", "basic-with-images", "basic-reversed", "cloze", "single-choice", "multiple-choice"]);
const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const DOWNSCALABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FULL_HD_LANDSCAPE = { width: 1_920, height: 1_080 } as const;

function normalizeManualCardType(cardType: unknown): EditableCardType {
  return typeof cardType === "string" && SUPPORTED_MANUAL_CARD_TYPES.has(cardType as CardType) ? cardType as EditableCardType : "basic";
}

function normalizeChoiceData(input: ManualCreationInput = {}, answerOptions: string[] = []) {
  const correctAnswers = normalizeChoiceAnswerList(input.correctAnswers ?? input.correctAnswer ?? answerOptions[0] ?? input.back ?? "");
  return {
    answerOptions,
    correctAnswers,
    correctOptionIndices: findChoiceAnswerIndices(answerOptions, correctAnswers),
  };
}

function fullHdImageSize(width: number, height: number) {
  const bounds = width >= height ? FULL_HD_LANDSCAPE : { width: FULL_HD_LANDSCAPE.height, height: FULL_HD_LANDSCAPE.width };
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function downscaleManualImage(file: Blob): Promise<Blob> {
  if (!DOWNSCALABLE_IMAGE_TYPES.has(file.type) || typeof globalThis.createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Das Bild konnte nicht gelesen werden.");
  }
  const size = fullHdImageSize(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && size.height === bitmap.height) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Das Bild konnte nicht verkleinert werden.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
  } finally {
    bitmap.close();
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Das Bild konnte nicht verkleinert werden.")), file.type, 0.9);
  });
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

function appendManualImage(html: string, image: ManualImageAttachment | null, alt: string): string {
  return image ? `${html}<p><img src="${image.sha1}" alt="${alt}"></p>` : html;
}

function createManualDeckInput(input: ManualCreationInput = {}) {
  const requestedCardType = normalizeManualCardType(input.cardType);
  const document = input.document ?? null;
  const choice = normalizeChoiceData(input, normalizeAnswerOptions(input.answerOptions));
  const tags = normalizeTags(input.tags);
  const frontImage = normalizeManualImageAttachment(input.frontImage);
  const backImage = normalizeManualImageAttachment(input.backImage);
  const front = appendManualImage(input.front ?? "", frontImage, "Bild zur Vorderseite");
  const back = appendManualImage(input.back ?? "", backImage, "Bild zur Rückseite");
  const editorValue: CardEditorValue = requestedCardType === "cloze"
    ? { cardType: "cloze", textWithClozes: front, extra: back, tags }
    : requestedCardType === "single-choice"
      ? { cardType: "single-choice", question: front, options: choice.answerOptions, correctOptionIndex: choice.correctOptionIndices[0] ?? -1, explanation: back, tags }
      : requestedCardType === "multiple-choice"
        ? { cardType: "multiple-choice", question: front, options: choice.answerOptions, correctOptionIndices: choice.correctOptionIndices, explanation: back, tags }
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
    ...(requestedCardType === "single-choice" || requestedCardType === "multiple-choice"
      ? { interaction: { choice: { options: choice.answerOptions, correctAnswers: choice.correctAnswers, explanation: back } } }
      : {}),
  };
  const noteTypeDefinition = createCoreNoteTypeDefinition({
    document: contentDocument,
    kind: requestedCardType === "cloze" ? "cloze" : "normal",
    interaction: requestedCardType === "single-choice" || requestedCardType === "multiple-choice" ? "choice" : requestedCardType === "cloze" ? "cloze" : "reveal",
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
      targetField: input.activeField ?? "front",
    },
  };
}

export function createCreationWorkflow({ mediaStore = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "local-user" }), persistImportedDecks = async (decks: Deck[]) => ({ decks, cloudTask: createReadyCloudTask() }) }: { mediaStore?: AccountMediaStore; persistImportedDecks?: (decks: Deck[], options?: { mediaOnly?: boolean; commitGraph?: ImportCommitGraph }) => Promise<ImportedDeckPersistence> } = {}) {
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
      const image = await downscaleManualImage(file);
      const digest = await globalThis.crypto.subtle.digest("SHA-1", await image.arrayBuffer());
      const sha1 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return {
        sha1,
        name: sha1,
        originalName: String(file.name ?? "Eingefügtes Bild"),
        size: image.size,
        mimeType: image.type || file.type,
        blob: image,
      };
    },

    async prepareManualMedia(deck: Deck, attachments: Array<ManualImageAttachment | null | undefined>) {
      const unique = new Map<string, ManualImageAttachment>();
      for (const value of attachments) {
        if (!value) continue;
        const attachment = normalizeManualImageAttachment(value);
        if (!attachment) throw new Error("Mindestens ein Bild enthält ungültige Dateidaten.");
        unique.set(attachment.sha1, attachment);
      }
      const prepared = [...unique.values()];
      if (prepared.length === 0) return prepared;
      const cached = await mediaStore.cachePreviewMedia(deck, prepared);
      if (cached.count !== prepared.length) {
        throw new Error(cached.errors[0] || "Mindestens ein Bild konnte nicht lokal gespeichert werden.");
      }
      return prepared;
    },

    async syncManualMedia(deck: Deck, attachments: ManualImageAttachment[], options: { onProgress?: (progress: ManualMediaSyncProgress) => void } = {}) {
      if (attachments.length === 0) return { deck, status: "cloud-ready" as const, message: "", errors: [] };
      try {
        const originalNames = new Map(attachments.map((attachment) => [attachment.name, attachment.originalName]));
        const result = await mediaStore.syncImportMedia([deck], {
          onProgress(progress) {
            options.onProgress?.({
              ...progress,
              phase: "uploading",
              currentName: originalNames.get(progress.currentName) ?? progress.currentName,
            });
          },
        }).result;
        const references = result.referencesByDeck.get(deck.id);
        let updatedDeck = references ? { ...deck, mediaAssets: references } : deck;
        if (references) {
          options.onProgress?.({ ...result.progress, phase: "persisting-references", currentName: "" });
          const persisted = await persistImportedDecks([updatedDeck], { mediaOnly: true });
          updatedDeck = persisted.decks.find((candidate) => candidate.id === deck.id) ?? updatedDeck;
          const referenceResult = await persisted.cloudTask.retry();
          if (referenceResult.status !== "cloud-ready") {
            return {
              deck: updatedDeck,
              status: referenceResult.status === "blocked" ? "blocked" as const : "local-pending" as const,
              message: referenceResult.message,
              errors: [],
            };
          }
        }
        return { deck: updatedDeck, status: result.status, message: result.message, errors: [] };
      } catch (error) {
        return {
          deck,
          status: "blocked" as const,
          message: "Die Karte ist lokal gespeichert, aber die Medienverknüpfung konnte nicht vollständig gespeichert werden.",
          errors: [describeError(error, "Bild konnte nicht gespeichert werden.")],
        };
      }
    },

    async parseApkgFile(file: FileLike, { onStep, existingDecks = [] }: ApkgOptions = {}) {
      try {
        if (Number(file.size ?? 0) > LOCAL_APKG_MAX_BYTES) {
          throw new Error("Die APKG-Datei ist größer als 250 MB. Bitte wähle eine kleinere Datei aus.");
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

    async commitApkgPreview(preview: ApkgCreationPreview | null, { existingDecks = [], onProgress }: ApkgOptions = {}) {
      const reportProgress = createProgressReporter(onProgress);
      reportProgress(0);
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
      reportProgress(10);
      const decks = (committed.decks?.length ? committed.decks : committed.deck ? [committed.deck] : []) as Deck[];
      if (committed.report.errors.length > 0 || decks.length === 0) return { ...committed, mediaTask: null as MediaSyncTask | null };
      const persistence = await persistImportedDecks(decks, { commitGraph: withCommitProgress(committed.commitGraph, reportProgress) });
      const persistedDecks = persistence.decks;
      const persistedDeck = persistedDecks.find((deck) => deck.id === committed.deck?.id)
        ?? persistedDecks.find((deck) => deck.originalDeckId && deck.originalDeckId === committed.deck?.originalDeckId)
        ?? persistedDecks.find((deck) => deck.cardCount > 0)
        ?? persistedDecks[0]
        ?? committed.deck;
      const mediaPlan = createWorkerMediaPlan(committed.commitGraph, persistedDecks, preview.summary);
      const mediaDecks = mediaPlan.decks.length ? mediaPlan.decks : decks;
      const rawMediaTask = mediaStore.syncImportMedia(mediaDecks, { waitUntilReady: persistence.cloudTask.ready, objectUploads: mediaPlan.objectUploads });
      await rawMediaTask.queued;
      reportProgress(100);
      const mediaTask: MediaSyncTask = {
        queued: rawMediaTask.queued,
        get progress() { return rawMediaTask.progress; },
        pause: rawMediaTask.pause,
        resume: rawMediaTask.resume,
        cancel: rawMediaTask.cancel,
        subscribe: rawMediaTask.subscribe,
        result: rawMediaTask.result.then(async (rawMediaResult) => {
          const mediaResult = verifiedMediaResult(rawMediaResult, mediaPlan.expectedReferences, mediaPlan.expectedOperations);
          if (mediaResult.status === "cloud-ready") {
            const withReferences = persistedDecks.map((deck) => ({ ...deck, mediaAssets: mediaResult.referencesByDeck.get(deck.id) ?? deck.mediaAssets ?? [] }));
            const referencePersistence = await persistImportedDecks(withReferences, { mediaOnly: true });
            try {
              await referencePersistence.cloudTask.ready;
            } catch (error) {
              return {
                ...mediaResult,
                status: "blocked" as const,
                message: describeError(error, "Die Medienreferenzen konnten nicht in der Cloud bestätigt werden."),
              };
            }
          }
          return mediaResult;
        }),
      };
      const createdCount = committed.commitGraph.kind === "worker-import"
        ? committed.commitGraph.cardCount
        : decks.reduce((sum, deck) => sum + deck.cards.filter((card) => card.status !== "deleted").length, 0);
      return { ...committed, deck: persistedDeck, decks: persistedDecks.length ? persistedDecks : decks, createdCount, cloudTask: persistence.cloudTask, mediaTask };
    },

    async readSourceDocument(file: FileLike) {
      return createDocumentFromFile(file);
    },

    captureManualSelection({ activeField = "front", front = "", back = "", selectedText = "" }: SelectionInput = {}) {
      const selection = String(selectedText ?? "").trim();
      if (!selection) return { changed: false, front, back, selection: "" };

      return {
        changed: true,
        selection,
        front: activeField === "back" ? front : appendPlainTextToCardHtml(front, selection),
        back: activeField === "back" ? appendPlainTextToCardHtml(back, selection) : back,
      };
    },

    canCreateManualCard({ cardType = "basic", front = "", back = "", answerOptions = [], correctAnswer = "", correctAnswers }: ManualValidationInput = {}) {
      return validateCardEditorValue(createManualDeckInput({ cardType, front, back, answerOptions, correctAnswer, correctAnswers }).card.editorValue).ok;
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
