import type { LearningItem } from "./coreTypes.ts";
import { isLearningItemReviewBlocked } from "./coreModel.ts";

const DAY_MS = 86_400_000;
export const STUDY_HEATMAP_FORECAST_DAYS = 365;
const HEATMAP_MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const HEATMAP_WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HEATMAP_DAY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

type DateInput = string | number | Date;

export type StudyHeatmapPeriod = "week" | "month" | "year";

export interface StudyHeatmapModel {
  todayKey: string;
  firstActivityKey: string | null;
  countsByDay: ReadonlyMap<string, number>;
  forecastCountsByDay: ReadonlyMap<string, number>;
  forecastEndKey: string;
  currentStreak: number;
}

export interface StudyHeatmapDay {
  key: string;
  dayOfMonth: number;
  count: number;
  level: number;
  forecastCount: number;
  forecastLevel: number;
  isForecastAvailable: boolean;
  isToday: boolean;
  isFuture: boolean;
  isOutsideRange: boolean;
}

export interface StudyHeatmapWindow {
  period: StudyHeatmapPeriod;
  anchorKey: string;
  rangeStartKey: string;
  rangeEndKey: string;
  days: StudyHeatmapDay[];
  weeks: StudyHeatmapDay[][];
  monthLabels: string[];
  weekdayLabels: string[];
  maxCount: number;
  maxForecastCount: number;
  canShowPrevious: boolean;
  canShowNext: boolean;
  previousAnchorKey: string;
  nextAnchorKey: string;
  visibleRangeStartKey: string;
  visibleRangeEndKey: string;
}

function dayIndex(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function keyFromDayIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

function isDayKey(value: unknown): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const key = String(value);
  return keyFromDayIndex(dayIndex(key)) === key;
}

function shiftDayKey(key: string, days: number): string {
  return keyFromDayIndex(dayIndex(key) + days);
}

function startOfWeekKey(key: string): string {
  const utcDay = new Date(`${key}T12:00:00Z`).getUTCDay();
  return shiftDayKey(key, -((utcDay + 6) % 7));
}

function endOfWeekKey(key: string): string {
  return shiftDayKey(startOfWeekKey(key), 6);
}

function startOfMonthKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function endOfMonthKey(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function shiftMonthKey(key: string, months: number): string {
  const year = Number(key.slice(0, 4));
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, monthIndex + months, 1)).toISOString().slice(0, 10);
}

function startOfYearKey(key: string): string {
  return `${key.slice(0, 4)}-01-01`;
}

function endOfYearKey(key: string): string {
  return `${key.slice(0, 4)}-12-31`;
}

function shiftYearKey(key: string, years: number): string {
  return `${String(Number(key.slice(0, 4)) + years).padStart(4, "0")}-01-01`;
}

