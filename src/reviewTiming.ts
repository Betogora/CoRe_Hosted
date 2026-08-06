export const MAX_REVIEW_RESPONSE_TIME_MS = 60_000;

export function measureReviewResponseTime(startedAt: number | null, finishedAt: number): number | null {
  if (startedAt == null || !Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null;
  return Math.min(MAX_REVIEW_RESPONSE_TIME_MS, Math.max(0, Math.round(finishedAt - startedAt)));
}

export function createReviewResponseTimer(readMonotonicNow: () => number = () => performance.now()) {
  let startedAt: number | null = null;
  return {
    start() {
      startedAt = readMonotonicNow();
    },
    stop() {
      const responseTimeMs = measureReviewResponseTime(startedAt, readMonotonicNow());
      startedAt = null;
      return responseTimeMs;
    },
    reset() {
      startedAt = null;
    },
  };
}
