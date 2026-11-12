import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createCardCommands } from "./cardCommands.ts";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { DEFAULT_CARD_TABLE_SORT } from "./libraryModel.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";

Object.assign(globalThis, { IDBKeyRange });

const CREATED_AT = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-12T10:00:00.000Z";

/** `note-0` with its forward card in deck A and its reverse sibling in deck B, plus `note-1` in deck A. */
async function setup() {
  const graphs = [0, 1].map((index) => {
    const created = createBasicNote("deck-a", `Frage ${index}`, `Antwort ${index}`, { reverse: index === 0, createdAt: CREATED_AT });
    const note: Note = { ...created.note, id: `note-${index}` };
    const cards: Card[] = created.cards.map((card) => ({ ...card, id: `card-${index}-${card.promptKey}`, noteId: note.id, deckId: card.promptKey === "forward" ? "deck-a" : "deck-b" }));
    return { note, cards };
  });
  const cards = graphs.flatMap((graph) => graph.cards);
  const initialState: WorkspaceState = {
    version: 6,
    profile: { userId: "user-card-commands", uiPreferences: {} } as unknown as WorkspaceState["profile"],
    decks: [
      createCoreDeck({ id: "deck-a", name: "A", source: "manual", cards: cards.filter((card) => card.deckId === "deck-a") }),
      createCoreDeck({ id: "deck-b", name: "B", source: "manual", cards: cards.filter((card) => card.deckId === "deck-b") }),
    ],
    notes: graphs.map((graph) => graph.note),
    updatedAt: CREATED_AT,
  };
  const repository = await createIndexedDbCoreRepository({ userId: randomUUID(), initialState, indexedDb: indexedDB as unknown as IDBFactory });
  const store = createWorkspaceStore();
  const refresh = ({ preserveCardPages = false } = {}) => store.set({ state: repository.getShellState(), ...(preserveCardPages ? {} : { cardPages: {} }) });
  refresh();
  const commands = createCardCommands({
    store, repository, hydration: () => null, cloud: null, syncEngine: () => null, refresh, now: () => NOW, bootRun: { current: 1 },
  });
  const showList = (deckId: string, selectedCardId: string | null = null) => commands.requestCardPage({
    deckId, page: 0, pageSize: 50, query: "", sort: DEFAULT_CARD_TABLE_SORT, selectedCardId, searchContext: { todayStart: Date.parse(NOW) },
  });
  const shownIds = (deckId: string) => store.get().cardPages[deckId]?.pages[0]?.map((entry) => entry.id).sort();
  return { repository, store, commands, showList, shownIds };
}

test("Inhalt speichern aktualisiert Store, offene Karte und die Zeilen aller Stapel, die den Inhalt zeigen", async () => {
  const { repository, store, commands, showList } = await setup();
  await showList("deck-a", "card-0-forward");
  await showList("deck-b");
  const graph = await repository.loadNoteGraph("note-0");
  assert.ok(graph);
  const revision = store.get().revision;

  const saved = await commands.saveDeckNote(graph, {
    ...graph.note.content,
    fields: graph.note.content.fields.map((field) => field.id === "front" ? { ...field, html: "Neue Frage" } : field),
  });

  assert.equal(saved?.note.contentRevision, 2);
  assert.ok(store.get().revision > revision, "der Arbeitsbereich wurde neu übernommen");
  const deckA = store.get().cardPages["deck-a"];
  assert.equal(deckA?.pages[0]?.find((entry) => entry.id === "card-0-forward")?.frontPreview, "Neue Frage");
  assert.equal(deckA?.pages[0]?.find((entry) => entry.id === "card-1-forward")?.frontPreview, "Frage 1");
  assert.equal(deckA?.selected?.note.contentRevision, 2, "die offene Karte zeigt den gespeicherten Inhalt");
  assert.equal(store.get().cardPages["deck-b"]?.pages[0]?.[0]?.frontPreview, "Neue Frage", "das Geschwister im anderen Stapel folgt");
});

test("Löschen entfernt den Inhalt samt Geschwistern; Rückgängig stellt den vorherigen Stand her", async () => {
  const { repository, store, commands, showList, shownIds } = await setup();
  await showList("deck-a");
  const graph = await repository.loadNoteGraph("note-0");
  assert.ok(graph);

  const { deleted, undo } = await commands.deleteDeckNote(graph);
  assert.equal(await repository.loadCardBody("card-0-reverse"), null);
  assert.deepEqual(store.get().cardPages, {}, "die Listen laden neu");
  await showList("deck-a");
  assert.deepEqual(shownIds("deck-a"), ["card-1-forward"]);

  const restored = await commands.undoDeleteDeckNote(undo, deleted);
  assert.equal(restored.note.deletedAt, null);
  assert.deepEqual(store.get().cardPages, {});
  await showList("deck-a");
  await showList("deck-b");
  assert.deepEqual(shownIds("deck-a"), ["card-0-forward", "card-1-forward"]);
  assert.deepEqual(shownIds("deck-b"), ["card-0-reverse"]);
  assert.equal((await repository.loadNoteGraph("note-0"))?.note.content.fields.find((field) => field.id === "front")?.html, graph.note.content.fields.find((field) => field.id === "front")?.html);
});

test("eine Karte wechselt in einen anderen Stapel; Listen, die sie zeigten, laden neu", async () => {
  const { repository, store, commands, showList, shownIds } = await setup();
  await showList("deck-a");
  await showList("deck-b");
  const editor = commands.createCardEditorServices([], () => undefined);

  const moved = await editor.moveCard("card-1-forward", "deck-b");

  assert.equal(moved?.cards[0]?.deckId, "deck-b");
  assert.equal((await repository.loadCardBody("card-1-forward"))?.card.deckId, "deck-b");
  assert.equal(store.get().cardPages["deck-a"], undefined, "der frühere Stapel lässt keine Zeile zurück");
  assert.equal(store.get().cardPages["deck-b"], undefined);
  await showList("deck-a");
  await showList("deck-b");
  assert.deepEqual(shownIds("deck-a"), ["card-0-forward"]);
  assert.deepEqual(shownIds("deck-b"), ["card-0-reverse", "card-1-forward"]);
});

test("schnelle Sofortänderungen am Lernstand bauen in ihrer Reihenfolge aufeinander auf", async () => {
  const { repository, commands } = await setup();

  const changes = [
    commands.applyCardStudyState("card-0-forward", { flag: 3 }),
    commands.applyCardStudyState("card-0-forward", { marked: true }),
    commands.applyCardStudyState("card-0-reverse", { suspended: true }),
    commands.applyCardStudyState("card-0-forward", { flag: 5 }),
  ];
  await Promise.all(changes);

  const graph = await repository.loadNoteGraph("note-0");
  const forward = graph?.cards.find((card) => card.id === "card-0-forward");
  const reverse = graph?.cards.find((card) => card.id === "card-0-reverse");
  assert.equal(forward?.ankiFlag, 5, "die letzte Flagge gewinnt");
  assert.equal(graph?.note.marked, true, "die Markierung des Inhalts bleibt neben den Kartenänderungen");
  assert.equal(reverse?.status, "suspended");
  assert.equal(forward?.status, "active");
});
