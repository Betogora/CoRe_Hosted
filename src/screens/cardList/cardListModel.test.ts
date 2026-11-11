import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote, createCoreDeck } from "../../coreModel.ts";
import type { Card } from "../../coreTypes.ts";
import type { CardTableSort } from "../../libraryModel.ts";
import { catalogEntryFromCard } from "../../workspaceReplica.ts";
import { createHitListModel, createPagedCardTableModel } from "./cardListModel.ts";

const SORT: CardTableSort = { field: "sortField", direction: "asc" };

function card(id: string, front = "Frage"): Card {
  return { ...createBasicNote("deck_child", front, "Antwort").cards[0], id };
}

test("paged card table uses only pages for the current query and sort and keeps awaited groups", () => {
  const cards = [card("card_nerv", "Nerv"), card("card_muskel", "Muskel")];
  const parent = createCoreDeck({ id: "deck_parent", name: "Medizin", source: "manual", hierarchyPath: ["Medizin"], cards: [] });
  const child = createCoreDeck({ id: "deck_child", name: "Anatomie", source: "manual", parentDeckId: parent.id, hierarchyPath: ["Medizin", "Anatomie"], cards });
  const items = cards.map((entry) => catalogEntryFromCard(entry, null));
  const childPage = { pages: { 0: items }, pageSize: 50, totalCount: 2, query: "nerv", sort: SORT };
  const options = { query: "nerv", cardSort: SORT, now: "2026-07-01T08:00:00.000Z" };

  const awaiting = createPagedCardTableModel([parent, child], { deck_child: childPage }, { ...options, awaitingPages: true });
  assert.deepEqual(awaiting.groups.map((group) => group.id), ["deck_parent", "deck_child"]);
  const childGroup = awaiting.allGroups.find((group) => group.id === "deck_child")!;
  assert.deepEqual(childGroup.cardRows.map((row) => row.id), ["card_nerv", "card_muskel"]);
  assert.equal(childGroup.totalCardCount, 2);
  assert.equal(childGroup.deck.cards.length, 2);

  const settled = createPagedCardTableModel([parent, child], { deck_child: childPage }, { ...options, awaitingPages: false });
  assert.deepEqual(settled.groups.map((group) => group.id), ["deck_child"]);

  const stale = createPagedCardTableModel([parent, child], { deck_child: { ...childPage, sort: { field: "variants", direction: "asc" } } }, { ...options, awaitingPages: false });
  assert.deepEqual(stale.groups, []);

  const reloading = createPagedCardTableModel([parent, child], { deck_child: { ...childPage, query: "ner" } }, { ...options, awaitingPages: true });
  const reloadingChild = reloading.allGroups.find((group) => group.id === "deck_child")!;
  assert.equal(reloadingChild.loading, true);
  assert.deepEqual(reloadingChild.cardRows.map((row) => row.id), ["card_nerv", "card_muskel"], "die vorige Seite bleibt bis zur Antwort stehen");
  assert.equal(awaiting.allGroups.find((group) => group.id === "deck_child")!.loading, false);
});

test("eine Liste setzt geladene Seiten an ihre Stelle und reserviert die übrigen Zeilen (KV3)", () => {
  const entry = (id: string) => catalogEntryFromCard(card(id), null);
  const list = { pages: { 0: [entry("a"), entry("b")], 3: [entry("x")] }, pageSize: 2, totalCount: 9, query: "herz", sort: SORT };
  const hits = createHitListModel(list, { query: "herz", cardSort: SORT, awaitingPages: true });
  assert.equal(hits.totalCardCount, 9);
  assert.deepEqual([...hits.rowsByIndex.keys()], [0, 1, 6]);
  assert.deepEqual(hits.cardRows.map((row) => row.id), ["a", "b", "x"]);
  assert.equal(hits.loading, false);
  const changed = createHitListModel(list, { query: "lunge", cardSort: SORT, awaitingPages: true });
  assert.equal(changed.loading, true, "eine geänderte Suche wartet auf ihre erste Seite");
  assert.deepEqual(changed.cardRows.map((row) => row.id), ["a", "b", "x"], "bis dahin bleibt die vorige Liste stehen");
  assert.equal(hits.rowsByIndex.get(0), createHitListModel(list, { query: "herz", cardSort: SORT, awaitingPages: true }).rowsByIndex.get(0), "eine Zeile entsteht je Eintrag nur einmal");
  assert.equal(createHitListModel(undefined, { query: "herz", cardSort: SORT, awaitingPages: false }).totalCardCount, 0);
});

test("eine leere Folgeseite einer kürzeren Suche verlängert die Liste nicht (KV3b)", () => {
  const items = [catalogEntryFromCard(card("card_cote", "Côte d'Ivoire"), null)];
  const list = { pages: { 0: items, 1: [] }, pageSize: 50, totalCount: 1, query: "côte", sort: SORT };
  const model = createHitListModel(list, { query: "côte", cardSort: SORT, awaitingPages: true });
  assert.equal(model.totalCardCount, 1, "keine 49 Platzhalter, die ihre Seite immer wieder anfordern");
});
