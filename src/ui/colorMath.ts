export const colorHexPattern = /^#[0-9a-f]{6}$/i;

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeColor(value: unknown, fallback: string) {
  const color = String(value ?? "").trim();
  return colorHexPattern.test(color) ? color.toLowerCase() : fallback;
}

interface RgbColor { red: number; green: number; blue: number }
export interface HsvColor { hue: number; saturation: number; value: number }

function rgbToHex({ red, green, blue }: RgbColor) {
  return `#${[red, green, blue].map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hsvToHex({ hue, saturation, value }: HsvColor) {
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

export function hexToHsv(color: string, fallback = { hue: 235, saturation: 0.55, value: 0.82 }) {
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
