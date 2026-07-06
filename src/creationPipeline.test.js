import assert from "node:assert/strict";
import test from "node:test";
import {
  addRephrasedVariant,
  createBasicLearningItem,
  createBasicReverseLearningItem,
  createClozeLearningItem,
  createLearningItemsFromNormalizedInput,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getOriginalVariant,
} from "./coreModel.js";

test("createBasicLearningItem creates a learning item with exactly one original variant", () => {
  const item = createBasicLearningItem("deck_1", "Was ist ATP?", "Ein kurzfristiger Energietraeger.", {
    tags: ["biochemie"],
    concepts: ["energie"],
  });
  const original = getOriginalVariant(item);

  assert.equal(item.deckId, "deck_1");
  assert.equal(item.canonicalQuestion, "Was ist ATP?");
  assert.equal(item.canonicalAnswer, "Ein kurzfristiger Energietraeger.");
  assert.equal(item.originalFront, "Was ist ATP?");
  assert.equal(item.originalBack, "Ein kurzfristiger Energietraeger.");
  assert.equal(item.learningItemState.reviewableId, item.id);
  assert.equal(item.reviewState.learningItemId, item.id);
  assert.equal(item.variants.filter((variant) => variant.isOriginal).length, 1);
  assert.equal(original.isOriginal, true);
  assert.equal(original.generationSource, "original");
  assert.equal(original.variantType, "basic");
  assert.equal(original.variantLevel, 1);
  assert.equal(original.front, "Was ist ATP?");
  assert.equal(original.back, "Ein kurzfristiger Energietraeger.");
  assert.equal(original.reviewState, null);
  assert.equal(getActiveVariants(item).length, 0);
  assert.equal(getAnswerSideAnchorMiniCard(item, original).shouldShow, false);
});

test("createBasicReverseLearningItem keeps one original and anchors the reverse variant", () => {
  const item = createBasicReverseLearningItem("deck_1", "ATP", "Energietraeger");
  const original = getOriginalVariant(item);
  const reverse = getActiveVariants(item).find((variant) => variant.variantType === "reverse");
  const miniCard = getAnswerSideAnchorMiniCard(item, reverse);

  assert.equal(item.variants.filter((variant) => variant.isOriginal).length, 1);
  assert.ok(reverse);
  assert.equal(reverse.learningItemId, item.id);
  assert.equal(reverse.cardId, item.id);
  assert.equal(reverse.isOriginal, false);
  assert.equal(reverse.front, "Energietraeger");
  assert.equal(reverse.back, "ATP");
  assert.equal(reverse.anchorVariantId, original.id);
  assert.equal(reverse.parentVariantId, original.id);
  assert.equal(reverse.reviewState, null);
  assert.equal(miniCard.shouldShow, true);
  assert.equal(miniCard.front, original.front);
  assert.equal(miniCard.back, original.back);
});

test("createClozeLearningItem creates anchored cloze variants for multiple groups", () => {
  const item = createClozeLearningItem(
    "deck_1",
    "{{c1::ATP}} liefert Energie fuer {{c2::Muskelkontraktion}}.",
    "Extra: Kurzfristiger Energietraeger.",
  );
  const original = getOriginalVariant(item);
  const clozeVariants = getActiveVariants(item).filter((variant) => variant.variantType === "cloze");

  assert.equal(item.kind, "cloze");
  assert.equal(item.variants.filter((variant) => variant.isOriginal).length, 1);
  assert.equal(clozeVariants.length, 2);
  assert.equal(clozeVariants.every((variant) => variant.learningItemId === item.id), true);
  assert.equal(clozeVariants.every((variant) => variant.anchorVariantId === original.id), true);
  assert.equal(clozeVariants.every((variant) => variant.parentVariantId === original.id), true);
  assert.match(clozeVariants[0].front, /\[\.\.\.\]/);
});

test("addRephrasedVariant appends an anchored active variant without replacing item state", () => {
  const item = createBasicLearningItem("deck_1", "Welche Aufgabe hat Myelin?", "Myelin isoliert Axone.", {
    reviewState: {
      maturityXp: 80,
      repetitions: 3,
    },
  });
  const original = getOriginalVariant(item);
  const updated = addRephrasedVariant(item, "Warum beschleunigt Myelin die Leitung?", "Durch elektrische Isolation der Axone.");
  const newVariant = getActiveVariants(updated).find((variant) => variant.front.includes("beschleunigt"));
  const miniCard = getAnswerSideAnchorMiniCard(updated, newVariant);

  assert.equal(updated.id, item.id);
  assert.equal(updated.learningItemState.maturityXp, 80);
  assert.equal(updated.learningItemState.repetitions, 3);
  assert.ok(newVariant);
  assert.equal(newVariant.isOriginal, false);
  assert.equal(newVariant.generationSource, "user_edited");
  assert.equal(newVariant.anchorVariantId, original.id);
  assert.equal(newVariant.reviewState, null);
  assert.equal(getActiveVariants(updated).includes(newVariant), true);
  assert.equal(miniCard.shouldShow, true);
  assert.equal(miniCard.variantId, original.id);
});

test("createLearningItemsFromNormalizedInput uses the pipeline and anchors non-original variants", () => {
  const result = createLearningItemsFromNormalizedInput("deck_import", [
    {
      canonicalQuestion: "Definition Diffusion",
      canonicalAnswer: "Teilchen bewegen sich entlang eines Konzentrationsgradienten.",
      tags: ["physio"],
      variants: [
        {
          front: "Was bedeutet Diffusion?",
          back: "Bewegung entlang eines Konzentrationsgradienten.",
        },
        {
          variantType: "basic",
          front: "Beschreibe Diffusion in einem Satz.",
          back: "Teilchen verteilen sich entlang ihres Gradienten.",
        },
      ],
    },
    {
      canonicalQuestion: "",
      canonicalAnswer: "",
    },
  ], {
    source: "csv-import",
    sourceType: "mixed",
  });
  const item = result.createdItems[0];
  const original = getOriginalVariant(item);
  const importedVariant = getActiveVariants(item)[0];

  assert.equal(result.createdItems.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(item.deckId, "deck_import");
  assert.equal(item.canonicalQuestion, "Definition Diffusion");
  assert.equal(original.front, "Was bedeutet Diffusion?");
  assert.equal(original.back, "Bewegung entlang eines Konzentrationsgradienten.");
  assert.equal(importedVariant.anchorVariantId, original.id);
  assert.equal(importedVariant.generationSource, "imported");
});
