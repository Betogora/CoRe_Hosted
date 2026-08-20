import { stripHtml } from "./htmlSafety.ts";
import { listReviewableCards, summarizeDeckReview } from "./scheduler.ts";
import { createDailyReviewQueue, type DailyReviewProgressSummary } from "./reviewService.ts";
import {
  createStudyHeatmapForecastCounts,
  createStudyHeatmapModelFromCounts,
  getStudyHeatmapDayKey,
} from "./studyHeatmapModel.ts";
import { buildSortedDeckChildren } from "./deckOrdering.ts";
import type { CoreMode, Deck, LearningItem } from "./coreTypes.ts";
import { getLearningDayRange } from "./learningDay.ts";

export { createStudyHeatmapWindow } from "./studyHeatmapModel.ts";

type DateInput = string | number | Date;

interface LibraryOptions {
  query?: unknown;
  coreMode?: CoreMode | "all";
  cardLimit?: number;
  now?: DateInput;
  timeZone?: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  selectedDeckId?: string;
  cardSort?: CardTableSort;
  cardPageByDeckId?: Record<string, number>;
  cardPageSize?: number;
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  studyHeatmap?: ReturnType<typeof createStudyHeatmapModelFromCounts>;
}
export interface DeckLibrarySummary {
  inventory: ReturnType<typeof summarizeDeckReview>;
  dailyProgress: DailyReviewProgressSummary;
  startableCount: number;
  additionalNewCount: number;
  effectiveNewLimit: number;
  introducedTodayCount: number;
  dateKey: string;
}
export interface DeckStatusDistribution {
  newCards: number;
  inProgressCards: number;
  dueCards: number;
  learnedCards: number;
}
export interface DailyLearningSession {
  deckId: string;
  progress: DailyReviewProgressSummary;
  startableCount: number;
  additionalNewCount: number;
  effectiveNewLimit: number;
  introducedTodayCount: number;
}
export interface DailyLearningPlan {
  dateKey: string;
  status: "open" | "waiting" | "achieved";
  progress: DailyReviewProgressSummary;
  sessions: DailyLearningSession[];
  firstStartableDeckId: string | null;
}
export type CardTableSortField = "sortField" | "nextStudyDate" | "variants";
export interface CardTableSort {
  field: CardTableSortField;
  direction: "asc" | "desc";
}
export const DEFAULT_CARD_TABLE_SORT: CardTableSort = { field: "sortField", direction: "asc" };
export const CARD_TABLE_PAGE_SIZE = 50;
const cardSortCollator = new Intl.Collator("de-DE", { sensitivity: "base" });
const cardDueDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const cardSearchTextCache = new WeakMap<LearningItem, { frontPreview: string; backPreview: string; searchText: string }>();

const REVIEW_RATINGS = new Set(["again", "hard", "good", "easy"]);

