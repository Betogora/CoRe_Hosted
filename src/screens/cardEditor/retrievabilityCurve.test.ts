import assert from "node:assert/strict";
import test from "node:test";
import { createRetrievabilityCurve } from "./retrievabilityCurve.ts";

const event = (answeredAt: string, rating: "again" | "hard" | "good" | "easy" | "manual", kind?: string) => ({ answeredAt, rating, flags: kind ? { kind } : {} });

test("the curve starts at 100 % after each answer, decays in between and marks forgotten answers", () => {
  const curve = createRetrievabilityCurve([
    event("2026-01-01T10:00:00.000Z", "good"),
    event("2026-01-04T10:00:00.000Z", "good"),
    event("2026-02-01T10:00:00.000Z", "again"),
    event("2026-02-01T12:00:00.000Z", "manual", "manual_reschedule"),
  ], "2026-03-01T10:00:00.000Z");
  assert.ok(curve.length > 6);
  assert.deepEqual(curve.map((point) => point.at), [...curve.map((point) => point.at)].sort((left, right) => left - right), "points stay in time order");
  const answers = curve.filter((point) => [Date.parse("2026-01-01T10:00:00.000Z"), Date.parse("2026-01-04T10:00:00.000Z")].includes(point.at));
  assert.ok(answers.some((point) => point.percent === 100), "an answer starts the curve at 100 %");
  const forgotten = curve.filter((point) => point.forgotten);
  assert.equal(forgotten.length, 1);
  assert.ok(forgotten[0].percent < 100);
  assert.equal(curve.at(-1)!.at, Date.parse("2026-03-01T10:00:00.000Z"), "the curve runs until now");
  assert.ok(curve.every((point) => point.percent > 0 && point.percent <= 100));
});

test("without answers there is no curve; Als neu lernen starts over", () => {
  assert.deepEqual(createRetrievabilityCurve([event("2026-01-01T10:00:00.000Z", "manual", "manual_reschedule")], "2026-02-01T10:00:00.000Z"), []);
  const curve = createRetrievabilityCurve([
    event("2026-01-01T10:00:00.000Z", "good"),
    event("2026-01-10T10:00:00.000Z", "manual", "manual_reset"),
  ], "2026-02-01T10:00:00.000Z");
  assert.ok(curve.every((point) => point.at <= Date.parse("2026-01-10T10:00:00.000Z")), "after a reset without answers the curve ends");
});
