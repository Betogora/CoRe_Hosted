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

test("zwischengespeicherte Zeitzonenversätze ergeben auch an Umstellungen dieselben Lerntage wie Intl direkt", () => {
  const reference = (time: number, timeZone: string, dayStartHour: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(time)).map((part) => [part.type, part.value]));
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - (Number(parts.hour) < dayStartHour ? 1 : 0)));
    return date.toISOString().slice(0, 10);
  };
  const transitions = { "Europe/Berlin": ["2026-03-29T00:00:00Z", "2026-10-25T00:00:00Z"], "America/St_Johns": ["2026-03-08T04:00:00Z", "2026-11-01T02:00:00Z"],
    "Australia/Lord_Howe": ["2026-04-04T14:00:00Z", "2026-10-03T15:00:00Z"], "Asia/Kathmandu": ["2026-06-01T00:00:00Z"] };
  for (const [timeZone, starts] of Object.entries(transitions)) for (const start of starts) for (let minute = 0; minute < 6 * 60; minute += 7) {
    const time = Date.parse(start) + minute * 60_000 + 13_000;
    for (const dayStartHour of [0, 4]) assert.equal(getLearningDayKey(time, { timeZone, dayStartHour }), reference(time, timeZone, dayStartHour), `${timeZone} ${new Date(time).toISOString()} ${dayStartHour}`);
  }
});
