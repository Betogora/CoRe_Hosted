import { createManualNoteContent, createOcclusionNoteContent, parseNoteContent, validateManualNoteInput, validateOcclusionInput, type ManualContentKind, type ManualNoteErrors, type ManualNoteInput, type OcclusionMode } from "./coreModel.ts";
import { createDocumentFromFile } from "./documentModel.ts";
import { appendPlainTextToCardHtml } from "./richText.ts";
import { createAccountMediaStore, type MediaSyncProgress, type MediaSyncStatus, type MediaSyncTask } from "./mediaStore.ts";
import type { Deck, NoteContent, OcclusionMask } from "./coreTypes.ts";
import { ANKI_PACKAGE_MAX_BYTES, type ApkgImportPreview, type ImportCommitGraph, type ImportMediaFile } from "./apkgImport.ts";
import { createImportCloudSyncTask, type ImportCloudSyncTask } from "./importCloudSyncTask.ts";
import type { ApkgImportJob } from "./apkgImportSession.ts";
export { createImportCloudSyncTask } from "./importCloudSyncTask.ts";
export type { ImportCloudSyncResult, ImportCloudSyncStatus, ImportCloudSyncTask } from "./importCloudSyncTask.ts";

export interface ManualImageAttachment {
  sha1: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  blob: Blob;
}


export interface ManualCreationInput {
  kind?: ManualContentKind;
  front?: string;
  back?: string;
  tags?: unknown;
  answerOptions?: string[];
  correctOptionIndices?: number[];
  mediaAttachments?: ManualImageAttachment[];
  additionalFields?: ManualNoteInput["additionalFields"];
  typeIn?: boolean;
  /** Image occlusion: front becomes the heading, back the extra; the image is a manual image named by its SHA-1. */
  occlusion?: { image: string; mode: OcclusionMode; masks: OcclusionMask[] };
}

type ManualValidation =
  | { ok: true; content: NoteContent; media: Record<string, string>; errors: ManualNoteErrors }
  | { ok: false; content: null; media: null; errors: ManualNoteErrors };

interface SelectionInput {
  activeField?: string;
  front?: string;
  back?: string;
  selectedText?: string;
}

export type ApkgCreationPreview = ApkgImportPreview;
export type CreationWorkflow = ReturnType<typeof createCreationWorkflow>;
type AccountMediaStore = ReturnType<typeof createAccountMediaStore>;

/** Local result of an import commit; the cloud task confirms the synchronized graph afterwards. */
export interface ImportedDeckPersistence {
  decks: Deck[];
  rootDeck: Deck | null;
  createdCount: number;
  keptLocalEdits: number;
  missingInPackage: number;
  cloudTask: ImportCloudSyncTask;
}

export type CommitImport = (
  graph: ImportCommitGraph,
  options: { onMedia: (file: ImportMediaFile) => Promise<void> },
) => Promise<ImportedDeckPersistence>;

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

/** Reports 10–80 % while the notes stream in; media and the cloud follow as their own tasks. */
function withCommitProgress(graph: ImportCommitGraph, reportProgress: (percent: number) => void): ImportCommitGraph {
  let processedCards = 0;
  return {
    ...graph,
    async streamChunks(visit) {
      reportProgress(10);
      await graph.streamChunks(async (chunk) => {
        await visit(chunk);
        if (chunk.kind !== "notes") return;
        processedCards += chunk.cards.length;
        reportProgress(10 + Math.min(1, graph.cardCount > 0 ? processedCards / graph.cardCount : 1) * 70);
      });
      reportProgress(80);
    },
  };
}

