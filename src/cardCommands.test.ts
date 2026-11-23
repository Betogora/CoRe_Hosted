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

async function setup({ cloud = null }: { cloud?: unknown } = {}) {
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
    store, repository, hydration: () => null, cloud: cloud as Parameters<typeof createCardCommands>[0]["cloud"], syncEngine: () => null, refresh, now: () => NOW, bootRun: { current: 1 },
  });
  const showList = (deckId: string, selectedCardId: string | null = null) => commands.requestCardPage({
    deckId, page: 0, pageSize: 50, query: "", sort: DEFAULT_CARD_TABLE_SORT, selectedCardId, searchContext: { todayStart: Date.parse(NOW) },
  });
  const shownIds = (deckId: string) => store.get().cardPages[deckId]?.pages[0]?.map((entry) => entry.id).sort();
  return { repository, store, commands, showList, shownIds, bootRun: { current: 1 } };
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

  const { undo } = await commands.createCardEditorServices([], () => undefined).runCardAction(graph, "card-0-forward", { kind: "delete" });
  assert.equal(await repository.loadCardBody("card-0-reverse"), null);
  assert.deepEqual(store.get().cardPages, {}, "die Listen laden neu");
  await showList("deck-a");
  assert.deepEqual(shownIds("deck-a"), ["card-1-forward"]);

  await undo();
  assert.equal((await repository.loadNoteGraph("note-0"))?.note.deletedAt, null);
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

  const moved = await editor.runCardAction((await repository.loadNoteGraph("note-1"))!, "card-1-forward", { kind: "deck", deckId: "deck-b" });

  assert.equal(moved.changedCount, 1);
  assert.equal((await repository.loadCardBody("card-1-forward"))?.card.deckId, "deck-b");
  assert.equal(store.get().cardPages["deck-a"], undefined, "der frühere Stapel lässt keine Zeile zurück");
  assert.equal(store.get().cardPages["deck-b"], undefined);
  await showList("deck-a");
  await showList("deck-b");
  assert.deepEqual(shownIds("deck-a"), ["card-0-forward"]);
  assert.deepEqual(shownIds("deck-b"), ["card-0-reverse", "card-1-forward"]);
});

test("eine Aktion an der offenen Karte lässt die Listen stehen; Rückgängig überspringt eine seither geänderte Karte", async () => {
  const { repository, store, commands, showList } = await setup();
  await showList("deck-a", "card-1-forward");
  const editor = commands.createCardEditorServices([], () => undefined);

  const suspended = await editor.runCardAction((await repository.loadNoteGraph("note-1"))!, "card-1-forward", { kind: "suspended", suspended: true });

  assert.equal(suspended.changedCount, 1);
  const row = () => store.get().cardPages["deck-a"]?.pages[0]?.find((entry) => entry.id === "card-1-forward");
  assert.equal(row()?.reviewable, false, "die Zeile bleibt und zeigt den neuen Stand");
  assert.equal(store.get().cardPages["deck-a"]?.selected?.cards.find((card) => card.id === "card-1-forward")?.status, "suspended");
  await commands.applyCardStudyState("card-1-forward", { suspended: false });
  assert.deepEqual(await suspended.undo(), { restoredCount: 0, skippedCount: 1 });

  const unleeched = await editor.runCardAction((await repository.loadNoteGraph("note-0"))!, "card-0-forward", { kind: "unleech" });
  assert.deepEqual(await unleeched.undo(), { restoredCount: 1, skippedCount: 0 });
});

test("eine Aktion an der offenen Karte und eine gleich folgende Flagge bauen aufeinander auf", async () => {
  const { repository, commands } = await setup();
  const editor = commands.createCardEditorServices([], () => undefined);
  const shown = (await repository.loadNoteGraph("note-1"))!;

  await Promise.all([
    editor.runCardAction(shown, "card-1-forward", { kind: "suspended", suspended: true }),
    commands.applyCardStudyState("card-1-forward", { flag: 2 }),
  ]);

  const card = (await repository.loadCardBody("card-1-forward"))?.card;
  assert.deepEqual([card?.status, card?.ankiFlag], ["suspended", 2]);
});

