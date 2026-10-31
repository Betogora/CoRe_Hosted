import React from "react";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import type { ExamPlan } from "../coreTypes.ts";
import type { ExamPortfolioForecast } from "../examPlanning.ts";
import { createExamMonthDays, getExamCalendarWork, shiftExamMonth } from "../examCalendarModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { examTextColor, formatExamCount, formatExamDate } from "./examPlanningUi.ts";

const MONTH_LABEL = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" });

export function ExamMonthCalendar({ exams, shown, forecast, today, date, color, onSelect }: {
  exams: ExamPlan[]; shown: ExamPlan[]; forecast: ExamPortfolioForecast | null;
  today: string; date: string; color: (exam: ExamPlan) => string; onSelect: (date: string, openDetails?: boolean) => void;
}) {
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const dayByKey = new Map(forecast?.days.map((day) => [day.key, day]));
  const days = createExamMonthDays(month, today);
  const visibleEntries = createExamMonthDays(month).length === 42 ? 1 : 2;

  return <SoftPanel className="grid min-w-0 gap-4 p-3 sm:p-5" data-testid="exam-month-calendar">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h4 className="mr-auto core-heading-3 text-core-text" aria-live="polite">{new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</h4>
      <div aria-label="Fächer im Kalender" className="order-last flex min-w-0 basis-full flex-wrap gap-2 core-caption sm:order-none sm:basis-auto sm:justify-end">{shown.map((exam) => <span key={exam.id} className="inline-flex min-h-5 min-w-0 items-center break-words rounded-round px-2.5 py-0.5 font-semibold" style={{ background: color(exam), color: examTextColor(exam) }}>{exam.name}</span>)}</div>
      <div className="flex shrink-0 gap-2">
        <ActionButton variant="secondary" onClick={() => { setMonth(today.slice(0, 7)); onSelect(today, false); }}>Heute</ActionButton>
        <IconButton label="Vorheriger Monat" icon={ChevronLeft} onClick={() => setMonth(shiftExamMonth(month, -1))} />
        <IconButton label="Nächster Monat" icon={ChevronRight} onClick={() => setMonth(shiftExamMonth(month, 1))} />
      </div>
    </div>
    <div className="min-w-0 overflow-hidden rounded-control border border-core-border bg-core-border" role="region" aria-label="Monatskalender">
      <div className="grid grid-cols-7 gap-px border-b border-core-border">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((name) => <div key={name} className="bg-core-surface py-2 text-center core-caption font-semibold text-core-muted">{name}</div>)}
      </div>
      <div className="exam-month-days grid grid-cols-7 gap-px" style={{ gridTemplateRows: Array.from({ length: days.length / 7 }, (_, week) => days[week * 7 + 6] < today ? "auto" : "minmax(var(--exam-month-day-height), 1fr)").join(" ") }}>
        {days.map((key) => {
          const day = dayByKey.get(key);
          const appointments = shown.filter((exam) => exam.examDate === key);
          const outside = key.slice(0, 7) < month;
          const hasForecast = Boolean(day) || exams.every((exam) => exam.status !== "active" || key >= exam.examDate);
          const subjects = key >= today ? shown.map((exam) => ({
            exam,
            newCards: getExamCalendarWork(day, new Set([exam.id])).newCards,
            summary: day?.summaries.some((entry) => entry.examId === exam.id) ?? false,
          })).filter(({ exam, newCards }) => newCards > 0 || (!hasForecast && exam.status === "active" && key < exam.examDate)) : [];
          const countLabel = hasForecast ? subjects.map(({ exam, newCards }) => `${exam.name}: ${formatExamCount(newCards, "neue Karte", "neue Karten")}`).join(". ") || "Keine neuen Karten geplant" : "Lernmenge noch nicht berechnet";
          const remaining = Math.max(0, appointments.length + subjects.length - visibleEntries);
          return <button key={key} type="button" data-date={key} aria-pressed={date === key} aria-current={key === today ? "date" : undefined}
            aria-label={`${formatExamDate(key)}${key === today ? ", heute" : ""}. ${appointments.map((exam) => `Klausur: ${exam.name}. `).join("")}${countLabel}. Tagesdetails öffnen`}
            onClick={() => onSelect(key)} className={`grid min-h-0 min-w-0 content-start gap-0.5 overflow-hidden p-1 text-left transition-colors ${date === key ? "bg-core-info-soft shadow-inset" : outside ? "bg-core-subtle hover:bg-core-hover" : "bg-core-surface hover:bg-core-subtle"}`}>
            <span className="flex h-5 min-w-0 items-center justify-between"><span className={`grid size-5 shrink-0 place-items-center rounded-round core-caption font-semibold ${key === today ? "bg-core-action text-core-on-accent" : outside ? "text-core-muted" : "text-core-text"}`}>{Number(key.slice(8))}</span>{key.slice(0, 7) > month && key.endsWith("-01") ? <span className="mr-auto pl-1 core-caption font-semibold text-core-muted">{MONTH_LABEL.format(new Date(`${key}T12:00:00Z`))}</span> : null}{remaining ? <span className="exam-month-more text-core-muted" title={`${formatExamCount(remaining, "weiterer Eintrag", "weitere Einträge")} in den Tagesdetails`}>+{remaining}</span> : null}</span>
            {appointments.slice(0, visibleEntries).map((exam) => <span key={exam.id} data-exam-appointment={exam.id} title={`Klausur: ${exam.name}`} className="exam-month-entry flex min-w-0 items-center gap-1 rounded-inset px-1 font-bold" style={{ background: color(exam), color: examTextColor(exam) }}><Flag size={11} className="shrink-0" aria-hidden="true" /><span className="truncate"><span className="sr-only">Klausur: </span>{exam.name}</span></span>)}
            {subjects.slice(0, Math.max(0, visibleEntries - appointments.length)).map(({ exam, newCards, summary }) => <React.Fragment key={exam.id}>
              {newCards > 0 || !hasForecast ? <span data-exam-subject={exam.id} data-exam-task="study" title={`${exam.name}: ${hasForecast ? formatExamCount(newCards, "neue Karte", "neue Karten") : "Karten: –"}`} className="exam-month-entry min-w-0 rounded-inset border-l-strong px-1 py-0.5 text-core-text" style={{ borderColor: color(exam), background: `color-mix(in srgb, ${color(exam)} 18%, var(--core-surface))` }}>{hasForecast ? formatExamCount(newCards, "neue Karte", "neue Karten") : "Karten: –"}</span> : null}
              {summary ? <span data-exam-subject={exam.id} data-exam-task="summary" aria-label={`${exam.name}: Zusammenfassung lesen`} title={`${exam.name}: Zusammenfassung lesen`} className="exam-month-entry min-w-0 rounded-inset border-l-strong px-1 py-0.5 text-core-text" style={{ borderColor: color(exam), background: `color-mix(in srgb, ${color(exam)} 18%, var(--core-surface))` }}>Lesen</span> : null}
            </React.Fragment>)}
          </button>;
        })}
      </div>
    </div>
  </SoftPanel>;
}
