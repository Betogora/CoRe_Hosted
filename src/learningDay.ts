export const DEFAULT_DAY_START_HOUR = 0;
export const MAX_DAY_START_HOUR = 23;

type DateInput = string | number | Date;

export interface LearningDayOptions {
  dayStartHour?: unknown;
  timeZone?: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const MINUTE_MS = 60_000;
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
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

function localDayParts(value: DateInput, timeZone?: string): { dayIndex: number; hour: number } | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const formatter = timeZone ? formatterForTimeZone(timeZone) : null;
  if (!formatter) {
    return {
      dayIndex: Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000),
      hour: date.getHours(),
    };
  }

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  if (![year, month, day, hour].every(Number.isFinite)) return null;
  return {
    dayIndex: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
    hour,
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
