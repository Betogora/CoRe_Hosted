export const MAX_SIMULATION_DAY_OFFSET = 3650;

type DateInput = string | number | Date;

const simulationDateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function validDate(value: DateInput = new Date()): Date {
  const candidate = new Date(value);
  return Number.isFinite(candidate.getTime()) ? candidate : new Date();
}

function localCalendarStamp(value: DateInput): number {
  const date = validDate(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function normalizeSimulationDayOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_SIMULATION_DAY_OFFSET, Math.max(0, Math.round(parsed)));
}

export function getSimulatedNow(realNow: DateInput = new Date(), dayOffset: unknown = 0): string {
  const date = validDate(realNow);
  date.setDate(date.getDate() + normalizeSimulationDayOffset(dayOffset));
  return date.toISOString();
}

export function getLocalDateInputValue(value: DateInput = new Date()): string {
  const date = validDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSimulationDayOffsetForDate(realNow: DateInput, value: unknown): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const selected = new Date(year, month, day);
  if (selected.getFullYear() !== year || selected.getMonth() !== month || selected.getDate() !== day) return 0;
  const difference = localCalendarStamp(selected) - localCalendarStamp(realNow);
  return normalizeSimulationDayOffset(Math.round(difference / 86_400_000));
}

export function formatSimulationDate(value: DateInput): string {
  return simulationDateFormatter.format(validDate(value));
}
