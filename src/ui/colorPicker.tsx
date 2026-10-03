import React from "react";
import type { LucideIcon } from "lucide-react";
import type { HsvColor } from "./colorMath.ts";
import { clampNumber, colorHexPattern, hexToHsv, hsvToHex, normalizeColor } from "./colorMath.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

export { clampNumber, colorHexPattern, hexToHsv, hsvToHex, normalizeColor };

export const defaultTextColors = ["#181d25", "#262e3a", "#667492"];
export const defaultHighlightColors = ["#dde3ec", "#d6a3d2", "#e4bf63"];
export const textPaletteColors = ["#181d25", "#262e3a", "#667492", "#5e6b86", "#55617a"];
export const highlightPaletteColors = ["#dde3ec", "#a9b5c7", "#e28b68", "#d6a3d2", "#e4bf63"];
const colorSlotCount = 3;

function normalizeColorDraft(value: unknown) {
  const hexDigits = String(value ?? "")
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 6);
  return `#${hexDigits}`;
}

function normalizeColorSlots(value: unknown, defaults: readonly string[]): string[] {
  const source = Array.isArray(value) ? value : [];
  return defaults.slice(0, colorSlotCount).map((fallback, index) => normalizeColor(source[index], fallback));
}

function readStoredColorSlots(storageKey: string, defaults: readonly string[]): string[] {
  if (typeof window === "undefined") return [...defaults];

  try {
    return normalizeColorSlots(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"), defaults);
  } catch {
    return [...defaults];
  }
}

function writeStoredColorSlots(storageKey: string, colors: readonly string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(colors));
  } catch {
    // Color preferences are helpful, but editing should continue without storage.
  }
}

export function useStoredColorSlots(storageKey: string, defaults: readonly string[]) {
  const [colors, setColors] = React.useState(() => readStoredColorSlots(storageKey, defaults));

  const updateColorSlot = React.useCallback(
    (slotIndex: number, nextColor: unknown) => {
      setColors((currentColors) => {
        const fallback = currentColors[slotIndex] ?? defaults[slotIndex] ?? defaults[0];
        const normalizedColor = normalizeColor(nextColor, fallback);
        const nextColors = currentColors.map((color, index) => (index === slotIndex ? normalizedColor : color));
        writeStoredColorSlots(storageKey, nextColors);
        return nextColors;
      });
    },
    [defaults, storageKey],
  );

  return [colors, updateColorSlot] as const;
}

