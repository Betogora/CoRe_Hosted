import React from "react";
import { createPortal } from "react-dom";
import { Eraser, Highlighter, Maximize2, Minimize2, Minus, Palette, PenLine, Plus, Redo2, Spline, Trash2, Type, Undo2 } from "lucide-react";
import { SUMMARY_FONT_SIZE, type LearningSummary, type SummaryPage, type SummaryStroke } from "../learningSummaries.ts";
import { summaryDrawingLayout } from "../summaryDocumentLayout.ts";
import { IconButton } from "../ui/actionUi.tsx";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import { CoreIconSegmentedControl } from "../ui/coreUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";

/** Gap between the scroll area edge and the stuck tools, in px (`--core-space-sm`). */
const SUMMARY_TOOLS_GAP = 8;

type Tool = "text" | "pen" | "marker" | "eraser";
const toolOptions = [{ value: "text", label: "Schreiben", icon: Type }, { value: "pen", label: "Stift", icon: PenLine }, { value: "marker", label: "Zeichenmarker", icon: Highlighter }, { value: "eraser", label: "Radierer", icon: Eraser }] as const;
const inkPresets = {
  pen: { label: "Stiftstärke", min: 1, max: 20, colors: [["#181d25", "Schwarz"], ["#3b7dd8", "Blau"], ["#e5484d", "Rot"], ["#3fa66b", "Grün"], ["#8b5cf6", "Violett"]] },
  marker: { label: "Markerbreite", min: 4, max: 24, colors: [["#f6d36b", "Gelb"], ["#9ed5b3", "Grün"], ["#a4c2ee", "Blau"], ["#f5a3a6", "Rosa"], ["#f9c48f", "Orange"]] },
} as const;
const fontOptions = [{ value: "sans", label: "Standard" }, { value: "serif", label: "Serif" }] as const;
const markerModeOptions = [{ value: "line", label: "Gerade auf Textzeile", icon: Minus }, { value: "free", label: "Freihand", icon: Spline }] as const;
type TextRow = { top: number; bottom: number; left: number; right: number };
type MarkerLine = { startX: number; minX: number; maxX: number; y: number; row: TextRow; startClientX: number };

/** Visual text row under a viewport y position, as the union of the line boxes of all text on it. */
function textRowAt(root: Element, clientY: number): TextRow | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), range = document.createRange();
  let row: TextRow | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (!rect.width || clientY < rect.top || clientY > rect.bottom) continue;
      row = row ? { top: Math.min(row.top, rect.top), bottom: Math.max(row.bottom, rect.bottom), left: Math.min(row.left, rect.left), right: Math.max(row.right, rect.right) } : { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    }
  }
  return row;
}

function caretAt(x: number, y: number): Range | null {
  const caretDocument = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  return range;
}

/** Highlights the text of one row between two viewport x positions as text formatting, so it follows reflow and font size. */
function highlightTextRow(field: HTMLElement, overlay: SVGSVGElement, row: TextRow, fromX: number, toX: number, color: string) {
  const y = (row.top + row.bottom) / 2, left = Math.max(row.left + 1, Math.min(fromX, toX)), right = Math.min(row.right - 1, Math.max(fromX, toX));
  overlay.style.pointerEvents = "none";
  const start = caretAt(left, y), end = caretAt(right, y);
  overlay.style.pointerEvents = "";
  if (!start || !end || !field.contains(start.startContainer) || !field.contains(end.startContainer)) return;
  const range = document.createRange();
  range.setStart(start.startContainer, start.startOffset);
  range.setEnd(end.startContainer, end.startOffset);
  if (range.collapsed) return;
  field.focus({ preventScroll: true });
  const selection = window.getSelection();
  selection?.removeAllRanges(); selection?.addRange(range);
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand("hiliteColor", false, `${color}73`);
  selection?.collapseToEnd();
}

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const next = Math.round(Number(draft)); if (draft.trim() && Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next))); setDraft(String(value)); };
  return <div className="core-summary-stepper" role="group" aria-label={label}>
    <CoreTooltip label={`${label} verringern`}><IconButton variant="ghost" label={`${label} verringern`} icon={Minus} disabled={value <= min} onClick={() => onChange(value - 1)}/></CoreTooltip>
    <input type="number" inputMode="numeric" aria-label={`${label} in Pixel`} min={min} max={max} step={1} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") commit(); }}/>
    <CoreTooltip label={`${label} erhöhen`}><IconButton variant="ghost" label={`${label} erhöhen`} icon={Plus} disabled={value >= max} onClick={() => onChange(value + 1)}/></CoreTooltip>
  </div>;
}
function strokePath(stroke: SummaryStroke) {
  return stroke.points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ") + (stroke.points.length === 1 ? " l0.01 0" : "");
}

