import React from "react";
import { examColor, formatExamDate, formatExamPercent } from "./examPlanningUi.ts";
import { CalendarCheck, ChevronDown, Pause, Pencil, Play, Plus, RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import type { ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { ExamPlan, ExamPlanningSettings, StudyTimeCapacity } from "../coreTypes.ts";
import { removeExamPlan, upsertExamPlan } from "../examPlanSettings.ts";
import { examDayDistance, getExamCurrentProgress, type ExamForecastSummary } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { ExamPlanEditor } from "./ExamPlanEditor.tsx";
import { ExamCalendar } from "./ExamCalendar.tsx";
import { ExamDashboardWidget } from "./ExamDashboardWidget.tsx";
import { withExamDailyTasks } from "../examDailyTasks.ts";
import { useExamForecast } from "./useExamForecast.ts";

export const EXAM_METHOD_LABELS = { new: "Neue Karten", review: "Wiederholungen", relearning: "Lernschritte", variant: "Varianten" } as const;
const STATUS_LABELS: Record<ExamPlan["status"], string> = { active: "Aktiv", paused: "Pausiert", completed: "Abgeschlossen" };

interface ExamCardProps {
  exam: ExamPlan;
  color: string;
  summary: ExamForecastSummary | null;
  progress: ReturnType<typeof getExamCurrentProgress> | null;
  civilToday: string;
  busy: boolean;
  editor: React.ReactNode;
  onCloseEditor: () => void;
  onEdit: () => void;
  onStatus: (status: ExamPlan["status"]) => void;
  onDelete: () => void;
}

function ExamCard({ exam, color, summary, progress, civilToday, busy, editor, onCloseEditor, onEdit, onStatus, onDelete }: ExamCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const detailsId = React.useId();
  const daysLeft = examDayDistance(civilToday, exam.examDate);
  const past = daysLeft <= 0;
  const readiness = summary?.current ?? progress;
  const total = summary?.totalCards ?? progress?.totalCards;
  const known = total === undefined || !readiness ? null : Math.round(total * readiness.coverage);
  const remaining = total === undefined || known === null ? null : total - known;
  const progressDescriptionId = React.useId();
  const open = expanded || Boolean(editor);
  return (
    <SoftPanel className={`grid min-w-0 content-start p-4 sm:p-6 ${editor ? "lg:col-span-2" : ""}`} data-testid={`exam-card-${exam.id}`} data-status={exam.status}>
      <h4>
        <button type="button" disabled={busy} aria-expanded={open} aria-controls={detailsId} aria-label={`${exam.name}: ${open ? "Details schließen" : "Details öffnen"}`} onClick={() => editor ? onCloseEditor() : setExpanded(!expanded)} className="flex min-h-control w-full min-w-0 items-center gap-3 text-left">
          <span className="grow min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="size-2 shrink-0 rounded-round border border-core-border" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="min-w-0 break-words core-heading-3 font-semibold text-core-text">{exam.name}</span>
              <span className={`rounded-round px-2 py-1 core-caption font-medium ${exam.status === "paused" ? "bg-core-warning-soft text-core-text" : exam.status === "completed" ? "bg-core-success-soft text-core-text" : "bg-core-subtle text-core-muted"}`}>{STATUS_LABELS[exam.status]}</span>
            </span>
            <span className="mt-1 block core-caption font-normal text-core-muted">{formatExamDate(exam.examDate)} · {past ? "Termin erreicht" : `Noch ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}`}</span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-core-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </h4>
      {open ? <div id={detailsId} className="mt-4 grid min-w-0 gap-4 border-t border-core-border pt-4" data-testid="exam-card-details">
        {editor ?? <>
          {readiness ? <>
            <dl className="grid grid-cols-2 gap-4">
              <div><dt className="core-caption text-core-muted">Mindestens einmal gelernt</dt><dd className="mt-1 core-heading-3 font-semibold text-core-text">{known ?? "–"}<span className="core-body font-normal text-core-muted"> / {total ?? "–"}</span></dd></div>
              <div><dt className="core-caption text-core-muted">Noch ungesehen</dt><dd className="mt-1 core-heading-3 font-semibold text-core-text">{remaining ?? "–"}</dd></div>
            </dl>
            <div className="grid gap-2">
              <div role="progressbar" aria-label={`${exam.name}: Lernfortschritt`} aria-describedby={progressDescriptionId} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(readiness.coverage * 100)} aria-valuetext={`${formatExamPercent(readiness.coverage)} gesehen, davon ${formatExamPercent(readiness.consolidated)} aller Karten gefestigt`} className="relative h-1.5 overflow-hidden rounded-round bg-core-subtle">
                <div data-testid="exam-progress-seen" className="absolute inset-y-0 left-0 rounded-round bg-core-action" style={{ width: `${readiness.coverage * 100}%` }} />
                <div data-testid="exam-progress-consolidated" className="absolute inset-y-0 left-0 rounded-round bg-core-success" style={{ width: `${readiness.consolidated * 100}%` }} />
              </div>
              <ul aria-label="Legende zum Lernfortschritt" className="flex flex-wrap gap-x-4 gap-y-2 core-caption text-core-muted">
                <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-round bg-core-action" />Gesehen · {formatExamPercent(readiness.coverage)}</li>
                <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-round bg-core-success" />Gefestigt · {formatExamPercent(readiness.consolidated)}</li>
              </ul>
              <p id={progressDescriptionId} className="core-caption text-core-muted">Gefestigt: bereits gesehene Karten ab Lernstufe Stabil, ohne aktuellen Rückfall. Varianten zählen mit.</p>
            </div>
          </> : <p className="core-body text-core-muted">Der Lernstand ist noch nicht verfügbar.</p>}
          {exam.status === "active" && past ? <StatusMessage tone="warning">Schließe die Prüfung ab oder ändere das Datum.</StatusMessage> : null}
          {summary?.issues.map((issue) => <StatusMessage key={issue} tone="info">{issue}</StatusMessage>)}
          {summary?.decks.length ? <details className="group min-w-0"><summary className="flex min-h-control cursor-pointer list-none items-center gap-2 core-body font-semibold text-core-text"><ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />Stapel · {summary.decks.length}</summary><ul className="mt-2 grid gap-2">{summary.decks.map((deck) => <li key={deck.deckId} className="flex min-w-0 justify-between gap-3 core-body"><span className="min-w-0 break-words text-core-text">{deck.name}</span><span className="shrink-0 text-core-muted">{deck.known} / {deck.total}</span></li>)}</ul></details> : null}
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap [&_svg]:shrink-0">
            <ActionButton variant="secondary" icon={Pencil} disabled={busy} onClick={onEdit}>Bearbeiten</ActionButton>
            <ActionButton variant="secondary" icon={exam.status === "active" ? Pause : Play} disabled={busy || (exam.status !== "active" && past)} onClick={() => onStatus(exam.status === "active" ? "paused" : "active")}>{exam.status === "active" ? "Pausieren" : exam.status === "completed" ? "Wieder öffnen" : "Fortsetzen"}</ActionButton>
            {exam.status !== "completed" ? <ActionButton variant="secondary" icon={CalendarCheck} disabled={busy} onClick={() => onStatus("completed")}>Abschließen</ActionButton> : null}
            <ActionButton variant="secondary" icon={Trash2} disabled={busy} onClick={onDelete}>Löschen</ActionButton>
          </div>
        </>}
      </div> : null}
    </SoftPanel>
  );
}

/** Global exam planner (ADR-042), with relative study time for each exam. */
export function ExamPlanningScreen({ state, deckSummaries, now, onLoadPlanningData, onSavePlanning, onStartUnit, onLoadSummaryAvailability }: ExamPlanningScreenProps) {
  const preferences = getGlobalSchedulerPreferences(state.profile);
  const [calendarDraft, setCalendarDraft] = React.useState<ExamPlanningSettings | null>(null);
  const { exams, capacity } = calendarDraft ?? preferences.examPlanning;
  const timeZone = state.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const todayKey = getLearningDayKey(now, { timeZone, dayStartHour: preferences.dayStartHour }) ?? civilToday;
  const [editing, setEditing] = React.useState<ExamPlan | "new" | null>(null);
  const [editorDirty, setEditorDirty] = React.useState(false);
  const [pendingEditor, setPendingEditor] = React.useState<{ next: ExamPlan | "new" | null } | null>(null);
  const [statusChange, setStatusChange] = React.useState<{ exam: ExamPlan; status: ExamPlan["status"] } | null>(null);
  const [deletedPlan, setDeletedPlan] = React.useState<{ exam: ExamPlan; index: number; blocks: NonNullable<StudyTimeCapacity["timeBlocks"]>; tasks: NonNullable<ExamPlanningSettings["dailyTasks"]> } | null>(null);
  const [deleting, setDeleting] = React.useState<ExamPlan | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const { forecast, current, cards, busy, error, reload } = useExamForecast({ decks: state.decks, exams, capacity, preferences, timeZone, now, onLoadPlanningData });
  const today = forecast?.days[0]?.key === todayKey ? forecast.days[0] : null;
  const sortedExams = exams.slice().sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || a.examDate.localeCompare(b.examDate));

  async function save(next: typeof preferences.examPlanning) {
    setSaving(true);
    setActionError("");
    try {
      await onSavePlanning(next);
      return true;
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Die Prüfungsplanung konnte nicht gespeichert werden.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function requestEditing(next: ExamPlan | "new" | null) {
    if (editorDirty) setPendingEditor({ next });
    else { setEditing(next); setEditorDirty(false); setActionError(""); }
  }

  function editor(plan: ExamPlan | null, embedded = false) {
    return <ExamPlanEditor
      key={plan?.id ?? "new"}
      embedded={embedded}
      onDirtyChange={setEditorDirty}
      decks={state.decks} deckSummaries={deckSummaries} exams={exams} capacity={capacity}
      initialPlan={plan} preferences={preferences} timeZone={timeZone} now={now}
      onLoadPlanningData={onLoadPlanningData}
      onCancel={() => { setEditing(null); setEditorDirty(false); }}
      onSave={async (nextPlan, nextCapacity) => {
        if (await save(upsertExamPlan({ ...preferences.examPlanning, capacity: nextCapacity }, nextPlan))) { setEditing(null); setEditorDirty(false); }
      }}
      saving={saving} saveError={actionError}
    />;
  }

  if (editing === "new") {
    return editor(null);
  }

  return (
    <div className="grid min-w-0 gap-6" data-testid="exam-planning-screen">
      <PageHeader
        eyebrow="Planung"
        title="Prüfungen"
      />
      {actionError ? <StatusMessage tone="error" announce="assertive">{actionError}</StatusMessage> : null}
      {error ? (
        <StatusMessage tone="error" announce="assertive">
          {error} <button type="button" className="underline" onClick={reload}>Erneut laden</button>
        </StatusMessage>
      ) : null}
      <ExamCalendar exams={exams} capacity={capacity} forecast={current ? forecast : null} decks={state.decks} today={civilToday} busy={busy || saving || Boolean(editing)} onChange={(nextExams, nextCapacity) => setCalendarDraft({ ...preferences.examPlanning, exams: nextExams, capacity: nextCapacity })} />
      {calendarDraft ? <SoftPanel className="grid gap-3 p-4"><p className="core-body text-core-text">Kalenderänderungen sind eine Vorschau. Prüfe die neue Zeitplanung und speichere sie.</p><div className="flex flex-wrap gap-3"><ActionButton variant="primary" loading={saving} disabled={(exams.some((exam) => exam.status === "active" && exam.examDate > civilToday) && !current) || busy || saving} onClick={async () => { if (await save(calendarDraft)) setCalendarDraft(null); }}>Kalenderänderungen speichern</ActionButton><ActionButton variant="secondary" disabled={saving} onClick={() => setCalendarDraft(null)}>Verwerfen</ActionButton></div></SoftPanel> : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h3 id="exam-list-title" className="core-heading-3 font-semibold text-core-text">Deine Prüfungen</h3>
        <div className="flex flex-wrap gap-2">{forecast ? <IconButton label="Plan neu berechnen" icon={RefreshCcw} variant="ghost" disabled={busy} onClick={reload} /> : null}<ActionButton variant="primary" icon={Plus} disabled={!state.decks.length || Boolean(calendarDraft) || saving} onClick={() => requestEditing("new")}>Prüfung hinzufügen</ActionButton></div>
      </div>
      {deletedPlan ? <StatusMessage tone="success" announce="polite"><div className="flex flex-wrap items-center gap-3"><span>{deletedPlan.exam.name} wurde gelöscht.</span><ActionButton variant="secondary" icon={RotateCcw} loading={saving} onClick={async () => {
        try {
        const restored = upsertExamPlan(preferences.examPlanning, deletedPlan.exam);
        restored.exams = restored.exams.filter((exam) => exam.id !== deletedPlan.exam.id);
        restored.exams.splice(deletedPlan.index, 0, deletedPlan.exam);
        if (deletedPlan.blocks.length) restored.capacity = { ...restored.capacity, timeBlocks: [...(restored.capacity.timeBlocks ?? []), ...deletedPlan.blocks] };
        if (deletedPlan.tasks.length) restored.dailyTasks = [...(restored.dailyTasks ?? []), ...deletedPlan.tasks];
        if (await save(restored)) setDeletedPlan(null);
        } catch (failure) {
          setActionError(failure instanceof Error ? failure.message : "Die Prüfung konnte nicht wiederhergestellt werden.");
        }
      }}>Rückgängig</ActionButton></div></StatusMessage> : null}
      {exams.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Noch keine Prüfung geplant"
          body={state.decks.length ? "Füge deine erste Prüfung hinzu. Ihr Termin und dein Lernplan erscheinen im Kalender." : "Erstelle oder importiere zuerst einen Stapel, um eine Prüfung zu planen."}
        />
      ) : (
        <>
          {busy && !forecast ? <p role="status" className="core-body text-core-muted">Plan wird berechnet …</p> : null}

          <section className="grid min-w-0 gap-4" aria-labelledby="exam-list-title">
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
              {sortedExams.map((exam) => {
                const summary = forecast?.exams.find((entry) => entry.examId === exam.id) ?? null;
                return (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    color={examColor(exams.indexOf(exam), exam)}
                    summary={current ? summary : null}
                    progress={summary || !cards.length ? null : getExamCurrentProgress(cards, exam)}
                    civilToday={civilToday}
                    busy={saving || Boolean(calendarDraft)}
                    editor={editing?.id === exam.id ? editor(exam, true) : null}
                    onCloseEditor={() => requestEditing(null)}
                    onEdit={() => requestEditing(exam)}
                    onStatus={(status) => setStatusChange({ exam, status })}
                    onDelete={() => setDeleting(exam)}
                  />
                );
              })}
            </div>
          </section>
          {today && !calendarDraft ? <div data-testid="exam-today"><ExamDashboardWidget state={state} now={now} onLoad={onLoadPlanningData} onStart={onStartUnit} onLoadSummaryAvailability={onLoadSummaryAvailability} onSaveTasks={(tasks) => onSavePlanning(withExamDailyTasks(preferences.examPlanning, tasks))} /></div> : null}
        </>
      )}
      <ActionDialog open={Boolean(pendingEditor)} title="Änderungen verwerfen?" description="Deine Änderungen an dieser Prüfung wurden noch nicht gespeichert." cancelLabel="Weiter bearbeiten" confirmLabel="Verwerfen" onCancel={() => setPendingEditor(null)} onConfirm={() => { setEditing(pendingEditor?.next ?? null); setEditorDirty(false); setPendingEditor(null); }} />
      <ActionDialog open={Boolean(statusChange)} title={statusChange?.status === "paused" ? "Prüfung pausieren?" : statusChange?.status === "completed" ? "Prüfung abschließen?" : "Prüfung fortsetzen?"} description={statusChange ? `${statusChange.exam.name}: ${statusChange.status === "paused" ? "Die Prüfungsplanung wird pausiert. Termin, Karten und Lernstand bleiben erhalten; normale Wiederholungen laufen weiter." : statusChange.status === "completed" ? "Die Prüfung wird als abgeschlossen geführt. Du kannst sie vor ihrem Termin wieder öffnen. Karten und Lernstand bleiben erhalten." : "Die Prüfung wird wieder in die gemeinsame Lernplanung aufgenommen."}` : ""} confirmLabel={statusChange?.status === "paused" ? "Pausieren" : statusChange?.status === "completed" ? "Abschließen" : "Fortsetzen"} cancelLabel="Abbrechen" confirmLoading={saving} onCancel={() => setStatusChange(null)} onConfirm={async () => {
        if (statusChange && await save(upsertExamPlan(preferences.examPlanning, { ...statusChange.exam, status: statusChange.status, updatedAt: new Date().toISOString() }))) setStatusChange(null);
      }} />
      <ActionDialog
        open={Boolean(deleting)}
        title="Prüfung löschen?"
        description={deleting ? `${deleting.name} wird aus der Planung entfernt. Karten und Lernstände bleiben erhalten.` : ""}
        confirmLabel="Löschen"
        destructive
        cancelLabel="Abbrechen"
        confirmLoading={saving}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting && await save(removeExamPlan(preferences.examPlanning, deleting.id))) {
            setDeletedPlan({ exam: deleting, index: exams.findIndex((exam) => exam.id === deleting.id), blocks: capacity.timeBlocks?.filter((block) => block.examId === deleting.id) ?? [], tasks: preferences.examPlanning.dailyTasks?.filter((task) => task.examId === deleting.id) ?? [] });
            setDeleting(null);
          }
        }}
      />
    </div>
  );
}
