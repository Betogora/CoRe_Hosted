import React from "react";
import { Check, ChevronDown, ChevronUp, Copy, Eraser, FileText, ImagePlus, Image as ImageIcon, Link2, Maximize, Minus, MousePointer2, Network, Palette, Pencil, Plus, Redo2, Scan, StickyNote, Trash2, Type, Undo2, X } from "lucide-react";
import type { CardDraftGuard } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { loadLearningSummaries, type LearningSummary } from "../learningSummaries.ts";
import { addMindMapRelativeNode, appendMindMap, connectMindMapElements, createMindMapBoundary, createMindMapSummary, duplicateMindMapZone, editMindMapNode, loadInfinityMindMap, mindMapBounds, mindMapBoundaryRect, mindMapColors, mindMapFromSummary, mindMapNodeColor, mindMapNodeRect, mindMapNodeSource, mindMapSummaryRect, mindMapZoneRect, moveMindMapElement, placeMindMapNode, readMindMapImages, removeMindMapElement, resizeMindMapSummary, resizeMindMapZone, saveLearningMindMap, setMindMapZoneLayer, type LearningMindMap, type MindMapColor, type MindMapElementKind, type MindMapNode, type MindMapPoint, type MindMapRect } from "../learningMindMaps.ts";
import { textToCardHtml } from "../richText.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl, CoreSlidingTabs, SoftPanel } from "../ui/coreUi.tsx";
import { ColorPopover, highlightPaletteColors, normalizeColor } from "../ui/colorPicker.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

