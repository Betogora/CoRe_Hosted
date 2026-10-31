import React from "react";
import { ChevronDown, ChevronUp, BookOpen, Play } from "lucide-react";
import type { DashboardScreenProps, ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { ExamDailyTask } from "../coreTypes.ts";
import { reconcileExamDailyTasks, setExamDailyTaskChecked } from "../examDailyTasks.ts";
import { examDayDistance } from "../examPlanning.ts";
import { getLearningDayKey, getLearningTimeZone } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { examColor, formatExamCount, formatExamDistance } from "./examPlanningUi.ts";
import { useExamForecast, type ExamForecastState } from "./useExamForecast.ts";

interface ExamDashboardWidgetProps {
  state: DashboardScreenProps["state"]; now: string;
  onLoad: ExamPlanningScreenProps["onLoadPlanningData"];
  onStart: (blockId: string | null) => Promise<void>;
  onSaveTasks: (tasks: ExamDailyTask[]) => Promise<void>;
  onOpen?: () => void;
  onLoadSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadLocalCardIds?: (cardIds: string[]) => Promise<string[]>;
  /** The page's plan; without it the widget computes its own (Heute). */
  planning?: ExamForecastState;
}

/** A persisted daily checklist; checking a task never changes the scheduler or answers cards. */
export function ExamDashboardWidget({ state, now, onLoad, onStart, onSaveTasks, onOpen, onLoadSummaryAvailability, onLoadLocalCardIds, planning }: ExamDashboardWidgetProps) {
  const preferences = getGlobalSchedulerPreferences(state.profile);
  const settings = preferences.examPlanning;
  const { exams, capacity } = settings;
  const timeZone = getLearningTimeZone(state.profile);
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const today = getLearningDayKey(now, { timeZone, dayStartHour: preferences.dayStartHour }) ?? civilToday;
  const ownPlanning = useExamForecast({ decks: state.decks, exams, capacity, preferences, now, timeZone, onLoadPlanningData: onLoad, enabled: !planning });
  const { forecast, cards, current, busy, error, offline, reload } = planning ?? ownPlanning;
  // Offline the stored targets of today stay usable without a new plan (E12).
  const ready = current || offline;
  const [summaryAvailability, setSummaryAvailability] = React.useState<Record<string, boolean | null>>({});
  const [starting, setStarting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [startError, setStartError] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [expandedExams, setExpandedExams] = React.useState<string[]>([]);
  const taskListId = React.useId();
  const attempted = React.useRef("");
  const day = current ? forecast?.days.find((entry) => entry.key === today) : null;
  const tasks = current && forecast ? reconcileExamDailyTasks(settings, state.decks, forecast, cards, now, timeZone, preferences.dayStartHour) : (settings.dailyTasks ?? []).filter((task) => task.date === today);
  const summaryScope = [...new Set(tasks.filter((task) => task.kind === "summary").flatMap((task) => task.deckIds))].sort().join("\n");
  React.useEffect(() => {
    if (!onLoadSummaryAvailability || !summaryScope) return;
    let active = true;
    void Promise.all(summaryScope.split("\n").map(async (id) => [id, await onLoadSummaryAvailability(id).catch(() => null)] as const)).then((entries) => { if (active) setSummaryAvailability(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [summaryScope, onLoadSummaryAvailability]);
  const [localCards, setLocalCards] = React.useState<{ key: string; counts: Record<string, number> } | null>(null);
  const studyTargets = offline ? JSON.stringify(tasks.filter((task) => task.kind === "study").map((task) => [task.id, task.cardIds])) : "";
  React.useEffect(() => {
    if (!studyTargets || !onLoadLocalCardIds) return;
    let active = true;
    const targets = JSON.parse(studyTargets) as Array<[string, string[]]>;
    void Promise.all(targets.map(async ([id, cardIds]) => [id, (await onLoadLocalCardIds(cardIds).catch(() => [])).length] as const))
      .then((entries) => { if (active) setLocalCards({ key: studyTargets, counts: Object.fromEntries(entries) }); });
    return () => { active = false; };
  }, [studyTargets, onLoadLocalCardIds]);
  const localCount = (task: ExamDailyTask) => localCards?.key === studyTargets ? localCards.counts[task.id] : undefined;
  const storedKey = JSON.stringify(settings.dailyTasks ?? []);
  const taskKey = JSON.stringify(tasks);
  const deckName = (id: string) => state.decks.find((deck) => deck.id === id)?.name ?? "Stapel";
  // The checklist shows the change at once; a failed save brings back the stored state.
  const [pending, setPending] = React.useState<ExamDailyTask[] | null>(null);
  async function persist(next: ExamDailyTask[]) {
    setSaving(true); setSaveError(""); setPending(next);
    try { await onSaveTasks(next); }
    catch (failure) { setSaveError(failure instanceof Error ? failure.message : "Die Checkliste konnte nicht gespeichert werden."); }
    finally { setSaving(false); setPending(null); }
  }
  const saveReconciled = React.useEffectEvent(() => persist(tasks));
  React.useEffect(() => {
    const key = `${state.profile.userId}:${taskKey}`;
    if (!current || busy || saving || taskKey === storedKey || attempted.current === key) return;
    attempted.current = key;
    void saveReconciled();
  }, [current, busy, saving, storedKey, taskKey, state.profile.userId]);
  async function start(blockId: string | null) {
    setStarting(true); setStartError("");
    try { await onStart(blockId); reload(); }
    catch (failure) { setStartError(failure instanceof Error ? failure.message : "Die Einheit konnte nicht gestartet werden."); }
    finally { setStarting(false); }
  }
  return <SoftPanel className="exam-today-layout grid min-w-0 gap-4 p-3 min-[360px]:p-4 sm:p-6" data-testid="dashboard-exam-unit">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">Prüfungen · Heute</h2>{onOpen ? <ActionButton variant="secondary" onClick={onOpen}>Lernkalender öffnen</ActionButton> : null}</div>
    {busy ? <p role="status" className="core-body text-core-muted">Deine Aufgaben werden berechnet …</p> : null}
    {offline ? <StatusMessage tone="info">{tasks.length ? "Offline: zuletzt geplante Aufgaben" : "Die Prüfungsplanung braucht eine Verbindung."}</StatusMessage> : null}
    {error || startError ? <StatusMessage tone="error">{startError || error}</StatusMessage> : null}
    {saveError ? <StatusMessage tone="error">{saveError} <button type="button" className="underline" disabled={saving} onClick={() => void persist(tasks)}>Erneut speichern</button></StatusMessage> : null}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-control border border-core-border bg-core-surface p-3">
      <h3 className="core-heading-3 text-core-text">Deine heutige Einheit</h3>
    <ActionButton variant="primary" icon={Play} loading={starting} disabled={starting || saving || Boolean(saveError) || taskKey !== storedKey || (current ? !day?.blocks.length : !offline || !tasks.some((task) => task.kind === "study" && localCount(task) !== 0))} onClick={() => void start(null)}>Heutige Einheit lernen</ActionButton>
    </div>
    <div className="exam-today-grid grid min-w-0 items-start gap-4">{exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday).sort((a, b) => a.examDate.localeCompare(b.examDate)).map((exam) => {
      const own = tasks.filter((task) => task.examId === exam.id).sort((a, b) => Number(a.completed !== null) - Number(b.completed !== null) || Number(a.kind !== "summary") - Number(b.kind !== "summary"));
      const expanded = expandedExams.includes(exam.id);
      const listId = `${taskListId}-${exam.id}`;
      const color = examColor(exams.indexOf(exam), exam);
      const openCount = own.filter((task) => !task.completed).length;
      return <section key={exam.id} className="grid min-w-0 content-start gap-3 rounded-panel border border-core-border bg-core-subtle p-3 min-[360px]:p-4" aria-label={exam.name}>
        <div><h3 className="flex min-w-0 items-center gap-2 core-heading-3 text-core-text"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-round" style={{ backgroundColor: color }} /><span className="min-w-0 break-words">{exam.name}</span></h3><p className="mt-0.5 core-caption text-core-muted">Prüfung {formatExamDistance(examDayDistance(civilToday, exam.examDate))} · {ready ? formatExamCount(openCount, "offene Aufgabe", "offene Aufgaben") : "Aufgaben werden berechnet …"}</p></div>
        <ul id={listId} className="grid gap-2">{(expanded ? own : own.slice(0, 3)).map((task) => {
          const title = task.deckIds.map(deckName).join(" · ");
          const checked = (pending?.find((entry) => entry.id === task.id) ?? task).completed !== null, local = localCount(task);
          return <li key={task.id} data-exam-todo={task.id} data-exam-block={task.kind} className="flex min-w-0 flex-wrap items-center gap-2 rounded-control border border-core-border bg-core-surface p-2 shadow-soft">
            <label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3 px-1">
              <input type="checkbox" checked={checked} disabled={!ready || busy || saving || starting || task.completed === "automatic"} aria-label={`${task.kind === "summary" ? "Zusammenfassung lesen: " : ""}${title} als erledigt markieren`} onChange={(event) => void persist(setExamDailyTaskChecked(tasks, task.id, event.target.checked))} className="size-5 shrink-0" style={{ accentColor: color }}/>
              <span className="min-w-0"><strong className={`block break-words hyphens-auto core-body text-core-text ${checked ? "line-through" : ""}`}>{task.kind === "summary" ? "Zusammenfassung lesen" : title}</strong>
                <span className="block break-words core-caption text-core-muted">{task.kind === "summary" ? title : formatExamCount(task.cardIds.length, "Karte", "Karten")}{task.completed === "automatic" ? " · Automatisch erledigt" : checked ? " · Erledigt" : ""}</span>
                {local !== undefined && local < task.cardIds.length ? <span className="block core-caption text-core-muted">{local ? `${local} offline, Rest erst online verfügbar` : "Erst online verfügbar"}</span> : null}
                {task.kind === "summary" && summaryAvailability[task.deckIds[0]] === false ? <span className="block core-caption text-core-muted">Noch keine Zusammenfassung vorhanden</span> : null}
                {task.kind === "summary" && summaryAvailability[task.deckIds[0]] === null ? <span className="block core-caption text-core-muted">Zusammenfassung konnte nicht geprüft werden</span> : null}
              </span>
            </label>
            <IconButton label={task.kind === "summary" ? `${title}: Zusammenfassungen öffnen` : `${title} lernen`} icon={task.kind === "summary" ? BookOpen : Play} variant="ghost" disabled={starting || !ready || local === 0 || saving || Boolean(saveError) || taskKey !== storedKey} onClick={() => void start(task.id)}/>
          </li>;
        })}</ul>
        {own.length > 3 ? <ActionButton variant="secondary" icon={expanded ? ChevronUp : ChevronDown} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpandedExams((ids) => ids.includes(exam.id) ? ids.filter((id) => id !== exam.id) : [...ids, exam.id])}>
          {expanded ? "Weniger anzeigen" : `Alle ${own.length} Aufgaben anzeigen`}
        </ActionButton> : null}
        {ready && !own.length ? <p className="core-body text-core-muted">Heute keine offenen Aufgaben für diese Prüfung.</p> : null}
      </section>;
    })}</div>
  </SoftPanel>;
}
