import React from "react";
import { Activity, CalendarDays, CalendarSearch, CheckCircle2, FileArchive, PenLine, Play, Plus, RefreshCcw, Sparkles } from "lucide-react";
import { createDeckLibraryModel, type DailyLearningPlan, type DailyLearningSession } from "../libraryModel.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import type { DashboardScreenProps } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import type { StudyHeatmapDay } from "../studyHeatmapModel.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl, OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DailyReviewProgress, DAILY_REVIEW_PROGRESS_SEGMENTS } from "../ui/DailyReviewProgress.tsx";
import { DeckTree } from "../ui/DeckTree.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { formatLearningCardCount } from "../ui/learningStatusUi.ts";
import { DeckSelect } from "../ui/selectUi.tsx";
import { StudyHeatmap } from "../ui/StudyHeatmap.tsx";

function formatHeatmapDate(key: string) {
  const [year, month, date] = key.split("-");
  return `${date}.${month}.${year}`;
}

function heatmapDayLabel(day: StudyHeatmapDay) {
  const date = formatHeatmapDate(day.key);
  if (day.isOutsideRange) return `${date}: außerhalb des gewählten Zeitraums`;
  if (day.count === 0) return `${date}: keine Karten gelernt`;
  return `${date}: ${formatLearningCardCount(day.count)} gelernt`;
}

const DAILY_METRIC_ICONS = {
  learned: CheckCircle2,
  new: Sparkles,
  "in-progress": RefreshCcw,
  due: CalendarDays,
} as const;

function createAdditionalCardAmounts(availableCount: number) {
  return [...new Set([5, 10, 20]
    .map((count) => Math.min(count, availableCount))
    .filter((count) => count > 0))];
}

function AdditionalCardsDialog({
  open,
  decks,
  sessions,
  onOpenChange,
  onStartAdditionalCards,
}: {
  open: boolean;
  decks: Deck[];
  sessions: DailyLearningSession[];
  onOpenChange: (open: boolean) => void;
  onStartAdditionalCards: DashboardScreenProps["onStartAdditionalCards"];
}) {
  const eligibleDeckIds = React.useMemo(() => sessions.map((session) => session.deckId), [sessions]);
  const eligibleDecks = React.useMemo(
    () => decks.filter((deck) => eligibleDeckIds.includes(deck.id)),
    [decks, eligibleDeckIds],
  );
  const [deckId, setDeckId] = React.useState(() => sessions[0]?.deckId ?? "");
  const selectedSession = sessions.find((session) => session.deckId === deckId) ?? sessions[0] ?? null;
  const amountOptions = React.useMemo(
    () => createAdditionalCardAmounts(selectedSession?.additionalNewCount ?? 0),
    [selectedSession?.additionalNewCount],
  );
  const [amount, setAmount] = React.useState(() => String(amountOptions[0] ?? ""));
  const selectedAmount = amountOptions.includes(Number(amount)) ? amount : String(amountOptions[0] ?? "");
  const [status, setStatus] = React.useState("");

  function closeDialog() {
    setDeckId(sessions[0]?.deckId ?? "");
    setAmount("");
    setStatus("");
    onOpenChange(false);
  }

  function confirmAdditionalCards() {
    if (!selectedSession || !selectedAmount) {
      setStatus("Für diesen Stapel sind keine zusätzlichen neuen Karten verfügbar.");
      return;
    }
    const result = onStartAdditionalCards(selectedSession.deckId, Number(selectedAmount));
    if (!result.ok) {
      setStatus(result.message ?? "Die zusätzlichen Karten konnten nicht vorbereitet werden.");
      return;
    }
    closeDialog();
  }

  return (
    <ActionDialog
      open={open}
      title="Zusätzliche Karten lernen"
      description={(
        <div className="grid gap-5">
          <div className="core-field-group">
            <span className="core-field-label">Hauptstapel</span>
            <DeckSelect
              ariaLabel="Hauptstapel für zusätzliche Karten"
              value={selectedSession?.deckId ?? deckId}
              decks={eligibleDecks}
              selectableDeckIds={eligibleDeckIds}
              onValueChange={(value) => {
                setDeckId(value);
                setStatus("");
              }}
              className="w-full"
              testId="additional-cards-deck-select"
            />
          </div>
          <div className="core-field-group">
            <span className="core-field-label">Zusätzliche neue Karten</span>
            <CoreSegmentedControl
              ariaLabel="Anzahl zusätzlicher neuer Karten"
              options={amountOptions.map((count) => ({ value: String(count), label: `+${count}` }))}
              value={selectedAmount}
              onValueChange={(value) => {
                setAmount(value);
                setStatus("");
              }}
              className="w-full"
            />
          </div>
          {status ? <StatusMessage tone="error" announce="assertive">{status}</StatusMessage> : null}
        </div>
      )}
      confirmLabel={selectedAmount ? `${selectedAmount} ${Number(selectedAmount) === 1 ? "Karte" : "Karten"} lernen` : "Karten lernen"}
      cancelLabel="Abbrechen"
      onConfirm={confirmAdditionalCards}
      onCancel={closeDialog}
    />
  );
}

