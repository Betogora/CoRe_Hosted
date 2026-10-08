import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import type { ImportCommitGraph, ImportGraphChunk } from "./apkgImport.ts";
import { createBasicNote, createCoreDeck, planNoteContentChange, planNoteDeletion, planNoteRestore } from "./coreModel.ts";
import type { Card, Deck, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { answerVariant } from "./reviewService.ts";

Object.assign(globalThis, { IDBKeyRange });

const CREATED_AT = "2026-08-19T00:00:00.000Z";
const DUE_AT = "2026-08-20T04:00:00.000Z";
const SUMMARY_CONTEXT = { now: "2026-08-21T12:00:00.000Z", timeZone: "UTC", dayStartHour: 0 };

function basicGraph(deckId: string, index: number, { reverseDeckId = null as string | null, source = "manual" as Note["source"] } = {}) {
  const created = createBasicNote(deckId, `Frage ${index}`, `Antwort ${index}`, { reverse: reverseDeckId !== null, createdAt: CREATED_AT });
  const note: Note = { ...created.note, id: `note-${index}`, source };
  const cards: Card[] = created.cards.map((card) => ({
    ...card,
    id: card.promptKey === "forward" ? `card-${index}` : `card-${index}-reverse`,
    noteId: note.id,
    deckId: card.promptKey === "forward" ? deckId : reverseDeckId!,
    study: { ...card.study, dueAt: DUE_AT },
  }));
  return { note, cards };
}

function state(decks: Deck[], notes: Note[]): WorkspaceState {
  return {
    version: 6,
    profile: { userId: "user-idb", uiPreferences: {} } as unknown as WorkspaceState["profile"],
    decks,
    notes,
    updatedAt: CREATED_AT,
  };
}

function workspaceState(cardCount = 3) {
  const graphs = Array.from({ length: cardCount }, (_, index) => basicGraph("deck-idb", index));
  return state(
    [createCoreDeck({ id: "deck-idb", name: "IndexedDB", source: "manual", cards: graphs.flatMap((graph) => graph.cards) })],
    graphs.map((graph) => graph.note),
  );
}

/** One content with its forward card in deck A and its reverse sibling in deck B, plus a second content in deck A. */
function twoDeckState() {
  const shared = basicGraph("deck-a", 0, { reverseDeckId: "deck-b" });
  const other = basicGraph("deck-a", 1);
  return state([
    createCoreDeck({ id: "deck-a", name: "A", source: "manual", cards: [shared.cards[0], other.cards[0]] }),
    createCoreDeck({ id: "deck-b", name: "B", source: "manual", cards: [shared.cards[1]] }),
  ], [shared.note, other.note]);
}

function openRepository(initialState: WorkspaceState, userId: string = randomUUID()) {
  return createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as unknown as IDBFactory });
}

type Repository = Awaited<ReturnType<typeof openRepository>>;

async function summaryTotals(repository: Repository) {
  return Object.fromEntries((await repository.listDeckStudySummaries()).map((summary) => [summary.deckId, summary.totalCount]));
}

async function catalogIds(repository: Repository, deckId: string) {
  return (await repository.listCatalogPage(deckId)).items.map((entry) => entry.id).sort();
}

function pendingEntityMutations(repository: Repository) {
  return repository.outbox.listPending()
    .filter((mutation) => mutation.type === "entity-mutation")
    .map((mutation) => ({ table: mutation.table, entityId: mutation.entityId, baseRevision: mutation.baseRevision, entity: (mutation.payload as any).entity }));
}

test("liest Karten deterministisch aus dem neuen leeren Namespace", async () => {
  const repository = await openRepository(workspaceState(55));
  const first = await repository.listCardPage("deck-idb", { page: 0, pageSize: 50 });
  const second = await repository.listCardPage("deck-idb", { page: 1, pageSize: 50 });
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 5);
  assert.equal(first.totalCount, 55);
  assert.equal(first.selected, null);
  assert.equal(new Set([...first.items, ...second.items].map((entry) => entry.id)).size, 55);
  repository.close();
});

