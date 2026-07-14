import assert from "node:assert/strict";
import test from "node:test";
import {
  addRephrasedVariant,
  createBasicLearningItem,
  createBasicReverseLearningItem,
  createClozeLearningItem,
  createCoreDeck,
  getActiveVariants,
  getOriginalVariant,
  type CoreCardInput,
} from "./coreModel.ts";
import { answerVariant, getNextReviewItem } from "./reviewService.ts";

function createDeckWithItem(item: CoreCardInput) {
  return createCoreDeck({
    id: "deck_review",
    name: "Review Deck",
    source: "manual",
    cards: [item],
    reviewEvents: [],
  });
}

test("answerVariant updates central learning item state and writes a variant review event", () => {
  const item = createBasicLearningItem("deck_review", "Was ist ATP?", "Ein Energietraeger.", {
    id: "item_atp",
    reviewState: {
      state: "review",
      maturityXp: 60,
      repetitions: 2,
      intervalDays: 2,
      dueAt: "2026-07-01T08:00:00.000Z",
    },
  });
  const original = getOriginalVariant(item);
  const deck = createDeckWithItem(item);
  assert.ok(original);
  const result = answerVariant(deck, item.id, original.id, "good", 1200, {
    now: "2026-07-06T10:00:00.000Z",
  });
  const updated = result.deck.cards[0];
  assert.ok(original);
  const reviewedVariant = updated.variants.find((variant) => variant.id === original.id);
  const event = result.deck.reviewEvents[0];

  assert.equal(updated.learningItemState.repetitions, 3);
  assert.equal(updated.reviewState.repetitions, 3);
  assert.equal(updated.learningItemState.state, "review");
  assert.notEqual(updated.learningItemState.dueAt, item.reviewState.dueAt);
  assert.ok(reviewedVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(reviewedVariant.reviewState.schedulerCompatibilityOnly, true);
  assert.ok(reviewedVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(reviewedVariant.reviewState.dueAt, undefined);
  assert.equal(event.deckId, deck.id);
  assert.equal(event.learningItemId, item.id);
  assert.ok(original);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.cardVariantId, original.id);
  assert.ok(original);
  assert.equal(event.variantId, original.id);
  assert.equal(event.rating, "good");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.previousLearningItemStateJson.repetitions, 2);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.nextLearningItemStateJson.repetitions, 3);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.schedulerVersion, "fsrs_v1");
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.anchorSnapshotJson.shouldShow, false);
});

test("again moves reviewed cards to relearning and increments lapses", () => {
  const item = createBasicLearningItem("deck_review", "Welche Aufgabe hat Myelin?", "Es isoliert Axone.", {
    reviewState: {
      state: "review",
      repetitions: 4,
      lapses: 1,
      intervalDays: 5,
      dueAt: "2026-07-01T08:00:00.000Z",
    },
  });
  const deck = createDeckWithItem(item);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const result = answerVariant(deck, item.id, getOriginalVariant(item).id, "again", {
    now: "2026-07-06T10:00:00.000Z",
  });
  const state = result.deck.cards[0].learningItemState;

  assert.equal(state.repetitions, 5);
  assert.equal(state.lapses, 2);
  assert.equal(state.state, "relearning");
  assert.equal(state.intervalDays <= 0.5, true);
  assert.equal(new Date(state.dueAt).getTime() > new Date("2026-07-06T10:00:00.000Z").getTime(), true);
});

test("hard good and easy update due dates with increasing intervals", () => {
  const baseState = {
    state: "review",
    repetitions: 3,
    intervalDays: 2,
    ease: 2.5,
    dueAt: "2026-07-01T08:00:00.000Z",
  };
  const hardItem = createBasicLearningItem("deck_review", "H", "A", { reviewState: baseState });
  const goodItem = createBasicLearningItem("deck_review", "G", "A", { reviewState: baseState });
  const easyItem = createBasicLearningItem("deck_review", "E", "A", { reviewState: baseState });
  const now = "2026-07-06T10:00:00.000Z";
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const hard = answerVariant(createDeckWithItem(hardItem), hardItem.id, getOriginalVariant(hardItem).id, "hard", { now }).deck.cards[0].learningItemState;
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const good = answerVariant(createDeckWithItem(goodItem), goodItem.id, getOriginalVariant(goodItem).id, "good", { now }).deck.cards[0].learningItemState;
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const easy = answerVariant(createDeckWithItem(easyItem), easyItem.id, getOriginalVariant(easyItem).id, "easy", { now }).deck.cards[0].learningItemState;

  assert.equal(new Date(hard.dueAt).getTime() > new Date(now).getTime(), true);
  assert.equal(new Date(good.dueAt).getTime() > new Date(now).getTime(), true);
  assert.equal(new Date(easy.dueAt).getTime() > new Date(now).getTime(), true);
  assert.equal(hard.intervalDays < good.intervalDays, true);
  assert.equal(good.intervalDays < easy.intervalDays, true);
});

test("answerVariant rejects foreign variants and suspended cards without writing events", () => {
  const left = createBasicLearningItem("deck_review", "Links", "Antwort");
  const right = createBasicLearningItem("deck_review", "Rechts", "Antwort");
  const suspended = createBasicLearningItem("deck_review", "Suspendiert", "Antwort", {
    status: "suspended",
  });
  const deck = createCoreDeck({
    id: "deck_review",
    name: "Review Deck",
    source: "manual",
    cards: [left, right, suspended],
    reviewEvents: [],
  });

  assert.ok(getOriginalVariant);
  assert.throws(
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    () => answerVariant(deck, left.id, getOriginalVariant(right).id, "good"),
    /Variante nicht gefunden|gehört nicht/,
  );
  assert.ok(getOriginalVariant);
  assert.throws(
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    () => answerVariant(deck, suspended.id, getOriginalVariant(suspended).id, "good"),
    /suspended oder buried/,
  );
  assert.equal(deck.reviewEvents.length, 0);
});

