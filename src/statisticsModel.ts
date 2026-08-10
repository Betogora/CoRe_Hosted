import type { Deck, LearningItem, ReviewEvent, ReviewRating, ReviewState } from "./coreTypes.ts";
import { calculateRetrievability } from "./scheduler.ts";
import {
  createStudyHeatmapForecastCounts,
  createStudyHeatmapModelFromCounts,
  type StudyHeatmapModel,
} from "./studyHeatmapModel.ts";

export type StatisticsPeriod = "30d" | "90d" | "365d" | "all";
export type StatisticsDeckSelection = "all" | string[];
export type StatisticsReviewCategory = "learning" | "relearning" | "young" | "mature";

export interface StatisticsSelection {
  period: StatisticsPeriod;
  deckIds: StatisticsDeckSelection;
  now: string;
  timeZone: string;
}

interface SchedulerSnapshot {
  state: ReviewState["state"] | null;
  intervalDays: number;
  intervalMinutes: number | null;
  difficulty: number;
  stability: number;
}

interface IndexedReview {
  event: ReviewEvent;
  answeredAtMs: number;
  before: SchedulerSnapshot;
  category: StatisticsReviewCategory;
}

interface IndexedCard {
  deckId: string;
  item: LearningItem;
}

export interface StatisticsIndex {
  decks: Deck[];
  deckById: Map<string, Deck>;
  childDeckIds: Map<string, string[]>;
  eventsByDeckId: Map<string, IndexedReview[]>;
  cardsByDeckId: Map<string, IndexedCard[]>;
}

export interface StatisticsSeriesPoint {
  key: string;
  label: string;
  rangeLabel: string;
  learning: number;
  relearning: number;
  young: number;
  mature: number;
  total: number;
  cumulative: number;
  durationMs: number;
  durationLearningMs: number;
  durationRelearningMs: number;
  durationYoungMs: number;
  durationMatureMs: number;
  timedCount: number;
}

export interface StatisticsDistributionPoint {
  key: string;
  label: string;
  count: number;
  cumulativePercent: number;
}

export interface StatisticsRatingPoint {
  category: StatisticsReviewCategory;
  label: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
  successPercent: number;
}

export interface StatisticsRetentionCell {
  remembered: number;
  total: number;
  percent: number;
}

export interface StatisticsRetentionRow {
  key: "selected" | "previous" | "all";
  label: string;
  young: StatisticsRetentionCell;
  mature: StatisticsRetentionCell;
  total: StatisticsRetentionCell;
}

export interface StatisticsProjection {
  selection: StatisticsSelection;
  scopeDeckIds: string[];
  scopeLabel: string;
  dateRangeLabel: string;
  summary: {
    reviewCount: number;
    activeDays: number;
    successPercent: number;
    trueRetentionPercent: number;
    trueRetentionSample: number;
    totalDurationMs: number;
    averageResponseMs: number;
    timedCount: number;
    currentStreak: number;
  };
  activity: StatisticsSeriesPoint[];
  addedCards: Array<{ key: string; label: string; rangeLabel: string; count: number; cumulative: number }>;
  studyHeatmap: StudyHeatmapModel;
  planning: {
    points: StatisticsSeriesPoint[];
    overdue: number;
    dueTomorrow: number;
    dueInHorizon: number;
    dailyWorkload: number;
  };
  status: {
    activeVariants: number;
    learningItems: number;
    suspendedItems: number;
    deletedItems: number;
    rows: Array<{ key: string; label: string; count: number; percent: number }>;
  };
  intervals: {
    points: StatisticsDistributionPoint[];
    averageDays: number;
    medianDays: number;
    percentile95Days: number;
  };
  fsrs: {
    difficulty: StatisticsDistributionPoint[];
    stability: StatisticsDistributionPoint[];
    retrievability: StatisticsDistributionPoint[];
  };
  hourly: Array<{ hour: number; label: string; reviews: number; successPercent: number }>;
  ratings: StatisticsRatingPoint[];
  retention: StatisticsRetentionRow[];
  deckRows: Array<{
    id: string;
    name: string;
    path: string;
    reviewCount: number;
    successPercent: number;
    againPercent: number;
    trueRetentionPercent: number;
    averageIntervalDays: number;
    nextDueAt: string | null;
  }>;
  difficultCards: Array<{
    deckId: string;
    deckName: string;
    learningItemId: string;
    title: string;
    reviewCount: number;
    weakCount: number;
    weakPercent: number;
    lastReviewedAt: string;
  }>;
}

