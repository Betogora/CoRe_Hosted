import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import type { Card, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { EXAM_SESSION_DECK_ID } from "./examPlanSettings.ts";
import { HIT_SESSION_DECK_ID } from "./hitStudySession.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createStudyPreparation } from "./studyPreparation.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";

Object.assign(globalThis, { IDBKeyRange });

const CREATED_AT = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-12T10:00:00.000Z";

function newCards(deckId: string, count: number): { note: Note; cards: Card[] }[] {
  return Array.from({ length: count }, (_, index) => {
    const created = createBasicNote(deckId, `Frage ${deckId} ${index}`, `Antwort ${index}`, { createdAt: CREATED_AT });
    const note: Note = { ...created.note, id: `note-${deckId}-${index}` };
    return { note, cards: created.cards.map((card) => ({ ...card, id: `card-${deckId}-${index}`, noteId: note.id, deckId })) };
  });
}

/** `Offen` with two new cards, `Gedeckelt` with two new cards and no new-card limit left today, and the empty `Leer`. */
async function setup() {
  const graphs = [...newCards("deck-open", 2), ...newCards("deck-capped", 2)];
  const cardsOf = (deckId: string) => graphs.flatMap((graph) => graph.cards).filter((card) => card.deckId === deckId);
  const initialState: WorkspaceState = {
    version: 6,
    profile: {
      userId: randomUUID(),
      timezone: "Europe/Berlin",
      schedulerPreferences: { settingsVersion: 2, dayStartHour: 0 },
      uiPreferences: { syncIntervalMinutes: 5, flagNames: ["", "", "", "", "", "", ""], savedSearches: [] },
    } as unknown as WorkspaceState["profile"],
    decks: [
      createCoreDeck({ id: "deck-open", name: "Offen", source: "manual", cards: cardsOf("deck-open") }),
      createCoreDeck({ id: "deck-capped", name: "Gedeckelt", source: "manual", cards: cardsOf("deck-capped"), deckSettings: { newCardsPerDay: 0 } }),
      createCoreDeck({ id: "deck-empty", name: "Leer", source: "manual" }),
    ],
    notes: graphs.map((graph) => graph.note),
    updatedAt: CREATED_AT,
  };
  const repository = await createIndexedDbCoreRepository({ userId: initialState.profile.userId, initialState, indexedDb: indexedDB as unknown as IDBFactory });
  const store = createWorkspaceStore();
  store.set({ state: repository.getShellState() });
  return createStudyPreparation({ store, repository, hydration: null, cloud: null, now: () => NOW });
}

test("der Start eines Stapels mit fälligen Karten bringt sie samt Inhalten in die Sitzung", async () => {
  const preparation = await setup();

  const outcome = await preparation.prepareStart("deck-open", NOW);

  assert.equal(outcome?.status, "ready");
  assert.ok(outcome?.status === "ready");
  assert.equal(outcome.preparation.queue.total, 2);
  assert.deepEqual(outcome.preparation.decks.map((deck) => [deck.id, deck.cards.length]), [["deck-open", 2]]);
  assert.deepEqual(outcome.preparation.notes.map((note) => note.id).sort(), ["note-deck-open-0", "note-deck-open-1"]);
});

test("ein leerer Start nennt, was die Tageslimits zurückhalten und ob mehr neue Karten möglich sind", async () => {
  const preparation = await setup();

  assert.deepEqual(await preparation.prepareStart("deck-capped", NOW), {
    status: "empty",
    emptyStart: { deckId: "deck-capped", deckName: "Gedeckelt", hasAdditionalNewCards: true, limitSummary: { hiddenDueCount: 0, hiddenNewCount: 2 } },
  });
  assert.deepEqual(await preparation.prepareStart("deck-empty", NOW), {
    status: "empty",
    emptyStart: { deckId: "deck-empty", deckName: "Leer", hasAdditionalNewCards: false, limitSummary: null },
  });
});

test("eine fehlgeschlagene Vorbereitung trägt die Meldung für den Dialog", async () => {
  const preparation = await setup();

  assert.deepEqual(await preparation.prepareStart(HIT_SESSION_DECK_ID, NOW), {
    status: "failed",
    failure: { deckId: HIT_SESSION_DECK_ID, message: "Die Treffer sind nach dem Neuladen nicht mehr da. Starte „Treffer lernen“ erneut." },
  });
  assert.deepEqual(await preparation.prepareStart(EXAM_SESSION_DECK_ID, NOW), {
    status: "failed",
    failure: { deckId: EXAM_SESSION_DECK_ID, message: "Die Kartenablage ist noch nicht bereit." },
  });

  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  try {
    const offline = await preparation.prepareStart(HIT_SESSION_DECK_ID, NOW);
    assert.equal(offline?.status === "failed" && offline.failure.message, "Du bist offline, und die fälligen Karten dieses Stapels liegen nicht auf diesem Gerät. Versuche es mit Verbindung erneut oder mache den Stapel vorher mit „Offline verfügbar machen“ verfügbar.");
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("ein Stapel, den es im Arbeitsbereich nicht gibt, startet keine Sitzung", async () => {
  const preparation = await setup();

  const outcome = await preparation.prepareStart("deck-foreign", NOW);

  assert.equal(outcome?.status, "missing");
  assert.ok(outcome?.status === "missing");
  assert.deepEqual(outcome.preparation.decks, []);
});
