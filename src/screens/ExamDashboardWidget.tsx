import React from "react";
import { BookOpen, Play } from "lucide-react";
import type { ExamDailyTask, ExamPlan } from "../coreTypes.ts";
import { reconcileExamDailyTasks, setExamDailyTaskChecked } from "../examDailyTasks.ts";
import { examDayDistance } from "../examPlanning.ts";
import { getLearningDayKey, getLearningTimeZone } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton, Disclosure, IconButton, ShowMoreButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { CoreCheckbox } from "../ui/formControls.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { examColor, examTextColor, formatExamCount, formatExamDistance } from "./examPlanningUi.ts";
import { useExamForecast, type ExamForecastState } from "./useExamForecast.ts";
import { DashboardTaskText } from "./DashboardTaskText.tsx";
import type { DashboardScreenProps } from "./DashboardScreen.tsx";
import type { ExamPlanningScreenProps } from "./ExamPlanningScreen.tsx";

interface ExamDashboardWidgetProps {
  state: DashboardScreenProps["state"]; now: string;
  onLoad: ExamPlanningScreenProps["onLoadPlanningData"];
  onStart: (blockId: string | null, examId?: string) => Promise<void>;
  onSaveTasks: (tasks: ExamDailyTask[]) => Promise<void>;
  onOpen?: () => void;
  onLoadSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadLocalCardIds?: (cardIds: string[]) => Promise<string[]>;
  /** The page's plan; without it the widget computes its own. */
  planning?: ExamForecastState;
  preview?: boolean;
  /** Shows only this exam's tasks, and its unit starts only this exam's cards. */
  examId?: string;
}

