import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { basename, resolve } from "node:path";
import { Worker } from "node:worker_threads";

// `live` is today's app import; `notes` is the note translation (Phase 5A) that replaces it in the cutover.
// `--large` measures only the note translation against the K5.8 limits for packages up to 2 GiB.
const large = process.argv.includes("--large");
const fixturePath = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? "test-results/apkg/core-local-benchmark.apkg");
const pipelines = large ? ["notes"] as const : ["live", "notes"] as const;
const RUNS = large ? 1 : 3;
const WORKER_MEMORY_LIMIT_BYTES = 1024 ** 3;
const fixtureStats = await stat(fixturePath);
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

function runWorker(pipeline: "live" | "notes"): Promise<Record<string, number>> {
  return new Promise((resolveRun, reject) => {
    const worker = new Worker(new URL("./benchmarkApkgWorker.ts", import.meta.url), {
      execArgv: ["--import", "tsx"],
      // A worker above the heap limit aborts, so a finished run proves the limit.
      ...(pipeline === "notes" ? { resourceLimits: { maxOldGenerationSizeMb: 1024 } } : {}),
    });
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
      resolveRun({
        totalMs: performance.now() - startedAt,
        workerMs: message.workerMs,
        workerHeapBytes: message.heapUsedBytes,
        peakWorkerMemoryBytes: message.peakMemoryBytes,
        resultDeliveryDelayMs,
        ...message.counts,
      });
      void worker.terminate();
    });
    worker.on("error", reject);
    worker.postMessage({ path: fixturePath, name: basename(fixturePath), pipeline });
  });
}

const reports = [];
for (const pipeline of pipelines) {
  const runs: Record<string, number>[] = [];
  for (let run = 0; run < RUNS; run += 1) runs.push(await runWorker(pipeline));
  reports.push({
    pipeline,
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
    peakWorkerMemoryBytes: Math.max(...runs.map((run) => run.peakWorkerMemoryBytes)),
    resultDeliveryDelayMs: Number(Math.max(...runs.map((run) => run.resultDeliveryDelayMs)).toFixed(2)),
  });
}
clearInterval(heartbeat);
process.stdout.write(`${JSON.stringify({ reports, maximumMainThreadDelayMs: Number(maximumHeartbeatDelayMs.toFixed(2)) }, null, 2)}\n`);

for (const report of reports) {
  if (!large && (report.cards !== 25_000 || report.mediaFiles !== 1_000 || report.sampleCards > 5)) {
    throw new Error(`APKG-Benchmark (${report.pipeline}) hat den kompakten 25.000/1.000-Importvertrag verletzt.`);
  }
  if (report.resultDeliveryDelayMs > 100) {
    throw new Error(`APKG-Workerübergabe (${report.pipeline}) blockierte den Main Thread ${report.resultDeliveryDelayMs} ms.`);
  }
  if (report.pipeline === "notes" && report.peakWorkerMemoryBytes > WORKER_MEMORY_LIMIT_BYTES) {
    throw new Error(`APKG-Übersetzung belegte im Worker ${report.peakWorkerMemoryBytes} Bytes statt höchstens 1 GiB.`);
  }
}
