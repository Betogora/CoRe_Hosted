import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUiPreferences, setDeckExpanded } from "./uiPreferences.ts";

test("UI preferences normalize persisted deck ids", () => {
  assert.deepEqual(normalizeUiPreferences({
    dashboardCollapsedDeckIds: ["deck-a", "deck-a", 1],
    learnCollapsedDeckIds: null,
    deckManagerExpandedDeckIds: ["deck-b"],
  }), {
    dashboardCollapsedDeckIds: ["deck-a"],
    learnCollapsedDeckIds: [],
    deckManagerExpandedDeckIds: ["deck-b"],
    syncIntervalMinutes: 5,
    flagNames: ["", "", "", "", "", "", ""],
  });
});

test("deck expansion is stored with the correct semantics for every surface", () => {
  const dashboard = setDeckExpanded({}, "dashboard", "deck-a", false);
  const learn = setDeckExpanded(dashboard, "learn", "deck-b", false);
  const deckManager = setDeckExpanded(learn, "deck-manager", "deck-c", true);

  assert.deepEqual(deckManager, {
    dashboardCollapsedDeckIds: ["deck-a"],
    learnCollapsedDeckIds: ["deck-b"],
    deckManagerExpandedDeckIds: ["deck-c"],
    syncIntervalMinutes: 5,
    flagNames: ["", "", "", "", "", "", ""],
  });
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 15 }).syncIntervalMinutes, 15);
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 7 }).syncIntervalMinutes, 5);
  assert.deepEqual(setDeckExpanded(deckManager, "dashboard", "deck-a", true).dashboardCollapsedDeckIds, []);
  assert.deepEqual(setDeckExpanded(deckManager, "deck-manager", "deck-c", false).deckManagerExpandedDeckIds, []);
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
