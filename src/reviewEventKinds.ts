import type { ReviewEvent } from "./coreTypes.ts";

export const HIT_REVIEW_KIND = "hit_review";

export function countsTowardDailyLimits(event: Pick<ReviewEvent, "rating" | "flags">): boolean {
  return event.rating !== "manual" && (event.flags as { kind?: unknown } | null)?.kind !== HIT_REVIEW_KIND;
}
