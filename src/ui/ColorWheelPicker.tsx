import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { clampNumber, hexToHsv, hsvToHex, normalizeColor } from "./colorMath.ts";

interface ColorWheelPosition { hue: number; intensity: number }

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

interface ColorWheelPickerProps {
  value: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  onValueCommit: (color: string) => void;
}

export function ColorWheelPicker({
  value,
  ariaLabel = "Farbe wählen",
  disabled = false,
  className = "",
  onValueCommit,
}: ColorWheelPickerProps) {
  const normalizedValue = normalizeColor(value, "#6f7e9e");
  const [isOpen, setIsOpen] = React.useState(false);
  const [previewColor, setPreviewColor] = React.useState(normalizedValue);
  const [position, setPosition] = React.useState(() => wheelPositionFromColor(normalizedValue));
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const activePointerRef = React.useRef<number | null>(null);
  const pendingPositionRef = React.useRef<ColorWheelPosition | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);

  function applyPosition(nextPosition: ColorWheelPosition) {
    const nextColor = colorFromWheelPosition(nextPosition);
    setPosition(nextPosition);
    setPreviewColor(nextColor);
    return nextColor;
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

  function commitColor(nextColor: string) {
    if (nextColor !== normalizedValue) onValueCommit(nextColor);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPreviewColor(normalizedValue);
      setPosition(wheelPositionFromColor(normalizedValue));
    }
    setIsOpen(nextOpen);
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

  const markerPosition = getMarkerPosition(position);

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={`size-11 shrink-0 rounded-xl border border-[var(--core-border-interactive)] bg-core-surface p-1 shadow-sm transition hover:border-[var(--core-action-primary)] disabled:pointer-events-none disabled:opacity-50 ${className}`}
        >
          <span
            aria-hidden="true"
            className="block size-full rounded-lg border border-black/10 shadow-inner"
            style={{ backgroundColor: isOpen ? previewColor : normalizedValue }}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={ariaLabel}
          data-testid="color-wheel-popover"
          className="core-overlay z-50 w-[min(17rem,calc(100vw-1.5rem))] rounded-xl p-3 outline-none"
        >
          <div
            ref={wheelRef}
            role="slider"
            tabIndex={0}
            aria-label="Farbkreis: Pfeiltasten ändern Farbe und Intensität"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(position.hue)}
            aria-valuetext={`${previewColor}, ${Math.round(position.intensity * 100)} %`}
            className="relative mx-auto aspect-square w-full max-w-[14.75rem] touch-none rounded-full border-2 border-[var(--core-border-interactive)] shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]"
            style={{
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
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                backgroundColor: previewColor,
                boxShadow: "0 0 0 1px var(--core-text)",
                left: `${markerPosition.left}%`,
                top: `${markerPosition.top}%`,
              }}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
