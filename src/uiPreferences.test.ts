import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUiPreferences, SAVED_SEARCH_LIMIT, setDeckExpanded } from "./uiPreferences.ts";

test("UI preferences normalize persisted deck ids", () => {
  assert.deepEqual(normalizeUiPreferences({
    dashboardCollapsedDeckIds: ["deck-a", "deck-a", 1],
    learnCollapsedDeckIds: null,
    deckManagerExpandedDeckIds: ["deck-b"],
  }), {
    dashboardCollapsedDeckIds: ["deck-a"],
    learnCollapsedDeckIds: [],
    syncIntervalMinutes: 5,
    flagNames: ["", "", "", "", "", "", ""],
    savedSearches: [],
  });
});

test("deck expansion is stored with the correct semantics for every surface", () => {
  const dashboard = setDeckExpanded({}, "dashboard", "deck-a", false);
  const learn = setDeckExpanded(dashboard, "learn", "deck-b", false);

  assert.deepEqual(learn, {
    dashboardCollapsedDeckIds: ["deck-a"],
    learnCollapsedDeckIds: ["deck-b"],
    syncIntervalMinutes: 5,
    flagNames: ["", "", "", "", "", "", ""],
    savedSearches: [],
  });
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 15 }).syncIntervalMinutes, 15);
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 7 }).syncIntervalMinutes, 5);
  assert.deepEqual(setDeckExpanded(learn, "dashboard", "deck-a", true).dashboardCollapsedDeckIds, []);
});

test("bulk expansion changes only the requested decks and preserves other surfaces", () => {
  const initial = normalizeUiPreferences({ learnCollapsedDeckIds: ["a", "b", "unrelated"], dashboardCollapsedDeckIds: ["a"] });
  const expanded = setDeckExpanded(initial, "learn", ["a", "b"], true);
  assert.deepEqual(expanded.learnCollapsedDeckIds, ["unrelated"]);
  assert.deepEqual(expanded.dashboardCollapsedDeckIds, ["a"]);
  assert.deepEqual(setDeckExpanded(expanded, "learn", ["a", "b", "a"], false).learnCollapsedDeckIds, ["unrelated", "a", "b"]);
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
