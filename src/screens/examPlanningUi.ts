import { colorContrast } from "../ui/colorMath.ts";

const LONG_DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });

export function examColor(index: number, exam?: { colorIndex?: number; color?: string }) {
  return exam?.color ?? `var(--core-exam-color-${(exam?.colorIndex ?? index) + 1})`;
}

export function examTextColor(exam: { color?: string }) {
  if (!exam.color) return "var(--core-exam-on-color)";
  return colorContrast(exam.color, "#000000") >= 4.5 ? "#000000" : "#ffffff";
}

export function formatExamDate(key: string, format: "long" | "short" = "long") {
  return (format === "long" ? LONG_DATE : SHORT_DATE).format(new Date(`${key}T12:00:00Z`));
}
/** Whole hours and minutes, never decimal hours. */
export function formatExamMinutes(minutes: number) {
  const total = Math.ceil(minutes), hours = Math.floor(total / 60), rest = total % 60;
  return hours ? `${hours} Std.${rest ? ` ${rest} Min.` : ""}` : `${rest} Min.`;
}
export function formatExamCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
export function formatExamDistance(days: number) {
  return days <= 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;
}
export function formatExamClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function formatExamPercent(value: number | null) {
  return value === null ? "–" : `${Math.round(value * 100)} %`;
}