test("variant performance and anchor snapshots are updated for non-original variants", () => {
  const item = addRephrasedVariant(
    createBasicLearningItem("deck_review", "Welche Aufgabe hat Myelin?", "Myelin isoliert Axone.", {
      reviewState: {
        state: "review",
        repetitions: 2,
        dueAt: "2026-07-01T08:00:00.000Z",
      },
    }),
    "Warum hilft Myelin bei schneller Leitung?",
    "Weil es Axone elektrisch isoliert.",
  );
  const variant = getActiveVariants(item)[0];
  const deck = createDeckWithItem(item);
  const result = answerVariant(deck, item.id, variant.id, "hard", 900, {
    now: "2026-07-06T10:00:00.000Z",
  });
  const updatedVariant = result.deck.cards[0].variants.find((candidate) => candidate.id === variant.id);
  const event = result.deck.reviewEvents[0];

  assert.ok(updatedVariant);
  assert.equal(updatedVariant.performance.attempts, 1);
  assert.ok(updatedVariant);
  assert.equal(updatedVariant.performance.correctCount, 1);
  assert.ok(updatedVariant);
  assert.equal(updatedVariant.performance.wrongCount, 0);
  assert.ok(updatedVariant);
  assert.equal(updatedVariant.performance.lastRating, "hard");
  assert.ok(updatedVariant);
  assert.equal(updatedVariant.performance.avgResponseTimeMs, 900);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.anchorVariantId, getOriginalVariant(item).id);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.anchorSnapshotJson.shouldShow, true);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.anchorSnapshotJson.variantId, getOriginalVariant(item).id);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(event.anchorSnapshotJson.front, getOriginalVariant(item).front);
});

test("getNextReviewItem returns due learning items with selected variants and anchor view model", () => {
  const dueItem = addRephrasedVariant(
    createBasicLearningItem("deck_review", "Was macht Myelin?", "Es isoliert Axone.", {
      reviewState: {
        state: "review",
        repetitions: 3,
        dueAt: "2026-07-01T08:00:00.000Z",
        preferredVariantLevel: 2,
      },
    }),
    "Beschreibe die Wirkung von Myelin.",
    "Myelin isoliert Axone.",
  );
  const deck = createDeckWithItem(dueItem);
  const next = getNextReviewItem(deck, { now: "2026-07-06T10:00:00.000Z" });

  assert.ok(next);
  assert.equal(next.deckId, deck.id);
  assert.ok(next);
  assert.equal(next.learningItemId, dueItem.id);
  assert.ok(next);
  assert.equal(next.variant.isOriginal, false);
  assert.ok(next);
  assert.equal(next.cardVariantId, getActiveVariants(dueItem)[0].id);
  assert.ok(next);
  assert.equal(next.answerSideAnchorMiniCard.shouldShow, true);
  assert.ok(next);
  assert.equal(next.schedulerInfo.selectedBy, "due_learning_item");

  const newItem = createBasicLearningItem("deck_review", "Neu", "Antwort", {
    reviewState: {
      state: "new",
      dueAt: "2026-07-01T08:00:00.000Z",
    },
  });
  const originalNext = getNextReviewItem(createDeckWithItem(newItem), { now: "2026-07-06T10:00:00.000Z" });
  assert.ok(originalNext);
  assert.equal(originalNext.variant.isOriginal, true);
  assert.ok(originalNext);
  assert.equal(originalNext.answerSideAnchorMiniCard.shouldShow, false);
});

test("reverse and cloze card types select their functional review face", () => {
  const reverseItem = createBasicReverseLearningItem("deck_review", "ATP", "Energietraeger", {
    reviewState: {
      state: "new",
      dueAt: "2026-07-01T08:00:00.000Z",
    },
  });
  const reverseNext = getNextReviewItem(createDeckWithItem(reverseItem), { now: "2026-07-06T10:00:00.000Z" });

  assert.ok(reverseNext);
  assert.equal(reverseNext.variant.variantType, "reverse");
  assert.ok(reverseNext);
  assert.equal(reverseNext.front, "Energietraeger");
  assert.ok(reverseNext);
  assert.equal(reverseNext.back, "ATP");
  assert.ok(reverseNext);
  assert.equal(reverseNext.answerSideAnchorMiniCard.shouldShow, true);

  const clozeItem = createClozeLearningItem("deck_review", "{{c1::ATP}} liefert Energie fuer {{c2::Muskelkontraktion}}.", "Extra", {
    reviewState: {
      state: "new",
      dueAt: "2026-07-01T08:00:00.000Z",
    },
  });
  const clozeNext = getNextReviewItem(createDeckWithItem(clozeItem), { now: "2026-07-06T10:00:00.000Z" });

  assert.ok(clozeNext);
  assert.equal(clozeNext.variant.variantType, "cloze");
  assert.ok(clozeNext);
  assert.match(clozeNext.front, /\[\.\.\.\]/);
  assert.ok(clozeNext);
  assert.doesNotMatch(clozeNext.front, /\{\{c1::/);
  assert.ok(clozeNext);
  assert.match(clozeNext.back, /ATP/);
  assert.ok(clozeNext);
  assert.match(clozeNext.back, /Muskelkontraktion/);
});
