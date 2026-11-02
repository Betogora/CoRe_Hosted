import React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, GripVertical, LayoutGrid, Maximize2, Pause, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { DASHBOARD_WIDGETS, moveDashboardWidget, readDashboardPreferences, writeDashboardPreferences, type DashboardPreferences, type DashboardWidgetId } from "../dashboardWidgets.ts";
import { getPomodoroTimerSnapshot, type PomodoroTimer } from "../pomodoroTimer.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { BrainMascot } from "../ui/BrainMascot.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { useDashboardWidgetDrag } from "./useDashboardWidgetDrag.ts";
import { useDashboardWidgetLayout } from "./useDashboardWidgetLayout.ts";
import { DashboardTaskText } from "./DashboardTaskText.tsx";
import type { ExamDashboardPreview } from "./ExamDashboardWidget.tsx";

export function DashboardWidgets({ userId, header, children, planner, onOpenPlanner, timer, onStartTimer, onPauseTimer, onResumeTimer, onResetTimer }: {
  userId: string;
  header: (action: React.ReactNode) => React.ReactNode;
  children: Partial<Record<DashboardWidgetId, React.ReactNode>>;
  planner: ((preview: ExamDashboardPreview) => React.ReactNode) | null;
  onOpenPlanner: () => void;
  timer: PomodoroTimer | null;
  onStartTimer: (minutes: number) => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onResetTimer: () => void;
}) {
  const [preferences, setPreferences] = React.useState(() => readDashboardPreferences(userId));
  const [editing, setEditing] = React.useState(false);
  const [storageError, setStorageError] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const dragHelpId = React.useId();

  function update(next: DashboardPreferences) {
    setPreferences(next);
    setStorageError(!writeDashboardPreferences(userId, next));
  }
  function move(from: DashboardWidgetId, to: DashboardWidgetId) {
    update({ ...preferences, widgets: moveDashboardWidget(preferences.widgets, from, to) });
    setAnnouncement(`${DASHBOARD_WIDGETS.find((widget) => widget.id === from)?.title} verschoben.`);
  }
  function addedWidgets(id: DashboardWidgetId, target: DashboardWidgetId | null) {
    if (preferences.widgets.some((widget) => widget.id === id)) return preferences.widgets;
    const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === id)!;
    const result = [...preferences.widgets];
    const position = target ? result.findIndex((widget) => widget.id === target) : result.length;
    result.splice(position < 0 ? result.length : position, 0, { id, width: definition.width });
    return result;
  }
  function add(id: DashboardWidgetId, target: DashboardWidgetId | null = null) {
    update({ ...preferences, widgets: addedWidgets(id, target) });
    setAnnouncement(`${DASHBOARD_WIDGETS.find((widget) => widget.id === id)?.title} hinzugefügt.`);
  }
  const drag = useDashboardWidgetDrag((from, to, adding) => { if (adding) add(from, to); else if (to) move(from, to); });
  const pendingAddition = drag.preview?.adding && drag.preview.overBoard ? drag.preview : null;
  const widgets = pendingAddition ? addedWidgets(pendingAddition.id, pendingAddition.target) : drag.preview?.target && !drag.preview.adding ? moveDashboardWidget(preferences.widgets, drag.preview.id, drag.preview.target) : preferences.widgets;
  useDashboardWidgetLayout(drag.grid, widgets.map((widget) => `${widget.id}:${widget.width}`).join(",") + (pendingAddition ? ":preview" : ":saved"), editing);

  const contents = { ...children, timer: <DashboardTimer timer={timer} onStart={onStartTimer} onPause={onPauseTimer} onResume={onResumeTimer} onReset={onResetTimer} />, todos: <DashboardTodos todos={preferences.todos} onChange={(todos) => update({ ...preferences, todos })} planner={planner} onOpenPlanner={onOpenPlanner} /> };
  return <div className="grid min-w-0 gap-6 dashboard-modules" onPointerMove={drag.move} onPointerUp={drag.finish} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} onKeyDownCapture={drag.keyDown}>
    {header(<ActionButton variant={editing ? "primary" : "secondary"} icon={editing ? Check : LayoutGrid} aria-expanded={editing} aria-controls="dashboard-customize" onClick={() => { drag.cancel(); setLibraryOpen(false); setEditing(!editing); }}>{editing ? "Fertig" : "Seite anpassen"}</ActionButton>)}
    {storageError ? <StatusMessage tone="error">Die Änderungen sind aktuell nur bis zum Neuladen verfügbar. Der Browserspeicher ist nicht erreichbar.</StatusMessage> : null}
    <p className="sr-only" role="status">{announcement}</p>
    {editing ? <section id="dashboard-customize" aria-label="Seite anpassen" className="dashboard-customize core-surface-raised rounded-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="core-body text-core-secondary">Am Griff ziehen. Die anderen Widgets machen Platz.</p><div className="flex flex-wrap gap-2"><ActionButton variant="secondary" icon={Plus} aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>Widget hinzufügen</ActionButton><button type="button" className="core-action-ghost" onClick={() => update({ ...preferences, widgets: DASHBOARD_WIDGETS.map(({ id, width }) => ({ id, width })) })}>Standardlayout</button></div></div>
      <p id={dragHelpId} className="sr-only">Mit Maus oder Touch ziehen. Escape bricht ab. Alternativ die Pfeiltasten am Griff oder die Pfeilschaltflächen verwenden.</p>
      {libraryOpen ? <div className="dashboard-widget-library mt-4" aria-label="Widgets hinzufügen">{DASHBOARD_WIDGETS.map((widget) => {
        const active = preferences.widgets.some((entry) => entry.id === widget.id);
        return <button key={widget.id} type="button" className="dashboard-widget-miniature" disabled={active} aria-label={`${widget.title} hinzufügen`} onPointerDown={(event) => drag.start(event, widget.id, true)} onClick={() => { if (!drag.consumeClick()) add(widget.id); }}>
          <WidgetMiniature id={widget.id} /><span className="flex items-center justify-between gap-2 core-caption font-semibold"><span>{widget.title}</span>{active ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}</span><span className="core-caption text-core-muted">{active ? "Auf deiner Seite" : "Ziehen oder antippen"}</span>
        </button>;
      })}</div> : null}
    </section> : null}
    {!preferences.widgets.length ? <SoftPanel className="p-6"><p className="core-body text-core-muted">Hier ist Platz für deinen Lerntag.</p><ActionButton variant="secondary" icon={Plus} className="mt-4" onClick={() => { setEditing(true); setLibraryOpen(true); }}>Widgets auswählen</ActionButton></SoftPanel> : null}
    <div ref={drag.grid} className="dashboard-widget-grid">
      {preferences.widgets.map((widget) => {
        const index = preferences.widgets.findIndex((entry) => entry.id === widget.id);
        const definition = DASHBOARD_WIDGETS.find((entry) => entry.id === widget.id)!;
        return <section key={widget.id} data-layout-order={widgets.findIndex((entry) => entry.id === widget.id)} style={{ order: widgets.findIndex((entry) => entry.id === widget.id) }} aria-label={definition.title} data-dashboard-widget={widget.id} data-width={widget.width} data-editing={editing} data-dragging={drag.preview?.id === widget.id} data-drop-target={drag.preview?.target === widget.id && drag.preview.id !== widget.id} className="dashboard-widget">
          <div className="dashboard-widget-body">{editing ? <div className="dashboard-widget-tools">
            <button type="button" aria-label={`${definition.title} verschieben`} aria-describedby={dragHelpId} className="dashboard-widget-grip core-action-ghost min-w-0 flex-1 gap-2 text-left" onPointerDown={(event) => drag.start(event, widget.id)} onKeyDown={(event) => {
              if (drag.preview) return;
              const adjacent = preferences.widgets[index + (event.key === "ArrowUp" ? -1 : 1)];
              if ((event.key === "ArrowUp" || event.key === "ArrowDown") && adjacent) { event.preventDefault(); move(widget.id, adjacent.id); }
            }}><GripVertical size={16} className="shrink-0 text-core-muted" aria-hidden="true" /><span className="min-w-0 break-words core-field-label">{definition.title}</span></button>
            <IconButton variant="ghost" icon={ArrowUp} label={`${definition.title} nach vorne`} disabled={index === 0} onClick={() => move(widget.id, preferences.widgets[index - 1].id)} />
            <IconButton variant="ghost" icon={ArrowDown} label={`${definition.title} nach hinten`} disabled={index === preferences.widgets.length - 1} onClick={() => move(widget.id, preferences.widgets[index + 1].id)} />
            <IconButton variant="ghost" icon={Maximize2} label={`${definition.title}: Größe ändern (${widget.width === "small" ? "kompakt" : widget.width === "wide" ? "breit" : "volle Breite"})`} onClick={() => update({ ...preferences, widgets: preferences.widgets.map((entry) => entry.id === widget.id ? { ...entry, width: entry.width === "small" ? "wide" : entry.width === "wide" ? "full" : "small" } : entry) })} />
            <IconButton variant="ghost" icon={X} label={`${definition.title} entfernen`} onClick={() => update({ ...preferences, widgets: preferences.widgets.filter((entry) => entry.id !== widget.id) })} />
          </div> : null}
          <div className="dashboard-widget-content">{contents[widget.id]}</div></div>
        </section>;
      })}
      {pendingAddition ? <section data-dashboard-widget={pendingAddition.id} data-layout-order={widgets.findIndex((entry) => entry.id === pendingAddition.id)} data-width={DASHBOARD_WIDGETS.find((entry) => entry.id === pendingAddition.id)!.width} className="dashboard-widget dashboard-widget-placeholder" style={{ order: widgets.findIndex((entry) => entry.id === pendingAddition.id) }} aria-hidden="true"><div className="dashboard-widget-body p-6"><WidgetMiniature id={pendingAddition.id} /><p className="core-caption">Hier platzieren</p></div></section> : null}
    </div>
    {drag.preview ? createPortal(<div ref={drag.ghost} className="dashboard-widget-drag-preview" data-testid="dashboard-widget-drag-preview" aria-hidden="true" style={{ left: drag.preview.x, top: drag.preview.y, width: drag.preview.width }}><GripVertical size={16} className="shrink-0 text-core-muted" /><div className="min-w-0"><p className="break-words core-heading-3">{DASHBOARD_WIDGETS.find((widget) => widget.id === drag.preview!.id)?.title}</p><p className="core-caption text-core-muted">{drag.preview.target && drag.preview.target !== drag.preview.id ? "Loslassen zum Platzieren" : "Auf den gewünschten Platz ziehen"}</p></div></div>, document.body) : null}
  </div>;
}

