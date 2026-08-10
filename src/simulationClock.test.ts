import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck, getOriginalVariant } from "./coreModel.ts";
import { answerVariant } from "./reviewService.ts";
import {
  MAX_SIMULATION_OFFSET_MINUTES,
  SIMULATION_MINUTES_PER_DAY,
  formatSimulationDuration,
  getLocalDateInputValue,
  getSimulatedNow,
  getSimulationOffsetMinutesForDate,
  normalizeSimulationOffsetMinutes,
} from "./simulationClock.ts";

test("simulation clock normalizes the supported future horizon", () => {
  assert.equal(normalizeSimulationOffsetMinutes(-2), 0);
  assert.equal(normalizeSimulationOffsetMinutes(3.4), 3);
  assert.equal(normalizeSimulationOffsetMinutes("invalid"), 0);
  assert.equal(normalizeSimulationOffsetMinutes(MAX_SIMULATION_OFFSET_MINUTES + 1), MAX_SIMULATION_OFFSET_MINUTES);
});

test("simulation clock maps local calendar dates to bounded minute offsets", () => {
  const now = new Date(2026, 7, 6, 18, 30, 0);

  assert.equal(getSimulationOffsetMinutesForDate(now, "2026-08-06"), 0);
  assert.equal(getSimulationOffsetMinutesForDate(now, "2026-08-09"), 3 * SIMULATION_MINUTES_PER_DAY);
  assert.equal(getSimulationOffsetMinutesForDate(now, "2026-08-05"), 0);
  assert.equal(getSimulationOffsetMinutesForDate(now, "not-a-date"), 0);
  assert.equal(getSimulationOffsetMinutesForDate(now, "2038-01-01"), MAX_SIMULATION_OFFSET_MINUTES);
});

test("simulation clock supports and labels jumps within the same day", () => {
  assert.equal(getSimulatedNow("2026-08-06T10:00:00.000Z", 10), "2026-08-06T10:10:00.000Z");
  assert.equal(formatSimulationDuration(10), "10 Minuten");
  assert.equal(formatSimulationDuration(60), "1 Stunde");
  assert.equal(formatSimulationDuration(3 * SIMULATION_MINUTES_PER_DAY), "3 Tage");
});

test("simulation clock preserves local wall time across a daylight-saving boundary", () => {
  const beforeChange = new Date(2026, 2, 28, 10, 15, 30);
  const simulated = new Date(getSimulatedNow(beforeChange, SIMULATION_MINUTES_PER_DAY));

  assert.equal(simulated.getFullYear(), 2026);
  assert.equal(simulated.getMonth(), 2);
  assert.equal(simulated.getDate(), 29);
  assert.equal(simulated.getHours(), 10);
  assert.equal(simulated.getMinutes(), 15);
  assert.equal(getLocalDateInputValue(simulated), "2026-03-29");
});

test("a future review is committed at simulated time and is not undone by resetting the clock", () => {
  const realNow = "2026-08-06T10:00:00.000Z";
  const simulatedNow = getSimulatedNow(realNow, 3 * SIMULATION_MINUTES_PER_DAY);
  const item = createBasicLearningItem("deck_simulation", "Frage", "Antwort", {
    reviewState: { state: "review", repetitions: 2, dueAt: simulatedNow },
  });
  const deck = createCoreDeck({ id: "deck_simulation", name: "Simulation", source: "manual", cards: [item] });
  const original = getOriginalVariant(item);
  assert.ok(original);

  const result = answerVariant(deck, item.id, original.id, "good", { now: simulatedNow });

  assert.equal(result.event.reviewedAt, simulatedNow);
  assert.equal(result.updatedCard.reviewState.lastReviewedAt, simulatedNow);
  assert.equal(getSimulatedNow(realNow, 0), realNow);
  assert.equal(result.deck.cards[0].reviewState.lastReviewedAt, simulatedNow);
});
