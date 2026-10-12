import React from "react";
import { Save, ChevronLeft, ChevronRight, CalendarDays, Clock3, Target, SlidersHorizontal, Settings2 } from "lucide-react";
import type { Deck, ExamLearningPlan, GlobalSchedulerPreferences, StudyTimeCapacity } from "../coreTypes.ts";
import { createExamLearningPlan } from "../examPlanSettings.ts";
import { createExamPortfolioForecast, getExamDayCapacity, examDayDistance, EXAM_MODEL, EXAM_QUIZ_CAPABILITIES, shiftExamDay, type ExamPortfolioForecast } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSlidingTabs, StatTile } from "../ui/coreUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

export interface ExamPlanningPanelProps {
  decks: Deck[]; now: string; preferences: GlobalSchedulerPreferences; timeZone: string;
  initialPlan: ExamLearningPlan | null;
  onLoadDecks: (deckIds: string[]) => Promise<Deck[]>;
  onSavePlan: (plan: ExamLearningPlan, preparationCapacity?: StudyTimeCapacity | null) => Promise<void>;
  onStartPlan: (plan: ExamLearningPlan, blockId?: string) => Promise<void>;
  onSaved?: () => void;
}
const DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const METHOD = { new: "Neue Karten", review: "Wiederholungen", relearning: "Lernschritte", variant: "CoRe-Varianten" };
function formatPlanningDate(key: string) { return DATE.format(new Date(`${key}T12:00:00Z`)); }

