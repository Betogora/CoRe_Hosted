import { prepareApkgWorkerResult, parseApkgToNormalizedImport } from "./apkgImportInternal.ts";
import { parseApkgWorkerRequest, type ApkgWorkerResponse } from "./apkgImportWorkerProtocol.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: ApkgWorkerResponse, transfer?: Transferable[]): void;
  close(): void;
}

const workerScope = globalThis as unknown as WorkerScope;
let preparedResult: any = null;
let activeRequestId = "";
let commitChunks: Iterator<any> | null = null;

function* createCommitChunks(graph: any): Generator<any> {
  const definitions = new Map(graph.noteTypeDefinitions.map((definition: any) => [definition.id, definition]));
  const snapshots = new Map(graph.sourceSnapshots.map((snapshot: any) => [snapshot.id, snapshot]));
  yield { kind: "definitions", values: graph.noteTypeDefinitions };
  for (const deck of graph.decks) {
    const { cards, reviewEvents, ...summary } = deck;
    yield { kind: "deck", summary };
    for (let offset = 0; offset < cards.length; offset += 100) {
      const values = cards.slice(offset, offset + 100);
      yield {
        kind: "cards",
        deckId: deck.id,
        values,
        definitions: [...new Set(values.map((card: any) => card.noteTypeDefinitionId))]
          .map((id) => definitions.get(id))
          .filter(Boolean),
        snapshots: values.flatMap((card: any) => {
          const snapshot = snapshots.get(card.latestSourceSnapshotId);
          return snapshot ? [{ snapshot, cardId: card.id, attachToCard: true }] : [];
        }),
      };
    }
    for (let offset = 0; offset < reviewEvents.length; offset += 250) {
      yield { kind: "reviews", deckId: deck.id, values: reviewEvents.slice(offset, offset + 250) };
    }
  }
  yield { kind: "outbox" };
}

function postNextCommitChunk() {
  if (!commitChunks || !activeRequestId) return;
  const next = commitChunks.next();
  if (!next.done) {
    workerScope.postMessage({ type: "commit-chunk", requestId: activeRequestId, chunk: next.value });
    return;
  }
  workerScope.postMessage({ type: "commit-done", requestId: activeRequestId });
  commitChunks = null;
  preparedResult = null;
  workerScope.close();
}

function transferableMediaBuffers(result: any): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  const mediaFiles = [
    ...(Array.isArray(result.mediaFiles) ? result.mediaFiles : []),
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

  if (request.output.type === "commit-next") {
    if (request.output.requestId === activeRequestId) postNextCommitChunk();
    return;
  }

  if (request.output.type === "commit") {
    if (!preparedResult || request.output.requestId !== activeRequestId) {
      workerScope.postMessage({ type: "error", requestId: request.output.requestId, message: "APKG-Vorschau ist nicht mehr verfügbar." });
      workerScope.close();
      return;
    }
    const graph = preparedResult.commitGraph;
    commitChunks = createCommitChunks(graph);
    postNextCommitChunk();
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
    const result = prepareApkgWorkerResult(parsed);
    preparedResult = result;
    activeRequestId = requestId;
    const sampleDefinitionIds = new Set(result.sampleCards.map((card: any) => card.noteTypeDefinitionId));
    const { mediaTargets, ...previewResult } = result;
    const preview = {
      ...previewResult,
      commitGraph: {
        kind: "worker-import",
        deckCount: result.commitGraph.decks.length,
        cardCount: result.commitGraph.decks.reduce((sum: number, deck: any) => sum + deck.cards.length, 0),
        noteTypeDefinitions: result.commitGraph.noteTypeDefinitions.filter((definition: any) => sampleDefinitionIds.has(definition.id)),
        deckIdentities: result.commitGraph.decks.map((deck: any) => ({ id: deck.id, originalDeckId: deck.originalDeckId ?? null })),
        mediaTargets,
      },
    };
    workerScope.postMessage({ type: "result", requestId, result: preview }, transferableMediaBuffers(preview));
  } catch {
    workerScope.postMessage({ type: "error", requestId, message: "APKG konnte im Import-Worker nicht gelesen werden." });
    workerScope.close();
  }
};
