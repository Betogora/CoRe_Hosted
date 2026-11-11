import type { ReviewEvent } from "./coreTypes.ts";

/**
 * Kind of the reviews of `Treffer lernen` with `Vorziehen` (KV5). They change the study state like any review and count
 * as answered today (sibling burying, statistics), but leave the daily new-card and review limits of the decks alone.
 */
export const HIT_REVIEW_KIND = "hit_review";

/** Whether a review uses up today's limits: manual events and reviews of `Treffer lernen` do not. */
export function countsTowardDailyLimits(event: Pick<ReviewEvent, "rating" | "flags">): boolean {
  return event.rating !== "manual" && (event.flags as { kind?: unknown } | null)?.kind !== HIT_REVIEW_KIND;
}