interface ColorToolButtonProps {
  label: string;
  icon: LucideIcon;
  color: string;
  isOpen: boolean;
  menuId: string;
  onToggle: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

export function ColorToolButton({ label, icon: Icon, color, isOpen, menuId, onToggle, buttonRef }: ColorToolButtonProps) {
  return (
    <CoreTooltip label={label}>
      <button
        ref={buttonRef}
        type="button"
        className="relative grid size-11 place-items-center rounded-inset border border-core-border bg-core-surface text-core-action transition hover:bg-core-subtle"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={onToggle}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="absolute bottom-1 right-1 size-3 rounded-round border border-core-border" style={{ backgroundColor: color }} />
      </button>
    </CoreTooltip>
  );
}

interface ColorPopoverProps {
  id: string;
  label: string;
  icon: LucideIcon;
  colors: string[];
  paletteColors: readonly string[];
  selectedSlot: number;
  onSelectSlot: (slotIndex: number) => void;
  onApply: (color: string, shouldClose?: boolean) => void;
  onChangeSlot: (slotIndex: number, color: string) => void;
}

export function ColorPopover({ id, label, icon: Icon, colors, paletteColors, selectedSlot, onSelectSlot, onApply, onChangeSlot }: ColorPopoverProps) {
  const selectedColor = colors[selectedSlot] ?? colors[0] ?? "#181d25";
  const [customColor, setCustomColor] = React.useState(selectedColor);
  const [spectrumColor, setSpectrumColor] = React.useState(() => hexToHsv(selectedColor));

  React.useEffect(() => {
    setCustomColor(selectedColor);
    setSpectrumColor(hexToHsv(selectedColor));
  }, [selectedColor]);

  function commitColor(color: string, nextSpectrumColor = hexToHsv(color)) {
    const normalizedColor = normalizeColor(color, selectedColor);
    setCustomColor(normalizedColor);
    setSpectrumColor(nextSpectrumColor);
    onChangeSlot(selectedSlot, normalizedColor);
    onApply(normalizedColor, false);
  }

  function chooseColor(color: string) {
    commitColor(color, hexToHsv(color));
  }

  function handleCustomColorChange(value: string) {
    const nextColor = normalizeColorDraft(value);
    setCustomColor(nextColor);
    if (colorHexPattern.test(nextColor)) {
      commitColor(nextColor, hexToHsv(nextColor));
    }
  }

  function chooseSpectrumColor(nextSpectrumColor: HsvColor) {
    const normalizedSpectrumColor = {
      hue: clampNumber(nextSpectrumColor.hue, 0, 360),
      saturation: clampNumber(nextSpectrumColor.saturation, 0, 1),
      value: clampNumber(nextSpectrumColor.value, 0, 1),
    };
    commitColor(hsvToHex(normalizedSpectrumColor), normalizedSpectrumColor);
  }

  function handleSpectrumPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const spectrum = event.currentTarget;

    function applyPointer(clientX: number, clientY: number) {
      const rect = spectrum.getBoundingClientRect();
      chooseSpectrumColor({
        hue: spectrumColor.hue,
        saturation: clampNumber((clientX - rect.left) / rect.width, 0, 1),
        value: 1 - clampNumber((clientY - rect.top) / rect.height, 0, 1),
      });
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      applyPointer(pointerEvent.clientX, pointerEvent.clientY);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    applyPointer(event.clientX, event.clientY);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  const spectrumHueColor = `hsl(${spectrumColor.hue} 100% 50%)`;

  return (
    <div id={id} role="dialog" aria-label={label} className="core-overlay absolute left-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-control p-3">
      <div className="mb-3 flex items-center justify-between gap-2 core-caption font-semibold uppercase tracking-wide text-core-muted">
        <span>{label}</span>
        <Icon size={15} aria-hidden="true" />
      </div>
      <p className="mb-2 core-caption font-semibold text-core-secondary">Gespeichert</p>
      <div className="grid grid-cols-3 gap-2">
        {colors.map((color: any, index: number) => (
          <CoreTooltip key={`${id}-${index}`} label={`${label} ${index + 1}`}>
            <button
              type="button"
              className={`grid min-h-11 place-items-center rounded-inset border bg-core-surface transition hover:bg-core-subtle ${
                selectedSlot === index ? "border-core-action shadow-selection" : "border-core-border"
              }`}
              aria-label={`${label} ${index + 1}`}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onSelectSlot(index);
                onApply(color, false);
                setCustomColor(color);
              }}
            >
              <span className="size-5 rounded-round border border-core-border" style={{ backgroundColor: color }} />
            </button>
          </CoreTooltip>
        ))}
      </div>
      <div className="mt-3 border-t border-core-subtle pt-3">
        <p className="mb-2 core-caption font-semibold text-core-secondary">Spektrum</p>
        <div
          className="relative h-28 cursor-crosshair overflow-hidden rounded-inset border border-core-border"
          style={{
            backgroundColor: spectrumHueColor,
            backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, rgba(255,255,255,0))",
          }}
          onPointerDown={handleSpectrumPointerDown}
          role="slider"
          aria-label={`${label} Spektrum`}
          aria-valuetext={customColor}
          tabIndex={0}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.08 : 0.03;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              chooseSpectrumColor({ ...spectrumColor, saturation: spectrumColor.saturation - step });
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              chooseSpectrumColor({ ...spectrumColor, saturation: spectrumColor.saturation + step });
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              chooseSpectrumColor({ ...spectrumColor, value: spectrumColor.value + step });
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              chooseSpectrumColor({ ...spectrumColor, value: spectrumColor.value - step });
            }
          }}
        >
          <span
            className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-round border-strong border-core-surface shadow-selection"
            style={{
              left: `${spectrumColor.saturation * 100}%`,
              top: `${(1 - spectrumColor.value) * 100}%`,
              backgroundColor: customColor,
            }}
          />
        </div>
        <label className="mt-2 grid gap-1 core-caption font-semibold text-core-muted">
          Farbton
          <input
            type="range"
            min="0"
            max="360"
            value={spectrumColor.hue}
            className="core-hue-range"
            aria-label={`${label} Farbton`}
            onChange={(event) => {
              chooseSpectrumColor({ ...spectrumColor, hue: Number(event.target.value) });
            }}
          />
        </label>
      </div>
      <div className="mt-3 border-t border-core-subtle pt-3">
        <p className="mb-2 core-caption font-semibold text-core-secondary">Schnellfarben</p>
        <div className="grid grid-cols-4 gap-1.5">
          {paletteColors.map((color: string|undefined) => (
            <CoreTooltip key={`${id}-palette-${color}`} label={color ?? label}>
              <button
                type="button"
                className={`grid size-11 place-items-center rounded-inset border bg-core-surface transition hover:scale-105 ${
                  normalizeColor(color, selectedColor) === selectedColor ? "border-core-action" : "border-core-border"
                }`}
                aria-label={`${label} ${color}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  if (color) chooseColor(color);
                }}
              >
                <span className="size-4 rounded-round border border-core-border" style={{ backgroundColor: color }} />
              </button>
            </CoreTooltip>
          ))}
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-inset border border-core-subtle bg-core-subtle p-2 core-caption font-semibold text-core-muted">
        <span className="grid size-8 shrink-0 place-items-center rounded-inset bg-core-surface text-core-action">{selectedSlot + 1}</span>
        <span className="size-6 shrink-0 rounded-round border border-core-border" style={{ backgroundColor: colorHexPattern.test(customColor) ? customColor : selectedColor }} />
        <CoreTooltip label={`${label} als Hex-Farbe`}>
          <input
            type="text"
            inputMode="text"
            spellCheck="false"
            maxLength={7}
            className="min-h-11 min-w-0 flex-1 rounded-inset border border-core-border bg-core-surface px-2 font-mono core-body font-semibold uppercase text-core-text outline-none transition"
            aria-label={`${label} als Hex-Farbe`}
            value={customColor}
            onChange={(event) => {
              handleCustomColorChange(event.target.value);
            }}
          />
        </CoreTooltip>
      </label>
    </div>
  );
}
