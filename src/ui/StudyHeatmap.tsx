import React from "react";
import { ChevronLeft, ChevronRight, Flame, X } from "lucide-react";
import {
  createStudyHeatmapWindow,
  type StudyHeatmapDay,
  type StudyHeatmapModel,
  type StudyHeatmapPeriod,
  type StudyHeatmapWindow,
} from "../studyHeatmapModel.ts";
import { SoftPanel } from "./coreUi.tsx";
import { CoreSelect } from "./selectUi.tsx";
import { colorContrast, normalizeColor } from "../colorMath.ts";
import { shiftDayKey } from "../learningDay.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

const heatmapToneByLevel = [
  "core-heatmap-level-0",
  "core-heatmap-level-1",
  "core-heatmap-level-2",
  "core-heatmap-level-3",
  "core-heatmap-level-4",
];
const forecastToneByLevel = [
  "core-heatmap-forecast-level-0",
  "core-heatmap-forecast-level-1",
  "core-heatmap-forecast-level-2",
  "core-heatmap-forecast-level-3",
  "core-heatmap-forecast-level-4",
];
export const HEATMAP_HISTORY_COLOR_STORAGE_KEY = "core.studyHeatmap.historyColor.v2";
export const HEATMAP_HISTORY_DEFAULT_COLOR = "#b95e00";
const PERIOD_OPTIONS: Array<{ value: StudyHeatmapPeriod; label: string }> = [
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
];
const PERIOD_NAVIGATION_LABELS: Record<StudyHeatmapPeriod, { previous: string; next: string }> = {
  week: { previous: "Frühere sieben Tage anzeigen", next: "Spätere sieben Tage anzeigen" },
  month: { previous: "Vorherigen Monat anzeigen", next: "Nächsten Monat anzeigen" },
  year: { previous: "Vorheriges Jahr anzeigen", next: "Nächstes Jahr anzeigen" },
};
const UTC_WEEKDAY_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const UTC_MONTH_FORMATTER = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function normalizeHeatmapHistoryColor(value: unknown) {
  return normalizeColor(value, HEATMAP_HISTORY_DEFAULT_COLOR);
}

function readStoredHeatmapColor() {
  if (typeof window === "undefined") return HEATMAP_HISTORY_DEFAULT_COLOR;
  try {
    return normalizeHeatmapHistoryColor(window.localStorage.getItem(HEATMAP_HISTORY_COLOR_STORAGE_KEY));
  } catch {
    return HEATMAP_HISTORY_DEFAULT_COLOR;
  }
}

function writeStoredHeatmapColor(color: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HEATMAP_HISTORY_COLOR_STORAGE_KEY, color);
  } catch {
    // Die Heatmap bleibt auch ohne browserlokale Farbpersistenz bedienbar.
  }
}

function createHeatmapColorStyle(color: string) {
  return {
    "--core-heatmap-history-level-1": `color-mix(in srgb, var(--core-surface) 84%, ${color})`,
    "--core-heatmap-history-level-2": `color-mix(in srgb, var(--core-surface) 65%, ${color})`,
    "--core-heatmap-history-level-3": `color-mix(in srgb, var(--core-surface) 38%, ${color})`,
    "--core-heatmap-history-level-4": color,
    "--core-heatmap-on-strong": colorContrast(color, "#ffffff") >= colorContrast(color, "#111827") ? "#ffffff" : "#111827",
  } as React.CSSProperties;
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00Z`);
}

function compactDate(key: string) {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.`;
}

function longDate(key: string) {
  return `${compactDate(key)}${key.slice(0, 4)}`;
}

function forecastDayLabel(day: StudyHeatmapDay) {
  const date = longDate(day.key);
  if (!day.isForecastAvailable) return `${date}: außerhalb der 365-Tage-Prognose`;
  if (day.forecastCount === 0) return `${date}: voraussichtlich keine Karten fällig`;
  if (day.forecastCount === 1) return `${date}: voraussichtlich 1 Karte fällig`;
  return `${date}: voraussichtlich ${day.forecastCount.toLocaleString("de-DE")} Karten fällig`;
}

function heatmapDayLabel(day: StudyHeatmapDay, formatHistoricalDayLabel: (day: StudyHeatmapDay) => string) {
  return day.isFuture ? forecastDayLabel(day) : formatHistoricalDayLabel(day);
}

function compactWeekLabel(key: string) {
  return UTC_WEEKDAY_DATE_FORMATTER.format(dateFromKey(key)).replace(".", "");
}

