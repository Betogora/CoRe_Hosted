import React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronUp, CornerDownLeft, GripVertical, LayoutGrid, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { DASHBOARD_WIDGETS, moveDashboardWidget, readDashboardPreferences, writeDashboardPreferences, type DashboardPreferences, type DashboardWidgetId } from "../dashboardWidgets.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { SectionHeader } from "../ui/SectionHeader.tsx";
import { CoreCheckbox } from "../ui/formControls.tsx";
import { BrainMascot } from "../ui/BrainMascot.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import { useHeatmapHistoryColor } from "../ui/StudyHeatmap.tsx";
import { StudyTimerTile, useStudyTimerColor } from "../ui/pomodoroTimerUi.tsx";
import { useDashboardWidgetDrag } from "./useDashboardWidgetDrag.ts";
import { useDashboardWidgetLayout } from "./useDashboardWidgetLayout.ts";
import { DashboardTaskText } from "./DashboardTaskText.tsx";

export function DashboardWidgets({ userId, header, children, planner, onOpenPlanner, timer, onStartTimer, onPauseTimer, onResumeTimer, onResetTimer }: {
  userId: string;
  header: (action: React.ReactNode) => React.ReactNode;
  children: Partial<Record<DashboardWidgetId, React.ReactNode>>;
  planner: React.ReactNode;
  onOpenPlanner: () => void;
  timer: PomodoroTimer | null;
  onStartTimer: (minutes: number) => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onResetTimer: () => void;
}) {
  const [preferences, setPreferences] = React.useState(() => readDashboardPreferences(userId));
  const [editing, setEditing] = React.useState(false);
  const [heatmapColor, setHeatmapColor] = useHeatmapHistoryColor();
  const [timerColor, setTimerColor] = useStudyTimerColor();
  const [storageError, setStorageError] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [libraryExpanded, setLibraryExpanded] = React.useState(false);
  const [libraryColumns, setLibraryColumns] = React.useState<number>(DASHBOARD_WIDGETS.length);
  const library = React.useRef<HTMLDivElement>(null);
  const toggle = React.useRef<HTMLButtonElement>(null);
  const refocusToggle = React.useRef(false);
  const dragHelpId = React.useId();
  const libraryId = React.useId();

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
    const result = [...preferences.widgets];
    const position = target ? result.findIndex((widget) => widget.id === target) : result.length;
    result.splice(position < 0 ? result.length : position, 0, { id });
    return result;
  }
  function add(id: DashboardWidgetId, target: DashboardWidgetId | null = null) {
    update({ ...preferences, widgets: addedWidgets(id, target) });
    setAnnouncement(`${DASHBOARD_WIDGETS.find((widget) => widget.id === id)?.title} hinzugefügt.`);
  }
  function remove(id: DashboardWidgetId) {
    update({ ...preferences, widgets: preferences.widgets.filter((entry) => entry.id !== id) });
    setAnnouncement(`${DASHBOARD_WIDGETS.find((widget) => widget.id === id)?.title} entfernt.`);
  }
  const drag = useDashboardWidgetDrag((from, to, adding) => { if (adding) add(from, to); else if (to) move(from, to); });
  const pendingAddition = drag.preview?.adding && drag.preview.overBoard ? drag.preview : null;
  const widgets = pendingAddition ? addedWidgets(pendingAddition.id, pendingAddition.target) : drag.preview?.target && !drag.preview.adding ? moveDashboardWidget(preferences.widgets, drag.preview.id, drag.preview.target) : preferences.widgets;
  useDashboardWidgetLayout(drag.grid, widgets.map((widget) => widget.id).join(",") + (pendingAddition ? ":preview" : ":saved"));
  function toggleEditing() {
    drag.cancel();
    refocusToggle.current = true;
    setEditing(!editing);
  }
  // The edit toggle and its done button are different elements; keep keyboard focus on whichever replaces the other.
  React.useEffect(() => {
    if (refocusToggle.current) toggle.current?.focus({ preventScroll: true });
    refocusToggle.current = false;
  }, [editing]);
  React.useLayoutEffect(() => {
    const element = library.current;
    if (!element) return;
    const measure = () => setLibraryColumns(getComputedStyle(element).gridTemplateColumns.split(" ").length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [editing]);
  const libraryOverflows = DASHBOARD_WIDGETS.length > libraryColumns;

  const libraryToggle = (placement: "header" | "below") => libraryOverflows || libraryExpanded ? <button type="button" className="dashboard-widget-library-more" data-placement={placement} aria-expanded={libraryExpanded} aria-controls={libraryId} onClick={() => setLibraryExpanded(!libraryExpanded)}>{libraryExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}<span>{libraryExpanded ? "Weniger Widgets" : "Weitere Widgets"}</span></button> : null;
  const contents = { ...children, timer: <StudyTimerTile timer={timer} onStart={onStartTimer} onPause={onPauseTimer} onResume={onResumeTimer} onReset={onResetTimer} />, todos: <DashboardTodos todos={preferences.todos} onChange={(todos) => update({ ...preferences, todos })} planner={planner} onOpenPlanner={onOpenPlanner} /> };
  return <div className="grid min-w-0 gap-4 dashboard-modules" onPointerMove={drag.move} onPointerUp={drag.finish} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} onKeyDownCapture={drag.keyDown}>
    {header(editing
      ? <ActionButton ref={toggle} variant="primary" icon={Check} aria-expanded aria-controls="dashboard-customize" onClick={toggleEditing}>Fertig</ActionButton>
      : <CoreTooltip label="Seite bearbeiten"><IconButton ref={toggle} variant="ghost" icon={Pencil} label="Seite bearbeiten" aria-expanded={false} aria-controls="dashboard-customize" onClick={toggleEditing} /></CoreTooltip>)}
    {storageError ? <StatusMessage tone="error">Die Änderungen sind aktuell nur bis zum Neuladen verfügbar. Der Browserspeicher ist nicht erreichbar.</StatusMessage> : null}
    <p className="sr-only" role="status">{announcement}</p>
    {editing ? <section id="dashboard-customize" aria-label="Widgets" className="dashboard-customize core-surface-raised rounded-panel p-5 sm:p-6">
      <SectionHeader level={2} title="Widgets" action={<div className="dashboard-customize-actions">{libraryToggle("header")}<CoreTooltip label="Standardlayout"><IconButton variant="ghost" icon={RotateCcw} label="Standardlayout" onClick={() => update({ ...preferences, widgets: DASHBOARD_WIDGETS.map(({ id }) => ({ id })) })} /></CoreTooltip></div>} />
      <p id={dragHelpId} className="sr-only">Mit Maus oder Touch ziehen. Escape bricht ab. Alternativ die Pfeiltasten am Griff oder die Pfeilschaltflächen verwenden.</p>
      <div className="mt-4"><div ref={library} id={libraryId} role="group" aria-label="Widgets auswählen" className="dashboard-widget-library">{(libraryExpanded ? DASHBOARD_WIDGETS : DASHBOARD_WIDGETS.slice(0, libraryColumns)).map((widget) => {
        const active = preferences.widgets.some((entry) => entry.id === widget.id);
        return <button key={widget.id} type="button" className="dashboard-widget-miniature" aria-pressed={active} aria-label={widget.title} onPointerDown={active ? undefined : (event) => drag.start(event, widget.id, true)} onClick={() => { if (drag.consumeClick()) return; if (active) remove(widget.id); else add(widget.id); }}>
          <WidgetMiniature id={widget.id} /><span className="flex items-center justify-between gap-2 core-caption font-semibold"><span className="min-w-0 hyphens-auto [overflow-wrap:anywhere]">{widget.title}</span>{active ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}</span>
        </button>;
      })}</div>
      {libraryToggle("below")}</div>
    </section> : null}
    {!preferences.widgets.length ? <SoftPanel className="p-6"><SectionHeader level={2} title="Keine Widgets" action={<ActionButton variant="secondary" icon={Plus} onClick={() => setEditing(true)}>Widgets auswählen</ActionButton>} /></SoftPanel> : null}
    <div ref={drag.grid} className="dashboard-widget-grid">
      {preferences.widgets.map((widget) => {
        const index = preferences.widgets.findIndex((entry) => entry.id === widget.id);
        const definition = DASHBOARD_WIDGETS.find((entry) => entry.id === widget.id)!;
        return <section key={widget.id} style={{ order: widgets.findIndex((entry) => entry.id === widget.id) }} aria-label={definition.title} data-dashboard-widget={widget.id} data-width={definition.width} data-editing={editing} data-dragging={drag.preview?.id === widget.id} data-drop-target={drag.preview?.target === widget.id && drag.preview.id !== widget.id} className="dashboard-widget">
          <div className="dashboard-widget-body">{editing ? <div className="dashboard-widget-tools">
            <IconButton variant="ghost" icon={GripVertical} label={`${definition.title} verschieben`} aria-describedby={dragHelpId} className="dashboard-widget-grip" onPointerDown={(event) => drag.start(event, widget.id)} onKeyDown={(event) => {
              if (drag.preview) return;
              const adjacent = preferences.widgets[index + (event.key === "ArrowUp" ? -1 : 1)];
              if ((event.key === "ArrowUp" || event.key === "ArrowDown") && adjacent) { event.preventDefault(); move(widget.id, adjacent.id); }
            }} />
            <div className="dashboard-widget-tool-actions">{widget.id === "heatmap" ? <ColorPicker ariaLabel="Heatmap-Farbe ändern" value={heatmapColor} onValueCommit={setHeatmapColor} /> : widget.id === "timer" ? <ColorPicker ariaLabel="Lerntimer-Farbe ändern" value={timerColor} onValueCommit={setTimerColor} /> : null}<IconButton variant="ghost" icon={ArrowUp} label={`${definition.title} nach vorne`} disabled={index === 0} onClick={() => move(widget.id, preferences.widgets[index - 1].id)} />
            <IconButton variant="ghost" icon={ArrowDown} label={`${definition.title} nach hinten`} disabled={index === preferences.widgets.length - 1} onClick={() => move(widget.id, preferences.widgets[index + 1].id)} />
            <IconButton variant="ghost" icon={X} label={`${definition.title} entfernen`} onClick={() => remove(widget.id)} /></div>
          </div> : null}
          <div className="dashboard-widget-content">{contents[widget.id]}</div></div>
        </section>;
      })}
      {pendingAddition ? <section data-dashboard-widget={pendingAddition.id} data-width={DASHBOARD_WIDGETS.find((entry) => entry.id === pendingAddition.id)!.width} className="dashboard-widget dashboard-widget-placeholder" style={{ order: widgets.findIndex((entry) => entry.id === pendingAddition.id) }} aria-hidden="true"><div className="dashboard-widget-body p-5"><WidgetMiniature id={pendingAddition.id} /><p className="core-caption">Hier platzieren</p></div></section> : null}
    </div>
    {drag.preview ? createPortal(<div ref={drag.ghost} className="dashboard-widget-drag-preview" data-testid="dashboard-widget-drag-preview" aria-hidden="true" style={{ left: drag.preview.x, top: drag.preview.y, width: drag.preview.width }}><GripVertical size={16} className="shrink-0 text-core-muted" /><div className="min-w-0"><p className="break-words core-heading-3">{DASHBOARD_WIDGETS.find((widget) => widget.id === drag.preview!.id)?.title}</p><p className="core-caption text-core-muted">{drag.preview.target && drag.preview.target !== drag.preview.id ? "Loslassen zum Platzieren" : "Auf den gewünschten Platz ziehen"}</p></div></div>, document.body) : null}
  </div>;
}

