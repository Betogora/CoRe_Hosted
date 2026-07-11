import assert from "node:assert/strict";
import test from "node:test";
import { createSyncEngine, detectRevisionConflict, mergeAppendOnlyRows, SYNC_MUTATION_TYPES } from "./syncEngine.js";
import { createSyncOutbox } from "./syncOutbox.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createTestOutbox(storage = createMemoryStorage()) {
  return createSyncOutbox({ userId: "user-1", storage, now: () => "2026-07-09T09:00:00.000Z" });
}

const testDevice = Object.freeze({ id: "device-a", label: "Chrome auf Windows", userAgent: "Chrome Test" });

test("sync engine flushes the latest state patch without issuing deletions", async () => {
  const calls = [];
  const adapter = {
    async loadSnapshot() {
      return { decks: [{ id: "remote-deck" }] };
    },
    async upsertState(state, context) {
      calls.push({ method: "upsertState", state, context });
      return { decks: state.decks.length, acknowledgedMutationIds: context.mutationIds };
    },
    async listConflicts() {
      return [];
    },
  };
  const engine = createSyncEngine({ adapter, outbox: createTestOutbox(), device: testDevice, now: () => "2026-07-09T09:00:00.000Z" });

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

test("sync flush returns the acknowledged state and passes device context", async () => {
  const acknowledgedState = { decks: [{ id: "deck-1", revision: 4 }] };
  let receivedContext = null;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    now: () => "2026-07-10T12:00:00.000Z",
    adapter: {
      async loadSnapshot() {
        return { decks: [] };
      },
      async upsertState(_state, context) {
        receivedContext = context;
        return { state: acknowledgedState, summary: { decks: 1 }, acknowledgedMutationIds: context.mutationIds };
      },
    },
  });

  const mutation = engine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [{ id: "deck-1", revision: 3 }] } } });
  const result = await engine.flush();

  assert.equal(receivedContext.deviceId, "device-a");
  assert.deepEqual(receivedContext.mutationIds, [mutation.id]);
  assert.equal(Object.hasOwn(receivedContext, "mutations"), false);
  assert.equal(receivedContext.flushedAt, "2026-07-10T12:00:00.000Z");
  assert.deepEqual(result.saved.state, acknowledgedState);
});

test("account boot registers the device before loading the cloud snapshot", async () => {
  const calls = [];
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    now: () => "2026-07-11T08:00:00.000Z",
    adapter: {
      async registerDevice(device, context) {
        calls.push({ method: "registerDevice", device, context });
      },
      async loadSnapshot(fallbackState) {
        calls.push({ method: "loadSnapshot", fallbackState });
        return { decks: [{ id: "remote-deck" }] };
      },
    },
  });

  const snapshot = await engine.loadSnapshot({ decks: [] });

  assert.deepEqual(calls.map((call) => call.method), ["registerDevice", "loadSnapshot"]);
  assert.deepEqual(calls[0].device, testDevice);
  assert.equal(calls[0].context.lastSeenAt, "2026-07-11T08:00:00.000Z");
  assert.equal(snapshot.decks[0].id, "remote-deck");
});

test("device registration failure blocks snapshot loading and preserves pending mutations", async () => {
  let loadCalls = 0;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    adapter: {
      async registerDevice() {
        throw new Error("database unavailable");
      },
      async loadSnapshot() {
        loadCalls += 1;
        return {};
      },
    },
  });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });

  await assert.rejects(
    () => engine.loadSnapshot({}),
    (error) => error?.code === "sync_device_registration_failed" && error?.cause?.message === "database unavailable",
  );
  assert.equal(loadCalls, 0);
  assert.equal(engine.pendingCount(), 1);
});

test("mixed flush acknowledges snapshot and review mutations through separate repository calls", async () => {
  let stateContext = null;
  let reviewMutations = null;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    adapter: {
      async upsertState(_state, context) {
        stateContext = context;
        return { state: { decks: [] }, acknowledgedMutationIds: context.mutationIds };
      },
      async applyMutationBatch(mutations) {
        reviewMutations = mutations;
        return { acknowledgedMutationIds: mutations.map((mutation) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  await engine.flush();

  assert.deepEqual(stateContext.mutationIds, ["state-1"]);
  assert.deepEqual(reviewMutations.map((mutation) => mutation.id), ["review-1"]);
  assert.equal(engine.pendingCount(), 0);
});

test("confirmed review events leave the outbox even when the following snapshot reports a conflict", async () => {
  const outbox = createTestOutbox();
  const conflictError = new Error("stale snapshot");
  conflictError.code = "cloud_revision_conflict";
  conflictError.conflict = { id: "conflict-1", entityId: "card-1", status: "open" };
  const engine = createSyncEngine({
    device: testDevice,
    outbox,
    adapter: {
      async applyMutationBatch(mutations) {
        return { acknowledgedMutationIds: mutations.map((mutation) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
      async upsertState() {
        throw conflictError;
      },
    },
  });
  engine.enqueueMutation({ id: "state-conflict", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  engine.enqueueMutation({ id: "review-confirmed", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  await assert.rejects(() => engine.flush(), (error) => error === conflictError);

  assert.deepEqual(outbox.listPending().map((mutation) => mutation.id), ["state-conflict"]);
  assert.equal(outbox.listPending()[0].retryCount, 1);
});

test("snapshot mutations stay pending when the repository omits acknowledgements", async () => {
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    adapter: {
      async upsertState() {
        return { state: { decks: [] }, acknowledgedMutationIds: [] };
      },
    },
  });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });

  await assert.rejects(() => engine.flush(), /nicht alle Snapshot-Mutationen bestätigt/);
  assert.equal(engine.pendingCount(), 1);
});

test("sync engine restores pending review events and removes only acknowledged mutations", async () => {
  const storage = createMemoryStorage();
  const firstOutbox = createTestOutbox(storage);
  const first = createSyncEngine({
    outbox: firstOutbox,
    device: testDevice,
    adapter: { async applyMutationBatch() { throw new Error("offline"); } },
  });
  first.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  await assert.rejects(() => first.flush(), /offline/);
  assert.equal(first.pendingCount(), 1);

  const restored = createSyncEngine({
    outbox: createTestOutbox(storage),
    device: testDevice,
    adapter: {
      async applyMutationBatch(mutations) {
        return { acknowledgedMutationIds: [mutations[0].id], failedMutationIds: [], conflicts: [] };
      },
    },
  });
  await restored.flush();
  assert.equal(restored.pendingCount(), 0);
});

test("sync engine serializes concurrent flushes", async () => {
  let calls = 0;
  const engine = createSyncEngine({
    outbox: createTestOutbox(),
    device: testDevice,
    adapter: {
      async applyMutationBatch(mutations) {
        calls += 1;
        await Promise.resolve();
        return { acknowledgedMutationIds: mutations.map((mutation) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });
  await Promise.all([engine.flush(), engine.flush()]);
  assert.equal(calls, 1);
});
