import { readAnkiPackage } from "./apkgImportInternal.ts";
import { createImportGraphChunks, describeImportGraph, readSampleMedia, translateAnkiPackage } from "./apkgNoteTranslation.ts";
import { parseApkgWorkerRequest, type ApkgWorkerResponse } from "./apkgImportWorkerProtocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: ApkgWorkerResponse, transfer?: Transferable[]): void;
  close(): void;
}

const workerScope = globalThis as unknown as WorkerScope;
let activeRequestId = "";
let commitChunks: AsyncIterator<any> | null = null;
let translatedGraph: ReturnType<typeof translateAnkiPackage> | null = null;

async function postNextCommitChunk() {
  if (!commitChunks || !activeRequestId) return;
  try {
    const next = await commitChunks.next();
    if (!next.done) {
      const bytes = next.value.kind === "media" ? next.value.file.bytes : null;
      workerScope.postMessage({ type: "commit-chunk", requestId: activeRequestId, chunk: next.value }, bytes ? [bytes.buffer] : []);
      return;
    }
    workerScope.postMessage({ type: "commit-done", requestId: activeRequestId });
  } catch (error) {
    workerScope.postMessage({ type: "error", requestId: activeRequestId, message: error instanceof Error ? error.message : "APKG-Medien konnten nicht gelesen werden." });
  }
  commitChunks = null;
  translatedGraph = null;
  workerScope.close();
}

workerScope.onmessage = async (event) => {
  const request = parseApkgWorkerRequest(event.data);
  if (!request.success) {
    workerScope.postMessage({ type: "error", requestId: "invalid", message: "Ungültige APKG-Worker-Nachricht." });
    workerScope.close();
    return;
  }

  if (request.output.type === "commit-next") {
    if (request.output.requestId === activeRequestId) void postNextCommitChunk();
    return;
  }

  if (request.output.type === "commit") {
    if (!translatedGraph || request.output.requestId !== activeRequestId) {
      workerScope.postMessage({ type: "error", requestId: request.output.requestId, message: "APKG-Vorschau ist nicht mehr verfügbar." });
      workerScope.close();
      return;
    }
    commitChunks = createImportGraphChunks(translatedGraph)[Symbol.asyncIterator]();
    void postNextCommitChunk();
    return;
  }

  const { requestId, file } = request.output;
  try {
    const pkg = await readAnkiPackage(file as File, (step) => workerScope.postMessage({ type: "progress", requestId, step }));
    workerScope.postMessage({ type: "progress", requestId, step: "translate" });
    translatedGraph = translateAnkiPackage(pkg);
    activeRequestId = requestId;
    workerScope.postMessage({ type: "progress", requestId, step: "preview" });
    const descriptor = describeImportGraph(translatedGraph);
    const sampleMedia = await readSampleMedia(translatedGraph, descriptor.samples);
    workerScope.postMessage({ type: "result", requestId, result: { ...descriptor, sampleMedia } as any }, sampleMedia.map((file) => file.bytes.buffer as ArrayBuffer));
  } catch (error) {
    workerScope.postMessage({ type: "error", requestId, message: error instanceof Error ? error.message : "APKG konnte im Import-Worker nicht gelesen werden." });
    workerScope.close();
  }
};
