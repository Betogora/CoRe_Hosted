import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const styles = readFileSync("src/styles.css", "utf8");

function relativeLuminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  return channels.reduce((sum, value, index) => {
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

test("theme declares all twelve palette primitives and a complete dark semantic override", () => {
  for (const color of ["#6f7e9e", "#a9b5c7", "#dde3ec", "#e28b68", "#d6a3d2", "#e4bf63", "#181d25", "#262e3a", "#8fa0bf", "#f0a07e", "#e4b5e1", "#f0cc77"]) {
    assert.match(styles, new RegExp(color, "i"));
  }
  const dark = styles.match(/\[data-core-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  for (const role of ["canvas", "surface", "surface-raised", "surface-muted", "group-depth-0", "group-depth-1", "group-depth-2", "group-depth-3", "text", "text-secondary", "text-muted", "border", "border-interactive", "focus", "action-primary", "action-primary-hover", "action-primary-active", "info", "success", "warning", "danger", "danger-hover", "info-surface", "success-surface", "warning-surface", "danger-surface"]) {
    assert.match(dark, new RegExp(`--core-${role}:`), `missing dark role ${role}`);
  }
  assert.match(styles, /:root\s*\{[\s\S]*?color-scheme:\s*light/);
  assert.match(dark, /color-scheme:\s*dark/);
  assert.match(styles, /--core-border:\s*#d5dbe5/);
  assert.match(dark, /--core-border:\s*#536078/);
  assert.equal((styles.match(/--core-group-depth-0:\s*var\(--core-surface\)/g) ?? []).length, 2);
  assert.match(styles, /--core-danger-hover:\s*var\(--core-palette-coral-glow\)/);
  assert.match(dark, /--core-danger-hover:\s*var\(--core-palette-coral\)/);
});

test("theme exposes the six canonical typography levels and AA primary contrast", () => {
  for (const declaration of [
    "700 2.25rem/2.75rem Amulya",
    "700 1.75rem/2.25rem Amulya",
    "500 1.375rem/1.875rem Amulya",
    "400 1rem/1.5rem Synonym",
    "400 0.875rem/1.25rem Synonym",
    "400 0.75rem/1rem Synonym",
  ]) assert.ok(styles.includes(declaration), `missing typography ${declaration}`);
  assert.ok(contrastRatio("667492", "ffffff") >= 4.5);
  assert.ok(contrastRatio("181d25", "f3f5f8") >= 4.5);
});

test("productive TSX does not reintroduce the replaced palette or named status utilities", () => {
  const source = ["src/App.tsx", "src/AppErrorBoundary.tsx", ...productionFiles("src/screens"), ...productionFiles("src/ui")]
    .filter((path) => !path.endsWith("colorPicker.tsx"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /#(?:17214f|66709a|4f5eb1|dfe4f5|4e5b8c|eef1fb|f8f9fe)/i);
  assert.doesNotMatch(source, /(?:bg|text|border|from|via|to|ring)-(?:red|green|amber|yellow|orange|teal|emerald|sky|blue|indigo|violet|purple|pink|rose)-\d+/);
});

test("interactive controls keep DOM focus without visible focus frames", () => {
  const source = ["src/App.tsx", "src/AppErrorBoundary.tsx", ...productionFiles("src/screens"), ...productionFiles("src/ui")]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.match(styles, /:focus\s*\{[\s\S]*?outline:\s*none\s*!important;[\s\S]*?--tw-ring-shadow:\s*0 0 #0000\s*!important;/);
  assert.doesNotMatch(styles, /core-deck-summary-row:has\([^)]*:focus-visible/);
  assert.doesNotMatch(source, /focus-within:(?:border|outline|ring|shadow)/);
  assert.doesNotMatch(source, /focus(?:-visible)?:(?:border|shadow)/);
});

test("the UI catalog lists every canonical shared export", () => {
  const catalog = readFileSync("src/ui/README.md", "utf8");
  for (const name of ["SoftPanel", "PageHeader", "EmptyState", "ActionDialog", "OrbIcon", "StatTile", "MiniProgress", "DonutValue", "CoreModeControl", "ThemeToggle", "ActionButton", "IconButton", "StatusMessage", "SuccessToast", "SuccessToastProvider", "useSuccessToast"]) {
    assert.match(catalog, new RegExp(`\\b${name}\\b`));
  }
});
