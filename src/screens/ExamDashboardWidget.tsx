import React from "react";
import { ChevronDown, ChevronUp, BookOpen, Play, Sparkles } from "lucide-react";
import type { DashboardScreenProps, ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { ExamDailyTask } from "../coreTypes.ts";
import { reconcileExamDailyTasks, setExamDailyTaskChecked } from "../examDailyTasks.ts";
import { examDayDistance } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { examColor } from "./examPlanningUi.ts";
import { useExamForecast } from "./useExamForecast.ts";

interface ExamDashboardWidgetProps {
  state: DashboardScreenProps["state"]; now: string;
  onLoad: ExamPlanningScreenProps["onLoadPlanningData"];
  onStart: (blockId: string | null) => Promise<void>;
  onSaveTasks: (tasks: ExamDailyTask[]) => Promise<void>;
  onOpen?: () => void;
  onLoadSummaryAvailability?: (deckId: string) => Promise<boolean>;
}

/** A persisted daily checklist; checking a task never changes the scheduler or answers cards. */
export function ExamDashboardWidget({ state, now, onLoad, onStart, onSaveTasks, onOpen, onLoadSummaryAvailability }: ExamDashboardWidgetProps) {
  const preferences = getGlobalSchedulerPreferences(state.profile);
  const settings = preferences.examPlanning;
  const { exams, capacity } = settings;
  const timeZone = state.profile.timezone || "UTC";
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const today = getLearningDayKey(now, { timeZone, dayStartHour: preferences.dayStartHour }) ?? civilToday;
  const { forecast, cards, current, busy, error, reload } = useExamForecast({ decks: state.decks, exams, capacity, preferences, now, timeZone, onLoadPlanningData: onLoad });
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
  const storedKey = JSON.stringify(settings.dailyTasks ?? []);
  const taskKey = JSON.stringify(tasks);
  const deckName = (id: string) => state.decks.find((deck) => deck.id === id)?.name ?? "Stapel";
  async function persist(next: ExamDailyTask[]) {
    setSaving(true); setSaveError("");
    try { await onSaveTasks(next); }
    catch (failure) { setSaveError(failure instanceof Error ? failure.message : "Die Checkliste konnte nicht gespeichert werden."); }
    finally { setSaving(false); }
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
  return <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="dashboard-exam-unit">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">Prüfungen · Heute</h2>{onOpen ? <ActionButton variant="secondary" onClick={onOpen}>Lernkalender öffnen</ActionButton> : null}</div>
    {busy ? <p role="status" className="core-body text-core-muted">Deine Aufgaben werden berechnet …</p> : null}
    {error || startError ? <StatusMessage tone="error">{startError || error}</StatusMessage> : null}
    {saveError ? <StatusMessage tone="error">{saveError} <button type="button" className="underline" disabled={saving} onClick={() => void persist(tasks)}>Erneut speichern</button></StatusMessage> : null}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{exams.filter((exam) => exam.status === "active" && exam.examDate > civilToday).sort((a, b) => a.examDate.localeCompare(b.examDate)).map((exam) => {
      const own = tasks.filter((task) => task.examId === exam.id).sort((a, b) => Number(a.completed !== null) - Number(b.completed !== null) || Number(a.kind !== "summary") - Number(b.kind !== "summary"));
      const expanded = expandedExams.includes(exam.id);
      const listId = `${taskListId}-${exam.id}`;
      const color = examColor(exams.indexOf(exam), exam);
      const openCount = own.filter((task) => !task.completed).length;
      return <section key={exam.id} className="grid min-w-0 content-start gap-3 rounded-panel border border-core-border p-4" aria-label={exam.name} style={{ background: `color-mix(in srgb, ${color} 10%, var(--core-surface))` }}>
        <div><h3 className="break-words core-heading-3 font-semibold text-core-text">{exam.name}</h3><p className="core-caption text-core-muted">In {examDayDistance(civilToday, exam.examDate)} Tagen · {current ? `${openCount} offene ${openCount === 1 ? "Aufgabe" : "Aufgaben"}` : "Aufgaben werden berechnet …"}</p></div>
        <ul id={listId} className="grid gap-2">{(expanded ? own : own.slice(0, 3)).map((task) => {
          const title = task.deckIds.map(deckName).join(" · ");
          const checked = task.completed !== null;
          return <li key={task.id} data-exam-todo={task.id} data-exam-block={task.kind} className="flex min-w-0 flex-wrap items-center gap-2 rounded-control bg-core-surface p-2">
            <label className={`flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3 px-1 ${task.kind === "quiz" ? "basis-full sm:basis-0" : ""}`}>
              <input type="checkbox" checked={checked} disabled={!current || busy || saving || starting || task.completed === "automatic"} aria-label={`${task.kind === "quiz" ? "Themenquiz: " : task.kind === "summary" ? "Zusammenfassung lesen: " : ""}${title} als erledigt markieren`} onChange={(event) => void persist(setExamDailyTaskChecked(tasks, task.id, event.target.checked))} className="size-5 shrink-0" style={{ accentColor: color }}/>
              <span className="min-w-0"><strong className={`block break-words core-body text-core-text ${checked ? "line-through" : ""}`}>{task.kind === "quiz" ? "Themenquiz" : task.kind === "summary" ? "Zusammenfassung lesen" : title}</strong>
                <span className="block break-words core-caption text-core-muted">{task.kind !== "study" ? title : `${task.cardIds.length} Karten`}{task.completed === "automatic" ? " · Automatisch erledigt" : checked ? " · Erledigt" : task.kind === "quiz" ? " · Empfohlen" : ""}</span>
                {task.kind === "summary" && summaryAvailability[task.deckIds[0]] === false ? <span className="block core-caption text-core-muted">Noch keine Zusammenfassung vorhanden</span> : null}
                {task.kind === "summary" && summaryAvailability[task.deckIds[0]] === null ? <span className="block core-caption text-core-muted">Zusammenfassung konnte nicht geprüft werden</span> : null}
              </span>
            </label>
            {task.kind === "quiz" ? <div className="grid w-full min-w-0 gap-1 sm:w-auto"><ActionButton className="w-full sm:w-auto" variant="secondary" icon={Sparkles} disabled>KI generieren</ActionButton><span className="core-caption text-core-muted">Quiz-Erstellung folgt</span></div> : <IconButton label={task.kind === "summary" ? `${title}: Zusammenfassungen öffnen` : `${title} lernen`} icon={task.kind === "summary" ? BookOpen : Play} variant="ghost" disabled={starting || !current || saving || Boolean(saveError) || taskKey !== storedKey || checked} onClick={() => void start(task.id)}/>}
          </li>;
        })}</ul>
        {own.length > 3 ? <ActionButton variant="secondary" icon={expanded ? ChevronUp : ChevronDown} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpandedExams((ids) => ids.includes(exam.id) ? ids.filter((id) => id !== exam.id) : [...ids, exam.id])}>
          {expanded ? "Weniger anzeigen" : `Alle ${own.length} Aufgaben anzeigen`}
        </ActionButton> : null}
        {current && !own.length ? <p className="core-body text-core-muted">Heute keine offenen Aufgaben für diese Prüfung.</p> : null}
      </section>;
    })}</div>
    <p className="core-caption text-core-muted">Lernaufgaben werden automatisch abgehakt, sobald alle eingeplanten Karten einschließlich ihrer Lernschritte erledigt sind. Manuelles Abhaken ändert deinen Kartenlernstand nicht.</p>
    <ActionButton variant="primary" icon={Play} loading={starting} disabled={starting || saving || Boolean(saveError) || taskKey !== storedKey || !current || !day?.blocks.length} onClick={() => void start(null)}>Heutige Einheit lernen</ActionButton>
  </SoftPanel>;
}
