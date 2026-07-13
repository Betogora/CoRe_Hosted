import assert from "node:assert/strict";
import test from "node:test";
import { createSyncOutbox } from "./syncOutbox.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("outbox survives recreation and deduplicates mutation ids", () => {
  const storage = createMemoryStorage();
  const first = createSyncOutbox({ userId: "user-a", storage });
  first.enqueue({ id: "mutation-1", type: "review-event-append", payload: { event: { id: "review-1" } } });
  first.enqueue({ id: "mutation-1", type: "review-event-append", payload: { event: { id: "review-1" } } });
  const restored = createSyncOutbox({ userId: "user-a", storage });
  assert.equal(restored.count(), 1);
});

test("account storage instances isolate outboxes and malformed data is harmless", () => {
  const storageA = createMemoryStorage();
  const storageB = createMemoryStorage();
  storageA.setItem("syncOutbox.v1", "not-json");
  const outboxA = createSyncOutbox({ userId: "user-a", storage: storageA });
  const outboxB = createSyncOutbox({ userId: "user-b", storage: storageB });
  assert.equal(outboxA.count(), 0);
  outboxB.enqueue({ id: "mutation-b", type: "state-patch" });
  assert.equal(outboxA.count(), 0);
  assert.equal(outboxB.count(), 1);
});

test("failed mutations remain pending and increment their retry counter", () => {
  const outbox = createSyncOutbox({ userId: "user-a", storage: createMemoryStorage() });
  outbox.enqueue({ id: "mutation-1", type: "state-patch" });
  outbox.markFailed(["mutation-1"], new Error("offline"));
  assert.equal(outbox.listPending()[0].retryCount, 1);
  outbox.markFlushed(["mutation-1"], "2026-07-11T12:00:00.000Z");
  assert.equal(outbox.count(), 0);
});

test("outbox keeps valid account mutations while discarding invalid and foreign rows", () => {
  const storage = createMemoryStorage();
  storage.setItem("syncOutbox.v1", JSON.stringify([
    {
      id: "mutation-valid",
      userId: "user-a",
      deviceId: null,
      type: "state-patch",
      table: null,
      entityId: null,
      baseRevision: null,
      payload: {},
      createdAt: "2026-07-13T08:00:00.000Z",
      flushedAt: null,
      retryCount: 0,
    },
    { id: "mutation-invalid", userId: "user-a", type: "state-patch" },
    {
      id: "mutation-foreign",
      userId: "user-b",
      deviceId: null,
      type: "state-patch",
      table: null,
      entityId: null,
      baseRevision: null,
      payload: {},
      createdAt: "2026-07-13T08:00:00.000Z",
      flushedAt: null,
      retryCount: 0,
    },
  ]));

  const outbox = createSyncOutbox({ userId: "user-a", storage });
  assert.deepEqual(outbox.listPending().map((row) => row.id), ["mutation-valid"]);
});
