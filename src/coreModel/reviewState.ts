import type { ReviewRating, ReviewSchedulerState, ReviewState, ReviewStateBase, SourceAnchor, VariantPerformance, VersionEntry } from "../coreTypes.ts";
import { REVIEW_RATINGS, getMaturityBand, makeId, stableContentHash } from "./coreValues.ts";

type StringMap = Record<string, unknown>;
type ReviewStateInput = Partial<Omit<ReviewStateBase, "state" | "reps" | "repetitions">> & { state?: ReviewSchedulerState | null; reps?: number | null; repetitions?: number | null };
export interface SourceDocument { id: string; ownerId: string; fileName: string; mimeType: string; text: string; storageUrl: string; textExtractionStatus: string; metadata: StringMap; createdAt: string; updatedAt: string; revision: number; deletedAt: string | null; updatedByDeviceId: string | null; }
interface SourceDocumentInput extends Partial<SourceDocument> {}
export interface SourceAnchorInput extends Partial<Omit<SourceAnchor, "textQuote">> { textQuote?: unknown; }
interface VersionEntryInput extends Partial<VersionEntry> { objectType?: string; objectId?: string; changeType?: string; }
interface VariantPerformanceInput extends Partial<Omit<VariantPerformance, "id" | "ratingCounts" | "attempts">> { id?: string | null; ratingCounts?: Partial<Record<ReviewRating, number>>; againCount?: number; hardCount?: number; goodCount?: number; easyCount?: number; attempts?: number | null; }
interface VariantReviewEventInput { id?: string; userId?: string; deckId?: string; learningItemId?: string; variantId?: string; rating?: ReviewRating; answeredAt?: string; responseTimeMs?: number | null; schedulerBefore?: unknown; schedulerAfter?: unknown; flags?: StringMap; createdAt?: string; }
function objectRecord(value: unknown): StringMap { return value !== null && typeof value === "object" ? value as StringMap : {}; }

export function normalizeVersionLog(versionLog: unknown, fallbackEntry: VersionEntry): VersionEntry[] {
  return Array.isArray(versionLog) && versionLog.length > 0 ? versionLog : [fallbackEntry];
}
export function createLearningItemState({
  id = makeId("state"),
  learningItemId = "",
  reviewableType = "learning_item",
  reviewableId = learningItemId,
  userId = "local-user",
  schedulerVersion = "fsrs_v1",
  state = null,
  dueAt = new Date().toISOString(),
  intervalDays = 0,
  ease = 2.5,
  difficulty = 5,
  stability = 0,
  desiredRetention = 0.9,
  retrievability = null,
  reps = null,
  repetitions = null,
  lapses = 0,
  maturityXp = 0,
  lastReviewedAt = null,
  lastRating = null,
  preferredVariantLevel = 1,
  forcedVariantId = null,
  fallbackUntilCorrect = false,
  lastFailedVariantId = null,
  previousSuccessfulVariantId = null,
  intervalMinutes = null,
  learningStepIndex = 0,
  learningSuccessCount = 0,
  firstLearningAt = null,
  lastLearningStepAt = null,
  graduatedAt = null,
  isGraduated = false,
  sameDaySuccessCount = 0,
  learningDayKey = null,
  schedulerParamsJson = null,
  sourceSchedulerData = null,
}: ReviewStateInput = {}): ReviewState {
  const normalizedLearningItemId = learningItemId || reviewableId || "";
  const normalizedReviewableId = reviewableId || normalizedLearningItemId;
  const normalizedMaturityXp = Math.max(0, Math.round(Number(maturityXp ?? 0)));
  const normalizedReps = Math.max(0, Math.round(Number(reps ?? repetitions ?? 0) || 0));
  const normalizedState: ReviewSchedulerState = state ?? (normalizedReps > 0 ? "review" : "new");
  const normalizedDifficulty = Math.min(10, Math.max(1, Number(difficulty ?? 5) || 5));
  const normalizedStability = Math.max(0, Number(stability ?? 0) || 0);
  const normalizedDesiredRetention = Math.min(0.99, Math.max(0.5, Number(desiredRetention ?? 0.9) || 0.9));

  return {
    id,
    learningItemId: normalizedLearningItemId,
    reviewableType,
    reviewableId: normalizedReviewableId,
    userId,
    schedulerVersion,
    state: normalizedState,
    dueAt,
    intervalDays,
    ease,
    difficulty: normalizedDifficulty,
    stability: normalizedStability,
    desiredRetention: normalizedDesiredRetention,
    retrievability: retrievability == null ? null : Math.min(1, Math.max(0, Number(retrievability) || 0)),
    reps: normalizedReps,
    repetitions: normalizedReps,
    lapses,
    maturityXp: normalizedMaturityXp,
    maturityBand: getMaturityBand(normalizedMaturityXp),
    lastReviewedAt,
    lastRating,
    preferredVariantLevel: Math.min(3, Math.max(1, Math.round(Number(preferredVariantLevel) || 1))),
    forcedVariantId,
    fallbackUntilCorrect: Boolean(fallbackUntilCorrect),
    lastFailedVariantId,
    previousSuccessfulVariantId,
    intervalMinutes: intervalMinutes == null ? null : Math.max(0, Math.round(Number(intervalMinutes) || 0)),
    learningStepIndex: Math.max(0, Math.round(Number(learningStepIndex) || 0)),
    learningSuccessCount: Math.max(0, Math.round(Number(learningSuccessCount) || 0)),
    firstLearningAt,
    lastLearningStepAt,
    graduatedAt,
    isGraduated: Boolean(isGraduated || graduatedAt),
    sameDaySuccessCount: Math.max(0, Math.round(Number(sameDaySuccessCount) || 0)),
    learningDayKey,
    schedulerParamsJson,
    sourceSchedulerData,
  } as ReviewState;
}

