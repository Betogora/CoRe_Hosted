import React from "react";
import { ArrowLeft, Eraser, Hand, Link2, Maximize, Minus, Network, Pencil, Plus, Redo2, Save, StickyNote, Trash2, Undo2, X } from "lucide-react";
import type { CardDraftGuard } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { loadLearningSummaries, type LearningSummary } from "../learningSummaries.ts";
import { createLearningMindMap, createMindMapNode, loadLearningMindMaps, mindMapFromSummary, removeMindMapNode, saveLearningMindMap, toggleMindMapEdge, type LearningMindMap, type MindMapNode, type MindMapPoint } from "../learningMindMaps.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl, EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

interface DeckMindMapsPanelProps {
  deck: Deck;
  userId: string;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
}
type Tool = "move" | "connect" | "pen" | "erase";
type Viewport = MindMapPoint & { zoom: number };
type Gesture = { pointer: number; start: MindMapPoint; viewport: Viewport; node?: MindMapNode; before: LearningMindMap; moved: boolean; points?: MindMapPoint[] };

function nodeHeight(node: MindMapNode) { return node.kind === "text" ? 160 : 88; }
function connectionPath(from: MindMapNode, to: MindMapNode) {
  const forward = to.x >= from.x, x1 = from.x + (forward ? 220 : 0), x2 = to.x + (forward ? 0 : 220);
  const y1 = from.y + nodeHeight(from) / 2, y2 = to.y + nodeHeight(to) / 2, bend = Math.max(80, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export function DeckMindMapsPanel({ deck, userId, onDraftStateChange }: DeckMindMapsPanelProps) {
  const [maps, setMaps] = React.useState<LearningMindMap[]>([]);
  const [summaries, setSummaries] = React.useState<LearningSummary[]>([]);
  const [loading, setLoading] = React.useState(true), [loadError, setLoadError] = React.useState(""), [retry, setRetry] = React.useState(0);
  const [draft, setDraft] = React.useState<LearningMindMap | null>(null), [saved, setSaved] = React.useState<string | null>(null);
  const draftRef = React.useRef(draft); draftRef.current = draft;
  const [selected, setSelected] = React.useState<string | null>(null), [linkFrom, setLinkFrom] = React.useState<string | null>(null);
  const [tool, setTool] = React.useState<Tool>("move"), [viewport, setViewport] = React.useState<Viewport>({ x: 40, y: 80, zoom: 1 });
  const viewportRef = React.useRef(viewport); viewportRef.current = viewport;
  const [ink, setInk] = React.useState<MindMapPoint[]>([]);
  const [history, setHistory] = React.useState<{ past: LearningMindMap[]; future: LearningMindMap[] }>({ past: [], future: [] });
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [notice, setNotice] = React.useState("");
  const busyRef = React.useRef(false), [pending, setPending] = React.useState<(() => void) | null>(null);
  const [createFromSummary, setCreateFromSummary] = React.useState(false), [summaryId, setSummaryId] = React.useState("");
  const [sourceOpen, setSourceOpen] = React.useState(false);
  const canvasRef = React.useRef<HTMLDivElement>(null), titleRef = React.useRef<HTMLInputElement>(null), gestureRef = React.useRef<Gesture | null>(null);
  const suppressClick = React.useRef(false);
  const dirty = draft !== null && JSON.stringify(draft) !== saved;
  const selectedNode = draft?.nodes.find((node) => node.id === selected);

  React.useEffect(() => {
    let active = true; setLoading(true); setLoadError("");
    void Promise.all([loadLearningMindMaps(userId, deck.id), loadLearningSummaries(userId, deck.id)]).then(([items, sources]) => {
      if (active) { setMaps(items); setSummaries(sources); setSummaryId(sources[0]?.id ?? ""); setLoading(false); }
    }).catch((cause: unknown) => { if (active) { setLoadError(cause instanceof Error ? cause.message : "Die Mindmaps konnten nicht geladen werden."); setLoading(false); } });
    return () => { active = false; };
  }, [userId, deck.id, retry]);

  const persist = React.useCallback(async () => {
    const current = draftRef.current;
    if (!current || busyRef.current) return false;
    if (!current.title.trim()) { setError("Bitte gib deiner Mindmap einen Titel."); titleRef.current?.focus(); return false; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await saveLearningMindMap(userId, { ...current, updatedAt: new Date().toISOString() });
      draftRef.current = result; setDraft(result); setSaved(JSON.stringify(result));
      setMaps((items) => [result, ...items.filter((item) => item.id !== result.id)]); setNotice("Mindmap lokal gespeichert.");
      return true;
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Mindmap konnte nicht gespeichert werden."); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }, [userId]);

  React.useEffect(() => {
    onDraftStateChange(dirty ? { focus: () => titleRef.current?.focus(), save: persist } : null);
  }, [dirty, persist, onDraftStateChange]);
  React.useEffect(() => () => onDraftStateChange(null), [onDraftStateChange]);
  React.useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function update(next: LearningMindMap, remember = true) {
    if (busyRef.current) return;
    const previous = draftRef.current;
    if (previous && remember) setHistory((current) => ({ past: [...current.past.slice(-49), previous], future: [] }));
    draftRef.current = next; setDraft(next); setNotice(""); setError("");
  }
  function editNode(patch: Partial<MindMapNode>) {
    const current = draftRef.current;
    if (current) update({ ...current, nodes: current.nodes.map((node) => node.id === selected ? { ...node, ...patch } : node) });
  }
  function travel(direction: "past" | "future") {
    const items = history[direction], next = items[items.length - 1], current = draftRef.current;
    if (!next || !current) return;
    const other = direction === "past" ? "future" : "past";
    setHistory({ ...history, [direction]: items.slice(0, -1), [other]: [...history[other], current] });
    update(next, false); setLinkFrom(null);
  }
  function fit(map = draftRef.current) {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const points = [...map.nodes.flatMap((node) => [{ x: node.x, y: node.y }, { x: node.x + 220, y: node.y + nodeHeight(node) }]), ...map.strokes.flatMap((stroke) => stroke.points)];
    if (!points.length) { setViewport({ x: 40, y: 80, zoom: 1 }); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
    const zoom = Math.max(0.001, Math.min(1, (canvas.clientWidth - 64) / Math.max(220, maxX - minX), (canvas.clientHeight - 64) / Math.max(80, maxY - minY)));
    setViewport({ zoom, x: (canvas.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom, y: (canvas.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom });
  }
  function open(map: LearningMindMap, isNew = false) {
    setDraft(map); draftRef.current = map; setSaved(isNew ? null : JSON.stringify(map));
    setSelected(null); setTool("move"); setLinkFrom(null); setHistory({ past: [], future: [] }); setCreateFromSummary(false); setError(""); setNotice("");
    requestAnimationFrame(() => {
      const canvas = canvasRef.current, first = map.nodes[0];
      if (canvas && canvas.clientWidth < 600 && first) setViewport({ zoom: 0.8, x: 24 - first.x * 0.8, y: canvas.clientHeight / 2 - (first.y + 40) * 0.8 });
      else fit(map);
      titleRef.current?.focus();
    });
  }
  function zoomAt(factor: number, anchor?: MindMapPoint) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setViewport((current) => {
      const zoom = Math.min(3, Math.max(0.001, current.zoom * factor)), x = anchor?.x ?? canvas.clientWidth / 2, y = anchor?.y ?? canvas.clientHeight / 2;
      return { zoom, x: x - (x - current.x) * zoom / current.zoom, y: y - (y - current.y) * zoom / current.zoom };
    });
  }
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !draft) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); const rect = canvas.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomAt(Math.exp(-event.deltaY * 0.005), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      else setViewport((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [draft?.id]);
  function worldPoint(client: MindMapPoint): MindMapPoint {
    const rect = canvasRef.current!.getBoundingClientRect(), view = viewportRef.current;
    return { x: (client.x - rect.left - view.x) / view.zoom, y: (client.y - rect.top - view.y) / view.zoom };
  }
  function addNode(kind: MindMapNode["kind"], position?: MindMapPoint) {
    const current = draftRef.current, canvas = canvasRef.current;
    if (!current || !canvas) return;
    const view = viewportRef.current, node = createMindMapNode(kind, position ?? { x: (canvas.clientWidth / 2 - view.x) / view.zoom - 110, y: (canvas.clientHeight / 2 - view.y) / view.zoom - 40 });
    update({ ...current, nodes: [...current.nodes, node] }); setSelected(node.id); setTool("move"); setLinkFrom(null);
  }
  function startGesture(event: React.PointerEvent, node?: MindMapNode) {
    if (event.button !== 0 || busyRef.current || gestureRef.current || !draftRef.current) return;
    event.stopPropagation(); suppressClick.current = false;
    if (node && tool === "connect") return;
    const start = { x: event.clientX, y: event.clientY }, before = draftRef.current;
    const points = !node && tool === "pen" ? [worldPoint(start)] : undefined;
    gestureRef.current = { pointer: event.pointerId, start, viewport: viewportRef.current, node, before, moved: false, points };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (points) setInk(points);
  }
  function moveGesture(event: React.PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.start.x, dy = event.clientY - gesture.start.y;
    if (Math.hypot(dx, dy) > 4) gesture.moved = true;
    if (gesture.points) {
      const next = worldPoint({ x: event.clientX, y: event.clientY });
      if (gesture.points.length < 20_000) gesture.points.push(next);
      setInk([...gesture.points]);
    } else if (gesture.node && tool === "move") {
      if (!gesture.moved) return;
      const node = gesture.node, current = draftRef.current!;
      update({ ...current, nodes: current.nodes.map((item) => item.id === node.id ? { ...item, x: node.x + dx / gesture.viewport.zoom, y: node.y + dy / gesture.viewport.zoom } : item) }, false);
    } else if (!gesture.node) setViewport({ ...gesture.viewport, x: gesture.viewport.x + dx, y: gesture.viewport.y + dy });
  }
  function finishGesture(event: React.PointerEvent, cancelled = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    gestureRef.current = null; suppressClick.current = gesture.moved;
    if (cancelled) { if (gesture.node) update(gesture.before, false); setInk([]); return; }
    if (gesture.points) {
      if (gesture.points.length === 1) gesture.points.push({ x: gesture.points[0].x + 0.01, y: gesture.points[0].y });
      update({ ...draftRef.current!, strokes: [...draftRef.current!.strokes, { id: `stroke_${crypto.randomUUID()}`, points: gesture.points }] }); setInk([]);
    } else if (gesture.node && gesture.moved) {
      setHistory((current) => ({ past: [...current.past.slice(-49), gesture.before], future: [] }));
    }
  }
  function selectNode(node: MindMapNode) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (tool === "connect") {
      if (linkFrom && linkFrom !== node.id) { update(toggleMindMapEdge(draftRef.current!, linkFrom, node.id)); setLinkFrom(null); }
      else setLinkFrom(node.id);
    }
    setSelected(node.id);
  }
  function leave(run: () => void) { if (dirty) setPending(() => run); else run(); }

  if (loading) return <StatusMessage tone="info" announce="polite">Mindmaps werden geladen …</StatusMessage>;
  if (loadError) return <div className="grid gap-3"><StatusMessage tone="error">{loadError}</StatusMessage><ActionButton variant="secondary" onClick={() => setRetry((value) => value + 1)}>Erneut laden</ActionButton></div>;
  return <section className="core-mindmap-panel min-w-0" data-testid="deck-mindmaps-panel" aria-label="Mindmaps">
    {error && <StatusMessage tone="error" announce="assertive">{error}</StatusMessage>}
    {!draft ? <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="core-heading-3">Deine Mindmaps</h3><p className="core-body text-core-muted">Eine freie Fläche für Gedanken, Zusammenhänge und Notizen.</p></div><div className="flex flex-wrap gap-2"><ActionButton variant="secondary" icon={Network} onClick={() => setCreateFromSummary(true)}>Aus Zusammenfassung</ActionButton><ActionButton variant="primary" icon={Plus} onClick={() => open(createLearningMindMap(deck.id, "Neue Mindmap"), true)}>Leere Mindmap</ActionButton></div></div>
      {createFromSummary && <SoftPanel className="grid gap-4 p-4 sm:p-6" aria-label="Mindmap aus Zusammenfassung">
        <h4 className="core-body-large font-semibold">Zusammenfassung auswählen</h4><p className="core-body text-core-muted">Überschriften und Absätze werden zu verknüpften Stichworten. Beim Öffnen siehst du die zugehörige Textstelle. Die Umwandlung läuft lokal ohne KI.</p>
        {summaries.length ? <label className="core-field-group"><span className="core-field-label">Zusammenfassung</span><CoreSelect ariaLabel="Zusammenfassung für Mindmap" value={summaryId} options={summaries.map((summary) => ({ value: summary.id, label: summary.title }))} onValueChange={setSummaryId}/></label> : <p className="core-body">Speichere zuerst im Reiter „Zusammenfassungen“ einen Text.</p>}
        <div className="flex flex-wrap gap-2"><ActionButton variant="primary" disabled={!summaryId} onClick={() => { try { const source = summaries.find((summary) => summary.id === summaryId); if (source) open(mindMapFromSummary(source), true); } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Umwandlung ist fehlgeschlagen."); } }}>Mindmap erstellen</ActionButton><ActionButton variant="secondary" onClick={() => setCreateFromSummary(false)}>Abbrechen</ActionButton></div>
      </SoftPanel>}
      {!maps.length ? <EmptyState icon={Network} title="Platz für deine Gedanken" body="Starte mit einer leeren Fläche oder verwandle eine gespeicherte Zusammenfassung in eine Mindmap."/> : <div className="grid gap-3" data-testid="mindmap-list">{maps.map((map) => <button key={map.id} type="button" className="core-mindmap-list-item rounded-panel border border-core-border bg-core-surface p-4 text-left" onClick={() => open(map)} aria-label={`Mindmap „${map.title}“ öffnen`}><span className="block break-words core-body-large font-semibold">{map.title}</span><span className="core-caption text-core-muted">{map.nodes.filter((node) => node.kind === "keyword").length} Stichworte · {map.edges.length} Verbindungen{map.source ? ` · ${map.source.title}` : " · Freie Mindmap"}</span></button>)}</div>}
    </div> : <div className="grid min-w-0 gap-3" inert={busy}>
      <div className="core-mindmap-heading flex flex-wrap items-center gap-3"><IconButton icon={ArrowLeft} label="Alle Mindmaps" onClick={() => leave(() => { setDraft(null); draftRef.current = null; })}/><label className="min-w-0 flex-1"><span className="sr-only">Mindmap-Titel</span><input className="core-field-input w-full" aria-label="Mindmap-Titel" maxLength={120} ref={titleRef} value={draft.title} onChange={(event) => update({ ...draft, title: event.target.value })}/></label><ActionButton variant="primary" icon={Save} loading={busy} onClick={() => void persist()}>Speichern</ActionButton></div>
      <div className="flex flex-wrap gap-2" aria-label="Mindmap-Werkzeuge">
        <ActionButton variant="secondary" icon={Plus} onClick={() => addNode("keyword")}>Stichwort</ActionButton><ActionButton variant="secondary" icon={StickyNote} onClick={() => addNode("text")}>Textfeld</ActionButton>
        <CoreSegmentedControl ariaLabel="Werkzeug" collapseInactiveLabels value={tool} onValueChange={(value) => { setTool(value as Tool); setLinkFrom(null); }} options={[{ value: "move", label: "Bewegen", icon: Hand }, { value: "connect", label: "Verknüpfen", icon: Link2 }, { value: "pen", label: "Stift", icon: Pencil }, { value: "erase", label: "Radierer", icon: Eraser }]}/>
        <IconButton icon={Undo2} label="Rückgängig" disabled={!history.past.length} onClick={() => travel("past")}/><IconButton icon={Redo2} label="Wiederholen" disabled={!history.future.length} onClick={() => travel("future")}/>
      </div>
      <p className="core-caption text-core-muted" role="status">{tool === "connect" ? linkFrom ? "Jetzt das zweite Stichwort wählen. Eine bestehende Verbindung wird gelöst." : "Zwei Stichworte wählen, um sie zu verbinden oder zu trennen." : tool === "pen" ? "Auf der freien Fläche zeichnen. Zum Verschieben „Bewegen“ wählen." : tool === "erase" ? "Eine gezeichnete Linie antippen, um sie zu entfernen." : "Kästen ziehen · Antippen öffnet den Text · Freie Fläche ziehen · Strg + Mausrad zoomt"}</p>
      <div className={`core-mindmap-workspace${selectedNode ? " has-selection" : ""}`}>
        <div className="core-mindmap-canvas rounded-panel border border-core-border" ref={canvasRef} data-testid="mindmap-canvas" data-tool={tool} tabIndex={0} aria-label="Unendliche Mindmap-Fläche" onPointerDown={(event) => startGesture(event)} onPointerMove={moveGesture} onPointerUp={(event) => finishGesture(event)} onPointerCancel={(event) => finishGesture(event, true)} onDoubleClick={(event) => { if (tool === "move" && !(event.target as HTMLElement).closest("button")) addNode("keyword", worldPoint({ x: event.clientX, y: event.clientY })); }} onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const delta = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key];
          if (delta) { event.preventDefault(); setViewport((current) => ({ ...current, x: current.x + delta[0], y: current.y + delta[1] })); }
          if (event.key === "Escape") { setSelected(null); setLinkFrom(null); setTool("move"); }
        }} style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${Math.max(16, 24 * viewport.zoom)}px ${Math.max(16, 24 * viewport.zoom)}px` }}>
          <div className="core-mindmap-stage" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
            <svg className="core-mindmap-lines" aria-hidden="true"><g className="core-mindmap-edges">{draft.edges.map((edge) => { const from = draft.nodes.find((node) => node.id === edge.from), to = draft.nodes.find((node) => node.id === edge.to); return from && to ? <path key={`${edge.from}:${edge.to}`} d={connectionPath(from, to)}/> : null; })}</g>
              {draft.strokes.map((stroke) => <g key={stroke.id} className="core-mindmap-ink"><polyline points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}/>{tool === "erase" && <polyline className="core-mindmap-eraser-hit" points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")} onPointerDown={(event) => { event.stopPropagation(); update({ ...draft, strokes: draft.strokes.filter((item) => item.id !== stroke.id) }); }}/>}</g>)}
              {ink.length > 0 && <polyline className="core-mindmap-ink-preview" points={ink.map((point) => `${point.x},${point.y}`).join(" ")}/>}
            </svg>
            {draft.nodes.map((node) => <button key={node.id} type="button" className={`core-mindmap-node rounded-control shadow-soft${node.kind === "text" ? " is-text" : ""}${selected === node.id ? " is-selected" : ""}${linkFrom === node.id ? " is-link-source" : ""}`} style={{ left: node.x, top: node.y, height: nodeHeight(node) }} data-testid="mindmap-node" data-node-id={node.id} aria-label={`${node.kind === "keyword" ? "Stichwort" : "Textfeld"} „${node.label}“ öffnen`} aria-pressed={selected === node.id} onPointerDown={(event) => startGesture(event, node)} onClick={() => selectNode(node)} onKeyDown={(event) => {
              if (tool !== "move") return;
              const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
              if (delta) { event.preventDefault(); event.stopPropagation(); update({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, x: item.x + delta[0], y: item.y + delta[1] } : item) }); }
            }}><span className="core-mindmap-node-label core-body font-semibold">{node.label || "Ohne Titel"}</span>{node.kind === "text" ? <span className="core-mindmap-note-text core-body">{node.text || "Antippen und losschreiben …"}</span> : <span className="core-caption text-core-muted">{node.sourceText !== undefined ? "Textstelle öffnen" : node.text ? "Notiz öffnen" : "Text ergänzen"}</span>}</button>)}
          </div>
          {!draft.nodes.length && !draft.strokes.length && <div className="core-mindmap-empty"><Network size={32} aria-hidden="true"/><p className="core-body-large font-semibold">Deine freie Fläche</p><p className="core-body">Füge ein Stichwort hinzu, schreibe eine Notiz oder zeichne mit dem Stift.</p></div>}
          <div className="core-mindmap-zoom rounded-control border border-core-border bg-core-surface shadow-soft" onPointerDown={(event) => event.stopPropagation()}><IconButton icon={Minus} label="Verkleinern" onClick={() => zoomAt(1 / 1.2)}/><span className="core-caption tabular-nums">{Math.round(viewport.zoom * 100)} %</span><IconButton icon={Plus} label="Vergrößern" onClick={() => zoomAt(1.2)}/><IconButton icon={Maximize} label="Alles anzeigen" onClick={() => fit()}/></div>
        </div>
        {selectedNode && <SoftPanel className="core-mindmap-details grid content-start gap-4 p-4" aria-label="Stichwort bearbeiten" data-testid="mindmap-details"><div className="flex items-center justify-between gap-2"><h4 className="core-body-large font-semibold">{selectedNode.kind === "text" ? "Textfeld" : "Stichwort"}</h4><IconButton icon={X} label="Textdetails schließen" onClick={() => setSelected(null)}/></div>
          <label className="core-field-group"><span className="core-field-label">{selectedNode.kind === "text" ? "Überschrift" : "Stichwort"}</span><input className="core-field-input" aria-label="Stichwort bearbeiten" value={selectedNode.label} maxLength={120} onChange={(event) => editNode({ label: event.target.value })}/></label>
          {selectedNode.sourceText !== undefined && <div className="grid gap-2"><h5 className="core-body font-semibold">Text aus der Zusammenfassung</h5><p className="core-mindmap-source core-body" data-testid="mindmap-source-passage">{selectedNode.sourceText}</p><button type="button" className="core-action-secondary min-h-11 rounded-control px-3 py-2 core-body" onClick={() => setSourceOpen(!sourceOpen)} aria-expanded={sourceOpen}>Quelle: {draft.source?.title}</button>{sourceOpen && <div className="core-mindmap-source core-body"><p className="mb-2 core-caption text-core-muted">Gespeicherte Fassung vom {new Date(draft.source!.updatedAt).toLocaleDateString("de-DE")}</p>{draft.source?.text}</div>}</div>}
          <label className="core-field-group"><span className="core-field-label">{selectedNode.kind === "text" ? "Text" : "Eigene Notizen"}</span><textarea className="core-field-input min-h-32" aria-label="Eigener Text zum Stichwort" maxLength={100_000} value={selectedNode.text} placeholder="Hier kannst du schreiben …" onChange={(event) => editNode({ text: event.target.value })}/></label>
          <details><summary className="min-h-11 cursor-pointer core-body font-semibold">Position bearbeiten</summary><div className="grid grid-cols-2 gap-2">{(["x", "y"] as const).map((axis) => <label key={axis} className="core-field-group"><span className="core-field-label">{axis.toUpperCase()}</span><input className="core-field-input" type="number" aria-label={`Position ${axis.toUpperCase()}`} value={Math.round(selectedNode[axis])} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) editNode({ [axis]: event.target.valueAsNumber }); }}/></label>)}</div></details>
          <div className="grid gap-2"><h5 className="core-body font-semibold">Verbindungen</h5>{draft.edges.filter((edge) => edge.from === selected || edge.to === selected).map((edge) => { const target = draft.nodes.find((node) => node.id === (edge.from === selected ? edge.to : edge.from))!; return <div key={target.id} className="flex min-w-0 items-center gap-2"><button type="button" className="min-h-11 min-w-0 flex-1 break-words rounded-control border border-core-border px-3 py-2 text-left core-body" onClick={() => setSelected(target.id)}>{target.label}</button><IconButton icon={X} label={`Verbindung zu „${target.label}“ lösen`} onClick={() => update(toggleMindMapEdge(draft, selectedNode.id, target.id))}/></div>; })}<ActionButton variant="secondary" icon={Link2} onClick={() => { setTool("connect"); setLinkFrom(selectedNode.id); canvasRef.current?.focus(); }}>Neu verknüpfen</ActionButton></div>
          <ActionButton variant="destructive" icon={Trash2} onClick={() => { update(removeMindMapNode(draft, selectedNode.id)); setSelected(null); setLinkFrom(null); }}>Element entfernen</ActionButton>
        </SoftPanel>}
      </div>
      <p className="core-caption text-core-muted" role="status">{notice || (dirty ? "Ungespeicherte Änderungen" : "Lokal gespeichert")} · {draft.nodes.length} Elemente · {draft.edges.length} Verbindungen · Speicherung auf diesem Gerät</p>
    </div>}
    <ActionDialog open={Boolean(pending)} title="Änderungen übernehmen?" description="Speichere oder verwirf deine Mindmap, bevor du die Fläche verlässt." confirmLabel="Speichern" cancelLabel="Weiter bearbeiten" discardLabel="Verwerfen" confirmLoading={busy} onCancel={() => setPending(null)} onDiscard={() => { const run = pending; setPending(null); run?.(); }} onConfirm={() => { void persist().then((success) => { if (success) { const run = pending; setPending(null); run?.(); } }); }} restoreFocus={() => titleRef.current?.focus()}/>
  </section>;
}
