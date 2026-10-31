import React from "react";
import { ArrowLeft, ArrowRight, CalendarClock, ChevronDown, Save } from "lucide-react";
import type { ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { Deck, ExamPlan, GlobalSchedulerPreferences, StudyTimeCapacity } from "../coreTypes.ts";
import { EXAM_PLANNING_LIMITS, EXAM_RETENTION_LEVELS, createExamPlan } from "../examPlanSettings.ts";
import { getExamDeckIds, getExamLastNewDate, getExamTopicOrder, shiftExamDay, toggleExamDeckSelection } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { createDeckLibraryModel, type DeckLibrarySummary } from "../libraryModel.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { ColorWheelPicker } from "../ui/ColorWheelPicker.tsx";
import { ActionDialog, PageHeader } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { ExamCalendar } from "./ExamCalendar.tsx";
import { ExamTopicPreview } from "./ExamTopicPreview.tsx";
import { ExamTopicOrder } from "./ExamTopicOrder.tsx";
import { ExamDeckSelection } from "./ExamDeckSelection.tsx";
import { formatExamCount, formatExamDate, formatExamMinutes } from "./examPlanningUi.ts";
import { useExamForecast } from "./useExamForecast.ts";

const STEPS = ["Prüfung", "Lernstoff", "Lernzeit", "Dein Plan"];
const EXAM_GOALS = EXAM_RETENTION_LEVELS.map((retention, index) => ({ retention, label: ["Bestehen", "Gute Note", "Sehr gute Note", "Bestmöglich abschneiden"][index] }));
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const FIELD = "core-field min-w-0";
const LABEL = "core-field-label grid min-w-0 gap-2";

function Summary({ children }: { children: React.ReactNode }) {
  return <summary className="flex min-h-control cursor-pointer list-none items-center justify-between gap-3 rounded-inset py-2 core-control-label font-semibold text-core-text [&::-webkit-details-marker]:hidden"><ChevronDown size={16} aria-hidden="true" className="order-last shrink-0 text-core-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />{children}</summary>;
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return <dl className="flex min-w-0 flex-col rounded-control border border-core-border bg-core-surface px-4 py-3"><dt className="core-caption font-medium text-core-muted">{label}</dt><dd className="mt-auto pt-1 core-metric text-core-text">{value}</dd></dl>;
}

interface ExamPlanEditorProps {
  embedded?: boolean; onDirtyChange?: (dirty: boolean) => void;
  decks: Deck[]; deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>; exams: ExamPlan[]; capacity: StudyTimeCapacity;
  initialPlan: ExamPlan | null; preferences: GlobalSchedulerPreferences; timeZone: string; now: string;
  onLoadPlanningData: ExamPlanningScreenProps["onLoadPlanningData"];
  onSave: (plan: ExamPlan, capacity: StudyTimeCapacity) => Promise<void>; onCancel: () => void; saving: boolean; saveError: string;
}

/** Guided setup: the calendar follows the exam, scope, goal and weekly time. */
export function ExamPlanEditor({ embedded = false, onDirtyChange, decks, deckSummaries, exams, capacity: savedCapacity, initialPlan, preferences, timeZone, now, onLoadPlanningData, onSave, onCancel, saving, saveError }: ExamPlanEditorProps) {
  const today = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const [originalPlan] = React.useState(() => {
    const original = initialPlan ?? createExamPlan(today);
    const index = initialPlan ? Math.max(0, exams.findIndex((exam) => exam.id === original.id)) : exams.length;
    const token = `--core-exam-color-${(original.colorIndex ?? index) + 1}`;
    const fallback = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return { ...original, color: original.color ?? (fallback || "#6f7e9e") };
  });
  const [plan, setPlan] = React.useState<ExamPlan>(originalPlan);
  const [capacity, setCapacity] = React.useState(savedCapacity);
  const [step, setStep] = React.useState(0);
  const [selectionError, setSelectionError] = React.useState("");
  const [discarding, setDiscarding] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const dirty = JSON.stringify(plan) !== JSON.stringify(originalPlan) || JSON.stringify(capacity) !== JSON.stringify(savedCapacity);
  React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  React.useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  function cancel() { if (dirty) setDiscarding(true); else onCancel(); }
  const heading = React.useRef<HTMLHeadingElement>(null);
  const previewCalendar = React.useRef<HTMLDivElement>(null);
  const previewActions = React.useRef<HTMLDivElement>(null);
  const rows = React.useMemo(() => createDeckLibraryModel(decks, { now, timeZone, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, deckSummaries }).rows, [deckSummaries, decks, now, preferences.dayStartHour, preferences.learnAheadMinutes, timeZone]);
  const selected = getExamDeckIds(decks, plan);
  const studyStartDate = plan.studyStartDate ?? today;
  const minStudyStart = initialPlan?.studyStartDate && initialPlan.studyStartDate < today ? initialPlan.studyStartDate : today;
  const validBasics = Boolean(plan.name.trim() && plan.examDate > today && plan.examDate <= shiftExamDay(today, 365) && studyStartDate >= minStudyStart && studyStartDate < plan.examDate);
  const valid = validBasics && selected.size > 0;
  const canAdvance = step === 0 ? validBasics : step === 1 ? plan.deckIds.length > 0 : true;
  const candidate = { ...plan, status: "active" as const, name: plan.name.trim() || "Neue Prüfung" };
  const plannedExams = (embedded || step >= 2) && valid ? exams.some((exam) => exam.id === plan.id) ? exams.map((exam) => exam.id === plan.id ? candidate : exam) : [...exams, candidate] : [];
  const { forecast, current, busy, error } = useExamForecast({ decks, exams: plannedExams, capacity, preferences, timeZone, now, onLoadPlanningData, delayMs: 250 });
  const summary = current ? forecast?.exams.find((exam) => exam.examId === plan.id) ?? null : null;
  const time = plan.studyTime;
  const topicOrder = getExamTopicOrder(decks, plan).filter((id) => (rows.find((row) => row.id === id)?.directInventory.totalCards ?? 0) > 0);
  const selectedCards = rows.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + row.directInventory.totalCards, 0);
  function patch(fields: Partial<ExamPlan>) { setPlan((value) => ({ ...value, ...fields })); }
  function patchCapacity(fields: Partial<StudyTimeCapacity>) { setCapacity((value) => ({ ...value, ...fields })); }
  function go(next: number) { setStep(next); requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start", behavior: "instant" }); }); }
  function toggleDeck(deckId: string, on: boolean) {
    const next = toggleExamDeckSelection(decks, plan, deckId, on), scope = getExamDeckIds(decks, next);
    if (next.deckIds.length > EXAM_PLANNING_LIMITS.decksPerExam || (next.excludedDeckIds?.length ?? 0) > EXAM_PLANNING_LIMITS.decksPerExam) { setSelectionError("Bitte wähle höchstens 200 Stapel aus."); return; }
    setSelectionError(""); patch({ ...next, topicOrder: topicOrder.filter((id) => scope.has(id)), completedSummaryDeckIds: plan.completedSummaryDeckIds?.filter((id) => scope.has(id)), ...(plan.topicDates ? { topicDates: plan.topicDates.filter((topic) => scope.has(topic.deckId)) } : {}) });
  }
  return <div className="grid w-full min-w-0 gap-6" data-testid="exam-plan-editor" data-embedded={embedded || undefined}>
    {!embedded ? <>
    <PageHeader eyebrow="Prüfungen" title={initialPlan ? "Prüfung bearbeiten" : "Prüfung planen"} action={<ActionButton variant="secondary" icon={ArrowLeft} disabled={saving} onClick={cancel}>Zurück</ActionButton>} />
    <ol className="grid grid-cols-4 gap-1.5 sm:gap-2" aria-label="Schritte der Prüfungsplanung">{STEPS.map((name, index) => <li key={name} className="min-w-0"><button type="button" disabled={saving || index > step + 1 || (index === step + 1 && !canAdvance)} aria-current={step === index ? "step" : undefined} aria-label={`${index + 1}. ${name}`} onClick={() => go(index)} className={`grid min-h-control w-full min-w-0 gap-0.5 rounded-control border px-2 py-2.5 text-left transition-colors sm:px-3 ${step === index ? "border-core-action bg-core-info-soft" : index < step ? "border-core-border bg-core-surface shadow-soft hover:bg-core-subtle" : "border-transparent bg-core-subtle"}`}><span className={`core-caption font-semibold tabular-nums ${step === index ? "text-core-action" : "text-core-muted"}`}>{index + 1}</span><span className={`break-words core-control-label font-semibold ${step === index ? "text-core-action" : index < step ? "text-core-text" : "text-core-secondary"}`}>{name}</span></button></li>)}</ol>
    </> : null}
    <div className={!embedded && step !== 3 ? "grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]" : "min-w-0"}>
    <div className="grid min-w-0 gap-6">
    <fieldset disabled={saving} className={embedded ? "grid min-w-0 gap-5" : "core-surface-raised grid min-w-0 gap-6 rounded-panel p-5 sm:p-6"} data-testid="exam-plan-inspector">
      {!embedded ? <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 core-heading-2 text-core-text">{["Welche Prüfung steht an?", "Was möchtest du lernen?", "Dein Lernrhythmus", "So sieht dein Lernplan aus"][step]}</h2> : null}
      {embedded || step === 0 ? <div className="grid max-w-2xl gap-5">
        <label className={LABEL}>Name<input autoComplete="off" aria-invalid={showErrors && !plan.name.trim()} placeholder="Zum Beispiel Anatomie" className={FIELD} maxLength={120} value={plan.name} onChange={(event) => patch({ name: event.target.value })} /></label>
        {showErrors && !plan.name.trim() ? <p role="alert" className="core-field-error">Bitte gib der Prüfung einen Namen.</p> : null}
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className={LABEL}><span>Prüfungsdatum</span><CoreDatePicker value={plan.examDate} min={shiftExamDay(studyStartDate > today ? studyStartDate : today, 1)} max={shiftExamDay(today, 365)} today={today} ariaLabel="Prüfungsdatum auswählen" onValueChange={(examDate) => { patch({ examDate, ...(plan.topicDates ? { topicDates: plan.topicDates.filter((topic) => topic.date < examDate) } : {}) }); if (capacity.timeBlocks) patchCapacity({ timeBlocks: capacity.timeBlocks.filter((block) => block.examId !== plan.id || block.date < examDate) }); }} className="w-full" /></div>
          <div className={LABEL}><span>Lernstart</span><CoreDatePicker value={studyStartDate} min={minStudyStart} max={shiftExamDay(plan.examDate, -1)} today={today} ariaLabel="Lernstart auswählen" onValueChange={(studyStartDate) => { patch({ studyStartDate }); if (capacity.timeBlocks) patchCapacity({ timeBlocks: capacity.timeBlocks.filter((block) => block.examId !== plan.id || block.date >= studyStartDate) }); }} className="w-full" /></div>
        </div>
        {showErrors && (plan.examDate <= today || plan.examDate > shiftExamDay(today, 365)) ? <p role="alert" className="core-field-error">Wähle einen zukünftigen Termin innerhalb der nächsten 365 Tage.</p> : null}
        <fieldset className="grid min-w-0 gap-3" aria-describedby={`${plan.id}-goal-hint`}>
          <legend className="mb-3 core-field-label">Was ist dein Ziel für die Prüfung?</legend>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">{EXAM_GOALS.map(({ retention, label }) => <label key={retention} className={`flex min-h-control min-w-0 cursor-pointer items-center justify-between gap-3 rounded-control border px-4 py-3 core-body ${plan.desiredRetention === retention ? "border-core-action bg-core-info-soft text-core-text" : "border-core-border bg-core-surface text-core-text"}`}>
            <span className="min-w-0 break-words">{label}</span><input type="radio" name={`${plan.id}-goal`} value={retention} className="size-5 shrink-0 accent-core-action" checked={plan.desiredRetention === retention} onChange={() => patch({ desiredRetention: retention })} />
          </label>)}</div>
          <p id={`${plan.id}-goal-hint`} className="core-field-hint">Ein höheres Ziel plant häufigere Wiederholungen ein.</p>
        </fieldset>
        <label className={LABEL}>Farbe<ColorWheelPicker value={plan.color ?? "#6f7e9e"} ariaLabel="Prüfungsfarbe auswählen" className="justify-self-start" onValueCommit={(color) => patch({ color, colorIndex: undefined })} /></label>
      </div> : null}
      {embedded || step === 1 ? <details className="group min-w-0" open={embedded ? (showErrors && !selected.size) || undefined : true}>
        {embedded ? <Summary>Lernstoff · {formatExamCount(selected.size, "Stapel", "Stapel")}</Summary> : <summary className="hidden" />}<div className="grid min-w-0 gap-4">
        <fieldset className="grid min-w-0 gap-3"><legend className="mb-3 core-field-label">{formatExamCount(selected.size, "Stapel", "Stapel")} · {formatExamCount(selectedCards, "Karte", "Karten")}</legend><ExamDeckSelection rows={rows} selected={selected} onToggle={toggleDeck} /></fieldset>
        {showErrors && !selected.size ? <p role="alert" className="core-field-error">Wähle mindestens einen Stapel.</p> : null}
        {selectionError ? <StatusMessage tone="error">{selectionError}</StatusMessage> : null}
        <div className="grid min-w-0 gap-2"><label htmlFor={`${plan.id}-buffer`} className="core-field-label">Puffer vor der Prüfung · Tage</label><div className="flex min-w-0 items-center gap-3"><div className="w-20 shrink-0 sm:w-24"><input id={`${plan.id}-buffer`} type="number" inputMode="numeric" className={FIELD} min={1} max={365} value={plan.bufferDays} onChange={(event) => patch({ bufferDays: Math.min(365, Math.max(1, Math.round(Number(event.target.value) || 1))) })} /></div><p className="min-w-0 core-caption text-core-secondary">Letzte neue Karten am {formatExamDate(getExamLastNewDate(plan), "short")}</p></div></div>
        <ExamTopicOrder topics={topicOrder.map((id) => ({ id, name: decks.find((deck) => deck.id === id)!.name }))} disabled={saving} onChange={(topicOrder) => patch({ topicOrder })} />
      </div></details> : null}
      {embedded ? <details className="group min-w-0"><Summary>Lernzeit und weitere Einstellungen</Summary><div className="mt-4 grid gap-6">{renderPlanningOptions()}</div></details> : null}
      {!embedded && step === 2 ? renderPlanningOptions() : null}
      {valid && (embedded || step === 3) ? renderPreview() : null}
      {saveError ? <StatusMessage tone="error" announce="assertive">{saveError}</StatusMessage> : null}
      {embedded ? <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end"><ActionButton variant="secondary" disabled={saving} onClick={cancel}>Abbrechen</ActionButton><ActionButton variant="primary" icon={Save} loading={saving} onClick={() => { if (!valid) setShowErrors(true); else void onSave({ ...plan, name: plan.name.trim(), updatedAt: new Date().toISOString() }, capacity); }}>Speichern</ActionButton></div> : step < 3 ? renderStepActions() : null}
    </fieldset>
    {!embedded && step === 3 ? <>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]" data-testid="exam-preview-layout">
        <div ref={previewCalendar} className="min-w-0">{renderCalendar()}</div>
        <ExamTopicPreview calendarRef={previewCalendar} actionsRef={previewActions} examDate={plan.examDate} color={plan.color} topics={topicOrder.map((id) => {
          const deck = summary?.decks.find((deck) => deck.deckId === id);
          // Shared decks are introduced once by the exam with the earliest cutoff; name it instead of claiming the start.
          const first = current ? forecast?.days.flatMap((day) => day.blocks.filter((block) => block.deckId === id && block.method === "new").map((block) => ({ key: day.key, own: block.examIds.includes(plan.id), examIds: block.examIds }))).sort((a, b) => Number(b.own) - Number(a.own))[0] : undefined;
          const owner = first && !first.own ? plannedExams.find((exam) => first.examIds.includes(exam.id))?.name : undefined;
          return { id, name: decks.find((deck) => deck.id === id)!.name, detail: first ? `${owner ? `Mit ${owner} ab` : "Ab"} ${formatExamDate(first.key, "short")}` : !current ? "Wird berechnet …" : deck && deck.known >= deck.total ? "Bereits eingeführt" : "Noch nicht eingeplant" };
        })} />
      </div>
      <div ref={previewActions} className="exam-plan-actions sticky z-30 rounded-panel border border-core-border bg-core-surface p-2 sm:p-3" data-testid="exam-plan-actions">{renderStepActions()}</div>
    </> : null}
    </div>
    {!embedded && step !== 3 ? renderContext() : null}
    </div>
    <ActionDialog open={discarding} title="Änderungen verwerfen?" description="Deine Änderungen an dieser Prüfung wurden noch nicht gespeichert." cancelLabel="Weiter bearbeiten" confirmLabel="Verwerfen" onCancel={() => setDiscarding(false)} onConfirm={onCancel} />
  </div>;

  function renderPlanningOptions() { return <>
    <div className="grid min-w-0 gap-3" aria-label="Lernzeit festlegen">
      <div className="min-w-0 rounded-panel border border-core-border bg-core-surface">
        <button type="button" aria-expanded={!time.weeklyMinutes} aria-controls={`${plan.id}-average-time`} onClick={() => {
          if (!time.weeklyMinutes) return;
          const minutes = time.weeklyMinutes.filter((value, index) => time.weekdays[index] && value > 0);
          patch({ studyTime: { ...time, dailyMinutes: minutes.length ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length) : 0, weekdays: time.weekdays.map((selected, index) => selected && time.weeklyMinutes![index] > 0), weeklyMinutes: undefined } });
        }} className="flex min-h-control w-full items-center justify-between gap-3 px-4 py-3 text-left core-control-label font-semibold text-core-text"><span>Lerntage und durchschnittliche Lernzeit</span><ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-core-muted transition-transform motion-reduce:transition-none ${!time.weeklyMinutes ? "rotate-180" : ""}`} /></button>
        {!time.weeklyMinutes ? <div id={`${plan.id}-average-time`} className="grid min-w-0 gap-4 px-4 pb-4">
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-7 sm:gap-2" role="group" aria-label="Lerntage">{WEEKDAYS.map((name, index) => <label key={name} className={`flex min-h-control cursor-pointer flex-col items-center justify-center gap-2 rounded-control border px-1 py-3 core-caption font-semibold ${time.weekdays[index] ? "border-core-action bg-core-info-soft text-core-text" : "border-core-border text-core-muted"}`}><input type="checkbox" aria-label={name} className="size-4 accent-core-action" checked={time.weekdays[index]} onChange={(event) => patch({ studyTime: { ...time, weekdays: time.weekdays.map((value, i) => i === index ? event.target.checked : value) } })} /><span aria-hidden="true">{name.slice(0, 2)}</span></label>)}</div>
          <label className={`${LABEL} sm:max-w-xs`}>Lernzeit pro Lerntag · Min.<input className={FIELD} type="number" inputMode="numeric" min={0} max={1440} step={15} value={time.dailyMinutes} onChange={(event) => patch({ studyTime: { ...time, dailyMinutes: Math.min(1440, Math.max(0, Math.round(Number(event.target.value) || 0))) } })} /></label>
        </div> : null}
      </div>
      <div className="min-w-0 rounded-panel border border-core-border bg-core-surface">
        <button type="button" aria-expanded={Boolean(time.weeklyMinutes)} aria-controls={`${plan.id}-weekday-time`} onClick={() => {
          if (!time.weeklyMinutes) patch({ studyTime: { ...time, weeklyMinutes: time.weekdays.map((selected) => selected ? time.dailyMinutes : 0) } });
        }} className="flex min-h-control w-full items-center justify-between gap-3 px-4 py-3 text-left core-control-label font-semibold text-core-text"><span>Lernzeit je Wochentag festlegen</span><ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-core-muted transition-transform motion-reduce:transition-none ${time.weeklyMinutes ? "rotate-180" : ""}`} /></button>
        {time.weeklyMinutes ? <div id={`${plan.id}-weekday-time`} className="grid min-w-0 grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3" role="group" aria-label="Lernzeit je Wochentag">{WEEKDAYS.map((name, index) => <label key={name} className={LABEL}>{name} · Min.<input className={`${FIELD} self-end`} type="number" inputMode="numeric" min={0} max={1440} step={15} value={time.weekdays[index] ? time.weeklyMinutes![index] : 0} onChange={(event) => {
          const minutes = Math.min(1440, Math.max(0, Math.round(Number(event.target.value) || 0)));
          patch({ studyTime: { ...time, weekdays: time.weekdays.map((selected, i) => i === index ? minutes > 0 : selected), weeklyMinutes: time.weeklyMinutes!.map((value, i) => i === index ? minutes : time.weekdays[i] ? value : 0) } });
        }} /></label>)}</div> : null}
      </div>
    </div>
    <label className="flex min-h-control items-center gap-3 core-body text-core-text"><input type="checkbox" className="size-5 accent-core-action" checked={plan.readSummaryBeforeTopics ?? false} onChange={(event) => patch({ readSummaryBeforeTopics: event.target.checked })} />Vor neuen Themen Zusammenfassung lesen</label>
    <div className="flex min-w-0 items-start gap-3 rounded-control bg-core-subtle px-4 py-3 core-body text-core-secondary"><CalendarClock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-core-muted" /><p>Konkrete Lernzeiten kannst du später im Kalender der Planerübersicht festlegen.</p></div>
    <details className="group min-w-0"><Summary>Weitere Lerneinstellungen</Summary><div className="mt-3 grid gap-4">
      <label className="flex min-h-control items-center gap-3 core-body text-core-text"><input type="checkbox" className="size-5 accent-core-action" checked={plan.variants} onChange={(event) => patch({ variants: event.target.checked })} />Varianten einbeziehen</label>
    </div></details>
  </>; }
  function renderContext() { return <aside className="core-surface-raised grid min-w-0 gap-4 rounded-panel p-5" aria-label="Deine Prüfung" data-testid="exam-setup-context">
    <div className="grid gap-3 border-l-strong pl-3" style={{ borderColor: plan.color }}><h3 className="break-words core-heading-3 text-core-text">{plan.name.trim() || "Neue Prüfung"}</h3><p className="core-body text-core-secondary">{formatExamDate(plan.examDate)}</p></div>
    <dl className="grid gap-4 core-caption"><div className="grid gap-1"><dt className="text-core-muted">Lernstart</dt><dd className="tabular-nums text-core-text">{formatExamDate(studyStartDate, "short")}</dd></div><div className="grid gap-1"><dt className="text-core-muted">Lernstoff</dt><dd className="text-core-text">{selected.size ? `${formatExamCount(selected.size, "Stapel", "Stapel")} · ${formatExamCount(selectedCards, "Karte", "Karten")}` : "Noch auswählen"}</dd></div>{step > 0 ? <div className="grid gap-1"><dt className="text-core-muted">Letzte neue Karten</dt><dd className="text-core-text">{formatExamDate(getExamLastNewDate(plan), "short")}</dd></div> : null}
    {step >= 2 ? <div className="grid gap-2"><dt className="text-core-muted">Deine Woche</dt><dd className="grid gap-2">{WEEKDAYS.map((day, index) => <div key={day} className="flex justify-between gap-2"><span className="text-core-muted">{day}</span><span className="text-core-text">{time.weekdays[index] ? formatExamMinutes(time.weeklyMinutes?.[index] ?? time.dailyMinutes) : "Frei"}</span></div>)}</dd></div> : null}</dl>
  </aside>; }
  function renderPreview() { return <div className="grid gap-4" data-testid="exam-plan-preview" aria-busy={busy}>
    {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    {!summary && !error ? <p role="status" className="core-body text-core-muted">Dein Plan wird berechnet …</p> : null}
    {summary ? <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><PlanMetric label="Karten" value={String(summary.totalCards)} /><PlanMetric label="Noch neu" value={String(summary.remainingNewCount)} /><PlanMetric label="Lerntage" value={String(summary.studyDays)} /><PlanMetric label="Eingeplante Lernzeit" value={formatExamMinutes(summary.availableMinutes)} /></div>
      {summary.issues.map((issue) => <StatusMessage key={issue} tone="info">{issue}</StatusMessage>)}</> : null}
  </div>; }
  function renderCalendar() { return <ExamCalendar exams={plannedExams} capacity={capacity} forecast={current ? forecast : null} decks={decks} today={today} initialExamId={plan.id} busy={busy} onChange={(nextExams, nextCapacity) => { const changed = nextExams.find((exam) => exam.id === plan.id); if (changed) patch(changed); setCapacity(nextCapacity); }} />; }
  function renderStepActions() { return <div className="flex flex-wrap justify-between gap-3">{step > 0 ? <ActionButton variant="secondary" icon={ArrowLeft} aria-label="Vorheriger Schritt" disabled={saving} onClick={() => go(step - 1)}>{step === 3 ? <><span className="sm:hidden">Zurück</span><span className="hidden sm:inline">Vorheriger Schritt</span></> : "Vorheriger Schritt"}</ActionButton> : <span />}{step < 3 ? <ActionButton variant="primary" icon={ArrowRight} disabled={saving || !canAdvance} onClick={() => go(step + 1)}>{["Weiter zum Lernstoff", "Weiter zur Lernzeit", "Lernplan ansehen"][step]}</ActionButton> : <ActionButton variant="primary" icon={Save} loading={saving} disabled={!valid} onClick={() => void onSave({ ...plan, name: plan.name.trim(), status: initialPlan?.status ?? "active", updatedAt: new Date().toISOString() }, capacity)}>{initialPlan ? "Speichern" : "Plan aktivieren"}</ActionButton>}</div>; }
}
