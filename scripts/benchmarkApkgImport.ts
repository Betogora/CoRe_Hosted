import { readFile, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";

const RUNS = 3;
const fixturePath = resolve(process.argv[2] ?? "test-results/apkg/core-local-benchmark.apkg");
const fixtureStats = await stat(fixturePath);
const bytes = await readFile(fixturePath);
let heartbeatAt = performance.now();
let maximumHeartbeatDelayMs = 0;
let resultDeliveryDelayMs = 0;
let awaitingResult = false;
const heartbeat = setInterval(() => {
  const current = performance.now();
  const delay = current - heartbeatAt - 5;
  maximumHeartbeatDelayMs = Math.max(maximumHeartbeatDelayMs, delay);
  if (awaitingResult) resultDeliveryDelayMs = Math.max(resultDeliveryDelayMs, delay);
  heartbeatAt = current;
}, 5);

function median(values: number[]) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0;
}

function runWorker(): Promise<Record<string, number>> {
  return new Promise((resolveRun, reject) => {
    const worker = new Worker(new URL("./benchmarkApkgWorker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
    const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const startedAt = performance.now();
    worker.on("message", (message: any) => {
      if (message.type === "ready") {
        resultDeliveryDelayMs = 0;
        heartbeatAt = performance.now();
        awaitingResult = true;
        return;
      }
      awaitingResult = false;
      if (message.type !== "result") return;
      const result = message.result;
      resolveRun({
        totalMs: performance.now() - startedAt,
        workerMs: message.workerMs,
        workerHeapBytes: message.heapUsedBytes,
        cards: result.commitGraph.cardCount,
        mediaFiles: result.mediaFiles.length,
        outputMediaBytes: result.mediaFiles.reduce((sum: number, mediaFile: any) => sum + Number(mediaFile.size ?? 0), 0),
        sampleCards: result.sampleCards.length,
      });
      void worker.terminate();
    });
    worker.on("error", reject);
    worker.postMessage({ buffer: input, name: "core-local-benchmark.apkg" }, [input]);
  });
}

const runs: Record<string, number>[] = [];
for (let run = 0; run < RUNS; run += 1) runs.push(await runWorker());
clearInterval(heartbeat);

const report = {
  fixture: fixturePath,
  inputBytes: fixtureStats.size,
  cards: runs[0].cards,
  mediaFiles: runs[0].mediaFiles,
  outputMediaBytes: runs[0].outputMediaBytes,
  sampleCards: runs[0].sampleCards,
  totalMs: Number(median(runs.map((run) => run.totalMs)).toFixed(2)),
  workerMs: Number(median(runs.map((run) => run.workerMs)).toFixed(2)),
  runTotalMs: runs.map((run) => Number(run.totalMs.toFixed(2))),
  workerHeapBytes: Math.max(...runs.map((run) => run.workerHeapBytes)),
  maximumMainThreadDelayMs: Number(maximumHeartbeatDelayMs.toFixed(2)),
  resultDeliveryDelayMs: Number(resultDeliveryDelayMs.toFixed(2)),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (report.cards !== 25_000 || report.mediaFiles !== 1_000 || report.sampleCards > 5) {
  throw new Error("APKG-Benchmark hat den kompakten 25.000/1.000-Importvertrag verletzt.");
}
if (report.resultDeliveryDelayMs > 100) {
  throw new Error(`APKG-Workerübergabe blockierte den Main Thread ${report.resultDeliveryDelayMs} ms.`);
}
