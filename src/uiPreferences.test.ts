import assert from "node:assert/strict";
import test from "node:test";
import { fillDashboardDecks, leastFrequentPin, mergeStudyDays, normalizeUiPreferences, rankFrequentDeckIds, SAVED_SEARCH_LIMIT, setDeckExpanded } from "./uiPreferences.ts";

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
    dashboardStudyDays: [],
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
    dashboardStudyDays: [],
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

test("Lerntage vereinigen sich als Menge, sortiert, ohne ungültige Tage", () => {
  const merged = mergeStudyDays(
    [{ deckId: "a", day: "2026-11-20" }, { deckId: "b", day: "2026-11-21" }, { deckId: "", day: "2026-11-21" }, { deckId: "c", day: "21.11.2026" }, { deckId: "d", day: "2026-02-30" }],
    [{ deckId: "a", day: "2026-11-20" }, { deckId: "c", day: "2026-11-24" }, { deckId: "a", day: "2026-11-01" }],
  );
  assert.deepEqual(merged, [{ deckId: "a", day: "2026-11-01" }, { deckId: "a", day: "2026-11-20" }, { deckId: "b", day: "2026-11-21" }, { deckId: "c", day: "2026-11-24" }]);
  assert.deepEqual(normalizeUiPreferences({ dashboardStudyDays: merged }).dashboardStudyDays, merged);
});

test("oft gelernt zählt Lerntage bis heute; Gleichstand gewinnt der spätere Tag", () => {
  const days = [
    { deckId: "a", day: "2026-11-20" }, { deckId: "a", day: "2026-11-21" },
    { deckId: "b", day: "2026-11-22" }, { deckId: "b", day: "2026-11-23" },
    { deckId: "c", day: "2026-11-23" }, { deckId: "later", day: "2026-12-01" }, { deckId: "old", day: "2026-11-05" },
  ];
  assert.deepEqual(rankFrequentDeckIds(days, "2026-11-24"), ["b", "a", "c"]);
  assert.deepEqual(rankFrequentDeckIds(days, "2026-12-05"), ["b", "later", "c"]);
});
