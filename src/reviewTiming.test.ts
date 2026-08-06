import assert from "node:assert/strict";
import test from "node:test";
import { createReviewResponseTimer, MAX_REVIEW_RESPONSE_TIME_MS, measureReviewResponseTime } from "./reviewTiming.ts";

test("review timing measures monotonic elapsed time and caps it at one minute", () => {
  assert.equal(measureReviewResponseTime(1_000, 3_345.4), 2_345);
  assert.equal(measureReviewResponseTime(1_000, 900), 0);
  assert.equal(measureReviewResponseTime(0, 80_000), MAX_REVIEW_RESPONSE_TIME_MS);
  assert.equal(measureReviewResponseTime(null, 10), null);
});

test("review timer starts and stops once per card and reset discards unfinished measurements", () => {
  let now = 1_000;
  const timer = createReviewResponseTimer(() => now);
  timer.start();
  now = 4_200;
  assert.equal(timer.stop(), 3_200);
  assert.equal(timer.stop(), null);

  timer.start();
  timer.reset();
  now = 90_000;
  assert.equal(timer.stop(), null);

  timer.start();
  now = 200_000;
  assert.equal(timer.stop(), MAX_REVIEW_RESPONSE_TIME_MS);
});
