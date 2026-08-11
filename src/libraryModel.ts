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

function previewText(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").trim() || "Leere Karte";
}

function createDeckRow(
  deck: Deck,
  { now, cardLimit, scopeDecks = [deck], depth = 0, childrenCount = 0, dayStartHour = 0, learnAheadMinutes = 20, timeZone }: {
    now: DateInput;
    cardLimit: number;
    dayStartHour?: number;
    learnAheadMinutes?: number;
    timeZone?: string;
    scopeDecks?: Deck[];
    depth?: number;
    childrenCount?: number;
  },
) {
  const activeCards = listReviewableCards(deck);
  const dayOptions = { dayStartHour, learnAheadMinutes, timeZone };
  const directInventory = summarizeDeckReview(deck, now, dayOptions);
  const directQueue = createDailyReviewQueue(deck, { deckId: deck.id, now, ...dayOptions });
  const directDaily = directQueue.dailyProgress;
  const isLeafScope = scopeDecks.length === 1 && scopeDecks[0]?.id === deck.id;
  const inventory = isLeafScope
    ? directInventory
    : summarizeDeckReview({ ...deck, cards: scopeDecks.flatMap((scopeDeck) => scopeDeck.cards ?? []) }, now, dayOptions);
  const scopeQueue = isLeafScope
    ? directQueue
    : createDailyReviewQueue(scopeDecks, { deckId: deck.id, now, ...dayOptions });
  const daily = scopeQueue.dailyProgress;
  const directSummary = {
    ...directInventory,
    newCards: directDaily.newCount,
    inProgressCards: directDaily.inProgressCount,
    dueCards: directDaily.dueCount,
  };
  const summary = {
    ...inventory,
    newCards: daily.newCount,
    inProgressCards: daily.inProgressCount,
    dueCards: daily.dueCount,
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
    scopeDeckIds: scopeDecks.map((scopeDeck) => scopeDeck.id),
    coreMode: deck.deckSettings?.coreMode ?? "auto",
    summary,
    directSummary,
    statusDistribution: createDeckStatusDistribution(inventory),
    directStatusDistribution: createDeckStatusDistribution(directInventory),
    dailyLearningSession: {
      deckId: deck.id,
      progress: daily,
      startableCount: scopeQueue.total,
      additionalNewCount: Math.max(0, scopeQueue.availableNewCards - scopeQueue.newCount),
      effectiveNewLimit: scopeQueue.newCardsPerDay,
      introducedTodayCount: scopeQueue.newCardsIntroducedToday,
    } satisfies DailyLearningSession,
    dailyLearningDateKey: scopeQueue.dateKey,
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

function createCardTableRow(card: LearningItem, options: Pick<LibraryOptions, "dayStartHour" | "timeZone"> = {}) {
  const isNew = card.reviewState?.state === "new";
  const parsedDue = Date.parse(card.reviewState?.dueAt ?? "");
  const dueDayKey = !isNew && Number.isFinite(parsedDue)
    ? getStudyHeatmapDayKey(parsedDue, options.timeZone, options.dayStartHour)
    : null;
  const nextStudyTimestamp = dueDayKey ? Date.parse(`${dueDayKey}T12:00:00.000Z`) : Number.POSITIVE_INFINITY;
  const hasActiveVariants = (card.variants ?? []).some((variant) => (
    !variant.isOriginal && variant.isActive !== false && variant.qualityStatus === "active"
  ));

  return {
    id: card.id,
    card,
    frontPreview: previewText(card.originalFront),
    backPreview: previewText(card.originalBack),
    nextStudyTimestamp,
    nextStudyLabel: Number.isFinite(nextStudyTimestamp) ? cardDueDateFormatter.format(nextStudyTimestamp) : "Neu",
    hasActiveVariants,
    variantsLabel: hasActiveVariants ? "Ja" : "Nein",
  };
}
export type CardTableRow = ReturnType<typeof createCardTableRow>;

export type CardTableGroup = Omit<DeckLibraryRow, "cardRows"> & { cardRows: CardTableRow[] };

function combineDailyProgress(progressValues: DailyReviewProgressSummary[]): DailyReviewProgressSummary {
  return progressValues.reduce<DailyReviewProgressSummary>((summary, progress) => ({
    completedTodayCount: summary.completedTodayCount + progress.completedTodayCount,
    newCount: summary.newCount + progress.newCount,
    inProgressCount: summary.inProgressCount + progress.inProgressCount,
    dueCount: summary.dueCount + progress.dueCount,
    total: summary.total + progress.total,
  }), { completedTodayCount: 0, newCount: 0, inProgressCount: 0, dueCount: 0, total: 0 });
}

function sortCardRows(rows: CardTableRow[], sort: CardTableSort): CardTableRow[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    let comparison = 0;
    if (sort.field === "sortField") {
      comparison = cardSortCollator.compare(left.frontPreview, right.frontPreview);
    } else if (sort.field === "nextStudyDate") {
      comparison = left.nextStudyTimestamp === right.nextStudyTimestamp ? 0 : left.nextStudyTimestamp - right.nextStudyTimestamp;
    } else {
      comparison = Number(left.hasActiveVariants) - Number(right.hasActiveVariants);
    }
    return comparison * direction;
  });
}