function heatmapLevel(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function heatmapMonthLabel(day: StudyHeatmapDay, includeYear = false): string {
  const monthLabel = HEATMAP_MONTH_LABELS[Number(day.key.slice(5, 7)) - 1];
  return includeYear ? `${monthLabel} ${day.key.slice(0, 4)}` : monthLabel;
}

function createHeatmapMonthLabels(weeks: StudyHeatmapDay[][]): string[] {
  const labels = weeks.map((week, weekIndex) => {
    const monthStart = week.find((day) => !day.isOutsideRange && day.dayOfMonth === 1);
    if (monthStart) {
      const isJanuary = monthStart.key.slice(5, 7) === "01";
      return heatmapMonthLabel(monthStart, isJanuary);
    }
    if (weekIndex === 0) {
      const firstVisibleDay = week.find((day) => !day.isOutsideRange) ?? week[0];
      return firstVisibleDay ? heatmapMonthLabel(firstVisibleDay) : "";
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

function periodAnchor(period: StudyHeatmapPeriod, key: string): string {
  if (period === "month") return startOfMonthKey(key);
  if (period === "year") return startOfYearKey(key);
  return key;
}

function shiftPeriodAnchor(period: StudyHeatmapPeriod, key: string, amount: number): string {
  if (period === "month") return shiftMonthKey(key, amount);
  if (period === "year") return shiftYearKey(key, amount);
  return shiftDayKey(key, amount * 7);
}

function periodRange(period: StudyHeatmapPeriod, anchorKey: string): { startKey: string; endKey: string } {
  if (period === "month") return { startKey: startOfMonthKey(anchorKey), endKey: endOfMonthKey(anchorKey) };
  if (period === "year") return { startKey: startOfYearKey(anchorKey), endKey: endOfYearKey(anchorKey) };
  return { startKey: shiftDayKey(anchorKey, -6), endKey: anchorKey };
}

function firstPeriodAnchor(period: StudyHeatmapPeriod, firstActivityKey: string, todayKey: string): string {
  if (period !== "week") return periodAnchor(period, firstActivityKey);
  const completedWindows = Math.floor((dayIndex(todayKey) - dayIndex(firstActivityKey)) / 7);
  return shiftDayKey(todayKey, -completedWindows * 7);
}

function lastPeriodAnchor(period: StudyHeatmapPeriod, forecastEndKey: string, todayKey: string): string {
  if (period !== "week") return periodAnchor(period, forecastEndKey);
  const futureWindows = Math.ceil((dayIndex(forecastEndKey) - dayIndex(todayKey)) / 7);
  return shiftDayKey(todayKey, futureWindows * 7);
}

function normalizePeriodAnchor(
  heatmap: StudyHeatmapModel,
  period: StudyHeatmapPeriod,
  requestedAnchor: unknown,
): string {
  const currentAnchor = periodAnchor(period, heatmap.todayKey);
  const forecastAnchor = lastPeriodAnchor(period, heatmap.forecastEndKey, heatmap.todayKey);

  const requestedKey = isDayKey(requestedAnchor) ? requestedAnchor : currentAnchor;
  let anchorKey = periodAnchor(period, requestedKey);
  if (anchorKey > forecastAnchor) anchorKey = forecastAnchor;
  if (anchorKey < currentAnchor && !heatmap.firstActivityKey) return currentAnchor;
  if (anchorKey < currentAnchor && heatmap.firstActivityKey && periodRange(period, anchorKey).endKey < heatmap.firstActivityKey) {
    anchorKey = firstPeriodAnchor(period, heatmap.firstActivityKey, heatmap.todayKey);
  }
  return anchorKey;
}

function calculateCurrentStreak(countsByDay: ReadonlyMap<string, number>, todayKey: string): number {
  let cursor = (countsByDay.get(todayKey) ?? 0) > 0 ? todayKey : shiftDayKey(todayKey, -1);
  let streak = 0;
  while ((countsByDay.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

export function getStudyHeatmapDayKey(value: DateInput | null | undefined, timeZone?: string): string | null {
  const date = new Date(value ?? Number.NaN);
  if (Number.isNaN(date.getTime())) return null;

  const formatterKey = timeZone || "";
  let formatter = HEATMAP_DAY_FORMATTERS.get(formatterKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone || undefined,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      formatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    HEATMAP_DAY_FORMATTERS.set(formatterKey, formatter);
  }
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

export function createStudyHeatmapForecastCounts(
  items: Iterable<LearningItem>,
  { todayKey, timeZone }: { todayKey: string; timeZone?: string },
): Map<string, number> {
  const forecastEndKey = shiftDayKey(todayKey, STUDY_HEATMAP_FORECAST_DAYS);
  const countsByDay = new Map<string, number>();

  for (const item of items) {
    if (
      item.deletedAt
      || item.draftStatus === "draft"
      || item.status === "deleted"
      || isLearningItemReviewBlocked(item)
    ) continue;

    const dueAt = (item.learningItemState ?? item.reviewState)?.dueAt;
    const dueKey = getStudyHeatmapDayKey(dueAt, timeZone);
    if (!dueKey || dueKey <= todayKey || dueKey > forecastEndKey) continue;
    countsByDay.set(dueKey, (countsByDay.get(dueKey) ?? 0) + 1);
  }

  return countsByDay;
}

export function createStudyHeatmapModelFromCounts({
  todayKey,
  countsByDay,
  forecastCountsByDay = new Map(),
}: {
  todayKey: string;
  countsByDay: ReadonlyMap<string, number>;
  forecastCountsByDay?: ReadonlyMap<string, number>;
}): StudyHeatmapModel {
  const safeTodayKey = isDayKey(todayKey) ? todayKey : getStudyHeatmapDayKey(new Date(), "UTC") as string;
  const forecastEndKey = shiftDayKey(safeTodayKey, STUDY_HEATMAP_FORECAST_DAYS);
  const normalizedCounts = new Map<string, number>();
  const normalizedForecastCounts = new Map<string, number>();
  let firstActivityKey: string | null = null;

  for (const [key, rawCount] of countsByDay) {
    const count = Math.max(0, Math.round(Number(rawCount) || 0));
    if (!isDayKey(key) || key > safeTodayKey || count === 0) continue;
    normalizedCounts.set(key, count);
    if (firstActivityKey == null || key < firstActivityKey) firstActivityKey = key;
  }

  for (const [key, rawCount] of forecastCountsByDay) {
    const count = Math.max(0, Math.round(Number(rawCount) || 0));
    if (!isDayKey(key) || key <= safeTodayKey || key > forecastEndKey || count === 0) continue;
    normalizedForecastCounts.set(key, count);
  }

  return {
    todayKey: safeTodayKey,
    firstActivityKey,
    countsByDay: normalizedCounts,
    forecastCountsByDay: normalizedForecastCounts,
    forecastEndKey,
    currentStreak: calculateCurrentStreak(normalizedCounts, safeTodayKey),
  };
}

export function createStudyHeatmapWindow(
  heatmap: StudyHeatmapModel,
  options: { period?: StudyHeatmapPeriod; anchorKey?: string | null } = {},
): StudyHeatmapWindow {
  const period = options.period ?? "week";
  const anchorKey = normalizePeriodAnchor(heatmap, period, options.anchorKey);
  const { startKey: rangeStartKey, endKey: rangeEndKey } = periodRange(period, anchorKey);
  const paddedStartKey = period === "week" ? rangeStartKey : startOfWeekKey(rangeStartKey);
  const paddedEndKey = period === "week" ? rangeEndKey : endOfWeekKey(rangeEndKey);
  const rawDays = Array.from(
    { length: dayIndex(paddedEndKey) - dayIndex(paddedStartKey) + 1 },
    (_, offset) => {
      const key = shiftDayKey(paddedStartKey, offset);
      const isOutsideRange = key < rangeStartKey || key > rangeEndKey;
      const isFuture = key > heatmap.todayKey;
      const count = isOutsideRange || isFuture ? 0 : heatmap.countsByDay.get(key) ?? 0;
      const isForecastAvailable = !isOutsideRange && isFuture && key <= heatmap.forecastEndKey;
      const forecastCount = isForecastAvailable ? heatmap.forecastCountsByDay.get(key) ?? 0 : 0;
      return { key, dayOfMonth: Number(key.slice(8, 10)), count, forecastCount, isForecastAvailable, isOutsideRange, isFuture };
    },
  );
  const maxCount = rawDays.reduce((maximum, day) => Math.max(maximum, day.count), 0);
  const maxForecastCount = rawDays.reduce((maximum, day) => Math.max(maximum, day.forecastCount), 0);
  const days = rawDays.map((day): StudyHeatmapDay => ({
    ...day,
    level: heatmapLevel(day.count, maxCount),
    forecastLevel: heatmapLevel(day.forecastCount, maxForecastCount),
    isToday: day.key === heatmap.todayKey,
  }));
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const previousAnchorKey = shiftPeriodAnchor(period, anchorKey, -1);
  const nextCandidate = shiftPeriodAnchor(period, anchorKey, 1);
  const currentAnchor = periodAnchor(period, heatmap.todayKey);
  const forecastAnchor = lastPeriodAnchor(period, heatmap.forecastEndKey, heatmap.todayKey);
  const nextAnchorKey = nextCandidate > forecastAnchor ? forecastAnchor : nextCandidate;
  const previousRange = periodRange(period, previousAnchorKey);

  return {
    period,
    anchorKey,
    rangeStartKey,
    rangeEndKey,
    days,
    weeks,
    monthLabels: createHeatmapMonthLabels(weeks),
    weekdayLabels: [...HEATMAP_WEEKDAY_LABELS],
    maxCount,
    maxForecastCount,
    canShowPrevious: anchorKey > currentAnchor || (heatmap.firstActivityKey != null && previousRange.endKey >= heatmap.firstActivityKey),
    canShowNext: anchorKey < forecastAnchor,
    previousAnchorKey,
    nextAnchorKey,
    visibleRangeStartKey: rangeStartKey,
    visibleRangeEndKey: rangeEndKey,
  };
}
