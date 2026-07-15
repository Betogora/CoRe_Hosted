import React from "react";
import type { LucideIcon } from "lucide-react";

export const defaultTextColors = ["#17214f", "#2563eb", "#b42318"];
export const defaultHighlightColors = ["#fef08a", "#bbf7d0", "#bae6fd"];
export const textPaletteColors = ["#17214f", "#4f5eb1", "#2563eb", "#047857", "#0f766e", "#b54708", "#b42318", "#7c3aed", "#475569"];
export const highlightPaletteColors = ["#fef08a", "#fde68a", "#bbf7d0", "#bae6fd", "#c7d2fe", "#e9d5ff", "#fecdd3", "#fed7aa", "#e2e8f0"];
export const colorHexPattern = /^#[0-9a-f]{6}$/i;

const colorSlotCount = 3;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeColor(value: unknown, fallback: string) {
  const color = String(value ?? "").trim();
  return colorHexPattern.test(color) ? color.toLowerCase() : fallback;
}

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

interface RgbColor { red: number; green: number; blue: number }
interface HsvColor { hue: number; saturation: number; value: number }

function rgbToHex({ red, green, blue }: RgbColor) {
  return `#${[red, green, blue].map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function hsvToHex({ hue, saturation, value }: HsvColor) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const segment = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return rgbToHex({
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
  });
}

function hexToHsv(color: string, fallback = { hue: 235, saturation: 0.55, value: 0.82 }) {
  const normalizedColor = normalizeColor(color, "");
  if (!normalizedColor) return fallback;

  const red = Number.parseInt(normalizedColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = fallback.hue;

  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    if (max === green) hue = 60 * ((blue - red) / delta + 2);
    if (max === blue) hue = 60 * ((red - green) / delta + 4);
  }

  return {
    hue: Math.round((hue + 360) % 360),
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
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
    <button
      ref={buttonRef}
      type="button"
      className="relative grid size-9 place-items-center rounded-lg border border-[#dfe4f5] bg-white text-[#4f5eb1] transition hover:bg-[#f8f9fe]"
      title={label}
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
      <span className="absolute bottom-1 right-1 size-3 rounded-full border border-black/10" style={{ backgroundColor: color }} />
    </button>
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
  const selectedColor = colors[selectedSlot] ?? colors[0] ?? "#17214f";
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
    <div id={id} role="dialog" aria-label={label} className="core-overlay absolute left-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl p-3">
      <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">
        <span>{label}</span>
        <Icon size={15} aria-hidden="true" />
      </div>
      <p className="mb-2 text-xs font-semibold text-[#4e5b8c]">Gespeichert</p>
      <div className="grid grid-cols-3 gap-2">
        {colors.map((color: any, index: number) => (
          <button
            key={`${id}-${index}`}
            type="button"
            className={`grid min-h-10 place-items-center rounded-lg border bg-white transition hover:bg-[#f8f9fe] ${
              selectedSlot === index ? "border-[#4f5eb1] shadow-[0_0_0_2px_rgba(79,94,177,0.13)]" : "border-[#dfe4f5]"
            }`}
            title={`${label} ${index + 1}`}
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
            <span className="size-5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
          </button>
        ))}
      </div>
      <div className="mt-3 border-t border-[#e8ecf8] pt-3">
        <p className="mb-2 text-xs font-semibold text-[#4e5b8c]">Spektrum</p>
        <div
          className="relative h-28 cursor-crosshair overflow-hidden rounded-lg border border-[#dfe4f5]"
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
            className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(23,33,79,0.35),0_3px_10px_rgba(23,33,79,0.24)]"
            style={{
              left: `${spectrumColor.saturation * 100}%`,
              top: `${(1 - spectrumColor.value) * 100}%`,
              backgroundColor: customColor,
            }}
          />
        </div>
        <label className="mt-2 grid gap-1 text-xs font-semibold text-[#66709a]">
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
      <div className="mt-3 border-t border-[#e8ecf8] pt-3">
        <p className="mb-2 text-xs font-semibold text-[#4e5b8c]">Schnellfarben</p>
        <div className="grid grid-cols-6 gap-1.5">
          {paletteColors.map((color: string|undefined) => (
            <button
              key={`${id}-palette-${color}`}
              type="button"
              className={`grid size-6 place-items-center rounded-md border bg-white transition hover:scale-105 ${
                normalizeColor(color, selectedColor) === selectedColor ? "border-[#4f5eb1]" : "border-[#dfe4f5]"
              }`}
              title={color}
              aria-label={`${label} ${color}`}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (color) chooseColor(color);
              }}
            >
              <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#e8ecf8] bg-[#f8f9fe] p-2 text-xs font-semibold text-[#66709a]">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white text-[#4f5eb1]">{selectedSlot + 1}</span>
        <span className="size-6 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: colorHexPattern.test(customColor) ? customColor : selectedColor }} />
        <input
          type="text"
          inputMode="text"
          spellCheck="false"
          maxLength={7}
          className="min-h-9 min-w-0 flex-1 rounded-md border border-[#dfe4f5] bg-white px-2 font-mono text-sm font-semibold uppercase text-[#17214f] outline-none transition focus:border-[#4f5eb1] focus:shadow-[0_0_0_3px_rgba(79,94,177,0.13)]"
          title={`${label} als Hex-Farbe`}
          aria-label={`${label} als Hex-Farbe`}
          value={customColor}
          onChange={(event) => {
            handleCustomColorChange(event.target.value);
          }}
        />
      </label>
    </div>
  );
}
