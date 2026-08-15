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
