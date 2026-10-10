import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { htmlPage, markdownAnchor, renderMarkdown } from "./docsSite.ts";
import { runInNewContext } from "node:vm";
import { codeFootprint, codeFootprintMarkup, createCatalogData, journeyProjection, specsCatalog } from "./generateDocs.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_GROUPS } from "./uiCatalogDemos.tsx";
import { CoreTooltipProvider } from "../src/ui/tooltipUi.tsx";
import { SuccessToastProvider } from "../src/ui/feedbackUi.tsx";
import postcss from "postcss";

test("Eingebettete Bibliothekszeichen bleiben gültiges HTML und behalten ihre JavaScript-Werte", () => {
  const html = htmlPage("ui-elements.html", "", "", 'globalThis.value = "\u000e\uffff</script>";');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert.doesNotMatch(script, /[\u000e\uffff]/);
  const scope: { value?: string } = {};
  runInNewContext(script, scope);
  assert.equal(scope.value, "\u000e\uffff</script>");
});

test("Markdown-Anker erhalten Unicode, doppelte Überschriften und direkte Abschnittslinks", () => {
  const html = renderMarkdown("# Übersicht\n## Größe & Maß\n[Abschnitt](#größe--maß)\n## Größe & Maß\n", "specs.md");
  assert.equal(markdownAnchor("Größe & Maß"), "größe--maß");
  assert.match(html, /id="specs--größe--maß"/);
  assert.match(html, /id="specs--größe--maß-1"/);
  assert.doesNotMatch(html, /specs--specs--/);
  assert.match(html, /href="#specs--größe--maß"/);
});