test("liefert nach abgeschlossenem Katalogabgleich die aktuellen Tageszähler", async () => {
  const repository = await openRepository(workspaceState(3));
  await repository.applyCloudCatalogPage({ table: "card_catalog", entities: [], reset: false, cursor: 0 });

  const partial = await repository.listDeckSummaries(SUMMARY_CONTEXT);
  assert.equal(partial.summaries.get("deck-idb")?.dailyProgress.newCount, 0);

  await repository.completeCatalogReconciliation();
  const reconciled = await repository.listDeckSummaries(SUMMARY_CONTEXT);
  assert.equal(reconciled.summaries.get("deck-idb")?.dailyProgress.newCount, 3);
  assert.equal(reconciled.summaries.get("deck-idb")?.startableCount, 3);
  repository.close();
});

test("ein neuer Inhalt schreibt Speicher, Katalog, Stapelzähler und Outbox gemeinsam", async () => {
  const userId = randomUUID();
  const repository = await openRepository(workspaceState(0), userId);
  const graph = basicGraph("deck-idb", 7, { reverseDeckId: "deck-idb" });

  await repository.saveNoteGraphs([{ previous: null, next: graph }]);

  const verify = async (current: Repository) => {
    assert.deepEqual(await catalogIds(current, "deck-idb"), ["card-7", "card-7-reverse"]);
    assert.equal((await current.listCatalogPage("deck-idb")).items[0].frontPreview, "Frage 7");
    const [summary] = await current.listDeckStudySummaries();
    assert.deepEqual([summary.totalCount, summary.newCount], [2, 2]);
    assert.deepEqual(
      pendingEntityMutations(current).map(({ table, entityId, baseRevision }) => `${table}:${entityId}:${baseRevision}`).sort(),
      ["cards:card-7-reverse:null", "cards:card-7:null", "notes:note-7:null"],
    );
    const loaded = await current.loadNoteGraph("note-7");
    assert.equal(loaded?.note.content.fields[0].html, "Frage 7");
    assert.deepEqual(loaded?.cards.map((card) => card.id).sort(), ["card-7", "card-7-reverse"]);
  };
  await verify(repository);
  repository.close();

  const reopened = await openRepository(workspaceState(0), userId);
  await verify(reopened);
  reopened.close();
});

test("eine Inhaltsänderung aktualisiert auch das Geschwister in einem anderen Stapel", async () => {
  const repository = await openRepository(twoDeckState());
  const graph = await repository.loadNoteGraph("note-0");
  assert.ok(graph);
  assert.deepEqual(graph.cards.map((card) => card.deckId).sort(), ["deck-a", "deck-b"]);
  const before = (await repository.listCatalogPage("deck-b")).items[0];

  const plan = planNoteContentChange(graph, {
    ...graph.note.content,
    fields: graph.note.content.fields.map((field) => field.id === "front" ? { ...field, html: "Neue Frage" } : field),
  });
  await repository.saveNoteGraphs([{ previous: graph, next: { note: plan.note, cards: [...plan.keptCards, ...plan.newCards] } }]);

  const sibling = (await repository.listCatalogPage("deck-b")).items[0];
  assert.equal(sibling.id, "card-0-reverse");
  assert.equal(sibling.frontPreview, "Neue Frage");
  assert.equal(sibling.dependencyRevision, before.dependencyRevision + 1);
  assert.equal((await repository.listCatalogPage("deck-a", { query: "neue frage" })).items[0]?.id, "card-0");
  assert.deepEqual(await summaryTotals(repository), { "deck-a": 2, "deck-b": 1 });
  assert.deepEqual(
    pendingEntityMutations(repository).map(({ table, entityId, baseRevision }) => [table, entityId, baseRevision]),
    [["notes", "note-0", 1]],
  );
  const page = await repository.listCardPage("deck-a", { selectedCardId: "card-0" });
  assert.equal(page.selected?.cardId, "card-0");
  assert.equal(page.selected?.note.contentRevision, 2);
  assert.deepEqual(page.selected?.cards.map((card) => `${card.id}@${card.deckId}`).sort(), ["card-0-reverse@deck-b", "card-0@deck-a"]);
  repository.close();
});

