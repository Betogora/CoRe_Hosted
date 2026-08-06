import { stripHtml } from "./htmlSafety.ts";
import { listReviewableCards, summarizeDeckReview } from "./scheduler.ts";
import type { CoreMode, Deck, LearningItem, ReviewRating } from "./coreTypes.ts";

type DateInput = string | number | Date;

interface ReviewEventInput {
  id?: string;
  deckId?: string;
  learningItemId?: string;
  cardId?: string;
  variantId?: string;
  cardVariantId?: string;
  rating?: ReviewRating;
  reviewedAt?: string;
  answeredAt?: string;
  createdAt?: string;
  responseTimeMs?: number;
  reviewableType?: string;
  variantLevel?: number;
  variantType?: string;
}
interface HeatmapDay {
  key: string | null;
  date: string;
  dayOfMonth: number;
  count: number;
  isToday: boolean;
  isFuture: boolean;
  isOutsideDisplayYear: boolean;
  level?: number;
}

interface LibraryOptions {
  query?: unknown;
  coreMode?: CoreMode | "all";
  cardLimit?: number;
  now?: DateInput;
  selectedDeckId?: string;
  heatmapWeeks?: number;
  recentDayCount?: number;
  weeks?: number | null;
  year?: number;
  viewportWidth?: number;
  endWeekIndex?: number | null;
  dayCount?: number;
  cardSort?: CardTableSort;
}
export type CardTableSortField = "sortField" | "due" | "variants";
export interface CardTableSort {
  field: CardTableSortField;
  direction: "asc" | "desc";
}
export const DEFAULT_CARD_TABLE_SORT: CardTableSort = { field: "sortField", direction: "asc" };
const cardSortCollator = new Intl.Collator("de-DE", { sensitivity: "base" });
const cardDueDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

interface HeatmapInput {
  weeks?: HeatmapDay[][];
  defaultEndWeekIndex?: number;
  [key: string]: unknown;
}

