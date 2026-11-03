import React from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { ALargeSmall, Eraser, Highlighter, Maximize2, Minimize2, Palette, PenLine, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import type { LearningSummary, SummaryPage, SummaryStroke } from "../learningSummaries.ts";
import { summaryDrawingLayout } from "../summaryDocumentLayout.ts";
import { IconButton } from "../ui/actionUi.tsx";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import { CoreIconSegmentedControl, CoreSegmentedControl } from "../ui/coreUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";

type Tool = "text" | "pen" | "marker" | "eraser";
const toolOptions = [{ value: "text", label: "Schreiben", icon: Type }, { value: "pen", label: "Stift", icon: PenLine }, { value: "marker", label: "Zeichenmarker", icon: Highlighter }, { value: "eraser", label: "Radierer", icon: Eraser }] as const;
const inkPresets = {
  pen: { colors: [["#181d25", "Schwarz"], ["#3b7dd8", "Blau"], ["#e5484d", "Rot"], ["#3fa66b", "Grün"], ["#8b5cf6", "Violett"]], widths: [[1, "Fein"], [3, "Mittel"], [5, "Kräftig"]] },
  marker: { colors: [["#f6d36b", "Gelb"], ["#9ed5b3", "Grün"], ["#a4c2ee", "Blau"], ["#f5a3a6", "Rosa"], ["#f9c48f", "Orange"]], widths: [[8, "Schmal"], [12, "Mittel"], [24, "Breit"]] },
} as const;
const fontOptions = [{ value: "sans", label: "Standard" }, { value: "serif", label: "Serif" }] as const;
const fontSizeOptions = [{ value: "14", label: "Klein" }, { value: "16", label: "Normal" }, { value: "22", label: "Groß" }] as const;
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
  const [expanded, setExpanded] = React.useState(false);
  const [toolbarContainer, setToolbarContainer] = React.useState<HTMLDivElement | null>(null);
  const [liveStroke, setLiveStroke] = React.useState<SummaryStroke | null>(null);
  const gesture = React.useRef<{ pointerId: number; stroke: SummaryStroke } | null>(null);
  const history = React.useRef<{ undo: SummaryStroke[][][]; redo: SummaryStroke[][][] }>({ undo: [], redo: [] });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const expandRef = React.useRef<HTMLButtonElement>(null);
  const [sheetSize, setSheetSize] = React.useState({ width: 794, height: 640 });
  const [headerHeight, setHeaderHeight] = React.useState(0);
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
    const measure = () => {
      setSheetSize((previous) => previous.width === sheet.clientWidth && previous.height === sheet.clientHeight ? previous : { width: sheet.clientWidth, height: sheet.clientHeight });
      setHeaderHeight(header?.getBoundingClientRect().height ?? 0);
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
    const stroke: SummaryStroke = { id: crypto.randomUUID(), tool, space: "portrait", color: ink.color, width: ink.width, points: [point(event)] };
    gesture.current = { pointerId: event.pointerId, stroke }; setLiveStroke(stroke);
  }
  function moveInk(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.stroke.points.length >= 10_000) return;
    const next = point(event), last = current.stroke.points.at(-1)!;
    if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 1) return;
    current.stroke = { ...current.stroke, points: [...current.stroke.points, next] }; setLiveStroke(current.stroke);
  }
  function endInk(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null; setLiveStroke(null);
    changeInk(pages.map((page, index) => index === 0 ? { ...page, strokes: [...page.strokes, current.stroke] } : page));
    event.currentTarget.releasePointerCapture(event.pointerId);
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
    <div className="core-summary-tools core-surface-raised" style={{ top: headerHeight, scrollMarginTop: headerHeight + 12 }} inert={busy}>
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
          <div className="core-summary-tool-group" role="group" aria-label={tool === "marker" ? "Markerbreite" : "Stiftstärke"}>
            {inkPresets[tool].widths.map(([width, name], index) => <CoreTooltip key={width} label={name}><button type="button" className="core-summary-width" aria-label={name} aria-pressed={ink.width === width} onClick={() => changeInkStyle({ width })}><span aria-hidden="true" style={{ width: 6 + index * 5, height: 6 + index * 5, background: ink.color, opacity: tool === "marker" ? 0.6 : 1 }}/></button></CoreTooltip>)}
          </div>
        </>}
        {tool === "eraser" && <div className="core-summary-tool-group">
          <span className="core-caption text-core-muted">Strich zum Entfernen antippen</span>
          <CoreTooltip label="Alle Zeichnungen entfernen"><IconButton variant="ghost" label="Alle Zeichnungen entfernen" icon={Trash2} disabled={!pages.some((page) => page.strokes.length)} onClick={() => changeInk(pages.map((page) => ({ ...page, strokes: [] })))}/></CoreTooltip>
        </div>}
      </div>
      <div className="core-summary-tool-actions">
        <Popover.Root>
          <CoreTooltip label="Schrift und Größe"><Popover.Trigger asChild><IconButton variant="ghost" label="Schrift und Größe" icon={ALargeSmall}/></Popover.Trigger></CoreTooltip>
          <Popover.Portal container={rootRef.current}>
            <Popover.Content className="core-overlay core-summary-font-popover" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label="Schrift und Größe">
              <div className="core-field-group"><span className="core-caption text-core-muted">Schrift</span><CoreSegmentedControl ariaLabel="Schrift" options={fontOptions} value={value.font} onValueChange={(font) => onChange({ ...value, font })}/></div>
              <div className="core-field-group"><span className="core-caption text-core-muted">Größe</span><CoreSegmentedControl ariaLabel="Schriftgröße" options={fontSizeOptions} value={String(value.fontSize) as (typeof fontSizeOptions)[number]["value"]} onValueChange={(next) => onChange({ ...value, fontSize: Number(next) as LearningSummary["fontSize"] })}/></div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <CoreTooltip label={expanded ? "Arbeitsfläche verkleinern" : "Arbeitsfläche vergrößern"}><IconButton ref={expandRef} variant="ghost" label={expanded ? "Arbeitsfläche verkleinern" : "Arbeitsfläche vergrößern"} icon={expanded ? Minimize2 : Maximize2} onClick={() => setExpanded(!expanded)}/></CoreTooltip>
      </div>
      <span className="sr-only" id={`${fieldId}-hint`}>Eine durchgehende Seite. Der Text und die Zeichenfläche wachsen nach unten.</span>
    </div>
    <div className="core-summary-stage" inert={busy}>
      <div ref={sheetRef} className="core-summary-sheet core-summary-editor" style={{ minHeight: Math.max(640, drawing.bottom * scale + 96) }}>
        <RichTextEditor value={value.html} ariaLabel="Zusammenfassung bearbeiten" ariaDescribedBy={`${fieldId}-hint`} toolbarHost={toolbarContainer} documentTools minHeightClass=""
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
