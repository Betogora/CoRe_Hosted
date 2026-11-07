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
  reviewReturnContextToViewRoute,
  settingsContentSection,
  settingsSectionGroup,
} from "./appNavigation.ts";

test("deck content retains its scope and editor selection through URL and history", () => {
  const route = createViewRoute("kartenstapel", { focusedDeckId: "deck-1", selectedCardId: "card-1", deckContent: true });
  assert.equal(appRouteToUrl(route), "/kartenstapel?deck=deck-1&card=card-1&cardTab=general&content=1");
  assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(route)), route);
  assert.deepEqual(createViewRoute("kartenstapel", { deckContent: true }), createViewRoute("kartenstapel"));
  assert.deepEqual(parseAppRouteFromUrl("/lernen?deck=deck-1&content=1"), createViewRoute("lernen", { focusedDeckId: "deck-1" }));
});

test("content tabs roundtrip with the selected deck and review return context", () => {
  for (const tab of ["children", "summary", "quiz", "mind-map", "cards", "source"] as const) {
    const route = createViewRoute("kartenstapel", { focusedDeckId: "child", deckContent: true, deckContentTab: tab });
    assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(route)), route);
    const review = createStudyRoute("child", { returnContext: createReviewReturnContext(route) });
    if (review.mode !== "study") throw new Error("Missing review route");
    assert.deepEqual(reviewReturnContextToViewRoute(review.returnContext), route);
    assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(review)), review);
  }
  assert.deepEqual(parseAppRouteFromUrl("/kartenstapel?deck=child&content=1&tab=unknown"), createViewRoute("kartenstapel", { focusedDeckId: "child", deckContent: true }));
  assert.deepEqual(parseAppRouteFromUrl("/lernen?deck=child&tab=cards"), createViewRoute("lernen", { focusedDeckId: "child" }));
  const editor = createViewRoute("kartenstapel", { focusedDeckId: "child", deckContent: true, deckContentTab: "summary", selectedCardId: "card" });
  assert.equal(editor.deckContentTab, "cards");
});

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

test("the settings dialog is an area on top of the current view and replaces the former settings pages", () => {
  const route = parseAppRouteFromUrl("/lernen?deck=deck_a&settings=flaggen");

  assert.deepEqual(route, { mode: "view", viewId: "lernen", focusedDeckId: "deck_a", settingsSection: "flaggen" });
  assert.equal(appRouteToUrl(route), "/lernen?deck=deck_a&settings=flaggen");
  assert.deepEqual(parseAppRouteFromUrl("/?settings=unbekannt"), { mode: "view", viewId: "uebersicht" });
  for (const formerPage of ["/einstellungen", "/karten-einstellungen?target=flag-names"]) {
    assert.deepEqual(parseAppRouteFromUrl(formerPage), { mode: "view", viewId: "uebersicht" });
  }
});

test("settings areas resolve to their content and draft group", () => {
  assert.equal(settingsContentSection("start"), "konto");
  assert.equal(settingsContentSection("konflikte"), "daten");
  for (const section of ["start", "konto", "daten", "konflikte", "ueber"] as const) assert.equal(settingsSectionGroup(section), "general");
  for (const section of ["lerntag", "tagesrunde", "scheduler", "flaggen", "fokus"] as const) assert.equal(settingsSectionGroup(section), "learning");
});

test("roundtrips deck, card and creation context without validating navigational ids away", () => {
  const learnRoute = parseAppRouteFromUrl("/lernen?deck=deck_deep&parent=deck_parent");
  const deckRoute = parseAppRouteFromUrl("/kartenstapel?deck=deck_a&card=card_b");
  const creationRoute = parseAppRouteFromUrl("/neue-karten?method=manual&deck=deck_b&done=deck_new&doneCount=46&doneKind=import");

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
    cardEditorTab: "general",
  });
  assert.deepEqual(creationRoute, {
    mode: "view",
    viewId: "neue-karten",
    creationMethod: "manual",
    creationDeckId: "deck_b",
    completedDeckId: "deck_new",
    completedCount: 46,
    completionKind: "import",
  });
  assert.equal(appRouteToUrl(learnRoute), "/lernen?deck=deck_deep&parent=deck_parent");
  assert.equal(appRouteToUrl(deckRoute), "/kartenstapel?deck=deck_a&card=card_b&cardTab=general");
  assert.equal(appRouteToUrl(creationRoute), "/neue-karten?method=manual&deck=deck_b&done=deck_new&doneCount=46&doneKind=import");
});

