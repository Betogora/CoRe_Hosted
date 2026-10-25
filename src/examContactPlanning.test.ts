import assert from "node:assert/strict";
import test from "node:test";
import { balanceExamContacts, type ContactColumn } from "./examContactPlanning.ts";

const pause = async () => undefined;
/** A card introduced on day `day` only adds its first contact on that day. */
const firstContactOnly = (days: number): ContactColumn[] => Array.from({ length: days }, (_, day) => ({ contacts: Float64Array.from({ length: days }, (_, i) => i === day ? 1 : 0), recall: 0.9 }));

test("die Verteilung führt jede Karte genau einmal ein, ganzzahlig je Einführungstag", async () => {
  // Day 2 is free: there is one column per introduction day.
  const introductionDays = [0, 1, 3, 4];
  const columns = introductionDays.map((day) => ({ contacts: Float64Array.from({ length: 5 }, (_, i) => i === day ? 1 : 0), recall: 0.9 }));
  for (const total of [1, 7, 100, 1001]) {
    const counts = await balanceExamContacts(columns, new Float64Array(5), [30, 60, 0, 90, 30], introductionDays, total, pause);
    assert.equal(counts.length, introductionDays.length);
    assert.equal(counts.reduce((a, b) => a + b, 0), total);
    assert.ok(counts.every((count) => Number.isInteger(count) && count >= 0));
  }
  assert.deepEqual(await balanceExamContacts(firstContactOnly(3), new Float64Array(3), [60, 60, 60], [0, 1, 2], 0, pause), [0, 0, 0]);
});

test("zuerst sinkt die Spitzenlast, dann die Schwankung", async () => {
  // Day 0 already carries ten contacts of another exam: new cards avoid it and are spread over days 1 and 2 as evenly as the variation allows.
  const counts = await balanceExamContacts(firstContactOnly(3), Float64Array.from([10, 0, 0]), [60, 60, 60], [0, 1, 2], 9, pause);
  assert.deepEqual(counts, [0, 5, 4]);
});

test("bei gleicher Last entscheidet die erwartete Erinnerung", async () => {
  // Both introduction days cause the same contacts later on; only the expected recall differs.
  const columns = [{ contacts: Float64Array.from([0, 0, 1]), recall: 0.5 }, { contacts: Float64Array.from([0, 0, 1]), recall: 0.9 }];
  assert.deepEqual(await balanceExamContacts(columns, new Float64Array(3), [60, 60, 60], [0, 1], 4, pause), [0, 4]);
});

test("ein Abbruch beendet die Suche sichtbar, auch mitten in der Suche", async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(balanceExamContacts(firstContactOnly(3), new Float64Array(3), [60, 60, 60], [0, 1, 2], 9, pause, before.signal), /abort/i);
  const during = new AbortController();
  let pauses = 0;
  await assert.rejects(balanceExamContacts(firstContactOnly(3), new Float64Array(3), [60, 60, 60], [0, 1, 2], 9, async () => { if (++pauses === 5) during.abort(); }, during.signal), /abort/i);
  assert.equal(pauses, 5);
});
