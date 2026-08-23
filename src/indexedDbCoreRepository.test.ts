import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createBasicLearningItem, createCoreDeck, createReviewState } from "./coreModel.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { answerVariant } from "./reviewService.ts";

Object.assign(globalThis, { IDBKeyRange });

function workspaceState(cardCount = 3) {
  const cards = Array.from({ length: cardCount }, (_, index) => createBasicLearningItem(
    "deck-idb",
    `Frage ${index}`,
    `Antwort ${index}`,
    { id: `card-${index}`, reviewState: createReviewState({ dueAt: "2026-08-20T04:00:00.000Z" }) },
  ));
  return {
    version: 5,
    profile: { userId: "user-idb", uiPreferences: {} },
    decks: [createCoreDeck({ id: "deck-idb", name: "IndexedDB", source: "manual", cards })],
    noteTypeDefinitions: [],
    cloudTombstones: [],
    updatedAt: "2026-08-19T00:00:00.000Z",
  } as any;
}

test("liest Karten deterministisch aus dem neuen leeren Namespace", async () => {
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState: workspaceState(55), indexedDb: indexedDB as any });
  const first = await repository.listCardPage("deck-idb", { page: 0, pageSize: 50 });
  const second = await repository.listCardPage("deck-idb", { page: 1, pageSize: 50 });
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 5);
  assert.equal(first.selectedCard, null);
  repository.close();
});

test("eine Bewertung aus einer alten Sitzung überschreibt keine neu gespeicherten Stapeleinstellungen", async () => {
  const userId = randomUUID();
  const initialState = workspaceState(1);
  const repository = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as any });
  const staleSessionDeck = initialState.decks[0];
  const currentDeck = repository.getShellState().decks[0];
  const desiredRetention = 0.96;

  repository.saveDeckMetadata([{
    ...currentDeck,
    deckSettings: {
      ...currentDeck.deckSettings,
      schedulerProfile: {
        ...currentDeck.deckSettings.schedulerProfile,
        presetId: "custom",
        desiredRetention,
      },
    },
    updatedAt: "2026-08-20T07:59:00.000Z",
  }]);

  const result = answerVariant(staleSessionDeck, "card-0", null, "good", {
    now: "2026-08-20T08:00:00.000Z",
  });
  repository.recordReview(result);
  await repository.flush();

  assert.equal(repository.getShellState().decks[0].deckSettings.schedulerProfile.desiredRetention, desiredRetention);
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  assert.equal(reopened.getShellState().decks[0].deckSettings.schedulerProfile.desiredRetention, desiredRetention);
  reopened.close();
});

test("plant mehrere Karten in einer lokalen Transaktion neu", async () => {
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState: workspaceState(), indexedDb: indexedDB as any });
  const before = await repository.loadCard("card-0");
  assert.ok(before);
  const result = await repository.rescheduleCards(["card-0", "card-1", "card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  assert.equal(result.length, 2);
  assert.equal((await repository.loadCard("card-0"))?.reviewState.dueAt, "2026-08-24T04:00:00.000Z");
  assert.deepEqual({ ...(await repository.loadCard("card-0"))?.reviewState, dueAt: before.reviewState.dueAt }, before.reviewState);
  const mutations = repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic");
  assert.equal(mutations.length, 2);
  assert.equal(mutations.every((mutation) => (mutation.payload as any).event.rating === "manual"), true);
  repository.close();
});

test("fehlende Karten brechen den gesamten Batch ab", async () => {
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState: workspaceState(), indexedDb: indexedDB as any });
  const before = (await repository.loadCard("card-0"))?.reviewState.dueAt;
  await assert.rejects(() => repository.rescheduleCards(["card-0", "fehlt"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z"), /nicht gefunden/);
  assert.equal((await repository.loadCard("card-0"))?.reviewState.dueAt, before);
  assert.equal(repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 0);
  repository.close();
});

test("identische Termine erzeugen kein manuelles Ereignis", async () => {
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState: workspaceState(1), indexedDb: indexedDB as any });
  await repository.rescheduleCards(["card-0"], "2026-08-20T04:00:00.000Z", "2026-08-19T10:00:00.000Z");
  assert.equal(repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 0);
  repository.close();
});

test("ausgesetzte Karten bleiben bei der Neuplanung ausgesetzt", async () => {
  const state = workspaceState(1);
  state.decks[0].cards[0].status = "suspended";
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState: state, indexedDb: indexedDB as any });
  await repository.rescheduleCards(["card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  assert.equal((await repository.loadCard("card-0"))?.status, "suspended");
  repository.close();
});

test("Offline-Neuplanungen bleiben nach erneutem Öffnen erhalten", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  await repository.rescheduleCards(["card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  await repository.flush();
  repository.close();
  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  assert.equal((await reopened.loadCard("card-0"))?.reviewState.dueAt, "2026-08-24T04:00:00.000Z");
  assert.equal(reopened.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 1);
  reopened.close();
});

test("synchronisierte manuelle Neuplanungen zählen nicht als Lernaktivität", async () => {
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState: workspaceState(1), indexedDb: indexedDB as any });
  const event = (id: string, rating: "manual" | "good") => ({
    id,
    userId: "user-idb",
    deckId: "deck-idb",
    learningItemId: "card-0",
    variantId: null,
    reviewableType: "card" as const,
    reviewableId: "card-0",
    sourceCardId: "card-0",
    rating,
    answeredAt: "2026-08-21T10:00:00.000Z",
    responseTimeMs: rating === "manual" ? null : 1_000,
    schedulerBefore: {},
    schedulerAfter: {},
    flags: {},
    createdAt: "2026-08-21T10:00:00.000Z",
  });
  await repository.listDeckSummaries({ now: "2026-08-21T12:00:00.000Z", timeZone: "UTC", dayStartHour: 0 });
  await repository.applyCloudPage({ table: "review_events", reset: false, entities: [event("manual", "manual"), event("review", "good")] });

  const result = await repository.listDeckSummaries({ now: "2026-08-21T12:00:00.000Z", timeZone: "UTC", dayStartHour: 0 });
  assert.equal(result.studyHeatmap.countsByDay.get("2026-08-21"), 1);
  repository.close();
});
