import { stripHtml } from "./htmlSafety.js";
import { listReviewableCards, summarizeDeckReview } from "./scheduler.js";

const DEFAULT_HEATMAP_WEEK_COUNT = 53;
const MIN_HEATMAP_WINDOW_WEEKS = 4;
const HEATMAP_WEEKDAY_LABEL_WIDTH = 36;
const HEATMAP_MIN_CELL_SIZE = 9;
const HEATMAP_COLUMN_GAP = 4;
const HEATMAP_NAVIGATION_STEP_WEEKS = 4;
const PERFORMANCE_RECENT_DAY_COUNT = 14;
const REVIEW_RATING_KEYS = ["again", "hard", "good", "easy"];
const REVIEW_RATING_LABELS = {
  again: "Wiederholen",
  hard: "Schwer",
  good: "Gut",
  easy: "Leicht",
};

function normalizeQuery(value) {
  return String(value ?? "").trim().toLowerCase();
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deckPath(deck) {
  return (deck.hierarchyPath ?? [deck.name]).join(" / ");
}

function progressPercent(summary) {
  return summary.totalCards ? Math.round((summary.matureCards / summary.totalCards) * 100) : 0;
}

function previewText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim() || "Leere Karte";
}

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addLocalDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value) {
  const date = startOfLocalDay(value);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addLocalDays(date, -daysSinceMonday);
}

function startOfYear(year) {
  return startOfLocalDay(new Date(year, 0, 1));
}

function endOfYear(year) {
  return startOfLocalDay(new Date(year, 11, 31));
}

function normalizeCalendarYear(value, fallbackYear) {
  const year = Math.round(Number(value));
  return Number.isFinite(year) && year >= 1900 && year <= 9999 ? year : fallbackYear;
}

function reviewEventDate(event) {
  return event?.reviewedAt ?? event?.answeredAt ?? event?.createdAt ?? null;
}

