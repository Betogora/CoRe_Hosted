import assert from "node:assert/strict";
import test from "node:test";
import { deckSummariesLoadKey } from "./useDeckSummaries.ts";

const at = (workspaceRevision: number, learningDayKey: string, loadedDayKey: string, countsShown = false) => deckSummariesLoadKey({
  countsShown, workspaceRevision, learningNow: `${learningDayKey}T10:00:${String(workspaceRevision % 60).padStart(2, "0")}.000Z`, learningDayKey, loadedDayKey,
});

test("views that show deck counts reload them after every workspace change", () => {
  assert.notEqual(at(1, "2026-11-11", "2026-11-11", true), at(2, "2026-11-11", "2026-11-11", true));
});

test("a study session loads nothing per rating within a learning day", () => {
  for (let revision = 1; revision <= 50; revision += 1) assert.equal(at(revision, "2026-11-11", "2026-11-11"), null);
});

test("a study session loads the counts once when a new learning day begins", () => {
  const keys = [3, 4, 5].map((revision) => at(revision, "2026-11-12", "2026-11-11"));
  assert.deepEqual(keys, ["2026-11-12", "2026-11-12", "2026-11-12"], "ratings during the load keep it running");
  assert.equal(at(6, "2026-11-12", "2026-11-12"), null, "once loaded for the new day, ratings load nothing again");
});
