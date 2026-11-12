import * as Popover from "@radix-ui/react-popover";
import React from "react";
import type { LucideIcon } from "lucide-react";
import { clampNumber, hexToHsv, hsvToHex, normalizeColor } from "../colorMath.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

/** Quick picks as a two-row rainbow: each column is one hue, strong above and lightened below. */
export const COLOR_PICKER_PRESETS = [
  "#e5484d", "#f28c28", "#edb72a", "#3fa66b", "#0d8e90", "#3b7dd8", "#8b5cf6",
  "#f5a3a6", "#f9c48f", "#f6dd8e", "#9ed5b3", "#8acfd0", "#a4c2ee", "#c9b4fa",
] as const;

interface ColorWheelPosition { hue: number; intensity: number }

// Exact BengtsToolBox values without a CoRe geometry token: popover radius, inner shadow and the selection ring.
const TOOLBOX_INNER_SHADOW = "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)";
const TOOLBOX_POPOVER_RADIUS = "12px";
const TOOLBOX_SELECTED_RING = "0 0 0 2px var(--core-surface), 0 0 0 4px color-mix(in srgb, var(--core-text) 70%, transparent), var(--core-shadow-soft)";

function colorFromWheelPosition({ hue, intensity }: ColorWheelPosition) {
  return hsvToHex({ hue, saturation: clampNumber(intensity, 0, 1), value: 1 });
}

function wheelPositionFromColor(color: string): ColorWheelPosition {
  const { hue, saturation } = hexToHsv(color);
  return { hue, intensity: saturation };
}

function wheelPositionFromPoint(x: number, y: number, size: number): ColorWheelPosition {
  const radius = Math.max(size / 2, 1);
  const deltaX = x - radius;
  const deltaY = y - radius;
  return {
    hue: ((Math.atan2(deltaX, -deltaY) * 180) / Math.PI + 360) % 360,
    intensity: clampNumber(Math.hypot(deltaX, deltaY) / radius, 0, 1),
  };
}

function getMarkerPosition({ hue, intensity }: ColorWheelPosition) {
  const radians = (hue * Math.PI) / 180;
  const radius = clampNumber(intensity, 0, 1) * 50;
  return {
    left: 50 + Math.sin(radians) * radius,
    top: 50 - Math.cos(radians) * radius,
  };
}

interface ColorPickerProps {
  value: string;
  ariaLabel: string;
  onValueCommit: (color: string) => void;
  /** `compact` shows the color as a square swatch; `tool` shows a toolbar icon with a color bar and keeps a text selection alive. */
  variant?: "compact" | "tool";
  icon?: LucideIcon;
  presets?: readonly string[];
  disabled?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export function ColorPicker({
  value,
  ariaLabel,
  onValueCommit,
  variant = "compact",
  icon: Icon,
  presets = COLOR_PICKER_PRESETS,
  disabled = false,
  className = "",
  onOpenChange,
}: ColorPickerProps) {
  const normalizedValue = normalizeColor(value, "#6f7e9e");
  const [isOpen, setIsOpen] = React.useState(false);
  const [previewColor, setPreviewColor] = React.useState(normalizedValue);
  const [position, setPosition] = React.useState(() => wheelPositionFromColor(normalizedValue));
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const activePointerRef = React.useRef<number | null>(null);
  const pendingPositionRef = React.useRef<ColorWheelPosition | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const tool = variant === "tool";

  function applyPosition(nextPosition: ColorWheelPosition) {
    const nextColor = colorFromWheelPosition(nextPosition);
    setPosition(nextPosition);
    setPreviewColor(nextColor);
    return nextColor;
  }

  function applyColor(nextColor: string) {
    setPosition(wheelPositionFromColor(nextColor));
    setPreviewColor(nextColor);
  }

  function flushPendingPosition() {
    animationFrameRef.current = null;
    const nextPosition = pendingPositionRef.current;
    pendingPositionRef.current = null;
    return nextPosition ? applyPosition(nextPosition) : null;
  }

  function schedulePosition(nextPosition: ColorWheelPosition) {
    pendingPositionRef.current = nextPosition;
    if (animationFrameRef.current === null) animationFrameRef.current = window.requestAnimationFrame(flushPendingPosition);
  }

  function updateFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (rect) schedulePosition(wheelPositionFromPoint(event.clientX - rect.left, event.clientY - rect.top, Math.min(rect.width, rect.height)));
  }

  // A tool applies its color to the current selection, so the same color counts again.
  function commitColor(nextColor: string) {
    if (tool || nextColor !== normalizedValue) onValueCommit(nextColor);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) applyColor(normalizedValue);
    setIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const nextPosition = { ...position };
    if (event.key === "ArrowLeft") nextPosition.hue -= 5;
    else if (event.key === "ArrowRight") nextPosition.hue += 5;
    else if (event.key === "ArrowUp") nextPosition.intensity += 0.05;
    else if (event.key === "ArrowDown") nextPosition.intensity -= 0.05;
    else return;

