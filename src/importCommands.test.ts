import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createSyncSavedStatus } from "./accountSession.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createImportCommands } from "./importCommands.ts";
import type { ImportCloudSyncResult } from "./importCloudSyncTask.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";

Object.assign(globalThis, { IDBKeyRange });

async function setup() {
  const initialState: WorkspaceState = {
    version: 6,
    profile: {
      userId: randomUUID(),
      timezone: "Europe/Berlin",
      schedulerPreferences: { settingsVersion: 2, dayStartHour: 0 },
      uiPreferences: { syncIntervalMinutes: 5, flagNames: ["", "", "", "", "", "", ""], savedSearches: [] },
    } as unknown as WorkspaceState["profile"],
    decks: [],
    notes: [],
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const repository = await createIndexedDbCoreRepository({ userId: initialState.profile.userId, initialState, indexedDb: indexedDB as unknown as IDBFactory });
  const store = createWorkspaceStore();
  const refresh = ({ preserveCardPages = false } = {}) => {
    const state = repository.getShellState();
    store.set({ state, ...(preserveCardPages ? {} : { cardPages: {} }) });
    return state;
  };
  refresh();
  const commands = createImportCommands({ store, repository, hydration: () => null, cloud: null, syncEngine: () => null, refresh });
  return { repository, store, commands };
}

test("ein übernommener Import steht im Store und stößt die Cloud-Bestätigung an, die nach jedem gespeicherten Sync erneut läuft", async () => {
  const { repository, store, commands } = await setup();
  const stopFollowing = commands.followSyncStatus();

  const persisted = await commands.commitImport((await import("./fixtures/worldCapitals.ts")).createWorldCapitalsImportGraph(), { onMedia: async () => {} });

  const importedIds = persisted.decks.map((deck) => deck.id).sort();
  assert.ok(importedIds.length > 0);
  assert.deepEqual(store.get().state?.decks.map((deck) => deck.id).sort(), importedIds, "der Store zeigt die importierten Stapel");
  assert.ok(persisted.createdCount > 0);
  assert.equal((await repository.listCardPage(importedIds, { page: 0, pageSize: 500 })).totalCount, persisted.createdCount, "die Karten liegen lokal");

  const results: ImportCloudSyncResult[] = [];
  persisted.cloudTask!.subscribe((result) => results.push(result));
  await waitFor(() => results.at(-1)?.status === "local-pending");
  assert.equal(results.at(-1)?.message, "Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus.", "ohne Sync wartet die Bestätigung lokal");

  results.length = 0;
  store.set({ syncStatus: createSyncSavedStatus() });
  assert.equal(results[0]?.status, "syncing", "ein gespeicherter Sync stößt die wartende Bestätigung erneut an");
  await waitFor(() => results.at(-1)?.status === "local-pending");

  stopFollowing();
  results.length = 0;
  store.set({ syncStatus: createSyncSavedStatus() });
  assert.deepEqual(results, [], "nach dem Abmelden vom Sync-Status bleibt sie stehen");
});

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition());
}
