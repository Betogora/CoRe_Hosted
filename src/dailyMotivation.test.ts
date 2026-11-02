import assert from "node:assert/strict";
import test from "node:test";
import { getDailyMotivation } from "./dailyMotivation.ts";
import { BRAIN_MASCOTS } from "./brainMascots.ts";

test("motivation stays stable across reloads and changes at the configured learning day", () => {
  const options = { timeZone: "Europe/Berlin", dayStartHour: 3 };
  const first = getDailyMotivation("2026-10-28T18:00:00Z", options);
  assert.deepEqual(getDailyMotivation("2026-10-29T01:59:59Z", options), first);
  const next = getDailyMotivation("2026-10-29T02:00:00Z", options);
  assert.equal(next.day, "2026-10-29");
  assert.notEqual(next.text, first.text);
  assert.notEqual(next.mascotId, first.mascotId);
  assert.deepEqual(getDailyMotivation("2026-10-29T02:00:00Z", options), next);
});

test("motivation follows time zone, DST and supplied simulated dates", () => {
  const options = { timeZone: "Europe/Berlin", dayStartHour: 3 };
  assert.equal(getDailyMotivation("2026-03-29T00:59:59Z", options).day, "2026-03-28");
  assert.equal(getDailyMotivation("2026-03-29T01:00:00Z", options).day, "2026-03-29");
  assert.equal(getDailyMotivation("2026-10-25T01:59:59Z", options).day, "2026-10-24");
  assert.equal(getDailyMotivation("2026-10-25T02:00:00Z", options).day, "2026-10-25");
  assert.notEqual(getDailyMotivation("2026-10-29T02:00:00Z", options).day, getDailyMotivation("2026-10-29T02:00:00Z", { timeZone: "America/New_York", dayStartHour: 3 }).day);
  assert.equal(getDailyMotivation("2031-01-01T12:00:00Z", options).day, "2031-01-01");
});

test("60 unique impulses form a complete cycle with valid, distinct daily mascots", () => {
  const start = Date.parse("2026-01-01T12:00:00Z");
  const days = Array.from({ length: 61 }, (_, i) => getDailyMotivation(new Date(start + i * 86400000).toISOString(), { timeZone: "UTC" }));
  assert.equal(new Set(days.slice(0, 60).map((day) => day.text)).size, 60);
  assert.equal(days[0].text, days[60].text);
  for (const [i, day] of days.entries()) {
    assert.ok(BRAIN_MASCOTS.some((mascot) => mascot.id === day.mascotId));
    if (i) assert.notEqual(day.mascotId, days[i - 1].mascotId);
  }
});
