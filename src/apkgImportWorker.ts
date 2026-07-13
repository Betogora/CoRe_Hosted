import { parseApkgToNormalizedImport } from "./apkgImport.ts";
import { parseApkgWorkerRequest, type ApkgWorkerResponse } from "./apkgImportWorkerProtocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: ApkgWorkerResponse, transfer?: Transferable[]): void;
  close(): void;
}

const workerScope = globalThis as unknown as WorkerScope;

function serializablePackage(parsedPackage: any) {
  if (!parsedPackage) return null;
  return {
    file: parsedPackage.file
      ? {
          name: String(parsedPackage.file.name ?? "anki.apkg"),
          size: Number(parsedPackage.file.size ?? 0),
          type: String(parsedPackage.file.type ?? "application/octet-stream"),
          lastModified: Number(parsedPackage.file.lastModified ?? 0),
        }
      : null,
    colRows: parsedPackage.colRows ?? [],
    decks: parsedPackage.decks ?? [],
    notes: parsedPackage.notes ?? [],
    cards: parsedPackage.cards ?? [],
    mediaBundle: parsedPackage.mediaBundle ?? null,
  };
}

function transferableMediaBuffers(result: any): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  const mediaFiles = [
    ...(Array.isArray(result.mediaFiles) ? result.mediaFiles : []),
    ...(Array.isArray(result.parsedPackage?.mediaBundle?.mediaFiles) ? result.parsedPackage.mediaBundle.mediaFiles : []),
  ];
  for (const mediaFile of mediaFiles) {
    const buffer = mediaFile?.bytes?.buffer;
    if (buffer instanceof ArrayBuffer) buffers.add(buffer);
  }
  return [...buffers];
}

workerScope.onmessage = async (event) => {
  const request = parseApkgWorkerRequest(event.data);
  if (!request.success) {
    workerScope.postMessage({ type: "error", requestId: "invalid", message: "Ungültige APKG-Worker-Nachricht." });
    workerScope.close();
    return;
  }

  const { requestId, file: metadata, buffer } = request.output;
  try {
    const file = new File([buffer], metadata.name, {
      type: metadata.type,
      lastModified: metadata.lastModified,
    });
    const parsed = await parseApkgToNormalizedImport(file, {
      onStep(step: string) {
        workerScope.postMessage({ type: "progress", requestId, step });
      },
    });
    const result = {
      normalizedDeck: parsed.normalizedDeck,
      warnings: parsed.warnings,
      errors: parsed.errors,
      mediaFiles: parsed.mediaFiles,
      parsedPackage: serializablePackage(parsed.parsedPackage),
    };
    workerScope.postMessage({ type: "result", requestId, result }, transferableMediaBuffers(result));
  } catch {
    workerScope.postMessage({ type: "error", requestId, message: "APKG konnte im Import-Worker nicht gelesen werden." });
  } finally {
    workerScope.close();
  }
};