const DEFAULT_HEATMAP_WEEK_COUNT = 53;
const MIN_HEATMAP_WINDOW_WEEKS = 4;
const HEATMAP_WEEKDAY_LABEL_WIDTH = 36;
const HEATMAP_CELL_SIZE = 19;
const HEATMAP_COLUMN_GAP = 4;
const HEATMAP_NAVIGATION_STEP_WEEKS = 4;
const HEATMAP_MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function normalizeQuery(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deckPath(deck: Deck): string {
  return (deck.hierarchyPath ?? [deck.name]).join(" / ");
}

function progressPercent(summary: ReturnType<typeof summarizeDeckReview>): number {
  return summary.totalCards ? Math.round((summary.matureCards / summary.totalCards) * 100) : 0;
}

function previewText(value: unknown): string {
  return stripHtml(value).replace(/\s+/g, " ").trim() || "Leere Karte";
}

function startOfLocalDay(value: DateInput): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addLocalDays(value: DateInput, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function localDateKey(value: DateInput | null | undefined): string | null {
  const date = new Date(value ?? 0);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value: DateInput): Date {
  const date = startOfLocalDay(value);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addLocalDays(date, -daysSinceMonday);
}

function startOfYear(year: number): Date {
  return startOfLocalDay(new Date(year, 0, 1));
}

function endOfYear(year: number): Date {
  return startOfLocalDay(new Date(year, 11, 31));
}

function normalizeCalendarYear(value: unknown, fallbackYear: number): number {
  const year = Math.round(Number(value));
  return Number.isFinite(year) && year >= 1900 && year <= 9999 ? year : fallbackYear;
}

function reviewEventDate(event: ReviewEventInput): string | null {
  return event?.reviewedAt ?? event?.answeredAt ?? event?.createdAt ?? null;
}

function heatmapLevel(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function formatShortDate(value: DateInput): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatShortDayMonth(value: DateInput): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.`;
}

function heatmapMonthLabel(day: HeatmapDay, includeYear = false): string {
  const key = day.key ?? "";
  const monthLabel = HEATMAP_MONTH_LABELS[Number(key.slice(5, 7)) - 1];
  return includeYear ? `${monthLabel} ${key.slice(0, 4)}` : monthLabel;
}

function hasVisiblePreviousYearDay(day: HeatmapDay, weeks: HeatmapDay[][]): boolean {
  const previousDayKey = localDateKey(addLocalDays(day.date, -1));
  return weeks.some((week) => week.some((candidate) => candidate.key === previousDayKey));
}

function createHeatmapMonthLabels(weeks: HeatmapDay[][]): string[] {
  const labels = weeks.map((week, weekIndex) => {
    const monthStart = week.find((day) => !day.isOutsideDisplayYear && day.dayOfMonth === 1);
    if (monthStart) {
      const isJanuary = monthStart.key?.slice(5, 7) === "01";
      const isVisibleYearChange = isJanuary && (weekIndex === 0 || hasVisiblePreviousYearDay(monthStart, weeks));
      return heatmapMonthLabel(monthStart, isVisibleYearChange);
    }
    if (weekIndex === 0) {
      const firstDisplayDay = week.find((day) => !day.isOutsideDisplayYear) ?? week[0];
      return heatmapMonthLabel(firstDisplayDay);
    }
    return "";
  });

  for (let weekIndex = labels.length - 1, nextLabelWeekIndex = labels.length; weekIndex >= 0; weekIndex -= 1) {
    const label = labels[weekIndex];
    if (!label) continue;
    if (nextLabelWeekIndex - weekIndex < (label.includes(" ") ? 3 : 2)) labels[weekIndex] = "";
    nextLabelWeekIndex = weekIndex;
  }
  return labels;
}

function isHeatmapCountableDay(day: HeatmapDay): boolean {
  return !day.isFuture && !day.isOutsideDisplayYear;
}

function summarizeHeatmapDays(days: HeatmapDay[]) {
  let totalCount = 0;
  let bestDay: HeatmapDay | null = null;
  let rangeStartDay: HeatmapDay | null = null;
  let rangeEndDay: HeatmapDay | null = null;
  let lastDisplayYearDay: HeatmapDay | null = null;
  let currentStreak = 0;
  let longestStreak = 0;

  for (const day of days) {
    if (!day.isOutsideDisplayYear) {
      rangeStartDay ??= day;
      lastDisplayYearDay = day;
    }
    if (!isHeatmapCountableDay(day)) continue;

    totalCount += day.count;
    if (day.count > (bestDay?.count ?? 0)) bestDay = day;
    rangeEndDay = day;
    currentStreak = day.count > 0 ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  rangeStartDay ??= days[0] ?? null;
  rangeEndDay ??= lastDisplayYearDay ?? days.at(-1) ?? null;

  return {
    totalCount,
    bestDay: bestDay && bestDay.count > 0 ? bestDay : null,
    rangeStartKey: rangeStartDay?.key ?? null,
    rangeEndKey: rangeEndDay?.key ?? null,
    rangeLabel: rangeStartDay && rangeEndDay ? `${formatShortDate(rangeStartDay.date)} - ${formatShortDate(rangeEndDay.date)}` : "",
    currentStreak,
    longestStreak,
  };
}

function createDeckRow(
  deck: Deck,
  { now, cardLimit, scopeDecks = [deck], depth = 0, childrenCount = 0 }: {
    now: DateInput;
    cardLimit: number;
    scopeDecks?: Deck[];
    depth?: number;
    childrenCount?: number;
  },
) {
  const activeCards = listReviewableCards(deck);
  const directSummary = summarizeDeckReview(deck, now);
  const summary = summarizeDeckReview({ ...deck, cards: scopeDecks.flatMap((scopeDeck) => scopeDeck.cards ?? []) }, now);

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
    progress: progressPercent(summary),
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

function createCardTableRow(card: LearningItem) {
  const isNew = card.reviewState?.state === "new";
  const parsedDue = Date.parse(card.reviewState?.dueAt ?? "");
  const dueTimestamp = !isNew && Number.isFinite(parsedDue) ? parsedDue : Number.POSITIVE_INFINITY;
  const hasActiveVariants = (card.variants ?? []).some((variant) => (
    !variant.isOriginal && variant.isActive !== false && variant.qualityStatus === "active"
  ));

  return {
    id: card.id,
    card,
    frontPreview: previewText(card.originalFront),
    backPreview: previewText(card.originalBack),
    dueTimestamp,
    dueLabel: Number.isFinite(dueTimestamp) ? cardDueDateFormatter.format(dueTimestamp) : "Neu",
    hasActiveVariants,
    variantsLabel: hasActiveVariants ? "Mit Varianten" : "Ohne Varianten",
  };
}
export type CardTableRow = ReturnType<typeof createCardTableRow>;

export type CardTableGroup = Omit<DeckLibraryRow, "cardRows"> & { cardRows: CardTableRow[] };

function sortCardRows(rows: CardTableRow[], sort: CardTableSort): CardTableRow[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    let comparison = 0;
    if (sort.field === "sortField") {
      comparison = cardSortCollator.compare(left.frontPreview, right.frontPreview);
    } else if (sort.field === "due") {
      comparison = left.dueTimestamp === right.dueTimestamp ? 0 : left.dueTimestamp - right.dueTimestamp;
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

function buildChildrenByParent(decks: Deck[]): Map<string | null, Deck[]> {
  const deckIds = new Set(decks.map((deck) => deck.id));
  const childrenByParent = new Map<string | null, Deck[]>();

  for (const deck of decks) {
    const parentId = deck.parentDeckId && deckIds.has(deck.parentDeckId) ? deck.parentDeckId : null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), deck]);
  }

  return childrenByParent;
}

function collectScopeDecks(deck: Deck, childrenByParent: Map<string | null, Deck[]>): Deck[] {
  const children = childrenByParent.get(deck.id) ?? [];
  return [deck, ...children.flatMap((child) => collectScopeDecks(child, childrenByParent))];
}

function flattenDeckTree(decks: Deck[], options: { now: DateInput; cardLimit: number }): DeckLibraryRow[] {
  const childrenByParent = buildChildrenByParent(decks);
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

export function getStudyHeatmapVisibleWeekCount(viewportWidth: unknown, totalWeeks = DEFAULT_HEATMAP_WEEK_COUNT): number {
  const normalizedTotalWeeks = Math.max(MIN_HEATMAP_WINDOW_WEEKS, Math.round(Number(totalWeeks) || DEFAULT_HEATMAP_WEEK_COUNT));
  const measuredWidth = Number(viewportWidth);
  if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) return normalizedTotalWeeks;

  const usableWidth = Math.max(0, measuredWidth - HEATMAP_WEEKDAY_LABEL_WIDTH);
  const weeksThatFit = Math.floor(usableWidth / (HEATMAP_CELL_SIZE + HEATMAP_COLUMN_GAP));

  return clampNumber(weeksThatFit, MIN_HEATMAP_WINDOW_WEEKS, normalizedTotalWeeks);
}

export function createStudyHeatmapWindow(heatmap: HeatmapInput = {}, options: LibraryOptions = {}) {
  const allWeeks = heatmap.weeks ?? [];
  const totalWeekCount = allWeeks.length;

  if (!totalWeekCount) {
    return {
      ...heatmap,
      days: [],
      weeks: [],
      weekCount: 0,
      visibleWeekCount: 0,
      totalWeekCount: 0,
      startWeekIndex: 0,
      endWeekIndex: 0,
      canShowPrevious: false,
      canShowNext: false,
      previousEndWeekIndex: 0,
      nextEndWeekIndex: 0,
      monthLabels: [],
      ...summarizeHeatmapDays([]),
    };
  }

  const visibleWeekCount = getStudyHeatmapVisibleWeekCount(options.viewportWidth, totalWeekCount);
  const hasRequestedEndWeekIndex = options.endWeekIndex !== null && options.endWeekIndex !== undefined;
  const requestedEndWeekIndex = hasRequestedEndWeekIndex ? Math.round(Number(options.endWeekIndex)) : Number.NaN;
  const defaultEndWeekIndex = visibleWeekCount >= totalWeekCount ? totalWeekCount : heatmap.defaultEndWeekIndex ?? totalWeekCount;
  const endWeekIndex = clampNumber(
    Number.isFinite(requestedEndWeekIndex) ? requestedEndWeekIndex : defaultEndWeekIndex,
    visibleWeekCount,
    totalWeekCount,
  );
  const startWeekIndex = endWeekIndex - visibleWeekCount;
  const weeks = allWeeks.slice(startWeekIndex, endWeekIndex);
  const days = weeks.flat();
  const navigationStep = Math.min(visibleWeekCount, HEATMAP_NAVIGATION_STEP_WEEKS);

  return {
    ...heatmap,
    ...summarizeHeatmapDays(days),
    days,
    weeks,
    weekCount: visibleWeekCount,
    visibleWeekCount,
    totalWeekCount,
    startWeekIndex,
    endWeekIndex,
    canShowPrevious: startWeekIndex > 0,
    canShowNext: endWeekIndex < totalWeekCount,
    previousEndWeekIndex: Math.max(visibleWeekCount, endWeekIndex - navigationStep),
    nextEndWeekIndex: Math.min(totalWeekCount, endWeekIndex + navigationStep),
    monthLabels: createHeatmapMonthLabels(weeks),
  };
}

export function createStudyHeatmapModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const today = startOfLocalDay(options.now ?? new Date());
  const useCalendarYear = options.weeks === null || options.weeks === undefined;
  const displayYear = useCalendarYear ? normalizeCalendarYear(options.year, today.getFullYear()) : null;
  const calendarStartDay = useCalendarYear ? startOfYear(displayYear as number) : null;
  const calendarEndDay = useCalendarYear ? endOfYear(displayYear as number) : null;
  const requestedWeekCount = Math.max(
    MIN_HEATMAP_WINDOW_WEEKS,
    Math.round(Number(options.weeks ?? DEFAULT_HEATMAP_WEEK_COUNT) || DEFAULT_HEATMAP_WEEK_COUNT),
  );
  const firstWeekStart = useCalendarYear
    ? startOfWeek(calendarStartDay as Date)
    : addLocalDays(startOfWeek(today), -(requestedWeekCount - 1) * 7);
  const lastDay = useCalendarYear
    ? addLocalDays(startOfWeek(calendarEndDay as Date), 6)
    : addLocalDays(firstWeekStart, requestedWeekCount * 7 - 1);
  const countsByDate = new Map<string | null, number>();

  for (const deck of decks) {
    for (const event of deck.reviewEvents ?? []) {
      const key = localDateKey(reviewEventDate(event as ReviewEventInput));
      if (!key) continue;
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }
  }

  const days: HeatmapDay[] = [];
  for (let cursor = firstWeekStart; cursor.getTime() <= lastDay.getTime(); cursor = addLocalDays(cursor, 1)) {
    const key = localDateKey(cursor);
    const isOutsideDisplayYear = useCalendarYear && (cursor.getTime() < (calendarStartDay as Date).getTime() || cursor.getTime() > (calendarEndDay as Date).getTime());
    const isFuture = cursor.getTime() > today.getTime();
    days.push({
      key,
      date: cursor.toISOString(),
      dayOfMonth: cursor.getDate(),
      count: isFuture || isOutsideDisplayYear ? 0 : countsByDate.get(key) ?? 0,
      isToday: cursor.getTime() === today.getTime(),
      isFuture,
      isOutsideDisplayYear,
    });
  }

  const visibleDays = days.filter(isHeatmapCountableDay);
  const maxCount = visibleDays.reduce((max, day) => Math.max(max, day.count), 0);
  const daysWithLevels = days.map((day) => ({ ...day, level: heatmapLevel(day.count, maxCount) }));
  const weekCount = Math.round(daysWithLevels.length / 7);
  const weeks = Array.from({ length: weekCount }, (_, index) => daysWithLevels.slice(index * 7, index * 7 + 7));
  const todayWeekIndex = weeks.findIndex((week) => week.some((day) => day.isToday));
  const defaultEndWeekIndex =
    useCalendarYear && (calendarStartDay as Date).getTime() > today.getTime()
      ? MIN_HEATMAP_WINDOW_WEEKS
      : todayWeekIndex >= 0
        ? todayWeekIndex + 1
        : weekCount;

  return {
    days: daysWithLevels,
    weeks,
    weekCount,
    maxCount,
    displayYear,
    isCalendarYear: useCalendarYear,
    calendarStartKey: localDateKey(calendarStartDay ?? firstWeekStart),
    calendarEndKey: localDateKey(calendarEndDay ?? today),
    defaultEndWeekIndex,
    ...summarizeHeatmapDays(daysWithLevels),
    monthLabels: createHeatmapMonthLabels(weeks),
    weekdayLabels: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
  };
}

export function createDeckLibraryModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardLimit = options.cardLimit ?? 80;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit });
  const filteredRows = rows.filter((row) => matchesDeckRow(row, query, coreMode));
  const selectedRow = rows.find((row) => row.id === options.selectedDeckId) ?? filteredRows[0] ?? null;

  return {
    rows,
    filteredRows,
    selectedRow,
    dueCards: rows.reduce((total, row) => total + row.directSummary.dueCards, 0),
    studyHeatmap: createStudyHeatmapModel(decks, { now }),
  };
}

export function createCardTableModel(decks: Deck[] = [], options: LibraryOptions = {}) {
  const query = normalizeQuery(options.query);
  const coreMode = options.coreMode ?? "all";
  const cardSort = options.cardSort ?? DEFAULT_CARD_TABLE_SORT;
  const now = options.now ?? new Date();
  const rows = flattenDeckTree(decks, { now, cardLimit: 0 });
  const allGroups: CardTableGroup[] = rows.map((row) => ({
    ...row,
    cardRows: sortCardRows(row.activeCards.map(createCardTableRow), cardSort),
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