function matchesDeckRow(row: DeckLibraryRow, query: string, coreMode: CoreMode | "all"): boolean {
  const haystack = normalizeQuery(`${row.name} ${row.deck.tags?.join(" ") ?? ""} ${row.path}`);
  const matchesQuery = !query || haystack.includes(query);
  const matchesMode = coreMode === "all" || row.coreMode === coreMode;

  return matchesQuery && matchesMode;
}

function collectScopeDecks(deck: Deck, childrenByParent: Map<string | null, Deck[]>): Deck[] {
  const children = childrenByParent.get(deck.id) ?? [];
  return [deck, ...children.flatMap((child) => collectScopeDecks(child, childrenByParent))];
}

function flattenDeckTree(decks: Deck[], options: { now: DateInput; cardLimit: number; dayStartHour?: number; learnAheadMinutes?: number; timeZone?: string }): DeckLibraryRow[] {
  const childrenByParent = buildSortedDeckChildren(decks);
  const rows: DeckLibraryRow[] = [];

  function visit(deck: Deck, depth: number): void {
    const children = childrenByParent.get(deck.id) ?? [];
    rows.push(createDeckRow(deck, {
      ...options,
      depth,
      childrenCount: children.length,
      scopeDecks: collectScopeDecks(deck, childrenByParent),
    }));
    children.forEach((child) => visit(child, depth + 1));
  }

  (childrenByParent.get(null) ?? []).forEach((deck) => visit(deck, 0));
  return rows;
}

export function createStudyHeatmapModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const todayKey = getStudyHeatmapDayKey(options.now ?? new Date(), options.timeZone, options.dayStartHour)
    ?? getStudyHeatmapDayKey(new Date(), options.timeZone, options.dayStartHour) as string;
  const countsByDate = new Map<string, number>();

  for (const deck of decks) {
    for (const event of deck.reviewEvents ?? []) {
      if (!REVIEW_RATINGS.has(event.rating)) continue;
      const reviewedAt = (event as typeof event & { reviewedAt?: string }).reviewedAt;
      const key = getStudyHeatmapDayKey(event.answeredAt || reviewedAt || event.createdAt, options.timeZone, options.dayStartHour);
      if (!key) continue;
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
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
  const rows = flattenDeckTree(decks, { now, cardLimit, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone });
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
    studyHeatmap: createStudyHeatmapModel(decks, { now, timeZone: options.timeZone, dayStartHour: options.dayStartHour }),
  };
}

export function createCardTableModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardSort = options.cardSort ?? DEFAULT_CARD_TABLE_SORT;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit: 0, dayStartHour: options.dayStartHour, learnAheadMinutes: options.learnAheadMinutes, timeZone: options.timeZone });
  const allGroups: CardTableGroup[] = rows.map((row) => ({
    ...row,
    cardRows: sortCardRows(row.activeCards.map((card) => createCardTableRow(card, options)), cardSort),
  }));
  const groups = allGroups.flatMap((group) => {
    if (coreMode !== "all" && group.coreMode !== coreMode) return [];
    if (!query) return [group];

    const deckMatches = normalizeQuery(group.path).includes(query);
    const cardRows = deckMatches
      ? group.cardRows
      : group.cardRows.filter(({ card, frontPreview, backPreview }) => normalizeQuery(
        `${frontPreview} ${backPreview} ${card.tags?.join(" ") ?? ""}`,
      ).includes(query));

    return deckMatches || cardRows.length ? [{ ...group, cardRows }] : [];
  });

  return {
    allGroups,
    groups,
    cardCount: groups.reduce((total, group) => total + group.cardRows.length, 0),
    cardSort,
  };
}