const PERIOD_DAYS: Record<Exclude<StatisticsPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
};
const CATEGORY_LABELS: Record<StatisticsReviewCategory, string> = {
  learning: "Lernen",
  relearning: "Wiederlernen",
  young: "Jung",
  mature: "Reif",
};
const RATING_KEYS: ReviewRating[] = ["again", "hard", "good", "easy"];
const DURATION_KEY_BY_CATEGORY = {
  learning: "durationLearningMs",
  relearning: "durationRelearningMs",
  young: "durationYoungMs",
  mature: "durationMatureMs",
} as const;
const DAY_MS = 86_400_000;
const SHORT_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", timeZone: "UTC" });
const LONG_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const RANGE_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

interface CachedReviewTime {
  dayIndex: number;
  hour: number;
}

interface LocalizedCard extends IndexedCard {
  createdDayKey: string | null;
  createdDayIndex: number | null;
}

interface LocalizedReview {
  indexed: IndexedReview;
  dayIndex: number;
}

interface LocalizedReviewSeries {
  reviews: IndexedReview[];
  dayIndexes: Int32Array;
  hours: Uint8Array;
}

interface StatisticsScopeCache {
  key: string;
  timeZone: string;
  eventSeries: LocalizedReviewSeries[];
  heatmapCountsByDay: ReadonlyMap<string, number>;
  cards: LocalizedCard[];
  retentionEvents: LocalizedReview[];
  earliestEventDayIndex: number | null;
  earliestCardDayIndex: number | null;
}

interface RetentionAggregate {
  youngRemembered: number;
  youngTotal: number;
  matureRemembered: number;
  matureTotal: number;
}

