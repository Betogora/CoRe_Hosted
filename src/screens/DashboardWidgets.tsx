import React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, GripVertical, LayoutGrid, Maximize2, Plus, Timer, Trash2, X } from "lucide-react";
import { DASHBOARD_WIDGETS, moveDashboardWidget, readDashboardPreferences, writeDashboardPreferences, type DashboardPreferences, type DashboardWidgetId } from "../dashboardWidgets.ts";
import { getPomodoroTimerSnapshot, type PomodoroTimer } from "../pomodoroTimer.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { useDashboardWidgetDrag } from "./useDashboardWidgetDrag.ts";

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

  const contents = { ...children, timer: <DashboardTimer timer={timer} onStart={onStartTimer} />, todos: <DashboardTodos todos={preferences.todos} onChange={(todos) => update({ ...preferences, todos })} planner={planner} onOpenPlanner={onOpenPlanner} /> };
  return <div className="grid min-w-0 gap-6 dashboard-modules">
    {header(<ActionButton variant={editing ? "primary" : "secondary"} icon={editing ? Check : LayoutGrid} aria-expanded={editing} aria-controls="dashboard-customize" onClick={() => { drag.cancel(); setEditing(!editing); }}>{editing ? "Fertig" : "Seite anpassen"}</ActionButton>)}
    {storageError ? <StatusMessage tone="error">Die Änderungen sind aktuell nur bis zum Neuladen verfügbar. Der Browserspeicher ist nicht erreichbar.</StatusMessage> : null}
    <p className="sr-only" role="status">{announcement}</p>
    {editing ? <section id="dashboard-customize" aria-label="Seite anpassen" className="dashboard-customize core-surface-raised rounded-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="core-heading-3 font-semibold text-core-text">Dein Tag. Dein Überblick.</h2><p className="mt-1 core-body text-core-secondary">Ziehe ein Widget an seiner Titelleiste auf einen anderen Platz. Loslassen übernimmt die Reihenfolge.</p><p id={dragHelpId} className="sr-only">Mit Maus oder Touch ziehen. Escape bricht ab. Alternativ die Pfeilschaltflächen oder am Griff die Pfeiltasten verwenden.</p></div><ActionButton variant="secondary" onClick={() => update({ ...preferences, widgets: DASHBOARD_WIDGETS.map(({ id, width }) => ({ id, width })) })}>Standardlayout</ActionButton></div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-core-border pt-4" aria-label="Widgets hinzufügen">{DASHBOARD_WIDGETS.map((widget) => {
        const active = preferences.widgets.some((entry) => entry.id === widget.id);
        return <ActionButton key={widget.id} variant="secondary" icon={active ? Check : Plus} disabled={active} onClick={() => update({ ...preferences, widgets: [...preferences.widgets, { id: widget.id, width: widget.width }] })}>{widget.title}</ActionButton>;
      })}</div>
    </section> : null}
    {!preferences.widgets.length ? <SoftPanel className="p-6"><p className="core-body text-core-muted">Hier ist Platz für deinen Lerntag.</p><ActionButton variant="secondary" icon={Plus} className="mt-4" onClick={() => setEditing(true)}>Widgets auswählen</ActionButton></SoftPanel> : null}
    <div ref={drag.grid} className="dashboard-widget-grid" onPointerMove={drag.move} onPointerUp={drag.finish} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} onKeyDownCapture={drag.keyDown}>
      {preferences.widgets.map((widget, index) => {
        const definition = DASHBOARD_WIDGETS.find((entry) => entry.id === widget.id)!;
        return <section key={widget.id} aria-label={definition.title} data-dashboard-widget={widget.id} data-width={widget.width} data-editing={editing} data-dragging={drag.preview?.id === widget.id} data-drop-target={drag.preview?.target === widget.id && drag.preview.id !== widget.id} className="dashboard-widget">
          {editing ? <div className="dashboard-widget-tools">
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
          <div className="dashboard-widget-content">{contents[widget.id]}</div>
        </section>;
      })}
    </div>
    {drag.preview ? createPortal(<div ref={drag.ghost} className="dashboard-widget-drag-preview" data-testid="dashboard-widget-drag-preview" aria-hidden="true" style={{ left: drag.preview.x, top: drag.preview.y, width: drag.preview.width }}><GripVertical size={16} className="shrink-0 text-core-muted" /><div className="min-w-0"><p className="break-words core-heading-3">{DASHBOARD_WIDGETS.find((widget) => widget.id === drag.preview!.id)?.title}</p><p className="core-caption text-core-muted">{drag.preview.target && drag.preview.target !== drag.preview.id ? "Loslassen zum Platzieren" : "Auf den gewünschten Platz ziehen"}</p></div></div>, document.body) : null}
  </div>;
}

