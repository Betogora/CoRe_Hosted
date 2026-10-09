import { openAsBlob } from "node:fs";
import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { readAnkiPackage } from "../src/apkgImportInternal.ts";
import { describeImportGraph, readSampleMedia, translateAnkiPackage } from "../src/apkgNoteTranslation.ts";

if (!parentPort) throw new Error("APKG-Benchmark-Worker benötigt einen Parent-Port.");

let peakMemoryBytes = 0;
const sampleMemory = () => {
  const usage = process.memoryUsage();
  peakMemoryBytes = Math.max(peakMemoryBytes, usage.heapUsed + usage.arrayBuffers);
};
const sampler = setInterval(sampleMemory, 25);

// Like the app worker: the file is read lazily like a browser File and only the preview leaves the worker.
async function runNotes(path: string, name: string) {
  const file = Object.assign(await openAsBlob(path), { name });
  const graph = await translateAnkiPackage(await readAnkiPackage(file, sampleMemory));
  sampleMemory();
  const description = describeImportGraph(graph);
  const preview = { ...description, sampleMedia: await readSampleMedia(graph, description.samples) };
  return {
    cards: graph.cards.length,
    mediaFiles: graph.mediaFiles.length,
    outputMediaBytes: graph.mediaFiles.reduce((sum, mediaFile) => sum + mediaFile.size, 0),
    sampleCards: description.samples.length,
    preview,
  };
}

parentPort.once("message", async ({ path, name }: { path: string; name: string }) => {
  const startedAt = performance.now();
  const { preview, ...counts } = await runNotes(path, name);
  const workerMs = performance.now() - startedAt;
  sampleMemory();
  clearInterval(sampler);
  parentPort!.postMessage({ type: "ready" });
  parentPort!.postMessage({ type: "result", counts, preview, workerMs, heapUsedBytes: process.memoryUsage().heapUsed, peakMemoryBytes });
});
