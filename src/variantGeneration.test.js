import assert from "node:assert/strict";
import test from "node:test";
import {
  addRephrasedVariant,
  createBasicLearningItem,
  createCoreDeck,
  getActiveVariants,
  getOriginalVariant,
} from "./coreModel.js";
import {
  buildCardVariationPrompt,
  generateRephrasedVariantsForLearningItem,
  parseVariantGenerationResponse,
  validateVariantSuggestion,
} from "./coreVariantService.js";
import { getNextReviewItem } from "./reviewService.js";

function createDeckWithItem(item) {
  return createCoreDeck({
    id: "deck_variants",
    name: "Variant Deck",
    source: "manual",
    cards: [item],
    reviewEvents: [],
  });
}

function nearVariantResponse() {
  return JSON.stringify({
    variants: [
      {
        front: "Wofuer steht die Abkuerzung MRSA?",
        back: "Methicillin-resistenter Staphylococcus aureus.",
        variantType: "basic",
        variantLevel: 2,
        relationToOriginal: "same_card_rephrasing",
        containsNewFacts: false,
        abstractionLevel: 1,
        reason: "Die Frage prueft dieselbe ausgeschriebene Bedeutung.",
      },
    ],
  });
}

test("card variation prompt keeps AI generation close to the original card", () => {
  const item = createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.");
  const prompt = buildCardVariationPrompt(item, {
    numberOfVariants: 2,
    language: "de",
    allowedVariantTypes: ["basic", "reverse"],
  });

  assert.match(prompt, /Was bedeutet MRSA/);
  assert.match(prompt, /Methicillin-resistenter Staphylococcus aureus/);
  assert.match(prompt, /keine neuen Fakten/);
  assert.match(prompt, /keine Transferfragen/);
  assert.match(prompt, /keine Fallbeispiele/);
  assert.match(prompt, /ausschliesslich valides JSON/);
  assert.match(prompt, /Erzeuge 2 neue Varianten/);
  assert.match(prompt, /Sprache: de/);
  assert.match(prompt, /basic, reverse/);
});

test("variant response parser accepts valid JSON and reports invalid JSON clearly", () => {
  const item = createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.");
  const parsed = parseVariantGenerationResponse(nearVariantResponse(), { originalItem: item });
  const invalid = parseVariantGenerationResponse("keine json antwort");

  assert.equal(parsed.variants.length, 1);
  assert.equal(parsed.variants[0].generationSource, "ai_generated");
  assert.equal(parsed.skippedVariants.length, 0);
  assert.equal(invalid.variants.length, 0);
  assert.match(invalid.errors[0], /kein gueltiges JSON/);
});

test("variant validation rejects empty, new-fact and transfer-like suggestions by default", () => {
  const item = createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.");
  const missingFront = parseVariantGenerationResponse(
    JSON.stringify({ variants: [{ back: "Methicillin-resistenter Staphylococcus aureus.", variantType: "basic" }] }),
    { originalItem: item },
  );
  const newFacts = validateVariantSuggestion(
    {
      front: "Wie behandelt man MRSA?",
      back: "Mit Antibiotika nach Resistogramm.",
      variantType: "basic",
      relationToOriginal: "same_card_rephrasing",
      containsNewFacts: true,
      abstractionLevel: 1,
    },
    item,
  );
  const transfer = validateVariantSuggestion(
    {
      front: "Vergleiche MRSA mit VRE.",
      back: "Beide sind resistente Erreger.",
      variantType: "transfer",
      relationToOriginal: "related_transfer",
      containsNewFacts: false,
      abstractionLevel: 3,
    },
    item,
  );

  assert.equal(missingFront.variants.length, 0);
  assert.match(missingFront.skippedVariants[0].errors.join(" "), /front fehlt/);
  assert.equal(newFacts.valid, false);
  assert.match(newFacts.errors.join(" "), /containsNewFacts/);
  assert.equal(transfer.valid, false);
  assert.match(transfer.errors.join(" "), /same_card_rephrasing|standardmaessig/);
});

test("mock AI generation stores anchored near rephrase variants without variant scheduler state", () => {
  const item = createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.");
  const original = getOriginalVariant(item);
  const result = generateRephrasedVariantsForLearningItem(item, {
    mockResponse: nearVariantResponse(),
    style: "exam_precise",
  });
  const created = result.createdVariants[0];

  assert.equal(result.createdVariants.length, 1);
  assert.equal(created.generationSource, "ai_generated");
  assert.equal(created.isOriginal, false);
  assert.equal(created.anchorVariantId, original.id);
  assert.equal(created.parentVariantId, original.id);
  assert.equal(created.reviewState, null);
  assert.equal(created.meta.relationToOriginal, "same_card_rephrasing");
  assert.match(result.promptUsed, /Prompt-Version: card-variation-near-rephrase-v1/);
});

