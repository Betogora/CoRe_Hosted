import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { prepareTextReplace, runCardBatch, type CardBatchDependencies } from "./cardBatchActions.ts";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";

Object.assign(globalThis, { IDBKeyRange });

const CREATED_AT = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-09T10:00:00.000Z";

/** `count` contents in deck A, each with a forward card in A and a reverse sibling in deck B. */
async function setup(count: number) {
  const graphs = Array.from({ length: count }, (_, index) => {
    const created = createBasicNote("deck-a", `Frage ${index}`, `Antwort ${index}`, { reverse: true, createdAt: CREATED_AT });
    const note: Note = { ...created.note, id: `note-${index}` };
    const cards: Card[] = created.cards.map((card) => ({ ...card, id: `card-${index}-${card.promptKey}`, noteId: note.id, deckId: card.promptKey === "forward" ? "deck-a" : "deck-b" }));
    return { note, cards };
  });
  const cards = graphs.flatMap((graph) => graph.cards);
  const initialState: WorkspaceState = {
    version: 6,
    profile: { userId: "user-batch", uiPreferences: {} } as unknown as WorkspaceState["profile"],
    decks: [
      createCoreDeck({ id: "deck-a", name: "A", source: "manual", cards: cards.filter((card) => card.deckId === "deck-a") }),
      createCoreDeck({ id: "deck-b", name: "B", source: "manual", cards: cards.filter((card) => card.deckId === "deck-b") }),
    ],
    notes: graphs.map((graph) => graph.note),
    updatedAt: CREATED_AT,
  };
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState, indexedDb: indexedDB as unknown as IDBFactory });
  const dependencies: CardBatchDependencies = {
    repository,
    openCards: (ids) => repository.loadCardBodies(ids),
    now: () => NOW,
    random: () => 0,
  };
  return { repository, dependencies, forward: graphs.map((graph) => `card-${graph.note.id.slice(5)}-forward`) };
}

test("eine Massenaktion schreibt Karten, Katalog und Outbox gemeinsam und ist rückgängig zu machen (KV4)", async () => {
  const { repository, dependencies, forward } = await setup(3);
  const before = repository.outbox.listPending().length;
  const result = await runCardBatch(dependencies, forward.slice(0, 2), { kind: "flag", flag: 4 });
  assert.equal(result.changedCount, 2);
  assert.equal((await repository.loadCardBody(forward[0]))?.card.ankiFlag, 4);
  assert.equal((await repository.loadCardBody("card-0-reverse"))?.card.ankiFlag, 0, "die Geschwisterkarte bleibt");
  assert.equal((await repository.listCatalogPage("deck-a")).items.filter((entry) => entry.ankiFlag === 4).length, 2, "der Katalog zeigt die Flagge sofort");
  assert.ok(repository.outbox.listPending().length > before, "die Änderung wartet gebündelt auf die Synchronisierung");
  assert.deepEqual(await result.undo(), { restoredCount: 2, skippedCount: 0 });
  assert.equal((await repository.loadCardBody(forward[0]))?.card.ankiFlag, 0);

  const moved = await runCardBatch(dependencies, [forward[2]], { kind: "deck", deckId: "deck-b" });
  assert.equal((await repository.loadCardBody(forward[2]))?.card.deckId, "deck-b");
  await moved.undo();
  assert.equal((await repository.loadCardBody(forward[2]))?.card.deckId, "deck-a");
});

test("Löschen entfernt die Inhalte samt Geschwistern; Rückgängig stellt alle wieder her (KV4)", async () => {
  const { repository, dependencies, forward } = await setup(2);
  const result = await runCardBatch(dependencies, [forward[0]], { kind: "delete" });
  assert.equal(result.changedCount, 1);
  assert.equal(await repository.loadCardBody("card-0-reverse"), null);
  assert.deepEqual(await result.undo(), { restoredCount: 2, skippedCount: 0 });
  assert.ok(await repository.loadCardBody("card-0-reverse"));
  assert.ok((await repository.listCatalogPage("deck-b")).items.some((entry) => entry.id === "card-0-reverse"));
});

