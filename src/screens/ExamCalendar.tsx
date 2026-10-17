import React from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Deck, ExamPlan, StudyTimeCapacity } from "../coreTypes.ts";
import { validateExamPlanningSettings } from "../examPlanSettings.ts";
import { getExamDayCapacity, shiftExamDay, type ExamPortfolioForecast } from "../examPlanning.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { formatExamDate, formatExamMinutes } from "./examPlanningUi.ts";

const FIELD = "min-h-control w-full min-w-0 rounded-control border border-core-border bg-core-surface px-3 text-core-text";
const LABEL = "grid min-w-0 gap-2 core-body font-semibold text-core-muted";
const COLORS = ["var(--core-info)", "var(--core-success)", "var(--core-warning)", "var(--core-text)"];
function color(index: number) { return COLORS[index % COLORS.length]; }
function clock(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
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
  const monday = shiftExamDay(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const [week, setWeek] = React.useState(monday);
  const [date, setDate] = React.useState(today);
  const [filter, setFilter] = React.useState(initialExamId ?? "all");
  const [blockExam, setBlockExam] = React.useState(initialExamId ?? exams.find((exam) => exam.status === "active")?.id ?? "");
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("11:00");
  const [error, setError] = React.useState("");
  const [swap, setSwap] = React.useState("");
  const weekScroller = React.useRef<HTMLDivElement>(null);
  const shown = exams.filter((exam) => filter === "all" || exam.id === filter);
  const ids = new Set(shown.map((exam) => exam.id));
  const horizon = exams.reduce((last, exam) => exam.examDate > last ? exam.examDate : last, today);
  const days = Array.from({ length: 7 }, (_, index) => shiftExamDay(week, index));
  const selectedDay = forecast?.days.find((day) => day.key === date);
  const selectedBlocks = (capacity.timeBlocks ?? []).filter((block) => block.date === date).sort((a, b) => a.start - b.start);
  const selectedExam = filter === "all" ? null : exams.find((exam) => exam.id === filter) ?? null;
  const topicSummary = forecast?.exams.find((exam) => exam.examId === selectedExam?.id);
  const topics = selectedExam && (!initialExamId || selectedExam.id === initialExamId) ? selectedExam.deckIds.filter((id) => topicSummary?.decks.some((deck) => deck.deckId === id && deck.total > deck.known)) : [];
  const topicDate = (id: string) => selectedExam?.topicDates?.find((topic) => topic.deckId === id)?.date ?? forecast?.days.find((day) => day.blocks.some((block) => block.method === "new" && block.deckId === id && block.examIds.includes(selectedExam?.id ?? "")))?.key;
  const deckName = (id: string) => decks.find((deck) => deck.id === id)?.name ?? "Entfernter Stapel";

  React.useLayoutEffect(() => {
    const scroller = weekScroller.current;
    const button = scroller?.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`);
    if (!scroller) return;
    if (!button) { scroller.scrollLeft = 0; return; }
    const bounds = scroller.getBoundingClientRect(), target = button.getBoundingClientRect();
    scroller.scrollLeft += target.left - bounds.left - (scroller.clientWidth - target.width) / 2;
  }, [date, week]);

  function change(nextExams: ExamPlan[], nextCapacity: StudyTimeCapacity) {
    try { validateExamPlanningSettings({ version: 1, exams: nextExams, capacity: nextCapacity }); setError(""); onChange(nextExams, nextCapacity); }
    catch { setError("Bitte prüfe die Zeiten: Blöcke dürfen sich nicht überschneiden und müssen vor der jeweiligen Prüfung liegen."); }
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
    change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, topicDates, updatedAt: new Date().toISOString() } : exam), capacity);
    setSwap("");
  }

  return <section className="grid min-w-0 gap-4" aria-label="Lernkalender" data-testid="exam-calendar" aria-busy={busy}>
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div><h3 className="core-heading-3 font-semibold text-core-text">Dein Lernkalender</h3><p className="core-body text-core-muted">Themen verteilen und Lernzeit fest reservieren.</p></div>
      <div className="w-full sm:w-64"><CoreSelect ariaLabel="Prüfung im Kalender" value={filter} options={[{ value: "all", label: "Alle Prüfungen" }, ...exams.map((exam) => ({ value: exam.id, label: exam.name }))]} onValueChange={(id) => { setFilter(id); setSwap(""); if (id !== "all") setBlockExam(id); }} /></div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 core-caption text-core-muted">{shown.map((exam) => <span key={exam.id} className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-round" style={{ background: color(exams.indexOf(exam)) }} />{exam.name}</span>)}</div>
    <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="exam-week-atelier">
      <div className="flex min-w-0 items-center justify-between gap-2"><h4 className="core-body font-semibold text-core-text">{formatExamDate(week, "short")} – {formatExamDate(days[6], "short")}</h4><div className="flex gap-1"><IconButton label="Vorherige Woche" icon={ChevronLeft} disabled={week <= monday} onClick={() => setWeek(shiftExamDay(week, -7))} /><IconButton label="Nächste Woche" icon={ChevronRight} disabled={shiftExamDay(week, 7) > horizon} onClick={() => setWeek(shiftExamDay(week, 7))} /></div></div>
      <div ref={weekScroller} className="overflow-x-auto" role="region" aria-label="Wochenkalender, horizontal scrollbar" tabIndex={0}><div className="grid min-w-[56rem] grid-cols-7 gap-2">
        {days.map((key) => {
          const day = forecast?.days.find((entry) => entry.key === key);
          const minutes = getExamDayCapacity(key, capacity);
          const reservations = (capacity.timeBlocks ?? []).filter((block) => block.date === key && ids.has(block.examId)).sort((a, b) => a.start - b.start);
          return <div key={key} className={`grid content-start gap-2 rounded-control border p-2 ${date === key ? "border-core-action bg-core-surface" : "border-core-border bg-core-subtle"}`}>
            <button type="button" disabled={key < today || key >= horizon} aria-pressed={date === key} data-date={key} onClick={() => setDate(key)} className="grid min-h-control gap-1 text-left"><strong className="core-body text-core-text">{formatExamDate(key, "short")}</strong><span className="core-caption text-core-muted">{key === today ? "Heute · " : ""}{formatExamMinutes(day ? day.newMinutes + day.reviewMinutes : 0)} / {formatExamMinutes(minutes)}</span></button>
            {shown.filter((exam) => exam.examDate === key).map((exam) => <p key={exam.id} className="core-caption font-semibold text-core-text">Prüfung: {exam.name}</p>)}
            {shown.map((exam) => { const blocks = day?.blocks.filter((block) => block.examIds.includes(exam.id)) ?? []; return blocks.length ? <div key={exam.id} className="grid gap-1 border-l-strong pl-2" style={{ borderColor: color(exams.indexOf(exam)) }}><p className="break-words core-caption font-semibold text-core-text">{exam.name}</p>{[...new Set(blocks.map((block) => block.deckId))].map((id) => <p key={id} className="break-words core-caption text-core-muted">{deckName(id)} · {formatExamMinutes(blocks.filter((block) => block.deckId === id).reduce((sum, block) => sum + block.plannedMinutes, 0))}</p>)}</div> : null; })}
            {reservations.map((block) => <p key={block.id} className="rounded-inset border-l-strong bg-core-surface p-2 core-caption text-core-text" style={{ borderColor: color(exams.findIndex((exam) => exam.id === block.examId)) }}>{clock(block.start)}–{clock(block.end)}<br />{exams.find((exam) => exam.id === block.examId)?.name}</p>)}
            {!day?.blocks.length && !reservations.length ? <p className="py-2 core-caption text-core-muted">{minutes ? "Noch kein Stoff geplant" : "Frei"}</p> : null}
          </div>;
        })}
      </div></div>
      <p className="core-caption text-core-muted">Tageswerte sind Schätzungen. Gemeinsamer Stoff zählt in der Gesamtzeit einmal. Weitere Tage erreichst du durch seitliches Scrollen.</p>
    </SoftPanel>
    <SoftPanel className="grid min-w-0 gap-5 p-4 sm:p-6" data-testid="exam-day-editor">
      <div><h4 className="core-heading-3 font-semibold text-core-text">{formatExamDate(date)}</h4><p className="core-body text-core-muted">{formatExamMinutes(selectedDay ? selectedDay.newMinutes + selectedDay.reviewMinutes : 0)} Lernstoff · {formatExamMinutes(getExamDayCapacity(date, capacity))} Zeit</p></div>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className="grid content-start gap-3"><label className={LABEL}>Zeit für diesen Tag · Min.<input className={FIELD} type="number" min={0} max={1440} disabled={selectedBlocks.length > 0} value={getExamDayCapacity(date, capacity)} onChange={(event) => change(exams, { ...capacity, dateOverrides: [...capacity.dateOverrides.filter((day) => day.date !== date), { date, minutes: Math.min(1440, Math.max(0, Math.round(Number(event.target.value)))) }] })} /></label>
          {capacity.dateOverrides.some((day) => day.date === date) ? <ActionButton variant="secondary" onClick={() => change(exams, { ...capacity, dateOverrides: capacity.dateOverrides.filter((day) => day.date !== date) })}>Wochenrhythmus verwenden</ActionButton> : null}
          <p className="core-caption text-core-muted">Ohne feste Blöcke gilt dein Wochenrhythmus oder die Tagesausnahme. Feste Blöcke ersetzen die verfügbare Zeit an diesem Tag.</p>
          <ul className="grid gap-2">{selectedBlocks.map((block) => <li key={block.id} className="flex min-w-0 items-center gap-2 rounded-control bg-core-subtle p-3"><span className="min-w-0 flex-1 break-words core-body text-core-text">{clock(block.start)}–{clock(block.end)} · {exams.find((exam) => exam.id === block.examId)?.name}</span><IconButton label={`Lernblock ${clock(block.start)} löschen`} icon={Trash2} onClick={() => change(exams, { ...capacity, timeBlocks: capacity.timeBlocks?.filter((entry) => entry.id !== block.id) })} /></li>)}</ul>
        </div>
        <form className="grid min-w-0 content-start gap-3" onSubmit={(event) => { event.preventDefault(); change(exams, { ...capacity, timeBlocks: [...(capacity.timeBlocks ?? []), { id: `time_${crypto.randomUUID()}`, date, start: parseClock(start), end: parseClock(end), examId: blockExam }] }); }}>
          <h5 className="core-body font-semibold text-core-text">Lernblock reservieren</h5>
          <CoreSelect ariaLabel="Prüfung für Lernblock" value={blockExam} options={exams.filter((exam) => exam.status === "active").map((exam) => ({ value: exam.id, label: exam.name }))} onValueChange={setBlockExam} />
          <div className="grid min-w-0 grid-cols-2 gap-3"><label className={LABEL}>Von<input type="time" required className={FIELD} value={start} onChange={(event) => setStart(event.target.value)} /></label><label className={LABEL}>Bis<input type="time" required className={FIELD} value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
          <ActionButton type="submit" variant="secondary" icon={Plus} disabled={!exams.some((exam) => exam.id === blockExam && exam.status === "active") || busy}>Lernblock hinzufügen</ActionButton>
          <p className="core-caption text-core-muted">Die Zeit ist für diese Prüfung reserviert. Überlappende Blöcke sind nicht möglich.</p>
        </form>
      </div>
      {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
    </SoftPanel>
    <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6">
      <div><h4 className="core-heading-3 font-semibold text-core-text">Themen verschieben oder tauschen</h4><p className="core-body text-core-muted">Neue Themen erhalten einen gewünschten Starttag. Fällige Wiederholungen bleiben berücksichtigt; die Prognose prüft die verfügbare Zeit neu.</p></div>
      {!selectedExam ? <p className="core-body text-core-muted">Wähle oben eine einzelne Prüfung, um ihre Themen zu ändern.</p> : !topics.length ? <p className="core-body text-core-muted">Für diese Prüfung ist kein neuer Stoff offen.</p> : <ul className="grid gap-3">{topics.map((id) => <li key={id} className="grid min-w-0 gap-3 rounded-control bg-core-subtle p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div><p className="break-words core-body font-semibold text-core-text">{deckName(id)}</p><p className="core-caption text-core-muted">{topicSummary?.decks.find((deck) => deck.deckId === id)?.total} Karten · {topicDate(id) ? `Ab ${formatExamDate(topicDate(id)!, "short")}` : "Noch nicht eingeplant"}</p></div>
        <CoreDatePicker value={topicDate(id) ?? date} min={today} max={shiftExamDay(selectedExam.examDate, -1)} today={today} ariaLabel={`Starttag für ${deckName(id)}`} onValueChange={(key) => moveTopic(id, key)} />
        <div className="flex flex-wrap gap-2 sm:col-span-2"><ActionButton variant="secondary" disabled={!topicDate(id)} onClick={() => setSwap(swap === id ? "" : id)}>Mit Thema tauschen</ActionButton>{selectedExam.topicDates?.some((topic) => topic.deckId === id) ? <ActionButton variant="secondary" onClick={() => change(exams.map((exam) => exam.id === selectedExam.id ? { ...exam, topicDates: exam.topicDates?.filter((topic) => topic.deckId !== id) } : exam), capacity)}>Automatisch planen</ActionButton> : null}</div>
        {swap === id ? <div className="grid gap-2 sm:col-span-2">{topics.filter((other) => other !== id && topicDate(other)).map((other) => <ActionButton key={other} variant="secondary" onClick={() => swapTopics(id, other)}>Mit {deckName(other)} tauschen</ActionButton>)}</div> : null}
      </li>)}</ul>}
    </SoftPanel>
  </section>;
}