function DailyLearningOverview({
  plan,
  decks,
  onStartDeck,
  onStartAdditionalCards,
}: {
  plan: DailyLearningPlan;
  decks: Deck[];
  onStartDeck: DashboardScreenProps["onStartDeck"];
  onStartAdditionalCards: DashboardScreenProps["onStartAdditionalCards"];
}) {
  const [additionalDialogOpen, setAdditionalDialogOpen] = React.useState(false);
  const achieved = plan.status === "achieved";
  const firstStartableDeck = decks.find((deck) => deck.id === plan.firstStartableDeckId) ?? null;
  const additionalSessions = plan.sessions.filter((session) => session.additionalNewCount > 0);
  const title = achieved ? "Tagesziel erreicht" : "Dein Lernen heute";
  const Icon = achieved ? CheckCircle2 : Activity;
  const primaryLabel = achieved ? "Zusätzliche Karten lernen" : plan.status === "waiting" ? "Später weiterlernen" : "Jetzt lernen";
  const PrimaryIcon = achieved ? Plus : plan.status === "waiting" ? RefreshCcw : Play;
  const primaryDisabled = achieved ? additionalSessions.length === 0 : plan.status === "waiting" || !firstStartableDeck;

  function activatePrimaryAction() {
    if (achieved) {
      setAdditionalDialogOpen(true);
      return;
    }
    if (firstStartableDeck) onStartDeck(firstStartableDeck, false);
  }

  return (
    <>
      <SoftPanel className="overflow-hidden" data-testid="daily-learning-overview" data-status={plan.status}>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)]">
          <div className="min-w-0 p-5 sm:p-6 lg:p-7">
            <div className="flex items-center gap-4">
              <OrbIcon
                icon={Icon}
                className={achieved
                  ? "bg-[var(--core-surface-muted)] text-[var(--core-learning-goal-achieved)]"
                  : "bg-core-subtle text-core-action"}
              />
              <h2 className={`core-heading-3 font-semibold ${achieved ? "text-[var(--core-learning-goal-achieved)]" : "text-core-text"}`}>{title}</h2>
            </div>

            <div className="mt-6 grid gap-2">
              <div className="flex items-center justify-between gap-3 core-status-label uppercase tracking-wide text-core-muted">
                <span>Tagesziel</span>
                <span data-testid="daily-learning-total">{plan.progress.completedTodayCount} / {plan.progress.total} Karten</span>
              </div>
              <DailyReviewProgress
                progress={plan.progress}
                achieved={achieved}
                ariaLabel="Tagesziel"
                testId="dashboard-daily-progress"
              />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {DAILY_REVIEW_PROGRESS_SEGMENTS.map((segment) => {
                const MetricIcon = DAILY_METRIC_ICONS[segment.key];
                const color = achieved && segment.key === "learned" ? "var(--core-learning-goal-achieved)" : segment.color;
                return (
                  <div key={segment.key} className="flex min-w-0 items-center gap-3" data-daily-learning-metric={segment.key}>
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full"
                      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, var(--core-surface))` }}
                    >
                      <MetricIcon size={18} aria-hidden="true" />
                    </span>
                    <div className="grid min-w-0">
                      <dt className="order-2 core-caption text-core-muted">{segment.label}</dt>
                      <dd className="order-1 core-body-large font-semibold text-core-text">{plan.progress[segment.countKey]}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </div>

          <div className="grid content-center gap-3 border-t border-core-border p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
            <ActionButton
              type="button"
              variant="primary"
              icon={PrimaryIcon}
              disabled={primaryDisabled}
              onClick={activatePrimaryAction}
              className="w-full"
            >
              {primaryLabel}
            </ActionButton>
            <ActionButton type="button" variant="secondary" icon={CalendarSearch} disabled className="w-full">
              {achieved ? "Plan für morgen ansehen" : "Plan ansehen"}
            </ActionButton>
          </div>
        </div>
      </SoftPanel>

      <AdditionalCardsDialog
        open={additionalDialogOpen}
        decks={decks}
        sessions={additionalSessions}
        onOpenChange={setAdditionalDialogOpen}
        onStartAdditionalCards={onStartAdditionalCards}
      />
    </>
  );
}

export function DashboardScreen({ state, deckSummaries, studyHeatmap: loadedHeatmap, now, onNavigate, onStartDeck, onStartAdditionalCards, onCreateDemo, onSetDeckCoreMode, onMoveDeck, onOpenDeckSettings, onSetDeckExpanded }: DashboardScreenProps) {
  const globalSettings = getGlobalSchedulerPreferences(state.profile);
  const library = React.useMemo(
    () => createDeckLibraryModel(state.decks, { now, timeZone: state.profile.timezone || undefined, dayStartHour: globalSettings.dayStartHour, learnAheadMinutes: globalSettings.learnAheadMinutes, deckSummaries, studyHeatmap: loadedHeatmap }),
    [deckSummaries, globalSettings.dayStartHour, globalSettings.learnAheadMinutes, loadedHeatmap, now, state.decks, state.profile.timezone],
  );
  const { dailyLearningPlan, studyHeatmap } = library;
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

      <DailyLearningOverview
        plan={dailyLearningPlan}
        decks={state.decks}
        onStartDeck={onStartDeck}
        onStartAdditionalCards={onStartAdditionalCards}
      />

      <StudyHeatmap heatmap={studyHeatmap} formatDayLabel={heatmapDayLabel} />

      <DeckTree
        rows={library.rows}
        mode="dashboard"
        collapsedDeckIds={state.profile.uiPreferences.dashboardCollapsedDeckIds}
        onDeckExpansionChange={(deckId, expanded) => onSetDeckExpanded("dashboard", deckId, expanded)}
        headerAction={(
          <CrossLinkButton onSelect={() => onNavigate("lernen")}>Alle ansehen</CrossLinkButton>
        )}
        onActivate={(row) => onStartDeck(row.deck, false)}
        onOpenSettings={onOpenDeckSettings}
        onSetDeckCoreMode={onSetDeckCoreMode}
        onMoveDeck={onMoveDeck}
      />
    </div>
  );
}
