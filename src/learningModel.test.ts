import assert from "node:assert/strict";
import test from "node:test";
import { createVariantReviewEvent } from "./coreModel/reviewState.ts";
import {
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
  normalizeLearningItem,
} from "./coreModel.ts";
import { createCoreLearningItem } from "./coreModel/learningItems.ts";

test("learning item normalization keeps variants and adds only one original variant", () => {
  const item = createCoreLearningItem({
    id: "item_multi",
    sourceType: "manual",
    canonicalQuestion: "Welche Aufgabe hat Myelin?",
    canonicalAnswer: "Myelin isoliert Axone.",
    tags: ["anatomie"],
    variants: [
      {
        id: "variant_transfer",
        learningItemId: "item_multi",
        variantType: "transfer",
        front: "Wende die Myelin-Funktion auf Leitungsgeschwindigkeit an.",
        back: "Isolation erhoeht die Leitungsgeschwindigkeit.",
        generationSource: "ai_generated",
        transformType: "rephrase",
        qualityStatus: "active",
      },
    ],
  });
  const normalizedAgain = normalizeLearningItem(item);
  const original = getOriginalVariant(normalizedAgain);
  const activeVariants = getActiveVariants(normalizedAgain);

  assert.equal(getLearningItemQuestion(normalizedAgain), "Welche Aufgabe hat Myelin?");
  assert.equal(getLearningItemAnswer(normalizedAgain), "Myelin isoliert Axone.");
  assert.equal(normalizedAgain.variants.length, item.variants.length);
  assert.equal(new Set(normalizedAgain.variants.map((variant) => variant.id)).size, normalizedAgain.variants.length);
  assert.ok(original);
  assert.equal(original.variantType, "basic");
  assert.ok(original);
  assert.equal(original.isOriginal, true);
  assert.equal(activeVariants.length, 1);
  assert.ok(original);
  assert.equal(activeVariants[0].anchorVariantId, original.id);
  assert.equal(getAnswerSideAnchorMiniCard(normalizedAgain, original).shouldShow, false);
});

test("variant review events keep append-only review compatibility fields", () => {
  const event = createVariantReviewEvent({
    deckId: "deck_1",
    learningItemId: "item_1",
    variantId: "variant_1",
    rating: "good",
    answeredAt: "2026-07-06T12:00:00.000Z",
  });

  assert.equal(event.deckId, "deck_1");
  assert.equal(event.learningItemId, "item_1");
  assert.equal(event.variantId, "variant_1");
  assert.equal(event.reviewableType, "variant");
  assert.equal(event.reviewableId, "variant_1");
  assert.equal(event.sourceCardId, "item_1");
  assert.equal(event.rating, "good");
});
