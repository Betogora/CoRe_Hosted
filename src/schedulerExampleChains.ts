import { addCardVariant, cardStudyFromReviewState, createBasicNote, createDefaultDeckSettings, createReviewState } from "./coreModel.ts";
import type { Card, MaturityBand, ReviewRating, ReviewSchedulerState, ReviewState } from "./coreTypes.ts";
import { nextVariantStage, selectReviewVariant } from "./coreVariantService.ts";
import { getDurabilityDays, scheduleWithFsrs } from "./scheduler.ts";

// Example chains of the card-history spec (specs.md#lernverlauf-einer-karte); the golden test pins their values.

const START = "2026-08-21T10:00:00.000Z";
const DAY_MS = 86_400_000;

export const EXAMPLE_RETENTIONS = [0.9, 0.93, 0.95];
export const EXAMPLE_VARIANT_THRESHOLDS = [7, 21, 60];
/** Active variants of the example card, the most a deck allows. */
export const EXAMPLE_VARIANT_COUNT = 3;

/** The first chain also shows the effect of the target retention. */
export const EXAMPLE_CHAINS: ReadonlyArray<{ name: string; ratings: ReviewRating[] }> = [
  { name: "Immer Gut", ratings: Array(6).fill("good") },
  { name: "Leicht, dann Gut", ratings: ["easy", "good", "good", "good"] },
  { name: "Mit Schwer dazwischen", ratings: ["good", "good", "good", "hard", "good", "hard", "good", "good"] },
  { name: "Gut mit einem Fehler", ratings: ["good", "good", "good", "good", "again", "good", "good", "good", "good", "good"] },
  { name: "Nochmal am Anfang", ratings: ["again", ...Array(7).fill("good")] },
  { name: "Wackeliger Start", ratings: ["again", "good", "again", "good", "good", "good", "good", "good", "good"] },
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
  /** Per deck threshold of `EXAMPLE_VARIANT_THRESHOLDS`, the number of the variant this contact asks; 0 asks the card. */
  variants: number[];
}

function outcome(state: ReviewState): ExampleOutcome {
  return { phase: state.state, intervalMinutes: state.intervalMinutes, intervalDays: state.intervalDays, durabilityDays: getDurabilityDays(state), band: state.maturityBand };
}

/** Answers a new card with three variants on each due date; each deck threshold runs its own variant chain. */
export function runExampleChain(ratings: ReviewRating[], desiredRetention: number): ExampleContact[] {
  const deckSettings = createDefaultDeckSettings({ schedulerProfile: { desiredRetention } });
  const created = createBasicNote("deck", "Q", "A").cards[0];
  const withVariants = Array.from({ length: EXAMPLE_VARIANT_COUNT }, (_, index) => index + 1)
    .reduce((card, number) => addCardVariant(card, { front: `Q${number}`, back: "A" }, new Date(Date.parse(START) + number * 1000).toISOString()), created);
  const chains = EXAMPLE_VARIANT_THRESHOLDS.map((variantThresholdDays) => ({ settings: { coreMode: "on" as const, variantThresholdDays, maxActiveVariantsPerCard: EXAMPLE_VARIANT_COUNT }, card: withVariants }));
  let state = createReviewState({ dueAt: START });
  return ratings.map((rating) => {
    const now = state.dueAt;
    const next = scheduleWithFsrs(state, rating, { now, deckSettings });
    const variants = chains.map((chain) => {
      const card: Card = { ...chain.card, study: cardStudyFromReviewState({ ...state, variantStage: chain.card.study.extra.variantStage }) };
      const variant = selectReviewVariant(card, chain.settings, now);
      chain.card = {
        ...card,
        study: cardStudyFromReviewState({ ...next, variantStage: nextVariantStage(card, variant, rating, chain.settings) }),
        variants: card.variants.map((candidate) => candidate === variant ? { ...candidate, performance: { ...candidate.performance, lastReviewedAt: now } } : candidate),
      };
      return variant ? card.variants.indexOf(variant) + 1 : 0;
    });
    const contact = { day: (Date.parse(now) - Date.parse(START)) / DAY_MS, phaseBefore: state.state, rating, variants };
    state = next;
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
