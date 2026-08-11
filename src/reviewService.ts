import { SCHEDULER_VERSION, getReviewButtonOptions, simulateRatingOutcome } from "./scheduler.ts";
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
  createVersionEntry,
  getActiveVariants,
  getAnswerSideAnchorMiniCard,
  getLearningItemAnswer,
  getLearningItemQuestion,
  getOriginalVariant,
  isLearningItemReviewBlocked,
  makeId,
  normalizeLearningItem,
  updateVariantPerformance,
} from "./coreModel.ts";
import type {
  CardVariant,
  Deck,
  LearningItem,
  NewReviewOrder,
  ReviewRating,
  ReviewState,
  VariantFeedbackType,
} from "./coreTypes.ts";
import { getLearningDayKey } from "./learningDay.ts";
import { normalizeLearnAheadMinutes } from "./learningProfiles.ts";

type DateInput = string | number | Date;

interface ReviewEventRecord {
  id: string;
  userId: string;
  deckId: string;
  learningItemId: string;
  cardId: string;
  cardVariantId: string;
  variantId: string;
  reviewableType: "card" | "variant";
  reviewableId: string;
  sourceCardId: string;
  rating: ReviewRating;
  reviewedAt: string;
  answeredAt: string;
  responseTimeMs: number | null;
  variantLevel: number;
  variantType: string;
  previousLearningItemStateJson: ReviewState;
  nextLearningItemStateJson: ReviewState;
  schedulerVersion: string;
  schedulerParamsJson: unknown;
  anchorVariantId: string | null;
  anchorSnapshotJson: unknown;
  schedulerBefore: { card: ReviewState; variant: unknown };
  schedulerAfter: { card: ReviewState; variant: unknown };
  fallbackInfo: unknown;
  flags: Record<string, unknown>;
  createdAt: string;
}

type LegacyReviewEvent = Omit<Partial<ReviewEventRecord>, "previousLearningItemStateJson" | "schedulerBefore"> & {
  previousLearningItemStateJson?: unknown;
  schedulerBefore?: { card?: unknown; variant?: unknown };
};

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
  variant: CardVariant;
  rating: ReviewRating;
  responseTimeMs: number | null;
  now: string;
  previousState: ReviewState;
  nextState: ReviewState;
  previousVariantState: unknown;
  nextVariantState: unknown;
  anchorMiniCard: ReturnType<typeof getAnswerSideAnchorMiniCard>;
  fallbackInfo: ReturnType<typeof getVariantFallbackTarget> | null;
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
  const state = item?.learningItemState ?? item?.reviewState;
  return state?.state === "new" && stateReps(state) === 0;
}

function isLearningDueByToday(item: LearningItem, now: DateInput, options: ReviewServiceOptions = {}): boolean {
  const state = item.learningItemState ?? item.reviewState;
  const dueTime = new Date(state?.dueAt ?? "").getTime();
  const dueKey = learningDayKey(dueTime, options);
  const currentKey = learningDayKey(now, options);
  return isLearningState(state) && Number.isFinite(dueTime) && Boolean(dueKey && currentKey && dueKey <= currentKey);
}

function isLearningAvailable(item: LearningItem, now: DateInput, learnAheadMinutes: number, options: ReviewServiceOptions = {}): boolean {
  const state = item.learningItemState ?? item.reviewState;
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
    .map((card) => normalizeLearningItem(card))
    .filter((item) => item.status !== "deleted" && item.draftStatus !== "draft" && !isLearningItemReviewBlocked(item));
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

  const scopedIds = new Set([selected.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const deck of decks) {
      if (deck.parentDeckId && scopedIds.has(deck.parentDeckId) && !scopedIds.has(deck.id)) {
        scopedIds.add(deck.id);
        changed = true;
      }
    }
  }

  return decks.filter((deck) => scopedIds.has(deck.id));
}

function reviewEventDate(event: LegacyReviewEvent): string | undefined {
  return event.reviewedAt ?? event.answeredAt ?? event.createdAt;
}

function wasNewBeforeReview(event: LegacyReviewEvent): boolean {
  const previous = objectRecord(event.previousLearningItemStateJson ?? event.schedulerBefore?.card);
  return previous.state === "new" || stateReps(previous) === 0;
}

function reviewKey(deckId: string, learningItemId: string | undefined): string {
  return `${deckId}:${learningItemId}`;
}

