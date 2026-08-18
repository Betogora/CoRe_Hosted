import {
  Rating,
  State,
  default_w,
  fsrs,
  type Card as FsrsCard,
  type Grade,
  type StepUnit,
} from "ts-fsrs";
import { REVIEW_RATINGS, createReviewState, getMaturityBand, isLearningItemReviewBlocked } from "./coreModel.ts";
import { normalizeLearningSettings } from "./deckSettings.ts";
import type { LearningSettingsInput } from "./deckSettings.ts";
import { hasEasyDayDifferences, selectEasyDayInterval, type EasyDaysSchedulingContext } from "./easyDays.ts";
import { addLearningDays, getLearningDayKey } from "./learningDay.ts";
import type {
  CardVariant,
  CardVariantType,
  Deck,
  LearningItem,
  ReviewRating,
  ReviewSchedulerState,
  ReviewState,
} from "./coreTypes.ts";

type DateInput = string | number | Date;
type ReviewStateInput = Partial<ReviewState>;

interface IntervalInput {
  intervalMinutes?: number | null;
  intervalDays?: number | null;
  intervalMs?: number | null;
}

interface SchedulerContext {
  now?: DateInput;
  dayStartHour?: number;
  timeZone?: string;
  isVariant?: boolean;
  variantId?: string | null;
  variantIsOriginal?: boolean;
  variantLevel?: number;
  variantType?: CardVariantType;
  fallbackVariantId?: string | null;
  deckSettings?: LearningSettingsInput | null;
  reviewEvents?: unknown[];
  easyDaysContext?: EasyDaysSchedulingContext | null;
  [key: string]: unknown;
}

interface RatingSimulationInput extends SchedulerContext {
  learningItem?: LearningItem | null;
  previousState?: ReviewStateInput | null;
  variant?: CardVariant | null;
  rating?: ReviewRating;
  now?: DateInput;
  commit?: boolean;
}

interface ReviewButtonOptions extends SchedulerContext {
  now?: DateInput;
  fallbackVariantIdByRating?: Partial<Record<ReviewRating, string | null>>;
}

interface RatingOutcome {
  rating: ReviewRating;
  label: string;
  effect: string;
  schedulerVersion: string;
  previousReviewState: ReviewState;
  nextReviewState: ReviewState;
  nextLearningItemState: ReviewState;
  nextState: ReviewSchedulerState;
  dueAt: string;
  intervalDays: number;
  intervalMinutes: number | null;
  intervalMs: number;
  intervalLabel: string;
  nextMaturity: { stage: string; label: string };
  fallbackEffect: {
    fallbackUntilCorrect: boolean;
    forcedVariantId: string | null;
    lastFailedVariantId: string | null;
  };
  commit: boolean;
}

type ReviewButtonOption = Pick<RatingOutcome,
  "rating" | "label" | "intervalLabel" | "dueAt" | "nextState" | "nextMaturity" | "schedulerVersion" | "effect" | "intervalDays" | "intervalMinutes"
>;

export const SCHEDULER_VERSION = "fsrs_6_v1";
export const FSRS_SCHEDULER_VERSION = SCHEDULER_VERSION;
export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const FSRS_IMPLEMENTATION = "ts-fsrs@5.4.1";

const RATING_LABELS: Record<ReviewRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const RATING_EFFECT_LABELS: Record<ReviewRating, string> = {
  again: "Wiederholen",
  hard: "Schwer",
  good: "Normal",
  easy: "Leicht",
};

const RATING_XP: Record<ReviewRating, number> = {
  again: -18,
  hard: 2,
  good: 12,
  easy: 18,
};

const FSRS_RATINGS: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const TO_FSRS_STATE: Record<ReviewSchedulerState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const FROM_FSRS_STATE: Record<State, ReviewSchedulerState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

function clamp(value: unknown, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value)));
}

