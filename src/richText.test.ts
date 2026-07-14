import assert from "node:assert/strict";
import test from "node:test";
import { appendPlainTextToCardHtml, hasCardRichTextContent, normalizeRichTextForEditor, textToCardHtml } from "./richText.ts";

test("rich text helpers convert plain text into card html", () => {
  assert.equal(textToCardHtml("Frage\nmit Zeile\n\nAntwortblock"), "<p>Frage<br>mit Zeile</p><p>Antwortblock</p>");
  assert.equal(normalizeRichTextForEditor("ATP"), "<p>ATP</p>");
});

test("rich text helpers detect meaningful editor content", () => {
  assert.equal(hasCardRichTextContent("<p><br></p>"), false);
  assert.equal(hasCardRichTextContent("<div>&nbsp;</div>"), false);
  assert.equal(hasCardRichTextContent('<p><strong>ATP</strong> <span style="color:#b42318">Energie</span></p>'), true);
  assert.equal(hasCardRichTextContent('<img src="media.png">'), true);
});

test("rich text helpers append selected source text as a readable paragraph", () => {
  const html = appendPlainTextToCardHtml("<p>Was ist ATP?</p>", "Universeller Energietraeger\nin der Zelle.");

  assert.equal(html, "<p>Was ist ATP?</p><p>Universeller Energietraeger<br>in der Zelle.</p>");
});
