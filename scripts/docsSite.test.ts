import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { htmlPage, inlineScript, markdownAnchor, renderMarkdown } from "./docsSite.ts";
import { runInNewContext } from "node:vm";
import { cardHistoryCards, codeFootprint, codeFootprintMarkup, createCatalogData, journeyProjection, journeySpecsLinks, specsDocument } from "./generateDocs.ts";
import { EXAMPLE_CHAINS, EXAMPLE_RETENTIONS } from "../src/schedulerExampleChains.ts";
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
  assert.equal(inlineScript(script), script, "die wiederverwendete Katalog-Runtime darf beim erneuten Einbetten nicht doppelt maskiert werden");
});

test("Jede Leseseite führt Seitenwechsel, Suche und Inhalt untereinander in der Seitenleiste statt einer Kopfleiste", () => {
  const html = htmlPage("specs.html", "<p>Inhalt</p>", "", "");
  assert.doesNotMatch(html, /<header/);
  const sidebar = html.match(/<body><div class="docs-frame"><aside class="docs-sidebar">([\s\S]*?)<\/aside><main class="docs-main"><p>Inhalt<\/p><\/main>/)![1];
  const panels = [...sidebar.matchAll(/<(?:nav|div) class="docs-panel ([a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panels, ["docs-pages", "docs-search-panel", "docs-toc"]);
  assert.match(sidebar, /<a href="specs.html" aria-current="page">Specs<\/a>/);
  assert.match(sidebar, /id="docs-theme" aria-label="Dark Mode einschalten"/);
  assert.match(sidebar, /<span class="catalog-search-label">Specs durchsuchen<\/span><svg[\s\S]*?<input id="docs-search" type="search"/);
  assert.match(sidebar, /<div id="docs-toc" class="docs-panel-links"><\/div>/);
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

test("Markdown rendert Tabellen, verschachtelte Listen und Code vollständig", () => {
  const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n\n- Eltern\n  - Kind\n\n```ts\nconst a = '<';\n```", "README.md");
  assert.match(html, /<table>/);
  assert.match(html, /<li>Kind/);
  assert.match(html, /&lt;/);
});

test("Journey-Projektion zeigt je Kernjourney ihren Ablauf und verlinkt die Akzeptanz in die Specs", () => {
  const specs = readFileSync("docs/specs.md", "utf8").replace(/\r\n/g, "\n");
  const html = journeyProjection(specs);
  const section = specs.match(/^## \d+\. Kernjourneys\n([\s\S]*?)(?=^## )/m)![1];
  const titles = [...section.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
  const journeys = html.split(/(?=<article id="journey-\d+")/);
  assert.equal(journeys.length, titles.length);
  journeys.forEach((journey, index) => {
    const steps = section.split(`### ${titles[index]}\n`)[1].split(/\nAkzeptanz:\n/)[0].match(/^\d+\. /gm)?.length ?? 0;
    assert.ok(steps > 0, `Ablauf fehlt: ${titles[index]}`);
    assert.equal([...journey.matchAll(/class="docs-flow-step"/g)].length, steps, titles[index]);
    const acceptance = journey.split(/id="journey-\d+-rules--akzeptanz"/)[1].split('<p class="docs-source">')[0];
    assert.match(acceptance, /href="specs\.html#specs--[^"]+"/, `Akzeptanz ohne Specs-Verweis: ${titles[index]}`);
  });
  for (const rule of section.matchAll(/^- (.+)$/gm)) {
    const rendered = renderMarkdown(journeySpecsLinks(rule[0]), "specs.md").match(/<li>([\s\S]*?)<\/li>/)?.[1];
    assert.ok(rendered && html.includes(rendered), `Akzeptanz fehlt: ${rule[1].slice(0, 80)}`);
  }
});

test("Specs-Leseansicht zeigt Kapitel und Abschnitte als Überschriften und Rasterzeilen als Labels", () => {
  const html = specsDocument([
    "# Vertrag", "", "**Stand:** 2026-01-01", "", "---", "",
    "## 1. Begriffe", "", "| A | B |", "| --- | --- |", "| 1 | 2 |", "",
    "### Kurz", "", "Zweck:", "", "Text.", "", "Zustände und Meldungen:", "", "- Punkt", "",
  ].join("\n"), { title: "Anhang", html: "<p>Zahlen</p>" });
  assert.match(html, /^<article id="specs--document" class="docs-document"><h1 id="specs--vertrag"/);
  assert.doesNotMatch(html, /<hr>|catalog-card/);
  assert.match(html, /<h2 id="specs--1-begriffe"[\s\S]*<h3 id="specs--kurz"[\s\S]*<p class="docs-label">Zweck<\/p>[\s\S]*<p class="docs-label">Zustände und Meldungen<\/p>/);
  assert.match(html, /<h2 id="specs--anhang"[^>]*>Anhang[\s\S]*<p>Zahlen<\/p><\/article>$/);
});

test("Specs-Leseansicht enthält jede Überschrift und nur gültige Anker", () => {
  const specs = readFileSync("docs/specs.md", "utf8").replace(/\r\n/g, "\n");
  const html = specsDocument(specs);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
  const outline = specs.replace(/^```[\s\S]*?^```/gm, "");
  for (const [, title] of outline.matchAll(/^#{2,3} (.+)$/gm)) assert.ok(ids.has(`specs--${markdownAnchor(title)}`), title);
  for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(decodeURIComponent(anchor)), `Anker #${anchor} fehlt`);
  for (const [, anchor] of journeyProjection(specs).matchAll(/href="specs\.html#([^"]+)"/g)) assert.ok(ids.has(decodeURIComponent(anchor)), `Journey-Anker ${anchor} fehlt`);
});

test("Lernverlauf: erzeugte Blöcke folgen dem Abschnitt „Lernverlauf einer Karte“ und zeigen jede Beispielkette als Zeitleiste und Tabelle", () => {
  const specs = readFileSync("docs/specs.md", "utf8").replace(/\r\n/g, "\n");
  const html = specsDocument(specs, undefined, { "specs--lernverlauf-einer-karte": cardHistoryCards() });
  const order = [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]);
  const at = order.indexOf("specs--lernverlauf-einer-karte");
  assert.deepEqual(order.slice(at, at + 5), ["specs--lernverlauf-einer-karte", "specs--lernverlauf-bewertungen", "specs--lernverlauf-zeitleisten", "specs--lernverlauf-tabellen", "specs--lernverlauf-varianten"]);
  const contacts = EXAMPLE_CHAINS.reduce((sum, chain) => sum + chain.ratings.length, 0);
  assert.equal([...html.matchAll(/class="docs-chain-step"/g)].length, contacts);
  assert.equal([...html.matchAll(/<tr><th scope="rowgroup"/g)].length, EXAMPLE_CHAINS.length * EXAMPLE_RETENTIONS.length);
  assert.equal([...html.matchAll(/data-mark="mature"/g)].length, EXAMPLE_CHAINS.length);
});

test("Codeumfang ordnet Bildschirmdateien einmal zu und überträgt die Werte in die Tabelle", () => {
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
  const values = [...html.matchAll(/<\/th><td>([\d.]+)<\/td>/g)].map((match) => Number(match[1].replaceAll(".", "")));
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
  for (const file of ["scripts/uiCatalogDemos.tsx", "scripts/uiCatalog.css", "scripts/docsSite.css"]) {
    for (const [, token] of readFileSync(file, "utf8").matchAll(/var\((--core-[a-z0-9-]+)/g)) assert.ok(tokens.has(token), `${file}: ${token} fehlt`);
  }
});

test("Der Dokumentationsrahmen verwendet CoRe-Typografie und die gemeinsame Radiusskala", () => {
  postcss.parse(readFileSync("scripts/docsSite.css", "utf8")).walkDecls((declaration) => {
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
