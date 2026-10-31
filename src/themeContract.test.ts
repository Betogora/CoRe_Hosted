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

test("dark theme overrides every semantic role and both themes declare their color scheme", () => {
  for (const role of ["canvas", "surface", "surface-raised", "surface-muted", "group-depth-0", "group-depth-1", "group-depth-2", "group-depth-3", "group-depth-4", "group-depth-5", "text", "text-secondary", "text-muted", "border", "border-interactive", "focus", "action-primary", "action-primary-hover", "action-primary-active", "info", "success", "warning", "danger", "danger-hover", "info-surface", "success-surface", "warning-surface", "danger-surface"]) {
    assert.match(darkTokens, new RegExp(`--core-${role}:`), `missing dark role ${role}`);
  }
  assert.match(lightTokens, /color-scheme:\s*light/);
  assert.match(darkTokens, /color-scheme:\s*dark/);
});

test("six group depths darken in light mode, lighten in dark mode and color their deck rows", () => {
  for (const [tokens, direction] of [[lightTokens, -1], [darkTokens, 1]] as const) {
    const channels = Array.from({ length: 6 }, (_, depth) => tokenColor(`group-depth-${depth}`, tokens).match(/../g)!.map((channel) => Number.parseInt(channel, 16)));
    for (let depth = 1; depth < 6; depth += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(Math.sign(channels[depth][channel] - channels[depth - 1][channel]) === direction, `depth ${depth} channel ${channel}`);
      }
    }
  }
  for (let depth = 0; depth <= 5; depth += 1) {
    assert.match(styles, new RegExp(`\\.core-deck-summary-row\\[data-deck-depth="${depth}"\\]\\s*\\{\\s*background-color:\\s*var\\(--core-group-depth-${depth}\\)`));
  }
});

test("primary actions keep AA text contrast in both themes", () => {
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
  assert.doesNotMatch(styles, /border-radius:\s*(?:\d|\.)/);
});

test("productive TSX does not reintroduce the replaced palette or named status utilities", () => {
  const source = ["src/App.tsx", "src/AppErrorBoundary.tsx", ...productionFiles("src/screens"), ...productionFiles("src/ui")]
    .filter((path) => !path.endsWith("colorPicker.tsx"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /#(?:17214f|66709a|4f5eb1|dfe4f5|4e5b8c|eef1fb|f8f9fe)/i);
  assert.doesNotMatch(source, /(?:bg|text|border|from|via|to|ring)-(?:red|green|amber|yellow|orange|teal|emerald|sky|blue|indigo|violet|purple|pink|rose)-\d+/);
  assert.doesNotMatch(styles, /--core-palette-|--core-status-(?:info|success|warning|error)-(?:border|bg|text)/);
});

test("pointer focus stays frameless while keyboard focus shows one outline", () => {
  const source = ["src/App.tsx", "src/AppErrorBoundary.tsx", ...productionFiles("src/screens"), ...productionFiles("src/ui")]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.match(styles, /:focus\s*\{[\s\S]*?outline:\s*none\s*!important;[\s\S]*?--tw-ring-shadow:\s*0 0 #0000\s*!important;/);
  assert.match(styles, /\[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible\s*\{\s*outline:\s*2px solid var\(--core-focus-ring\)\s*!important;/);
  assert.doesNotMatch(styles, /core-deck-summary-row:has\([^)]*:focus-visible/);
  assert.doesNotMatch(source, /focus-within:(?:border|outline|ring|shadow)/);
  assert.doesNotMatch(source, /focus(?:-visible)?:(?:border|shadow)/);
});

test("the UI catalog lists every canonical shared export", () => {
  const catalog = readFileSync("src/ui/README.md", "utf8");
  for (const name of ["SoftPanel", "PageHeader", "EmptyState", "ActionDialog", "OrbIcon", "StatTile", "SegmentedDonut", "DailyReviewProgress", "CoreModeControl", "ActionButton", "IconButton", "StatusMessage", "SuccessToast", "SuccessToastProvider", "useSuccessToast"]) {
    assert.match(catalog, new RegExp(`\\b${name}\\b`));
  }
});

test("alle zwanzig Prüfungsfarben sind eindeutig und tragen kontrastreiche Beschriftungen", () => {
  const colors = Array.from({ length: 20 }, (_, index) => tokenColor(`exam-color-${index + 1}`, lightTokens));
  assert.equal(new Set(colors).size, 20);
  for (const color of colors) assert.ok(contrastRatio(color, tokenColor("exam-on-color", lightTokens)) >= 4.5);
});

test("flags, danger text and the marked surface keep their contrast in both themes", () => {
  for (const tokens of [lightTokens, darkTokens]) {
    const flags = Array.from({ length: 7 }, (_, index) => tokenColor(`flag-${index + 1}`, tokens));
    assert.equal(new Set(flags).size, 7);
    for (const surface of ["surface", "marked-surface"]) {
      for (const flag of flags) assert.ok(contrastRatio(flag, tokenColor(surface, tokens)) >= 3, `flag on ${surface}`);
      assert.ok(contrastRatio(tokenColor("danger-text", tokens), tokenColor(surface, tokens)) >= 4.5, `danger text on ${surface}`);
    }
    for (const text of ["text", "text-secondary", "marked-text-muted"]) {
      assert.ok(contrastRatio(tokenColor(text, tokens), tokenColor("marked-surface", tokens)) >= 4.5, `${text} on marked surface`);
    }
  }
});
