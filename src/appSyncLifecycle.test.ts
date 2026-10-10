import assert from "node:assert/strict";
import test from "node:test";
import type { SyncStatus } from "./coreTypes.ts";
import { startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";

test("app sync lifecycle stops the account-bound engine and ignores late statuses", () => {
  let stopped = false;
  let intervalMinutes = -1;
  let listener: ((status: SyncStatus) => void) | null = null;
  const statuses: string[] = [];
  const engine = {
    startSyncLifecycle(options: { intervalMinutes: number; onStatus(status: SyncStatus): void }) {
      intervalMinutes = options.intervalMinutes;
      listener = options.onStatus;
      options.onStatus({ status: "saved", message: "Synchronisiert." } as SyncStatus);
      return () => { stopped = true; };
    },
  } as unknown as AccountSyncEngine;

  const cleanup = startAppSyncLifecycle({
    authPhase: "ready",
    syncEngine: engine,
    syncIntervalMinutes: 5,
    onStatus(status) { statuses.push(status.status); },
  });
  cleanup();
  const lateStatus = listener as ((status: SyncStatus) => void) | null;
  lateStatus?.({ status: "error", message: "Zu spät." } as SyncStatus);

  assert.equal(stopped, true);
  assert.equal(intervalMinutes, 5);
  assert.deepEqual(statuses, ["saved"]);
});

test("app sync lifecycle rebuilds the workspace only after syncs that changed something", () => {
  let flush: ((result: unknown) => void) | null = null;
  const engine = {
    startSyncLifecycle(options: { onFlush(result: unknown): void }) {
      flush = options.onFlush;
      return () => {};
    },
  } as unknown as AccountSyncEngine;
  let synced = 0;
  const cleanup = startAppSyncLifecycle({ authPhase: "ready", syncEngine: engine, syncIntervalMinutes: 5, onStatus() {}, onSynced() { synced += 1; } });
  const report = flush as unknown as (result: unknown) => void;

  report({ mutations: 0, pulledChanges: false, conflicts: [] });
  assert.equal(synced, 0);
  report({ mutations: 1, pulledChanges: false, conflicts: [] });
  report({ mutations: 0, pulledChanges: true, conflicts: [] });
  report({ mutations: 0, pulledChanges: false, conflicts: [{}] });
  assert.equal(synced, 3);
  cleanup();
});
