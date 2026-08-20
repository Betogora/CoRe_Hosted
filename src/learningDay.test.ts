import assert from "node:assert/strict";
import test from "node:test";
import {
  addLearningDays,
  getLearningDayKey,
  getLearningDayRange,
  getLearningDayStartForKey,
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

test("calendar addition preserves Berlin wall time across both DST changes", () => {
  const options = { dayStartHour: 3, timeZone: "Europe/Berlin" };
  const spring = addLearningDays("2026-03-28T11:30:00.000Z", 1, options);
  const autumn = addLearningDays("2026-10-24T10:30:00.000Z", 1, options);

  assert.equal(spring?.toISOString(), "2026-03-29T10:30:00.000Z");
  assert.equal(autumn?.toISOString(), "2026-10-25T11:30:00.000Z");
  assert.equal(getLearningDayKey(spring ?? 0, options), "2026-03-29");
  assert.equal(getLearningDayKey(autumn ?? 0, options), "2026-10-25");
});

test("learning-day ranges select exact Berlin boundaries across DST changes", () => {
  const regular = getLearningDayRange("2026-07-11T12:00:00.000Z", { dayStartHour: 3, timeZone: "Europe/Berlin" });
  const spring = getLearningDayRange("2026-03-29T12:00:00.000Z", { dayStartHour: 2, timeZone: "Europe/Berlin" });
  const autumn = getLearningDayRange("2026-10-25T12:00:00.000Z", { dayStartHour: 2, timeZone: "Europe/Berlin" });

  assert.deepEqual(regular && [new Date(regular.start).toISOString(), new Date(regular.end).toISOString()], ["2026-07-11T01:00:00.000Z", "2026-07-12T01:00:00.000Z"]);
  assert.deepEqual(spring && [new Date(spring.start).toISOString(), new Date(spring.end).toISOString()], ["2026-03-29T01:00:00.000Z", "2026-03-30T00:00:00.000Z"]);
  assert.deepEqual(autumn && [new Date(autumn.start).toISOString(), new Date(autumn.end).toISOString()], ["2026-10-25T00:00:00.000Z", "2026-10-26T01:00:00.000Z"]);
});

test("learning-day keys resolve to exact configured starts across DST changes", () => {
  assert.equal(
    getLearningDayStartForKey("2026-07-11", { dayStartHour: 3, timeZone: "Europe/Berlin" })?.toISOString(),
    "2026-07-11T01:00:00.000Z",
  );
  assert.equal(
    getLearningDayStartForKey("2026-03-29", { dayStartHour: 2, timeZone: "Europe/Berlin" })?.toISOString(),
    "2026-03-29T01:00:00.000Z",
  );
  assert.equal(getLearningDayStartForKey("2026-02-30", { timeZone: "UTC" }), null);
});