function normalizeQuery(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function deckPath(deck: Deck): string {
  return (deck.hierarchyPath ?? [deck.name]).join(" / ");
}

function createDeckStatusDistribution(summary: ReturnType<typeof summarizeDeckReview>): DeckStatusDistribution {
  return {
    newCards: summary.newCards,
    inProgressCards: summary.inProgressCards,
    dueCards: summary.dueCards,
    learnedCards: Math.max(0, summary.totalCards - summary.newCards - summary.inProgressCards - summary.dueCards),
  };
}

function previewText(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").trim() || "Leere Karte";
}

function cardSearchProjection(card: LearningItem) {
  const cached = cardSearchTextCache.get(card);
  if (cached) return cached;
  const frontPreview = previewText(card.originalFront);
  const backPreview = previewText(card.originalBack);
  const projection = {
    frontPreview,
    backPreview,
    searchText: normalizeQuery(`${frontPreview} ${backPreview} ${card.tags?.join(" ") ?? ""}`),
  };
  cardSearchTextCache.set(card, projection);
  return projection;
}

function createDeckRow(
  deck: Deck,
  { now, cardLimit, depth = 0, childrenCount = 0, dayStartHour = 0, learnAheadMinutes = 20, timeZone, summary }: {
    now: DateInput;
    cardLimit: number;
    dayStartHour?: number;
    learnAheadMinutes?: number;
    timeZone?: string;
    depth?: number;
    childrenCount?: number;
    summary?: DeckLibrarySummary;
  },
) {
  const activeCards = summary ? [] : listReviewableCards(deck);
  const dayOptions = { dayStartHour, learnAheadMinutes, timeZone };
  const directInventory = summary?.inventory ?? summarizeDeckReview(deck, now, dayOptions);
  const directQueue = summary ? null : createDailyReviewQueue(deck, { deckId: deck.id, now, ...dayOptions });
  const directDaily = summary?.dailyProgress ?? directQueue!.dailyProgress;
  const directSummary = {
    ...directInventory,
    newCards: directDaily.newCount,
    inProgressCards: directDaily.inProgressCount,
    dueCards: directDaily.dueCount,
  };

  return {
    id: deck.id,
    deck,
    name: deck.name,
    path: deckPath(deck),
    parentDeckId: deck.parentDeckId ?? null,
    depth,
    childrenCount,
    hasChildren: childrenCount > 0,
    scopeDeckIds: [deck.id],
    coreMode: deck.deckSettings?.coreMode ?? "auto",
    summary: directSummary,
    directSummary,
    statusDistribution: createDeckStatusDistribution(directInventory),
    directStatusDistribution: createDeckStatusDistribution(directInventory),
    dailyLearningSession: {
      deckId: deck.id,
      progress: directDaily,
      startableCount: summary?.startableCount ?? directQueue!.total,
      additionalNewCount: summary?.additionalNewCount ?? Math.max(0, directQueue!.availableNewCards - directQueue!.newCount),
      effectiveNewLimit: summary?.effectiveNewLimit ?? directQueue!.newCardsPerDay,
      introducedTodayCount: summary?.introducedTodayCount ?? directQueue!.newCardsIntroducedToday,
    } satisfies DailyLearningSession,
    dailyLearningDateKey: summary?.dateKey ?? directQueue!.dateKey,
    activeCards,
    cardRows: activeCards.slice(0, cardLimit).map((card) => ({
      id: card.id,
      card,
      frontPreview: previewText(card.originalFront),
      kind: card.kind,
      maturityBand: card.reviewState?.maturityBand ?? "new",
    })),
  };
}

export type DeckLibraryRow = ReturnType<typeof createDeckRow>;

export function createCardTableRow(card: LearningItem, options: Pick<LibraryOptions, "dayStartHour" | "timeZone"> = {}) {
  const nextStudyTimestamp = cardNextStudyTimestamp(card, options);
  const hasActiveVariants = cardHasActiveVariants(card);

  return {
    id: card.id,
    card,
    ...cardSearchProjection(card),
    nextStudyTimestamp,
    nextStudyLabel: Number.isFinite(nextStudyTimestamp) ? cardDueDateFormatter.format(nextStudyTimestamp) : "Neu",
    hasActiveVariants,
    variantsLabel: hasActiveVariants ? "Ja" : "Nein",
  };
}

function cardNextStudyTimestamp(card: LearningItem, options: Pick<LibraryOptions, "dayStartHour" | "timeZone">): number {
  const isNew = card.reviewState?.state === "new";
  const parsedDue = Date.parse(card.reviewState?.dueAt ?? "");
  const dueDayKey = !isNew && Number.isFinite(parsedDue)
    ? getStudyHeatmapDayKey(parsedDue, options.timeZone, options.dayStartHour)
    : null;
  return dueDayKey ? Date.parse(`${dueDayKey}T12:00:00.000Z`) : Number.POSITIVE_INFINITY;
}

function cardHasActiveVariants(card: LearningItem): boolean {
  if (card.meta?.catalogOnly === true) return card.meta.catalogHasActiveVariants === true;
  return (card.variants ?? []).some((variant) => (
    variant.isActive !== false && variant.qualityStatus === "active"
  ));
}
export type CardTableRow = ReturnType<typeof createCardTableRow>;

export type CardTableGroup = Omit<DeckLibraryRow, "cardRows"> & {
  cardRows: CardTableRow[];
  totalCardCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  deckMatches: boolean;
};

function matchesDeckRow(row: DeckLibraryRow, query: string, coreMode: CoreMode | "all"): boolean {
  const haystack = normalizeQuery(`${row.name} ${row.deck.tags?.join(" ") ?? ""} ${row.path}`);
  const matchesQuery = !query || haystack.includes(query);
  const matchesMode = coreMode === "all" || row.coreMode === coreMode;

  return matchesQuery && matchesMode;
}

type DeckInventorySummary = ReturnType<typeof summarizeDeckReview>;

function combineInventory(summaries: DeckInventorySummary[]): DeckInventorySummary {
  const totalCards = summaries.reduce((total, summary) => total + summary.totalCards, 0);
  const weightedMaturity = summaries.reduce((total, summary) => total + summary.averageMaturityXp * summary.totalCards, 0);
  return {
    totalCards,
    dueCards: summaries.reduce((total, summary) => total + summary.dueCards, 0),
    newCards: summaries.reduce((total, summary) => total + summary.newCards, 0),
    inProgressCards: summaries.reduce((total, summary) => total + summary.inProgressCards, 0),
    matureCards: summaries.reduce((total, summary) => total + summary.matureCards, 0),
    activeVariants: summaries.reduce((total, summary) => total + summary.activeVariants, 0),
    averageMaturityXp: totalCards > 0 ? Math.round(weightedMaturity / totalCards) : 0,
  };
}

function sortCards(cards: LearningItem[], sort: CardTableSort, options: Pick<LibraryOptions, "dayStartHour" | "timeZone">): LearningItem[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...cards].sort((left, right) => {
    if (sort.field === "sortField") {
      return cardSortCollator.compare(cardSearchProjection(left).frontPreview, cardSearchProjection(right).frontPreview) * direction;
    }
    if (sort.field === "nextStudyDate") {
      const leftTimestamp = cardNextStudyTimestamp(left, options);
      const rightTimestamp = cardNextStudyTimestamp(right, options);
      const comparison = leftTimestamp === rightTimestamp ? 0 : leftTimestamp - rightTimestamp;
      return comparison * direction;
    }
    return (Number(cardHasActiveVariants(left)) - Number(cardHasActiveVariants(right))) * direction;
  });
}

