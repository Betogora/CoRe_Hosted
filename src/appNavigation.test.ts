import assert from "node:assert/strict";
import test from "node:test";
import {
  appRouteToUrl,
  areAppRoutesEqual,
  createAppHistoryState,
  createReviewReturnContext,
  createStudyRoute,
  createViewRoute,
  parseAppRouteFromUrl,
  readAppRouteFromHistoryState,
  reviewReturnContextToViewRoute,
} from "./appNavigation.ts";

test("parses the default route from the root path", () => {
  assert.deepEqual(parseAppRouteFromUrl("/"), { mode: "view", viewId: "uebersicht" });
  assert.equal(appRouteToUrl({ mode: "view", viewId: "uebersicht" }), "/");
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

test("falls back to today for unknown paths and ignores unsupported query values", () => {
  assert.deepEqual(parseAppRouteFromUrl("/does-not-exist?deck=deck_a&card=card_a"), { mode: "view", viewId: "uebersicht" });
  assert.deepEqual(parseAppRouteFromUrl("/neue-karten?method=provider&card=ignored"), { mode: "view", viewId: "neue-karten" });
});

test("falls back to today for retired labs routes", () => {
  for (const path of ["/graph", "/community", "/assistent", "/ki-jobs"]) {
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
