import assert from "node:assert/strict";
import test from "node:test";
import { isReadableSourceDocument } from "./documentModel.ts";

test("nur PDF und die genannten Textformate gelten als lesbare Quelle", () => {
  assert.equal(isReadableSourceDocument({ name: "skript.pdf", type: "application/pdf" }), true);
  assert.equal(isReadableSourceDocument({ name: "notizen.md", type: "" }), true);
  assert.equal(isReadableSourceDocument({ name: "liste.tsv", type: "text/tab-separated-values" }), true);
  assert.equal(isReadableSourceDocument({ name: "seite.html", type: "text/html" }), false, "text/* allein reicht nicht");
  assert.equal(isReadableSourceDocument({ name: "foto.png", type: "image/png" }), false);
});