function combineDailyProgress(progressValues: DailyReviewProgressSummary[]): DailyReviewProgressSummary {
  return progressValues.reduce<DailyReviewProgressSummary>((summary, progress) => ({
    completedTodayCount: summary.completedTodayCount + progress.completedTodayCount,
    newCount: summary.newCount + progress.newCount,
    inProgressCount: summary.inProgressCount + progress.inProgressCount,
    dueCount: summary.dueCount + progress.dueCount,
    total: summary.total + progress.total,
  }), { completedTodayCount: 0, newCount: 0, inProgressCount: 0, dueCount: 0, total: 0 });
}

function flattenDeckTree(decks: Deck[], options: { now: DateInput; cardLimit: number; dayStartHour?: number; learnAheadMinutes?: number; timeZone?: string; deckSummaries?: ReadonlyMap<string, DeckLibrarySummary> }): DeckLibraryRow[] {
  const childrenByParent = buildSortedDeckChildren(decks);
  const rows: DeckLibraryRow[] = [];

  function visit(deck: Deck, depth: number): {
    row: DeckLibraryRow;
    scopeDecks: Deck[];
    inventory: DeckInventorySummary;
    aggregateDaily: DailyReviewProgressSummary;
    startableCount: number;
  } {
    const children = childrenByParent.get(deck.id) ?? [];
    const row = createDeckRow(deck, {
      ...options,
      depth,
      childrenCount: children.length,
      summary: options.deckSummaries?.get(deck.id),
    });
    rows.push(row);
    const childResults = children.map((child) => visit(child, depth + 1));
    const scopeDecks = [deck, ...childResults.flatMap((result) => result.scopeDecks)];
    const directInventory: DeckInventorySummary = {
      ...row.directSummary,
      newCards: row.directStatusDistribution.newCards,
      inProgressCards: row.directStatusDistribution.inProgressCards,
      dueCards: row.directStatusDistribution.dueCards,
    };
    const inventory = combineInventory([directInventory, ...childResults.map((result) => result.inventory)]);
    const aggregateDaily = combineDailyProgress([
      row.dailyLearningSession.progress,
      ...childResults.map((result) => result.aggregateDaily),
    ]);
    const aggregateStartableCount = row.dailyLearningSession.startableCount
      + childResults.reduce((total, result) => total + result.startableCount, 0);
    const rootQueue = !options.deckSummaries && depth === 0 && scopeDecks.length > 1
      ? createDailyReviewQueue(scopeDecks, { deckId: deck.id, now: options.now, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone })
      : null;
    const daily = rootQueue?.dailyProgress ?? aggregateDaily;
    row.scopeDeckIds = scopeDecks.map((scopeDeck) => scopeDeck.id);
    row.summary = { ...inventory, newCards: daily.newCount, inProgressCards: daily.inProgressCount, dueCards: daily.dueCount };
    row.statusDistribution = createDeckStatusDistribution(inventory);
    if (rootQueue) {
      row.dailyLearningSession = {
        deckId: deck.id,
        progress: daily,
        startableCount: rootQueue.total,
        additionalNewCount: Math.max(0, rootQueue.availableNewCards - rootQueue.newCount),
        effectiveNewLimit: rootQueue.newCardsPerDay,
        introducedTodayCount: rootQueue.newCardsIntroducedToday,
      };
      row.dailyLearningDateKey = rootQueue.dateKey;
    } else if (scopeDecks.length > 1) {
      row.dailyLearningSession = {
        ...row.dailyLearningSession,
        progress: daily,
        startableCount: aggregateStartableCount,
      };
    }
    return {
      row,
      scopeDecks,
      inventory,
      aggregateDaily,
      startableCount: rootQueue?.total ?? aggregateStartableCount,
    };
  }

  (childrenByParent.get(null) ?? []).forEach((deck) => visit(deck, 0));
  return rows;
}

