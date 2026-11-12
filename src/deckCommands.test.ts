import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createBasicNote, createCoreDeck } from "./coreModel.ts";
import type { Card, Deck, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { createDeckCommands } from "./deckCommands.ts";
import { getGlobalSchedulerPreferences, markLearningSettingsCustom } from "./deckSettings.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createDeckSettingsDraft, createGlobalCardSettingsDraft, type DeckSettingsDraft } from "./settingsDraft.ts";
import { createWorkspaceStore } from "./workspaceStore.ts";

Object.assign(globalThis, { IDBKeyRange });

const CREATED_AT = "2026-11-01T00:00:00.000Z";

function cardIn(deckId: string, index: number): { note: Note; cards: Card[] } {
  const created = createBasicNote(deckId, `Frage ${index}`, `Antwort ${index}`, { createdAt: CREATED_AT });
  const note: Note = { ...created.note, id: `note-${index}` };
  return { note, cards: created.cards.map((card) => ({ ...card, id: `card-${index}`, noteId: note.id, deckId })) };
}

/** Deck `Eltern` with the subdeck `Eltern::Kind`, next to the deck `Daneben`; each holds one card. */
async function setup() {
  const graphs = [cardIn("deck-parent", 0), cardIn("deck-child", 1), cardIn("deck-other", 2)];
  const cardsOf = (deckId: string) => graphs.flatMap((graph) => graph.cards).filter((card) => card.deckId === deckId);
  const userId = randomUUID();
  const initialState: WorkspaceState = {
    version: 6,
    profile: {
      userId,
      email: "lernen@example.test",
      displayName: "Lernende",
      timezone: "Europe/Berlin",
      onboardingComplete: true,
      schedulerPreferences: { settingsVersion: 2, dayStartHour: 0 },
      uiPreferences: { dashboardCollapsedDeckIds: [], learnCollapsedDeckIds: [], syncIntervalMinutes: 5, flagNames: ["", "", "", "", "", "", ""], savedSearches: [] },
    } as unknown as WorkspaceState["profile"],
    decks: [
      createCoreDeck({ id: "deck-parent", name: "Eltern", source: "manual", cards: cardsOf("deck-parent") }),
      createCoreDeck({ id: "deck-child", name: "Kind", hierarchyPath: ["Eltern", "Kind"], parentDeckId: "deck-parent", source: "manual", cards: cardsOf("deck-child") }),
      createCoreDeck({ id: "deck-other", name: "Daneben", source: "manual", cards: cardsOf("deck-other") }),
    ],
    notes: graphs.map((graph) => graph.note),
    updatedAt: CREATED_AT,
  };
  const repository = await createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as unknown as IDBFactory });
  const store = createWorkspaceStore();
  const refresh = ({ preserveCardPages = false } = {}) => store.set({ state: repository.getShellState(), ...(preserveCardPages ? {} : { cardPages: {} }) });
  refresh();
  // A running study session over the parent deck, with the cards it loaded.
  let studyDecks: Deck[] | null = [{ ...initialState.decks[0] }];
  const commands = createDeckCommands({
    store, repository, refresh, requestSync: () => undefined, syncNow: async () => undefined,
    updateStudyDecks: (update) => { studyDecks = update(studyDecks); },
  });
  const deck = (deckId: string) => store.get().state?.decks.find((candidate) => candidate.id === deckId);
  return { repository, store, commands, deck, studyDecks: () => studyDecks };
}

/** A changed limit makes the learning settings custom, as the settings form does. */
function withNewCardsPerDay<T extends { learning: DeckSettingsDraft["learning"] }>(draft: T, newCardsPerDay: number): T {
  return { ...draft, learning: { ...draft.learning, ...markLearningSettingsCustom({ ...draft.learning, newCardsPerDay }) } };
}

