import assert from "node:assert/strict";
import test from "node:test";
import { createSyncPendingStatus, createSyncSavedStatus, createSyncSavingStatus } from "./accountSession.ts";
import { createCoreDeck } from "./coreModel.ts";
import { createCoreRepository } from "./coreRepository.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { DEFAULT_CARD_TABLE_SORT, type DeckLibrarySummary } from "./libraryModel.ts";
import { summarizeDeckReview } from "./scheduler.ts";
import { createStudyHeatmapModelFromCounts } from "./studyHeatmapModel.ts";
import type { OfflineDeckRecord } from "./workspaceReplica.ts";
import { createSelectionReader, createWorkspaceStore, type WorkspaceSnapshot } from "./workspaceStore.ts";

const NOW = "2026-11-11T08:00:00.000Z";

const BASE_STATE = createCoreRepository().getState();

/** A new shell object per call with the same content, as every sync applies one. */
function shellState(userId: string): WorkspaceState {
  const state = structuredClone(BASE_STATE);
  return { ...state, profile: { ...state.profile, userId } };
}

function summary(completedTodayCount: number, startableCount: number): DeckLibrarySummary {
  return {
    inventory: summarizeDeckReview(createCoreDeck({ id: "deck", name: "Stapel", source: "manual", cards: [] }), NOW),
    dailyProgress: { completedTodayCount, newCount: 0, inProgressCount: 0, dueCount: startableCount, total: completedTodayCount + startableCount },
    startableCount,
    additionalNewCount: 0,
    effectiveNewLimit: 20,
    introducedTodayCount: 0,
    dateKey: "2026-11-11",
  };
}

function offlineDeck(deckId: string, state: OfflineDeckRecord["state"]): OfflineDeckRecord {
  return { id: deckId, deckId, state, expectedCardCount: 0, verifiedCardCount: 0, expectedMediaCount: 0, verifiedMediaCount: 0, expectedBytes: 0, downloadedBytes: 0, manifestCursor: "", failureMessage: null, updatedAt: NOW };
}

/** Counts how often a subscriber comparing by identity (as `useSyncExternalStore` does) would render. */
function watch<T>(store: ReturnType<typeof createWorkspaceStore>, select: (snapshot: WorkspaceSnapshot) => T) {
  const read = createSelectionReader<T>();
  let value = read(store, select);
  const watched = { renders: 0, value: () => value };
  store.subscribe(() => {
    const next = read(store, select);
    if (Object.is(next, value)) return;
    value = next;
    watched.renders += 1;
  });
  return watched;
}

test("a subscriber renders only when its selected part changes in content", () => {
  const store = createWorkspaceStore();
  const conflicts = watch(store, (snapshot) => snapshot.syncConflictCardIds);
  const sync = watch(store, (snapshot) => ({ status: snapshot.syncStatus, lastSyncedAt: snapshot.lastSyncedAt }));
  const state = watch(store, (snapshot) => snapshot.state);

  store.set({ syncConflictCardIds: new Set(["card-a"]) });
  assert.equal(conflicts.renders, 1);
  store.set({ syncConflictCardIds: new Set(["card-a"]) });
  store.set({ deckSummaries: new Map([["deck", summary(0, 3)]]) });
  assert.equal(conflicts.renders, 1, "ein neues, gleiches Set und fremde Teile rendern nicht");
  assert.equal(sync.renders, 0, "eine Auswahl als neues Objekt rendert nur bei geändertem Inhalt");

  store.set({ state: shellState("account-a") });
  store.set({ state: shellState("account-a") });
  assert.equal(state.renders, 1, "ein inhaltsgleicher Arbeitsbereich behält seine Identität");
  store.set({ state: { ...shellState("account-a"), updatedAt: "2026-11-11T09:00:00.000Z" } });
  assert.equal(state.renders, 2);

  store.set({ syncStatus: createSyncSavedStatus("Synchronisiert.", () => "2026-11-11T09:00:00.000Z") });
  store.set({ syncStatus: createSyncPendingStatus(1) });
  assert.equal(sync.renders, 2);
  assert.equal(sync.value().lastSyncedAt, "2026-11-11T09:00:00.000Z", "der letzte Erfolg bleibt bei ausstehenden Änderungen");
});

