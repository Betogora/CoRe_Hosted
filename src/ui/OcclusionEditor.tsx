import React from "react";
import { Circle, EyeOff, Group, MousePointer2, Pentagon, Square, Trash2, Type, Ungroup, type LucideIcon } from "lucide-react";
import {
  addOcclusionMask,
  groupOcclusionMasks,
  moveOcclusionMasks,
  occlusionGroups,
  removeOcclusionMasks,
  setOcclusionMasksAlwaysOccluded,
  ungroupOcclusionMasks,
  updateOcclusionMaskShape,
  type DrawnOcclusionShape,
  type OcclusionMode,
} from "../coreModel.ts";
import type { OcclusionMask } from "../coreTypes.ts";
import { CoreSegmentedControl } from "./coreUi.tsx";

export interface OcclusionEditorProps {
  imageUrl: string;
  imageAlt: string;
  masks: OcclusionMask[];
  mode: OcclusionMode;
  onMasksChange: (masks: OcclusionMask[]) => void;
  onModeChange: (mode: OcclusionMode) => void;
  disabled?: boolean;
}

type Tool = "select" | "rect" | "ellipse" | "polygon" | "text";
type Point = [number, number];

const TOOLS: Array<{ value: Tool; label: string; icon: LucideIcon; key: string }> = [
  { value: "select", label: "Auswählen", icon: MousePointer2, key: "v" },
  { value: "rect", label: "Rechteck", icon: Square, key: "r" },
  { value: "ellipse", label: "Ellipse", icon: Circle, key: "e" },
  { value: "polygon", label: "Polygon", icon: Pentagon, key: "p" },
  { value: "text", label: "Text", icon: Type, key: "t" },
];

const MODE_OPTIONS = [
  { value: "hide-all-guess-one", label: "Alle" },
  { value: "hide-one-guess-one", label: "Nur eine" },
] as const;

const GROUP_COLORS = ["var(--core-palette-coral)", "var(--core-palette-lilac)", "var(--core-palette-marigold)", "var(--core-palette-slate)", "var(--core-palette-mist)"];
const SHAPE_NAMES: Record<OcclusionMask["shape"]["kind"], string> = { rect: "Rechteck", ellipse: "Ellipse", polygon: "Polygon", text: "Text", overlay: "Maskenbild" };

function groupColor(mask: OcclusionMask) {
  return mask.ordinal === 0 ? "var(--core-text-muted)" : GROUP_COLORS[(mask.ordinal - 1) % GROUP_COLORS.length];
}

function maskLabel(mask: OcclusionMask, index: number) {
  return `Maske ${index + 1}, ${SHAPE_NAMES[mask.shape.kind]}, ${mask.ordinal === 0 ? "bleibt verdeckt" : `Karte ${mask.ordinal}`}`;
}

/** Anchor of a mask for its group badge, in image fractions. */
function maskAnchor(shape: OcclusionMask["shape"]): Point {
  if (shape.kind === "polygon") return [Math.min(...shape.points.map(([x]) => x)), Math.min(...shape.points.map(([, y]) => y))];
  if (shape.kind === "overlay") return [0, 0];
  return [shape.left, shape.top];
}

/**
 * Draws, selects, groups and removes occlusion masks on one image. Mouse, pen and touch share pointer events;
 * every mask is a focusable button so selection, moving and removing also work by keyboard.
 */
