import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const styles = readFileSync("src/styles.css", "utf8").replace(/\r\n/g, "\n");
const lightTokens = styles.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
const darkTokens = styles.match(/\[data-core-theme="dark"\]\s*\{([\s\S]*?)\n\}/)![1];

function tokenColor(name: string, tokens: string): string {
  const declaration = new RegExp(`--core-${name}:\\s*([^;]+);`);
  const value = (tokens.match(declaration) ?? lightTokens.match(declaration))?.[1];
  assert.ok(value, `missing color ${name}`);
  const reference = value.match(/^var\(--core-([\w-]+)\)$/);
  if (reference) return tokenColor(reference[1], tokens);
  assert.match(value, /^#[0-9a-f]{6}$/i);
  return value.slice(1);
}

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
  for (const role of ["canvas", "surface", "surface-raised", "surface-muted", "group-depth-0", "group-depth-1", "group-depth-2", "group-depth-3", "group-depth-4", "group-depth-5", "text", "text-secondary", "text-muted", "border", "border-interactive", "focus", "action-primary", "action-primary-hover", "action-primary-active", "info", "success", "warning", "danger", "danger-hover", "info-surface", "success-surface", "warning-surface", "danger-surface"]) {
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
  assert.match(styles, /--core-learning-progress-completed:\s*#a7adb6/);
  assert.match(dark, /--core-learning-progress-completed:\s*#737b87/);
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

test("only individually overflowing deck names use at most two lines", () => {
  assert.match(styles, /\.core-deck-summary-name\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
  assert.match(styles, /\.core-deck-summary-name\[data-deck-name-wrap="true"\]\s*\{[\s\S]*?-webkit-line-clamp:\s*2;[\s\S]*?white-space:\s*normal;/);
});

test("six group depths retain endpoints and darken in light mode / lighten in dark mode", () => {
  const dark = styles.match(/\[data-core-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const lightDepths = ["ffffff", "f8f9fb", "f1f4f7", "ebeef4", "e4e9f0", "dde3ec"];
  const darkDepths = ["262e3a", "2a3340", "2e3846", "323c4b", "364151", "3a4657"];

  for (let depth = 1; depth <= 4; depth += 1) {
    assert.match(styles, new RegExp(`--core-group-depth-${depth}:\\s*#${lightDepths[depth]}`));
  }
  for (let depth = 1; depth <= 5; depth += 1) {
    assert.match(dark, new RegExp(`--core-group-depth-${depth}:\\s*#${darkDepths[depth]}`));
  }
  assert.match(styles, /--core-group-depth-5:\s*var\(--core-palette-cloud\)/);
  for (const colors of [lightDepths, darkDepths]) {
    const tokens = colors === lightDepths ? lightTokens : darkTokens;
    const actualColors = colors.map((_, depth) => tokenColor(`group-depth-${depth}`, tokens));
    const channels = actualColors.map((color) => color.match(/../g)!.map((channel) => Number.parseInt(channel, 16)));
    for (let depth = 0; depth < 6; depth += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const interpolated = channels[0][channel] + (channels[5][channel] - channels[0][channel]) * depth / 5;
        assert.equal(channels[depth][channel], Math.round(interpolated));
      }
    }
  }
  assert.doesNotMatch(styles, /--core-group-depth-[67]/);
  for (let depth = 0; depth <= 5; depth += 1) {
    assert.match(styles, new RegExp(`\\.core-deck-summary-row\\[data-deck-depth="${depth}"\\]\\s*\\{\\s*background-color:\\s*var\\(--core-group-depth-${depth}\\)`));
  }
});

test("theme exposes the six canonical typography levels and AA primary contrast", () => {
  for (const [role, size, leading, weight, family] of [
    ["heading-1", "2.25rem", "2.75rem", "heading", "Amulya"],
    ["heading-2", "1.75rem", "2.25rem", "heading", "Amulya"],
    ["heading-3", "1.375rem", "1.875rem", "control", "Amulya"],
    ["body-large", "1rem", "1.5rem", "body", "Synonym"],
    ["body", "0.875rem", "1.25rem", "body", "Synonym"],
    ["caption", "0.75rem", "1rem", "body", "Synonym"],
  ]) {
    assert.ok(lightTokens.includes(`--core-type-${role}: ${size};`));
    assert.ok(lightTokens.includes(`--core-leading-${role}: ${leading};`));
    assert.ok(styles.includes(`font: var(--core-weight-${weight}) var(--core-type-${role})/var(--core-leading-${role}) ${family},`));
  }
  for (const [role, weight] of [["body", 400], ["control", 500], ["emphasis", 600], ["heading", 700]]) {
    assert.ok(lightTokens.includes(`--core-weight-${role}: ${weight};`));
  }
  for (const tokens of [lightTokens, darkTokens]) {
    assert.ok(contrastRatio(tokenColor("action-primary", tokens), tokenColor("text-on-accent", tokens)) >= 4.5);
  }
});

test("product UI consumes the shared geometry scale instead of independent utility values", () => {
  for (const file of ["src/App.tsx", "src/AppErrorBoundary.tsx", ...productionFiles("src/screens"), ...productionFiles("src/ui"), "scripts/uiCatalogDemos.tsx", "scripts/uiCatalogPatterns.html"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\brounded(?:-[trbl])?-(?:sm|md|lg|xl|[23]xl|full|\[[^\]]+\])/, file);
    assert.doesNotMatch(source, /\bshadow-(?:sm|md|lg|xl|2xl|inner|\[)/, file);
    assert.doesNotMatch(source, /\btext-\[(?:\d|clamp\()/, file);
    assert.doesNotMatch(source, /\bborder-(?:[248]|\[\d)/, file);
    assert.doesNotMatch(source, /\bborder-(?:black|white)(?:\/|\b)/, file);
  }
  assert.equal((lightTokens.match(/--core-radius-/g) ?? []).length, 6);
  assert.doesNotMatch(styles, /border-radius:\s*(?:\d|\.)/);
  assert.doesNotMatch(styles, /--core-status-(?:info|success|warning|error)-(?:border|bg|text)/);
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
