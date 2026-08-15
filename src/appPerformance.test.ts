import assert from "node:assert/strict";
import test from "node:test";
import {
  appPerformanceMarks,
  appPerformanceMeasures,
  markAppStarted,
  markCloudSyncReady,
  markSessionChecked,
  markServiceWorkerContext,
  markStartupPhaseReady,
  markStartupPhaseStarted,
  markWorkspaceLocalReady,
  measureAppPerformance,
} from "./appPerformance.ts";

test("misst den App-Start ab Navigation statt erst nach dem JavaScript-Download", () => {
  const calls: Array<{ name: string; startTime?: number }> = [];
  markAppStarted({
    mark(name, options) { calls.push({ name, startTime: options?.startTime }); },
    measure() {},
  });

  assert.deepEqual(calls, [{ name: appPerformanceMarks.appStart, startTime: 0 }]);
});

test("zeichnet die nutzbare lokale Phase getrennt vom nachlaufenden Cloud-Sync auf", () => {
  const calls: string[] = [];
  const recorder = {
    mark(name: string) { calls.push(`mark:${name}`); },
    measure(name: string, start: string, end: string) { calls.push(`measure:${name}:${start}:${end}`); },
  };

  markSessionChecked(recorder);
  markWorkspaceLocalReady(recorder);
  markCloudSyncReady(recorder);

  assert.deepEqual(calls, [
    `mark:${appPerformanceMarks.sessionChecked}`,
    `measure:${appPerformanceMeasures.sessionCheck}:${appPerformanceMarks.appStart}:${appPerformanceMarks.sessionChecked}`,
    `mark:${appPerformanceMarks.workspaceLocalReady}`,
    `measure:${appPerformanceMeasures.localWorkspaceStart}:${appPerformanceMarks.appStart}:${appPerformanceMarks.workspaceLocalReady}`,
    `mark:${appPerformanceMarks.cloudSyncReady}`,
    `measure:${appPerformanceMeasures.cloudSyncAfterStart}:${appPerformanceMarks.workspaceLocalReady}:${appPerformanceMarks.cloudSyncReady}`,
  ]);
});

test("ignoriert fehlende Startmarken, statt den App-Start zu unterbrechen", () => {
  assert.doesNotThrow(() => measureAppPerformance("test", "missing", "also-missing", {
    mark() {},
    measure() { throw new Error("missing mark"); },
  }));
});

test("misst IndexedDB-Startphasen nur mit anonymen Zählern und Service-Worker-Status", () => {
  const calls: Array<{ kind: string; name: string; detail?: unknown; start?: string; end?: string }> = [];
  const recorder = {
    mark(name: string, options?: { detail?: unknown }) { calls.push({ kind: "mark", name, detail: options?.detail }); },
    measure(name: string, start: string, end: string) { calls.push({ kind: "measure", name, start, end }); },
  };

  markStartupPhaseStarted("indexedDbStartupMetadata", recorder);
  markStartupPhaseReady("indexedDbStartupMetadata", { outboxCount: 3 }, recorder);
  markServiceWorkerContext("controlled", recorder);

  assert.deepEqual(calls, [
    { kind: "mark", name: appPerformanceMarks.indexedDbStartupMetadataStart, detail: undefined },
    { kind: "mark", name: appPerformanceMarks.indexedDbStartupMetadataReady, detail: { outboxCount: 3 } },
    {
      kind: "measure",
      name: appPerformanceMeasures.indexedDbStartupMetadata,
      start: appPerformanceMarks.indexedDbStartupMetadataStart,
      end: appPerformanceMarks.indexedDbStartupMetadataReady,
    },
    { kind: "mark", name: appPerformanceMarks.serviceWorkerContext, detail: { status: "controlled" } },
  ]);
});
