import React from "react";
import { CalendarDays, CheckCircle2, ChevronRight, FileArchive, PenLine, Sparkles } from "lucide-react";
import { createDeckLibraryModel } from "../libraryModel.ts";
import type { DashboardScreenProps } from "../appScreenProps.ts";
import type { StudyHeatmapDay } from "../studyHeatmapModel.ts";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DeckTree } from "../ui/DeckTree.tsx";
import { StudyHeatmap } from "../ui/StudyHeatmap.tsx";

function formatHeatmapDate(key: string) {
  const [year, month, date] = key.split("-");
  return `${date}.${month}.${year}`;
}

function formatCardCount(count: number) {
  if (count === 1) return "1 Karte";
  return `${count} Karten`;
}

function heatmapDayLabel(day: StudyHeatmapDay) {
  const date = formatHeatmapDate(day.key);
  if (day.isOutsideRange) return `${date}: außerhalb des gewählten Zeitraums`;
  if (day.count === 0) return `${date}: keine Karten gelernt`;
  return `${date}: ${formatCardCount(day.count)} gelernt`;
}

export function DashboardScreen({ state, now, onNavigate, onStartDeck, onCreateDemo, onSetDeckCoreMode, onMoveDeck, onOpenDeckSettings, onSetDeckExpanded }: DashboardScreenProps) {
  const library = React.useMemo(
    () => createDeckLibraryModel(state.decks, { now, timeZone: state.profile.timezone || undefined }),
    [now, state.decks, state.profile.timezone],
  );
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

      <StudyHeatmap heatmap={studyHeatmap} formatDayLabel={heatmapDayLabel} />

      <DeckTree
        rows={library.rows}
        mode="dashboard"
        collapsedDeckIds={state.profile.uiPreferences.dashboardCollapsedDeckIds}
        onDeckExpansionChange={(deckId, expanded) => onSetDeckExpanded("dashboard", deckId, expanded)}
        headerAction={(
          <button
            type="button"
            onClick={() => onNavigate("lernen")}
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2"
          >
            Alle ansehen <ChevronRight size={15} aria-hidden="true" />
          </button>
        )}
        onActivate={(row) => onStartDeck(row.deck, false)}
        onOpenSettings={onOpenDeckSettings}
        onSetDeckCoreMode={onSetDeckCoreMode}
        onMoveDeck={onMoveDeck}
      />
    </div>
  );
}