test("das Löschen eines Inhalts entfernt alle Geschwister; Undo stellt sie mit fortgesetzten Revisionen wieder her", async () => {
  const repository = await openRepository(twoDeckState());
  const graph = await repository.loadNoteGraph("note-0");
  assert.ok(graph);

  const deletion = planNoteDeletion(graph.note, graph.cards, "2026-08-21T10:00:00.000Z");
  const deleted = { note: deletion.note, cards: deletion.cards };
  await repository.saveNoteGraphs([{ previous: graph, next: deleted }]);

  assert.equal(await repository.loadNoteGraph("note-0"), null);
  assert.equal(await repository.loadCardBody("card-0-reverse"), null);
  assert.deepEqual(await catalogIds(repository, "deck-a"), ["card-1"]);
  assert.deepEqual(await catalogIds(repository, "deck-b"), []);
  assert.deepEqual(await summaryTotals(repository), { "deck-a": 1, "deck-b": 0 });
  const deletions = pendingEntityMutations(repository);
  assert.deepEqual(deletions.map(({ table, entityId }) => `${table}:${entityId}`).sort(), ["cards:card-0", "cards:card-0-reverse", "notes:note-0"]);
  assert.equal(deletions.every((mutation) => mutation.baseRevision === 1 && mutation.entity.revision === 2 && mutation.entity.deletedAt === "2026-08-21T10:00:00.000Z"), true);

  const restored = planNoteRestore(deletion.undo, deleted, "2026-08-21T10:01:00.000Z");
  await repository.saveNoteGraphs([{ previous: deleted, next: restored }]);

  const reloaded = await repository.loadNoteGraph("note-0");
  assert.equal(reloaded?.note.revision, 3);
  assert.equal(reloaded?.note.deletedAt, null);
  assert.deepEqual(reloaded?.cards.map((card) => `${card.id}@${card.deckId}:${card.revision}`).sort(), ["card-0-reverse@deck-b:3", "card-0@deck-a:3"]);
  assert.deepEqual(await catalogIds(repository, "deck-a"), ["card-0", "card-1"]);
  assert.deepEqual(await catalogIds(repository, "deck-b"), ["card-0-reverse"]);
  assert.deepEqual(await summaryTotals(repository), { "deck-a": 2, "deck-b": 1 });
  const restores = pendingEntityMutations(repository);
  assert.equal(restores.length, 3, "Undo ersetzt die noch nicht gesendeten Löschungen");
  assert.equal(restores.every((mutation) => mutation.baseRevision === 2 && mutation.entity.revision === 3 && mutation.entity.deletedAt === null), true);
  repository.close();
});

test("eine Bewertung erhöht studyRevision statt revision und reiht eine atomare Review-Mutation ein", async () => {
  const initialState = workspaceState(1);
  const repository = await openRepository(initialState);
  const result = answerVariant(initialState.decks[0], "card-0", null, "good", { now: "2026-08-20T08:00:00.000Z" });

  repository.recordReview(result);
  await repository.flush();

  const body = await repository.loadCardBody("card-0");
  assert.equal(body?.card.studyRevision, 1);
  assert.equal(body?.card.revision, 1);
  assert.equal(body?.card.study.reps, 1);
  const [catalog] = (await repository.listCatalogPage("deck-idb")).items;
  assert.deepEqual([catalog.bodyRevision, catalog.studyRevision], [1, 1]);
  const [mutation] = repository.outbox.listPending();
  assert.equal(mutation.type, "review-atomic");
  assert.deepEqual((mutation.payload as any).card, { id: "card-0", study: result.updatedCard.study, updatedAt: result.updatedCard.updatedAt });
  assert.equal((mutation.payload as any).event.cardId, "card-0");
  repository.close();
});

test("eine Bewertung aus einer alten Sitzung überschreibt keine neu gespeicherten Stapeleinstellungen", async () => {
  const userId = randomUUID();
  const initialState = workspaceState(1);
  const repository = await openRepository(initialState, userId);
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

  const reopened = await openRepository(workspaceState(0), userId);
  assert.equal(reopened.getShellState().decks[0].deckSettings.schedulerProfile.desiredRetention, desiredRetention);
  reopened.close();
});

