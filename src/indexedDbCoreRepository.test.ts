import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, IDBObjectStore as FakeIDBObjectStore, indexedDB } from "fake-indexeddb";
import { createBasicLearningItem, createCoreDeck, createCoreNoteTypeDefinition, createManualCoreDeck } from "./coreModel.ts";
import { restoreSoftDeletedCard, softDeleteCard } from "./coreWorkspace.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";

Object.assign(globalThis, { IDBKeyRange });

function storage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

function workspaceState(cardCount = 0) {
  const cards = Array.from({ length: cardCount }, (_, index) => createBasicLearningItem(
    "deck-idb",
    `Frage ${String(index).padStart(5, "0")}`,
    `Antwort ${index}`,
    { id: `card-${String(index).padStart(5, "0")}` },
  ));
  return {
    version: 4,
    profile: { userId: "user-idb", uiPreferences: {} },
    decks: [createCoreDeck({ id: "deck-idb", name: "IndexedDB", source: "manual", cards })],
    documents: [],
    noteTypeDefinitions: [],
    learningItemSourceSnapshots: [],
    cloudTombstones: [],
    updatedAt: "2026-08-11T00:00:00.000Z",
  } as any;
}

test("migriert den Root-State einmalig und liest Karten in deterministischen 100er-Seiten", async () => {
  const userId = randomUUID();
  const legacyStorage = storage({ "core.appState.v4": JSON.stringify(workspaceState(205)) });
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(205), legacyStorage, indexedDb: indexedDB as any });
  const first = await repository.listCardPage("deck-idb", { page: 0, pageSize: 100 });
  const third = await repository.listCardPage("deck-idb", { page: 2, pageSize: 100 });
  const search = await repository.listCardPage("deck-idb", { query: "Frage 00204" });

  assert.equal(first.items.length, 100);
  assert.equal(first.totalCount, 205);
  assert.equal(third.items.length, 5);
  assert.equal(search.items[0]?.id, "card-00204");
  const selected = await repository.listCardPage("deck-idb", { page: 0, pageSize: 100, selectedCardId: "card-00204" });
  assert.equal(selected.selectedCard?.id, "card-00204");
  assert.equal(selected.selectedCard?.variants.length, 1);
  assert.equal(legacyStorage.has("core.appState.v4"), true, "Altzustand bleibt bis zum bestätigten Cloud-Sync erhalten");
  repository.confirmCloudSync();
  assert.equal(legacyStorage.has("core.appState.v4"), false);
  repository.close();
});

test("normaler Boot liest auch beim 100k-/1m-Skalierungsvertrag keine Karten, Varianten oder Reviews vollständig", async () => {
  const userId = randomUUID();
  const initialState = workspaceState(1);
  initialState.decks[0].importMeta = {
    ...initialState.decks[0].importMeta,
    conceptualCardCount: 100_000,
    conceptualReviewEventCount: 1_000_000,
  };
  const seeded = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as any });
  await seeded.flush();
  seeded.close();

  const getAllCalls = new Map<string, number>();
  const targetDatabaseName = `core.workspace.entities.v1.${userId}`;
  const originalGetAll = FakeIDBObjectStore.prototype.getAll;
  FakeIDBObjectStore.prototype.getAll = function instrumentedGetAll(...args: Parameters<IDBObjectStore["getAll"]>) {
    if (this.transaction.db.name === targetDatabaseName) {
      getAllCalls.set(this.name, (getAllCalls.get(this.name) ?? 0) + 1);
    }
    return originalGetAll.apply(this, args);
  };
  try {
    const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
    const shell = await repository.loadShell();

    assert.equal(shell.decks[0].importMeta.conceptualCardCount, 100_000);
    assert.equal(shell.decks[0].importMeta.conceptualReviewEventCount, 1_000_000);
    assert.equal(getAllCalls.get("cards") ?? 0, 0);
    assert.equal(getAllCalls.get("variants") ?? 0, 0);
    assert.equal(getAllCalls.get("reviewEvents") ?? 0, 0);
    assert.equal(getAllCalls.get("noteTypeDefinitions") ?? 0, 0);
    assert.equal(getAllCalls.get("sourceSnapshots") ?? 0, 0);
    const card = await repository.loadCard("card-00000");
    assert.equal(card?.id, "card-00000");
    assert.equal(getAllCalls.get("cards") ?? 0, 0, "Kartenladen muss einen Key-Lookup statt Store-getAll verwenden");

    await repository.materializeFullState();
    assert.equal(getAllCalls.get("cards"), 1);
    assert.equal(getAllCalls.get("variants"), 1);
    assert.equal(getAllCalls.get("reviewEvents"), 1);
    assert.equal(getAllCalls.get("noteTypeDefinitions"), 1);
    assert.equal(getAllCalls.get("sourceSnapshots"), 1);
    repository.close();
  } finally {
    FakeIDBObjectStore.prototype.getAll = originalGetAll;
  }
});

