import { DesignReview, designReviewCss } from "./designReview.tsx";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ts from "typescript";
import { build, transformWithEsbuild, type Rollup } from "vite";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import tailwindConfig from "../tailwind.config.ts";
import { DEMO_GROUPS } from "./uiCatalogDemos.tsx";
import type { CatalogData } from "./uiCatalog.tsx";
import { SegmentedDonut, SoftPanel, StatTile } from "../src/ui/coreUi.tsx";
import { DOCUMENT_PAGES, DOC_PAGES, documentId, escapeHtml, htmlPage, markdownAnchor, renderMarkdown } from "./docsSite.ts";

const root = process.cwd();
const docs = path.join(root, "docs");
const text = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) && !/\.test\./.test(file) ? [file] : [];
  }).sort();
}

export function codeFootprint() {
  const groups = [
    { label: "Heute", files: ["DashboardScreen"], color: "var(--core-learning-status-learned)" },
    { label: "Lernen & Karten", files: ["LearnScreen", "LearningAreaHeader", "DecksScreen", "StudyMode", "DeckSettingsScreen", "GlobalCardSettingsScreen", "SimulatorScreen"], color: "var(--core-learning-status-new)" },
    { label: "Erstellen & Import", files: ["CreationScreen", "CreationHome", "ManualCreationPanel", "ApkgImportPanel"], color: "var(--core-learning-status-in-progress)" },
    { label: "Statistik", files: ["StatisticsScreen"], color: "var(--core-learning-status-due)" },
    { label: "Konto & Sync", files: ["AuthGateScreen", "SettingsScreen", "SyncConflictPanel"], color: "var(--core-learning-progress-completed)" },
    { label: "Hilfe", files: ["HelpScreen"], color: "var(--core-text-secondary)" },
  ];
  const files = [...sourceFiles("src"), ...sourceFiles("api"), "src/styles.css"].filter((file) => !file.endsWith(".d.ts") && file !== "src/database.types.ts");
  const counts = files.map((file) => ({ file, lines: text(file).split("\n").filter((line) => line.trim()).length }));
  const areas = groups.map((group) => {
    const owned = counts.filter(({ file }) => group.files.some((name) => file === `src/screens/${name}.tsx`));
    return { label: group.label, color: group.color, lines: owned.reduce((sum, entry) => sum + entry.lines, 0), files: owned.map(({ file }) => file) };
  });
  const screens = areas.reduce((sum, area) => sum + area.lines, 0);
  const total = counts.reduce((sum, entry) => sum + entry.lines, 0);
  return { areas, screens, shared: total - screens, files: counts.length };
}

export function codeFootprintMarkup() {
  const footprint = codeFootprint();
  const number = (value: number) => value.toLocaleString("de-DE");
  const segments = footprint.areas.map((area) => ({ key: area.label, value: area.lines, color: area.color }));
  const chart = renderToStaticMarkup(React.createElement(SegmentedDonut, {
    segments, ariaLabel: `Bildschirmcode: ${footprint.areas.map((area) => `${area.label}: ${number(area.lines)} Zeilen`).join(", ")}`,
  }));
  const tiles = renderToStaticMarkup(React.createElement("div", { className: "docs-code-stats" },
    React.createElement(StatTile, { size: "compact", label: "Bildschirmcode", value: number(footprint.screens) }),
    React.createElement(StatTile, { size: "compact", label: "Gemeinsamer Code & API", value: number(footprint.shared) }),
    React.createElement(StatTile, { size: "compact", label: "Quelldateien", value: number(footprint.files) }),
  ));
  const rows = footprint.areas.map((area) => `<tr><th scope="row"><span class="docs-code-dot" style="background:${area.color}" aria-hidden="true"></span>${area.label}</th><td>${number(area.lines)}</td><td>${(area.lines / footprint.screens * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</td></tr>`).join("");
  const contents = `<h2 id="specs--codeumfang" class="core-heading-2" tabindex="-1">Codeumfang der Produktbereiche</h2><p>CoRe ist eine App mit mehreren Bereichen. Der Ring zeigt deren Anteil am Bildschirmcode; gemeinsam genutzte Logik, UI und API stehen separat.</p>${tiles}<div class="docs-code-chart"><div class="docs-code-donut">${chart}<span class="core-caption">${number(footprint.screens)} Zeilen</span></div><div class="docs-table-scroll" tabindex="0" role="region" aria-label="Codeumfang je Produktbereich"><table><thead><tr><th>Bereich</th><th>Zeilen</th><th>Anteil</th></tr></thead><tbody>${rows}</tbody></table></div></div><p class="docs-source">Beim Erzeugen gemessen: nichtleere Zeilen in <code>src/</code> und <code>api/</code> (TS/TSX) sowie <code>src/styles.css</code>. Ohne Tests, Typdeklarationen, generierte Datenbanktypen, Dokumentation und Fremdcode. Bereichszuordnung nach Bildschirmdateien in <a href="../src/screens/README.md">der Screen-Landkarte</a>; übriger Code zählt gemeinsam. Enthält Kommentare und misst weder Laufzeit noch Komplexität.</p>`;
  return renderToStaticMarkup(React.createElement(SoftPanel, { className: "docs-code-footprint", dangerouslySetInnerHTML: { __html: contents } }));
}