export function OcclusionEditor({ imageUrl, imageAlt, masks, mode, onMasksChange, onModeChange, disabled = false }: OcclusionEditorProps) {
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const [tool, setTool] = React.useState<Tool>("rect");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState<DrawnOcclusionShape | null>(null);
  const [polygon, setPolygon] = React.useState<Point[]>([]);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [displayWidth, setDisplayWidth] = React.useState(0);
  const gesture = React.useRef<{ kind: "draw"; start: Point } | { kind: "move"; last: Point; moved: boolean } | null>(null);
  const labelInputRef = React.useRef<HTMLInputElement>(null);

  const selectedMasks = masks.filter((mask) => selected.includes(mask.id));
  const selectedText = selectedMasks.length === 1 && selectedMasks[0].shape.kind === "text" ? selectedMasks[0] : null;
  const allHidden = selectedMasks.length > 0 && selectedMasks.every((mask) => mask.ordinal === 0);
  const groups = occlusionGroups(masks);
  const hiddenCount = masks.filter((mask) => mask.ordinal === 0).length;

  React.useEffect(() => setSelected((current) => current.filter((id) => masks.some((mask) => mask.id === id))), [masks]);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(([entry]) => setDisplayWidth(entry.contentRect.width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, [size]);

  function point(event: React.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  }

  function addShape(shape: DrawnOcclusionShape) {
    const added = addOcclusionMask(masks, shape);
    onMasksChange(added.masks);
    setSelected([added.id]);
    if (shape.kind === "text") window.requestAnimationFrame(() => labelInputRef.current?.select());
  }

  function closePolygon(points: Point[]) {
    if (points.length >= 3) addShape({ kind: "polygon", points });
    setPolygon([]);
  }

  function onCanvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (disabled || event.button > 0) return;
    const at = point(event);
    if (tool === "polygon") {
      const first = polygon[0];
      if (first && polygon.length >= 3 && Math.hypot(first[0] - at[0], first[1] - at[1]) < 0.025) closePolygon(polygon);
      else setPolygon((current) => [...current, at]);
      return;
    }
    if (tool === "text") {
      addShape({ kind: "text", left: at[0], top: at[1], text: "Text", scale: 1, fontSize: 0.05, angle: 0 });
      return;
    }
    if (tool === "select") {
      setSelected([]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind: "draw", start: at };
    setDraft({ kind: tool, left: at[0], top: at[1], width: 0, height: 0, angle: 0 });
  }

  function onMaskPointerDown(event: React.PointerEvent, id: string) {
    if (disabled || tool !== "select") return;
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    setSelected((current) => additive ? (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) : current.includes(id) ? current : [id]);
    svgRef.current?.setPointerCapture(event.pointerId);
    gesture.current = { kind: "move", last: point(event), moved: false };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current) return;
    const at = point(event);
    if (current.kind === "draw" && draft && draft.kind !== "polygon" && draft.kind !== "text") {
      const [x, y] = current.start;
      setDraft({ ...draft, left: Math.min(x, at[0]), top: Math.min(y, at[1]), width: Math.abs(at[0] - x), height: Math.abs(at[1] - y) });
    }
    if (current.kind === "move") {
      const [dx, dy] = [at[0] - current.last[0], at[1] - current.last[1]];
      if (!dx && !dy) return;
      onMasksChange(moveOcclusionMasks(masks, selected, dx, dy));
      gesture.current = { kind: "move", last: at, moved: true };
    }
  }

  function onPointerUp() {
    const current = gesture.current;
    gesture.current = null;
    if (current?.kind === "draw" && draft && draft.kind !== "polygon" && draft.kind !== "text") {
      if (draft.width > 0.01 && draft.height > 0.01) addShape(draft);
      setDraft(null);
    }
  }

  function onEditorKeyDown(event: React.KeyboardEvent) {
    if (disabled || (event.target as HTMLElement).tagName === "INPUT") return;
    const command = event.ctrlKey || event.metaKey;
    if (event.key === "Escape") {
      setPolygon([]);
      setDraft(null);
      setSelected([]);
      return;
    }
    if (event.key === "Enter" && polygon.length >= 3) {
      event.preventDefault();
      closePolygon(polygon);
      return;
    }
    if (command && event.key.toLowerCase() === "g" && selected.length) {
      event.preventDefault();
      onMasksChange(event.shiftKey ? ungroupOcclusionMasks(masks, selected) : groupOcclusionMasks(masks, selected));
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected.length) {
      event.preventDefault();
      onMasksChange(removeOcclusionMasks(masks, selected));
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    const arrows: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[event.key] && selected.length) {
      event.preventDefault();
      onMasksChange(moveOcclusionMasks(masks, selected, ...arrows[event.key]));
      return;
    }
    const shortcut = TOOLS.find((entry) => entry.key === event.key.toLowerCase());
    if (shortcut && !command) setTool(shortcut.value);
  }

  function onMaskKeyDown(event: React.KeyboardEvent, id: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelected((current) => event.shiftKey ? (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) : [id]);
  }

  const width = size?.width ?? 1;
  const height = size?.height ?? 1;
  const px = (shape: DrawnOcclusionShape | OcclusionMask["shape"], key: string, mask?: OcclusionMask) => {
    const color = mask ? groupColor(mask) : "var(--core-action-primary)";
    const isSelected = mask ? selected.includes(mask.id) : false;
    const common = {
      fill: color,
      fillOpacity: mask?.ordinal === 0 ? 0.55 : 0.45,
      stroke: "var(--core-palette-midnight)",
      strokeOpacity: isSelected ? 1 : 0.6,
      strokeWidth: isSelected ? 2.5 : 1.5,
      strokeDasharray: isSelected ? "6 4" : undefined,
      vectorEffect: "non-scaling-stroke" as const,
    };
    if (shape.kind === "overlay") return null;
    if (shape.kind === "polygon") return <polygon key={key} points={shape.points.map(([x, y]) => `${x * width},${y * height}`).join(" ")} {...common} />;
    if (shape.kind === "text") {
      const fontSize = (shape.fontSize ?? 0.05) * height * shape.scale;
      return <text key={key} x={shape.left * width} y={shape.top * height + fontSize} fontSize={fontSize} fontFamily="Arial, sans-serif" fontWeight={700} transform={`rotate(${shape.angle} ${shape.left * width} ${shape.top * height})`} {...common} fillOpacity={1} strokeWidth={isSelected ? 2 : 0}>{shape.text}</text>;
    }
    const [x, y, w, h] = [shape.left * width, shape.top * height, shape.width * width, shape.height * height];
    const rotate = `rotate(${shape.angle} ${x} ${y})`;
    return shape.kind === "ellipse"
      ? <ellipse key={key} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} transform={rotate} {...common} />
      : <rect key={key} x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.04} transform={rotate} {...common} />;
  };

  const toolButtons = (
    <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="Werkzeuge">
      {TOOLS.map(({ value, label, icon: Icon, key }) => (
        <button key={value} type="button" aria-pressed={tool === value} disabled={disabled} title={`${label} (${key.toUpperCase()})`} onClick={() => { setTool(value); setPolygon([]); }}
          className="core-action-ghost lg:w-full lg:justify-start aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action">
          <Icon size={16} aria-hidden="true" />
          <span className="max-lg:sr-only">{label}</span>
        </button>
      ))}
    </div>
  );

  const selectionActions = (
    <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="Auswahl">
      <button type="button" className="core-action-ghost" disabled={disabled || selected.length < 2} onClick={() => onMasksChange(groupOcclusionMasks(masks, selected))} title="Gruppieren (Strg+G)"><Group size={16} aria-hidden="true" />Gruppieren</button>
      <button type="button" className="core-action-ghost" disabled={disabled || selected.length < 2} onClick={() => onMasksChange(ungroupOcclusionMasks(masks, selected))} title="Gruppe auflösen (Strg+Umschalt+G)"><Ungroup size={16} aria-hidden="true" />Auflösen</button>
      <button type="button" className="core-action-ghost aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action" aria-pressed={allHidden} disabled={disabled || !selected.length} onClick={() => onMasksChange(setOcclusionMasksAlwaysOccluded(masks, selected, !allHidden))} title="Bleibt auf allen Karten verdeckt und wird nicht abgefragt"><EyeOff size={16} aria-hidden="true" />Bleibt verdeckt</button>
      <button type="button" className="core-action-ghost text-core-danger" disabled={disabled || !selected.length} onClick={() => onMasksChange(removeOcclusionMasks(masks, selected))} title="Löschen (Entf)"><Trash2 size={16} aria-hidden="true" />Löschen</button>
    </div>
  );

  const labelField = selectedText && selectedText.shape.kind === "text" ? (
    <label className="grid min-w-0 gap-1 core-caption font-semibold text-core-muted">
      Beschriftung
      <input ref={labelInputRef} className="min-h-control min-w-0 rounded-control border border-core-border bg-core-surface px-3 core-body text-core-text" value={selectedText.shape.text} disabled={disabled}
        onChange={(event) => onMasksChange(updateOcclusionMaskShape(masks, selectedText.id, { ...(selectedText.shape as Extract<DrawnOcclusionShape, { kind: "text" }>), text: event.target.value || " " }))} />
    </label>
  ) : null;

  const modeControl = (
    <div className="grid min-w-0 gap-2">
      <span className="core-body font-semibold text-core-text">Verdecken</span>
      <CoreSegmentedControl ariaLabel="Verdeckungsmodus" options={MODE_OPTIONS} value={mode} onValueChange={onModeChange} disabled={disabled} />
    </div>
  );

  const cardList = (
    <div className="grid min-w-0 gap-2">
      <span className="core-body font-semibold text-core-text">{groups.length === 1 ? "1 Karte" : `${groups.length} Karten`}</span>
      <ul className="flex min-w-0 flex-wrap gap-2" data-testid="occlusion-groups">
        {groups.map((group) => (
          <li key={group.ordinal}>
            <button type="button" disabled={disabled} onClick={() => setSelected(group.masks.map((mask) => mask.id))} className="inline-flex min-h-control items-center gap-2 rounded-control border border-core-border bg-core-surface px-3 core-body text-core-text transition-colors hover:bg-core-subtle">
              <span className="size-3 rounded-round" style={{ background: groupColor(group.masks[0]) }} aria-hidden="true" />
              Karte {group.ordinal}{group.masks.length > 1 ? ` · ${group.masks.length} Masken` : ""}
            </button>
          </li>
        ))}
        {hiddenCount ? <li className="inline-flex min-h-control items-center gap-2 px-1 core-body text-core-muted"><EyeOff size={16} aria-hidden="true" />{hiddenCount} bleibt verdeckt</li> : null}
      </ul>
    </div>
  );

  const canvas = (
    <div className="relative min-w-0 overflow-hidden rounded-control border border-core-border bg-core-surface-muted" data-testid="occlusion-canvas">
      <img src={imageUrl} alt={imageAlt} className="block h-auto w-full select-none" draggable={false} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
      {size ? (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`absolute inset-0 size-full touch-none ${tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
          role="group"
          aria-label={`Masken auf ${imageAlt}`}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => tool === "polygon" && closePolygon(polygon)}
        >
          {masks.map((mask, index) => (
            <g key={mask.id} role="button" tabIndex={disabled ? -1 : 0} aria-label={maskLabel(mask, index)} aria-pressed={selected.includes(mask.id)} data-mask-id={mask.id}
              onPointerDown={(event) => onMaskPointerDown(event, mask.id)} onKeyDown={(event) => onMaskKeyDown(event, mask.id)} className="cursor-move focus:outline-none">
              {px(mask.shape, "shape", mask)}
              {mask.shape.kind !== "overlay" ? (() => {
                const [ax, ay] = maskAnchor(mask.shape);
                const radius = 11 * (displayWidth ? width / displayWidth : 1);
                return <g aria-hidden="true" pointerEvents="none"><circle cx={ax * width + radius} cy={ay * height + radius} r={radius} fill="var(--core-surface)" stroke={groupColor(mask)} strokeWidth={2} vectorEffect="non-scaling-stroke" /><text x={ax * width + radius} y={ay * height + radius} fontSize={radius * 1.2} textAnchor="middle" dominantBaseline="central" fill="var(--core-text)" fontWeight={700}>{mask.ordinal || "–"}</text></g>;
              })() : null}
            </g>
          ))}
          {draft ? px(draft, "draft") : null}
          {polygon.length ? <polyline points={polygon.map(([x, y]) => `${x * width},${y * height}`).join(" ")} fill="none" stroke="var(--core-action-primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
          {polygon.map(([x, y], index) => <circle key={index} cx={x * width} cy={y * height} r={Math.max(width, height) * 0.006} fill="var(--core-action-primary)" />)}
        </svg>
      ) : null}
    </div>
  );

  const hint = <p className="core-caption text-core-muted" role="status">{tool === "polygon" ? polygon.length ? "Weitere Punkte setzen; ersten Punkt, Doppelklick oder Enter schließt die Form." : "Punkte des Polygons nacheinander setzen." : tool === "select" ? "Maske antippen; mit Umschalt mehrere wählen. Pfeiltasten verschieben, Entf löscht." : "Auf dem Bild ziehen, um eine Maske zu zeichnen. Jede neue Maske wird eine eigene Karte."}</p>;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start" data-testid="occlusion-editor" onKeyDown={onEditorKeyDown}>
      <div className="grid min-w-0 gap-2">{canvas}{hint}</div>
      <aside className="grid min-w-0 gap-4 rounded-control border border-core-border bg-core-surface p-3" aria-label="Maskenwerkzeuge">
        <div className="grid gap-1"><span className="core-caption font-semibold text-core-muted">Werkzeuge</span>{toolButtons}</div>
        <div className="grid gap-1"><span className="core-caption font-semibold text-core-muted">Auswahl</span>{selectionActions}</div>
        {labelField}
        {modeControl}
        {cardList}
      </aside>
    </div>
  );
}