function compareQueueEntries(left: QueueEntry, right: QueueEntry): number {
  const leftDue = new Date(left.learningItem.reviewState?.dueAt ?? left.learningItem.createdAt ?? 0).getTime();
  const rightDue = new Date(right.learningItem.reviewState?.dueAt ?? right.learningItem.createdAt ?? 0).getTime();
  return leftDue - rightDue || String(left.learningItem.createdAt ?? "").localeCompare(String(right.learningItem.createdAt ?? ""));
}

export function getLocalReviewDateKey(now: DateInput = new Date(), options: ReviewServiceOptions = {}): string {
  return learningDayKey(now, options) ?? new Date(now).toISOString().slice(0, 10);
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
  const byDeckId = new Map<string, { introduced: number; reviewed: number }>();
  const reviewedTodayKeys = new Set<string>();
  let introducedTotal = 0;
  let reviewedTotal = 0;
  for (const deck of scopeDecks) {
    const introduced = new Set<string>();
    const reviewed = new Set<string>();
    for (const event of (deck.reviewEvents ?? []) as LegacyReviewEvent[]) {
      if (learningDayKey(reviewEventDate(event) ?? now, options) !== dateKey) continue;
      const learningItemId = event.learningItemId ?? event.cardId;
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
    const state = (entry.learningItem.learningItemState ?? entry.learningItem.reviewState)?.state;
    const inProgress = state === "learning" || state === "relearning";
    const reviewedToday = reviewedTodayKeys.has(key);
    const dueOnFutureDay = (learningDayKey((entry.learningItem.learningItemState ?? entry.learningItem.reviewState)?.dueAt ?? now, options) ?? "") > getLocalReviewDateKey(now, options);

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
    learningItemState: reviewState,
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
  const original = getOriginalVariant(item);
  if (!variantId || variantId === item.id) return original;
  return (item.variants ?? []).find((variant) => variant.id === variantId) ?? null;
}

function belongsToLearningItem(item: LearningItem | null, variant: CardVariant | null): boolean {
  if (!item || !variant) return false;
  return [variant.learningItemId, variant.cardId, variant.sourceCardId].filter(Boolean).every((id) => id === item.id);
}

function createVariantCompatibilityState(
  variant: CardVariant,
  rating: ReviewRating,
  now: string,
  learningItemId: string,
): ReviewState & { schedulerCompatibilityOnly: true } {
  const previous = variant.reviewState ?? {} as Partial<ReviewState>;
  return {
    ...previous,
    id: previous.id ?? makeId("state"),
    learningItemId,
    reviewableType: "variant",
    reviewableId: variant.id,
    repetitions: Number(previous.repetitions ?? 0) + 1,
    lastReviewedAt: now,
    lastRating: rating,
    schedulerCompatibilityOnly: true,
  } as ReviewState & { schedulerCompatibilityOnly: true };
}

function resolveResponseArgs(responseTimeMsOrOptions: number | ReviewServiceOptions | null, maybeOptions: ReviewServiceOptions) {
  if (typeof responseTimeMsOrOptions === "object" && responseTimeMsOrOptions !== null) {
    return { responseTimeMs: responseTimeMsOrOptions.responseTimeMs ?? null, options: responseTimeMsOrOptions };
  }

  return { responseTimeMs: responseTimeMsOrOptions ?? maybeOptions?.responseTimeMs ?? null, options: maybeOptions ?? {} };
}

function createReviewEvent({ deck, item, variant, rating, responseTimeMs, now, previousState, nextState, previousVariantState, nextVariantState, anchorMiniCard, fallbackInfo, flags }: CreateReviewEventInput): ReviewEventRecord {
  return {
    id: makeId("review"),
    userId: "local-user",
    deckId: deck.id,
    learningItemId: item.id,
    cardId: item.id,
    cardVariantId: variant.id,
    variantId: variant.id,
    reviewableType: variant.isOriginal ? "card" : "variant",
    reviewableId: variant.id,
    sourceCardId: item.id,
    rating,
    reviewedAt: now,
    answeredAt: now,
    responseTimeMs,
    variantLevel: variant.variantLevel ?? 1,
    variantType: variant.variantType ?? "basic",
    previousLearningItemStateJson: previousState,
    nextLearningItemStateJson: nextState,
    schedulerVersion: SCHEDULER_VERSION,
    schedulerParamsJson: nextState.schedulerParamsJson ?? null,
    anchorVariantId: variant.anchorVariantId ?? null,
    anchorSnapshotJson: anchorMiniCard?.shouldShow ? anchorMiniCard : anchorMiniCard ?? null,
    schedulerBefore: { card: previousState, variant: previousVariantState ?? null },
    schedulerAfter: { card: nextState, variant: nextVariantState ?? null },
    fallbackInfo: fallbackInfo ?? null,
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
    if (!variant) {
      throw new Error(`Variante nicht gefunden: ${String(cardVariantId ?? "")}`);
    }
    if (!belongsToLearningItem(item, variant)) {
      throw new Error("Diese Variante gehört nicht zur angegebenen Grundkarte.");
    }

    const previousState = createReviewState(item.learningItemState ?? item.reviewState);
    const fallbackInfo = rating === "again" ? getVariantFallbackTarget(item, variant, (deck.reviewEvents ?? []) as LegacyReviewEvent[]) : null;
    const outcome = simulateRatingOutcome({
      learningItem: item,
      previousState,
      variant,
      rating,
      now,
      deckSettings: deck.deckSettings,
      dayStartHour: options.dayStartHour,
      timeZone: options.timeZone,
      isVariant: !variant.isOriginal,
      variantId: variant.id,
      variantIsOriginal: Boolean(variant.isOriginal),
      variantLevel: variant.variantLevel ?? 1,
      variantType: variant.variantType ?? "basic",
      variantPerformance: variant.performance ?? null,
      fallbackVariantId: fallbackInfo?.fallbackVariantId ?? null,
    });
    const nextState = outcome.nextReviewState;
    const anchorMiniCard = getAnswerSideAnchorMiniCard(item, variant);
    const previousVariantState = variant.reviewState ?? null;
    const nextVariantState = createVariantCompatibilityState(variant, rating, now, item.id);
    const nextPerformance = updateVariantPerformance(variant.performance, rating, {
      responseTimeMs,
      reviewedAt: now,
      learningItemId: item.id,
      variantId: variant.id,
    });
    const variants = (item.variants ?? []).map((candidate) =>
      candidate.id === variant.id
        ? {
            ...candidate,
            reviewState: nextVariantState,
            performance: nextPerformance,
            updatedAt: now,
          }
        : candidate,
    ) as CardVariant[];
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
      previousVariantState,
      nextVariantState,
      anchorMiniCard,
      fallbackInfo,
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
      versionLog: [
        ...(deck.versionLog ?? []),
        createVersionEntry({
          objectType: "deck",
          objectId: deck.id,
          changeType: "review_event_recorded",
          after: { eventId: committedEvent.id, rating, learningItemId: committedCard.id, variantId: committedEvent.variantId },
          createdAt: now,
        }),
      ],
      updatedAt: now,
    },
    event: committedEvent,
    updatedCard: committedCard,
    learningItem: committedCard,
    variant: committedCard.variants.find((variant) => variant.id === committedEvent.variantId) ?? null,
  };
}

export function createReviewSession(deck: Deck, options: ReviewServiceOptions = {}) {
  const now = new Date(options.now ?? new Date()).toISOString();
  const activeCards = activeLearningItems(deck);
  const dueCards = activeCards.filter((card) => {
    const state = card.learningItemState ?? card.reviewState;
    return isLearningState(state) ? isDue(state, now) : isReviewDueByLearningDay(state, now, options);
  });
  const sessionCards = dueCards.length > 0 ? dueCards : activeCards.slice(0, Math.min(12, activeCards.length));
  const generated: CardVariant[] = [];
  const choicesByCardId = new Map<string, ReturnType<typeof chooseReviewCard>["reviewable"]>();

  const cards = (deck.cards ?? []).map((card) => {
    if (!sessionCards.some((sessionCard) => sessionCard.id === card.id)) return card;
    const choice = chooseReviewCard(card, deck.deckSettings, {
      variantSession: options.variantSession,
      allowGenerate: true,
      showGeneratedImmediately: true,
      language: options.language ?? "de",
    });
    generated.push(...choice.generated);
    choicesByCardId.set(card.id, choice.reviewable);
    return choice.card;
  });
  const items = sessionCards.map((card) => choicesByCardId.get(card.id)).filter(Boolean);

  return {
    deck: { ...deck, cards },
    session: {
      id: makeId("session"),
      deckId: deck.id,
      startedAt: now,
      variantSession: Boolean(options.variantSession),
      items,
      generatedVariantCount: generated.length,
    },
  };
}

export function recordReviewRating(deck: Deck, reviewable: ReviewableItem, rating: ReviewRating, options: ReviewServiceOptions = {}) {
  const sourceCardId = reviewable.sourceCardId ?? reviewable.card?.id ?? reviewable.id;
  const card = (deck.cards ?? []).find((candidate) => candidate.id === sourceCardId);
  const item = card ? normalizeLearningItem(card) : null;
  const variantId = reviewable.reviewableType === "variant" ? reviewable.id : getOriginalVariant(item)?.id ?? reviewable.id;

  return answerVariant(deck, sourceCardId, variantId, rating, options.responseTimeMs ?? null, options);
}

function selectVariantForLearningItem(item: LearningItem, options: ReviewServiceOptions = {}): CardVariant | null {
  return selectAutomaticReviewVariant(item, { allowLearningVariant: true, ...options }) ?? getOriginalVariant(item);
}

function createFallbackViewModel(item: LearningItem) {
  const state = item.learningItemState ?? item.reviewState ?? {};
  if (!state.fallbackUntilCorrect && !state.forcedVariantId) return null;

  const forcedVariant = (item.variants ?? []).find((variant) => variant.id === state.forcedVariantId) ?? getOriginalVariant(item);
  const failedVariant = (item.variants ?? []).find((variant) => variant.id === state.lastFailedVariantId) ?? null;

  return {
    active: true,
    fallbackVariantId: forcedVariant?.id ?? null,
    failedVariantId: failedVariant?.id ?? state.lastFailedVariantId ?? null,
    shouldUseOriginal: Boolean(forcedVariant?.isOriginal ?? true),
    fallbackReason: failedVariant
      ? `Nach Fehler bei Level ${failedVariant.variantLevel ?? 1}: Rückfall auf ${forcedVariant?.isOriginal ? "Originalkarte" : `Level ${forcedVariant?.variantLevel ?? 1}`}.`
      : "Fallback aktiv: CoRe nutzt Original oder eine einfachere Variante, bis wieder korrekt geantwortet wurde.",
  };
}

function createReviewItemViewModel(deck: Deck, selectedItem: LearningItem | null, options: ReviewServiceOptions = {}) {
  if (!selectedItem) return null;

  const now = options.now ?? new Date().toISOString();
  const reviewEvents = (deck.reviewEvents ?? []) as LegacyReviewEvent[];
  const variantReviewModel = createVariantReviewModel(selectedItem, reviewEvents, {
    now,
    autoGenerateAllowed: options.autoGenerateAllowed,
    language: options.language ?? "de",
  });
  const fallbackInfo = createFallbackViewModel(selectedItem);
  const variant = selectVariantForLearningItem(selectedItem, { now, reviewEvents, variantSession: options.variantSession });
  if (!variant) return null;
  const fallbackTarget = getVariantFallbackTarget(selectedItem, variant, reviewEvents);
  const ratingButtonOptions = getReviewButtonOptions(selectedItem, variant, {
    now,
    reviewEvents,
    deckSettings: deck.deckSettings,
    dayStartHour: options.dayStartHour,
    timeZone: options.timeZone,
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
    cardVariantId: variant.id,
    variantId: variant.id,
    front: variant.front || getLearningItemQuestion(selectedItem),
    back: variant.back || getLearningItemAnswer(selectedItem),
    state: selectedItem.learningItemState ?? selectedItem.reviewState,
    reviewState: selectedItem.learningItemState ?? selectedItem.reviewState,
    maturity: variantReviewModel.maturity,
    variantReadiness: variantReviewModel.readiness,
    variantCoverage: variantReviewModel.coverage,
    variantGenerationRecommendation: variantReviewModel.variantGenerationRecommendation,
    variantGenerationPlan: variantReviewModel.variantGenerationPlan,
    ratingButtonOptions,
    fallbackInfo,
    answerSideAnchorMiniCard: getAnswerSideAnchorMiniCard(selectedItem, variant),
    schedulerInfo: {
      schedulerVersion: (selectedItem.learningItemState ?? selectedItem.reviewState)?.schedulerVersion ?? SCHEDULER_VERSION,
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
  const entries = decks
    .flatMap((deck) => activeLearningItems(deck).map((learningItem) => ({ deck, learningItem, key: reviewKey(deck.id, learningItem.id) })));
  const entriesByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const now = options.now ?? new Date().toISOString();
  const rootDeckId = options.deckId ?? decks[0]?.id ?? null;
  const rootDeck = decks.find((deck) => deck.id === rootDeckId) ?? decks[0] ?? null;
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
    selectedBy: isRepeat ? "session_repeat" : "session_initial",
    queueKind: isRepeat ? "repeat" : isNewLearningItem(entry.learningItem) ? "new" : "due",
  });
  if (!item) return null;
  return {
    ...item,
    sessionInfo: {
      key,
      isRepeat,
      isEarlyRepeat: isRepeat && !isDue(entry.learningItem.learningItemState ?? entry.learningItem.reviewState, now),
    },
  };
}

export function getNextReviewItem(deck: Deck, options: ReviewServiceOptions = {}) {
  const now = options.now ?? new Date().toISOString();
  const activeItems = activeLearningItems(deck);
  const dueItems = activeItems.filter((item) => {
    const state = item.learningItemState ?? item.reviewState;
    return isLearningState(state) ? isDue(state, now) : isReviewDueByLearningDay(state, now, options);
  });
  const selectedItem = dueItems[0] ?? activeItems[0] ?? null;

  if (!selectedItem) return null;

  return createReviewItemViewModel(deck, selectedItem, {
    ...options,
    selectedBy: dueItems.length > 0 ? "due_learning_item" : "fallback_learning_item",
  });
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
  const reviewedEntries = new Map<string, QueueEntry>();
  const learningEntries: QueueEntry[] = [];
  const availableLearningEntries: QueueEntry[] = [];
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
        newEntries.push(entry);
        continue;
      }

      const state = learningItem.learningItemState ?? learningItem.reviewState;
      if (isLearningState(state)) {
        if (isLearningDueByToday(learningItem, now, options)) learningEntries.push(entry);
        if (isLearningAvailable(learningItem, now, learnAheadMinutes, options)) availableLearningEntries.push(entry);
      } else if (state?.state === "review" && isReviewDueByLearningDay(state, now, options)) {
        reviewEntries.push(entry);
      }
    }
  }

  learningEntries.sort(compareQueueEntries);
  availableLearningEntries.sort(compareQueueEntries);
  reviewEntries.sort(compareQueueEntries);
  newEntries.sort(compareQueueEntries);

  const newLimit = getEffectiveNewCardsPerDay(rootDeck, { ...options, now });
  const introducedToday = dailyConsumption.introducedTotal;
  const reviewsCompletedToday = dailyConsumption.reviewedTotal;
  const remainingNewCards = Math.max(0, newLimit - introducedToday);
  const remainingReviews = Math.max(0, rootSettings.maximumReviewsPerDay - reviewsCompletedToday);
  const selectedReviewEntries = reviewEntries.slice(0, remainingReviews);
  const selectedNewEntries = newEntries.slice(0, remainingNewCards);
  const selectedDueEntries = [...availableLearningEntries, ...selectedReviewEntries].sort(compareQueueEntries);
  const selectedEntries = orderDailyQueueEntries(selectedDueEntries, selectedNewEntries, rootSettings.newReviewOrder);
  const dailyProgressEntries = [...learningEntries, ...selectedReviewEntries, ...selectedNewEntries];
  const dailyProgress = summarizeDailyReviewProgress(reviewedEntries, dailyProgressEntries, dailyConsumption.reviewedTodayKeys, now, options);
  const items = selectedEntries
    .map((entry) =>
      createReviewItemViewModel(entry.deck, entry.learningItem, {
        ...options,
        now,
        selectedBy: entry.learningItem.reviewState?.reps === 0 || entry.learningItem.reviewState?.repetitions === 0 ? "new_learning_item" : "due_learning_item",
        queueKind: isNewLearningItem(entry.learningItem) ? "new" : "due",
      }),
    )
    .filter(Boolean);

  return {
    deckId: rootDeck?.id ?? null,
    deckName: rootDeck?.name ?? "",
    scopeDeckIds: scopeDecks.map((deck) => deck.id),
    items,
    total: items.length,
    dailyProgress,
    dueCount: selectedReviewEntries.length,
    availableDueCards: reviewEntries.length,
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
      versionLog: [
        ...(deck.versionLog ?? []),
        createVersionEntry({
          objectType: "deck",
          objectId: deck.id,
          changeType: options.action === "disable" ? "variant_disabled" : "variant_flagged",
          after: { cardId: reviewable.sourceCardId, variantId: reviewable.id },
          createdAt: now,
        }),
      ],
      updatedAt: now,
    },
    updatedCard,
  };
}