export function createCatalogData(): CatalogData {
  const sources = sourceFiles("src").map((file) => ({ file, source: text(file) }));
  const assignments = DEMO_GROUPS.flatMap((group) => group.components.map((name) => [name, group.id] as const));
  const groups = new Map<string, string>(assignments);
  if (groups.size !== assignments.length) throw new Error("Eine UI-Komponente ist mehreren Elementfamilien zugeordnet.");
  const components: CatalogData["components"] = [];
  const iconFiles = new Map<string, Set<string>>();
  for (const { file, source } of sources.filter(({ file }) => file.endsWith(".tsx"))) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of ast.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "lucide-react") {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text;
          if (element.isTypeOnly || name === "LucideIcon" || !Reflect.get(lucide, name)) continue;
          const used = iconFiles.get(name) ?? new Set<string>(); used.add(file); iconFiles.set(name, used);
        }
      }
      if (!(file.startsWith("src/ui/") || file.startsWith("src/screens/"))) continue;
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const names = ts.isFunctionDeclaration(statement) && statement.name ? [statement.name.text]
        : ts.isVariableStatement(statement) ? statement.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name)).map((declaration) => declaration.name.getText(ast)) : [];
      for (const name of names.filter((name) => /^[A-Z][A-Za-z]+$/.test(name) && /[a-z]/.test(name))) {
        const group = groups.get(name);
        if (!group && file.startsWith("src/screens/")) continue;
        if (!group) throw new Error(`UI-Komponente ${file}#${name} fehlt. Gruppe und sichtbare Demo in scripts/uiCatalogDemos.tsx ergänzen.`);
        const occurrences = sources.map((entry) => ({ file: entry.file, count: [...entry.source.matchAll(new RegExp(`<${name}(?:[\\s/>]|\\b)`, "g"))].length })).filter((entry) => entry.count > 0);
        components.push({ name, file, group, usage: occurrences.reduce((sum, entry) => sum + entry.count, 0), usedIn: occurrences.map((entry) => entry.file) });
      }
    }
  }
  const demoSource = text("scripts/uiCatalogDemos.tsx") + text("scripts/uiCatalog.tsx");
  for (const name of groups.keys()) {
    if (!components.some((component) => component.name === name)) throw new Error(`Katalogeintrag ${name} besitzt keine exportierte UI-Komponente.`);
    // Toast und Kontextprovider erscheinen über ihre tatsächlichen Verbraucher.
    if (name !== "SuccessToast" && !new RegExp(`<${name}(?:[\\s/>]|\\b)`).test(demoSource)) throw new Error(`Sichtbare Demo für ${name} fehlt.`);
  }
  const tokens = new Map<string, CatalogData["tokens"][number]>();
  const classes = new Set<string>();
  const typography = new Map<string, string>();
  postcss.parse(text("src/styles.css")).walkRules((rule) => {
    const declarations = rule.nodes.filter((node) => node.type === "decl").map((node) => node.toString()).join("; ");
    if (rule.selector.includes(":root") || rule.selector.includes('[data-core-theme="dark"]')) rule.walkDecls(/^--core-/, (declaration) => {
      const name = declaration.prop;
      const category = /shadow/.test(name) ? "Schatten" : /radius/.test(name) ? "Radius" : /type-|leading-|weight-/.test(name) ? "Typografie" : /height|size|space|width/.test(name) ? "Maße" : "Farbe";
      const token = tokens.get(name) ?? { name, light: "", dark: "", category };
      token[rule.selector.includes('data-core-theme="dark"') ? "dark" : "light"] = declaration.value;
      tokens.set(name, token);
    });
    for (const [, name] of rule.selector.matchAll(/\.(core-[a-z0-9-]+)/g)) {
      classes.add(name);
      if (/^core-(heading-\d|body(?:-large)?|caption|control-label|status-label|emphasis)$/.test(name)) typography.set(name, declarations);
    }
  });
  return {
    components: components.sort((a, b) => a.name.localeCompare(b.name)),
    tokens: [...tokens.values()].map((token) => ({ ...token, dark: token.dark || token.light })).sort((a, b) => a.name.localeCompare(b.name)),
    typography: [...typography].map(([name, declarations]) => ({ name, declarations })),
    cssClasses: [...classes].map((name) => ({ name, files: sources.filter(({ source }) => new RegExp(`\\b${name}\\b`).test(source)).map(({ file }) => file) })).sort((a, b) => a.name.localeCompare(b.name)),
    icons: [...iconFiles].sort(([a], [b]) => a.localeCompare(b)).map(([name, used]) => ({ name, files: [...used], svg: renderToStaticMarkup(React.createElement(Reflect.get(lucide, name) as LucideIcon, { size: 24, "aria-hidden": true })) })),
    patterns: Object.fromEntries([...text("scripts/uiCatalogPatterns.html").matchAll(/<template data-family="([a-z]+)">([\s\S]*?)<\/template>/g)].map(([, family, html]) => [family, html])),
    sourceHash: createHash("sha256").update(sources.map(({ file, source }) => `${file}\n${source}`).join("\n") + text("src/styles.css") + text("tailwind.config.ts")).digest("hex").slice(0, 16),
  };
}

