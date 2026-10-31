import type { ReviewEvent, ReviewRating } from "../../coreTypes.ts";
import { createReviewChain } from "../../scheduler.ts";

export interface RetrievabilityPoint {
  /** Milliseconds since the epoch. */
  at: number;
  /** Retrievability in percent. */
  percent: number;
  /** An `again` answer at this moment, the point just before the curve jumps back up. */
  forgotten?: boolean;
}

const RESET_KIND = "manual_reset";
const MAX_POINTS = 360;

/**
 * Retrievability over time like the editor draft of round 3: after each answer it starts at 100 % and decays until the
 * next answer; `Als neu lernen` starts over. The memory state is replayed with FSRS-7 from the ratings, so imported Anki
 * histories without stored stabilities draw the same curve.
 */
export function createRetrievabilityCurve(events: readonly Pick<ReviewEvent, "rating" | "answeredAt" | "flags">[], now: string): RetrievabilityPoint[] {
  const end = Date.parse(now);
  const answers: Array<{ at: number; rating: ReviewRating | null }> = [];
  for (const event of events) {
    const at = Date.parse(event.answeredAt);
    if (!Number.isFinite(at) || at > end) continue;
    if (event.rating !== "manual") answers.push({ at, rating: event.rating });
    else if ((event.flags as { kind?: unknown } | null)?.kind === RESET_KIND) answers.push({ at, rating: null });
  }
  answers.sort((left, right) => left.at - right.at);
  const reviews = answers.filter((answer) => answer.rating !== null).length;
  if (!reviews) return [];
  const samplesPerSegment = Math.max(2, Math.min(24, Math.floor(MAX_POINTS / reviews)));

  const points: RetrievabilityPoint[] = [];
  let chain: ReturnType<typeof createReviewChain> | null = null;
  let segmentStart = 0;
  const sample = (from: number, to: number) => {
    if (!chain || to <= from) return;
    for (let step = 1; step <= samplesPerSegment; step += 1) {
      const at = from + (to - from) * step / samplesPerSegment;
      points.push({ at, percent: Math.round(chain.retrievability(new Date(at)) * 1000) / 10 });
    }
  };
  for (const answer of answers) {
    sample(segmentStart, answer.at);
    if (answer.rating === null) {
      chain = null;
      continue;
    }
    if (chain && answer.rating === "again" && points.length) points[points.length - 1] = { ...points[points.length - 1], forgotten: true };
    chain ??= createReviewChain({});
    chain.review(answer.rating, new Date(answer.at));
    points.push({ at: answer.at, percent: Math.round(chain.retrievability(new Date(answer.at)) * 1000) / 10 });
    segmentStart = answer.at;
  }
  sample(segmentStart, end);
  return points;
}
