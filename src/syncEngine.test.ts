import assert from "node:assert/strict";
import test from "node:test";
import { createSyncEngine, SYNC_MUTATION_TYPES } from "./syncEngine.ts";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function createTestOutbox(storage = createMemoryStorage()) {
  const read = () => JSON.parse(storage.getItem("outbox") ?? "[]") as any[];
  const write = (rows: any[]) => { storage.setItem("outbox", JSON.stringify(rows)); return rows; };
  return {
    enqueue(input: any) {
      const existing = read().find((row) => row.id === input.id);
      if (existing) return existing;
      const mutation = { userId: "user-1", deviceId: null, table: null, entityId: null, baseRevision: null, payload: {}, createdAt: "2026-07-09T09:00:00.000Z", flushedAt: null, retryCount: 0, ...input };
      write([...read(), mutation]);
      return mutation;
    },
    listPending: () => read().filter((row) => !row.flushedAt),
    markFlushed(ids: string[], flushedAt: string) { const selected = new Set(ids); return write(read().map((row) => selected.has(row.id) ? { ...row, flushedAt } : row)); },
    markFailed(ids: string[], error: unknown) { const selected = new Set(ids); return write(read().map((row) => selected.has(row.id) ? { ...row, retryCount: row.retryCount + 1, lastError: String((error as Error)?.message ?? error) } : row)); },
    remove(ids: string[]) { const selected = new Set(ids); return write(read().filter((row) => !selected.has(row.id))); },
    count: () => read().filter((row) => !row.flushedAt).length,
  };
}

