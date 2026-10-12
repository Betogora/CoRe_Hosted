import React from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Save, Target } from "lucide-react";
import type { ExamPlanningScreenProps } from "../appScreenProps.ts";
import type { Deck, ExamPlan, GlobalSchedulerPreferences, StudyTimeCapacity } from "../coreTypes.ts";
import { EXAM_PLANNING_LIMITS, EXAM_RETENTION_LEVELS, createExamPlan } from "../examPlanSettings.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { getExamDayCapacity, shiftExamDay, type ExamPortfolioForecast } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { createDeckLibraryModel, type DeckLibrarySummary } from "../libraryModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { CoreSlidingTabs, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { EXAM_METHOD_LABELS, formatExamDate, formatExamMinutes, formatExamPercent } from "./ExamPlanningScreen.tsx";
import { useExamForecast } from "./useExamForecast.ts";

const RETENTION_LABELS = ["Bestehen", "Solide", "Sehr gut", "Maximal"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const QUIZ_METHODS = ["Multiple-Choice-Quiz", "Altfragen", "Prüfungssimulation"];
type EditorTab = "exam" | "goal" | "time" | "day";
const FIELD = "min-h-control w-full min-w-0 rounded-control border border-core-border bg-core-surface px-3 text-core-text";
const LABEL = "grid gap-2 core-body font-semibold text-core-muted";

function choiceClass(selected: boolean) {
  return `min-h-control rounded-control border px-3 py-2 text-left core-body ${selected ? "border-core-action bg-core-surface text-core-text shadow-soft" : "border-core-border text-core-muted hover:text-core-text"}`;
}

function MinutesField({ label, value, max = 1440, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label className={LABEL}>
      {label}
      <input type="number" inputMode="numeric" className={FIELD} min={0} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(0, Math.round(Number(event.target.value) || 0))))} />
    </label>
  );
}

interface WeekProps {
  capacity: StudyTimeCapacity; forecast: ExamPortfolioForecast | null; examDates: Set<string>; busy: boolean;
  today: string; horizon: string; weekStart: string; selectedDate: string | null;
  onWeekChange: (key: string) => void; onSelectDate: (key: string) => void;
}

