import assert from "node:assert/strict";
import test from "node:test";
import { summaryDrawingBounds, summaryPageSize, summaryStrokePlacement } from "./summaryDocumentLayout.ts";
import type { SummaryPage, SummaryStroke } from "./learningSummaries.ts";

test("Hoch- und Querformat tauschen die A4-Abmessungen", () => {
  assert.deepEqual(summaryPageSize("portrait"), { width: 794, height: 1123 });
  assert.deepEqual(summaryPageSize("landscape"), { width: 1123, height: 794 });
});

test("Formatwechsel passen Zeichnungen proportional ein und erhalten ihre ursprünglichen Punkte", () => {
  const stroke: SummaryStroke = { id: "s", tool: "pen", color: "#667492", width: 3, points: [[20, 30], [700, 1100]] };
  const page: SummaryPage = { id: "p", html: "", strokes: [stroke] };
  const original = structuredClone(stroke);
  assert.equal(summaryStrokePlacement(stroke, page, "landscape").scale, 794 / 1123);
  assert.deepEqual(summaryStrokePlacement(stroke, page, "portrait"), { x: -0, y: -0, scale: 1 });
  assert.deepEqual(summaryStrokePlacement(stroke, page, "infinity"), { x: 0, y: 0, scale: 1 });
  assert.deepEqual(stroke, original);
});

test("Infinity-Striche außerhalb der Seite passen auch nach Rückkehr vollständig aufs Papier", () => {
  const stroke: SummaryStroke = { id: "s", tool: "marker", space: "infinity", color: "#667492", width: 12, points: [[-900, -700], [2400, 1800]] };
  const page: SummaryPage = { id: "p", html: "", strokes: [stroke] };
  const bounds = summaryDrawingBounds(page);
  for (const format of ["portrait", "landscape"] as const) {
    const fit = summaryStrokePlacement(stroke, page, format), size = summaryPageSize(format);
    assert.equal(bounds.left * fit.scale + fit.x, 0);
    assert.equal(bounds.top * fit.scale + fit.y, 0);
    assert.ok(bounds.width * fit.scale <= size.width);
    assert.ok(bounds.height * fit.scale <= size.height);
  }
});
