import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createSyncSavedStatus } from "./accountSession.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createImportCommands } from "./importCommands.ts";
import type { ImportCloudSyncResult } from "./importCloudSyncTask.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import type { AccountSyncEngine } from "./syncEngine.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";

Object.assign(globalThis, { IDBKeyRange });

async function setup({ userId = randomUUID() as string, syncEngine = null as AccountSyncEngine | null } = {}) {
  const initialState: WorkspaceState = {
    version: 6,
    profile: {
      userId,
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
  const commands = createImportCommands({ store, repository, hydration: () => null, cloud: null, syncEngine: () => syncEngine, refresh });
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

test("wartende Cloud-Bestätigungen laufen im nächsten Arbeitsbereich desselben Kontos weiter, die eines anderen verfallen", async () => {
  const { createWorldCapitalsImportGraph } = await import("./fixtures/worldCapitals.ts");
  const pausedEngine = () => {
    const engine = { flushes: 0, flush: async () => { engine.flushes += 1; return { paused: true }; }, pendingCount: () => 0 };
    return engine;
  };
  const previous = await setup();
  const { cloudTask } = await previous.commands.commitImport(createWorldCapitalsImportGraph(), { onMedia: async () => {} });
  await waitFor(() => cloudTask.status === "local-pending");
  previous.repository.close();

  const otherEngine = pausedEngine();
  const otherAccount = await setup({ syncEngine: otherEngine as unknown as AccountSyncEngine });
  const stopOther = otherAccount.commands.followSyncStatus();
  otherAccount.commands.continuePendingFrom(previous.commands);
  otherAccount.store.set({ syncStatus: createSyncSavedStatus() });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(otherEngine.flushes, 0, "ein anderes Konto übernimmt nichts");
  assert.equal(cloudTask.status, "local-pending");
  stopOther();

  const ended = await setup();
  const { cloudTask: waiting } = await ended.commands.commitImport(createWorldCapitalsImportGraph(), { onMedia: async () => {} });
  await waitFor(() => waiting.status === "local-pending");
  ended.repository.close();
  const nextEngine = pausedEngine();
  const next = await setup({ userId: ended.store.get().state!.profile.userId, syncEngine: nextEngine as unknown as AccountSyncEngine });
  const stopNext = next.commands.followSyncStatus();
  next.commands.continuePendingFrom(ended.commands);
  next.store.set({ syncStatus: createSyncSavedStatus() });
  await waitFor(() => waiting.status === "blocked");
  assert.equal(nextEngine.flushes, 1, "die Bestätigung läuft mit der Sync-Engine des neuen Arbeitsbereichs");
  stopNext();
  next.repository.close();
  otherAccount.repository.close();
});

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition());
}
