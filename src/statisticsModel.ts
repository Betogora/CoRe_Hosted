import type { CardVariant, Deck, LearningItem, ReviewEvent, ReviewRating, ReviewState } from "./coreTypes.ts";
import { learningDayIndexFromLocalTime, normalizeDayStartHour } from "./learningDay.ts";
import { calculateRetrievability } from "./scheduler.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey, type StudyHeatmapModel } from "./studyHeatmapModel.ts";
import type { AccountStatisticsSnapshot } from "./workspaceReplica.ts";

export type StatisticsPeriod = "30d" | "90d" | "365d" | "all";
export type StatisticsDeckSelection = "all" | string[];
export type StatisticsReviewCategory = "learning" | "relearning" | "young" | "mature";

export interface StatisticsSelection {
  period: StatisticsPeriod;
  deckIds: StatisticsDeckSelection;
  now: string;
  timeZone: string;
  dayStartHour?: number;
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
  selection: Required<StatisticsSelection>;
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
  intervals: { points: StatisticsDistributionPoint[]; averageDays: number; medianDays: number; percentile95Days: number };
  fsrs: { difficulty: StatisticsDistributionPoint[]; stability: StatisticsDistributionPoint[]; retrievability: StatisticsDistributionPoint[] };
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
}

export interface StatisticsDataset {
  decks: Deck[];
  projection: StatisticsProjection;
}

type SchedulerSnapshot = Pick<ReviewState, "state" | "intervalDays" | "difficulty" | "stability">;
type CategoryCounts = Record<StatisticsReviewCategory, number>;
type RetentionAggregate = { youngRemembered: number; youngTotal: number; matureRemembered: number; matureTotal: number };
type Histogram = { counts: Map<number, number>; total: number; sum: number; max: number };

const DAY_MS = 86_400_000;
const PERIOD_DAYS = { "30d": 30, "90d": 90, "365d": 365 } as const;
const CATEGORY_LABELS: Record<StatisticsReviewCategory, string> = { learning: "Lernen", relearning: "Wiederlernen", young: "Jung", mature: "Reif" };
const CATEGORIES = Object.keys(CATEGORY_LABELS) as StatisticsReviewCategory[];
const RATINGS: ReviewRating[] = ["again", "hard", "good", "easy"];
const SHORT_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", timeZone: "UTC" });
const LONG_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const RANGE_DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentage(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 1_000) / 10 : 0;
}