function round(value: unknown, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function validDate(value: DateInput | null | undefined, fallback: Date): Date {
  const date = value == null ? fallback : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function getSchedulerProfile(deckSettings: LearningSettingsInput = {}) {
  return normalizeLearningSettings(deckSettings).schedulerProfile;
}

function getDesiredRetention(deckSettings: LearningSettingsInput | null | undefined, state: ReviewStateInput): number {
  const configuredRetention = deckSettings?.schedulerProfile?.desiredRetention;
  return configuredRetention == null
    ? clamp(state?.desiredRetention ?? 0.9, 0.7, 0.99)
    : getSchedulerProfile(deckSettings ?? {}).desiredRetention;
}

function intervalParts({ intervalMinutes = null, intervalDays = null, intervalMs = null }: IntervalInput = {}) {
  if (intervalMs !== null && intervalMs !== undefined && Number.isFinite(Number(intervalMs))) {
    const ms = Math.max(0, Number(intervalMs));
    return {
      intervalMs: ms,
      intervalMinutes: Math.round(ms / MINUTE_MS),
      intervalDays: ms >= DAY_MS ? round(ms / DAY_MS, 2) : 0,
    };
  }

  if (intervalMinutes !== null && intervalMinutes !== undefined && Number.isFinite(Number(intervalMinutes))) {
    const minutes = Math.max(0, Math.round(Number(intervalMinutes)));
    return {
      intervalMs: minutes * MINUTE_MS,
      intervalMinutes: minutes,
      intervalDays: minutes >= 24 * 60 ? round(minutes / (24 * 60), 2) : 0,
    };
  }

  const days = Math.max(0, Number(intervalDays ?? 0) || 0);
  return {
    intervalMs: days * DAY_MS,
    intervalMinutes: Math.round(days * 24 * 60),
    intervalDays: days,
  };
}

export function formatIntervalLabel(input: number | IntervalInput = {}): string {
  const parts = typeof input === "number" ? intervalParts({ intervalDays: input }) : intervalParts(input);
  const minutes = Math.max(0, Math.round(parts.intervalMs / MINUTE_MS));

  if (minutes < 60) return `${Math.max(1, minutes)} Min.`;
  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "1 Std." : `${hours} Std.`;
  }

  const days = Math.round(minutes / (24 * 60));
  if (days < 30) return days === 1 ? "1 Tag" : `${days} Tage`;

  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? "1 Monat" : `${months} Monate`;
}

function getStateReps(state: ReviewStateInput): number {
  return Math.max(0, Math.round(Number(state.reps ?? state.repetitions ?? 0) || 0));
}

function phaseForState(state: ReviewStateInput): ReviewSchedulerState {
  return state.state ?? (getStateReps(state) > 0 ? "review" : "new");
}

function toFsrsCard(state: ReviewState, now: Date): FsrsCard {
  const phase = phaseForState(state);
  const reps = getStateReps(state);
  const lastReview = state.lastReviewedAt ? validDate(state.lastReviewedAt, now) : undefined;
  const storedStability = Number(state.stability ?? 0) || 0;
  const migratedStability = Math.max(0.1, Number(state.intervalDays ?? 0) || 1);
  return {
    due: validDate(state.dueAt, now),
    stability: phase === "new" && reps === 0 ? 0 : storedStability > 0 ? storedStability : migratedStability,
    difficulty: phase === "new" && reps === 0 ? 0 : clamp(state.difficulty ?? 5, 1, 10),
    elapsed_days: lastReview ? Math.max(0, round((now.getTime() - lastReview.getTime()) / DAY_MS, 8)) : 0,
    scheduled_days: Math.max(0, Math.round(Number(state.intervalDays ?? 0) || 0)),
    learning_steps: Math.max(0, Math.round(Number(state.learningStepIndex ?? 0) || 0)),
    reps,
    lapses: Math.max(0, Math.round(Number(state.lapses ?? 0) || 0)),
    state: TO_FSRS_STATE[phase],
    last_review: lastReview,
  };
}

function createFsrsScheduler(deckSettings: LearningSettingsInput | null | undefined, state: ReviewStateInput) {
  const profile = getSchedulerProfile(deckSettings ?? {});
  const requestRetention = getDesiredRetention(deckSettings, state);
  const learningSteps = profile.learningStepsMinutes.map((minutes) => `${minutes}m` as StepUnit);
  const relearningSteps = [`${profile.relearningStepMinutes}m` as StepUnit];
  const scheduler = fsrs({
    w: default_w,
    request_retention: requestRetention,
    maximum_interval: profile.maximumIntervalDays,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: learningSteps,
    relearning_steps: relearningSteps,
  });
  return { scheduler, profile, requestRetention, learningSteps, relearningSteps };
}

export function calculateRetrievability(learningItemState: unknown, now: DateInput = new Date()): number {
  const state = createReviewState(learningItemState);
  if (phaseForState(state) === "new" || getStateReps(state) === 0 || Number(state.stability ?? 0) <= 0 || !state.lastReviewedAt) return 0;
  const nowDate = validDate(now, new Date());
  const { scheduler } = createFsrsScheduler(null, state);
  return round(scheduler.get_retrievability(toFsrsCard(state, nowDate), nowDate, false), 4);
}

export function getSchedulerStateForItem(item: LearningItem): ReviewState {
  const rawState = item?.learningItemState ?? item?.reviewState ?? {};
  return createReviewState({
    ...rawState,
    schedulerVersion: rawState.schedulerVersion ?? FSRS_SCHEDULER_VERSION,
    learningItemId: rawState.learningItemId ?? item?.id ?? rawState.reviewableId ?? "",
    reviewableType: rawState.reviewableType ?? "card",
    reviewableId: rawState.reviewableId ?? item?.id ?? rawState.learningItemId ?? "",
  });
}

export function updateMaturityXp(oldXp: unknown, rating: ReviewRating, wasVariant = false): number {
  if (!REVIEW_RATINGS.includes(rating)) throw new Error(`Unbekannte Review-Bewertung: ${rating}`);
  const variantBonus = wasVariant && (rating === "good" || rating === "easy") ? 4 : 0;
  return Math.max(0, Math.round(Number(oldXp ?? 0) + RATING_XP[rating] + variantBonus));
}

function nextPreferredVariantLevel(oldState: ReviewStateInput, rating: ReviewRating, context: SchedulerContext = {}): number {
  const currentLevel = Math.min(3, Math.max(1, Number(oldState.preferredVariantLevel ?? context.variantLevel ?? 1) || 1));
  if (rating === "again" || rating === "hard") return Math.max(1, currentLevel - 1);
  return Math.min(3, currentLevel + 1);
}

function fallbackStateForRating(state: ReviewStateInput, rating: ReviewRating, context: SchedulerContext = {}) {
  const shouldClearFallback =
    rating !== "again" &&
    Boolean(state.fallbackUntilCorrect) &&
    (!state.forcedVariantId || state.forcedVariantId === context.variantId || context.variantIsOriginal);
  const nextForcedVariantId =
    rating === "again"
      ? context.fallbackVariantId ?? state.forcedVariantId ?? null
      : shouldClearFallback
        ? null
        : state.forcedVariantId ?? null;

  return {
    forcedVariantId: nextForcedVariantId,
    fallbackUntilCorrect: rating === "again" ? Boolean(context.fallbackVariantId) : shouldClearFallback ? false : Boolean(state.fallbackUntilCorrect),
    lastFailedVariantId: rating === "again" ? context.variantId ?? state.lastFailedVariantId ?? null : state.lastFailedVariantId ?? null,
    previousSuccessfulVariantId: rating === "again" ? state.previousSuccessfulVariantId ?? null : context.variantId ?? state.previousSuccessfulVariantId ?? null,
  };
}

function deriveOutcomeMaturity(state: ReviewStateInput): { stage: string; label: string } {
  const reps = getStateReps(state);
  const successfulReviews = Math.max(0, reps - Number(state.lapses ?? 0));
  const stability = Number(state.stability ?? 0) || 0;
  const intervalDays = Number(state.intervalDays ?? 0) || 0;
  const recentFailure = state.lastRating === "again" || state.fallbackUntilCorrect;

  if (state.state === "relearning" || state.lastRating === "again") return { stage: "relearning", label: "Wiederlernen" };
  if (state.state === "new" || reps === 0) return { stage: "new", label: "Neu" };
  if (state.state === "learning") return { stage: "learning", label: "Lernen" };
  if (state.state === "review") {
    if ((stability >= 30 || intervalDays >= 21) && !recentFailure) return { stage: "mastered", label: "Sicher" };
    if ((stability >= 10 || intervalDays >= 7 || successfulReviews >= 4) && !recentFailure) return { stage: "mature", label: "Reif" };
    if ((stability >= 4 || successfulReviews >= 3) && !recentFailure) return { stage: "variant_ready", label: "Bereit für Varianten" };
    return { stage: "early_review", label: "Frühes Review" };
  }
  return { stage: "new", label: "Neu" };
}

function learningProgress(previousState: ReviewState, nextPhase: ReviewSchedulerState, rating: ReviewRating, nextStep: number, now: Date, context: SchedulerContext) {
  const previousPhase = phaseForState(previousState);
  const isLearningFlow = previousPhase === "new" || previousPhase === "learning";
  const previousSuccess = Math.max(0, Number(previousState.learningSuccessCount ?? previousState.sameDaySuccessCount ?? 0) || 0);
  if (!isLearningFlow) {
    return {
      learningStepIndex: nextStep,
      learningSuccessCount: previousSuccess,
      sameDaySuccessCount: previousSuccess,
      learningDayKey: previousState.learningDayKey,
      firstLearningAt: previousState.firstLearningAt,
      lastLearningStepAt: previousState.lastLearningStepAt,
      isGraduated: previousState.isGraduated,
      graduatedAt: previousState.graduatedAt,
    };
  }

  const successCount = rating === "again"
    ? 0
    : rating === "hard"
      ? previousSuccess
      : nextPhase === "review"
        ? Math.max(2, previousSuccess + 1)
        : previousSuccess + 1;
  const graduated = nextPhase === "review";
  return {
    learningStepIndex: nextStep,
    learningSuccessCount: successCount,
    sameDaySuccessCount: successCount,
    learningDayKey: getLearningDayKey(now, context) ?? now.toISOString().slice(0, 10),
    firstLearningAt: previousState.firstLearningAt ?? now.toISOString(),
    lastLearningStepAt: now.toISOString(),
    isGraduated: graduated || previousState.isGraduated,
    graduatedAt: graduated ? previousState.graduatedAt ?? now.toISOString() : previousState.graduatedAt,
  };
}

function projectFsrsResult(
  previousState: ReviewState,
  nextCard: FsrsCard,
  rating: ReviewRating,
  now: Date,
  context: SchedulerContext,
  schedulerMeta: ReturnType<typeof createFsrsScheduler>,
  fsrsInputCard: FsrsCard,
): ReviewState {
  const nextPhase = FROM_FSRS_STATE[nextCard.state];
  const rawIntervalDays = nextCard.scheduled_days;
  const intervalDays = phaseForState(previousState) === "review" && nextPhase === "review"
    ? selectEasyDayInterval({
      rawIntervalDays,
      elapsedDays: fsrsInputCard.elapsed_days,
      maximumIntervalDays: schedulerMeta.profile.maximumIntervalDays,
      now,
      context: context.easyDaysContext,
    })
    : rawIntervalDays;
  const usesEasyDayCalendar = Boolean(
    context.easyDaysContext
    && rawIntervalDays >= 3
    && rawIntervalDays <= 90
    && hasEasyDayDifferences(context.easyDaysContext.easyDays),
  );
  const adjustedDueAt = usesEasyDayCalendar
    ? addLearningDays(now, intervalDays, context.easyDaysContext ?? undefined)
    : nextCard.due;
  const dueAt = (adjustedDueAt ?? nextCard.due).toISOString();
  const intervalMs = Math.max(0, new Date(dueAt).getTime() - now.getTime());
  const intervalMinutes = intervalDays === 0 ? Math.round(intervalMs / MINUTE_MS) : null;
  const maturityXp = updateMaturityXp(previousState.maturityXp, rating, Boolean(context.isVariant));
  const fallback = fallbackStateForRating(previousState, rating, context);
  const retrievabilityBefore = calculateRetrievability(previousState, now);
  const progress = learningProgress(previousState, nextPhase, rating, nextCard.learning_steps, now, context);

  return createReviewState({
    ...previousState,
    ...fallback,
    ...progress,
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    state: nextPhase,
    dueAt,
    intervalDays,
    intervalMinutes,
    difficulty: nextCard.difficulty,
    stability: nextCard.stability,
    desiredRetention: schedulerMeta.requestRetention,
    retrievability: 1,
    reps: nextCard.reps,
    repetitions: nextCard.reps,
    lapses: nextCard.lapses,
    maturityXp,
    maturityBand: getMaturityBand(maturityXp),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
    preferredVariantLevel: nextPhase === "learning" || nextPhase === "relearning" ? 1 : nextPreferredVariantLevel(previousState, rating, context),
    schedulerParamsJson: {
      schedulerVersion: FSRS_SCHEDULER_VERSION,
      schedulerKind: "fsrs_6_default",
      implementation: FSRS_IMPLEMENTATION,
      parameterSource: "official_default",
      weights: [...default_w],
      rating,
      desiredRetention: schedulerMeta.requestRetention,
      maximumIntervalDays: schedulerMeta.profile.maximumIntervalDays,
      learningSteps: schedulerMeta.learningSteps,
      relearningSteps: schedulerMeta.relearningSteps,
      retrievabilityBefore,
      variantLevel: context.variantLevel ?? null,
      variantType: context.variantType ?? null,
      fallbackVariantId: fallback.forcedVariantId,
      easyDays: {
        applied: intervalDays !== rawIntervalDays,
        rawIntervalDays,
        selectedIntervalDays: intervalDays,
      },
    },
  });
}

export function simulateRatingOutcome({
  learningItem = null,
  previousState = null,
  variant = null,
  rating,
  now = new Date().toISOString(),
  reviewEvents = [],
  deckSettings = null,
  commit = false,
  ...context
}: RatingSimulationInput = {}): RatingOutcome {
  if (!rating || !REVIEW_RATINGS.includes(rating)) throw new Error(`Unbekannte Review-Bewertung: ${rating}`);

  const nowDate = validDate(now, new Date());
  const state = previousState
    ? createReviewState(previousState)
    : learningItem
      ? getSchedulerStateForItem(learningItem)
      : createReviewState({});
  const variantContext = {
    ...context,
    deckSettings,
    reviewEvents,
    isVariant: context.isVariant ?? Boolean(variant && !variant.isOriginal),
    variantId: context.variantId ?? variant?.id ?? null,
    variantIsOriginal: context.variantIsOriginal ?? Boolean(variant?.isOriginal),
    variantLevel: context.variantLevel ?? variant?.variantLevel ?? 1,
    variantType: context.variantType ?? variant?.variantType ?? "basic",
  };
  const schedulerMeta = createFsrsScheduler(deckSettings, state);
  const fsrsInputCard = toFsrsCard(state, nowDate);
  const result = schedulerMeta.scheduler.next(fsrsInputCard, nowDate, FSRS_RATINGS[rating]);
  const nextReviewState = projectFsrsResult(state, result.card, rating, nowDate, variantContext, schedulerMeta, fsrsInputCard);
  const interval = intervalParts({
    intervalMinutes: nextReviewState.intervalMinutes,
    intervalDays: nextReviewState.intervalMinutes == null ? nextReviewState.intervalDays : null,
  });

  return {
    rating,
    label: RATING_LABELS[rating],
    effect: RATING_EFFECT_LABELS[rating],
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    previousReviewState: state,
    nextReviewState,
    nextLearningItemState: nextReviewState,
    nextState: nextReviewState.state,
    dueAt: nextReviewState.dueAt,
    intervalDays: nextReviewState.intervalDays,
    intervalMinutes: nextReviewState.intervalMinutes,
    intervalMs: interval.intervalMs,
    intervalLabel: formatIntervalLabel(interval),
    nextMaturity: deriveOutcomeMaturity(nextReviewState),
    fallbackEffect: {
      fallbackUntilCorrect: nextReviewState.fallbackUntilCorrect,
      forcedVariantId: nextReviewState.forcedVariantId,
      lastFailedVariantId: nextReviewState.lastFailedVariantId,
    },
    commit: Boolean(commit),
  };
}

export function getReviewButtonOptions(
  learningItem: LearningItem,
  variant: CardVariant | null = null,
  nowOrOptions: DateInput | ReviewButtonOptions = new Date().toISOString(),
  reviewEvents: unknown[] = [],
) {
  const options = typeof nowOrOptions === "object" && nowOrOptions !== null && !(nowOrOptions instanceof Date)
    ? nowOrOptions
    : { now: nowOrOptions, reviewEvents };
  const now = options.now ?? new Date().toISOString();
  const events = options.reviewEvents ?? reviewEvents ?? [];
  const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];

  return ratings.reduce<Partial<Record<ReviewRating, ReviewButtonOption>>>((result, rating) => {
    const fallbackVariantId = rating === "again"
      ? options.fallbackVariantIdByRating?.[rating] ?? options.fallbackVariantId ?? null
      : null;
    const outcome = simulateRatingOutcome({
      learningItem,
      variant,
      rating,
      now,
      reviewEvents: events,
      deckSettings: options.deckSettings,
      dayStartHour: options.dayStartHour,
      timeZone: options.timeZone,
      easyDaysContext: options.easyDaysContext,
      fallbackVariantId,
    });
    result[rating] = {
      rating,
      label: outcome.label,
      intervalLabel: outcome.intervalLabel,
      dueAt: outcome.dueAt,
      nextState: outcome.nextState,
      nextMaturity: outcome.nextMaturity,
      schedulerVersion: outcome.schedulerVersion,
      effect: outcome.effect,
      intervalDays: outcome.intervalDays,
      intervalMinutes: outcome.intervalMinutes,
    };
    return result;
  }, {});
}

