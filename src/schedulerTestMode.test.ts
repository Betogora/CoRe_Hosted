import assert from "node:assert/strict";
import test from "node:test";
import { getOriginalVariant } from "./coreModel.ts";
import { answerVariant } from "./reviewService.ts";
import {
  SCHEDULER_TEST_CARD_COUNT,
  createSchedulerTestDeck,
  createSchedulerTestStart,
  getSchedulerTestDate,
  getSchedulerTestDayForDate,
  getSchedulerTestDayQueue,
  listSchedulerTestDays,
  normalizeSchedulerTestDay,
} from "./schedulerTestMode.ts";

const START = "2026-08-03T10:00:00.000Z";

test("test mode creates an isolated deterministic FSRS deck for day one", () => {
  const deck = createSchedulerTestDeck(START);
  const queue = getSchedulerTestDayQueue(deck, START, 1);

  assert.equal(deck.id, "deck_fsrs_testmodus");
  assert.equal(deck.ownerId, "scheduler-test-mode");
  assert.equal(deck.cards.length, SCHEDULER_TEST_CARD_COUNT);
  assert.equal(deck.reviewEvents.length, 0);
  assert.equal(queue.newCount, SCHEDULER_TEST_CARD_COUNT);
  assert.equal(queue.dueCount, 0);
  assert.equal(queue.total, SCHEDULER_TEST_CARD_COUNT);
});

test("simulated days expose a graduated card only when FSRS makes it due", () => {
  const originalDeck = createSchedulerTestDeck(START);
  const dayOne = getSchedulerTestDate(START, 1);
  const singleCardDeck = { ...originalDeck, cards: [originalDeck.cards[0]], cardCount: 1 };
  const item = singleCardDeck.cards[0];
  const variant = getOriginalVariant(item);
  assert.ok(variant);

  const first = answerVariant(singleCardDeck, item.id, variant.id, "good", { now: dayOne });
  const secondItem = first.updatedCard;
  const secondVariant = getOriginalVariant(secondItem);
  assert.ok(secondVariant);
  const second = answerVariant(first.deck, secondItem.id, secondVariant.id, "good", { now: dayOne });

  assert.equal(second.updatedCard.reviewState.state, "review");
  assert.equal(getSchedulerTestDayForDate(START, second.updatedCard.reviewState.dueAt), 3);
  assert.equal(getSchedulerTestDayQueue(second.deck, START, 2).total, 0);
  assert.equal(getSchedulerTestDayQueue(second.deck, START, 3).total, 1);
});

test("day controls normalize bounds and keep a clickable seven-day window", () => {
  assert.equal(normalizeSchedulerTestDay(-4), 1);
  assert.equal(normalizeSchedulerTestDay(5.4), 5);
  assert.equal(normalizeSchedulerTestDay(9000), 3650);
  assert.equal(new Date(getSchedulerTestDate(START, 2)).getHours(), 10);
  assert.equal(getSchedulerTestDayForDate(START, getSchedulerTestDate(START, 2)), 2);
  assert.deepEqual(listSchedulerTestDays(4), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(listSchedulerTestDays(12), [9, 10, 11, 12, 13, 14, 15]);
  assert.equal(Number.isFinite(new Date(createSchedulerTestStart("invalid")).getTime()), true);
});