test("a selection depending on the caller's input follows a new selector at once", () => {
  const store = createWorkspaceStore();
  store.set({ offlineDecks: { a: offlineDeck("a", "available"), b: offlineDeck("b", "error") } });
  const read = createSelectionReader<string | undefined>();
  assert.equal(read(store, (snapshot) => snapshot.offlineDecks.a?.state), "available");
  assert.equal(read(store, (snapshot) => snapshot.offlineDecks.b?.state), "error");
});

test("clearing on an account change leaves nothing of the previous account visible", () => {
  const store = createWorkspaceStore();
  store.set({
    state: shellState("account-a"),
    deckSummaries: new Map([["deck-a", summary(4, 2)]]),
    studyHeatmap: createStudyHeatmapModelFromCounts({ todayKey: "2026-11-11", countsByDay: new Map([["2026-11-11", 4]]) }),
    syncStatus: createSyncSavedStatus("Synchronisiert.", () => NOW),
    syncConflictCardIds: new Set(["card-a"]),
    cardPages: { "deck-a": { deckId: "deck-a", pages: {}, pageSize: 50, totalCount: 0, query: "", sort: DEFAULT_CARD_TABLE_SORT } },
    offlineDecks: { "deck-a": offlineDeck("deck-a", "available") },
    storageStatus: { supported: true, persisted: true, usage: 1, quota: 2 },
  });
  const state = watch(store, (snapshot) => snapshot.state);
  const revisionBefore = store.get().revision;

  store.clear();
  const cleared = store.get();
  assert.equal(state.renders, 1);
  assert.equal(cleared.state, null);
  assert.equal(cleared.deckSummaries, undefined);
  assert.equal(cleared.studyHeatmap, undefined);
  assert.equal(cleared.syncStatus.status, "idle");
  assert.equal(cleared.lastSyncedAt, null);
  assert.equal(cleared.syncConflictCardIds.size, 0);
  assert.deepEqual(cleared.cardPages, {});
  assert.deepEqual(cleared.offlineDecks, {});
  assert.equal(cleared.storageStatus, null);
  assert.ok(cleared.revision > revisionBefore, "eine für das alte Konto geladene Stapelzahl zählt nie als aktuell");

  store.set({ state: shellState("account-b"), syncStatus: createSyncSavingStatus() });
  assert.equal(store.get().state?.profile.userId, "account-b");
  assert.equal(store.get().lastSyncedAt, null);
});

test("deck counts loaded after a study session belong to its last answer, although the shell never changed", () => {
  const store = createWorkspaceStore();
  store.set({ state: shellState("account-a"), deckSummaries: new Map([["deck", summary(0, 5)]]) });
  const state = watch(store, (snapshot) => snapshot.state);
  const counts = watch(store, (snapshot) => snapshot.deckSummaries);
  const sessionStart = store.get().revision;

  // Every answer syncs and applies an unchanged shell; nothing that shows deck counts renders meanwhile.
  for (let answered = 1; answered <= 3; answered += 1) store.set({ state: shellState("account-a") });
  assert.equal(state.renders, 0);
  assert.equal(counts.renders, 0);
  assert.equal(store.get().revision, sessionStart + 3, "jede Antwort rückt die Revision weiter, auf die das Laden der Stapelzahlen wartet");

  // Leaving the session loads the counts once for the newest revision.
  store.set({ deckSummaries: new Map([["deck", summary(3, 2)]]) });
  assert.equal(counts.renders, 1);
  assert.equal(counts.value()?.get("deck")?.dailyProgress.completedTodayCount, 3);
  assert.equal(counts.value()?.get("deck")?.startableCount, 2);
});
