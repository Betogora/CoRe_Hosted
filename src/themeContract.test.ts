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
  for (const role of ["canvas", "surface", "surface-raised", "surface-muted", "group-depth-0", "group-depth-1", "group-depth-2", "group-depth-3", "group-depth-4", "text", "text-secondary", "text-muted", "border", "border-interactive", "focus", "action-primary", "action-primary-hover", "action-primary-active", "info", "success", "warning", "danger", "danger-hover", "info-surface", "success-surface", "warning-surface", "danger-surface"]) {
    assert.match(dark, new RegExp(`--core-${role}:`), `missing dark role ${role}`);
  }
  assert.match(styles, /:root\s*\{[\s\S]*?color-scheme:\s*light/);
  assert.match(dark, /color-scheme:\s*dark/);
  assert.match(styles, /--core-border:\s*#d5dbe5/);
  assert.match(dark, /--core-border:\s*#536078/);
  assert.equal((styles.match(/--core-group-depth-0:\s*var\(--core-surface\)/g) ?? []).length, 2);
  assert.match(styles, /--core-danger-hover:\s*var\(--core-palette-coral-glow\)/);
  assert.match(dark, /--core-danger-hover:\s*var\(--core-palette-coral\)/);
  for (const [status, role] of [
    ["learned", "info"],
    ["new", "success"],
    ["in-progress", "danger"],
    ["due", "warning"],
  ]) {
    assert.equal((styles.match(new RegExp(`--core-learning-status-${status}:\\s*var\\(--core-${role}\\)`, "g")) ?? []).length, 2);
  }
  assert.match(styles, /--core-learning-goal-achieved:\s*#2f7d68/);
  assert.match(dark, /--core-learning-goal-achieved:\s*#72d6b5/);
});

test("heatmap keeps historical lilac and uses a theme-adaptive gray forecast scale", () => {
  const dark = styles.match(/\[data-core-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const heatmapRules = styles.match(/\.core-heatmap-level-0,[\s\S]*?\.core-surface\s*\{/)?.[0] ?? "";

  assert.match(heatmapRules, /--core-heatmap-tone:\s*var\(--core-surface\)/);
  assert.match(heatmapRules, /--core-heatmap-tone:\s*var\(--core-heatmap-history-level-1,\s*var\(--core-success-surface\)\)/);
  assert.match(heatmapRules, /--core-heatmap-tone:\s*var\(--core-heatmap-history-level-2,\s*color-mix\(in srgb, var\(--core-success-surface\) 55%, var\(--core-success\)\)\)/);
  assert.match(heatmapRules, /--core-heatmap-tone:\s*var\(--core-heatmap-history-level-3,\s*var\(--core-palette-lilac\)\)/);
  assert.match(heatmapRules, /--core-heatmap-tone:\s*var\(--core-heatmap-history-level-4,\s*var\(--core-deck-new-text\)\)/);
  assert.match(dark, /--core-deck-new-text:\s*var\(--core-palette-lilac-glow\)/);
  assert.doesNotMatch(heatmapRules, /core-info/);
  assert.match(heatmapRules, /--core-heatmap-forecast-tone:\s*var\(--core-surface\)/);
  for (const surfacePercent of [90, 82, 72, 60]) {
    assert.match(heatmapRules, new RegExp(`color-mix\\(in srgb, var\\(--core-surface\\) ${surfacePercent}%, var\\(--core-text\\)\\)`));
  }
  assert.doesNotMatch(heatmapRules.match(/\.core-heatmap-forecast-level-0,[\s\S]*$/)?.[0] ?? "", /lilac|success|info/);
});

test("heatmap keeps its control group intact across responsive widths", () => {
  assert.match(styles, /@container core-study-heatmap \(min-width: 36rem\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  const mobileControls = styles.match(/@container core-study-heatmap \(max-width: 22rem\) \{([\s\S]*?)\n\}\n\n\.core-deck-tree-container/)?.[1] ?? "";
  assert.match(mobileControls, /\.core-study-heatmap-controls[\s\S]*?width: 100%/);
  assert.match(mobileControls, /\.core-segmented-control[\s\S]*?flex: 1 1 0%/);
  assert.match(mobileControls, /\.core-segmented-control-option[\s\S]*?padding-inline: 0\.375rem/);
});

test("group depths darken in light mode and lighten in dark mode", () => {
  const dark = styles.match(/\[data-core-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const lightDepths = ["ffffff", "f7f8fa", "f1f3f6", "e8edf3", "dde3ec"];
  const darkDepths = ["262e3a", "2b3441", "303a48", "35404f", "3a4657"];

  for (let depth = 1; depth <= 3; depth += 1) {
    assert.match(styles, new RegExp(`--core-group-depth-${depth}:\\s*#${lightDepths[depth]}`));
  }
  for (let depth = 1; depth <= 4; depth += 1) {
    assert.match(dark, new RegExp(`--core-group-depth-${depth}:\\s*#${darkDepths[depth]}`));
  }
  assert.match(styles, /--core-group-depth-4:\s*var\(--core-palette-cloud\)/);
  assert.ok(lightDepths.every((color, index) => index === 0 || relativeLuminance(lightDepths[index - 1]) > relativeLuminance(color)));
  assert.ok(darkDepths.every((color, index) => index === 0 || relativeLuminance(darkDepths[index - 1]) < relativeLuminance(color)));
  assert.match(styles, /\.core-deck-summary-row\[data-deck-depth="4"\]\s*\{\s*background-color:\s*var\(--core-group-depth-4\)/);
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

test("autofilled email inputs keep the themed field surface", () => {
  const autofillRule = styles.match(/input\[type="email"\]:autofill\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(autofillRule, /-webkit-text-fill-color:\s*var\(--core-text\)/);
  assert.match(autofillRule, /box-shadow:\s*inset 0 0 0 1000px var\(--core-surface\)/);
});

test("dragged deck rows lift without a list-only brightness filter", () => {
  const activeDragRule = styles.match(/\.core-deck-summary-row\[data-drag-state="active"\]\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(activeDragRule, /transform:\s*translateY\(-2px\) scaleY\(1\.03\)/);
  assert.doesNotMatch(activeDragRule, /\bscale\(/);
  assert.doesNotMatch(styles, /core-deck-tree-rows:has\([^)]*data-drag-state="active"[^)]*\)/);
});

test("the UI catalog lists every canonical shared export", () => {
  const catalog = readFileSync("src/ui/README.md", "utf8");
  for (const name of ["SoftPanel", "PageHeader", "EmptyState", "ActionDialog", "OrbIcon", "StatTile", "SegmentedDonut", "DailyReviewProgress", "CoreModeControl", "ActionButton", "IconButton", "StatusMessage", "SuccessToast", "SuccessToastProvider", "useSuccessToast"]) {
    assert.match(catalog, new RegExp(`\\b${name}\\b`));
  }
});