function DashboardTodos({ todos, onChange, planner, onOpenPlanner }: { todos: DashboardPreferences["todos"]; onChange: (todos: DashboardPreferences["todos"]) => void; planner: React.ReactNode; onOpenPlanner: () => void }) {
  const [text, setText] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const listId = React.useId();
  const addButton = React.useRef<HTMLButtonElement>(null);
  const refocusAdd = React.useRef(false);
  // The form replaces the add button; focus can only return once the button is rendered again.
  React.useEffect(() => {
    if (!adding && refocusAdd.current) addButton.current?.focus();
    refocusAdd.current = false;
  }, [adding]);
  function close(refocus = false) {
    // A blur while the form unmounts must not cancel a requested refocus.
    if (refocus) refocusAdd.current = true;
    setText("");
    setAdding(false);
  }
  function task(todo: DashboardPreferences["todos"][number]) {
    const id = `${listId}-${todo.id}`;
    return <li key={todo.id} className="dashboard-todo" data-own-todo={todo.id} data-done={todo.done || undefined}><DashboardTaskText checkbox={<CoreCheckbox id={id} checked={todo.done} onCheckedChange={() => onChange(todos.map((entry) => entry.id === todo.id ? { ...entry, done: !entry.done } : entry))}/>}><span className="dashboard-todo-text">{todo.text}</span></DashboardTaskText><IconButton icon={Trash2} variant="destructive-quiet" className="dashboard-todo-delete" label={`Aufgabe löschen: ${todo.text}`} onClick={() => onChange(todos.filter((entry) => entry.id !== todo.id))} /></li>;
  }
  return <section className="dashboard-poster dashboard-todos" data-tone="cream">
    <SectionHeader level={2} title="To-dos" action={<IconButton icon={ArrowUpRight} variant="ghost" label="Planer öffnen" onClick={onOpenPlanner} />} />
    <div className="dashboard-todos-list">
      {todos.length ? <ul>{[...todos.filter((todo) => !todo.done), ...todos.filter((todo) => todo.done)].map(task)}</ul> : null}
      {planner}
    </div>
    {adding ? <form className="dashboard-poster-action dashboard-todos-add" onSubmit={(event) => { event.preventDefault(); if (!text.trim() || todos.length >= 500) return; onChange([...todos, { id: crypto.randomUUID(), text: text.trim(), done: false }]); close(true); }} onBlur={(event) => { if (!text.trim() && !event.currentTarget.contains(event.relatedTarget)) close(); }}>
      <Plus size={20} aria-hidden="true" />
      <input autoFocus aria-label="Eigene Aufgabe" placeholder="Was hast du dir vorgenommen?" maxLength={500} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(true); } }} />
      <button type="submit" aria-label="Aufgabe hinzufügen" disabled={!text.trim() || todos.length >= 500}><CornerDownLeft size={18} aria-hidden="true" /></button>
    </form> : <button ref={addButton} type="button" className="dashboard-poster-action dashboard-todos-add" onClick={() => setAdding(true)}><Plus size={20} aria-hidden="true" />Neue Aufgabe</button>}
  </section>;
}

function WidgetMiniature({ id }: { id: DashboardWidgetId }) {
  if (id === "motivation") return <div className="dashboard-mini-content dashboard-mini-motivation" aria-hidden="true"><div className="mx-auto w-16"><BrainMascot id="pastell-lernen" /></div></div>;
  return <div className={`dashboard-mini-content dashboard-mini-${id}`} aria-hidden="true">
    {id === "timer" ? <><span className="text-3xl tabular-nums">25:00</span><span className="dashboard-mini-line" /></> : id === "heatmap" ? <div className="dashboard-mini-cells">{Array.from({ length: 35 }, (_, i) => <i key={i} style={{ opacity: .2 + (i % 5) * .18 }} />)}</div> : id === "learning" ? <><div className="dashboard-mini-bar"><i /><i /><i /><i /></div><div className="flex justify-between"><Check size={14} /><span>Neu</span><span>Offen</span></div></> : <>{[0, 1, 2].map((i) => <div className="flex items-center gap-2" key={i}>{id === "todos" ? <span className="size-3 rounded border border-core-border" /> : <LayoutGrid size={14} />}<span className="dashboard-mini-line" /></div>)}</>}
  </div>;
}
