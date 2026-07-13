import assert from "node:assert/strict";
import test from "node:test";
import { createSyncEngine, SYNC_MUTATION_TYPES } from "./syncEngine.js";
import { createSyncOutbox } from "./syncOutbox.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createQuotaStorage(maxCharacters) {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      const nextValues = new Map(values);
      nextValues.set(key, String(value));
      const size = [...nextValues.values()].reduce((total, item) => total + item.length, 0);
      if (size > maxCharacters) throw new Error("quota exceeded");
      values.set(key, String(value));
    },
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

  assert.equal(result.mutations, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "upsertState");
  assert.deepEqual(calls[0].state.decks.map((deck) => deck.id), ["local-latest"]);
  assert.equal(Object.hasOwn(calls[0], "deleteRowsMissingFromState"), false);
});

test("state snapshots stay out of the persistent outbox and still flush in the current session", async () => {
  const largeState = { decks: [{ id: "large-deck", content: "x".repeat(20_000) }] };
  let receivedState = null;
  const engine = createSyncEngine({
    adapter: {
      async upsertState(state, context) {
        receivedState = state;
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
    },
    outbox: createTestOutbox(createQuotaStorage(1_000)),
    device: testDevice,
  });

  engine.enqueueMutation({ id: "large-state", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: largeState } });
  await engine.flush();

  assert.equal(receivedState, largeState);
  assert.equal(engine.pendingCount(), 0);
});

test("state markers coalesce while an active flush keeps its captured snapshot", async () => {
  let releaseFirstWrite;
  let signalFirstWrite;
  const firstWriteStarted = new Promise((resolve) => {
    signalFirstWrite = resolve;
  });
  const firstWriteGate = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const writes = [];
  const engine = createSyncEngine({
    adapter: {
      async upsertState(state, context) {
        writes.push(state);
        if (writes.length === 1) {
          signalFirstWrite();
          await firstWriteGate;
        }
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
    },
    outbox: createTestOutbox(),
    device: testDevice,
  });
  const firstState = { decks: [{ id: "first" }] };
  const latestState = { decks: [{ id: "latest" }] };

  engine.enqueueMutation({ id: "state-first", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: firstState } });
  const activeFlush = engine.flush();
  await firstWriteStarted;
  engine.enqueueMutation({ id: "state-latest", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: latestState } });
  releaseFirstWrite();
  await activeFlush;

  assert.equal(engine.pendingCount(), 1);
  await engine.flush();
  assert.deepEqual(writes, [firstState, latestState]);
  assert.equal(engine.pendingCount(), 0);
});

test("invalid state markers cannot replace the latest complete snapshot", () => {
  const engine = createSyncEngine({ adapter: {}, outbox: createTestOutbox(), device: testDevice });
  engine.enqueueMutation({ id: "valid-state", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });

  for (const [id, state] of [["missing-state", undefined], ["null-state", null], ["array-state", []]]) {
    assert.throws(
      () => engine.enqueueMutation({ id, type: SYNC_MUTATION_TYPES.statePatch, payload: state === undefined ? {} : { state } }),
      /vollständigen Zustand/,
    );
  }
  assert.equal(engine.pendingCount(), 1);
});

test("account boot restores a persisted state marker from the durable local fallback", async () => {
  const storage = createMemoryStorage();
  const durableState = { decks: [{ id: "offline-deck", revision: 3 }] };
  const first = createSyncEngine({
    adapter: {},
    outbox: createTestOutbox(storage),
    device: testDevice,
  });
  first.enqueueMutation({ id: "offline-state", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: durableState } });

  const calls = [];
  const restored = createSyncEngine({
    adapter: {
      async registerDevice() {
        calls.push("register");
      },
      async upsertState(state, context) {
        calls.push("upsert");
        assert.equal(state, durableState);
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
      async loadSnapshot() {
        calls.push("load");
        return durableState;
      },
    },
    outbox: createTestOutbox(storage),
    device: testDevice,
  });

  const snapshot = await restored.loadSnapshot(durableState);

  assert.deepEqual(calls, ["register", "upsert", "load"]);
  assert.equal(snapshot, durableState);
  assert.equal(restored.pendingCount(), 0);
});

