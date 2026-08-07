import React from "react";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import {
  createStudyHeatmapWindow,
  type StudyHeatmapDay,
  type StudyHeatmapModel,
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

function useElementWidth() {
  const elementRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const updateWidth = () => setWidth(element.getBoundingClientRect().width);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [elementRef, width] as const;
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
  const [heatmapViewportRef, heatmapViewportWidth] = useElementWidth();
  const [heatmapEndWeekIndex, setHeatmapEndWeekIndex] = React.useState<number | null>(null);
  const keyboardHelpId = React.useId();
  const visibleHeatmap = React.useMemo(
    () => createStudyHeatmapWindow(heatmap, { viewportWidth: heatmapViewportWidth, endWeekIndex: heatmapEndWeekIndex }),
    [heatmap, heatmapEndWeekIndex, heatmapViewportWidth],
  );

  React.useEffect(() => setHeatmapEndWeekIndex(null), [heatmap]);

  const gridColumns = `2.25rem repeat(${visibleHeatmap.weeks.length}, 19px)`;
  const goToPreviousHeatmapWindow = () => setHeatmapEndWeekIndex(visibleHeatmap.previousEndWeekIndex);
  const goToNextHeatmapWindow = () => setHeatmapEndWeekIndex(visibleHeatmap.nextEndWeekIndex);
  const handleHeatmapKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && visibleHeatmap.canShowPrevious) {
      event.preventDefault();
      goToPreviousHeatmapWindow();
    }
    if (event.key === "ArrowRight" && visibleHeatmap.canShowNext) {
      event.preventDefault();
      goToNextHeatmapWindow();
    }
  };

  return (
    <SoftPanel className={`p-4 sm:p-7 ${className}`}>
      <div className="flex items-center gap-4" data-testid="study-heatmap-header">
        <div className="flex items-center gap-4">
          <OrbIcon icon={Activity} className="bg-core-success-soft text-core-text" />
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Lern-Heatmap</h3>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <CoreTooltip label="Frühere Wochen anzeigen">
            <button
              type="button"
              onClick={goToPreviousHeatmapWindow}
              disabled={!visibleHeatmap.canShowPrevious}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--core-border)] bg-core-surface text-[var(--core-action-primary)] transition hover:border-[var(--core-border)] hover:bg-[var(--core-surface)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Frühere Wochen anzeigen"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
          </CoreTooltip>
          <CoreTooltip label="Spätere Wochen anzeigen">
            <button
              type="button"
              onClick={goToNextHeatmapWindow}
              disabled={!visibleHeatmap.canShowNext}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--core-border)] bg-core-surface text-[var(--core-action-primary)] transition hover:border-[var(--core-border)] hover:bg-[var(--core-surface)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Spätere Wochen anzeigen"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </CoreTooltip>
        </div>
      </div>

      <div
        ref={heatmapViewportRef}
        className="mt-3 min-w-0 overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus"
        tabIndex={0}
        onKeyDown={handleHeatmapKeyDown}
        role="group"
        aria-label={`Lern-Heatmap-Ausschnitt von ${visibleHeatmap.visibleRangeStartKey} bis ${visibleHeatmap.visibleRangeEndKey}`}
        aria-describedby={keyboardHelpId}
      >
        <p id={keyboardHelpId} className="sr-only">Mit der linken und rechten Pfeiltaste zwischen Zeiträumen wechseln.</p>
        <div
          className="grid w-max max-w-full gap-1"
          style={{ gridTemplateColumns: gridColumns }}
          role="img"
          data-testid="study-heatmap-grid"
          aria-label={`Lern-Heatmap von ${visibleHeatmap.visibleRangeStartKey} bis ${visibleHeatmap.visibleRangeEndKey}`}
        >
          <span aria-hidden="true" />
          {visibleHeatmap.monthLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="h-5 whitespace-nowrap text-left text-[0.68rem] font-semibold text-[var(--core-text-muted)]"
              data-month-label={label || undefined}
            >
              {label}
            </span>
          ))}

          {visibleHeatmap.weekdayLabels.map((label, dayIndex) => (
            <React.Fragment key={label}>
              <span className="flex min-h-4 items-center text-[0.68rem] font-semibold text-[var(--core-text-muted)]">{label}</span>
              {visibleHeatmap.weeks.map((week) => {
                const day = week[dayIndex];
                const dayLabel = formatDayLabel(day);
                return (
                  <CoreTooltip key={day.key} label={dayLabel}>
                    <span
                      className={`block size-[19px] rounded-[4px] border transition-transform hover:scale-110 ${heatmapToneByLevel[day.level]} ${day.isToday ? "ring-2 ring-inset ring-core-focus" : ""} ${day.isFuture ? "opacity-35" : ""} ${day.isOutsideRange ? "opacity-20" : ""}`}
                      aria-label={dayLabel}
                    />
                  </CoreTooltip>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex justify-center" data-testid="study-heatmap-legend">
        <HeatmapLegend />
      </div>
    </SoftPanel>
  );
}
