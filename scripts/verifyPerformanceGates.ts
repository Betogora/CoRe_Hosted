import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { evaluatePerformanceSnapshot, findMissingPerformanceGates, type PerformanceSnapshot } from "../src/performanceGates.ts";

export async function verifyPerformanceGates(filePath = "test-results/performance.json") {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Performance-Messartefakt muss ein JSON-Objekt sein.");
  }
  const snapshot = parsed as PerformanceSnapshot;
  const missing = findMissingPerformanceGates(snapshot);
  if (missing.length > 0) {
    throw new Error(`Performance-Gates nicht vollständig gemessen:\n${missing.map((gate) => gate.label).join("\n")}`);
  }
  const failures = evaluatePerformanceSnapshot(snapshot);
  if (failures.length > 0) {
    throw new Error(`Performance-Gates überschritten:\n${failures.map((failure) => `${failure.label}: ${failure.actual} (max. ${failure.maximum})`).join("\n")}`);
  }
  return snapshot;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryPoint === import.meta.url) {
  verifyPerformanceGates(process.argv[2]).then(() => {
    console.log("Alle gemessenen Performance-Gates sind eingehalten.");
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