test("Lernstandsaktionen laufen als manuelle Ereignisse; Rückgängig überspringt zwischenzeitlich geänderte Karten (KV4)", async () => {
  const { repository, dependencies, forward } = await setup(2);
  const dueAts = ["2026-11-20T00:00:00.000Z", "2026-11-21T00:00:00.000Z"];
  const due = await runCardBatch({ ...dependencies, random: () => 0.9 }, forward, { kind: "due", dueAts });
  assert.equal(due.changedCount, 2);
  assert.equal((await repository.loadCardBody(forward[0]))?.card.study.dueAt, dueAts[1]);
  await repository.rescheduleCards([forward[1]], "2026-12-01T00:00:00.000Z", NOW);
  assert.deepEqual(await due.undo(), { restoredCount: 1, skippedCount: 1 }, "die später neu geplante Karte behält ihr Datum");
  assert.equal((await repository.loadCardBody(forward[1]))?.card.study.dueAt, "2026-12-01T00:00:00.000Z");

  const reset = await runCardBatch(dependencies, [forward[1]], { kind: "reset" });
  assert.equal(reset.changedCount, 1);
  assert.deepEqual(await reset.undo(), { restoredCount: 1, skippedCount: 0 });
  assert.equal((await repository.loadCardBody(forward[1]))?.card.study.dueAt, "2026-12-01T00:00:00.000Z");

  const buried = await runCardBatch(dependencies, [forward[0]], { kind: "bury" });
  assert.equal(buried.changedCount, 1);
  assert.equal((await buried.undo()).restoredCount, 1);
  const events = await repository.listCardReviewEvents(forward[0]);
  assert.deepEqual(events.slice(-2).map((event) => (event.flags as { kind: string }).kind), ["manual_bury", "manual_unbury"]);
});

test("offline ohne lokale Kartenkörper schreibt eine Massenaktion nichts (KV4)", async () => {
  const { repository, dependencies, forward } = await setup(1);
  const offline = { ...dependencies, openCards: async () => { throw new Error("Diese Karten sind noch nicht offline verfügbar."); } };
  await assert.rejects(runCardBatch(offline, forward, { kind: "suspended", suspended: true }), /offline/);
  assert.equal((await repository.loadCardBody(forward[0]))?.card.status, "active");
});

test("Suchen und Ersetzen zeigt Felder und Vorschau, schreibt den Katalog neu und ist rückgängig zu machen (KV5)", async () => {
  const { repository, dependencies, forward } = await setup(3);
  const selection = forward.slice(0, 2);
  const session = await prepareTextReplace(dependencies, selection);
  assert.deepEqual(session.fieldNames, (await repository.loadCardBody(forward[0]))!.note.content.fields.map((field) => field.name));
  const edit = { find: "frage", replace: "Prompt", target: "all", matchCase: false } as const;
  const preview = session.preview(edit);
  assert.deepEqual([preview.changedCount, preview.examples.length], [2, 2]);
  assert.equal((await repository.loadCardBody(forward[0]))?.note.content.fields[0].html, "Frage 0", "die Vorschau speichert nichts");

  const result = await runCardBatch(dependencies, selection, { kind: "replace", ...edit });
  assert.equal(result.changedCount, 2);
  const changed = await repository.loadCardBody(forward[0]);
  assert.equal(changed?.note.content.fields[0].html, "Prompt 0");
  assert.equal(changed?.note.contentRevision, 2, "lokal bearbeitet");
  assert.equal((await repository.loadCardBody(forward[2]))?.note.content.fields[0].html, "Frage 2", "nicht ausgewählte Inhalte bleiben");
  assert.ok((await repository.listCatalogPage("deck-a")).items.find((entry) => entry.id === forward[0])?.normalizedSearchText.includes("prompt 0"), "die Suche findet den neuen Text");

  assert.deepEqual(await result.undo(), { restoredCount: 2, skippedCount: 0 });
  assert.equal((await repository.loadCardBody(forward[0]))?.note.content.fields[0].html, "Frage 0");
});