test("automatic variant selection stays near, active and anchored to the original", () => {
  const newItem = addRephrasedVariant(
    createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
      reviewState: { state: "new", dueAt: "2026-07-01T08:00:00.000Z" },
    }),
    "Wofuer steht MRSA?",
    "Methicillin-resistenter Staphylococcus aureus.",
    { variantLevel: 1, generationSource: "ai_generated" },
  );
  const learningItem = addRephrasedVariant(
    createBasicLearningItem("deck_variants", "Was bedeutet ATP?", "Adenosintriphosphat.", {
      reviewState: { state: "learning", repetitions: 1, preferredVariantLevel: 2, dueAt: "2026-07-01T08:00:00.000Z" },
    }),
    "Wofuer steht ATP?",
    "Adenosintriphosphat.",
    { variantLevel: 2, generationSource: "ai_generated" },
  );
  let reviewItem = createBasicLearningItem("deck_variants", "Welche Aufgabe hat Myelin?", "Myelin isoliert Axone.", {
    reviewState: { state: "review", repetitions: 4, lastRating: "good", preferredVariantLevel: 3, dueAt: "2026-07-01T08:00:00.000Z" },
  });
  reviewItem = addRephrasedVariant(reviewItem, "Was macht Myelin an Axonen?", "Myelin isoliert Axone.", { variantLevel: 1, generationSource: "ai_generated" });
  reviewItem = addRephrasedVariant(reviewItem, "Welche Wirkung hat Myelin auf Axone?", "Myelin isoliert Axone.", { variantLevel: 2, generationSource: "ai_generated" });
  reviewItem = addRephrasedVariant(reviewItem, "Pruefungsnah: Welche Funktion hat Myelin?", "Myelin isoliert Axone.", { variantLevel: 3, generationSource: "ai_generated" });
  let againItem = createBasicLearningItem("deck_variants", "Was ist Insulin?", "Ein blutzuckersenkendes Hormon.", {
    reviewState: { state: "relearning", repetitions: 5, lastRating: "again", preferredVariantLevel: 3, dueAt: "2026-07-01T08:00:00.000Z" },
  });
  againItem = addRephrasedVariant(againItem, "Was beschreibt Insulin?", "Ein blutzuckersenkendes Hormon.", { variantLevel: 1, generationSource: "ai_generated" });
  const transferOnly = addRephrasedVariant(
    createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
      reviewState: { state: "review", repetitions: 3, lastRating: "good", preferredVariantLevel: 3, dueAt: "2026-07-01T08:00:00.000Z" },
    }),
    "Wie behandelt man eine MRSA-Sepsis?",
    "Mit Antibiotika nach Resistogramm.",
    { variantType: "transfer", variantLevel: 3, generationSource: "ai_generated" },
  );
  const inactiveOnly = addRephrasedVariant(
    createBasicLearningItem("deck_variants", "Was ist Glukagon?", "Ein blutzuckersteigerndes Hormon.", {
      reviewState: { state: "review", repetitions: 3, preferredVariantLevel: 3, dueAt: "2026-07-01T08:00:00.000Z" },
    }),
    "Welche Wirkung hat Glukagon?",
    "Es steigert den Blutzucker.",
    { variantLevel: 2, generationSource: "ai_generated", qualityStatus: "disabled", isActive: false },
  );

  const now = "2026-07-06T10:00:00.000Z";
  const newNext = getNextReviewItem(createDeckWithItem(newItem), { now });
  const learningNext = getNextReviewItem(createDeckWithItem(learningItem), { now });
  const reviewNext = getNextReviewItem(createDeckWithItem(reviewItem), { now });
  const againNext = getNextReviewItem(createDeckWithItem(againItem), { now });
  const transferNext = getNextReviewItem(createDeckWithItem(transferOnly), { now });
  const inactiveNext = getNextReviewItem(createDeckWithItem(inactiveOnly), { now });

  assert.equal(newNext.variant.isOriginal, true);
  assert.equal(learningNext.variant.isOriginal || Number(learningNext.variant.variantLevel) <= 2, true);
  assert.equal(reviewNext.variant.isOriginal, false);
  assert.equal(Number(reviewNext.variant.variantLevel) >= 2 && Number(reviewNext.variant.variantLevel) <= 3, true);
  assert.equal(againNext.variant.isOriginal || Number(againNext.variant.variantLevel) <= 1, true);
  assert.equal(transferNext.variant.isOriginal, true);
  assert.equal(inactiveNext.variant.isOriginal, true);
  assert.equal(getActiveVariants(inactiveOnly).length, 0);
});

test("answer side mini anchor is included for generated rephrase variants only", () => {
  const item = generateRephrasedVariantsForLearningItem(
    createBasicLearningItem("deck_variants", "Was bedeutet MRSA?", "Methicillin-resistenter Staphylococcus aureus.", {
      reviewState: { state: "review", repetitions: 3, lastRating: "good", preferredVariantLevel: 3, dueAt: "2026-07-01T08:00:00.000Z" },
    }),
    { mockResponse: nearVariantResponse() },
  ).learningItem;
  const next = getNextReviewItem(createDeckWithItem(item), { now: "2026-07-06T10:00:00.000Z" });
  const originalNext = getNextReviewItem(createDeckWithItem(createBasicLearningItem("deck_variants", "Was ist ATP?", "Adenosintriphosphat.")), {
    now: "2026-07-06T10:00:00.000Z",
  });

  assert.equal(next.variant.isOriginal, false);
  assert.equal(next.answerSideAnchorMiniCard.shouldShow, true);
  assert.equal(next.answerSideAnchorMiniCard.variantId, getOriginalVariant(item).id);
  assert.equal(originalNext.variant.isOriginal, true);
  assert.equal(originalNext.answerSideAnchorMiniCard.shouldShow, false);
});