function dayIndex(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function keyFromDayIndex(index: number) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

function shiftDayKey(key: string, days: number) {
  return keyFromDayIndex(dayIndex(key) + days);
}

function formatRangeLabel(startKey: string, endKey: string) {
  if (startKey === endKey) return LONG_DAY_FORMATTER.format(new Date(`${startKey}T12:00:00Z`));
  return `${RANGE_DAY_FORMATTER.format(new Date(`${startKey}T12:00:00Z`))} – ${RANGE_DAY_FORMATTER.format(new Date(`${endKey}T12:00:00Z`))}`;
}

function normalizeTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function localTimeResolver(timeZone: string, dayStartHour: number) {
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
  return (timestamp: number) => {
    const values = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    const localTimestamp = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    const localDayIndex = Math.floor(localTimestamp / DAY_MS);
    const hour = Number(values.hour);
    return { dayIndex: learningDayIndexFromLocalTime(localDayIndex, hour, dayStartHour), hour };
  };
}

function snapshot(value: unknown): SchedulerSnapshot {
  const outer = record(value);
  const raw = Object.keys(record(outer.card)).length ? record(outer.card) : outer;
  const rawState = String(raw.state ?? "");
  const state = ["new", "learning", "review", "relearning"].includes(rawState) ? rawState as ReviewState["state"] : "new";
  return {
    state,
    intervalDays: Math.max(0, finite(raw.intervalDays)),
    difficulty: Math.max(0, finite(raw.difficulty)),
    stability: Math.max(0, finite(raw.stability)),
  };
}

function category(state: Pick<ReviewState, "state" | "intervalDays">): StatisticsReviewCategory {
  if (state.state === "new" || state.state === "learning") return "learning";
  if (state.state === "relearning") return "relearning";
  return finite(state.intervalDays) >= 21 ? "mature" : "young";
}

function emptyCategories(): CategoryCounts {
  return { learning: 0, relearning: 0, young: 0, mature: 0 };
}

function emptySeriesPoint(key: string, label: string, rangeLabel: string): StatisticsSeriesPoint {
  return {
    key, label, rangeLabel, ...emptyCategories(), total: 0, cumulative: 0,
    durationMs: 0, durationLearningMs: 0, durationRelearningMs: 0,
    durationYoungMs: 0, durationMatureMs: 0, timedCount: 0,
  };
}

function bucketSize(period: StatisticsPeriod, spanDays: number) {
  if (period === "30d" || period === "90d") return 1;
  if (period === "365d") return 7;
  const minimum = Math.max(1, Math.ceil(spanDays / 180));
  return [1, 7, 14, 30, 91, 183, 365].find((size) => size >= minimum) ?? minimum;
}

function createBuckets(startIndex: number, endIndex: number, period: StatisticsPeriod) {
  const size = bucketSize(period, endIndex - startIndex + 1);
  const buckets: Array<{ start: number; end: number; point: StatisticsSeriesPoint }> = [];
  for (let index = startIndex; index <= endIndex; index += size) {
    const end = Math.min(endIndex, index + size - 1);
    const startKey = keyFromDayIndex(index);
    const endKey = keyFromDayIndex(end);
    buckets.push({ start: index, end, point: emptySeriesPoint(startKey, SHORT_DAY_FORMATTER.format(new Date(`${startKey}T12:00:00Z`)), formatRangeLabel(startKey, endKey)) });
  }
  return buckets;
}

function bucketFor(buckets: ReturnType<typeof createBuckets>, target: number) {
  const first = buckets[0];
  if (!first || target < first.start || target > buckets.at(-1)!.end) return null;
  return buckets[Math.min(buckets.length - 1, Math.floor((target - first.start) / (first.end - first.start + 1)))] ?? null;
}

function finalizeSeries(buckets: ReturnType<typeof createBuckets>) {
  let cumulative = 0;
  return buckets.map(({ point }) => ({ ...point, cumulative: cumulative += point.total }));
}

function histogram() : Histogram {
  return { counts: new Map(), total: 0, sum: 0, max: 0 };
}

function addHistogram(target: Histogram, value: number) {
  const normalized = Math.max(0, Math.round(value * 10) / 10);
  target.counts.set(normalized, (target.counts.get(normalized) ?? 0) + 1);
  target.total += 1;
  target.sum += normalized;
  target.max = Math.max(target.max, normalized);
}

function percentile(target: Histogram, ratio: number) {
  if (!target.total) return 0;
  const threshold = Math.ceil(target.total * ratio);
  let cumulative = 0;
  for (const [value, count] of [...target.counts].sort(([left], [right]) => left - right)) {
    cumulative += count;
    if (cumulative >= threshold) return value;
  }
  return target.max;
}

function distribution(target: Histogram, maxValue: number, bucketCount: number, suffix: string): StatisticsDistributionPoint[] {
  if (!target.total || maxValue <= 0) return [];
  const width = Math.max(1, Math.ceil(maxValue / bucketCount));
  const counts = Array.from({ length: Math.max(1, Math.ceil(maxValue / width)) }, () => 0);
  for (const [value, count] of target.counts) {
    if (value <= maxValue) counts[Math.min(counts.length - 1, Math.floor(value / width))] += count;
  }
  let cumulative = 0;
  return counts.map((count, index) => {
    cumulative += count;
    const start = index * width;
    const end = Math.min(maxValue, (index + 1) * width);
    return { key: `${start}-${end}`, label: `${start}–${end} ${suffix}`.trim(), count, cumulativePercent: percentage(cumulative, target.total) };
  });
}

function retentionAggregate(): RetentionAggregate {
  return { youngRemembered: 0, youngTotal: 0, matureRemembered: 0, matureTotal: 0 };
}

function addRetention(target: RetentionAggregate, before: SchedulerSnapshot, rating: ReviewRating) {
  const prefix = before.intervalDays >= 21 ? "mature" : "young";
  target[`${prefix}Total`] += 1;
  target[`${prefix}Remembered`] += Number(rating !== "again");
}

function retentionCell(remembered: number, total: number): StatisticsRetentionCell {
  return { remembered, total, percent: percentage(remembered, total) };
}

function retentionRow(key: StatisticsRetentionRow["key"], label: string, aggregate: RetentionAggregate): StatisticsRetentionRow {
  const young = retentionCell(aggregate.youngRemembered, aggregate.youngTotal);
  const mature = retentionCell(aggregate.matureRemembered, aggregate.matureTotal);
  return { key, label, young, mature, total: retentionCell(young.remembered + mature.remembered, young.total + mature.total) };
}

function deckScope(decks: Deck[], selection: StatisticsDeckSelection) {
  if (selection === "all" || selection.length === 0) return decks.map((deck) => deck.id);
  const children = new Map<string, string[]>();
  for (const deck of decks) if (deck.parentDeckId) children.set(deck.parentDeckId, [...(children.get(deck.parentDeckId) ?? []), deck.id]);
  const result = new Set<string>();
  const visit = (id: string) => {
    if (result.has(id) || !decks.some((deck) => deck.id === id)) return;
    result.add(id);
    (children.get(id) ?? []).forEach(visit);
  };
  selection.forEach(visit);
  return result.size ? [...result] : decks.map((deck) => deck.id);
}

export function createStatisticsAccumulator(decks: Deck[], input: StatisticsSelection) {
  const timeZone = normalizeTimeZone(input.timeZone);
  const dayStartHour = normalizeDayStartHour(input.dayStartHour);
  const selection = { ...input, timeZone, dayStartHour } as Required<StatisticsSelection>;
  const safeNow = Number.isFinite(Date.parse(input.now)) ? new Date(input.now) : new Date();
  const resolveLocalTime = localTimeResolver(timeZone, dayStartHour);
  const nowLocal = resolveLocalTime(safeNow.getTime());
  const fixedStart = input.period === "all" ? null : nowLocal.dayIndex - PERIOD_DAYS[input.period] + 1;
  const previousStart = fixedStart == null ? null : fixedStart - PERIOD_DAYS[input.period as Exclude<StatisticsPeriod, "all">];
  const scopeDeckIds = deckScope(decks, input.deckIds);
  const scopeIds = new Set(scopeDeckIds);
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const activityByDay = new Map<number, StatisticsSeriesPoint>();
  const addedByDay = new Map<number, number>();
  const heatmapCounts = new Map<string, number>();
  const forecastCounts = new Map<string, number>();
  const ratings = new Map(CATEGORIES.map((key) => [key, { category: key, label: CATEGORY_LABELS[key], again: 0, hard: 0, good: 0, easy: 0, total: 0, successPercent: 0 } satisfies StatisticsRatingPoint]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, reviews: 0, success: 0 }));
  const deckReviews = new Map<string, { reviewCount: number; positive: number; again: number }>();
  const deckCurrent = new Map<string, { intervalTotal: number; intervalCount: number; nextDueAt: string | null }>();
  const selectedRetention = retentionAggregate();
  const previousRetention = retentionAggregate();
  const allRetention = retentionAggregate();
  const retentionByDeck = new Map<string, RetentionAggregate>();
  const status = new Map<string, number>([["new", 0], ["learning", 0], ["relearning", 0], ["young", 0], ["mature", 0]]);
  const intervals = histogram();
  const stability = histogram();
  const difficultyCounts = Array.from({ length: 10 }, () => 0);
  const retrievabilityCounts = Array.from({ length: 20 }, () => 0);
  const dueByDay = new Map<number, CategoryCounts>();
  let earliestDay = nowLocal.dayIndex;
  let reviewCount = 0;
  let successCount = 0;
  let timedCount = 0;
  let totalDurationMs = 0;
  let learningItems = 0;
  let suspendedItems = 0;
  let deletedItems = 0;
  let activeVariants = 0;
  let difficultyEligible = 0;
  let retrievabilityEligible = 0;
  let dailyWorkload = 0;
  let lastRetentionKey = "";

  function addCurrentState(deckId: string, state: ReviewState) {
    activeVariants += 1;
    status.set(category(state), (status.get(category(state)) ?? 0) + 1);
    const interval = Math.max(0, finite(state.intervalDays));
    if (input.period === "all" || interval <= PERIOD_DAYS[input.period]) addHistogram(intervals, interval);
    const difficulty = finite(state.difficulty);
    if (difficulty > 0 && difficulty <= 10) {
      difficultyCounts[Math.min(9, Math.max(0, Math.ceil(difficulty) - 1))] += 1;
      difficultyEligible += 1;
    }
    const stable = finite(state.stability);
    if (stable > 0) addHistogram(stability, stable);
    const retrievability = calculateRetrievability(state, safeNow);
    if (Number.isFinite(retrievability) && retrievability >= 0 && retrievability <= 1) {
      retrievabilityCounts[Math.min(19, Math.floor(retrievability * 20))] += 1;
      retrievabilityEligible += 1;
    }
    const deck = deckCurrent.get(deckId) ?? { intervalTotal: 0, intervalCount: 0, nextDueAt: null };
    deck.intervalTotal += interval;
    deck.intervalCount += 1;
    if (state.dueAt && (deck.nextDueAt == null || state.dueAt < deck.nextDueAt)) deck.nextDueAt = state.dueAt;
    deckCurrent.set(deckId, deck);
    const dueTimestamp = Date.parse(state.dueAt);
    if (Number.isFinite(dueTimestamp)) {
      const dueDay = resolveLocalTime(dueTimestamp).dayIndex;
      const counts = dueByDay.get(dueDay) ?? emptyCategories();
      counts[category(state)] += 1;
      dueByDay.set(dueDay, counts);
      dailyWorkload += 1 / Math.max(1, interval);
    }
  }

  function eventDetails(event: ReviewEvent) {
    const timestamp = Date.parse(String(event.answeredAt || event.createdAt || ""));
    if (!Number.isFinite(timestamp) || event.rating === "manual" || !RATINGS.includes(event.rating)) return null;
    const local = resolveLocalTime(timestamp);
    return { timestamp, local, before: snapshot(event.schedulerBefore), event, rating: event.rating as ReviewRating };
  }

  return {
    scopeDeckIds,
    addReview(event: ReviewEvent) {
      if (!scopeIds.has(event.deckId)) return;
      const details = eventDetails(event);
      if (!details || details.local.dayIndex > nowLocal.dayIndex) return;
      earliestDay = Math.min(earliestDay, details.local.dayIndex);
      const heatmapKey = keyFromDayIndex(details.local.dayIndex);
      heatmapCounts.set(heatmapKey, (heatmapCounts.get(heatmapKey) ?? 0) + 1);
      if (fixedStart != null && details.local.dayIndex < fixedStart) return;
      const eventCategory = category(details.before);
      const point = activityByDay.get(details.local.dayIndex) ?? emptySeriesPoint(heatmapKey, heatmapKey, heatmapKey);
      point[eventCategory] += 1;
      point.total += 1;
      const duration = event.responseTimeMs != null ? Math.min(60_000, Math.max(0, finite(event.responseTimeMs))) : null;
      if (duration != null) {
        point.durationMs += duration;
        point[`duration${eventCategory[0].toUpperCase()}${eventCategory.slice(1)}Ms` as "durationLearningMs"] += duration;
        point.timedCount += 1;
        timedCount += 1;
        totalDurationMs += duration;
      }
      activityByDay.set(details.local.dayIndex, point);
      reviewCount += 1;
      const positive = Number(details.rating !== "again");
      successCount += positive;
      hours[details.local.hour].reviews += 1;
      hours[details.local.hour].success += positive;
      const rating = ratings.get(eventCategory)!;
      rating[details.rating] += 1;
      rating.total += 1;
      const deck = deckReviews.get(event.deckId) ?? { reviewCount: 0, positive: 0, again: 0 };
      deck.reviewCount += 1;
      deck.positive += positive;
      deck.again += Number(details.rating === "again");
      deckReviews.set(event.deckId, deck);
    },
    addRetentionReview(event: ReviewEvent) {
      if (!scopeIds.has(event.deckId)) return;
      const details = eventDetails(event);
      if (!details || details.before.intervalDays < 1 || details.local.dayIndex > nowLocal.dayIndex) return;
      const reviewableId = event.reviewableId || event.variantId || event.learningItemId;
      const key = `${reviewableId}\0${details.local.dayIndex}`;
      if (key === lastRetentionKey) return;
      lastRetentionKey = key;
      addRetention(allRetention, details.before, details.rating);
      if (fixedStart == null || details.local.dayIndex >= fixedStart) {
        addRetention(selectedRetention, details.before, details.rating);
        const deck = retentionByDeck.get(event.deckId) ?? retentionAggregate();
        addRetention(deck, details.before, details.rating);
        retentionByDeck.set(event.deckId, deck);
      } else if (previousStart != null && details.local.dayIndex >= previousStart) {
        addRetention(previousRetention, details.before, details.rating);
      }
    },
    addCard(deckId: string, item: LearningItem) {
      if (!scopeIds.has(deckId)) return;
      learningItems += 1;
      if (item.status === "suspended") suspendedItems += 1;
      if (item.status === "deleted") deletedItems += 1;
      const created = Date.parse(item.createdAt);
      if (Number.isFinite(created)) {
        const createdDay = resolveLocalTime(created).dayIndex;
        earliestDay = Math.min(earliestDay, createdDay);
        addedByDay.set(createdDay, (addedByDay.get(createdDay) ?? 0) + 1);
      }
      const state = item.reviewState;
      if (item.status !== "deleted" && item.status !== "suspended" && item.draftStatus !== "draft" && state) addCurrentState(deckId, state);
      const dueKey = getStudyHeatmapDayKey(state?.dueAt, timeZone, dayStartHour);
      const nowKey = keyFromDayIndex(nowLocal.dayIndex);
      if (dueKey && dueKey > nowKey && dueKey <= shiftDayKey(nowKey, 365) && item.status !== "deleted" && item.draftStatus !== "draft") {
        forecastCounts.set(dueKey, (forecastCounts.get(dueKey) ?? 0) + 1);
      }
    },
    addVariant(_deckId: string, _variant: CardVariant) {},
    finish(): StatisticsProjection {
      const startDay = fixedStart ?? earliestDay;
      const nowKey = keyFromDayIndex(nowLocal.dayIndex);
      const startKey = keyFromDayIndex(startDay);
      const activityBuckets = createBuckets(startDay, nowLocal.dayIndex, input.period);
      for (const [index, raw] of activityByDay) {
        const bucket = bucketFor(activityBuckets, index);
        if (!bucket) continue;
        for (const key of CATEGORIES) bucket.point[key] += raw[key];
        bucket.point.total += raw.total;
        bucket.point.durationMs += raw.durationMs;
        bucket.point.durationLearningMs += raw.durationLearningMs;
        bucket.point.durationRelearningMs += raw.durationRelearningMs;
        bucket.point.durationYoungMs += raw.durationYoungMs;
        bucket.point.durationMatureMs += raw.durationMatureMs;
        bucket.point.timedCount += raw.timedCount;
      }
      const addedCards = activityBuckets.map(({ start, end, point }) => ({ key: point.key, label: point.label, rangeLabel: point.rangeLabel, count: 0, cumulative: 0, start, end }));
      let addedCumulative = 0;
      for (const [index, count] of addedByDay) {
        if (index < startDay) addedCumulative += count;
        else {
          const bucket = addedCards.find((candidate) => index >= candidate.start && index <= candidate.end);
          if (bucket) bucket.count += count;
        }
      }
      const added = addedCards.map(({ start: _start, end: _end, ...point }) => ({ ...point, cumulative: addedCumulative += point.count }));
      const latestDueDay = Math.max(nowLocal.dayIndex, ...dueByDay.keys());
      const futureEnd = input.period === "all" ? latestDueDay : nowLocal.dayIndex + PERIOD_DAYS[input.period] - 1;
      const planningBuckets = createBuckets(nowLocal.dayIndex, futureEnd, input.period);
      let overdue = 0;
      let dueTomorrow = 0;
      for (const [index, counts] of dueByDay) {
        if (index < nowLocal.dayIndex) { overdue += Object.values(counts).reduce((sum, count) => sum + count, 0); continue; }
        if (index === nowLocal.dayIndex + 1) dueTomorrow += Object.values(counts).reduce((sum, count) => sum + count, 0);
        const bucket = bucketFor(planningBuckets, index);
        if (!bucket) continue;
        for (const key of CATEGORIES) bucket.point[key] += counts[key];
        bucket.point.total += Object.values(counts).reduce((sum, count) => sum + count, 0);
      }
      if (overdue && planningBuckets[0]) {
        planningBuckets[0].point.relearning += overdue;
        planningBuckets[0].point.total += overdue;
        planningBuckets[0].point.rangeLabel += " einschließlich Rückstand";
      }
      const planning = finalizeSeries(planningBuckets);
      const studyHeatmap = createStudyHeatmapModelFromCounts({ todayKey: nowKey, countsByDay: heatmapCounts, forecastCountsByDay: forecastCounts });
      let difficultyCumulative = 0;
      const difficulty = difficultyCounts.map((count, index) => ({ key: String(index + 1), label: String(index + 1), count, cumulativePercent: percentage(difficultyCumulative += count, difficultyEligible) }));
      let retrievabilityCumulative = 0;
      const retrievability = retrievabilityCounts.map((count, index) => ({ key: `${index * 5}-${(index + 1) * 5}`, label: `${index * 5}–${(index + 1) * 5} %`, count, cumulativePercent: percentage(retrievabilityCumulative += count, retrievabilityEligible) }));
      const selectedCell = retentionCell(selectedRetention.youngRemembered + selectedRetention.matureRemembered, selectedRetention.youngTotal + selectedRetention.matureTotal);
      const statusLabels: Record<string, string> = { new: "Neu", learning: "Lernen", relearning: "Wiederlernen", young: "Jung", mature: "Reif" };
      const deckRows = scopeDeckIds.map((id) => {
        const review = deckReviews.get(id) ?? { reviewCount: 0, positive: 0, again: 0 };
        const retained = retentionByDeck.get(id) ?? retentionAggregate();
        const current = deckCurrent.get(id) ?? { intervalTotal: 0, intervalCount: 0, nextDueAt: null };
        const definition = deckById.get(id);
        return {
          id,
          name: definition?.name ?? "Unbekannter Stapel",
          path: definition?.hierarchyPath?.join(" / ") || definition?.name || "Unbekannter Stapel",
          reviewCount: review.reviewCount,
          successPercent: percentage(review.positive, review.reviewCount),
          againPercent: percentage(review.again, review.reviewCount),
          trueRetentionPercent: percentage(retained.youngRemembered + retained.matureRemembered, retained.youngTotal + retained.matureTotal),
          averageIntervalDays: current.intervalCount ? Math.round((current.intervalTotal / current.intervalCount) * 10) / 10 : 0,
          nextDueAt: current.nextDueAt,
        };
      }).sort((left, right) => right.reviewCount - left.reviewCount || left.path.localeCompare(right.path, "de"));
      return {
        selection,
        scopeDeckIds,
        scopeLabel: input.deckIds === "all" ? "Gesamte Sammlung" : input.deckIds.length === 1 ? deckById.get(input.deckIds[0])?.name ?? "Ausgewählter Stapel" : `${Math.min(input.deckIds.length, scopeDeckIds.length)} Stapel ausgewählt`,
        dateRangeLabel: formatRangeLabel(startKey, nowKey),
        summary: {
          reviewCount,
          activeDays: [...activityByDay.keys()].filter((day) => day >= startDay && day <= nowLocal.dayIndex).length,
          successPercent: percentage(successCount, reviewCount),
          trueRetentionPercent: selectedCell.percent,
          trueRetentionSample: selectedCell.total,
          totalDurationMs,
          averageResponseMs: timedCount ? Math.round(totalDurationMs / timedCount) : 0,
          timedCount,
          currentStreak: studyHeatmap.currentStreak,
        },
        activity: finalizeSeries(activityBuckets),
        addedCards: added,
        studyHeatmap,
        planning: { points: planning, overdue, dueTomorrow, dueInHorizon: planning.reduce((sum, point) => sum + point.total, 0), dailyWorkload: Math.round(dailyWorkload * 10) / 10 },
        status: { activeVariants, learningItems, suspendedItems, deletedItems, rows: [...status].map(([key, count]) => ({ key, label: statusLabels[key], count, percent: percentage(count, activeVariants) })) },
        intervals: { points: distribution(intervals, input.period === "all" ? Math.max(1, intervals.max) : PERIOD_DAYS[input.period], 60, "Tage"), averageDays: intervals.total ? Math.round((intervals.sum / intervals.total) * 10) / 10 : 0, medianDays: percentile(intervals, 0.5), percentile95Days: percentile(intervals, 0.95) },
        fsrs: { difficulty, stability: distribution(stability, Math.max(1, stability.max), 40, "Tage"), retrievability },
        hourly: hours.map(({ success, ...row }) => ({ ...row, successPercent: percentage(success, row.reviews) })),
        ratings: [...ratings.values()].map((row) => ({ ...row, successPercent: percentage(row.total - row.again, row.total) })),
        retention: [retentionRow("selected", "Gewählter Zeitraum", selectedRetention), ...(input.period === "all" ? [] : [retentionRow("previous", "Vorheriger Zeitraum", previousRetention)]), retentionRow("all", "Gesamter Verlauf", allRetention)],
        deckRows,
      };
    },
  };
}

