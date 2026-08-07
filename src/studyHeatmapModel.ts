const DAY_MS = 86_400_000;
const DEFAULT_HEATMAP_WEEK_COUNT = 53;
const MIN_HEATMAP_WINDOW_WEEKS = 4;
const HEATMAP_WEEKDAY_LABEL_WIDTH = 36;
const HEATMAP_CELL_SIZE = 19;
const HEATMAP_COLUMN_GAP = 4;
const HEATMAP_NAVIGATION_STEP_WEEKS = 4;
const HEATMAP_MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export interface StudyHeatmapModel {
  rangeStartKey: string;
  rangeEndKey: string;
  todayKey: string;
  countsByDay: ReadonlyMap<string, number>;
  maxCount: number;
  firstWeekStartKey: string;
  totalWeekCount: number;
  defaultEndWeekIndex: number;
}

export interface StudyHeatmapDay {
  key: string;
  dayOfMonth: number;
  count: number;
  level: number;
  isToday: boolean;
  isFuture: boolean;
  isOutsideRange: boolean;
}

export interface StudyHeatmapWindow {
  days: StudyHeatmapDay[];
  weeks: StudyHeatmapDay[][];
  monthLabels: string[];
  weekdayLabels: string[];
  visibleWeekCount: number;
  startWeekIndex: number;
  endWeekIndex: number;
  canShowPrevious: boolean;
  canShowNext: boolean;
  previousEndWeekIndex: number;
  nextEndWeekIndex: number;
  visibleRangeStartKey: string;
  visibleRangeEndKey: string;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function startOfWeekKey(key: string): string {
  const utcDay = new Date(`${key}T12:00:00Z`).getUTCDay();
  return shiftDayKey(key, -((utcDay + 6) % 7));
}

function endOfWeekKey(key: string): string {
  return shiftDayKey(startOfWeekKey(key), 6);
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

export function createStudyHeatmapModelFromCounts({
  rangeStartKey,
  rangeEndKey,
  todayKey,
  countsByDay,
}: {
  rangeStartKey: string;
  rangeEndKey: string;
  todayKey: string;
  countsByDay: ReadonlyMap<string, number>;
}): StudyHeatmapModel {
  const firstWeekStartKey = startOfWeekKey(rangeStartKey);
  const lastWeekEndKey = endOfWeekKey(rangeEndKey);
  const totalWeekCount = Math.max(1, Math.round((dayIndex(lastWeekEndKey) - dayIndex(firstWeekStartKey) + 1) / 7));
  const todayWeekIndex = Math.floor((dayIndex(todayKey) - dayIndex(firstWeekStartKey)) / 7);
  const defaultEndWeekIndex = todayKey < rangeStartKey
    ? Math.min(MIN_HEATMAP_WINDOW_WEEKS, totalWeekCount)
    : todayKey <= rangeEndKey
      ? clampNumber(todayWeekIndex + 1, 1, totalWeekCount)
      : totalWeekCount;
  let maxCount = 0;
  for (const [key, count] of countsByDay) {
    if (key >= rangeStartKey && key <= rangeEndKey && key <= todayKey) maxCount = Math.max(maxCount, count);
  }

  return {
    rangeStartKey,
    rangeEndKey,
    todayKey,
    countsByDay,
    maxCount,
    firstWeekStartKey,
    totalWeekCount,
    defaultEndWeekIndex,
  };
}

export function getStudyHeatmapVisibleWeekCount(viewportWidth: unknown, totalWeeks = DEFAULT_HEATMAP_WEEK_COUNT): number {
  const normalizedTotalWeeks = Math.max(1, Math.round(Number(totalWeeks) || DEFAULT_HEATMAP_WEEK_COUNT));
  const measuredWidth = Number(viewportWidth);
  if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) return normalizedTotalWeeks;

  const usableWidth = Math.max(0, measuredWidth - HEATMAP_WEEKDAY_LABEL_WIDTH);
  const weeksThatFit = Math.floor(usableWidth / (HEATMAP_CELL_SIZE + HEATMAP_COLUMN_GAP));
  return clampNumber(weeksThatFit, Math.min(MIN_HEATMAP_WINDOW_WEEKS, normalizedTotalWeeks), normalizedTotalWeeks);
}

export function createStudyHeatmapWindow(
  heatmap: StudyHeatmapModel,
  options: { viewportWidth?: number | null; endWeekIndex?: number | null } = {},
): StudyHeatmapWindow {
  const visibleWeekCount = getStudyHeatmapVisibleWeekCount(options.viewportWidth, heatmap.totalWeekCount);
  const requestedEndWeekIndex = options.endWeekIndex == null ? heatmap.defaultEndWeekIndex : Math.round(options.endWeekIndex);
  const endWeekIndex = clampNumber(requestedEndWeekIndex, visibleWeekCount, heatmap.totalWeekCount);
  const startWeekIndex = endWeekIndex - visibleWeekCount;
  const firstVisibleDayIndex = dayIndex(heatmap.firstWeekStartKey) + startWeekIndex * 7;
  const days = Array.from({ length: visibleWeekCount * 7 }, (_, offset): StudyHeatmapDay => {
    const key = keyFromDayIndex(firstVisibleDayIndex + offset);
    const isOutsideRange = key < heatmap.rangeStartKey || key > heatmap.rangeEndKey;
    const isFuture = key > heatmap.todayKey;
    const count = isOutsideRange || isFuture ? 0 : heatmap.countsByDay.get(key) ?? 0;
    return {
      key,
      dayOfMonth: Number(key.slice(8, 10)),
      count,
      level: heatmapLevel(count, heatmap.maxCount),
      isToday: key === heatmap.todayKey,
      isFuture,
      isOutsideRange,
    };
  });
  const weeks = Array.from({ length: visibleWeekCount }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const visibleRangeDays = days.filter((day) => !day.isOutsideRange);
  const navigationStep = Math.min(visibleWeekCount, HEATMAP_NAVIGATION_STEP_WEEKS);

  return {
    days,
    weeks,
    monthLabels: createHeatmapMonthLabels(weeks),
    weekdayLabels: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    visibleWeekCount,
    startWeekIndex,
    endWeekIndex,
    canShowPrevious: startWeekIndex > 0,
    canShowNext: endWeekIndex < heatmap.totalWeekCount,
    previousEndWeekIndex: Math.max(visibleWeekCount, endWeekIndex - navigationStep),
    nextEndWeekIndex: Math.min(heatmap.totalWeekCount, endWeekIndex + navigationStep),
    visibleRangeStartKey: visibleRangeDays[0]?.key ?? heatmap.rangeStartKey,
    visibleRangeEndKey: visibleRangeDays.at(-1)?.key ?? heatmap.rangeEndKey,
  };
}
