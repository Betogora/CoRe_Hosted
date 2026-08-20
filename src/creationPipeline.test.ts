import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem, createCoreNoteTypeDefinition, createLearningItemsFromNormalizedInput } from "./coreModel.ts";
import { createBasicReverseLearningItems, createClozeLearningItems } from "./coreModel/creation.ts";

function assertProjectionRecipeExists(card: ReturnType<typeof createBasicLearningItem>) {
  const definition = createCoreNoteTypeDefinition({
    document: card.contentDocument,
    kind: card.kind === "cloze" ? "cloze" : "normal",
  });
  assert.equal(definition.recipes.some((recipe) => recipe.id === card.projection.recipeId), true);
}

test("eine Basic-Karte besitzt ihren Lernstatus direkt und keine Originalvariante", () => {
  const card = createBasicLearningItem("deck", "Frage", "Antwort");
  assert.equal(card.reviewState.learningItemId, card.id);
  assert.equal(card.reviewState.reviewableId, card.id);
  assert.deepEqual(card.variants, []);
});

test("Basic mit Rückseite erzeugt zwei unabhängige Karten", () => {
  const cards = createBasicReverseLearningItems("deck", "Vorne", "Hinten");
  assert.equal(cards.length, 2);
  assert.notEqual(cards[0].id, cards[1].id);
  assert.equal(cards[0].originalFront, "Vorne");
  assert.equal(cards[1].originalFront, "Hinten");
  assert.notEqual(cards[0].reviewState.id, cards[1].reviewState.id);
  cards.forEach(assertProjectionRecipeExists);
});

test("jede Cloze-Gruppe wird zu einer eigenen Karte", () => {
  const cards = createClozeLearningItems("deck", "{{c1::Berlin}} und {{c2::Paris}}, noch einmal {{c1::Berlin}}", "Europa");
  assert.equal(cards.length, 2);
  assert.notEqual(cards[0].id, cards[1].id);
  assert.deepEqual(cards.map((card) => card.projection.kind), ["cloze", "cloze"]);
  cards.forEach(assertProjectionRecipeExists);
});

test("jede importierte Anki-Karte wird eigenständig materialisiert", () => {
  const result = createLearningItemsFromNormalizedInput("deck", [{
    canonicalQuestion: "Notiz",
    canonicalAnswer: "Antwort",
    sourceType: "anki_import",
    cards: [
      { front: "Karte 1", back: "A", sourceExternalId: "anki-card-10" },
      { front: "Karte 2", back: "B", sourceExternalId: "anki-card-11" },
    ],
  }]);
  assert.equal(result.createdItems.length, 2);
  assert.deepEqual(result.createdItems.map((card) => card.sourceCardId), ["10", "11"]);
  assert.notEqual(result.createdItems[0].reviewState.id, result.createdItems[1].reviewState.id);
});

test("nur KI-Umformulierungen bleiben Varianten und besitzen keinen Lernstatus", () => {
  const card = createBasicLearningItem("deck", "Frage", "Antwort");
  const updated = addRephrasedVariant(card, "Neu gefragt", "Neu geantwortet");
  assert.equal(updated.variants.length, 1);
  assert.equal(updated.variants[0].cardId, card.id);
  assert.equal("reviewState" in updated.variants[0], false);
  assert.equal(updated.variants[0].meta.sourceContentHash, card.contentHash);
});
