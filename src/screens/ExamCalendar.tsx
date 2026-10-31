import React from "react";
import { ClipboardCheck, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { Deck, ExamPlan, StudyTimeCapacity } from "../coreTypes.ts";
import { isValidExamCalendar } from "../examPlanSettings.ts";
import { EXAM_NEW_CARDS_PER_MINUTE_LIMIT, getExamLastNewDate, getExamStudyMinutes, isExamDayOverloaded, getExamTopicOrder, type ExamPortfolioForecast } from "../examPlanning.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { SoftPanel, CoreSegmentedControl } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { examColor, formatExamClock as clock, formatExamCount, formatExamDate, formatExamMinutes } from "./examPlanningUi.ts";
import { getExamCalendarWork, isExamCalendarDayLocked } from "../examCalendarModel.ts";
import { ExamMonthCalendar } from "./ExamMonthCalendar.tsx";
import { ExamWeekCalendar } from "./ExamWeekCalendar.tsx";

const FIELD = "core-field min-w-0";
const LABEL = "core-field-label grid min-w-0 gap-2";
function parseClock(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }

interface ExamCalendarProps {
  exams: ExamPlan[];
  capacity: StudyTimeCapacity;
  forecast: ExamPortfolioForecast | null;
  decks: Deck[];
  today: string;
  busy: boolean;
  initialExamId?: string;
  onChange: (exams: ExamPlan[], capacity: StudyTimeCapacity) => void;
}

/** Shared calendar for draft and saved plans. Dates move introductions, never scheduled repetitions. */
export function ExamCalendar({ exams, capacity, forecast, decks, today, busy, initialExamId, onChange }: ExamCalendarProps) {
  const [view, setView] = React.useState<"month" | "week">("month");
  const [date, setDate] = React.useState(today);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [hiddenExamIds, setHiddenExamIds] = React.useState(() => new Set(initialExamId ? exams.filter((exam) => exam.id !== initialExamId).map((exam) => exam.id) : []));
  const [blockExam, setBlockExam] = React.useState(initialExamId ?? exams.find((exam) => exam.status === "active")?.id ?? "");
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("11:00");
  const [error, setError] = React.useState("");
  const [swap, setSwap] = React.useState("");
  const shown = exams.filter((exam) => !hiddenExamIds.has(exam.id));
  const ids = new Set(shown.map((exam) => exam.id));
  const dayByKey = new Map(forecast?.days.map((day) => [day.key, day]));
  const selectedDay = dayByKey.get(date);
  const selectedWork = getExamCalendarWork(selectedDay, ids);
  const hasSelectedForecast = Boolean(selectedDay) || exams.every((exam) => exam.status !== "active" || date >= exam.examDate);
  const locked = isExamCalendarDayLocked(date, today, exams);
  const selectedSubjects = locked ? [] : shown.filter((exam) => exam.status === "active" && date < exam.examDate && (!exam.studyStartDate || date >= exam.studyStartDate)).map((exam) => {
    const work = getExamCalendarWork(selectedDay, new Set([exam.id]));
    const newBlocks = work.blocks.filter((block) => block.method === "new");
    const topics = [...new Set(newBlocks.map((block) => block.deckId))].map((deckId) => ({ deckId, count: new Set(newBlocks.filter((block) => block.deckId === deckId).flatMap((block) => block.cardIds)).size }));
    return { exam, newCards: work.newCards, topics, summaries: selectedDay?.summaries.filter((entry) => entry.examId === exam.id) ?? [] };
  });
  const selectedBlocks = (capacity.timeBlocks ?? []).filter((block) => block.date === date && (block.examId === null || ids.has(block.examId))).sort((a, b) => a.start - b.start);
  const blockSubjects = shown.filter((exam) => exam.status === "active" && date < exam.examDate && (!exam.studyStartDate || date >= exam.studyStartDate));
  const blockTarget = blockSubjects.some((exam) => exam.id === blockExam) ? blockExam : null;
  const selectedExam = shown.length === 1 ? shown[0] : null;
  const topicSummary = forecast?.exams.find((exam) => exam.examId === selectedExam?.id);
  const topics = selectedExam && (!initialExamId || selectedExam.id === initialExamId) ? getExamTopicOrder(decks, selectedExam).filter((id) => topicSummary?.decks.some((deck) => deck.deckId === id && deck.total > deck.known)) : [];
  // The planned start is shown even when an earlier wish cannot apply because previous topics come first.
  const plannedStarts = new Map<string, string>();
  for (const day of forecast?.days ?? []) for (const block of day.blocks) if (block.method === "new" && !plannedStarts.has(block.deckId)) plannedStarts.set(block.deckId, day.key);
  const topicDate = (id: string) => plannedStarts.get(id) ?? selectedExam?.topicDates?.find((topic) => topic.deckId === id)?.date;
  const dayMinutes = shown.reduce((sum, exam) => sum + getExamStudyMinutes(date, exam, exams, capacity), 0);
  const earliestStart = (id: string) => topics.slice(0, topics.indexOf(id)).map(topicDate).reduce<string>((latest, key) => key && key > latest ? key : latest, selectedExam?.studyStartDate && selectedExam.studyStartDate > today ? selectedExam.studyStartDate : today);
  const deckName = (id: string) => decks.find((deck) => deck.id === id)?.name ?? "Entfernter Stapel";

  function toggleExam(id: string) {
    const next = new Set(hiddenExamIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setHiddenExamIds(next);
    setSwap("");
    const visible = exams.filter((exam) => !next.has(exam.id));
    if (visible.length === 1 || !visible.some((exam) => exam.id === blockExam)) setBlockExam(visible.find((exam) => exam.status === "active")?.id ?? "");
  }

  function change(nextExams: ExamPlan[], nextCapacity: StudyTimeCapacity) {
    if (!isValidExamCalendar(nextExams, nextCapacity)) { setError("Bitte prüfe die Zeiten: Blöcke dürfen sich nicht überschneiden und müssen zwischen Lernstart und Prüfung liegen."); return false; }
    setError(""); onChange(nextExams, nextCapacity); return true;
  }
  function setDayMinutes(target: ExamPlan, minutes: number | null) {
    const dateOverrides = target.studyTime.dateOverrides.filter((day) => day.date !== date);
    if (minutes !== null) dateOverrides.push({ date, minutes });
    change(exams.map((exam) => exam.id === target.id ? { ...exam, studyTime: { ...target.studyTime, dateOverrides } } : exam), capacity);
  }
  function moveTopic(deckId: string, nextDate: string) {
    if (!selectedExam) return;
    const topicDates = [...(selectedExam.topicDates ?? []).filter((topic) => topic.deckId !== deckId), { deckId, date: nextDate }];
    change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, topicDates, updatedAt: new Date().toISOString() } : exam), capacity);
  }
  function swapTopics(first: string, second: string) {
    if (!selectedExam) return;
    const firstDate = topicDate(first), secondDate = topicDate(second);
    if (!firstDate || !secondDate) return;
    const topicDates = [...(selectedExam.topicDates ?? []).filter((topic) => topic.deckId !== first && topic.deckId !== second), { deckId: first, date: secondDate }, { deckId: second, date: firstDate }];
    const topicOrder = getExamTopicOrder(decks, selectedExam), firstIndex = topicOrder.indexOf(first), secondIndex = topicOrder.indexOf(second);
    [topicOrder[firstIndex], topicOrder[secondIndex]] = [topicOrder[secondIndex], topicOrder[firstIndex]];
    change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, topicDates, topicOrder, updatedAt: new Date().toISOString() } : exam), capacity);
    setSwap("");
  }

  return <section className="exam-calendar-layout grid min-w-0 gap-4" aria-label="Lernkalender" data-testid="exam-calendar" aria-busy={busy}>
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <h3 className="core-heading-2 text-core-text">Dein Lernkalender</h3>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <CoreSegmentedControl ariaLabel="Kalenderansicht" value={view} options={[{ value: "month", label: "Monat" }, { value: "week", label: "Woche" }]} onValueChange={setView} />
    </div>
    <div className="exam-calendar-body grid min-w-0 items-start gap-4" data-show-day={view === "month" && detailsOpen}>
    <div className="grid min-w-0 gap-4">
    {view === "month" ? <ExamMonthCalendar exams={exams} shown={shown} onToggleExam={toggleExam} forecast={forecast} today={today} date={date} color={(exam) => examColor(exams.indexOf(exam), exam)} onSelect={(key, open = true) => { setDate(key); setDetailsOpen(open); }} /> : <ExamWeekCalendar exams={exams} shown={shown} onToggleExam={toggleExam} capacity={capacity} forecast={forecast} decks={decks} today={today} date={date} busy={busy} color={(exam) => examColor(exams.indexOf(exam), exam)} onSelect={(key, open = false) => { setDate(key); setDetailsOpen(open); }} onChange={(next) => change(exams, next)} />}
    {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
    </div>
    {detailsOpen ? <div className="grid min-w-0 gap-4">
    <SoftPanel className="grid min-w-0 gap-5 p-5 sm:p-6" data-testid="exam-day-editor">
      <div className="flex justify-between gap-3"><div><h4 className="core-heading-3 text-core-text">{formatExamDate(date)}</h4><p className="mt-0.5 core-body text-core-secondary">{hasSelectedForecast ? formatExamCount(selectedWork.newCards, "neue Karte", "neue Karten") : "Karten: –"} · {formatExamMinutes(dayMinutes)} Lernzeit</p></div><IconButton label="Tagesdetails schließen" icon={X} onClick={() => setDetailsOpen(false)} /></div>
      {isExamDayOverloaded(selectedWork.newCards, dayMinutes) ? <StatusMessage tone="warning">Mehr als {EXAM_NEW_CARDS_PER_MINUTE_LIMIT} neue Karten pro Minute Lernzeit</StatusMessage> : null}
      {shown.filter((exam) => exam.examDate === date).map((exam) => <StatusMessage key={exam.id} tone="info">Prüfungstag: {exam.name}</StatusMessage>)}
      {selectedDay?.quizzes?.some((quiz) => shown.some((exam) => exam.id === quiz.examId)) ? <ul className="grid min-w-0 gap-3" aria-label="Quizaufgaben an diesem Tag">{selectedDay.quizzes.filter((quiz) => shown.some((exam) => exam.id === quiz.examId)).map((quiz) => <li key={`${quiz.examId}:${quiz.deckIds[0]}`} className="flex min-w-0 items-start gap-3 rounded-control bg-core-subtle p-3"><ClipboardCheck size={20} aria-hidden="true" className="shrink-0 text-core-muted" /><div className="grid min-w-0 gap-1"><strong className="break-words core-body text-core-text">Quiz · {exams.find((exam) => exam.id === quiz.examId)?.name}</strong><p className="break-words core-caption text-core-muted">{quiz.deckIds.map(deckName).join(" · ")}</p></div></li>)}</ul> : null}
      <fieldset disabled={busy || locked} className="grid min-w-0 gap-5">
      {selectedSubjects.length ? <ul className="grid gap-3" aria-label="Lernaufgaben an diesem Tag">{selectedSubjects.map(({ exam, newCards, topics: subjectTopics, summaries }) => {
        const color = examColor(exams.indexOf(exam), exam), ownBlocks = selectedBlocks.some((block) => block.examId === exam.id);
        return <li key={exam.id} data-exam-day-subject={exam.id} className="grid min-w-0 gap-3 rounded-inset border-l-strong p-3" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, var(--core-surface))` }}>
          <div className="grid min-w-0 gap-1">
            <p className="break-words core-body text-core-text"><strong>{exam.name}</strong> · {hasSelectedForecast ? formatExamCount(newCards, "neue Karte", "neue Karten") : "Karten: –"}</p>
            {subjectTopics.map(({ deckId, count }) => <p key={deckId} className="break-words core-caption text-core-muted">{deckName(deckId)} · {formatExamCount(count, "Karte", "Karten")}</p>)}
            {summaries.map((entry) => <p key={entry.deckId} className="break-words core-caption text-core-muted">Zusammenfassung lesen · {deckName(entry.deckId)}</p>)}
          </div>
          <div className="flex items-end gap-2"><label className="core-field-label grid min-w-0 gap-2">{ownBlocks ? "Aus Lernblöcken · Min." : "Lernzeit · Min."}<input className={`${FIELD} w-28`} type="number" inputMode="numeric" min={0} max={1440} step={15} disabled={ownBlocks} value={getExamStudyMinutes(date, exam, exams, capacity)} onChange={(event) => setDayMinutes(exam, Math.min(1440, Math.max(0, Math.round(Number(event.target.value) || 0))))} /></label>
            {exam.studyTime.dateOverrides.some((day) => day.date === date) && !ownBlocks ? <IconButton label={`${exam.name}: Wochenrhythmus verwenden`} icon={RotateCcw} onClick={() => setDayMinutes(exam, null)} /> : null}</div>
        </li>;
      })}</ul> : null}
      <div className="grid min-w-0 gap-5">
        {selectedBlocks.length ? <ul className="grid content-start gap-2" aria-label="Lernblöcke an diesem Tag">{selectedBlocks.map((block) => <li key={block.id} className="flex min-w-0 items-center gap-2 rounded-control border border-core-border bg-core-surface py-1.5 pl-3 pr-1.5"><span className="min-w-0 flex-1 break-words core-body tabular-nums text-core-text">{clock(block.start)}–{clock(block.end)} · {block.examId === null ? "Lernzeit ohne Fach" : exams.find((exam) => exam.id === block.examId)?.name}</span><IconButton label={`Lernblock ${clock(block.start)} löschen`} icon={Trash2} variant="ghost" onClick={() => change(exams, { ...capacity, timeBlocks: capacity.timeBlocks?.filter((entry) => entry.id !== block.id) })} /></li>)}</ul> : null}
        <form className="grid min-w-0 content-start gap-3" onSubmit={(event) => { event.preventDefault(); change(exams, { ...capacity, timeBlocks: [...(capacity.timeBlocks ?? []), { id: `time_${crypto.randomUUID()}`, date, start: parseClock(start), end: parseClock(end), examId: blockTarget }] }); }}>
          <h5 className="core-control-label font-semibold text-core-text">Lernblock reservieren</h5>
          <CoreSelect className="w-full" ariaLabel="Prüfung für Lernblock" value={blockTarget ?? ""} options={[...blockSubjects.map((exam) => ({ value: exam.id, label: exam.name })), { value: "", label: "Ohne Fach" }]} onValueChange={setBlockExam} />
          <div className="grid min-w-0 grid-cols-2 gap-3"><label className={LABEL}>Von<input type="time" step={900} required className={FIELD} value={start} onChange={(event) => setStart(event.target.value)} /></label><label className={LABEL}>Bis<input type="time" step={900} required className={FIELD} value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
          <ActionButton type="submit" variant="secondary" icon={Plus} disabled={busy || start >= end}>Lernblock hinzufügen</ActionButton>
        </form>
      </div>
      </fieldset>
    </SoftPanel>
    {selectedExam ? <SoftPanel className="exam-topic-panel grid min-w-0 gap-4 p-5 sm:p-6">
      <h4 className="core-heading-3 text-core-text">Themen verschieben oder tauschen</h4>
      {!topics.length ? <p className="core-body text-core-muted">Für diese Prüfung ist kein neuer Stoff offen.</p> : <ul className="grid gap-3">{topics.map((id) => <li key={id} className="exam-topic-row grid min-w-0 items-center gap-3 rounded-control border border-core-border bg-core-surface p-3">
        <div><p className="break-words core-body font-semibold text-core-text">{deckName(id)}</p><p className="core-caption text-core-muted">{formatExamCount(topicSummary?.decks.find((deck) => deck.deckId === id)?.total ?? 0, "Karte", "Karten")} · {topicDate(id) ? `Ab ${formatExamDate(topicDate(id)!, "short")}` : "Noch nicht eingeplant"}</p></div>
        <CoreDatePicker value={topicDate(id) ?? date} min={earliestStart(id)} max={getExamLastNewDate(selectedExam)} today={today} ariaLabel={`Starttag für ${deckName(id)}`} onValueChange={(key) => moveTopic(id, key)} />
        <div className="flex flex-wrap gap-2"><ActionButton variant="secondary" disabled={!topicDate(id)} aria-expanded={swap === id} onClick={() => setSwap(swap === id ? "" : id)}>Mit Thema tauschen</ActionButton>{selectedExam.topicDates?.some((topic) => topic.deckId === id) ? <ActionButton variant="secondary" onClick={() => change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, topicDates: exam.topicDates?.filter((topic) => topic.deckId !== id) } : exam), capacity)}>Automatisch planen</ActionButton> : null}</div>
        {swap === id ? <div className="col-span-full grid min-w-0 gap-2">{topics.filter((other) => other !== id && topicDate(other)).map((other) => <ActionButton key={other} variant="secondary" className="min-w-0 whitespace-normal [&_span]:min-w-0 [&_span]:break-words" onClick={() => swapTopics(id, other)}>Mit {deckName(other)} tauschen</ActionButton>)}</div> : null}
      </li>)}</ul>}
    </SoftPanel> : null}
    </div> : null}
    </div>
  </section>;
}
