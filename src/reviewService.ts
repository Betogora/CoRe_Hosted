import { SCHEDULER_VERSION, calculateRetrievability, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.ts";
import {
  createVariantReviewModel,
  deactivateVariant,
  flagVariant,
  getVariantFallbackTarget,
  selectAutomaticReviewVariant,
} from "./coreVariantService.ts";
import {
  cardStudyFromReviewState,
  createDefaultDeckSettings,
  isCardReviewBlocked,
  makeId,
  reviewStateFromCardStudy,
  stableContentHash,
  updateVariantPerformance,
} from "./coreModel.ts";
import type {
  Card,
  CardStudyState,
  CardVariant,
  Deck,
  LearningSettings,
  NewReviewOrder,
  ReviewRating,
  ReviewEvent,
  ReviewState,
  VariantFeedbackType,
} from "./coreTypes.ts";
import { getLearningDayKey, getLearningDayRange } from "./learningDay.ts";
import { normalizeLearnAheadMinutes } from "./learningProfiles.ts";
import type { EasyDaysSchedulingContext } from "./easyDays.ts";

type DateInput = string | number | Date;

type ReviewEventInput = Partial<ReviewEvent>;

interface ReviewServiceOptions {
  now?: DateInput;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  timeZone?: string;
  updatedAt?: string;
  dateKey?: string;
  deckId?: string | null;
  excludeKeys?: string[];
  variantSession?: boolean;
  language?: string;
  autoGenerateAllowed?: boolean;
  responseTimeMs?: number | null;
  flags?: Record<string, unknown>;
  selectedBy?: string;
  queueKind?: string | null;
  action?: "disable" | "flag";
  reason?: string;
  feedbackType?: VariantFeedbackType;
  note?: string;
  reviewEvents?: unknown[];
  easyDaysContext?: EasyDaysSchedulingContext | null;
  sessionIndex?: DailyReviewSessionIndex;
  /** Cards answered today that may not be loaded, so their siblings stay buried for the whole learning day. */
  answeredToday?: readonly AnsweredTodayCard[];
}

export interface AnsweredTodayCard {
  cardId: string;
  noteId: string;
  deckId: string;
}

type SiblingBuryMode = Pick<LearningSettings, "buryNewSiblings" | "buryReviewSiblings" | "buryInterdayLearningSiblings">;

interface QueueEntry {
  deck: Deck;
  card: Card;
  key: string;
}

export interface DailyReviewQueueEntry {
  deckId: string;
  cardId: string;
  key: string;
  queueKind: "new" | "due";
}

interface DailyReviewSessionIndexEntry {
  deck: Deck;
  card: Card;
}

export interface DailyReviewSessionIndex {
  entriesByKey: Map<string, DailyReviewSessionIndexEntry>;
  reviewEventsByKey: Map<string, ReviewEventInput[]>;
}

export interface DailyReviewProgressSummary {
  completedTodayCount: number;
  newCount: number;
  inProgressCount: number;
  dueCount: number;
  total: number;
}

export type DailyReviewProgressKind = "completed" | "new" | "in-progress" | "due";

const dailyReviewProgressCountKey: Record<DailyReviewProgressKind, keyof Omit<DailyReviewProgressSummary, "total">> = {
  completed: "completedTodayCount",
  new: "newCount",
  "in-progress": "inProgressCount",
  due: "dueCount",
};

export interface DailyReviewSessionState {
  initialKeys: string[];
  remainingInitialKeys: string[];
  completedInitialKeys: string[];
  repeatKeys: string[];
  repeatCount: number;
  ratingCounts: Record<ReviewRating, number>;
}

interface CreateReviewEventInput {
  deck: Deck;
  card: Card;
  variant: CardVariant | null;
  rating: ReviewRating;
  responseTimeMs: number | null;
  now: string;
  previousState: ReviewState;
  nextState: ReviewState;
  flags?: Record<string, unknown>;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function isDue(study: Pick<CardStudyState, "dueAt"> | null | undefined, now: DateInput): boolean {
  return new Date(study?.dueAt ?? 0).getTime() <= new Date(now).getTime();
}

function learningDayKey(value: DateInput, options: ReviewServiceOptions = {}): string | null {
  return getLearningDayKey(value, { dayStartHour: options.dayStartHour, timeZone: options.timeZone });
}

function isReviewDueByLearningDay(study: Pick<CardStudyState, "dueAt"> | null | undefined, now: DateInput, options: ReviewServiceOptions = {}): boolean {
  const dueKey = learningDayKey(study?.dueAt ?? Number.NaN, options);
  const currentKey = learningDayKey(now, options);
  return Boolean(dueKey && currentKey && dueKey <= currentKey);
}

function isLearningState(study: Pick<CardStudyState, "state"> | null | undefined): boolean {
  return study?.state === "learning" || study?.state === "relearning";
}

function stateReps(state: { reps?: unknown } = {}): number {
  return Math.max(0, Math.round(Number(state?.reps ?? 0) || 0));
}

function isNewCard(card: Card): boolean {
  return card.study.state === "new" && stateReps(card.study) === 0;
}

function isLearningDueByToday(card: Card, now: DateInput, options: ReviewServiceOptions = {}): boolean {
  const state = card.study;
  const dueTime = new Date(state?.dueAt ?? "").getTime();
  const dueKey = learningDayKey(dueTime, options);
  const currentKey = learningDayKey(now, options);
  return isLearningState(state) && Number.isFinite(dueTime) && Boolean(dueKey && currentKey && dueKey <= currentKey);
}

function isLearningAvailable(card: Card, now: DateInput, learnAheadMinutes: number, options: ReviewServiceOptions = {}): boolean {
  const state = card.study;
  if (!isLearningState(state)) return false;

  const nowTime = new Date(now).getTime();
  const dueTime = new Date(state?.dueAt ?? "").getTime();
  if (!Number.isFinite(dueTime) || !Number.isFinite(nowTime)) return false;
  if (dueTime <= nowTime) return true;
  if (learnAheadMinutes <= 0 || learningDayKey(dueTime, options) !== learningDayKey(nowTime, options)) return false;
  return dueTime - nowTime < learnAheadMinutes * 60 * 1000;
}

function activeCards(deck: Deck): Card[] {
  return (deck?.cards ?? []).filter((card) => !isCardReviewBlocked(card));
}

function asDeckArray(decksOrDeck: Deck | Deck[]): Deck[] {
  if (Array.isArray(decksOrDeck)) return decksOrDeck;
  return decksOrDeck ? [decksOrDeck] : [];
}

function collectDeckScope(decksOrDeck: Deck | Deck[], deckId: string | null = null): Deck[] {
  const decks = asDeckArray(decksOrDeck);
  if (!deckId) return decks;

  const selected = decks.find((deck) => deck.id === deckId) ?? null;
  if (!selected) return decks;

  const childrenByParent = new Map<string, Deck[]>();
  for (const deck of decks) {
    if (!deck.parentDeckId) continue;
    const children = childrenByParent.get(deck.parentDeckId);
    if (children) children.push(deck);
    else childrenByParent.set(deck.parentDeckId, [deck]);
  }
  const scopedIds = new Set<string>();
  const pending = [selected];
  while (pending.length > 0) {
    const deck = pending.pop() as Deck;
    if (scopedIds.has(deck.id)) continue;
    scopedIds.add(deck.id);
    pending.push(...(childrenByParent.get(deck.id) ?? []));
  }
  return decks.filter((deck) => scopedIds.has(deck.id));
}

function reviewEventDate(event: ReviewEventInput): string | undefined {
  return event.answeredAt ?? event.createdAt;
}

function wasNewBeforeReview(event: ReviewEventInput): boolean {
  const schedulerBefore = objectRecord(event.schedulerBefore);
  const previous = objectRecord(schedulerBefore.card ?? schedulerBefore);
  return previous.state === "new" || stateReps(previous) === 0;
}

function reviewKey(deckId: string, cardId: string | undefined): string {
  return `${deckId}:${cardId}`;
}

export function createDailyReviewSessionIndex(decksOrDeck: Deck | Deck[]): DailyReviewSessionIndex {
  const entriesByKey = new Map<string, DailyReviewSessionIndexEntry>();
  const reviewEventsByKey = new Map<string, ReviewEventInput[]>();
  for (const deck of asDeckArray(decksOrDeck)) {
    for (const card of activeCards(deck)) {
      entriesByKey.set(reviewKey(deck.id, card.id), { deck, card });
    }
    for (const event of (deck.reviewEvents ?? []) as ReviewEventInput[]) {
      if (!event.cardId) continue;
      const key = reviewKey(deck.id, event.cardId);
      const events = reviewEventsByKey.get(key);
      if (events) events.push(event);
      else reviewEventsByKey.set(key, [event]);
    }
  }
  return { entriesByKey, reviewEventsByKey };
}

export function updateDailyReviewSessionIndex(
  index: DailyReviewSessionIndex,
  updatedDeck: Deck,
  updatedCard: Card,
): DailyReviewSessionIndex {
  const key = reviewKey(updatedDeck.id, updatedCard.id);
  if (!isCardReviewBlocked(updatedCard)) index.entriesByKey.set(key, { deck: updatedDeck, card: updatedCard });
  else index.entriesByKey.delete(key);

  const latestEvent = ((updatedDeck.reviewEvents ?? []) as ReviewEventInput[])
    .find((event) => event.cardId === updatedCard.id);
  if (latestEvent) {
    const events = index.reviewEventsByKey.get(key) ?? [];
    if (!events.some((event) => event.id === latestEvent.id)) index.reviewEventsByKey.set(key, [latestEvent, ...events]);
  }
  return index;
}

function compareQueueEntries(left: QueueEntry, right: QueueEntry): number {
  const leftDue = new Date(left.card.study.dueAt ?? left.card.createdAt ?? 0).getTime();
  const rightDue = new Date(right.card.study.dueAt ?? right.card.createdAt ?? 0).getTime();
  return leftDue - rightDue || String(left.card.createdAt ?? "").localeCompare(String(right.card.createdAt ?? ""));
}

export function getLocalReviewDateKey(now: DateInput = new Date(), options: ReviewServiceOptions = {}): string {
  return learningDayKey(now, options) ?? new Date(now).toISOString().slice(0, 10);
}

function compareNewQueueEntries(left: QueueEntry, right: QueueEntry, randomKeys: ReadonlyMap<string, string> | null): number {
  if (randomKeys) {
    const leftHash = randomKeys.get(left.key) ?? "";
    const rightHash = randomKeys.get(right.key) ?? "";
    return leftHash.localeCompare(rightHash) || left.card.id.localeCompare(right.card.id);
  }
  const createdComparison = String(left.card.createdAt ?? "").localeCompare(String(right.card.createdAt ?? ""));
  return createdComparison || left.card.id.localeCompare(right.card.id);
}

function compareReviewQueueEntries(left: QueueEntry, right: QueueEntry, retrievabilityByKey: ReadonlyMap<string, number> | null): number {
  if (retrievabilityByKey) {
    const leftRetrievability = retrievabilityByKey.get(left.key) ?? 1;
    const rightRetrievability = retrievabilityByKey.get(right.key) ?? 1;
    const retrievabilityComparison = leftRetrievability - rightRetrievability;
    if (retrievabilityComparison) return retrievabilityComparison;
  }
  const dueComparison = new Date(left.card.study.dueAt ?? 0).getTime()
    - new Date(right.card.study.dueAt ?? 0).getTime();
  return dueComparison || left.card.id.localeCompare(right.card.id);
}

export function getEffectiveNewCardsPerDay(deck: Deck | null, options: ReviewServiceOptions = {}): number {
  const settings = createDefaultDeckSettings(deck?.deckSettings ?? {});
  const dateKey = options.dateKey ?? getLocalReviewDateKey(options.now ?? new Date(), options);
  const override = settings.newCardsTodayOverride;

  if (override?.date === dateKey) {
    return Math.max(0, Math.round(Number(override.limit) || 0));
  }

  return settings.newCardsPerDay;
}

function orderDailyQueueEntries(dueEntries: QueueEntry[], newEntries: QueueEntry[], order: NewReviewOrder): QueueEntry[] {
  if (order === "new-first") return [...newEntries, ...dueEntries];
  if (order !== "mixed") return [...dueEntries, ...newEntries];

  const mixed: QueueEntry[] = [];
  const length = Math.max(dueEntries.length, newEntries.length);
  for (let index = 0; index < length; index += 1) {
    if (dueEntries[index]) mixed.push(dueEntries[index]);
    if (newEntries[index]) mixed.push(newEntries[index]);
  }
  return mixed;
}

export function updateDeckNewCardLimitForDate(deck: Deck, limit: unknown, options: ReviewServiceOptions = {}): Deck {
  const now = options.now ?? new Date();
  const updatedAt = options.updatedAt ?? new Date(now).toISOString();
  const nextLimit = Math.max(0, Math.round(Number(limit) || 0));

  return {
    ...deck,
    deckSettings: {
      ...deck.deckSettings,
      newCardsTodayOverride: {
        date: getLocalReviewDateKey(now, options),
        limit: nextLimit,
      },
    },
    updatedAt,
  };
}

function summarizeDailyCardConsumption(scopeDecks: Deck[], now: DateInput, options: ReviewServiceOptions = {}) {
  const dateKey = getLocalReviewDateKey(now, options);
  const dayRange = getLearningDayRange(now, { dayStartHour: options.dayStartHour, timeZone: options.timeZone });
  const byDeckId = new Map<string, { introduced: number; reviewed: number }>();
  const reviewedTodayKeys = new Set<string>();
  const answeredToday: Array<{ deck: Deck; cardId: string }> = [];
  let introducedTotal = 0;
  let reviewedTotal = 0;
  for (const deck of scopeDecks) {
    const introduced = new Set<string>();
    const reviewed = new Set<string>();
    for (const event of (deck.reviewEvents ?? []) as ReviewEventInput[]) {
      if (event.rating === "manual") continue;
      const eventDate = reviewEventDate(event) ?? now;
      const eventTime = new Date(eventDate).getTime();
      if (dayRange
        ? !Number.isFinite(eventTime) || eventTime < dayRange.start || eventTime >= dayRange.end
        : learningDayKey(eventDate, options) !== dateKey) continue;
      const key = reviewKey(deck.id, event.cardId);
      if (event.cardId) {
        reviewedTodayKeys.add(key);
        answeredToday.push({ deck, cardId: event.cardId });
      }
      if (wasNewBeforeReview(event)) introduced.add(key);
      else reviewed.add(key);
    }
    for (const key of introduced) reviewed.delete(key);
    const consumption = { introduced: introduced.size, reviewed: reviewed.size };
    byDeckId.set(deck.id, consumption);
    introducedTotal += consumption.introduced;
    reviewedTotal += consumption.reviewed;
  }
  return { byDeckId, introducedTotal, reviewedTotal, reviewedTodayKeys, answeredToday };
}

function isIntradayLearning(card: Card, now: DateInput, options: ReviewServiceOptions): boolean {
  const state = card.study;
  const currentKey = learningDayKey(now, options);
  const dueKey = learningDayKey(state?.dueAt ?? Number.NaN, options);
  const storedLearningDayKey = state.extra.learningDayKey;
  if (storedLearningDayKey) return storedLearningDayKey === currentKey && dueKey === currentKey;

  const dueTime = new Date(state?.dueAt ?? Number.NaN).getTime();
  const nowTime = new Date(now).getTime();
  if (Number.isFinite(dueTime) && Number.isFinite(nowTime) && dueTime > nowTime) {
    return dueKey === currentKey;
  }
  return Boolean(
    currentKey
    && dueKey === currentKey
    && learningDayKey(state?.lastReviewedAt ?? Number.NaN, options) === currentKey,
  );
}

interface RemainingDeckLimits {
  newCards: number;
  reviews: number;
}

function createDeckPaths(scopeDecks: Deck[], rootDeckId: string | null): Map<string, string[]> {
  const deckById = new Map(scopeDecks.map((deck) => [deck.id, deck]));
  const paths = new Map<string, string[]>();
  for (const deck of scopeDecks) {
    const path: string[] = [];
    let current: Deck | undefined = deck;
    while (current) {
      path.push(current.id);
      if (current.id === rootDeckId) break;
      current = current.parentDeckId ? deckById.get(current.parentDeckId) : undefined;
    }
    paths.set(deck.id, path);
  }
  return paths;
}

/** Cards beyond a limit are neither selected nor seen; a buried card uses no limit. */
function takeWithinDeckLimits(
  entries: QueueEntry[],
  paths: Map<string, string[]>,
  limits: Map<string, RemainingDeckLimits>,
  kind: "review" | "new",
  isBuried: (entry: QueueEntry) => boolean,
): QueueEntry[] {
  const selected: QueueEntry[] = [];
  for (const entry of entries) {
    const path = paths.get(entry.deck.id) ?? [entry.deck.id];
    const fits = path.every((deckId) => {
      const remaining = limits.get(deckId);
      return Boolean(remaining && remaining.reviews > 0 && (kind === "review" || remaining.newCards > 0));
    });
    if (!fits || isBuried(entry)) continue;
    selected.push(entry);
    for (const deckId of path) {
      const remaining = limits.get(deckId);
      if (!remaining) continue;
      remaining.reviews -= 1;
      if (kind === "new") remaining.newCards -= 1;
    }
  }
  return selected;
}

function summarizeDailyReviewProgress(
  reviewedEntries: Map<string, QueueEntry>,
  selectedEntries: QueueEntry[],
  reviewedTodayKeys: Set<string>,
  now: DateInput,
  options: ReviewServiceOptions = {},
): DailyReviewProgressSummary {
  const relevantEntries = new Map(reviewedEntries);
  for (const entry of selectedEntries) relevantEntries.set(entry.key, entry);

  const summary: DailyReviewProgressSummary = {
    completedTodayCount: 0,
    newCount: 0,
    inProgressCount: 0,
    dueCount: 0,
    total: relevantEntries.size,
  };

  for (const [key, entry] of relevantEntries) {
    const kind = classifyDailyReviewProgress(entry.card.study, reviewedTodayKeys.has(key), now, options);
    summary[dailyReviewProgressCountKey[kind]] += 1;
  }

  return summary;
}

export function classifyDailyReviewProgress(
  reviewState: Pick<CardStudyState, "state" | "dueAt" | "reps"> | null | undefined,
  reviewedToday: boolean,
  now: DateInput,
  options: ReviewServiceOptions = {},
): DailyReviewProgressKind {
  const state = reviewState?.state;
  const inProgress = state === "learning" || state === "relearning";
  const dueOnFutureDay = (learningDayKey(reviewState?.dueAt ?? now, options) ?? "") > getLocalReviewDateKey(now, options);

  if (reviewedToday && (!inProgress || dueOnFutureDay)) return "completed";
  if (!reviewedToday && state === "new" && stateReps(reviewState ?? {}) === 0) return "new";
  if (inProgress) return "in-progress";
  return "due";
}

export function moveDailyReviewProgress(
  progress: DailyReviewProgressSummary,
  from: DailyReviewProgressKind | null,
  to: DailyReviewProgressKind | null,
): DailyReviewProgressSummary {
  if (from === to) return progress;
  const next = { ...progress };
  if (from) {
    const countKey = dailyReviewProgressCountKey[from];
    next[countKey] = Math.max(0, next[countKey] - 1);
  }
  if (to) {
    const countKey = dailyReviewProgressCountKey[to];
    next[countKey] += 1;
  }
  next.total = next.completedTodayCount + next.newCount + next.inProgressCount + next.dueCount;
  return next;
}

function assertReviewable(card: Card): void {
  if (isCardReviewBlocked(card)) {
    throw new Error("Diese Karte ist ausgesetzt oder gelöscht und kann nicht gelernt werden.");
  }
}

function findVariant(card: Card, variantId: string | null | undefined): CardVariant | null {
  if (!variantId || variantId === card.id) return null;
  return (card.variants ?? []).find((variant) => variant.id === variantId) ?? null;
}

function resolveResponseArgs(responseTimeMsOrOptions: number | ReviewServiceOptions | null, maybeOptions: ReviewServiceOptions) {
  if (typeof responseTimeMsOrOptions === "object" && responseTimeMsOrOptions !== null) {
    return { responseTimeMs: responseTimeMsOrOptions.responseTimeMs ?? null, options: responseTimeMsOrOptions };
  }

  return { responseTimeMs: responseTimeMsOrOptions ?? maybeOptions?.responseTimeMs ?? null, options: maybeOptions ?? {} };
}

/** Compact study snapshot of a review event; statistics read `card.state` and `card.intervalDays`. */
function studySnapshot(state: ReviewState) {
  return {
    card: {
      state: state.state,
      dueAt: state.dueAt,
      intervalDays: state.intervalDays,
      intervalMinutes: state.intervalMinutes,
      stability: state.stability,
      difficulty: state.difficulty,
      reps: state.reps,
      lapses: state.lapses,
      learningStepIndex: state.learningStepIndex,
      lastReviewedAt: state.lastReviewedAt,
    },
  };
}

function createReviewEvent({ deck, card, variant, rating, responseTimeMs, now, previousState, nextState, flags }: CreateReviewEventInput): ReviewEvent {
  return {
    id: makeId("review"),
    userId: "local-user",
    deckId: deck.id,
    cardId: card.id,
    variantId: variant?.id ?? null,
    rating,
    answeredAt: now,
    responseTimeMs,
    schedulerBefore: studySnapshot(previousState),
    schedulerAfter: studySnapshot(nextState),
    flags: flags ?? {},
    createdAt: now,
  };
}

export function answerVariant(
  deck: Deck,
  cardId: string,
  cardVariantId: string | null | undefined,
  rating: ReviewRating,
  responseTimeMsOrOptions: number | ReviewServiceOptions | null = null,
  maybeOptions: ReviewServiceOptions = {},
) {
  const { responseTimeMs, options } = resolveResponseArgs(responseTimeMsOrOptions, maybeOptions);
  const now = new Date(options.now ?? new Date()).toISOString();
  const card = (deck.cards ?? []).find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Karte nicht gefunden: ${String(cardId ?? "")}`);
  assertReviewable(card);
  const variant = findVariant(card, cardVariantId);
  if (cardVariantId && cardVariantId !== card.id && !variant) {
    throw new Error(`Variante nicht gefunden: ${String(cardVariantId ?? "")}`);
  }

  const previousState = reviewStateFromCardStudy(card.study);
  const fallbackInfo = rating === "again" ? getVariantFallbackTarget(card, variant) : null;
  const outcome = simulateRatingOutcome({
    card,
    previousState,
    variant,
    rating,
    now,
    deckSettings: deck.deckSettings,
    dayStartHour: options.dayStartHour,
    timeZone: options.timeZone,
    easyDaysContext: options.easyDaysContext,
    isVariant: Boolean(variant),
    variantId: variant?.id ?? null,
    variantIsOriginal: !variant,
    variantLevel: variant?.variantLevel ?? 1,
    variantType: variant?.variantType ?? "basic",
    variantPerformance: variant?.performance ?? null,
    fallbackVariantId: fallbackInfo?.fallbackVariantId ?? null,
  });
  const nextState = outcome.nextReviewState;
  const variants = variant
    ? card.variants.map((candidate) => candidate.id === variant.id ? {
        ...candidate,
        performance: updateVariantPerformance(candidate.performance, rating, {
          responseTimeMs,
          reviewedAt: now,
          cardId: card.id,
          variantId: candidate.id,
        }),
        updatedAt: now,
      } : candidate)
    : card.variants;
  const updatedCard: Card = {
    ...card,
    variants,
    study: cardStudyFromReviewState(nextState),
    studyRevision: card.studyRevision + 1,
    updatedAt: now,
  };
  const event = createReviewEvent({ deck, card, variant, rating, responseTimeMs, now, previousState, nextState, flags: options.flags });

  return {
    deck: {
      ...deck,
      cards: deck.cards.map((candidate) => candidate.id === card.id ? updatedCard : candidate),
      reviewEvents: [event, ...(deck.reviewEvents ?? [])],
      updatedAt: now,
    },
    event,
    updatedCard,
    variant: updatedCard.variants.find((candidate) => candidate.id === event.variantId) ?? null,
  };
}

function selectVariantForCard(card: Card, options: ReviewServiceOptions = {}): CardVariant | null {
  return selectAutomaticReviewVariant(card, { allowLearningVariant: true, ...options });
}

function createFallbackViewModel(card: Card) {
  const state = card.study.extra;
  if (!state.fallbackUntilCorrect && !state.forcedVariantId) return null;

  const forcedVariant = (card.variants ?? []).find((variant) => variant.id === state.forcedVariantId) ?? null;
  const failedVariant = (card.variants ?? []).find((variant) => variant.id === state.lastFailedVariantId) ?? null;

  return {
    active: true,
    fallbackVariantId: forcedVariant?.id ?? null,
    failedVariantId: failedVariant?.id ?? state.lastFailedVariantId ?? null,
    shouldUseOriginal: !forcedVariant,
    fallbackReason: failedVariant
      ? `Nach Fehler bei Level ${failedVariant.variantLevel ?? 1}: Rückfall auf ${forcedVariant ? `Level ${forcedVariant.variantLevel ?? 1}` : "Grundkarte"}.`
      : "Fallback aktiv: CoRe nutzt Original oder eine einfachere Variante, bis wieder korrekt geantwortet wurde.",
  };
}

function createReviewItemViewModel(deck: Deck, selectedCard: Card | null, options: ReviewServiceOptions = {}) {
  if (!selectedCard) return null;

  const now = options.now ?? new Date().toISOString();
  const reviewEvents = (options.reviewEvents ?? deck.reviewEvents ?? []) as ReviewEventInput[];
  const variantReviewModel = createVariantReviewModel(selectedCard, reviewEvents, {
    now,
  });
  const fallbackInfo = createFallbackViewModel(selectedCard);
  const variant = selectVariantForCard(selectedCard, { now, reviewEvents, variantSession: options.variantSession });
  const fallbackTarget = getVariantFallbackTarget(selectedCard, variant);
  const ratingButtonOptions = getReviewButtonOptions(selectedCard, variant, {
    now,
    reviewEvents,
    deckSettings: deck.deckSettings,
    dayStartHour: options.dayStartHour,
    timeZone: options.timeZone,
    easyDaysContext: options.easyDaysContext,
    fallbackVariantId: fallbackTarget?.fallbackVariantId ?? null,
  });

  return {
    deckId: deck.id,
    deckName: deck.name,
    card: selectedCard,
    cardId: selectedCard.id,
    noteId: selectedCard.noteId,
    variant,
    variantId: variant?.id ?? selectedCard.id,
    study: selectedCard.study,
    maturity: variantReviewModel.maturity,
    variantReadiness: variantReviewModel.readiness,
    variantCoverage: variantReviewModel.coverage,
    variantGenerationRecommendation: variantReviewModel.variantGenerationRecommendation,
    variantGenerationPlan: variantReviewModel.variantGenerationPlan,
    ratingButtonOptions,
    fallbackInfo,
    schedulerInfo: {
      schedulerVersion: selectedCard.study.extra.schedulerVersion ?? SCHEDULER_VERSION,
      selectedBy: options.selectedBy ?? "due_card",
      queueKind: options.queueKind ?? null,
    },
  };
}

export function createDailyReviewSessionState(items: Array<{ deckId?: string; cardId?: string } | null | undefined> = []): DailyReviewSessionState {
  const initialKeys = items
    .map((item) => item?.deckId && item.cardId ? reviewKey(item.deckId, item.cardId) : "")
    .filter((key, index, keys) => Boolean(key) && keys.indexOf(key) === index);
  return {
    initialKeys,
    remainingInitialKeys: [...initialKeys],
    completedInitialKeys: [],
    repeatKeys: [],
    repeatCount: 0,
    ratingCounts: { again: 0, hard: 0, good: 0, easy: 0 },
  };
}

export type ReviewAnswerResult = ReturnType<typeof answerVariant>;

export function reconcileDailyReviewSessionState(
  session: DailyReviewSessionState,
  items: Array<{ deckId?: string; cardId?: string } | null | undefined> = [],
  options: { preserveInitialKey?: string } = {},
): DailyReviewSessionState {
  const completed = new Set(session.completedInitialKeys);
  const repeats = new Set(session.repeatKeys);
  const remainingInitialKeys = new Set(session.remainingInitialKeys.filter((key) => key === options.preserveInitialKey));
  for (const item of items) {
    if (item?.deckId && item.cardId) remainingInitialKeys.add(reviewKey(item.deckId, item.cardId));
  }
  for (const key of completed) remainingInitialKeys.delete(key);
  for (const key of repeats) remainingInitialKeys.delete(key);

  return {
    ...session,
    initialKeys: [...session.completedInitialKeys, ...remainingInitialKeys],
    remainingInitialKeys: [...remainingInitialKeys],
  };
}

export function removeDailyReviewSessionItem(session: DailyReviewSessionState, key: string): DailyReviewSessionState {
  return {
    ...session,
    initialKeys: session.initialKeys.filter((candidate) => candidate !== key),
    remainingInitialKeys: session.remainingInitialKeys.filter((candidate) => candidate !== key),
    completedInitialKeys: session.completedInitialKeys.filter((candidate) => candidate !== key),
    repeatKeys: session.repeatKeys.filter((candidate) => candidate !== key),
  };
}

export function advanceDailyReviewSession(
  session: DailyReviewSessionState,
  input: { key: string; rating: ReviewRating; nextReviewState: Pick<CardStudyState, "state"> },
): DailyReviewSessionState {
  const wasInitial = session.remainingInitialKeys.includes(input.key);
  const wasRepeat = !wasInitial && session.repeatKeys.includes(input.key);
  const remainingInitialKeys = session.remainingInitialKeys.filter((key) => key !== input.key);
  const repeatKeys = session.repeatKeys.filter((key) => key !== input.key);
  const needsRepeat = input.nextReviewState.state === "learning" || input.nextReviewState.state === "relearning";
  if (needsRepeat) repeatKeys.push(input.key);

  return {
    ...session,
    remainingInitialKeys,
    completedInitialKeys: wasInitial && !session.completedInitialKeys.includes(input.key)
      ? [...session.completedInitialKeys, input.key]
      : session.completedInitialKeys,
    repeatKeys,
    repeatCount: session.repeatCount + (wasRepeat ? 1 : 0),
    ratingCounts: {
      ...session.ratingCounts,
      [input.rating]: session.ratingCounts[input.rating] + 1,
    },
  };
}

export function getNextDailyReviewSessionItem(
  decksOrDeck: Deck | Deck[],
  session: DailyReviewSessionState,
  options: ReviewServiceOptions = {},
) {
  const decks = asDeckArray(decksOrDeck);
  const sessionIndex = options.sessionIndex ?? createDailyReviewSessionIndex(decks);
  const entriesByKey = sessionIndex.entriesByKey;
  const now = options.now ?? new Date().toISOString();
  const learnAheadMinutes = normalizeLearnAheadMinutes(options.learnAheadMinutes);
  const initialKey = session.remainingInitialKeys.find((candidate) => entriesByKey.has(candidate)) ?? null;
  const repeatKey = initialKey ? null : session.repeatKeys.find((candidate) => {
    const candidateEntry = entriesByKey.get(candidate);
    return candidateEntry ? isLearningAvailable(candidateEntry.card, now, learnAheadMinutes, options) : false;
  }) ?? null;
  const key = initialKey ?? repeatKey;
  if (!key) return null;
  const entry = entriesByKey.get(key);
  if (!entry) return null;

  const isRepeat = session.repeatKeys.includes(key) && !session.remainingInitialKeys.includes(key);
  const item = createReviewItemViewModel(entry.deck, entry.card, {
    ...options,
    now,
    reviewEvents: sessionIndex.reviewEventsByKey.get(key) ?? [],
    selectedBy: isRepeat ? "session_repeat" : "session_initial",
    queueKind: isRepeat ? "repeat" : isNewCard(entry.card) ? "new" : "due",
  });
  if (!item) return null;
  return {
    ...item,
    sessionInfo: {
      key,
      isRepeat,
      isEarlyRepeat: isRepeat && !isDue(entry.card.study, now),
    },
  };
}

export function createDailyReviewQueue(decksOrDeck: Deck | Deck[], options: ReviewServiceOptions = {}) {
  const now = options.now ?? new Date();
  const rootDeckId = options.deckId ?? (Array.isArray(decksOrDeck) ? decksOrDeck[0]?.id : decksOrDeck?.id) ?? null;
  const allDecks = asDeckArray(decksOrDeck);
  const rootDeck = allDecks.find((deck) => deck.id === rootDeckId) ?? allDecks[0] ?? null;
  const scopeDecks = collectDeckScope(decksOrDeck, rootDeckId);
  const rootSettings = createDefaultDeckSettings(rootDeck?.deckSettings ?? {});
  const settingsByDeckId = new Map(scopeDecks.map((deck) => [deck.id, createDefaultDeckSettings(deck.deckSettings ?? {})]));
  const excludeKeys = new Set(options.excludeKeys ?? []);
  const dailyConsumption = summarizeDailyCardConsumption(scopeDecks, now, options);
  const deckPaths = createDeckPaths(scopeDecks, rootDeck?.id ?? null);
  const reviewedEntries = new Map<string, QueueEntry>();
  const learningEntries: QueueEntry[] = [];
  const intradayLearningEntries: QueueEntry[] = [];
  const interdayLearningEntries: QueueEntry[] = [];
  const reviewEntries: QueueEntry[] = [];
  const newEntries: QueueEntry[] = [];
  const learnAheadMinutes = normalizeLearnAheadMinutes(options.learnAheadMinutes);

  for (const deck of scopeDecks) {
    for (const card of activeCards(deck)) {
      const key = reviewKey(deck.id, card.id);
      const entry = { deck, card, key };
      if (dailyConsumption.reviewedTodayKeys.has(key)) reviewedEntries.set(key, entry);
      if (excludeKeys.has(key)) continue;

      if (isNewCard(card)) {
        if (isReviewDueByLearningDay(card.study, now, options)) newEntries.push(entry);
        continue;
      }

      const state = card.study;
      if (isLearningState(state)) {
        if (isLearningDueByToday(card, now, options)) learningEntries.push(entry);
        if (isIntradayLearning(card, now, options)) {
          if (isLearningAvailable(card, now, learnAheadMinutes, options)) intradayLearningEntries.push(entry);
        } else if (isLearningDueByToday(card, now, options)) {
          interdayLearningEntries.push(entry);
        }
      } else if (state?.state === "review" && isReviewDueByLearningDay(state, now, options)) {
        reviewEntries.push(entry);
      }
    }
  }

  intradayLearningEntries.sort(compareQueueEntries);
  interdayLearningEntries.sort(compareQueueEntries);
  const retrievabilityByKey = rootSettings.reviewCardSortOrder === "lowest-retrievability"
    ? new Map(reviewEntries.map((entry) => [
      entry.key,
      calculateRetrievability(reviewStateFromCardStudy(entry.card.study), now),
    ]))
    : null;
  reviewEntries.sort((left, right) => compareReviewQueueEntries(left, right, retrievabilityByKey));
  const randomSeed = rootSettings.newCardSortOrder === "random"
    ? `${getLocalReviewDateKey(now, options)}:${rootDeck?.id ?? ""}`
    : null;
  const randomKeys = randomSeed
    ? new Map(newEntries.map((entry) => [entry.key, stableContentHash([randomSeed, entry.card.id], "queue")]))
    : null;
  newEntries.sort((left, right) => compareNewQueueEntries(left, right, randomKeys));

  const limits = new Map<string, RemainingDeckLimits>();
  const subtreeConsumption = new Map(scopeDecks.map((deck) => [deck.id, { introduced: 0, reviewed: 0 }]));
  for (const deck of scopeDecks) {
    const direct = dailyConsumption.byDeckId.get(deck.id);
    for (const ancestorId of deckPaths.get(deck.id) ?? [deck.id]) {
      const aggregate = subtreeConsumption.get(ancestorId);
      if (!aggregate) continue;
      aggregate.introduced += direct?.introduced ?? 0;
      aggregate.reviewed += direct?.reviewed ?? 0;
    }
  }
  for (const deck of scopeDecks) {
    const consumption = subtreeConsumption.get(deck.id) ?? { introduced: 0, reviewed: 0 };
    const settings = settingsByDeckId.get(deck.id)!;
    limits.set(deck.id, {
      newCards: Math.max(0, getEffectiveNewCardsPerDay(deck, { ...options, now }) - consumption.introduced),
      reviews: Math.max(0, settings.maximumReviewsPerDay - consumption.introduced - consumption.reviewed),
    });
  }

  const rootLimits = limits.get(rootDeck?.id ?? "") ?? { newCards: 0, reviews: 0 };
  const newLimit = getEffectiveNewCardsPerDay(rootDeck, { ...options, now });
  const introducedToday = dailyConsumption.introducedTotal;
  const reviewsCompletedToday = dailyConsumption.reviewedTotal;
  const remainingNewCards = rootLimits.newCards;
  const remainingReviews = rootLimits.reviews;
  const reviewCandidates = [...interdayLearningEntries, ...reviewEntries];

  // Sibling burying as in Anki: siblings answered today count as seen first, then the queue sees intraday learning,
  // interday learning and reviews, then new cards. The deck options of the siblings seen before decide whether a card waits.
  const noteIdByCardId = new Map((options.answeredToday ?? []).map((answered) => [answered.cardId, answered.noteId]));
  for (const deck of scopeDecks) for (const card of deck.cards ?? []) noteIdByCardId.set(card.id, card.noteId);
  const seenNotes = new Map<string, SiblingBuryMode>();
  const answeredCardIds = new Set<string>();
  const buriedKeys = new Set<string>();
  const markSeen = (noteId: string, deckId: string): SiblingBuryMode | undefined => {
    const settings = settingsByDeckId.get(deckId) ?? rootSettings;
    const previous = seenNotes.get(noteId);
    seenNotes.set(noteId, {
      buryNewSiblings: Boolean(previous?.buryNewSiblings || settings.buryNewSiblings),
      buryReviewSiblings: Boolean(previous?.buryReviewSiblings || settings.buryReviewSiblings),
      buryInterdayLearningSiblings: Boolean(previous?.buryInterdayLearningSiblings || settings.buryInterdayLearningSiblings),
    });
    return previous;
  };
  for (const { deck, cardId } of dailyConsumption.answeredToday) {
    const noteId = noteIdByCardId.get(cardId);
    if (!noteId) continue;
    answeredCardIds.add(cardId);
    markSeen(noteId, deck.id);
  }
  // A sibling answered in a deck outside the studied scope follows the options of the studied deck.
  for (const answered of options.answeredToday ?? []) {
    if (settingsByDeckId.has(answered.deckId)) continue;
    answeredCardIds.add(answered.cardId);
    markSeen(answered.noteId, answered.deckId);
  }
  for (const entry of intradayLearningEntries) markSeen(entry.card.noteId, entry.deck.id);
  const buryIfSiblingSeen = (entry: QueueEntry) => {
    const previous = markSeen(entry.card.noteId, entry.deck.id);
    const buried = !answeredCardIds.has(entry.card.id) && Boolean(isNewCard(entry.card)
      ? previous?.buryNewSiblings
      : isLearningState(entry.card.study) ? previous?.buryInterdayLearningSiblings : previous?.buryReviewSiblings);
    if (buried) buriedKeys.add(entry.key);
    return buried;
  };

  const selectedReviewEntries = takeWithinDeckLimits(reviewCandidates, deckPaths, limits, "review", buryIfSiblingSeen);
  const selectedNewEntries = takeWithinDeckLimits(newEntries, deckPaths, limits, "new", buryIfSiblingSeen);
  const availableReviewCount = reviewCandidates.length - reviewCandidates.filter((entry) => buriedKeys.has(entry.key)).length;
  const availableNewCount = newEntries.length - newEntries.filter((entry) => buriedKeys.has(entry.key)).length;
  const selectedDueEntries = [...intradayLearningEntries, ...selectedReviewEntries];
  const selectedEntries = orderDailyQueueEntries(selectedDueEntries, selectedNewEntries, rootSettings.newReviewOrder);
  const dailyProgressEntries = [...learningEntries.filter((entry) => !buriedKeys.has(entry.key)), ...selectedReviewEntries, ...selectedNewEntries];
  const dailyProgress = summarizeDailyReviewProgress(reviewedEntries, dailyProgressEntries, dailyConsumption.reviewedTodayKeys, now, options);
  const items: DailyReviewQueueEntry[] = selectedEntries.map((entry) => ({
    deckId: entry.deck.id,
    cardId: entry.card.id,
    key: entry.key,
    queueKind: isNewCard(entry.card) ? "new" : "due",
  }));

  return {
    deckId: rootDeck?.id ?? null,
    deckName: rootDeck?.name ?? "",
    scopeDeckIds: scopeDecks.map((deck) => deck.id),
    items,
    total: items.length,
    dailyProgress,
    dueCount: selectedReviewEntries.length,
    availableDueCards: availableReviewCount,
    inProgressCount: dailyProgress.inProgressCount,
    availableLearningCards: learningEntries.filter((entry) => !buriedKeys.has(entry.key)).length,
    maximumReviewsPerDay: rootSettings.maximumReviewsPerDay,
    reviewsCompletedToday,
    remainingReviews,
    newReviewOrder: rootSettings.newReviewOrder,
    newCount: selectedNewEntries.length,
    availableNewCards: availableNewCount,
    newCardsPerDay: newLimit,
    newCardsIntroducedToday: introducedToday,
    remainingNewCards,
    limitSummary: {
      hiddenDueCount: availableReviewCount - selectedReviewEntries.length,
      hiddenNewCount: availableNewCount - selectedNewEntries.length,
      reached: availableReviewCount > selectedReviewEntries.length || availableNewCount > selectedNewEntries.length,
    },
    /** Siblings waiting until the next learning day; derived from today's answers, never persisted. */
    buriedKeys: [...buriedKeys],
    dateKey: getLocalReviewDateKey(now, options),
  };
}

export function recordVariantFeedback(
  deck: Deck,
  reviewable: { cardId: string; variantId: string },
  options: ReviewServiceOptions = {},
): { deck: Deck; updatedCard: Card | null } {
  const now = new Date(options.now ?? new Date()).toISOString();
  const card = (deck.cards ?? []).find((candidate) => candidate.id === reviewable.cardId);
  if (!card || !card.variants.some((variant) => variant.id === reviewable.variantId)) return { deck, updatedCard: null };
  const updatedCard = options.action === "disable"
    ? deactivateVariant(card, reviewable.variantId, options.reason ?? "Nutzer hat die Variante deaktiviert.")
    : flagVariant(card, reviewable.variantId, options.feedbackType ?? "fachlich_falsch", options.note ?? "");
  return {
    deck: { ...deck, cards: deck.cards.map((candidate) => candidate.id === card.id ? updatedCard : candidate), updatedAt: now },
    updatedCard,
  };
}
