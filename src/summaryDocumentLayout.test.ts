import assert from "node:assert/strict";
import test from "node:test";
import { summaryDrawingLayout } from "./summaryDocumentLayout.ts";
import type { SummaryPage, SummaryStroke } from "./learningSummaries.ts";

const pen: SummaryStroke = { id: "pen", tool: "pen", color: "#657494", width: 3, points: [[20, 30], [700, 1100]] };
test("Bestehende Seitenzeichnungen bleiben getrennt identifizierbar und unverändert", () => {
  const pages: SummaryPage[] = [{ id: "one", html: "<p>Erster Text</p>", strokes: [pen] }, { id: "two", html: "<p>Zweiter Text</p>", strokes: [{ ...pen, id: "second", space: "landscape" }] }];
  const original = structuredClone(pages), layout = summaryDrawingLayout(pages);
  assert.equal(layout.strokes[0].scale, 1);
  assert.equal(layout.strokes[1].scale, 794 / 1123);
  assert.ok(layout.strokes[1].y > layout.strokes[0].y);
  assert.deepEqual(layout.strokes.map((item) => item.pageId), ["one", "two"]);
  assert.deepEqual(pages, original);
});
test("Alte Infinity-Zeichnungen mit negativen Koordinaten passen auf die lesbare Breite", () => {
  const page: SummaryPage = { id: "old", html: "", strokes: [{ ...pen, space: "infinity", points: [[-900, -700], [2400, 1800]] }] };
  const layout = summaryDrawingLayout([page], "infinity"), placed = layout.strokes[0];
  for (const [x, y] of placed.stroke.points) {
    assert.ok(placed.x + x * placed.scale >= 0);
    assert.ok(placed.x + x * placed.scale <= layout.width);
    assert.ok(placed.y + y * placed.scale >= 0);
    assert.ok(placed.y + y * placed.scale <= layout.bottom);
  }
});
test("Neue Striche wachsen ohne Seitenbegrenzung und verschieben vorhandene Striche nicht", () => {
  const page: SummaryPage = { id: "one", html: "", strokes: [pen] };
  const before = summaryDrawingLayout([page]);
  const after = summaryDrawingLayout([{ ...page, strokes: [pen, { ...pen, id: "long", space: "portrait", points: [[30, 5000], [90, 5200]] }] }]);
  assert.deepEqual(after.strokes[0], before.strokes[0]);
  assert.ok(after.bottom > 5200);
});
