import { makeId } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { ApkgTranslationReport, ImportDeck, ImportReviewEvent, NoteSource, NoteTypeSource } from "./apkgNoteTranslation.ts";
import { parseApkgWorkerResponse } from "./apkgImportWorkerProtocol.ts";

export { ANKI_PACKAGE_MAX_BYTES } from "./apkgImportInternal.ts";
export type { ApkgTranslationReport, ImportDeck, ImportReviewEvent, NoteSource, NoteTypeSource } from "./apkgNoteTranslation.ts";

/** A media file of the package; its bytes were read from the archive and checked against the SHA-1. */
export interface ImportMediaFile {
  name: string;
  sha1: string;
  size: number;
  mimeType: string;
  bytes: Uint8Array;
}

export type ImportGraphChunk =
  | { kind: "decks"; decks: ImportDeck[] }
  | { kind: "note-type-sources"; values: NoteTypeSource[] }
  | { kind: "notes"; notes: Note[]; noteSources: NoteSource[]; cards: Card[] }
  | { kind: "reviews"; values: ImportReviewEvent[] }
  | { kind: "media"; file: ImportMediaFile };

/** Translated package kept in the worker; the main thread streams it in bounded chunks. */
export interface ImportCommitGraph {
  deckCount: number;
  noteCount: number;
  cardCount: number;
  reviewEventCount: number;
  mediaCount: number;
  ankiGuids: string[];
  streamChunks(visit: (chunk: ImportGraphChunk) => Promise<void>): Promise<void>;
  dispose(): void;
}

export interface ApkgImportPreview {
  fileName: string;
  fileSize: number;
  rootDeckName: string;
  report: ApkgTranslationReport;
  samples: Array<{ note: Note; card: Card; notetypeName: string }>;
  /** Media of the samples for the preview only; the commit reads every file again. */
  sampleMedia: ImportMediaFile[];
  commitGraph: ImportCommitGraph;
}

interface ApkgPreviewDescriptor {
  rootDeckName: string;
  report: ApkgTranslationReport;
  samples: Array<{ note: Note; card: Card; notetypeName: string }>;
  sampleMedia: ImportMediaFile[];
  counts: Pick<ImportCommitGraph, "deckCount" | "noteCount" | "cardCount" | "reviewEventCount" | "mediaCount" | "ankiGuids">;
}

function canUseWorker(): boolean {
  return typeof Worker === "function";
}

/** In-process translation for Node tests and scripts; browsers always use the worker. */
async function translateInProcess(file: Blob & { name: string }, onStep: (step: string) => void) {
  const [{ readAnkiPackage }, { translateAnkiPackage, createImportGraphChunks, describeImportGraph, readSampleMedia }] = await Promise.all([
    import("./apkgImportInternal.ts"),
    import("./apkgNoteTranslation.ts"),
  ]);
  const pkg = await readAnkiPackage(file, onStep);
  onStep("translate");
  const graph = await translateAnkiPackage(pkg);
  const description = describeImportGraph(graph);
  const descriptor: ApkgPreviewDescriptor = { ...description, sampleMedia: await readSampleMedia(graph, description.samples) };
  return {
    descriptor,
    commitGraph: {
      ...descriptor.counts,
      async streamChunks(visit: (chunk: ImportGraphChunk) => Promise<void>) {
        for await (const chunk of createImportGraphChunks(graph)) await visit(chunk);
      },
      dispose() {},
    } satisfies ImportCommitGraph,
  };
}

function translateInWorker(file: File, onStep: (step: string) => void, signal?: AbortSignal): Promise<{ descriptor: ApkgPreviewDescriptor; commitGraph: ImportCommitGraph }> {
  const requestId = makeId("apkg-worker");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./apkgImportWorker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("APKG-Import wurde abgebrochen.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => fail(new Error("APKG-Import-Worker ist unerwartet abgebrochen."));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = parseApkgWorkerResponse(event.data);
      if (!response.success || (response.output.requestId !== requestId && response.output.requestId !== "invalid")) {
        fail(new Error("APKG-Worker hat eine ungültige Nachricht geliefert."));
        return;
      }
      if (response.output.type === "progress") {
        onStep(response.output.step);
        return;
      }
      if (response.output.type === "error") {
        fail(new Error(response.output.message));
        return;
      }
      if (response.output.type !== "result") {
        fail(new Error("APKG-Worker hat vorzeitig Commitdaten geliefert."));
        return;
      }
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      const descriptor = response.output.result as unknown as ApkgPreviewDescriptor;
      resolve({
        descriptor,
        commitGraph: {
          ...descriptor.counts,
          dispose() { cleanup(); },
          streamChunks(visit) {
            return new Promise<void>((resolveCommit, rejectCommit) => {
              let failed = false;
              const stop = (error: Error) => {
                if (failed) return;
                failed = true;
                cleanup();
                rejectCommit(error);
              };
              worker.onerror = () => stop(new Error("APKG-Import-Worker ist unerwartet abgebrochen."));
              worker.onmessage = (commitEvent: MessageEvent<unknown>) => {
                const commitResponse = parseApkgWorkerResponse(commitEvent.data);
                if (!commitResponse.success || commitResponse.output.requestId !== requestId) {
                  stop(new Error("APKG-Worker hat eine ungültige Commit-Nachricht geliefert."));
                  return;
                }
                if (commitResponse.output.type === "error") {
                  stop(new Error(commitResponse.output.message));
                  return;
                }
                if (commitResponse.output.type === "commit-done") {
                  cleanup();
                  resolveCommit();
                  return;
                }
                if (commitResponse.output.type !== "commit-chunk") {
                  stop(new Error("APKG-Worker hat eine unerwartete Commit-Nachricht geliefert."));
                  return;
                }
                visit(commitResponse.output.chunk as ImportGraphChunk)
                  .then(() => worker.postMessage({ type: "commit-next", requestId }))
                  .catch((error) => stop(error instanceof Error ? error : new Error("APKG-Commit ist fehlgeschlagen.")));
              };
              worker.postMessage({ type: "commit", requestId });
            });
          },
        },
      });
    };
    worker.postMessage({ type: "parse", requestId, file });
  });
}

/** Reads and translates a package once; its graph stays in the worker until it is committed or disposed. */
export async function createApkgImportPreview(
  file: Blob & { name: string; size: number },
  { onStep = () => {}, signal }: { onStep?: (step: string) => void; signal?: AbortSignal } = {},
): Promise<ApkgImportPreview> {
  if (!canUseWorker() && typeof window !== "undefined") throw new Error("APKG-Import benötigt einen unterstützten Web Worker.");
  const { descriptor, commitGraph } = canUseWorker()
    ? await translateInWorker(file as File, onStep, signal)
    : await translateInProcess(file, onStep);
  if (descriptor.report.errors.length > 0) {
    commitGraph.dispose();
    throw new Error(descriptor.report.errors[0]);
  }
  return {
    fileName: file.name,
    fileSize: file.size,
    rootDeckName: descriptor.rootDeckName,
    report: descriptor.report,
    samples: descriptor.samples,
    sampleMedia: descriptor.sampleMedia ?? [],
    commitGraph,
  };
}
