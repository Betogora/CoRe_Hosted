import { listReviewableCards, summarizeDeckReview } from "./scheduler.ts";
import { createDailyReviewQueue, type DailyReviewProgressSummary } from "./reviewService.ts";
import {
  createStudyHeatmapForecastCounts,
  createStudyHeatmapModelFromCounts,
  getStudyHeatmapDayKey,
} from "./studyHeatmapModel.ts";
import { buildSortedDeckChildren } from "./deckOrdering.ts";
import type { CoreMode, Deck, Note } from "./coreTypes.ts";
import { catalogEntryFromCard, type CardCatalogEntry } from "./workspaceReplica.ts";
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
  /** Contents of locally loaded cards; without one, a card row shows its catalog preview. */
  notesById?: ReadonlyMap<string, Note>;
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
    descendantCount: 0,
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
  };
}

export type DeckLibraryRow = ReturnType<typeof createDeckRow>;

export function createCardTableRow(entry: CardCatalogEntry, options: Pick<LibraryOptions, "dayStartHour" | "timeZone"> = {}) {
  const nextStudyTimestamp = cardNextStudyTimestamp(entry, options);
  return {
    id: entry.id,
    entry,
    frontPreview: entry.frontPreview.replace(/\s+/g, " ").trim() || "Leere Karte",
    nextStudyTimestamp,
    nextStudyLabel: Number.isFinite(nextStudyTimestamp) ? cardDueDateFormatter.format(nextStudyTimestamp) : "Neu",
    hasActiveVariants: entry.hasActiveVariants,
  };
}

function cardNextStudyTimestamp(entry: Pick<CardCatalogEntry, "scheduleState" | "dueAt">, options: Pick<LibraryOptions, "dayStartHour" | "timeZone">): number {
  const parsedDue = Date.parse(entry.dueAt ?? "");
  const dueDayKey = entry.scheduleState !== "new" && Number.isFinite(parsedDue)
    ? getStudyHeatmapDayKey(parsedDue, options.timeZone, options.dayStartHour)
    : null;
  return dueDayKey ? Date.parse(`${dueDayKey}T12:00:00.000Z`) : Number.POSITIVE_INFINITY;
}
export type CardTableRow = ReturnType<typeof createCardTableRow>;

export type CardTableGroup = DeckLibraryRow & {
  cardRows: CardTableRow[];
  totalCardCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  deckMatches: boolean;
};

