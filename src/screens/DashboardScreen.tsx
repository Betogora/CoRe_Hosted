import React from "react";
import { Activity, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileArchive, PenLine, Sparkles } from "lucide-react";
import { createDeckLibraryModel, createStudyHeatmapWindow } from "../libraryModel.ts";
import { DonutValue, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";

const heatmapToneByLevel = [
  "border-[var(--core-border)] bg-[var(--core-canvas)]",
  "border-[var(--core-success)] bg-[var(--core-success-surface)]",
  "border-[var(--core-success)] bg-[var(--core-success)]",
  "border-[var(--core-info)] bg-[var(--core-info)]",
  "border-[var(--core-text-secondary)] bg-[var(--core-info)]",
];

function formatHeatmapDate(key: { split: (arg0: string) => [any,any,any]; }) {
  const [year, month, date] = key.split("-");
  return `${date}.${month}.${year}`;
}

function formatCardCount(count: number) {
  if (count === 1) return "1 Karte";
  return `${count} Karten`;
}

function heatmapDayLabel(day: { key: { split: (arg0: string) => [any,any,any]; }; isOutsideDisplayYear: any; isFuture: any; count: number; }) {
  const date = formatHeatmapDate(day.key);
  if (day.isOutsideDisplayYear) return `${date}: außerhalb des Kalenderjahres`;
  if (day.isFuture) return `${date}: noch offen`;
  if (day.count === 0) return `${date}: keine Karten gelernt`;
  return `${date}: ${formatCardCount(day.count)} gelernt`;
}

function HeatmapMetric({ label, value }: any) {
  return (
    <div className="min-w-24">
      <p className="core-body font-semibold text-[var(--core-text-muted)]">{label}</p>
      <p className="mt-1 core-heading-2 font-semibold text-[var(--core-text)]">{value}</p>
    </div>
  );
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

function useElementWidth() {
  const elementRef = React.useRef<any>(null);
  const [width, setWidth] = React.useState<any>(null);

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

function StudyHeatmap({ heatmap }: any) {
  const [heatmapViewportRef, heatmapViewportWidth] = useElementWidth();
  const [heatmapEndWeekIndex, setHeatmapEndWeekIndex] = React.useState<any>(null);
  const visibleHeatmap: any = React.useMemo(
    () => createStudyHeatmapWindow(heatmap, { viewportWidth: heatmapViewportWidth, endWeekIndex: heatmapEndWeekIndex }),
    [heatmap, heatmapEndWeekIndex, heatmapViewportWidth],
  );
  const gridColumns = `2.25rem repeat(${visibleHeatmap.weeks.length}, minmax(0, 1fr))`;
  const goToPreviousHeatmapWindow = () => setHeatmapEndWeekIndex(visibleHeatmap.previousEndWeekIndex);
  const goToNextHeatmapWindow = () => setHeatmapEndWeekIndex(visibleHeatmap.nextEndWeekIndex);
  const handleHeatmapKeyDown = (event: { key: string; preventDefault: () => void; }) => {
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
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <div className="flex gap-4">
          <OrbIcon icon={Activity} className="bg-core-success-soft text-core-text" />
          <div>
            <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Lern-Heatmap</h3>
          </div>
        </div>
        <HeatmapMetric label="Aktive Tage" value={visibleHeatmap.activeDays} />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPreviousHeatmapWindow}
              disabled={!visibleHeatmap.canShowPrevious}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--core-border)] bg-core-surface text-[var(--core-action-primary)] transition hover:border-[var(--core-border)] hover:bg-[var(--core-surface)] disabled:cursor-not-allowed disabled:opacity-40"
              title="Frühere Wochen anzeigen"
              aria-label="Frühere Wochen anzeigen"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goToNextHeatmapWindow}
              disabled={!visibleHeatmap.canShowNext}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--core-border)] bg-core-surface text-[var(--core-action-primary)] transition hover:border-[var(--core-border)] hover:bg-[var(--core-surface)] disabled:cursor-not-allowed disabled:opacity-40"
              title="Spätere Wochen anzeigen"
              aria-label="Spätere Wochen anzeigen"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
          <HeatmapLegend />
        </div>
      </div>

      <div
        ref={heatmapViewportRef}
        className="mt-4 min-w-0 overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus"
        tabIndex={0}
        onKeyDown={handleHeatmapKeyDown}
        role="group"
        aria-label={`Lern-Heatmap-Ausschnitt von ${visibleHeatmap.rangeStartKey} bis ${visibleHeatmap.rangeEndKey}`}
        aria-describedby="study-heatmap-keyboard-help"
      >
        <p id="study-heatmap-keyboard-help" className="sr-only">Mit der linken und rechten Pfeiltaste zwischen Zeiträumen wechseln.</p>
        <div
          className="grid w-full max-w-full gap-1"
          style={{ gridTemplateColumns: gridColumns }}
          role="img"
          aria-label={`Lern-Heatmap von ${visibleHeatmap.rangeStartKey} bis ${visibleHeatmap.rangeEndKey}, ${visibleHeatmap.activeDays} aktive Tage`}
        >
          <span aria-hidden="true" />
          {visibleHeatmap.monthLabels.map((label: string, index: number) => (
            <span key={`${label}-${index}`} className="h-5 whitespace-nowrap text-left text-[0.68rem] font-semibold text-[var(--core-text-muted)]">
              {label}
            </span>
          ))}

          {visibleHeatmap.weekdayLabels.map((label: string, dayIndex: number) => (
            <React.Fragment key={label}>
              <span className="flex min-h-4 items-center text-[0.68rem] font-semibold text-[var(--core-text-muted)]">{label}</span>
              {visibleHeatmap.weeks.map((week: any[], weekIndex: number) => {
                const day = week[dayIndex];
                return (
                  <span
                    key={`${weekIndex}-${day.key}`}
                    className={`block aspect-square w-full rounded-[4px] border transition-transform hover:scale-110 ${heatmapToneByLevel[day.level]} ${day.isToday ? "ring-2 ring-core-focus ring-offset-1" : ""} ${day.isFuture ? "opacity-35" : ""} ${day.isOutsideDisplayYear ? "opacity-20" : ""}`}
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

export function DashboardScreen({ state, onNavigate, onStartDeck, onCreateDemo }: any) {
  const library = createDeckLibraryModel(state.decks);
  const { dueCards, studyHeatmap } = library;
  const dashboardRows = library.dashboardRows;

  if (state.decks.length === 0) {
    return (
      <div className="grid min-w-0 gap-7">
        <PageHeader eyebrow="Heute" title="Willkommen bei CoRe" />

        <SoftPanel className="overflow-hidden p-7 sm:p-9">
          <div className="max-w-3xl">
            <p className="core-body font-semibold uppercase tracking-wide text-[var(--core-action-secondary)]">Dein erster Lernerfolg</p>
            <h2 className="mt-2 core-heading-2 font-semibold text-[var(--core-text)]">Womit möchtest du starten?</h2>
            <p className="mt-3 max-w-2xl core-body-large leading-7 text-[var(--core-text-muted)]">Lege eigenes Lernmaterial an oder probiere CoRe bewusst mit Beispieldaten aus.</p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            <button type="button" onClick={() => onNavigate("neue-karten", { creationMethod: "manual" })} className="group rounded-2xl bg-[var(--core-action-primary)] p-5 text-left text-[var(--core-text-on-accent)] shadow-[var(--core-shadow-raised)] transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2">
              <PenLine size={24} aria-hidden="true" />
              <span className="mt-5 block core-body-large font-semibold">Erste Karte erstellen</span>
              <span className="core-body mt-2 block text-[var(--core-text-on-accent)]">Frage und Antwort direkt eingeben.</span>
            </button>
            <button type="button" onClick={() => onNavigate("neue-karten", { creationMethod: "import" })} className="group rounded-2xl border border-[var(--core-border)] bg-core-surface p-5 text-left text-[var(--core-text)] transition hover:-translate-y-0.5 hover:border-core-success focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-2">
              <FileArchive size={24} className="text-core-text" aria-hidden="true" />
              <span className="mt-5 block core-body-large font-semibold">Anki-Stapel importieren</span>
              <span className="mt-2 block core-body leading-6 text-[var(--core-text-muted)]">Eine vorhandene APKG-Datei übernehmen.</span>
            </button>
            <button type="button" onClick={onCreateDemo} className="group rounded-2xl border border-dashed border-[var(--core-border)] bg-[var(--core-surface-muted)] p-5 text-left text-[var(--core-text)] transition hover:-translate-y-0.5 hover:border-[var(--core-focus)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2">
              <Sparkles size={24} className="text-[var(--core-action-secondary)]" aria-hidden="true" />
              <span className="mt-5 block core-body-large font-semibold">Demo ausprobieren</span>
              <span className="mt-2 block core-body leading-6 text-[var(--core-text-muted)]">Beispielstapel nur auf deinen Klick anlegen.</span>
            </button>
          </div>
        </SoftPanel>

        <SoftPanel className="p-7">
          <h2 className="core-heading-3 font-semibold text-[var(--core-text)]">Das macht CoRe</h2>
          <ul className="mt-5 grid gap-3 md:grid-cols-3">
            {["Zeitlich passend wiederholen.", "Später anders formuliert prüfen.", "Original und Quelle bleiben sichtbar."].map((point) => (
              <li key={point} className="flex gap-3 core-body leading-6 text-[var(--core-text-secondary)]">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-core-text" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </SoftPanel>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Heute"
        title="Willkommen bei CoRe"
      />

      <StatTile icon={CalendarDays} label="Heute fällig" value={dueCards} />

      <StudyHeatmap heatmap={studyHeatmap} />

      <SoftPanel className="p-7">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Aktive Stapel</h3>
          <button
            type="button"
            onClick={() => onNavigate("lernen")}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2"
          >
            Lernen öffnen <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-3">
          {dashboardRows.map((row: any) => {
            const summary = row.summary;
            return (
              <button
                key={row.id}
                type="button"
                aria-label={`${row.name} lernen`}
                onClick={() => onStartDeck(row.deck)}
                className="flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border border-[var(--core-border)] bg-core-surface px-5 py-4 text-left transition hover:border-[var(--core-border-interactive)] hover:bg-[var(--core-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2"
              >
                <DeckAppearanceIcon deck={row.deck} className="size-10 rounded-full bg-[var(--core-surface-muted)]" iconSize={19} />
                <span className="min-w-[12rem] flex-1">
                  <span className="block truncate core-body-large font-semibold text-[var(--core-text)]">{row.name}</span>
                  <span className="block core-body text-[var(--core-text-muted)]">
                    {summary.totalCards} Karten · {summary.dueCards} fällig
                  </span>
                </span>
                <DonutValue value={row.progress} />
              </button>
            );
          })}
        </div>
      </SoftPanel>
    </div>
  );
}
