import assert from "node:assert/strict";
import test from "node:test";
import { createSyncEngine, SYNC_MUTATION_TYPES } from "./syncEngine.ts";
import { createSyncOutbox } from "./syncOutbox.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key: any) => values.get(key) ?? null,
    setItem: (key: any, value: any) => values.set(key, String(value)),
    removeItem: (key: any) => values.delete(key),
  };
}

function createQuotaStorage(maxCharacters: number) {
  const values = new Map();
  return {
    getItem: (key: any) => values.get(key) ?? null,
    setItem(key: any, value: any) {
      const nextValues = new Map(values);
      nextValues.set(key, String(value));
      const size = [...nextValues.values()].reduce((total, item) => total + item.length, 0);
      if (size > maxCharacters) throw new Error("quota exceeded");
      values.set(key, String(value));
    },
    removeItem: (key: any) => values.delete(key),
  };
}

function createTestOutbox(storage = createMemoryStorage()) {
  return createSyncOutbox({ userId: "user-1", storage, now: () => "2026-07-09T09:00:00.000Z" });
}

function createNetworkTarget(initialOnline = true) {
  const listeners = new Map();
  return {
    navigator: { onLine: initialOnline },
    addEventListener(type: any, listener: any) {
      const selected = listeners.get(type) ?? new Set();
      selected.add(listener);
      listeners.set(type, selected);
    },
    removeEventListener(type: any, listener: any) {
      listeners.get(type)?.delete(listener);
    },
    setOnline(online: boolean) {
      this.navigator.onLine = online;
      for (const listener of listeners.get(online ? "online" : "offline") ?? []) listener();
    },
  };
}

