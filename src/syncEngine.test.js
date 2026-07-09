import assert from "node:assert/strict";
import test from "node:test";
import { createSyncEngine, detectRevisionConflict, mergeAppendOnlyRows, SYNC_MUTATION_TYPES } from "./syncEngine.js";

test("sync engine flushes the latest state patch without issuing deletions", async () => {
  const calls = [];
  const adapter = {
    async loadSnapshot() {
      return { decks: [{ id: "remote-deck" }] };
    },
    async upsertState(state, context) {
      calls.push({ method: "upsertState", state, context });
      return { decks: state.decks.length };
    },
    async listConflicts() {
      return [];
    },
  };
  const engine = createSyncEngine({ adapter, deviceId: "device-a", now: () => "2026-07-09T09:00:00.000Z" });

  engine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [{ id: "stale-local" }] } } });
  engine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [{ id: "local-latest" }] } } });
  const result = await engine.flush();

  assert.equal(result.mutations, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "upsertState");
  assert.deepEqual(calls[0].state.decks.map((deck) => deck.id), ["local-latest"]);
  assert.equal(Object.hasOwn(calls[0], "deleteRowsMissingFromState"), false);
});

test("append-only rows merge by id instead of replacing remote history", () => {
  const merged = mergeAppendOnlyRows(
    [
      { id: "review-2", rating: "easy" },
      { id: "review-3", rating: "hard" },
    ],
    [
      { id: "review-1", rating: "good" },
      { id: "review-2", rating: "good" },
    ],
  );

  assert.deepEqual(merged.map((row) => row.id), ["review-1", "review-2", "review-3"]);
  assert.equal(merged.find((row) => row.id === "review-2").rating, "easy");
});

test("revision conflicts describe changed content fields", () => {
  const conflict = detectRevisionConflict({
    baseRevision: 3,
    localRow: { id: "card-1", revision: 3, original_front: "Lokal", original_back: "Antwort" },
    remoteRow: { id: "card-1", revision: 4, original_front: "Remote", original_back: "Antwort" },
    contentFields: ["original_front", "original_back"],
  });

  assert.equal(conflict.entityId, "card-1");
  assert.deepEqual(conflict.changedFields, ["original_front"]);
  assert.equal(conflict.localValue.original_front, "Lokal");
  assert.equal(conflict.remoteValue.original_front, "Remote");
});