function matchesDeckRow(row: DeckLibraryRow, query: string, coreMode: CoreMode | "all"): boolean {
  const haystack = normalizeQuery(`${row.name} ${row.path}`);
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

function sortEntries(entries: CardCatalogEntry[], sort: CardTableSort, options: Pick<LibraryOptions, "dayStartHour" | "timeZone">): CardCatalogEntry[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...entries].sort((left, right) => {
    if (sort.field === "sortField") return cardSortCollator.compare(left.frontPreview, right.frontPreview) * direction;
    if (sort.field === "nextStudyDate") {
      const leftTimestamp = cardNextStudyTimestamp(left, options);
      const rightTimestamp = cardNextStudyTimestamp(right, options);
      const comparison = leftTimestamp === rightTimestamp ? 0 : leftTimestamp - rightTimestamp;
      return comparison * direction;
    }
    return (Number(left.hasActiveVariants) - Number(right.hasActiveVariants)) * direction;
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
  type FlatEntry = { deck: Deck; depth: number; projectedParentId: string | null; rootDeckId: string };
  const entries: FlatEntry[] = [];
  const visited = new Set<string>();

  function appendBranch(root: Deck, depth: number, projectedParentId: string | null, rootDeckId: string) {
    const stack: FlatEntry[] = [{ deck: root, depth, projectedParentId, rootDeckId }];
    while (stack.length > 0) {
      const entry = stack.pop()!;
      if (visited.has(entry.deck.id)) continue;
      visited.add(entry.deck.id);
      entries.push(entry);
      const children = childrenByParent.get(entry.deck.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({
          deck: children[index],
          depth: entry.depth + 1,
          projectedParentId: entry.deck.id,
          rootDeckId: entry.rootDeckId,
        });
      }
    }
  }

  for (const root of childrenByParent.get(null) ?? []) appendBranch(root, 0, null, root.id);
  for (const deck of decks) {
    if (!visited.has(deck.id)) appendBranch(deck, 0, null, deck.id);
  }

  const projectedChildrenByParentId = new Map<string, string[]>();
  const rootDecksById = new Map<string, Deck[]>();
  for (const entry of entries) {
    if (entry.projectedParentId) {
      const childIds = projectedChildrenByParentId.get(entry.projectedParentId) ?? [];
      childIds.push(entry.deck.id);
      projectedChildrenByParentId.set(entry.projectedParentId, childIds);
    }
    const rootDecks = rootDecksById.get(entry.rootDeckId) ?? [];
    rootDecks.push(entry.deck);
    rootDecksById.set(entry.rootDeckId, rootDecks);
  }

  type DeckAggregate = {
    row: DeckLibraryRow;
    inventory: DeckInventorySummary;
    aggregateDaily: DailyReviewProgressSummary;
    startableCount: number;
    descendantCount: number;
  };
  const aggregates = new Map<string, DeckAggregate>();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const childAggregates = (projectedChildrenByParentId.get(entry.deck.id) ?? []).flatMap((childId) => {
      const child = aggregates.get(childId);
      return child ? [child] : [];
    });
    const row = createDeckRow(entry.deck, {
      ...options,
      depth: entry.depth,
      childrenCount: childAggregates.length,
      summary: options.deckSummaries?.get(entry.deck.id),
    });
    const directInventory: DeckInventorySummary = {
      ...row.directSummary,
      newCards: row.directStatusDistribution.newCards,
      inProgressCards: row.directStatusDistribution.inProgressCards,
      dueCards: row.directStatusDistribution.dueCards,
    };
    aggregates.set(entry.deck.id, {
      row,
      inventory: combineInventory([directInventory, ...childAggregates.map((child) => child.inventory)]),
      aggregateDaily: combineDailyProgress([
        row.dailyLearningSession.progress,
        ...childAggregates.map((child) => child.aggregateDaily),
      ]),
      startableCount: row.dailyLearningSession.startableCount
        + childAggregates.reduce((total, child) => total + child.startableCount, 0),
      descendantCount: childAggregates.reduce((total, child) => total + child.descendantCount + 1, 0),
    });
  }

  return entries.map((entry) => {
    const aggregate = aggregates.get(entry.deck.id)!;
    const rootDecks = rootDecksById.get(entry.rootDeckId) ?? [entry.deck];
    const rootQueue = !options.deckSummaries && entry.depth === 0 && rootDecks.length > 1
      ? createDailyReviewQueue(rootDecks, { deckId: entry.deck.id, now: options.now, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone })
      : null;
    const daily = rootQueue?.dailyProgress ?? aggregate.aggregateDaily;
    aggregate.row.descendantCount = aggregate.descendantCount;
    aggregate.row.summary = {
      ...aggregate.inventory,
      newCards: daily.newCount,
      inProgressCards: daily.inProgressCount,
      dueCards: daily.dueCount,
    };
    aggregate.row.statusDistribution = createDeckStatusDistribution(aggregate.inventory);
    if (rootQueue) {
      aggregate.row.dailyLearningSession = {
        deckId: entry.deck.id,
        progress: daily,
        startableCount: rootQueue.total,
        additionalNewCount: Math.max(0, rootQueue.availableNewCards - rootQueue.newCount),
        effectiveNewLimit: rootQueue.newCardsPerDay,
        introducedTodayCount: rootQueue.newCardsIntroducedToday,
      };
      aggregate.row.dailyLearningDateKey = rootQueue.dateKey;
    } else if (aggregate.descendantCount > 0) {
      aggregate.row.dailyLearningSession = {
        ...aggregate.row.dailyLearningSession,
        progress: daily,
        startableCount: aggregate.startableCount,
      };
    }
    return aggregate.row;
  });
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
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const allGroups: CardTableGroup[] = rows.map((row) => {
    const deckMatches = Boolean(query) && normalizeQuery(row.path).includes(query);
    const entries = listReviewableCards(deckById.get(row.id) ?? row.deck)
      .map((card) => catalogEntryFromCard(card, options.notesById?.get(card.noteId) ?? null));
    const matchingEntries = !query || deckMatches
      ? entries
      : entries.filter((entry) => entry.normalizedSearchText.includes(query));
    const pageCount = Math.max(1, Math.ceil(matchingEntries.length / pageSize));
    const requestedPage = Math.max(0, Math.floor(options.cardPageByDeckId?.[row.id] ?? 0));
    const page = Math.min(requestedPage, pageCount - 1);
    const pageEntries = sortEntries(matchingEntries, cardSort, options).slice(page * pageSize, (page + 1) * pageSize);
    return {
      ...row,
      cardRows: pageEntries.map((entry) => createCardTableRow(entry, options)),
      totalCardCount: matchingEntries.length,
      page,
      pageCount,
      pageSize,
      deckMatches,
    };
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
