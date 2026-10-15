import React from "react";
import { Check, Copy, Eraser, FileText, Maximize2, Minimize2, ImagePlus, Sparkles, Image as ImageIcon, Link2, Maximize, Minus, MousePointer2, Network, Palette, Pencil, Plus, Redo2, Scan, StickyNote, Trash2, Type, Undo2, X } from "lucide-react";
import type { SummaryGenerationInput, SummaryGenerationResult } from "../aiLearningSummary.ts";
import type { CardDraftGuard } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { createLearningSummary, createSummarySettings, loadLearningSummaries, saveLearningSummary, summaryChoices, type LearningSummary, type SummarySettings } from "../learningSummaries.ts";
import { MIND_MAP_LIMITS, addMindMapFromSummary, addMindMapRelativeNode, connectMindMapElements, copyMindMapNodes, createMindMapBoundary, createMindMapSummary, editMindMapNode, loadInfinityMindMap, mindMapBounds, mindMapBoundaryRect, mindMapColors, mindMapLimitError, mindMapNeighbor, mindMapNodeColor, mindMapNodeDirection, mindMapNodeRect, mindMapNodeSource, mindMapSummaryRect, mindMapSummaryTree, moveMindMapElement, pasteMindMapNodes, readMindMapImages, stepMindMapSummary, removeMindMapElement, replaceMindMapFromSummary, resizeMindMapSummary, saveLearningMindMap, type LearningMindMap, type MindMapClipboard, type MindMapColor, type MindMapElementKind, type MindMapNode, type MindMapPoint, type MindMapRect } from "../learningMindMaps.ts";
import { textToCardHtml } from "../richText.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl, CoreSlidingTabs, SoftPanel } from "../ui/coreUi.tsx";
import { ColorPopover, highlightPaletteColors, normalizeColor } from "../ui/colorPicker.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";