test("account boot keeps the durable local fallback while a state marker is conflict-blocked", async () => {
  const storage = createMemoryStorage();
  const localState = { decks: [{ id: "deck-1", name: "Lokal" }] };
  const first = createSyncEngine({ adapter: {}, outbox: createTestOutbox(storage), device: testDevice });
  first.enqueueMutation({ id: "blocked-state", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: localState } });
  let cloudLoads = 0;
  const restored = createSyncEngine({
    adapter: {
      async registerDevice() {},
      async listConflicts() {
        return [{ id: "conflict-1", status: "open" }];
      },
      async loadSnapshot() {
        cloudLoads += 1;
        return { decks: [{ id: "deck-1", name: "Remote" }] };
      },
    },
    outbox: createTestOutbox(storage),
    device: testDevice,
  });

  const snapshot = await restored.loadSnapshot(localState);

  assert.equal(snapshot, localState);
  assert.equal(cloudLoads, 0);
  assert.equal(restored.pendingCount(), 1);
});

test("account boot stays usable when replaying a pending review fails", async () => {
  const storage = createMemoryStorage();
  const localState = { decks: [{ id: "deck-1" }] };
  const first = createSyncEngine({ adapter: {}, outbox: createTestOutbox(storage), device: testDevice });
  first.enqueueMutation({ id: "review-offline", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });
  let cloudLoads = 0;
  const restored = createSyncEngine({
    adapter: {
      async registerDevice() {},
      async applyMutationBatch() {
        throw new Error("offline");
      },
      async loadSnapshot() {
        cloudLoads += 1;
        return { decks: [] };
      },
    },
    outbox: createTestOutbox(storage),
    device: testDevice,
  });

  const snapshot = await restored.loadSnapshot(localState);

  assert.equal(snapshot, localState);
  assert.equal(cloudLoads, 0);
  assert.equal(restored.pendingCount(), 1);
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

test("open conflicts pause snapshot writes after append-only reviews are confirmed", async () => {
  const outbox = createTestOutbox();
  let snapshotWrites = 0;
  let reviewWrites = 0;
  const engine = createSyncEngine({
    outbox,
    device: testDevice,
    adapter: {
      async listConflicts() {
        return [{ id: "conflict-1", status: "open" }];
      },
      async applyMutationBatch(mutations) {
        reviewWrites += 1;
        return { acknowledgedMutationIds: mutations.map((mutation) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
      async upsertState() {
        snapshotWrites += 1;
        return { acknowledgedMutationIds: [] };
      },
    },
  });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  const result = await engine.flush();

  assert.equal(result.paused, true);
  assert.deepEqual(result.conflicts.map((conflict) => conflict.id), ["conflict-1"]);
  assert.equal(reviewWrites, 1);
  assert.equal(snapshotWrites, 0);
  assert.deepEqual(outbox.listPending().map((mutation) => mutation.id), ["state-1"]);
});

test("resolving a conflict replaces stale snapshots, preserves reviews and returns the canonical state", async () => {
  const outbox = createTestOutbox();
  let resolved = false;
  let stateContext = null;
  let reviewIds = [];
  const engine = createSyncEngine({
    outbox,
    device: testDevice,
    now: () => "2026-07-12T12:00:00.000Z",
    adapter: {
      async resolveConflict(_conflictId, decision, context) {
        assert.equal(decision.action, "keep-remote");
        assert.equal(context.deviceId, "device-a");
        resolved = true;
        return {
          conflict: { id: "conflict-1", status: "resolved" },
          nextState: { decks: [{ id: "deck-1", name: "Remote", revision: 4 }] },
          resolved: true,
        };
      },
      async listConflicts() {
        return resolved ? [] : [{ id: "conflict-1", status: "open" }];
      },
      async applyMutationBatch(mutations) {
        reviewIds = mutations.map((mutation) => mutation.id);
        return { acknowledgedMutationIds: reviewIds, failedMutationIds: [], conflicts: [] };
      },
      async upsertState(state, context) {
        stateContext = { state, context };
        return { state: { decks: [{ ...state.decks[0], revision: 5 }] }, acknowledgedMutationIds: context.mutationIds };
      },
    },
  });
  engine.enqueueMutation({ id: "stale-state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [{ id: "deck-1", name: "Alt" }] } } });
  engine.enqueueMutation({ id: "stale-state-2", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [{ id: "deck-1", name: "Lokal" }] } } });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  const result = await engine.resolveConflict("conflict-1", { action: "keep-remote" }, { decks: [{ id: "deck-1", name: "Lokal" }] });

  assert.deepEqual(reviewIds, ["review-1"]);
  assert.deepEqual(stateContext.state.decks.map((deck) => deck.name), ["Remote"]);
  assert.equal(stateContext.context.mutationIds.length, 1);
  assert.equal(stateContext.context.mutationIds.includes("stale-state-1"), false);
  assert.equal(result.nextState.decks[0].revision, 5);
  assert.equal(result.syncStatus.status, "saved");
  assert.equal(engine.pendingCount(), 0);
});

test("a resolved conflict persists its chosen state before a failed flush and replays it after restart", async () => {
  const storage = createMemoryStorage();
  const localState = { decks: [{ id: "deck-1", name: "Lokal", revision: 3 }] };
  const remoteState = { decks: [{ id: "deck-1", name: "Remote", revision: 4 }] };
  let durableState = localState;
  const first = createSyncEngine({
    outbox: createTestOutbox(storage),
    device: testDevice,
    persistSnapshot(state) {
      durableState = state;
      return state;
    },
    adapter: {
      async resolveConflict() {
        return { conflict: { id: "conflict-1", status: "resolved" }, nextState: remoteState, resolved: true };
      },
      async listConflicts() {
        return [];
      },
      async upsertState() {
        throw new Error("offline after resolution");
      },
    },
  });

  await assert.rejects(() => first.resolveConflict("conflict-1", { action: "keep-remote" }, localState), /offline after resolution/);
  assert.equal(durableState, remoteState);
  assert.equal(first.pendingCount(), 1);

  let replayedState = null;
  const restored = createSyncEngine({
    outbox: createTestOutbox(storage),
    device: testDevice,
    adapter: {
      async registerDevice() {},
      async listConflicts() {
        return [];
      },
      async upsertState(state, context) {
        replayedState = state;
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
      async loadSnapshot() {
        return remoteState;
      },
    },
  });

  await restored.loadSnapshot(durableState);

  assert.equal(replayedState, remoteState);
  assert.equal(restored.pendingCount(), 0);
});

test("ignoring a conflict keeps the stale snapshot paused and returns conflict status", async () => {
  const outbox = createTestOutbox();
  const engine = createSyncEngine({
    outbox,
    device: testDevice,
    adapter: {
      async resolveConflict(_conflictId, decision, context) {
        return { conflict: { id: "conflict-1", status: "ignored" }, nextState: context.currentState, resolved: false };
      },
      async listConflicts() {
        return [{ id: "conflict-1", status: "ignored" }];
      },
    },
  });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });

  const currentState = { decks: [{ id: "deck-1" }] };
  const result = await engine.resolveConflict("conflict-1", { action: "ignore" }, currentState);

  assert.equal(result.nextState, currentState);
  assert.equal(result.syncStatus.status, "conflict");
  assert.deepEqual(outbox.listPending().map((mutation) => mutation.id), ["state-1"]);
});
