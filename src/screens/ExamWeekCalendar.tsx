import React from "react";
import { ExamCalendarFilters } from "./ExamCalendarFilters.tsx";
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2, X } from "lucide-react";
import type { Deck, ExamPlan, StudyTimeCapacity } from "../coreTypes.ts";
import type { ExamPortfolioForecast } from "../examPlanning.ts";
import { shiftExamDay } from "../examPlanning.ts";
import { createExamWeekDays, examBlockRangeAt, EXAM_DAY_MINUTES, EXAM_DAY_START, EXAM_SLOT_MINUTES, examMinuteAtPosition, examSelectionRange, getExamCalendarWork, isExamCalendarDayLocked } from "../examCalendarModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreDatePicker } from "../ui/CoreDatePicker.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { examTextColor, formatExamClock, formatExamCount, formatExamDate } from "./examPlanningUi.ts";

type TimeBlock = NonNullable<StudyTimeCapacity["timeBlocks"]>[number];
type Task = { examId: string };
type Selection = { date: string; first: number; last: number; touch: boolean };
type TimeRange = { start: number; end: number };
const HOUR_HEIGHT = 32;
const GRID_HEIGHT = HOUR_HEIGHT * EXAM_DAY_MINUTES / 60;
const LAST_SLOT = 1440 - EXAM_SLOT_MINUTES;
const gridOffset = (minute: number) => (Math.max(minute, EXAM_DAY_START) - EXAM_DAY_START) / 60 * HOUR_HEIGHT;
const gridPercent = (minute: number) => gridOffset(minute) / GRID_HEIGHT * 100 + "%";
const FIELD = "core-field w-full min-w-0";

