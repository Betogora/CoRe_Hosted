import { readFile, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { parseApkgToNormalizedImport } from "../src/apkgImport.ts";

const fixturePath = resolve(process.argv[2] ?? "test-results/apkg/m3-large-media.apkg");
const fixtureStats = await stat(fixturePath);
const phaseStarts = new Map<string, number>();
const phases: Record<string, number> = {};
let previousStep: string | null = null;
let heartbeatCount = 0;
let maximumHeartbeatDelayMs = 0;
let previousHeartbeat = performance.now();
const heartbeat = setInterval(() => {
  const current = performance.now();
  maximumHeartbeatDelayMs = Math.max(maximumHeartbeatDelayMs, current - previousHeartbeat);
  previousHeartbeat = current;
  heartbeatCount += 1;
}, 5);

const bytes = await readFile(fixturePath);
const heapBefore = process.memoryUsage().heapUsed;
const startedAt = performance.now();
const result = await parseApkgToNormalizedImport({
  name: "m3-large-media.apkg",
  size: fixtureStats.size,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
}, {
  onStep(step: string) {
    const now = performance.now();
    if (previousStep) phases[previousStep] = now - (phaseStarts.get(previousStep) ?? now);
    previousStep = step;
    phaseStarts.set(step, now);
  },
});
const finishedAt = performance.now();
if (previousStep) phases[previousStep] = finishedAt - (phaseStarts.get(previousStep) ?? finishedAt);
clearInterval(heartbeat);

if (result.errors.length > 0) {
  throw new Error(`Benchmark-Import fehlgeschlagen: ${result.errors.join(" ")}`);
}

const report = {
  fixture: fixturePath,
  inputBytes: fixtureStats.size,
  outputMediaBytes: result.mediaFiles.reduce((sum: number, mediaFile: any) => sum + Number(mediaFile.size ?? 0), 0),
  cards: result.normalizedDeck.items.length,
  mediaFiles: result.mediaFiles.length,
  phasesMs: Object.fromEntries(Object.entries(phases).map(([key, value]) => [key, Number(value.toFixed(2))])),
  totalMs: Number((finishedAt - startedAt).toFixed(2)),
  heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
  heartbeatCount,
  maximumHeartbeatDelayMs: Number(maximumHeartbeatDelayMs.toFixed(2)),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
