import React from "react";
import { examColor } from "./examPlanningUi.ts";
import { CalendarCheck, Plus, RefreshCcw, RotateCcw } from "lucide-react";
import type { ExamDailyTask, ExamPlan, ExamPlanningSettings, StudyTimeCapacity } from "../coreTypes.ts";
import { removeExamPlan, upsertExamPlan } from "../examPlanSettings.ts";
import { getExamCurrentProgress } from "../examPlanning.ts";
import { getLearningDayKey, getLearningTimeZone } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { SectionHeader } from "../ui/SectionHeader.tsx";
import { ExamPlanEditor } from "./ExamPlanEditor.tsx";
import { ExamCalendar } from "./ExamCalendar.tsx";
import { ExamDashboardWidget } from "./ExamDashboardWidget.tsx";
import { ExamPage, ExamPosterLink } from "./ExamPage.tsx";
import { useExamForecast } from "./useExamForecast.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import type { ExamPlanningData } from "../studyPreparation.ts";
import type { WorkspaceState } from "../coreWorkspace.ts";

export interface ExamPlanningScreenProps {
  state: WorkspaceState;
  now: string;
  /** May answer from a short-lived cache; `fresh` asks for study states straight from the cloud. */
  onLoadPlanningData: (deckIds: string[], signal: AbortSignal, options?: { fresh?: boolean }) => Promise<ExamPlanningData>;
  onSavePlanning: (settings: ExamPlanningSettings) => Promise<void>;
  /** Merges today's checklist into the latest stored plan, never into a rendered snapshot. */
  onSaveTasks: (tasks: ExamDailyTask[]) => Promise<void>;
  onStartUnit: (blockId: string | null, examId?: string) => Promise<void>;
  onLoadSummaryAvailability?: (deckId: string) => Promise<boolean>;
  onLoadLocalCardIds?: (cardIds: string[]) => Promise<string[]>;
  onDraftStateChange?: (dirty: boolean) => void;
}