function DashboardTodos({ todos, onChange, planner, onOpenPlanner }: { todos: DashboardPreferences["todos"]; onChange: (todos: DashboardPreferences["todos"]) => void; planner: React.ReactNode; onOpenPlanner: () => void }) {
  const [text, setText] = React.useState("");
  return <SoftPanel className="dashboard-todos h-full min-w-0 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">To-dos</h2><span className="inline-flex min-h-5 shrink-0 items-center rounded-round bg-core-subtle px-2 core-caption font-semibold tabular-nums text-core-secondary">{todos.filter((todo) => !todo.done).length} eigene offen</span></div>
    <p className="mt-1 core-body text-core-secondary">Kleine Schritte für deinen Lerntag.</p>
    <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!text.trim() || todos.length >= 500) return; onChange([...todos, { id: crypto.randomUUID(), text: text.trim(), done: false }]); setText(""); }}>
      <input className="core-field min-w-0 flex-1" aria-label="Eigene Aufgabe" placeholder="Was hast du dir vorgenommen?" maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
      <IconButton icon={Plus} label="Aufgabe hinzufügen" type="submit" disabled={!text.trim() || todos.length >= 500} />
    </form>
    {todos.length ? <ul className="mt-3 grid gap-1">{todos.map((todo) => <li key={todo.id} className="group flex min-w-0 items-center gap-2 rounded-control pl-2 transition hover:bg-core-subtle"><label className="flex min-h-control min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" className="size-5 shrink-0 accent-[var(--core-action)]" checked={todo.done} onChange={() => onChange(todos.map((entry) => entry.id === todo.id ? { ...entry, done: !entry.done } : entry))}/><span className={`break-words core-body ${todo.done ? "text-core-muted line-through" : "text-core-text"}`}>{todo.text}</span></label><IconButton icon={Trash2} variant="ghost" label={`Aufgabe löschen: ${todo.text}`} onClick={() => onChange(todos.filter((entry) => entry.id !== todo.id))} /></li>)}</ul> : <p className="my-4 core-body text-core-muted">Noch nichts notiert. Ein guter Anfang passt in eine Zeile.</p>}
    <div className="mt-5 border-t border-core-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="core-caption font-medium text-core-muted">Aus dem Planer</h3><ActionButton variant="secondary" onClick={onOpenPlanner}>Planer öffnen</ActionButton></div>{planner ?? <p className="mt-3 core-body text-core-muted">Sobald du eine Prüfung planst, findest du ihre Tagesaufgaben auch hier.</p>}</div>
  </SoftPanel>;
}

function DashboardTimer({ timer, onStart }: { timer: PomodoroTimer | null; onStart: (minutes: number) => void }) {
  const [minutes, setMinutes] = React.useState("25");
  const [clock, setClock] = React.useState(Date.now);
  React.useEffect(() => { if (!timer) return; const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, [timer]);
  const snapshot = getPomodoroTimerSnapshot(timer, clock);
  const seconds = snapshot.running ? Math.ceil(snapshot.remainingMilliseconds / 1000) : Number(minutes) * 60;
  const display = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <SoftPanel className="dashboard-timer flex h-full flex-col p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">Lerntimer</h2><Timer size={18} className="text-core-muted" aria-hidden="true" /></div>
    <p className="mt-1 core-body text-core-secondary">Ein Moment. Eine Sache. Dein Fokus.</p>
    <div className="my-6 text-center"><p className="dashboard-timer-digits text-core-text" role="timer" aria-label={`Verbleibende Zeit: ${display}`}>{display}</p><p className="mt-2 core-caption font-medium text-core-muted">{snapshot.running ? "Deine Zeit läuft" : minutes === "5" ? "Kurz durchatmen" : "Bereit, wenn du es bist"}</p></div>
    <CoreSegmentedControl ariaLabel="Lerntimer Dauer" className="w-full" value={minutes} options={[{ value: "25", label: "25 Min." }, { value: "45", label: "45 Min." }, { value: "5", label: "5 Min. Pause" }]} onValueChange={setMinutes} />
    <ActionButton variant="primary" icon={Timer} className="mt-3 w-full" onClick={() => { setClock(Date.now()); onStart(Number(minutes)); }}>{snapshot.running ? "Neu starten" : minutes === "5" ? "Pause starten" : "Fokus starten"}</ActionButton>
  </SoftPanel>;
}