function heatmapLevel(count, maxCount) {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function formatShortDate(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatShortDayMonth(value) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.`;
}

function monthShortLabel(value) {
  return ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][new Date(value).getMonth()];
}

function heatmapMonthLabel(value, options = {}) {
  const date = new Date(value);
  const monthLabel = monthShortLabel(value);
  return options.includeYear ? `${monthLabel} ${date.getFullYear()}` : monthLabel;
}

function hasVisiblePreviousYearDay(day, weeks) {
  const previousDayKey = localDateKey(addLocalDays(day.date, -1));
  return weeks.some((week) => week.some((candidate) => candidate.key === previousDayKey));
}

function createHeatmapMonthLabels(weeks) {
  return weeks.map((week, weekIndex) => {
    const monthStart = week.find((day) => !day.isOutsideDisplayYear && new Date(day.date).getDate() === 1);
    if (monthStart) {
      const isJanuary = new Date(monthStart.date).getMonth() === 0;
      const isVisibleYearChange = isJanuary && (weekIndex === 0 || hasVisiblePreviousYearDay(monthStart, weeks));
      return heatmapMonthLabel(monthStart.date, { includeYear: isVisibleYearChange });
    }
    if (weekIndex === 0) {
      const firstDisplayDay = week.find((day) => !day.isOutsideDisplayYear) ?? week[0];
      return monthShortLabel(firstDisplayDay.date);
    }
    return "";
  });
}

function isHeatmapCountableDay(day) {
  return !day.isFuture && !day.isOutsideDisplayYear;
}

function currentStreakLength(days) {
  let streak = 0;
  for (const day of [...days].reverse()) {
    if (day.isFuture || day.isOutsideDisplayYear) continue;
    if (day.count <= 0) break;
    streak += 1;
  }
  return streak;
}

function longestStreakLength(days) {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.isFuture || day.isOutsideDisplayYear) continue;
    current = day.count > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function summarizeHeatmapDays(days) {
  const visibleDays = days.filter(isHeatmapCountableDay);
  const totalCount = visibleDays.reduce((sum, day) => sum + day.count, 0);
  const activeDays = visibleDays.filter((day) => day.count > 0).length;
  const bestDay = visibleDays.reduce((best, day) => (day.count > (best?.count ?? 0) ? day : best), null);
  const rangeStartDay = days.find((day) => !day.isOutsideDisplayYear) ?? days[0] ?? null;
  const rangeEndDay =
    [...days].reverse().find(isHeatmapCountableDay) ??
    [...days].reverse().find((day) => !day.isOutsideDisplayYear) ??
    days.at(-1) ??
    null;

  return {
    totalCount,
    activeDays,
    averagePerActiveDay: activeDays ? Math.round((totalCount / activeDays) * 10) / 10 : 0,
    bestDay: bestDay?.count > 0 ? bestDay : null,
    rangeStartKey: rangeStartDay?.key ?? null,
    rangeEndKey: rangeEndDay?.key ?? null,
    rangeLabel: rangeStartDay && rangeEndDay ? `${formatShortDate(rangeStartDay.date)} - ${formatShortDate(rangeEndDay.date)}` : "",
    currentStreak: currentStreakLength(days),
    longestStreak: longestStreakLength(days),
  };
}

function resultLabel(job) {
  if (job.resultRef?.cardCount) return `${job.resultRef.cardCount} Karten`;
  if (job.resultRef?.generatedVariantIds) return `${job.resultRef.generatedVariantIds.length} Varianten`;
  return "";
}

function percentage(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normalizeRating(rating) {
  return REVIEW_RATING_KEYS.includes(rating) ? rating : null;
}

function isPositiveRating(rating) {
  return rating === "hard" || rating === "good" || rating === "easy";
}

function isStrongRating(rating) {
  return rating === "good" || rating === "easy";
}

function isVariantReviewEvent(event) {
  return event?.reviewableType === "variant" || event?.variantLevel > 1 || event?.variantType === "rephrase";
}

function createPerformanceEvent(deck, event) {
  const rating = normalizeRating(event?.rating);
  const rawDate = reviewEventDate(event);
  const date = rawDate ? new Date(rawDate) : null;

  if (!rating || !date || Number.isNaN(date.getTime())) return null;

  const responseTimeMs = Number(event.responseTimeMs);

  return {
    id: event.id,
    deckId: deck.id,
    deckName: deck.name,
    learningItemId: event.learningItemId ?? event.cardId ?? null,
    variantId: event.variantId ?? event.cardVariantId ?? null,
    rating,
    reviewedAt: date.toISOString(),
    dateKey: localDateKey(date),
    responseTimeMs: Number.isFinite(responseTimeMs) && responseTimeMs > 0 ? responseTimeMs : null,
    isPositive: isPositiveRating(rating),
    isStrong: isStrongRating(rating),
    isVariant: isVariantReviewEvent(event),
  };
}

function collectPerformanceEvents(decks = []) {
  return decks
    .flatMap((deck) => (deck.reviewEvents ?? []).map((event) => createPerformanceEvent(deck, event)).filter(Boolean))
    .sort((left, right) => String(right.reviewedAt).localeCompare(String(left.reviewedAt)));
}

function createRatingBreakdown(events) {
  return REVIEW_RATING_KEYS.map((rating) => {
    const count = events.filter((event) => event.rating === rating).length;

    return {
      rating,
      label: REVIEW_RATING_LABELS[rating],
      count,
      percent: percentage(count, events.length),
    };
  });
}

function createRecentPerformanceDays(events, options = {}) {
  const dayCount = Math.max(1, Math.round(Number(options.dayCount ?? PERFORMANCE_RECENT_DAY_COUNT) || PERFORMANCE_RECENT_DAY_COUNT));
  const end = startOfLocalDay(options.now ?? new Date());
  const start = addLocalDays(end, -(dayCount - 1));
  const eventsByDate = new Map();

  for (const event of events) {
    eventsByDate.set(event.dateKey, [...(eventsByDate.get(event.dateKey) ?? []), event]);
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addLocalDays(start, index);
    const key = localDateKey(date);
    const dayEvents = eventsByDate.get(key) ?? [];
    const successCount = dayEvents.filter((event) => event.isPositive).length;

    return {
      key,
      label: formatShortDayMonth(date),
      reviews: dayEvents.length,
      successCount,
      successPercent: percentage(successCount, dayEvents.length),
      weakCount: dayEvents.filter((event) => event.rating === "again" || event.rating === "hard").length,
    };
  });
}

function createDeckPerformanceRows(decks = [], events = [], now = new Date()) {
  const eventsByDeckId = new Map();
  for (const event of events) {
    eventsByDeckId.set(event.deckId, [...(eventsByDeckId.get(event.deckId) ?? []), event]);
  }

  return decks
    .map((deck) => {
      const deckEvents = eventsByDeckId.get(deck.id) ?? [];
      const summary = summarizeDeckReview(deck, now);
      const successCount = deckEvents.filter((event) => event.isPositive).length;
      const weakCount = deckEvents.filter((event) => event.rating === "again" || event.rating === "hard").length;
      const variantReviewCount = deckEvents.filter((event) => event.isVariant).length;

      return {
        id: deck.id,
        name: deckPath(deck),
        deckName: deck.name,
        reviewCount: deckEvents.length,
        successCount,
        successPercent: percentage(successCount, deckEvents.length),
        weakCount,
        weakPercent: percentage(weakCount, deckEvents.length),
        variantReviewCount,
        averageResponseSeconds: Math.round(average(deckEvents.map((event) => event.responseTimeMs).filter(Boolean)) / 100) / 10,
        dueCards: summary.dueCards,
        totalCards: summary.totalCards,
        matureCards: summary.matureCards,
      };
    })
    .sort((left, right) => right.reviewCount - left.reviewCount || right.weakCount - left.weakCount || left.name.localeCompare(right.name));
}

function createDeckRow(deck, { now, cardLimit, scopeDecks = [deck], depth = 0, childrenCount = 0 }) {
  const activeCards = listReviewableCards(deck);
  const directSummary = summarizeDeckReview(deck, now);
  const summary = summarizeDeckReview({ cards: scopeDecks.flatMap((scopeDeck) => scopeDeck.cards ?? []) }, now);

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

function matchesDeckRow(row, query, coreMode) {
  const haystack = normalizeQuery(`${row.name} ${row.deck.tags?.join(" ") ?? ""} ${row.path}`);
  const matchesQuery = !query || haystack.includes(query);
  const matchesMode = coreMode === "all" || row.coreMode === coreMode;

  return matchesQuery && matchesMode;
}

function summarizeDecks(decks, now) {
  const summaries = decks.map((deck) => summarizeDeckReview(deck, now));
  const totals = summaries.reduce(
    (accumulator, row) => {
      const summary = row;
      accumulator.totalCards += summary.totalCards;
      accumulator.dueCards += summary.dueCards;
      accumulator.newCards += summary.newCards;
      accumulator.matureCards += summary.matureCards;
      accumulator.activeVariants += summary.activeVariants;
      accumulator.weightedMaturityXp += summary.averageMaturityXp * summary.totalCards;
      return accumulator;
    },
    {
      deckCount: decks.length,
      totalCards: 0,
      dueCards: 0,
      newCards: 0,
      matureCards: 0,
      activeVariants: 0,
      weightedMaturityXp: 0,
    },
  );

  return {
    deckCount: totals.deckCount,
    totalCards: totals.totalCards,
    dueCards: totals.dueCards,
    newCards: totals.newCards,
    matureCards: totals.matureCards,
    activeVariants: totals.activeVariants,
    averageMaturityXp: totals.totalCards ? Math.round(totals.weightedMaturityXp / totals.totalCards) : 0,
    completionPercent: totals.totalCards ? Math.round((totals.matureCards / totals.totalCards) * 100) : 0,
  };
}

function buildChildrenByParent(decks) {
  const deckIds = new Set(decks.map((deck) => deck.id));
  const childrenByParent = new Map();

  for (const deck of decks) {
    const parentId = deck.parentDeckId && deckIds.has(deck.parentDeckId) ? deck.parentDeckId : null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), deck]);
  }

  return childrenByParent;
}

function collectScopeDecks(deck, childrenByParent) {
  const children = childrenByParent.get(deck.id) ?? [];
  return [deck, ...children.flatMap((child) => collectScopeDecks(child, childrenByParent))];
}

function flattenDeckTree(decks, options = {}) {
  const childrenByParent = buildChildrenByParent(decks);
  const rows = [];

  function visit(deck, depth) {
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

export function createVisibleDeckRows(rows = [], collapsedDeckIds = new Set()) {
  const collapsedIds = collapsedDeckIds instanceof Set ? collapsedDeckIds : new Set(collapsedDeckIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return rows.filter((row) => {
    let parentId = row.parentDeckId;
    while (parentId) {
      if (collapsedIds.has(parentId)) return false;
      parentId = rowById.get(parentId)?.parentDeckId ?? null;
    }
    return true;
  });
}

export function getStudyHeatmapVisibleWeekCount(viewportWidth, totalWeeks = DEFAULT_HEATMAP_WEEK_COUNT) {
  const normalizedTotalWeeks = Math.max(MIN_HEATMAP_WINDOW_WEEKS, Math.round(Number(totalWeeks) || DEFAULT_HEATMAP_WEEK_COUNT));
  const measuredWidth = Number(viewportWidth);
  if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) return normalizedTotalWeeks;

  const usableWidth = Math.max(0, measuredWidth - HEATMAP_WEEKDAY_LABEL_WIDTH);
  const weeksThatFit = Math.floor((usableWidth + HEATMAP_COLUMN_GAP) / (HEATMAP_MIN_CELL_SIZE + HEATMAP_COLUMN_GAP));

  return clampNumber(weeksThatFit, MIN_HEATMAP_WINDOW_WEEKS, normalizedTotalWeeks);
}

export function createStudyHeatmapWindow(heatmap = {}, options = {}) {
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

export function createStudyHeatmapModel(decks = [], options = {}) {
  const today = startOfLocalDay(options.now ?? new Date());
  const useCalendarYear = options.weeks === null || options.weeks === undefined;
  const displayYear = useCalendarYear ? normalizeCalendarYear(options.year, today.getFullYear()) : null;
  const calendarStartDay = useCalendarYear ? startOfYear(displayYear) : null;
  const calendarEndDay = useCalendarYear ? endOfYear(displayYear) : null;
  const requestedWeekCount = Math.max(
    MIN_HEATMAP_WINDOW_WEEKS,
    Math.round(Number(options.weeks ?? DEFAULT_HEATMAP_WEEK_COUNT) || DEFAULT_HEATMAP_WEEK_COUNT),
  );
  const firstWeekStart = useCalendarYear
    ? startOfWeek(calendarStartDay)
    : addLocalDays(startOfWeek(today), -(requestedWeekCount - 1) * 7);
  const lastDay = useCalendarYear
    ? addLocalDays(startOfWeek(calendarEndDay), 6)
    : addLocalDays(firstWeekStart, requestedWeekCount * 7 - 1);
  const countsByDate = new Map();

  for (const deck of decks) {
    for (const event of deck.reviewEvents ?? []) {
      const key = localDateKey(reviewEventDate(event));
      if (!key) continue;
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }
  }

  const days = [];
  for (let cursor = firstWeekStart; cursor.getTime() <= lastDay.getTime(); cursor = addLocalDays(cursor, 1)) {
    const key = localDateKey(cursor);
    const isOutsideDisplayYear = useCalendarYear && (cursor.getTime() < calendarStartDay.getTime() || cursor.getTime() > calendarEndDay.getTime());
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
    useCalendarYear && calendarStartDay.getTime() > today.getTime()
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

export function createDeckLibraryModel(decks = [], options = {}) {
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
    dashboardRows: rows.filter((row) => row.depth === 0).slice(0, 4),
    totals: summarizeDecks(decks, now),
    studyHeatmap: createStudyHeatmapModel(decks, { now }),
  };
}

export function createPerformanceStatisticsModel(decks = [], options = {}) {
  const now = options.now ?? new Date();
  const events = collectPerformanceEvents(decks);
  const successCount = events.filter((event) => event.isPositive).length;
  const strongCount = events.filter((event) => event.isStrong).length;
  const variantEvents = events.filter((event) => event.isVariant);
  const variantSuccessCount = variantEvents.filter((event) => event.isPositive).length;
  const responseTimes = events.map((event) => event.responseTimeMs).filter(Boolean);
  const heatmap = createStudyHeatmapModel(decks, {
    now,
    weeks: options.heatmapWeeks ?? DEFAULT_HEATMAP_WEEK_COUNT,
  });
  const deckRows = createDeckPerformanceRows(decks, events, now);
  const weakDeckRows = deckRows
    .filter((row) => row.reviewCount > 0 && row.weakCount > 0)
    .sort((left, right) => right.weakPercent - left.weakPercent || right.weakCount - left.weakCount || right.reviewCount - left.reviewCount)
    .slice(0, 5);

  return {
    hasReviewEvents: events.length > 0,
    events,
    totals: {
      reviewCount: events.length,
      successCount,
      successPercent: percentage(successCount, events.length),
      strongCount,
      strongPercent: percentage(strongCount, events.length),
      averageResponseSeconds: Math.round(average(responseTimes) / 100) / 10,
      activeDays: heatmap.activeDays,
      averagePerActiveDay: heatmap.averagePerActiveDay,
      currentStreak: heatmap.currentStreak,
      longestStreak: heatmap.longestStreak,
      variantReviewCount: variantEvents.length,
      variantSuccessPercent: percentage(variantSuccessCount, variantEvents.length),
    },
    ratingBreakdown: createRatingBreakdown(events),
    recentDays: createRecentPerformanceDays(events, {
      now,
      dayCount: options.recentDayCount ?? PERFORMANCE_RECENT_DAY_COUNT,
    }),
    deckRows,
    weakDeckRows,
    latestReview: events[0] ?? null,
  };
}

export function createAiJobLedger({ decks = [], jobs = [] } = {}) {
  const deckJobs = decks.flatMap((deck) =>
    (deck.aiJobs ?? []).map((job) => ({
      ...job,
      deckName: deck.name,
    })),
  );
  const ledgerJobs = [...jobs, ...deckJobs]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .map((job) => ({
      ...job,
      scopeLabel: job.deckName ?? job.deckId ?? "global",
      resultLabel: resultLabel(job),
    }));
  const statusCounts = ledgerJobs.reduce((counts, job) => ({ ...counts, [job.status]: (counts[job.status] ?? 0) + 1 }), {});

  return {
    jobs: ledgerJobs,
    total: ledgerJobs.length,
    succeeded: statusCounts.succeeded ?? 0,
    failed: statusCounts.failed ?? 0,
    statusCounts,
  };
}
