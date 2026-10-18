import React from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { Eraser, Hand, Highlighter, Keyboard, Maximize2, Minimize2, PenLine, Plus, Redo2, Save, Scan, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import type { LearningSummary, SummaryPage, SummaryPageFormat, SummaryStroke } from "../learningSummaries.ts";
import { hasCardRichTextContent } from "../richText.ts";
import { summaryDrawingBounds, summaryPageSize, summaryStrokePlacement } from "../summaryDocumentLayout.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";

type Tool = "text" | "pen" | "marker" | "eraser" | "hand";
const formatOptions = [{ value: "portrait", label: "Hochformat" }, { value: "landscape", label: "Querformat" }, { value: "infinity", label: "Infinity" }];
function emptyPage(html = ""): SummaryPage { return { id: crypto.randomUUID(), html, strokes: [] }; }
function strokePath(stroke: SummaryStroke): string {
  return stroke.points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ") + (stroke.points.length === 1 ? " l0.01 0" : "");
}

// Measure the actual page typography, retaining markup on both sides of a break.
function splitPage(field: HTMLElement, html: string): [string, string] | null {
  const probe = field.cloneNode(false) as HTMLElement;
  probe.removeAttribute("role");
  probe.removeAttribute("contenteditable");
  probe.style.cssText = "position:absolute;inset:0;visibility:hidden;pointer-events:none";
  field.parentElement!.append(probe);
  probe.innerHTML = html;
  try {
    if (probe.scrollHeight <= probe.clientHeight + 1) return null;
    const source = document.createElement("div");
    source.innerHTML = html;
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const units: { node: Node; text: string }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) units.push({ node, text: node.textContent ?? "" });
      else if (node instanceof Element && /^(BR|IMG|HR)$/.test(node.tagName)) units.push({ node, text: "\n" });
    }
    const text = units.map((unit) => unit.text).join("");
    const length = text.length;
    if (length < 2) return null;
    function at(offset: number): [Node, number] {
      for (const { node, text } of units) {
        const size = text.length;
        if (offset <= size) {
          if (node.nodeType === Node.TEXT_NODE) return [node, offset];
          return [node.parentNode!, Array.prototype.indexOf.call(node.parentNode!.childNodes, node) + (offset > 0 ? 1 : 0)];
        }
        offset -= size;
      }
      return [source, source.childNodes.length];
    }
    function slice(start: number, end: number) {
      const range = document.createRange();
      range.selectNodeContents(source);
      if (start > 0) range.setStart(...at(start));
      if (end < length) range.setEnd(...at(end));
      const container = document.createElement("div");
      container.append(range.cloneContents());
      return container.innerHTML;
    }
    let low = 1; let high = length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      probe.innerHTML = slice(0, middle);
      if (probe.scrollHeight <= probe.clientHeight + 1) low = middle;
      else high = middle - 1;
    }
    const wordBreak = text.lastIndexOf(" ", low);
    const cut = wordBreak > low * 0.8 ? wordBreak + 1 : low;
    return [slice(0, cut), slice(cut, length)];
  } finally { probe.remove(); }
}

