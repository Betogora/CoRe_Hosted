import {
  Rating,
  State,
  dateChrono,
  defineScheduler,
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware,
  type Grade,
  type StepUnit,
} from "ts-fsrs";
import { FSRS7Model, migrateFSRS7Parameters } from "ts-fsrs/models/fsrs-7";
import { REVIEW_RATINGS, createReviewState, isCardReviewBlocked, reviewStateFromCardStudy } from "./coreModel.ts";
import { normalizeLearningSettings } from "./deckSettings.ts";
import type { LearningSettingsInput } from "./deckSettings.ts";
import { hasEasyDayDifferences, selectEasyDayInterval, type EasyDaysSchedulingContext } from "./easyDays.ts";
import { addLearningDays, getLearningDayKey } from "./learningDay.ts";
import type {
  Card,
  CardVariant,
  Deck,
  MaturityBand,
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
  deckSettings?: LearningSettingsInput | null;
  easyDaysContext?: EasyDaysSchedulingContext | null;
  [key: string]: unknown;
}

interface RatingSimulationInput extends SchedulerContext {
  card?: Card | null;
  previousState?: ReviewStateInput | null;
  variant?: CardVariant | null;
  rating?: ReviewRating;
  now?: DateInput;
  commit?: boolean;
}

interface ReviewButtonOptions extends SchedulerContext {
  now?: DateInput;
}

interface RatingOutcome {
  rating: ReviewRating;
  label: string;
  effect: string;
  schedulerVersion: string;
  previousReviewState: ReviewState;
  nextReviewState: ReviewState;
  nextState: ReviewSchedulerState;
  dueAt: string;
  intervalDays: number;
  intervalMinutes: number | null;
  intervalMs: number;
  intervalLabel: string;
  commit: boolean;
}

type ReviewButtonOption = Pick<RatingOutcome,
  "rating" | "label" | "intervalLabel" | "dueAt" | "nextState" | "schedulerVersion" | "effect" | "intervalDays" | "intervalMinutes"
>;

export const SCHEDULER_VERSION = "fsrs_7_v1";
const FSRS_SCHEDULER_VERSION = SCHEDULER_VERSION;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const FSRS_RATINGS: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

type FsrsState = (typeof State)[keyof typeof State];

