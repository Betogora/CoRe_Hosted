import { openAsBlob } from "node:fs";
import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { parseApkgToNormalizedImport, prepareApkgWorkerResult, readAnkiPackage } from "../src/apkgImportInternal.ts";
import { translateAnkiPackage } from "../src/apkgNoteTranslation.ts";

if (!parentPort) throw new Error("APKG-Benchmark-Worker benötigt einen Parent-Port.");

let peakMemoryBytes = 0;
const sampleMemory = () => {
  const usage = process.memoryUsage();
  peakMemoryBytes = Math.max(peakMemoryBytes, usage.heapUsed + usage.arrayBuffers);
};
const sampler = setInterval(sampleMemory, 25);

async function runLive(path: string, name: string) {
  const buffer = await (await openAsBlob(path)).arrayBuffer();
  const parsed = await parseApkgToNormalizedImport({ name, size: buffer.byteLength, arrayBuffer: async () => buffer }, { onStep: sampleMemory });
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const result = prepareApkgWorkerResult(parsed);
  return {
    cards: result.commitGraph.decks.reduce((sum: number, deck: any) => sum + deck.cards.length, 0),
    mediaFiles: result.mediaFiles.length,
    outputMediaBytes: result.mediaFiles.reduce((sum: number, mediaFile: any) => sum + Number(mediaFile.size ?? 0), 0),
    sampleCards: result.sampleCards.length,
    preview: { ...result, commitGraph: { kind: "worker-import", noteTypeDefinitions: result.commitGraph.noteTypeDefinitions.slice(0, 5) } },
  };
}

// The note translation reads the file lazily like a browser File; only the preview leaves the worker.
async function runNotes(path: string, name: string) {
  const file = Object.assign(await openAsBlob(path), { name });
  const graph = translateAnkiPackage(await readAnkiPackage(file, sampleMemory));
  sampleMemory();
  return {
    cards: graph.cards.length,
    mediaFiles: graph.mediaFiles.length,
    outputMediaBytes: graph.mediaFiles.reduce((sum, mediaFile) => sum + mediaFile.size, 0),
    sampleCards: Math.min(5, graph.cards.length),
    preview: { report: graph.report, sampleNotes: graph.notes.slice(0, 5), sampleCards: graph.cards.slice(0, 5) },
  };
}

parentPort.once("message", async ({ path, name, pipeline }: { path: string; name: string; pipeline: "live" | "notes" }) => {
  const startedAt = performance.now();
  const { preview, ...counts } = pipeline === "notes" ? await runNotes(path, name) : await runLive(path, name);
  const workerMs = performance.now() - startedAt;
  sampleMemory();
  clearInterval(sampler);
  parentPort!.postMessage({ type: "ready" });
  parentPort!.postMessage({ type: "result", counts, preview, workerMs, heapUsedBytes: process.memoryUsage().heapUsed, peakMemoryBytes });
});