test("extrahiert dynamische Notiztypen vor der Cloud-Planung und persistiert sie separat", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const previous = structuredClone(await repository.materializeFullState());
  const document = {
    schemaVersion: 1 as const,
    definitionVersionId: "definition-manual-v1",
    fields: [
      { id: "front", sourceFieldId: null, name: "Vorderseite", value: "Frage", placement: "front" as const, semanticRole: "prompt" as const },
      { id: "back", sourceFieldId: null, name: "Rückseite", value: "Antwort", placement: "back" as const, semanticRole: "answer" as const },
    ],
    tags: [],
    mediaRefs: [],
  };
  const definition = createCoreNoteTypeDefinition({ document, createdAt: "2026-08-11T00:00:00.000Z" });
  const deck = createManualCoreDeck({
    deckName: "Dynamisch",
    card: { front: "Frage", back: "Antwort", contentDocument: document, noteTypeDefinition: definition },
  });

  await repository.commitImportGraph({ decks: [deck], noteTypeDefinitions: [definition], sourceSnapshots: [] });
  const next = await repository.materializeFullState();
  const mutations = planEntityMutations({
    decks: previous.decks,
    noteTypeDefinitions: previous.noteTypeDefinitions,
    sourceSnapshots: previous.learningItemSourceSnapshots,
  }, {
    decks: next.decks,
    noteTypeDefinitions: next.noteTypeDefinitions,
    sourceSnapshots: next.learningItemSourceSnapshots,
  });

  assert.equal(next.noteTypeDefinitions.some((candidate) => candidate.id === definition.id), true);
  assert.equal("noteTypeDefinitionV1" in next.decks.find((candidate) => candidate.id === deck.id)!.cards[0].meta, false);
  assert.ok(mutations.findIndex((mutation) => mutation.table === "note_type_definitions") < mutations.findIndex((mutation) => mutation.table === "cards"));
  await repository.flush();
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const reopenedState = await reopened.materializeFullState();
  assert.equal(reopenedState.noteTypeDefinitions.some((candidate) => candidate.id === definition.id), true);
  reopened.close();
});

test("streamt einen Worker-Import in begrenzten Chunks direkt in Entity-Stores und Outbox", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const cards = Array.from({ length: 205 }, (_, index) => createBasicLearningItem(
    "deck-stream",
    `Frage ${index}`,
    `Antwort ${index}`,
    { id: `stream-card-${index}` },
  ));
  const deck = createCoreDeck({ id: "deck-stream", name: "Worker-Import", source: "anki-apkg", cards });
  const observedChunkSizes: number[] = [];
  const graph = {
    kind: "worker-import" as const,
    deckCount: 1,
    cardCount: cards.length,
    noteTypeDefinitions: [],
    deckIdentities: [{ id: deck.id, originalDeckId: deck.originalDeckId }],
    mediaTargets: [],
    async streamChunks(visit: (chunk: unknown) => Promise<void>) {
      const { cards: _cards, reviewEvents: _events, ...summary } = deck;
      await visit({ kind: "deck", summary });
      for (let offset = 0; offset < cards.length; offset += 100) {
        const values = cards.slice(offset, offset + 100);
        observedChunkSizes.push(values.length);
        await visit({ kind: "cards", deckId: deck.id, values, definitions: [], snapshots: [] });
      }
      await visit({ kind: "outbox" });
    },
    dispose() {},
  };

  await repository.commitImportGraph(graph);
  await repository.flush();
  const page = await repository.listCardPage(deck.id, { page: 2, pageSize: 100 });

  assert.deepEqual(observedChunkSizes, [100, 100, 5]);
  assert.equal(page.items.length, 5);
  assert.equal(page.totalCount, 205);
  assert.equal(repository.outbox.count() > 205, true);
  repository.close();
});