export function SummaryDocumentEditor({ value, onChange, busy }: {
  value: LearningSummary; onChange: (value: LearningSummary) => void; busy: boolean;
}) {
  const pages = React.useMemo(() => value.pages ?? [{ id: value.id, html: value.html, strokes: [] }], [value.pages, value.id, value.html]);
  const [tool, setTool] = React.useState<Tool>("text");
  const [pen, setPen] = React.useState({ color: "#3b7dd8", width: 3 });
  const [marker, setMarker] = React.useState({ color: "#f6d36b", width: 12 });
  const [markerMode, setMarkerMode] = React.useState<"line" | "free">("line");
  const [expanded, setExpanded] = React.useState(false);
  const [toolbarContainer, setToolbarContainer] = React.useState<HTMLDivElement | null>(null);
  const [liveStroke, setLiveStroke] = React.useState<SummaryStroke | null>(null);
  const gesture = React.useRef<{ pointerId: number; stroke: SummaryStroke; line?: MarkerLine } | null>(null);
  const history = React.useRef<{ undo: SummaryStroke[][][]; redo: SummaryStroke[][][] }>({ undo: [], redo: [] });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const expandRef = React.useRef<HTMLButtonElement>(null);
  const [sheetSize, setSheetSize] = React.useState({ width: 794, height: 640 });
  const [stickyTop, setStickyTop] = React.useState(0);
  const fieldId = React.useId();
  const drawing = React.useMemo(() => summaryDrawingLayout(liveStroke ? pages.map((page, index) => index === 0 ? { ...page, strokes: [...page.strokes, liveStroke] } : page) : pages, value.pageFormat), [pages, liveStroke, value.pageFormat]);
  const scale = sheetSize.width / drawing.width;
  const ink = tool === "marker" ? marker : pen;
  const changeInkStyle = (change: Partial<typeof ink>) => (tool === "marker" ? setMarker : setPen)((current) => ({ ...current, ...change }));

  function updatePages(next: SummaryPage[]) { onChange({ ...value, pages: next, html: next.map((page) => page.html).join("\n") }); }
  function changeInk(next: SummaryPage[]) {
    history.current = { undo: [...history.current.undo.slice(-49), pages.map((page) => page.strokes)], redo: [] };
    updatePages(next);
  }
  function undoDrawing(redo: boolean) {
    const past = history.current, stack = redo ? past.redo : past.undo, snapshot = stack.at(-1);
    if (!snapshot) return;
    const current = pages.map((page) => page.strokes);
    history.current = redo ? { undo: [...past.undo, current], redo: past.redo.slice(0, -1) } : { undo: past.undo.slice(0, -1), redo: [...past.redo, current] };
    updatePages(pages.map((page, index) => ({ ...page, strokes: snapshot[index] })));
  }
  React.useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const header = expanded ? null : document.querySelector<HTMLElement>('[data-navigation-layout="mobile-header"]');
    let scroller: HTMLElement | null = rootRef.current;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const measure = () => {
      setSheetSize((previous) => previous.width === sheet.clientWidth && previous.height === sheet.clientHeight ? previous : { width: sheet.clientWidth, height: sheet.clientHeight });
      // Sticky offsets count from the scroll area's padding; the tools stick a small gap below its edge instead, and
      // their canvas band (`.core-summary-tools::before`) hides the sheet scrolling through that gap.
      const inset = scroller ? parseFloat(getComputedStyle(scroller).paddingTop) - SUMMARY_TOOLS_GAP : 0;
      setStickyTop((header?.getBoundingClientRect().height ?? 0) - inset);
    };
    const observer = new ResizeObserver(measure); observer.observe(sheet); if (header) observer.observe(header); measure();
    return () => observer.disconnect();
  }, [expanded]);
  React.useEffect(() => {
    if (!expanded) return;
    const overlay = rootRef.current!;
    const background = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previous = background.map((element) => element.inert), overflow = document.body.style.overflow;
    background.forEach((element) => { element.inert = true; }); document.body.style.overflow = "hidden";
    overlay.querySelector<HTMLElement>("button")?.focus();
    return () => {
      background.forEach((element, index) => { element.inert = previous[index]; }); document.body.style.overflow = overflow;
      requestAnimationFrame(() => expandRef.current?.focus());
    };
  }, [expanded]);

  function point(event: React.PointerEvent<SVGSVGElement>): [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(drawing.width, (event.clientX - bounds.left) / scale)) * 10) / 10,
      Math.round(Math.max(0, Math.min(1_000_000, (event.clientY - bounds.top) / scale)) * 10) / 10];
  }
  function startInk(event: React.PointerEvent<SVGSVGElement>) {
    if (busy || tool === "text" || event.button !== 0 || gesture.current) return;
    event.preventDefault();
    if (tool === "eraser") {
      const target = event.target as Element, id = target.getAttribute("data-stroke-id"), pageId = target.getAttribute("data-page-id");
      if (id) changeInk(pages.map((page) => page.id === pageId ? { ...page, strokes: page.strokes.filter((stroke) => stroke.id !== id) } : page));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event);
    const stroke: SummaryStroke = { id: crypto.randomUUID(), tool, space: "portrait", color: ink.color, width: ink.width, points: [start] };
    if (tool === "marker" && markerMode === "line") {
      // A straight marker covers exactly the text row under the pointer and stays within its text.
      const bounds = event.currentTarget.getBoundingClientRect(), field = sheetRef.current?.querySelector(".rich-text-field");
      const row = field ? textRowAt(field, event.clientY) : null;
      if (!row) return;
      const line = { startX: start[0], minX: (row.left - bounds.left) / scale, maxX: (row.right - bounds.left) / scale, y: ((row.top + row.bottom) / 2 - bounds.top) / scale, row, startClientX: event.clientX };
      gesture.current = { pointerId: event.pointerId, stroke: lineStroke({ ...stroke, width: Math.round((row.bottom - row.top) / scale) }, line, start[0]), line };
    } else gesture.current = { pointerId: event.pointerId, stroke };
    setLiveStroke(gesture.current.stroke);
  }
  function lineStroke(stroke: SummaryStroke, line: MarkerLine, x: number): SummaryStroke {
    // Round caps reach half the width beyond the end points, so the points are inset to end at the text edges.
    const inset = stroke.width / 2, from = Math.max(line.minX, Math.min(line.startX, x)) + inset, to = Math.min(line.maxX, Math.max(line.startX, x)) - inset;
    const round = (value: number) => Math.round(Math.max(0, Math.min(drawing.width, value)) * 10) / 10, y = round(line.y);
    return { ...stroke, points: to > from ? [[round(from), y], [round(to), y]] : [[round((from + to) / 2), y]] };
  }
  function moveInk(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.stroke.points.length >= 10_000) return;
    if (current.line) { current.stroke = lineStroke(current.stroke, current.line, point(event)[0]); setLiveStroke(current.stroke); return; }
    const next = point(event), last = current.stroke.points.at(-1)!;
    if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 1) return;
    current.stroke = { ...current.stroke, points: [...current.stroke.points, next] }; setLiveStroke(current.stroke);
  }
  function endInk(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null; setLiveStroke(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.line) {
      const field = sheetRef.current?.querySelector<HTMLElement>(".rich-text-field");
      if (field) highlightTextRow(field, event.currentTarget, current.line.row, current.line.startClientX, event.clientX, current.stroke.color);
      return;
    }
    changeInk(pages.map((page, index) => index === 0 ? { ...page, strokes: [...page.strokes, current.stroke] } : page));
  }
  function cancelInk() { gesture.current = null; setLiveStroke(null); }

  const content = <div ref={rootRef} className={`core-summary-document-editor ${expanded ? "core-summary-expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? "Zusammenfassung bearbeiten – Arbeitsfläche" : undefined}
    style={{ "--summary-font": value.font === "serif" ? "Georgia, serif" : "var(--core-font-sans)", "--summary-size": `${value.fontSize}px` } as React.CSSProperties}
    onKeyDown={(event) => {
      if (!expanded || event.defaultPrevented) return;
      if (event.key === "Escape" && !busy) { event.preventDefault(); setExpanded(false); }
      if (event.key === "Tab" && rootRef.current?.contains(event.target as Node)) {
        const focusable = Array.from(rootRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, [tabindex='0'], [contenteditable='true']")).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="core-summary-tools core-surface-raised" style={{ top: stickyTop, scrollMarginTop: Math.max(stickyTop, 0) + 12 }} inert={busy}>
      <CoreIconSegmentedControl ariaLabel="Schreiben und Zeichnen" className="core-summary-tool-modes" options={toolOptions} value={tool} onValueChange={setTool}/>
      <div className="core-summary-tool-context">
        <div ref={setToolbarContainer} className="core-summary-text-tools" hidden={tool !== "text"}/>
        {tool !== "text" && <div className="core-summary-tool-group" role="group" aria-label="Zeichnung bearbeiten">
          <CoreTooltip label="Zeichnung rückgängig"><IconButton variant="ghost" label="Zeichnung rückgängig" icon={Undo2} disabled={!history.current.undo.length} onClick={() => undoDrawing(false)}/></CoreTooltip>
          <CoreTooltip label="Zeichnung wiederholen"><IconButton variant="ghost" label="Zeichnung wiederholen" icon={Redo2} disabled={!history.current.redo.length} onClick={() => undoDrawing(true)}/></CoreTooltip>
        </div>}
        {(tool === "pen" || tool === "marker") && <>
          <div className="core-summary-tool-group" role="group" aria-label={tool === "marker" ? "Markerfarbe" : "Zeichenfarbe"}>
            {inkPresets[tool].colors.map(([color, name]) => <CoreTooltip key={color} label={name}><button type="button" className="core-summary-swatch" aria-label={name} aria-pressed={ink.color === color} style={{ "--summary-ink": color } as React.CSSProperties} onClick={() => changeInkStyle({ color })}><span aria-hidden="true"/></button></CoreTooltip>)}
            <ColorPicker variant="tool" icon={Palette} ariaLabel={tool === "marker" ? "Eigene Markerfarbe" : "Eigene Stiftfarbe"} value={ink.color} onValueCommit={(color) => changeInkStyle({ color })}/>
          </div>
          {tool === "marker" && <div className="core-summary-tool-group"><CoreIconSegmentedControl ariaLabel="Markerart" options={markerModeOptions} value={markerMode} onValueChange={setMarkerMode}/></div>}
          {(tool === "pen" || markerMode === "free") && <div className="core-summary-tool-group">
            <NumberStepper label={inkPresets[tool].label} value={ink.width} min={inkPresets[tool].min} max={inkPresets[tool].max} onChange={(width) => changeInkStyle({ width })}/>
            <span className="core-summary-ink-dot" aria-hidden="true"><span style={{ width: Math.min(28, ink.width), height: Math.min(28, ink.width), background: ink.color, opacity: tool === "marker" ? 0.6 : 1 }}/></span>
          </div>}
        </>}
        {tool === "eraser" && <div className="core-summary-tool-group">
          <span className="core-caption text-core-muted">Strich zum Entfernen antippen</span>
          <CoreTooltip label="Alle Zeichnungen entfernen"><IconButton variant="ghost" label="Alle Zeichnungen entfernen" icon={Trash2} disabled={!pages.some((page) => page.strokes.length)} onClick={() => changeInk(pages.map((page) => ({ ...page, strokes: [] })))}/></CoreTooltip>
        </div>}
      </div>
      <div className="core-summary-tool-actions">
        <CoreTooltip label={expanded ? "Arbeitsfläche verkleinern" : "Arbeitsfläche vergrößern"}><IconButton ref={expandRef} variant="ghost" label={expanded ? "Arbeitsfläche verkleinern" : "Arbeitsfläche vergrößern"} icon={expanded ? Minimize2 : Maximize2} onClick={() => setExpanded(!expanded)}/></CoreTooltip>
      </div>
      <span className="sr-only" id={`${fieldId}-hint`}>Eine durchgehende Seite. Der Text und die Zeichenfläche wachsen nach unten.</span>
    </div>
    <div className="core-summary-stage" inert={busy}>
      <div ref={sheetRef} className="core-summary-sheet core-summary-editor" style={{ minHeight: Math.max(640, drawing.bottom * scale + 96) }}>
        <RichTextEditor value={value.html} ariaLabel="Zusammenfassung bearbeiten" ariaDescribedBy={`${fieldId}-hint`} toolbarHost={toolbarContainer} documentTools minHeightClass=""
          documentSettings={<div className="core-rich-text-group" role="group" aria-label="Schrift">
            <CoreSelect ariaLabel="Schrift" className="core-summary-font-select" value={value.font} options={fontOptions} onValueChange={(font) => onChange({ ...value, font: font as LearningSummary["font"] })}/>
            <NumberStepper label="Schriftgröße" value={value.fontSize} min={SUMMARY_FONT_SIZE.min} max={SUMMARY_FONT_SIZE.max} onChange={(fontSize) => onChange({ ...value, fontSize })}/>
          </div>}
          onChange={(html) => { if (html !== value.html) updatePages(pages.map((page, index) => ({ ...page, html: index === 0 ? html : "" }))); }}/>
        <svg className="core-summary-drawing-layer" data-tool={tool} viewBox={`0 0 ${drawing.width} ${sheetSize.height / scale}`} aria-label="Zeichenfläche Zusammenfassung" role="img" onPointerDown={startInk} onPointerMove={moveInk} onPointerUp={endInk} onPointerCancel={cancelInk} onLostPointerCapture={cancelInk}>
          {drawing.strokes.map(({ pageId, stroke, x, y, scale: fit }) => <g key={`${pageId}:${stroke.id}`} transform={`translate(${x} ${y}) scale(${fit})`}>
            <path data-stroke-id={stroke.id} data-page-id={pageId} d={strokePath(stroke)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeOpacity={stroke.tool === "marker" ? 0.3 : 1} strokeLinecap="round" strokeLinejoin="round"/>
            {tool === "eraser" && <path data-stroke-id={stroke.id} data-page-id={pageId} d={strokePath(stroke)} fill="none" stroke="transparent" strokeWidth={Math.max(18 / scale / fit, stroke.width)} strokeLinecap="round"/>}
          </g>)}
        </svg>
      </div>
    </div>
  </div>;
  return expanded ? createPortal(content, document.body) : content;
}
