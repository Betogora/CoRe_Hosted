export const SIMULATION_MINUTES_PER_DAY = 24 * 60;
export const MAX_SIMULATION_OFFSET_MINUTES = 3650 * SIMULATION_MINUTES_PER_DAY;

type DateInput = string | number | Date;

const simulationDateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const simulationTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

function validDate(value: DateInput = new Date()): Date {
  const candidate = new Date(value);
  return Number.isFinite(candidate.getTime()) ? candidate : new Date();
}

function localCalendarStamp(value: DateInput): number {
  const date = validDate(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function normalizeSimulationOffsetMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_SIMULATION_OFFSET_MINUTES, Math.max(0, Math.round(parsed)));
}

export function getSimulatedNow(realNow: DateInput = new Date(), offsetMinutes: unknown = 0): string {
  const date = validDate(realNow);
  const normalizedOffset = normalizeSimulationOffsetMinutes(offsetMinutes);
  const dayOffset = Math.floor(normalizedOffset / SIMULATION_MINUTES_PER_DAY);
  const remainingMinutes = normalizedOffset % SIMULATION_MINUTES_PER_DAY;
  date.setDate(date.getDate() + dayOffset);
  date.setMinutes(date.getMinutes() + remainingMinutes);
  return date.toISOString();
}

export function getLocalDateInputValue(value: DateInput = new Date()): string {
  const date = validDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSimulationOffsetMinutesForDate(realNow: DateInput, value: unknown): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const selected = new Date(year, month, day);
  if (selected.getFullYear() !== year || selected.getMonth() !== month || selected.getDate() !== day) return 0;
  const difference = localCalendarStamp(selected) - localCalendarStamp(realNow);
  return normalizeSimulationOffsetMinutes(Math.round(difference / 86_400_000) * SIMULATION_MINUTES_PER_DAY);
}

export function formatSimulationDate(value: DateInput): string {
  return simulationDateFormatter.format(validDate(value));
}

export function formatSimulationTime(value: DateInput): string {
  return simulationTimeFormatter.format(validDate(value));
}

export function formatSimulationDuration(offsetMinutes: unknown): string {
  const normalizedOffset = normalizeSimulationOffsetMinutes(offsetMinutes);
  const days = Math.floor(normalizedOffset / SIMULATION_MINUTES_PER_DAY);
  const hours = Math.floor((normalizedOffset % SIMULATION_MINUTES_PER_DAY) / 60);
  const minutes = normalizedOffset % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} ${days === 1 ? "Tag" : "Tage"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "Stunde" : "Stunden"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`);

  return parts.join(" ") || "0 Minuten";
}
