import assert from "node:assert/strict";
import test from "node:test";
import { rowOffsets, visibleRange } from "./virtualRows.ts";

test("die Fensterung findet die Zeilen eines Bereichs über gemessene und geschätzte Höhen", () => {
  const offsets = rowOffsets(5, (index) => index === 0 ? 56 : 45);
  assert.deepEqual([...offsets], [0, 56, 101, 146, 191, 236]);
  assert.deepEqual(visibleRange(offsets, 0, 60), { start: 0, end: 1 });
  assert.deepEqual(visibleRange(offsets, 100, 150), { start: 1, end: 3 }, "angeschnittene Zeilen zählen mit");
  assert.deepEqual(visibleRange(offsets, 500, 900), { start: 4, end: 4 }, "unter dem Ende bleibt die letzte Zeile");
  assert.deepEqual(visibleRange(rowOffsets(0, () => 45), 0, 900), { start: 0, end: -1 });
});

test("in 50.000 Zeilen findet die Fensterung nur die sichtbaren", () => {
  const offsets = rowOffsets(50_000, (index) => index % 7 === 0 ? 56 : 45);
  const { start, end } = visibleRange(offsets, 1_000_000, 1_000_900);
  assert.ok(offsets[start] <= 1_000_000 && offsets[end + 1] >= 1_000_900);
  assert.ok(end - start < 30);
});