export function ExamWeekCalendar({ exams, shown, onToggleExam, capacity, forecast, decks, today, date, busy, color, onSelect, onChange }: {
  exams: ExamPlan[]; shown: ExamPlan[]; onToggleExam: (id: string) => void; capacity: StudyTimeCapacity; forecast: ExamPortfolioForecast | null; decks: Deck[];
  today: string; date: string; busy: boolean; color: (exam: ExamPlan) => string;
  onSelect: (date: string, openDetails?: boolean) => void; onChange: (capacity: StudyTimeCapacity) => boolean;
}) {
  const [week, setWeek] = React.useState(() => createExamWeekDays(date)[0]);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [cursor, setCursor] = React.useState({ date, minute: 480 });
  const [focusedDay, setFocusedDay] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");
  const [editing, setEditing] = React.useState<TimeRange & { id: string } | null>(null);
  const edit = React.useRef<{ id: string; y: number; move: boolean; next: TimeRange } | null>(null);
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
  const forecastDays = new Map(forecast?.days.map((day) => [day.key, day]));
  const activeSubject = shown.find((exam) => exam.id === task?.examId && exam.status === "active");
  const weekBlocks = (capacity.timeBlocks ?? []).filter((block) => days.includes(block.date) && (block.examId === null || shown.some((exam) => exam.id === block.examId)));
  const selected = weekBlocks.find((block) => block.id === selectedId);
  const unavailable = (key: string) => isExamCalendarDayLocked(key, today, exams);
  const blockName = (block: TimeBlock) => {
    const exam = exams.find((exam) => exam.id === block.examId);
    return exam ? exam.name : "Lernzeit ohne Fach";
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
  React.useLayoutEffect(() => {
    const container = scroller.current;
    const block = container?.querySelector<HTMLElement>(`[data-week-block-container="${CSS.escape(selectedId)}"]`);
    if (!container || !block) return;
    const headerHeight = container.querySelector<HTMLElement>("[data-week-todos]")?.offsetHeight ?? 0;
    const top = block.getBoundingClientRect().top - container.getBoundingClientRect().top;
    const clearance = top - headerHeight - 48;
    if (clearance < 0) container.scrollTop = Math.max(0, container.scrollTop + clearance);
  }, [selectedId]);

  function createBlock(key: string, first: number, last: number) {
    if (busy || unavailable(key)) return;
    const block: TimeBlock = { id: `time_${crypto.randomUUID()}`, date: key, ...examSelectionRange(first, last), examId: null };
    if (onChange({ ...capacity, timeBlocks: [...(capacity.timeBlocks ?? []), block] })) setSelectedId(block.id);
    setSelection(null);
  }
  function assign(blockId: string, examId: string | null) {
    const block = capacity.timeBlocks?.find((entry) => entry.id === blockId);
    if (!block || busy || unavailable(block.date) || (examId !== null && !shown.some((exam) => exam.id === examId && exam.status === "active" && block.date < exam.examDate && (!exam.studyStartDate || block.date >= exam.studyStartDate)))) return;
    if (onChange({ ...capacity, timeBlocks: capacity.timeBlocks?.map((entry) => entry.id === blockId ? { ...entry, examId } : entry) })) setSelectedId(blockId);
  }
  function removeBlock(block: TimeBlock) {
    if (busy || unavailable(block.date)) return;
    if (onChange({ ...capacity, timeBlocks: capacity.timeBlocks?.filter((entry) => entry.id !== block.id) })) setSelectedId("");
  }
  function changeTime(block: TimeBlock, { start, end }: TimeRange) {
    if (busy || unavailable(block.date) || (start === block.start && end === block.end)) return;
    onChange({ ...capacity, timeBlocks: capacity.timeBlocks?.map((entry) => entry.id === block.id ? { ...entry, start, end } : entry) });
  }
  function cancelEdit() { edit.current = null; setEditing(null); }
  function beginEdit(event: React.PointerEvent<HTMLElement>, block: TimeBlock, move: boolean) {
    if (event.button !== 0 || busy || unavailable(block.date)) return;
    event.preventDefault(); event.currentTarget.focus();
    edit.current = { id: block.id, y: event.clientY, move, next: block };
    setEditing({ id: block.id, start: block.start, end: block.end });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function updateEdit(event: React.PointerEvent<HTMLElement>, block: TimeBlock) {
    const gesture = edit.current;
    if (gesture?.id !== block.id) return;
    const anchor = gesture.move ? block.start : block.end;
    gesture.next = examBlockRangeAt(block, gesture.move, examMinuteAtPosition(gridOffset(anchor) + event.clientY - gesture.y, GRID_HEIGHT));
    setEditing({ id: block.id, ...gesture.next });
  }
  function finishEdit(block: TimeBlock) { const gesture = edit.current; cancelEdit(); if (gesture?.id === block.id) changeTime(block, gesture.next); }
  function editByKeyboard(event: React.KeyboardEvent<HTMLElement>, block: TimeBlock, move: boolean) {
    if (event.key === "Escape") { event.preventDefault(); cancelEdit(); return; }
    if (edit.current || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = move ? block.start : block.end;
    changeTime(block, examBlockRangeAt(block, move, event.key === "Home" ? 0 : event.key === "End" ? 1440 : current + (["ArrowDown", "ArrowRight"].includes(event.key) ? EXAM_SLOT_MINUTES : -EXAM_SLOT_MINUTES)));
  }
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>, key: string) {
    const current = cursor.date === key ? cursor.minute : 480;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? EXAM_DAY_START : event.key === "End" ? LAST_SLOT : Math.max(EXAM_DAY_START, Math.min(LAST_SLOT, current + (event.key === "ArrowDown" ? EXAM_SLOT_MINUTES : -EXAM_SLOT_MINUTES)));
      setCursor({ date: key, minute: next });
      const container = scroller.current;
      if (container) {
        const position = gridOffset(next);
        const visibleHeight = container.clientHeight - (container.querySelector<HTMLElement>("[data-week-todos]")?.offsetHeight ?? 0);
        if (position < container.scrollTop || position > container.scrollTop + visibleHeight - 32) container.scrollTop = Math.max(0, position - visibleHeight / 2);
      }
      setSelection(event.shiftKey ? { date: key, first: selection?.date === key ? selection.first : current, last: next, touch: false } : null);
    } else if (event.key === "Enter") {
      event.preventDefault(); createBlock(key, selection?.date === key ? selection.first : current, selection?.date === key ? selection.last : current + EXAM_SLOT_MINUTES);
    } else if (event.key === "Escape") { setSelection(null); setTask(null); }
  }
  function dropSubject(event: React.PointerEvent<HTMLButtonElement>) {
    const moving = drag.current;
    if (moving?.moved) {
      suppressClick.current = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-week-block]");
      if (target && scroller.current?.contains(target)) assign(target.dataset.weekBlock!, moving.examId);
    }
    drag.current = null; setDragging(null);
  }

  return <SoftPanel className="grid min-w-0 gap-4 p-3 sm:p-5" data-testid="exam-week-calendar">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h4 className="mr-auto core-heading-3 text-core-text">{formatExamDate(days[0], "short")} – {formatExamDate(days[6], "short")}</h4>
      <ExamCalendarFilters exams={exams} shown={shown} color={color} onToggle={onToggleExam} />
      <div className="flex shrink-0 gap-2"><ActionButton variant="secondary" onClick={() => { setWeek(createExamWeekDays(today)[0]); setSelectedId(""); onSelect(today, false); }}>Heute</ActionButton><IconButton label="Vorherige Woche" icon={ChevronLeft} onClick={() => { setWeek(shiftExamDay(week, -7)); setSelection(null); setSelectedId(""); }} /><IconButton label="Nächste Woche" icon={ChevronRight} onClick={() => { setWeek(shiftExamDay(week, 7)); setSelection(null); setSelectedId(""); }} /></div>
    </div>
    {activeSubject ? <p role="status" className="core-body text-core-text">{activeSubject.name} · Karten ausgewählt · Tippe einen Lernblock an, um die Aufgabe zuzuordnen.</p> : null}
    <div ref={scroller} className="relative max-h-[40rem] overflow-auto rounded-control border border-core-border" role="region" aria-label="Wochenkalender mit Stundenraster, horizontal und vertikal scrollbar" tabIndex={0}>
      <div className="min-w-[56rem]">
        <div data-week-todos className="sticky top-0 z-20 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-core-border bg-core-surface">
          <span className="sticky left-0 z-30 bg-core-surface px-2 py-3 core-caption font-semibold text-core-muted">To-dos</span>
          {days.map((key) => {
            const day = forecastDays.get(key);
            const tasks = shown.flatMap((exam) => {
              const count = getExamCalendarWork(day, new Set([exam.id])).newCards;
              return count > 0 ? [{ exam, label: formatExamCount(count, "neue Karte", "neue Karten") }] : [];
            });
            return <div key={key} className="grid min-w-0 content-start gap-2 border-l border-core-border p-2">
              <button type="button" data-week-header={key} className={`min-h-control rounded-inset px-2 text-left core-control-label font-semibold transition-colors ${key === today ? "bg-core-info-soft text-core-action" : "text-core-text hover:bg-core-subtle"}`} onClick={() => { onSelect(key, false); setManualDate(key); }}>{formatExamDate(key, "short")}{key === today ? " · Heute" : ""}</button>
              {shown.filter((exam) => exam.examDate === key).map((exam) => <span key={exam.id} className="break-words rounded-inset p-2 core-caption font-semibold" style={{ background: color(exam), color: examTextColor(exam) }}>Klausur · {exam.name}</span>)}
              <div className="grid max-h-44 auto-rows-max content-start gap-2 overflow-y-auto" aria-label={`To-dos am ${formatExamDate(key)}`}>
                {tasks.map(({ exam, label }) => <button key={exam.id} type="button" data-week-task={exam.id} aria-label={`${exam.name}: ${label}. Aufgabe auswählen oder in einen Zeitblock ziehen`} aria-pressed={task?.examId === exam.id} disabled={busy || exam.status !== "active"} className="flex min-h-control min-w-0 touch-none select-none items-start gap-1 rounded-inset border-strong p-2 text-left" style={{ borderColor: color(exam), background: `color-mix(in srgb, ${color(exam)} ${task?.examId === exam.id ? 30 : 16}%, var(--core-surface))` }}
                  onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setTask(task?.examId === exam.id ? null : { examId: exam.id }); }}
                  onPointerDown={(event) => { if (event.button !== 0) return; suppressClick.current = false; drag.current = { examId: exam.id, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
                  onPointerMove={(event) => { const moving = drag.current; if (!moving) return; if (Math.hypot(event.clientX - moving.x, event.clientY - moving.y) > 6) moving.moved = true; if (moving.moved) setDragging({ examId: moving.examId, x: event.clientX, y: event.clientY }); }}
                  onPointerUp={dropSubject} onPointerCancel={() => { drag.current = null; setDragging(null); }}>
                  <GripVertical size={14} className="mt-0.5 shrink-0 text-core-muted" aria-hidden="true"/><span className="grid min-w-0 gap-1"><strong className="min-w-0 break-words core-caption text-core-text">{exam.name}</strong><span className="core-caption text-core-text">{label}</span></span>
                </button>)}
                {day?.summaries.flatMap((entry) => { const exam = shown.find((candidate) => candidate.id === entry.examId); return exam ? [<span key={`summary:${entry.examId}:${entry.deckId}`} data-exam-task="summary" className="grid min-w-0 gap-1 break-words rounded-inset border-l-strong bg-core-subtle p-2 core-caption text-core-text" style={{ borderColor: color(exam) }}><strong className="min-w-0 break-words">{exam.name}</strong>Lesen · {decks.find((deck) => deck.id === entry.deckId)?.name ?? "Stapel"}</span>] : []; })}
                {day?.quizzes?.flatMap((quiz) => { const exam = shown.find((entry) => entry.id === quiz.examId); return exam ? [<span key={`quiz:${quiz.examId}:${quiz.deckIds[0]}`} data-exam-task="quiz" className="grid min-w-0 gap-1 break-words rounded-inset border-l-strong bg-core-subtle p-2 core-caption text-core-text" style={{ borderColor: color(exam) }}><strong className="min-w-0 break-words">{exam.name}</strong>Quiz · {quiz.deckIds.map((id) => decks.find((deck) => deck.id === id)?.name ?? "Stapel").join(" · ")}</span>] : []; })}
                {!tasks.length ? <span className="core-caption text-core-muted">{day || !exams.some((exam) => exam.status === "active" && key < exam.examDate) ? "Keine neuen Karten" : key >= today ? "Plan wird berechnet …" : ""}</span> : null}
              </div>
            </div>;
          })}
        </div>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="sticky left-0 z-10 bg-core-surface" style={{ height: GRID_HEIGHT }}>{Array.from({ length: EXAM_DAY_MINUTES / 60 }, (_, hour) => <span key={hour} className="absolute right-2 core-caption text-core-muted" style={{ top: hour * HOUR_HEIGHT + 2 }}>{formatExamClock(EXAM_DAY_START + hour * 60)}</span>)}</div>
          {days.map((key) => <div key={key} className={`relative border-l border-core-border ${unavailable(key) ? "bg-core-subtle" : "bg-core-surface"}`} style={{ height: GRID_HEIGHT }}>
            <div role="slider" tabIndex={unavailable(key) || busy ? -1 : 0} aria-label={`Lernzeit am ${formatExamDate(key)}`} aria-disabled={unavailable(key) || busy} aria-valuemin={EXAM_DAY_START} aria-valuemax={LAST_SLOT} aria-valuenow={cursor.date === key ? cursor.minute : 480} aria-valuetext={`${formatExamClock(cursor.date === key ? cursor.minute : 480)}. Pfeiltasten wählen die Uhrzeit, Umschalt verlängert die Auswahl, Enter blockt die Zeit.`} data-week-day={key} className="absolute inset-0 touch-pan-x touch-pan-y outline-none"
              onFocus={() => setFocusedDay(key)} onBlur={() => setFocusedDay("")}
              onKeyDown={(event) => { if (!busy && !unavailable(key)) keyboard(event, key); }}
              onPointerDown={(event) => { if (event.button !== 0 || busy || unavailable(key)) return; const minute = examMinuteAtPosition(event.clientY - event.currentTarget.getBoundingClientRect().top, GRID_HEIGHT); const next = { date: key, first: minute, last: minute, touch: event.pointerType === "touch" }; pointerSelection.current = next; setSelection(next); event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={(event) => { const current = pointerSelection.current; if (!current || current.date !== key) return; const last = examMinuteAtPosition(event.clientY - event.currentTarget.getBoundingClientRect().top, GRID_HEIGHT); const next = { ...current, last }; pointerSelection.current = next; setSelection(next); }}
              onPointerUp={() => { const current = pointerSelection.current; pointerSelection.current = null; if (current?.date === key) createBlock(key, current.first, current.touch && current.first === current.last ? current.first + 60 : current.last); }} onPointerCancel={() => { pointerSelection.current = null; setSelection(null); }}>
              {Array.from({ length: EXAM_DAY_MINUTES / 60 }, (_, hour) => <span key={hour} className="pointer-events-none absolute inset-x-0 border-t border-core-border" style={{ top: hour * HOUR_HEIGHT }} />)}
            </div>
            {focusedDay === key ? <span className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-core-action" style={{ top: gridPercent(cursor.date === key ? cursor.minute : 480) }}><span className="rounded-inset bg-core-action px-1 core-caption text-core-on-accent">{formatExamClock(cursor.date === key ? cursor.minute : 480)}</span></span> : null}
            {selection?.date === key ? <span className="pointer-events-none absolute inset-x-1 z-10 overflow-hidden rounded-inset border-strong border-dashed border-core-action bg-core-info-soft p-1 core-caption text-core-text" style={{ top: gridPercent(examSelectionRange(selection.first, selection.last).start), height: (examSelectionRange(selection.first, selection.last).end - examSelectionRange(selection.first, selection.last).start) / EXAM_DAY_MINUTES * 100 + "%" }}>{formatExamClock(examSelectionRange(selection.first, selection.last).start)}–{formatExamClock(examSelectionRange(selection.first, selection.last).end)}</span> : null}
            {weekBlocks.filter((block) => block.date === key).map((block) => {
              const exam = exams.find((entry) => entry.id === block.examId);
              const { start, end } = editing?.id === block.id ? editing : block;
              const isSelected = selectedId === block.id;
              const editable = !busy && !unavailable(key);
              const edge = `absolute touch-none select-none ${editable ? "cursor-move" : ""}`;
              const gestures = (move: boolean) => ({ onPointerDown: (event: React.PointerEvent<HTMLElement>) => beginEdit(event, block, move), onPointerMove: (event: React.PointerEvent<HTMLElement>) => updateEdit(event, block), onPointerUp: () => finishEdit(block), onPointerCancel: cancelEdit, onLostPointerCapture: cancelEdit });
              return <div key={block.id} data-week-block-container={block.id} className={`absolute inset-x-1 min-w-0 ${isSelected ? "z-[15]" : "z-10"}`} style={{ top: gridPercent(start), height: (end - start) / EXAM_DAY_MINUTES * 100 + "%" }}>
                <CoreTooltip label={`${formatExamClock(start)}–${formatExamClock(end)} · ${blockName(block)}`}><button type="button" data-week-block={block.id} aria-label={`${formatExamDate(key)}, ${formatExamClock(start)} bis ${formatExamClock(end)}. ${blockName(block)}. ${activeSubject ? "Ausgewählte Aufgabe zuordnen" : "Zeitblock auswählen"}`} aria-pressed={isSelected} className={`absolute inset-0 grid min-h-0 w-full min-w-0 content-start gap-1 overflow-hidden rounded-inset border-strong px-1 text-left ${end - start >= 60 ? "py-1" : ""} ${isSelected ? "shadow-selection" : ""} ${exam ? "" : "border-dashed border-core-border-strong bg-core-subtle text-core-text"}`} style={exam ? { background: color(exam), borderColor: color(exam), color: examTextColor(exam) } : undefined} onClick={() => { if (activeSubject) assign(block.id, activeSubject.id); else setSelectedId(block.id); }}>
                  {end - start >= 30 ? <strong className="min-w-0 whitespace-nowrap core-caption">{formatExamClock(start)}–{formatExamClock(end)}</strong> : null}{end - start >= 90 ? <span className="min-w-0 truncate core-caption">{blockName(block)}</span> : null}
                </button></CoreTooltip>
                {isSelected ? <>
                  <span role="slider" tabIndex={editable ? 0 : -1} aria-label="Lernzeit verschieben" aria-disabled={!editable} aria-valuemin={EXAM_DAY_START} aria-valuemax={1440 - (block.end - block.start)} aria-valuenow={start} aria-valuetext={`Beginn ${formatExamClock(start)}. Ziehen am oberen oder seitlichen Rand oder Pfeiltasten verschieben die Lernzeit um 30 Minuten.`} className={`${edge} inset-x-0 -top-1 h-3`} {...gestures(true)} onKeyDown={(event) => editByKeyboard(event, block, true)} />
                  {["-left-1", "-right-1"].map((side) => <span key={side} aria-hidden="true" className={`${edge} ${side} inset-y-0 w-3`} {...gestures(true)} />)}
                  <div className={`absolute right-0 ${block.start < EXAM_DAY_START + 60 ? "top-0" : "bottom-full mb-1"}`}><IconButton label="Lernzeit im Kalender löschen" icon={X} disabled={!editable} onClick={() => removeBlock(block)} /></div>
                  <button type="button" role="slider" aria-label="Ende der Lernzeit ändern" aria-valuemin={block.start + EXAM_SLOT_MINUTES} aria-valuemax={1440} aria-valuenow={end} aria-valuetext={`${formatExamClock(end)}. Ziehen oder Pfeiltasten verlängern oder verkürzen die Lernzeit um 30 Minuten.`} disabled={!editable} className="absolute -bottom-5 left-1/2 flex h-control w-control -translate-x-1/2 touch-none select-none items-center justify-center rounded-control text-core-text disabled:cursor-default disabled:opacity-50 enabled:cursor-ns-resize"
                    {...gestures(false)} onKeyDown={(event) => editByKeyboard(event, block, false)}>
                    <span aria-hidden="true" className="h-2 w-8 rounded-round border border-core-border-strong bg-core-text shadow-soft" />
                  </button>
                </> : null}
              </div>;
            })}
          </div>)}
        </div>
      </div>
    </div>
    {dragging ? <span className="pointer-events-none fixed z-50 max-w-48 rounded-control px-3 py-2 core-body font-semibold shadow-raised" style={{ left: dragging.x + 12, top: dragging.y + 12, background: color(exams.find((exam) => exam.id === dragging.examId)!), color: examTextColor(exams.find((exam) => exam.id === dragging.examId)!) }}>{exams.find((exam) => exam.id === dragging.examId)?.name}</span> : null}
    {selected ? <p role="status" className="break-words core-body text-core-text">{formatExamDate(selected.date)} · {formatExamClock(editing?.id === selected.id ? editing.start : selected.start)}–{formatExamClock(editing?.id === selected.id ? editing.end : selected.end)} · {blockName(selected)}</p> : null}
    {weekBlocks.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="core-field-group"><span className="core-field-label">Zeitblock auswählen</span><CoreSelect className="w-full" ariaLabel="Zeitblock auswählen" value={selected?.id ?? ""} options={[{ value: "", label: "Zeitblock im Kalender wählen" }, ...weekBlocks.map((block) => ({ value: block.id, label: `${formatExamDate(block.date, "short")} · ${formatExamClock(block.start)}–${formatExamClock(block.end)} · ${blockName(block)}` }))]} onValueChange={setSelectedId} /></label>
      {selected ? <div className="flex min-w-0 items-end gap-2"><fieldset disabled={busy || unavailable(selected.date)} className="core-field-group min-w-0 flex-1"><span className="core-field-label">Fach im Zeitblock</span><CoreSelect className="w-full" ariaLabel="Fach im Zeitblock" value={selected.examId ?? ""} options={[{ value: "", label: "Ohne Fach" }, ...shown.filter((exam) => exam.status === "active" && selected.date < exam.examDate && (!exam.studyStartDate || selected.date >= exam.studyStartDate)).map((exam) => ({ value: exam.id, label: exam.name }))]} onValueChange={(id) => assign(selected.id, id || null)} /></fieldset><IconButton label="Ausgewählten Zeitblock löschen" icon={Trash2} disabled={busy || unavailable(selected.date)} onClick={() => removeBlock(selected)} /></div> : null}
    </div> : null}
    <div><ActionButton variant="secondary" icon={Plus} onClick={() => setManual(!manual)} aria-expanded={manual}>Zeitblock per Eingabe</ActionButton></div>
    {manual ? <form className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); if (unavailable(manualDate)) return; const parse = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }; if (parse(start) >= parse(end)) return; createBlock(manualDate, parse(start), parse(end)); }}><label className="core-field-group"><span className="core-field-label">Tag</span><CoreDatePicker ariaLabel="Tag für Zeitblock" value={manualDate} min={today} max={shiftExamDay(today, 365)} today={today} onValueChange={setManualDate}/></label><label className="core-field-group"><span className="core-field-label">Von</span><input className={FIELD} type="time" step={1800} min="07:00" required value={start} onChange={(event) => setStart(event.target.value)}/></label><label className="core-field-group"><span className="core-field-label">Bis</span><input className={FIELD} type="time" step={1800} required value={end} min={start} onChange={(event) => setEnd(event.target.value)}/></label><ActionButton type="submit" variant="secondary" disabled={busy || unavailable(manualDate) || start >= end}>Lernzeit blocken</ActionButton></form> : null}
  </SoftPanel>;
}
