import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem } from "./coreModel.ts";
import { buildCardVariationPrompt, generateRephrasedVariantsForLearningItem, parseVariantGenerationResponse } from "./coreVariantService.ts";

test("der KI-Prompt fordert ausschließlich Umformulierungen derselben Karte", () => {
  const prompt = buildCardVariationPrompt(createBasicLearningItem("deck", "Was ist ATP?", "Ein Energieträger."));
  assert.match(prompt, /Umformulier/i);
});

test("generierte Umformulierungen bleiben terminlose Kindvarianten", () => {
  const card = createBasicLearningItem("deck", "Was ist ATP?", "Ein Energieträger.");
  const generated = generateRephrasedVariantsForLearningItem(card, {
    mockResponse: [{ front: "Wofür steht ATP?", back: "Für einen Energieträger.", variantType: "basic", variantLevel: 2 }],
  });
  assert.equal(generated.card.variants.length, 1);
  assert.equal(generated.card.variants[0].cardId, card.id);
  assert.equal("reviewState" in generated.card.variants[0], false);
  assert.equal(generated.card.variants[0].meta.sourceContentHash, card.contentHash);
});

test("Antwortparser lehnt zusätzliche Fakten ab", () => {
  const parsed = parseVariantGenerationResponse([{ front: "Q2", back: "A2", containsNewFacts: true }]);
  assert.equal(parsed.variants.length, 0);
  assert.equal(parsed.skippedVariants.length, 1);
});