test("eine Aktion an der offenen Karte nutzt den gezeigten Inhalt, wenn er hier nicht vollständig liegt", async () => {
  const { repository, store, bootRun } = await setup();
  const shown = (await repository.loadNoteGraph("note-0"))!;
  // Offline or evicted: neither the body nor the content graph is stored on this device.
  const partial = { ...repository, loadCardBodies: async (ids: string[]) => ids.map(() => null), loadNoteGraphs: async (ids: string[]) => ids.map(() => null) };
  const commands = createCardCommands({ store, repository: partial, hydration: () => null, cloud: null, syncEngine: () => null, refresh: () => undefined, now: () => NOW, bootRun });

  const result = await commands.createCardEditorServices([], () => undefined).runCardAction(shown, "card-0-forward", { kind: "delete" });

  assert.equal(result.changedCount, 1);
  assert.equal(await repository.loadCardBody("card-0-forward"), null);
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

test("ein neuer Stapel bleibt sichtbar, wenn das Speichern seiner ersten Karte scheitert", async () => {
  const { repository, store, commands } = await setup();
  const content = createBasicNote("deck-a", "Frage", "Antwort").note.content;
  const saveNoteGraphs = repository.saveNoteGraphs;
  repository.saveNoteGraphs = async () => { throw new Error("Speicher voll."); };
  try {
    await assert.rejects(commands.saveManualNote({ deckId: null, deckName: "Aus Quelle", content, media: {} }), /Speicher voll/);
  } finally {
    repository.saveNoteGraphs = saveNoteGraphs;
  }
  assert.deepEqual(store.get().state?.decks.filter((deck) => deck.name === "Aus Quelle").length, 1);
});

test("Textimport: Duplikate aktualisieren Felder und behalten Karten samt Lernstand; ein Fehler lässt keinen neuen Stapel zurück", async () => {
  const { repository, store, commands } = await setup();
  const before = await repository.loadNoteGraph("note-1");
  assert.ok(before);
  const studied = { ...before.cards[0], study: { ...before.cards[0].study, reps: 4, state: "review" as const } };
  await repository.saveNoteGraphs([{ previous: before, next: { ...before, cards: [studied] } }]);
  const content = { ...before.note.content, fields: before.note.content.fields.map((field) => field.role === "answer" ? { ...field, html: "Neue Antwort" } : field) };

  const result = await commands.importTextNotes({ deckId: "deck-a", deckName: "", creates: [], updates: [{ noteId: "note-1", content }] });
  assert.equal(result?.deck.id, "deck-a");
  const after = await repository.loadNoteGraph("note-1");
  assert.equal(after?.note.content.fields.find((field) => field.role === "answer")?.html, "Neue Antwort");
  assert.deepEqual(after?.cards.map((card) => [card.id, card.study.reps]), [[studied.id, 4]]);

  const decksBefore = store.get().state!.decks.length;
  const save = repository.saveNoteGraphs;
  repository.saveNoteGraphs = async () => { throw new Error("Speicher voll"); };
  try {
    await assert.rejects(commands.importTextNotes({ deckId: null, deckName: "Neu", creates: [content], updates: [] }), /Speicher voll/);
  } finally {
    repository.saveNoteGraphs = save;
  }
  assert.equal(store.get().state!.decks.filter((deck) => !deck.deletedAt).length, decksBefore, "der für den Import angelegte Stapel ist wieder weg");
});

test("die Variantenerzeugung merkt sich „nicht umformulierbar“ und abgewiesene Ergebnisse, Netzfehler nicht; eine Variante hebt die Sperre auf", async () => {
  const cloud = { auth: { getSession: async () => ({ data: { session: { access_token: "token" } }, error: null }) } };
  const { repository, commands } = await setup({ cloud });
  const refusalOf = async (cardId: string) => (await repository.loadCardBody(cardId))?.card.variantRefusal;
  const answer = (body: unknown, status = 200) => { globalThis.fetch = async () => Response.json(body, { status }); };
  const originalFetch = globalThis.fetch;
  try {
    answer({ error: { code: "not_rephrasable", message: "Diese Karte lässt sich nicht sinnvoll umformulieren." } }, 422);
    await assert.rejects(commands.generateDeckCardVariant("deck-a", "card-1-forward"), { code: "not_rephrasable" });
    assert.equal((await refusalOf("card-1-forward"))?.state, "not_rephrasable");

    globalThis.fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(commands.generateDeckCardVariant("deck-a", "card-0-forward"), { code: "network_error" });
    assert.equal(await refusalOf("card-0-forward"), undefined);

    answer({ error: { code: "unchanged_front", message: "Das Modell hat die Kartenfrage nicht erkennbar umformuliert." } }, 502);
    await assert.rejects(commands.generateDeckCardVariant("deck-a", "card-0-forward"), { code: "unchanged_front" });
    assert.deepEqual([(await refusalOf("card-0-forward"))?.state, (await refusalOf("card-0-forward"))?.failures], [null, 1]);

    answer({ variant: { front: "Neu gefragt", back: "Antwort 1" }, model: "provider/model", privacyMode: "zdr", usage: null });
    await commands.generateDeckCardVariant("deck-a", "card-1-forward");
    const body = await repository.loadCardBody("card-1-forward");
    assert.equal(body?.card.variantRefusal, undefined);
    assert.equal(body?.card.variants.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
