const LONG_DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });

export function examColor(index: number) {
  return `var(--core-exam-color-${index + 1})`;
}

export function formatExamDate(key: string, format: "long" | "short" = "long") {
  return (format === "long" ? LONG_DATE : SHORT_DATE).format(new Date(`${key}T12:00:00Z`));
}
export function formatExamMinutes(minutes: number) {
  return minutes >= 90 ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(minutes / 60)} Std.` : `${Math.ceil(minutes)} Min.`;
}
export function formatExamClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function formatExamPercent(value: number | null) {
  return value === null ? "–" : `${Math.round(value * 100)} %`;
}