test("Dokumentverweise führen auf die HTML-Ansicht und behalten den kanonischen Anker", () => {
  const html = renderMarkdown("[Runbook](operations.md#visuelle-pflichtmatrix)\n[Quelle](../src/ui/README.md)\n[Docs](README.md)", "specs.md");
  assert.match(html, /href="operations.md#visuelle-pflichtmatrix"/);
  assert.match(html, /href="..\/src\/ui\/README.md"/);
  assert.match(html, /index.html#readme--document/);
});

test("Markdown rendert Tabellen, verschachtelte Listen, Code und Diagramme vollständig", () => {
  const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n\n- Eltern\n  - Kind\n\n```mermaid\nflowchart TD\nA --> B\n```\n\n```ts\nconst a = '<';\n```", "README.md");
  assert.match(html, /<table>/);
  assert.match(html, /<li>Kind/);
  assert.match(html, /class="mermaid"/);
  assert.match(html, /&lt;/);
});

test("Journey-Projektion erhält sämtliche Akzeptanzregeln der sieben Kernjourneys", () => {
  const specs = readFileSync("docs/specs.md", "utf8").replace(/\r\n/g, "\n");
  const html = journeyProjection(specs);
  assert.equal([...html.matchAll(/class="docs-document docs-journey"/g)].length, 7);
  const section = specs.split("## 5. Kernjourneys")[1].split("## 6.")[0];
  for (const rule of section.matchAll(/^- (.+)$/gm)) {
    const rendered = renderMarkdown(rule[0], "specs.md").match(/<li>([\s\S]*?)<\/li>/)?.[1];
    assert.ok(rendered && html.includes(rendered), `Akzeptanz fehlt: ${rule[1].slice(0, 80)}`);
  }
});

test("Specs-Leseansicht bildet Titel, Kapitel und Unterabschnitte auf Hero, Kapitel und Karten ab", () => {
  const html = specsCatalog([
    "# Vertrag", "", "**Status:** Entwurf", "**Stand:** 2026-01-01", "", "Einleitung mit [Docs](README.md).", "", "---", "",
    "## 1. Begriffe", "", "| A | B |", "| --- | --- |", "| 1 | 2 |", "",
    "## 2. Abläufe", "", "Einführung.", "", "- Vorab", "",
    "### 2.1 Kurz", "", "Text.", "", "Akzeptanz:", "", "- Punkt", "", "#### Detail", "", "Mehr.", "",
    "### 2.2 Lang", "", ...Array.from({ length: 7 }, (_, index) => `- Regel ${index}`), "",
  ].join("\n"));
  assert.match(html, /<header class="catalog-hero">[\s\S]*<h1 id="specs--vertrag">Vertrag<\/h1><p class="catalog-lede">Einleitung mit <a href="index.html#readme--document">/);
  assert.match(html, /<ul class="specs-meta"><li class="core-status-label"><span>Status<\/span> Entwurf<\/li><li class="core-status-label"><span>Stand<\/span> 2026-01-01<\/li><\/ul>/);
  assert.deepEqual([...html.matchAll(/<nav class="catalog-nav"[\s\S]*?<\/nav>/g)][0][0].match(/href="#[^"]+"/g), ['href="#specs--1-begriffe"', 'href="#specs--2-abläufe"']);
  assert.match(html, /<section id="specs--1-begriffe" class="catalog-section"><div class="catalog-section-heading"><h2>1\. Begriffe<\/h2><\/div><div class="catalog-grid"><article id="specs--1-begriffe--inhalt" class="catalog-card catalog-card-wide"><div class="catalog-preview specs-prose"><div class="docs-table-scroll"/);
  assert.match(html, /<h2>2\. Abläufe<\/h2><p>Einführung\.<\/p>\n*<\/div>/);
  assert.match(html, /id="specs--2-abläufe--überblick" class="catalog-card"><div class="catalog-card-header"><h3>Überblick<\/h3>/);
  assert.match(html, /id="specs--21-kurz" class="catalog-card"><div class="catalog-card-header"><h3>2\.1 Kurz<\/h3>[\s\S]*<p class="catalog-label">Akzeptanz<\/p>[\s\S]*<h4 id="specs--detail" class="catalog-label" tabindex="-1">Detail<\/h4>/);
  assert.match(html, /id="specs--22-lang" class="catalog-card catalog-card-wide"/);
  assert.match(html, /<div class="catalog-toolbar"[^>]*><label class="catalog-search"><span class="catalog-search-label">Specs durchsuchen<\/span><svg[\s\S]*?<input id="specs-search" type="search"/);
  assert.match(html, /<p id="specs-empty" class="catalog-empty" role="status" hidden>Keine Abschnitte passen zur Suche\.<\/p>/);
});

test("Specs-Leseansicht enthält je Kapitel einen Navigationseintrag, je Unterabschnitt eine Karte und gültige Anker", () => {
  const specs = readFileSync("docs/specs.md", "utf8").replace(/\r\n/g, "\n");
  const html = specsCatalog(specs);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
  const outline = specs.replace(/^```[\s\S]*?^```/gm, "");
  const chapters = [...outline.matchAll(/^## (.+)$/gm)].map((match) => `specs--${markdownAnchor(match[1])}`);
  const nav = html.match(/<nav class="catalog-nav"[\s\S]*?<\/nav>/)![0];
  assert.deepEqual([...nav.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]), chapters);
  for (const id of chapters) assert.match(html, new RegExp(`<section id="${id}" class="catalog-section">`));
  for (const [, title] of outline.matchAll(/^### (.+)$/gm)) assert.match(html, new RegExp(`<article id="specs--${markdownAnchor(title)}" class="catalog-card`), title);
  for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(decodeURIComponent(anchor)), `Anker #${anchor} fehlt`);
  for (const [, anchor] of journeyProjection(specs).matchAll(/href="specs\.html#([^"]+)"/g)) assert.ok(ids.has(anchor), `Journey-Anker ${anchor} fehlt`);
  assert.ok(ids.has("specs--document") && ids.has("specs--5-kernjourneys"));
});

test("Codeumfang ordnet Bildschirmdateien einmal zu und überträgt die Werte ins Ringdiagramm", () => {
  const footprint = codeFootprint();
  const files = footprint.areas.flatMap((area) => area.files);
  assert.equal(new Set(files).size, files.length);
  assert.ok(footprint.shared > 0 && footprint.areas.every((area) => area.lines > 0));
  for (const area of footprint.areas) {
    assert.ok(area.files.every((file) => file.startsWith("src/screens/") && !file.includes(".test.")));
  }
  for (const [label, file] of [["Heute", "DashboardScreen"], ["Lernen & Karten", "StudyMode"], ["Erstellen & Import", "ApkgImportPanel"]]) {
    assert.ok(footprint.areas.find((area) => area.label === label)?.files.includes(`src/screens/${file}.tsx`));
  }
  const html = codeFootprintMarkup();
  assert.equal([...html.matchAll(/data-donut-segment=/g)].length, footprint.areas.length);
  const values = [...html.matchAll(/data-donut-value="(\d+)"/g)].map((match) => Number(match[1]));
  assert.deepEqual(values, footprint.areas.map((area) => area.lines));
});

test("Jede exportierte gemeinsame UI-Komponente hat Gruppe und Demo; Inventar enthält reale Tokens und Icons", () => {
  const data = createCatalogData();
  assert.ok(data.components.length >= 45);
  for (const name of ["DailyReviewProgress", "LearningSettingsPanel", "CardPresentationSurface", "DeckTree", "StudyHeatmap", "CoreDatePicker", "LearningAreaHeader"]) assert.ok(data.components.some((component) => component.name === name));
  assert.ok(data.tokens.every((token) => token.light && token.dark));
  assert.ok(data.icons.some((icon) => icon.name === "BookOpen" && icon.svg.includes("<svg")));
});

test("Katalogbeispiele und Dokumentationsrahmen verwenden nur definierte Design-Tokens", () => {
  const tokens = new Set(createCatalogData().tokens.map((token) => token.name));
  for (const file of ["scripts/uiCatalogDemos.tsx", "scripts/uiCatalog.css", "docs/tooling/site.css"]) {
    for (const [, token] of readFileSync(file, "utf8").matchAll(/var\((--core-[a-z0-9-]+)/g)) assert.ok(tokens.has(token), `${file}: ${token} fehlt`);
  }
});

test("Der Dokumentationsrahmen verwendet CoRe-Typografie und die gemeinsame Radiusskala", () => {
  postcss.parse(readFileSync("docs/tooling/site.css", "utf8")).walkDecls((declaration) => {
    if (["font-size", "line-height"].includes(declaration.prop)) assert.match(declaration.value, /^var\(--core-(type|leading)-/);
    if (declaration.prop === "font") assert.match(declaration.value, /var\(--core-type-/);
    if (declaration.prop === "border-radius") assert.match(declaration.value, /^(?:0\s+)?var\(--core-radius-/);
  });
  const html = renderMarkdown("# Titel\n## Abschnitt\n### Detail", "specs.md");
  for (const depth of [1, 2, 3]) assert.match(html, new RegExp(`class="core-heading-${depth}" tabindex="-1"`));
});

test("Alle Kataloggruppen rendern ihre echten Komponenten mit gültigen Demodaten", () => {
  for (const group of DEMO_GROUPS) {
    const rendered = renderToStaticMarkup(React.createElement(CoreTooltipProvider, null, React.createElement(SuccessToastProvider, null, React.createElement(group.render))));
    assert.match(rendered, /class="catalog-demo/);
    assert.match(rendered, /<h4>/);
  }
});