function formatRangeLabel(window: StudyHeatmapWindow) {
  if (window.period === "month") return UTC_MONTH_FORMATTER.format(dateFromKey(window.rangeStartKey));
  if (window.period === "year") return window.rangeStartKey.slice(0, 4);
  const startYear = window.rangeStartKey.slice(0, 4);
  const start = startYear === window.rangeEndKey.slice(0, 4) ? compactDate(window.rangeStartKey) : longDate(window.rangeStartKey);
  return `${start}–${longDate(window.rangeEndKey)}`;
}

function HeatmapScale({ label, tones }: { label: string; tones: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="mr-0.5">{label}</span>
      {tones.slice(1).map((tone) => <span key={tone} className={`block size-3 rounded-marker border ${tone}`} />)}
    </span>
  );
}

function HeatmapLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 core-caption text-core-muted">
      <HeatmapScale label="Gelernt" tones={heatmapToneByLevel} />
      <HeatmapScale label="Fällig" tones={forecastToneByLevel} />
    </div>
  );
}

function HeatmapDayCell({
  day,
  label,
  className,
  children,
}: {
  day: StudyHeatmapDay;
  label: string;
  className: string;
  children?: React.ReactNode;
}) {
  if (day.isOutsideRange) return <span aria-hidden="true" className={`invisible ${className}`} />;
  const toneClass = day.isForecastAvailable ? forecastToneByLevel[day.forecastLevel] : heatmapToneByLevel[day.level];
  const unavailableClass = day.isFuture && !day.isForecastAvailable ? "opacity-35" : "";
  return (
    <CoreTooltip label={label}>
      <span
        className={`grid place-items-center border transition-transform hover:scale-105 ${toneClass} ${day.isToday ? "ring-2 ring-core-action ring-offset-2 ring-offset-core-surface" : ""} ${unavailableClass} ${className}`}
        aria-label={label}
        data-heatmap-day={day.key}
        data-heatmap-kind={day.isForecastAvailable ? "forecast" : day.isFuture ? "unavailable" : "history"}
      >
        {children}
      </span>
    </CoreTooltip>
  );
}

