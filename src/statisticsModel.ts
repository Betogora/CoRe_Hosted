import type { CardVariant, Deck, LearningItem, ReviewEvent, ReviewRating, ReviewState } from "./coreTypes.ts";
import { learningDayIndexFromLocalTime, normalizeDayStartHour } from "./learningDay.ts";
import { calculateRetrievability } from "./scheduler.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey, type StudyHeatmapModel } from "./studyHeatmapModel.ts";

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
  const difficult = new Map<string, { deckId: string; itemId: string; title: string; reviewCount: number; weakCount: number; lastReviewedAt: string }>();
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
    if (!Number.isFinite(timestamp) || !RATINGS.includes(event.rating)) return null;
    const local = resolveLocalTime(timestamp);
    return { timestamp, local, before: snapshot(event.schedulerBefore), event };
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
      const positive = Number(event.rating !== "again");
      successCount += positive;
      hours[details.local.hour].reviews += 1;
      hours[details.local.hour].success += positive;
      const rating = ratings.get(eventCategory)!;
      rating[event.rating] += 1;
      rating.total += 1;
      const deck = deckReviews.get(event.deckId) ?? { reviewCount: 0, positive: 0, again: 0 };
      deck.reviewCount += 1;
      deck.positive += positive;
      deck.again += Number(event.rating === "again");
      deckReviews.set(event.deckId, deck);
      const difficultItem = difficult.get(event.learningItemId) ?? { deckId: event.deckId, itemId: event.learningItemId, title: "", reviewCount: 0, weakCount: 0, lastReviewedAt: event.answeredAt };
      difficultItem.reviewCount += 1;
      difficultItem.weakCount += Number(event.rating === "again" || event.rating === "hard");
      if (event.answeredAt > difficultItem.lastReviewedAt) difficultItem.lastReviewedAt = event.answeredAt;
      difficult.set(event.learningItemId, difficultItem);
    },
    addRetentionReview(event: ReviewEvent) {
      if (!scopeIds.has(event.deckId)) return;
      const details = eventDetails(event);
      if (!details || details.before.intervalDays < 1 || details.local.dayIndex > nowLocal.dayIndex) return;
      const reviewableId = event.reviewableId || event.variantId || event.learningItemId;
      const key = `${reviewableId}\0${details.local.dayIndex}`;
      if (key === lastRetentionKey) return;
      lastRetentionKey = key;
      addRetention(allRetention, details.before, event.rating);
      if (fixedStart == null || details.local.dayIndex >= fixedStart) {
        addRetention(selectedRetention, details.before, event.rating);
        const deck = retentionByDeck.get(event.deckId) ?? retentionAggregate();
        addRetention(deck, details.before, event.rating);
        retentionByDeck.set(event.deckId, deck);
      } else if (previousStart != null && details.local.dayIndex >= previousStart) {
        addRetention(previousRetention, details.before, event.rating);
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
      const difficultItem = difficult.get(item.id);
      if (difficultItem) difficultItem.title = String(item.title || item.canonicalQuestion || item.originalFront || "Unbenannte Karte").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      const state = item.learningItemState ?? item.reviewState;
      if (item.status !== "deleted" && item.status !== "suspended" && item.draftStatus !== "draft" && state) addCurrentState(deckId, state);
      const dueKey = getStudyHeatmapDayKey(state?.dueAt, timeZone, dayStartHour);
      const nowKey = keyFromDayIndex(nowLocal.dayIndex);
      if (dueKey && dueKey > nowKey && dueKey <= shiftDayKey(nowKey, 365) && item.status !== "deleted" && item.draftStatus !== "draft") {
        forecastCounts.set(dueKey, (forecastCounts.get(dueKey) ?? 0) + 1);
      }
    },
    addVariant(deckId: string, variant: CardVariant) {
      if (!scopeIds.has(deckId) || variant.isOriginal || variant.isActive === false || variant.deletedAt || variant.qualityStatus === "disabled") return;
      const state = variant.reviewState;
      if (!state) return;
      addCurrentState(deckId, state);
    },
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
      const difficultCards = [...difficult.values()]
        .filter((item) => item.reviewCount >= 3)
        .map((item) => ({
          deckId: item.deckId,
          deckName: deckById.get(item.deckId)?.name ?? "Unbekannter Stapel",
          learningItemId: item.itemId,
          title: item.title || "Unbenannte Karte",
          reviewCount: item.reviewCount,
          weakCount: item.weakCount,
          weakPercent: percentage(item.weakCount, item.reviewCount),
          lastReviewedAt: item.lastReviewedAt,
        }))
        .sort((left, right) => right.weakPercent - left.weakPercent || right.reviewCount - left.reviewCount || right.lastReviewedAt.localeCompare(left.lastReviewedAt))
        .slice(0, 12);
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
        difficultCards,
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
