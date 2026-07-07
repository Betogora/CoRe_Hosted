import { stripHtml } from "./htmlSafety.js";
import { listReviewableCards, summarizeDeckReview } from "./scheduler.js";

function normalizeQuery(value) {
  return String(value ?? "").trim().toLowerCase();
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

function currentStreakLength(days) {
  let streak = 0;
  for (const day of [...days].reverse()) {
    if (day.isFuture) continue;
    if (day.count <= 0) break;
    streak += 1;
  }
  return streak;
}

function longestStreakLength(days) {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.isFuture) continue;
    current = day.count > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function resultLabel(job) {
  if (job.resultRef?.cardCount) return `${job.resultRef.cardCount} Karten`;
  if (job.resultRef?.generatedVariantIds) return `${job.resultRef.generatedVariantIds.length} Varianten`;
  return "";
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

export function createStudyHeatmapModel(decks = [], options = {}) {
  const weekCount = Math.max(4, Math.round(Number(options.weeks ?? 12) || 12));
  const today = startOfLocalDay(options.now ?? new Date());
  const firstWeekStart = addLocalDays(startOfWeek(today), -(weekCount - 1) * 7);
  const lastDay = addLocalDays(firstWeekStart, weekCount * 7 - 1);
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
    const isFuture = cursor.getTime() > today.getTime();
    days.push({
      key,
      date: cursor.toISOString(),
      dayOfMonth: cursor.getDate(),
      count: isFuture ? 0 : countsByDate.get(key) ?? 0,
      isToday: cursor.getTime() === today.getTime(),
      isFuture,
    });
  }

  const visibleDays = days.filter((day) => !day.isFuture);
  const maxCount = visibleDays.reduce((max, day) => Math.max(max, day.count), 0);
  const daysWithLevels = days.map((day) => ({ ...day, level: heatmapLevel(day.count, maxCount) }));
  const weeks = Array.from({ length: weekCount }, (_, index) => daysWithLevels.slice(index * 7, index * 7 + 7));

  return {
    days: daysWithLevels,
    weeks,
    maxCount,
    totalCount: visibleDays.reduce((sum, day) => sum + day.count, 0),
    activeDays: visibleDays.filter((day) => day.count > 0).length,
    currentStreak: currentStreakLength(daysWithLevels),
    longestStreak: longestStreakLength(daysWithLevels),
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
    dashboardRows: rows.slice(0, 4),
    totals: summarizeDecks(decks, now),
    studyHeatmap: createStudyHeatmapModel(decks, { now }),
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
