import assert from "node:assert/strict";
import test from "node:test";
import { formatStorageBytes, requestPersistentWorkspaceStorage } from "./workspaceStorage.ts";

test("fordert persistenten Workspace-Speicher an und berichtet Nutzung und Quote", async () => {
  let requested = 0;
  const status = await requestPersistentWorkspaceStorage({
    async persisted() { return false; },
    async persist() { requested += 1; return true; },
    async estimate() { return { usage: 12 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 }; },
  });
  assert.equal(requested, 1);
  assert.deepEqual(status, { supported: true, persisted: true, usage: 12 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 });
  assert.equal(formatStorageBytes(status.usage), "12 MiB");
  assert.equal(formatStorageBytes(status.quota), "2 GiB");
});

test("behandelt abgewiesene Browser-Speicheranfragen als Best Effort", async () => {
  const status = await requestPersistentWorkspaceStorage({
    async persisted() { throw new Error("blocked"); },
    async persist() { throw new Error("blocked"); },
    async estimate() { throw new Error("blocked"); },
  });
  assert.deepEqual(status, { supported: true, persisted: false, usage: null, quota: null });
});