export function scheduleWithFsrs(previousState: ReviewStateInput, rating: ReviewRating, context: SchedulerContext = {}): ReviewState {
  return simulateRatingOutcome({
    previousState,
    rating,
    now: context.now ?? new Date().toISOString(),
    deckSettings: context.deckSettings,
    ...context,
  }).nextReviewState;
}

export function applyReviewRating(reviewState: ReviewStateInput, rating: ReviewRating, context: SchedulerContext = {}): ReviewState {
  return scheduleWithFsrs(reviewState, rating, context);
}

export function listReviewableCards(deck: Deck): LearningItem[] {
  return (deck.cards ?? []).filter((card) => card.status !== "deleted" && card.draftStatus !== "draft");
}

export function summarizeDeckReview(deck: Deck, now: DateInput = new Date(), dayOptions: { dayStartHour?: number; timeZone?: string } = {}) {
  const cards = listReviewableCards(deck).filter((card) => !isLearningItemReviewBlocked(card));
  const currentDayKey = getLearningDayKey(now, dayOptions);
  let dueCards = 0;
  let newCards = 0;
  let inProgressCards = 0;
  for (const card of cards) {
    const state = getSchedulerStateForItem(card);
    if (state.state === "new") {
      newCards += 1;
    } else if (state.state === "learning" || state.state === "relearning") {
      inProgressCards += 1;
    } else if (state.state === "review" && currentDayKey) {
      const dueDayKey = getLearningDayKey(state.dueAt, dayOptions);
      if (dueDayKey && dueDayKey <= currentDayKey) {
        dueCards += 1;
      }
    }
  }
  const matureCards = cards.filter((card) => ["variant_ready", "mastered"].includes(card.reviewState?.maturityBand));
  const activeVariants = cards
    .flatMap((card) => card.variants ?? [])
    .filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false && !variant.isOriginal);
  return {
    totalCards: cards.length,
    dueCards,
    newCards,
    inProgressCards,
    matureCards: matureCards.length,
    activeVariants: activeVariants.length,
    averageMaturityXp: cards.length
      ? Math.round(cards.reduce((sum, card) => sum + Number(card.reviewState?.maturityXp ?? 0), 0) / cards.length)
      : 0,
  };
}
