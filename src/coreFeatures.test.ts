import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem } from "./coreModel.ts";
import { classifyCardEligibility, getVariantCoverage } from "./coreVariantService.ts";

test("KI-Varianten sind reine Darstellungen derselben Karte", () => {
  const card = addRephrasedVariant(createBasicLearningItem("deck", "Q", "A"), "Q2", "A2");
  assert.equal(classifyCardEligibility(card, { coreMode: "adaptive" }).eligible, true);
  assert.equal(getVariantCoverage(card).activeRephraseCount, 1);
  assert.equal(card.variants[0].cardId, card.id);
});
