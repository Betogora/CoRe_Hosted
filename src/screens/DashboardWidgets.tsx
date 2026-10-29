import React from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, Check, GripVertical, LayoutGrid, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { DASHBOARD_WIDGETS, moveDashboardWidget, readDashboardPreferences, writeDashboardPreferences, type DashboardPreferences, type DashboardWidgetId } from "../dashboardWidgets.ts";
import { getPomodoroTimerSnapshot, type PomodoroTimer } from "../pomodoroTimer.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { useDashboardWidgetDrag } from "./useDashboardWidgetDrag.ts";
import { useDashboardWidgetLayout } from "./useDashboardWidgetLayout.ts";

export function DashboardWidgets({ userId, header, children, planner, onOpenPlanner, timer, onStartTimer }: {
  userId: string;
  header: (action: React.ReactNode) => React.ReactNode;
  children: Partial<Record<DashboardWidgetId, React.ReactNode>>;
  planner: React.ReactNode;
  onOpenPlanner: () => void;
  timer: PomodoroTimer | null;
  onStartTimer: (minutes: number) => void;
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
  const drag = useDashboardWidgetDrag(move);
  const widgets = drag.preview?.target ? moveDashboardWidget(preferences.widgets, drag.preview.id, drag.preview.target) : preferences.widgets;
  useDashboardWidgetLayout(drag.grid, widgets.map((widget) => `${widget.id}:${widget.width}`).join(","), editing);

  const contents = { ...children, timer: <DashboardTimer timer={timer} onStart={onStartTimer} />, todos: <DashboardTodos todos={preferences.todos} onChange={(todos) => update({ ...preferences, todos })} planner={planner} onOpenPlanner={onOpenPlanner} /> };
  return <div className="grid min-w-0 gap-6 dashboard-modules">
    {header(<ActionButton variant={editing ? "primary" : "secondary"} icon={editing ? Check : LayoutGrid} aria-expanded={editing} aria-controls="dashboard-customize" onClick={() => { drag.cancel(); setLibraryOpen(false); setEditing(!editing); }}>{editing ? "Fertig" : "Seite anpassen"}</ActionButton>)}
    {storageError ? <StatusMessage tone="error">Die Änderungen sind aktuell nur bis zum Neuladen verfügbar. Der Browserspeicher ist nicht erreichbar.</StatusMessage> : null}
    <p className="sr-only" role="status">{announcement}</p>
    {editing ? <section id="dashboard-customize" aria-label="Seite anpassen" className="dashboard-customize">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="core-body text-core-muted">Am Griff ziehen. Die anderen Widgets machen Platz.</p><div className="flex flex-wrap gap-2"><ActionButton variant="secondary" icon={Plus} aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>Widget hinzufügen</ActionButton><button type="button" className="core-action-ghost" onClick={() => update({ ...preferences, widgets: DASHBOARD_WIDGETS.map(({ id, width }) => ({ id, width })) })}>Standardlayout</button></div></div>
      <p id={dragHelpId} className="sr-only">Mit Maus oder Touch ziehen. Escape bricht ab. Alternativ die Pfeiltasten am Griff oder die Pfeilschaltflächen unter Widgetoptionen verwenden.</p>
      {libraryOpen ? <div className="mt-4 flex flex-wrap gap-2 rounded-panel border border-core-border p-4" aria-label="Widgets hinzufügen">{DASHBOARD_WIDGETS.map((widget) => {
        const active = preferences.widgets.some((entry) => entry.id === widget.id);
        return <ActionButton key={widget.id} variant="secondary" icon={active ? Check : Plus} disabled={active} onClick={() => update({ ...preferences, widgets: [...preferences.widgets, { id: widget.id, width: widget.width }] })}>{widget.title}</ActionButton>;
      })}</div> : null}
    </section> : null}
    {!preferences.widgets.length ? <SoftPanel className="p-6"><p className="core-body text-core-muted">Hier ist Platz für deinen Lerntag.</p><ActionButton variant="secondary" icon={Plus} className="mt-4" onClick={() => setEditing(true)}>Widgets auswählen</ActionButton></SoftPanel> : null}
    <div ref={drag.grid} className="dashboard-widget-grid" onPointerMove={drag.move} onPointerUp={drag.finish} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} onKeyDownCapture={drag.keyDown}>
      {preferences.widgets.map((widget) => {
        const index = preferences.widgets.findIndex((entry) => entry.id === widget.id);
        const definition = DASHBOARD_WIDGETS.find((entry) => entry.id === widget.id)!;
        return <section key={widget.id} style={{ order: widgets.findIndex((entry) => entry.id === widget.id) }} aria-label={definition.title} data-dashboard-widget={widget.id} data-width={widget.width} data-editing={editing} data-dragging={drag.preview?.id === widget.id} data-drop-target={drag.preview?.target === widget.id && drag.preview.id !== widget.id} className="dashboard-widget">
          <div className="dashboard-widget-body">{editing ? <div className="dashboard-widget-tools">
            <button type="button" aria-label={`${definition.title} verschieben`} aria-describedby={dragHelpId} className="dashboard-widget-grip core-action-ghost min-w-0 flex-1 gap-2 text-left" onPointerDown={(event) => drag.start(event, widget.id)} onKeyDown={(event) => {
              if (drag.preview) return;
              const adjacent = preferences.widgets[index + (event.key === "ArrowUp" ? -1 : 1)];
              if ((event.key === "ArrowUp" || event.key === "ArrowDown") && adjacent) { event.preventDefault(); move(widget.id, adjacent.id); }
            }}><GripVertical size={20} className="shrink-0" aria-hidden="true" /><span className="min-w-0 break-words core-caption font-semibold text-core-text">{definition.title}</span></button>
            <Popover.Root><Popover.Trigger asChild><IconButton variant="ghost" icon={MoreHorizontal} label={`${definition.title}: Widgetoptionen`} /></Popover.Trigger><Popover.Portal><Popover.Content aria-label={`${definition.title}: Widgetoptionen`} align="end" sideOffset={8} collisionPadding={16} className="core-overlay z-[60] grid w-64 max-w-[calc(100vw-2rem)] gap-3 rounded-panel border border-core-border bg-core-surface p-4 shadow-raised">
              <p className="core-caption font-semibold text-core-muted">Größe</p><CoreSegmentedControl ariaLabel={`${definition.title}: Größe`} value={widget.width} options={[{ value: "small", label: "Klein" }, { value: "wide", label: "Breit" }, { value: "full", label: "Voll" }]} onValueChange={(width) => update({ ...preferences, widgets: preferences.widgets.map((entry) => entry.id === widget.id ? { ...entry, width: width as typeof widget.width } : entry) })} />
              <div className="flex gap-2"><IconButton variant="ghost" icon={ArrowUp} label={`${definition.title} nach vorne`} disabled={index === 0} onClick={() => move(widget.id, preferences.widgets[index - 1].id)} /><IconButton variant="ghost" icon={ArrowDown} label={`${definition.title} nach hinten`} disabled={index === preferences.widgets.length - 1} onClick={() => move(widget.id, preferences.widgets[index + 1].id)} /></div>
              <Popover.Close asChild><button type="button" className="core-action-ghost" onClick={() => update({ ...preferences, widgets: preferences.widgets.filter((entry) => entry.id !== widget.id) })}><X size={18} aria-hidden="true" />{definition.title} entfernen</button></Popover.Close>
            </Popover.Content></Popover.Portal></Popover.Root>
          </div> : null}
          <div className="dashboard-widget-content">{contents[widget.id]}</div></div>
        </section>;
      })}
    </div>
    {drag.preview ? createPortal(<div ref={drag.ghost} className="dashboard-widget-drag-preview" data-testid="dashboard-widget-drag-preview" aria-hidden="true" style={{ left: drag.preview.x, top: drag.preview.y, width: drag.preview.width }}><GripVertical size={20} className="shrink-0" /><div className="min-w-0"><p className="break-words core-body font-semibold">{DASHBOARD_WIDGETS.find((widget) => widget.id === drag.preview!.id)?.title}</p><p className="core-caption text-core-muted">{drag.preview.target && drag.preview.target !== drag.preview.id ? "Loslassen zum Platzieren" : "Auf den gewünschten Platz ziehen"}</p></div></div>, document.body) : null}
  </div>;
}

