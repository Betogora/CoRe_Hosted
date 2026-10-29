import type { CardStudyState, MaturityBand, ReviewRating, ReviewSchedulerState, ReviewState, VariantPerformance } from "../coreTypes.ts";
import { REVIEW_RATINGS, stableContentHash } from "./coreValues.ts";

type StringMap = Record<string, unknown>;
const MATURITY_BANDS: readonly MaturityBand[] = ["new", "learning", "young", "mature"];
type ReviewStateInput = Partial<Omit<ReviewState, "state" | "reps">> & { state?: ReviewSchedulerState | null; reps?: number | null };
interface VariantPerformanceInput extends Partial<Omit<VariantPerformance, "id" | "attempts">> { id?: string | null; attempts?: number | null; }
function objectRecord(value: unknown): StringMap { return value !== null && typeof value === "object" ? value as StringMap : {}; }

/** Normalizes a flat scheduler state; unknown keys of older snapshots are ignored. */
export function createReviewState(input: unknown = {}): ReviewState {
  const {
    schedulerVersion = "fsrs_7_v1",
    state = null,
    dueAt = new Date().toISOString(),
    intervalDays = 0,
    difficulty = 5,
    stability = 0,
    stabilityFast = 0,
    desiredRetention = 0.92,
    reps = null,
    lapses = 0,
    maturityBand = "new",
    lastReviewedAt = null,
    lastRating = null,
    intervalMinutes = null,
    learningStepIndex = 0,
    learningSuccessCount = 0,
    firstLearningAt = null,
    lastLearningStepAt = null,
    graduatedAt = null,
    isGraduated = false,
    learningDayKey = null,
    sourceSchedulerData = null,
  } = objectRecord(input) as ReviewStateInput;
  const normalizedReps = Math.max(0, Math.round(Number(reps ?? 0) || 0));
  return {
    schedulerVersion,
    state: state ?? (normalizedReps > 0 ? "review" : "new"),
    dueAt,
    intervalDays: Math.max(0, Number(intervalDays) || 0),
    difficulty: Math.min(10, Math.max(1, Number(difficulty ?? 5) || 5)),
    stability: Math.max(0, Number(stability ?? 0) || 0),
    stabilityFast: Math.max(0, Number(stabilityFast ?? 0) || 0),
    desiredRetention: Math.min(0.99, Math.max(0.5, Number(desiredRetention ?? 0.92) || 0.92)),
    reps: normalizedReps,
    lapses: Math.max(0, Math.round(Number(lapses) || 0)),
    maturityBand: MATURITY_BANDS.includes(maturityBand as MaturityBand) ? maturityBand as MaturityBand : "new",
    lastReviewedAt,
    lastRating,
    intervalMinutes: intervalMinutes == null ? null : Math.max(0, Math.round(Number(intervalMinutes) || 0)),
    learningStepIndex: Math.max(0, Math.round(Number(learningStepIndex) || 0)),
    learningSuccessCount: Math.max(0, Math.round(Number(learningSuccessCount) || 0)),
    firstLearningAt,
    lastLearningStepAt,
    graduatedAt,
    isGraduated: Boolean(isGraduated || graduatedAt),
    learningDayKey,
    sourceSchedulerData,
  };
}

/** Maps a scheduler state to the card's study columns. */
export function cardStudyFromReviewState(state: ReviewState): CardStudyState {
  return {
    state: state.state,
    dueAt: state.dueAt,
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    intervalDays: state.intervalDays,
    learningStepIndex: state.learningStepIndex,
    lastReviewedAt: state.lastReviewedAt,
    lastRating: state.lastRating,
    extra: {
      schedulerVersion: state.schedulerVersion,
      stabilityFast: state.stabilityFast,
      desiredRetention: state.desiredRetention,
      maturityBand: state.maturityBand,
      intervalMinutes: state.intervalMinutes,
      learningSuccessCount: state.learningSuccessCount,
      firstLearningAt: state.firstLearningAt,
      lastLearningStepAt: state.lastLearningStepAt,
      graduatedAt: state.graduatedAt,
      isGraduated: state.isGraduated,
      learningDayKey: state.learningDayKey,
      sourceSchedulerData: state.sourceSchedulerData,
    },
  };
}

/** Flat scheduler view of the card's study columns (K2.5). */
export function reviewStateFromCardStudy(study: CardStudyState): ReviewState {
  const { extra, ...queue } = study;
  return createReviewState({ ...extra, ...queue });
}

export function createCardStudy(dueAt: string): CardStudyState {
  return cardStudyFromReviewState(createReviewState({ dueAt }));
}

export function createVariantPerformance({
  id = null,
  cardId = "",
  variantId = "",
  userId = "local-user",
  attempts = null,
  correctCount = 0,
  wrongCount = 0,
  averageResponseTimeMs = null,
  lastReviewedAt = null,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
}: VariantPerformanceInput = {}): VariantPerformance {
  return {
    id: id ?? stableContentHash({ cardId, variantId, userId }, "variant_perf"),
    cardId,
    variantId,
    userId,
    attempts: Math.max(0, Number(attempts) || 0),
    correctCount: Math.max(0, Number(correctCount) || 0),
    wrongCount: Math.max(0, Number(wrongCount) || 0),
    averageResponseTimeMs,
    lastReviewedAt,
    createdAt,
    updatedAt,
  };
}

/** Counts one answer of a variant; its study state stays on the card. */
export function updateVariantPerformance(
  performance: VariantPerformanceInput = {},
  rating: ReviewRating,
  { responseTimeMs = null, reviewedAt = new Date().toISOString(), cardId = "", variantId = "" }: {
    responseTimeMs?: number | null;
    reviewedAt?: string;
    cardId?: string;
    variantId?: string;
  } = {},
): VariantPerformance {
  if (!rating || !REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const previous = createVariantPerformance({ ...(performance ?? {}), cardId, variantId });
  const attempts = previous.attempts + 1;
  const isCorrect = rating !== "again";
  const averageResponseTimeMs = responseTimeMs == null
    ? previous.averageResponseTimeMs
    : Math.round(((Number(previous.averageResponseTimeMs ?? 0) * previous.attempts) + Number(responseTimeMs)) / attempts);

  return createVariantPerformance({
    ...previous,
    attempts,
    correctCount: previous.correctCount + (isCorrect ? 1 : 0),
    wrongCount: previous.wrongCount + (isCorrect ? 0 : 1),
    averageResponseTimeMs,
    lastReviewedAt: reviewedAt,
    updatedAt: reviewedAt,
  });
}
