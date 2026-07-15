import assert from "node:assert/strict";
import test from "node:test";
import {
  appRouteToUrl,
  areAppRoutesEqual,
  createAppHistoryState,
  createStudyRoute,
  createViewRoute,
  parseAppRouteFromUrl,
  readAppRouteFromHistoryState,
} from "./appNavigation.ts";
import { createProductSurfaceRegistry } from "./productSurfaces.ts";

test("parses the default route from the root path", () => {
  assert.deepEqual(parseAppRouteFromUrl("/"), { mode: "view", viewId: "uebersicht" });
  assert.equal(appRouteToUrl({ mode: "view", viewId: "uebersicht" }), "/");
});

test("roundtrips known view paths and supported screen context", () => {
  const decks = ["deck_a", "deck_b"];
  const deckRoute = parseAppRouteFromUrl("/kartenstapel?deck=deck_a", { validDeckIds: decks });
  const deckSettingsRoute = parseAppRouteFromUrl("/stapel-einstellungen?deck=deck_b", { validDeckIds: decks });
  const creationRoute = parseAppRouteFromUrl("/lernen?parent=deck_b", { validDeckIds: decks });
  const creationMethodRoute = parseAppRouteFromUrl("/neue-karten?method=manual&done=deck_new", { validDeckIds: decks });

  assert.deepEqual(deckRoute, { mode: "view", viewId: "kartenstapel", focusedDeckId: "deck_a" });
  assert.deepEqual(deckSettingsRoute, { mode: "view", viewId: "stapel-einstellungen", focusedDeckId: "deck_b" });
  assert.deepEqual(creationRoute, { mode: "view", viewId: "lernen", deckCreationParentId: "deck_b" });
  assert.deepEqual(creationMethodRoute, { mode: "view", viewId: "neue-karten", creationMethod: "manual", completedDeckId: "deck_new" });
  assert.equal(appRouteToUrl(deckRoute), "/kartenstapel?deck=deck_a");
  assert.equal(appRouteToUrl(deckSettingsRoute), "/stapel-einstellungen?deck=deck_b");
  assert.equal(appRouteToUrl(creationRoute), "/lernen?parent=deck_b");
  assert.equal(appRouteToUrl(creationMethodRoute), "/neue-karten?method=manual&done=deck_new");
});

test("falls back to today for unknown paths", () => {
  assert.deepEqual(parseAppRouteFromUrl("/does-not-exist"), { mode: "view", viewId: "uebersicht" });
});

test("accepts labs routes only with an enabled product-surface registry", () => {
  const labsRegistry = createProductSurfaceRegistry({ VITE_ENABLE_LABS: "true" });

  assert.deepEqual(parseAppRouteFromUrl("/graph"), { mode: "view", viewId: "uebersicht" });
  assert.deepEqual(parseAppRouteFromUrl("/graph", { surfaceRegistry: labsRegistry }), { mode: "view", viewId: "graph" });
  assert.equal(appRouteToUrl(createViewRoute("community", {}, { surfaceRegistry: labsRegistry }), { surfaceRegistry: labsRegistry }), "/community");
});

test("roundtrips review routes with encoded deck ids and variant sessions", () => {
  const route = parseAppRouteFromUrl("/decks/deck%2Fspecial/review?variant=1", { validDeckIds: ["deck/special"] });

  assert.deepEqual(route, {
    mode: "study",
    deckId: "deck/special",
    variantSession: true,
    returnRoute: { mode: "view", viewId: "lernen" },
  });
  assert.equal(appRouteToUrl(route), "/decks/deck%2Fspecial/review?variant=1");
});

test("normalizes invalid study routes back to learning", () => {
  assert.deepEqual(parseAppRouteFromUrl("/decks/missing/review", { validDeckIds: ["deck_a"] }), { mode: "view", viewId: "lernen" });
  assert.deepEqual(createStudyRoute("", {}, { validDeckIds: ["deck_a"] }), { mode: "view", viewId: "lernen" });
});

test("stores and reads app routes from browser history state", () => {
  const labsRegistry = createProductSurfaceRegistry({ DEV: true });
  const route = createViewRoute("assistent", {}, { surfaceRegistry: labsRegistry });
  const state = createAppHistoryState(route, { currentState: { external: "kept" }, surfaceRegistry: labsRegistry });

  assert.equal(state.external, "kept");
  assert.deepEqual(readAppRouteFromHistoryState(state, { surfaceRegistry: labsRegistry }), route);
  assert.equal(areAppRoutesEqual(state.coreAppRoute, route, { surfaceRegistry: labsRegistry }), true);
});