export function ExamDashboardWidget({ state, now, onLoad, onStart, onSaveTasks, onOpen, onLoadSummaryAvailability, onLoadLocalCardIds, planning, preview, examId }: ExamDashboardWidgetProps) {
  const preferences = React.useMemo(() => getGlobalSchedulerPreferences(state.profile), [state.profile]);
  const settings = preferences.examPlanning;
  const { exams, capacity } = settings;
  const timeZone = getLearningTimeZone(state.profile);
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const today = getLearningDayKey(now, { timeZone, dayStartHour: preferences.dayStartHour }) ?? civilToday;
  const ownPlanning = useExamForecast({ decks: state.decks, exams, capacity, preferences, now, timeZone, onLoadPlanningData: onLoad, enabled: !planning });
  const { forecast, cards, current, busy, error, offline, reload } = planning ?? ownPlanning;
  // Offline, today's stored targets stay usable without a new plan.
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
    try { await onStart(blockId, examId); reload(); }
    catch (failure) { setStartError(failure instanceof Error ? failure.message : "Die Einheit konnte nicht gestartet werden."); }
    finally { setStarting(false); }
  }
  const groups = exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday && (!examId || exam.id === examId)).sort((a, b) => a.examDate.localeCompare(b.examDate)).map((exam) => ({
    exam,
    tasks: (pending ?? tasks).filter((task) => task.examId === exam.id).sort((a, b) => Number(a.completed !== null) - Number(b.completed !== null) || Number(a.kind !== "summary") - Number(b.kind !== "summary")),
  }));
  const completedTasks = groups.flatMap((group) => group.tasks.filter((task) => task.completed !== null));
  const unitTasks = tasks.filter((task) => task.kind === "study" && (!examId || task.examId === examId));
  const startDisabled = starting || saving || Boolean(saveError) || taskKey !== storedKey || (current ? examId ? !unitTasks.length : !day?.blocks.length : !offline || !unitTasks.some((task) => localCount(task) !== 0));
  const openCount = groups.reduce((sum, group) => sum + group.tasks.filter((task) => !task.completed).length, 0);

  function renderTask(task: ExamDailyTask, color: string) {
    const title = task.deckIds.map(deckName).join(" · ");
    const checked = task.completed !== null, local = localCount(task);
    const inputId = `${taskListId}-${task.id}`;
    const text = <span className="min-w-0"><strong className={`block break-words hyphens-auto core-body text-core-text ${checked ? "line-through" : ""}`}>{task.kind === "summary" ? "Zusammenfassung lesen" : title}</strong><span className="block break-words core-caption text-core-muted">{task.kind === "summary" ? title : formatExamCount(task.cardIds.length, "Karte", "Karten")}{task.completed === "automatic" ? " · Automatisch erledigt" : checked ? " · Erledigt" : ""}</span></span>;
    const checkbox = <CoreCheckbox id={inputId} checked={checked} disabled={!ready || busy || saving || starting || task.completed === "automatic"} aria-label={`${task.kind === "summary" ? "Zusammenfassung lesen: " : ""}${title} als erledigt markieren`} onCheckedChange={(next) => void persist(setExamDailyTaskChecked(tasks, task.id, next))} accent={{ fill: color, on: examTextColor(exams.find((exam) => exam.id === task.examId) ?? {}) }}/>;
    return <li key={task.id} data-exam-todo={task.id} data-exam-block={task.kind} className={preview ? "dashboard-todo" : "flex min-w-0 items-center gap-2 py-1.5"} style={preview ? { "--dashboard-exam-color": color } as React.CSSProperties : undefined}>
      <div className="min-h-control min-w-0 flex-1 content-center">
        {preview ? <DashboardTaskText checkbox={checkbox}>{text}</DashboardTaskText> : <label className="flex min-h-control min-w-0 cursor-pointer items-center gap-3">{checkbox}{text}</label>}
        {local !== undefined && local < task.cardIds.length ? <span className="block core-caption text-core-muted">{local ? `${local} offline, Rest erst online verfügbar` : "Erst online verfügbar"}</span> : null}
        {task.kind === "summary" && summaryAvailability[task.deckIds[0]] === false ? <span className="block core-caption text-core-muted">Noch keine Zusammenfassung vorhanden</span> : null}
        {task.kind === "summary" && summaryAvailability[task.deckIds[0]] === null ? <span className="block core-caption text-core-muted">Zusammenfassung konnte nicht geprüft werden</span> : null}
      </div>
      <IconButton label={task.kind === "summary" ? `${title}: Zusammenfassungen öffnen` : `${title} lernen`} icon={task.kind === "summary" ? BookOpen : Play} variant="ghost" className={preview ? "dashboard-poster-dot" : undefined} disabled={starting || !ready || local === 0 || saving || Boolean(saveError) || taskKey !== storedKey} onClick={() => void start(task.id)}/>
    </li>;
  }
  const statuses = <>
    {busy ? <p role="status" className="core-body text-core-muted">Deine Aufgaben werden berechnet …</p> : null}
    {offline ? <StatusMessage tone="info">{tasks.length ? "Offline: zuletzt geplante Aufgaben" : "Die Prüfungsplanung braucht eine Verbindung."}</StatusMessage> : null}
    {error || startError ? <StatusMessage tone="error">{startError || error}</StatusMessage> : null}
    {saveError ? <StatusMessage tone="error">{saveError} <button type="button" className="underline" disabled={saving} onClick={() => void persist(tasks)}>Erneut speichern</button></StatusMessage> : null}
  </>;
  if (preview) return <div className="dashboard-todos-planner" data-testid="dashboard-exam-unit">
    {statuses}
    {groups.map(({ exam, tasks: own }, index) => {
      const color = examColor(exams.indexOf(exam), exam);
      const shown = own.filter((task) => task.completed === null);
      if (index > 0 && !shown.length) return null;
      return <section key={exam.id} aria-label={exam.name}>
        <div className="dashboard-todos-exam"><h3>{exam.name}</h3><span>{formatExamDistance(examDayDistance(civilToday, exam.examDate))}</span>
          {index === 0 ? <ActionButton variant="primary" icon={Play} loading={starting} disabled={startDisabled} className="dashboard-poster-pill" aria-label="Heutige Einheit lernen" onClick={() => void start(null)}>Einheit lernen</ActionButton> : null}</div>
        <ul>{shown.map((task) => renderTask(task, color))}</ul>
      </section>;
    })}
    {completedTasks.length ? <Disclosure summary={`Erledigt im Planer (${completedTasks.length})`}><ul className="mt-2">{completedTasks.map((task) => renderTask(task, examColor(exams.findIndex((exam) => exam.id === task.examId), exams.find((exam) => exam.id === task.examId))))}</ul></Disclosure> : null}
  </div>;
  function renderTaskList(exam: ExamPlan, own: ExamDailyTask[], color: string) {
    const expanded = expandedExams.includes(exam.id);
    const listId = `${taskListId}-${exam.id}`;
    const shown = expanded ? own : own.slice(0, 3);
    return <div className="grid min-w-0 gap-2"><ul id={listId} className="grid divide-y divide-core-border">{shown.map((task) => renderTask(task, color))}</ul>
      {own.length > 3 ? <ShowMoreButton expanded={expanded} hiddenCount={own.length - 3} controls={listId} onToggle={() => setExpandedExams((ids) => ids.includes(exam.id) ? ids.filter((id) => id !== exam.id) : [...ids, exam.id])} /> : null}</div>;
  }
  const openLabel = ready ? formatExamCount(openCount, "offene Aufgabe", "offene Aufgaben") : "Aufgaben werden berechnet …";
  if (examId) {
    const group = groups[0];
    return <section className="exam-page-today grid min-w-0 content-start gap-3" aria-labelledby={`${taskListId}-today`} data-testid="exam-today-tasks">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2"><h3 id={`${taskListId}-today`} className="core-heading-3 text-core-text">Heute</h3><span className="mr-auto core-body text-core-muted">{openLabel}</span>
        <ActionButton variant="primary" icon={Play} loading={starting} disabled={startDisabled} onClick={() => void start(null)}>Heutige Einheit lernen</ActionButton></div>
      {statuses}
      {group?.tasks.length ? renderTaskList(group.exam, group.tasks, examColor(exams.indexOf(group.exam), group.exam)) : ready ? <p className="core-body text-core-muted">Heute keine offenen Aufgaben für diese Prüfung.</p> : null}
    </section>;
  }
  return <SoftPanel className="exam-today-layout grid min-w-0 overflow-hidden p-0" data-testid="dashboard-exam-unit">
    <div className="dashboard-poster exam-today-head" data-tone="navy">
      <h2 className="exam-poster-eyebrow">Prüfungen · Heute</h2>
      <div className="exam-today-head-row">
        <p className="exam-today-count"><span className="exam-today-count-number">{ready ? openCount : "–"}</span><span>{openCount === 1 ? "Aufgabe" : "Aufgaben"}<br />offen</span></p>
        <button type="button" className="dashboard-poster-action exam-today-start" disabled={startDisabled} aria-busy={starting || undefined} onClick={() => void start(null)}>Heutige Einheit lernen<span className="dashboard-poster-play"><Play size={18} aria-hidden="true" /></span></button>
      </div>
    </div>
    <div className="grid min-w-0 gap-4 p-3 min-[360px]:p-4 sm:p-6">
    {onOpen ? <ActionButton variant="secondary" className="justify-self-start" onClick={onOpen}>Lernkalender öffnen</ActionButton> : null}
    {statuses}
    <div className="exam-today-grid grid min-w-0 items-start gap-4">{groups.map(({ exam, tasks: own }) => {
      const color = examColor(exams.indexOf(exam), exam);
      const ownOpen = own.filter((task) => !task.completed).length;
      return <section key={exam.id} className="grid min-w-0 content-start gap-3 rounded-inset bg-core-subtle p-3 min-[360px]:p-4" aria-label={exam.name}>
        <div><h3 className="flex min-w-0 items-center gap-2 core-heading-3 text-core-text"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-round" style={{ backgroundColor: color }} /><span className="min-w-0 break-words">{exam.name}</span></h3><p className="mt-0.5 core-caption text-core-muted">Prüfung {formatExamDistance(examDayDistance(civilToday, exam.examDate))} · {ready ? formatExamCount(ownOpen, "offene Aufgabe", "offene Aufgaben") : "Aufgaben werden berechnet …"}</p></div>
        {renderTaskList(exam, own, color)}
        {ready && !own.length ? <p className="core-body text-core-muted">Heute keine offenen Aufgaben für diese Prüfung.</p> : null}
      </section>;
    })}</div>
    </div>
  </SoftPanel>;
}
