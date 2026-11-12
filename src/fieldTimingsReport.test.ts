import assert from "node:assert/strict";
import test from "node:test";
import { FIELD_TIMING_METRICS, type FieldTimingSamples } from "./fieldTimings.ts";
import { formatFieldTimingsReport, readFieldTimingContext, summarizeDurations } from "./fieldTimingsReport.ts";

test("median and p95 (nearest rank) at known values", () => {
  assert.equal(summarizeDurations([]), null);
  assert.deepEqual(summarizeDurations([5, 1, 3, 2, 4]), { count: 5, median: 3, p95: 5 });
  assert.deepEqual(summarizeDurations([7]), { count: 1, median: 7, p95: 7 });
  assert.deepEqual(summarizeDurations(Array.from({ length: 20 }, (_, index) => 20 - index)), { count: 20, median: 11, p95: 19 });
  assert.deepEqual(summarizeDurations(Array.from({ length: 100 }, (_, index) => index + 1)), { count: 100, median: 51, p95: 95 });
});

test("the copied text names counts, median and p95 per metric, then coarse context", () => {
  const samples: FieldTimingSamples = {
    "core:answer_shown": [[40, 20_400], [20, 20_404], [30, 20_402]],
    "core:session_check": [[180, 20_401]],
  };
  const text = formatFieldTimingsReport(samples, { version: "0.2.0", cores: 8, memoryGb: 4, pointer: "coarse", cardCount: 12_345 });
  assert.equal(text, [
    "CoRe-Leistungsdaten",
    "core:answer_shown: 3 Werte, Median 30 ms, p95 40 ms",
    "core:session_check: 1 Wert, Median 180 ms, p95 180 ms",
    "",
    "Version: 0.2.0",
    "Zeitraum: 2025-11-08 bis 2025-11-12",
    "Prozessorkerne: 5–8",
    "Arbeitsspeicher: 4 GB",
    "Zeiger: Touch",
    "Katalog: 10.000–49.999 Karten",
  ].join("\n"));
});

test("the copied text contains only keys from a fixed list and only numbers or coarse classes", () => {
  const allowedKeys = new Set([
    "core:answer_shown", "core:rating_to_next_card", "core:card_search_results",
    "core:session_check", "core:local_workspace_start", "core:cloud_bootstrap_after_start", "core:cloud_sync_after_start",
    "core:indexeddb_open", "core:indexeddb_shell", "core:indexeddb_startup_metadata", "core:first_deck_summaries",
    "core:bootstrap_rpc", "core:bootstrap_apply",
    "Version", "Zeitraum", "Prozessorkerne", "Arbeitsspeicher", "Zeiger", "Katalog",
  ]);
  const samples = Object.fromEntries([...FIELD_TIMING_METRICS, "core:secret note@example.test"].map((metric) => [metric, [[12, 20_404]]])) as FieldTimingSamples;
  for (const context of [
    { version: "0.2.0", cores: 2, memoryGb: 0.5, pointer: "fine" as const, cardCount: 0 },
    { version: "0.2.0" },
  ]) {
    const lines = formatFieldTimingsReport(samples, context).split("\n");
    assert.equal(lines.shift(), "CoRe-Leistungsdaten");
    for (const line of lines.filter(Boolean)) {
      const key = line.slice(0, line.indexOf(": "));
      assert.ok(allowedKeys.has(key), `unerwarteter Schlüssel: ${line}`);
      assert.match(line.slice(key.length + 2), /^[\d\s,.\-–a-zA-ZäöüÄÖÜß]+$/u, line);
    }
    assert.equal(lines.filter((line) => line.startsWith("core:")).length, FIELD_TIMING_METRICS.length);
    assert.doesNotMatch(lines.join("\n"), /secret|@|https?:/);
  }
});

test("device context comes in classes and the catalog size from deck summaries", () => {
  const summaries = new Map([["a", { inventory: { totalCards: 600 } }], ["b", { inventory: { totalCards: 500 } }]]);
  const context = readFieldTimingContext(summaries);
  assert.equal(context.cardCount, 1_100);
  assert.match(formatFieldTimingsReport({ "core:answer_shown": [[1, 1]] }, context), /Katalog: 1\.000–9\.999 Karten/);
  assert.equal(readFieldTimingContext(undefined).cardCount, undefined);
});
