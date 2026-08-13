import assert from "node:assert/strict";
import test from "node:test";
import type { SyncStatus } from "./coreTypes.ts";
import { startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";

test("app sync lifecycle stops the account-bound engine and ignores late statuses", () => {
  let stopped = false;
  let listener: ((status: SyncStatus) => void) | null = null;
  const statuses: string[] = [];
  const engine = {
    startSyncLifecycle(options: { onStatus(status: SyncStatus): void }) {
      listener = options.onStatus;
      options.onStatus({ status: "saved", message: "Synchronisiert." } as SyncStatus);
      return () => { stopped = true; };
    },
  } as unknown as AccountSyncEngine;

  const cleanup = startAppSyncLifecycle({
    authPhase: "ready",
    syncEngine: engine,
    onStatus(status) { statuses.push(status.status); },
  });
  cleanup();
  const lateStatus = listener as ((status: SyncStatus) => void) | null;
  lateStatus?.({ status: "error", message: "Zu spät." } as SyncStatus);

  assert.equal(stopped, true);
  assert.deepEqual(statuses, ["saved"]);
});
