import assert from "node:assert/strict";
import test from "node:test";
import { createStudyRoute, createViewRoute } from "./appNavigation.ts";
import { projectAppRoute, subscribeToBrowserNavigation } from "./useAppNavigation.ts";

test("projects view and study routes into one exhaustive shell state", () => {
  assert.deepEqual(projectAppRoute(createViewRoute("neue-karten", { creationMethod: "manual", creationDeckId: "deck-1", completedDeckId: "deck-1", completedCount: 46, completionKind: "import" })), {
    activeView: "neue-karten",
    studyRequest: null,
    focusedDeckId: null,
    selectedCardId: null,
    cardEditorTab: "general",
    deckContent: false,
    deckContentTab: "children",
    deckCreationParentId: "",
    creationMethod: "manual",
    creationDeckId: "deck-1",
    completedDeckId: "deck-1",
    completedCount: 46,
    completionKind: "import",
    cardEditorReturnContext: null,
    settingsSection: null,
    deckSettings: null,
    cardQuery: "",
  });

  const studyRoute = createStudyRoute("deck-1", {
    returnContext: { view: "decks", deckId: "deck-1", cardId: "card-2" },
  });
  assert.equal(studyRoute.mode, "study");
  if (studyRoute.mode !== "study") throw new Error("Lernroute wurde unerwartet normalisiert.");
  assert.deepEqual(projectAppRoute(studyRoute), {
    activeView: "kartenstapel",
    studyRequest: studyRoute,
    focusedDeckId: "deck-1",
    selectedCardId: "card-2",
    cardEditorTab: "general",
    deckContent: false,
    deckContentTab: "cards",
    deckCreationParentId: "",
    creationMethod: "",
    creationDeckId: "",
    completedDeckId: "",
    completedCount: 0,
    completionKind: "",
    cardEditorReturnContext: null,
    settingsSection: null,
    deckSettings: null,
    cardQuery: "",
  });
});

test("projects the open settings dialog for views and sessions", () => {
  assert.equal(projectAppRoute(createViewRoute("kartenstapel", { focusedDeckId: "deck-1", settingsSection: "konflikte" })).settingsSection, "konflikte");
  const deckSettings = { deckId: "deck-1", section: "tagesrunde" as const };
  assert.deepEqual(projectAppRoute(createViewRoute("lernen", { deckSettings })).deckSettings, deckSettings);
  const overSession = projectAppRoute(createStudyRoute("deck-1", { returnContext: { view: "learn", deckId: "deck-1" }, deckSettings }));
  assert.deepEqual(overSession.deckSettings, deckSettings);
  assert.equal(overSession.settingsSection, null);
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
test("source creation survives route projection", () => {
  const projection = projectAppRoute(createViewRoute("neue-karten", { creationMethod: "ai-source", creationDeckId: "biology" }));
  assert.equal(projection.creationMethod, "ai-source");
  assert.equal(projection.creationDeckId, "biology");
});