test("the deck settings dialog lies over views and sessions instead of having its own route", () => {
  const overView = parseAppRouteFromUrl("/kartenstapel?deck=deck_a&settingsDeck=deck_b&settings=scheduler");
  assert.deepEqual(overView, { mode: "view", viewId: "kartenstapel", focusedDeckId: "deck_a", deckSettings: { deckId: "deck_b", section: "scheduler" } });
  assert.equal(appRouteToUrl(overView), "/kartenstapel?deck=deck_a&settingsDeck=deck_b&settings=scheduler");

  const overSession = parseAppRouteFromUrl("/decks/deck_b/review?returnView=learn&returnDeck=deck_b&settingsDeck=deck_b&settings=neue-karten");
  assert.deepEqual(overSession, { mode: "study", deckId: "deck_b", returnContext: { view: "learn", deckId: "deck_b" }, deckSettings: { deckId: "deck_b", section: "neue-karten" } });
  assert.equal(appRouteToUrl(overSession), "/decks/deck_b/review?returnView=learn&returnDeck=deck_b&settingsDeck=deck_b&settings=neue-karten");

  assert.deepEqual(parseAppRouteFromUrl("/lernen?settingsDeck=deck_b&settings=konto"), { mode: "view", viewId: "lernen", deckSettings: { deckId: "deck_b", section: "start" } });
  assert.deepEqual(createViewRoute("lernen", { settingsSection: "konto", deckSettings: { deckId: "deck_b", section: "stapel" } }), { mode: "view", viewId: "lernen", deckSettings: { deckId: "deck_b", section: "stapel" } });
  for (const formerPage of ["/stapel-einstellungen?deck=deck_b&returnView=learn", "/stapel-einstellungen?deck=deck_b&target=new-cards-per-day"]) {
    assert.deepEqual(parseAppRouteFromUrl(formerPage), { mode: "view", viewId: "uebersicht" });
  }
});

test("roundtrips an allowlisted review return from the selected card editor", () => {
  const editorRoute = createViewRoute("kartenstapel", {
    focusedDeckId: "deck_child",
    selectedCardId: "card_current",
    cardEditorReturnContext: {
      deckId: "deck_root",
      returnContext: { view: "learn", deckId: "deck_root" },
    },
  });
  const url = appRouteToUrl(editorRoute);

  assert.match(url, /^\/kartenstapel\?deck=deck_child&card=card_current&cardTab=content&reviewReturn=/);
  assert.deepEqual(parseAppRouteFromUrl(url), editorRoute);
  assert.deepEqual(
    parseAppRouteFromUrl("/kartenstapel?deck=deck_child&card=card_current&reviewReturn=https%3A%2F%2Fevil.example"),
    { mode: "view", viewId: "kartenstapel", focusedDeckId: "deck_child", selectedCardId: "card_current", cardEditorTab: "general" },
  );
  assert.deepEqual(
    normalizeAppRoute({
      mode: "view",
      viewId: "kartenstapel",
      focusedDeckId: "deck_child",
      selectedCardId: "card_current",
      cardEditorReturnContext: { deckId: "deck_child" },
    }),
    { mode: "view", viewId: "kartenstapel", focusedDeckId: "deck_child", selectedCardId: "card_current", cardEditorTab: "general" },
  );
});

test("falls back to today for unknown paths and ignores unsupported query values", () => {
  assert.deepEqual(parseAppRouteFromUrl("/does-not-exist?deck=deck_a&card=card_a"), { mode: "view", viewId: "uebersicht" });
  assert.deepEqual(parseAppRouteFromUrl("/neue-karten?method=provider&card=ignored"), { mode: "view", viewId: "neue-karten" });
});

test("roundtrips review deck and allowlisted return context through the URL", () => {
  const route = parseAppRouteFromUrl(
    "/decks/deck%2Fspecial/review?returnView=decks&returnDeck=deck%2Fspecial&returnCard=card%2Ftwo",
  );

  assert.deepEqual(route, {
    mode: "study",
    deckId: "deck/special",
    returnContext: {
      view: "decks",
      deckId: "deck/special",
      cardId: "card/two",
    },
  });
  assert.equal(
    appRouteToUrl(route),
    "/decks/deck%2Fspecial/review?returnView=decks&returnDeck=deck%2Fspecial&returnCard=card%2Ftwo",
  );
});

