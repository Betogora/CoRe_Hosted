import React from "react";
import { DashboardWidgets } from "./DashboardWidgets.tsx";
import { DailyMotivationWidget } from "./DailyMotivationWidget.tsx";
import { ExamDashboardWidget } from "./ExamDashboardWidget.tsx";
import { PinnedDecksWidget } from "./PinnedDecksWidget.tsx";
import { BookOpen, ChevronRight, Play } from "lucide-react";
import { createDeckLibraryModel, createStudyHeatmapModel, type DailyLearningPlan, type DailyLearningSession } from "../libraryModel.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import type { Deck, ExamDailyTask } from "../coreTypes.ts";
import { getLearningDayKey, getLearningTimeZone } from "../learningDay.ts";
import type { StudyHeatmapDay } from "../studyHeatmapModel.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, PageHeader } from "../ui/coreUi.tsx";
import { DialogFrame } from "../ui/DialogFrame.tsx";
import { DAILY_REVIEW_PROGRESS_SEGMENTS } from "../ui/DailyReviewProgress.tsx";
import { SectionHeader } from "../ui/SectionHeader.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { formatLearningCardCount } from "../ui/learningStatusUi.ts";
import { DeckSelect } from "../ui/selectUi.tsx";
import { StudyHeatmap } from "../ui/StudyHeatmap.tsx";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import type { WorkspaceState } from "../coreWorkspace.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import type { ExamPlanningScreenProps } from "./ExamPlanningScreen.tsx";
import type { DeckTreeScreenProps, NavigateToView } from "../appScreenProps.ts";