export function ExamPlanningScreen({ state, now, onLoadPlanningData, onSavePlanning, onSaveTasks, onStartUnit, onLoadSummaryAvailability, onLoadLocalCardIds, onDraftStateChange }: ExamPlanningScreenProps) {
  const preferences = React.useMemo(() => getGlobalSchedulerPreferences(state.profile), [state.profile]);
  const deckSummaries = useWorkspaceValue((snapshot) => snapshot.deckSummaries);
  const [calendarDraft, setCalendarDraft] = React.useState<ExamPlanningSettings | null>(null);
  const { exams, capacity } = calendarDraft ?? preferences.examPlanning;
  const timeZone = getLearningTimeZone(state.profile);
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const todayKey = getLearningDayKey(now, { timeZone, dayStartHour: preferences.dayStartHour }) ?? civilToday;
  const [editing, setEditing] = React.useState<ExamPlan | "new" | null>(null);
  const [openExamId, setOpenExamId] = React.useState<string | null>(null);
  const closedExamId = React.useRef<string | null>(null);
  const undoButton = React.useRef<HTMLButtonElement>(null);
  function leaveExam() { closedExamId.current = openExamId; setOpenExamId(null); }
  React.useLayoutEffect(() => {
    if (openExamId || !closedExamId.current) return;
    document.querySelector<HTMLElement>(`[data-testid="exam-card-${CSS.escape(closedExamId.current)}"]`)?.focus();
    closedExamId.current = null;
  }, [openExamId]);
  const [editorDirty, setEditorDirty] = React.useState(false);
  const [pendingEditor, setPendingEditor] = React.useState<{ next: ExamPlan | "new" | null; leave?: boolean } | null>(null);
  const [statusChange, setStatusChange] = React.useState<{ exam: ExamPlan; status: ExamPlan["status"] } | null>(null);
  const [deletedPlan, setDeletedPlan] = React.useState<{ exam: ExamPlan; index: number; blocks: NonNullable<StudyTimeCapacity["timeBlocks"]>; tasks: NonNullable<ExamPlanningSettings["dailyTasks"]> } | null>(null);
  const [deleting, setDeleting] = React.useState<ExamPlan | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const planning = useExamForecast({ decks: state.decks, exams, capacity, preferences, timeZone, now, onLoadPlanningData, includeInactive: true });
  const { forecast, current, cards, busy, error, offline, reload } = planning;
  const today = forecast?.days[0]?.key === todayKey ? forecast.days[0] : null;
  const dirty = editorDirty || Boolean(calendarDraft);
  React.useEffect(() => { onDraftStateChange?.(dirty); }, [dirty, onDraftStateChange]);
  React.useEffect(() => () => onDraftStateChange?.(false), [onDraftStateChange]);
  const addDisabled = !state.decks.length || Boolean(calendarDraft) || saving;
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

  const dialogs = <>
      <ActionDialog open={Boolean(pendingEditor)} title="Änderungen verwerfen?" description="Deine Änderungen an dieser Prüfung wurden noch nicht gespeichert." cancelLabel="Weiter bearbeiten" confirmLabel="Verwerfen" onCancel={() => setPendingEditor(null)} onConfirm={() => { setEditing(pendingEditor?.next ?? null); setEditorDirty(false); setPendingEditor(null); if (pendingEditor?.leave) leaveExam(); }} />
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
            setOpenExamId(null);
            requestAnimationFrame(() => undoButton.current?.focus());
          }
        }}
      />
  </>;

  if (editing === "new") {
    return editor(null);
  }

  const openExam = exams.find((exam) => exam.id === openExamId);
  if (openExam) {
    const summary = forecast?.exams.find((entry) => entry.examId === openExam.id) ?? null;
    const progress = summary || !cards.length ? null : getExamCurrentProgress(state.decks, cards, openExam);
    const readiness = current && summary ? { ...summary.current, totalCards: summary.totalCards } : progress;
    return <div className="grid min-w-0 gap-6" data-testid="exam-planning-screen">
      {actionError ? <StatusMessage tone="error" announce="assertive">{actionError}</StatusMessage> : null}
      {error ? <StatusMessage tone="error" announce="assertive">{error} <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>Erneut laden</button></StatusMessage> : null}
      <ExamPage
        exam={openExam}
        color={examColor(exams.indexOf(openExam), openExam)}
        decks={state.decks}
        summary={current ? summary : null}
        readiness={readiness}
        civilToday={civilToday}
        busy={saving || Boolean(calendarDraft)}
        editor={editing?.id === openExam.id ? editor(openExam, true) : null}
        today={<ExamDashboardWidget examId={openExam.id} state={state} now={now} planning={planning} onLoad={onLoadPlanningData} onStart={onStartUnit} onLoadSummaryAvailability={onLoadSummaryAvailability} onLoadLocalCardIds={onLoadLocalCardIds} onSaveTasks={onSaveTasks} />}
        onBack={() => { if (editorDirty) setPendingEditor({ next: null, leave: true }); else { setEditing(null); leaveExam(); } }}
        onColor={(color) => void save(upsertExamPlan(preferences.examPlanning, { ...openExam, color, colorIndex: undefined, updatedAt: new Date().toISOString() }))}
        onEdit={() => requestEditing(openExam)}
        onStatus={(status) => setStatusChange({ exam: openExam, status })}
        onDelete={() => setDeleting(openExam)}
      />
      {dialogs}
    </div>;
  }

  return (
    <div className="grid min-w-0 gap-6" data-testid="exam-planning-screen">
      <PageHeader
        title="Prüfungen"
        action={<ActionButton variant="primary" icon={Plus} className="max-sm:min-w-button max-sm:gap-0 max-sm:px-0 max-sm:[&>span]:sr-only" disabled={addDisabled} onClick={() => requestEditing("new")}>Prüfung hinzufügen</ActionButton>}
      />
      {actionError ? <StatusMessage tone="error" announce="assertive">{actionError}</StatusMessage> : null}
      {error ? (
        <StatusMessage tone="error" announce="assertive">
          {error} <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>Erneut laden</button>
        </StatusMessage>
      ) : null}
      <ExamCalendar exams={exams} capacity={capacity} forecast={current ? forecast : null} decks={state.decks} today={civilToday} busy={busy || saving || Boolean(editing)} onChange={(nextExams, nextCapacity) => setCalendarDraft({ ...preferences.examPlanning, exams: nextExams, capacity: nextCapacity })} />
      {calendarDraft ? <SoftPanel className="grid gap-3 p-5"><p className="core-heading-3 text-core-text">Ungespeicherte Kalenderänderungen</p><div className="flex flex-wrap gap-3"><ActionButton variant="primary" loading={saving} disabled={saving} onClick={async () => { if (await save(calendarDraft)) setCalendarDraft(null); }}>Speichern</ActionButton><ActionButton variant="secondary" disabled={saving} onClick={() => setCalendarDraft(null)}>Verwerfen</ActionButton></div></SoftPanel> : null}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
      <div className="grid min-w-0 gap-4">
      <SectionHeader level={3} id="exam-list-title" title="Deine Prüfungen" action={exams.length === 0 || forecast ? <>{exams.length === 0 ? <IconButton label="Erste Prüfung planen" icon={Plus} disabled={addDisabled} onClick={() => requestEditing("new")} /> : null}{forecast ? <IconButton label="Plan neu berechnen" icon={RefreshCcw} variant="ghost" disabled={busy} onClick={reload} /> : null}</> : undefined} />
      {deletedPlan ? <StatusMessage tone="success" announce="polite"><div className="flex flex-wrap items-center gap-3"><span>{deletedPlan.exam.name} wurde gelöscht.</span><ActionButton ref={undoButton} variant="secondary" icon={RotateCcw} loading={saving} onClick={async () => {
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
            <div className="exam-poster-grid">
              {sortedExams.map((exam) => <ExamPosterLink key={exam.id} exam={exam} color={examColor(exams.indexOf(exam), exam)} civilToday={civilToday} disabled={Boolean(calendarDraft)} onOpen={() => setOpenExamId(exam.id)} />)}
              <ActionButton variant="secondary" icon={Plus} className="min-h-16 w-full justify-start rounded-panel border-dashed px-6 py-4" disabled={addDisabled} onClick={() => requestEditing("new")}>Weitere Prüfung planen</ActionButton>
            </div>
          </section>
        </>
      )}
      </div>
          {(today || offline) && !calendarDraft && exams.length > 0 ? <div data-testid="exam-today"><ExamDashboardWidget state={state} now={now} planning={planning} onLoad={onLoadPlanningData} onStart={onStartUnit} onLoadSummaryAvailability={onLoadSummaryAvailability} onLoadLocalCardIds={onLoadLocalCardIds} onSaveTasks={onSaveTasks} /></div> : null}
      </div>
      {dialogs}
    </div>
  );
}
