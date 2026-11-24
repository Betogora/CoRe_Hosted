import assert from "node:assert/strict";
import test from "node:test";
import { fillDashboardDecks, leastFrequentPin, normalizeUiPreferences, SAVED_SEARCH_LIMIT, setDeckExpanded } from "./uiPreferences.ts";

test("UI preferences normalize persisted deck ids", () => {
  assert.deepEqual(normalizeUiPreferences({
    learnCollapsedDeckIds: ["deck-a", "deck-a", 1],
    deckManagerExpandedDeckIds: ["deck-b"],
  }), {
    learnCollapsedDeckIds: ["deck-a"],
    syncIntervalMinutes: 5,
    flagNames: ["", "", "", "", "", "", ""],
    savedSearches: [],
    dashboardPinnedDeckIds: [],
  });
});

test("deck expansion stores collapsed decks of Lernen", () => {
  const collapsed = setDeckExpanded({}, "deck-a", false);
  assert.deepEqual(collapsed, {
    learnCollapsedDeckIds: ["deck-a"],
    syncIntervalMinutes: 5,
    flagNames: ["", "", "", "", "", "", ""],
    savedSearches: [],
    dashboardPinnedDeckIds: [],
  });
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 15 }).syncIntervalMinutes, 15);
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 7 }).syncIntervalMinutes, 5);
  assert.deepEqual(setDeckExpanded(collapsed, "deck-a", true).learnCollapsedDeckIds, []);
});

test("Flaggennamen sind sieben gekürzte Texte, fehlende bleiben leer", () => {
  assert.deepEqual(normalizeUiPreferences({ flagNames: [" Wichtig ", 3, "x".repeat(50)] }).flagNames, ["Wichtig", "", "x".repeat(40), "", "", "", ""]);
});

test("gespeicherte Suchen behalten Reihenfolge und verwerfen Unbrauchbares", () => {
  const normalizeSavedSearches = (savedSearches: unknown) => normalizeUiPreferences({ savedSearches }).savedSearches;
  assert.deepEqual(normalizeSavedSearches([
    { id: "a", name: "  Heute nicht gewusst ", query: " rated:1:1 " },
    { id: "a", name: "Doppelt", query: "is:due" },
    { id: "b", name: " ", query: "is:due" },
    { id: "c", name: "Ohne Suche", query: "" },
    { id: "d", name: "x".repeat(80), query: "tag:herz" },
    "kaputt",
  ]), [
    { id: "a", name: "Heute nicht gewusst", query: "rated:1:1" },
    { id: "d", name: "x".repeat(60), query: "tag:herz" },
  ]);
  const many = Array.from({ length: SAVED_SEARCH_LIMIT + 5 }, (_, index) => ({ id: `s${index}`, name: `Suche ${index}`, query: "is:new" }));
  assert.equal(normalizeSavedSearches(many).length, SAVED_SEARCH_LIMIT);
  assert.deepEqual(normalizeUiPreferences({}).savedSearches, [], "ein Profil ohne gespeicherte Suchen bleibt gültig");
});

test("Heute-Pins bleiben in ihrer Reihenfolge, ohne Dubletten und höchstens vier", () => {
  assert.deepEqual(normalizeUiPreferences({ dashboardPinnedDeckIds: ["a", "b", "a", "", 3, "c", "d", "e"] }).dashboardPinnedDeckIds, ["a", "b", "c", "d"]);
});

test("das Heute-Widget füllt bis vier Stapel auf: Pins, dann oft gelernte, dann Hauptstapel", () => {
  const existing = new Set(["p1", "p2", "f1", "f2", "m1", "m2"]);
  assert.deepEqual(fillDashboardDecks(["p1", "gone"], ["f1", "p1", "f2"], ["m1", "m2"], existing), [
    { id: "p1", pinned: true }, { id: "f1", pinned: false }, { id: "f2", pinned: false }, { id: "m1", pinned: false },
  ]);
  assert.deepEqual(fillDashboardDecks([], [], ["m1", "m2"], existing), [{ id: "m1", pinned: false }, { id: "m2", pinned: false }]);
  assert.ok(fillDashboardDecks(["p1", "p2", "f1", "f2"], ["m1"], ["m2"], existing).every((entry) => entry.pinned));
});

test("beim Ersetzen ist der am niedrigsten gerankte Pin vorgewählt, ungerankte zuerst", () => {
  assert.equal(leastFrequentPin(["a", "b", "c"], ["c", "a", "b"]), "b");
  assert.equal(leastFrequentPin(["a", "b", "c", "d"], ["a", "d"]), "c");
});
