import assert from "node:assert/strict";
import test from "node:test";
import { createAccountStorage, getOrCreateSyncDeviceId } from "./accountStorage.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key: any) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: any) {
      values.delete(key);
    },
  };
}

test("account storage keeps identical timer keys separated per Supabase user", () => {
  const storage = createMemoryStorage();
  const userA = createAccountStorage("user-a", storage);
  const userB = createAccountStorage("user-b", storage);

  userA.setItem("core.pomodoroTimer.v1", JSON.stringify({ owner: "A" }));
  userB.setItem("core.pomodoroTimer.v1", JSON.stringify({ owner: "B" }));

  assert.equal(JSON.parse(userA.getItem("core.pomodoroTimer.v1")).owner, "A");
  assert.equal(JSON.parse(userB.getItem("core.pomodoroTimer.v1")).owner, "B");
  assert.notEqual(userA.accountKey("core.pomodoroTimer.v1"), userB.accountKey("core.pomodoroTimer.v1"));
});

test("sync device IDs stay stable per browser storage", () => {
  const storageA = createMemoryStorage();
  const storageB = createMemoryStorage();

  const firstId = getOrCreateSyncDeviceId(storageA);
  assert.equal(getOrCreateSyncDeviceId(storageA), firstId);
  assert.notEqual(getOrCreateSyncDeviceId(storageB), firstId);
});
