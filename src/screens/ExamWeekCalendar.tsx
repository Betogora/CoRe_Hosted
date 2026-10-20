import React from "react";
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import type { ExamPlan, StudyTimeCapacity } from "../coreTypes.ts";
import type { ExamPortfolioForecast } from "../examPlanning.ts";
import { shiftExamDay } from "../examPlanning.ts";
import { createExamQuizRecommendations, createExamWeekDays, examMinuteAtPosition, examSelectionRange, getExamCalendarWork } from "../examCalendarModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { examTextColor, formatExamClock, formatExamDate } from "./examPlanningUi.ts";

type TimeBlock = NonNullable<StudyTimeCapacity["timeBlocks"]>[number];
type Task = { examId: string; kind: "study" | "quiz" };
type Selection = { date: string; first: number; last: number };
const HOUR_HEIGHT = 64;
const FIELD = "core-field w-full min-w-0";

export function ExamWeekCalendar({ exams, shown, capacity, forecast, today, date, busy, color, onSelect, onChange }: {
  exams: ExamPlan[]; shown: ExamPlan[]; capacity: StudyTimeCapacity; forecast: ExamPortfolioForecast | null;
  today: string; date: string; busy: boolean; color: (exam: ExamPlan) => string;
  onSelect: (date: string, openDetails?: boolean) => void; onChange: (capacity: StudyTimeCapacity) => boolean;
}) {
  const [week, setWeek] = React.useState(() => createExamWeekDays(date)[0]);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [cursor, setCursor] = React.useState({ date, minute: 480 });
  const [focusedDay, setFocusedDay] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");
  const [task, setTask] = React.useState<Task | null>(null);
  const [dragging, setDragging] = React.useState<Task & { x: number; y: number } | null>(null);
  const drag = React.useRef<Task & { x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = React.useRef(false);
  const pointerSelection = React.useRef<Selection | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const [manual, setManual] = React.useState(false);
  const [manualDate, setManualDate] = React.useState(date);
  const [start, setStart] = React.useState("13:00");
  const [end, setEnd] = React.useState("15:00");
  const days = createExamWeekDays(week);
  const quizzes = createExamQuizRecommendations(exams, capacity, today);
  const forecastDays = new Map(forecast?.days.map((day) => [day.key, day]));
  const selected = capacity.timeBlocks?.find((block) => block.id === selectedId);
  const activeSubject = exams.find((exam) => exam.id === task?.examId && exam.status === "active");
  const weekBlocks = (capacity.timeBlocks ?? []).filter((block) => days.includes(block.date));
  const unavailable = (key: string) => key < today || key > shiftExamDay(today, 365) || exams.some((exam) => exam.status === "active" && exam.examDate === key);
  const blockName = (block: TimeBlock) => {
    const exam = exams.find((exam) => exam.id === block.examId);
    return exam ? `${exam.name} · ${block.kind === "quiz" ? "Quiz" : "Karten"}` : "Lernzeit · Fach noch zuordnen";
  };

  React.useLayoutEffect(() => {
    const container = scroller.current;
    if (!container) return;
    const centerDay = () => {
      const header = container.querySelector<HTMLElement>(`[data-week-header="${date}"]`);
      if (header) container.scrollLeft += header.getBoundingClientRect().left - container.getBoundingClientRect().left - (container.clientWidth - header.offsetWidth) / 2;
      else container.scrollLeft = 0;
    };
    centerDay();
    const observer = new ResizeObserver(centerDay);
    observer.observe(container);
    return () => observer.disconnect();
  }, [week, date]);
  React.useLayoutEffect(() => { if (scroller.current) scroller.current.scrollTop = 8 * HOUR_HEIGHT; }, []);

  function createBlock(key: string, first: number, last: number) {
    if (busy || unavailable(key)) return;
    const block: TimeBlock = { id: `time_${crypto.randomUUID()}`, date: key, ...examSelectionRange(first, last), examId: null };
    if (onChange({ ...capacity, timeBlocks: [...(capacity.timeBlocks ?? []), block] })) setSelectedId(block.id);
    setSelection(null);
  }
  function assign(blockId: string, examId: string | null, kind: Task["kind"] = "study") {
    const block = capacity.timeBlocks?.find((entry) => entry.id === blockId);
    if (!block || busy || unavailable(block.date) || (examId !== null && !exams.some((exam) => exam.id === examId && exam.status === "active" && block.date < exam.examDate))) return;
    if (onChange({ ...capacity, timeBlocks: capacity.timeBlocks?.map((entry) => entry.id === blockId ? { ...entry, examId, kind: examId === null ? undefined : kind } : entry) })) setSelectedId(blockId);
  }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>, key: string) {
    const current = cursor.date === key ? cursor.minute : 480;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? 1425 : Math.max(0, Math.min(1425, current + (event.key === "ArrowDown" ? 15 : -15)));
      setCursor({ date: key, minute: next });
      const container = scroller.current;
      if (container) {
        const position = next / 60 * HOUR_HEIGHT;
        const visibleHeight = container.clientHeight - (container.querySelector<HTMLElement>("[data-week-todos]")?.offsetHeight ?? 0);
        if (position < container.scrollTop || position > container.scrollTop + visibleHeight - 32) container.scrollTop = Math.max(0, position - visibleHeight / 2);
      }
      setSelection(event.shiftKey ? { date: key, first: selection?.date === key ? selection.first : current, last: next } : null);
    } else if (event.key === "Enter") {
      event.preventDefault(); createBlock(key, selection?.date === key ? selection.first : current, selection?.date === key ? selection.last : current + 30);
    } else if (event.key === "Escape") { setSelection(null); setTask(null); }
  }
  function dropSubject(event: React.PointerEvent<HTMLButtonElement>) {
    const moving = drag.current;
    if (moving?.moved) {
      suppressClick.current = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-week-block]");
      if (target && scroller.current?.contains(target)) assign(target.dataset.weekBlock!, moving.examId, moving.kind);
    }
    drag.current = null; setDragging(null);
  }

  return <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="exam-week-calendar">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="core-heading-3 font-semibold text-core-text">{formatExamDate(days[0], "short")} – {formatExamDate(days[6], "short")}</h4>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2"><div aria-label="Fächer im Kalender" className="flex min-w-0 flex-wrap gap-2 core-caption">{shown.map((exam) => <span key={exam.id} className="min-w-0 break-words rounded-inset px-3 py-2 font-semibold" style={{ background: color(exam), color: examTextColor(exam) }}>{exam.name}</span>)}</div><div className="flex shrink-0 gap-2"><ActionButton variant="secondary" onClick={() => { setWeek(createExamWeekDays(today)[0]); setSelectedId(""); onSelect(today, false); }}>Heute</ActionButton><IconButton label="Vorherige Woche" icon={ChevronLeft} onClick={() => { setWeek(shiftExamDay(week, -7)); setSelection(null); setSelectedId(""); }} /><IconButton label="Nächste Woche" icon={ChevronRight} onClick={() => { setWeek(shiftExamDay(week, 7)); setSelection(null); setSelectedId(""); }} /></div></div>
    </div>
    <p className="core-caption text-core-muted">Ziehe im Stundenraster, um Lernzeit zu blocken. Ziehe danach Karten oder Quiz von oben in einen eigenen Block. Du kannst auch erst eine Aufgabe auswählen und dann einen Block antippen. Das Raster rastet in 15-Minuten-Schritten ein.</p>
    {activeSubject ? <p role="status" className="core-body text-core-text">{activeSubject.name} · {task?.kind === "quiz" ? "Quiz" : "Karten"} ausgewählt · Tippe einen Lernblock an, um die Aufgabe zuzuordnen.</p> : null}
    <div ref={scroller} className="relative max-h-[40rem] overflow-auto rounded-control border border-core-border" role="region" aria-label="Wochenkalender mit Stundenraster, horizontal und vertikal scrollbar" tabIndex={0}>
      <div className="min-w-[56rem]">
        <div data-week-todos className="sticky top-0 z-20 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-core-border bg-core-surface shadow-soft">
          <span className="sticky left-0 z-30 bg-core-surface px-2 py-3 core-caption text-core-muted">To-dos</span>
          {days.map((key) => {
            const day = forecastDays.get(key);
            const tasks = shown.flatMap((exam) => {
              const count = getExamCalendarWork(day, new Set([exam.id])).newCards;
              return [...(count > 0 ? [{ exam, label: `${count} neue Karten`, kind: "study" as const }] : []), ...(quizzes.get(key)?.includes(exam.id) ? [{ exam, label: "Quiz empfohlen", kind: "quiz" as const }] : [])];
            });
            return <div key={key} className="grid min-w-0 content-start gap-2 border-l border-core-border p-2">
              <button type="button" data-week-header={key} className={`min-h-control rounded-inset px-1 text-left core-body font-semibold ${key === today ? "bg-core-info-soft text-core-text" : "text-core-secondary"}`} onClick={() => { onSelect(key, false); setManualDate(key); }}>{formatExamDate(key, "short")}{key === today ? " · Heute" : ""}</button>
              {shown.filter((exam) => exam.examDate === key).map((exam) => <span key={exam.id} className="break-words rounded-inset p-2 core-caption font-semibold" style={{ background: color(exam), color: examTextColor(exam) }}>Klausur · {exam.name}</span>)}
              <div className="grid max-h-44 auto-rows-max content-start gap-2 overflow-y-auto" aria-label={`To-dos am ${formatExamDate(key)}`}>
                {tasks.map(({ exam, label, kind }) => <button key={`${exam.id}:${kind}`} type="button" data-week-task={exam.id} data-task-kind={kind} aria-label={`${exam.name}: ${label}. Aufgabe auswählen oder in einen Zeitblock ziehen`} aria-pressed={task?.examId === exam.id && task.kind === kind} disabled={busy || exam.status !== "active"} className="flex min-h-control min-w-0 touch-none select-none items-start gap-1 rounded-inset border-strong p-2 text-left" style={{ borderColor: color(exam), background: `color-mix(in srgb, ${color(exam)} ${task?.examId === exam.id && task.kind === kind ? 30 : 16}%, var(--core-surface))` }}
                  onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setTask(task?.examId === exam.id && task.kind === kind ? null : { examId: exam.id, kind }); }}
                  onPointerDown={(event) => { if (event.button !== 0) return; suppressClick.current = false; drag.current = { examId: exam.id, kind, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
                  onPointerMove={(event) => { const moving = drag.current; if (!moving) return; if (Math.hypot(event.clientX - moving.x, event.clientY - moving.y) > 6) moving.moved = true; if (moving.moved) setDragging({ examId: moving.examId, kind: moving.kind, x: event.clientX, y: event.clientY }); }}
                  onPointerUp={dropSubject} onPointerCancel={() => { drag.current = null; setDragging(null); }}>
                  <GripVertical size={14} className="mt-0.5 shrink-0 text-core-muted" aria-hidden="true"/><span className="grid min-w-0 gap-1"><strong className="min-w-0 break-words core-caption text-core-text">{exam.name}</strong><span className="core-caption text-core-text">{label}</span></span>
                </button>)}
                {!tasks.length ? <span className="core-caption text-core-muted">{day || !exams.some((exam) => exam.status === "active" && key < exam.examDate) ? "Keine neuen Karten" : key >= today ? "Plan wird berechnet …" : ""}</span> : null}
              </div>
            </div>;
          })}
        </div>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="sticky left-0 z-10 bg-core-surface" style={{ height: HOUR_HEIGHT * 24 }}>{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="absolute right-2 core-caption text-core-muted" style={{ top: hour * HOUR_HEIGHT + 2 }}>{formatExamClock(hour * 60)}</span>)}</div>
          {days.map((key) => <div key={key} className={`relative border-l border-core-border ${unavailable(key) ? "bg-core-subtle" : "bg-core-surface"}`} style={{ height: HOUR_HEIGHT * 24 }}>
            <div role="slider" tabIndex={unavailable(key) || busy ? -1 : 0} aria-label={`Lernzeit am ${formatExamDate(key)}`} aria-disabled={unavailable(key) || busy} aria-valuemin={0} aria-valuemax={1425} aria-valuenow={cursor.date === key ? cursor.minute : 480} aria-valuetext={`${formatExamClock(cursor.date === key ? cursor.minute : 480)}. Pfeiltasten wählen die Uhrzeit, Umschalt verlängert die Auswahl, Enter blockt die Zeit.`} data-week-day={key} className="absolute inset-0 touch-none outline-none"
              onFocus={() => setFocusedDay(key)} onBlur={() => setFocusedDay("")}
              onKeyDown={(event) => { if (!busy && !unavailable(key)) keyboard(event, key); }}
              onPointerDown={(event) => { if (event.button !== 0 || busy || unavailable(key)) return; const minute = examMinuteAtPosition(event.clientY - event.currentTarget.getBoundingClientRect().top, HOUR_HEIGHT * 24); const next = { date: key, first: minute, last: minute }; pointerSelection.current = next; setSelection(next); event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={(event) => { const current = pointerSelection.current; if (!current || current.date !== key) return; const last = examMinuteAtPosition(event.clientY - event.currentTarget.getBoundingClientRect().top, HOUR_HEIGHT * 24); const next = { ...current, last }; pointerSelection.current = next; setSelection(next); }}
              onPointerUp={() => { const current = pointerSelection.current; pointerSelection.current = null; if (current?.date === key) createBlock(key, current.first, current.last); }} onPointerCancel={() => { pointerSelection.current = null; setSelection(null); }}>
              {Array.from({ length: 24 }, (_, hour) => <span key={hour} className="pointer-events-none absolute inset-x-0 border-t border-core-border" style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}><span className="absolute inset-x-0 top-1/2 border-t border-dashed border-core-border" /></span>)}
            </div>
            {focusedDay === key ? <span className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-core-action" style={{ top: (cursor.date === key ? cursor.minute : 480) / 1440 * 100 + "%" }}><span className="rounded-inset bg-core-action px-1 core-caption text-core-on-accent">{formatExamClock(cursor.date === key ? cursor.minute : 480)}</span></span> : null}
            {selection?.date === key ? <span className="pointer-events-none absolute inset-x-1 z-10 overflow-hidden rounded-inset border-strong border-dashed border-core-action bg-core-info-soft p-1 core-caption text-core-text" style={{ top: examSelectionRange(selection.first, selection.last).start / 1440 * 100 + "%", height: (examSelectionRange(selection.first, selection.last).end - examSelectionRange(selection.first, selection.last).start) / 1440 * 100 + "%" }}>{formatExamClock(examSelectionRange(selection.first, selection.last).start)}–{formatExamClock(examSelectionRange(selection.first, selection.last).end)}</span> : null}
            {(capacity.timeBlocks ?? []).filter((block) => block.date === key).map((block) => {
              const exam = exams.find((entry) => entry.id === block.examId);
              const muted = Boolean(exam && !shown.some((entry) => entry.id === exam.id));
              return <button key={block.id} type="button" data-week-block={block.id} aria-label={`${formatExamDate(key)}, ${formatExamClock(block.start)} bis ${formatExamClock(block.end)}. ${blockName(block)}. ${task ? "Ausgewählte Aufgabe zuordnen" : "Zeitblock auswählen"}`} aria-pressed={selectedId === block.id} className={`absolute inset-x-1 z-10 grid min-w-0 content-start gap-1 overflow-hidden rounded-inset border-strong p-1 text-left ${selectedId === block.id ? "shadow-selection" : ""} ${muted ? "opacity-50" : ""} ${exam ? "" : "border-dashed border-core-border-strong bg-core-subtle text-core-text"}`} style={{ top: block.start / 1440 * 100 + "%", height: (block.end - block.start) / 1440 * 100 + "%", ...(exam ? { background: color(exam), borderColor: color(exam), color: examTextColor(exam) } : {}) }} onClick={() => { if (activeSubject) assign(block.id, activeSubject.id, task?.kind); else setSelectedId(block.id); }}>
                <strong className="min-w-0 break-words core-caption">{formatExamClock(block.start)}–{formatExamClock(block.end)}</strong><span className="min-w-0 break-words core-caption">{blockName(block)}</span>
              </button>;
            })}
          </div>)}
        </div>
      </div>
    </div>
    {dragging ? <span className="pointer-events-none fixed z-50 max-w-48 rounded-control px-3 py-2 core-body font-semibold shadow-raised" style={{ left: dragging.x + 12, top: dragging.y + 12, background: color(exams.find((exam) => exam.id === dragging.examId)!), color: examTextColor(exams.find((exam) => exam.id === dragging.examId)!) }}>{exams.find((exam) => exam.id === dragging.examId)?.name} · {dragging.kind === "quiz" ? "Quiz" : "Karten"}</span> : null}
    <p className="core-caption text-core-muted">Für die Tastatur: Stundenraster fokussieren, mit Pfeiltasten die Uhrzeit wählen, mit Umschalt die Auswahl verlängern und mit Enter blocken. Auf schmalen Ansichten scrollt der Kalender seitlich.</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="core-field-group"><span className="core-field-label">Zeitblock auswählen</span><CoreSelect ariaLabel="Zeitblock auswählen" value={selected?.id ?? ""} options={[{ value: "", label: "Zeitblock im Kalender wählen" }, ...weekBlocks.map((block) => ({ value: block.id, label: `${formatExamDate(block.date, "short")} · ${formatExamClock(block.start)}–${formatExamClock(block.end)} · ${blockName(block)}` }))]} onValueChange={setSelectedId} /></label>
      {selected ? <div className="flex min-w-0 items-end gap-2"><fieldset disabled={busy || unavailable(selected.date)} className="core-field-group min-w-0 flex-1"><span className="core-field-label">Fach im Zeitblock</span><CoreSelect ariaLabel="Fach im Zeitblock" value={selected.examId ?? ""} options={[{ value: "", label: "Fach noch zuordnen" }, ...exams.filter((exam) => exam.status === "active" && selected.date < exam.examDate).map((exam) => ({ value: exam.id, label: exam.name }))]} onValueChange={(id) => assign(selected.id, id || null, selected.kind)} />{selected.examId ? <label className="core-field-group"><span className="core-field-label">Aufgabe im Zeitblock</span><CoreSelect ariaLabel="Aufgabe im Zeitblock" value={selected.kind ?? "study"} options={[{ value: "study", label: "Karten" }, { value: "quiz", label: "Quiz" }]} onValueChange={(kind) => assign(selected.id, selected.examId, kind as Task["kind"])} /></label> : null}</fieldset><IconButton label="Ausgewählten Zeitblock löschen" icon={Trash2} disabled={busy || unavailable(selected.date)} onClick={() => { if (onChange({ ...capacity, timeBlocks: capacity.timeBlocks?.filter((block) => block.id !== selected.id) })) setSelectedId(""); }} /></div> : null}
    </div>
    <div><ActionButton variant="secondary" icon={Plus} onClick={() => setManual(!manual)} aria-expanded={manual}>Zeitblock per Eingabe</ActionButton></div>
    {manual ? <form className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); if (unavailable(manualDate)) return; const parse = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }; if (parse(start) >= parse(end)) return; createBlock(manualDate, parse(start), parse(end)); }}><label className="core-field-group"><span className="core-field-label">Tag</span><CoreDatePicker ariaLabel="Tag für Zeitblock" value={manualDate} min={today} max={shiftExamDay(today, 365)} today={today} onValueChange={setManualDate}/></label><label className="core-field-group"><span className="core-field-label">Von</span><input className={FIELD} type="time" step={900} required value={start} onChange={(event) => setStart(event.target.value)}/></label><label className="core-field-group"><span className="core-field-label">Bis</span><input className={FIELD} type="time" step={900} required value={end} min={start} onChange={(event) => setEnd(event.target.value)}/></label><ActionButton type="submit" variant="secondary" disabled={busy || unavailable(manualDate) || start >= end}>Lernzeit blocken</ActionButton></form> : null}
  </SoftPanel>;
}
