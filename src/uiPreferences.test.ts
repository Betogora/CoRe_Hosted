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
  });
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 15 }).syncIntervalMinutes, 15);
  assert.equal(normalizeUiPreferences({ syncIntervalMinutes: 7 }).syncIntervalMinutes, 5);
  assert.deepEqual(setDeckExpanded(deckManager, "dashboard", "deck-a", true).dashboardCollapsedDeckIds, []);
  assert.deepEqual(setDeckExpanded(deckManager, "deck-manager", "deck-c", false).deckManagerExpandedDeckIds, []);
});
