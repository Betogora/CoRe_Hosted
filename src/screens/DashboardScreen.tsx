import React from "react";
import { DashboardWidgets } from "./DashboardWidgets.tsx";
import { DailyMotivationWidget } from "./DailyMotivationWidget.tsx";
import { ExamDashboardWidget } from "./ExamDashboardWidget.tsx";
import { CreationActionCard } from "../ui/CreationActionCard.tsx";
import { ArrowUpRight, FileArchive, PenLine, Play, Sparkles } from "lucide-react";
import { createDeckLibraryModel, createStudyHeatmapModel, type DailyLearningPlan, type DailyLearningSession } from "../libraryModel.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import type { DashboardScreenProps } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { getLearningDayKey, getLearningTimeZone } from "../learningDay.ts";
import type { StudyHeatmapDay } from "../studyHeatmapModel.ts";
import { ActionButton, CrossLinkButton, IconButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DialogFrame } from "../ui/DialogFrame.tsx";
import { DailyReviewProgress, DAILY_REVIEW_PROGRESS_SEGMENTS } from "../ui/DailyReviewProgress.tsx";
import { DeckTree, useStoredDeckTreeView } from "../ui/DeckTree.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { formatLearningCardCount } from "../ui/learningStatusUi.ts";
import { DeckSelect } from "../ui/selectUi.tsx";
import { StudyHeatmap } from "../ui/StudyHeatmap.tsx";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";

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
    <DialogFrame
      open={open}
      title="Zusätzliche Karten lernen"
      size="s"
      onClose={closeDialog}
      footer={(
        <>
          <ActionButton variant="secondary" onClick={closeDialog}>Abbrechen</ActionButton>
          <ActionButton variant="primary" onClick={confirmAdditionalCards}>{selectedAmount ? `${selectedAmount} ${Number(selectedAmount) === 1 ? "Karte" : "Karten"} lernen` : "Karten lernen"}</ActionButton>
        </>
      )}
    >
        <div className="grid gap-4">
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
    </DialogFrame>
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
  const { progress } = plan;
  const remaining = progress.newCount + progress.inProgressCount + progress.dueCount;
  // The goal line leads the tile: the cards still open today, or today's learned cards once the goal is reached.
  const goalCount = achieved ? progress.completedTodayCount : remaining;
  const goalLabel = achieved
    ? `${goalCount === 1 ? "Karte" : "Karten"} gelernt · Tagesziel erreicht`
    : `${goalCount === 1 ? "Karte" : "Karten"} noch heute`;
  const primaryLabel = achieved ? "Zusätzliche Karten lernen" : plan.status === "waiting" ? "Später weiterlernen" : "Jetzt lernen";
  const primaryDisabled = achieved ? additionalSessions.length === 0 : plan.status === "waiting" || !firstStartableDeck;

  function activatePrimaryAction() {
    if (achieved) {
      setAdditionalDialogOpen(true);
      return;
    }
    if (firstStartableDeck) onStartDeck(firstStartableDeck);
  }

  return (
    <>
      <SoftPanel className="dashboard-learning min-w-0 p-6" data-testid="daily-learning-overview" data-status={plan.status}>
        <div className="dashboard-learning-body">
          <div className="dashboard-learning-goal">
            <h2 className="dashboard-learning-goal-title">
              <span className="dashboard-learning-goal-count">{goalCount}</span>{" "}
              <span className={achieved ? "text-[var(--core-learning-goal-achieved)]" : "text-core-secondary"}>{goalLabel}</span>
            </h2>
            <ActionButton variant="primary" icon={Play} disabled={primaryDisabled} onClick={activatePrimaryAction}>
              {primaryLabel}
            </ActionButton>
          </div>
          <div className="dashboard-learning-bar">
            <DailyReviewProgress progress={progress} achieved={achieved} ariaLabel="Tagesziel" testId="dashboard-daily-progress" />
          </div>
          <dl className="dashboard-learning-metrics">
            {DAILY_REVIEW_PROGRESS_SEGMENTS.map((segment) => (
              <div key={segment.key} className="dashboard-learning-metric" data-daily-learning-metric={segment.key}>
                <span className="dashboard-learning-dot" style={{ backgroundColor: segment.key === "learned" ? "var(--core-learning-progress-completed)" : segment.color }} aria-hidden="true" />
                <dt className="order-2 core-body text-core-muted">{segment.label}</dt>
                <dd className="order-1 dashboard-learning-metric-value">{progress[segment.countKey]}</dd>
              </div>
            ))}
          </dl>
          <span className="dashboard-learning-total core-caption font-medium tabular-nums text-core-muted" data-testid="daily-learning-total">{progress.completedTodayCount} / {progress.total} Karten</span>
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

export function DashboardScreen({ state, now, onNavigate, onStartDeck, onStartAdditionalCards, onCreateDemo, onSetDeckCoreMode, onMoveDeck, onOpenDeckSettings, onSetDeckExpanded, onStartExamUnit, onLoadExamPlanningData, onSaveExamTasks, onLoadExamSummaryAvailability, onLoadExamLocalCardIds, pomodoroTimer = null, onStartPomodoro = () => undefined, onPausePomodoro = () => undefined, onResumePomodoro = () => undefined, onResetPomodoro = () => undefined }: DashboardScreenProps) {
  const { deckSummaries, studyHeatmap: loadedHeatmap } = useWorkspaceValue(({ deckSummaries, studyHeatmap }) => ({ deckSummaries, studyHeatmap }));
  const globalSettings = getGlobalSchedulerPreferences(state.profile);
  const library = React.useMemo(
    () => createDeckLibraryModel(state.decks, { now, timeZone: state.profile.timezone || undefined, dayStartHour: globalSettings.dayStartHour, learnAheadMinutes: globalSettings.learnAheadMinutes, deckSummaries }),
    [deckSummaries, globalSettings.dayStartHour, globalSettings.learnAheadMinutes, now, state.decks, state.profile.timezone],
  );
  const { dailyLearningPlan } = library;
  const [deckView, setDeckView] = useStoredDeckTreeView("core.dashboard.deckView.v1");
  const deckRoots = React.useMemo(() => library.rows.filter((row) => row.depth === 0), [library.rows]);
  const teaserRootIds = React.useMemo(() => [...deckRoots].sort((a, b) => b.dailyLearningSession.startableCount - a.dailyLearningSession.startableCount).slice(0, 3).map((row) => row.id), [deckRoots]);
  const timeZone = state.profile.timezone || undefined;
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const nextExam = globalSettings.examPlanning.exams
    .filter((exam) => exam.status === "active" && exam.examDate > civilToday)
    .sort((a, b) => a.examDate.localeCompare(b.examDate))[0] ?? null;
  const studyHeatmap = React.useMemo(
    () => loadedHeatmap ?? createStudyHeatmapModel(state.decks, { now, timeZone, dayStartHour: globalSettings.dayStartHour }),
    [globalSettings.dayStartHour, loadedHeatmap, now, state.decks, timeZone],
  );
  const [demoStatus, setDemoStatus] = React.useState<"idle" | "busy" | "error">("idle");
  const demoBusyRef = React.useRef(false);
  const displayName = state.profile?.displayName?.trim();
  const welcomeTitle = displayName ? <span className="core-dashboard-name">{displayName}!</span> : "Willkommen bei CoRe";
  const welcomeGreeting = displayName ? "Willkommen zurück," : undefined;

  async function createDemo() {
    // A ref, not state: a fast double click must not start a second commit before the re-render.
    if (demoBusyRef.current) return;
    demoBusyRef.current = true;
    setDemoStatus("busy");
    try {
      await onCreateDemo();
      setDemoStatus("idle");
    } catch {
      setDemoStatus("error");
    } finally {
      demoBusyRef.current = false;
    }
  }

  if (state.decks.length === 0) {
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader greeting={welcomeGreeting} title={welcomeTitle} />

        <SoftPanel className="dashboard-first-start overflow-hidden p-6 sm:p-9">
          <img src="/core-brain.svg" alt="" className="dashboard-first-start-mascot" draggable={false} />
          <div className="dashboard-first-start-content min-w-0">
            <h2 className="core-heading-2 text-core-text">Womit möchtest du starten?</h2>
            <div className="dashboard-first-start-actions mt-6 grid gap-4">
              <CreationActionCard title="Erste Karte erstellen" description="Frage und Antwort direkt eingeben." icon={PenLine} onSelect={() => onNavigate("neue-karten", { creationMethod: "manual" })} />
              <CreationActionCard title="Anki-Stapel importieren" description="Vorhandene APKG-Datei laden." icon={FileArchive} onSelect={() => onNavigate("neue-karten", { creationMethod: "import" })} />
              <CreationActionCard title="Demo ausprobieren" description={demoStatus === "busy" ? "Beispielstapel wird angelegt …" : "Beispielstapel auf Klick anlegen."} icon={Sparkles} onSelect={() => void createDemo()} />
            </div>
            {demoStatus === "error" ? <StatusMessage className="mt-4" tone="error" announce="assertive">Die Demo konnte nicht angelegt werden. Bitte versuche es erneut.</StatusMessage> : null}
          </div>
        </SoftPanel>
      </div>
    );
  }

  return (
    <DashboardWidgets
      key={state.profile.userId}
      userId={state.profile.userId}
      header={(action) => <PageHeader greeting={welcomeGreeting} title={welcomeTitle} action={action} />}
      timer={pomodoroTimer}
      onStartTimer={onStartPomodoro}
      onPauseTimer={onPausePomodoro}
      onResumeTimer={onResumePomodoro}
      onResetTimer={onResetPomodoro}
      onOpenPlanner={() => onNavigate("pruefungen")}
      planner={nextExam && onStartExamUnit && onLoadExamPlanningData && onSaveExamTasks ? (preview) => (
        <ExamDashboardWidget preview={preview} state={state} now={now} onStart={onStartExamUnit} onLoad={onLoadExamPlanningData} onLoadSummaryAvailability={onLoadExamSummaryAvailability} onLoadLocalCardIds={onLoadExamLocalCardIds} onSaveTasks={onSaveExamTasks} onOpen={() => onNavigate("pruefungen")} />
      ) : null}
    >
      {{
        learning: <DailyLearningOverview plan={dailyLearningPlan} decks={state.decks} onStartDeck={onStartDeck} onStartAdditionalCards={onStartAdditionalCards} />,
        motivation: <DailyMotivationWidget now={now} timeZone={getLearningTimeZone(state.profile)} dayStartHour={globalSettings.dayStartHour} />,
        heatmap: <StudyHeatmap heatmap={studyHeatmap} formatDayLabel={heatmapDayLabel} className="p-5" />,
        decks: <SoftPanel className="min-w-0 p-5 sm:p-6"><DeckTree
          rows={library.rows}
          rootDeckIds={teaserRootIds}
          mode="dashboard"
          view={deckView}
          onViewChange={setDeckView}
          headerAction={<IconButton icon={ArrowUpRight} variant="ghost" label="Alle Stapel öffnen" onClick={() => onNavigate("lernen")} />}
          collapsedDeckIds={state.profile.uiPreferences.dashboardCollapsedDeckIds}
          onDeckExpansionChange={(deckId, expanded) => onSetDeckExpanded("dashboard", deckId, expanded)}
          onActivate={(row) => onNavigate("kartenstapel", { focusedDeckId: row.id, deckContent: true })}
          onStudy={(row) => onStartDeck(row.deck)}
          onOpenSettings={onOpenDeckSettings}
          onSetDeckCoreMode={onSetDeckCoreMode}
          onMoveDeck={onMoveDeck}
        />{deckRoots.length > 3 ? <CrossLinkButton className="mt-3" onSelect={() => onNavigate("lernen")}>Alle {deckRoots.length} Hauptstapel ansehen</CrossLinkButton> : null}</SoftPanel>,
      }}
    </DashboardWidgets>
  );
}