function createApkgJob(file: { name?: string; size?: number }, status: string, overrides: Partial<ApkgImportJob> = {}): ApkgImportJob {
  return {
    fileName: file?.name ?? "APKG-Datei",
    fileSize: file?.size ?? 0,
    status,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function createReadyCloudTask(): ImportCloudSyncTask {
  const task = createImportCloudSyncTask(async () => ({ status: "cloud-ready", message: "Cloud-Daten sind synchronisiert." }));
  void task.retry();
  return task;
}

const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const IMAGE_SOURCE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const DOWNSCALABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FULL_HD_LANDSCAPE = { width: 1_920, height: 1_080 } as const;

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

export function getManualImageReferences(input: Pick<ManualCreationInput, "front" | "back" | "additionalFields" | "occlusion"> = {}): string[] {
  const values = [
    input.front ?? "",
    input.back ?? "",
    ...(Array.isArray(input.additionalFields) ? input.additionalFields.map((field) => field.value ?? "") : []),
  ];
  const references: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const html = String(value ?? "");
    IMAGE_SOURCE_PATTERN.lastIndex = 0;
    let match = IMAGE_SOURCE_PATTERN.exec(html);
    while (match) {
      const reference = String(match[1] ?? match[2] ?? match[3] ?? "").trim().toLowerCase();
      if (SHA1_PATTERN.test(reference) && !seen.has(reference)) {
        seen.add(reference);
        references.push(reference);
      }
      match = IMAGE_SOURCE_PATTERN.exec(html);
    }
  }
  const image = input.occlusion?.image.toLowerCase();
  if (image && SHA1_PATTERN.test(image) && !seen.has(image)) references.push(image);
  return references;
}

function getReferencedManualImages(input: ManualCreationInput = {}): ManualImageAttachment[] {
  const attachments = new Map<string, ManualImageAttachment>();
  for (const value of input.mediaAttachments ?? []) {
    const attachment = normalizeManualImageAttachment(value);
    if (attachment) attachments.set(attachment.sha1, attachment);
  }
  return getManualImageReferences(input).map((reference) => {
    const attachment = attachments.get(reference);
    if (!attachment) throw new Error("Mindestens ein eingefügtes Bild ist nicht mehr verfügbar. Bitte füge es erneut ein.");
    return attachment;
  });
}

function manualNoteInput(input: ManualCreationInput): ManualNoteInput {
  return {
    kind: input.kind ?? "basic",
    front: input.front ?? "",
    back: input.back ?? "",
    answerOptions: (input.answerOptions ?? []).map((option) => String(option)),
    correctOptionIndices: input.correctOptionIndices ?? [],
    additionalFields: input.additionalFields ?? [],
    typeIn: input.typeIn === true,
    tags: input.tags,
  };
}

/** Validates the editor input and shapes it into content; manual images are named by their SHA-1. */
function validateManualCard(input: ManualCreationInput = {}): ManualValidation {
  if (input.occlusion) {
    const errors = validateOcclusionInput(input.occlusion);
    if (errors.image || errors.masks) return { ok: false, content: null, media: null, errors: { occlusion: errors.image ?? errors.masks } };
    const parsed = parseNoteContent(createOcclusionNoteContent({ ...input.occlusion, header: input.front, extra: input.back, additionalFields: input.additionalFields, tags: input.tags }));
    if (!parsed.ok) return { ok: false, content: null, media: null, errors: { occlusion: parsed.errors.join(" ") } };
    return { ok: true, content: parsed.value, media: Object.fromEntries(getManualImageReferences(input).map((sha1) => [sha1, sha1])), errors: {} };
  }
  const noteInput = manualNoteInput(input);
  const errors = validateManualNoteInput(noteInput);
  if (Object.keys(errors).length > 0) return { ok: false, content: null, media: null, errors };
  const parsed = parseNoteContent(createManualNoteContent(noteInput));
  if (!parsed.ok) return { ok: false, content: null, media: null, errors: { front: parsed.errors.join(" ") } };
  const media = Object.fromEntries(getManualImageReferences(input).map((sha1) => [sha1, sha1]));
  return { ok: true, content: parsed.value, media, errors: {} };
}

export function createCreationWorkflow({
  mediaStore = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "local-user" }),
  commitImport = async () => ({ decks: [], rootDeck: null, createdCount: 0, keptLocalEdits: 0, missingInPackage: 0, cloudTask: createReadyCloudTask() }),
}: { mediaStore?: AccountMediaStore; commitImport?: CommitImport } = {}) {
  return {
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

    getManualImageReferences,

    getReferencedManualImages,

    validateManualCard,

    /** Stores the images locally and queues their upload before the content is saved. */
    async prepareManualMedia(attachments: Array<ManualImageAttachment | null | undefined>) {
      const unique = new Map<string, ManualImageAttachment>();
      for (const value of attachments) {
        if (!value) continue;
        const attachment = normalizeManualImageAttachment(value);
        if (!attachment) throw new Error("Mindestens ein Bild enthält ungültige Dateidaten.");
        unique.set(attachment.sha1, attachment);
      }
      const prepared = [...unique.values()];
      if (prepared.length === 0) return prepared;
      const cached = await mediaStore.cacheMedia(prepared.map((attachment) => ({ sha1: attachment.sha1, name: attachment.originalName, size: attachment.size, mimeType: attachment.mimeType, blob: attachment.blob })));
      if (cached.count !== prepared.length) {
        throw new Error(cached.errors[0] || "Mindestens ein Bild konnte nicht lokal gespeichert werden.");
      }
      return prepared;
    },

    async syncManualMedia(attachments: ManualImageAttachment[], options: { onProgress?: (progress: MediaSyncProgress) => void } = {}): Promise<{ status: MediaSyncStatus; message: string }> {
      if (attachments.length === 0) return { status: "cloud-ready", message: "" };
      try {
        const result = await mediaStore.syncQueuedMedia({
          sha1s: attachments.map((attachment) => attachment.sha1),
          onProgress: options.onProgress,
        }).result;
        return { status: result.status, message: result.message };
      } catch (error) {
        return { status: "blocked", message: describeError(error, "Die Karte ist lokal gespeichert, aber mindestens ein Bild konnte nicht gespeichert werden.") };
      }
    },

    async parseApkgFile(file: File, { onStep, signal }: { onStep?: (step: string) => void; signal?: AbortSignal } = {}) {
      try {
        if (file.size > ANKI_PACKAGE_MAX_BYTES) {
          throw new Error("Die Anki-Datei ist größer als 2 GiB. Bitte wähle eine kleinere Datei aus.");
        }
        const { createApkgImportPreview } = await import("./apkgImport.ts");
        const preview = await createApkgImportPreview(file, { onStep, signal });
        return { preview, job: createApkgJob(file, "preview", { warnings: preview.report.warnings }) };
      } catch (error) {
        return {
          preview: null,
          job: createApkgJob(file, "error", { errors: [describeError(error, "Der Import ist fehlgeschlagen.")] }),
        };
      }
    },

    /** Persists the previewed graph in chunks, caches every media file locally and queues its upload. */
    async commitApkgPreview(preview: ApkgCreationPreview | null, { onProgress }: { onProgress?: (percent: number) => void } = {}) {
      const reportProgress = createProgressReporter(onProgress);
      reportProgress(0);
      if (!preview) throw new Error("Keine Anki-Vorschau zum Importieren vorhanden.");
      const mediaSha1s: string[] = [];
      const persistence = await commitImport(withCommitProgress(preview.commitGraph, reportProgress), {
        async onMedia(file) {
          const cached = await mediaStore.cacheMedia([{ sha1: file.sha1, name: file.name, size: file.size, mimeType: file.mimeType, bytes: file.bytes }]);
          if (cached.count !== 1) throw new Error(cached.errors[0] || `Die Mediendatei „${file.name}“ konnte nicht lokal gespeichert werden.`);
          mediaSha1s.push(file.sha1);
        },
      });
      const mediaTask: MediaSyncTask | null = mediaSha1s.length
        ? mediaStore.syncQueuedMedia({ sha1s: mediaSha1s, waitUntilReady: persistence.cloudTask.ready })
        : null;
      await mediaTask?.queued;
      reportProgress(100);
      return { ...persistence, mediaTask };
    },

    async readSourceDocument(file: Parameters<typeof createDocumentFromFile>[0]) {
      return createDocumentFromFile(file);
    },

    captureManualSelection({ activeField = "front", front = "", back = "", selectedText = "" }: SelectionInput = {}) {
      const selection = String(selectedText ?? "").trim();
      if (!selection) return { changed: false, front, back };

      return {
        changed: true,
        front: activeField === "back" ? front : appendPlainTextToCardHtml(front, selection),
        back: activeField === "back" ? appendPlainTextToCardHtml(back, selection) : back,
      };
    },
  };
}
