import assert from "node:assert/strict";
import test from "node:test";
import {
  CardEditorValidationError,
  createLearningItemFromEditorValue,
  createReviewState,
  getCardEditorValue,
  getOriginalVariant,
  restoreCardVersion,
  saveCardEditorValue,
  validateCardEditorValue,
} from "../coreModel.ts";
import type { CardVariant, LearningItem } from "../coreTypes.ts";

function originalCount(card: LearningItem): number {
  return card.variants.filter((variant) => variant.isOriginal).length;
}

test("card editor validates the discriminated contract for all four card types", () => {
  assert.equal(validateCardEditorValue({ cardType: "basic", front: "Frage", back: "Antwort", tags: [] }).ok, true);
  assert.equal(validateCardEditorValue({ cardType: "basic-reversed", front: "Frage", back: "Antwort", tags: [] }).ok, true);
  assert.equal(validateCardEditorValue({ cardType: "cloze", textWithClozes: "{{c1::ATP}} liefert Energie.", extra: "", tags: [] }).ok, true);
  assert.equal(validateCardEditorValue({ cardType: "multiple-choice", question: "Frage", options: ["A", "B"], correctOptionIndex: 1, explanation: "", tags: [] }).ok, true);

  const invalidCloze = validateCardEditorValue({ cardType: "cloze", textWithClozes: "{{c1::ATP}", extra: "", tags: [] });
  const invalidMc = validateCardEditorValue({ cardType: "multiple-choice", question: "Frage", options: ["A", "A"], correctOptionIndex: 4, explanation: "", tags: [] });
  assert.equal(invalidCloze.ok, false);
  assert.equal(invalidMc.ok, false);
  if (!invalidCloze.ok) assert.match(invalidCloze.errors.textWithClozes ?? "", /gültige Lücken/);
  if (!invalidMc.ok) {
    assert.match(invalidMc.errors.options ?? "", /eindeutig/);
    assert.match(invalidMc.errors.correctOptionIndex ?? "", /richtige Antwort/);
  }
});

test("basic editor save preserves anchors, media, immutable original and review state", () => {
  const created = createLearningItemFromEditorValue("deck-1", {
    cardType: "basic",
    front: "Alte Frage",
    back: "Alte Antwort",
    tags: ["alt"],
  }, {
    mediaRefs: ["media-1"],
  });
  const original = {
    ...created,
    sourceAnchors: [{ id: "anchor-1", documentId: null, documentName: "Quelle", cardId: created.id, variantId: created.variants.find((variant) => variant.isOriginal)!.id, textQuote: "Zitat", targetField: "front", pageNumber: null, charStart: null, charEnd: null, bbox: null, confidence: 1, createdAt: "2026-07-16T00:00:00.000Z" }],
  };
  const reviewState = original.reviewState;
  const saved = saveCardEditorValue(original, {
    cardType: "basic",
    front: "<p>Neue Frage</p>",
    back: "<p>Neue Antwort</p>",
    tags: ["neu"],
  });

  assert.equal(saved.originalFront, "<p>Neue Frage</p>");
  assert.deepEqual(saved.tags, ["neu"]);
  assert.deepEqual(saved.mediaRefs, original.mediaRefs);
  assert.deepEqual(saved.sourceAnchors, original.sourceAnchors);
  assert.deepEqual(saved.reviewState, reviewState);
  assert.deepEqual(saved.immutableOriginal, original.immutableOriginal);
  assert.equal(originalCount(saved), 1);
  assert.equal(saved.versionLog.at(-1)?.changeType, "content_updated");
});

test("reverse editor save updates one active reverse direction and preserves its review identity", () => {
  const original = createLearningItemFromEditorValue("deck-1", {
    cardType: "basic-reversed",
    front: "Vorne alt",
    back: "Hinten alt",
    tags: [],
  });
  const reverse = original.variants.find((variant) => !variant.isOriginal && variant.variantType === "reverse");
  assert.ok(reverse);
  const reviewedReverse = {
    ...reverse,
    reviewState: createReviewState({ learningItemId: original.id, reviewableType: "variant", reviewableId: reverse.id, repetitions: 4 }),
  } as CardVariant;
  const card = { ...original, variants: original.variants.map((variant) => variant.id === reverse.id ? reviewedReverse : variant) };
  const saved = saveCardEditorValue(card, {
    cardType: "basic-reversed",
    front: "Vorne neu",
    back: "Hinten neu",
    tags: [],
  });
  const activeReverse = saved.variants.filter((variant) => !variant.isOriginal && variant.variantType === "reverse" && variant.isActive);

  assert.equal(activeReverse.length, 1);
  assert.equal(activeReverse[0].id, reverse.id);
  assert.equal(activeReverse[0].front, "Hinten neu");
  assert.equal(activeReverse[0].back, "Vorne neu");
  assert.equal(activeReverse[0].reviewState?.repetitions, 4);
  assert.equal(originalCount(saved), 1);
});

