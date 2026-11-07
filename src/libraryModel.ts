import { listReviewableCards, summarizeDeckReview } from "./scheduler.ts";
import { createDailyReviewQueue, type DailyReviewProgressSummary } from "./reviewService.ts";
import {
  createStudyHeatmapForecastCounts,
  createStudyHeatmapModelFromCounts,
  getStudyHeatmapDayKey,
} from "./studyHeatmapModel.ts";
import { buildSortedDeckChildren } from "./deckOrdering.ts";
import type { Deck, Note } from "./coreTypes.ts";
import { catalogEntryFromCard, type CardCatalogEntry } from "./workspaceReplica.ts";
import { getLearningDayRange } from "./learningDay.ts";
import { cardSearchContextTerms, deckPatternMatches, isEmptyCardSearch, namePatternMatches, matchesCardSearch, parseCardSearchQuery, type CardSearchContext } from "./cardSearchQuery.ts";
import { collectDeckTreeIds } from "./coreWorkspace.ts";

type DateInput = string | number | Date;

export interface LibraryOptions {
  query?: unknown;
  cardLimit?: number;
  now?: DateInput;
  timeZone?: string;
  dayStartHour?: number;
  learnAheadMinutes?: number;
  cardSort?: CardTableSort;
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
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
    coreMode: deck.deckSettings?.coreMode ?? "on",
    summary: directSummary,
    directSummary,
    directInventory,
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

/**
 * Resolves the query's terms relative to today's learning day, its `did:` and `deck:` terms to decks with subdecks
 * and its `note:` terms to the matching note types.
 */
export function createCardSearchContext(
  query: string,
  decks: Deck[],
  options: Pick<LibraryOptions, "now" | "dayStartHour" | "timeZone"> & { noteTypes?: readonly { id: string; name: string }[] } = {},
): CardSearchContext {
  const now = options.now ?? new Date();
  const todayStart = getLearningDayRange(now, { dayStartHour: options.dayStartHour, timeZone: options.timeZone })?.start ?? new Date(now).getTime();
  const { deckIds: ids, deckNames: names, noteTypeNames } = cardSearchContextTerms(query);
  const subtree = (deckId: string) => [...collectDeckTreeIds(decks, deckId)];
  return {
    todayStart,
    ...(ids.length ? { deckSubtrees: Object.fromEntries(ids.map((deckId) => [deckId, subtree(deckId)])) } : {}),
    ...(names.length ? {
      deckMatches: Object.fromEntries(names.map((pattern) => [pattern, [...new Set(decks
        .filter((deck) => deckPatternMatches(pattern, (deck.hierarchyPath?.length ? deck.hierarchyPath : [deck.name]).join("::")))
        .flatMap((deck) => subtree(deck.id)))]])),
    } : {}),
    ...(noteTypeNames.length ? {
      noteTypeMatches: Object.fromEntries(noteTypeNames.map((pattern) => [pattern, (options.noteTypes ?? [])
        .filter((noteType) => namePatternMatches(pattern, noteType.name)).map((noteType) => noteType.id)])),
    } : {}),
  };
}

export function createCardTableRow(entry: CardCatalogEntry, options: Pick<LibraryOptions, "dayStartHour" | "timeZone"> = {}) {
  const nextStudyTimestamp = cardNextStudyTimestamp(entry, options);
  return {
    id: entry.id,
    entry,
    frontPreview: entry.frontPreview.replace(/\s+/g, " ").trim() || "Leere Karte",
    nextStudyTimestamp,
    nextStudyLabel: Number.isFinite(nextStudyTimestamp) ? cardDueDateFormatter.format(nextStudyTimestamp) : "Neu",
  };
}

function cardNextStudyTimestamp(entry: Pick<CardCatalogEntry, "scheduleState" | "dueAt">, options: Pick<LibraryOptions, "dayStartHour" | "timeZone">): number {
  const parsedDue = Date.parse(entry.dueAt ?? "");
  const dueDayKey = entry.scheduleState !== "new" && Number.isFinite(parsedDue)
    ? getStudyHeatmapDayKey(parsedDue, options.timeZone, options.dayStartHour)
    : null;
  return dueDayKey ? Date.parse(`${dueDayKey}T12:00:00.000Z`) : Number.POSITIVE_INFINITY;
}
type CardTableRow = ReturnType<typeof createCardTableRow>;

type CardTableGroup = DeckLibraryRow & {
  /** Loaded rows in list order; `rowsByIndex` places them at their position among `totalCardCount` rows. */
  cardRows: CardTableRow[];
  rowsByIndex: ReadonlyMap<number, CardTableRow>;
  totalCardCount: number;
  deckMatches: boolean;
  /** The list for the current query and sort is still requested. */
  loading: boolean;
};

type DeckInventorySummary = ReturnType<typeof summarizeDeckReview>;

function combineInventory(summaries: DeckInventorySummary[]): DeckInventorySummary {
  const totalCards = summaries.reduce((total, summary) => total + summary.totalCards, 0);
  return {
    totalCards,
    dueCards: summaries.reduce((total, summary) => total + summary.dueCards, 0),
    newCards: summaries.reduce((total, summary) => total + summary.newCards, 0),
    inProgressCards: summaries.reduce((total, summary) => total + summary.inProgressCards, 0),
    matureCards: summaries.reduce((total, summary) => total + summary.matureCards, 0),
    activeVariants: summaries.reduce((total, summary) => total + summary.activeVariants, 0),
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
    aggregates.set(entry.deck.id, {
      row,
      inventory: combineInventory([row.directInventory, ...childAggregates.map((child) => child.inventory)]),
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
  const cardLimit = options.cardLimit ?? 80;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone, deckSummaries: options.deckSummaries });
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

  return { rows, dailyLearningPlan };
}

export function sameCardTableSort(left: CardTableSort, right: CardTableSort) {
  return left.field === right.field && left.direction === right.direction;
}

export function createCardTableModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const search = parseCardSearchQuery(options.query, createCardSearchContext(String(options.query ?? ""), decks, options));
  const searching = !isEmptyCardSearch(search);
  const cardSort = options.cardSort ?? DEFAULT_CARD_TABLE_SORT;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit: 0, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone, deckSummaries: options.deckSummaries });
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const hitEntries: CardCatalogEntry[] = [];
  const allGroups: CardTableGroup[] = rows.map((row) => {
    // A deck whose path contains the search text lists all its cards that match the remaining terms.
    const deckMatches = Boolean(search.text) && normalizeQuery(row.path).includes(search.text);
    const entries = listReviewableCards(deckById.get(row.id) ?? row.deck)
      .map((card) => catalogEntryFromCard(card, options.notesById?.get(card.noteId) ?? null));
    const matchingEntries = searching
      ? entries.filter((entry) => matchesCardSearch(entry, deckMatches ? { ...search, text: "" } : search))
      : entries;
    hitEntries.push(...matchingEntries);
    const cardRows = sortEntries(matchingEntries, cardSort, options).map((entry) => createCardTableRow(entry, options));
    return {
      ...row,
      cardRows,
      rowsByIndex: new Map(cardRows.map((cardRow, index) => [index, cardRow])),
      totalCardCount: matchingEntries.length,
      deckMatches,
      loading: false,
    };
  });
  const groups = allGroups.filter((group) => !searching || group.deckMatches || group.totalCardCount > 0);
  // The flat hit list of a search (KV3): all matching cards in one order.
  const hitRows = sortEntries(hitEntries, cardSort, options).map((entry) => createCardTableRow(entry, options));

  return {
    allGroups,
    groups,
    hits: { cardRows: hitRows, rowsByIndex: new Map(hitRows.map((row, index) => [index, row])), totalCardCount: hitRows.length, loading: false },
    cardCount: groups.reduce((total, group) => total + group.totalCardCount, 0),
    cardSort,
  };
}