const TO_FSRS_STATE: Record<ReviewSchedulerState, FsrsState> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const FROM_FSRS_STATE: Record<FsrsState, ReviewSchedulerState> = {
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
    ? clamp(state?.desiredRetention ?? 0.92, 0.7, 0.99)
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

function formatIntervalLabel(input: number | IntervalInput = {}): string {
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
  return Math.max(0, Math.round(Number(state.reps ?? 0) || 0));
}

function phaseForState(state: ReviewStateInput): ReviewSchedulerState {
  return state.state ?? (getStateReps(state) > 0 ? "review" : "new");
}

/** Same middleware chain as `ts-fsrs`' `DefaultScheduler`, built synchronously because the FSRS-7 model is imported statically. */
const fsrs7Definition = defineScheduler({ model: FSRS7Model, chrono: dateChrono }).use(
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
);
type FsrsScheduler = ReturnType<typeof fsrs7Definition.create>;
type FsrsCard = Parameters<FsrsScheduler["review"]>[0]["card"];
const FSRS7_WEIGHTS = migrateFSRS7Parameters();

function toFsrsCard(state: ReviewState, now: Date): FsrsCard {
  const phase = phaseForState(state);
  const reps = getStateReps(state);
  const isNew = phase === "new" && reps === 0;
  const storedStability = Number(state.stability ?? 0) || 0;
  const stability = isNew ? 0 : storedStability > 0 ? storedStability : Math.max(0.1, Number(state.intervalDays ?? 0) || 1);
  const storedFastStability = Number(state.stabilityFast ?? 0) || 0;
  return {
    stability,
    // A memory state without the FSRS-7 fast trace (Anki's FSRS-6 state without history) starts both traces equal.
    stabilityFast: isNew ? 0 : storedFastStability > 0 ? storedFastStability : stability,
    difficulty: isNew ? 0 : clamp(state.difficulty ?? 5, 1, 10),
    state: TO_FSRS_STATE[phase],
    scheduleStatus: phase === "new" ? "new" : phase === "review" ? "review" : "learning",
    dueAt: validDate(state.dueAt, now),
    // Without a review time, or one stamped after `now` (clock skew between devices), the card counts as just answered.
    lastReviewAt: isNew ? null : new Date(Math.min(validDate(state.lastReviewedAt, now).getTime(), now.getTime())),
    cardId: "core-card",
    reps,
    lapses: Math.max(0, Math.round(Number(state.lapses ?? 0) || 0)),
    scheduledDays: Math.max(0, Number(state.intervalDays ?? 0) || 0),
    learningStep: Math.max(0, Math.round(Number(state.learningStepIndex ?? 0) || 0)),
  };
}

/** FSRS schedulers are stateless per configuration, so each configuration is built once. */
const fsrsSchedulers = new Map<string, FsrsScheduler>();

function createFsrsScheduler(deckSettings: LearningSettingsInput | null | undefined, state: ReviewStateInput) {
  const profile = getSchedulerProfile(deckSettings ?? {});
  const requestRetention = getDesiredRetention(deckSettings, state);
  const learningSteps = profile.learningStepsMinutes.map((minutes) => `${minutes}m` as StepUnit);
  const relearningSteps = [`${profile.relearningStepMinutes}m` as StepUnit];
  const key = [requestRetention, profile.maximumIntervalDays, learningSteps.join(","), relearningSteps.join(",")].join("|");
  let scheduler = fsrsSchedulers.get(key);
  if (!scheduler) {
    if (fsrsSchedulers.size >= 256) fsrsSchedulers.clear();
    scheduler = fsrs7Definition.create({
      config: {
        fractionalDays: true,
        weights: FSRS7_WEIGHTS,
        enableShortTerm: true,
        desiredRetention: requestRetention,
        learningSteps,
        relearningSteps,
        // Configured learning steps take precedence over a longer model interval, as in Anki.
        allowModelOverride: false,
        enableFuzz: false,
        maximumInterval: profile.maximumIntervalDays,
      },
    });
    fsrsSchedulers.set(key, scheduler);
  }
  return { scheduler, profile, requestRetention, learningSteps, relearningSteps };
}

export function calculateRetrievability(studyState: unknown, now: DateInput = new Date()): number {
  const state = createReviewState(studyState);
  if (phaseForState(state) === "new" || getStateReps(state) === 0 || Number(state.stability ?? 0) <= 0 || !state.lastReviewedAt) return 0;
  const nowDate = validDate(now, new Date());
  const { scheduler } = createFsrsScheduler(null, state);
  const elapsedDays = Math.max(0, scheduler.chrono.difference(validDate(state.lastReviewedAt, nowDate), nowDate));
  return round(scheduler.model.forgettingCurve(toFsrsCard(state, nowDate), elapsedDays), 4);
}

type MemoryStateInput = Pick<ReviewStateInput, "state" | "stability" | "stabilityFast" | "difficulty">;

/** Durability from which a card counts as mature. */
const MATURE_DURABILITY_DAYS = 21;

/** Days until the card's recall probability falls to 90 %; 0 while it has no memory state yet. */
export function getDurabilityDays(study: MemoryStateInput): number {
  const stability = Number(study.stability ?? 0) || 0;
  if (!study.state || study.state === "new" || stability <= 0) return 0;
  const stabilityFast = Number(study.stabilityFast ?? 0) || stability;
  const { scheduler } = createFsrsScheduler(null, {});
  return round(scheduler.model.nextInterval({ stability, stabilityFast, difficulty: clamp(study.difficulty ?? 5, 1, 10) }, 0.9), 2);
}

/** Maturity derived from the memory state; never counted separately. */
export function getMaturityBand(study: MemoryStateInput): MaturityBand {
  if (!study.state || study.state === "new") return "new";
  if (study.state !== "review") return "learning";
  return getDurabilityDays(study) >= MATURE_DURABILITY_DAYS ? "mature" : "young";
}

function learningProgress(previousState: ReviewState, nextPhase: ReviewSchedulerState, rating: ReviewRating, nextStep: number, now: Date, context: SchedulerContext) {
  const previousPhase = phaseForState(previousState);
  const isLearningFlow = previousPhase === "new" || previousPhase === "learning";
  const previousSuccess = Math.max(0, Number(previousState.learningSuccessCount ?? 0) || 0);
  if (!isLearningFlow) {
    return {
      learningStepIndex: nextStep,
      learningSuccessCount: previousSuccess,
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
): ReviewState {
  const nextPhase = FROM_FSRS_STATE[nextCard.state];
  // FSRS-7 schedules fractional days; intervals below one day are shown in minutes.
  const rawIntervalDays = nextCard.scheduledDays >= 1 ? round(nextCard.scheduledDays, 2) : 0;
  const calendarDays = Math.round(rawIntervalDays);
  const usesEasyDayCalendar = Boolean(
    context.easyDaysContext
    && calendarDays >= 3
    && calendarDays <= 90
    && hasEasyDayDifferences(context.easyDaysContext.easyDays),
  );
  const intervalDays = !usesEasyDayCalendar
    ? rawIntervalDays
    : phaseForState(previousState) === "review" && nextPhase === "review"
      ? selectEasyDayInterval({
        rawIntervalDays,
        elapsedDays: previousState.lastReviewedAt ? Math.max(0, (now.getTime() - validDate(previousState.lastReviewedAt, now).getTime()) / DAY_MS) : 0,
        maximumIntervalDays: schedulerMeta.profile.maximumIntervalDays,
        now,
        context: context.easyDaysContext,
      })
      : calendarDays;
  const dueAt = (usesEasyDayCalendar
    ? addLearningDays(now, intervalDays, context.easyDaysContext ?? undefined) ?? nextCard.dueAt
    : nextCard.dueAt).toISOString();
  const intervalMs = Math.max(0, new Date(dueAt).getTime() - now.getTime());
  const intervalMinutes = intervalDays === 0 ? Math.round(intervalMs / MINUTE_MS) : null;
  const progress = learningProgress(previousState, nextPhase, rating, nextCard.learningStep ?? 0, now, context);

  return createReviewState({
    ...previousState,
    ...progress,
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    state: nextPhase,
    dueAt,
    intervalDays,
    intervalMinutes,
    difficulty: nextCard.difficulty,
    stability: nextCard.stability,
    stabilityFast: nextCard.stabilityFast,
    desiredRetention: schedulerMeta.requestRetention,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    maturityBand: getMaturityBand({ state: nextPhase, stability: nextCard.stability, stabilityFast: nextCard.stabilityFast, difficulty: nextCard.difficulty }),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
  });
}

export function simulateRatingOutcome({
  card = null,
  previousState = null,
  variant = null,
  rating,
  now = new Date().toISOString(),
  deckSettings = null,
  commit = false,
  ...context
}: RatingSimulationInput = {}): RatingOutcome {
  if (!rating || !REVIEW_RATINGS.includes(rating)) throw new Error(`Unbekannte Review-Bewertung: ${rating}`);

  const nowDate = validDate(now, new Date());
  const state = previousState
    ? createReviewState(previousState)
    : card
      ? reviewStateFromCardStudy(card.study)
      : createReviewState({});
  const variantContext = {
    ...context,
    deckSettings,
    isVariant: context.isVariant ?? Boolean(variant),
  };
  const schedulerMeta = createFsrsScheduler(deckSettings, state);
  const result = schedulerMeta.scheduler.review({ card: toFsrsCard(state, nowDate), grade: FSRS_RATINGS[rating], now: nowDate });
  const nextReviewState = projectFsrsResult(state, result.card, rating, nowDate, variantContext, schedulerMeta);
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
    nextState: nextReviewState.state,
    dueAt: nextReviewState.dueAt,
    intervalDays: nextReviewState.intervalDays,
    intervalMinutes: nextReviewState.intervalMinutes,
    intervalMs: interval.intervalMs,
    intervalLabel: formatIntervalLabel(interval),
    commit: Boolean(commit),
  };
}

export function getReviewButtonOptions(
  card: Card,
  variant: CardVariant | null = null,
  nowOrOptions: DateInput | ReviewButtonOptions = new Date().toISOString(),
) {
  const options: ReviewButtonOptions = typeof nowOrOptions === "object" && nowOrOptions !== null && !(nowOrOptions instanceof Date)
    ? nowOrOptions
    : { now: nowOrOptions };
  const now = options.now ?? new Date().toISOString();
  const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];

  return ratings.reduce<Partial<Record<ReviewRating, ReviewButtonOption>>>((result, rating) => {
    const outcome = simulateRatingOutcome({
      card,
      variant,
      rating,
      now,
      deckSettings: options.deckSettings,
      dayStartHour: options.dayStartHour,
      timeZone: options.timeZone,
      easyDaysContext: options.easyDaysContext,
    });
    result[rating] = {
      rating,
      label: outcome.label,
      intervalLabel: outcome.intervalLabel,
      dueAt: outcome.dueAt,
      nextState: outcome.nextState,
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

export function listReviewableCards(deck: Deck): Card[] {
  return (deck.cards ?? []).filter((card) => card.deletedAt === null);
}

export function summarizeDeckReview(deck: Deck, now: DateInput = new Date(), dayOptions: { dayStartHour?: number; timeZone?: string } = {}) {
  const cards = (deck.cards ?? []).filter((card) => !isCardReviewBlocked(card));
  const currentDayKey = getLearningDayKey(now, dayOptions);
  let dueCards = 0;
  let newCards = 0;
  let inProgressCards = 0;
  for (const card of cards) {
    const state = card.study;
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
  const matureCards = cards.filter((card) => card.study.extra.maturityBand === "mature");
  const activeVariants = cards
    .flatMap((card) => card.variants ?? [])
    .filter((variant) => variant.qualityStatus === "active" && variant.isActive !== false);
  return {
    totalCards: cards.length,
    dueCards,
    newCards,
    inProgressCards,
    matureCards: matureCards.length,
    activeVariants: activeVariants.length,
  };
}