export function normalizeLearningItemState(state: unknown = {}, fallback: unknown = {}): ReviewState {
  const safeState = objectRecord(state) as ReviewStateInput;
  const safeFallback = objectRecord(fallback) as ReviewStateInput;
  return createLearningItemState({
    ...safeFallback,
    ...safeState,
    learningItemId: safeState.learningItemId ?? safeFallback.learningItemId ?? safeState.reviewableId ?? safeFallback.reviewableId ?? "",
    reviewableType: safeState.reviewableType ?? safeFallback.reviewableType ?? "learning_item",
    reviewableId: safeState.reviewableId ?? safeState.learningItemId ?? safeFallback.reviewableId ?? safeFallback.learningItemId ?? "",
  });
}
export function createReviewState(state: unknown = {}): ReviewState {
  const safeState = objectRecord(state) as ReviewStateInput;
  return createLearningItemState({
    ...safeState,
    reviewableType: safeState.reviewableType ?? "card",
    reviewableId: safeState.reviewableId ?? safeState.learningItemId ?? "",
  });
}

export function createSourceDocument({
  id = makeId("doc"),
  ownerId = "local-user",
  fileName = "Dokument",
  mimeType = "text/plain",
  text = "",
  storageUrl = "",
  textExtractionStatus = text ? "success" : "pending",
  metadata = {},
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  revision = 1,
  deletedAt = null,
  updatedByDeviceId = null,
}: SourceDocumentInput = {}): SourceDocument {
  return {
    id,
    ownerId,
    fileName,
    mimeType,
    text,
    storageUrl,
    textExtractionStatus,
    metadata,
    createdAt,
    updatedAt,
    revision,
    deletedAt,
    updatedByDeviceId,
  };
}

export function createSourceAnchor({
  id = makeId("anchor"),
  documentId = null,
  documentName = "",
  cardId = null,
  variantId = null,
  pageNumber = null,
  textQuote = "",
  charStart = null,
  charEnd = null,
  bbox = null,
  confidence = null,
  targetField = "",
  createdAt = new Date().toISOString(),
}: SourceAnchorInput = {}): SourceAnchor {
  return {
    id,
    documentId,
    documentName,
    cardId,
    variantId,
    pageNumber,
    textQuote: String(textQuote ?? "").slice(0, 700),
    charStart,
    charEnd,
    bbox,
    confidence,
    targetField,
    createdAt,
  };
}

export function createVersionEntry({
  id = makeId("version"),
  objectType,
  objectId,
  changeType,
  before = null,
  after = null,
  actorId = "local-user",
  reason = "",
  createdAt = new Date().toISOString(),
}: VersionEntryInput = {}): VersionEntry {
  return {
    id,
    objectType: objectType ?? "unknown",
    objectId: objectId ?? "",
    changeType: changeType ?? "unknown",
    before,
    after,
    actorId,
    reason,
    createdAt,
  };
}