export interface DashboardScreenProps {
  onStartDeck: DeckTreeScreenProps["onStartDeck"];
  onPausePomodoro?: () => void;
  onResumePomodoro?: () => void;
  onResetPomodoro?: () => void;
  pomodoroTimer?: PomodoroTimer | null;
  onStartPomodoro?: (minutes: number) => void;
  state: WorkspaceState;
  now: string;
  onNavigate: NavigateToView;
  onStartAdditionalCards: (deckId: string, additionalCount: number) => { ok: boolean; message?: string };
  onCreateDemo: () => Promise<Deck[] | null>;
  frequentDeckIds: readonly string[];
  onSetPinnedDeckIds: (deckIds: string[]) => unknown;
  onStartExamUnit?: (blockId: string | null) => Promise<void>;
  onLoadExamPlanningData?: ExamPlanningScreenProps["onLoadPlanningData"];
  onSaveExamTasks?: (tasks: ExamDailyTask[]) => Promise<void>;
  onLoadExamSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadExamLocalCardIds?: ExamPlanningScreenProps["onLoadLocalCardIds"];
}

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
  const goalCount = achieved ? progress.completedTodayCount : remaining;
  const one = goalCount === 1;
  const goalLabel = achieved ? `${one ? "Karte" : "Karten"} gelernt.` : plan.status === "waiting" ? `${one ? "Karte kommt" : "Karten kommen"} später wieder.` : `${one ? "Karte" : "Karten"} noch heute`;
  const primaryLabel = achieved ? "Zusätzliche Karten lernen" : plan.status === "waiting" ? "Später weiterlernen" : "Jetzt lernen";
  const primaryDisabled = achieved ? additionalSessions.length === 0 : plan.status === "waiting" || !firstStartableDeck;
  const parts = DAILY_REVIEW_PROGRESS_SEGMENTS.filter((segment) => segment.key !== "learned" && progress[segment.countKey] > 0);

  function activatePrimaryAction() {
    if (achieved) {
      setAdditionalDialogOpen(true);
      return;
    }
    if (firstStartableDeck) onStartDeck(firstStartableDeck);
  }

  return (
    <>
      <section className="dashboard-poster dashboard-learning" data-tone={achieved ? "green" : plan.status === "waiting" ? "fog" : "navy"} data-testid="daily-learning-overview" data-status={plan.status}>
        <SectionHeader level={2} title="Heute" action={<span className="dashboard-poster-meta" data-testid="daily-learning-total">{progress.completedTodayCount} / {progress.total}<span className="sr-only"> Karten gelernt</span></span>} />
        <p className="dashboard-poster-goal"><span className="dashboard-poster-giant" style={{ "--digits": String(goalCount).length } as React.CSSProperties}>{goalCount}</span> <span className="dashboard-poster-subtitle">{goalLabel}</span></p>
        {plan.status === "open" && parts.length ? (
          <dl className="dashboard-learning-scale" style={{ gridTemplateColumns: parts.map((segment) => `minmax(max-content, ${progress[segment.countKey]}fr)`).join(" ") }}>
            {parts.map((segment) => (
              <div key={segment.key} data-daily-learning-metric={segment.key}>
                <dt>{segment.label}</dt>
                <dd>{progress[segment.countKey]}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <button type="button" className="dashboard-poster-action dashboard-learning-action" data-shade={achieved || undefined} disabled={primaryDisabled} onClick={activatePrimaryAction}>
          {plan.status === "open" && firstStartableDeck
            ? <span className="dashboard-learning-action-text">{primaryLabel}:<span className="dashboard-learning-deck"><BookOpen size={18} aria-hidden="true" /><span>{firstStartableDeck.name}</span></span></span>
            : <span className="dashboard-learning-action-text">{primaryLabel}</span>}
          <span className="dashboard-poster-play" aria-hidden="true"><Play size={18} /></span>
        </button>
      </section>

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

export function DashboardScreen({ state, now, onNavigate, onStartDeck, onStartAdditionalCards, onCreateDemo, frequentDeckIds, onSetPinnedDeckIds, onStartExamUnit, onLoadExamPlanningData, onSaveExamTasks, onLoadExamSummaryAvailability, onLoadExamLocalCardIds, pomodoroTimer = null, onStartPomodoro = () => undefined, onPausePomodoro = () => undefined, onResumePomodoro = () => undefined, onResetPomodoro = () => undefined }: DashboardScreenProps) {
  const { deckSummaries, studyHeatmap: loadedHeatmap } = useWorkspaceValue(({ deckSummaries, studyHeatmap }) => ({ deckSummaries, studyHeatmap }));
  const globalSettings = getGlobalSchedulerPreferences(state.profile);
  const library = React.useMemo(
    () => createDeckLibraryModel(state.decks, { now, timeZone: state.profile.timezone || undefined, dayStartHour: globalSettings.dayStartHour, learnAheadMinutes: globalSettings.learnAheadMinutes, deckSummaries }),
    [deckSummaries, globalSettings.dayStartHour, globalSettings.learnAheadMinutes, now, state.decks, state.profile.timezone],
  );
  const { dailyLearningPlan } = library;
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

        <section className="dashboard-poster dashboard-first-start" data-tone="navy">
          <div className="dashboard-first-start-text">
            <h2 className="dashboard-first-start-title">Womit möchtest du starten?</h2>
            <img src="/core-brain.svg" alt="" className="dashboard-first-start-mascot" draggable={false} />
          </div>
          <div className="dashboard-first-start-actions">
            {([
              ["Erste Karte erstellen", () => onNavigate("neue-karten", { creationMethod: "manual" })],
              ["Anki-Stapel importieren", () => onNavigate("neue-karten", { creationMethod: "import" })],
              [demoStatus === "busy" ? "Demo wird angelegt …" : "Demo ausprobieren", () => void createDemo()],
            ] as const).map(([title, onSelect], index) => (
              <button key={index} type="button" className="dashboard-poster-action" aria-busy={index === 2 && demoStatus === "busy" ? true : undefined} onClick={onSelect}>
                {title}<ChevronRight size={24} aria-hidden="true" />
              </button>
            ))}
            {demoStatus === "error" ? <StatusMessage tone="error" announce="assertive">Die Demo konnte nicht angelegt werden. Bitte versuche es erneut.</StatusMessage> : null}
          </div>
        </section>
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
      planner={nextExam && onStartExamUnit && onLoadExamPlanningData && onSaveExamTasks ? (
        <ExamDashboardWidget preview state={state} now={now} onStart={onStartExamUnit} onLoad={onLoadExamPlanningData} onLoadSummaryAvailability={onLoadExamSummaryAvailability} onLoadLocalCardIds={onLoadExamLocalCardIds} onSaveTasks={onSaveExamTasks} onOpen={() => onNavigate("pruefungen")} />
      ) : null}
    >
      {{
        learning: <DailyLearningOverview plan={dailyLearningPlan} decks={state.decks} onStartDeck={onStartDeck} onStartAdditionalCards={onStartAdditionalCards} />,
        motivation: <DailyMotivationWidget now={now} timeZone={getLearningTimeZone(state.profile)} dayStartHour={globalSettings.dayStartHour} />,
        heatmap: <StudyHeatmap heatmap={studyHeatmap} formatDayLabel={heatmapDayLabel} />,
        decks: <PinnedDecksWidget
          rows={library.rows}
          decks={state.decks}
          pinnedDeckIds={state.profile.uiPreferences.dashboardPinnedDeckIds}
          frequentDeckIds={frequentDeckIds}
          onPinnedDeckIdsChange={onSetPinnedDeckIds}
          onStudy={(row) => onStartDeck(row.deck)}
          onOpenLibrary={() => onNavigate("lernen")}
        />,
      }}
    </DashboardWidgets>
  );
}
