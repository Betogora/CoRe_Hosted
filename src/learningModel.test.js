import assert from "node:assert/strict";
import test from "node:test";
import { createCoreRepository } from "./coreRepository.js";
import {
  createCoreLearningItem,
  createVariantReviewEvent,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
  normalizeLearningItem,
} from "./coreModel.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test("repository normalizes legacy cards into learning items without deleting review events", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "core.appState.v2",
    JSON.stringify({
      version: 2,
      decks: [
        {
          id: "deck_legacy",
          name: "Legacy Deck",
          source: "manual",
          cards: [
            {
              id: "card_legacy",
              source: "manual",
              originalFront: "Was ist CoRe?",
              originalBack: "Content Repetition.",
              originalTags: ["core"],
              reviewState: {
                maturityXp: 24,
                repetitions: 2,
              },
              variants: [
                {
                  id: "variant_rephrase",
                  sourceCardId: "card_legacy",
                  front: "Erklaere CoRe kurz.",
                  back: "Content Repetition.",
                  transformType: "rephrase",
                  qualityStatus: "active",
                },
              ],
            },
          ],
          reviewEvents: [{ id: "review_old", reviewableType: "card", reviewableId: "card_legacy", rating: "good" }],
        },
      ],
    }),
  );

  const repository = createCoreRepository(storage);
  const state = repository.getState();
  const deck = state.decks[0];
  const item = deck.cards[0];
  const original = getOriginalVariant(item);
  const activeVariants = getActiveVariants(item);
  const miniCard = getAnswerSideAnchorMiniCard(item, activeVariants[0]);

  assert.equal(item.id, "card_legacy");
  assert.equal(item.originalFront, "Was ist CoRe?");
  assert.equal(item.canonicalQuestion, "Was ist CoRe?");
  assert.equal(item.canonicalAnswer, "Content Repetition.");
  assert.deepEqual(item.tags, ["core"]);
  assert.equal(item.sourceType, "manual");
  assert.equal(item.learningItemState.maturityXp, 24);
  assert.equal(item.reviewState.repetitions, 2);
  assert.equal(original.isOriginal, true);
  assert.equal(original.front, "Was ist CoRe?");
  assert.equal(activeVariants.length, 1);
  assert.equal(activeVariants[0].learningItemId, item.id);
  assert.equal(activeVariants[0].anchorVariantId, original.id);
  assert.equal(activeVariants[0].parentVariantId, original.id);
  assert.equal(miniCard.shouldShow, true);
  assert.equal(miniCard.label, "Originalkarte");
  assert.equal(miniCard.front, original.front);
  assert.equal(deck.reviewEvents.length, 1);
  assert.equal(deck.reviewEvents[0].id, "review_old");
});

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
  assert.equal(original.variantType, "basic");
  assert.equal(original.isOriginal, true);
  assert.equal(activeVariants.length, 1);
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