test("cloze editor save keeps compatible groups, disables removed gaps and adds current gaps", () => {
  const original = createLearningItemFromEditorValue("deck-1", {
    cardType: "cloze",
    textWithClozes: "{{c1::ATP}} und {{c2::ADP}}",
    extra: "Energie",
    tags: [],
  });
  const c1 = original.variants.find((variant) => Number(variant.meta.clozeGroup) === 1);
  const c2 = original.variants.find((variant) => Number(variant.meta.clozeGroup) === 2);
  assert.ok(c1);
  assert.ok(c2);
  const saved = saveCardEditorValue(original, {
    cardType: "cloze",
    textWithClozes: "{{c1::ATP neu}} und {{c3::AMP}}",
    extra: "Neue Zusatzinfo",
    tags: [],
  });
  const activeGroups = saved.variants
    .filter((variant) => !variant.isOriginal && variant.isActive)
    .map((variant) => Number(variant.meta.clozeGroup))
    .sort();
  const nextC1 = saved.variants.find((variant) => Number(variant.meta.clozeGroup) === 1);
  const nextC2 = saved.variants.find((variant) => Number(variant.meta.clozeGroup) === 2);

  assert.deepEqual(activeGroups, [1, 3]);
  assert.equal(nextC1?.id, c1.id);
  assert.equal(nextC2?.id, c2.id);
  assert.equal(nextC2?.isActive, false);
  assert.equal(nextC2?.qualityStatus, "disabled");
  assert.equal(originalCount(saved), 1);
});

test("multiple-choice save projects one structured correct option into review content", () => {
  const original = createLearningItemFromEditorValue("deck-1", {
    cardType: "multiple-choice",
    question: "Alte Frage",
    options: ["A", "B", "C"],
    correctOptionIndex: 0,
    explanation: "Alt",
    tags: [],
  });
  const saved = saveCardEditorValue(original, {
    cardType: "multiple-choice",
    question: "Neue Frage",
    options: ["A neu", "B neu", "C neu"],
    correctOptionIndex: 2,
    explanation: "<p>Neue Erklärung</p>",
    tags: ["mc"],
  });
  const originalVariant = getOriginalVariant(saved);

  assert.ok(originalVariant);
  assert.deepEqual(originalVariant.answerOptionsJson, ["A neu", "B neu", "C neu"]);
  assert.equal(originalVariant.expectedAnswerJson, "C neu");
  assert.equal(saved.meta.correctAnswer, "C neu");
  assert.match(saved.originalBack, /Richtige Antwort:<\/strong> C neu/);
  assert.match(saved.originalBack, /Neue Erklärung/);
  assert.deepEqual(getCardEditorValue(saved), {
    cardType: "multiple-choice",
    question: "Neue Frage",
    options: ["A neu", "B neu", "C neu"],
    correctOptionIndex: 2,
    explanation: "<p>Neue Erklärung</p>",
    tags: ["mc"],
  });
});

test("failed editor save is atomic and leaves the previous card unchanged", () => {
  const card = createLearningItemFromEditorValue("deck-1", { cardType: "basic", front: "Frage", back: "Antwort", tags: [] });
  const snapshot = structuredClone(card);

  assert.throws(
    () => saveCardEditorValue(card, { cardType: "basic", front: "", back: "Antwort", tags: [] }),
    CardEditorValidationError,
  );
  assert.deepEqual(card, snapshot);
});

test("version restore restores the complete structured editor value", () => {
  const original = createLearningItemFromEditorValue("deck-1", {
    cardType: "multiple-choice",
    question: "Welche Antwort?",
    options: ["Alt A", "Alt B"],
    correctOptionIndex: 0,
    explanation: "Alte Erklärung",
    tags: ["alt"],
  });
  const saved = saveCardEditorValue(original, {
    cardType: "multiple-choice",
    question: "Welche neue Antwort?",
    options: ["Neu A", "Neu B", "Neu C"],
    correctOptionIndex: 2,
    explanation: "Neue Erklärung",
    tags: ["neu"],
  });
  const versionId = saved.versionLog.at(-1)?.id;
  assert.ok(versionId);

  const restored = restoreCardVersion(saved, versionId);

  assert.deepEqual(getCardEditorValue(restored), {
    cardType: "multiple-choice",
    question: "Welche Antwort?",
    options: ["Alt A", "Alt B"],
    correctOptionIndex: 0,
    explanation: "Alte Erklärung",
    tags: ["alt"],
  });
  assert.equal(restored.versionLog.at(-1)?.changeType, "version_restored");
});