export function SummaryDocumentEditor({ value, onChange, onSave, busy, error = "" }: {
  value: LearningSummary; onChange: (value: LearningSummary) => void;
  onSave: () => void; busy: boolean; error?: string;
}) {
  const [legacyPage] = React.useState(() => emptyPage());
  const pages = value.pages ?? [{ ...legacyPage, html: value.html }];
  const format = value.pageFormat ?? "portrait";
  const infinite = format === "infinity";
  const size = summaryPageSize(format);
  const [activePage, setActivePage] = React.useState(pages[0].id);
  const [tool, setTool] = React.useState<Tool>("text");
  const [color, setColor] = React.useState("#657494");
  const [width, setWidth] = React.useState(3);
  const [pageView, setPageView] = React.useState("whole");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [toolbarContainer, setToolbarContainer] = React.useState<HTMLDivElement | null>(null);
  const [liveStroke, setLiveStroke] = React.useState<{ pageId: string; stroke: SummaryStroke } | null>(null);
  const gesture = React.useRef<{ pageId: string; pointerId: number; stroke: SummaryStroke } | null>(null);
  const panGesture = React.useRef<{ pointerId: number; x: number; y: number; view: { x: number; y: number; zoom: number } } | null>(null);
  const history = React.useRef(new Map<string, { undo: SummaryStroke[][]; redo: SummaryStroke[][] }>());
  const rootRef = React.useRef<HTMLDivElement>(null);
  const toolsRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const settingsTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [stageHeight, setStageHeight] = React.useState(480);
  const [stageWidth, setStageWidth] = React.useState(794);
  const [textHeights, setTextHeights] = React.useState<number[]>([]);
  const [view, setView] = React.useState({ x: 32, y: 32, zoom: 1 });
  const viewRef = React.useRef(view); viewRef.current = view;
  const fieldId = React.useId();
  const offsets: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const previous = index ? pages[index - 1] : null;
    offsets.push(index ? offsets[index - 1] + Math.max(160, textHeights[index - 1] ?? 160, summaryDrawingBounds(previous!).top + summaryDrawingBounds(previous!).height) + 64 : 0);
  }
  const displayScale = infinite ? view.zoom : pageView === "actual" ? 1
    : Math.min(1, Math.max(1, stageWidth - 16) / size.width, pageView === "whole" ? Math.max(1, stageHeight - 56) / size.height : 1);

  function updatePages(next: SummaryPage[]) {
    onChange({ ...value, pages: next, html: next.map((page) => page.html).join("\n") });
  }

  React.useLayoutEffect(() => {
    const stage = stageRef.current, tools = toolsRef.current;
    if (!stage || !tools) return;
    const measure = () => {
      const top = Math.max(0, tools.getBoundingClientRect().top);
      setStageHeight(Math.max(180, Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - tools.offsetHeight - 16)));
      setStageWidth(stage.clientWidth);
      const heights = Array.from(stage.querySelectorAll<HTMLElement>(".rich-text-field"), (field) => field.scrollHeight);
      setTextHeights((previous) => heights.every((height, index) => previous[index] === height) && heights.length === previous.length ? previous : heights);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage); observer.observe(tools);
    stage.querySelectorAll(".rich-text-field").forEach((field) => observer.observe(field));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [expanded, infinite, pages.length, error]);

  React.useEffect(() => {
    if (!expanded) return;
    const overlay = rootRef.current!;
    const background = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previous = background.map((element) => element.inert);
    const overflow = document.body.style.overflow;
    background.forEach((element) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    rootRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      background.forEach((element, index) => { element.inert = previous[index]; });
      document.body.style.overflow = overflow;
      requestAnimationFrame(() => settingsTriggerRef.current?.focus());
    };
  }, [expanded]);
  React.useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || settingsOpen || busy) return;
      event.preventDefault(); setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded, settingsOpen, busy]);
  React.useEffect(() => { if (expanded && error && !value.title.trim()) titleRef.current?.focus(); }, [expanded, error, value.title]);
  React.useEffect(() => { if (!infinite && tool === "hand") setTool("text"); }, [infinite, tool]);

  React.useLayoutEffect(() => {
    if (infinite) return;
    for (let index = 0; index < pages.length; index += 1) {
      const field = stageRef.current?.querySelectorAll<HTMLElement>(".rich-text-field")[index];
      if (!field) continue;
      const split = splitPage(field, pages[index].html);
      if (!split || pages.length >= 100) continue;
      const next = [...pages]; next[index] = { ...next[index], html: split[0] };
      next.splice(index + 1, 0, emptyPage(split[1]));
      const selection = window.getSelection(), range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      let caretOffset = 0;
      if (range && field.contains(range.startContainer)) {
        const before = range.cloneRange(); before.selectNodeContents(field); before.setEnd(range.startContainer, range.startOffset); caretOffset = before.toString().length;
      }
      const prefix = document.createElement("div"); prefix.innerHTML = split[0];
      const moveToFollowing = document.activeElement === field && caretOffset > (prefix.textContent?.length ?? 0);
      updatePages(next);
      if (moveToFollowing) {
        setActivePage(next[index + 1].id);
        requestAnimationFrame(() => {
          const following = stageRef.current?.querySelectorAll<HTMLElement>(".rich-text-field")[index + 1];
          if (!following) return;
          following.focus(); const nextRange = document.createRange(); nextRange.selectNodeContents(following); nextRange.collapse(false);
          window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(nextRange);
        });
      }
      break;
    }
  }, [pages, value.font, value.fontSize, format, expanded]);

  function changeStrokes(pageId: string, strokes: SummaryStroke[]) {
    const page = pages.find((item) => item.id === pageId)!;
    const past = history.current.get(pageId) ?? { undo: [], redo: [] };
    history.current.set(pageId, { undo: [...past.undo.slice(-49), page.strokes], redo: [] });
    updatePages(pages.map((item) => item.id === pageId ? { ...item, strokes } : item));
  }
  function undoDrawing(redo: boolean) {
    const page = pages.find((item) => item.id === activePage)!, past = history.current.get(activePage);
    const stack = redo ? past?.redo : past?.undo;
    if (!past || !stack?.length) return;
    const strokes = stack[stack.length - 1];
    history.current.set(activePage, redo ? { undo: [...past.undo, page.strokes], redo: past.redo.slice(0, -1) }
      : { undo: past.undo.slice(0, -1), redo: [...past.redo, page.strokes] });
    updatePages(pages.map((item) => item.id === activePage ? { ...item, strokes } : item));
  }
  function zoomCanvas(factor: number, x?: number, y?: number) {
    setView((current) => {
      const zoom = Math.max(0.05, Math.min(4, current.zoom * factor));
      const anchorX = x ?? stageWidth / 2, anchorY = y ?? stageHeight / 2;
      return { zoom, x: anchorX - (anchorX - current.x) * zoom / current.zoom, y: anchorY - (anchorY - current.y) * zoom / current.zoom };
    });
  }
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!infinite || !stage || busy) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = stage.getBoundingClientRect(); zoomCanvas(Math.exp(-event.deltaY * 0.005), event.clientX - bounds.left, event.clientY - bounds.top);
      } else setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [infinite, busy, expanded, stageWidth, stageHeight]);

  function point(event: React.PointerEvent<SVGSVGElement>, pageId: string): [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = infinite ? (event.clientX - bounds.left - viewRef.current.x) / viewRef.current.zoom : (event.clientX - bounds.left) / bounds.width * size.width;
    const y = infinite ? (event.clientY - bounds.top - viewRef.current.y) / viewRef.current.zoom - offsets[pages.findIndex((page) => page.id === pageId)] : (event.clientY - bounds.top) / bounds.height * size.height;
    return [Math.round(Math.max(infinite ? -1_000_000 : 0, Math.min(infinite ? 1_000_000 : size.width, x)) * 10) / 10,
      Math.round(Math.max(infinite ? -1_000_000 : 0, Math.min(infinite ? 1_000_000 : size.height, y)) * 10) / 10];
  }
  function startInk(event: React.PointerEvent<SVGSVGElement>, pageId: string) {
    if (busy || tool === "text" || tool === "hand" || event.button !== 0 || gesture.current) return;
    event.preventDefault(); event.stopPropagation(); setActivePage(pageId);
    stageRef.current?.focus({ preventScroll: true });
    if (tool === "eraser") {
      const target = event.target as Element, id = target.getAttribute("data-stroke-id"), owner = target.getAttribute("data-page-id");
      if (id) { const page = pages.find((item) => item.id === (owner ?? pageId))!; changeStrokes(page.id, page.strokes.filter((stroke) => stroke.id !== id)); setActivePage(page.id); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: SummaryStroke = { id: crypto.randomUUID(), tool, space: format, color, width: tool === "marker" ? width * 4 : width, points: [point(event, pageId)] };
    gesture.current = { pageId, pointerId: event.pointerId, stroke }; setLiveStroke({ pageId, stroke });
  }
  function moveInk(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.stroke.points.length >= 10_000) return;
    const next = point(event, current.pageId), last = current.stroke.points.at(-1)!;
    if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 1) return;
    current.stroke = { ...current.stroke, points: [...current.stroke.points, next] };
    setLiveStroke({ pageId: current.pageId, stroke: current.stroke });
  }
  function endInk(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null; setLiveStroke(null);
    const page = pages.find((item) => item.id === current.pageId)!;
    changeStrokes(page.id, [...page.strokes, current.stroke]);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancelInk() { gesture.current = null; setLiveStroke(null); }
  function drawingPaths(page: SummaryPage) {
    const placements = new Map<SummaryPageFormat, ReturnType<typeof summaryStrokePlacement>>();
    return [...page.strokes, ...(liveStroke?.pageId === page.id ? [liveStroke.stroke] : [])].map((stroke) => {
      const space = stroke.space ?? "portrait";
      let fit = placements.get(space);
      if (!fit) { fit = summaryStrokePlacement(stroke, page, format); placements.set(space, fit); }
      return <g key={stroke.id} transform={`translate(${fit.x} ${fit.y}) scale(${fit.scale})`}>
        <path data-stroke-id={stroke.id} data-page-id={page.id} d={strokePath(stroke)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeOpacity={stroke.tool === "marker" ? 0.3 : 1} strokeLinecap="round" strokeLinejoin="round"/>
        {tool === "eraser" && <path data-stroke-id={stroke.id} data-page-id={page.id} d={strokePath(stroke)} fill="none" stroke="transparent" strokeWidth={Math.max(18 / displayScale, stroke.width)} strokeLinecap="round"/>}
      </g>;
    });
  }
  function textEditor(page: SummaryPage, index: number) {
    return <RichTextEditor value={page.html} ariaLabel={index === 0 ? "Zusammenfassung bearbeiten" : `Zusammenfassung bearbeiten · Seite ${index + 1}`} ariaDescribedBy={`${fieldId}-hint`}
      onFocus={() => setActivePage(page.id)} onChange={(html) => { if (html !== page.html) updatePages(pages.map((item) => item.id === page.id ? { ...item, html } : item)); }}
      toolbarHost={activePage === page.id ? toolbarContainer : null} minHeightClass=""/>;
  }
  function fitCanvas() {
    let left = 0, top = 0, right = 794, bottom = 160;
    pages.forEach((page, index) => { const bounds = summaryDrawingBounds(page); left = Math.min(left, bounds.left); right = Math.max(right, bounds.left + bounds.width); top = Math.min(top, offsets[index] + bounds.top); bottom = Math.max(bottom, offsets[index] + bounds.top + bounds.height, offsets[index] + (textHeights[index] ?? 160)); });
    const zoom = Math.max(0.05, Math.min(1, (stageWidth - 32) / (right - left), (stageHeight - 32) / (bottom - top)));
    setView({ x: 16 - left * zoom, y: 16 - top * zoom, zoom });
  }

  const past = history.current.get(activePage);
  const content = <div ref={rootRef} className={`core-summary-document-editor ${expanded ? "core-summary-expanded" : ""}`} data-format={format} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? "Zusammenfassung bearbeiten – Arbeitsfläche" : undefined}
    style={{ "--summary-font": value.font === "serif" ? "Georgia, serif" : "inherit", "--summary-size": `${value.fontSize}px` } as React.CSSProperties}
    onKeyDown={(event) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && tool !== "text") { event.preventDefault(); undoDrawing(event.shiftKey); }
      if (expanded && event.key === "Tab" && rootRef.current?.contains(event.target as Node)) {
        const focusable = Array.from(rootRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, [tabindex='0'], [contenteditable='true']")).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    {expanded && <div className="core-summary-expanded-title"><label className="sr-only" htmlFor={`${fieldId}-title`}>Titel der Zusammenfassung</label><input ref={titleRef} id={`${fieldId}-title`} className="core-field" aria-invalid={Boolean(error) && !value.title.trim() || undefined} maxLength={120} value={value.title} disabled={busy} onChange={(event) => onChange({ ...value, title: event.target.value })}/><CoreTooltip label="Arbeitsfläche verkleinern"><IconButton label="Arbeitsfläche verkleinern" icon={Minimize2} disabled={busy} onClick={() => setExpanded(false)}/></CoreTooltip></div>}
    {expanded && error && <StatusMessage tone="error" announce="assertive">{error}</StatusMessage>}
    <div ref={toolsRef} className="core-summary-tools core-surface-raised" data-mode={tool} inert={busy}>
      <div className="core-summary-tool-modes" role="group" aria-label="Schreiben und Zeichnen">
        {([{ value: "text", label: "Schreiben", icon: Keyboard }, { value: "pen", label: "Stift", icon: PenLine }, { value: "marker", label: "Zeichenmarker", icon: Highlighter }, { value: "eraser", label: "Radierer", icon: Eraser }] as { value: Tool; label: string; icon: typeof Keyboard }[]).map((item) => <CoreTooltip key={item.value} label={item.label}><IconButton label={item.label} icon={item.icon} aria-pressed={tool === item.value} onClick={() => setTool(item.value)}/></CoreTooltip>)}
      </div>
      {infinite && <CoreTooltip label="Fläche verschieben"><IconButton className="core-summary-hand" label="Fläche verschieben" icon={Hand} aria-pressed={tool === "hand"} onClick={() => setTool("hand")}/></CoreTooltip>}
      <div ref={setToolbarContainer} className="core-summary-text-tools" hidden={tool !== "text"}/>
      <span className="core-summary-format-caption core-caption text-core-muted">{formatOptions.find((option) => option.value === format)!.label}{infinite ? ` · ${Math.round(view.zoom * 100)} %` : ` · ${pages.length} ${pages.length === 1 ? "Seite" : "Seiten"}`}</span>
      <div className="core-summary-tool-actions">
        {infinite && <CoreTooltip label="Inhalte einpassen"><IconButton label="Inhalte einpassen" icon={Scan} onClick={fitCanvas}/></CoreTooltip>}
        <Popover.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CoreTooltip label="Seiteneinstellungen"><Popover.Trigger asChild><IconButton ref={settingsTriggerRef} label="Seiteneinstellungen" icon={SlidersHorizontal}/></Popover.Trigger></CoreTooltip>
          <Popover.Portal><Popover.Content data-summary-settings className="core-summary-settings core-overlay" align="end" sideOffset={8} collisionPadding={8} aria-label="Seiteneinstellungen">
            <div className="flex items-center justify-between gap-3"><span className="core-field-label">Seite und Werkzeuge</span><Popover.Close asChild><IconButton label="Seiteneinstellungen schließen" icon={X}/></Popover.Close></div>
            <div className="core-field-group"><label className="core-field-label" htmlFor={`${fieldId}-format`}>Seitenformat</label><CoreSelect id={`${fieldId}-format`} ariaLabel="Seitenformat" value={format} options={formatOptions} onValueChange={(next) => { onChange({ ...value, pageFormat: next as SummaryPageFormat }); setView({ x: 32, y: 32, zoom: 1 }); }}/></div>
            {!infinite ? <div className="core-field-group"><label className="core-field-label" htmlFor={`${fieldId}-view`}>Ansicht</label><CoreSelect id={`${fieldId}-view`} ariaLabel="Seitenansicht" value={pageView} options={[{ value: "whole", label: "Ganze Seite" }, { value: "fit", label: "Seitenbreite" }, { value: "actual", label: "100 %" }]} onValueChange={setPageView}/></div>
              : <div className="flex flex-wrap items-center gap-2"><ActionButton variant="secondary" onClick={() => zoomCanvas(1 / 1.25)}>Verkleinern</ActionButton><ActionButton variant="secondary" onClick={() => zoomCanvas(1.25)}>Vergrößern</ActionButton><ActionButton variant="secondary" icon={Scan} onClick={fitCanvas}>Inhalte einpassen</ActionButton></div>}
            <div className="grid grid-cols-2 gap-3"><div className="core-field-group"><label htmlFor={`${fieldId}-font`} className="core-field-label">Schrift</label><CoreSelect id={`${fieldId}-font`} ariaLabel="Schrift" value={value.font} options={[{ value: "sans", label: "Standard" }, { value: "serif", label: "Serif" }]} onValueChange={(font) => onChange({ ...value, font: font as LearningSummary["font"] })}/></div><div className="core-field-group"><label htmlFor={`${fieldId}-size`} className="core-field-label">Schriftgröße</label><CoreSelect id={`${fieldId}-size`} ariaLabel="Schriftgröße" value={String(value.fontSize)} options={[{ value: "14", label: "14" }, { value: "16", label: "16" }, { value: "22", label: "22" }]} onValueChange={(next) => onChange({ ...value, fontSize: Number(next) as LearningSummary["fontSize"] })}/></div></div>
            <div className="flex flex-wrap items-center gap-3"><label className="core-summary-drawing-color core-caption">Farbe<input type="color" aria-label="Zeichenfarbe" value={color} onChange={(event) => setColor(event.target.value)}/></label><CoreSelect ariaLabel="Strichstärke" value={String(width)} options={[{ value: "2", label: "Fein" }, { value: "3", label: "Mittel" }, { value: "6", label: "Breit" }]} onValueChange={(next) => setWidth(Number(next))}/></div>
            <div className="flex flex-wrap gap-2"><IconButton label="Zeichnung rückgängig" icon={Undo2} disabled={!past?.undo.length} onClick={() => undoDrawing(false)}/><IconButton label="Zeichnung wiederholen" icon={Redo2} disabled={!past?.redo.length} onClick={() => undoDrawing(true)}/><ActionButton variant="secondary" icon={expanded ? Minimize2 : Maximize2} onClick={() => { setSettingsOpen(false); setExpanded(!expanded); }}>{expanded ? "Arbeitsfläche verkleinern" : "Arbeitsfläche vergrößern"}</ActionButton></div>
            <p className="core-field-hint">{infinite ? "Mit der Hand oder dem Mausrad verschieben. Strg und Mausrad verändert den Zoom. Texte wachsen ohne Seitenumbruch weiter." : "Ganze Seite passt die Seite in die verbleibende Höhe ein. Weitere Textwerkzeuge öffnen sich über der Seite."}</p>
          </Popover.Content></Popover.Portal>
        </Popover.Root>
        <CoreTooltip label="Speichern"><ActionButton className="core-summary-save" aria-label="Speichern" variant="primary" icon={Save} loading={busy} onClick={onSave}>Speichern</ActionButton></CoreTooltip>
      </div>
      <p className="sr-only" id={`${fieldId}-hint`}>{infinite ? "Unbegrenzte Fläche. Mit Hand oder Mausrad verschieben; Strg und Mausrad zoomt." : "Schreibe oder zeichne direkt auf die Seite. Weitere Einstellungen öffnest du über Seiteneinstellungen."}</p>
    </div>
    <div ref={stageRef} className={`core-summary-stage ${infinite ? "is-infinite" : ""}`} data-tool={tool} style={{ height: stageHeight }} role="region" aria-label={infinite ? "Infinity-Arbeitsfläche" : "Dokumentseiten"} tabIndex={0} inert={busy}
      onPointerDown={(event) => {
        if (!infinite || (tool !== "hand" && event.button !== 1) || panGesture.current) return;
        event.preventDefault(); panGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => { const current = panGesture.current; if (current?.pointerId === event.pointerId) setView({ ...current.view, x: current.view.x + event.clientX - current.x, y: current.view.y + event.clientY - current.y }); }}
      onPointerUp={(event) => { if (panGesture.current?.pointerId === event.pointerId) { panGesture.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onPointerCancel={() => { panGesture.current = null; }} onLostPointerCapture={() => { panGesture.current = null; }}>
      {infinite ? <>
        <div className="core-summary-infinity-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>{pages.map((page, index) => <div key={page.id} className="core-summary-infinity-text core-summary-editor" data-summary-page={page.id} style={{ top: offsets[index] }}>{textEditor(page, index)}</div>)}</div>
        <svg className="core-summary-drawing-layer" data-tool={tool} aria-label="Zeichenfläche Infinity" role="img" onPointerDown={(event) => startInk(event, activePage)} onPointerMove={moveInk} onPointerUp={endInk} onPointerCancel={cancelInk} onLostPointerCapture={cancelInk}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>{pages.map((page, index) => <g key={page.id} transform={`translate(0 ${offsets[index]})`}>{drawingPaths(page)}</g>)}</g>
        </svg>
      </> : <div className="core-summary-pages">{pages.map((page, index) => <div key={page.id} className="core-summary-page-wrap">
        <div className="core-summary-page-label"><span>Seite {index + 1} von {pages.length}</span><CoreTooltip label="Leere Seite entfernen"><IconButton label={`Leere Seite ${index + 1} entfernen`} icon={Trash2} disabled={pages.length === 1 || hasCardRichTextContent(page.html) || page.strokes.length > 0} onClick={() => { const next = pages.filter((item) => item.id !== page.id); setActivePage(next[Math.max(0, index - 1)].id); updatePages(next); }}/></CoreTooltip></div>
        <div className="core-summary-page-scaled" style={{ width: size.width * displayScale, height: size.height * displayScale }}><div className="core-summary-sheet core-summary-editor" data-summary-page={page.id} style={{ width: size.width, height: size.height, transform: `scale(${displayScale})` }}>
          {textEditor(page, index)}
          <svg className="core-summary-drawing-layer" data-tool={tool} viewBox={`0 0 ${size.width} ${size.height}`} aria-label={`Zeichenfläche Seite ${index + 1}`} role="img" onPointerDown={(event) => startInk(event, page.id)} onPointerMove={moveInk} onPointerUp={endInk} onPointerCancel={cancelInk} onLostPointerCapture={cancelInk}>{drawingPaths(page)}</svg>
        </div></div>
      </div>)}<ActionButton variant="secondary" icon={Plus} disabled={pages.length >= 100} onClick={() => { const page = emptyPage(); updatePages([...pages, page]); setActivePage(page.id); }}>Seite hinzufügen</ActionButton></div>}
    </div>
  </div>;
  return expanded ? createPortal(content, document.body) : content;
}
