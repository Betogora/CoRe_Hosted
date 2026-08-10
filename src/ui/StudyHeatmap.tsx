import React from "react";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import {
  createStudyHeatmapWindow,
  type StudyHeatmapDay,
  type StudyHeatmapModel,
  type StudyHeatmapPeriod,
  type StudyHeatmapWindow,
} from "../studyHeatmapModel.ts";
import { OrbIcon, SoftPanel } from "./coreUi.tsx";
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
const UTC_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const UTC_MONTH_FORMATTER = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

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

function weekdayLabel(key: string) {
  return UTC_WEEKDAY_FORMATTER.format(dateFromKey(key)).replace(".", "");
}

function formatRangeLabel(window: StudyHeatmapWindow) {
  if (window.period === "month") return UTC_MONTH_FORMATTER.format(dateFromKey(window.rangeStartKey));
  if (window.period === "year") return window.rangeStartKey.slice(0, 4);
  const startYear = window.rangeStartKey.slice(0, 4);
  const start = startYear === window.rangeEndKey.slice(0, 4) ? compactDate(window.rangeStartKey) : longDate(window.rangeStartKey);
  return `${start}–${longDate(window.rangeEndKey)}`;
}

function formatStudyHeatmapTitle(currentStreak: number) {
  return currentStreak === 1 ? "1 Tag Streak" : `${currentStreak} Tage Streak`;
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-2 core-body text-[var(--core-text-muted)]">
      <span>Weniger</span>
      {[0, 1, 2, 3, 4].map((level) => (
        <span key={level} className={`block size-3 rounded-[4px] border ${heatmapToneByLevel[level]}`} />
      ))}
      <span>Mehr</span>
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
        className={`grid place-items-center border transition-transform hover:scale-105 ${toneClass} ${day.isToday ? "ring-2 ring-inset ring-core-action" : ""} ${unavailableClass} ${className}`}
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
      className="grid grid-cols-7 gap-1.5 sm:gap-3"
      role="img"
      data-testid="study-heatmap-grid"
      data-heatmap-period="week"
      aria-label={`Lern-Heatmap von ${window.rangeStartKey} bis ${window.rangeEndKey}`}
    >
      {window.days.map((day) => (
        <div key={day.key} className="grid min-w-0 justify-items-center gap-1.5">
          <span className="text-center text-[0.68rem] font-semibold text-core-muted">
            <span className="block">{weekdayLabel(day.key)}</span>
            <span className="block font-normal">{compactDate(day.key)}</span>
          </span>
          <HeatmapDayCell day={day} label={heatmapDayLabel(day, formatDayLabel)} className="aspect-square w-full max-w-[4.5rem] rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function MonthHeatmap({ window, formatDayLabel }: { window: StudyHeatmapWindow; formatDayLabel: (day: StudyHeatmapDay) => string }) {
  return (
    <div
      role="img"
      data-testid="study-heatmap-grid"
      data-heatmap-period="month"
      aria-label={`Lern-Heatmap für ${formatRangeLabel(window)}`}
    >
      <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2" aria-hidden="true">
        {window.weekdayLabels.map((label) => <span key={label} className="text-center text-[0.68rem] font-semibold text-core-muted">{label}</span>)}
      </div>
      <div className="grid grid-cols-7 justify-items-center gap-1.5 sm:gap-2">
        {window.days.map((day) => (
          <HeatmapDayCell key={day.key} day={day} label={heatmapDayLabel(day, formatDayLabel)} className="aspect-square w-full max-w-14 rounded-lg">
            <span className="core-caption font-semibold text-core-text">{day.dayOfMonth}</span>
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
  const gridColumns = `2.25rem repeat(${window.weeks.length}, 19px)`;
  return (
    <div
      ref={scrollerRef}
      className="min-w-0 overflow-x-auto rounded-xl pb-2 [scrollbar-gutter:stable]"
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
        <span aria-hidden="true" />
        {window.monthLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="h-5 whitespace-nowrap text-left text-[0.68rem] font-semibold text-core-muted"
            data-month-label={label || undefined}
          >
            {label}
          </span>
        ))}
        {window.weekdayLabels.map((label, dayIndex) => (
          <React.Fragment key={label}>
            <span className="flex min-h-4 items-center text-[0.68rem] font-semibold text-core-muted">{label}</span>
            {window.weeks.map((week) => {
              const day = week[dayIndex];
              return (
                <HeatmapDayCell
                  key={day.key}
                  day={day}
                  label={heatmapDayLabel(day, formatDayLabel)}
                  className="size-[19px] rounded-[4px]"
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
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
  const yearScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const visibleHeatmap = React.useMemo(
    () => createStudyHeatmapWindow(heatmap, { period, anchorKey }),
    [anchorKey, heatmap, period],
  );
  const navigationLabels = PERIOD_NAVIGATION_LABELS[period];

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
    <SoftPanel className={`core-study-heatmap-container p-4 sm:p-7 ${className}`}>
      <div className="core-study-heatmap-header grid items-center gap-4" data-testid="study-heatmap-header">
        <div className="flex min-w-0 items-center gap-4">
          <OrbIcon icon={Activity} className="bg-core-success-soft text-core-text" />
          <h3 className="whitespace-nowrap core-heading-3 font-semibold text-core-text">{formatStudyHeatmapTitle(heatmap.currentStreak)}</h3>
        </div>
        <div className="core-study-heatmap-controls flex max-w-full items-center justify-end gap-2 whitespace-nowrap">
          <div
            role="group"
            className="grid h-9 shrink-0 grid-cols-3 overflow-hidden rounded-lg border border-core-border bg-core-subtle"
            aria-label="Heatmap-Zeitraum"
          >
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={period === option.value}
                onClick={() => selectPeriod(option.value)}
                className={`core-study-heatmap-period-option h-9 min-h-9 min-w-0 whitespace-nowrap core-status-label transition-colors ${period === option.value ? "bg-core-action text-[var(--core-text-on-accent)]" : "text-core-secondary hover:bg-core-surface"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <CoreTooltip label={navigationLabels.previous}>
            <button
              type="button"
              onClick={() => setAnchorKey(visibleHeatmap.previousAnchorKey)}
              disabled={!visibleHeatmap.canShowPrevious}
              className="inline-flex size-9 min-h-9 shrink-0 items-center justify-center rounded-lg border border-core-border bg-core-surface text-core-action transition hover:bg-[var(--core-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={navigationLabels.previous}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          </CoreTooltip>
          <CoreTooltip label={navigationLabels.next}>
            <button
              type="button"
              onClick={() => setAnchorKey(visibleHeatmap.nextAnchorKey)}
              disabled={!visibleHeatmap.canShowNext}
              className="inline-flex size-9 min-h-9 shrink-0 items-center justify-center rounded-lg border border-core-border bg-core-surface text-core-action transition hover:bg-[var(--core-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={navigationLabels.next}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </CoreTooltip>
        </div>
      </div>

      <p className="mt-4 text-center core-caption font-semibold text-core-muted" data-testid="study-heatmap-range-label">
        {formatRangeLabel(visibleHeatmap)}
      </p>
      <div className="mt-3 min-w-0">
        {period === "week" ? <WeekHeatmap window={visibleHeatmap} formatDayLabel={formatDayLabel} /> : null}
        {period === "month" ? <MonthHeatmap window={visibleHeatmap} formatDayLabel={formatDayLabel} /> : null}
        {period === "year" ? <YearHeatmap window={visibleHeatmap} formatDayLabel={formatDayLabel} scrollerRef={yearScrollerRef} /> : null}
      </div>
      <div className="mt-4 flex justify-center" data-testid="study-heatmap-legend">
        <HeatmapLegend />
      </div>
    </SoftPanel>
  );
}
