import React from "react";
import { Activity, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileArchive, PenLine, Sparkles } from "lucide-react";
import { createDeckLibraryModel, createStudyHeatmapWindow } from "../libraryModel.ts";
import type { DashboardScreenProps } from "../appScreenProps.ts";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DeckTree } from "../ui/DeckTree.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";

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
  const gridColumns = `2.25rem repeat(${visibleHeatmap.weeks.length}, 19px)`;
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
      <div className="flex flex-wrap items-center gap-4" data-testid="study-heatmap-header">
        <div className="flex items-center gap-4">
          <OrbIcon icon={Activity} className="bg-core-success-soft text-core-text" />
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Lern-Heatmap</h3>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-4">
          <HeatmapLegend />
          <div className="flex items-center gap-2">
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
      </div>

      <div
        ref={heatmapViewportRef}
        className="mt-3 min-w-0 overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-core-focus"
        tabIndex={0}
        onKeyDown={handleHeatmapKeyDown}
        role="group"
        aria-label={`Lern-Heatmap-Ausschnitt von ${visibleHeatmap.rangeStartKey} bis ${visibleHeatmap.rangeEndKey}`}
        aria-describedby="study-heatmap-keyboard-help"
      >
        <p id="study-heatmap-keyboard-help" className="sr-only">Mit der linken und rechten Pfeiltaste zwischen Zeiträumen wechseln.</p>
        <div
          className="grid w-max max-w-full gap-1"
          style={{ gridTemplateColumns: gridColumns }}
          role="img"
          data-testid="study-heatmap-grid"
          aria-label={`Lern-Heatmap von ${visibleHeatmap.rangeStartKey} bis ${visibleHeatmap.rangeEndKey}`}
        >
          <span aria-hidden="true" />
          {visibleHeatmap.monthLabels.map((label: string, index: number) => (
            <span
              key={`${label}-${index}`}
              className="h-5 whitespace-nowrap text-left text-[0.68rem] font-semibold text-[var(--core-text-muted)]"
              data-month-label={label || undefined}
            >
              {label}
            </span>
          ))}

          {visibleHeatmap.weekdayLabels.map((label: string, dayIndex: number) => (
            <React.Fragment key={label}>
              <span className="flex min-h-4 items-center text-[0.68rem] font-semibold text-[var(--core-text-muted)]">{label}</span>
              {visibleHeatmap.weeks.map((week: any[]) => {
                const day = week[dayIndex];
                const dayLabel = heatmapDayLabel(day);
                return (
                  <CoreTooltip key={day.key} label={dayLabel}>
                    <span
                      className={`block size-[19px] rounded-[4px] border transition-transform hover:scale-110 ${heatmapToneByLevel[day.level]} ${day.isToday ? "ring-2 ring-inset ring-core-focus" : ""} ${day.isFuture ? "opacity-35" : ""} ${day.isOutsideDisplayYear ? "opacity-20" : ""}`}
                      aria-label={dayLabel}
                    />
                  </CoreTooltip>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </SoftPanel>
  );
}

export function DashboardScreen({ state, onNavigate, onStartDeck, onCreateDemo, onMoveDeck, onOpenDeckSettings }: DashboardScreenProps) {
  const library = React.useMemo(() => createDeckLibraryModel(state.decks), [state.decks]);
  const { dueCards, studyHeatmap } = library;
  const displayName = state.profile?.displayName?.trim();
  const welcomeTitle = displayName ? `Willkommen zurück, ${displayName}!` : "Willkommen bei CoRe";

  if (state.decks.length === 0) {
    return (
      <div className="grid min-w-0 gap-7">
        <PageHeader title={welcomeTitle} />

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
      <PageHeader title={welcomeTitle} />

      <SoftPanel className="flex items-center gap-4 px-6 py-4">
        <OrbIcon icon={CalendarDays} />
        <p className="flex min-w-0 items-baseline gap-2 whitespace-nowrap core-body-large text-[var(--core-text)]">
          <span>Heute fällig:</span>
          <span className="font-semibold">{dueCards}</span>
        </p>
      </SoftPanel>

      <StudyHeatmap heatmap={studyHeatmap} />

      <SoftPanel className="p-7">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Aktive Stapel</h3>
          <button
            type="button"
            onClick={() => onNavigate("lernen")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2"
          >
            Lernen öffnen <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <DeckTree
          rows={library.rows}
          mode="dashboard"
          onActivate={(row) => onStartDeck(row.deck, false)}
          onOpenSettings={(row) => onOpenDeckSettings(row.id)}
          onMoveDeck={onMoveDeck}
        />
      </SoftPanel>
    </div>
  );
}