function DashboardTodos({ todos, onChange, planner, onOpenPlanner }: { todos: DashboardPreferences["todos"]; onChange: (todos: DashboardPreferences["todos"]) => void; planner: React.ReactNode; onOpenPlanner: () => void }) {
  const [text, setText] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const addButton = React.useRef<HTMLButtonElement>(null);
  const open = todos.filter((todo) => !todo.done), done = todos.filter((todo) => todo.done);
  function task(todo: DashboardPreferences["todos"][number]) {
    return <li key={todo.id} className="group flex min-w-0 items-center gap-2"><label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" className="size-5 shrink-0 accent-[var(--core-action)]" checked={todo.done} onChange={() => onChange(todos.map((entry) => entry.id === todo.id ? { ...entry, done: !entry.done } : entry))}/><span className={`break-words core-body ${todo.done ? "text-core-muted line-through" : "text-core-text"}`}>{todo.text}</span></label><IconButton icon={Trash2} variant="ghost" label={`Aufgabe löschen: ${todo.text}`} onClick={() => onChange(todos.filter((entry) => entry.id !== todo.id))} /></li>;
  }
  return <SoftPanel className="dashboard-todos min-w-0 p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">To-dos{open.length ? <span className="ml-2 core-caption font-normal text-core-muted">{open.length} offen</span> : null}</h2><IconButton ref={addButton} icon={Plus} variant="ghost" label="Eigene Aufgabe hinzufügen" aria-expanded={adding} onClick={() => setAdding(!adding)} /></div>
    {adding ? <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!text.trim() || todos.length >= 500) return; onChange([...todos, { id: crypto.randomUUID(), text: text.trim(), done: false }]); setText(""); setAdding(false); addButton.current?.focus(); }}>
      <input autoFocus className="core-field min-w-0 flex-1" aria-label="Eigene Aufgabe" placeholder="Was hast du dir vorgenommen?" maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
      <IconButton icon={Plus} label="Aufgabe hinzufügen" type="submit" disabled={!text.trim() || todos.length >= 500} />
    </form> : null}
    {open.length ? <ul className="mt-3 grid gap-1">{(showAll ? open : open.slice(0, 3)).map(task)}</ul> : <p className="my-4 core-body text-core-muted">Keine eigenen Aufgaben offen.</p>}
    {open.length > 3 ? <button type="button" className="core-action-ghost mt-2" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Weniger anzeigen" : `Alle ${open.length} Aufgaben anzeigen`}</button> : null}
    {done.length ? <details className="dashboard-disclosure mt-3"><summary>Erledigt ({done.length})</summary><ul className="grid gap-1">{done.map(task)}</ul></details> : null}
    {planner ? <div className="mt-5 border-t border-core-border pt-4">{planner}</div> : null}
    <button type="button" className="core-action-ghost mt-3" onClick={onOpenPlanner}>Planer öffnen</button>
  </SoftPanel>;
}