function createNetworkTarget(initialOnline = true) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    navigator: { onLine: initialOnline },
    addEventListener(type: string, listener: () => void) {
      const selected = listeners.get(type) ?? new Set();
      selected.add(listener);
      listeners.set(type, selected);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    setOnline(online: boolean) {
      this.navigator.onLine = online;
      for (const listener of listeners.get(online ? "online" : "offline") ?? []) listener();
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
}

function createDocumentTarget(initialVisibility: "visible" | "hidden" = "visible") {
  const listeners = new Map<string, Set<() => void>>();
  return {
    visibilityState: initialVisibility,
    addEventListener(type: string, listener: () => void) {
      const selected = listeners.get(type) ?? new Set();
      selected.add(listener);
      listeners.set(type, selected);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    setVisibility(visibilityState: "visible" | "hidden") {
      this.visibilityState = visibilityState;
      for (const listener of listeners.get("visibilitychange") ?? []) listener();
    },
  };
}

function createFakeTimers() {
  let nextId = 1;
  const tasks = new Map<number, () => void>();
  const delays: number[] = [];
  return {
    delays,
    setTimer(callback: () => void, delay: number) {
      const id = nextId++;
      tasks.set(id, callback);
      delays.push(delay);
      return id;
    },
    clearTimer(id: number) { tasks.delete(id); },
    count() { return tasks.size; },
    async runNext() {
      const [id, callback] = tasks.entries().next().value ?? [];
      if (!callback) return;
      tasks.delete(id as number);
      callback();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function waitForAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

const device = Object.freeze({ id: "device-a", label: "Chrome", userAgent: "Test" });

function acknowledgingAdapter(onBatch?: (mutations: any[]) => void) {
  return {
    async registerDevice() {},
    async applyMutationBatch(mutations: any[]) {
      onBatch?.(mutations);
      return {
        acknowledgedMutationIds: mutations.map((mutation) => mutation.id),
        failedMutationIds: [],
        conflicts: [],
      };
    },
  };
}

test("profile and entity mutations coalesce without a snapshot fallback", async () => {
  const batches: any[][] = [];
  const engine = createSyncEngine({
    adapter: acknowledgingAdapter((batch) => batches.push(batch)),
    outbox: createTestOutbox(),
    device,
  });

  engine.enqueueMutation({ id: "profile-old", type: SYNC_MUTATION_TYPES.profilePatch, payload: { profile: { displayName: "Alt" } } });
  engine.enqueueMutation({ id: "profile-new", type: SYNC_MUTATION_TYPES.profilePatch, payload: { profile: { displayName: "Neu" } } });
  engine.enqueueMutation({ id: "card-old", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1", originalFront: "Alt" } }, entityId: "card-1" });
  engine.enqueueMutation({ id: "card-new", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1", originalFront: "Neu" } }, entityId: "card-1" });

  const result = await engine.flush();

  assert.equal(result.mutations, 2);
  assert.deepEqual(batches[0].map((mutation) => mutation.id), ["profile-new", "card-new"]);
  assert.equal(engine.pendingCount(), 0);
});

test("manual sync pulls cloud deltas even when the outbox is empty", async () => {
  let pulls = 0;
  const engine = createSyncEngine({
    adapter: { async listConflicts() { return []; } },
    outbox: createTestOutbox(),
    device,
    async pullChanges() { pulls += 1; },
  });

  const result = await engine.syncNow();

  assert.equal(pulls, 1);
  assert.equal(result.mutations, 0);
  assert.equal(result.syncStatus.status, "saved");
});

test("one conflicting mutation does not block acknowledged siblings or the cloud pull", async () => {
  const conflict = { id: "conflict-card-a", status: "open", cardId: "card-a" };
  let pulls = 0;
  const engine = createSyncEngine({
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        return {
          acknowledgedMutationIds: [mutations[1].id],
          failedMutationIds: [mutations[0].id],
          failures: [{ mutationId: mutations[0].id, error: { code: "cloud_revision_conflict", conflict } }],
          conflicts: [conflict],
        };
      },
      async listConflicts() { return [conflict]; },
    },
    outbox: createTestOutbox(),
    device,
    async pullChanges() { pulls += 1; },
  });
  engine.enqueueMutation({ id: "card-a", type: SYNC_MUTATION_TYPES.entityMutation, entityId: "card-a", payload: { table: "cards", entity: { id: "card-a" } } });
  engine.enqueueMutation({ id: "card-b", type: SYNC_MUTATION_TYPES.entityMutation, entityId: "card-b", payload: { table: "cards", entity: { id: "card-b" } } });

  const result = await engine.syncNow();

  assert.equal(pulls, 1);
  assert.equal(engine.pendingCount(), 1);
  assert.equal(result.syncStatus.status, "conflict");
});

test("autosync interval controls both periodic and debounced local triggers", () => {
  const activeTimers = createFakeTimers();
  const active = createSyncEngine({
    adapter: acknowledgingAdapter(), outbox: createTestOutbox(), device,
    setTimer: activeTimers.setTimer, clearTimer: activeTimers.clearTimer,
  });
  const stopActive = active.startSyncLifecycle({ intervalMinutes: 5, onStatus() {} });
  active.requestSync();
  assert.deepEqual(activeTimers.delays, [300_000, 400]);
  stopActive();

  const manualTimers = createFakeTimers();
  const manual = createSyncEngine({
    adapter: acknowledgingAdapter(), outbox: createTestOutbox(), device,
    setTimer: manualTimers.setTimer, clearTimer: manualTimers.clearTimer,
  });
  const stopManual = manual.startSyncLifecycle({ intervalMinutes: 0, onStatus() {} });
  manual.requestSync();
  assert.equal(manualTimers.count(), 0);
  stopManual();
});

test("focus and visibility run a full sync only for active automatic lifecycle", async () => {
  const networkTarget = createNetworkTarget();
  const documentTarget = createDocumentTarget();
  let pulls = 0;
  const engine = createSyncEngine({
    adapter: acknowledgingAdapter(), outbox: createTestOutbox(), device,
    networkTarget, documentTarget,
    async pullChanges() { pulls += 1; },
  });
  const stop = engine.startSyncLifecycle({ intervalMinutes: 5, onStatus() {} });

  networkTarget.dispatch("focus");
  await waitForAsyncWork();
  assert.equal(pulls, 1);
  documentTarget.setVisibility("hidden");
  networkTarget.dispatch("focus");
  await waitForAsyncWork();
  assert.equal(pulls, 1);
  documentTarget.setVisibility("visible");
  await waitForAsyncWork();
  assert.equal(pulls, 2);

  stop();
  networkTarget.dispatch("focus");
  await waitForAsyncWork();
  assert.equal(pulls, 2);
});

test("entity batches preserve foreign-key order", async () => {
  const order: string[] = [];
  const engine = createSyncEngine({
    adapter: acknowledgingAdapter((batch) => order.push(...batch.map((mutation) => mutation.payload.table))),
    outbox: createTestOutbox(),
    device,
  });

  for (const table of ["card_variants", "cards", "decks", "note_type_definitions"]) {
    engine.enqueueMutation({
      id: `mutation-${table}`,
      type: SYNC_MUTATION_TYPES.entityMutation,
      entityId: table,
      payload: { table, entity: { id: table } },
    });
  }
  await engine.flush();

  assert.deepEqual(order, ["note_type_definitions", "decks", "cards", "card_variants"]);
});

test("confirmed rows update only affected local records before acknowledgement", async () => {
  const persisted: any[] = [];
  const engine = createSyncEngine({
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        return {
          acknowledgedMutationIds: mutations.map((mutation) => mutation.id),
          failedMutationIds: [],
          conflicts: [],
          persistedRows: [{ table: "cards", row: { id: "card-1", revision: 4 } }],
        };
      },
    },
    outbox: createTestOutbox(),
    device,
    async persistMutationAcknowledgements(rows: any[]) {
      persisted.push(...rows);
    },
  });
  engine.enqueueMutation({ id: "card", type: SYNC_MUTATION_TYPES.entityMutation, entityId: "card-1", payload: { table: "cards", entity: { id: "card-1" } } });

  await engine.flush();

  assert.deepEqual(persisted, [{ table: "cards", row: { id: "card-1", revision: 4 } }]);
  assert.equal(engine.pendingCount(), 0);
});

test("partial acknowledgement retries only the remaining mutation", async () => {
  const batches: string[][] = [];
  let attempt = 0;
  const engine = createSyncEngine({
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        batches.push(mutations.map((mutation) => mutation.id));
        attempt += 1;
        return attempt === 1
          ? { acknowledgedMutationIds: ["first"], failedMutationIds: ["second"], failures: [{ mutationId: "second", error: Object.assign(new Error("später"), { status: 503 }) }] }
          : { acknowledgedMutationIds: ["second"], failedMutationIds: [] };
      },
    },
    outbox: createTestOutbox(),
    device,
  });
  engine.enqueueMutation({ id: "first", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1" } } });
  engine.enqueueMutation({ id: "second", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-2" } } });

  const first = await engine.flush();
  assert.equal(first.deferred, true);
  assert.equal(engine.pendingCount(), 1);
  await engine.flush({ force: true });

  assert.deepEqual(batches, [["first", "second"], ["second"]]);
  assert.equal(engine.pendingCount(), 0);
});

test("a mutation enqueued during an active flush survives for the next flush", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const batches: string[][] = [];
  const engine = createSyncEngine({
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        batches.push(mutations.map((mutation) => mutation.id));
        if (batches.length === 1) await gate;
        return { acknowledgedMutationIds: mutations.map((mutation) => mutation.id), failedMutationIds: [] };
      },
    },
    outbox: createTestOutbox(),
    device,
  });
  engine.enqueueMutation({ id: "first", type: SYNC_MUTATION_TYPES.entityMutation, entityId: "card-1", payload: { table: "cards", entity: { id: "card-1", originalFront: "A" } } });
  const active = engine.flush();
  await waitForAsyncWork();
  engine.enqueueMutation({ id: "second", type: SYNC_MUTATION_TYPES.entityMutation, entityId: "card-1", payload: { table: "cards", entity: { id: "card-1", originalFront: "B" } } });
  release();
  await active;

  assert.equal(engine.pendingCount(), 1);
  await engine.flush();
  assert.deepEqual(batches, [["first"], ["second"]]);
});

test("concurrent flush calls share one request", async () => {
  let calls = 0;
  const engine = createSyncEngine({
    adapter: acknowledgingAdapter(() => { calls += 1; }),
    outbox: createTestOutbox(),
    device,
  });
  engine.enqueueMutation({ id: "one", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1" } } });

  await Promise.all([engine.flush(), engine.flush()]);
  assert.equal(calls, 1);
});

test("offline lifecycle keeps the outbox and flushes once after reconnect", async () => {
  const networkTarget = createNetworkTarget(false);
  let calls = 0;
  const statuses: string[] = [];
  const engine = createSyncEngine({
    adapter: acknowledgingAdapter(() => { calls += 1; }),
    outbox: createTestOutbox(),
    device,
    networkTarget,
  });
  engine.enqueueMutation({ id: "offline", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1" } } });
  const stop = engine.startSyncLifecycle({ intervalMinutes: 5, onStatus: (status: any) => statuses.push(status.status) });

  assert.equal((await engine.flush()).offline, true);
  assert.equal(engine.pendingCount(), 1);
  networkTarget.setOnline(true);
  await waitForAsyncWork();

  assert.equal(calls, 1);
  assert.equal(engine.pendingCount(), 0);
  assert.equal(statuses.includes("offline"), true);
  stop();
});

test("retryable failures use capped backoff and manual flush bypasses it", async () => {
  const timers = createFakeTimers();
  let fail = true;
  const engine = createSyncEngine({
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        if (fail) return { acknowledgedMutationIds: [], failedMutationIds: mutations.map((mutation) => mutation.id), failures: mutations.map((mutation) => ({ mutationId: mutation.id, error: Object.assign(new Error("server"), { status: 503 }) })) };
        return { acknowledgedMutationIds: mutations.map((mutation) => mutation.id), failedMutationIds: [] };
      },
    },
    outbox: createTestOutbox(),
    device,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    retryBaseDelayMs: 1_000,
    retryMaxDelayMs: 1_500,
    random: () => 1,
  });
  engine.enqueueMutation({ id: "retry", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1" } } });
  const stop = engine.startSyncLifecycle({ onStatus() {} });

  await engine.flush();
  assert.deepEqual(timers.delays, [1_000]);
  fail = false;
  await engine.flush({ force: true });
  assert.equal(timers.count(), 0);
  assert.equal(engine.pendingCount(), 0);
  stop();
});

test("non-retryable failures surface without scheduling a timer", async () => {
  const timers = createFakeTimers();
  const engine = createSyncEngine({
    adapter: {
      async applyMutationBatch(mutations: any[]) {
        return { acknowledgedMutationIds: [], failedMutationIds: mutations.map((mutation) => mutation.id), failures: [{ mutationId: mutations[0].id, error: Object.assign(new Error("bad request"), { status: 400 }) }] };
      },
    },
    outbox: createTestOutbox(),
    device,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  engine.enqueueMutation({ id: "invalid", type: SYNC_MUTATION_TYPES.entityMutation, entityId: "card-1", payload: { table: "cards", entity: { id: "card-1" } } });
  const stop = engine.startSyncLifecycle({ onStatus() {} });

  await assert.rejects(() => engine.flush({ force: true }), /bad request/);
  assert.equal(timers.count(), 0);
  assert.equal(engine.pendingCount(), 1);
  stop();
});

test("initialize loads the cloud without blocking on the durable outbox", async () => {
  const storage = createMemoryStorage();
  const first = createSyncEngine({ adapter: {}, outbox: createTestOutbox(storage), device });
  first.enqueueMutation({ id: "persisted", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1" } } });
  const calls: string[] = [];
  const restarted = createSyncEngine({
    adapter: {
      async registerDevice() { calls.push("register"); },
      async applyMutationBatch() { calls.push("flush"); return { acknowledgedMutationIds: [], failedMutationIds: [] }; },
    },
    outbox: createTestOutbox(storage),
    device,
    async initialize() { calls.push("initialize"); },
  });

  await restarted.initialize();
  assert.deepEqual(calls, ["register", "initialize"]);
  assert.equal(restarted.pendingCount(), 1);
});

test("conflict resolution persists only the resolved entity page", async () => {
  const page = { table: "decks", entities: [{ id: "deck-1", name: "Lokal" }], cursor: null, reset: false };
  const persisted: any[] = [];
  const engine = createSyncEngine({
    adapter: {
      async resolveConflict() { return { conflict: { id: "conflict-1" }, resolvedPage: page }; },
      async listConflicts() { return []; },
    },
    outbox: createTestOutbox(),
    device,
    async persistResolvedPage(value: any) { persisted.push(value); },
  });

  const result = await engine.resolveConflict("conflict-1", { action: "keep-local" });

  assert.deepEqual(persisted, [page]);
  assert.equal(result.conflict.id, "conflict-1");
  assert.equal(result.syncStatus.status, "saved");
});

test("lifecycle cleanup prevents reconnect writes", async () => {
  const networkTarget = createNetworkTarget(false);
  let calls = 0;
  const engine = createSyncEngine({
    adapter: acknowledgingAdapter(() => { calls += 1; }),
    outbox: createTestOutbox(),
    device,
    networkTarget,
  });
  engine.enqueueMutation({ id: "pending", type: SYNC_MUTATION_TYPES.entityMutation, payload: { table: "cards", entity: { id: "card-1" } } });
  const stop = engine.startSyncLifecycle({ onStatus() {} });
  stop();
  networkTarget.setOnline(true);
  await waitForAsyncWork();

  assert.equal(calls, 0);
  assert.equal(engine.pendingCount(), 1);
});
