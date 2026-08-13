import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { parseApkgToNormalizedImport, prepareApkgWorkerResult } from "../src/apkgImportInternal.ts";

if (!parentPort) throw new Error("APKG-Benchmark-Worker benötigt einen Parent-Port.");

parentPort.once("message", async ({ buffer, name }: { buffer: ArrayBuffer; name: string }) => {
  const startedAt = performance.now();
  const parsed = await parseApkgToNormalizedImport({
    name,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer,
  }, {
    onStep(step: string) { parentPort!.postMessage({ type: "progress", step }); },
  });
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const result = prepareApkgWorkerResult(parsed);
  const preview = {
    ...result,
    commitGraph: {
      kind: "worker-import",
      deckCount: result.commitGraph.decks.length,
      cardCount: result.commitGraph.decks.reduce((sum: number, deck: any) => sum + deck.cards.length, 0),
      noteTypeDefinitions: result.commitGraph.noteTypeDefinitions.slice(0, 5),
    },
  };
  parentPort!.postMessage({ type: "ready" });
  parentPort!.postMessage({
    type: "result",
    result: preview,
    workerMs: performance.now() - startedAt,
    heapUsedBytes: process.memoryUsage().heapUsed,
  });
});