const scopeCacheByIndex = new WeakMap<StatisticsIndex, StatisticsScopeCache>();
const UNRESOLVED_DAY_INDEX = -2_147_483_648;

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function maximum(values: number[], fallback = 0): number {
  let result = fallback;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function normalizeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function createLocalReviewTimeResolver(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const dayOffsetCache = new Map<number, number>();
  function exactOffset(timestamp: number): number {
    const parts = formatter.formatToParts(new Date(timestamp));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
    return representedUtc - Math.floor(timestamp / 1_000) * 1_000;
  }
  function offsetAtUtcDayStart(index: number): number {
    const cached = dayOffsetCache.get(index);
    if (cached != null) return cached;
    const offset = exactOffset(index * DAY_MS);
    dayOffsetCache.set(index, offset);
    return offset;
  }
  return (timestamp: number): CachedReviewTime => {
    const utcDayIndex = Math.floor(timestamp / DAY_MS);
    const startOffset = offsetAtUtcDayStart(utcDayIndex);
    const nextOffset = offsetAtUtcDayStart(utcDayIndex + 1);
    const offset = startOffset === nextOffset ? startOffset : exactOffset(timestamp);
    const localDate = new Date(timestamp + offset);
    const localDayIndex = Math.floor((timestamp + offset) / DAY_MS);
    return { dayIndex: localDayIndex, hour: localDate.getUTCHours() };
  };
}

function dayIndex(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function keyFromDayIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

function shiftDayKey(key: string, days: number): string {
  return keyFromDayIndex(dayIndex(key) + days);
}

function formatDayLabel(key: string): string {
  return SHORT_DAY_FORMATTER.format(new Date(`${key}T12:00:00Z`));
}

function formatRangeLabel(startKey: string, endKey: string): string {
  if (startKey === endKey) return LONG_DAY_FORMATTER.format(new Date(`${startKey}T12:00:00Z`));
  return `${RANGE_DAY_FORMATTER.format(new Date(`${startKey}T12:00:00Z`))} – ${RANGE_DAY_FORMATTER.format(new Date(`${endKey}T12:00:00Z`))}`;
}

function normalizeSnapshot(value: unknown): SchedulerSnapshot {
  const outer = asRecord(value);
  const raw = Object.keys(asRecord(outer.card)).length > 0 ? asRecord(outer.card) : outer;
  const stateValue = String(raw.state ?? "");
  const state = stateValue === "new" || stateValue === "learning" || stateValue === "review" || stateValue === "relearning"
    ? stateValue
    : null;
  const intervalMinutes = raw.intervalMinutes == null ? null : Math.max(0, finiteNumber(raw.intervalMinutes));
  return {
    state,
    intervalDays: Math.max(0, finiteNumber(raw.intervalDays)),
    intervalMinutes,
    difficulty: Math.max(0, finiteNumber(raw.difficulty)),
    stability: Math.max(0, finiteNumber(raw.stability)),
  };
}

function categoryForSnapshot(snapshot: SchedulerSnapshot): StatisticsReviewCategory {
  if (snapshot.state === "new" || snapshot.state === "learning") return "learning";
  if (snapshot.state === "relearning") return "relearning";
  return snapshot.intervalDays >= 21 ? "mature" : "young";
}

function eventTimestamp(event: ReviewEvent): number {
  const legacy = asRecord(event).reviewedAt;
  const value = Date.parse(String(event.answeredAt || legacy || event.createdAt || ""));
  return Number.isFinite(value) ? value : Number.NaN;
}

function isPositive(rating: ReviewRating): boolean {
  return rating !== "again";
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function createStatisticsIndex(decks: Deck[] = []): StatisticsIndex {
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const childDeckIds = new Map<string, string[]>();
  const eventsByDeckId = new Map<string, IndexedReview[]>();
  const cardsByDeckId = new Map<string, IndexedCard[]>();

  for (const deck of decks) {
    if (deck.parentDeckId && deckById.has(deck.parentDeckId)) {
      const childIds = childDeckIds.get(deck.parentDeckId);
      if (childIds) childIds.push(deck.id);
      else childDeckIds.set(deck.parentDeckId, [deck.id]);
    }
    const events = (deck.reviewEvents ?? [])
      .map((event) => {
        const answeredAtMs = eventTimestamp(event);
        if (!Number.isFinite(answeredAtMs) || !RATING_KEYS.includes(event.rating)) return null;
        const before = normalizeSnapshot(event.schedulerBefore);
        return { event, answeredAtMs, before, category: categoryForSnapshot(before) } satisfies IndexedReview;
      })
      .filter((event): event is IndexedReview => event != null)
      .sort((left, right) => left.answeredAtMs - right.answeredAtMs);
    eventsByDeckId.set(deck.id, events);
    cardsByDeckId.set(deck.id, (deck.cards ?? []).map((item) => ({ deckId: deck.id, item })));
  }

  return { decks, deckById, childDeckIds, eventsByDeckId, cardsByDeckId };
}

export function resolveStatisticsDeckScope(index: StatisticsIndex, selection: StatisticsDeckSelection): string[] {
  if (selection === "all" || selection.length === 0) return index.decks.map((deck) => deck.id);
  const result = new Set<string>();
  const visit = (deckId: string) => {
    if (result.has(deckId) || !index.deckById.has(deckId)) return;
    result.add(deckId);
    for (const childId of index.childDeckIds.get(deckId) ?? []) visit(childId);
  };
  selection.forEach(visit);
  return result.size > 0 ? [...result] : index.decks.map((deck) => deck.id);
}

interface TimeBucket {
  key: string;
  label: string;
  rangeLabel: string;
  startIndex: number;
  endIndex: number;
}

function bucketSizeFor(period: StatisticsPeriod, spanDays: number): number {
  if (period === "30d" || period === "90d") return 1;
  if (period === "365d") return 7;
  const minimum = Math.max(1, Math.ceil(spanDays / 180));
  return [1, 7, 14, 30, 91, 183, 365].find((size) => size >= minimum) ?? Math.ceil(spanDays / 180);
}

function createBuckets(startKey: string, endKey: string, period: StatisticsPeriod): TimeBucket[] {
  const startIndex = dayIndex(startKey);
  const endIndex = Math.max(startIndex, dayIndex(endKey));
  const size = bucketSizeFor(period, endIndex - startIndex + 1);
  const result: TimeBucket[] = [];
  for (let index = startIndex; index <= endIndex; index += size) {
    const bucketEnd = Math.min(endIndex, index + size - 1);
    const bucketStartKey = keyFromDayIndex(index);
    const bucketEndKey = keyFromDayIndex(bucketEnd);
    result.push({
      key: bucketStartKey,
      label: formatDayLabel(bucketStartKey),
      rangeLabel: formatRangeLabel(bucketStartKey, bucketEndKey),
      startIndex: index,
      endIndex: bucketEnd,
    });
  }
  return result;
}

function bucketIndexFor(buckets: TimeBucket[], target: number): number {
  const first = buckets[0];
  const last = buckets.at(-1);
  if (!first || !last || target < first.startIndex || target > last.endIndex) return -1;
  const width = first.endIndex - first.startIndex + 1;
  return Math.min(buckets.length - 1, Math.floor((target - first.startIndex) / width));
}

function emptySeries(buckets: TimeBucket[]): StatisticsSeriesPoint[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    rangeLabel: bucket.rangeLabel,
    learning: 0,
    relearning: 0,
    young: 0,
    mature: 0,
    total: 0,
    cumulative: 0,
    durationMs: 0,
    durationLearningMs: 0,
    durationRelearningMs: 0,
    durationYoungMs: 0,
    durationMatureMs: 0,
    timedCount: 0,
  }));
}

function finalizeSeries(points: StatisticsSeriesPoint[]): StatisticsSeriesPoint[] {
  let cumulative = 0;
  return points.map((point) => {
    cumulative += point.total;
    return { ...point, cumulative };
  });
}

