import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { SyncStatus } from "./coreTypes.ts";
import { startAppAutosaveLifecycle, startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";

const state = { decks: [] } as unknown as WorkspaceState;

test("sync lifecycle cleanup delegates to the account-bound engine", () => {
  let stopped = false;
  let acknowledgedRun = -1;
  let acknowledgements = 0;
  let flushListener: ((result: { saved: { state: WorkspaceState } }) => void) | null = null;
  const engine = {
    startSyncLifecycle(options: { onStatus(status: SyncStatus): void; onFlush(result: { saved: { state: WorkspaceState } }): void }) {
      flushListener = options.onFlush;
      options.onFlush({ saved: { state } });
      return () => { stopped = true; };
    },
  } as unknown as AccountSyncEngine;

  const cleanup = startAppSyncLifecycle({
    authPhase: "ready",
    syncEngine: engine,
    getLatestState: () => state,
    getRunId: () => 7,
    onStatus() {},
    onAcknowledged(_snapshot, _acknowledged, runId) { acknowledgedRun = runId; acknowledgements += 1; },
  });
  assert.equal(acknowledgedRun, 7);
  cleanup();
  assert.equal(stopped, true);
  const lateFlush = flushListener as ((result: { saved: { state: WorkspaceState } }) => void) | null;
  lateFlush?.({ saved: { state } });
  assert.equal(acknowledgedRun, 7);
  assert.equal(acknowledgements, 1);
});

test("autosave cleanup clears the pending write before an account switch", () => {
  let scheduled: (() => void | Promise<void>) | null = null;
  let cleared = false;
  let enqueued = false;
  const engine = {
    enqueueMutation() { enqueued = true; },
    async flush() { return { saved: { state } }; },
  } as unknown as AccountSyncEngine;
  const setTimer = ((handler: TimerHandler) => {
    if (typeof handler === "function") scheduled = handler as () => void | Promise<void>;
    return 1;
  }) as typeof globalThis.setTimeout;
  const clearTimer = (() => {
    cleared = true;
    scheduled = null;
  }) as typeof globalThis.clearTimeout;

  const cleanup = startAppAutosaveLifecycle({
    authPhase: "ready",
    syncEngine: engine,
    state,
    lastAcknowledgedState: null,
    runId: 3,
    delayMs: 900,
    onAcknowledged() {},
    onStatus() {},
    formatError: () => "Synchronisierung fehlgeschlagen.",
    setTimer,
    clearTimer,
  });
  assert.ok(scheduled);
  cleanup();
  assert.equal(cleared, true);
  assert.equal(scheduled, null);
  assert.equal(enqueued, false);
});

test("autosave acknowledges only the active scheduled snapshot", async () => {
  let scheduled: (() => void | Promise<void>) | null = null;
  let acknowledgedRun = -1;
  const engine = {
    enqueueMutation() {},
    async flush() { return { saved: { state } }; },
  } as unknown as AccountSyncEngine;
  const setTimer = ((handler: TimerHandler) => {
    if (typeof handler === "function") scheduled = handler as () => void | Promise<void>;
    return 1;
  }) as typeof globalThis.setTimeout;

  startAppAutosaveLifecycle({
    authPhase: "ready",
    syncEngine: engine,
    state,
    lastAcknowledgedState: null,
    runId: 11,
    delayMs: 900,
    onAcknowledged(_snapshot, _acknowledged, runId) { acknowledgedRun = runId; },
    onStatus() {},
    formatError: () => "Synchronisierung fehlgeschlagen.",
    setTimer,
    clearTimer: (() => {}) as typeof globalThis.clearTimeout,
  });
  assert.ok(scheduled);
  const runScheduled = scheduled as () => void | Promise<void>;
  await runScheduled();
  assert.equal(acknowledgedRun, 11);
});
