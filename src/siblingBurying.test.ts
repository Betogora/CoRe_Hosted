import assert from "node:assert/strict";
import test from "node:test";
import { buriesSiblings, createSiblingBurying, type SiblingBuryMode } from "./siblingBurying.ts";

const OFF: SiblingBuryMode = { buryNewSiblings: false, buryReviewSiblings: false, buryInterdayLearningSiblings: false };
const modes: Record<string, SiblingBuryMode> = {
  off: OFF,
  "new-only": { ...OFF, buryNewSiblings: true },
  all: { buryNewSiblings: true, buryReviewSiblings: true, buryInterdayLearningSiblings: true },
};

test("the options of the sibling seen first decide; the card itself only adds its own options", () => {
  const burying = createSiblingBurying((deckId) => modes[deckId]);
  assert.equal(burying.buries({ id: "a", noteId: "n", deckId: "off" }, "review"), false, "Die erste Karte eines Inhalts wartet nie.");
  assert.equal(burying.buries({ id: "b", noteId: "n", deckId: "all" }, "new"), false, "Der zuvor gesehene Stapel begräbt nicht.");
  assert.equal(burying.buries({ id: "c", noteId: "n", deckId: "off" }, "new"), true, "Jetzt hat ein gesehener Stapel Begraben an.");
  assert.equal(buriesSiblings(modes.off), false);
  assert.equal(buriesSiblings(modes["new-only"]), true);
});

test("today's answers bury by kind, never the answered card itself, and counting does not mark cards seen", () => {
  const burying = createSiblingBurying((deckId) => modes[deckId]);
  burying.answered("a", "n", "new-only");
  assert.deepEqual(burying.buryingNoteIds(), ["n"]);
  assert.equal(burying.buriedBySeen({ id: "b", noteId: "n" }, "new"), true);
  assert.equal(burying.buriedBySeen({ id: "b", noteId: "n" }, "review"), false);
  assert.equal(burying.buriedBySeen({ id: "b", noteId: "n" }, "interday-learning"), false);
  assert.equal(burying.buriedBySeen({ id: "a", noteId: "n" }, "new"), false, "Eine heute beantwortete Karte wartet nicht auf sich selbst.");
  assert.equal(burying.buriedBySeen({ id: "x", noteId: "other" }, "new"), false);
  assert.deepEqual(burying.buryingNoteIds(), ["n"]);

  const quiet = createSiblingBurying((deckId) => modes[deckId]);
  quiet.answered("a", "n", "off");
  assert.deepEqual(quiet.buryingNoteIds(), [], "Ohne Option werden keine Geschwister nachgeladen.");
});
