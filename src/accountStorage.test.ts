import assert from "node:assert/strict";
import test from "node:test";
import { accountStorageKeys, createAccountStorage, getOrCreateSyncDeviceId } from "./accountStorage.ts";
import { createCoreRepository } from "./coreRepository.ts";

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

test("pre-release storage uses only fresh account and device namespaces", () => {
  const storage = createMemoryStorage();
  storage.setItem("core.appState.v4", JSON.stringify({ decks: [{ id: "deck_1" }] }));
  assert.equal(createAccountStorage("user-a", storage).getItem("core.appState.v4"), null);
  assert.deepEqual(createCoreRepository({ seedDefaultDecks: false }).getState().decks, []);
  assert.equal(accountStorageKeys.ACCOUNT_STORAGE_PREFIX, "core.accountState.v2");
  assert.equal(accountStorageKeys.SYNC_DEVICE_KEY, "core.syncDevice.v2");
});