function createFakeTimers() {
  let nextId = 1;
  const tasks = new Map();
  const delays: any[] = [];
  return {
    delays,
    setTimer(callback: any, delay: any) {
      const id = nextId;
      nextId += 1;
      tasks.set(id, callback);
      delays.push(delay);
      return id;
    },
    clearTimer(id: any) {
      tasks.delete(id);
    },
    count() {
      return tasks.size;
    },
    async runNext() {
      const [id, callback] = tasks.entries().next().value ?? [];
      if (!callback) return;
      tasks.delete(id);
      callback();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function waitForAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

const testDevice = Object.freeze({ id: "device-a", label: "Chrome auf Windows", userAgent: "Chrome Test" });

function restartWithPendingMutation(storage: { getItem: (key: any) => any; setItem: (key: any,value: any) => Map<any,any>; removeItem: (key: any) => boolean; }|undefined, mutation: { id: string; type: "state-patch"|"review-event-append"; payload: { state: { decks: { id: string; revision: number; }[]; }; }|{ state: { decks: { id: string; name: string; }[]; }; }|{ event: { id: string; }; }; }, adapter: { registerDevice: (() => Promise<void>)|(() => Promise<void>)|(() => Promise<void>); upsertState?: (state: any,context: any) => Promise<{ state: { decks: { id: string; revision: number; }[]; }; acknowledgedMutationIds: any; }>; loadSnapshot: (() => Promise<{ decks: { id: string; revision: number; }[]; }>)|(() => Promise<{ decks: { id: string; name: string; }[]; }>)|(() => Promise<{ decks: never[]; }>); listConflicts?: () => Promise<{ id: string; status: string; }[]>; applyMutationBatch?: () => Promise<never>; }) {
  createSyncEngine({ adapter: {}, outbox: createTestOutbox(storage), device: testDevice }).enqueueMutation(mutation);
  return createSyncEngine({ adapter, outbox: createTestOutbox(storage), device: testDevice });
}

test("sync engine flushes the latest state patch without issuing deletions", async () => {
  const calls: object[] = [];
  const adapter = {
    async loadSnapshot() {
      return { decks: [{ id: "remote-deck" }] };
    },
    async upsertState(state: { decks: string|any[]; }, context: { mutationIds: any; }) {
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(calls[0].method, "upsertState");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(calls[0].state.decks.map((deck: { id: any; }) => deck.id), ["local-latest"]);
  assert.equal(Object.hasOwn(calls[0], "deleteRowsMissingFromState"), false);
});

test("state snapshots stay out of the persistent outbox and still flush in the current session", async () => {
  const largeState = { decks: [{ id: "large-deck", content: "x".repeat(20_000) }] };
  let receivedState = null;
  const engine = createSyncEngine({
    adapter: {
      async upsertState(state: any, context: { mutationIds: any; }) {
        receivedState = state;
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
    },
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
  let signalFirstWrite: (value: unknown) => void;
  const firstWriteStarted = new Promise((resolve) => {
    signalFirstWrite = resolve;
  });
  const firstWriteGate = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const writes: unknown = [];
  const engine = createSyncEngine({
    adapter: {
      async upsertState(state: any, context: { mutationIds: any; }) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        writes.push(state);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        if (writes.length === 1) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
  const calls: unknown = [];
  const restored = restartWithPendingMutation(
    storage,
    { id: "offline-state", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: durableState } },
    {
      async registerDevice() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        calls.push("register");
      },
      async upsertState(state: unknown, context: { mutationIds: any; }) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        calls.push("upsert");
        assert.equal(state, durableState);
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
      async loadSnapshot() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        calls.push("load");
        return durableState;
      },
    },
  );

  const snapshot = await restored.loadSnapshot(durableState);

  assert.deepEqual(calls, ["register", "upsert", "load"]);
  assert.equal(snapshot, durableState);
  assert.equal(restored.pendingCount(), 0);
});

test("account boot keeps the durable local fallback while a state marker is conflict-blocked", async () => {
  const storage = createMemoryStorage();
  const localState = { decks: [{ id: "deck-1", name: "Lokal" }] };
  let cloudLoads = 0;
  const restored = restartWithPendingMutation(
    storage,
    { id: "blocked-state", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: localState } },
    {
      async registerDevice() {},
      async listConflicts() {
        return [{ id: "conflict-1", status: "open" }];
      },
      async loadSnapshot() {
        cloudLoads += 1;
        return { decks: [{ id: "deck-1", name: "Remote" }] };
      },
    },
  );

  const snapshot = await restored.loadSnapshot(localState);

  assert.equal(snapshot, localState);
  assert.equal(cloudLoads, 0);
  assert.equal(restored.pendingCount(), 1);
});

test("account boot stays usable when replaying a pending review fails", async () => {
  const storage = createMemoryStorage();
  const localState = { decks: [{ id: "deck-1" }] };
  let cloudLoads = 0;
  const restored = restartWithPendingMutation(
    storage,
    { id: "review-offline", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } },
    {
      async registerDevice() {},
      async applyMutationBatch() {
        throw new Error("offline");
      },
      async loadSnapshot() {
        cloudLoads += 1;
        return { decks: [] };
      },
    },
  );

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
      async upsertState(_state: any, context: { mutationIds: any; }) {
        receivedContext = context;
        return { state: acknowledgedState, summary: { decks: 1 }, acknowledgedMutationIds: context.mutationIds };
      },
    },
  });

  const mutation = engine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [{ id: "deck-1", revision: 3 }] } } });
  const result = await engine.flush();

  assert.ok(receivedContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(receivedContext.deviceId, "device-a");
  assert.ok(receivedContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(receivedContext.mutationIds, [mutation.id]);
  assert.equal(Object.hasOwn(receivedContext, "mutations"), false);
  assert.ok(receivedContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(receivedContext.flushedAt, "2026-07-10T12:00:00.000Z");
  assert.deepEqual(result.saved.state, acknowledgedState);
});

test("account boot registers the device before loading the cloud snapshot", async () => {
  const calls: { context: { lastSeenAt: unknown; }; }[]|{ method: string; device?: any; context?: any; fallbackState?: any; }[] = [];
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    now: () => "2026-07-11T08:00:00.000Z",
    adapter: {
      async registerDevice(device: any, context: any) {
        calls.push({ method: "registerDevice", device, context });
      },
      async loadSnapshot(fallbackState: any) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        calls.push({ method: "loadSnapshot", fallbackState });
        return { decks: [{ id: "remote-deck" }] };
      },
    },
  });

  const snapshot = await engine.loadSnapshot({ decks: [] });

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(calls.map((call) => call.method), ["registerDevice", "loadSnapshot"]);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
      async upsertState(_state: any, context: { mutationIds: any; }) {
        stateContext = context;
        return { state: { decks: [] }, acknowledgedMutationIds: context.mutationIds };
      },
      async applyMutationBatch(mutations: any[]) {
        reviewMutations = mutations;
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  await engine.flush();

  assert.ok(stateContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(stateContext.mutationIds, ["state-1"]);
  assert.ok(reviewMutations);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(reviewMutations.map((mutation: { id: any; }) => mutation.id), ["review-1"]);
  assert.equal(engine.pendingCount(), 0);
});

test("confirmed review events leave the outbox even when the following snapshot reports a conflict", async () => {
  const outbox = createTestOutbox();
  const conflictError = new Error("stale snapshot");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  conflictError.code = "cloud_revision_conflict";
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  conflictError.conflict = { id: "conflict-1", entityId: "card-1", status: "open" };
  const engine = createSyncEngine({
    device: testDevice,
    outbox,
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
      async upsertState() {
        throw conflictError;
      },
    },
  });
  engine.enqueueMutation({ id: "state-conflict", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  engine.enqueueMutation({ id: "review-confirmed", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  const result = await engine.flush();

  assert.equal(result.paused, true);
  assert.equal(result.syncStatus.status, "conflict");
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

  const failed = await first.flush();
  assert.equal(failed.offline, true);
  assert.equal(first.pendingCount(), 1);

  const restored = createSyncEngine({
    outbox: createTestOutbox(storage),
    device: testDevice,
    adapter: {
      async applyMutationBatch(mutations: { id: any; }[]) {
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
      async applyMutationBatch(mutations: any[]) {
        calls += 1;
        await Promise.resolve();
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });
  await Promise.all([engine.flush(), engine.flush()]);
  assert.equal(calls, 1);
});

test("open conflicts pause snapshot writes after append-only reviews are confirmed", async () => {
  const outbox = createTestOutbox();
  const timers = createFakeTimers();
  const statuses: { (): any; new(): any; status: unknown; }[] = [];
  let snapshotWrites = 0;
  let reviewWrites = 0;
  const engine = createSyncEngine({
    outbox,
    device: testDevice,
    networkTarget: createNetworkTarget(true),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async listConflicts() {
        return [{ id: "conflict-1", status: "open" }];
      },
      async applyMutationBatch(mutations: any[]) {
        reviewWrites += 1;
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
      async upsertState() {
        snapshotWrites += 1;
        return { acknowledgedMutationIds: [] };
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus: (status: any) => statuses.push(status) });
  engine.enqueueMutation({ id: "state-1", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  engine.enqueueMutation({ id: "review-1", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  const result = await engine.flush();

  assert.equal(result.paused, true);
  assert.deepEqual(result.conflicts.map((conflict: { id: any; }) => conflict.id), ["conflict-1"]);
  assert.equal(reviewWrites, 1);
  assert.equal(snapshotWrites, 0);
  assert.equal(timers.count(), 0);
  assert.ok(statuses);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(statuses.at(-1).status, "conflict");
  assert.deepEqual(outbox.listPending().map((mutation) => mutation.id), ["state-1"]);
  stop();
});

test("resolving a conflict replaces stale snapshots, preserves reviews and returns the canonical state", async () => {
  const outbox = createTestOutbox();
  let resolved = false;
  let stateContext = null;
  let reviewIds: unknown = [];
  const engine = createSyncEngine({
    outbox,
    device: testDevice,
    now: () => "2026-07-12T12:00:00.000Z",
    adapter: {
      async resolveConflict(_conflictId: any, decision: { action: unknown; }, context: { deviceId: unknown; }) {
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
      async applyMutationBatch(mutations: any[]) {
        reviewIds = mutations.map((mutation: { id: any; }) => mutation.id);
        return { acknowledgedMutationIds: reviewIds, failedMutationIds: [], conflicts: [] };
      },
      async upsertState(state: { decks: any[]; }, context: { mutationIds: any; }) {
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
  assert.ok(stateContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(stateContext.state.decks.map((deck: { name: any; }) => deck.name), ["Remote"]);
  assert.ok(stateContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(stateContext.context.mutationIds.length, 1);
  assert.ok(stateContext);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
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
    persistSnapshot(state: { decks: { id: string; name: string; revision: number; }[]; }) {
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

  const failedResolution = await first.resolveConflict("conflict-1", { action: "keep-remote" }, localState);
  assert.equal(failedResolution.syncStatus.status, "offline");
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
      async upsertState(state: any, context: { mutationIds: any; }) {
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
      async resolveConflict(_conflictId: any, decision: any, context: { currentState: any; }) {
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

test("offline lifecycle keeps mutations pending without starting an automatic timer", async () => {
  const networkTarget = createNetworkTarget(false);
  const timers = createFakeTimers();
  const statuses: { (): any; new(): any; status: unknown; }[] = [];
  let writes = 0;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        writes += 1;
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus: (status: any) => statuses.push(status) });
  engine.enqueueMutation({ id: "review-offline", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  const result = await engine.flush();

  assert.equal(result.offline, true);
  assert.equal(writes, 0);
  assert.equal(engine.pendingCount(), 1);
  assert.equal(timers.count(), 0);
  assert.ok(statuses);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(statuses.at(-1).status, "offline");
  stop();
});

test("online event cancels backoff and flushes pending mutations exactly once", async () => {
  const networkTarget = createNetworkTarget(true);
  const timers = createFakeTimers();
  const statuses: { (): any; new(): any; status: unknown; }[] = [];
  const flushResults: any[] = [];
  let writes = 0;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    random: () => 0.5,
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        writes += 1;
        if (writes === 1) throw new TypeError("Failed to fetch");
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  const stop = engine.startSyncLifecycle({
    onStatus: (status: any) => statuses.push(status),
    onFlush: (result: any) => flushResults.push(result),
  });
  engine.enqueueMutation({ id: "review-reconnect", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });
  await engine.flush();
  assert.equal(timers.count(), 1);

  networkTarget.setOnline(false);
  assert.equal(timers.count(), 0);
  networkTarget.setOnline(true);
  await waitForAsyncWork();

  assert.equal(writes, 2);
  assert.equal(engine.pendingCount(), 0);
  assert.ok(statuses);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(statuses.at(-1).status, "saved");
  assert.equal(flushResults.length, 1);
  assert.equal(flushResults[0].syncStatus.status, "saved");
  stop();
});

test("retry backoff grows with deterministic jitter, respects the cap and keeps one timer", async () => {
  const timers = createFakeTimers();
  let writes = 0;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget: createNetworkTarget(true),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    random: () => 0,
    adapter: {
      async applyMutationBatch() {
        writes += 1;
        const error = new Error("Service unavailable");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        error.status = 503;
        throw error;
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus() {} });
  engine.enqueueMutation({ id: "review-backoff", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });
  await engine.flush();
  await engine.flush();
  assert.equal(writes, 1);
  assert.equal(timers.count(), 1);

  for (let attempt = 0; attempt < 6; attempt += 1) await timers.runNext();

  assert.deepEqual(timers.delays, [500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
  assert.equal(timers.count(), 1);
  stop();
});

test("manual flush bypasses an active retry delay", async () => {
  const timers = createFakeTimers();
  let writes = 0;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget: createNetworkTarget(true),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        writes += 1;
        if (writes === 1) throw new TypeError("Failed to fetch");
        return { acknowledgedMutationIds: mutations.map((mutation: { id: any; }) => mutation.id), failedMutationIds: [], conflicts: [] };
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus() {} });
  engine.enqueueMutation({ id: "review-manual", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });
  await engine.flush();
  await engine.flush();
  assert.equal(writes, 1);

  await engine.flush(undefined, { force: true });

  assert.equal(writes, 2);
  assert.equal(engine.pendingCount(), 0);
  assert.equal(timers.count(), 0);
  stop();
});

test("partial review acknowledgement retries only the remaining mutation", async () => {
  const timers = createFakeTimers();
  const batches: unknown = [];
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget: createNetworkTarget(true),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async applyMutationBatch(mutations: any[]) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        batches.push(mutations.map((mutation: { id: any; }) => mutation.id));
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        if (batches.length === 1) {
          return {
            acknowledgedMutationIds: ["review-a"],
            failedMutationIds: ["review-b"],
            failures: [{ mutationId: "review-b", error: new TypeError("Failed to fetch") }],
            conflicts: [],
          };
        }
        return { acknowledgedMutationIds: ["review-b"], failedMutationIds: [], conflicts: [] };
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus() {} });
  engine.enqueueMutation({ id: "review-a", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-a" } } });
  engine.enqueueMutation({ id: "review-b", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-b" } } });
  await engine.flush();
  assert.equal(engine.pendingCount(), 1);

  await timers.runNext();

  assert.deepEqual(batches, [["review-a", "review-b"], ["review-b"]]);
  assert.equal(engine.pendingCount(), 0);
  stop();
});

test("lifecycle cleanup prevents reconnect writes for the previous account", async () => {
  const networkTarget = createNetworkTarget(false);
  const timers = createFakeTimers();
  let writes = 0;
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async upsertState() {
        writes += 1;
        return { acknowledgedMutationIds: [] };
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus() {} });
  engine.enqueueMutation({ id: "state-cleanup", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: { decks: [] } } });
  stop();
  networkTarget.setOnline(true);
  await waitForAsyncWork();

  assert.equal(writes, 0);
  assert.equal(timers.count(), 0);
  assert.equal(engine.pendingCount(), 1);
});

test("non-retryable sync failures surface an error without scheduling a timer", async () => {
  const timers = createFakeTimers();
  const statuses: { (): any; new(): any; status: unknown; }[] = [];
  const engine = createSyncEngine({
    device: testDevice,
    outbox: createTestOutbox(),
    networkTarget: createNetworkTarget(true),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async applyMutationBatch() {
        const error = new Error("Review-Inhalt stimmt nicht überein.");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        error.code = "review_event_confirmation_failed";
        throw error;
      },
    },
  });
  const stop = engine.startSyncLifecycle({ onStatus: (status: any) => statuses.push(status) });
  engine.enqueueMutation({ id: "review-invalid", type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: { id: "event-1" } } });

  await assert.rejects(() => engine.flush(), /stimmt nicht überein/);

  assert.ok(statuses);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(statuses.at(-1).status, "error");
  assert.equal(timers.count(), 0);
  assert.equal(engine.pendingCount(), 1);
  stop();
});

test("lifecycle retries a persisted state marker with the remembered fallback snapshot", async () => {
  const storage = createMemoryStorage();
  const fallbackState = { decks: [{ id: "deck-offline", revision: 2 }] };
  createSyncEngine({ adapter: {}, outbox: createTestOutbox(storage), device: testDevice })
    .enqueueMutation({ id: "state-persisted", type: SYNC_MUTATION_TYPES.statePatch, payload: { state: fallbackState } });
  let receivedState = null;
  let writes = 0;
  const timers = createFakeTimers();
  const engine = createSyncEngine({
    outbox: createTestOutbox(storage),
    device: testDevice,
    networkTarget: createNetworkTarget(true),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    adapter: {
      async registerDevice() {},
      async listConflicts() {
        return [];
      },
      async upsertState(state: any, context: { mutationIds: any; }) {
        writes += 1;
        if (writes === 1) throw new TypeError("Failed to fetch");
        receivedState = state;
        return { state, acknowledgedMutationIds: context.mutationIds };
      },
      async loadSnapshot() {
        return fallbackState;
      },
    },
  });
  const loaded = await engine.loadSnapshot(fallbackState);
  assert.equal(loaded, fallbackState);

  const stop = engine.startSyncLifecycle({ onStatus() {} });
  await timers.runNext();

  assert.equal(receivedState, fallbackState);
  assert.equal(engine.pendingCount(), 0);
  stop();
});
