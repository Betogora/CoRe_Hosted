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

export function colorContrast(first: string, second: string): number {
  const luminance = (hex: string) => hex.slice(1).match(/../g)!.reduce((sum, channel, index) => {
    const value = Number.parseInt(channel, 16) / 255;
    return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

/** Keeps hue/saturation and changes only brightness until text reaches WCAG AA. */
export function ensureTextContrast(color: string, background: string): string {
  if (colorContrast(color, background) >= 4.5) return color;
  const hsv = hexToHsv(color);
  const max = hsv.value;
  const min = max * (1 - hsv.saturation);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  const lighten = colorContrast("#ffffff", background) > colorContrast("#000000", background);
  for (let step = 1; step <= 255; step += 1) {
    const nextLightness = lighten ? lightness + (1 - lightness) * step / 255 : lightness * (1 - step / 255);
    const chroma = (1 - Math.abs(2 * nextLightness - 1)) * saturation;
    const value = nextLightness + chroma / 2;
    const candidate = hsvToHex({ hue: hsv.hue, value, saturation: value === 0 ? 0 : chroma / value });
    if (colorContrast(candidate, background) >= 4.5) return candidate;
  }
  return lighten ? "#ffffff" : "#000000";
}

export function resolveCssColor(input: string, background = "#ffffff"): string | null {
  const color = input.trim().toLowerCase();
  if (cssNamedColors[color]) return cssNamedColors[color];
  if (/^#[a-f\d]{3}$/i.test(color)) return `#${color.slice(1).split("").map((part) => part + part).join("")}`;
  if (/^#[a-f\d]{6}$/i.test(color)) return color;
  const match = color.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
  if (!match) return color === "transparent" ? background : null;
  const values = match[2].replace(/[,/]/g, " ").trim().split(/\s+/);
  if (values.length < 3 || values.some((value) => !Number.isFinite(Number.parseFloat(value)))) return null;
  let rgb: number[];
  if (match[1].startsWith("rgb")) rgb = values.slice(0, 3).map((value) => clampNumber(Number.parseFloat(value) * (value.endsWith("%") ? 2.55 : 1), 0, 255));
  else {
    const hue = Number.parseFloat(values[0]) * (values[0].endsWith("turn") ? 360 : values[0].endsWith("rad") ? 180 / Math.PI : 1);
    const saturation = clampNumber(Number.parseFloat(values[1]) / 100, 0, 1);
    const lightness = clampNumber(Number.parseFloat(values[2]) / 100, 0, 1);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const value = lightness + chroma / 2;
    rgb = hsvToHex({ hue, value, saturation: value === 0 ? 0 : chroma / value }).slice(1).match(/../g)!.map((part) => Number.parseInt(part, 16));
  }
  const alpha = values[3] === undefined ? 1 : clampNumber(Number.parseFloat(values[3]) / (values[3].endsWith("%") ? 100 : 1), 0, 1);
  const backdrop = background.slice(1).match(/../g)!.map((part) => Number.parseInt(part, 16));
  return rgbToHex({ red: rgb[0] * alpha + backdrop[0] * (1 - alpha), green: rgb[1] * alpha + backdrop[1] * (1 - alpha), blue: rgb[2] * alpha + backdrop[2] * (1 - alpha) });
}

// Standard CSS named-color values; lookup data, not an additional runtime dependency.
const cssNamedColors: Record<string, string> = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff","beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887","cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff","darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgrey":"#a9a9a9","darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f","darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkslategrey":"#2f4f4f","darkturquoise":"#00ced1","darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dimgrey":"#696969","dodgerblue":"#1e90ff","firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff","gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520","gray":"#808080","grey":"#808080","green":"#008000","greenyellow":"#adff2f","honeydew":"#f0fff0","hotpink":"#ff69b4","indianred":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c","lavender":"#e6e6fa","lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2","lightgreen":"#90ee90","lightgray":"#d3d3d3","lightgrey":"#d3d3d3","lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightslategrey":"#778899","lightsteelblue":"#b0c4de","lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6","magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370db","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee","mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970","mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5","navajowhite":"#ffdead","navy":"#000080","oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6","palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#db7093","papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080","rebeccapurple":"#663399","red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1","saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","slategrey":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4","tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0","violet":"#ee82ee","wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5","yellow":"#ffff00","yellowgreen":"#9acd32"};