const JOURNEY_FLOWS = [
  ["Account öffnen", "Anmelden oder registrieren", "Leeren oder bestehenden Account sehen", "Import, manuelle Karte oder Lernen wählen"],
  ["Erstellen öffnen", "APKG analysieren oder Karte eingeben", "Vorschau und Inhalt prüfen", "Lokal speichern", "Synchronisierung oder Teilabschluss sehen"],
  ["Lernen öffnen", "Stapel und Karten verwalten", "Inhalt und Lernwerte prüfen", "Sitzung vorbereiten", "Erste verfügbare Karte lernen"],
  ["Frage sehen", "Antwort aufdecken", "Nochmal, Schwer, Gut oder Leicht", "Bewertung lokal sichern", "Nächste Karte, Lernschritt oder Abschluss"],
  ["Geeignete Karte lernen", "Original oder KI-Umformulierung sehen", "Antwort aufdecken", "Ursprung prüfen und Feedback geben"],
  ["Hilfe öffnen", "Active Recall und Spaced Repetition", "Smarter Recall und Content Repetition", "FSRS und Varianten nachvollziehen"],
  ["Simulator öffnen", "Lernzeit verschieben", "Verfügbare Karten und Planung prüfen", "Bei Bedarf bewerten oder Zeit zurücksetzen"],
];