function DashboardTodos({ todos, onChange, planner, onOpenPlanner }: { todos: DashboardPreferences["todos"]; onChange: (todos: DashboardPreferences["todos"]) => void; planner: ((preview: ExamDashboardPreview) => React.ReactNode) | null; onOpenPlanner: () => void }) {
  const [text, setText] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [plannerCount, setPlannerCount] = React.useState(0);
  const listId = React.useId();
  const addButton = React.useRef<HTMLButtonElement>(null);
  const open = todos.filter((todo) => !todo.done), done = todos.filter((todo) => todo.done);
  const planned = planner ? plannerCount : 0;
  const ownLimit = Math.min(open.length, Math.max(1, 3 - planned));
  const count = open.length + planned;
  function task(todo: DashboardPreferences["todos"][number]) {
    const id = `${listId}-${todo.id}`;
    return <li key={todo.id} className="flex min-h-control min-w-0 items-center gap-2" data-own-todo={todo.id}><DashboardTaskText checkbox={<input id={id} type="checkbox" className="size-5 shrink-0 accent-[var(--core-action-primary)]" checked={todo.done} onChange={() => onChange(todos.map((entry) => entry.id === todo.id ? { ...entry, done: !entry.done } : entry))}/>}><span className={`core-body ${todo.done ? "text-core-muted line-through" : "text-core-text"}`}>{todo.text}</span></DashboardTaskText><IconButton icon={Trash2} variant="ghost" label={`Aufgabe löschen: ${todo.text}`} onClick={() => onChange(todos.filter((entry) => entry.id !== todo.id))} /></li>;
  }
  return <SoftPanel className="dashboard-todos min-w-0 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">To-dos{count ? <span className="ml-2 inline-flex min-h-5 items-center rounded-round bg-core-subtle px-2 align-middle core-caption font-semibold tabular-nums text-core-secondary">{count} offen</span> : null}</h2><IconButton icon={ArrowUpRight} variant="ghost" label="Planer öffnen" onClick={onOpenPlanner} /></div>
    <div id={listId}>
    {open.length ? <ul className="mt-3 grid gap-1">{(showAll ? open : open.slice(0, ownLimit)).map(task)}</ul> : null}
    <div className="mt-2"><IconButton ref={addButton} icon={Plus} variant="ghost" label="Eigene Aufgabe hinzufügen" aria-expanded={adding} onClick={() => setAdding(!adding)} /></div>
    {adding ? <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!text.trim() || todos.length >= 500) return; onChange([...todos, { id: crypto.randomUUID(), text: text.trim(), done: false }]); setText(""); setAdding(false); addButton.current?.focus(); }}>
      <input autoFocus className="core-field min-w-0 flex-1" aria-label="Eigene Aufgabe" placeholder="Was hast du dir vorgenommen?" maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
      <IconButton icon={Plus} label="Aufgabe hinzufügen" type="submit" disabled={!text.trim() || todos.length >= 500} />
    </form> : null}
    {done.length ? <details className="dashboard-disclosure mt-3"><summary>Erledigt ({done.length})</summary><ul className="grid gap-1">{done.map(task)}</ul></details> : null}
    {planner?.({ taskLimit: showAll ? null : 3 - ownLimit, onOpenTaskCountChange: setPlannerCount })}
    </div>
    {count > 3 || showAll ? <button type="button" className="core-action-ghost mt-2" aria-controls={listId} aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Weniger anzeigen" : `Alle ${count} Aufgaben anzeigen`}</button> : null}
  </SoftPanel>;
}

