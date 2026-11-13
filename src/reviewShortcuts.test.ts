import assert from "node:assert/strict";
import test from "node:test";
import { resolveReviewShortcut } from "./reviewShortcuts.ts";

const question = { hasCurrent: true, showAnswer: false };
const answer = { hasCurrent: true, showAnswer: true };

test("review keys follow Anki: Space/Enter reveal and then rate Gut, only 1–4 rate", () => {
  assert.deepEqual(resolveReviewShortcut({ key: " " }, question), { type: "reveal" });
  assert.deepEqual(resolveReviewShortcut({ key: "Enter" }, question), { type: "reveal" });
  assert.deepEqual(resolveReviewShortcut({ key: " " }, answer), { type: "rate", rating: "good" });
  assert.deepEqual(resolveReviewShortcut({ key: "Enter" }, answer), { type: "rate", rating: "good" });
  assert.deepEqual(["1", "2", "3", "4"].map((key) => resolveReviewShortcut({ key }, answer)), ["again", "hard", "good", "easy"].map((rating) => ({ type: "rate", rating })));
  assert.equal(resolveReviewShortcut({ key: "3" }, question), null);
  for (const key of ["a", "h", "g"]) assert.equal(resolveReviewShortcut({ key }, answer), null, key);
});

test("E edits the card, U and Ctrl/Cmd+Z take back the last rating even after the last card", () => {
  assert.deepEqual(resolveReviewShortcut({ key: "e" }, answer), { type: "edit" });
  assert.deepEqual(resolveReviewShortcut({ key: "E" }, question), { type: "edit" });
  assert.deepEqual(resolveReviewShortcut({ key: "u" }, question), { type: "undo" });
  assert.deepEqual(resolveReviewShortcut({ key: "z", ctrlKey: true }, answer), { type: "undo" });
  assert.deepEqual(resolveReviewShortcut({ key: "z", metaKey: true }, { hasCurrent: false }), { type: "undo" });
  assert.equal(resolveReviewShortcut({ key: "e" }, { hasCurrent: false }), null);
  assert.equal(resolveReviewShortcut({ key: "z", ctrlKey: true, shiftKey: true }, answer), null);
  assert.equal(resolveReviewShortcut({ key: "1", ctrlKey: true }, answer), null);
});

test("keys typed into fields and buttons stay theirs", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "BUTTON"]) {
    assert.equal(resolveReviewShortcut({ key: "z", ctrlKey: true, target: { tagName } }, answer), null, tagName);
    assert.equal(resolveReviewShortcut({ key: "e", target: { tagName } }, answer), null, tagName);
  }
  assert.equal(resolveReviewShortcut({ key: "u", target: { isContentEditable: true } }, answer), null);
});