export function journeyProjection(specs: string) {
  const section = specs.match(/^## 5\. Kernjourneys\n([\s\S]*?)(?=^## 6\.)/m)?.[1];
  if (!section) throw new Error("Kernjourneys fehlen in docs/specs.md.");
  const journeys = [...section.matchAll(/^### (5\.\d+ .+)\n([\s\S]*?)(?=^### 5\.|$(?![\s\S]))/gm)];
  if (journeys.length !== JOURNEY_FLOWS.length) throw new Error("Journey-Projektion und Produktvertrag haben unterschiedliche Journey-Anzahlen.");
  return journeys.map(([, title, body], index) => {
    const [intro, acceptance] = body.split(/\nAkzeptanz:\n/);
    if (!acceptance) throw new Error(`Akzeptanz fehlt in Journey ${title}.`);
    const steps = JOURNEY_FLOWS[index];
    const diagram = `flowchart TD\n${steps.map((label, node) => `N${node}["${label}"]${node < steps.length - 1 ? ` --> N${node + 1}` : ""}`).join("\n")}`;
    const prefix = `journey-${index + 1}`;
    const uiGroup = ["navigation", "inhalt", "stapel", "feedback", "inhalt", "symbols", "formulare"][index];
    return `<article id="${prefix}" class="docs-document docs-journey">${renderMarkdown(`## ${title}\n${intro}`, "specs.md", prefix)}<h3 id="${prefix}--ablauf" class="core-heading-3" tabindex="-1">Ablauf</h3><div class="docs-journey-flow"><pre class="mermaid">${escapeHtml(diagram)}</pre><ol>${steps.map((label) => `<li>${label}</li>`).join("")}</ol></div>${renderMarkdown(`### Regeln, Zustände und Akzeptanz\n${acceptance}`, "specs.md", `${prefix}-rules`)}<p class="docs-source">Quelle: <a href="specs.html#specs--${markdownAnchor(title)}">Produktvertrag ${title.split(" ")[0]}</a> · <a href="ui-elements.html#${uiGroup}">UI-Beispiele</a> · <a href="card-types.html">Kartentypen</a></p></article>`;
  }).join("\n");
}

export async function synchronizeDocs(mode: "write" | "check") {
  const data = createCatalogData();
  const raw = sourceFiles("src").map(text).join("\n") + text("scripts/uiCatalog.tsx") + text("scripts/uiCatalogDemos.tsx") + text("scripts/designReview.tsx") + text("scripts/generateDocs.ts") + text("scripts/docsSite.ts") + Object.values(data.patterns).join("\n");
  let styles = (await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw, extension: "tsx" }] }), autoprefixer]).process(text("src/styles.css"), { from: path.join(root, "src/styles.css") })).css;
  const fonts = new Map(readdirSync(path.join(root, "public/fonts")).map((file) => [`/fonts/${file}`, `data:font/woff2;base64,${readFileSync(path.join(root, "public/fonts", file)).toString("base64")}`]));
  for (const [file, url] of fonts) styles = styles.replaceAll(file, url);
  const css = `${styles}\n${text("docs/tooling/site.css")}\n${text("scripts/uiCatalog.css")}`;
  const viewer = ts.transpileModule(text("docs/tooling/viewer.ts"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const pdfWorker = (await transformWithEsbuild(readFileSync(path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.mjs"), "utf8"), "pdf.worker.js", { minify: true, target: "es2022" })).code;
  const bundle = await build({ configFile: false, logLevel: "error", publicDir: false, define: { "process.env.NODE_ENV": '"production"' }, esbuild: { supported: { "template-literal": false } },
    worker: { format: "es", rollupOptions: { output: { inlineDynamicImports: true } } },
    plugins: [{ name: "docs-inline-runtime-assets", transform(code, id) {
      const normalized = id.replaceAll("\\", "/");
      if (!normalized.includes("/src/")) return;
      let result = code;
      for (const [file, url] of fonts) result = result.replaceAll(file, url);
      if (normalized.endsWith("/src/pdfRuntime.ts")) result = result.replace('new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString()', () => `URL.createObjectURL(new Blob([${JSON.stringify(pdfWorker)}], { type: "application/javascript" }))`);
      if (normalized.endsWith("/src/apkgImportInternal.ts")) result = 'import CatalogApkgWorker from "./apkgImportWorker.ts?worker&inline";\n' + result.replace('new Worker(new URL("./apkgImportWorker.ts", import.meta.url), { type: "module" })', 'new CatalogApkgWorker()');
      return result === code ? undefined : { code: result, map: null };
    } }],
    build: { write: false, emptyOutDir: false, target: "es2022", minify: "esbuild", lib: { entry: path.join(root, "scripts/uiCatalog.tsx"), formats: ["iife"], name: "CoReCatalog" }, rollupOptions: { output: { inlineDynamicImports: true } } },
  }) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const runtime = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((output) => output.output).filter((entry): entry is Rollup.OutputChunk => entry.type === "chunk").map((entry) => entry.code).join("\n").replace(/^[ \t]+$/gm, "");
  const results = new Map<string, string>();
  function reader(file: string, title: string, contents: string) {
    const content = `<button id="docs-nav-toggle" class="docs-mobile-nav core-action-secondary" type="button" aria-expanded="false" aria-controls="docs-rail"><span id="docs-current-section">Inhaltsverzeichnis</span>${renderToStaticMarkup(React.createElement(lucide.ChevronDown, { size: 18, "aria-hidden": true }))}</button><div class="docs-layout"><aside id="docs-rail" class="docs-rail"><h1 class="core-heading-3">${title}</h1><label><span class="sr-only">Abschnitte durchsuchen</span><input id="docs-search" class="docs-search core-field" type="search" placeholder="Abschnitte durchsuchen"></label><p id="docs-search-count" class="docs-count core-caption" role="status"></p><nav id="docs-toc" class="docs-toc" aria-label="Abschnitte"></nav></aside><main class="docs-content">${contents}</main></div>`;
    results.set(file, htmlPage(file, content, css, viewer, file === "journeys.html" ? '<script src="vendor/mermaid.min.js"></script>' : ""));
  }
  function document(file: string) { return `<article id="${documentId(file)}--document" class="docs-document"><p class="docs-source">Verbindliche Quelle: <a href="${file}">${file}</a></p>${renderMarkdown(text(`docs/${file}`), file)}</article>`; }
  reader("index.html", "Docs", document("README.md"));
  const specs = document("specs.md");
  reader("specs.html", "Specs", specs.replace(/(<h2 id="specs--1-produktvision"[^>]*>)/, `${codeFootprintMarkup()}$1`));
  reader("journeys.html", "Journeys", `<article class="docs-document"><h1 id="journeys--document" class="core-heading-1" tabindex="-1">Kernjourneys</h1><p>Alle sieben Abläufe aus dem Produktvertrag. Die Schritte orientieren; sämtliche verbindlichen Regeln und Sonderfälle stehen darunter unverändert.</p></article>${journeyProjection(text("docs/specs.md"))}`);
  results.set("journeys.html", results.get("journeys.html")!.replace("</body>", '<script>mermaid.initialize({startOnLoad:true,securityLevel:"strict",theme:"neutral"});</script></body>'));
  for (const [file, catalog] of [["ui-elements.html", "ui"], ["card-types.html", "cards"]]) {
    const content = `<div id="catalog-root"></div><script id="catalog-data" type="application/json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;
    results.set(file, htmlPage(file, content, css, `${viewer}\n${runtime}`).replace("<body>", `<body data-catalog="${catalog}">`));
  }
  results.set("design-review.html", htmlPage("design-review.html", renderToStaticMarkup(React.createElement(DesignReview)), `${css}\n${designReviewCss}`, viewer, "", "Design-Freigabe"));
  const failures: string[] = [];
  for (const [file, generated] of results) {
    const current = await readFile(path.join(docs, file), "utf8").catch(() => "");
    if (current.replace(/\r\n?/g, "\n") !== generated) {
      if (mode === "write") await writeFile(path.join(docs, file), generated, "utf8");
      else failures.push(`${file} ist veraltet`);
    }
  }
  const uiAnchors = new Set(["tokens", "typografie", ...DEMO_GROUPS.map((group) => group.id), "klassen", "icons"]);
  const cardAnchors = new Set([...text("scripts/uiCatalog.tsx").matchAll(/\{ kind: "([a-z-]+)"/g)].map((match) => match[1]));
  const linkSources = new Map([...results].filter(([file]) => file !== "ui-elements.html" && file !== "card-types.html"));
  for (const file of readdirSync(docs).filter((file) => file.endsWith(".md"))) {
    linkSources.set(file, renderMarkdown(text(`docs/${file}`), file));
  }
  for (const [file, content] of linkSources) for (const [, href] of content.matchAll(/href="([^\"]+)"/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) continue;
    const [linkedTarget, fragment] = href.split("#");
    const target = linkedTarget || DOCUMENT_PAGES[file] || file;
    if (target.endsWith(".html") && results.has(target)) {
      const anchor = fragment && decodeURIComponent(fragment);
      const exists = !anchor || (target === "ui-elements.html" ? uiAnchors.has(anchor) : target === "card-types.html" ? cardAnchors.has(anchor) : results.get(target)!.includes(`id="${anchor}"`));
      if (!exists) failures.push(`${file}: Anker ${href} fehlt`);
    } else if (!existsSync(path.resolve(docs, target || file))) failures.push(`${file}: Ziel ${href} fehlt`);
  }
  if (failures.length) throw new Error(`${failures.join("\n")}\nQuellen korrigieren und npm run docs:build ausführen.`);
  console.log(`Dokumentation ${mode === "write" ? "erzeugt" : "geprüft"}: ${DOC_PAGES.length} Leseseiten + Design-Freigabe, ${data.components.length} Komponenten, ${data.tokens.length} Tokens, ${data.icons.length} Icons.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) synchronizeDocs(process.argv.includes("--write") ? "write" : "check").catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
