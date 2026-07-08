import React from "react";
import { Activity, Bot, CalendarDays, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { createDeckLibraryModel, createStudyHeatmapWindow } from "../libraryModel.js";
import { DonutValue, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.jsx";

const heatmapToneByLevel = [
  "border-[#dfe5ec] bg-[#f3f6f8]",
  "border-[#b7e5d7] bg-[#d3f4e7]",
  "border-[#80d6c5] bg-[#8be3d2]",
  "border-[#4aa9c7] bg-[#52b7d3]",
  "border-[#265b8f] bg-[#2e6da3]",
];

function formatHeatmapDate(key) {
  const [year, month, date] = key.split("-");
  return `${date}.${month}.${year}`;
}

function formatDecimal(value) {
  return String(value).replace(".", ",");
}

function formatCardCount(count) {
  if (count === 1) return "1 Karte";
  return `${count} Karten`;
}

function heatmapDayLabel(day) {
  const date = formatHeatmapDate(day.key);
  if (day.isFuture) return `${date}: noch offen`;
  if (day.count === 0) return `${date}: keine Karten gelernt`;
  return `${date}: ${formatCardCount(day.count)} gelernt`;
}

function HeatmapMetric({ label, value, hint }) {
  return (
    <div className="min-w-24">
      <p className="text-sm font-semibold text-[#66709a]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#17214f]">{value}</p>
      {hint ? <p className="mt-1 text-sm text-[#66709a]">{hint}</p> : null}
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-2 text-sm text-[#66709a]">
      <span>Weniger</span>
      {[0, 1, 2, 3, 4].map((level) => (
        <span key={level} className={`block size-3 rounded-[4px] border ${heatmapToneByLevel[level]}`} />
      ))}
      <span>Mehr</span>
    </div>
  );
}

function useElementWidth() {
  const elementRef = React.useRef(null);
  const [width, setWidth] = React.useState(null);

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

  return [elementRef, width];
}

function StudyHeatmap({ heatmap }) {
  const [heatmapViewportRef, heatmapViewportWidth] = useElementWidth();
  const [heatmapEndWeekIndex, setHeatmapEndWeekIndex] = React.useState(null);
  const visibleHeatmap = React.useMemo(
    () => createStudyHeatmapWindow(heatmap, { viewportWidth: heatmapViewportWidth, endWeekIndex: heatmapEndWeekIndex }),
    [heatmap, heatmapEndWeekIndex, heatmapViewportWidth],
  );
  const gridColumns = `2.25rem repeat(${visibleHeatmap.weeks.length}, 1rem)`;
  const goToPreviousHeatmapWindow = () => setHeatmapEndWeekIndex(visibleHeatmap.previousEndWeekIndex);
  const goToNextHeatmapWindow = () => setHeatmapEndWeekIndex(visibleHeatmap.nextEndWeekIndex);
  const handleHeatmapKeyDown = (event) => {
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
    <SoftPanel className="p-7">
      <div className="flex flex-wrap items-start justify-start gap-x-10 gap-y-4">
        <div className="flex gap-4">
          <OrbIcon icon={Activity} className="bg-teal-50 text-teal-700" />
          <div>
            <h3 className="text-xl font-semibold text-[#17214f]">Lern-Heatmap</h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3">
          <div className="grid grid-cols-2 gap-x-7 gap-y-4">
            <HeatmapMetric label="Aktive Tage" value={visibleHeatmap.activeDays} />
            <HeatmapMetric label="Ø aktiver Tag" value={formatDecimal(visibleHeatmap.averagePerActiveDay)} hint="Karten" />
          </div>
          <HeatmapLegend />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPreviousHeatmapWindow}
              disabled={!visibleHeatmap.canShowPrevious}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-[#dfe4f3] bg-white text-[#4f5eb1] transition hover:border-[#c7cee8] hover:bg-[#f7f9ff] disabled:cursor-not-allowed disabled:opacity-40"
              title="Frühere Wochen anzeigen"
              aria-label="Frühere Wochen anzeigen"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goToNextHeatmapWindow}
              disabled={!visibleHeatmap.canShowNext}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-[#dfe4f3] bg-white text-[#4f5eb1] transition hover:border-[#c7cee8] hover:bg-[#f7f9ff] disabled:cursor-not-allowed disabled:opacity-40"
              title="Spätere Wochen anzeigen"
              aria-label="Spätere Wochen anzeigen"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={heatmapViewportRef}
        className="mt-4 min-w-0 overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5361aa]/35"
        tabIndex={0}
        onKeyDown={handleHeatmapKeyDown}
        aria-label={`Lern-Heatmap-Ausschnitt von ${visibleHeatmap.rangeStartKey} bis ${visibleHeatmap.rangeEndKey}`}
      >
        <div
          className="grid max-w-full gap-1"
          style={{ gridTemplateColumns: gridColumns }}
          role="img"
          aria-label={`Lern-Heatmap von ${visibleHeatmap.rangeStartKey} bis ${visibleHeatmap.rangeEndKey}`}
        >
          <span aria-hidden="true" />
          {visibleHeatmap.monthLabels.map((label, index) => (
            <span key={`${label}-${index}`} className="h-5 whitespace-nowrap text-left text-[0.68rem] font-semibold text-[#66709a]">
              {label}
            </span>
          ))}

          {visibleHeatmap.weekdayLabels.map((label, dayIndex) => (
            <React.Fragment key={label}>
              <span className="flex h-4 items-center text-[0.68rem] font-semibold text-[#66709a]">{label}</span>
              {visibleHeatmap.weeks.map((week, weekIndex) => {
                const day = week[dayIndex];
                return (
                  <span
                    key={`${weekIndex}-${day.key}`}
                    className={`block h-4 w-4 rounded-[4px] border transition-transform hover:scale-110 ${heatmapToneByLevel[day.level]} ${day.isToday ? "ring-2 ring-[#17214f]/35 ring-offset-1" : ""} ${day.isFuture ? "opacity-35" : ""}`}
                    title={heatmapDayLabel(day)}
                    aria-label={heatmapDayLabel(day)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </SoftPanel>
  );
}

export function DashboardScreen({ state, onNavigate, onStartDeck }) {
  const library = createDeckLibraryModel(state.decks);
  const { totals, studyHeatmap } = library;
  const dashboardRows = library.dashboardRows.length
    ? library.dashboardRows
    : [
        {
          id: "empty",
          name: "Noch kein Kartenstapel",
          deck: { id: "empty", name: "Noch kein Kartenstapel" },
          summary: { totalCards: 0, dueCards: 0 },
          progress: 0,
          isEmpty: true,
        },
      ];

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Heute"
        title={`Guten Morgen, ${state.profile.displayName || "Noemi"}`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onNavigate("assistent")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
          <Bot size={17} aria-hidden="true" />
          Assistent öffnen
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <StatTile icon={CalendarDays} label="Heute fällig" value={totals.dueCards} />
        <StatTile icon={Layers} label="Originalkarten" value={totals.totalCards} accent="text-teal-700" />
      </div>

      <StudyHeatmap heatmap={studyHeatmap} />

      <SoftPanel className="p-7">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="text-xl font-semibold text-[#17214f]">Aktive Stapel</h3>
          <button type="button" onClick={() => onNavigate("lernen")} className="text-sm font-semibold text-[#4f5eb1]">
            Lernen öffnen
          </button>
        </div>
        <div className="grid gap-3">
          {dashboardRows.map((row) => {
            const summary = row.summary;
            return (
              <div key={row.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e3e7f5] bg-white/72 px-5 py-4">
                <OrbIcon icon={Layers} className="size-10 bg-[#eef1fb] text-[#6672bf]" />
                <div className="min-w-[12rem] flex-1">
                  <p className="truncate text-base font-semibold text-[#17214f]">{row.name}</p>
                  <p className="text-sm text-[#66709a]">
                    {summary.totalCards} Karten · {summary.dueCards} fällig
                  </p>
                </div>
                <DonutValue value={row.progress} />
                {!row.isEmpty ? (
                  <button type="button" onClick={() => onStartDeck(row.deck)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
                    Lernen <ChevronRight size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </SoftPanel>
    </div>
  );
}