/** Week atelier: the shared minutes per day, the planned load, and the day being edited. */
function ExamWeek({ capacity, forecast, examDates, busy, today, horizon, weekStart, selectedDate, onWeekChange, onSelectDate }: WeekProps) {
  const days = Array.from({ length: 7 }, (_, index) => shiftExamDay(weekStart, index));
  return (
    <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" aria-busy={busy} data-testid="exam-week-atelier">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="core-heading-3 font-semibold text-core-text">{formatExamDate(weekStart, "short")} – {formatExamDate(days[6], "short")}</h3>
        <div className="flex gap-2">
          <IconButton label="Vorherige Woche" icon={ChevronLeft} disabled={weekStart <= today} onClick={() => onWeekChange(shiftExamDay(weekStart, -7))} />
          <IconButton label="Nächste Woche" icon={ChevronRight} disabled={shiftExamDay(weekStart, 7) > horizon} onClick={() => onWeekChange(shiftExamDay(weekStart, 7))} />
        </div>
      </div>
      <div className="min-w-0 overflow-x-auto" role="region" aria-label="Lerntage der Woche" tabIndex={0}>
        <div className="grid min-w-[35rem] grid-cols-7 gap-2">
          {days.map((key) => {
            const exam = examDates.has(key), outside = key > horizon;
            const minutes = exam || outside ? 0 : getExamDayCapacity(key, capacity);
            const day = forecast?.days.find((entry) => entry.key === key);
            const planned = day ? Math.ceil(day.newMinutes + day.reviewMinutes) : null;
            const override = capacity.dateOverrides.some((entry) => entry.date === key);
            return (
              <button
                key={key}
                type="button"
                data-date={key}
                aria-pressed={selectedDate === key}
                disabled={outside}
                aria-label={`${formatExamDate(key)}: ${exam ? "Prüfung" : minutes ? `${minutes} Minuten${override ? ", angepasst" : ""}` : "frei"}`}
                onClick={() => onSelectDate(key)}
                className={`grid min-h-[6.5rem] content-between gap-1 whitespace-nowrap rounded-control border p-2 text-left disabled:opacity-50 ${selectedDate === key ? "border-core-action bg-core-surface shadow-soft" : "border-transparent bg-core-subtle"}`}
              >
                <span className="core-caption text-core-muted">{WEEKDAYS[(new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7]} {Number(key.slice(-2))}.</span>
                <span className="core-body font-semibold text-core-text">{outside ? "–" : exam ? "Prüfung" : minutes ? `${minutes} Min.` : "frei"}</span>
                <span className="core-caption text-core-muted">{override && !exam ? "angepasst" : day?.buffer ? "Puffer" : planned !== null && minutes ? `${planned} geplant` : " "}</span>
                <span aria-hidden="true" className="h-1 overflow-hidden rounded-round bg-core-border">
                  <span className="block h-full bg-core-action" style={{ width: `${minutes && planned !== null ? Math.min(100, planned / minutes * 100) : 0}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </SoftPanel>
  );
}

interface ExamPlanEditorProps {
  decks: Deck[];
  deckSummaries?: ReadonlyMap<string, DeckLibrarySummary>;
  exams: ExamPlan[];
  capacity: StudyTimeCapacity;
  initialPlan: ExamPlan | null;
  preferences: GlobalSchedulerPreferences;
  timeZone: string;
  now: string;
  onLoadPlanningData: ExamPlanningScreenProps["onLoadPlanningData"];
  onSave: (plan: ExamPlan, capacity: StudyTimeCapacity) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  saveError: string;
}

/** Plan editor as a page (ADR-042): the week atelier and the feasibility next to the exam, goal and time settings. */
export function ExamPlanEditor({ decks, deckSummaries, exams, capacity: savedCapacity, initialPlan, preferences, timeZone, now, onLoadPlanningData, onSave, onCancel, saving, saveError }: ExamPlanEditorProps) {
  const today = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const [plan, setPlan] = React.useState<ExamPlan>(() => initialPlan ?? createExamPlan(today));
  const [capacity, setCapacity] = React.useState(savedCapacity);
  const [tab, setTab] = React.useState<EditorTab>("exam");
  const [weekStart, setWeekStart] = React.useState(today);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [acceptedRisk, setAcceptedRisk] = React.useState(false);
  const rows = React.useMemo(() => createDeckLibraryModel(decks, { now, timeZone, dayStartHour: preferences.dayStartHour, learnAheadMinutes: preferences.learnAheadMinutes, deckSummaries }).rows, [deckSummaries, decks, now, preferences.dayStartHour, preferences.learnAheadMinutes, timeZone]);
  const selected = new Set(plan.deckIds);
  const valid = Boolean(plan.name.trim() && plan.examDate > today && plan.examDate <= shiftExamDay(today, 365) && plan.deckIds.length);
  const candidate = { ...plan, status: "active" as const, name: plan.name.trim() || "Neue Prüfung" };
  const plannedExams = valid ? [candidate, ...exams.filter((exam) => exam.id !== plan.id)] : [];
  const { forecast, current, busy, error } = useExamForecast({ decks, exams: plannedExams, capacity, preferences, timeZone, now, onLoadPlanningData, delayMs: 250 });
  const summary = current ? forecast?.exams.find((exam) => exam.examId === plan.id) ?? null : null;
  const examDates = new Set(plannedExams.map((exam) => exam.examDate));
  const horizon = plannedExams.reduce((last, exam) => exam.examDate > last ? exam.examDate : last, plan.examDate);
  const selectedDay = selectedDate ? forecast?.days.find((day) => day.key === selectedDate) ?? null : null;
  const dayMinutes = selectedDate ? getExamDayCapacity(selectedDate, capacity) : 0;
  const dayOverride = selectedDate ? capacity.dateOverrides.find((day) => day.date === selectedDate) ?? null : null;
  const deckName = (id: string) => decks.find((deck) => deck.id === id)?.name ?? "Gelöschter Stapel";

  function patch(fields: Partial<ExamPlan>) { setPlan((currentPlan) => ({ ...currentPlan, ...fields })); setAcceptedRisk(false); }
  function patchCapacity(fields: Partial<StudyTimeCapacity>) { setCapacity((currentCapacity) => ({ ...currentCapacity, ...fields })); setAcceptedRisk(false); }
  function setDayMinutes(minutes: number | null) {
    if (!selectedDate) return;
    const others = capacity.dateOverrides.filter((day) => day.date !== selectedDate);
    patchCapacity({ dateOverrides: minutes === null ? others : [...others, { date: selectedDate, minutes }].sort((a, b) => a.date.localeCompare(b.date)) });
  }
  function toggleDecks(ids: string[], on: boolean) {
    const next = on ? [...new Set([...plan.deckIds, ...ids])] : plan.deckIds.filter((id) => !ids.includes(id));
    patch({ deckIds: next.slice(0, EXAM_PLANNING_LIMITS.decksPerExam) });
  }
  const canSave = valid && !saving && current && summary !== null && summary.totalCards > 0 && (summary.feasible || acceptedRisk);

  return (
    <div className="grid min-w-0 gap-6" data-testid="exam-plan-editor">
      <PageHeader
        eyebrow="Prüfungen"
        title={initialPlan ? "Prüfung bearbeiten" : "Prüfung planen"}
        action={<ActionButton variant="secondary" icon={ArrowLeft} onClick={onCancel}>Zurück</ActionButton>}
      />
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <SoftPanel className="grid min-w-0 content-start gap-5 p-4 sm:p-6 lg:order-2" data-testid="exam-plan-inspector">
          <CoreSlidingTabs
            ariaLabel="Plan bearbeiten"
            value={tab === "day" ? "time" : tab}
            options={[{ value: "exam", label: "Prüfung", icon: CalendarDays }, { value: "goal", label: "Ziel", icon: Target }, { value: "time", label: "Lernzeit", icon: Clock3 }]}
            onValueChange={(value) => { setTab(value as EditorTab); setSelectedDate(null); }}
          />
          {tab === "exam" ? (
            <>
              <label className={LABEL}>Name<input className={FIELD} maxLength={120} value={plan.name} onChange={(event) => patch({ name: event.target.value })} /></label>
              <div className={LABEL}>
                <span>Prüfungsdatum</span>
                <CoreDatePicker value={plan.examDate} min={shiftExamDay(today, 1)} max={shiftExamDay(today, 365)} today={today} ariaLabel="Prüfungsdatum auswählen" onValueChange={(examDate) => patch({ examDate })} className="w-full" />
              </div>
              <fieldset className="grid min-w-0 gap-2">
                <legend className="core-body font-semibold text-core-muted">Stapel · {plan.deckIds.length} ausgewählt</legend>
                <div className="mt-2 grid max-h-80 min-w-0 gap-1 overflow-y-auto pr-1">
                  {rows.map((row) => {
                    const branch = row.childrenCount ? [...collectDeckTreeIds(decks, row.id)] : [row.id];
                    const branchSelected = branch.every((id) => selected.has(id));
                    return (
                      <div key={row.id} className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}>
                        <label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3 core-body text-core-text">
                          <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={selected.has(row.id)} onChange={(event) => toggleDecks([row.id], event.target.checked)} />
                          <span className="min-w-0 flex-1 break-words">{row.name}</span>
                          <span className="shrink-0 core-caption text-core-muted">{row.directInventory.totalCards}</span>
                        </label>
                        {row.childrenCount ? (
                          <button type="button" className="shrink-0 rounded-control px-2 py-1 core-caption font-semibold text-core-action hover:bg-core-subtle" onClick={() => toggleDecks(branch, !branchSelected)}>
                            {branchSelected ? "Zweig ab" : "Zweig"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </>
          ) : null}
          {tab === "goal" ? (
            <>
              <fieldset className="grid gap-2">
                <legend className="core-body font-semibold text-core-muted">Sicherheitsniveau</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {EXAM_RETENTION_LEVELS.map((level, index) => (
                    <button key={level} type="button" aria-pressed={plan.desiredRetention === level} className={choiceClass(plan.desiredRetention === level)} onClick={() => patch({ desiredRetention: level })}>
                      <strong className="block text-core-text">{RETENTION_LABELS[index]}</strong>
                      <span className="core-caption">{Math.round(level * 100)} %</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className={LABEL}>
                Priorität
                <CoreSelect ariaLabel="Priorität" value={plan.priority} options={[{ value: "low", label: "Niedrig" }, { value: "normal", label: "Normal" }, { value: "high", label: "Hoch" }]} onValueChange={(value) => patch({ priority: value as ExamPlan["priority"] })} />
              </label>
              <MinutesField label="Puffertage ohne neuen Stoff" value={plan.bufferDays} max={30} onChange={(bufferDays) => patch({ bufferDays })} />
              <fieldset className="grid gap-1">
                <legend className="core-body font-semibold text-core-muted">Lernmethoden</legend>
                <label className="mt-2 flex min-h-control items-center justify-between gap-3 core-body text-core-text">
                  Varianten
                  <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={plan.variants} onChange={(event) => patch({ variants: event.target.checked })} />
                </label>
                {QUIZ_METHODS.map((name) => (
                  <label key={name} className="flex min-h-control items-center justify-between gap-3 core-body text-core-muted">
                    <span>{name} <span className="core-caption">· demnächst</span></span>
                    <input type="checkbox" className="size-5 shrink-0" disabled checked={false} />
                  </label>
                ))}
              </fieldset>
            </>
          ) : null}
          {tab === "time" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <MinutesField label="Mo–Fr · Min." value={capacity.weekdayMinutes} onChange={(weekdayMinutes) => patchCapacity({ weekdayMinutes })} />
                <MinutesField label="Sa–So · Min." value={capacity.weekendMinutes} onChange={(weekendMinutes) => patchCapacity({ weekendMinutes })} />
              </div>
              <fieldset className="grid gap-2">
                <legend className="core-body font-semibold text-core-muted">Lerntage</legend>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((name, index) => (
                    <button key={name} type="button" aria-pressed={capacity.weekdays[index]} className={`${choiceClass(capacity.weekdays[index])} !px-0 text-center`} onClick={() => patchCapacity({ weekdays: capacity.weekdays.map((on, dayIndex) => dayIndex === index ? !on : on) })}>{name}</button>
                  ))}
                </div>
              </fieldset>
              <MinutesField label="Mindestens an Lerntagen · Min." value={capacity.minimumMinutes} onChange={(minimumMinutes) => patchCapacity({ minimumMinutes })} />
              <label className={LABEL}>
                Reserve
                <span className="flex items-center gap-3">
                  <input type="range" className="min-w-0 flex-1 accent-core-action" min={0} max={40} value={Math.round(capacity.reserveFraction * 100)} onChange={(event) => patchCapacity({ reserveFraction: Number(event.target.value) / 100 })} />
                  <output className="text-core-text">{Math.round(capacity.reserveFraction * 100)} %</output>
                </span>
              </label>
            </>
          ) : null}
          {tab === "day" && selectedDate ? (
            <div className="grid gap-4" data-testid="exam-day-editor">
              <h3 className="core-heading-3 font-semibold text-core-text">{formatExamDate(selectedDate)}</h3>
              {examDates.has(selectedDate) ? <p className="core-body text-core-muted">Prüfungstag</p> : (
                <>
                  <MinutesField label="Lernzeit · Min." value={dayMinutes} onChange={(minutes) => setDayMinutes(minutes)} />
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="Lernzeit für diesen Tag">
                    {[0, 30, 60, 120].map((minutes) => (
                      <button key={minutes} type="button" aria-pressed={Boolean(dayOverride) && dayMinutes === minutes} className={`${choiceClass(Boolean(dayOverride) && dayMinutes === minutes)} text-center`} onClick={() => setDayMinutes(minutes)}>{minutes ? `${minutes}` : "frei"}</button>
                    ))}
                  </div>
                  {dayOverride ? <ActionButton variant="secondary" onClick={() => setDayMinutes(null)}>Wochenrhythmus verwenden</ActionButton> : null}
                </>
              )}
              {selectedDay?.blocks.length ? (
                <ul className="grid gap-2">
                  {selectedDay.blocks.map((block) => (
                    <li key={block.id} className="rounded-control bg-core-subtle px-3 py-2">
                      <p className="core-body font-semibold text-core-text">{EXAM_METHOD_LABELS[block.method]}</p>
                      <p className="break-words core-caption text-core-muted">{deckName(block.deckId)} · {block.expectedItems} Abfragen · {formatExamMinutes(block.plannedMinutes)}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {saveError ? <StatusMessage tone="error" announce="assertive">{saveError}</StatusMessage> : null}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-core-border pt-4">
            <ActionButton variant="secondary" onClick={onCancel}>Abbrechen</ActionButton>
            <ActionButton variant="primary" icon={Save} loading={saving} disabled={!canSave} onClick={() => void onSave({ ...plan, name: plan.name.trim(), status: initialPlan?.status === "paused" ? "paused" : "active", updatedAt: new Date().toISOString() }, capacity)}>
              {initialPlan ? "Speichern" : "Plan aktivieren"}
            </ActionButton>
          </div>
        </SoftPanel>
        <div className="grid min-w-0 gap-6 lg:order-1">
          <ExamWeek
            capacity={capacity}
            forecast={current ? forecast : null}
            examDates={examDates}
            busy={busy}
            today={today}
            horizon={horizon}
            weekStart={weekStart}
            selectedDate={tab === "day" ? selectedDate : null}
            onWeekChange={(key) => { setWeekStart(key); setSelectedDate(null); if (tab === "day") setTab("time"); }}
            onSelectDate={(key) => { setSelectedDate(key); setTab("day"); }}
          />
          <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="exam-feasibility" aria-busy={busy}>
            <h3 className="core-heading-3 font-semibold text-core-text">Machbarkeit</h3>
            {!valid ? <p className="core-body text-core-muted">Name, zukünftiges Datum und mindestens ein Stapel fehlen.</p> : null}
            {valid && error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
            {valid && !summary && !error ? <p role="status" className="core-body text-core-muted">Wird berechnet …</p> : null}
            {summary ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <StatTile size="compact" label="Benötigt" value={formatExamMinutes(summary.requiredMinutes)} />
                  <StatTile size="compact" label="Verfügbar" value={formatExamMinutes(summary.availableMinutes)} />
                  <StatTile size="compact" label="Lerntage" value={String(summary.usableDays)} />
                  <StatTile size="compact" label="Karten" value={String(summary.totalCards)} />
                  <StatTile size="compact" label="Noch neu" value={String(summary.remainingNewCount)} />
                  <StatTile size="compact" label="Sicherheit am Termin" value={formatExamPercent(summary.predicted.security)} />
                </div>
                <StatusMessage tone={summary.feasible ? "success" : "warning"}>{summary.feasible ? "Ziel erreichbar" : summary.issues[0] ?? "Ziel gefährdet"}</StatusMessage>
                {summary.issues.length > 1 ? <ul className="grid gap-1 core-body text-core-muted">{summary.issues.slice(1).map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
                {!summary.feasible ? (
                  <div className="grid gap-3">
                    <ActionButton variant="secondary" onClick={() => patchCapacity({ weekdayMinutes: Math.min(1440, capacity.weekdayMinutes + 15), weekendMinutes: Math.min(1440, capacity.weekendMinutes + 15) })}>Täglich 15 Min. mehr</ActionButton>
                    <label className="flex min-h-control items-center gap-3 core-body text-core-text">
                      <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={acceptedRisk} onChange={(event) => setAcceptedRisk(event.target.checked)} />
                      Trotz Gefährdung aktivieren
                    </label>
                  </div>
                ) : null}
                {forecast?.uncertainty === "high" ? <p className="core-caption text-core-muted">Wenig Lernhistorie · Zeiten geschätzt</p> : null}
              </>
            ) : null}
          </SoftPanel>
        </div>
      </div>
    </div>
  );
}
