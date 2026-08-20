import { SCHEDULER_VERSION, calculateRetrievability, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.ts";
import {
  chooseReviewCard,
  createVariantReviewModel,
  deactivateVariant,
  flagVariant,
  getVariantFallbackTarget,
  selectAutomaticReviewVariant,
} from "./coreVariantService.ts";
import {
  createDefaultDeckSettings,
  createReviewState,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  isLearningItemReviewBlocked,
  makeId,
  normalizeLearningItem,
  stableContentHash,
  updateVariantPerformance,
} from "./coreModel.ts";
import type {
  CardVariant,
  Deck,
  LearningItem,
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

type ReviewEventRecord = ReviewEvent;
type LegacyReviewEvent = Partial<ReviewEvent>;

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
}

interface ReviewableItem {
  id: string;
  reviewableType?: "card" | "variant";
  sourceCardId?: string;
  isVariant?: boolean;
  card?: LearningItem;
}

interface QueueEntry {
  deck: Deck;
  learningItem: LearningItem;
  key: string;
}

export interface DailyReviewQueueEntry {
  deckId: string;
  learningItemId: string;
  key: string;
  queueKind: "new" | "due";
}

interface DailyReviewSessionIndexEntry {
  deck: Deck;
  learningItem: LearningItem;
}

export interface DailyReviewSessionIndex {
  entriesByKey: Map<string, DailyReviewSessionIndexEntry>;
  reviewEventsByKey: Map<string, LegacyReviewEvent[]>;
}

export interface DailyReviewProgressSummary {
  completedTodayCount: number;
  newCount: number;
  inProgressCount: number;
  dueCount: number;
  total: number;
}

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
  item: LearningItem;
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

function isDue(reviewState: Partial<ReviewState> | null | undefined, now: DateInput): boolean {
  return new Date(reviewState?.dueAt ?? 0).getTime() <= new Date(now).getTime();
}

function learningDayKey(value: DateInput, options: ReviewServiceOptions = {}): string | null {
  return getLearningDayKey(value, { dayStartHour: options.dayStartHour, timeZone: options.timeZone });
}

function isReviewDueByLearningDay(reviewState: Partial<ReviewState> | null | undefined, now: DateInput, options: ReviewServiceOptions = {}): boolean {
  const dueKey = learningDayKey(reviewState?.dueAt ?? Number.NaN, options);
  const currentKey = learningDayKey(now, options);
  return Boolean(dueKey && currentKey && dueKey <= currentKey);
}

function isLearningState(reviewState: Partial<ReviewState> | null | undefined): boolean {
  return reviewState?.state === "learning" || reviewState?.state === "relearning";
}

function stateReps(state: Partial<ReviewState> = {}): number {
  return Math.max(0, Math.round(Number(state?.reps ?? state?.repetitions ?? 0) || 0));
}

function isNewLearningItem(item: LearningItem): boolean {
  const state = item.reviewState;
  return state?.state === "new" && stateReps(state) === 0;
}

function isLearningDueByToday(item: LearningItem, now: DateInput, options: ReviewServiceOptions = {}): boolean {
  const state = item.reviewState;
  const dueTime = new Date(state?.dueAt ?? "").getTime();
  const dueKey = learningDayKey(dueTime, options);
  const currentKey = learningDayKey(now, options);
  return isLearningState(state) && Number.isFinite(dueTime) && Boolean(dueKey && currentKey && dueKey <= currentKey);
}

function isLearningAvailable(item: LearningItem, now: DateInput, learnAheadMinutes: number, options: ReviewServiceOptions = {}): boolean {
  const state = item.reviewState;
  if (!isLearningState(state)) return false;

  const nowTime = new Date(now).getTime();
  const dueTime = new Date(state?.dueAt ?? "").getTime();
  if (!Number.isFinite(dueTime) || !Number.isFinite(nowTime)) return false;
  if (dueTime <= nowTime) return true;
  if (learnAheadMinutes <= 0 || learningDayKey(dueTime, options) !== learningDayKey(nowTime, options)) return false;
  return dueTime - nowTime < learnAheadMinutes * 60 * 1000;
}

function activeLearningItems(deck: Deck): LearningItem[] {
  return (deck?.cards ?? [])
    .map((card) => isCanonicalLearningItem(card) ? card : normalizeLearningItem(card))
    .filter(isActiveLearningItem);
}

function isCanonicalLearningItem(value: unknown): value is LearningItem {
  const item = value as Partial<LearningItem> | null;
  return Boolean(
    item
      && typeof item.id === "string"
      && item.contentDocument?.schemaVersion === 1
      && typeof item.noteTypeDefinitionId === "string"
      && Array.isArray(item.variants)
      && item.reviewState,
  );
}

function isActiveLearningItem(item: LearningItem): boolean {
  return item.status !== "deleted" && item.draftStatus !== "draft" && !isLearningItemReviewBlocked(item);
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

function reviewEventDate(event: LegacyReviewEvent): string | undefined {
  return event.answeredAt ?? event.createdAt;
}

function wasNewBeforeReview(event: LegacyReviewEvent): boolean {
  const schedulerBefore = objectRecord(event.schedulerBefore);
  const previous = objectRecord(schedulerBefore.card ?? schedulerBefore);
  return previous.state === "new" || stateReps(previous) === 0;
}

function reviewKey(deckId: string, learningItemId: string | undefined): string {
  return `${deckId}:${learningItemId}`;
}

function reviewEventLearningItemId(event: LegacyReviewEvent): string | null {
  return event.learningItemId ?? event.sourceCardId ?? null;
}

export function createDailyReviewSessionIndex(decksOrDeck: Deck | Deck[]): DailyReviewSessionIndex {
  const entriesByKey = new Map<string, DailyReviewSessionIndexEntry>();
  const reviewEventsByKey = new Map<string, LegacyReviewEvent[]>();
  for (const deck of asDeckArray(decksOrDeck)) {
    for (const learningItem of activeLearningItems(deck)) {
      entriesByKey.set(reviewKey(deck.id, learningItem.id), { deck, learningItem });
    }
    for (const event of (deck.reviewEvents ?? []) as LegacyReviewEvent[]) {
      const learningItemId = reviewEventLearningItemId(event);
      if (!learningItemId) continue;
      const key = reviewKey(deck.id, learningItemId);
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
  updatedLearningItem: LearningItem,
): DailyReviewSessionIndex {
  const key = reviewKey(updatedDeck.id, updatedLearningItem.id);
  const normalized = normalizeLearningItem(updatedLearningItem);
  if (isActiveLearningItem(normalized)) index.entriesByKey.set(key, { deck: updatedDeck, learningItem: normalized });
  else index.entriesByKey.delete(key);

  const latestEvent = ((updatedDeck.reviewEvents ?? []) as LegacyReviewEvent[])
    .find((event) => reviewEventLearningItemId(event) === updatedLearningItem.id);
  if (latestEvent) {
    const events = index.reviewEventsByKey.get(key) ?? [];
    if (!events.some((event) => event.id === latestEvent.id)) index.reviewEventsByKey.set(key, [latestEvent, ...events]);
  }
  return index;
}

function compareQueueEntries(left: QueueEntry, right: QueueEntry): number {
  const leftDue = new Date(left.learningItem.reviewState?.dueAt ?? left.learningItem.createdAt ?? 0).getTime();
  const rightDue = new Date(right.learningItem.reviewState?.dueAt ?? right.learningItem.createdAt ?? 0).getTime();
  return leftDue - rightDue || String(left.learningItem.createdAt ?? "").localeCompare(String(right.learningItem.createdAt ?? ""));
}

export function getLocalReviewDateKey(now: DateInput = new Date(), options: ReviewServiceOptions = {}): string {
  return learningDayKey(now, options) ?? new Date(now).toISOString().slice(0, 10);
}

function compareNewQueueEntries(left: QueueEntry, right: QueueEntry, randomKeys: ReadonlyMap<string, string> | null): number {
  if (randomKeys) {
    const leftHash = randomKeys.get(left.key) ?? "";
    const rightHash = randomKeys.get(right.key) ?? "";
    return leftHash.localeCompare(rightHash) || left.learningItem.id.localeCompare(right.learningItem.id);
  }
  const createdComparison = String(left.learningItem.createdAt ?? "").localeCompare(String(right.learningItem.createdAt ?? ""));
  return createdComparison || left.learningItem.id.localeCompare(right.learningItem.id);
}

function compareReviewQueueEntries(left: QueueEntry, right: QueueEntry, retrievabilityByKey: ReadonlyMap<string, number> | null): number {
  if (retrievabilityByKey) {
    const leftRetrievability = retrievabilityByKey.get(left.key) ?? 1;
    const rightRetrievability = retrievabilityByKey.get(right.key) ?? 1;
    const retrievabilityComparison = leftRetrievability - rightRetrievability;
    if (retrievabilityComparison) return retrievabilityComparison;
  }
  const dueComparison = new Date(left.learningItem.reviewState.dueAt ?? 0).getTime()
    - new Date(right.learningItem.reviewState.dueAt ?? 0).getTime();
  return dueComparison || left.learningItem.id.localeCompare(right.learningItem.id);
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
  let introducedTotal = 0;
  let reviewedTotal = 0;
  for (const deck of scopeDecks) {
    const introduced = new Set<string>();
    const reviewed = new Set<string>();
    for (const event of (deck.reviewEvents ?? []) as LegacyReviewEvent[]) {
      if (event.rating === "manual") continue;
      const eventDate = reviewEventDate(event) ?? now;
      const eventTime = new Date(eventDate).getTime();
      if (dayRange
        ? !Number.isFinite(eventTime) || eventTime < dayRange.start || eventTime >= dayRange.end
        : learningDayKey(eventDate, options) !== dateKey) continue;
      const learningItemId = event.learningItemId ?? event.sourceCardId;
      const key = reviewKey(deck.id, learningItemId);
      if (learningItemId) reviewedTodayKeys.add(key);
      if (wasNewBeforeReview(event)) introduced.add(key);
      else reviewed.add(key);
    }
    for (const key of introduced) reviewed.delete(key);
    const consumption = { introduced: introduced.size, reviewed: reviewed.size };
    byDeckId.set(deck.id, consumption);
    introducedTotal += consumption.introduced;
    reviewedTotal += consumption.reviewed;
  }
  return { byDeckId, introducedTotal, reviewedTotal, reviewedTodayKeys };
}

function isIntradayLearning(item: LearningItem, now: DateInput, options: ReviewServiceOptions): boolean {
  const state = item.reviewState;
  const currentKey = learningDayKey(now, options);
  const dueKey = learningDayKey(state?.dueAt ?? Number.NaN, options);
  const storedLearningDayKey = typeof state?.learningDayKey === "string" ? state.learningDayKey : null;
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

function takeWithinDeckLimits(
  entries: QueueEntry[],
  paths: Map<string, string[]>,
  limits: Map<string, RemainingDeckLimits>,
  kind: "review" | "new",
): QueueEntry[] {
  const selected: QueueEntry[] = [];
  for (const entry of entries) {
    const path = paths.get(entry.deck.id) ?? [entry.deck.id];
    const fits = path.every((deckId) => {
      const remaining = limits.get(deckId);
      return Boolean(remaining && remaining.reviews > 0 && (kind === "review" || remaining.newCards > 0));
    });
    if (!fits) continue;
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
    const state = entry.learningItem.reviewState.state;
    const inProgress = state === "learning" || state === "relearning";
    const reviewedToday = reviewedTodayKeys.has(key);
    const dueOnFutureDay = (learningDayKey(entry.learningItem.reviewState.dueAt ?? now, options) ?? "") > getLocalReviewDateKey(now, options);

    if (reviewedToday && (!inProgress || dueOnFutureDay)) summary.completedTodayCount += 1;
    else if (!reviewedToday && isNewLearningItem(entry.learningItem)) summary.newCount += 1;
    else if (inProgress) summary.inProgressCount += 1;
    else summary.dueCount += 1;
  }

  return summary;
}

function updateCoreStateFromReview(card: LearningItem, reviewState: ReviewState, updatedAt = new Date().toISOString()): LearningItem {
  return {
    ...card,
    reviewState,
    coreState: {
      ...card.coreState,
      isCoreReady: ["variant_ready", "mastered"].includes(reviewState.maturityBand),
      lastReviewedAt: reviewState.lastReviewedAt,
      repetitionLevel: reviewState.repetitions,
      maturityXp: reviewState.maturityXp,
      maturityBand: reviewState.maturityBand,
      variantCount: getActiveVariants(card).length,
    },
    updatedAt,
  };
}

function assertReviewable(item: LearningItem): void {
  if (isLearningItemReviewBlocked(item)) {
    throw new Error("Diese Grundkarte ist ausgesetzt oder vergraben und kann nicht gelernt werden.");
  }
  if (item.status === "deleted" || item.draftStatus === "draft") {
    throw new Error("Diese Grundkarte ist aktuell nicht reviewbar.");
  }
}

function findVariant(item: LearningItem, variantId: string | null | undefined): CardVariant | null {
  if (!variantId || variantId === item.id) return null;
  return (item.variants ?? []).find((variant) => variant.id === variantId) ?? null;
}

function belongsToLearningItem(item: LearningItem | null, variant: CardVariant | null): boolean {
  return Boolean(item && variant && variant.cardId === item.id);
}

function resolveResponseArgs(responseTimeMsOrOptions: number | ReviewServiceOptions | null, maybeOptions: ReviewServiceOptions) {
  if (typeof responseTimeMsOrOptions === "object" && responseTimeMsOrOptions !== null) {
    return { responseTimeMs: responseTimeMsOrOptions.responseTimeMs ?? null, options: responseTimeMsOrOptions };
  }

  return { responseTimeMs: responseTimeMsOrOptions ?? maybeOptions?.responseTimeMs ?? null, options: maybeOptions ?? {} };
}

function createReviewEvent({ deck, item, variant, rating, responseTimeMs, now, previousState, nextState, flags }: CreateReviewEventInput): ReviewEventRecord {
  return {
    id: makeId("review"),
    userId: "local-user",
    deckId: deck.id,
    learningItemId: item.id,
    variantId: variant?.id ?? null,
    reviewableType: variant ? "variant" : "card",
    reviewableId: variant?.id ?? item.id,
    sourceCardId: item.id,
    rating,
    answeredAt: now,
    responseTimeMs,
    schedulerBefore: { card: previousState, variant: null },
    schedulerAfter: { card: nextState, variant: null },
    flags: flags ?? {},
    createdAt: now,
  };
}

export function answerVariant(
  deck: Deck,
  learningItemId: string,
  cardVariantId: string | null | undefined,
  rating: ReviewRating,
  responseTimeMsOrOptions: number | ReviewServiceOptions | null = null,
  maybeOptions: ReviewServiceOptions = {},
) {
  const { responseTimeMs, options } = resolveResponseArgs(responseTimeMsOrOptions, maybeOptions);
  const now = new Date(options.now ?? new Date()).toISOString();
  const targetItemId = learningItemId;
  let event: ReviewEventRecord | null = null;
  let updatedCard: LearningItem | null = null;

  const cards = (deck.cards ?? []).map((card) => {
    if (card.id !== targetItemId) return card;

    const item = normalizeLearningItem(card);
    assertReviewable(item);
    const variant = findVariant(item, cardVariantId);
    if (cardVariantId && cardVariantId !== item.id && !variant) {
      throw new Error(`Variante nicht gefunden: ${String(cardVariantId ?? "")}`);
    }
    if (variant && !belongsToLearningItem(item, variant)) {
      throw new Error("Diese Variante gehört nicht zur angegebenen Grundkarte.");
    }

    const previousState = createReviewState(item.reviewState);
    const fallbackInfo = rating === "again" ? getVariantFallbackTarget(item, variant) : null;
    const outcome = simulateRatingOutcome({
      learningItem: item,
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
      ? item.variants.map((candidate) => candidate.id === variant.id ? {
          ...candidate,
          performance: updateVariantPerformance(candidate.performance, rating, {
            responseTimeMs,
            reviewedAt: now,
            learningItemId: item.id,
            variantId: candidate.id,
          }),
          updatedAt: now,
        } : candidate)
      : item.variants;
    updatedCard = updateCoreStateFromReview({ ...item, variants }, nextState, now);
    event = createReviewEvent({
      deck,
      item,
      variant,
      rating,
      responseTimeMs,
      now,
      previousState,
      nextState,
      flags: options.flags,
    });
    return updatedCard;
  });

  const committedCard = updatedCard as LearningItem | null;
  const committedEvent = event as ReviewEventRecord | null;
  if (!committedCard || !committedEvent) {
    throw new Error(`Grundkarte nicht gefunden: ${String(targetItemId ?? "")}`);
  }

  return {
    deck: {
      ...deck,
      cards,
      reviewEvents: [committedEvent, ...(deck.reviewEvents ?? [])],
      updatedAt: now,
    },
    event: committedEvent,
    updatedCard: committedCard,
    learningItem: committedCard,
    variant: committedCard.variants.find((variant) => variant.id === committedEvent.variantId) ?? null,
  };
}

export function recordReviewRating(deck: Deck, reviewable: ReviewableItem, rating: ReviewRating, options: ReviewServiceOptions = {}) {
  const sourceCardId = reviewable.sourceCardId ?? reviewable.card?.id ?? reviewable.id;
  const card = (deck.cards ?? []).find((candidate) => candidate.id === sourceCardId);
  const variantId = reviewable.reviewableType === "variant" ? reviewable.id : null;

  return answerVariant(deck, sourceCardId, variantId, rating, options.responseTimeMs ?? null, options);
}

function selectVariantForLearningItem(item: LearningItem, options: ReviewServiceOptions = {}): CardVariant | null {
  return selectAutomaticReviewVariant(item, { allowLearningVariant: true, ...options });
}

function createFallbackViewModel(item: LearningItem) {
  const state = item.reviewState;
  if (!state.fallbackUntilCorrect && !state.forcedVariantId) return null;

  const forcedVariant = (item.variants ?? []).find((variant) => variant.id === state.forcedVariantId) ?? null;
  const failedVariant = (item.variants ?? []).find((variant) => variant.id === state.lastFailedVariantId) ?? null;

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

function createReviewItemViewModel(deck: Deck, selectedItem: LearningItem | null, options: ReviewServiceOptions = {}) {
  if (!selectedItem) return null;

  const now = options.now ?? new Date().toISOString();
  const reviewEvents = (options.reviewEvents ?? deck.reviewEvents ?? []) as LegacyReviewEvent[];
  const variantReviewModel = createVariantReviewModel(selectedItem, reviewEvents, {
    now,
  });
  const fallbackInfo = createFallbackViewModel(selectedItem);
  const variant = selectVariantForLearningItem(selectedItem, { now, reviewEvents, variantSession: options.variantSession });
  const fallbackTarget = getVariantFallbackTarget(selectedItem, variant);
  const ratingButtonOptions = getReviewButtonOptions(selectedItem, variant, {
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
    learningItem: selectedItem,
    card: selectedItem,
    learningItemId: selectedItem.id,
    cardId: selectedItem.id,
    variant,
    cardVariantId: variant?.id ?? selectedItem.id,
    variantId: variant?.id ?? selectedItem.id,
    front: variant?.front || getLearningItemQuestion(selectedItem),
    back: variant?.back || getLearningItemAnswer(selectedItem),
    state: selectedItem.reviewState,
    reviewState: selectedItem.reviewState,
    maturity: variantReviewModel.maturity,
    variantReadiness: variantReviewModel.readiness,
    variantCoverage: variantReviewModel.coverage,
    variantGenerationRecommendation: variantReviewModel.variantGenerationRecommendation,
    variantGenerationPlan: variantReviewModel.variantGenerationPlan,
    ratingButtonOptions,
    fallbackInfo,
    answerSideAnchorMiniCard: getAnswerSideAnchorMiniCard(selectedItem, variant),
    schedulerInfo: {
      schedulerVersion: selectedItem.reviewState.schedulerVersion ?? SCHEDULER_VERSION,
      selectedBy: options.selectedBy ?? "due_learning_item",
      queueKind: options.queueKind ?? null,
    },
  };
}

export function createDailyReviewSessionState(items: Array<{ deckId?: string; learningItemId?: string } | null | undefined> = []): DailyReviewSessionState {
  const initialKeys = items
    .map((item) => item?.deckId && item.learningItemId ? reviewKey(item.deckId, item.learningItemId) : "")
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
  items: Array<{ deckId?: string; learningItemId?: string } | null | undefined> = [],
  options: { preserveInitialKey?: string } = {},
): DailyReviewSessionState {
  const completed = new Set(session.completedInitialKeys);
  const repeats = new Set(session.repeatKeys);
  const remainingInitialKeys = new Set(session.remainingInitialKeys.filter((key) => key === options.preserveInitialKey));
  for (const item of items) {
    if (item?.deckId && item.learningItemId) remainingInitialKeys.add(reviewKey(item.deckId, item.learningItemId));
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
  const completed = session.completedInitialKeys.includes(key);
  return {
    ...session,
    initialKeys: completed ? session.initialKeys : session.initialKeys.filter((candidate) => candidate !== key),
    remainingInitialKeys: session.remainingInitialKeys.filter((candidate) => candidate !== key),
    repeatKeys: session.repeatKeys.filter((candidate) => candidate !== key),
  };
}

export function advanceDailyReviewSession(
  session: DailyReviewSessionState,
  input: { key: string; rating: ReviewRating; nextReviewState: ReviewState },
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
    return candidateEntry ? isLearningAvailable(candidateEntry.learningItem, now, learnAheadMinutes, options) : false;
  }) ?? null;
  const key = initialKey ?? repeatKey;
  if (!key) return null;
  const entry = entriesByKey.get(key);
  if (!entry) return null;

  const isRepeat = session.repeatKeys.includes(key) && !session.remainingInitialKeys.includes(key);
  const item = createReviewItemViewModel(entry.deck, entry.learningItem, {
    ...options,
    now,
    reviewEvents: sessionIndex.reviewEventsByKey.get(key) ?? [],
    selectedBy: isRepeat ? "session_repeat" : "session_initial",
    queueKind: isRepeat ? "repeat" : isNewLearningItem(entry.learningItem) ? "new" : "due",
  });
  if (!item) return null;
  return {
    ...item,
    sessionInfo: {
      key,
      isRepeat,
      isEarlyRepeat: isRepeat && !isDue(entry.learningItem.reviewState, now),
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
    for (const learningItem of activeLearningItems(deck)) {
      const key = reviewKey(deck.id, learningItem.id);
      const entry = { deck, learningItem, key };
      if (dailyConsumption.reviewedTodayKeys.has(key)) reviewedEntries.set(key, entry);
      if (excludeKeys.has(key)) continue;

      if (isNewLearningItem(learningItem)) {
        const state = learningItem.reviewState;
        if (isReviewDueByLearningDay(state, now, options)) newEntries.push(entry);
        continue;
      }

      const state = learningItem.reviewState;
      if (isLearningState(state)) {
        if (isLearningDueByToday(learningItem, now, options)) learningEntries.push(entry);
        if (isIntradayLearning(learningItem, now, options)) {
          if (isLearningAvailable(learningItem, now, learnAheadMinutes, options)) intradayLearningEntries.push(entry);
        } else if (isLearningDueByToday(learningItem, now, options)) {
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
      calculateRetrievability(entry.learningItem.reviewState, now),
    ]))
    : null;
  reviewEntries.sort((left, right) => compareReviewQueueEntries(left, right, retrievabilityByKey));
  const randomSeed = rootSettings.newCardSortOrder === "random"
    ? `${getLocalReviewDateKey(now, options)}:${rootDeck?.id ?? ""}`
    : null;
  const randomKeys = randomSeed
    ? new Map(newEntries.map((entry) => [entry.key, stableContentHash([randomSeed, entry.learningItem.id], "queue")]))
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
    const settings = createDefaultDeckSettings(deck.deckSettings ?? {});
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
  const selectedReviewEntries = takeWithinDeckLimits(reviewCandidates, deckPaths, limits, "review");
  const selectedNewEntries = takeWithinDeckLimits(newEntries, deckPaths, limits, "new");
  const selectedDueEntries = [...intradayLearningEntries, ...selectedReviewEntries];
  const selectedEntries = orderDailyQueueEntries(selectedDueEntries, selectedNewEntries, rootSettings.newReviewOrder);
  const dailyProgressEntries = [...learningEntries, ...selectedReviewEntries, ...selectedNewEntries];
  const dailyProgress = summarizeDailyReviewProgress(reviewedEntries, dailyProgressEntries, dailyConsumption.reviewedTodayKeys, now, options);
  const items: DailyReviewQueueEntry[] = selectedEntries.map((entry) => ({
    deckId: entry.deck.id,
    learningItemId: entry.learningItem.id,
    key: entry.key,
    queueKind: isNewLearningItem(entry.learningItem) ? "new" : "due",
  }));

  return {
    deckId: rootDeck?.id ?? null,
    deckName: rootDeck?.name ?? "",
    scopeDeckIds: scopeDecks.map((deck) => deck.id),
    items,
    total: items.length,
    dailyProgress,
    dueCount: selectedReviewEntries.length,
    availableDueCards: reviewCandidates.length,
    inProgressCount: dailyProgress.inProgressCount,
    availableLearningCards: learningEntries.length,
    maximumReviewsPerDay: rootSettings.maximumReviewsPerDay,
    reviewsCompletedToday,
    remainingReviews,
    newReviewOrder: rootSettings.newReviewOrder,
    newCount: selectedNewEntries.length,
    availableNewCards: newEntries.length,
    newCardsPerDay: newLimit,
    newCardsIntroducedToday: introducedToday,
    remainingNewCards,
    limitSummary: {
      hiddenDueCount: reviewCandidates.length - selectedReviewEntries.length,
      hiddenNewCount: newEntries.length - selectedNewEntries.length,
      reached: reviewCandidates.length > selectedReviewEntries.length || newEntries.length > selectedNewEntries.length,
    },
    dateKey: getLocalReviewDateKey(now, options),
  };
}

export function recordVariantFeedback(deck: Deck, reviewable: ReviewableItem, options: ReviewServiceOptions = {}) {
  const now = new Date(options.now ?? new Date()).toISOString();
  if (!reviewable?.isVariant || !reviewable.sourceCardId) {
    return { deck, updatedCard: null };
  }

  let updatedCard: LearningItem | null = null;
  const cards = (deck.cards ?? []).map((card) => {
    if (card.id !== reviewable.sourceCardId) return card;
    if (!(card.variants ?? []).some((variant) => variant.id === reviewable.id)) return card;

    updatedCard =
      options.action === "disable"
        ? deactivateVariant(card, reviewable.id, options.reason ?? "Nutzer hat die Variante deaktiviert.")
        : flagVariant(card, reviewable.id, options.feedbackType ?? "fachlich_falsch", options.note ?? "");
    return updatedCard;
  });

  if (!updatedCard) {
    return { deck, updatedCard: null };
  }

  return {
    deck: {
      ...deck,
      cards,
      updatedAt: now,
    },
    updatedCard,
  };
}