test("ignores unknown review parameters and normalizes free return values to the safe learning fallback", () => {
  const plainRoute = parseAppRouteFromUrl("/decks/deck_a/review?variant=1");
  const unsafeRoute = parseAppRouteFromUrl(
    "/review/deck_a?returnView=https%3A%2F%2Fevil.example&returnDeck=deck_b&returnCard=card_b",
  );

  assert.deepEqual(plainRoute, {
    mode: "study",
    deckId: "deck_a",
    returnContext: { view: "learn", deckId: "deck_a" },
  });
  assert.deepEqual(unsafeRoute, {
    mode: "study",
    deckId: "deck_a",
    returnContext: { view: "learn", deckId: "deck_b" },
  });
  assert.equal(
    appRouteToUrl(plainRoute),
    "/decks/deck_a/review?returnView=learn&returnDeck=deck_a",
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
    returnContext: { view: "learn", deckId: "missing" },
  });
  assert.deepEqual(createStudyRoute(""), { mode: "view", viewId: "lernen" });
});

test("review return preserves deck content through URL reloads", () => {
  const source = createViewRoute("kartenstapel", { focusedDeckId: "deck_a", deckContent: true });
  const returnContext = createReviewReturnContext(source);
  const review = createStudyRoute("deck_a", { returnContext });
  const url = appRouteToUrl(review);
  assert.match(url, /returnContent=1/);
  const reloaded = parseAppRouteFromUrl(url);
  assert.ok(reloaded.mode === "study");
  assert.deepEqual(reviewReturnContextToViewRoute(reloaded.returnContext), source);
  const learning = parseAppRouteFromUrl("/decks/deck_a/review?returnView=learn&returnContent=1");
  assert.ok(learning.mode === "study");
  assert.equal(learning.returnContext.deckContent, undefined);
});

test("stores app routes in browser history state without losing external state", () => {
  const route = createViewRoute("lernen");
  const state = createAppHistoryState(route, { currentState: { external: "kept" } });

  assert.equal(state.external, "kept");
  assert.equal(areAppRoutesEqual(state.coreAppRoute, route), true);
});

test("content tabs survive reload and study return while unsupported tabs are ignored", () => {
  for (const deckContentTab of ["children", "summary", "mind-map", "cards", "quiz", "source"] as const) {
    const route = createViewRoute("kartenstapel", { focusedDeckId: "deck_a", deckContent: true, deckContentTab });
    assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(route)), route);
    const review = parseAppRouteFromUrl(appRouteToUrl(createStudyRoute("deck_a", { returnContext: createReviewReturnContext(route) })));
    assert.ok(review.mode === "study");
    assert.deepEqual(reviewReturnContextToViewRoute(review.returnContext), route);
  }
  const invalid = parseAppRouteFromUrl("/kartenstapel?deck=deck_a&content=1&tab=invalid");
  assert.ok(invalid.mode === "view");
  assert.equal(invalid.deckContentTab, undefined);
  const selected = createViewRoute("kartenstapel", { focusedDeckId: "deck_a", deckContent: true, deckContentTab: "summary", selectedCardId: "card_a" });
  assert.equal(selected.deckContentTab, "cards");
});
test("source creation route round-trips with its explicit target", () => {
  const route = createViewRoute("neue-karten", { creationMethod: "ai-source", creationDeckId: "biology" });
  assert.equal(appRouteToUrl(route), "/neue-karten?method=ai-source&deck=biology");
  assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(route)), route);
});

test("card editor tabs come from a fixed list and open by entry (W5, W6)", () => {
  const fromTable = createViewRoute("kartenstapel", { focusedDeckId: "deck-1", selectedCardId: "card-1" });
  const fromSession = createViewRoute("kartenstapel", { focusedDeckId: "deck-1", selectedCardId: "card-1", cardEditorReturnContext: { deckId: "deck-1", returnContext: { view: "learn" } } });
  assert.equal(fromTable.cardEditorTab, "general");
  assert.equal(fromSession.cardEditorTab, "content");
  const variantsFromSession = createViewRoute("kartenstapel", { focusedDeckId: "deck-1", selectedCardId: "card-1", cardEditorTab: "variants", cardEditorReturnContext: { deckId: "deck-1", returnContext: { view: "learn" } } });
  assert.equal(variantsFromSession.cardEditorTab, "variants");
  assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(variantsFromSession)), variantsFromSession);
  for (const tab of ["general", "content", "variants", "study"] as const) {
    const route = createViewRoute("kartenstapel", { focusedDeckId: "deck-1", selectedCardId: "card-1", cardEditorTab: tab });
    assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(route)), route);
  }
  assert.deepEqual(parseAppRouteFromUrl("/kartenstapel?deck=deck-1&card=card-1&cardTab=media"), fromTable);
  assert.equal("cardEditorTab" in createViewRoute("kartenstapel", { focusedDeckId: "deck-1", cardEditorTab: "study" }), false);
});
