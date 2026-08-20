export const DEFAULT_DAY_START_HOUR = 0;
export const MAX_DAY_START_HOUR = 23;

type DateInput = string | number | Date;

export interface LearningDayOptions {
  dayStartHour?: unknown;
  timeZone?: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_BOUNDARY_SEARCH_MINUTES = 27 * 60;

export function normalizeDayStartHour(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAY_START_HOUR;
  return Math.min(MAX_DAY_START_HOUR, Math.max(DEFAULT_DAY_START_HOUR, Math.round(parsed)));
}

function formatterForTimeZone(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
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
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  dayIndex: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

function localDayParts(value: DateInput, timeZone?: string): LocalDateTimeParts | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const formatter = timeZone ? formatterForTimeZone(timeZone) : null;
  if (!formatter) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      dayIndex: Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
    };
  }

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  return {
    year,
    month,
    day,
    dayIndex: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
    hour,
    minute,
    second,
    millisecond: date.getUTCMilliseconds(),
  };
}

export function learningDayIndexFromLocalTime(dayIndex: number, hour: number, dayStartHour: unknown = DEFAULT_DAY_START_HOUR): number {
  return dayIndex - (hour < normalizeDayStartHour(dayStartHour) ? 1 : 0);
}

export function getLearningDayIndex(value: DateInput, options: LearningDayOptions = {}): number | null {
  const local = localDayParts(value, options.timeZone);
  return local ? learningDayIndexFromLocalTime(local.dayIndex, local.hour, options.dayStartHour) : null;
}

export function getLearningDayKey(value: DateInput, options: LearningDayOptions = {}): string | null {
  const dayIndex = getLearningDayIndex(value, options);
  return dayIndex == null ? null : new Date(dayIndex * 86_400_000).toISOString().slice(0, 10);
}

function learningDayBoundary(dayIndex: number, options: LearningDayOptions): number {
  let lower = dayIndex * DAY_MS - 2 * DAY_MS;
  let upper = dayIndex * DAY_MS + 2 * DAY_MS;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    const middleDayIndex = getLearningDayIndex(middle, options);
    if (middleDayIndex != null && middleDayIndex >= dayIndex) upper = middle;
    else lower = middle + 1;
  }
  return lower;
}

export function getLearningDayRange(value: DateInput, options: LearningDayOptions = {}): { start: number; end: number } | null {
  const dayIndex = getLearningDayIndex(value, options);
  if (dayIndex == null) return null;
  return {
    start: learningDayBoundary(dayIndex, options),
    end: learningDayBoundary(dayIndex + 1, options),
  };
}

export function getLearningDayStartForKey(dayKey: string, options: LearningDayOptions = {}): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dayIndex = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const normalized = new Date(dayIndex * DAY_MS);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() + 1 !== month
    || normalized.getUTCDate() !== day
  ) return null;
  return new Date(learningDayBoundary(dayIndex, options));
}

function zonedDateTimeToUtc(parts: LocalDateTimeParts, timeZone: string): Date {
  const desiredWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  let candidateTime = desiredWallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localDayParts(candidateTime, timeZone);
    if (!actual) break;
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, actual.millisecond);
    const correction = desiredWallTime - actualWallTime;
    candidateTime += correction;
    if (correction === 0) break;
  }
  return new Date(candidateTime);
}

export function addLearningDays(value: DateInput, days: number, options: LearningDayOptions = {}): Date | null {
  const date = new Date(value);
  const local = localDayParts(date, options.timeZone);
  const currentIndex = getLearningDayIndex(date, options);
  if (!local || currentIndex == null || !Number.isFinite(days)) return null;

  const wholeDays = Math.round(days);
  const shiftedDate = new Date(Date.UTC(local.year, local.month - 1, local.day + wholeDays));
  const shiftedParts: LocalDateTimeParts = {
    ...local,
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
    dayIndex: Math.floor(Date.UTC(shiftedDate.getUTCFullYear(), shiftedDate.getUTCMonth(), shiftedDate.getUTCDate()) / DAY_MS),
  };
  let candidate = options.timeZone
    ? zonedDateTimeToUtc(shiftedParts, options.timeZone)
    : new Date(local.year, local.month - 1, local.day + wholeDays, local.hour, local.minute, local.second, local.millisecond);
  const targetIndex = currentIndex + wholeDays;
  if (getLearningDayIndex(candidate, options) === targetIndex) return candidate;

  const approximate = candidate.getTime();
  for (let offset = 1; offset <= 27; offset += 1) {
    for (const direction of [-1, 1]) {
      const adjusted = new Date(approximate + direction * offset * HOUR_MS);
      if (getLearningDayIndex(adjusted, options) === targetIndex) return adjusted;
    }
  }
  return null;
}

export function getNextLearningDayBoundaryDelay(value: DateInput, options: LearningDayOptions = {}): number | null {
  const date = new Date(value);
  const currentKey = getLearningDayKey(date, options);
  if (!Number.isFinite(date.getTime()) || !currentKey) return null;

  const firstMinute = Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  for (let offset = 0; offset <= MAX_BOUNDARY_SEARCH_MINUTES; offset += 1) {
    const candidate = firstMinute + offset * MINUTE_MS;
    if (getLearningDayKey(candidate, options) !== currentKey) return Math.max(0, candidate - date.getTime());
  }
  return null;
}
