import assert from "node:assert/strict";
import test from "node:test";
import { isManualSourceDocument, MANUAL_SOURCE_DOCUMENT_ACCEPT } from "./documentModel.ts";

test("die Quelle der manuellen Erstellung nimmt nur PDF, Text und Markdown", () => {
  assert.equal(MANUAL_SOURCE_DOCUMENT_ACCEPT, ".pdf,.txt,.md,.markdown");
  assert.equal(isManualSourceDocument({ name: "skript.pdf", type: "application/pdf" }), true);
  assert.equal(isManualSourceDocument({ name: "notizen.md", type: "" }), true);
  assert.equal(isManualSourceDocument({ name: "notizen.txt", type: "text/plain" }), true);
  assert.equal(isManualSourceDocument({ name: "ohne-endung", type: "text/plain" }), true);
  assert.equal(isManualSourceDocument({ name: "liste.tsv", type: "text/tab-separated-values" }), false);
  assert.equal(isManualSourceDocument({ name: "liste.csv", type: "text/plain" }), false, "die Endung entscheidet vor dem Browsertyp");
  assert.equal(isManualSourceDocument({ name: "seite.html", type: "text/html" }), false);
  assert.equal(isManualSourceDocument({ name: "foto.png", type: "image/png" }), false);
});
