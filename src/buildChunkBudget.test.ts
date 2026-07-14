import assert from "node:assert/strict";
import test from "node:test";
import { collectBudgetedJavaScriptFiles, findOversizedBuildChunks } from "../scripts/verifyBuildChunks.ts";

const manifest = {
  "index.html": { file: "assets/index.js", isEntry: true, name: "index" },
  "creation.jsx": { file: "assets/creation.js", isDynamicEntry: true, name: "CreationScreen" },
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
