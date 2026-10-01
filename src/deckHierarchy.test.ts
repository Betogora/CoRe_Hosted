import assert from "node:assert/strict";
import test from "node:test";
import { getVisibleDeckDepth, MAX_VISIBLE_DECK_LEVELS } from "./deckHierarchy.ts";

test("visible deck depth keeps six levels and caps every deeper logical level", () => {
  assert.equal(MAX_VISIBLE_DECK_LEVELS, 6);
  for (let depth = 0; depth < MAX_VISIBLE_DECK_LEVELS; depth += 1) {
    assert.equal(getVisibleDeckDepth(depth), depth);
  }
  for (const depth of [6, 7, 11, 100_000]) assert.equal(getVisibleDeckDepth(depth), 5);
});

test("visible deck depth normalizes invalid lower and fractional values", () => {
  assert.equal(getVisibleDeckDepth(-1), 0);
  assert.equal(getVisibleDeckDepth(3.9), 3);
});
