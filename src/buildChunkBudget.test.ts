import assert from "node:assert/strict";
import test from "node:test";
import { collectBudgetedJavaScriptFiles, collectCompressedBudgetGroups, findCompressedBudgetViolations, findOversizedBuildChunks } from "../scripts/verifyBuildChunks.ts";

const manifest = {
  "index.html": { file: "assets/index.js", isEntry: true, name: "index" },
  "creation.jsx": { file: "assets/creation.js", isDynamicEntry: true, name: "CreationScreen", imports: ["_vendor.js", "index.html"] },
  "_vendor.js": { file: "assets/vendor.js", name: "vendor", imports: ["index.html"] },
  "pdf.worker.mjs": { file: "assets/pdf.worker.mjs", src: "pdf.worker.mjs" },
  "pdfium.wasm": { file: "assets/pdfium.wasm", src: "pdfium.wasm" },
};

test("build chunk budget includes entry, lazy and shared chunks but excludes worker assets", () => {
  assert.deepEqual(collectBudgetedJavaScriptFiles(manifest), ["assets/creation.js", "assets/index.js", "assets/vendor.js"]);
});

test("build chunk budget reports every JavaScript chunk above the fixed limit", () => {
  assert.deepEqual(
    findOversizedBuildChunks(manifest, {
      "assets/index.js": 499_999,
      "assets/creation.js": 500_001,
      "assets/vendor.js": 620_000,
      "assets/pdf.worker.mjs": 2_200_000,
    }),
    [
      { file: "assets/vendor.js", bytes: 620_000 },
      { file: "assets/creation.js", bytes: 500_001 },
    ],
  );
});

test("compressed budgets cover the initial graph, lazy additions and workers", () => {
  assert.deepEqual(collectCompressedBudgetGroups(manifest), {
    initial: ["assets/index.js"],
    lazyRoutes: { CreationScreen: ["assets/creation.js", "assets/vendor.js"] },
    workers: ["assets/pdf.worker.mjs"],
  });
  assert.deepEqual(findCompressedBudgetViolations(manifest, {
    "assets/index.js": 300 * 1024 + 1,
    "assets/creation.js": 150 * 1024,
    "assets/vendor.js": 50 * 1024 + 1,
    "assets/pdf.worker.mjs": 525 * 1024 + 1,
  }), [
    { kind: "worker", name: "assets/pdf.worker.mjs", bytes: 525 * 1024 + 1, maxBytes: 525 * 1024 },
    { kind: "initial", name: "initialer Importgraph", bytes: 300 * 1024 + 1, maxBytes: 300 * 1024 },
    { kind: "lazy-route", name: "CreationScreen", bytes: 200 * 1024 + 1, maxBytes: 200 * 1024 },
  ]);
});