function WidgetMiniature({ id }: { id: DashboardWidgetId }) {
  if (id === "motivation") return <div className="dashboard-mini-content dashboard-mini-motivation" aria-hidden="true"><div className="mx-auto w-16"><BrainMascot id="pastell-lernen" /></div></div>;
  return <div className={`dashboard-mini-content dashboard-mini-${id}`} aria-hidden="true">
    {id === "timer" ? <><span className="text-3xl tabular-nums">25:00</span><span className="dashboard-mini-line" /></> : id === "heatmap" ? <div className="dashboard-mini-cells">{Array.from({ length: 35 }, (_, i) => <i key={i} style={{ opacity: .2 + (i % 5) * .18 }} />)}</div> : id === "learning" ? <><div className="dashboard-mini-bar"><i /><i /><i /><i /></div><div className="flex justify-between"><Check size={14} /><span>Neu</span><span>Offen</span></div></> : <>{[0, 1, 2].map((i) => <div className="flex items-center gap-2" key={i}>{id === "todos" ? <span className="size-3 rounded border border-core-border" /> : <LayoutGrid size={14} />}<span className="dashboard-mini-line" /></div>)}</>}
  </div>;
}

function DashboardTimer({ timer, onStart, onPause, onResume, onReset }: { timer: PomodoroTimer | null; onStart: (minutes: number) => void; onPause: () => void; onResume: () => void; onReset: () => void }) {
  const [duration, setDuration] = React.useState({ minutes: "25", seconds: "00" });
  const [edited, setEdited] = React.useState(false);
  const [clock, setClock] = React.useState(Date.now);
  React.useEffect(() => {
    setClock(Date.now()); setEdited(false);
    if (timer) {
      const initialSeconds = Math.round(timer.durationMinutes * 60);
      setDuration({ minutes: String(Math.floor(initialSeconds / 60)).padStart(2, "0"), seconds: String(initialSeconds % 60).padStart(2, "0") });
    }
    if (!timer || timer.pausedAt !== undefined) return;
    const interval = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer]);
  const snapshot = getPomodoroTimerSnapshot(timer, clock);
  const remaining = Math.ceil(snapshot.remainingMilliseconds / 1000);
  const paused = timer?.pausedAt !== undefined;
  const digits = timer && remaining > 0 && !edited ? { minutes: String(Math.floor(remaining / 60)).padStart(2, "0"), seconds: String(remaining % 60).padStart(2, "0") } : duration;
  const total = Number(digits.minutes) * 60 + Number(digits.seconds);
  function change(part: "minutes" | "seconds", value: string) {
    if (!/^\d{0,3}$/.test(value)) return;
    setDuration({ ...digits, [part]: value === "" ? "" : String(Math.min(part === "minutes" ? 999 : 59, Number(value))).padStart(2, "0") });
    setEdited(true);
  }
  const dial = React.useRef<HTMLDivElement>(null);
  const scroll = React.useRef({ part: "", delta: 0, at: 0 });
  const scrollDigit = React.useEffectEvent((part: "minutes" | "seconds", steps: number) => change(part, String(Math.max(0, Math.min(part === "minutes" ? 999 : 59, Number(digits[part]) - steps)))));
  React.useEffect(() => {
    const element = dial.current;
    if (!element || snapshot.running) return;
    function wheel(event: WheelEvent) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      const part = input.dataset.part as "minutes" | "seconds";
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const previous = scroll.current;
      if (previous.part !== part || event.timeStamp - previous.at > 200 || Math.sign(previous.delta) !== Math.sign(delta)) previous.delta = 0;
      previous.part = part; previous.at = event.timeStamp;
      previous.delta += delta;
      const steps = Math.trunc(previous.delta / 40);
      if (steps) { previous.delta -= steps * 40; scrollDigit(part, steps); }
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [snapshot.running]);
  const progress = timer && !edited ? snapshot.progress : 1;
  return <SoftPanel className="dashboard-timer flex flex-col p-5 sm:p-6">
    <h2 className="core-heading-3 font-semibold text-core-text">Lerntimer</h2>
    <div className="dashboard-timer-clock my-4">
    <svg className="dashboard-timer-ring" viewBox="0 0 200 200" aria-hidden="true"><circle className="dashboard-timer-track" cx="100" cy="100" r="94" /><circle data-testid="timer-countdown-ring" className="dashboard-timer-remaining" cx="100" cy="100" r="94" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} /></svg>
    <div ref={dial} className="dashboard-timer-dial" role="group" aria-label="Timerdauer" onPointerLeave={() => { scroll.current.delta = 0; }}>
      {(["minutes", "seconds"] as const).map((part, index) => <React.Fragment key={part}>{index ? <span aria-hidden="true">:</span> : null}<input aria-label={part === "minutes" ? "Minuten" : "Sekunden"} data-part={part} type="text" inputMode="numeric" role="spinbutton" aria-valuemin={0} aria-valuemax={part === "minutes" ? 999 : 59} aria-valuenow={Number(digits[part])} readOnly={snapshot.running} value={digits[part]} onFocus={(event) => { if (!snapshot.running) event.target.select(); }} onChange={(event) => change(part, event.target.value)} onBlur={() => { if (!snapshot.running && !digits[part]) change(part, "00"); }} onKeyDown={(event) => { if (!snapshot.running && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); change(part, String(Math.max(0, Math.min(part === "minutes" ? 999 : 59, Number(digits[part]) + (event.key === "ArrowUp" ? 1 : -1))))); } }} /></React.Fragment>)}
    </div>
    </div>
    <p className="mb-4 text-center core-caption text-core-muted">{snapshot.running ? "Deine Zeit läuft" : paused && !edited ? "Pausiert" : "Über den Ziffern scrollen oder Zeit eintippen"}</p>
    <div className="dashboard-timer-actions"><ActionButton variant="primary" icon={Play} disabled={snapshot.running || total <= 0} onClick={() => { setClock(Date.now()); if (paused && !edited) onResume(); else onStart(total / 60); }}>Start</ActionButton><ActionButton variant="secondary" icon={Pause} disabled={!snapshot.running} onClick={onPause}>Pause</ActionButton><IconButton icon={RotateCcw} variant="ghost" label="Timer zurücksetzen" disabled={!timer} onClick={() => {
      if (!timer) return;
      const initialSeconds = Math.round(timer.durationMinutes * 60);
      setDuration({ minutes: String(Math.floor(initialSeconds / 60)).padStart(2, "0"), seconds: String(initialSeconds % 60).padStart(2, "0") });
      setEdited(false); onReset();
    }} /></div>
  </SoftPanel>;
}
