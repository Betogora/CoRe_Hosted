import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBIndex as FakeIDBIndex, IDBKeyRange, IDBObjectStore as FakeIDBObjectStore, indexedDB } from "fake-indexeddb";
import { createBasicLearningItem, createCoreDeck, createCoreNoteTypeDefinition, createManualCoreDeck, getOriginalVariant } from "./coreModel.ts";
import { restoreSoftDeletedCard, softDeleteCard } from "./coreWorkspace.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";
import { answerVariant } from "./reviewService.ts";
import {
  DECK_STUDY_PROJECTION_VERSION,
  addCardToDeckStudyProjection,
  createDeckStudyProjectionContext,
  emptyDeckStudyProjectionAggregate,
} from "./deckStudyProjection.ts";

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

function openRawWorkspaceDatabase(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`core.workspace.entities.v1.${userId}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test("migriert den Root-State einmalig und liest Karten in deterministischen 50er-Seiten", async () => {
  const userId = randomUUID();
  const legacyStorage = storage({ "core.appState.v4": JSON.stringify(workspaceState(205)) });
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(205), legacyStorage, indexedDb: indexedDB as any });
  const first = await repository.listCardPage("deck-idb", { page: 0, pageSize: 50 });
  const fifth = await repository.listCardPage("deck-idb", { page: 4, pageSize: 50 });
  const search = await repository.listCardPage("deck-idb", { query: "Frage 00204" });

  assert.equal(first.items.length, 50);
  assert.equal(first.totalCount, 205);
  assert.equal(fifth.items.length, 5);
  assert.equal(search.items[0]?.id, "card-00204");
  const selected = await repository.listCardPage("deck-idb", { page: 0, pageSize: 50, selectedCardId: "card-00204" });
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
  await seeded.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });
  await seeded.flush();
  seeded.close();

  const getAllCalls = new Map<string, number>();
  const targetDatabaseName = `core.workspace.entities.v1.${userId}`;
  const originalGetAll = FakeIDBObjectStore.prototype.getAll;
  const originalOpenCursor = FakeIDBObjectStore.prototype.openCursor;
  const originalIndexOpenCursor = FakeIDBIndex.prototype.openCursor;
  const cursorCalls = new Map<string, number>();
  FakeIDBObjectStore.prototype.getAll = function instrumentedGetAll(...args: Parameters<IDBObjectStore["getAll"]>) {
    if (this.transaction.db.name === targetDatabaseName) {
      getAllCalls.set(this.name, (getAllCalls.get(this.name) ?? 0) + 1);
    }
    return originalGetAll.apply(this, args);
  };
  FakeIDBObjectStore.prototype.openCursor = function instrumentedOpenCursor(...args: Parameters<IDBObjectStore["openCursor"]>) {
    if (this.transaction.db.name === targetDatabaseName) {
      cursorCalls.set(this.name, (cursorCalls.get(this.name) ?? 0) + 1);
    }
    return originalOpenCursor.apply(this, args);
  };
  FakeIDBIndex.prototype.openCursor = function instrumentedIndexOpenCursor(...args: Parameters<IDBIndex["openCursor"]>) {
    if (this.objectStore.transaction.db.name === targetDatabaseName) {
      cursorCalls.set(this.objectStore.name, (cursorCalls.get(this.objectStore.name) ?? 0) + 1);
    }
    return originalIndexOpenCursor.apply(this, args);
  };
  try {
    const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
    const shell = await repository.loadShell();
    const summaries = await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });

    assert.equal(shell.decks[0].importMeta.conceptualCardCount, 100_000);
    assert.equal(shell.decks[0].importMeta.conceptualReviewEventCount, 1_000_000);
    assert.equal(getAllCalls.get("cards") ?? 0, 0);
    assert.equal(getAllCalls.get("variants") ?? 0, 0);
    assert.equal(getAllCalls.get("reviewEvents") ?? 0, 0);
    assert.equal(getAllCalls.get("noteTypeDefinitions") ?? 0, 0);
    assert.equal(getAllCalls.get("sourceSnapshots") ?? 0, 0);
    assert.equal(summaries.summaries.get("deck-idb")?.inventory.totalCards, 1);
    assert.equal(cursorCalls.get("cards") ?? 0, 0, "Persistierte Stapelprojektionen dürfen den Kartenstore nicht scannen");
    assert.equal(cursorCalls.get("variants") ?? 0, 0, "Persistierte Stapelprojektionen dürfen den Variantenstore nicht scannen");
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
    FakeIDBObjectStore.prototype.openCursor = originalOpenCursor;
    FakeIDBIndex.prototype.openCursor = originalIndexOpenCursor;
  }
});

test("setzt einen unterbrochenen Projektions-Rebuild am gespeicherten Kartencursor fort", async () => {
  const userId = randomUUID();
  const seeded = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(3), indexedDb: indexedDB as any });
  await seeded.flush();
  seeded.close();

  const context = createDeckStudyProjectionContext("UTC", 0);
  const database = await openRawWorkspaceDatabase(userId);
  const read = database.transaction(["cards", "deckStudyProjections"], "readonly");
  const firstCard = await new Promise<any>((resolve, reject) => {
    const request = read.objectStore("cards").index("deckScan").openCursor(IDBKeyRange.bound(["deck-idb", ""], ["deck-idb", "\uffff"]));
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
  const dirty = await new Promise<any>((resolve, reject) => {
    const request = read.objectStore("deckStudyProjections").get("deck-idb");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    read.oncomplete = () => resolve();
    read.onerror = () => reject(read.error);
  });
  const aggregate = emptyDeckStudyProjectionAggregate();
  addCardToDeckStudyProjection(aggregate, firstCard, context);
  const write = database.transaction(["deckStudyProjections", "syncMetadata"], "readwrite");
  write.objectStore("deckStudyProjections").put({
    ...dirty,
    contextKey: context.key,
    dirtyToken: "interrupted-token",
    ready: false,
    projectionVersion: DECK_STUDY_PROJECTION_VERSION,
  });
  write.objectStore("syncMetadata").put({
    key: "deckStudyProjectionRebuild",
    value: {
      deckId: "deck-idb",
      contextKey: context.key,
      dirtyToken: "interrupted-token",
      phase: "cards",
      cursor: firstCard.id,
      aggregate,
    },
  });
  await new Promise<void>((resolve, reject) => {
    write.oncomplete = () => resolve();
    write.onerror = () => reject(write.error);
  });
  database.close();

  const resumed = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const summary = await resumed.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });
  assert.equal(summary.summaries.get("deck-idb")?.inventory.totalCards, 3);
  resumed.close();
});

test("pflegt Projektionen bei Review und Kartenlöschung über Reload hinweg", async () => {
  const userId = randomUUID();
  const initialState = workspaceState(1);
  const card = initialState.decks[0].cards[0];
  const original = getOriginalVariant(card);
  assert.ok(original);
  const repository = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as any });
  const before = await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });
  assert.equal(before.summaries.get("deck-idb")?.inventory.totalCards, 1);

  repository.recordReview(answerVariant(initialState.decks[0], card.id, original.id, "good", {
    now: "2026-08-16T12:00:00.000Z",
  }));
  await repository.flush();
  const reviewed = await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });
  assert.equal(reviewed.summaries.get("deck-idb")?.dailyProgress.completedTodayCount, 1);
  assert.equal(reviewed.studyHeatmap.countsByDay.get("2026-08-16"), 1);
  await repository.updateCard("deck-idb", card.id, (current) => softDeleteCard(current, "2026-08-16T12:01:00.000Z"));
  await repository.flush();
  assert.equal((await repository.listDeckSummaries({ now: "2026-08-16T12:01:00.000Z", timeZone: "UTC" })).summaries.get("deck-idb")?.inventory.totalCards, 0);
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const afterReload = await reopened.listDeckSummaries({ now: "2026-08-16T12:01:00.000Z", timeZone: "UTC" });
  assert.equal(afterReload.summaries.get("deck-idb")?.inventory.totalCards, 0);
  assert.equal(afterReload.studyHeatmap.countsByDay.get("2026-08-16"), 1);
  reopened.close();
});

test("entfernt abgeleitete Projektionen zusammen mit dem gelöschten Stapel", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(2), indexedDb: indexedDB as any });
  await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });
  await repository.deleteDeckTree("deck-idb");
  await repository.flush();
  repository.close();

  const database = await openRawWorkspaceDatabase(userId);
  const transaction = database.transaction(["deckStudyProjections", "deckStudyDueBuckets"], "readonly");
  const [projection, bucketCount] = await Promise.all([
    new Promise<unknown>((resolve, reject) => {
      const request = transaction.objectStore("deckStudyProjections").get("deck-idb");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
    new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore("deckStudyDueBuckets").index("deckId").count("deck-idb");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
  ]);
  assert.equal(projection, undefined);
  assert.equal(bucketCount, 0);
  database.close();
});

test("aktualisiert Cloud- und Konfliktprojektionen ohne vollständigen Kartenread", async () => {
  const userId = randomUUID();
  const cloudCard = workspaceState(1).decks[0].cards[0];
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  await repository.applyCloudPage({ table: "cards", reset: false, entities: [{ ...cloudCard, deckId: "deck-idb", variants: [] }] });
  assert.equal((await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" })).summaries.get("deck-idb")?.inventory.totalCards, 1);

  await repository.setSyncConflicts([{ id: "conflict-card", status: "open", cardId: cloudCard.id }]);
  assert.equal((await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" })).summaries.get("deck-idb")?.inventory.totalCards, 0);
  await repository.setSyncConflicts([]);
  assert.equal((await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" })).summaries.get("deck-idb")?.inventory.totalCards, 1);

  await repository.applyCloudPage({ table: "cards", reset: true, entities: [] });
  assert.equal((await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" })).summaries.get("deck-idb")?.inventory.totalCards, 0);
  repository.close();
});

test("invalidiert Projektionen bei Zeitzonen- und Tagesbeginnwechsel", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(2), indexedDb: indexedDB as any });
  await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC", dayStartHour: 0 });
  await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "Europe/Berlin", dayStartHour: 4 });
  repository.close();

  const database = await openRawWorkspaceDatabase(userId);
  const transaction = database.transaction("deckStudyProjections", "readonly");
  const row = await new Promise<any>((resolve, reject) => {
    const request = transaction.objectStore("deckStudyProjections").get("deck-idb");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(row.ready, true);
  assert.equal(row.contextKey, "Europe/Berlin:4");
  database.close();
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
  const page = await repository.listCardPage(deck.id, { page: 4, pageSize: 50 });
  const summary = await repository.listDeckSummaries({ now: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });

  assert.deepEqual(observedChunkSizes, [100, 100, 5]);
  assert.equal(page.items.length, 5);
  assert.equal(page.totalCount, 205);
  assert.equal(summary.summaries.get(deck.id)?.inventory.totalCards, 205);
  assert.equal(repository.outbox.count() > 205, true);
  repository.close();
});

test("weist unvollständige Profilwrites zurück, ohne Shell oder Outbox zu verändern", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(), indexedDb: indexedDB as any });
  const beforeProfile = repository.getShellState().profile;
  const beforeOutbox = repository.outbox.listPending();

  assert.throws(
    () => repository.saveProfile({ uiPreferences: beforeProfile.uiPreferences } as any),
    (error: any) => error?.code === "invalid_profile_mutation",
  );
  assert.deepEqual(repository.getShellState().profile, beforeProfile);
  assert.deepEqual(repository.outbox.listPending(), beforeOutbox);
  repository.close();
});

test("Lernstart hydriert rollende 50er-Seiten statt den gesamten Stapel", async () => {
  const repository = await createIndexedDbCoreRepository({
    userId: randomUUID(),
    initialState: workspaceState(120),
    indexedDb: indexedDB as any,
  });

  const first = await repository.loadReviewSession(["deck-idb"], { limit: 50 });
  const second = await repository.loadReviewSession(["deck-idb"], { limit: 50, cursorByDeck: first.cursorByDeck });

  assert.equal(first.cards.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.cards.length, 50);
  assert.equal(new Set([...first.cards, ...second.cards].map(({ item }) => item.id)).size, 100);
  repository.close();
});

test("ordnet Reimport-Hierarchie und Varianten auf persistierte Stapel-IDs ab und erstellt einen vollständigen Prüfumfang", async () => {
  const userId = randomUUID();
  const existingRoot = createCoreDeck({ id: "persisted-root", name: "Wissen", source: "anki-apkg", originalDeckId: "anki-root", cards: [] });
  const existingCard = createBasicLearningItem("persisted-child", "Lokale Frage", "Lokale Antwort", {
    id: "persisted-card",
    sourceType: "anki_import",
    sourceRefId: "anki-card-1",
  });
  const existingChild = createCoreDeck({ id: "persisted-child", parentDeckId: existingRoot.id, name: "Kunst", hierarchyPath: ["Wissen", "Kunst"], source: "anki-apkg", originalDeckId: "anki-child", cards: [existingCard] });
  const initialState = workspaceState(0);
  initialState.decks = [existingRoot, existingChild];
  const repository = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as any });
  const incomingRoot = createCoreDeck({ id: "incoming-root", name: "Wissen", source: "anki-apkg", originalDeckId: "anki-root", cards: [] });
  const incomingChild = createCoreDeck({ id: "incoming-child", parentDeckId: incomingRoot.id, name: "Kunst", hierarchyPath: ["Wissen", "Kunst"], source: "anki-apkg", originalDeckId: "anki-child", cards: [] });
  const card = createBasicLearningItem(incomingChild.id, "Frage", "Antwort", {
    id: "import-card",
    sourceType: "anki_import",
    sourceRefId: "anki-card-1",
  });
  const definition = createCoreNoteTypeDefinition({ document: card.contentDocument, createdAt: card.createdAt });
  card.noteTypeDefinitionId = definition.id;
  card.contentDocument = { ...card.contentDocument, definitionVersionId: definition.id };
  card.variants = card.variants.map((variant) => ({ ...variant, studyDeckId: incomingChild.id }));
  const snapshot = {
    id: "import-snapshot",
    schemaVersion: 1 as const,
    sourceKind: "anki-apkg" as const,
    importFingerprint: "fixture",
    previousSnapshotId: null,
    definitionVersionId: definition.id,
    sourcePayload: { fields: card.contentDocument.fields },
    createdAt: card.createdAt,
  };
  card.latestSourceSnapshotId = snapshot.id;
  const review = {
    id: "import-review",
    userId,
    deckId: incomingChild.id,
    learningItemId: card.id,
    variantId: card.variants[0].id,
    reviewableType: "variant",
    reviewableId: card.variants[0].id,
    sourceCardId: "anki-card-1",
    rating: "good",
    answeredAt: card.createdAt,
    responseTimeMs: null,
    schedulerBefore: {},
    schedulerAfter: {},
    flags: {},
    createdAt: card.createdAt,
  };
  const summaries = [incomingRoot, incomingChild].map(({ cards: _cards, reviewEvents: _reviews, ...summary }) => summary);
  const graph = {
    kind: "worker-import" as const,
    deckCount: 2,
    cardCount: 1,
    noteTypeDefinitions: [definition],
    deckIdentities: [incomingRoot, incomingChild].map((deck) => ({ id: deck.id, originalDeckId: deck.originalDeckId })),
    mediaTargets: [],
    async streamChunks(visit: (chunk: unknown) => Promise<void>) {
      await visit({ kind: "deck", summary: summaries[0] });
      await visit({ kind: "deck", summary: summaries[1] });
      await visit({ kind: "cards", deckId: incomingChild.id, values: [card], definitions: [definition], snapshots: [{ snapshot, cardId: card.id, attachToCard: true }] });
      await visit({ kind: "reviews", deckId: incomingChild.id, values: [review] });
      await visit({ kind: "outbox" });
    },
    dispose() {},
  };

  const imported = await repository.commitImportGraph(graph);
  const scope = await repository.createImportVerificationScope(imported.map((deck) => deck.id));
  const child = (await repository.loadShell()).decks.find((deck) => deck.originalDeckId === "anki-child");
  const persistedCard = await repository.loadCard(existingCard.id);
  const persistedReview = (await repository.materializeFullState()).decks.find((deck) => deck.id === existingChild.id)?.reviewEvents[0];

  assert.equal(child?.parentDeckId, existingRoot.id);
  assert.equal(persistedCard?.deckId, child?.id);
  assert.equal(persistedCard?.variants[0].studyDeckId, child?.id);
  assert.deepEqual(scope.deckIds.sort(), [existingRoot.id, child!.id].sort());
  assert.deepEqual(scope.cardIds, [existingCard.id]);
  assert.deepEqual(scope.variantIds, [existingCard.variants[0].id]);
  assert.deepEqual(scope.sourceSnapshots, [{ id: snapshot.id, cardId: existingCard.id, attachToCard: true }]);
  assert.equal(persistedReview?.deckId, existingChild.id);
  assert.equal(persistedReview?.learningItemId, existingCard.id);
  assert.equal(persistedReview?.variantId, existingCard.variants[0].id);
  assert.equal(persistedReview?.reviewableId, existingCard.variants[0].id);

  repository.outbox.remove(repository.outbox.listPending().map((mutation) => mutation.id));
  await repository.flush();
  await repository.requeueImportVerificationScope(scope, { variantIds: scope.variantIds });
  assert.ok(repository.outbox.listPending().some((mutation) => mutation.table === "card_variants" && mutation.entityId === existingCard.variants[0].id));
  assert.equal(repository.outbox.listPending().some((mutation) => mutation.table !== "card_variants"), false);
  repository.outbox.remove(repository.outbox.listPending().map((mutation) => mutation.id));
  await repository.flush();
  await repository.requeueImportVerificationScope(scope, { cardIds: scope.cardIds });
  const cardMutation = repository.outbox.listPending().find((mutation) => mutation.table === "cards" && mutation.entityId === existingCard.id);
  assert.equal((cardMutation?.payload as any)?.entity?.latestSourceSnapshotId, snapshot.id);
  assert.equal(repository.outbox.listPending().some((mutation) => mutation.table === "learning_item_source_snapshots"), false);
  repository.outbox.remove(repository.outbox.listPending().map((mutation) => mutation.id));
  await repository.flush();
  await repository.requeueImportVerificationScope(scope, { sourceSnapshotIds: scope.sourceSnapshots.map((item) => item.id) });
  assert.ok(repository.outbox.listPending().some((mutation) => mutation.table === "learning_item_source_snapshots" && mutation.entityId === snapshot.id));
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
  const firstCard = (await repository.listCardPage("incoming-deck-1", { pageSize: 50 })).items[0];
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

test("bewahrt parallel gespeicherte Stapeleinstellungen bei einer Kartenänderung", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  const cardUpdate = repository.updateCard("deck-idb", "card-00000", (card) => ({
    ...card,
    meta: { ...card.meta, marked: true },
    updatedAt: "2026-08-11T01:00:00.000Z",
  }));

  const currentSettings = repository.getShellState().decks[0].deckSettings;
  repository.updateDeckSettings("deck-idb", {
    ...currentSettings,
    newReviewOrder: "new-first",
    schedulerProfile: { ...currentSettings.schedulerProfile, presetId: "custom" },
    learningProfileSource: null,
  });
  await cardUpdate;
  assert.equal(repository.getShellState().decks[0].deckSettings.newReviewOrder, "new-first");
  await repository.flush();
  repository.close();

  const reopened = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  const state = await reopened.materializeFullState();
  assert.equal(state.decks[0].deckSettings.newReviewOrder, "new-first");
  assert.equal(state.decks[0].cards[0].meta.marked, true);
  reopened.close();
});

test("entfernt eine lokal gelöschte Karte sofort und hält den Cloud-Tombstone in der Outbox", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  const deleted = await repository.updateCard("deck-idb", "card-00000", (card) => softDeleteCard(card, "2026-08-12T00:00:00.000Z"));
  await repository.flush();

  assert.equal(deleted?.status, "deleted");
  assert.equal(await repository.loadCard("card-00000"), null);
  assert.equal((await repository.listCardPage("deck-idb", { pageSize: 50 })).items.length, 0);
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
  repository.saveProfile({ ...repository.getShellState().profile, userId, displayName: "Nach Delta" });
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

test("conflicted cards are quarantined and cloud choice clears their mutation", async () => {
  const userId = randomUUID();
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(1), indexedDb: indexedDB as any });
  const cardId = "card-00000";
  await repository.updateCard("deck-idb", cardId, (card) => ({ ...card, originalFront: "Lokale Änderung" }));
  await repository.flush();
  await repository.setSyncConflicts([{ id: "conflict-deck", status: "open", entityTable: "decks", entityId: "deck-idb" }]);

  const page = await repository.listCardPage("deck-idb", { selectedCardId: cardId });
  const reviewSession = await repository.loadReviewSession(["deck-idb"]);
  const conflictedCard = page.selectedCard ?? page.items.find((item) => item.id === cardId);
  assert.equal(conflictedCard?.syncConflict, true);
  assert.equal(reviewSession.cards.some((entry) => entry.item.id === cardId), false);

  await repository.setSyncConflicts([{ id: "conflict-1", status: "open", cardId }]);

  await repository.prepareConflictResolution({
    resolutionTarget: { table: "cards", entityId: cardId, action: "keep-remote" },
    resolvedPage: null,
  }, { action: "keep-remote" });

  assert.equal(repository.outbox.listPending().some((mutation) => mutation.table === "cards" && mutation.entityId === cardId), false);
  assert.equal(await repository.loadCard(cardId), null);
  repository.close();
});

test("original variant repair is account-bound and idempotent", async () => {
  const userId = randomUUID();
  const cloudCard = workspaceState(1).decks[0].cards[0];
  const repository = await createIndexedDbCoreRepository({ userId, initialState: workspaceState(0), indexedDb: indexedDB as any });
  assert.equal(repository.needsSyncRepair(), true);
  await repository.applyCloudPage({ table: "cards", reset: false, entities: [{ ...cloudCard, variants: [] }] });
  const first = await repository.repairSyncState({ cardIds: ["card-00000"], originalVariantIds: [] });
  const second = await repository.repairSyncState({ cardIds: ["card-00000"], originalVariantIds: [] });
  const originalMutation = repository.outbox.listPending().find((mutation) => mutation.table === "card_variants");
  const repairedCard = await repository.loadCard("card-00000");

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(repository.needsSyncRepair(), false);
  assert.equal(originalMutation?.baseRevision, null);
  assert.equal(repairedCard?.variants.filter((variant) => variant.isOriginal).length, 1);
  repository.close();
});
