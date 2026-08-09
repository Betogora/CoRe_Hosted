import assert from "node:assert/strict";
import test from "node:test";
import {
  appRouteToUrl,
  areAppRoutesEqual,
  createAppHistoryState,
  createReviewReturnContext,
  createStudyRoute,
  createViewRoute,
  normalizeAppRoute,
  parseAppRouteFromUrl,
  readAppRouteFromHistoryState,
  reviewReturnContextToViewRoute,
} from "./appNavigation.ts";

test("parses the default route from the root path", () => {
  assert.deepEqual(parseAppRouteFromUrl("/"), { mode: "view", viewId: "uebersicht" });
  assert.equal(appRouteToUrl({ mode: "view", viewId: "uebersicht" }), "/");
});

test("roundtrips the help route without additional context", () => {
  const route = parseAppRouteFromUrl("/hilfe");

  assert.deepEqual(route, { mode: "view", viewId: "hilfe" });
  assert.equal(appRouteToUrl(route), "/hilfe");
});

test("roundtrips the simulator route without additional context", () => {
  const route = parseAppRouteFromUrl("/simulator");

  assert.deepEqual(route, { mode: "view", viewId: "simulator" });
  assert.equal(appRouteToUrl(route), "/simulator");
});

test("roundtrips deck, card and creation context without validating navigational ids away", () => {
  const learnRoute = parseAppRouteFromUrl("/lernen?deck=deck_deep&parent=deck_parent");
  const deckRoute = parseAppRouteFromUrl("/kartenstapel?deck=deck_a&card=card_b");
  const deckSettingsRoute = parseAppRouteFromUrl("/stapel-einstellungen?deck=deck_b");
  const creationRoute = parseAppRouteFromUrl("/neue-karten?method=manual&deck=deck_b&done=deck_new");

  assert.deepEqual(learnRoute, {
    mode: "view",
    viewId: "lernen",
    focusedDeckId: "deck_deep",
    deckCreationParentId: "deck_parent",
  });
  assert.deepEqual(deckRoute, {
    mode: "view",
    viewId: "kartenstapel",
    focusedDeckId: "deck_a",
    selectedCardId: "card_b",
  });
  assert.deepEqual(deckSettingsRoute, { mode: "view", viewId: "stapel-einstellungen", focusedDeckId: "deck_b" });
  assert.deepEqual(creationRoute, {
    mode: "view",
    viewId: "neue-karten",
    creationMethod: "manual",
    creationDeckId: "deck_b",
    completedDeckId: "deck_new",
  });
  assert.equal(appRouteToUrl(learnRoute), "/lernen?deck=deck_deep&parent=deck_parent");
  assert.equal(appRouteToUrl(deckRoute), "/kartenstapel?deck=deck_a&card=card_b");
  assert.equal(appRouteToUrl(deckSettingsRoute), "/stapel-einstellungen?deck=deck_b");
  assert.equal(appRouteToUrl(creationRoute), "/neue-karten?method=manual&deck=deck_b&done=deck_new");
});

test("roundtrips the deck-settings origin and keeps direct links on the safe learning fallback", () => {
  const decksOrigin = parseAppRouteFromUrl(
    "/stapel-einstellungen?deck=deck_b&returnView=decks&returnCard=card_b",
  );
  const learnOrigin = parseAppRouteFromUrl(
    "/stapel-einstellungen?deck=deck_b&returnView=learn",
  );
  const dashboardOrigin = parseAppRouteFromUrl(
    "/stapel-einstellungen?deck=deck_b&returnView=today",
  );

  assert.deepEqual(decksOrigin, {
    mode: "view",
    viewId: "stapel-einstellungen",
    focusedDeckId: "deck_b",
    settingsReturnContext: { view: "decks", cardId: "card_b" },
  });
  assert.deepEqual(learnOrigin, {
    mode: "view",
    viewId: "stapel-einstellungen",
    focusedDeckId: "deck_b",
    settingsReturnContext: { view: "learn" },
  });
  assert.deepEqual(dashboardOrigin, {
    mode: "view",
    viewId: "stapel-einstellungen",
    focusedDeckId: "deck_b",
    settingsReturnContext: { view: "today" },
  });
  assert.equal(
    appRouteToUrl(decksOrigin),
    "/stapel-einstellungen?deck=deck_b&returnView=decks&returnCard=card_b",
  );
  assert.equal(appRouteToUrl(learnOrigin), "/stapel-einstellungen?deck=deck_b&returnView=learn");
  assert.equal(appRouteToUrl(dashboardOrigin), "/stapel-einstellungen?deck=deck_b&returnView=today");
  assert.deepEqual(
    parseAppRouteFromUrl("/stapel-einstellungen?deck=deck_b&returnView=external&returnCard=ignored"),
    { mode: "view", viewId: "stapel-einstellungen", focusedDeckId: "deck_b" },
  );
});

test("roundtrips an allowlisted review return from the selected card editor", () => {
  const editorRoute = createViewRoute("kartenstapel", {
    focusedDeckId: "deck_child",
    selectedCardId: "card_current",
    cardEditorReturnContext: {
      deckId: "deck_root",
      variantSession: true,
      variantId: "variant_current",
      returnContext: { view: "learn", deckId: "deck_root" },
    },
  });
  const url = appRouteToUrl(editorRoute);

  assert.match(url, /^\/kartenstapel\?deck=deck_child&card=card_current&reviewReturn=/);
  assert.deepEqual(parseAppRouteFromUrl(url), editorRoute);
  assert.deepEqual(
    parseAppRouteFromUrl("/kartenstapel?deck=deck_child&card=card_current&reviewReturn=https%3A%2F%2Fevil.example"),
    { mode: "view", viewId: "kartenstapel", focusedDeckId: "deck_child", selectedCardId: "card_current" },
  );
  assert.deepEqual(
    normalizeAppRoute({
      mode: "view",
      viewId: "kartenstapel",
      focusedDeckId: "deck_child",
      selectedCardId: "card_current",
      cardEditorReturnContext: { deckId: "deck_child" },
    }),
    { mode: "view", viewId: "kartenstapel", focusedDeckId: "deck_child", selectedCardId: "card_current" },
  );
});

