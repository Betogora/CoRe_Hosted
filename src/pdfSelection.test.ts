import assert from "node:assert/strict";
import test from "node:test";
import { normalizePdfSelectionText } from "./pdfSelection.ts";

test("PDF selection text is normalized without losing line structure", () => {
  assert.equal(normalizePdfSelectionText(["  Erste\u00a0Zeile  ", "", "Zweite Zeile\n\n\nDritte Zeile"]), "Erste Zeile\nZweite Zeile\n\nDritte Zeile");
});