export function createStudyHeatmapModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const todayKey = getStudyHeatmapDayKey(options.now ?? new Date(), options.timeZone, options.dayStartHour)
    ?? getStudyHeatmapDayKey(new Date(), options.timeZone, options.dayStartHour) as string;
  const countsByDate = new Map<string, number>();
  const eventTimes: number[] = [];
  for (const deck of decks) {
    for (const event of deck.reviewEvents ?? []) {
      if (!REVIEW_RATINGS.has(event.rating)) continue;
      const timestamp = new Date(event.answeredAt || event.createdAt).getTime();
      if (Number.isFinite(timestamp)) eventTimes.push(timestamp);
    }
  }
  if (eventTimes.length > 0) {
    let minimum = eventTimes[0];
    let maximum = eventTimes[0];
    for (const timestamp of eventTimes) {
      if (timestamp < minimum) minimum = timestamp;
      if (timestamp > maximum) maximum = timestamp;
    }
    const spannedDays = Math.ceil((maximum - minimum) / 86_400_000) + 1;
    if (spannedDays > eventTimes.length * 4) {
      for (const timestamp of eventTimes) {
        const key = getStudyHeatmapDayKey(timestamp, options.timeZone, options.dayStartHour);
        if (key) countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
      }
    } else {
      const ranges: Array<{ start: number; end: number; key: string }> = [];
      let range = getLearningDayRange(minimum, { timeZone: options.timeZone, dayStartHour: options.dayStartHour });
      while (range && range.start <= maximum) {
        const key = getStudyHeatmapDayKey(range.start, options.timeZone, options.dayStartHour);
        if (!key || range.end <= range.start) break;
        ranges.push({ ...range, key });
        range = getLearningDayRange(range.end, { timeZone: options.timeZone, dayStartHour: options.dayStartHour });
      }
      for (const timestamp of eventTimes) {
        let lower = 0;
        let upper = ranges.length - 1;
        while (lower <= upper) {
          const middle = (lower + upper) >>> 1;
          const candidate = ranges[middle];
          if (timestamp < candidate.start) upper = middle - 1;
          else if (timestamp >= candidate.end) lower = middle + 1;
          else {
            countsByDate.set(candidate.key, (countsByDate.get(candidate.key) ?? 0) + 1);
            break;
          }
        }
      }
    }
  }

  const forecastCountsByDay = createStudyHeatmapForecastCounts(
    decks.flatMap((deck) => deck.cards ?? []),
    { todayKey, timeZone: options.timeZone, dayStartHour: options.dayStartHour },
  );
  return createStudyHeatmapModelFromCounts({ todayKey, countsByDay: countsByDate, forecastCountsByDay });
}