interface WeekProps {
  decks: Deck[]; exams: ExamLearningPlan[]; capacity: StudyTimeCapacity;
  forecast: ExamPortfolioForecast | null; busy: boolean;
  today: string; weekStart: string; selectedDate: string; horizon: string;
  onWeekChange: (key: string) => void; onSelectDate: (key: string) => void;
}
function ExamPlanningWeek({ decks, exams, capacity, forecast, busy, today, weekStart, selectedDate, horizon, onWeekChange, onSelectDate }: WeekProps) {
  const days = Array.from({ length: 7 }, (_, index) => shiftExamDay(weekStart, index));
  const examDates = new Set(exams.map((exam) => exam.examDate));
  const selectedDay = forecast?.days.find((day) => day.key === selectedDate);
  const budget = examDates.has(selectedDate) ? 0 : getExamDayCapacity(selectedDate, capacity);
  const onExam = exams.filter((exam) => exam.examDate === selectedDate);
  const selectedOverride = capacity.dateOverrides.find((day) => day.date === selectedDate);
  return <section className="core-exam-week min-w-0 rounded-panel border border-core-border bg-core-surface p-4 sm:p-6" aria-label="Wochenvorschau" data-testid="exam-planning-week" aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="core-caption text-core-muted">Wochenatelier · Vorschau</p><h3 className="core-heading-3 font-semibold text-core-text">{formatPlanningDate(weekStart)} – {formatPlanningDate(days[6])}</h3></div>
      <div className="flex gap-2"><IconButton label="Vorherige Planungswoche" icon={ChevronLeft} disabled={weekStart <= today} onClick={() => onWeekChange(shiftExamDay(weekStart, -7))} /><IconButton label="Nächste Planungswoche" icon={ChevronRight} disabled={shiftExamDay(weekStart, 7) > horizon} onClick={() => onWeekChange(shiftExamDay(weekStart, 7))} /></div>
    </header>
    <p className="mt-3 core-caption text-core-muted">Wähle einen Tag, um seine Lernzeit anzupassen. Alle aktiven Prüfungen teilen sich dieses Budget.</p>
    <p className="mt-3 core-caption text-core-muted core-exam-calendar-hint">Die Woche lässt sich seitlich verschieben.</p>
    <div className="core-exam-week-scroll mt-4" role="region" aria-label="Lerntage der Woche" tabIndex={0}>
      <div className="core-exam-week-grid">{days.map((key) => {
        const day = forecast?.days.find((entry) => entry.key === key);
        const exam = examDates.has(key), outside = key > horizon;
        const minutes = exam || outside ? 0 : getExamDayCapacity(key, capacity);
        const planned = day ? Math.ceil(day.newMinutes + day.reviewMinutes) : null;
        const override = capacity.dateOverrides.some((entry) => entry.date === key);
        return <button key={key} type="button" data-date={key} aria-pressed={selectedDate === key} disabled={outside} aria-label={`${formatPlanningDate(key)}: ${exam ? "Prüfungstag" : minutes ? `${minutes} Minuten${override ? ", angepasst" : ""}` : "frei"}`} onClick={() => onSelectDate(key)} className={`core-exam-choice core-exam-day ${exam ? "bg-core-warning-soft" : "bg-core-subtle"}`}>
          <span className="core-caption text-core-muted">{WEEKDAY.format(new Date(`${key}T12:00:00Z`))}</span>
          <strong className="core-heading-2 font-medium">{Number(key.slice(-2))}</strong>
          <span className="core-body font-semibold">{outside ? "—" : exam ? "Prüfung" : minutes ? `${minutes} Min.` : "frei"}</span>
          <span className="core-caption text-core-muted">{outside ? "Nach dem Ziel" : override && !exam ? "Angepasst" : day?.buffer ? "Puffer" : planned !== null && minutes ? `${planned} Min. geplant` : minutes ? "Lerntag" : "Ohne Lernen"}</span>
          <span className="core-exam-day-track" aria-hidden="true"><span style={{ width: `${minutes && planned !== null ? Math.min(100, planned / minutes * 100) : 0}%` }} /></span>
        </button>;
      })}</div>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile size="compact" label="Budget am Tag" value={`${budget} Min.`} />
      <StatTile size="compact" label="Zeitreserve" value={`${Math.round(selectedDay?.reserveMinutes ?? budget * capacity.reserveFraction)} Min.`} />
      <StatTile size="compact" label="Eingeplant" value={selectedDay ? `${Math.ceil(selectedDay.newMinutes + selectedDay.reviewMinutes)} Min.` : "—"} />
    </div>
    <div className="mt-6 border-t border-core-border pt-5" data-testid="exam-day-preview">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="core-body-large font-semibold">{formatPlanningDate(selectedDate)}</h4><span className="core-caption text-core-muted">{selectedOverride && !onExam.length ? "Individuelle Lernzeit" : "Wochenrhythmus"}</span></div>
      {onExam.length ? <p className="mt-3 core-body text-core-muted">Prüfungstag · {onExam.map((exam) => exam.name).join(" · ")} · kein Lernen eingeplant.</p> : !budget ? <p className="mt-3 core-body text-core-muted">Dieser Tag bleibt frei.</p> : selectedDay?.blocks.length ? <div className="mt-3 grid gap-2">{selectedDay.blocks.map((block) => <div key={block.id} className="core-exam-block flex flex-wrap items-center justify-between gap-2 rounded-control bg-core-subtle p-3">
        <div className="min-w-0 flex-1"><p className="core-body font-semibold">{METHOD[block.method]}</p><p className="break-words core-caption text-core-muted">{block.deckIds.map((id) => decks.find((deck) => deck.id === id)?.name ?? "Gelöschter Stapel").join(" · ")}</p></div><span className="core-caption text-core-secondary">{block.expectedItems} Abfragen · {Math.ceil(block.plannedMinutes)} Min.</span>
      </div>)}</div> : <p className="mt-3 core-body text-core-muted">{busy ? "Die Lernblöcke werden berechnet …" : forecast ? "Für diesen Tag ist keine Aufgabe erforderlich." : "Für diese Angaben liegt noch keine Prognose vor."}</p>}
      {selectedDay?.backlogCount ? <p className="mt-3 core-caption text-core-warning">{selectedDay.backlogCount} fällige Karten passen noch nicht ins Tagesbudget.</p> : null}
    </div>
    <div className="mt-5 flex items-start gap-2 core-caption text-core-muted"><CalendarDays size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><p>Vorschau bis {formatPlanningDate(horizon)} · {Math.max(0, examDayDistance(today, horizon))} Tage. Die Prognose verändert keine Karten oder Reviewtermine.</p></div>
  </section>;
}