test("ordnet einen unveränderten Reimport-Snapshot der bereits persistierten Karten-ID zu", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const snapshot = {
    id: "snapshot-stable",
    schemaVersion: 1 as const,
    sourceKind: "anki-apkg" as const,
    importFingerprint: "fixture",
    previousSnapshotId: null,
    definitionVersionId: null,
    sourcePayload: { note: { id: 10 } },
    createdAt: "2026-08-11T00:00:00.000Z",
  };
  const createGraph = (deckId: string, cardId: string) => {
    const card = createBasicLearningItem(deckId, "Frage", "Antwort", {
      id: cardId,
      sourceType: "anki_import",
      sourceRefId: "note-10",
    });
    card.latestSourceSnapshotId = snapshot.id;
    const deck = createCoreDeck({ id: deckId, name: "Reimport", source: "anki-apkg", originalDeckId: "anki-deck-1", cards: [card] });
    return {
      kind: "worker-import" as const,
      deckCount: 1,
      cardCount: 1,
      noteTypeDefinitions: [],
      deckIdentities: [{ id: deck.id, originalDeckId: deck.originalDeckId }],
      mediaTargets: [],
      async streamChunks(visit: (chunk: unknown) => Promise<void>) {
        const { cards: _cards, reviewEvents: _events, ...summary } = deck;
        await visit({ kind: "deck", summary });
        await visit({ kind: "cards", deckId, values: [card], definitions: [], snapshots: [{ snapshot, cardId, attachToCard: true }] });
        await visit({ kind: "outbox" });
      },
      dispose() {},
    };
  };

  await repository.commitImportGraph(createGraph("incoming-deck-1", "incoming-card-1"));
  await repository.flush();
  const firstCard = (await repository.listCardPage("incoming-deck-1", { pageSize: 100 })).items[0];
  await repository.commitImportGraph(createGraph("incoming-deck-2", "incoming-card-2"));
  await repository.flush();

  const mutation = repository.outbox.listPending().find((candidate) => candidate.table === "learning_item_source_snapshots" && candidate.entityId === snapshot.id);
  assert.equal((mutation?.payload as any).cardId, firstCard.id);
  assert.equal((await repository.materializeFullState()).learningItemSourceSnapshots[0].createdAt, snapshot.createdAt);
  repository.close();
});

test("persistiert eine gezielte Kartenänderung und die Outbox als getrennte Records", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(3), indexedDb: indexedDB as any });
  await repository.updateCard("deck-idb", "card-00001", (card) => ({
    ...card,
    originalFront: "Gezielt geändert",
    updatedAt: "2026-08-11T01:00:00.000Z",
  }));
  await repository.flush();
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  assert.equal((await reopened.loadCard("card-00001"))?.originalFront, "Gezielt geändert");
  assert.ok(reopened.outbox.count() >= 1);
  const cardMutation = reopened.outbox.listPending().find((mutation) => mutation.table === "cards" && mutation.entityId === "card-00001");
  assert.ok(cardMutation, "Der gezielte Save schreibt seine Entity-Mutation selbst in die Outbox");
  assert.equal("state" in (cardMutation.payload as Record<string, unknown>), false);
  reopened.close();
});

test("entfernt eine lokal gelöschte Karte sofort und hält den Cloud-Tombstone in der Outbox", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  const deleted = await repository.updateCard("deck-idb", "card-00000", (card) => softDeleteCard(card, "2026-08-12T00:00:00.000Z"));
  await repository.flush();

  assert.equal(deleted?.status, "deleted");
  assert.equal(await repository.loadCard("card-00000"), null);
  assert.equal((await repository.listCardPage("deck-idb", { pageSize: 100 })).items.length, 0);
  assert.equal(repository.getShellState().decks[0].cardCount, 0);
  assert.equal(repository.outbox.listPending().some((mutation) => mutation.table === "cards" && mutation.entityId === "card-00000" && (mutation.payload as any).tombstone === true), true);
  repository.close();
});

