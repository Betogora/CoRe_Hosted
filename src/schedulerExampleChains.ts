import { addCardVariant, cardStudyFromReviewState, createBasicNote, createDefaultDeckSettings, createReviewState } from "./coreModel.ts";
import type { MaturityBand, ReviewRating, ReviewSchedulerState, ReviewState } from "./coreTypes.ts";
import { selectReviewVariant } from "./coreVariantService.ts";
import { getDurabilityDays, scheduleWithFsrs } from "./scheduler.ts";

// Example chains of the card-history spec (specs.md §6.11); the golden test pins their values.

const START = "2026-08-21T10:00:00.000Z";
const DAY_MS = 86_400_000;

export const EXAMPLE_RETENTIONS = [0.9, 0.92, 0.94];
export const EXAMPLE_VARIANT_THRESHOLDS = [7, 21, 60];

export const EXAMPLE_CHAINS: ReadonlyArray<{ name: string; ratings: ReviewRating[] }> = [
  { name: "Immer Gut", ratings: Array(6).fill("good") },
  { name: "Leicht, dann Gut", ratings: ["easy", "good", "good", "good"] },
  { name: "Gut mit einem Fehler", ratings: ["good", "good", "good", "good", "again", "good", "good", "good", "good", "good"] },
  { name: "Nochmal am Anfang", ratings: ["again", ...Array(7).fill("good")] },
];

/** Where a card stands before an answer; each situation is reached from a new card with the listed ratings. */
export const EXAMPLE_SITUATIONS: ReadonlyArray<{ name: string; ratings: ReviewRating[] }> = [
  { name: "Neue Karte", ratings: [] },
  { name: "Im zweiten Lernschritt", ratings: ["good"] },
  { name: "In der Wiederholung", ratings: ["good", "good", "good"] },
  { name: "Im Wiederlernen", ratings: ["good", "good", "good", "again"] },
];

export interface ExampleOutcome {
  phase: ReviewSchedulerState;
  /** Set while the next contact is within the same day. */
  intervalMinutes: number | null;
  intervalDays: number;
  durabilityDays: number;
  band: MaturityBand;
}

export interface ExampleContact extends ExampleOutcome {
  /** Days since the first contact, when this answer is given. */
  day: number;
  phaseBefore: ReviewSchedulerState;
  rating: ReviewRating;
  /** Deck thresholds at which this contact asks the variant instead of the card. */
  variantThresholds: number[];
}

function outcome(state: ReviewState): ExampleOutcome {
  return { phase: state.state, intervalMinutes: state.intervalMinutes, intervalDays: state.intervalDays, durabilityDays: getDurabilityDays(state), band: state.maturityBand };
}

/** Answers a new card with one variant on each due date. */
export function runExampleChain(ratings: ReviewRating[], desiredRetention: number): ExampleContact[] {
  const deckSettings = createDefaultDeckSettings({ schedulerProfile: { desiredRetention } });
  let card = addCardVariant(createBasicNote("deck", "Q", "A").cards[0], { front: "Q2", back: "A2" });
  let state = createReviewState({ dueAt: START });
  return ratings.map((rating) => {
    card = { ...card, study: cardStudyFromReviewState(state) };
    const variantThresholds = EXAMPLE_VARIANT_THRESHOLDS.filter((variantThresholdDays) => selectReviewVariant(card, { coreMode: "on", variantThresholdDays, maxActiveVariantsPerCard: 1 }));
    const contact = { day: (Date.parse(state.dueAt) - Date.parse(START)) / DAY_MS, phaseBefore: state.state, rating, variantThresholds };
    state = scheduleWithFsrs(state, rating, { now: state.dueAt, deckSettings });
    return { ...contact, ...outcome(state) };
  });
}

/** What each rating does from a situation, answered when the card is due. */
export function exampleRatingEffects(ratingsBefore: ReviewRating[], desiredRetention: number): Record<ReviewRating, ExampleOutcome> {
  const deckSettings = createDefaultDeckSettings({ schedulerProfile: { desiredRetention } });
  let state = createReviewState({ dueAt: START });
  for (const rating of ratingsBefore) state = scheduleWithFsrs(state, rating, { now: state.dueAt, deckSettings });
  const answer = (rating: ReviewRating) => outcome(scheduleWithFsrs(state, rating, { now: state.dueAt, deckSettings }));
  return { again: answer("again"), hard: answer("hard"), good: answer("good"), easy: answer("easy") };
}