interface DeckMindMapsPanelProps { deck: Deck; userId: string; onDraftStateChange: (guard: CardDraftGuard | null) => void; }
type Mode = "idle" | "connect" | "edit" | "design" | "add";
type Selection = { kind: MindMapElementKind; ids: string[] };
type Viewport = MindMapPoint & { zoom: number };
type Gesture = { pointer: number; start: MindMapPoint; viewport: Viewport; before: LearningMindMap; moved: boolean; target?: { kind: MindMapElementKind; id: string }; points?: MindMapPoint[]; resize?: { kind: "zone"; corner: "nw" | "ne" | "sw" | "se"; id: string } | { kind: "summary"; end: "start" | "end"; id: string }; };
function hasDefaultTitle(node: MindMapNode) { return node.label === "Neue Notiz" || node.label === "Neues Stichwort"; }
const colorTokens: Record<string, string> = { default: "var(--core-text)", blue: "var(--core-info)", purple: "var(--core-success)", yellow: "var(--core-warning)", red: "var(--core-danger)" };
function inkColor(color: MindMapColor = "default") { return colorTokens[color] ?? color; }
function nodeStyle(map: LearningMindMap, node: MindMapNode): React.CSSProperties {
  const a = mindMapNodeColor(map, node), intensity = a.strength;
  return { "--mindmap-ink": inkColor(a.color), "--mindmap-surface": a.color === "default" ? "var(--core-surface-raised)" : `color-mix(in srgb, ${inkColor(a.color)} ${intensity}%, var(--core-surface))` } as React.CSSProperties;
}
function edgeColor(map: LearningMindMap, targetId: string) {
  const target = map.nodes.find((item) => item.id === targetId), color = target ? mindMapNodeColor(map, target).color : map.zones.find((item) => item.id === targetId)?.color;
  return map.connectionColor === "gray" || !color || color === "default" ? "var(--core-text-muted)" : inkColor(color);
}
function connectionPath(from: MindMapRect, to: MindMapRect) {
  const forward = to.x >= from.x, x1 = from.x + (forward ? from.width : 0), x2 = to.x + (forward ? 0 : to.width), y1 = from.y + from.height / 2, y2 = to.y + to.height / 2, bend = Math.max(60, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}
function ColorControl({ label, value = "default", onChange }: { label: string; value?: MindMapColor; onChange: (color: MindMapColor) => void }) {
  const [open, setOpen] = React.useState(false), [custom, setCustom] = React.useState(() => normalizeColor(value, highlightPaletteColors[0]));
  const id = React.useId(), ref = React.useRef<HTMLDivElement>(null), trigger = React.useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = React.useState(0);
  React.useLayoutEffect(() => { if (!open) return; const position = () => { const r = trigger.current?.getBoundingClientRect(); if (r) setOffset(Math.max(16, Math.min(r.right - 224, window.innerWidth - 240)) - r.left); }; position(); window.addEventListener("resize", position); return () => window.removeEventListener("resize", position); }, [open]);
  React.useEffect(() => { if (!open) return; const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [open]);
  return <fieldset className="core-mindmap-color-picker"><legend className="core-caption">{label}</legend><div className="flex flex-wrap items-center gap-1">
    {mindMapColors.map((color) => <button key={color.value} type="button" className="core-mindmap-swatch rounded-control" style={{ "--mindmap-ink": inkColor(color.value) } as React.CSSProperties} aria-label={`${label} ${color.label}`} aria-pressed={value === color.value} onClick={() => onChange(color.value)}><span aria-hidden="true"/></button>)}
    <div className="core-mindmap-custom-color relative" style={{ "--mindmap-color-x": `${offset}px` } as React.CSSProperties} ref={ref} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}><button ref={trigger} type="button" className="core-mindmap-swatch rounded-control" aria-label={`${label} frei wählen`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setCustom(normalizeColor(value, custom)); setOpen(!open); }}><Palette size={18} aria-hidden="true"/></button>{open && <ColorPopover id={id} label={`${label} frei wählen`} icon={Palette} colors={[custom]} paletteColors={highlightPaletteColors} selectedSlot={0} onSelectSlot={() => undefined} onChangeSlot={(_slot, color) => setCustom(color)} onApply={(color) => onChange(color)}/>}</div>
  </div></fieldset>;
}
export function DeckMindMapsPanel({ deck, userId, onDraftStateChange }: DeckMindMapsPanelProps) {
  const [summaries, setSummaries] = React.useState<LearningSummary[]>([]), [summaryId, setSummaryId] = React.useState("");
  const [loading, setLoading] = React.useState(true), [loadError, setLoadError] = React.useState(""), [retry, setRetry] = React.useState(0);
  const [draft, setDraft] = React.useState<LearningMindMap | null>(null), [saved, setSaved] = React.useState<string | null>(null);
  const draftRef = React.useRef(draft); draftRef.current = draft;
  const [selection, setSelection] = React.useState<Selection>({ kind: "node", ids: [] }), [editing, setEditing] = React.useState<string | null>(null), [expanded, setExpanded] = React.useState<string | null>(null);
  const [editPart, setEditPart] = React.useState<"title" | "text">("title");
  const editStartedRef = React.useRef(0);
  const [multipleSelection, setMultipleSelection] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("idle"), [designTool, setDesignTool] = React.useState<"pen" | "erase" | "text">("pen"), [connecting, setConnecting] = React.useState(false), [linkFrom, setLinkFrom] = React.useState<string | null>(null);
  const [viewport, setViewport] = React.useState<Viewport>({ x: 40, y: 80, zoom: 1 }); const viewportRef = React.useRef(viewport); viewportRef.current = viewport;
  const [ink, setInk] = React.useState<MindMapPoint[]>([]), [penColor, setPenColor] = React.useState<MindMapColor>("default"), [penWidth, setPenWidth] = React.useState<2 | 4 | 8>(4);
  const [history, setHistory] = React.useState<{ past: LearningMindMap[]; future: LearningMindMap[] }>({ past: [], future: [] });
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [notice, setNotice] = React.useState("");
  const pendingImagesRef = React.useRef<Promise<boolean> | null>(null), [readingImages, setReadingImages] = React.useState(false);
  const savingRef = React.useRef<Promise<boolean> | null>(null), savedRef = React.useRef(saved), [saveFailed, setSaveFailed] = React.useState(false);
  savedRef.current = saved;
  const [createFromSummary, setCreateFromSummary] = React.useState(false), [sourceOpen, setSourceOpen] = React.useState(false);
  const [toolbarHost, setToolbarHost] = React.useState<HTMLDivElement | null>(null), [deleteZone, setDeleteZone] = React.useState<string | null>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const toolsRef = React.useRef<HTMLDivElement>(null), canvasRef = React.useRef<HTMLDivElement>(null), gestureRef = React.useRef<Gesture | null>(null), suppressClick = React.useRef(false);
  const dirty = React.useMemo(() => draft !== null && JSON.stringify(draft) !== saved, [draft, saved]);
  const primary = selection.ids.at(-1), node = selection.kind === "node" ? draft?.nodes.find((n) => n.id === primary) : undefined;
  const zone = selection.kind === "zone" ? draft?.zones.find((n) => n.id === primary) : undefined, boundary = selection.kind === "boundary" ? draft?.boundaries.find((n) => n.id === primary) : undefined, bracket = selection.kind === "summary" ? draft?.summaries.find((n) => n.id === primary) : undefined;
  React.useEffect(() => {
    let active = true; setLoading(true); setLoadError("");
    void Promise.allSettled([loadInfinityMindMap(userId, deck.id), loadLearningSummaries(userId, deck.id)]).then(([surface, sources]) => {
      if (!active) return;
      if (surface.status === "fulfilled") { draftRef.current = surface.value; setDraft(surface.value); setSaved(JSON.stringify(surface.value)); setSelection({ kind: "node", ids: [] }); setMultipleSelection(false); setHistory({ past: [], future: [] }); }
      else setLoadError(surface.reason instanceof Error ? surface.reason.message : "Die Mindmap konnte nicht geladen werden.");
      if (sources.status === "fulfilled") { setSummaries(sources.value); setSummaryId(sources.value[0]?.id ?? ""); }
      else setError("Die Zusammenfassungen konnten nicht geladen werden. Du kannst die Infinity Map weiter bearbeiten.");
      setLoading(false);
    }); return () => { active = false; };
  }, [userId, deck.id, retry]);
  const persist = React.useCallback(async () => {
    if (savingRef.current) return savingRef.current;
    const task = (async () => {
      await Promise.resolve();
      setBusy(true); setSaveFailed(false);
      try {
        while (true) {
          const preparation = pendingImagesRef.current; if (preparation && !(await preparation)) return false;
          const current = draftRef.current; if (!current) return false;
          const snapshot = JSON.stringify(current);
          if (snapshot === savedRef.current) return true;
          await saveLearningMindMap(userId, current);
          savedRef.current = snapshot; setSaved(snapshot);
          if (JSON.stringify(draftRef.current) === snapshot && !pendingImagesRef.current) { setNotice("Gespeichert"); return true; }
        }
      } catch (cause: unknown) { setSaveFailed(true); setError(cause instanceof Error ? cause.message : "Die Mindmap konnte nicht gespeichert werden. Dein Entwurf bleibt geöffnet."); return false; }
      finally { savingRef.current = null; setBusy(false); }
    })();
    savingRef.current = task;
    return task;
  }, [userId]);
  React.useEffect(() => { if (!dirty || readingImages || saveFailed) return; const timer = window.setTimeout(() => { if (!gestureRef.current) void persist(); }, 600); return () => window.clearTimeout(timer); }, [draft, dirty, readingImages, saveFailed, persist]);
  React.useEffect(() => { onDraftStateChange(dirty || readingImages ? { focus: () => canvasRef.current?.focus(), save: persist } : null); }, [dirty, readingImages, persist, onDraftStateChange]);
  React.useEffect(() => () => onDraftStateChange(null), [onDraftStateChange]);
  React.useEffect(() => { if (!dirty && !readingImages) return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty, readingImages]);
  function update(next: LearningMindMap, remember = true) { const before = draftRef.current; if (before && remember) setHistory((h) => ({ past: [...h.past.slice(-49), before], future: [] })); const changed = { ...next, updatedAt: new Date().toISOString() }; draftRef.current = changed; setDraft(changed); setSaveFailed(false); setError(""); setNotice(""); }
  function run(action: () => void) { try { action(); } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Änderung konnte nicht übernommen werden."); } }
  function editNode(patch: Partial<MindMapNode>) { if (primary && draftRef.current) update(editMindMapNode(draftRef.current, primary, patch)); }
  function editZone(patch: Partial<NonNullable<typeof zone>>) { if (draftRef.current) update({ ...draftRef.current, zones: draftRef.current.zones.map((n) => n.id === primary ? { ...n, ...patch } : n) }); }
  function editBoundary(patch: Partial<NonNullable<typeof boundary>>) { if (draftRef.current) update({ ...draftRef.current, boundaries: draftRef.current.boundaries.map((n) => n.id === primary ? { ...n, ...patch } : n) }); }
  function travel(direction: "past" | "future") { const items = history[direction], next = items.at(-1), current = draftRef.current; if (!next || !current) return; const other = direction === "past" ? "future" : "past"; setHistory({ ...history, [direction]: items.slice(0, -1), [other]: [...history[other], current] }); update(next, false); setEditing(null); setLinkFrom(null); }
  function fit(map = draftRef.current) {
    const canvas = canvasRef.current; if (!canvas || !map) return;
    const hidden = new Set(map.zones.filter((z) => z.collapsed).map((z) => z.id));
    const visibleIds = new Set(map.nodes.filter((n) => !n.zoneId || !hidden.has(n.zoneId)).map((n) => n.id));
    const groups = map.boundaries.map((item) => ({ ...item, nodeIds: item.nodeIds.filter((id) => visibleIds.has(id)) })).filter((item) => item.nodeIds.length).map((item) => { const r = mindMapBoundaryRect(map, item); return { ...r, y: r.y - (item.label ? 56 : 0), height: r.height + (item.label ? 56 : 0) }; });
    const rects = [...groups, ...map.nodes.filter((n) => !n.zoneId || !hidden.has(n.zoneId)).map((n) => mindMapNodeRect(n)), ...map.zones.map((z) => mindMapZoneRect(map, z)), ...map.strokes.filter((s) => !s.zoneId || !hidden.has(s.zoneId)).flatMap((s) => s.points.map((p) => ({ ...p, width: 0, height: 0 })))];
    if (!rects.length) { setViewport({ x: 40, y: 80, zoom: 1 }); return; }
    const r = mindMapBounds(rects, 0), zoom = Math.max(0.001, Math.min(1, (canvas.clientWidth - 64) / r.width, (canvas.clientHeight - 64) / r.height));
    setViewport({ zoom, x: (canvas.clientWidth - r.width * zoom) / 2 - r.x * zoom, y: (canvas.clientHeight - r.height * zoom) / 2 - r.y * zoom });
  }
  React.useLayoutEffect(() => { if (!loading && draftRef.current && canvasRef.current) fit(); }, [loading, draft?.id]);
  React.useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const observer = new ResizeObserver(() => setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight }));
    observer.observe(canvas); return () => observer.disconnect();
  }, [loading, draft?.id]);
  React.useLayoutEffect(() => {
    const track = toolsRef.current?.querySelector<HTMLElement>(".core-sliding-tabs"), active = track?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!track || !active) return;
    if (active.offsetLeft < track.scrollLeft) track.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > track.scrollLeft + track.clientWidth) track.scrollLeft = active.offsetLeft + active.offsetWidth - track.clientWidth + 4;
  }, [mode, canvasSize.width]);
  const activeCardId = editing ?? expanded, activeCard = draft?.nodes.find((n) => n.id === activeCardId);
  const editorHeight = activeCard ? mindMapNodeRect(activeCard, true).height : 0;
  React.useLayoutEffect(() => {
    if (!activeCardId) return; const current = draftRef.current?.nodes.find((n) => n.id === activeCardId), canvas = canvasRef.current;
    if (!current || !canvas) { setEditing(null); setExpanded(null); return; }
    const card = mindMapNodeRect(current, true), showPlus = !editing && selection.kind === "node" && selection.ids.length === 1 && selection.ids[0] === current.id && !connecting && !multipleSelection;
    const r = showPlus ? { ...card, x: card.x - (current.side === "left" ? 52 : 0), y: card.y - 48, width: card.width + 52, height: card.height + 48 } : card;
    const zoom = Math.min(1.4, (canvas.clientWidth - 32) / r.width, (canvas.clientHeight - 32) / r.height);
    setViewport({ zoom, x: (canvas.clientWidth - r.width * zoom) / 2 - r.x * zoom, y: (canvas.clientHeight - r.height * zoom) / 2 - r.y * zoom });
  }, [activeCardId, canvasSize.width, canvasSize.height, editorHeight, editing, selection.kind, selection.ids.length, connecting, multipleSelection]);
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current; if (!editing || !canvas) return;
    if (editPart === "text") canvas.querySelector<HTMLElement>(`[data-node-id="${editing}"] [contenteditable="true"]`)?.focus();
    else { const input = canvas.querySelector<HTMLInputElement>(`[data-node-id="${editing}"] input`); input?.focus(); input?.select(); }
  }, [editing, editPart]);
  function zoomAt(factor: number, anchor?: MindMapPoint) { const canvas = canvasRef.current; if (!canvas) return; setViewport((v) => { const zoom = Math.min(3, Math.max(0.001, v.zoom * factor)), x = anchor?.x ?? canvas.clientWidth / 2, y = anchor?.y ?? canvas.clientHeight / 2; return { zoom, x: x - (x - v.x) * zoom / v.zoom, y: y - (y - v.y) * zoom / v.zoom }; }); }
  React.useEffect(() => { const canvas = canvasRef.current; if (!canvas || !draft) return; const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey && (e.target as HTMLElement).closest(".rich-text-field,.core-mindmap-note-text,.core-mindmap-inline-source")) return; e.preventDefault(); const r = canvas.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.005), { x: e.clientX - r.left, y: e.clientY - r.top }); else setViewport((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })); }; canvas.addEventListener("wheel", wheel, { passive: false }); return () => canvas.removeEventListener("wheel", wheel); }, [loading, draft?.id]);
  function worldPoint(client: MindMapPoint) { const r = canvasRef.current!.getBoundingClientRect(), v = viewportRef.current; return { x: (client.x - r.left - v.x) / v.zoom, y: (client.y - r.top - v.y) / v.zoom }; }
  function centerPoint() { const c = canvasRef.current!, v = viewportRef.current; return { x: (c.clientWidth / 2 - v.x) / v.zoom - 110, y: (c.clientHeight / 2 - v.y) / v.zoom - 44 }; }
  function beginEdit(id: string, text = false) { editStartedRef.current = performance.now(); setMultipleSelection(false); setEditPart(text || draftRef.current?.nodes.find((n) => n.id === id)?.kind === "freeText" ? "text" : "title"); setSelection({ kind: "node", ids: [id] }); setMode("edit"); setEditing(id); setExpanded(id); setConnecting(false); setSourceOpen(false); }
  function addNode(relation: "root" | "sibling" | "child", kind: MindMapNode["kind"] = "keyword", position?: MindMapPoint) { if (!draftRef.current || !canvasRef.current) return; run(() => { const r = addMindMapRelativeNode(draftRef.current!, node?.id ?? null, relation, kind, position ?? centerPoint()); update(r.node.zoneId ? r.map : placeMindMapNode(r.map, r.node.id)); beginEdit(r.node.id, kind === "freeText"); }); }
  function select(kind: MindMapElementKind, id: string, multiple = false) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    multiple ||= multipleSelection && kind === "node";
    if (connecting && (kind === "node" || kind === "zone")) { if (linkFrom && linkFrom !== id) { run(() => update(connectMindMapElements(draftRef.current!, linkFrom, id))); setLinkFrom(null); } else setLinkFrom(id); }
    setSelection((s) => ({ kind, ids: multiple && kind === "node" && s.kind === kind ? s.ids.includes(id) ? s.ids.filter((key) => key !== id) : [...s.ids, id] : [id] }));
    if (editing !== id) setEditing(null); if (expanded !== id) setExpanded(null); setSourceOpen(false);
  }
  function startGesture(event: React.PointerEvent, target?: Gesture["target"], resize?: Gesture["resize"]) {
    if (event.button !== 0 || gestureRef.current || !draftRef.current || event.shiftKey || event.ctrlKey || event.metaKey) return;
    event.stopPropagation(); suppressClick.current = false;
    if (!target && editing && performance.now() - editStartedRef.current < 500) { event.preventDefault(); return; }
    if (multipleSelection && target?.kind === "node") return;
    if (!resize && mode === "design" && (target?.kind === "zone" || target?.kind === "boundary")) target = undefined;
    if ((event.target as HTMLElement).closest("input,textarea,[contenteditable='true']")) return;
    const start = { x: event.clientX, y: event.clientY }, points = !target && mode === "design" && designTool === "pen" ? [worldPoint(start)] : undefined;
    gestureRef.current = { pointer: event.pointerId, start, viewport: viewportRef.current, before: draftRef.current, target, resize, moved: false, points };
    event.currentTarget.setPointerCapture(event.pointerId); if (points) setInk(points);
  }
  function moveGesture(event: React.PointerEvent) {
    const g = gestureRef.current; if (!g || g.pointer !== event.pointerId) return;
    const dx = event.clientX - g.start.x, dy = event.clientY - g.start.y, delta = { x: dx / g.viewport.zoom, y: dy / g.viewport.zoom };
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (g.points) { if (g.points.length < 20_000) g.points.push(worldPoint({ x: event.clientX, y: event.clientY })); setInk([...g.points]); }
    else if (g.resize?.kind === "zone" && g.moved) update(resizeMindMapZone(g.before, g.resize.id, g.resize.corner, delta), false);
    else if (g.resize?.kind === "summary" && g.moved) update(resizeMindMapSummary(g.before, g.resize.id, g.resize.end, worldPoint({ x: event.clientX, y: event.clientY }).y), false);
    else if (g.target && g.moved) update(moveMindMapElement(g.before, g.target.kind, g.target.id, delta), false);
    else if (!g.target) setViewport({ ...g.viewport, x: g.viewport.x + dx, y: g.viewport.y + dy });
  }
  function finishGesture(event: React.PointerEvent, cancelled = false) {
    const g = gestureRef.current; if (!g || g.pointer !== event.pointerId) return; gestureRef.current = null; suppressClick.current = g.moved;
    if (cancelled) { update(g.before, false); setViewport(g.viewport); setInk([]); return; }
    if (g.points) {
      if (g.points.length === 1) g.points.push({ x: g.points[0].x + 0.01, y: g.points[0].y });
      const start = g.points[0], current = draftRef.current!, z = [...current.zones].sort((a, b) => a.layer - b.layer).reverse().find((zone) => { const r = mindMapZoneRect(current, zone); return !zone.collapsed && start.x >= r.x && start.x <= r.x + r.width && start.y >= r.y && start.y <= r.y + r.height; });
      update({ ...current, strokes: [...current.strokes, { id: `stroke_${crypto.randomUUID()}`, points: g.points, color: penColor, width: penWidth, ...(z ? { zoneId: z.id } : {}) }] }); setInk([]);
    } else if (g.moved && (g.target || g.resize)) { if (g.target?.kind === "node") update(placeMindMapNode(draftRef.current!, g.target.id), false); setHistory((h) => ({ past: [...h.past.slice(-49), g.before], future: [] })); }
    else if (!g.target && mode === "design" && designTool === "text") { suppressClick.current = true; if (node && node.kind !== "freeText") beginEdit(node.id, true); else addNode("root", "freeText", worldPoint(g.start)); }
    else if (!g.target && !g.moved) { setSelection({ kind: "node", ids: [] }); setEditing(null); setExpanded(null); }
  }
  function addImages(files: File[], id: string) {
    setReadingImages(true); setNotice(""); setError("");
    const task = (async () => {
      try {
        const images = await readMindMapImages(files), current = draftRef.current, n = current?.nodes.find((n) => n.id === id);
        if (!current || !n) return false;
        if ((n.images?.length ?? 0) + images.length > 4) throw new Error("Pro Kasten sind bis zu vier Bilder möglich.");
        update(editMindMapNode(current, id, { images: [...(n.images ?? []), ...images] })); setExpanded(id); return true;
      } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Das Bild konnte nicht hinzugefügt werden."); return false; }
      finally { setReadingImages(false); pendingImagesRef.current = null; }
    })();
    pendingImagesRef.current = task; return task;
  }
  function createExtra(kind: "summary" | "boundary") { run(() => { const ids = selection.kind === "node" ? selection.ids : [], r = kind === "summary" ? createMindMapSummary(draftRef.current!, ids) : createMindMapBoundary(draftRef.current!, ids); update(r.map); setSelection({ kind, ids: [r.id] }); setMultipleSelection(false); setEditing(null); setMode("edit"); }); }
  function removeSelected(withContent = false) { if (!draftRef.current || !primary) return; let next = draftRef.current; for (const id of selection.ids) next = removeMindMapElement(next, selection.kind, id, withContent); update(next); setSelection({ kind: "node", ids: [] }); setEditing(null); setExpanded(null); }
  function propertyControls() {
    if (node?.kind === "freeText") return <IconButton icon={Trash2} label="Text entfernen" variant="destructive" onClick={() => removeSelected()}/>;
    if (node) return <>
      {!draft!.summaries.some((item) => item.nodeId === node.id) && <ColorControl label="Kastenfarbe" value={mindMapNodeColor(draft!, node).color} onChange={(color) => editNode({ color })}/>}
      <CoreSegmentedControl ariaLabel="Kastenart" value={node.kind} onValueChange={(kind) => editNode({ kind })} options={[{ value: "keyword", label: "Stichwortkarte" }, { value: "text", label: "Textkarte" }]}/>
      <label className="core-mindmap-image-upload core-action-secondary rounded-control"><ImagePlus size={18} aria-hidden="true"/><span>Bild hinzufügen</span><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Bild hinzufügen" disabled={(node.images?.length ?? 0) >= 4} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) void addImages(files, node.id); }}/></label>
      <IconButton icon={Trash2} label="Karte entfernen" variant="destructive" onClick={() => removeSelected()}/>
    </>;
    if (boundary || zone) { const item = boundary ?? zone!, change = boundary ? editBoundary : editZone; return <>
      <label className="core-field-group core-mindmap-compact-field"><span className="core-caption">{boundary ? "Beschriftung" : "Zonentitel"}</span><input className="core-field-input" aria-label={boundary ? "Umrandung beschriften" : "Zonentitel"} maxLength={120} value={boundary ? boundary.label : zone!.title} onChange={(e) => boundary ? editBoundary({ label: e.target.value }) : editZone({ title: e.target.value })}/></label>
      <ColorControl label="Rahmenfarbe" value={item.color} onChange={(color) => change({ color })}/><ColorControl label="Hintergrundfarbe" value={item.fillColor} onChange={(fillColor) => change({ fillColor })}/>
      <label className="core-field-group core-mindmap-compact-field"><span className="core-caption">Transparenz</span><input type="range" min={0} max={100} aria-label="Transparenz" value={Math.round((1 - (item.opacity ?? 0.08)) * 100)} onChange={(e) => change({ opacity: 1 - Number(e.target.value) / 100 })}/></label>
      <CoreSegmentedControl ariaLabel="Rahmenstärke" value={String(item.strokeWidth ?? 2)} options={[{ value: "2", label: "Fein" }, { value: "4", label: "Mittel" }, { value: "8", label: "Dick" }]} onValueChange={(value) => change({ strokeWidth: Number(value) as 2 | 4 | 8 })}/>
      {boundary && <CoreSelect ariaLabel="Rahmenform" value={boundary.shape} options={[{ value: "rectangle", label: "Rechteck" }, { value: "rounded", label: "Abgerundet" }, { value: "ellipse", label: "Ellipse" }]} onValueChange={(shape) => editBoundary({ shape: shape as NonNullable<typeof boundary>["shape"] })}/>}
      {zone && <><label className="flex min-h-11 items-center gap-2 core-body"><input type="checkbox" checked={zone.autoSize} onChange={(e) => e.target.checked ? editZone({ autoSize: true }) : update(resizeMindMapZone(draft!, zone.id, "se", { x: 0, y: 0 }))}/>Größe an Inhalt anpassen</label><IconButton icon={zone.collapsed ? ChevronDown : ChevronUp} label={zone.collapsed ? "Zone ausklappen" : "Zone einklappen"} onClick={() => editZone({ collapsed: !zone.collapsed })}/><IconButton icon={Copy} label="Zone mit Inhalt duplizieren" onClick={() => run(() => { const r = duplicateMindMapZone(draft!, zone.id); update(r.map); setSelection({ kind: "zone", ids: [r.id] }); })}/><IconButton icon={ChevronUp} label="Zone nach vorne" onClick={() => update(setMindMapZoneLayer(draft!, zone.id, "front"))}/><IconButton icon={ChevronDown} label="Zone nach hinten" onClick={() => update(setMindMapZoneLayer(draft!, zone.id, "back"))}/><IconButton icon={Trash2} variant="destructive" label="Zone mit Inhalt löschen" onClick={() => setDeleteZone(zone.id)}/></>}
      <ActionButton variant="destructive" icon={Trash2} onClick={() => removeSelected()}>{boundary ? "Umrandung entfernen" : "Nur Zone entfernen"}</ActionButton>
    </>; }
    if (bracket) return <><ActionButton variant="secondary" icon={Pencil} onClick={() => beginEdit(bracket.nodeId)}>Zusammenfassung bearbeiten</ActionButton><ActionButton variant="destructive" icon={Trash2} onClick={() => removeSelected()}>Zusammenfassung entfernen</ActionButton></>;
    return null;
  }
  if (loading) return <StatusMessage tone="info" announce="polite">Mindmap wird geladen …</StatusMessage>;
  if (loadError) return <div className="grid gap-3"><StatusMessage tone="error">{loadError}</StatusMessage><ActionButton variant="secondary" onClick={() => setRetry((r) => r + 1)}>Erneut laden</ActionButton></div>;
  if (!draft) return null;
  const collapsed = new Set(draft.zones.filter((z) => z.collapsed).map((z) => z.id)), layers = new Map(draft.zones.map((z) => [z.id, z.layer]));
  const byZoneLayer = (a: { zoneId?: string }, b: { zoneId?: string }) => (layers.get(a.zoneId ?? "") ?? -1) - (layers.get(b.zoneId ?? "") ?? -1);
  const visibleNodes = draft.nodes.filter((n) => !n.zoneId || !collapsed.has(n.zoneId)).sort(byZoneLayer);
  const endpoint = (id: string): { id: string; rect: MindMapRect } | undefined => { const n = draft.nodes.find((n) => n.id === id), z = draft.zones.find((z) => z.id === (n?.zoneId && collapsed.has(n.zoneId) ? n.zoneId : id)); return z ? { id: z.id, rect: mindMapZoneRect(draft, z) } : n ? { id: n.id, rect: mindMapNodeRect(n, n.id === editing || n.id === expanded) } : undefined; };
  const visibleStrokes = draft.strokes.filter((s) => !s.zoneId || !collapsed.has(s.zoneId)).sort(byZoneLayer);
  return <section className="core-mindmap-panel min-w-0" data-testid="deck-mindmaps-panel" aria-label="Mindmaps" aria-busy={busy || readingImages}>
    {error && <div className="grid gap-2"><StatusMessage tone="error" announce="assertive">{error}</StatusMessage>{saveFailed && <ActionButton variant="secondary" onClick={() => { setError(""); void persist(); }}>Erneut speichern</ActionButton>}</div>}
    {readingImages && <StatusMessage tone="info" announce="polite">Bilder werden geladen …</StatusMessage>}
    <div className="grid min-w-0 gap-3" inert={readingImages}>
      <div ref={toolsRef} className="core-mindmap-primary-tools" aria-label="Mindmap-Werkzeuge"><ActionButton variant="secondary" icon={Plus} onClick={() => addNode("root")}>Stichwort</ActionButton><ActionButton variant="secondary" icon={StickyNote} onClick={() => addNode("root", "text")}>Textfeld</ActionButton><CoreSlidingTabs ariaLabel="Mindmap-Werkzeug" value={mode} onValueChange={(value) => { const next = value === mode ? "idle" : value; setMode(next); if (next !== "add") setMultipleSelection(false); setConnecting(next === "connect"); setLinkFrom(null); if (next !== "edit") { setEditing(null); setExpanded(null); } else if (node) beginEdit(node.id); }} options={[{ value: "connect", label: "Verknüpfen", icon: Link2 }, { value: "edit", label: "Karte bearbeiten", icon: StickyNote }, { value: "design", label: "Gestalten", icon: Pencil }, { value: "add", label: "Hinzufügen", icon: Plus }]}/><IconButton icon={Undo2} label="Rückgängig" disabled={!history.past.length} onClick={() => travel("past")}/><IconButton icon={Redo2} label="Wiederholen" disabled={!history.future.length} onClick={() => travel("future")}/><ActionButton className="core-mindmap-source-action" variant="secondary" icon={FileText} aria-expanded={createFromSummary} onClick={() => setCreateFromSummary(!createFromSummary)}>Aus Zusammenfassung</ActionButton></div>
      {mode === "connect" && <SoftPanel className="core-mindmap-tools" aria-label="Verbindungen"><CoreSegmentedControl ariaLabel="Verbindungslinien" value={draft.connectionColor} onValueChange={(connectionColor) => update({ ...draft, connectionColor })} options={[{ value: "gray", label: "Graue Linien" }, { value: "node", label: "Kastenfarben" }]}/></SoftPanel>}
      {mode === "add" && <SoftPanel className="core-mindmap-tools" aria-label="Zusätzliche Elemente"><ActionButton variant={multipleSelection ? "primary" : "secondary"} icon={MousePointer2} aria-pressed={multipleSelection} onClick={() => { setMultipleSelection(!multipleSelection); setSelection({ kind: "node", ids: [] }); setEditing(null); setExpanded(null); }}>Mehrfachauswahl</ActionButton><ActionButton variant="secondary" icon={Network} onClick={() => createExtra("summary")}>Zusammenfassung</ActionButton><ActionButton variant="secondary" icon={Scan} onClick={() => createExtra("boundary")}>Umrandung</ActionButton></SoftPanel>}
      {mode === "design" && <SoftPanel className="core-mindmap-tools" aria-label="Gestaltungswerkzeuge"><CoreSegmentedControl ariaLabel="Gestalten" value={designTool} onValueChange={(tool) => { setDesignTool(tool); if (tool === "text" && node) beginEdit(node.id, true); }} options={[{ value: "pen", label: "Zeichnen", icon: Pencil }, { value: "erase", label: "Radieren", icon: Eraser }, { value: "text", label: "Schreiben", icon: Type }]}/>{designTool === "pen" && <><ColorControl label="Stiftfarbe" value={penColor} onChange={setPenColor}/><CoreSegmentedControl ariaLabel="Strichstärke" value={String(penWidth)} onValueChange={(v) => setPenWidth(Number(v) as 2 | 4 | 8)} options={[{ value: "2", label: "Fein" }, { value: "4", label: "Mittel" }, { value: "8", label: "Dick" }]}/></>}</SoftPanel>}
      {mode === "edit" && primary && <SoftPanel className="core-mindmap-tools" aria-label="Elementeigenschaften">{propertyControls()}{node && <IconButton icon={Check} label="Bearbeitung abschließen" onClick={() => { setEditing(null); setExpanded(null); setMode("idle"); }}/>}</SoftPanel>}
      <div ref={setToolbarHost} className="core-mindmap-text-toolbar"/>
      {connecting && <p className="core-caption text-core-muted" role="status">{linkFrom ? "Jetzt das zweite Element wählen." : "Zwei Elemente wählen, um sie zu verbinden oder zu trennen."}</p>}
      {createFromSummary && <SoftPanel className="grid gap-3 p-4" aria-label="Mindmap aus Zusammenfassung"><CoreSelect ariaLabel="Zusammenfassung für Mindmap" value={summaryId} options={summaries.map((s) => ({ value: s.id, label: s.title }))} onValueChange={setSummaryId}/><div className="flex flex-wrap gap-2"><ActionButton variant="primary" disabled={!summaryId} onClick={() => run(() => { const source = summaries.find((s) => s.id === summaryId); if (source) { const next = appendMindMap(draft, mindMapFromSummary(source)); update(next); setCreateFromSummary(false); setEditing(null); requestAnimationFrame(() => fit(next)); } })}>Mindmap hinzufügen</ActionButton><ActionButton variant="secondary" onClick={() => setCreateFromSummary(false)}>Abbrechen</ActionButton></div>{!summaries.length && <p className="core-body">Speichere zuerst eine Zusammenfassung.</p>}</SoftPanel>}
      <div className="core-mindmap-canvas rounded-panel border border-core-border" ref={canvasRef} data-testid="mindmap-canvas" data-tool={mode === "design" ? designTool : mode} tabIndex={0} aria-label="Unendliche Mindmap-Fläche" onPointerDown={(e) => startGesture(e)} onPointerMove={moveGesture} onPointerUp={(e) => finishGesture(e)} onPointerCancel={(e) => finishGesture(e, true)} onDoubleClick={(e) => { if (e.target === e.currentTarget && mode === "idle") addNode("root", "keyword", worldPoint({ x: e.clientX, y: e.clientY })); }} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Escape") { e.stopPropagation(); setEditing(null); setExpanded(null); setSelection({ kind: "node", ids: [] }); setMode("idle"); setConnecting(false); } const d = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[e.key]; if (d) { e.preventDefault(); setViewport((v) => ({ ...v, x: v.x + d[0], y: v.y + d[1] })); } }} style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${Math.max(16, 24 * viewport.zoom)}px ${Math.max(16, 24 * viewport.zoom)}px` }}>
        <div className="core-mindmap-stage" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          {[...draft.zones].sort((a, b) => a.layer - b.layer).map((item) => { const r = mindMapZoneRect(draft, item), selected = selection.kind === "zone" && primary === item.id; return <div key={item.id} className={`core-mindmap-zone${selected ? " is-selected" : ""}`} data-testid="mindmap-zone" data-zone-id={item.id} onDoubleClick={() => { select("zone", item.id); setMode("edit"); }} style={{ left: r.x, top: r.y, width: r.width, height: r.height, borderColor: inkColor(item.color), borderWidth: item.strokeWidth ?? 2, background: `color-mix(in srgb, ${inkColor(item.fillColor)} ${(item.opacity ?? 0.06) * 100}%, transparent)` }} onPointerDown={(e) => startGesture(e, { kind: "zone", id: item.id })} onClick={() => select("zone", item.id)} onContextMenu={(e) => { e.preventDefault(); select("zone", item.id); setMode("edit"); }}>
            <div className="core-mindmap-zone-heading"><button type="button" className="core-mindmap-zone-title" aria-label={`Zone „${item.title}“ auswählen`} onDoubleClick={() => { select("zone", item.id); setMode("edit"); }}>{item.title || "Zone"}</button><IconButton icon={item.collapsed ? ChevronDown : ChevronUp} label={item.collapsed ? `Zone „${item.title}“ ausklappen` : `Zone „${item.title}“ einklappen`} onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ ...draft, zones: draft.zones.map((z) => z.id === item.id ? { ...z, collapsed: !z.collapsed } : z) })}/></div>
            {selected && !item.collapsed && (["nw", "ne", "sw", "se"] as const).map((corner) => <button key={corner} type="button" className={`core-mindmap-resize-handle at-${corner}`} aria-label={`Zone ${{ nw: "oben links", ne: "oben rechts", sw: "unten links", se: "unten rechts" }[corner]} skalieren`} onPointerDown={(e) => startGesture(e, { kind: "zone", id: item.id }, { kind: "zone", id: item.id, corner })}/>)}
          </div>; })}
          {draft.boundaries.map((item) => { const ids = item.nodeIds.filter((id) => visibleNodes.some((n) => n.id === id)); if (!ids.length) return null; const r = mindMapBoundaryRect(draft, { ...item, nodeIds: ids }); return <div key={item.id} role="button" tabIndex={0} aria-label={`Umrandung „${item.label || "Ohne Titel"}“ auswählen`} data-testid="mindmap-boundary" className={`core-mindmap-boundary shape-${item.shape}${selection.kind === "boundary" && primary === item.id ? " is-selected" : ""}`} style={{ left: r.x, top: r.y, width: r.width, height: r.height, borderColor: item.shape === "ellipse" ? "transparent" : inkColor(item.color), borderWidth: item.strokeWidth ?? 2, background: item.shape === "ellipse" ? "transparent" : `color-mix(in srgb, ${inkColor(item.fillColor)} ${(item.opacity ?? 0.08) * 100}%, transparent)` }} onPointerDown={(e) => startGesture(e, { kind: "boundary", id: item.id })} onClick={() => { select("boundary", item.id); setMode("edit"); }} onKeyDown={(e) => { if (e.key === "Enter") { select("boundary", item.id); setMode("edit"); } }} onContextMenu={(e) => { e.preventDefault(); select("boundary", item.id); setMode("edit"); }}>{item.shape === "ellipse" && <svg className="core-mindmap-boundary-ellipse" viewBox={`0 0 ${r.width} ${r.height}`} preserveAspectRatio="none" aria-hidden="true"><ellipse cx={r.width / 2} cy={r.height / 2} rx={r.width / 2 - (item.strokeWidth ?? 2)} ry={r.height / 2 - (item.strokeWidth ?? 2)} fill={inkColor(item.fillColor)} fillOpacity={item.opacity ?? 0.08} stroke={inkColor(item.color)} strokeWidth={item.strokeWidth ?? 2}/></svg>}{item.label && <span className="core-mindmap-group-label">{item.label}</span>}</div>; })}
          <svg className="core-mindmap-lines" aria-hidden="true"><g className="core-mindmap-hierarchy">{draft.nodes.filter((n) => n.parentId).map((child) => { const from = endpoint(child.parentId!), to = endpoint(child.id); return from && to && from.id !== to.id ? <path key={child.id} d={connectionPath(from.rect, to.rect)} style={{ stroke: edgeColor(draft, child.id) }}/> : null; })}</g><g className="core-mindmap-edges">{draft.edges.map((edge) => { const from = endpoint(edge.from), to = endpoint(edge.to); return from && to && from.id !== to.id ? <path key={`${edge.from}:${edge.to}`} d={connectionPath(from.rect, to.rect)} style={{ stroke: edgeColor(draft, edge.to) }}/> : null; })}</g>
            {visibleStrokes.map((stroke) => <g key={stroke.id} className="core-mindmap-ink" style={{ "--mindmap-ink": inkColor(stroke.color) } as React.CSSProperties} data-color={stroke.color ?? "default"}><polyline style={{ strokeWidth: stroke.width ?? 3 }} points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}/>{mode === "design" && designTool === "erase" && <polyline className="core-mindmap-eraser-hit" points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")} onPointerDown={(e) => { e.stopPropagation(); update({ ...draft, strokes: draft.strokes.filter((s) => s.id !== stroke.id) }); }}/>}</g>)}
            {ink.length > 0 && <polyline className="core-mindmap-ink-preview" style={{ stroke: inkColor(penColor), strokeWidth: penWidth }} points={ink.map((p) => `${p.x},${p.y}`).join(" ")}/>}
          </svg>
          {draft.summaries.map((item) => { const ids = item.nodeIds.filter((id) => visibleNodes.some((n) => n.id === id)); if (!ids.length) return null; const r = mindMapSummaryRect(draft, { nodeIds: ids }), target = endpoint(item.nodeId); if (!target) return null; const x = item.side === "right" ? r.x + r.width + 16 : r.x - 16, sign = item.side === "right" ? -1 : 1, cy = r.y + r.height / 2, selected = selection.kind === "summary" && primary === item.id; return <div key={item.id} className={`core-mindmap-summary${selected ? " is-selected" : ""}`} data-testid="mindmap-summary"><svg className="core-mindmap-lines"><path className="core-mindmap-summary-line" d={`M ${x} ${r.y} C ${x - sign * 24} ${r.y}, ${x - sign * 24} ${r.y + r.height}, ${x} ${r.y + r.height} M ${x - sign * 18} ${cy} L ${item.side === "right" ? target.rect.x : target.rect.x + target.rect.width} ${target.rect.y + target.rect.height / 2}`} onPointerDown={(e) => { e.stopPropagation(); select("summary", item.id); setMode("edit"); }}/></svg><button type="button" className="core-mindmap-summary-select rounded-control" style={{ left: x - sign * 18 - 20, top: cy - 20 }} aria-label="Zusammenfassung auswählen" onPointerDown={(e) => e.stopPropagation()} onClick={() => { select("summary", item.id); setMode("edit"); }}><Network size={16}/></button>{selected && (["start", "end"] as const).map((end) => <button key={end} type="button" className="core-mindmap-summary-handle rounded-round" aria-label={`Zusammenfassung ${end === "start" ? "oben" : "unten"} erweitern`} style={{ left: x - 12, top: (end === "start" ? r.y : r.y + r.height) - 12 }} onPointerDown={(e) => startGesture(e, { kind: "summary", id: item.id }, { kind: "summary", id: item.id, end })}/> )}</div>; })}
          {visibleNodes.map((item) => { const selected = selection.kind === "node" && selection.ids.includes(item.id), isEditing = item.id === editing, isExpanded = isEditing || expanded === item.id, r = mindMapNodeRect(item, isExpanded), source = mindMapNodeSource(draft, item); return <div key={item.id} role="button" tabIndex={0} className={`core-mindmap-node rounded-control shadow-soft${item.kind === "freeText" ? " is-free-text" : item.kind === "text" ? " is-text" : " is-keyword"}${selected ? " is-selected" : ""}${isExpanded ? " is-expanded" : ""}${isEditing ? " is-editing" : ""}${linkFrom === item.id ? " is-link-source" : ""}`} style={{ ...nodeStyle(draft, item), left: item.x, top: item.y, width: r.width, height: r.height }} data-testid={item.kind === "freeText" ? "mindmap-free-text" : "mindmap-node"} data-node-id={item.id} data-color={mindMapNodeColor(draft, item).color} aria-label={`${item.kind === "freeText" ? "Freier Text" : item.kind === "keyword" ? "Stichwort" : "Textkarte"} „${item.label}“ auswählen`} aria-pressed={selected} onPointerDown={(e) => startGesture(e, { kind: "node", id: item.id })} onClick={(e) => select("node", item.id, e.shiftKey || e.ctrlKey || e.metaKey)} onDoubleClick={(e) => { e.stopPropagation(); if (!isEditing) beginEdit(item.id, item.kind !== "keyword" && !(e.target as HTMLElement).closest(".core-mindmap-node-label")); }} onContextMenu={(e) => { e.preventDefault(); select("node", item.id); setMode("add"); }} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); beginEdit(item.id); } if (e.key === "Escape") { e.stopPropagation(); setEditing(null); setExpanded(null); } const d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key]; if (d && !isEditing && !connecting) { e.preventDefault(); e.stopPropagation(); update(placeMindMapNode(moveMindMapElement(draft, "node", item.id, { x: d[0], y: d[1] }), item.id)); } }}>
            {isEditing ? <div className="core-mindmap-inline-editor" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>{item.kind !== "freeText" && <input className="core-mindmap-inline-title" aria-label="Kartentitel bearbeiten" maxLength={120} value={item.label} onPointerDown={(e) => { if (hasDefaultTitle(item)) { e.preventDefault(); e.currentTarget.focus(); e.currentTarget.select(); } }} onClick={(e) => { if (hasDefaultTitle(item)) { e.preventDefault(); e.currentTarget.select(); } }} onChange={(e) => update(editMindMapNode(draftRef.current!, item.id, { label: e.target.value }))}/>}<RichTextEditor value={item.html ?? textToCardHtml(item.text)} ariaLabel={item.kind === "freeText" ? "Text auf der Fläche bearbeiten" : "Kartentext bearbeiten"} isActive showAllTools toolbarHost={toolbarHost} minHeightClass="min-h-32" onChange={(html) => update(editMindMapNode(draftRef.current!, item.id, { html }))}/></div> : <>{item.kind !== "freeText" && <span className="core-mindmap-node-label core-body" onPointerDown={(e) => { if (hasDefaultTitle(item) && !connecting && !multipleSelection && !e.shiftKey && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }} onClick={(e) => { if (hasDefaultTitle(item) && !connecting && !multipleSelection && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.stopPropagation(); beginEdit(item.id); } }}>{item.label || "Ohne Titel"}</span>}{item.kind === "keyword" && <span className="core-mindmap-node-icons text-core-muted">{Boolean(item.text.trim() || item.sourceText?.trim()) && <button type="button" aria-label="Text anzeigen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); select("node", item.id); setExpanded(expanded === item.id ? null : item.id); }}><FileText size={16}/></button>}{Boolean(item.images?.length) && <button type="button" aria-label="Bilder anzeigen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); select("node", item.id); setExpanded(expanded === item.id ? null : item.id); }}><ImageIcon size={16}/></button>}</span>}{(item.kind !== "keyword" || isExpanded) && <div className="core-mindmap-note-text core-body" dangerouslySetInnerHTML={{ __html: item.html ?? textToCardHtml(item.text) }}/>}</>}
            {(item.kind === "text" || isExpanded) && Boolean(item.images?.length) && <div className="core-mindmap-node-images">{item.images!.map((image) => <div key={image.id} className="relative"><img src={image.dataUrl} alt={image.name} draggable={false}/>{isEditing && <button type="button" className="core-mindmap-image-remove rounded-round" aria-label={`Bild „${image.name}“ entfernen`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); update(editMindMapNode(draftRef.current!, item.id, { images: item.images!.filter((n) => n.id !== image.id) })); }}><X size={14}/></button>}</div>)}</div>}
            {isExpanded && source && item.sourceText !== undefined && <details className="core-mindmap-inline-source" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}><summary>Text aus der Zusammenfassung</summary><p data-testid="mindmap-source-passage">{item.sourceText}</p><button type="button" onClick={() => setSourceOpen(!sourceOpen)}>Quelle: {source.title}</button>{sourceOpen && <div><p>Gespeicherte Fassung vom {new Date(source.updatedAt).toLocaleDateString("de-DE")}</p>{source.text}</div>}</details>}
            {item.kind !== "freeText" && selected && !isEditing && !connecting && !multipleSelection && selection.ids.length === 1 && <><button type="button" className="core-mindmap-node-add at-sibling rounded-round" aria-label="Stichwort auf gleicher Ebene hinzufügen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addNode("sibling"); }}><Plus size={18}/></button><button type="button" className={`core-mindmap-node-add at-child ${item.side === "left" ? "to-left" : "to-right"} rounded-round`} aria-label="Unterknoten hinzufügen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addNode("child"); }}><Plus size={18}/></button></>}
          </div>; })}
        </div>
        {!draft.nodes.length && !draft.zones.length && !draft.strokes.length && <div className="core-mindmap-empty" onPointerDown={(e) => e.stopPropagation()}><Network size={32}/><p className="core-body-large">Deine Infinity Map</p><ActionButton variant="secondary" icon={Plus} onClick={() => addNode("root")}>Erstes Thema</ActionButton></div>}
        <div className="core-mindmap-zoom rounded-control border border-core-border bg-core-surface shadow-soft" onPointerDown={(e) => e.stopPropagation()}><IconButton icon={Minus} label="Verkleinern" onClick={() => zoomAt(1 / 1.2)}/><span className="core-caption tabular-nums">{Math.round(viewport.zoom * 100)} %</span><IconButton icon={Plus} label="Vergrößern" onClick={() => zoomAt(1.2)}/><IconButton icon={Maximize} label="Alles anzeigen" onClick={() => { setEditing(null); setExpanded(null); fit(); }}/></div>
      </div>
      {notice && <p className="sr-only" role="status">{notice}</p>}
    </div>
    <ActionDialog open={Boolean(deleteZone)} title="Zone mit Inhalt löschen?" description="Die Zone und alle darin enthaltenen Karten und Zeichnungen werden entfernt. Du kannst dies rückgängig machen." confirmLabel="Zone mit Inhalt löschen" cancelLabel="Abbrechen" destructive onCancel={() => setDeleteZone(null)} onConfirm={() => { if (deleteZone) { update(removeMindMapElement(draftRef.current!, "zone", deleteZone, true)); setSelection({ kind: "node", ids: [] }); setEditing(null); } setDeleteZone(null); }}/>
  </section>;
}