test("behält eine sofort wiederhergestellte Karte trotz verspäteter Löschbestätigung", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  const deleted = await repository.updateCard("deck-idb", "card-00000", (card) => softDeleteCard(card, "2026-08-12T00:00:00.000Z"));
  const tombstone = repository.getCloudTombstones().find((item) => item.entityTable === "cards" && item.entityId === deleted?.id);
  assert.ok(deleted && tombstone);

  repository.removeCloudTombstone("cards", deleted.id);
  await repository.insertCard("deck-idb", restoreSoftDeletedCard({ ...deleted, revision: tombstone.revision }, "2026-08-12T00:00:01.000Z"));
  await repository.persistMutationAcknowledgements([{
    table: "cards",
    row: { id: deleted.id, revision: tombstone.revision + 1, deleted_at: tombstone.deletedAt },
  }]);
  await repository.applyCloudPage({
    table: "cards",
    reset: false,
    entities: [{ ...deleted, deletedAt: tombstone.deletedAt }],
  });
  await repository.flush();
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  assert.equal((await reopened.loadCard(deleted.id))?.status, "active");
  assert.equal(reopened.outbox.listPending().some((mutation) => mutation.table === "cards" && mutation.entityId === deleted.id && !(mutation.payload as any).tombstone), true);
  reopened.close();
});

test("committet Cloudzustand und Delta-Cursor gemeinsam und erhält den Cursor bei lokalen Writes", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  const cursors = { cards: { value: "2026-08-11T02:00:00.000Z", id: "card-00000" } };
  repository.replaceFullState(workspaceState(2), cursors);
  repository.saveProfile({ ...repository.getShellState().profile, displayName: "Nach Delta" });
  await repository.flush();
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const reopenedState = await reopened.materializeFullState();
  assert.deepEqual(reopened.getCloudDeltaCursors(), cursors);
  assert.equal(reopenedState.decks[0].cards.length, 2);
  assert.equal(reopened.getShellState().profile.displayName, "Nach Delta");
  reopened.close();
});

test("aggregiert Statistikereignisse cursorbasiert statt den Store zu materialisieren", async () => {
  const userId = randomUUID();
  const initialState = workspaceState(1);
  initialState.decks[0].reviewEvents = [
    { id: "review-before", deckId: "deck-idb", learningItemId: "card-00000", reviewableId: "card-00000", rating: "good", schedulerBefore: { card: { state: "review", intervalDays: 3 } }, answeredAt: "2026-08-10T23:59:59.000Z" },
    { id: "review-in-range", deckId: "deck-idb", learningItemId: "card-00000", reviewableId: "card-00000", rating: "good", schedulerBefore: { card: { state: "review", intervalDays: 3 } }, answeredAt: "2026-08-11T12:00:00.000Z" },
    { id: "review-after", deckId: "deck-idb", learningItemId: "card-00000", reviewableId: "card-00000", rating: "good", schedulerBefore: { card: { state: "review", intervalDays: 3 } }, answeredAt: "2026-08-12T00:00:01.000Z" },
  ] as any;
  const repository = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as any });

  const projection = await repository.queryStatistics({
    period: "30d",
    deckIds: "all",
    now: "2026-08-11T23:59:59.999Z",
    timeZone: "UTC",
  });

  assert.equal(projection.summary.reviewCount, 2);
  assert.equal(projection.studyHeatmap.countsByDay.get("2026-08-11"), 1);
  repository.close();
});

test("persists acknowledged document and note type metadata across reopen", async () => {
  const userId = randomUUID();
  const initialState = workspaceState(1);
  initialState.documents = [{
    id: "document-1",
    ownerId: userId,
    fileName: "script.pdf",
    mimeType: "application/pdf",
    text: "",
    storageUrl: "",
    textExtractionStatus: "pending",
    metadata: {},
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    revision: 1,
    deletedAt: null,
    updatedByDeviceId: null,
  }];
  const repository = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as any });
  const current = await repository.materializeFullState();
  const definition = current.noteTypeDefinitions[0];
  assert.ok(definition);

  repository.persistMutationAcknowledgements([
    {
      table: "source_documents",
      row: {
        id: "document-1",
        revision: 2,
        updated_at: "2026-08-11T01:00:00.000Z",
        updated_by_device_id: "device-1",
      },
    },
    {
      table: "note_type_definitions",
      row: {
        id: definition.id,
        revision: 2,
        updated_at: "2026-08-11T01:00:00.000Z",
      },
    },
  ]);
  await repository.flush();
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const reopenedState = await reopened.materializeFullState();
  assert.equal(reopenedState.documents[0]?.revision, 2);
  assert.equal(reopenedState.documents[0]?.updatedByDeviceId, "device-1");
  assert.equal(reopenedState.noteTypeDefinitions.find((item) => item.id === definition.id)?.revision, 2);
  assert.equal(reopenedState.noteTypeDefinitions.find((item) => item.id === definition.id)?.updatedAt, "2026-08-11T01:00:00.000Z");
  reopened.close();
});