function createDistribution(values: number[], maxValue: number, bucketCount: number, suffix: string): StatisticsDistributionPoint[] {
  if (values.length === 0 || maxValue <= 0) return [];
  const width = Math.max(1, Math.ceil(maxValue / bucketCount));
  const counts = Array.from({ length: Math.ceil(maxValue / width) }, () => 0);
  for (const value of values) {
    if (value < 0 || value > maxValue) continue;
    const index = Math.min(counts.length - 1, Math.floor(value / width));
    counts[index] += 1;
  }
  let cumulative = 0;
  return counts.map((count, index) => {
    cumulative += count;
    const start = index * width;
    const end = Math.min(maxValue, (index + 1) * width);
    return {
      key: `${start}-${end}`,
      label: `${start}–${end} ${suffix}`.trim(),
      count,
      cumulativePercent: percentage(cumulative, values.length),
    };
  });
}

function emptyRetentionAggregate(): RetentionAggregate {
  return { youngRemembered: 0, youngTotal: 0, matureRemembered: 0, matureTotal: 0 };
}

function addRetention(aggregate: RetentionAggregate, event: IndexedReview): void {
  const prefix = event.before.intervalDays >= 21 ? "mature" : "young";
  aggregate[`${prefix}Total`] += 1;
  aggregate[`${prefix}Remembered`] += Number(isPositive(event.event.rating));
}

function retentionCell(remembered: number, total: number): StatisticsRetentionCell {
  return { remembered, total, percent: percentage(remembered, total) };
}

function retentionRow(key: StatisticsRetentionRow["key"], label: string, aggregate: RetentionAggregate): StatisticsRetentionRow {
  const young = retentionCell(aggregate.youngRemembered, aggregate.youngTotal);
  const mature = retentionCell(aggregate.matureRemembered, aggregate.matureTotal);
  return {
    key,
    label,
    young,
    mature,
    total: retentionCell(young.remembered + mature.remembered, young.total + mature.total),
  };
}

function scopeDescription(index: StatisticsIndex, requested: StatisticsDeckSelection, scopeDeckIds: string[]): string {
  if (requested === "all") return "Gesamte Sammlung";
  if (requested.length === 1) return index.deckById.get(requested[0])?.name ?? "Ausgewählter Stapel";
  return `${Math.min(requested.length, scopeDeckIds.length)} Stapel ausgewählt`;
}

function getStatisticsScopeCache(index: StatisticsIndex, scopeDeckIds: string[], timeZone: string): StatisticsScopeCache {
  const key = [...scopeDeckIds].sort().join("\u0000");
  const cached = scopeCacheByIndex.get(index);
  if (cached?.key === key && cached.timeZone === timeZone) return cached;

  const resolveLocalTime = createLocalReviewTimeResolver(timeZone);
  const firstRetentionByVariantDay = new Map<string, LocalizedReview>();
  const eventSeries: LocalizedReviewSeries[] = [];
  const heatmapCountsByDay = new Map<string, number>();
  const cards: LocalizedCard[] = [];
  let earliestEventDayIndex: number | null = null;
  let earliestCardDayIndex: number | null = null;

  for (const deckId of scopeDeckIds) {
    const events = index.eventsByDeckId.get(deckId) ?? [];
    const series = {
      reviews: events,
      dayIndexes: new Int32Array(events.length),
      hours: new Uint8Array(events.length),
    };
    series.dayIndexes.fill(UNRESOLVED_DAY_INDEX);
    eventSeries.push(series);
    if (events.length > 0) {
      const firstDayIndex = localReviewDayIndexAt(series, 0, resolveLocalTime);
      if (earliestEventDayIndex == null || firstDayIndex < earliestEventDayIndex) earliestEventDayIndex = firstDayIndex;
    }
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const indexed = events[eventIndex];
      const dayIndex = localReviewDayIndexAt(series, eventIndex, resolveLocalTime);
      const dayKey = keyFromDayIndex(dayIndex);
      heatmapCountsByDay.set(dayKey, (heatmapCountsByDay.get(dayKey) ?? 0) + 1);
      if (indexed.before.intervalDays < 1) continue;
      const reviewableId = indexed.event.reviewableId || indexed.event.variantId || indexed.event.learningItemId;
      const retentionKey = `${reviewableId}\u0000${dayIndex}`;
      const previous = firstRetentionByVariantDay.get(retentionKey);
      if (!previous || indexed.answeredAtMs < previous.indexed.answeredAtMs) {
        firstRetentionByVariantDay.set(retentionKey, { indexed, dayIndex });
      }
    }

    for (const indexedCard of index.cardsByDeckId.get(deckId) ?? []) {
      const createdAtMs = Date.parse(indexedCard.item.createdAt);
      const localTime = Number.isFinite(createdAtMs) ? resolveLocalTime(createdAtMs) : null;
      cards.push({
        ...indexedCard,
        createdDayKey: localTime ? keyFromDayIndex(localTime.dayIndex) : null,
        createdDayIndex: localTime?.dayIndex ?? null,
      });
      if (localTime && (earliestCardDayIndex == null || localTime.dayIndex < earliestCardDayIndex)) earliestCardDayIndex = localTime.dayIndex;
    }
  }

  const result = {
    key,
    timeZone,
    eventSeries,
    heatmapCountsByDay,
    cards,
    retentionEvents: [...firstRetentionByVariantDay.values()],
    earliestEventDayIndex,
    earliestCardDayIndex,
  } satisfies StatisticsScopeCache;
  scopeCacheByIndex.set(index, result);
  return result;
}