test("plant mehrere Karten in einer lokalen Transaktion neu", async () => {
  const repository = await openRepository(workspaceState());
  const before = (await repository.loadCardBody("card-0"))?.card;
  assert.ok(before);
  const result = await repository.rescheduleCards(["card-0", "card-1", "card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  assert.equal(result.length, 2);
  const after = (await repository.loadCardBody("card-0"))?.card;
  assert.equal(after?.study.dueAt, "2026-08-24T04:00:00.000Z");
  assert.deepEqual({ ...after?.study, dueAt: before.study.dueAt }, before.study);
  assert.equal(after?.studyRevision, before.studyRevision + 1);
  assert.equal(after?.revision, before.revision);
  const mutations = repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic");
  assert.equal(mutations.length, 2);
  assert.equal(mutations.every((mutation) => (mutation.payload as any).event.rating === "manual"), true);
  repository.close();
});

test("fehlende Karten brechen den gesamten Batch ab", async () => {
  const repository = await openRepository(workspaceState());
  const before = (await repository.loadCardBody("card-0"))?.card.study.dueAt;
  await assert.rejects(() => repository.rescheduleCards(["card-0", "fehlt"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z"), /nicht gefunden/);
  assert.equal((await repository.loadCardBody("card-0"))?.card.study.dueAt, before);
  assert.equal(repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 0);
  repository.close();
});

test("identische Termine erzeugen kein manuelles Ereignis", async () => {
  const repository = await openRepository(workspaceState(1));
  await repository.rescheduleCards(["card-0"], DUE_AT, "2026-08-19T10:00:00.000Z");
  assert.equal(repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 0);
  repository.close();
});

test("Cachebereinigung schützt aktive Karten und noch nicht synchronisierte Reviews", async () => {
  const repository = await openRepository(workspaceState());
  try {
    await repository.rescheduleCards(["card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
    const result = await repository.evictCachedCardBodies(Number.MAX_SAFE_INTEGER, ["card-1"]);
    assert.equal(result.evictedCount, 1);
    assert.ok(result.freedBytes > 0);
    assert.deepEqual(await repository.missingCardBodyIds(["card-0", "card-1", "card-2"]), ["card-2"]);
    assert.equal(await repository.loadCardBody("card-2"), null);
    assert.equal((await repository.loadCardBody("card-0"))?.card.study.dueAt, "2026-08-24T04:00:00.000Z");
    assert.equal(repository.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 1);
  } finally {
    repository.close();
  }
});

test("ausgesetzte Karten bleiben bei der Neuplanung ausgesetzt", async () => {
  const initialState = workspaceState(1);
  initialState.decks[0].cards[0].status = "suspended";
  const repository = await openRepository(initialState);
  await repository.rescheduleCards(["card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  assert.equal((await repository.loadCardBody("card-0"))?.card.status, "suspended");
  assert.equal((await repository.listCatalogPage("deck-idb")).items[0].reviewable, false);
  repository.close();
});

test("Offline-Neuplanungen bleiben nach erneutem Öffnen erhalten", async () => {
  const userId = randomUUID();
  const repository = await openRepository(workspaceState(1), userId);
  await repository.rescheduleCards(["card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  await repository.flush();
  repository.close();
  const reopened = await openRepository(workspaceState(0), userId);
  assert.equal((await reopened.loadCardBody("card-0"))?.card.study.dueAt, "2026-08-24T04:00:00.000Z");
  assert.equal(reopened.outbox.listPending().filter((mutation) => mutation.type === "review-atomic").length, 1);
  reopened.close();
});

test("manuelle Neuplanungen zählen nicht als Lernaktivität", async () => {
  const initialState = workspaceState(2);
  const repository = await openRepository(initialState);
  await repository.listDeckSummaries(SUMMARY_CONTEXT);

  await repository.rescheduleCards(["card-0"], "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
  repository.recordReview(answerVariant(initialState.decks[0], "card-1", null, "good", { now: "2026-08-21T10:00:00.000Z" }));
  await repository.flush();

  const result = await repository.listDeckSummaries(SUMMARY_CONTEXT);
  assert.equal(result.studyHeatmap.countsByDay.get("2026-08-21"), 1);
  repository.close();
});

test("Karten mit offenem Synchronisierungskonflikt werden nicht zum Lernen geladen", async () => {
  const userId = randomUUID();
  const repository = await openRepository(workspaceState(3), userId);

  await repository.setSyncConflicts([{ cardId: "card-0" }, { entityTable: "notes", entityId: "note-1", noteId: "note-1" }]);

  assert.deepEqual([...repository.getSyncConflictCardIds()].sort(), ["card-0", "card-1"]);
  const session = await repository.loadReviewSession(["deck-idb"], { now: "2026-08-21T12:00:00.000Z", timeZone: "UTC" });
  assert.deepEqual(session.cards.map(({ card }) => card.id), ["card-2"]);
  assert.deepEqual(session.notes.map((note) => note.id), ["note-2"]);
  const requested = await repository.loadReviewSession(["deck-idb"], { now: "2026-08-21T12:00:00.000Z", timeZone: "UTC", cardIds: ["card-0", "card-2"] });
  assert.deepEqual(requested.cards.map(({ card }) => card.id), ["card-2"], "Auch angefragte Karten bleiben bei einem Konflikt gesperrt.");
  repository.close();

  const reopened = await openRepository(workspaceState(0), userId);
  assert.deepEqual([...reopened.getSyncConflictCardIds()].sort(), ["card-0", "card-1"]);
  await reopened.setSyncConflicts([]);
  assert.equal((await reopened.loadReviewSession(["deck-idb"], { now: "2026-08-21T12:00:00.000Z", timeZone: "UTC" })).cards.length, 3);
  reopened.close();
});

test("eine Änderung an einem noch nicht gesendeten Stapel bleibt ein Cloud-Insert", async () => {
  const userId = randomUUID();
  const repository = await openRepository(workspaceState(0), userId);
  const created = createCoreDeck({ id: "deck-new", name: "Neu", source: "manual", cards: [] });
  repository.saveDeckMetadata([created]);
  const [saved] = repository.saveDeckMetadata([{ ...repository.getShellState().decks.find((deck) => deck.id === "deck-new")!, name: "Umbenannt", updatedAt: "2099-01-01T00:00:00.000Z" }]);
  await repository.flush();

  const pending = repository.outbox.listPending().filter((mutation) => mutation.entityId === "deck-new");
  assert.equal(saved.name, "Umbenannt");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].baseRevision, null);
  assert.equal((pending[0].payload as any).baseRevision, null);
  assert.equal((pending[0].payload as any).entity.name, "Umbenannt");
  repository.close();

  const reopened = await openRepository(workspaceState(0), userId);
  assert.deepEqual(reopened.outbox.listPending().filter((mutation) => mutation.entityId === "deck-new").map((mutation) => mutation.baseRevision), [null]);
  reopened.close();
});

function importedNote(id: string, ankiGuid: string, front: string, { reverse = false, contentRevision = 1 } = {}) {
  const created = createBasicNote("deck-anki", front, "Antwort", { reverse, createdAt: CREATED_AT });
  const note: Note = { ...created.note, id, source: "anki-apkg", ankiGuid, contentRevision, importedContentRevision: 1 };
  return { note, cards: created.cards.map((card) => ({ ...card, noteId: id })) };
}

function importGraph(chunks: ImportGraphChunk[]): ImportCommitGraph {
  return {
    deckCount: 1,
    noteCount: 0,
    cardCount: 0,
    reviewEventCount: 0,
    mediaCount: 0,
    ankiGuids: [],
    async streamChunks(visit) {
      for (const chunk of chunks) await visit(chunk);
    },
    dispose() {},
  };
}

test("Reimport behält lokale Bearbeitungen, erkennt Karten an der Anki-Karten-ID und zählt fehlende Karten", async () => {
  const edited = importedNote("note-edited", "guid-edited", "Lokal bearbeitet", { reverse: true, contentRevision: 2 });
  edited.cards = edited.cards.map((card) => ({ ...card, id: `card-edited-${card.promptKey}`, ankiCardId: card.promptKey === "forward" ? "anki-a1" : "anki-a2" }));
  const plain = importedNote("note-plain", "guid-plain", "Alte Paketfrage");
  plain.cards = plain.cards.map((card) => ({ ...card, id: "card-plain", ankiCardId: "anki-p1" }));
  const deck = createCoreDeck({ id: "deck-anki", name: "Anki", source: "anki-apkg", ankiDeckId: "anki-deck-1", cards: [...edited.cards, ...plain.cards] });
  const repository = await openRepository(state([deck], [edited.note, plain.note]));
  const cloud = importedNote("note-cloud", "guid-cloud", "Alte Cloudfrage");

  const incomingEdited = importedNote("incoming-edited", "guid-edited", "Paketfrage");
  const incomingPlain = importedNote("incoming-plain", "guid-plain", "Neue Paketfrage", { reverse: true });
  const incomingCloud = importedNote("incoming-cloud", "guid-cloud", "Neue Cloudfrage");
  const incomingCards: Card[] = [
    { ...incomingEdited.cards[0], id: "incoming-a1", deckId: "import-deck", promptKey: "umbenannte-vorlage", ankiCardId: "anki-a1" },
    ...incomingPlain.cards.map((card) => ({ ...card, id: `incoming-${card.promptKey}`, deckId: "import-deck", ankiCardId: card.promptKey === "forward" ? "anki-p1" : "anki-p2" })),
    { ...incomingCloud.cards[0], id: "incoming-c1", deckId: "import-deck", promptKey: "umbenannte-vorlage", ankiCardId: "anki-c1" },
  ];
  const result = await repository.commitImportGraph(importGraph([
    { kind: "decks", decks: [{ id: "import-deck", ankiDeckId: "anki-deck-1", name: "Anki", hierarchyPath: ["Anki"], parentDeckId: null }] },
    { kind: "notes", notes: [incomingEdited.note, incomingPlain.note, incomingCloud.note], noteSources: [], cards: incomingCards },
    { kind: "reviews", values: [{ id: "import-review", cardId: "incoming-a1", rating: "good", answeredAt: "2026-08-18T10:00:00.000Z", responseTimeMs: 1_000, schedulerBefore: {}, schedulerAfter: {}, flags: {} }] },
  ]), {
    deckSettings: {},
    reimportTargets: {
      notes: [cloud.note],
      cards: [{ id: "card-cloud", noteId: "note-cloud", deckId: "deck-anki", promptKey: "forward", ankiCardId: "anki-c1" }],
      noteTypeSources: [],
    },
  });

  assert.equal(result.keptLocalEdits, 1);
  assert.equal(result.missingInPackage, 1, "nur die nicht mehr enthaltene Rückrichtung des bearbeiteten Inhalts fehlt");
  assert.deepEqual(result.decks.map((entry) => entry.id), ["deck-anki"]);
  assert.deepEqual(result.scope.reviewEventIds, ["import-review"]);

  const keptGraph = await repository.loadNoteGraph("note-edited");
  assert.equal(keptGraph?.note.content.fields[0].html, "Lokal bearbeitet");
  assert.equal(keptGraph?.note.contentRevision, 2);
  assert.deepEqual(keptGraph?.cards.map((card) => card.id).sort(), ["card-edited-forward", "card-edited-reverse"]);

  const plainGraph = await repository.loadNoteGraph("note-plain");
  assert.equal(plainGraph?.note.content.fields[0].html, "Neue Paketfrage");
  assert.deepEqual([plainGraph?.note.contentRevision, plainGraph?.note.importedContentRevision, plainGraph?.note.revision], [2, 2, 2]);
  assert.deepEqual(plainGraph?.cards.map((card) => `${card.id}@${card.deckId}`).sort(), ["card-plain@deck-anki", "incoming-reverse@deck-anki"]);

  const [cloudNote] = await repository.loadNotes(["note-cloud"]);
  assert.equal(cloudNote.content.fields[0].html, "Neue Cloudfrage");
  assert.equal(await repository.loadCardBody("incoming-c1"), null, "die Cloudkarte wurde über die Anki-Karten-ID erkannt und nicht neu angelegt");
  assert.equal(await repository.loadCardBody("incoming-a1"), null);

  const reviewMutation = repository.outbox.listPending().find((mutation) => mutation.table === "review_events");
  assert.equal((reviewMutation?.payload as any).entity.cardId, "card-edited-forward");
  assert.equal((reviewMutation?.payload as any).entity.deckId, "deck-anki");
  repository.close();
});
