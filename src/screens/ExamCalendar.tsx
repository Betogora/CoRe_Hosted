import React from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Deck, ExamPlan, StudyTimeCapacity } from "../coreTypes.ts";
import { validateExamPlanningSettings } from "../examPlanSettings.ts";
import { getExamLastNewDate, getExamStudyMinutes, getExamTopicOrder, shiftExamDay, type ExamPortfolioForecast } from "../examPlanning.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { SoftPanel, CoreSegmentedControl } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { examColor, formatExamClock as clock, formatExamDate, formatExamMinutes } from "./examPlanningUi.ts";
import { createExamQuizRecommendations, getExamCalendarWork } from "../examCalendarModel.ts";
import { ExamMonthCalendar } from "./ExamMonthCalendar.tsx";
import { ExamWeekCalendar } from "./ExamWeekCalendar.tsx";

const FIELD = "min-h-control w-full min-w-0 rounded-control border border-core-border bg-core-surface px-3 text-core-text";
const LABEL = "grid min-w-0 gap-2 core-body font-semibold text-core-muted";
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
  const [filter, setFilter] = React.useState(initialExamId ?? "all");
  const [blockExam, setBlockExam] = React.useState(initialExamId ?? exams.find((exam) => exam.status === "active")?.id ?? "");
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("11:00");
  const [error, setError] = React.useState("");
  const [swap, setSwap] = React.useState("");
  const shown = exams.filter((exam) => filter === "all" || exam.id === filter);
  const ids = new Set(shown.map((exam) => exam.id));
  const horizon = exams.reduce((last, exam) => exam.examDate > last ? exam.examDate : last, today);
  const dayByKey = new Map(forecast?.days.map((day) => [day.key, day]));
  const selectedWork = getExamCalendarWork(dayByKey.get(date), ids);
  const hasSelectedForecast = Boolean(dayByKey.get(date)) || exams.every((exam) => exam.status !== "active" || date >= exam.examDate);
  const selectedQuizzes = createExamQuizRecommendations(exams, capacity, today).get(date) ?? [];
  const selectedSubjects = shown.map((exam) => ({ exam, newCards: getExamCalendarWork(dayByKey.get(date), new Set([exam.id])).newCards, quiz: selectedQuizzes.includes(exam.id) }))
    .filter(({ exam, newCards, quiz }) => date >= today && (newCards > 0 || quiz || (!hasSelectedForecast && exam.status === "active" && date < exam.examDate)));
  const selectedBlocks = (capacity.timeBlocks ?? []).filter((block) => block.date === date).sort((a, b) => a.start - b.start);
  const selectedExam = filter === "all" ? null : exams.find((exam) => exam.id === filter) ?? null;
  const topicSummary = forecast?.exams.find((exam) => exam.examId === selectedExam?.id);
  const topics = selectedExam && (!initialExamId || selectedExam.id === initialExamId) ? getExamTopicOrder(decks, selectedExam).filter((id) => topicSummary?.decks.some((deck) => deck.deckId === id && deck.total > deck.known)) : [];
  const topicDate = (id: string) => selectedExam?.topicDates?.find((topic) => topic.deckId === id)?.date ?? forecast?.days.find((day) => day.blocks.some((block) => block.method === "new" && block.deckId === id && block.examIds.includes(selectedExam?.id ?? "")))?.key;
  const deckName = (id: string) => decks.find((deck) => deck.id === id)?.name ?? "Entfernter Stapel";

  function change(nextExams: ExamPlan[], nextCapacity: StudyTimeCapacity) {
    try { validateExamPlanningSettings({ version: 2, exams: nextExams, capacity: nextCapacity }); setError(""); onChange(nextExams, nextCapacity); return true; }
    catch { setError("Bitte prüfe die Zeiten: Blöcke dürfen sich nicht überschneiden und müssen vor der jeweiligen Prüfung liegen."); return false; }
  }
  function setDayMinutes(minutes: number | null) {
    if (!selectedExam) return;
    const dateOverrides = selectedExam.studyTime.dateOverrides.filter((day) => day.date !== date);
    if (minutes !== null) dateOverrides.push({ date, minutes });
    change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, studyTime: { ...selectedExam.studyTime, dateOverrides } } : exam), capacity);
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

  return <section className="grid min-w-0 gap-4" aria-label="Lernkalender" data-testid="exam-calendar" aria-busy={busy}>
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div><h3 className="core-heading-3 font-semibold text-core-text">Dein Lernkalender</h3><p className="core-body text-core-muted">Deine Fächer und Aufgaben im Überblick. In der Woche kannst du Lernzeit blocken.</p></div>
      <div className="w-full sm:w-64"><CoreSelect className="w-full" ariaLabel="Prüfung im Kalender" value={filter} options={[{ value: "all", label: "Alle Prüfungen" }, ...exams.map((exam) => ({ value: exam.id, label: exam.name }))]} onValueChange={(id) => { setFilter(id); setSwap(""); if (id !== "all") setBlockExam(id); }} /></div>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <CoreSegmentedControl ariaLabel="Kalenderansicht" value={view} options={[{ value: "month", label: "Monat" }, { value: "week", label: "Woche" }]} onValueChange={setView} />
    </div>
    {view === "month" ? <ExamMonthCalendar exams={exams} shown={shown} capacity={capacity} forecast={forecast} today={today} date={date} color={(exam) => examColor(exams.indexOf(exam), exam)} onSelect={(key, open = true) => { setDate(key); setDetailsOpen(open); }} /> : <ExamWeekCalendar exams={exams} shown={shown} capacity={capacity} forecast={forecast} today={today} date={date} busy={busy} color={(exam) => examColor(exams.indexOf(exam), exam)} onSelect={(key, open = false) => { setDate(key); setDetailsOpen(open); }} onChange={(next) => change(exams, next)} />}
    {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
    {detailsOpen ? <>
    <SoftPanel className="grid min-w-0 gap-5 p-4 sm:p-6" data-testid="exam-day-editor">
      <div className="flex justify-between gap-3"><div><h4 className="core-heading-3 font-semibold text-core-text">{formatExamDate(date)}</h4><p className="core-body text-core-muted">{selectedWork.newCards} neue Karten · {formatExamMinutes(selectedExam ? getExamStudyMinutes(date, selectedExam, exams, capacity) : shown.reduce((sum, exam) => sum + getExamStudyMinutes(date, exam, exams, capacity), 0))} eingeplante Lernzeit</p></div><IconButton label="Tagesdetails schließen" icon={X} onClick={() => setDetailsOpen(false)} /></div>
      {shown.filter((exam) => exam.examDate === date).map((exam) => <StatusMessage key={exam.id} tone="info">Klausur: {exam.name}. Prüfungstage bleiben frei.</StatusMessage>)}
      {selectedSubjects.length ? <ul className="grid gap-2" aria-label="Lernaufgaben an diesem Tag">{selectedSubjects.flatMap(({ exam, newCards, quiz }) => [
        ...(newCards > 0 || !hasSelectedForecast ? [{ exam, kind: "study", label: hasSelectedForecast ? `${newCards} neue Karten` : "Karten: –" }] : []),
        ...(quiz ? [{ exam, kind: "quiz", label: "Quiz empfohlen" }] : []),
      ]).map(({ exam, kind, label }) => <li key={`${exam.id}:${kind}`} className="min-w-0 break-words rounded-inset border-l-strong p-3 core-body text-core-text" style={{ borderColor: examColor(exams.indexOf(exam), exam), background: `color-mix(in srgb, ${examColor(exams.indexOf(exam), exam)} 10%, var(--core-surface))` }}><strong>{exam.name}</strong> · {label}</li>)}</ul> : null}
      <ul className="grid gap-2" aria-label="Themen an diesem Tag">{[...new Set(selectedWork.blocks.map((block) => block.deckId))].map((id) => <li key={id} className="core-body text-core-text">{deckName(id)} · {new Set(selectedWork.blocks.filter((block) => block.deckId === id).flatMap((block) => block.cardIds)).size} Karten</li>)}</ul>
      {dayByKey.get(date)?.summaries.filter((entry) => ids.has(entry.examId)).map((entry) => <p key={`${entry.examId}:${entry.deckId}`} className="core-body text-core-text">Zusammenfassung lesen · {deckName(entry.deckId)}</p>)}
      <fieldset disabled={busy || date < today || date >= horizon} className="min-w-0">
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className="grid content-start gap-3">{selectedExam ? <><label className={LABEL}>Zeit für diesen Tag · Min.<input className={FIELD} type="number" min={0} max={1440} disabled={selectedBlocks.length > 0} value={getExamStudyMinutes(date, selectedExam, exams, capacity)} onChange={(event) => setDayMinutes(Math.min(1440, Math.max(0, Math.round(Number(event.target.value)))))} /></label>
          {selectedExam.studyTime.dateOverrides.some((day) => day.date === date) ? <ActionButton variant="secondary" onClick={() => setDayMinutes(null)}>Wochenrhythmus verwenden</ActionButton> : null}</> : null}
          <p className="core-caption text-core-muted">Ohne feste Blöcke gilt dein Wochenrhythmus oder die Tagesausnahme. Zugeordnete Kartenblöcke ersetzen die Vorgabe dieses Tages für ihr Fach.</p>
          <ul className="grid gap-2">{selectedBlocks.map((block) => <li key={block.id} className="flex min-w-0 items-center gap-2 rounded-control bg-core-subtle p-3"><span className="min-w-0 flex-1 break-words core-body text-core-text">{clock(block.start)}–{clock(block.end)} · {(block.examId === null ? "Lernzeit · Fach noch zuordnen" : `${exams.find((exam) => exam.id === block.examId)?.name}${block.kind === "quiz" ? " · Quiz" : " · Karten"}`)}</span><IconButton label={`Lernblock ${clock(block.start)} löschen`} icon={Trash2} onClick={() => change(exams, { ...capacity, timeBlocks: capacity.timeBlocks?.filter((entry) => entry.id !== block.id) })} /></li>)}</ul>
        </div>
        <form className="grid min-w-0 content-start gap-3" onSubmit={(event) => { event.preventDefault(); change(exams, { ...capacity, timeBlocks: [...(capacity.timeBlocks ?? []), { id: `time_${crypto.randomUUID()}`, date, start: parseClock(start), end: parseClock(end), examId: blockExam }] }); }}>
          <h5 className="core-body font-semibold text-core-text">Lernblock reservieren</h5>
          <CoreSelect className="w-full" ariaLabel="Prüfung für Lernblock" value={blockExam} options={exams.filter((exam) => exam.status === "active").map((exam) => ({ value: exam.id, label: exam.name }))} onValueChange={setBlockExam} />
          <div className="grid min-w-0 grid-cols-2 gap-3"><label className={LABEL}>Von<input type="time" required className={FIELD} value={start} onChange={(event) => setStart(event.target.value)} /></label><label className={LABEL}>Bis<input type="time" required className={FIELD} value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
          <ActionButton type="submit" variant="secondary" icon={Plus} disabled={!exams.some((exam) => exam.id === blockExam && exam.status === "active") || busy}>Lernblock hinzufügen</ActionButton>
          <p className="core-caption text-core-muted">Die Zeit ist für diese Prüfung reserviert. Überlappende Blöcke sind nicht möglich.</p>
        </form>
      </div>
      </fieldset>
    </SoftPanel>
    <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6">
      <div><h4 className="core-heading-3 font-semibold text-core-text">Themen verschieben oder tauschen</h4><p className="core-body text-core-muted">Neue Themen erhalten einen gewünschten Starttag. Fällige Wiederholungen bleiben berücksichtigt; die übrigen neuen Karten werden neu verteilt. Themen werden nicht übersprungen.</p></div>
      {!selectedExam ? <p className="core-body text-core-muted">Wähle oben eine einzelne Prüfung, um ihre Themen zu ändern.</p> : !topics.length ? <p className="core-body text-core-muted">Für diese Prüfung ist kein neuer Stoff offen.</p> : <ul className="grid gap-3">{topics.map((id) => <li key={id} className="grid min-w-0 gap-3 rounded-control bg-core-subtle p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div><p className="break-words core-body font-semibold text-core-text">{deckName(id)}</p><p className="core-caption text-core-muted">{topicSummary?.decks.find((deck) => deck.deckId === id)?.total} Karten · {topicDate(id) ? `Ab ${formatExamDate(topicDate(id)!, "short")}` : "Noch nicht eingeplant"}</p></div>
        <CoreDatePicker value={topicDate(id) ?? date} min={today} max={getExamLastNewDate(selectedExam)} today={today} ariaLabel={`Starttag für ${deckName(id)}`} onValueChange={(key) => moveTopic(id, key)} />
        <div className="flex flex-wrap gap-2 sm:col-span-2"><ActionButton variant="secondary" disabled={!topicDate(id)} onClick={() => setSwap(swap === id ? "" : id)}>Mit Thema tauschen</ActionButton>{selectedExam.topicDates?.some((topic) => topic.deckId === id) ? <ActionButton variant="secondary" onClick={() => change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, topicDates: exam.topicDates?.filter((topic) => topic.deckId !== id) } : exam), capacity)}>Automatisch planen</ActionButton> : null}</div>
        {swap === id ? <div className="grid gap-2 sm:col-span-2">{topics.filter((other) => other !== id && topicDate(other)).map((other) => <ActionButton key={other} variant="secondary" onClick={() => swapTopics(id, other)}>Mit {deckName(other)} tauschen</ActionButton>)}</div> : null}
      </li>)}</ul>}
    </SoftPanel>
    </> : null}
  </section>;
}
