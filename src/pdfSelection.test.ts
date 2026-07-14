import assert from "node:assert/strict";
import test from "node:test";
import { createPdfSelectionBbox, firstSelectionRectOnPage, normalizePdfSelectionText, rectIntersects } from "./pdfSelection.ts";

test("PDF selection text is normalized without losing line structure", () => {
  assert.equal(normalizePdfSelectionText(["  Erste\u00a0Zeile  ", "", "Zweite Zeile\n\n\nDritte Zeile"]), "Erste Zeile\nZweite Zeile\n\nDritte Zeile");
});

test("PDF selection rectangles are matched to the first intersecting page", () => {
  const pageRect = { left: 100, top: 200, right: 500, bottom: 800 };
  const outside = { left: 20, top: 20, right: 80, bottom: 80 };
  const inside = { left: 140, top: 250, right: 240, bottom: 280 };

  assert.equal(rectIntersects(outside, pageRect), false);
  assert.equal(rectIntersects(inside, pageRect), true);
  assert.equal(firstSelectionRectOnPage([outside, inside], pageRect), inside);
});

test("PDF selection bbox is clipped to the page and converted into stable PDF points", () => {
  const bbox = createPdfSelectionBbox({
    selectionRect: { left: 90, top: 220, right: 260, bottom: 300 },
    pageRect: { left: 100, top: 200, right: 500, bottom: 800 },
    viewport: {
      convertToPdfPoint(x: number, y: number) {
        return [x / 2, 400 - y / 2];
      },
    },
  });

  assert.deepEqual(bbox, { left: 0, top: 390, right: 80, bottom: 350 });
});
