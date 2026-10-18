import React from "react";
import { examColor, formatExamDate, formatExamPercent } from "./examPlanningUi.ts";
import { CalendarCheck, ChevronDown, Pause, Pencil, Play, Plus, RefreshCcw, Trash2 } from "lucide-react";
import type { ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { ExamPlan, ExamPlanningSettings, StudyTimeCapacity } from "../coreTypes.ts";
import { removeExamPlan, upsertExamPlan } from "../examPlanSettings.ts";
import { examDayDistance, getExamCurrentProgress, type ExamForecastSummary, type ExamPlanDay, type StudyPlanBlock } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, EmptyState, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { ExamPlanEditor } from "./ExamPlanEditor.tsx";
import { ExamCalendar } from "./ExamCalendar.tsx";
import { useExamForecast } from "./useExamForecast.ts";

export const EXAM_METHOD_LABELS = { new: "Neue Karten", review: "Wiederholungen", relearning: "Lernschritte", variant: "Varianten" } as const;
const STATUS_LABELS: Record<ExamPlan["status"], string> = { active: "Aktiv", paused: "Pausiert", completed: "Abgeschlossen" };

function TodayPanel({ day, deckName, busy, onStart }: { day: ExamPlanDay; deckName: (id: string) => string; busy: boolean; onStart: (blockId: string | null) => void }) {
  return (
    <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="exam-today">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="core-heading-3 font-semibold text-core-text">Heute</h3>
          <p className="core-body text-core-muted" data-testid="exam-today-workload">{day.newCardIds.length} neue Karten · {day.reviewCount} Wiederholungen</p>
        </div>
        <ActionButton variant="primary" icon={Play} loading={busy} disabled={busy || day.blocks.length === 0} onClick={() => onStart(null)}>Heutige Einheit lernen</ActionButton>
      </div>
      {day.blocks.length ? (
        <ul className="grid gap-2" aria-label="Lernblöcke heute">
          {day.blocks.map((block) => <BlockRow key={block.id} block={block} deckName={deckName} disabled={busy} onStart={() => onStart(block.id)} />)}
        </ul>
      ) : <p className="core-body text-core-muted">{day.budgetMinutes ? "Für heute ist nichts mehr offen." : "Heute ist frei."}</p>}
      {day.backlogCount ? <StatusMessage tone="warning">{day.backlogCount} fällige Karten passen heute nicht ins Budget.</StatusMessage> : null}
    </SoftPanel>
  );
}

function BlockRow({ block, deckName, disabled, onStart }: { block: StudyPlanBlock; deckName: (id: string) => string; disabled?: boolean; onStart?: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-control bg-core-subtle px-3 py-2" data-exam-block={block.method}>
      <div className="min-w-0 flex-1">
        <p className="core-body font-semibold text-core-text">{EXAM_METHOD_LABELS[block.method]}</p>
        <p className="break-words core-caption text-core-muted">{deckName(block.deckId)} · {block.expectedItems} {block.expectedItems === 1 ? "Abfrage" : "Abfragen"}</p>
      </div>
      {onStart ? <IconButton label={`${EXAM_METHOD_LABELS[block.method]} in ${deckName(block.deckId)} lernen`} icon={Play} variant="ghost" disabled={disabled} onClick={onStart} /> : null}
    </li>
  );
}

interface ExamCardProps {
  exam: ExamPlan;
  color: string;
  summary: ExamForecastSummary | null;
  progress: ReturnType<typeof getExamCurrentProgress> | null;
  civilToday: string;
  busy: boolean;
  onEdit: () => void;
  onStatus: (status: ExamPlan["status"]) => void;
  onDelete: () => void;
}

function ExamCard({ exam, color, summary, progress, civilToday, busy, onEdit, onStatus, onDelete }: ExamCardProps) {
  const daysLeft = examDayDistance(civilToday, exam.examDate);
  const past = daysLeft <= 0;
  const readiness = summary?.current ?? progress;
  return (
    <SoftPanel className="grid min-w-0 content-start gap-4 p-4 sm:p-6" data-testid={`exam-card-${exam.id}`} data-status={exam.status} style={{ background: `color-mix(in srgb, ${color} 10%, var(--core-surface))` }}>
      <div className="min-w-0">
        <h4 className="break-words rounded-control px-3 py-2 core-heading-3 font-semibold" style={{ background: color, color: "var(--core-exam-on-color)" }}>{exam.name}</h4>
        <p className="core-body text-core-muted">{formatExamDate(exam.examDate)} · {past ? "Termin erreicht" : `${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}`} · {STATUS_LABELS[exam.status]}</p>
      </div>
      {readiness ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile size="compact" label="Bearbeitet" value={formatExamPercent(readiness.coverage)} />
          <StatTile size="compact" label="Sicherheit am Termin" value={formatExamPercent(summary ? summary.predicted.security : readiness.security)} />
          {summary ? <StatTile size="compact" label="Neue Karten" value={summary.remainingNewCount} /> : null}
        </div>
      ) : null}
      {exam.status === "active" && past ? <StatusMessage tone="warning">Schließe die Prüfung ab oder ändere das Datum.</StatusMessage> : null}
      {summary?.decks.length ? (
        <details className="group min-w-0">
          <summary className="flex min-h-control cursor-pointer list-none items-center gap-2 core-body font-semibold text-core-text">
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />Stapel
          </summary>
          <ul className="mt-2 grid gap-1">
            {summary.decks.map((deck) => (
              <li key={deck.deckId} className="flex min-w-0 justify-between gap-3 core-body">
                <span className="min-w-0 break-words text-core-text">{deck.name}</span>
                <span className="shrink-0 text-core-muted">{deck.known} / {deck.total} · {formatExamPercent(deck.security)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="secondary" icon={Pencil} disabled={busy} onClick={onEdit}>Bearbeiten</ActionButton>
        {exam.status === "completed" ? null : exam.status === "active"
          ? <ActionButton variant="secondary" icon={Pause} disabled={busy} onClick={() => onStatus("paused")}>Pausieren</ActionButton>
          : <ActionButton variant="secondary" icon={Play} disabled={busy || past} onClick={() => onStatus("active")}>Fortsetzen</ActionButton>}
        {exam.status !== "completed" ? <ActionButton variant="secondary" icon={CalendarCheck} disabled={busy} onClick={() => onStatus("completed")}>Abschließen</ActionButton> : null}
        <IconButton label={`${exam.name} löschen`} icon={Trash2} variant="destructive" disabled={busy} onClick={onDelete} />
      </div>
    </SoftPanel>
  );
}

/** Global exam planner (ADR-042): one shared time budget for all exams of the user. */
export function ExamPlanningScreen({ state, deckSummaries, now, onLoadPlanningData, onSavePlanning, onStartUnit }: ExamPlanningScreenProps) {
  const preferences = getGlobalSchedulerPreferences(state.profile);
  const [calendarDraft, setCalendarDraft] = React.useState<ExamPlanningSettings | null>(null);
  const { exams, capacity } = calendarDraft ?? preferences.examPlanning;
  const timeZone = state.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const civilToday = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const todayKey = getLearningDayKey(now, { timeZone, dayStartHour: preferences.dayStartHour }) ?? civilToday;
  const [editing, setEditing] = React.useState<ExamPlan | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<ExamPlan | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const { forecast, current, cards, busy, error, reload } = useExamForecast({ decks: state.decks, exams, capacity, preferences, timeZone, now, onLoadPlanningData });
  const deckName = (id: string) => state.decks.find((deck) => deck.id === id)?.name ?? "Gelöschter Stapel";
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

  async function start(blockId: string | null) {
    setStarting(true);
    setActionError("");
    try {
      await onStartUnit(blockId);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Die Einheit konnte nicht gestartet werden.");
    } finally {
      setStarting(false);
    }
  }

  if (editing) {
    return (
      <ExamPlanEditor
        decks={state.decks}
        deckSummaries={deckSummaries}
        exams={exams}
        capacity={capacity}
        initialPlan={editing === "new" ? null : editing}
        preferences={preferences}
        timeZone={timeZone}
        now={now}
        onLoadPlanningData={onLoadPlanningData}
        onCancel={() => setEditing(null)}
        onSave={async (plan: ExamPlan, nextCapacity: StudyTimeCapacity) => {
          if (await save(upsertExamPlan({ ...preferences.examPlanning, capacity: nextCapacity }, plan))) setEditing(null);
        }}
        saving={saving}
        saveError={actionError}
      />
    );
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
      <ExamCalendar exams={exams} capacity={capacity} forecast={current ? forecast : null} decks={state.decks} today={civilToday} busy={busy || saving} onChange={(nextExams, nextCapacity) => setCalendarDraft({ ...preferences.examPlanning, exams: nextExams, capacity: nextCapacity })} />
      {calendarDraft ? <SoftPanel className="grid gap-3 p-4"><p className="core-body text-core-text">Kalenderänderungen sind eine Vorschau. Prüfe die neue Zeitplanung und speichere sie.</p><div className="flex flex-wrap gap-3"><ActionButton variant="primary" loading={saving} disabled={(exams.some((exam) => exam.status === "active" && exam.examDate > civilToday) && !current) || busy || saving} onClick={async () => { if (await save(calendarDraft)) setCalendarDraft(null); }}>Kalenderänderungen speichern</ActionButton><ActionButton variant="secondary" disabled={saving} onClick={() => setCalendarDraft(null)}>Verwerfen</ActionButton></div></SoftPanel> : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h3 id="exam-list-title" className="core-heading-3 font-semibold text-core-text">Deine Prüfungen</h3>
        <div className="flex flex-wrap gap-2">{forecast ? <IconButton label="Plan neu berechnen" icon={RefreshCcw} variant="ghost" disabled={busy} onClick={reload} /> : null}<ActionButton variant="primary" icon={Plus} disabled={!state.decks.length || Boolean(calendarDraft)} onClick={() => setEditing("new")}>Prüfung hinzufügen</ActionButton></div>
      </div>
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
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              {sortedExams.map((exam) => {
                const summary = forecast?.exams.find((entry) => entry.examId === exam.id) ?? null;
                return (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    color={examColor(exams.indexOf(exam))}
                    summary={current ? summary : null}
                    progress={summary || !cards.length ? null : getExamCurrentProgress(cards, exam, now, timeZone)}
                    civilToday={civilToday}
                    busy={saving || Boolean(calendarDraft)}
                    onEdit={() => setEditing(exam)}
                    onStatus={(status) => void save(upsertExamPlan(preferences.examPlanning, { ...exam, status, updatedAt: new Date().toISOString() }))}
                    onDelete={() => setDeleting(exam)}
                  />
                );
              })}
            </div>
          </section>
          {today ? <TodayPanel day={today} deckName={deckName} busy={starting || !current || Boolean(calendarDraft)} onStart={(blockId) => void start(blockId)} /> : null}
        </>
      )}
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
          if (deleting && await save(removeExamPlan(preferences.examPlanning, deleting.id))) setDeleting(null);
        }}
      />
    </div>
  );
}
