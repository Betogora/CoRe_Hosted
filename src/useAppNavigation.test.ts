import assert from "node:assert/strict";
import test from "node:test";
import { createStudyRoute, createViewRoute } from "./appNavigation.ts";
import { projectAppRoute, subscribeToBrowserNavigation } from "./useAppNavigation.ts";

test("projects view and study routes into one exhaustive shell state", () => {
  assert.deepEqual(projectAppRoute(createViewRoute("neue-karten", { creationMethod: "manual", creationDeckId: "deck-1", completedDeckId: "deck-1" })), {
    activeView: "neue-karten",
    studyRequest: null,
    focusedDeckId: null,
    selectedCardId: null,
    deckCreationParentId: "",
    creationMethod: "manual",
    creationDeckId: "deck-1",
    completedDeckId: "deck-1",
  });

  const studyRoute = createStudyRoute("deck-1", {
    variantSession: true,
    returnContext: { view: "decks", deckId: "deck-1", cardId: "card-2" },
  });
  assert.equal(studyRoute.mode, "study");
  if (studyRoute.mode !== "study") throw new Error("Lernroute wurde unerwartet normalisiert.");
  assert.deepEqual(projectAppRoute(studyRoute), {
    activeView: "kartenstapel",
    studyRequest: studyRoute,
    focusedDeckId: "deck-1",
    selectedCardId: "card-2",
    deckCreationParentId: "",
    creationMethod: "",
    creationDeckId: "",
    completedDeckId: "",
  });
});

test("browser navigation cleanup removes the exact popstate listener", () => {
  let listener: ((event: PopStateEvent) => void) | null = null;
  let removed: ((event: PopStateEvent) => void) | null = null;
  const received: unknown[] = [];
  const target = {
    location: { href: "https://core.test/lernen" } as Location,
    history: {} as History,
    addEventListener(_type: "popstate", nextListener: (event: PopStateEvent) => void) { listener = nextListener; },
    removeEventListener(_type: "popstate", nextListener: (event: PopStateEvent) => void) { removed = nextListener; },
  };

  const cleanup = subscribeToBrowserNavigation(target, (state, url) => received.push({ state, url }));
  assert.ok(listener);
  const activeListener = listener as (event: PopStateEvent) => void;
  activeListener({ state: { route: "lernen" } } as PopStateEvent);
  assert.deepEqual(received, [{ state: { route: "lernen" }, url: "https://core.test/lernen" }]);

  cleanup();
  assert.equal(removed, activeListener);
});
