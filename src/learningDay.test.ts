import assert from "node:assert/strict";
import test from "node:test";
import {
  getLearningDayKey,
  getNextLearningDayBoundaryDelay,
  learningDayIndexFromLocalTime,
  normalizeDayStartHour,
} from "./learningDay.ts";

test("day-start hours default, round and clamp to a whole hour", () => {
  assert.equal(normalizeDayStartHour(undefined), 0);
  assert.equal(normalizeDayStartHour("3"), 3);
  assert.equal(normalizeDayStartHour(2.6), 3);
  assert.equal(normalizeDayStartHour(-1), 0);
  assert.equal(normalizeDayStartHour(24), 23);
});

test("a three-o'clock rollover assigns early Berlin hours to the previous learning day", () => {
  const options = { dayStartHour: 3, timeZone: "Europe/Berlin" };
  assert.equal(getLearningDayKey("2026-07-11T00:59:59.999Z", options), "2026-07-10");
  assert.equal(getLearningDayKey("2026-07-11T01:00:00.000Z", options), "2026-07-11");
  assert.equal(getNextLearningDayBoundaryDelay("2026-07-11T00:30:00.000Z", options), 30 * 60_000);
});

test("learning-day boundaries remain correct when daylight saving skips the configured hour", () => {
  const options = { dayStartHour: 2, timeZone: "Europe/Berlin" };
  assert.equal(getLearningDayKey("2026-03-29T00:59:59.000Z", options), "2026-03-28");
  assert.equal(getLearningDayKey("2026-03-29T01:00:00.000Z", options), "2026-03-29");
  assert.equal(getNextLearningDayBoundaryDelay("2026-03-29T00:59:59.000Z", options), 1_000);
});

test("pre-localized day indexes use the same rollover rule", () => {
  assert.equal(learningDayIndexFromLocalTime(100, 2, 3), 99);
  assert.equal(learningDayIndexFromLocalTime(100, 3, 3), 100);
});
