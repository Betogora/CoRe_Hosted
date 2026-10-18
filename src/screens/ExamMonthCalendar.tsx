import React from "react";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import type { ExamPlan, StudyTimeCapacity } from "../coreTypes.ts";
import type { ExamPortfolioForecast } from "../examPlanning.ts";
import { createExamMonthDays, createExamQuizRecommendations, getExamCalendarWork, shiftExamMonth } from "../examCalendarModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { formatExamDate } from "./examPlanningUi.ts";

export function ExamMonthCalendar({ exams, shown, capacity, forecast, today, date, color, onSelect }: {
  exams: ExamPlan[]; shown: ExamPlan[]; capacity: StudyTimeCapacity; forecast: ExamPortfolioForecast | null;
  today: string; date: string; color: (exam: ExamPlan) => string; onSelect: (date: string, openDetails?: boolean) => void;
}) {
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const quizDays = createExamQuizRecommendations(exams, capacity, today);
  const dayByKey = new Map(forecast?.days.map((day) => [day.key, day]));
  const days = createExamMonthDays(month);
  const visibleEntries = days.length === 42 ? 1 : 2;

  return <SoftPanel className="grid min-w-0 gap-3 p-2 sm:p-4" data-testid="exam-month-calendar">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h4 className="core-heading-3 font-semibold text-core-text" aria-live="polite">{new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</h4>
      <div className="flex gap-2">
        <ActionButton variant="secondary" onClick={() => { setMonth(today.slice(0, 7)); onSelect(today, false); }}>Heute</ActionButton>
        <IconButton label="Vorheriger Monat" icon={ChevronLeft} onClick={() => setMonth(shiftExamMonth(month, -1))} />
        <IconButton label="Nächster Monat" icon={ChevronRight} onClick={() => setMonth(shiftExamMonth(month, 1))} />
      </div>
    </div>
    <div className="min-w-0 overflow-hidden rounded-control border border-core-border bg-core-border" role="region" aria-label="Monatskalender">
      <div className="grid grid-cols-7 gap-px border-b border-core-border">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((name) => <div key={name} className="bg-core-surface py-1 text-center core-caption font-semibold text-core-muted">{name}</div>)}
      </div>
      <div className="exam-month-days grid grid-cols-7 gap-px" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map((key) => {
          const day = dayByKey.get(key);
          const appointments = shown.filter((exam) => exam.examDate === key);
          const quizzes = shown.filter((exam) => quizDays.get(key)?.includes(exam.id));
          const outside = key.slice(0, 7) !== month;
          const hasForecast = Boolean(day) || exams.every((exam) => exam.status !== "active" || key >= exam.examDate);
          const subjects = key >= today ? shown.map((exam) => ({
            exam,
            newCards: getExamCalendarWork(day, new Set([exam.id])).newCards,
            quiz: quizzes.some((entry) => entry.id === exam.id),
          })).filter(({ exam, newCards, quiz }) => newCards > 0 || quiz || (!hasForecast && exam.status === "active" && key < exam.examDate)) : [];
          const countLabel = hasForecast ? subjects.map(({ exam, newCards }) => `${exam.name}: ${newCards} neue Karten`).join(". ") || "Keine neuen Karten geplant" : "Lernmenge noch nicht berechnet";
          const remaining = Math.max(0, appointments.length + subjects.length - visibleEntries);
          return <button key={key} type="button" data-date={key} aria-pressed={date === key} aria-current={key === today ? "date" : undefined}
            aria-label={`${formatExamDate(key)}${key === today ? ", heute" : ""}. ${appointments.map((exam) => `Klausur: ${exam.name}. `).join("")}${countLabel}${quizzes.length ? `. Quiz empfohlen: ${quizzes.map((exam) => exam.name).join(", ")}` : ""}. Tagesdetails öffnen`}
            onClick={() => onSelect(key)} className={`grid min-h-0 min-w-0 content-start gap-0.5 overflow-hidden p-0.5 text-left transition hover:bg-core-subtle ${date === key ? "bg-core-info-soft shadow-inset" : outside ? "bg-core-subtle" : "bg-core-surface"}`}>
            <span className="flex h-5 min-w-0 items-center justify-between"><span className={`grid size-5 shrink-0 place-items-center rounded-round core-caption font-semibold ${key === today ? "bg-core-action text-core-on-accent" : outside ? "text-core-muted" : "text-core-text"}`}>{Number(key.slice(8))}</span>{remaining ? <span className="exam-month-more text-core-muted" title={`${remaining} weitere Einträge in den Tagesdetails`}>+{remaining}</span> : null}</span>
            {appointments.slice(0, visibleEntries).map((exam) => <span key={exam.id} data-exam-appointment={exam.id} title={`Klausur: ${exam.name}`} className="exam-month-entry flex min-w-0 items-center gap-1 rounded-inset px-1 font-bold" style={{ background: color(exam), color: "var(--core-exam-on-color)" }}><Flag size={11} className="shrink-0" aria-hidden="true" /><span className="truncate"><span className="sr-only">Klausur: </span>{exam.name}</span></span>)}
            {subjects.slice(0, Math.max(0, visibleEntries - appointments.length)).map(({ exam, newCards, quiz }) => <span key={exam.id} data-exam-subject={exam.id} title={`${exam.name}: ${hasForecast ? `${newCards} neue Karten` : "Karten: –"}${quiz ? " · Quiz empfohlen" : ""}`} className="exam-month-entry flex min-w-0 items-center gap-1 rounded-inset border-l-strong px-1 text-core-text" style={{ borderColor: color(exam), background: `color-mix(in srgb, ${color(exam)} 18%, var(--core-surface))` }}>
              <strong className="exam-month-subject-name min-w-0 flex-1 truncate font-medium">{exam.name}</strong>
              <span className="shrink-0">{hasForecast ? <>{newCards}<span className="sr-only"> neue Karten</span></> : "–"}</span>
              {quiz ? <span className="shrink-0 font-bold" aria-label="Quiz empfohlen">Q</span> : null}
            </span>)}
          </button>;
        })}
      </div>
    </div>
    <p className="core-caption text-core-muted">Zahl = neue Karten · Q = Quiz empfohlen · Flagge = Klausur. Tippe auf einen Tag für alle Aufgaben und Details.</p>
  </SoftPanel>;
}
