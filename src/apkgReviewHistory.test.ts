import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnkiReviewHistory } from "./apkgImportInternal.ts";

test("Anki revlog rows map ratings, response time and negative learning intervals", () => {
  const payload = normalizeAnkiReviewHistory([
    { id: 1_700_000_000_000, cid: 20, ease: 1, type: 2, lastIvl: -120, ivl: -600, factor: 2500, time: 75_000 },
    { id: 1_700_000_001_000, cid: 20, ease: 0, type: 4, lastIvl: 1, ivl: 2, time: 10 },
    { id: 1_700_000_002_000, cid: 20, ease: 3, type: 4, lastIvl: 2, ivl: 3, time: 10 },
  ]);

  assert.equal(payload.totalRows, 3);
  assert.equal(payload.skippedRows, 2);
  assert.equal(payload.entries[0].rating, "again");
  assert.equal(payload.entries[0].beforeState, "relearning");
  assert.equal(payload.entries[0].beforeIntervalMinutes, 2);
  assert.equal(payload.entries[0].afterIntervalMinutes, 10);
  assert.equal(payload.entries[0].responseTimeMs, 60_000);
});