export function createVariantPerformance({
  id = null,
  learningItemId = "",
  variantId = "",
  userId = "local-user",
  attempts = null,
  reviewCount = 0,
  correctCount = 0,
  wrongCount = 0,
  ratingCounts = {},
  againCount = 0,
  hardCount = 0,
  goodCount = 0,
  easyCount = 0,
  avgResponseTimeMs = null,
  averageResponseTimeMs = null,
  lastReviewedAt = null,
  lastRating = null,
  localDifficultyEstimate = null,
  masterySignal = null,
  maturityXp = 0,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
}: VariantPerformanceInput = {}): VariantPerformance {
  const normalizedAttempts = Math.max(0, Number(attempts ?? reviewCount) || 0);
  const normalizedAverageResponseTimeMs = averageResponseTimeMs ?? avgResponseTimeMs;

  return {
    id: id ?? stableContentHash({ learningItemId, variantId, userId }, "variant_perf"),
    learningItemId,
    variantId,
    userId,
    attempts: normalizedAttempts,
    reviewCount: normalizedAttempts,
    correctCount: Math.max(0, Number(correctCount) || 0),
    wrongCount: Math.max(0, Number(wrongCount) || 0),
    ratingCounts: {
      again: Math.max(0, Number(ratingCounts.again ?? againCount) || 0),
      hard: Math.max(0, Number(ratingCounts.hard ?? hardCount) || 0),
      good: Math.max(0, Number(ratingCounts.good ?? goodCount) || 0),
      easy: Math.max(0, Number(ratingCounts.easy ?? easyCount) || 0),
    },
    avgResponseTimeMs: normalizedAverageResponseTimeMs,
    averageResponseTimeMs: normalizedAverageResponseTimeMs,
    lastReviewedAt,
    lastRating,
    localDifficultyEstimate,
    masterySignal,
    maturityXp: Math.max(0, Math.round(Number(maturityXp) || 0)),
    createdAt,
    updatedAt,
  };
}

export function updateVariantPerformance(
  performance: VariantPerformanceInput = {},
  rating: ReviewRating,
  { responseTimeMs = null, reviewedAt = new Date().toISOString(), learningItemId = "", variantId = "" }: {
    responseTimeMs?: number | null;
    reviewedAt?: string;
    learningItemId?: string;
    variantId?: string;
  } = {},
): VariantPerformance {
  if (!rating || !REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  const previous = createVariantPerformance({ ...(performance ?? {}), learningItemId, variantId });
  const attempts = previous.attempts + 1;
  const isCorrect = rating !== "again";
  const previousAverage = Number(previous.avgResponseTimeMs ?? previous.averageResponseTimeMs ?? 0);
  const avgResponseTimeMs =
    responseTimeMs == null
      ? previous.avgResponseTimeMs
      : Math.round(((previousAverage * previous.attempts) + Number(responseTimeMs)) / attempts);
  const localDifficultyEstimate =
    rating === "again" ? "hard" : rating === "hard" ? "medium" : rating === "easy" ? "easy" : previous.localDifficultyEstimate ?? "medium";
  const masterySignal =
    rating === "easy" ? "strong" : rating === "good" ? "steady" : rating === "hard" ? "weak" : "failed";

  return createVariantPerformance({
    ...previous,
    attempts,
    reviewCount: attempts,
    correctCount: previous.correctCount + (isCorrect ? 1 : 0),
    wrongCount: previous.wrongCount + (isCorrect ? 0 : 1),
    ratingCounts: {
      ...previous.ratingCounts,
      [rating]: (previous.ratingCounts?.[rating] ?? 0) + 1,
    },
    avgResponseTimeMs,
    averageResponseTimeMs: avgResponseTimeMs,
    lastReviewedAt: reviewedAt,
    lastRating: rating,
    localDifficultyEstimate,
    masterySignal,
    updatedAt: reviewedAt,
  });
}

export function createVariantReviewEvent({
  id = makeId("review"),
  userId = "local-user",
  deckId = "",
  learningItemId = "",
  variantId = "",
  rating,
  answeredAt = new Date().toISOString(),
  responseTimeMs = null,
  schedulerBefore = null,
  schedulerAfter = null,
  flags = {},
  createdAt = answeredAt,
}: VariantReviewEventInput = {}) {
  if (!rating || !REVIEW_RATINGS.includes(rating)) {
    throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  }

  return {
    id,
    userId,
    deckId,
    learningItemId,
    variantId,
    reviewableType: "variant",
    reviewableId: variantId,
    sourceCardId: learningItemId,
    rating,
    answeredAt,
    responseTimeMs,
    schedulerBefore,
    schedulerAfter,
    flags,
    createdAt,
  };
}