function WeekHeatmap({ window, formatDayLabel }: { window: StudyHeatmapWindow; formatDayLabel: (day: StudyHeatmapDay) => string }) {
  return (
    <div
      className="core-heatmap-week"
      role="img"
      data-testid="study-heatmap-grid"
      data-heatmap-period="week"
      aria-label={`Lern-Heatmap von ${window.rangeStartKey} bis ${window.rangeEndKey}`}
    >
      {window.days.map((day) => {
        const value = (day.isFuture ? day.forecastCount : day.count).toLocaleString("de-DE");
        return (
          <div key={day.key} className="core-heatmap-week-day">
            <HeatmapDayCell day={day} label={heatmapDayLabel(day, formatDayLabel)} className="core-heatmap-week-tile rounded-control">
              <span
                className="core-heatmap-week-count"
                data-zero={value === "0" || undefined}
                style={{ "--heatmap-count-digits": value.length, color: !day.isFuture && day.level === 4 ? "var(--core-heatmap-on-strong)" : undefined } as React.CSSProperties}
              >
                {value}
              </span>
            </HeatmapDayCell>
            <span className={`core-heatmap-week-label core-caption ${day.isToday ? "font-bold text-core-action" : "font-medium text-core-muted"}`}>
              <span>{day.isToday ? "Heute" : compactWeekLabel(day.key)}</span>
              <span className="core-heatmap-week-date">{compactDate(day.key)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StreakRun({ heatmap }: { heatmap: StudyHeatmapModel }) {
  const days = Array.from({ length: 7 }, (_, index) => shiftDayKey(heatmap.todayKey, index - 6));
  const learnedDays = days.filter((key) => (heatmap.countsByDay.get(key) ?? 0) > 0).length;
  const todayOpen = !heatmap.countsByDay.get(heatmap.todayKey);
  return (
    <div className="core-study-heatmap-run" role="img" aria-label={`Letzte 7 Tage: an ${learnedDays} ${learnedDays === 1 ? "Tag" : "Tagen"} gelernt${todayOpen ? ", heute noch offen" : ""}`}>
      {days.map((key) => {
        const learned = (heatmap.countsByDay.get(key) ?? 0) > 0;
        const today = key === heatmap.todayKey;
        const state = learned ? "learned" : today ? "open" : "missed";
        return (
          <span key={key} className="core-study-heatmap-run-mark" data-state={state} data-today={today || undefined}>
            {state === "missed" ? <X aria-hidden="true" /> : <Flame fill={learned ? "currentColor" : "none"} aria-hidden="true" />}
          </span>
        );
      })}
    </div>
  );
}

function MonthHeatmap({ window, formatDayLabel }: { window: StudyHeatmapWindow; formatDayLabel: (day: StudyHeatmapDay) => string }) {
  return (
    <div
      className="w-full"
      role="img"
      data-testid="study-heatmap-grid"
      data-heatmap-period="month"
      aria-label={`Lern-Heatmap für ${formatRangeLabel(window)}`}
    >
      <div className="mx-auto mb-2 grid max-w-[28rem] grid-cols-7 gap-1.5 sm:gap-2" aria-hidden="true">
        {window.weekdayLabels.map((label) => <span key={label} className="text-center core-caption font-medium text-core-muted">{label}</span>)}
      </div>
      <div className="core-heatmap-month-grid mx-auto grid max-w-[28rem] grid-cols-7 gap-1.5 sm:gap-2">
        {window.days.map((day) => (
          <HeatmapDayCell key={day.key} day={day} label={heatmapDayLabel(day, formatDayLabel)} className="core-heatmap-month-cell w-full rounded-inset">
            <span className="core-caption font-semibold tabular-nums" style={{ color: !day.isFuture && day.level === 4 ? "var(--core-heatmap-on-strong)" : "var(--core-text)" }}>{day.dayOfMonth}</span>
          </HeatmapDayCell>
        ))}
      </div>
    </div>
  );
}

function YearHeatmap({
  window,
  formatDayLabel,
  scrollerRef,
}: {
  window: StudyHeatmapWindow;
  formatDayLabel: (day: StudyHeatmapDay) => string;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const gridColumns = `2.25rem repeat(${window.weeks.length}, var(--core-heatmap-year-cell))`;
  return (
    <div
      ref={scrollerRef}
      className="relative min-w-0 overflow-x-auto rounded-control pb-2 [scrollbar-gutter:stable]"
      tabIndex={0}
      role="group"
      aria-label={`Horizontal scrollbare Lern-Heatmap für das Jahr ${window.rangeStartKey.slice(0, 4)}`}
    >
      <div
        className="grid w-max gap-1"
        style={{ gridTemplateColumns: gridColumns }}
        role="img"
        data-testid="study-heatmap-grid"
        data-heatmap-period="year"
        aria-label={`Lern-Heatmap von ${window.rangeStartKey} bis ${window.rangeEndKey}`}
      >
        <span aria-hidden="true" className="sticky left-0 z-[1] bg-core-surface" />
        {window.monthLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="h-5 whitespace-nowrap text-left core-caption font-medium text-core-muted"
            data-month-label={label || undefined}
          >
            {label}
          </span>
        ))}
        {window.weekdayLabels.map((label, dayIndex) => (
          <React.Fragment key={label}>
            <span className="sticky left-0 z-[1] flex min-h-4 items-center bg-core-surface core-caption font-medium text-core-muted">{label}</span>
            {window.weeks.map((week) => {
              const day = week[dayIndex];
              return (
                <HeatmapDayCell
                  key={day.key}
                  day={day}
                  label={heatmapDayLabel(day, formatDayLabel)}
                  className="core-heatmap-year-cell rounded-marker"
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const historyColorListeners = new Set<(color: string) => void>();

/** The browser-local heatmap color; a commit reaches every heatmap in this tab, other tabs follow the storage event. */
export function useHeatmapHistoryColor() {
  const [historyColor, setHistoryColor] = React.useState(readStoredHeatmapColor);
  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HEATMAP_HISTORY_COLOR_STORAGE_KEY) {
        setHistoryColor(normalizeHeatmapHistoryColor(event.newValue));
      }
    };
    historyColorListeners.add(setHistoryColor);
    window.addEventListener("storage", handleStorage);
    return () => {
      historyColorListeners.delete(setHistoryColor);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);
  const commit = React.useCallback((color: string) => {
    writeStoredHeatmapColor(color);
    for (const listener of historyColorListeners) listener(color);
  }, []);
  return [historyColor, commit] as const;
}

export function StudyHeatmap({
  heatmap,
  formatDayLabel,
  className = "",
}: {
  heatmap: StudyHeatmapModel;
  formatDayLabel: (day: StudyHeatmapDay) => string;
  className?: string;
}) {
  const [period, setPeriod] = React.useState<StudyHeatmapPeriod>("week");
  const [anchorKey, setAnchorKey] = React.useState<string | null>(null);
  const [historyColor] = useHeatmapHistoryColor();
  const yearScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const visibleHeatmap = React.useMemo(
    () => createStudyHeatmapWindow(heatmap, { period, anchorKey }),
    [anchorKey, heatmap, period],
  );
  const navigationLabels = PERIOD_NAVIGATION_LABELS[period];
  const rangeLabel = formatRangeLabel(visibleHeatmap);
  const streak = heatmap.currentStreak.toLocaleString("de-DE");
  // Width of the streak in digit widths; a thousands separator is about half a digit wide.
  const streakWidth = streak.replace(/\D/g, "").length + (streak.length - streak.replace(/\D/g, "").length) * 0.45;
  const todayOpen = !heatmap.countsByDay.get(heatmap.todayKey);

  React.useEffect(() => setAnchorKey(null), [heatmap.todayKey]);
  React.useLayoutEffect(() => {
    const scroller = yearScrollerRef.current;
    if (period !== "year" || !scroller) return;
    const isCurrentYear = visibleHeatmap.rangeStartKey.slice(0, 4) === heatmap.todayKey.slice(0, 4);
    const isForecastEndYear = visibleHeatmap.rangeStartKey.slice(0, 4) === heatmap.forecastEndKey.slice(0, 4);
    const targetKey = isCurrentYear ? heatmap.todayKey : isForecastEndYear ? heatmap.forecastEndKey : visibleHeatmap.rangeEndKey;
    const target = scroller.querySelector<HTMLElement>(`[data-heatmap-day="${targetKey}"]`);
    if (target) scroller.scrollLeft = Math.max(0, target.offsetLeft - scroller.clientWidth + target.offsetWidth);
  }, [heatmap.forecastEndKey, heatmap.todayKey, period, visibleHeatmap.anchorKey, visibleHeatmap.rangeEndKey, visibleHeatmap.rangeStartKey]);

  const selectPeriod = (nextPeriod: StudyHeatmapPeriod) => {
    setPeriod(nextPeriod);
    setAnchorKey(null);
  };

  return (
    <SoftPanel
      className={`core-study-heatmap-container overflow-hidden p-0 ${className}`}
      style={createHeatmapColorStyle(historyColor)}
      data-heatmap-history-color={historyColor}
    >
      <div className="core-study-heatmap-layout">
      <div className="core-study-heatmap-head">
      <div className="core-study-heatmap-band" style={{ background: historyColor, color: "var(--core-heatmap-on-strong)", "--heatmap-streak-width": streakWidth } as React.CSSProperties} data-testid="study-heatmap-header">
        <h3 className="core-study-heatmap-streak">
          <span className="core-study-heatmap-streak-count">{streak}</span>{" "}
          <span className="core-study-heatmap-streak-label">{heatmap.currentStreak === 1 ? "Tag Streak" : "Tage Streak"}</span>
        </h3>
        <Flame className="core-study-heatmap-emblem" fill={todayOpen ? "none" : "currentColor"} data-open={todayOpen || undefined} aria-hidden="true" />
      </div>
      <StreakRun heatmap={heatmap} />
      </div>
      <div className="core-study-heatmap-body">
        <div className="core-study-heatmap-controls flex w-full items-center justify-between gap-3" data-testid="study-heatmap-controls">
          <div className="core-study-heatmap-nav flex min-w-0 max-w-[16rem] flex-1 items-center">
            <CoreTooltip label={navigationLabels.previous}>
              <button
                type="button"
                onClick={() => setAnchorKey(visibleHeatmap.previousAnchorKey)}
                disabled={!visibleHeatmap.canShowPrevious}
                className="inline-flex size-control shrink-0 items-center justify-center rounded-control text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={navigationLabels.previous}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            </CoreTooltip>
            <p className="min-w-0 flex-1 truncate text-center core-body font-semibold text-core-text" data-testid="study-heatmap-range-label">{period === "year" ? rangeLabel : <>{rangeLabel.slice(0, -4)}<span className="core-heatmap-range-year">{rangeLabel.slice(-4)}</span></>}</p>
            <CoreTooltip label={navigationLabels.next}>
              <button
                type="button"
                onClick={() => setAnchorKey(visibleHeatmap.nextAnchorKey)}
                disabled={!visibleHeatmap.canShowNext}
                className="inline-flex size-control shrink-0 items-center justify-center rounded-control text-core-text transition hover:bg-core-subtle disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={navigationLabels.next}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </CoreTooltip>
          </div>
          <CoreSelect ariaLabel="Heatmap-Zeitraum" options={PERIOD_OPTIONS} value={period} onValueChange={(value) => selectPeriod(value as StudyHeatmapPeriod)} className="core-heatmap-period-select" />
        </div>
        <div className="core-study-heatmap-view mt-5 min-w-0">
          {period === "week" ? <WeekHeatmap window={visibleHeatmap} formatDayLabel={formatDayLabel} /> : null}
          {period === "month" ? <MonthHeatmap window={visibleHeatmap} formatDayLabel={formatDayLabel} /> : null}
          {period === "year" ? <YearHeatmap window={visibleHeatmap} formatDayLabel={formatDayLabel} scrollerRef={yearScrollerRef} /> : null}
        </div>
        <div className="mt-4" data-testid="study-heatmap-legend">
          <HeatmapLegend />
        </div>
      </div>
      </div>
    </SoftPanel>
  );
}