function DashboardTimer({ timer, onStart }: { timer: PomodoroTimer | null; onStart: (minutes: number) => void }) {
  const [minutes, setMinutes] = React.useState("25");
  const [clock, setClock] = React.useState(Date.now);
  React.useEffect(() => { if (!timer) return; const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, [timer]);
  const snapshot = getPomodoroTimerSnapshot(timer, clock);
  const seconds = snapshot.running ? Math.ceil(snapshot.remainingMilliseconds / 1000) : Number(minutes) * 60;
  const display = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <SoftPanel className="dashboard-timer flex flex-col p-6">
    <h2 className="core-heading-3 font-semibold text-core-text">Lerntimer</h2>
    <div className="my-5 text-center"><p className="dashboard-timer-digits text-core-text" role="timer" aria-label={`Verbleibende Zeit: ${display}`}>{display}</p>{snapshot.running ? <p className="mt-2 core-caption text-core-muted">Deine Zeit läuft</p> : null}</div>
    <details className="dashboard-disclosure text-center"><summary>{minutes === "5" ? "5 Min. Pause" : `${minutes} Min. Fokus`} · Dauer ändern</summary><CoreSegmentedControl ariaLabel="Lerntimer Dauer" className="mt-3 w-full" value={minutes} options={[{ value: "25", label: "25 Min." }, { value: "45", label: "45 Min." }, { value: "5", label: "5 Min. Pause" }]} onValueChange={setMinutes} /></details>
    <ActionButton variant="primary" className="mt-4 w-full" onClick={() => { setClock(Date.now()); onStart(Number(minutes)); }}>{snapshot.running ? "Neu starten" : minutes === "5" ? "Pause starten" : "Fokus starten"}</ActionButton>
  </SoftPanel>;
}
