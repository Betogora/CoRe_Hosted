import assert from "node:assert/strict";
import test from "node:test";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import { answerVariant } from "./reviewService.ts";

test("eine KI-Umformulierung bewertet den Lernstatus ihrer Karte", () => {
  const card = addRephrasedVariant(createBasicLearningItem("deck", "Q", "A"), "Q2", "A2");
  const deck = createCoreDeck({ id: "deck", cards: [card] });
  const result = answerVariant(deck, card.id, card.variants[0].id, "good", { now: "2026-08-20T08:00:00.000Z" });
  assert.equal(result.updatedCard.reviewState.repetitions, 1);
  assert.equal(result.event.variantId, card.variants[0].id);
  assert.equal("reviewState" in result.updatedCard.variants[0], false);
});