test("roundtrips an allowlisted review return from deck settings", () => {
  const settingsRoute = createViewRoute("stapel-einstellungen", {
    focusedDeckId: "deck_root",
    settingsReturnContext: {
      view: "review",
      reviewReturnContext: {
        deckId: "deck_root",
        variantSession: true,
        variantId: "variant_current",
        returnContext: { view: "decks", deckId: "deck_child", cardId: "card_current" },
      },
    },
  });
  const url = appRouteToUrl(settingsRoute);

  assert.match(url, /^\/stapel-einstellungen\?deck=deck_root&returnView=review&reviewReturn=/);
  assert.deepEqual(parseAppRouteFromUrl(url), settingsRoute);
  assert.deepEqual(
    parseAppRouteFromUrl("/stapel-einstellungen?deck=deck_root&returnView=review&reviewReturn=https%3A%2F%2Fevil.example"),
    { mode: "view", viewId: "stapel-einstellungen", focusedDeckId: "deck_root" },
  );
  assert.deepEqual(
    normalizeAppRoute({
      mode: "view",
      viewId: "stapel-einstellungen",
      focusedDeckId: "deck_root",
      settingsReturnContext: { view: "review", reviewReturnContext: { deckId: "deck_root" } },
    }),
    { mode: "view", viewId: "stapel-einstellungen", focusedDeckId: "deck_root" },
  );
});

test("falls back to today for unknown paths and ignores unsupported query values", () => {
  assert.deepEqual(parseAppRouteFromUrl("/does-not-exist?deck=deck_a&card=card_a"), { mode: "view", viewId: "uebersicht" });
  assert.deepEqual(parseAppRouteFromUrl("/neue-karten?method=provider&card=ignored"), { mode: "view", viewId: "neue-karten" });
});

test("falls back to today for retired labs and test-mode routes", () => {
  for (const path of ["/graph", "/community", "/assistent", "/ki-jobs", "/testmodus"]) {
    assert.deepEqual(parseAppRouteFromUrl(path), { mode: "view", viewId: "uebersicht" });
  }
});

test("roundtrips review deck, variant and allowlisted return context through the URL", () => {
  const route = parseAppRouteFromUrl(
    "/decks/deck%2Fspecial/review?variant=variant%2Ftwo&returnView=decks&returnDeck=deck%2Fspecial&returnCard=card%2Ftwo",
  );

  assert.deepEqual(route, {
    mode: "study",
    deckId: "deck/special",
    variantSession: true,
    variantId: "variant/two",
    returnContext: {
      view: "decks",
      deckId: "deck/special",
      cardId: "card/two",
    },
  });
  assert.equal(
    appRouteToUrl(route),
    "/decks/deck%2Fspecial/review?variant=variant%2Ftwo&returnView=decks&returnDeck=deck%2Fspecial&returnCard=card%2Ftwo",
  );
});

test("reads old review URLs and normalizes free return values to the safe learning fallback", () => {
  const legacyRoute = parseAppRouteFromUrl("/decks/deck_a/review?variant=1");
  const unsafeRoute = parseAppRouteFromUrl(
    "/review/deck_a?returnView=https%3A%2F%2Fevil.example&returnDeck=deck_b&returnCard=card_b",
  );

  assert.deepEqual(legacyRoute, {
    mode: "study",
    deckId: "deck_a",
    variantSession: true,
    returnContext: { view: "learn", deckId: "deck_a" },
  });
  assert.deepEqual(unsafeRoute, {
    mode: "study",
    deckId: "deck_a",
    variantSession: false,
    returnContext: { view: "learn", deckId: "deck_b" },
  });
  assert.equal(
    appRouteToUrl(legacyRoute),
    "/decks/deck_a/review?variant=1&returnView=learn&returnDeck=deck_a",
  );
});

test("converts only today, learn and decks views into review return context", () => {
  const deckRoute = createViewRoute("kartenstapel", { focusedDeckId: "deck_a", selectedCardId: "card_a" });
  assert.deepEqual(createReviewReturnContext(deckRoute), { view: "decks", deckId: "deck_a", cardId: "card_a" });
  assert.deepEqual(reviewReturnContextToViewRoute({ view: "decks", deckId: "deck_a", cardId: "card_a" }), deckRoute);
  assert.deepEqual(createReviewReturnContext(createViewRoute("neue-karten"), "deck_a"), { view: "learn", deckId: "deck_a" });
  assert.deepEqual(createReviewReturnContext(createViewRoute("uebersicht"), "deck_a"), { view: "today" });
});

test("keeps an unknown review deck id so the product can render a not-found fallback", () => {
  assert.deepEqual(parseAppRouteFromUrl("/decks/missing/review"), {
    mode: "study",
    deckId: "missing",
    variantSession: false,
    returnContext: { view: "learn", deckId: "missing" },
  });
  assert.deepEqual(createStudyRoute(""), { mode: "view", viewId: "lernen" });
});

test("stores and reads app routes from browser history state without losing external state", () => {
  const route = createViewRoute("lernen");
  const state = createAppHistoryState(route, { currentState: { external: "kept" } });

  assert.equal(state.external, "kept");
  assert.deepEqual(readAppRouteFromHistoryState(state), route);
  assert.equal(areAppRoutesEqual(state.coreAppRoute, route), true);
});
