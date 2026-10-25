import React from "react";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import type { ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { Deck, ExamPlan, GlobalSchedulerPreferences, StudyTimeCapacity } from "../coreTypes.ts";
import { EXAM_PLANNING_LIMITS, EXAM_RETENTION_LEVELS, createExamPlan } from "../examPlanSettings.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { getExamDeckIds, getExamLastNewDate, getExamTopicOrder, shiftExamDay, toggleExamDeckSelection } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { createDeckLibraryModel, type DeckLibrarySummary } from "../libraryModel.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { ColorWheelPicker } from "../ui/ColorWheelPicker.tsx";
import { ActionDialog, PageHeader, StatTile } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { ExamCalendar } from "./ExamCalendar.tsx";
import { ExamTopicOrder } from "./ExamTopicOrder.tsx";
import { formatExamDate, formatExamMinutes, formatExamPercent } from "./examPlanningUi.ts";
import { useExamForecast } from "./useExamForecast.ts";

const STEPS = ["Prüfung", "Lernstoff", "Lernzeit", "Dein Plan"];
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const FIELD = "min-h-control w-full min-w-0 rounded-control border border-core-border bg-core-surface px-3 text-core-text";
const LABEL = "grid min-w-0 gap-2 core-body font-semibold text-core-muted";

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
  const [showTimeBlocks, setShowTimeBlocks] = React.useState(false);
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
  const rows = React.useMemo(() => createDeckLibraryModel(decks, { now, timeZone, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, deckSummaries }).rows, [deckSummaries, decks, now, preferences.dayStartHour, preferences.learnAheadMinutes, timeZone]);
  const selected = getExamDeckIds(decks, plan);
  const validBasics = Boolean(plan.name.trim() && plan.examDate > today && plan.examDate <= shiftExamDay(today, 365));
  const valid = validBasics && selected.size > 0;
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
  return <div className="mx-auto grid w-full min-w-0 max-w-5xl gap-6" data-testid="exam-plan-editor" data-embedded={embedded || undefined}>
    {!embedded ? <>
    <PageHeader eyebrow="Prüfungen" title={initialPlan ? "Prüfung bearbeiten" : "Prüfung planen"} action={<ActionButton variant="secondary" icon={ArrowLeft} disabled={saving} onClick={cancel}>Zurück</ActionButton>} />
    <ol className="grid grid-cols-4 gap-2" aria-label="Schritte der Prüfungsplanung">{STEPS.map((name, index) => <li key={name}><button type="button" disabled={saving || index > step} aria-current={step === index ? "step" : undefined} onClick={() => go(index)} className={`grid min-h-control w-full gap-1 rounded-control border px-2 py-3 text-left ${step === index ? "border-core-action bg-core-surface" : "border-transparent bg-core-subtle"}`}><span className="core-caption text-core-muted">{index + 1}</span><span className="break-words core-caption font-semibold text-core-text">{name}</span></button></li>)}</ol>
    </> : null}
    <fieldset disabled={saving} className={embedded ? "grid min-w-0 gap-5" : "core-surface-raised grid min-w-0 gap-6 rounded-panel p-4 sm:p-6"} data-testid="exam-plan-inspector">
      {!embedded ? <div><p className="core-caption text-core-muted">Schritt {step + 1} von 4</p><h2 ref={heading} tabIndex={-1} className="scroll-mt-24 core-heading-2 font-semibold text-core-text">{["Welche Prüfung steht an?", "Was möchtest du lernen?", "Deine Lernzeit", "So sieht dein Lernplan aus"][step]}</h2></div> : <h5 className="core-body font-semibold text-core-text">Prüfung bearbeiten</h5>}
      {embedded || step === 0 ? <div className="grid max-w-2xl gap-5">
        {!embedded ? <p className="core-body text-core-muted">Gib deiner Prüfung einen Namen und lege den Termin fest. Danach wählen wir den Lernstoff und verteilen ihn auf deine verfügbaren Tage.</p> : null}
        <label className={LABEL}>Name<input autoComplete="off" aria-invalid={showErrors && !plan.name.trim()} placeholder="Zum Beispiel Anatomie" className={FIELD} maxLength={120} value={plan.name} onChange={(event) => patch({ name: event.target.value })} /></label>
        <label className={LABEL}>Farbe<ColorWheelPicker value={plan.color ?? "#6f7e9e"} ariaLabel="Prüfungsfarbe auswählen" className="justify-self-start" onValueCommit={(color) => patch({ color, colorIndex: undefined })} /></label>
        {showErrors && !plan.name.trim() ? <p role="alert" className="core-field-error">Bitte gib der Prüfung einen Namen.</p> : null}
        <div className={LABEL}><span>Prüfungsdatum</span><CoreDatePicker value={plan.examDate} min={shiftExamDay(today, 1)} max={shiftExamDay(today, 365)} today={today} ariaLabel="Prüfungsdatum auswählen" onValueChange={(examDate) => { patch({ examDate, ...(plan.topicDates ? { topicDates: plan.topicDates.filter((topic) => topic.date < examDate) } : {}) }); if (capacity.timeBlocks) patchCapacity({ timeBlocks: capacity.timeBlocks.filter((block) => block.examId !== plan.id || block.date < examDate) }); }} className="w-full" /></div>
        {showErrors && (plan.examDate <= today || plan.examDate > shiftExamDay(today, 365)) ? <p role="alert" className="core-field-error">Wähle einen zukünftigen Termin innerhalb der nächsten 365 Tage.</p> : null}
        <p className="core-caption text-core-muted">Datum und Lernzeiten kannst du später anpassen. Bei einem früheren Termin werden spätere Themenwünsche und Zeitblöcke dieser Prüfung entfernt.</p>
      </div> : null}
      {embedded || step === 1 ? <details open={embedded ? (showErrors && !selected.size) || undefined : true}>
        <summary className={embedded ? "flex min-h-control cursor-pointer items-center gap-2 core-body font-semibold text-core-text" : "hidden"}>Stapel · {selected.size} ausgewählt</summary><div className="grid min-w-0 gap-3">
        <p className="core-body text-core-muted">Ein Oberstapel wählt alle Unterstapel mit aus. Einzelne Unterstapel kannst du anschließend abwählen.</p>
        <fieldset className="grid min-w-0 gap-3"><legend className="core-body font-semibold text-core-muted">Stapel · {selected.size} ausgewählt · {selectedCards} Karten</legend><div className="mt-3 grid max-h-[28rem] gap-1 overflow-y-auto">{rows.map((row) => {
          const branch = row.childrenCount ? [...collectDeckTreeIds(decks, row.id)] : [row.id];
          const checked = selected.has(row.id), partial = branch.some((id) => selected.has(id) !== checked);
          return <label key={row.id} className="flex min-h-control min-w-0 cursor-pointer items-center gap-3 rounded-control px-3 py-2 hover:bg-core-subtle" style={{ marginInlineStart: `${Math.min(row.depth, 4) * 0.75}rem` }}><input type="checkbox" aria-label={`${row.name}${row.childrenCount ? ", mit Unterstapeln" : ""}`} ref={(element) => { if (element) element.indeterminate = partial; }} className="size-5 shrink-0 accent-core-action" checked={checked} onChange={(event) => toggleDeck(row.id, event.target.checked)} /><span className="min-w-0 flex-1 break-words core-body text-core-text">{row.name}</span><span className="shrink-0 core-caption text-core-muted">{row.directInventory.totalCards}</span></label>;
        })}</div></fieldset>
        {showErrors && !selected.size ? <p role="alert" className="core-field-error">Wähle mindestens einen Stapel.</p> : null}
        {selectionError ? <StatusMessage tone="error">{selectionError}</StatusMessage> : null}
        <label className={LABEL}>Wie viele Tage vor der Klausur möchtest du die letzte neue Karte lernen?<input type="number" className={FIELD} min={1} max={365} value={plan.bufferDays} onChange={(event) => patch({ bufferDays: Math.min(365, Math.max(1, Math.round(Number(event.target.value) || 1))) })} /></label>
        <p className="core-caption text-core-muted">Letzte neue Karten spätestens am {formatExamDate(getExamLastNewDate(plan))}. Ist dieser Tag frei, endet neuer Stoff früher.</p>
        <ExamTopicOrder topics={topicOrder.map((id) => ({ id, name: decks.find((deck) => deck.id === id)!.name }))} disabled={saving} onChange={(topicOrder) => patch({ topicOrder })} />
        <div className="rounded-control bg-core-subtle p-4"><p className="core-body font-semibold text-core-text">Zusammenhängend nach Themen lernen</p><p className="mt-1 core-body text-core-muted">Deine Unterstapel bilden die Themen. Kleine Themen bleiben möglichst an einem Tag; große Themen werden fortlaufend aufgeteilt. Ohne thematische Unterstapel behandeln wir den Stapel als ein Thema.</p></div>
      </div></details> : null}
      {embedded ? <details><summary className="min-h-control cursor-pointer py-2 core-body font-semibold text-core-text">Lernzeit und weitere Einstellungen</summary><div className="mt-4 grid gap-6">{renderPlanningOptions()}</div></details> : null}
      {!embedded && step === 2 ? renderPlanningOptions() : null}
      {valid && (embedded || step >= 2) ? renderFeasibility() : null}
      {saveError ? <StatusMessage tone="error" announce="assertive">{saveError}</StatusMessage> : null}
      {embedded ? <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end"><ActionButton variant="secondary" disabled={saving} onClick={cancel}>Abbrechen</ActionButton><ActionButton variant="primary" icon={Save} loading={saving} onClick={() => { if (!valid) setShowErrors(true); else void onSave({ ...plan, name: plan.name.trim(), updatedAt: new Date().toISOString() }, capacity); }}>Speichern</ActionButton></div> : renderStepActions()}
    </fieldset>
    {!embedded && step === 3 ? renderCalendar() : null}
    <ActionDialog open={discarding} title="Änderungen verwerfen?" description="Deine Änderungen an dieser Prüfung wurden noch nicht gespeichert." cancelLabel="Weiter bearbeiten" confirmLabel="Verwerfen" onCancel={() => setDiscarding(false)} onConfirm={onCancel} />
  </div>;

  function renderPlanningOptions() { return <>
    <fieldset className="grid gap-3"><legend className="core-body font-semibold text-core-muted">Wie viel möchtest du für diese Klausur lernen?</legend>
      <label className={LABEL}>Durchschnittliche Stunden pro Lerntag<input className={FIELD} type="number" inputMode="decimal" min={0} max={24} step={0.25} value={time.dailyMinutes / 60} onChange={(event) => patch({ studyTime: { ...time, dailyMinutes: Math.min(1440, Math.max(0, Math.round(Number(event.target.value) * 60 || 0))), weeklyMinutes: undefined } })} /></label>
      <p className="core-body text-core-muted">Deine Zeitangaben gewichten die Tage dieser Klausur. Daraus wird keine Bearbeitungszeit pro Karte berechnet. Einzelne Tage kannst du im Kalender ändern.</p>
      <div className="flex flex-wrap gap-3">{WEEKDAYS.map((name, index) => <label key={name} className="flex min-h-control items-center gap-2 core-body text-core-text"><input type="checkbox" className="size-5 accent-core-action" checked={time.weekdays[index]} onChange={(event) => patch({ studyTime: { ...time, weekdays: time.weekdays.map((value, i) => i === index ? event.target.checked : value) } })} />{name}</label>)}</div>
      <p className="core-caption text-core-muted">Nicht ausgewählte Wochentage bleiben frei. Ein konkreter Lernblock kann einen freien Tag überschreiben.</p>
    </fieldset>
    <label className="flex min-h-control items-center gap-3 core-body text-core-text"><input type="checkbox" className="size-5 accent-core-action" checked={plan.readSummaryBeforeTopics ?? false} onChange={(event) => patch({ readSummaryBeforeTopics: event.target.checked })} />Vor neuen Themen Zusammenfassung lesen</label>
    <details onToggle={(event) => setShowTimeBlocks(event.currentTarget.open)}><summary className="min-h-control cursor-pointer py-3 core-body font-semibold text-core-text">Konkrete Lernblöcke im Kalender setzen</summary><p className="mb-4 core-body text-core-muted">Zugeordnete Kartenlernblöcke ersetzen die normale Lernzeit dieses Tages für ihr Fach. Alle anderen Tage behalten ihre Vorgabe.</p>{showTimeBlocks ? renderCalendar() : null}</details>
    <details><summary className="min-h-control cursor-pointer py-3 core-body font-semibold text-core-text">Weitere Lerneinstellungen</summary><div className="mt-3 grid gap-4">
      <label className={LABEL}>Abrufziel für Wiederholungen<CoreSelect ariaLabel="Abrufziel für Wiederholungen" value={String(plan.desiredRetention)} options={EXAM_RETENTION_LEVELS.map((level) => ({ value: String(level), label: formatExamPercent(level) }))} onValueChange={(value) => patch({ desiredRetention: Number(value) })} /></label>
      <label className="flex min-h-control items-center gap-3 core-body text-core-text"><input type="checkbox" className="size-5 accent-core-action" checked={plan.variants} onChange={(event) => patch({ variants: event.target.checked })} />Varianten einbeziehen</label>
      <p className="core-caption text-core-muted">Das Abrufziel steuert die Wiederholungen. Es ist keine Bestehenswahrscheinlichkeit.</p>
      {time.weeklyMinutes ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{WEEKDAYS.map((name, index) => <label key={name} className={LABEL}>{name} · Stunden<input className={FIELD} type="number" min={0} max={24} step={0.25} value={time.weeklyMinutes![index] / 60} onChange={(event) => patch({ studyTime: { ...time, weeklyMinutes: time.weeklyMinutes!.map((value, i) => i === index ? Math.min(1440, Math.max(0, Math.round(Number(event.target.value) * 60 || 0))) : value) } })} /></label>)}</div> : null}
    </div></details>
  </>; }
  function renderFeasibility() { return <div className="grid gap-4" data-testid="exam-plan-preview" aria-busy={busy}>
    {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    {!summary && !error ? <p role="status" className="core-body text-core-muted">Dein Plan wird berechnet …</p> : null}
    {summary ? <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><StatTile size="compact" label="Karten" value={String(summary.totalCards)} /><StatTile size="compact" label="Noch neu" value={String(summary.remainingNewCount)} /><StatTile size="compact" label="Einführungstage" value={String(summary.usableDays)} /><StatTile size="compact" label="Eingeplante Lernzeit" value={formatExamMinutes(summary.availableMinutes)} /></div>
      {summary.issues.map((issue) => <StatusMessage key={issue} tone="info">{issue}</StatusMessage>)}
      <p className="core-caption text-core-muted">Die Verteilung berücksichtigt erwartete FSRS-Lernkontakte. Künftige Antworten sind Annahmen; deine tatsächlichen Ergebnisse aktualisieren den Plan. Auch hohe Tagesmengen lassen sich planen.</p></> : null}
  </div>; }
  function renderCalendar() { return <ExamCalendar exams={plannedExams} capacity={capacity} forecast={current ? forecast : null} decks={decks} today={today} initialExamId={plan.id} busy={busy} onChange={(nextExams, nextCapacity) => { const changed = nextExams.find((exam) => exam.id === plan.id); if (changed) patch(changed); setCapacity(nextCapacity); }} />; }
  function renderStepActions() { return <div className="flex flex-wrap justify-between gap-3">{step > 0 ? <ActionButton variant="secondary" icon={ArrowLeft} disabled={saving} onClick={() => go(step - 1)}>Vorheriger Schritt</ActionButton> : <span />}{step < 3 ? <ActionButton variant="primary" icon={ArrowRight} disabled={(step === 0 && !validBasics) || (step === 1 && !plan.deckIds.length)} onClick={() => go(step + 1)}>{["Weiter zum Lernstoff", "Weiter zur Lernzeit", "Lernplan ansehen"][step]}</ActionButton> : <ActionButton variant="primary" icon={Save} loading={saving} disabled={!valid} onClick={() => void onSave({ ...plan, name: plan.name.trim(), status: initialPlan?.status ?? "active", updatedAt: new Date().toISOString() }, capacity)}>{initialPlan ? "Speichern" : "Plan aktivieren"}</ActionButton>}</div>; }
}
