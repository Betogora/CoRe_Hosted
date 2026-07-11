import assert from "node:assert/strict";
import test from "node:test";
import { createAccountStorage, getOrCreateSyncDeviceId, hasMeaningfulLocalState, hasPendingLocalMigration, markLocalMigrationHandled, readLegacyLocalState } from "./accountStorage.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("account storage keeps identical app keys separated per Supabase user", () => {
  const storage = createMemoryStorage();
  const userA = createAccountStorage("user-a", storage);
  const userB = createAccountStorage("user-b", storage);

  userA.setItem("core.appState.v2", JSON.stringify({ owner: "A" }));
  userB.setItem("core.appState.v2", JSON.stringify({ owner: "B" }));

  assert.equal(JSON.parse(userA.getItem("core.appState.v2")).owner, "A");
  assert.equal(JSON.parse(userB.getItem("core.appState.v2")).owner, "B");
  assert.notEqual(userA.accountKey("core.appState.v2"), userB.accountKey("core.appState.v2"));
});

test("sync device IDs stay stable per browser storage", () => {
  const storageA = createMemoryStorage();
  const storageB = createMemoryStorage();

  const firstId = getOrCreateSyncDeviceId(storageA);
  assert.equal(getOrCreateSyncDeviceId(storageA), firstId);
  assert.notEqual(getOrCreateSyncDeviceId(storageB), firstId);
});

test("legacy local state is offered once for account migration", () => {
  const storage = createMemoryStorage();
  storage.setItem("core.appState.v2", JSON.stringify({ decks: [{ id: "deck_1" }], documents: [], aiJobs: [], communities: [] }));

  const legacyState = readLegacyLocalState(storage);
  assert.equal(hasMeaningfulLocalState(legacyState), true);
  assert.equal(hasPendingLocalMigration("user-a", storage), true);

  markLocalMigrationHandled("user-a", "skipped", storage);
  assert.equal(hasPendingLocalMigration("user-a", storage), false);
  assert.equal(hasPendingLocalMigration("user-b", storage), true);
});