export function createDeckLibraryModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardLimit = options.cardLimit ?? 80;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone, deckSummaries: options.deckSummaries });
  const filteredRows = rows.filter((row) => matchesDeckRow(row, query, coreMode));
  const selectedRow = rows.find((row) => row.id === options.selectedDeckId) ?? filteredRows[0] ?? null;
  const sessions = rows
    .filter((row) => row.depth === 0)
    .map((row) => row.dailyLearningSession);
  const progress = combineDailyProgress(sessions.map((session) => session.progress));
  const firstStartableDeckId = sessions.find((session) => session.startableCount > 0)?.deckId ?? null;
  const remainingCount = progress.newCount + progress.inProgressCount + progress.dueCount;
  const dailyLearningPlan: DailyLearningPlan = {
    dateKey: rows.find((row) => row.depth === 0)?.dailyLearningDateKey
      ?? getStudyHeatmapDayKey(now, options.timeZone, options.dayStartHour)
      ?? new Date(now).toISOString().slice(0, 10),
    status: remainingCount === 0 ? "achieved" : firstStartableDeckId ? "open" : "waiting",
    progress,
    sessions,
    firstStartableDeckId,
  };

  return {
    rows,
    filteredRows,
    selectedRow,
    dueCards: rows.reduce((total, row) => total + row.directSummary.dueCards, 0),
    dailyLearningPlan,
    studyHeatmap: options.studyHeatmap ?? createStudyHeatmapModel(decks, { now, timeZone: options.timeZone, dayStartHour: options.dayStartHour }),
  };
}

export function createCardTableModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardSort = options.cardSort ?? DEFAULT_CARD_TABLE_SORT;
  const pageSize = Math.max(1, Math.min(CARD_TABLE_PAGE_SIZE, Math.floor(options.cardPageSize ?? CARD_TABLE_PAGE_SIZE)));
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit: 0, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone, deckSummaries: options.deckSummaries });
  const allGroups: CardTableGroup[] = rows.map((row) => {
    const deckMatches = Boolean(query) && normalizeQuery(row.path).includes(query);
    const matchingCards = !query || deckMatches
      ? row.activeCards
      : row.activeCards.filter((card) => cardSearchProjection(card).searchText.includes(query));
    const pageCount = Math.max(1, Math.ceil(matchingCards.length / pageSize));
    const requestedPage = Math.max(0, Math.floor(options.cardPageByDeckId?.[row.id] ?? 0));
    const page = Math.min(requestedPage, pageCount - 1);
    const cardRows = sortCards(matchingCards, cardSort, options)
      .slice(page * pageSize, (page + 1) * pageSize)
      .map((card) => createCardTableRow(card, options));
    return { ...row, cardRows, totalCardCount: matchingCards.length, page, pageCount, pageSize, deckMatches };
  });
  const groups = allGroups.filter((group) => (
    (coreMode === "all" || group.coreMode === coreMode)
    && (!query || group.deckMatches || group.totalCardCount > 0)
  ));

  return {
    allGroups,
    groups,
    cardCount: groups.reduce((total, group) => total + group.totalCardCount, 0),
    cardSort,
  };
}