interface DeckMindMapsPanelProps { deck: Deck; userId: string; onGenerateSummary?: (input: SummaryGenerationInput, signal: AbortSignal) => Promise<SummaryGenerationResult>; onDraftStateChange: (guard: CardDraftGuard | null) => void; }
type Mode = "idle" | "connect" | "edit" | "design" | "add";
type Selection = { kind: MindMapElementKind; ids: string[] };
type Viewport = MindMapPoint & { zoom: number };
type Gesture = { pointer: number; start: MindMapPoint; viewport: Viewport; before: LearningMindMap; moved: boolean; target?: { kind: MindMapElementKind; id: string }; points?: MindMapPoint[]; resize?: { kind: "summary"; end: "start" | "end"; id: string }; };
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Strg";
const SHORTCUTS: Array<[string, Array<[string, string]>]> = [
  ["Auswählen und Bewegen", [["Pfeiltasten", "Zwischen Karten wechseln; ohne Auswahl die Fläche verschieben"], ["Alt + Pfeiltaste", "Auswahl verschieben, mit ⇧ in großen Schritten"], [`${MOD} + A`, "Alle Karten auswählen"], ["Escape", "Bearbeitung beenden, Auswahl aufheben, Modus verlassen"]]],
  ["Bearbeiten", [["Enter oder F2", "Karte bearbeiten"], [`${MOD} + Enter`, "Unterknoten anlegen"], ["⇧ + Enter", "Geschwister anlegen"], ["Entf", "Auswahl entfernen"], [`${MOD} + C / ${MOD} + V`, "Kopieren und einfügen"], [`${MOD} + D`, "Duplizieren"], [`${MOD} + Z / ${MOD} + Y`, "Rückgängig und wiederholen"], ["Enter oder Leertaste", "Im Modus Verknüpfen Quelle und Ziel wählen"]]],
  ["Ansicht", [["+ / −", "Vergrößern und verkleinern"], ["0", "100 %"], ["⇧ + 1", "Alles anzeigen"], ["?", "Diese Übersicht"]]],
];
function hasDefaultTitle(node: MindMapNode) { return node.label === "Neue Notiz" || node.label === "Neues Stichwort"; }
const colorTokens: Record<string, string> = { default: "var(--core-text)", blue: "var(--core-info)", purple: "var(--core-success)", yellow: "var(--core-warning)", red: "var(--core-danger)" };
function inkColor(color: MindMapColor = "default") { return colorTokens[color] ?? color; }
function nodeStyle(map: LearningMindMap, node: MindMapNode): React.CSSProperties {
  const a = mindMapNodeColor(map, node), intensity = a.strength;
  return { "--mindmap-ink": inkColor(a.color), "--mindmap-surface": a.color === "default" ? "var(--core-surface-raised)" : `color-mix(in srgb, ${inkColor(a.color)} ${intensity}%, var(--core-surface))` } as React.CSSProperties;
}
function edgeColor(map: LearningMindMap, target: MindMapNode | undefined) {
  const color = target ? mindMapNodeColor(map, target).color : undefined;
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
export function DeckMindMapsPanel({ deck, userId, onGenerateSummary, onDraftStateChange }: DeckMindMapsPanelProps) {
  const [generationScope, setGenerationScope] = React.useState<SummarySettings["scope"]>("tree"), [generating, setGenerating] = React.useState(false);
  const generationRef = React.useRef<AbortController | null>(null), [replaceRequest, setReplaceRequest] = React.useState<{ summary: LearningSummary; cards: number } | null>(null);
  const [summaries, setSummaries] = React.useState<LearningSummary[]>([]), [summaryId, setSummaryId] = React.useState("");
  const [loading, setLoading] = React.useState(true), [loadError, setLoadError] = React.useState(""), [retry, setRetry] = React.useState(0);
  const [draft, setDraft] = React.useState<LearningMindMap | null>(null), [saved, setSaved] = React.useState<LearningMindMap | null>(null);
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
  const [toolbarHost, setToolbarHost] = React.useState<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const [fullscreen, setFullscreen] = React.useState(false), tapRef = React.useRef<{ id: string; time: number; x: number; y: number } | null>(null), pinchRef = React.useRef<{ start: number; mid: MindMapPoint; viewport: Viewport } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false), clipboardRef = React.useRef<MindMapClipboard | null>(null), textSessionRef = React.useRef<string | null>(null);
  const toolsRef = React.useRef<HTMLDivElement>(null), canvasRef = React.useRef<HTMLDivElement>(null), gestureRef = React.useRef<Gesture | null>(null), suppressClick = React.useRef(false);
  const dirty = draft !== null && draft !== saved;
  const primary = selection.ids.at(-1), node = selection.kind === "node" ? draft?.nodes.find((n) => n.id === primary) : undefined;
  const boundary = selection.kind === "boundary" ? draft?.boundaries.find((n) => n.id === primary) : undefined, bracket = selection.kind === "summary" ? draft?.summaries.find((n) => n.id === primary) : undefined;
  React.useEffect(() => {
    let active = true; setLoading(true); setLoadError("");
    void Promise.allSettled([loadInfinityMindMap(userId, deck.id), loadLearningSummaries(userId, deck.id)]).then(([surface, sources]) => {
      if (!active) return;
      if (surface.status === "fulfilled") { draftRef.current = surface.value; setDraft(surface.value); setSaved(surface.value); setSelection({ kind: "node", ids: [] }); setMultipleSelection(false); setHistory({ past: [], future: [] }); }
      else setLoadError(surface.reason instanceof Error ? surface.reason.message : "Die Mindmap konnte nicht geladen werden.");
      if (sources.status === "fulfilled") { setSummaries(sources.value); setSummaryId(sources.value[0]?.id ?? ""); if (!sources.value.length && onGenerateSummary && surface.status === "fulfilled" && !surface.value.nodes.length) setCreateFromSummary(true); }
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
          if (current === savedRef.current) return true;
          await saveLearningMindMap(userId, current);
          savedRef.current = current; setSaved(current);
          if (draftRef.current === current && !pendingImagesRef.current) { setNotice("Gespeichert"); return true; }
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
  React.useEffect(() => () => generationRef.current?.abort(), []);
  React.useEffect(() => { textSessionRef.current = null; }, [editing]);
  React.useEffect(() => { if (!dirty && !readingImages) return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty, readingImages]);
  function update(next: LearningMindMap, remember = true) { const limit = mindMapLimitError(next); if (limit) { setError(limit); return; } const before = draftRef.current; if (before && remember) setHistory((h) => ({ past: [...h.past.slice(-99), before], future: [] })); const changed = { ...next, updatedAt: new Date().toISOString() }; draftRef.current = changed; setDraft(changed); setSaveFailed(false); setError(""); setNotice(""); }
  function run(action: () => void) { try { action(); } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Änderung konnte nicht übernommen werden."); } }
  function editNode(patch: Partial<MindMapNode>) {
    const current = draftRef.current; if (!current || !primary) return;
    const ids = (selection.kind === "node" ? selection.ids : [primary]).filter((id) => current.nodes.find((n) => n.id === id)?.kind !== "freeText");
    update(ids.reduce((map, id) => editMindMapNode(map, id, patch), current));
  }
  /** Typing in one card is one undo step from opening it until it closes. */
  function editText(id: string, patch: Partial<MindMapNode>) { const first = textSessionRef.current !== id; textSessionRef.current = id; update(editMindMapNode(draftRef.current!, id, patch), first); }
  function duplicateSelected() { const current = draftRef.current; if (!current || selection.kind !== "node" || !selection.ids.length) return; paste(copyMindMapNodes(current, selection.ids)); }
  function paste(clipboard: MindMapClipboard) { run(() => { const r = pasteMindMapNodes(draftRef.current!, clipboard); update(r.map); setSelection({ kind: "node", ids: r.ids }); setEditing(null); setExpanded(null); }); }
  /** Touch has no reliable dblclick or contextmenu (iOS), so double tap and long press are recognised here. */
  function handleTap(e: React.PointerEvent, id: string) {
    if (e.pointerType === "mouse") return;
    const last = tapRef.current;
    if (last && last.id === id && e.timeStamp - last.time < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 10) {
      tapRef.current = null;
      if (editing !== id) beginEdit(id, draftRef.current?.nodes.find((n) => n.id === id)?.kind !== "keyword");
    } else tapRef.current = { id, time: e.timeStamp, x: e.clientX, y: e.clientY };
  }
  function startLongPress(e: React.PointerEvent, id: string) {
    if (e.pointerType === "mouse") return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (event: PointerEvent) => { if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) moved = true; };
    const end = () => { window.clearTimeout(timer); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
    const timer = window.setTimeout(() => { end(); if (moved || pinchRef.current) return; select("node", id); setMode("add"); suppressClick.current = true; }, 500);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  }
  function focusNode(id: string) {
    const n = draftRef.current?.nodes.find((item) => item.id === id), canvas = canvasRef.current; if (!n || !canvas) return;
    const v = viewportRef.current, r = mindMapNodeRect(n), left = r.x * v.zoom + v.x, top = r.y * v.zoom + v.y;
    if (left < 0 || top < 0 || left + r.width * v.zoom > canvas.clientWidth || top + r.height * v.zoom > canvas.clientHeight) setViewport({ ...v, x: canvas.clientWidth / 2 - (r.x + r.width / 2) * v.zoom, y: canvas.clientHeight / 2 - (r.y + r.height / 2) * v.zoom });
    requestAnimationFrame(() => canvas.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] > .core-mindmap-node-select`)?.focus({ preventScroll: true }));
  }
  function editBoundary(patch: Partial<NonNullable<typeof boundary>>) { if (draftRef.current) update({ ...draftRef.current, boundaries: draftRef.current.boundaries.map((n) => n.id === primary ? { ...n, ...patch } : n) }); }
  function travel(direction: "past" | "future") { const items = history[direction], next = items.at(-1), current = draftRef.current; if (!next || !current) return; const other = direction === "past" ? "future" : "past"; setHistory({ ...history, [direction]: items.slice(0, -1), [other]: [...history[other], current] }); update(next, false); setEditing(null); setLinkFrom(null); }
  function buildFromSummary(summary: LearningSummary, mode: "auto" | "replace" | "beside" = "auto") {
    const current = draftRef.current; if (!current) return;
    const tree = mindMapSummaryTree(current, summary.id);
    if (tree && tree.edited && mode === "auto") { setReplaceRequest({ summary, cards: tree.cards }); return; }
    run(() => { const next = tree && mode !== "beside" ? replaceMindMapFromSummary(current, tree.sourceId, summary) : addMindMapFromSummary(current, summary); update(next); setCreateFromSummary(false); setEditing(null); requestAnimationFrame(() => fit(next)); });
  }
  async function generateSummaryAndMap() {
    if (!onGenerateSummary || generationRef.current) return;
    const controller = new AbortController(); generationRef.current = controller; setGenerating(true); setError(""); setNotice("");
    try {
      const title = deck.name.trim().slice(0, 120) || "Zusammenfassung", settings = { ...createSummarySettings(), scope: generationScope };
      const result = await onGenerateSummary({ deckId: deck.id, title, settings, source: null }, controller.signal);
      if (controller.signal.aborted) return;
      const stored = await saveLearningSummary(userId, { ...createLearningSummary(deck.id, title, settings), ...result });
      if (controller.signal.aborted) return;
      setSummaries((items) => [stored, ...items]); setSummaryId(stored.id); buildFromSummary(stored);
    } catch (cause: unknown) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Die Zusammenfassung konnte nicht erstellt werden."); }
    finally { if (generationRef.current === controller) { generationRef.current = null; setGenerating(false); } }
  }
  function fit(map = draftRef.current) {
    const canvas = canvasRef.current; if (!canvas || !map) return;
    const groups = map.boundaries.map((item) => { const r = mindMapBoundaryRect(map, item); return { ...r, y: r.y - (item.label ? 56 : 0), height: r.height + (item.label ? 56 : 0) }; });
    const rects = [...groups, ...map.nodes.map((n) => mindMapNodeRect(n)), ...map.strokes.flatMap((s) => s.points.map((p) => ({ ...p, width: 0, height: 0 })))];
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
  React.useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !draft) return;
    const touches = new Map<number, MindMapPoint>();
    const metrics = () => { const [a, b] = [...touches.values()], r = canvas.getBoundingClientRect(); return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top } }; };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const g = gestureRef.current;
      if (g) { gestureRef.current = null; if (g.moved && (g.target || g.resize)) update(g.before, false); setInk([]); }
      const { distance, mid } = metrics(); pinchRef.current = { start: distance, mid, viewport: viewportRef.current }; suppressClick.current = true;
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinchRef.current; if (!p || touches.size < 2) return;
      const { distance, mid } = metrics(), zoom = Math.min(3, Math.max(0.05, p.viewport.zoom * distance / p.start));
      const world = { x: (p.mid.x - p.viewport.x) / p.viewport.zoom, y: (p.mid.y - p.viewport.y) / p.viewport.zoom };
      setViewport({ zoom, x: mid.x - world.x * zoom, y: mid.y - world.y * zoom });
    };
    const up = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinchRef.current = null; };
    canvas.addEventListener("pointerdown", down, true); canvas.addEventListener("pointermove", move, true); canvas.addEventListener("pointerup", up, true); canvas.addEventListener("pointercancel", up, true);
    return () => { canvas.removeEventListener("pointerdown", down, true); canvas.removeEventListener("pointermove", move, true); canvas.removeEventListener("pointerup", up, true); canvas.removeEventListener("pointercancel", up, true); };
  }, [loading, draft?.id]);
  function worldPoint(client: MindMapPoint) { const r = canvasRef.current!.getBoundingClientRect(), v = viewportRef.current; return { x: (client.x - r.left - v.x) / v.zoom, y: (client.y - r.top - v.y) / v.zoom }; }
  function centerPoint() { const c = canvasRef.current!, v = viewportRef.current; return { x: (c.clientWidth / 2 - v.x) / v.zoom - 110, y: (c.clientHeight / 2 - v.y) / v.zoom - 44 }; }
  function beginEdit(id: string, text = false) { editStartedRef.current = performance.now(); setMultipleSelection(false); setEditPart(text || draftRef.current?.nodes.find((n) => n.id === id)?.kind === "freeText" ? "text" : "title"); setSelection({ kind: "node", ids: [id] }); setMode("edit"); setEditing(id); setExpanded(id); setConnecting(false); setSourceOpen(false); }
  function addNode(relation: "root" | "sibling" | "child", kind: MindMapNode["kind"] = "keyword", position?: MindMapPoint, anchorId = node?.id ?? null) { if (!draftRef.current || !canvasRef.current) return; run(() => { const r = addMindMapRelativeNode(draftRef.current!, anchorId, relation, kind, position ?? centerPoint()); update(r.map); beginEdit(r.node.id, kind === "freeText"); }); }
  function select(kind: MindMapElementKind, id: string, multiple = false) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    multiple ||= multipleSelection && kind === "node";
    if (connecting && kind === "node") { if (linkFrom && linkFrom !== id) { run(() => update(connectMindMapElements(draftRef.current!, linkFrom, id))); setLinkFrom(null); } else setLinkFrom(id); }
    setSelection((s) => ({ kind, ids: multiple && kind === "node" && s.kind === kind ? s.ids.includes(id) ? s.ids.filter((key) => key !== id) : [...s.ids, id] : [id] }));
    if (editing !== id) setEditing(null); if (expanded !== id) setExpanded(null); setSourceOpen(false);
  }
  function startGesture(event: React.PointerEvent, target?: Gesture["target"], resize?: Gesture["resize"]) {
    if (event.button !== 0 || gestureRef.current || pinchRef.current || !draftRef.current || event.shiftKey || event.ctrlKey || event.metaKey) return;
    event.stopPropagation(); suppressClick.current = false;
    if (target?.kind === "node" && (selection.kind !== "node" || !selection.ids.includes(target.id))) return;
    if (!target && editing && performance.now() - editStartedRef.current < 500) { event.preventDefault(); return; }
    if (multipleSelection && target?.kind === "node") return;
    if (!resize && mode === "design" && target?.kind === "boundary") target = undefined;
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
    else if (g.resize?.kind === "summary" && g.moved) update(resizeMindMapSummary(g.before, g.resize.id, g.resize.end, worldPoint({ x: event.clientX, y: event.clientY }).y), false);
    else if (g.target && g.moved) update(moveMindMapElement(g.before, g.target.kind, g.target.id, delta), false);
    else if (!g.target) setViewport({ ...g.viewport, x: g.viewport.x + dx, y: g.viewport.y + dy });
  }
  function finishGesture(event: React.PointerEvent, cancelled = false) {
    const g = gestureRef.current; if (!g || g.pointer !== event.pointerId) return; gestureRef.current = null; suppressClick.current = g.moved;
    if (!cancelled && !g.moved && g.target?.kind === "node") handleTap(event, g.target.id);
    if (cancelled) { update(g.before, false); setViewport(g.viewport); setInk([]); return; }
    if (g.points) {
      if (g.points.length === 1) g.points.push({ x: g.points[0].x + 0.01, y: g.points[0].y });
      const current = draftRef.current!;
      update({ ...current, strokes: [...current.strokes, { id: `stroke_${crypto.randomUUID()}`, points: g.points, color: penColor, width: penWidth }] }); setInk([]);
    } else if (g.moved && (g.target || g.resize)) { setHistory((h) => ({ past: [...h.past.slice(-99), g.before], future: [] })); }
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
  function removeSelected() { if (!draftRef.current || !primary) return; let next = draftRef.current; for (const id of selection.ids) next = removeMindMapElement(next, selection.kind, id); update(next); setSelection({ kind: "node", ids: [] }); setEditing(null); setExpanded(null); }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const current = draftRef.current, target = e.target as HTMLElement; if (!current) return;
    const focused = target.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId, mod = e.ctrlKey || e.metaKey, key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    if (key === "Escape") {
      e.stopPropagation();
      if (editing) { const id = editing; setEditing(null); setExpanded(null); focusNode(id); }
      else if (selection.ids.length || expanded) { setSelection({ kind: "node", ids: [] }); setExpanded(null); }
      else if (fullscreen) setFullscreen(false);
      else { setMode("idle"); setConnecting(false); setLinkFrom(null); }
      return;
    }
    if (target.closest("input,textarea,select,[contenteditable='true']")) return;
    const nodeIds = selection.kind === "node" ? selection.ids : [];
    if (mod && key === "z") { handled(); travel(e.shiftKey ? "future" : "past"); }
    else if (mod && key === "y") { handled(); travel("future"); }
    else if (mod && key === "a") { handled(); setSelection({ kind: "node", ids: current.nodes.map((n) => n.id) }); }
    else if (mod && key === "c" && nodeIds.length) { handled(); clipboardRef.current = copyMindMapNodes(current, nodeIds); }
    else if (mod && key === "v" && clipboardRef.current) { handled(); paste(clipboardRef.current); }
    else if (mod && key === "d" && nodeIds.length) { handled(); duplicateSelected(); }
    else if ((key === "Delete" || key === "Backspace") && selection.ids.length) { handled(); removeSelected(); canvasRef.current?.focus(); }
    else if (connecting && focused && (key === "Enter" || key === " ")) { handled(); select("node", focused); }
    else if (focused && key === "Enter" && (mod || e.shiftKey)) { handled(); addNode(mod ? "child" : "sibling", "keyword", undefined, focused); }
    else if (focused && (key === "Enter" || key === "F2")) { handled(); beginEdit(focused); }
    else if (key.startsWith("Arrow")) {
      handled();
      const [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"];
      if (e.altKey && e.shiftKey && selection.kind === "summary" && primary && dy) { update(stepMindMapSummary(current, primary, dy > 0 ? 1 : -1)); return; }
      if (e.altKey && selection.ids.length) { const step = e.shiftKey ? 100 : 20; update(selection.ids.reduce((map, id) => moveMindMapElement(map, selection.kind, id, { x: dx * step, y: dy * step }), current)); return; }
      const from = focused ?? (selection.kind === "node" ? primary : undefined);
      if (from) { const id = mindMapNeighbor(current, from, key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"); if (id) { setSelection({ kind: "node", ids: [id] }); focusNode(id); } }
      else setViewport((v) => ({ ...v, x: v.x - dx * 60, y: v.y - dy * 60 }));
    }
    else if (!mod && (key === "+" || key === "=")) { handled(); zoomAt(1.2); }
    else if (!mod && key === "-") { handled(); zoomAt(1 / 1.2); }
    else if (!mod && key === "0") { handled(); zoomAt(1 / viewportRef.current.zoom); }
    else if (e.shiftKey && e.code === "Digit1") { handled(); setEditing(null); setExpanded(null); fit(); }
    else if (key === "?") { handled(); setShortcutsOpen(true); }
  }
  function propertyControls() {
    if (node?.kind === "freeText") return <CoreTooltip label="Text entfernen · Entf"><IconButton icon={Trash2} label="Text entfernen" aria-keyshortcuts="Delete" variant="destructive" onClick={() => removeSelected()}/></CoreTooltip>;
    if (node) return <>
      {!draft!.summaries.some((item) => item.nodeId === node.id) && <ColorControl label="Kastenfarbe" value={mindMapNodeColor(draft!, node).color} onChange={(color) => editNode({ color })}/>}
      <CoreSegmentedControl ariaLabel="Kastenart" value={node.kind} onValueChange={(kind) => editNode({ kind })} options={[{ value: "keyword", label: "Stichwortkarte" }, { value: "text", label: "Textkarte" }]}/>
      <label className="core-mindmap-image-upload core-action-secondary rounded-control"><ImagePlus size={18} aria-hidden="true"/><span>Bild hinzufügen</span><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Bild hinzufügen" disabled={(node.images?.length ?? 0) >= 4 || selection.ids.length > 1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) void addImages(files, node.id); }}/></label>
      <CoreTooltip label={`Duplizieren · ${MOD}+D`}><IconButton icon={Copy} label="Duplizieren" aria-keyshortcuts="Control+D Meta+D" onClick={duplicateSelected}/></CoreTooltip>
      <CoreTooltip label="Karte entfernen · Entf"><IconButton icon={Trash2} label="Karte entfernen" aria-keyshortcuts="Delete" variant="destructive" onClick={() => removeSelected()}/></CoreTooltip>
    </>;
    if (boundary) return <>
      <label className="core-field-group core-mindmap-compact-field"><span className="core-caption">Beschriftung</span><input className="core-field-input" aria-label="Umrandung beschriften" maxLength={120} value={boundary.label} onChange={(e) => editBoundary({ label: e.target.value })}/></label>
      <ColorControl label="Rahmenfarbe" value={boundary.color} onChange={(color) => editBoundary({ color })}/><ColorControl label="Hintergrundfarbe" value={boundary.fillColor} onChange={(fillColor) => editBoundary({ fillColor })}/>
      <label className="core-field-group core-mindmap-compact-field"><span className="core-caption">Transparenz</span><input type="range" min={0} max={100} aria-label="Transparenz" value={Math.round((1 - (boundary.opacity ?? 0.08)) * 100)} onChange={(e) => editBoundary({ opacity: 1 - Number(e.target.value) / 100 })}/></label>
      <CoreSegmentedControl ariaLabel="Rahmenstärke" value={String(boundary.strokeWidth ?? 2)} options={[{ value: "2", label: "Fein" }, { value: "4", label: "Mittel" }, { value: "8", label: "Dick" }]} onValueChange={(value) => editBoundary({ strokeWidth: Number(value) as 2 | 4 | 8 })}/>
      <CoreSelect ariaLabel="Rahmenform" value={boundary.shape} options={[{ value: "rectangle", label: "Rechteck" }, { value: "rounded", label: "Abgerundet" }, { value: "ellipse", label: "Ellipse" }]} onValueChange={(shape) => editBoundary({ shape: shape as NonNullable<typeof boundary>["shape"] })}/>
      <ActionButton variant="destructive" icon={Trash2} onClick={() => removeSelected()}>Umrandung entfernen</ActionButton>
    </>;
    if (bracket) return <><ActionButton variant="secondary" icon={Pencil} onClick={() => beginEdit(bracket.nodeId)}>Zusammenfassung bearbeiten</ActionButton><ActionButton variant="destructive" icon={Trash2} onClick={() => removeSelected()}>Zusammenfassung entfernen</ActionButton></>;
    return null;
  }
  if (loading) return <StatusMessage tone="info" announce="polite">Mindmap wird geladen …</StatusMessage>;
  if (loadError) return <div className="grid gap-3"><StatusMessage tone="error">{loadError}</StatusMessage><ActionButton variant="secondary" onClick={() => setRetry((r) => r + 1)}>Erneut laden</ActionButton></div>;
  if (!draft) return null;
  const nodeById = new Map(draft.nodes.map((n) => [n.id, n]));
  const endpoint = (id: string): { id: string; rect: MindMapRect } | undefined => { const n = nodeById.get(id); return n ? { id: n.id, rect: mindMapNodeRect(n, n.id === editing || n.id === expanded) } : undefined; };
  const selectedSummary = summaries.find((s) => s.id === summaryId), selectedTree = createFromSummary && selectedSummary ? mindMapSummaryTree(draft, selectedSummary.id) : null;
  return <section className={`core-mindmap-panel min-w-0${fullscreen ? " is-fullscreen" : ""}`} data-testid="deck-mindmaps-panel" aria-label="Mindmaps" aria-busy={busy || readingImages}>
    {error && <div className="grid gap-2"><StatusMessage tone="error" announce="assertive">{error}</StatusMessage>{saveFailed && <ActionButton variant="secondary" onClick={() => { setError(""); void persist(); }}>Erneut speichern</ActionButton>}</div>}
    {readingImages && <StatusMessage tone="info" announce="polite">Bilder werden geladen …</StatusMessage>}
    <div className="grid min-w-0 gap-3" inert={readingImages}>
      <div ref={toolsRef} className="core-mindmap-primary-tools" aria-label="Mindmap-Werkzeuge"><ActionButton variant="secondary" icon={Plus} disabled={draft.nodes.length >= MIND_MAP_LIMITS.nodes} onClick={() => addNode("root")}>Stichwort</ActionButton><ActionButton variant="secondary" icon={StickyNote} disabled={draft.nodes.length >= MIND_MAP_LIMITS.nodes} onClick={() => addNode("root", "text")}>Textfeld</ActionButton><CoreSlidingTabs ariaLabel="Mindmap-Werkzeug" value={mode} onValueChange={(value) => { const next = value === mode ? "idle" : value; setMode(next); if (next !== "add") setMultipleSelection(false); setConnecting(next === "connect"); setLinkFrom(null); if (next !== "edit") { setEditing(null); setExpanded(null); } else if (node && selection.ids.length === 1) beginEdit(node.id); }} options={[{ value: "connect", label: "Verknüpfen", icon: Link2 }, { value: "edit", label: "Karte bearbeiten", icon: StickyNote }, { value: "design", label: "Gestalten", icon: Pencil }, { value: "add", label: "Hinzufügen", icon: Plus }]}/><CoreTooltip label={`Rückgängig · ${MOD}+Z`}><IconButton icon={Undo2} label="Rückgängig" aria-keyshortcuts="Control+Z Meta+Z" disabled={!history.past.length} onClick={() => travel("past")}/></CoreTooltip><CoreTooltip label={`Wiederholen · ${MOD}+Y`}><IconButton icon={Redo2} label="Wiederholen" aria-keyshortcuts="Control+Y Meta+Shift+Z" disabled={!history.future.length} onClick={() => travel("future")}/></CoreTooltip><ActionButton className="core-mindmap-source-action" variant="secondary" icon={FileText} aria-expanded={createFromSummary} onClick={() => setCreateFromSummary(!createFromSummary)}>Aus Zusammenfassung</ActionButton></div>
      {mode === "connect" && <SoftPanel className="core-mindmap-tools" aria-label="Verbindungen"><CoreSegmentedControl ariaLabel="Verbindungslinien" value={draft.connectionColor} onValueChange={(connectionColor) => update({ ...draft, connectionColor })} options={[{ value: "gray", label: "Graue Linien" }, { value: "node", label: "Kastenfarben" }]}/></SoftPanel>}
      {mode === "add" && <SoftPanel className="core-mindmap-tools" aria-label="Zusätzliche Elemente"><ActionButton variant={multipleSelection ? "primary" : "secondary"} icon={MousePointer2} aria-pressed={multipleSelection} onClick={() => { setMultipleSelection(!multipleSelection); setSelection({ kind: "node", ids: [] }); setEditing(null); setExpanded(null); }}>Mehrfachauswahl</ActionButton><ActionButton variant="secondary" icon={Network} onClick={() => createExtra("summary")}>Zusammenfassung</ActionButton><ActionButton variant="secondary" icon={Scan} onClick={() => createExtra("boundary")}>Umrandung</ActionButton></SoftPanel>}
      {mode === "design" && <SoftPanel className="core-mindmap-tools" aria-label="Gestaltungswerkzeuge"><CoreSegmentedControl ariaLabel="Gestalten" value={designTool} onValueChange={(tool) => { setDesignTool(tool); if (tool === "text" && node) beginEdit(node.id, true); }} options={[{ value: "pen", label: "Zeichnen", icon: Pencil }, { value: "erase", label: "Radieren", icon: Eraser }, { value: "text", label: "Schreiben", icon: Type }]}/>{designTool === "pen" && <><ColorControl label="Stiftfarbe" value={penColor} onChange={setPenColor}/><CoreSegmentedControl ariaLabel="Strichstärke" value={String(penWidth)} onValueChange={(v) => setPenWidth(Number(v) as 2 | 4 | 8)} options={[{ value: "2", label: "Fein" }, { value: "4", label: "Mittel" }, { value: "8", label: "Dick" }]}/></>}</SoftPanel>}
      {mode === "edit" && primary && <SoftPanel className="core-mindmap-tools" aria-label="Elementeigenschaften">{propertyControls()}{node && <IconButton icon={Check} label="Bearbeitung abschließen" onClick={() => { setEditing(null); setExpanded(null); setMode("idle"); }}/>}</SoftPanel>}
      <div ref={setToolbarHost} className="core-mindmap-text-toolbar"/>
      {connecting && <p className="core-caption text-core-muted" role="status">{linkFrom ? "Jetzt das zweite Element wählen." : "Zwei Elemente wählen, um sie zu verbinden oder zu trennen."}</p>}
      {createFromSummary && <SoftPanel className="grid gap-3 p-4" aria-label="Mindmap aus Zusammenfassung">{summaries.length ? <>{summaries.length > 1 ? <CoreSelect ariaLabel="Zusammenfassung für Mindmap" value={summaryId} options={summaries.map((s) => ({ value: s.id, label: s.title }))} onValueChange={setSummaryId}/> : <p className="core-body">Aus „{summaries[0].title}“</p>}<div className="flex flex-wrap gap-2"><ActionButton variant="primary" disabled={!selectedSummary} onClick={() => { if (selectedSummary) buildFromSummary(selectedSummary); }}>{selectedTree ? "Neu erzeugen" : "Mindmap erzeugen"}</ActionButton><ActionButton variant="secondary" onClick={() => setCreateFromSummary(false)}>Abbrechen</ActionButton></div></> : onGenerateSummary ? <><CoreSegmentedControl className="w-full min-w-0" ariaLabel="Grundlage der Zusammenfassung" value={generationScope} options={summaryChoices.scope.map((choice) => ({ value: choice.value, label: choice.value === "tree" ? "Mit Unterstapeln" : choice.label }))} onValueChange={setGenerationScope}/><div className="flex min-w-0 flex-wrap gap-2"><ActionButton className="min-w-0 max-w-full whitespace-normal" variant="primary" icon={Sparkles} loading={generating} onClick={() => void generateSummaryAndMap()}>Zusammenfassung und Mindmap erzeugen</ActionButton>{generating ? <ActionButton variant="secondary" onClick={() => generationRef.current?.abort()}>Erstellung abbrechen</ActionButton> : <ActionButton variant="secondary" onClick={() => setCreateFromSummary(false)}>Abbrechen</ActionButton>}</div>{generating && <StatusMessage tone="info" announce="polite">Material wird geladen und die KI-Zusammenfassung erstellt …</StatusMessage>}</> : <p className="core-body">Speichere zuerst eine Zusammenfassung.</p>}</SoftPanel>}
      <div className="core-mindmap-canvas rounded-panel border border-core-border" ref={canvasRef} data-testid="mindmap-canvas" data-tool={mode === "design" ? designTool : mode} tabIndex={0} aria-label="Unendliche Mindmap-Fläche" onPointerDown={(e) => startGesture(e)} onPointerMove={moveGesture} onPointerUp={(e) => finishGesture(e)} onPointerCancel={(e) => finishGesture(e, true)} onDoubleClick={(e) => { if (e.target === e.currentTarget && mode === "idle") addNode("root", "keyword", worldPoint({ x: e.clientX, y: e.clientY })); }} onKeyDown={handleKeyDown} style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${Math.max(16, 24 * viewport.zoom)}px ${Math.max(16, 24 * viewport.zoom)}px` }}>
        <div className="core-mindmap-stage" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          {draft.boundaries.map((item) => { const r = mindMapBoundaryRect(draft, item); return <div key={item.id} role="button" tabIndex={0} aria-label={`Umrandung „${item.label || "Ohne Titel"}“ auswählen`} data-testid="mindmap-boundary" className={`core-mindmap-boundary shape-${item.shape}${selection.kind === "boundary" && primary === item.id ? " is-selected" : ""}`} style={{ left: r.x, top: r.y, width: r.width, height: r.height, borderColor: item.shape === "ellipse" ? "transparent" : inkColor(item.color), borderWidth: item.strokeWidth ?? 2, background: item.shape === "ellipse" ? "transparent" : `color-mix(in srgb, ${inkColor(item.fillColor)} ${(item.opacity ?? 0.08) * 100}%, transparent)` }} onPointerDown={(e) => startGesture(e, { kind: "boundary", id: item.id })} onClick={() => { select("boundary", item.id); setMode("edit"); }} onKeyDown={(e) => { if (e.key === "Enter") { select("boundary", item.id); setMode("edit"); } }} onContextMenu={(e) => { e.preventDefault(); select("boundary", item.id); setMode("edit"); }}>{item.shape === "ellipse" && <svg className="core-mindmap-boundary-ellipse" viewBox={`0 0 ${r.width} ${r.height}`} preserveAspectRatio="none" aria-hidden="true"><ellipse cx={r.width / 2} cy={r.height / 2} rx={r.width / 2 - (item.strokeWidth ?? 2)} ry={r.height / 2 - (item.strokeWidth ?? 2)} fill={inkColor(item.fillColor)} fillOpacity={item.opacity ?? 0.08} stroke={inkColor(item.color)} strokeWidth={item.strokeWidth ?? 2}/></svg>}{item.label && <span className="core-mindmap-group-label">{item.label}</span>}</div>; })}
          <svg className="core-mindmap-lines" aria-hidden="true"><g className="core-mindmap-hierarchy">{draft.nodes.filter((n) => n.parentId).map((child) => { const from = endpoint(child.parentId!), to = endpoint(child.id); return from && to && from.id !== to.id ? <path key={child.id} d={connectionPath(from.rect, to.rect)} style={{ stroke: edgeColor(draft, child) }}/> : null; })}</g><g className="core-mindmap-edges">{draft.edges.map((edge) => { const from = endpoint(edge.from), to = endpoint(edge.to); return from && to && from.id !== to.id ? <path key={`${edge.from}:${edge.to}`} d={connectionPath(from.rect, to.rect)} style={{ stroke: edgeColor(draft, nodeById.get(edge.to)) }}/> : null; })}</g>
            {draft.strokes.map((stroke) => <g key={stroke.id} className="core-mindmap-ink" style={{ "--mindmap-ink": inkColor(stroke.color) } as React.CSSProperties} data-color={stroke.color ?? "default"}><polyline style={{ strokeWidth: stroke.width ?? 3 }} points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}/>{mode === "design" && designTool === "erase" && <polyline className="core-mindmap-eraser-hit" points={stroke.points.map((p) => `${p.x},${p.y}`).join(" ")} onPointerDown={(e) => { e.stopPropagation(); update({ ...draft, strokes: draft.strokes.filter((s) => s.id !== stroke.id) }); }}/>}</g>)}
            {ink.length > 0 && <polyline className="core-mindmap-ink-preview" style={{ stroke: inkColor(penColor), strokeWidth: penWidth }} points={ink.map((p) => `${p.x},${p.y}`).join(" ")}/>}
          </svg>
          {draft.summaries.map((item) => { const r = mindMapSummaryRect(draft, item), target = endpoint(item.nodeId); if (!target) return null; const x = item.side === "right" ? r.x + r.width + 16 : r.x - 16, sign = item.side === "right" ? -1 : 1, cy = r.y + r.height / 2, selected = selection.kind === "summary" && primary === item.id; return <div key={item.id} className={`core-mindmap-summary${selected ? " is-selected" : ""}`} data-testid="mindmap-summary"><svg className="core-mindmap-lines"><path className="core-mindmap-summary-line" d={`M ${x} ${r.y} C ${x - sign * 24} ${r.y}, ${x - sign * 24} ${r.y + r.height}, ${x} ${r.y + r.height} M ${x - sign * 18} ${cy} L ${item.side === "right" ? target.rect.x : target.rect.x + target.rect.width} ${target.rect.y + target.rect.height / 2}`} onPointerDown={(e) => { e.stopPropagation(); select("summary", item.id); setMode("edit"); }}/></svg><button type="button" className="core-mindmap-summary-select rounded-control" style={{ left: x - sign * 18 - 20, top: cy - 20 }} aria-label="Zusammenfassung auswählen" onPointerDown={(e) => e.stopPropagation()} onClick={() => { select("summary", item.id); setMode("edit"); }}><Network size={16}/></button>{selected && (["start", "end"] as const).map((end) => <button key={end} type="button" className="core-mindmap-summary-handle rounded-round" aria-label={`Zusammenfassung ${end === "start" ? "oben" : "unten"} erweitern`} style={{ left: x - 12, top: (end === "start" ? r.y : r.y + r.height) - 12 }} onPointerDown={(e) => startGesture(e, { kind: "summary", id: item.id }, { kind: "summary", id: item.id, end })}/> )}</div>; })}
          {draft.nodes.map((item) => { const selected = selection.kind === "node" && selection.ids.includes(item.id), isEditing = item.id === editing, isExpanded = isEditing || expanded === item.id, r = mindMapNodeRect(item, isExpanded), source = mindMapNodeSource(draft, item), direction = mindMapNodeDirection(item, item.parentId ? nodeById.get(item.parentId) : undefined), kindName = item.kind === "freeText" ? "Freier Text" : item.kind === "keyword" ? "Stichwort" : "Textkarte"; return <div key={item.id} role="group" className={`core-mindmap-node rounded-control shadow-soft${item.kind === "freeText" ? " is-free-text" : item.kind === "text" ? " is-text" : " is-keyword"}${selected ? " is-selected" : ""}${isExpanded ? " is-expanded" : ""}${isEditing ? " is-editing" : ""}${linkFrom === item.id ? " is-link-source" : ""}`} style={{ ...nodeStyle(draft, item), left: item.x, top: item.y, width: r.width, height: r.height }} data-testid={item.kind === "freeText" ? "mindmap-free-text" : "mindmap-node"} data-node-id={item.id} data-color={mindMapNodeColor(draft, item).color} aria-label={`${kindName} „${item.label}“`} onPointerDown={(e) => { startLongPress(e, item.id); startGesture(e, { kind: "node", id: item.id }); }} onPointerUp={(e) => handleTap(e, item.id)} onClick={(e) => { select("node", item.id, e.shiftKey || e.ctrlKey || e.metaKey); if (!(e.target as HTMLElement).closest("input,textarea,[contenteditable='true'],a,button:not(.core-mindmap-node-select)")) e.currentTarget.querySelector<HTMLElement>(":scope > .core-mindmap-node-select")?.focus({ preventScroll: true }); }} onDoubleClick={(e) => { e.stopPropagation(); if (!isEditing) beginEdit(item.id, item.kind !== "keyword" && !(e.target as HTMLElement).closest(".core-mindmap-node-label")); }} onContextMenu={(e) => { e.preventDefault(); select("node", item.id); setMode("add"); }}>
            <button type="button" className="core-mindmap-node-select" aria-label={`${kindName} „${item.label}“ auswählen`} aria-pressed={selected}/>
            {isEditing ? <div className="core-mindmap-inline-editor" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>{item.kind !== "freeText" && <input className="core-mindmap-inline-title" aria-label="Kartentitel bearbeiten" maxLength={120} value={item.label} onPointerDown={(e) => { if (hasDefaultTitle(item)) { e.preventDefault(); e.currentTarget.focus(); e.currentTarget.select(); } }} onClick={(e) => { if (hasDefaultTitle(item)) { e.preventDefault(); e.currentTarget.select(); } }} onChange={(e) => editText(item.id, { label: e.target.value })}/>}<RichTextEditor value={item.html ?? textToCardHtml(item.text)} ariaLabel={item.kind === "freeText" ? "Text auf der Fläche bearbeiten" : "Kartentext bearbeiten"} isActive showAllTools toolbarHost={toolbarHost} minHeightClass="min-h-32" onChange={(html) => editText(item.id, { html })}/></div> : <>{item.kind !== "freeText" && <span className="core-mindmap-node-label core-body" onPointerDown={(e) => { if (hasDefaultTitle(item) && !connecting && !multipleSelection && !e.shiftKey && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }} onClick={(e) => { if (hasDefaultTitle(item) && !connecting && !multipleSelection && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.stopPropagation(); beginEdit(item.id); } }}>{item.label || "Ohne Titel"}</span>}{item.kind === "keyword" && <span className="core-mindmap-node-icons text-core-muted">{Boolean(item.text.trim() || item.sourceText?.trim()) && <button type="button" aria-label="Text anzeigen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); select("node", item.id); setExpanded(expanded === item.id ? null : item.id); }}><FileText size={16}/></button>}{Boolean(item.images?.length) && <button type="button" aria-label="Bilder anzeigen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); select("node", item.id); setExpanded(expanded === item.id ? null : item.id); }}><ImageIcon size={16}/></button>}</span>}{(item.kind !== "keyword" || isExpanded) && <div className="core-mindmap-note-text core-body" dangerouslySetInnerHTML={{ __html: item.html ?? textToCardHtml(item.text) }}/>}</>}
            {(item.kind === "text" || isExpanded) && Boolean(item.images?.length) && <div className="core-mindmap-node-images">{item.images!.map((image) => <div key={image.id} className="relative"><img src={image.dataUrl} alt={image.name} draggable={false}/>{isEditing && <button type="button" className="core-mindmap-image-remove rounded-round" aria-label={`Bild „${image.name}“ entfernen`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); update(editMindMapNode(draftRef.current!, item.id, { images: item.images!.filter((n) => n.id !== image.id) })); }}><X size={14}/></button>}</div>)}</div>}
            {isExpanded && source && item.sourceText !== undefined && <details className="core-mindmap-inline-source" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}><summary>Text aus der Zusammenfassung</summary><p data-testid="mindmap-source-passage">{item.sourceText}</p><button type="button" onClick={() => setSourceOpen(!sourceOpen)}>Quelle: {source.title}</button>{sourceOpen && <div><p>Gespeicherte Fassung vom {new Date(source.updatedAt).toLocaleDateString("de-DE")}</p>{source.text}</div>}</details>}
            {item.kind !== "freeText" && selected && !isEditing && !connecting && !multipleSelection && selection.ids.length === 1 && <><button type="button" className={`core-mindmap-node-add at-sibling ${direction.vertical === "above" ? "to-top" : "to-bottom"} rounded-round`} aria-label="Stichwort auf gleicher Ebene hinzufügen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addNode("sibling"); }}><Plus size={18}/></button><button type="button" className={`core-mindmap-node-add at-child ${direction.side === "left" ? "to-left" : "to-right"} rounded-round`} aria-label="Unterknoten hinzufügen" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addNode("child"); }}><Plus size={18}/></button></>}
          </div>; })}
        </div>
        {!draft.nodes.length && !draft.strokes.length && <div className="core-mindmap-empty" onPointerDown={(e) => e.stopPropagation()}><Network size={32}/><p className="core-body-large">Deine Infinity Map</p><ActionButton variant="secondary" icon={Plus} onClick={() => addNode("root")}>Erstes Thema</ActionButton></div>}
        <div className="core-mindmap-zoom rounded-control border border-core-border bg-core-surface shadow-soft" onPointerDown={(e) => e.stopPropagation()}><CoreTooltip label="Verkleinern · −"><IconButton icon={Minus} label="Verkleinern" aria-keyshortcuts="-" onClick={() => zoomAt(1 / 1.2)}/></CoreTooltip><span className="core-caption tabular-nums">{Math.round(viewport.zoom * 100)} %</span><CoreTooltip label="Vergrößern · +"><IconButton icon={Plus} label="Vergrößern" aria-keyshortcuts="+" onClick={() => zoomAt(1.2)}/></CoreTooltip><CoreTooltip label="Alles anzeigen · ⇧+1"><IconButton icon={Maximize} label="Alles anzeigen" aria-keyshortcuts="Shift+1" onClick={() => { setEditing(null); setExpanded(null); fit(); }}/></CoreTooltip><IconButton className="core-mindmap-fullscreen-toggle" icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? "Vollbild beenden" : "Vollbild"} aria-pressed={fullscreen} onClick={() => setFullscreen(!fullscreen)}/></div>
      </div>
      {notice && <p className="sr-only" role="status">{notice}</p>}
    </div>
    <ActionDialog open={shortcutsOpen} title="Tastenkürzel" cancelLabel="Schließen" onCancel={() => setShortcutsOpen(false)} restoreFocus={() => canvasRef.current?.focus()} description={<div className="grid gap-4">{SHORTCUTS.map(([group, rows]) => <section key={group} className="grid gap-2"><h3 className="core-heading-3">{group}</h3><dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1">{rows.map(([keys, action]) => <React.Fragment key={keys}><dt className="core-body font-semibold">{keys}</dt><dd className="core-body text-core-muted">{action}</dd></React.Fragment>)}</dl></section>)}</div>}/>
    <ActionDialog open={Boolean(replaceRequest)} title="Mindmap neu erzeugen?" description={`Die aus „${replaceRequest?.summary.title ?? ""}“ erzeugten Karten wurden bearbeitet. Überschreiben ersetzt ${replaceRequest?.cards ?? 0} Karten samt deinen Änderungen daran.`} confirmLabel="Überschreiben" discardLabel="Daneben neu anlegen" cancelLabel="Abbrechen" onCancel={() => setReplaceRequest(null)} onDiscard={() => { const request = replaceRequest; setReplaceRequest(null); if (request) buildFromSummary(request.summary, "beside"); }} onConfirm={() => { const request = replaceRequest; setReplaceRequest(null); if (request) buildFromSummary(request.summary, "replace"); }}/>
  </section>;
}
