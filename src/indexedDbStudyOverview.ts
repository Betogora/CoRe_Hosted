// Private to indexedDbCoreRepository.ts: the account study overview, review counters and the deck summaries built from them.
import { createDefaultDeckSettings } from "./coreModel.ts";
import type { ReviewEvent } from "./coreTypes.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import { countsTowardDailyLimits } from "./reviewEventKinds.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";
import { getLearningDayRange } from "./learningDay.ts";
import { markStartupPhaseReady, markStartupPhaseStarted } from "./appPerformance.ts";
import type { AccountStudyOverview, DeckStudySummary } from "./workspaceReplica.ts";
import {
  STORE,
  type StoredCardCatalog,
  type StoredReviewDayCounts,
  type WorkspaceDeckSummary,
  requestResult,
  transactionDone,
  reviewHourKey,
  emptyDeckStudySummary,
} from "./indexedDbStore.ts";
import {
  studyOverviewContext,
  overviewScheduleBucket,
  applyCatalogSummaryChanges,
  type BuriedSiblingCounts,
  buriedSiblingsByDeck,
} from "./indexedDbStudyCounts.ts";
import { createMainThreadBudget } from "./mainThreadBudget.ts";

export function createStudyOverview({ database, flushWrites, decks, isCatalogComplete, putSyncMetadata, initial }: {
  database: IDBDatabase;
  flushWrites: () => Promise<void>;
  decks: () => WorkspaceDeckSummary[];
  isCatalogComplete: () => boolean;
  putSyncMetadata: (key: string, value: unknown) => Promise<void>;
  initial: { studyOverview: AccountStudyOverview | null; reviewHourCounts: Record<string, number> | null; reviewDayCounts: StoredReviewDayCounts | null };
}) {
  let reviewHourCounts: Record<string, number> | null = initial.reviewHourCounts;
  let reviewDayCountsCache: StoredReviewDayCounts | null = initial.reviewDayCounts;
  let studyOverview: AccountStudyOverview | null = initial.studyOverview;
  let firstDeckSummariesStarted = false;

  const adjustOverviewCount = (counts: Record<string, number>, key: string, delta: number) => {
    const next = Math.max(0, (counts[key] ?? 0) + delta);
    if (next === 0) delete counts[key];
    else counts[key] = next;
  };

  /**
   * Deck counters and the study overview after catalog changes. A mass change passes all its rows at once, so each
   * deck summary and the overview are written once (KV4).
   */
  const applyReplicaCatalogChanges = async (
    transaction: IDBTransaction,
    changes: ReadonlyArray<{ deckId: string; before: StoredCardCatalog | null; after: StoredCardCatalog | null }>,
    referenceAt = new Date().toISOString(),
    updateOverview = true,
  ) => {
    await applyCatalogSummaryChanges(transaction, changes);
    if (!studyOverview || !updateOverview) return;
    let next: Pick<AccountStudyOverview, "dueByDeck" | "availableNewByDeck" | "availableLearningByDeck" | "forecastByDay"> | null = null;
    for (const { before, after } of changes) {
      const previousBucket = overviewScheduleBucket(before, studyOverview, referenceAt);
      const nextBucket = overviewScheduleBucket(after, studyOverview, referenceAt);
      if (previousBucket?.kind === nextBucket?.kind && previousBucket?.key === nextBucket?.key) continue;
      next ??= {
        dueByDeck: { ...studyOverview.dueByDeck },
        availableNewByDeck: { ...studyOverview.availableNewByDeck },
        availableLearningByDeck: { ...studyOverview.availableLearningByDeck },
        forecastByDay: { ...studyOverview.forecastByDay },
      };
      const counts = next;
      const countsFor = (kind: "available-new" | "available-learning" | "due" | "forecast") => (
        kind === "available-new" ? counts.availableNewByDeck
          : kind === "available-learning" ? counts.availableLearningByDeck
            : kind === "due" ? counts.dueByDeck
              : counts.forecastByDay
      );
      if (previousBucket) adjustOverviewCount(countsFor(previousBucket.kind), previousBucket.key, -1);
      if (nextBucket) adjustOverviewCount(countsFor(nextBucket.kind), nextBucket.key, 1);
    }
    if (!next) return;
    studyOverview = { ...studyOverview, ...next, generatedAt: referenceAt };
    transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: studyOverview });
  };
  const applyReplicaCatalogChange = (
    transaction: IDBTransaction,
    deckId: string,
    before: StoredCardCatalog | null,
    after: StoredCardCatalog | null,
    referenceAt = new Date().toISOString(),
    updateOverview = true,
  ) => applyReplicaCatalogChanges(transaction, [{ deckId, before, after }], referenceAt, updateOverview);

  return {
    applyReplicaCatalogChanges,
    applyReplicaCatalogChange,
    /** Counts an answer into the hour and day counters before its write is queued; a taken-back answer counts -1. */
    countReview(answeredAt: string, delta: 1 | -1 = 1) {
      const add = (count = 0) => Math.max(0, count + delta);
      const hourKey = reviewHourKey(answeredAt);
      if (hourKey) reviewHourCounts = { ...(reviewHourCounts ?? {}), [hourKey]: add((reviewHourCounts ?? {})[hourKey]) };
      if (!reviewDayCountsCache) return;
      const dayKey = getStudyHeatmapDayKey(answeredAt, reviewDayCountsCache.timeZone, reviewDayCountsCache.dayStartHour);
      if (dayKey) reviewDayCountsCache = { ...reviewDayCountsCache, counts: { ...reviewDayCountsCache.counts, [dayKey]: add(reviewDayCountsCache.counts[dayKey]) } };
    },
    /**
     * The first answer of a card today, new or review, counts once into the overview of today's learning day. A
     * taken-back answer (`delta` -1, its event already removed) leaves it when no other such answer remains today.
     */
    async countReviewInOverview(transaction: IDBTransaction, event: ReviewEvent, deckId: string, delta: 1 | -1 = 1) {
      const overviewContext = studyOverview ? studyOverviewContext(studyOverview) : null;
      const overviewDay = overviewContext ? getStudyHeatmapDayKey(event.answeredAt, overviewContext.timeZone, overviewContext.dayStartHour) : null;
      if (studyOverview && overviewContext && overviewDay === studyOverview.dayKey && countsTowardDailyLimits(event)) {
        const range = getLearningDayRange(event.answeredAt, overviewContext);
        const priorEvents = range ? await requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("cardAnswered").getAll(IDBKeyRange.bound(
          [event.cardId, new Date(range.start).toISOString(), ""],
          [event.cardId, new Date(range.end).toISOString(), ""],
          false,
          true,
        ))) : [];
        const wasNew = (candidate: ReviewEvent) => ((candidate.schedulerBefore as any)?.card?.state ?? "new") === "new";
        const isIntroduction = wasNew(event);
        if (!priorEvents.some((prior) => countsTowardDailyLimits(prior) && wasNew(prior) === isIntroduction)) {
          const key = isIntroduction ? "introducedTodayByDeck" : "reviewedTodayByDeck";
          studyOverview = { ...studyOverview, [key]: { ...studyOverview[key], [deckId]: Math.max(0, (studyOverview[key][deckId] ?? 0) + delta) }, generatedAt: event.answeredAt };
          transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: studyOverview });
        }
      }
    },
    writeReviewCounts(transaction: IDBTransaction) {
      transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: reviewHourCounts ?? {} });
      if (reviewDayCountsCache) transaction.objectStore(STORE.syncMetadata).put({ key: "reviewDayCounts", value: reviewDayCountsCache });
    },
    async applyAccountStudyOverview(overview: AccountStudyOverview) {
      studyOverview = overview;
      await putSyncMetadata("accountStudyOverview", overview);
    },
    /** Account-wide due counts per future learning day, or null while no overview for this learning day exists. */
    async loadDueForecast({ now = new Date().toISOString(), dayStartHour = 0, timeZone }: { now?: string; dayStartHour?: number; timeZone?: string } = {}) {
      await flushWrites();
      const todayKey = getStudyHeatmapDayKey(now, timeZone, dayStartHour);
      const matches = studyOverview?.contextKey === `${timeZone ?? "local"}:${dayStartHour}` && studyOverview.dayKey === todayKey;
      return matches ? new Map(Object.entries(studyOverview!.forecastByDay)) : null;
    },
    /** The 365-day forecast arrives after the bootstrap and only completes the matching overview. */
    async applyDueForecast(forecast: { contextKey: string; forecastByDay: Record<string, number> }) {
      if (!studyOverview || studyOverview.contextKey !== forecast.contextKey) return;
      studyOverview = { ...studyOverview, forecastByDay: forecast.forecastByDay };
      await putSyncMetadata("accountStudyOverview", studyOverview);
    },
    async listDeckSummaries({ now = new Date().toISOString(), dayStartHour = 0, timeZone }: { now?: string; dayStartHour?: number; learnAheadMinutes?: number; timeZone?: string } = {}) {
      const measureFirstRun = !firstDeckSummariesStarted;
      if (measureFirstRun) {
        firstDeckSummariesStarted = true;
        markStartupPhaseStarted("firstDeckSummaries");
      }
      await flushWrites();
      const todayKey = getStudyHeatmapDayKey(now, timeZone, dayStartHour) ?? now.slice(0, 10);
      const contextKey = `${timeZone ?? "local"}:${dayStartHour}`;
      const dayRange = getLearningDayRange(now, { dayStartHour, timeZone });
      const overviewMatches = studyOverview?.contextKey === contextKey && studyOverview.dayKey === todayKey;
      const catalogIsComplete = isCatalogComplete();
      const transaction = database.transaction([
        STORE.deckStudySummaries,
        ...(catalogIsComplete ? [STORE.cardCatalog] : []),
        ...(!overviewMatches && catalogIsComplete ? [STORE.reviewEvents] : []),
      ], "readonly");
      const countState = (deckId: string, state: string) => requestResult(transaction.objectStore(STORE.cardCatalog).index("deckReviewDue").count(IDBKeyRange.bound(
        [deckId, 1, state, "", ""],
        [deckId, 1, state, new Date(dayRange!.end).toISOString(), ""],
        false,
        true,
      )));
      const [summaryRows, todayEventRows, dueRows, availableNewRows, availableLearningRows] = await Promise.all([
        requestResult<DeckStudySummary[]>(transaction.objectStore(STORE.deckStudySummaries).getAll()),
        dayRange && catalogIsComplete && !overviewMatches
          ? Promise.all(decks().map((deck) => requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("deckAnswered").getAll(IDBKeyRange.bound(
            [deck.id, new Date(dayRange.start).toISOString(), ""],
            [deck.id, new Date(dayRange.end).toISOString(), ""],
            false,
            true,
          )))))
          : Promise.resolve([] as ReviewEvent[][]),
        dayRange && catalogIsComplete ? Promise.all(decks().map((deck) => countState(deck.id, "review"))) : Promise.resolve([] as number[]),
        dayRange && catalogIsComplete ? Promise.all(decks().map((deck) => countState(deck.id, "new"))) : Promise.resolve([] as number[]),
        dayRange && catalogIsComplete
          ? Promise.all(decks().map(async (deck) => (await countState(deck.id, "learning")) + (await countState(deck.id, "relearning"))))
          : Promise.resolve([] as number[]),
      ]);
      await transactionDone(transaction);

      if (reviewDayCountsCache?.contextKey !== contextKey) {
        reviewDayCountsCache = { contextKey, timeZone, dayStartHour, counts: {} };
        await putSyncMetadata("reviewDayCounts", reviewDayCountsCache);
      }

      // Counts from the server overview already leave out today's buried siblings.
      const buriedByDeck = dayRange && catalogIsComplete
        ? await buriedSiblingsByDeck(database, decks(), dayRange, overviewMatches ? null : todayEventRows)
        : new Map<string, BuriedSiblingCounts>();
      const summaries = new Map(summaryRows.map((summary) => [summary.deckId, summary]));
      const result = new Map<string, DeckLibrarySummary>();
      const pause = createMainThreadBudget();
      for (const [index, deck] of decks().entries()) {
        await pause();
        const summary = summaries.get(deck.id) ?? emptyDeckStudySummary(deck.id);
        const introduced = new Set<string>();
        const reviewed = new Set<string>();
        if (catalogIsComplete && !overviewMatches) {
          for (const event of todayEventRows[index] ?? []) {
            if (!countsTowardDailyLimits(event)) continue;
            const before = (event.schedulerBefore as any)?.card;
            if (before?.state === "new" || Number(before?.reps ?? 0) === 0) introduced.add(event.cardId);
            else reviewed.add(event.cardId);
          }
          for (const key of introduced) reviewed.delete(key);
        }
        const introducedCount = overviewMatches ? studyOverview!.introducedTodayByDeck[deck.id] ?? 0 : catalogIsComplete ? introduced.size : 0;
        const reviewedCount = overviewMatches ? studyOverview!.reviewedTodayByDeck[deck.id] ?? 0 : catalogIsComplete ? reviewed.size : 0;
        const dueCards = catalogIsComplete ? dueRows[index] ?? 0 : overviewMatches ? studyOverview!.dueByDeck[deck.id] ?? 0 : 0;
        const availableNewCards = catalogIsComplete ? availableNewRows[index] ?? 0 : overviewMatches ? studyOverview!.availableNewByDeck?.[deck.id] ?? 0 : 0;
        const availableLearningCards = catalogIsComplete ? availableLearningRows[index] ?? 0 : overviewMatches ? studyOverview!.availableLearningByDeck?.[deck.id] ?? 0 : 0;
        const buried = buriedByDeck.get(deck.id);
        const studyNewCards = Math.max(0, availableNewCards - (buried?.newCards ?? 0));
        const studyLearningCards = Math.max(0, availableLearningCards - (buried?.learningCards ?? 0));
        const studyDueCards = Math.max(0, dueCards - (buried?.dueCards ?? 0));
        const settings = createDefaultDeckSettings(deck.deckSettings);
        const newLimit = Math.max(0, settings.newCardsTodayOverride?.date === todayKey ? settings.newCardsTodayOverride.limit : settings.newCardsPerDay);
        const remainingNew = Math.max(0, newLimit - introducedCount);
        const remainingReviews = Math.max(0, settings.maximumReviewsPerDay - introducedCount - reviewedCount);
        const selectedNew = Math.min(studyNewCards, remainingNew, remainingReviews);
        const selectedDue = Math.min(studyDueCards + studyLearningCards, Math.max(0, remainingReviews - selectedNew));
        const completedTodayCount = introducedCount + reviewedCount;
        result.set(deck.id, {
          inventory: {
            totalCards: Math.max(0, summary.totalCount - summary.suspendedCount),
            dueCards,
            newCards: summary.newCount,
            inProgressCards: summary.learningCount,
            matureCards: summary.matureCount,
            activeVariants: summary.activeVariantCount,
          },
          dailyProgress: { completedTodayCount, newCount: selectedNew, inProgressCount: studyLearningCards, dueCount: Math.max(0, selectedDue - studyLearningCards), total: completedTodayCount + selectedNew + selectedDue },
          startableCount: selectedNew + selectedDue,
          additionalNewCount: Math.max(0, studyNewCards - selectedNew),
          effectiveNewLimit: newLimit,
          introducedTodayCount: introducedCount,
          dateKey: todayKey,
        });
      }
      const summaryResult = {
        summaries: result,
        studyHeatmap: createStudyHeatmapModelFromCounts({
          todayKey,
          countsByDay: new Map(Object.entries(reviewDayCountsCache?.counts ?? {})),
          forecastCountsByDay: overviewMatches ? new Map(Object.entries(studyOverview!.forecastByDay)) : new Map(),
        }),
      };
      if (measureFirstRun) markStartupPhaseReady("firstDeckSummaries", { deckCount: result.size });
      return summaryResult;
    },
  };
}
