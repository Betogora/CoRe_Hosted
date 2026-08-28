import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  findRichTextClozeSpan,
  RichTextEditor,
  selectionOverlapsRichTextCloze,
} from "./RichTextEditor.tsx";

test("finds the one cloze surrounding a selection or caret", () => {
  const text = "A {{c2::Berlin::Stadt}} B";
  const expectedSpan = { start: 2, end: 23, contentStart: 8, contentEnd: 14 };

  assert.deepEqual(findRichTextClozeSpan(text, { start: 8, end: 14 }), expectedSpan);
  assert.deepEqual(findRichTextClozeSpan(text, { start: 10, end: 10 }), expectedSpan);
  assert.deepEqual(findRichTextClozeSpan(text, { start: 2, end: 23 }), expectedSpan);
  assert.equal(findRichTextClozeSpan(text, { start: 0, end: 1 }), null);
});

test("detects selections that intersect an existing cloze", () => {
  const text = "Vor {{c1::Lücke}} nach";

  assert.equal(selectionOverlapsRichTextCloze(text, { start: 4, end: 10 }), true);
  assert.equal(selectionOverlapsRichTextCloze(text, { start: 9, end: 9 }), true);
  assert.equal(selectionOverlapsRichTextCloze(text, { start: 0, end: 3 }), false);
});

test("renders optional cloze actions with normalized group labels", () => {
  const markup = renderToStaticMarkup(
    <RichTextEditor ariaLabel="Inhalt" clozeActions={{ groupId: 3.8 }} />,
  );

  assert.match(markup, /aria-label="Auswahl als Lücke c3 markieren"/);
  assert.match(markup, /aria-label="Lücke entfernen"/);
  assert.doesNotMatch(markup, /role="status"/);
});

test("keeps the standard editor toolbar unchanged when cloze actions are disabled", () => {
  const markup = renderToStaticMarkup(<RichTextEditor ariaLabel="Inhalt" />);

  assert.doesNotMatch(markup, /Auswahl als Lücke/);
  assert.doesNotMatch(markup, /Lücke entfernen/);
  assert.doesNotMatch(markup, /Bild an Cursorposition einfügen/);
});

test("renders the optional inline-image action and hidden multi-file picker", () => {
  const markup = renderToStaticMarkup(
    <RichTextEditor
      ariaLabel="Inhalt"
      imageActions={{ mediaUrls: {}, prepare: async () => ({ reference: "a".repeat(40), previewUrl: "blob:test", alt: "bild.png" }) }}
    />,
  );

  assert.match(markup, /aria-label="Bild an Cursorposition einfügen"/);
  assert.match(markup, /type="file"/);
  assert.match(markup, /accept="image\/\*"/);
  assert.match(markup, /multiple=""/);
});