export function projectStatistics(decks: Deck[], input: StatisticsSelection): StatisticsProjection {
  const accumulator = createStatisticsAccumulator(decks, input);
  const events = decks.flatMap((deck) => deck.reviewEvents ?? []);
  for (const event of events) accumulator.addReview(event);
  for (const event of [...events].sort((left, right) => {
    const leftId = left.reviewableId || left.variantId || left.learningItemId;
    const rightId = right.reviewableId || right.variantId || right.learningItemId;
    return leftId.localeCompare(rightId) || left.answeredAt.localeCompare(right.answeredAt) || left.id.localeCompare(right.id);
  })) accumulator.addRetentionReview(event);
  for (const deck of decks) for (const item of deck.cards ?? []) {
    accumulator.addCard(deck.id, item);
    for (const variant of item.variants ?? []) accumulator.addVariant(deck.id, variant);
  }
  return accumulator.finish();
}

export function mergeAccountStatisticsSnapshot(
  projection: StatisticsProjection,
  snapshotValue: AccountStatisticsSnapshot,
  pendingReviews: ReviewEvent[] = [],
): StatisticsProjection {
  const resolveLocalTime = localTimeResolver(projection.selection.timeZone, projection.selection.dayStartHour);
  const daily = new Map(Object.entries(snapshotValue.reviewsByDay).map(([key, value]) => [key, { ...value }]));
  const lastKey = projection.studyHeatmap.todayKey;
  const historicalKeys = [...new Set([...Object.keys(snapshotValue.reviewsByDay), ...Object.keys(snapshotValue.addedCardsByDay)])].sort();
  const allTimeStartKey = projection.selection.period === "all" ? historicalKeys[0] : null;
  const activityTemplate = allTimeStartKey
    ? createBuckets(dayIndex(allTimeStartKey), dayIndex(lastKey), "all").map(({ point }) => point)
    : projection.activity;
  const firstKey = activityTemplate[0]?.key ?? lastKey;
  for (const event of pendingReviews) {
    if (!projection.scopeDeckIds.includes(event.deckId)) continue;
    const timestamp = Date.parse(String(event.answeredAt || event.createdAt || ""));
    if (!Number.isFinite(timestamp) || event.rating === "manual" || !RATINGS.includes(event.rating)) continue;
    const dayKey = keyFromDayIndex(resolveLocalTime(timestamp).dayIndex);
    if (dayKey < firstKey || dayKey > lastKey) continue;
    const eventCategory = category(snapshot(event.schedulerBefore));
    const row = daily.get(dayKey) ?? {
      total: 0, learning: 0, relearning: 0, young: 0, mature: 0, successful: 0,
      timedCount: 0, durationMs: 0, durationLearningMs: 0, durationRelearningMs: 0,
      durationYoungMs: 0, durationMatureMs: 0,
    };
    row.total += 1;
    row[eventCategory] += 1;
    row.successful += Number(event.rating !== "again");
    if (event.responseTimeMs != null) {
      const duration = Math.min(60_000, Math.max(0, finite(event.responseTimeMs)));
      row.timedCount += 1;
      row.durationMs += duration;
      row[`duration${eventCategory[0].toUpperCase()}${eventCategory.slice(1)}Ms` as "durationLearningMs"] += duration;
    }
    daily.set(dayKey, row);
  }

  const activity = activityTemplate.map((point) => ({ ...emptySeriesPoint(point.key, point.label, point.rangeLabel) }));
  for (const [key, row] of daily) {
    if (key < firstKey || key > lastKey) continue;
    let index = -1;
    for (let candidate = activity.length - 1; candidate >= 0; candidate -= 1) {
      if (activity[candidate].key <= key) { index = candidate; break; }
    }
    if (index < 0) index = 0;
    const point = activity[index];
    if (!point) continue;
    point.learning += row.learning;
    point.relearning += row.relearning;
    point.young += row.young;
    point.mature += row.mature;
    point.total += row.total;
    point.durationMs += row.durationMs;
    point.durationLearningMs += row.durationLearningMs;
    point.durationRelearningMs += row.durationRelearningMs;
    point.durationYoungMs += row.durationYoungMs;
    point.durationMatureMs += row.durationMatureMs;
    point.timedCount += row.timedCount;
  }
  let cumulative = 0;
  const finalizedActivity = activity.map((point) => ({ ...point, cumulative: cumulative += point.total }));
  const selectedDays = [...daily.entries()].filter(([key]) => key >= firstKey && key <= lastKey);
  const reviewCount = selectedDays.reduce((sum, [, row]) => sum + row.total, 0);
  const successful = selectedDays.reduce((sum, [, row]) => sum + row.successful, 0);
  const timedCount = selectedDays.reduce((sum, [, row]) => sum + row.timedCount, 0);
  const totalDurationMs = selectedDays.reduce((sum, [, row]) => sum + row.durationMs, 0);
  const countsByDay = new Map(Object.entries(snapshotValue.heatmapByDay));
  for (const event of pendingReviews) {
    const timestamp = Date.parse(String(event.answeredAt || event.createdAt || ""));
    if (!Number.isFinite(timestamp) || !projection.scopeDeckIds.includes(event.deckId)) continue;
    const key = keyFromDayIndex(resolveLocalTime(timestamp).dayIndex);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }
  const studyHeatmap = createStudyHeatmapModelFromCounts({
    todayKey: projection.studyHeatmap.todayKey,
    countsByDay,
    forecastCountsByDay: new Map(Object.entries(snapshotValue.forecastByDay).map(([key, value]) => [key, value.total])),
  });
  const statusCounts = {
    new: snapshotValue.cards.new,
    learning: snapshotValue.cards.learning,
    mature: snapshotValue.cards.mature,
    young: Math.max(0, snapshotValue.cards.total - snapshotValue.cards.suspended - snapshotValue.cards.new - snapshotValue.cards.learning - snapshotValue.cards.mature),
  };
  const activeCount = Math.max(0, snapshotValue.cards.total - snapshotValue.cards.suspended);
  const statusLabels: Record<string, string> = { new: "Neu", learning: "Lernen", young: "Jung", mature: "Reif" };
  const ratingMap = new Map(snapshotValue.ratings.map((row) => [`${row.category}:${row.rating}`, row.count]));
  const ratings = CATEGORIES.map((key) => {
    const row = { category: key, label: CATEGORY_LABELS[key], again: 0, hard: 0, good: 0, easy: 0, total: 0, successPercent: 0 } satisfies StatisticsRatingPoint;
    for (const rating of RATINGS) row[rating] = ratingMap.get(`${key}:${rating}`) ?? 0;
    row.total = RATINGS.reduce((sum, rating) => sum + row[rating], 0);
    row.successPercent = percentage(row.total - row.again, row.total);
    return row;
  });
  const hourlyMap = new Map(snapshotValue.hourly.map((row) => [row.hour, row]));
  const addedCards = activityTemplate.map((point) => ({ key: point.key, label: point.label, rangeLabel: point.rangeLabel, count: 0, cumulative: 0 }));
  for (const [key, count] of Object.entries(snapshotValue.addedCardsByDay)) {
    const point = [...addedCards].reverse().find((candidate) => candidate.key <= key);
    if (point) point.count += count;
  }
  let addedCumulative = 0;
  for (const point of addedCards) point.cumulative = addedCumulative += point.count;

  const forecastKeys = Object.keys(snapshotValue.forecastByDay).sort();
  const planningTemplate = projection.selection.period === "all" && forecastKeys.length > 0
    ? createBuckets(dayIndex(lastKey), Math.max(dayIndex(lastKey), dayIndex(forecastKeys.at(-1)!)), "all").map(({ point }) => point)
    : projection.planning.points;
  const planningPoints = planningTemplate.map((point) => ({ ...emptySeriesPoint(point.key, point.label, point.rangeLabel) }));
  for (const [key, counts] of Object.entries(snapshotValue.forecastByDay)) {
    const point = [...planningPoints].reverse().find((candidate) => candidate.key <= key);
    if (!point) continue;
    point.learning += counts.learning;
    point.relearning += counts.relearning;
    point.young += counts.young;
    point.mature += counts.mature;
    point.total += counts.total;
  }
  if (snapshotValue.overdue && planningPoints[0]) {
    planningPoints[0].relearning += snapshotValue.overdue;
    planningPoints[0].total += snapshotValue.overdue;
    planningPoints[0].rangeLabel += " einschließlich Rückstand";
  }
  let planningCumulative = 0;
  const planning = planningPoints.map((point) => ({ ...point, cumulative: planningCumulative += point.total }));

  const retention = snapshotValue.retention.map((row): StatisticsRetentionRow => {
    const cell = (remembered: number, total: number): StatisticsRetentionCell => ({ remembered, total, percent: percentage(remembered, total) });
    return {
      key: row.key,
      label: row.key === "selected" ? "Gewählter Zeitraum" : row.key === "previous" ? "Vorheriger Zeitraum" : "Gesamter Verlauf",
      young: cell(row.youngRemembered, row.youngTotal),
      mature: cell(row.matureRemembered, row.matureTotal),
      total: cell(row.youngRemembered + row.matureRemembered, row.youngTotal + row.matureTotal),
    };
  });
  const selectedRetention = retention.find((row) => row.key === "selected")?.total ?? { remembered: 0, total: 0, percent: 0 };

  return {
    ...projection,
    dateRangeLabel: allTimeStartKey ? formatRangeLabel(allTimeStartKey, lastKey) : projection.dateRangeLabel,
    summary: {
      ...projection.summary,
      reviewCount,
      activeDays: selectedDays.filter(([, row]) => row.total > 0).length,
      successPercent: percentage(successful, reviewCount),
      trueRetentionPercent: selectedRetention.percent,
      trueRetentionSample: selectedRetention.total,
      totalDurationMs,
      averageResponseMs: timedCount ? Math.round(totalDurationMs / timedCount) : 0,
      timedCount,
      currentStreak: studyHeatmap.currentStreak,
    },
    activity: finalizedActivity,
    addedCards,
    studyHeatmap,
    planning: {
      points: planning,
      overdue: snapshotValue.overdue,
      dueTomorrow: snapshotValue.dueTomorrow,
      dueInHorizon: planning.reduce((sum, point) => sum + point.total, 0),
      dailyWorkload: snapshotValue.dailyWorkload,
    },
    status: {
      ...projection.status,
      activeVariants: snapshotValue.status.activeVariants,
      learningItems: snapshotValue.cards.total,
      suspendedItems: snapshotValue.cards.suspended,
      deletedItems: snapshotValue.status.deletedItems,
      rows: Object.entries(statusCounts).map(([key, count]) => ({ key, label: statusLabels[key], count, percent: percentage(count, activeCount) })),
    },
    intervals: snapshotValue.intervals,
    fsrs: snapshotValue.fsrs,
    hourly: Array.from({ length: 24 }, (_, hour) => {
      const row = hourlyMap.get(hour);
      return { hour, label: `${String(hour).padStart(2, "0")}:00`, reviews: row?.reviews ?? 0, successPercent: percentage(row?.successful ?? 0, row?.reviews ?? 0) };
    }),
    ratings,
    retention,
    deckRows: projection.deckRows.map((row) => {
      const aggregate = snapshotValue.deckReviews[row.id];
      return aggregate ? {
        ...row,
        reviewCount: aggregate.reviews,
        successPercent: percentage(aggregate.successful, aggregate.reviews),
        againPercent: percentage(aggregate.again, aggregate.reviews),
        trueRetentionPercent: percentage(aggregate.remembered, aggregate.retentionTotal),
        averageIntervalDays: aggregate.intervalCount ? Math.round((aggregate.intervalTotal / aggregate.intervalCount) * 10) / 10 : 0,
        nextDueAt: aggregate.nextDueAt,
      } : { ...row, reviewCount: 0, successPercent: 0, againPercent: 0 };
    }).sort((left, right) => right.reviewCount - left.reviewCount || left.path.localeCompare(right.path, "de")),
  };
}
