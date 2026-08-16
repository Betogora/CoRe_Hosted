import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePerformanceSnapshot, findMissingPerformanceGates } from "./performanceGates.ts";

test("Performance-Abnahme meldet ausschließlich überschrittene harte Gates", () => {
  const failures = evaluatePerformanceSnapshot({
    lcpMs: 2_500,
    inpMs: 201,
    cls: 0.11,
    initialJavaScriptGzipBytes: 300 * 1024,
    largestFeatureGzipBytes: 200 * 1024 + 1,
  });
  assert.deepEqual(failures.map((failure) => failure.key), ["inpMs", "cls", "largestFeatureGzipBytes"]);
});

test("Performance-Abnahme akzeptiert kein unvollständiges Messartefakt", () => {
  const missing = findMissingPerformanceGates({ lcpMs: 2_500 });

  assert.equal(missing.some((gate) => gate.key === "lcpMs"), false);
  assert.equal(missing.some((gate) => gate.key === "offlineColdStartP75Ms"), true);
  assert.equal(missing.some((gate) => gate.key === "deltaSyncP95Ms"), true);
});

test("Startup-Artefakte müssen ihre neun Gates vollständig messen, ohne eine Vollabnahme vorzutäuschen", () => {
  const startup = {
    suite: "startup" as const,
    recurringWorkspaceP75Ms: 1_500,
    recurringWorkspaceP95Ms: 3_000,
    offlineColdStartP75Ms: 1_500,
    offlineColdStartP95Ms: 3_000,
    newDeviceDashboardP75Ms: 3_000,
    persistedSummaryReadP75Ms: 50,
    longestBackgroundTaskMs: 50,
    automaticPreloadLongestTaskMs: 50,
    automatic3gPreloadCount: 0,
  };

  assert.deepEqual(findMissingPerformanceGates(startup), []);
  assert.deepEqual(evaluatePerformanceSnapshot(startup), []);
  assert.equal(findMissingPerformanceGates({ ...startup, recurringWorkspaceP95Ms: undefined })[0]?.key, "recurringWorkspaceP95Ms");
  assert.equal(evaluatePerformanceSnapshot({ ...startup, longestBackgroundTaskMs: 51 })[0]?.key, "longestBackgroundTaskMs");
});