const STEPS = ["Prüfung & Lernstoff", "Dein Lernziel", "Verfügbare Zeit", "Lernmethoden & Prognose"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const COVERAGE = ["Kernstoff", "Großteil", "Nahezu vollständig", "Vollständig"];
const QUIZ_NAMES = { "multiple-choice": "Multiple-Choice-Quizblöcke", "past-papers": "Altfragenbasierte Quizgenerierung", "simulation": "Prüfungssimulation" };
const SECURITY = ["Bestehen", "Solide", "Sehr gut", "Maximal"];
export function formatExamHours(minutes: number) { return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(minutes / 60)} h`; }
function NumberField({ label, value, max = 1440, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return <label className="core-field-group"><span className="core-field-label">{label}</span><input type="number" className="core-field w-full" min={0} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(0, Math.round(Number(event.target.value) || 0))))} /></label>;
}
function Choices({ label, labels, values, value, onChange }: { label: string; labels: string[]; values: readonly number[]; value: number; onChange: (value: number) => void }) {
  return <fieldset><legend className="core-field-label">{label}</legend><div className="mt-2 grid grid-cols-2 gap-2">{labels.map((name, i) => <button type="button" key={name} aria-pressed={value === values[i]} className="core-exam-choice min-h-11 rounded-control border border-core-border p-3 text-left core-body" onClick={() => onChange(values[i])}><strong>{name}</strong><span className="block core-caption text-core-muted">{Math.round(values[i] * (values[i] <= 1 ? 100 : 1))} %</span></button>)}</div></fieldset>;
}
export function ExamPlanningPanel({ decks, now, preferences, timeZone, initialPlan, onLoadDecks, onSavePlan, onStartPlan, onSaved }: ExamPlanningPanelProps) {
  const calendarToday = getLearningDayKey(now, { timeZone })!;
  const [plan, setPlan] = React.useState(() => initialPlan ?? { ...createExamLearningPlan(calendarToday, decks[0]?.id), chapterDeckIds: decks.filter((deck) => deck.cardCount > 0 && !deck.deletedAt).slice(0, 1).map((deck) => deck.id) });
  const [editor, setEditor] = React.useState<"plan" | "day">("plan");
  const [weekStart, setWeekStart] = React.useState(calendarToday);
  const [selectedDate, setSelectedDate] = React.useState(calendarToday);
  const inspector = React.useRef<HTMLElement>(null);
  const [step, setStep] = React.useState(0), [loaded, setLoaded] = React.useState<Deck[] | null>(null);
  const [capacity, setCapacity] = React.useState(preferences.examPlanning.preparationCapacity ?? preferences.examPlanning.capacity);
  const [override, setOverride] = React.useState(Boolean(preferences.examPlanning.preparationCapacity));
  const [forecastResult, setForecastResult] = React.useState<{ key: string; source: Deck[]; forecast: ExamPortfolioForecast } | null>(null);
  const [acceptedRisk, setAcceptedRisk] = React.useState(false);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [saved, setSaved] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const editorNavigation = React.useRef(false);
  const loadedSource = React.useRef<Deck[] | null>(null);
  const loadedScope = React.useRef("");
  const effectiveCapacity = override ? capacity : preferences.examPlanning.capacity;
  const others = preferences.examPlanning.exams.filter((exam) => exam.id !== plan.id);
  const calculationKey = JSON.stringify([plan, effectiveCapacity, preferences, now, timeZone]);
  const forecast = forecastResult?.key === calculationKey && forecastResult.source === decks ? forecastResult.forecast : null;
  const summary = forecast?.exams.find((exam) => exam.examId === plan.id);
  const selected = plan.chapterDeckIds.filter((id) => decks.some((deck) => deck.id === id && !deck.deletedAt));
  const valid = Boolean(plan.name.trim() && plan.examDate > calendarToday && plan.examDate <= shiftExamDay(calendarToday, 365) && selected.length);
  const activeExams = [{ ...plan, status: "active" as const }, ...others.filter((exam) => exam.status === "active")];
  const horizon = activeExams.reduce((last, exam) => exam.examDate > last ? exam.examDate : last, calendarToday);
  const selectedOverride = effectiveCapacity.dateOverrides.find((day) => day.date === selectedDate);
  const selectedMinutes = getExamDayCapacity(selectedDate, effectiveCapacity);
  const selectedExam = activeExams.some((exam) => exam.examDate === selectedDate);
  function editDay(date: string) { editorNavigation.current = true; setSelectedDate(date); setStep(2); setEditor("day"); }
  function changeDayMinutes(minutes: number) {
    patchCapacity({ ...effectiveCapacity, dateOverrides: [...effectiveCapacity.dateOverrides.filter((day) => day.date !== selectedDate), { date: selectedDate, minutes }] });
  }
  function changeStep(index: number) {
    if (index && !valid) { setError("Gib einen Namen, einen zukünftigen Termin und mindestens einen Stapel an."); return; }
    editorNavigation.current = true; setEditor("plan"); setStep(index);
  }
  const patch = (fields: Partial<ExamLearningPlan>) => { setPlan((current) => ({ ...current, ...fields })); setAcceptedRisk(false); setSaved(false); setError(""); };
  const patchCapacity = (fields: Partial<StudyTimeCapacity>) => { setOverride(true); setCapacity({ ...effectiveCapacity, ...fields }); setAcceptedRisk(false); setSaved(false); setError(""); };
  React.useEffect(() => {
    const changed = editorNavigation.current;
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      if (changed && window.matchMedia("(max-width: 1023px)").matches) inspector.current?.scrollIntoView({ block: "start", behavior: "instant" });
      else heading.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 });
    }); });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [step, editor, selectedDate]);
  const calculate = React.useEffectEvent(async (signal: AbortSignal) => {
    setBusy(true); setError(""); setForecastResult(null);
    try {
      const requested = [...new Set([plan, ...others.filter((exam) => exam.status === "active")].flatMap((exam) => exam.chapterDeckIds))].filter((id) => decks.some((deck) => deck.id === id && !deck.deletedAt));
      const scope = requested.slice().sort().join("\n");
      const data = loaded && loadedSource.current === decks && loadedScope.current === scope ? loaded : await onLoadDecks(requested);
      signal.throwIfAborted(); setLoaded(data);
      loadedSource.current = decks; loadedScope.current = scope;
      const result = await createExamPortfolioForecast(data, [{ ...plan, status: "active" }, ...others], { now, preferences, timeZone, capacity: effectiveCapacity, signal });
      signal.throwIfAborted(); setForecastResult({ key: calculationKey, source: decks, forecast: result });
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Die Prognose konnte nicht berechnet werden."); }
    finally { if (!signal.aborted) setBusy(false); }
  });
  React.useEffect(() => {
    if (!valid) { setForecastResult(null); setBusy(false); return; }
    const controller = new AbortController(), timer = setTimeout(() => void calculate(controller.signal), 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [valid, calculationKey, decks]);
  async function save() {
    setBusy(true); setError("");
    try { await onSavePlan({ ...plan, status: "active", updatedAt: new Date().toISOString() }, override ? capacity : null); setSaved(true); onSaved?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Die Prüfung konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  }
  const blocked = busy || !valid;
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 text-core-text" data-testid="exam-planning-panel" data-step={step}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="core-caption text-core-muted">Dein Lernplan · Entwurf</p><p className="core-body-large break-words font-semibold">{plan.name || "Neue Prüfung"}</p></div>
      <CoreSlidingTabs ariaLabel="Planangaben bearbeiten" value={String(step)} options={[{ value: "0", label: "Prüfung", icon: CalendarDays }, { value: "1", label: "Lernziel", icon: Target }, { value: "2", label: "Lernzeit", icon: Clock3 }, { value: "3", label: "Methoden", icon: SlidersHorizontal }]} onValueChange={(value) => changeStep(Number(value))} />
    </div>
    {busy ? <p role="status" className="core-caption text-core-muted">Gemeinsamer Plan wird neu berechnet …</p> : null}
    <div className="core-exam-atelier">
        <ExamPlanningWeek decks={loaded ?? decks} exams={activeExams} capacity={effectiveCapacity} forecast={forecast} busy={busy || (valid && !forecast && !error)} today={calendarToday} weekStart={weekStart} selectedDate={selectedDate} horizon={horizon} onWeekChange={(date) => { editorNavigation.current = false; setWeekStart(date); setSelectedDate(date); }} onSelectDate={editDay} />
      <aside ref={inspector} className="core-exam-inspector grid min-w-0 content-start gap-4 rounded-panel border border-core-border bg-core-subtle p-4 sm:p-6" aria-label="Lernplan bearbeiten" data-testid="exam-planning-inspector">
        <div className="flex items-center justify-between gap-3"><p className="core-caption text-core-muted">{editor === "day" ? "Tag bearbeiten" : "Bereich " + (step + 1) + " von 4"}</p><Settings2 size={18} aria-hidden="true" className="text-core-muted" /></div>
        <h3 ref={heading} tabIndex={-1} className="core-heading-3 font-semibold outline-none">{editor === "day" ? formatPlanningDate(selectedDate) : STEPS[step]}</h3>
        {editor === "day" ? <>
          {selectedExam ? <StatusMessage tone="info">Prüfungstage bleiben frei. Wähle einen anderen Tag, um die Lernzeit anzupassen.</StatusMessage> : <>
            <div className="core-field-group"><span className="core-field-label">Dieser Tag</span><CoreSelect ariaLabel="Art des Lerntags" value={selectedMinutes ? "study" : "free"} options={[{ value: "study", label: "Lerntag" }, { value: "free", label: "Freier Tag" }]} onValueChange={(value) => changeDayMinutes(value === "free" ? 0 : Math.max(15, getExamDayCapacity(selectedDate, { ...effectiveCapacity, dateOverrides: [] })))} /></div>
            <NumberField label="Lernzeit an diesem Tag · Minuten" value={selectedMinutes} onChange={changeDayMinutes} />
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Lernzeit für diesen Tag">{[20, 35, 50].map((minutes) => <button type="button" key={minutes} className="core-exam-choice min-h-11 rounded-control border border-core-border core-body" aria-pressed={selectedMinutes === minutes} onClick={() => changeDayMinutes(minutes)}>{minutes} Min.</button>)}</div>
            {selectedOverride ? <ActionButton variant="secondary" onClick={() => patchCapacity({ ...effectiveCapacity, dateOverrides: effectiveCapacity.dateOverrides.filter((day) => day.date !== selectedDate) })}>Wochenrhythmus verwenden</ActionButton> : null}
          </>}
          <p className="core-caption text-core-muted">Die Änderung gilt nur für diesen Tag und für alle aktiven Prüfungen. Deine Grundeinstellung bleibt erhalten.</p>
          <ActionButton variant="secondary" icon={Clock3} onClick={() => changeStep(2)}>Wochenrhythmus bearbeiten</ActionButton>
        </> : <>
    {step === 0 ? <>
      {plan.examDate <= calendarToday ? <StatusMessage tone="warning">Der Termin ist heute oder bereits vergangen. Wähle einen zukünftigen Prüfungstag.</StatusMessage> : null}
      <label className="core-field-group"><span className="core-field-label">Name der Prüfung</span><input className="core-field w-full" required maxLength={120} value={plan.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      <div className="core-field-group"><span className="core-field-label">Prüfungsdatum</span><CoreDatePicker value={plan.examDate} min={shiftExamDay(calendarToday, 1)} max={shiftExamDay(calendarToday, 365)} today={calendarToday} ariaLabel="Prüfungsdatum auswählen" onValueChange={(examDate) => patch({ examDate })} className="w-full" /></div>
      <fieldset><legend className="core-field-label">Prüfungsrelevante Stapel und Unterstapel</legend><p className="mt-1 core-caption text-core-muted">Mehrere Hauptstapel sind möglich. Ein Zweig wählt seine vorhandenen Kapitel; Karten werden einmal gezählt.</p>
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">{decks.filter((deck) => !deck.deletedAt).map((deck) => {
        const children = [...collectDeckTreeIds(decks, deck.id)].filter((id) => decks.some((candidate) => candidate.id === id && candidate.cardCount > 0));
        return <div key={deck.id} className="rounded-control border border-core-border p-3">
          <label data-selected={selected.includes(deck.id)} className="core-exam-choice flex min-h-11 cursor-pointer items-center gap-3 rounded-control p-2 core-body"><input type="checkbox" disabled={!deck.cardCount} checked={selected.includes(deck.id)} onChange={(event) => {
            setLoaded(null); const ids = event.target.checked ? [...selected, deck.id] : selected.filter((id) => id !== deck.id);
            patch({ chapterDeckIds: ids, rootDeckId: ids[0] ?? deck.id });
          }} className="accent-core-action" /><span className="min-w-0 flex-1"><strong className="break-words">{deck.hierarchyPath?.join(" / ") || deck.name}</strong><span className="block core-caption text-core-muted">{deck.cardCount} {deck.cardCount === 1 ? "Karte" : "Karten"}</span></span></label>
          {children.length > Number(deck.cardCount > 0) ? <ActionButton variant="secondary" className="mt-2 w-full" onClick={() => { setLoaded(null); const all = children.every((id) => selected.includes(id)), ids = all ? selected.filter((id) => !children.includes(id)) : [...new Set([...selected, ...children])]; patch({ chapterDeckIds: ids, rootDeckId: ids[0] ?? deck.id }); }}>{children.every((id) => selected.includes(id)) ? "Zweig abwählen" : "Ganzen Zweig auswählen"}</ActionButton> : null}
        </div>;
      })}</div></fieldset>
      <p className="core-caption text-core-muted">{selected.length} Stapel ausgewählt. Ausgesetzte Karten, Entwürfe und Konflikte bleiben ausgeschlossen.</p>
    </> : null}
    {step === 1 ? <>
      <Choices label="A · Gewünschter Stoffumfang" labels={COVERAGE} values={EXAM_MODEL.coverage} value={plan.coverage} onChange={(coverage) => patch({ coverage })} />
      <p className="core-caption text-core-muted">Bezieht sich auf die ausgewählten vorhandenen Karten, nicht auf die Vollständigkeit des universitären Prüfungsstoffs.</p>
      <Choices label="B · Gewünschtes Sicherheitsniveau" labels={SECURITY} values={EXAM_MODEL.retention} value={plan.desiredRetention} onChange={(desiredRetention) => patch({ desiredRetention })} />
      <p className="core-caption text-core-muted">Heuristische Zielstufen, keine Noten- oder Bestehensprognose. Umfang und Sicherheit sind unabhängig.</p>
      <div className="core-field-group"><span className="core-field-label">Priorität dieser Prüfung</span><CoreSelect ariaLabel="Priorität dieser Prüfung" value={plan.priority} options={[{ value: "low", label: "Niedrig" }, { value: "normal", label: "Normal" }, { value: "high", label: "Hoch" }]} onValueChange={(value) => patch({ priority: value as ExamLearningPlan["priority"] })} /></div>
    </> : null}
    {step === 2 ? <>
      <p className="core-body">Deine Grundeinstellung: {preferences.examPlanning.capacity.weekdayMinutes} Minuten im Alltag und {preferences.examPlanning.capacity.weekendMinutes} Minuten am Wochenende.</p>
      <p className="core-caption text-core-muted">Alle aktiven Prüfungen teilen sich diese Minuten. Die Grundeinstellung bleibt erhalten. Eine Vorbereitungsanpassung gilt gemeinsam, bis du sie zurücksetzt.</p>
      <label className="flex min-h-11 items-center gap-3 core-body"><input type="checkbox" checked={override} onChange={(event) => { setOverride(event.target.checked); setAcceptedRisk(false); setSaved(false); setError(""); }} className="accent-core-action" />Lernzeit für die Vorbereitung anpassen</label>
      {override ? <div className="grid gap-4">
        <NumberField label="Alltag · Minuten pro Tag" value={capacity.weekdayMinutes} onChange={(weekdayMinutes) => patchCapacity({ weekdayMinutes })} />
        <NumberField label="Wochenende · Minuten pro Tag" value={capacity.weekendMinutes} onChange={(weekendMinutes) => patchCapacity({ weekendMinutes })} />
        <fieldset><legend className="core-field-label">Lerntage</legend><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{WEEKDAYS.map((name, i) => <button key={name} type="button" aria-pressed={capacity.weekdays[i]} className="core-exam-choice min-h-11 rounded-control border border-core-border core-body" onClick={() => patchCapacity({ weekdays: capacity.weekdays.map((on, index) => index === i ? !on : on) })}>{name}</button>)}</div></fieldset>
        <NumberField label="Mindestbudget an aktiven Lerntagen · Minuten" value={capacity.minimumMinutes} onChange={(minimumMinutes) => patchCapacity({ minimumMinutes })} />
        <label className="core-field-group"><span className="core-field-label">Reserve: {Math.round(capacity.reserveFraction * 100)} %</span><input type="range" className="min-h-11 w-full accent-core-action" min={0} max={40} step={1} value={capacity.reserveFraction * 100} onChange={(event) => patchCapacity({ reserveFraction: Number(event.target.value) / 100 })} /></label>
        <div className="grid gap-3"><h4 className="core-body font-semibold">Einzelne freie oder kürzere Tage / zusätzliche Zeit</h4>
        {capacity.dateOverrides.map((day, index) => <div key={index} className="grid min-w-0 gap-2 rounded-control border border-core-border p-3"><CoreDatePicker value={day.date} min={calendarToday} max={shiftExamDay(calendarToday, 365)} today={calendarToday} ariaLabel={`Ausnahmetag ${index + 1}`} onValueChange={(date) => patchCapacity({ dateOverrides: capacity.dateOverrides.map((entry, i) => i === index ? { ...entry, date } : entry) })} /><NumberField label="Gesamtbudget an diesem Tag · 0 = frei" value={day.minutes} onChange={(minutes) => patchCapacity({ dateOverrides: capacity.dateOverrides.map((entry, i) => i === index ? { ...entry, minutes } : entry) })} /><ActionButton variant="secondary" onClick={() => patchCapacity({ dateOverrides: capacity.dateOverrides.filter((_, i) => i !== index) })}>Ausnahme entfernen</ActionButton></div>)}
        <ActionButton variant="secondary" onClick={() => { let date = calendarToday; while (capacity.dateOverrides.some((day) => day.date === date)) date = shiftExamDay(date, 1); patchCapacity({ dateOverrides: [...capacity.dateOverrides, { date, minutes: 0 }] }); }}>Ausnahmetag hinzufügen</ActionButton></div>
      </div> : null}
      <p className="core-caption text-core-muted">{Math.round(effectiveCapacity.reserveFraction * 100)} % bleiben als Zeitreserve frei. Prüfungstage sind frei; fällige Reviews warten nach Ausfällen auf verfügbare Kapazität.</p>
    </> : null}
    {step === 3 ? <>
      <div className="rounded-control border border-core-border p-4 core-body"><strong>Karteikartenlernen</strong><p className="mt-1 core-caption text-core-muted">Aktiv · alle vorhandenen Kartentypen, einschließlich Auswahlfragen. Übe deinen Stoff mit den vorhandenen Karten.</p></div>
      <label className="flex min-h-11 items-center gap-3 rounded-control border border-core-border p-4 core-body"><span className="min-w-0 flex-1"><strong>CoRe-Varianten</strong><span className="mt-1 block core-caption text-core-muted">Vorhandene geeignete Umformulierungen nach den bestehenden Reife- und Fallback-Regeln. Keine automatische Erstellung.</span></span><input type="checkbox" role="switch" aria-label="CoRe-Varianten" checked={plan.variants} onChange={(event) => patch({ variants: event.target.checked })} className="core-exam-switch shrink-0" /></label>
      {EXAM_QUIZ_CAPABILITIES.map((capability) => <label key={capability.kind} className="flex min-h-11 items-center gap-3 rounded-control border border-core-border p-4 core-body text-core-muted"><span className="min-w-0 flex-1">{QUIZ_NAMES[capability.kind]}<span className="mt-1 block core-caption">Noch nicht verfügbar</span></span><input type="checkbox" role="switch" disabled checked={false} aria-label={QUIZ_NAMES[capability.kind]} className="core-exam-switch shrink-0" /></label>)}
      <NumberField label="Puffertage am Ende · kein neuer Stoff" value={plan.bufferDays} max={30} onChange={(bufferDays) => patch({ bufferDays })} />

      {saved ? <><StatusMessage tone="success">Prüfung gespeichert.</StatusMessage><ActionButton variant="primary" onClick={() => void onStartPlan(plan).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Die Lerneinheit konnte nicht gestartet werden."))}>Heutige Einheit lernen</ActionButton></> : null}
    </> : null}
        </>}
    {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
    {editor === "plan" ? <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-core-border pt-4"><ActionButton variant="secondary" disabled={!step || busy} onClick={() => changeStep(step - 1)}>Zurück</ActionButton>
      {step < 3 ? <ActionButton variant="primary" disabled={blocked} onClick={() => changeStep(step + 1)}>Weiter</ActionButton> : <ActionButton variant="primary" icon={Save} loading={busy} disabled={busy || saved || !summary || (!summary.feasible && !acceptedRisk) || !summary.totalCards || capacity.dateOverrides.length !== new Set(capacity.dateOverrides.map((day) => day.date)).size} onClick={() => void save()}>Plan aktivieren</ActionButton>}
    </div> : <ActionButton variant="primary" onClick={() => changeStep(3)}>Plan prüfen & aktivieren</ActionButton>}
      </aside>
        {summary && forecast ? <div className="core-exam-feasibility grid gap-4 rounded-panel border border-core-border bg-core-surface p-4 sm:p-6" data-testid="exam-feasibility">
        <h4 className="core-heading-3 font-semibold">Passt dein Ziel in die verfügbare Zeit?</h4>
        <dl className="grid grid-cols-2 gap-3 core-body">{[["Benötigt · Schätzung", formatExamHours(summary.requiredMinutes)], ["Gemeinsam bis zum Termin", formatExamHours(summary.availableMinutes)], ["Reserve", formatExamHours(summary.reserveMinutes)], ["Nutzbare Lerntage", String(summary.usableDays)], ["Bereits bearbeitet", String(summary.knownCards)], ["Noch neue Karten", String(summary.remainingNewCount)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-control bg-core-subtle p-3"><dt className="core-caption text-core-muted">{label}</dt><dd className="core-body-large break-words font-semibold">{value}</dd></div>)}</dl>
        <p className="core-body">Erwartete Zielerreichung: ca. {Math.round(summary.predicted.achievement * 100)} % · Modellschätzung.</p>
        <StatusMessage tone={summary.feasible ? "success" : "warning"}>{summary.feasible ? "Der Plan ist unter den Prognoseannahmen erreichbar." : "Dein Ziel ist voraussichtlich gefährdet. Du kannst den Plan dennoch bewusst aktivieren."}</StatusMessage>
        {summary.issues.length ? <ul className="grid gap-2 core-body text-core-muted">{summary.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        {!summary.feasible ? <div className="grid gap-3 rounded-control border border-core-border p-4">
          <ActionButton variant="secondary" onClick={() => patchCapacity({ weekdayMinutes: Math.min(1440, effectiveCapacity.weekdayMinutes + 15), weekendMinutes: Math.min(1440, effectiveCapacity.weekendMinutes + 15) })}>Mehr Lernzeit · täglich +15 Minuten</ActionButton>
          <label className="core-field-group"><span className="core-field-label">Stoffumfang reduzieren: {plan.coverage} %</span><input type="range" min={50} max={100} step={5} value={plan.coverage} onChange={(event) => patch({ coverage: Number(event.target.value) })} className="min-h-11 w-full accent-core-action" /></label>
          <label className="core-field-group"><span className="core-field-label">Sicherheitsniveau reduzieren: {Math.round(plan.desiredRetention * 100)} %</span><input type="range" min={80} max={97} value={Math.round(plan.desiredRetention * 100)} onChange={(event) => patch({ desiredRetention: Number(event.target.value) / 100 })} className="min-h-11 w-full accent-core-action" /></label>
          <label className="flex min-h-11 items-center gap-3 core-body"><input type="checkbox" checked={acceptedRisk} onChange={(event) => setAcceptedRisk(event.target.checked)} className="accent-core-action" />Trotz Zielgefährdung aktivieren</label>
        </div> : null}
<details><summary className="min-h-11 cursor-pointer core-body font-semibold">Berechnung & Lernphasen</summary><p className="mt-3 core-caption text-core-muted">{forecast.ratingAssumption} Zeitdaten sind je Lernmethode robuste Mediane der letzten 80 Antworten, sonst Standardwerte. Unsicherheit: {forecast.uncertainty === "high" ? "hoch · geringe Datenlage" : "mittel"}. Wiederholungen laufen in allen Phasen mit; ein Learning Item mit Varianten zählt einmal.</p>
        <div className="mt-3 grid gap-2 core-body">{summary.phases.map((phase, index) => <p key={index}><strong>{phase.phase}</strong> · {phase.days} Tage</p>)}</div></details>
      </div> : null}
    </div>
  </div>;
}
