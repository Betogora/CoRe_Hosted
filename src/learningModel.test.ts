import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem, getActiveVariants, getAnswerSideAnchorMiniCard } from "./coreModel.ts";

test("aktive KI-Umformulierungen bleiben der Karte untergeordnet", () => {
  const card = addRephrasedVariant(createBasicLearningItem("deck", "Q", "A"), "Q2", "A2");
  assert.equal(getActiveVariants(card).length, 1);
  assert.equal(getAnswerSideAnchorMiniCard(card, card.variants[0]).shouldShow, true);
  assert.equal(getAnswerSideAnchorMiniCard(card, null).shouldShow, false);
});