test("Stapeleinstellungen gelten je nach Geltungsbereich für den Stapel allein oder für seinen Teilbaum", async () => {
  const { commands, deck, studyDecks } = await setup();
  const defaultLimit = deck("deck-child")!.deckSettings.newCardsPerDay;
  const childBaseline = createDeckSettingsDraft(deck("deck-child")!);
  commands.saveDeckSettings("deck-child", { ...childBaseline, leech: { ...childBaseline.leech, leechThreshold: 4 } }, "deck", childBaseline);

  const treeBaseline = createDeckSettingsDraft(deck("deck-parent")!);
  const tree = commands.saveDeckSettings("deck-parent", withNewCardsPerDay(treeBaseline, 9), "deck-tree", treeBaseline);
  assert.deepEqual(tree?.changedDeckIds.sort(), ["deck-child", "deck-parent"]);
  assert.equal(deck("deck-parent")?.deckSettings.newCardsPerDay, 9);
  assert.equal(deck("deck-child")?.deckSettings.newCardsPerDay, 9, "der Teilbaum übernimmt die Änderung");
  assert.equal(deck("deck-child")?.deckSettings.leechThreshold, 4, "nicht geänderte eigene Werte des Unterstapels bleiben");
  assert.equal(deck("deck-other")?.deckSettings.newCardsPerDay, defaultLimit);

  const baseline = createDeckSettingsDraft(deck("deck-parent")!);
  const single = commands.saveDeckSettings("deck-parent", withNewCardsPerDay(baseline, 7), "deck", baseline);
  assert.deepEqual(single?.changedDeckIds, ["deck-parent"]);
  assert.equal(deck("deck-parent")?.deckSettings.newCardsPerDay, 7);
  assert.equal(deck("deck-child")?.deckSettings.newCardsPerDay, 9, "der Unterstapel bleibt");
  assert.equal(studyDecks()?.[0]?.deckSettings.newCardsPerDay, 7, "die laufende Sitzung übernimmt die Einstellung");
  assert.equal(studyDecks()?.[0]?.cards.length, 1, "und behält ihre Karten");
});

test("globale Lerneinstellungen gelten für neue Stapel oder zusätzlich für alle bestehenden", async () => {
  const { store, commands, deck } = await setup();
  const defaultLimit = deck("deck-other")!.deckSettings.newCardsPerDay;
  const preferences = getGlobalSchedulerPreferences(store.get().state!.profile);
  const draft = createGlobalCardSettingsDraft(preferences, store.get().state!.profile.uiPreferences.flagNames);

  commands.saveGlobalCardSettings(withNewCardsPerDay(draft, 11), "new-decks");
  assert.equal(deck("deck-other")?.deckSettings.newCardsPerDay, defaultLimit, "bestehende Stapel bleiben");
  assert.equal(commands.createDeck({ name: "Neu" })?.deckSettings.newCardsPerDay, 11, "ein neuer Stapel startet mit der Vorgabe");

  commands.saveGlobalCardSettings(withNewCardsPerDay(draft, 13), "all-decks");
  assert.deepEqual(store.get().state?.decks.map((candidate) => candidate.deckSettings.newCardsPerDay), [13, 13, 13, 13]);
});

test("Stapel löschen entfernt seine Unterstapel samt Karten", async () => {
  const { repository, store, commands } = await setup();

  const result = await commands.deleteDeck("deck-parent");

  assert.deepEqual(result?.deletedDeckIds.sort(), ["deck-child", "deck-parent"]);
  assert.deepEqual(store.get().state?.decks.map((candidate) => candidate.id), ["deck-other"]);
  assert.equal(await repository.loadCardBody("card-1"), null);
  assert.ok(await repository.loadCardBody("card-2"));
});

test("Zusatzkarten erhöhen erst nach erreichtem Tagesplan nur das heutige Neulimit des gewählten Stapels", async () => {
  const { repository, store, commands } = await setup();
  const now = "2026-11-12T10:00:00.000Z";
  const loadDeckCounts = async () => store.set({ deckSummaries: (await repository.listDeckSummaries({ now, timeZone: "Europe/Berlin" })).summaries });
  await loadDeckCounts();
  assert.deepEqual(commands.addAdditionalNewCards("deck-other", 3, now), { ok: false, message: "Für diesen Stapel sind keine zusätzlichen neuen Karten verfügbar." }, "solange neue Karten offen sind, bleibt das Limit");

  const preferences = getGlobalSchedulerPreferences(store.get().state!.profile);
  commands.saveGlobalCardSettings(withNewCardsPerDay(createGlobalCardSettingsDraft(preferences, store.get().state!.profile.uiPreferences.flagNames), 0), "all-decks");
  await loadDeckCounts();
  const settingsOf = () => Object.fromEntries(store.get().state!.decks.map((candidate) => [candidate.id, candidate.deckSettings]));
  const before = settingsOf();

  const added = commands.addAdditionalNewCards("deck-other", 3, now);

  assert.equal(added.ok, true);
  assert.deepEqual(settingsOf(), {
    ...before,
    "deck-other": { ...before["deck-other"], newCardsTodayOverride: { date: "2026-11-12", limit: 1 } },
  }, "nur das heutige Limit des gewählten Stapels steigt, höchstens um die neuen Karten, die er noch hat");
  assert.deepEqual(repository.getShellState().decks.find((candidate) => candidate.id === "deck-other")?.deckSettings.newCardsTodayOverride, { date: "2026-11-12", limit: 1 }, "lokal gespeichert");
});