    event.preventDefault();
    commitColor(applyPosition({
      hue: (nextPosition.hue + 360) % 360,
      intensity: clampNumber(nextPosition.intensity, 0, 1),
    }));
  }

  React.useEffect(() => () => {
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const shownColor = isOpen ? previewColor : normalizedValue;
  // A tool popover stays in its toolbar's DOM, so focus in it still counts as being inside the editor.
  const Portal = tool ? React.Fragment : Popover.Portal;
  const markerPosition = getMarkerPosition(position);
  const trigger = tool ? (
    <Popover.Trigger asChild>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={`core-rich-text-tool relative ${className}`}
        onMouseDown={(event) => event.preventDefault()}
      >
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span aria-hidden="true" className="absolute inset-x-2 bottom-1 h-1 rounded-round" style={{ backgroundColor: shownColor }} />
      </button>
    </Popover.Trigger>
  ) : (
    <Popover.Trigger asChild>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={`size-button shrink-0 rounded-control border border-core-border bg-core-canvas p-0.5 shadow-soft transition-colors hover:border-core-action disabled:pointer-events-none disabled:opacity-50 ${className}`}
      >
        <span aria-hidden="true" className="block size-full rounded-marker border border-core-border" style={{ backgroundColor: shownColor, boxShadow: TOOLBOX_INNER_SHADOW }} />
      </button>
    </Popover.Trigger>
  );

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      {tool ? <CoreTooltip label={ariaLabel}>{trigger}</CoreTooltip> : trigger}
      <Portal>
        <Popover.Content
          align={tool ? "start" : "end"}
          sideOffset={6}
          collisionPadding={12}
          aria-label={ariaLabel}
          data-testid="color-wheel-popover"
          className="core-overlay z-[90] w-[min(17rem,calc(100vw-1.5rem))] p-3.5 outline-none"
          style={{ borderRadius: TOOLBOX_POPOVER_RADIUS }}
          // A text selection stays in its editor while a tool color is applied there.
          onFocusOutside={tool ? (event) => event.preventDefault() : undefined}
          // Escape closes only the picker, not a surrounding editor or dialog in the React tree.
          onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
        >
          <div
            ref={wheelRef}
            role="slider"
            tabIndex={0}
            aria-label="Farbkreis: links und rechts ändern den Farbton, oben und unten die Intensität"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(position.hue)}
            aria-valuetext={`${previewColor}, ${Math.round(position.intensity * 100)} %`}
            className="relative mx-auto aspect-square w-full max-w-48 touch-none rounded-round border border-core-border outline-none"
            style={{
              boxShadow: TOOLBOX_INNER_SHADOW,
              backgroundImage: "radial-gradient(circle, #fff 0%, rgb(255 255 255 / 0) 100%), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            }}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              event.preventDefault();
              activePointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (activePointerRef.current === event.pointerId) updateFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (activePointerRef.current !== event.pointerId) return;
              updateFromPointer(event);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              activePointerRef.current = null;
              if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
              const nextColor = flushPendingPosition();
              if (nextColor) commitColor(nextColor);
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              activePointerRef.current = null;
              pendingPositionRef.current = null;
              if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
              }
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-round border-strong"
              style={{
                backgroundColor: previewColor,
                borderColor: "#fff",
                boxShadow: "0 0 0 1px rgb(6 52 79 / 0.75)",
                left: `${markerPosition.left}%`,
                top: `${markerPosition.top}%`,
              }}
            />
          </div>
          <div role="radiogroup" aria-label="Farbvorschläge" className="mt-3 grid grid-cols-7 justify-items-center gap-2 border-t border-core-border pt-3">
            {presets.map((preset) => {
              const presetColor = normalizeColor(preset, normalizedValue);
              const selected = presetColor === previewColor;
              return (
                <button
                  key={presetColor}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Farbe ${presetColor.toUpperCase()}`}
                  className={`size-7 min-h-0 !min-w-0 rounded-round transition-transform ${selected ? "" : "hover:scale-110"}`}
                  style={{ backgroundColor: presetColor, boxShadow: selected ? TOOLBOX_SELECTED_RING : "var(--core-shadow-soft)" }}
                  onMouseDown={tool ? (event) => event.preventDefault() : undefined}
                  onClick={() => {
                    applyColor(presetColor);
                    commitColor(presetColor);
                  }}
                />
              );
            })}
          </div>
        </Popover.Content>
      </Portal>
    </Popover.Root>
  );
}