function localReviewDayIndexAt(
  series: LocalizedReviewSeries,
  index: number,
  resolveLocalTime: (timestamp: number) => CachedReviewTime,
): number {
  const cachedDayIndex = series.dayIndexes[index];
  if (cachedDayIndex !== UNRESOLVED_DAY_INDEX) return cachedDayIndex;
  const localTime = resolveLocalTime(series.reviews[index].answeredAtMs);
  series.dayIndexes[index] = localTime.dayIndex;
  series.hours[index] = localTime.hour;
  return localTime.dayIndex;
}

function localDayBound(series: LocalizedReviewSeries, targetDayIndex: number, resolveLocalTime: (timestamp: number) => CachedReviewTime, upper: boolean): number {
  let low = 0;
  let high = series.reviews.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const currentDayIndex = localReviewDayIndexAt(series, middle, resolveLocalTime);
    if (currentDayIndex < targetDayIndex || (upper && currentDayIndex === targetDayIndex)) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function projectStatistics(index: StatisticsIndex, input: StatisticsSelection): StatisticsProjection {
  const timeZone = normalizeTimeZone(input.timeZone);
  const selection = { ...input, timeZone };
  const now = new Date(input.now);
  const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
  const resolveLocalTime = createLocalReviewTimeResolver(timeZone);
  const nowLocalTime = resolveLocalTime(safeNow.getTime());
  const nowKey = keyFromDayIndex(nowLocalTime.dayIndex);
  const scopeDeckIds = resolveStatisticsDeckScope(index, input.deckIds);
  const scope = getStatisticsScopeCache(index, scopeDeckIds, timeZone);
  const startDayIndex = input.period === "all"
    ? Math.min(scope.earliestEventDayIndex ?? nowLocalTime.dayIndex, scope.earliestCardDayIndex ?? nowLocalTime.dayIndex)
    : nowLocalTime.dayIndex - PERIOD_DAYS[input.period] + 1;
  const startKey = keyFromDayIndex(startDayIndex);
  const previousStartDayIndex = input.period === "all" ? null : startDayIndex - PERIOD_DAYS[input.period];
  const previousEndDayIndex = input.period === "all" ? null : startDayIndex - 1;
  const inSelectedRange = (value: number) => value >= startDayIndex && value <= nowLocalTime.dayIndex;

  const buckets = createBuckets(startKey, nowKey, input.period);
  const activity = emptySeries(buckets);
  const reviewsByDay = new Map<number, number>();
  const hourRows = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, reviews: 0, success: 0 }));
  const ratingRows = new Map<StatisticsReviewCategory, StatisticsRatingPoint>(
    (Object.keys(CATEGORY_LABELS) as StatisticsReviewCategory[]).map((category) => [category, {
      category,
      label: CATEGORY_LABELS[category],
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
      total: 0,
      successPercent: 0,
    }]),
  );
  const difficult = new Map<string, { deckId: string; itemId: string; reviewCount: number; weakCount: number; lastReviewedAt: string }>();
  const deckReviewAggregates = new Map<string, { reviewCount: number; positive: number; again: number }>();
  let reviewCount = 0;
  let successCount = 0;
  let timedCount = 0;
  let totalDurationMs = 0;

  for (const series of scope.eventSeries) {
    const rangeStart = localDayBound(series, startDayIndex, resolveLocalTime, false);
    const rangeEnd = localDayBound(series, nowLocalTime.dayIndex, resolveLocalTime, true);
    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const indexed = series.reviews[index];
      const localDayIndex = localReviewDayIndexAt(series, index, resolveLocalTime);
      const positive = Number(isPositive(indexed.event.rating));
      reviewCount += 1;
      successCount += positive;
      reviewsByDay.set(localDayIndex, (reviewsByDay.get(localDayIndex) ?? 0) + 1);

      const bucketIndex = bucketIndexFor(buckets, localDayIndex);
      const point = activity[bucketIndex];
      if (point) {
        point[indexed.category] += 1;
        point.total += 1;
        if (indexed.event.responseTimeMs != null && Number.isFinite(indexed.event.responseTimeMs) && indexed.event.responseTimeMs >= 0) {
          const duration = Math.min(60_000, indexed.event.responseTimeMs);
          const durationKey = DURATION_KEY_BY_CATEGORY[indexed.category];
          point.durationMs += duration;
          point[durationKey] += duration;
          point.timedCount += 1;
          timedCount += 1;
          totalDurationMs += duration;
        }
      }

      const hour = hourRows[series.hours[index]];
      if (hour) {
        hour.reviews += 1;
        hour.success += positive;
      }
      const rating = ratingRows.get(indexed.category);
      if (rating) {
        rating[indexed.event.rating] += 1;
        rating.total += 1;
      }

      const deckAggregate = deckReviewAggregates.get(indexed.event.deckId) ?? { reviewCount: 0, positive: 0, again: 0 };
      deckAggregate.reviewCount += 1;
      deckAggregate.positive += positive;
      deckAggregate.again += Number(indexed.event.rating === "again");
      deckReviewAggregates.set(indexed.event.deckId, deckAggregate);

      const difficultKey = indexed.event.learningItemId;
      const difficultValue = difficult.get(difficultKey) ?? {
        deckId: indexed.event.deckId,
        itemId: indexed.event.learningItemId,
        reviewCount: 0,
        weakCount: 0,
        lastReviewedAt: indexed.event.answeredAt,
      };
      difficultValue.reviewCount += 1;
      difficultValue.weakCount += Number(indexed.event.rating === "again" || indexed.event.rating === "hard");
      if (indexed.event.answeredAt > difficultValue.lastReviewedAt) difficultValue.lastReviewedAt = indexed.event.answeredAt;
      difficult.set(difficultKey, difficultValue);
    }
  }
  const finalizedActivity = finalizeSeries(activity);
  const hourly = hourRows.map(({ success, ...row }) => ({ ...row, successPercent: percentage(success, row.reviews) }));
  const ratings = [...ratingRows.values()].map((row) => ({ ...row, successPercent: percentage(row.total - row.again, row.total) }));

  const addedCards = buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, rangeLabel: bucket.rangeLabel, count: 0, cumulative: 0 }));
  const forecastCountsByDay = createStudyHeatmapForecastCounts(
    scope.cards.map(({ item }) => item),
    { todayKey: nowKey, timeZone },
  );
  const studyHeatmap = createStudyHeatmapModelFromCounts({
    todayKey: nowKey,
    countsByDay: scope.heatmapCountsByDay,
    forecastCountsByDay,
  });

  const statusCounts = new Map<string, number>([["new", 0], ["learning", 0], ["relearning", 0], ["young", 0], ["mature", 0]]);
  const periodLimit = input.period === "all" ? Number.POSITIVE_INFINITY : PERIOD_DAYS[input.period];
  const intervalValues: number[] = [];
  const difficultyCounts = Array.from({ length: 10 }, () => 0);
  const stabilityValues: number[] = [];
  const retrievabilityCounts = Array.from({ length: 20 }, () => 0);
  const futureStates: Array<{ state: ReviewState; dueKey: string; dueDayIndex: number }> = [];
  const deckCurrentAggregates = new Map<string, { intervalTotal: number; intervalCount: number; nextDueAt: string | null }>();
  const itemById = new Map<string, LearningItem>();
  let suspendedItems = 0;
  let deletedItems = 0;
  let activeVariants = 0;
  let addedCumulative = 0;
  let difficultyEligible = 0;
  let retrievabilityEligible = 0;
  let latestDueKey = nowKey;
  let dailyWorkload = 0;

  for (const { deckId, item, createdDayKey, createdDayIndex } of scope.cards) {
    itemById.set(item.id, item);
    if (createdDayKey != null && createdDayIndex != null) {
      if (createdDayKey < startKey) addedCumulative += 1;
      else if (createdDayKey <= nowKey) {
        const bucketIndex = bucketIndexFor(buckets, createdDayIndex);
        if (bucketIndex >= 0) addedCards[bucketIndex].count += 1;
      }
    }

    const deckCurrent = deckCurrentAggregates.get(deckId) ?? { intervalTotal: 0, intervalCount: 0, nextDueAt: null };
    for (const variant of item.variants ?? []) {
      const comparisonState = variant.reviewState ?? item.learningItemState;
      if (comparisonState) {
        deckCurrent.intervalTotal += finiteNumber(comparisonState.intervalDays);
        deckCurrent.intervalCount += 1;
      }
      const dueAt = variant.reviewState?.dueAt ?? item.learningItemState?.dueAt;
      if (dueAt && (deckCurrent.nextDueAt == null || dueAt < deckCurrent.nextDueAt)) deckCurrent.nextDueAt = dueAt;
    }
    deckCurrentAggregates.set(deckId, deckCurrent);

    if (item.status === "suspended") { suspendedItems += 1; continue; }
    if (item.status === "deleted") { deletedItems += 1; continue; }
    for (const variant of item.variants ?? []) {
      if (!variant.isActive || variant.deletedAt || variant.qualityStatus === "disabled") continue;
      const state = variant.reviewState ?? item.learningItemState ?? item.reviewState;
      if (!state) continue;
      activeVariants += 1;
      const key = state.state === "review" ? (state.intervalDays >= 21 ? "mature" : "young") : state.state;
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);

      const interval = Math.max(0, finiteNumber(state.intervalDays));
      if (interval <= periodLimit) intervalValues.push(interval);
      const difficulty = finiteNumber(state.difficulty);
      if (difficulty > 0 && difficulty <= 10) {
        difficultyCounts[Math.min(9, Math.max(0, Math.ceil(difficulty) - 1))] += 1;
        difficultyEligible += 1;
      }
      const stability = finiteNumber(state.stability);
      if (stability > 0) stabilityValues.push(stability);
      const retrievability = calculateRetrievability(state, safeNow);
      if (Number.isFinite(retrievability) && retrievability >= 0 && retrievability <= 1) {
        retrievabilityCounts[Math.min(19, Math.floor(retrievability * 20))] += 1;
        retrievabilityEligible += 1;
      }
      const dueAtMs = Date.parse(state.dueAt);
      if (Number.isFinite(dueAtMs)) {
        const dueLocalTime = resolveLocalTime(dueAtMs);
        const dueKey = keyFromDayIndex(dueLocalTime.dayIndex);
        futureStates.push({ state, dueKey, dueDayIndex: dueLocalTime.dayIndex });
        if (dueKey > latestDueKey) latestDueKey = dueKey;
        dailyWorkload += 1 / Math.max(1, finiteNumber(state.intervalDays, 1));
      }
    }
  }
  for (const point of addedCards) {
    addedCumulative += point.count;
    point.cumulative = addedCumulative;
  }
  const statusLabels: Record<string, string> = { new: "Neu", learning: "Lernen", relearning: "Wiederlernen", young: "Jung", mature: "Reif" };
  const statusRows = [...statusCounts].map(([key, count]) => ({ key, label: statusLabels[key], count, percent: percentage(count, activeVariants) }));

  intervalValues.sort((left, right) => left - right);
  const intervalMax = input.period === "all" ? maximum(intervalValues, 1) : PERIOD_DAYS[input.period];
  const intervalPoints = createDistribution(intervalValues, intervalMax, 60, "Tage");

  let difficultyCumulative = 0;
  const difficulty = difficultyCounts.map((count, index) => {
    difficultyCumulative += count;
    return { key: String(index + 1), label: String(index + 1), count, cumulativePercent: percentage(difficultyCumulative, difficultyEligible) };
  });
  const stability = createDistribution(stabilityValues, maximum(stabilityValues, 1), 40, "Tage");
  let retrievabilityCumulative = 0;
  const retrievability = retrievabilityCounts.map((count, index) => {
    retrievabilityCumulative += count;
    return {
      key: `${index * 5}-${(index + 1) * 5}`,
      label: `${index * 5}–${(index + 1) * 5} %`,
      count,
      cumulativePercent: percentage(retrievabilityCumulative, retrievabilityEligible),
    };
  });

  const selectedRetention = emptyRetentionAggregate();
  const previousRetention = emptyRetentionAggregate();
  const allRetention = emptyRetentionAggregate();
  const selectedRetentionByDeck = new Map<string, RetentionAggregate>();
  for (const { indexed, dayIndex } of scope.retentionEvents) {
    addRetention(allRetention, indexed);
    if (inSelectedRange(dayIndex)) {
      addRetention(selectedRetention, indexed);
      const deckRetention = selectedRetentionByDeck.get(indexed.event.deckId) ?? emptyRetentionAggregate();
      addRetention(deckRetention, indexed);
      selectedRetentionByDeck.set(indexed.event.deckId, deckRetention);
    } else if (previousStartDayIndex != null && previousEndDayIndex != null && dayIndex >= previousStartDayIndex && dayIndex <= previousEndDayIndex) {
      addRetention(previousRetention, indexed);
    }
  }
  const retention = [
    retentionRow("selected", "Gewählter Zeitraum", selectedRetention),
    ...(input.period === "all" ? [] : [retentionRow("previous", "Vorheriger Zeitraum", previousRetention)]),
    retentionRow("all", "Gesamter Verlauf", allRetention),
  ];

  const futureEndKey = input.period === "all" ? (latestDueKey > nowKey ? latestDueKey : nowKey) : shiftDayKey(nowKey, PERIOD_DAYS[input.period] - 1);
  const planningBuckets = createBuckets(nowKey, futureEndKey, input.period);
  const planningPoints = emptySeries(planningBuckets);
  let overdue = 0;
  let dueTomorrow = 0;
  const dueTomorrowKey = shiftDayKey(nowKey, 1);
  for (const { state, dueKey, dueDayIndex } of futureStates) {
    if (dueKey < nowKey) { overdue += 1; continue; }
    if (dueKey === dueTomorrowKey) dueTomorrow += 1;
    if (dueKey > futureEndKey) continue;
    const bucketIndex = bucketIndexFor(planningBuckets, dueDayIndex);
    if (bucketIndex < 0) continue;
    const point = planningPoints[bucketIndex];
    const category = state.state === "review" ? (state.intervalDays >= 21 ? "mature" : "young") : state.state === "new" || state.state === "learning" ? "learning" : "relearning";
    point[category] += 1;
    point.total += 1;
  }
  if (planningPoints.length > 0 && overdue > 0) {
    planningPoints[0].relearning += overdue;
    planningPoints[0].total += overdue;
    planningPoints[0].rangeLabel = `${planningPoints[0].rangeLabel} einschließlich Rückstand`;
  }
  const finalizedPlanning = finalizeSeries(planningPoints);

  const deckRows = scopeDeckIds.map((deckId) => {
    const deck = index.deckById.get(deckId);
    const reviews = deckReviewAggregates.get(deckId) ?? { reviewCount: 0, positive: 0, again: 0 };
    const retained = selectedRetentionByDeck.get(deckId) ?? emptyRetentionAggregate();
    const current = deckCurrentAggregates.get(deckId) ?? { intervalTotal: 0, intervalCount: 0, nextDueAt: null };
    const retainedTotal = retained.youngTotal + retained.matureTotal;
    const retainedRemembered = retained.youngRemembered + retained.matureRemembered;
    return {
      id: deckId,
      name: deck?.name ?? "Unbekannter Stapel",
      path: deck?.hierarchyPath?.join(" / ") || deck?.name || "Unbekannter Stapel",
      reviewCount: reviews.reviewCount,
      successPercent: percentage(reviews.positive, reviews.reviewCount),
      againPercent: percentage(reviews.again, reviews.reviewCount),
      trueRetentionPercent: percentage(retainedRemembered, retainedTotal),
      averageIntervalDays: current.intervalCount > 0 ? Math.round((current.intervalTotal / current.intervalCount) * 10) / 10 : 0,
      nextDueAt: current.nextDueAt,
    };
  }).sort((left, right) => right.reviewCount - left.reviewCount || left.path.localeCompare(right.path, "de"));

  const difficultCards = [...difficult.values()]
    .filter((row) => row.reviewCount >= 3)
    .map((row) => {
      const item = itemById.get(row.itemId);
      return {
        deckId: row.deckId,
        deckName: index.deckById.get(row.deckId)?.name ?? "Unbekannter Stapel",
        learningItemId: row.itemId,
        title: stripMarkup(item?.title || item?.canonicalQuestion || item?.originalFront || "Unbenannte Karte").slice(0, 120),
        reviewCount: row.reviewCount,
        weakCount: row.weakCount,
        weakPercent: percentage(row.weakCount, row.reviewCount),
        lastReviewedAt: row.lastReviewedAt,
      };
    })
    .sort((left, right) => right.weakPercent - left.weakPercent || right.reviewCount - left.reviewCount || right.lastReviewedAt.localeCompare(left.lastReviewedAt))
    .slice(0, 12);

  const selectedRetentionCell = retentionCell(
    selectedRetention.youngRemembered + selectedRetention.matureRemembered,
    selectedRetention.youngTotal + selectedRetention.matureTotal,
  );
  return {
    selection,
    scopeDeckIds,
    scopeLabel: scopeDescription(index, input.deckIds, scopeDeckIds),
    dateRangeLabel: formatRangeLabel(startKey, nowKey),
    summary: {
      reviewCount,
      activeDays: reviewsByDay.size,
      successPercent: percentage(successCount, reviewCount),
      trueRetentionPercent: selectedRetentionCell.percent,
      trueRetentionSample: selectedRetentionCell.total,
      totalDurationMs,
      averageResponseMs: timedCount > 0 ? Math.round(totalDurationMs / timedCount) : 0,
      timedCount,
      currentStreak: studyHeatmap.currentStreak,
    },
    activity: finalizedActivity,
    addedCards,
    studyHeatmap,
    planning: {
      points: finalizedPlanning,
      overdue,
      dueTomorrow,
      dueInHorizon: finalizedPlanning.reduce((sum, point) => sum + point.total, 0),
      dailyWorkload: Math.round(dailyWorkload * 10) / 10,
    },
    status: {
      activeVariants,
      learningItems: scope.cards.length,
      suspendedItems,
      deletedItems,
      rows: statusRows,
    },
    intervals: {
      points: intervalPoints,
      averageDays: Math.round(average(intervalValues) * 10) / 10,
      medianDays: percentile(intervalValues, 0.5),
      percentile95Days: percentile(intervalValues, 0.95),
    },
    fsrs: {
      difficulty,
      stability,
      retrievability,
    },
    hourly,
    ratings,
    retention,
    deckRows,
    difficultCards,
  };
}
