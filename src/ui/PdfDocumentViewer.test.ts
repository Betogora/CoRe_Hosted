import assert from "node:assert/strict";
import test from "node:test";
import { getPdfPageWindow } from "./PdfDocumentViewer.tsx";

test("PDF page window retains at most two pages around the viewport", () => {
  assert.deepEqual(getPdfPageWindow(500, 1), { firstPage: 1, lastPage: 3 });
  assert.deepEqual(getPdfPageWindow(500, 250), { firstPage: 248, lastPage: 252 });
  assert.deepEqual(getPdfPageWindow(500, 500), { firstPage: 498, lastPage: 500 });
});
