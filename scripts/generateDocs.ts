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
import { synchronizeBrainLogo } from "./generateMascots.tsx";
import type { CatalogData } from "./uiCatalog.tsx";
import { StatTile } from "../src/ui/coreUi.tsx";
import { EXAMPLE_CHAINS, EXAMPLE_RETENTIONS, EXAMPLE_SITUATIONS, EXAMPLE_VARIANT_THRESHOLDS, exampleRatingEffects, runExampleChain, type ExampleContact, type ExampleOutcome } from "../src/schedulerExampleChains.ts";
import { DOCUMENT_PAGES, DOC_PAGES, appendToSection, documentId, htmlPage, inlineScript, markdownAnchor, renderMarkdown } from "./docsSite.ts";
import { readLedger } from "./aiEval/ledger.ts";
import { aiEvalDocument } from "./aiEval/page.ts";

const root = process.cwd();
const docs = path.join(root, "docs");
const text = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) && !/\.test\./.test(file) ? [file] : [];
  }).sort();
}

type DocLimit = { file: string; maxBytes: number; slackBytes: number };

/**
 * Wachstumsbremse je Datei: `maxBytes` darf nur sinken. Liegt eine Datei mehr als `slackBytes` darunter,
 * wird `maxBytes` auf die Istgröße gesenkt; der Spielraum gilt für die ganze Datei, nicht je Abschnitt.
 */
export const DOC_LIMITS: readonly DocLimit[] = [
  { file: "docs/architecture.md", maxBytes: 34_255, slackBytes: 1_024 },
  { file: "docs/specs.md", maxBytes: 79_400, slackBytes: 2_048 },
  { file: "README.md", maxBytes: 1_986, slackBytes: 512 },
];

export function docLimitFailures(read: (file: string) => string, limits: readonly DocLimit[] = DOC_LIMITS) {
  return limits.flatMap(({ file, maxBytes, slackBytes }) => {
    const bytes = Buffer.byteLength(read(file));
    if (bytes > maxBytes) return [`${file}: ${bytes} Bytes, Obergrenze ${maxBytes}; Text verdichten oder an seinen Eigentümer verlagern statt die Grenze anzuheben.`];
    if (bytes < maxBytes - slackBytes) return [`${file}: auf ${bytes} Bytes gesunken; maxBytes in DOC_LIMITS in scripts/generateDocs.ts von ${maxBytes} auf ${bytes} senken.`];
    return [];
  });
}

export function codeFootprint() {
  const groups = [
    { label: "Heute", files: ["DashboardScreen"], color: "var(--core-learning-status-learned)" },
    { label: "Lernen & Karten", files: ["LearnScreen", "LearningAreaHeader", "DecksScreen", "StudyMode", "DeckSettingsScreen", "GlobalCardSettingsScreen", "SimulatorScreen"], color: "var(--core-learning-status-new)" },
    { label: "Erstellen & Import", files: ["CreationScreen", "CreationHome", "ManualCreationPanel", "ApkgImportPanel", "AiSourceCreationPanel"], color: "var(--core-learning-status-in-progress)" },
    { label: "Prüfungen", files: ["ExamPlanningScreen", "ExamPlanEditor"], color: "var(--core-action-primary)" },
    { label: "Statistik", files: ["StatisticsScreen"], color: "var(--core-learning-status-due)" },
    { label: "Konto & Sync", files: ["AuthGateScreen", "SettingsDialog", "SettingsDialogFrame", "SettingsScreen", "SyncConflictPanel"], color: "var(--core-learning-progress-completed)" },
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
  const tiles = renderToStaticMarkup(React.createElement("div", { className: "docs-code-stats" },
    React.createElement(StatTile, { size: "compact", label: "Bildschirmcode", value: number(footprint.screens) }),
    React.createElement(StatTile, { size: "compact", label: "Gemeinsamer Code & API", value: number(footprint.shared) }),
    React.createElement(StatTile, { size: "compact", label: "Quelldateien", value: number(footprint.files) }),
  ));
  const rows = footprint.areas.map((area) => `<tr><th scope="row"><span class="docs-code-dot" style="background:${area.color}" aria-hidden="true"></span>${area.label}</th><td>${number(area.lines)}</td><td>${(area.lines / footprint.screens * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</td></tr>`).join("");
  return `${tiles}<div class="docs-code-chart"><div class="docs-table-scroll" tabindex="0" role="region" aria-label="Codeumfang je Produktbereich"><table><thead><tr><th>Bereich</th><th>Zeilen</th><th>Anteil</th></tr></thead><tbody>${rows}</tbody></table></div></div><p class="docs-source">Beim Erzeugen gemessen: nichtleere Zeilen in <code>src/</code> und <code>api/</code> (TS/TSX) sowie <code>src/styles.css</code>. Ohne Tests, Typdeklarationen, generierte Datenbanktypen, Dokumentation und Fremdcode. Bereichszuordnung nach Bildschirmdateien in <a href="../src/screens/README.md">der Screen-Landkarte</a>; übriger Code zählt gemeinsam. Enthält Kommentare und misst weder Laufzeit noch Komplexität.</p>`;
}

const DEFAULT_RETENTION = 0.92;
const DEFAULT_VARIANT_THRESHOLD = 21;
const RATING_LABELS = { again: "Nochmal", hard: "Schwer", good: "Gut", easy: "Leicht" } as const;
const PHASE_LABELS = { new: "Neu", learning: "Lernschritt", review: "Wiederholung", relearning: "Wiederlernen" } as const;
const BAND_LABELS = { new: "Neu", learning: "Lernen", young: "Jung", mature: "Reif" } as const;
const decimal = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const percent = (retention: number) => `${Math.round(retention * 100)} %`;
const days = (value: number) => `${decimal(value)} ${decimal(value) === "1" ? "Tag" : "Tage"}`;
const gap = (outcome: ExampleOutcome) => outcome.intervalMinutes != null ? `${outcome.intervalMinutes} Min.` : days(outcome.intervalDays);
const firstMature = (contacts: ExampleContact[]) => contacts.findIndex((contact) => contact.band === "mature");
const firstVariant = (contacts: ExampleContact[], threshold: number) => contacts.findIndex((contact) => contact.variantThresholds.includes(threshold));

/** Lernverlauf einer Karte (specs.md#lernverlauf-einer-karte): Tabellen und Zeitleisten aus den Beispielketten des Golden-Tests. */
export function cardHistoryCards(): SpecsBlock[] {
  const source = '<p class="docs-source">Beim Erzeugen mit dem Produktions-Scheduler berechnet; dieselben Werte prüft <code>src/schedulerExampleChains.test.ts</code>. Jede Antwort fällt auf den Fälligkeitstermin; Haltbarkeit = Tage, bis die Erinnerung auf 90 % fällt.</p>';
  const effects = `<table><thead><tr><th>Lage der Karte</th>${Object.values(RATING_LABELS).map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${EXAMPLE_SITUATIONS.map((situation) => {
    const outcomes = exampleRatingEffects(situation.ratings, DEFAULT_RETENTION);
    return `<tr><th scope="row">${situation.name}</th>${Object.values(outcomes).map((outcome) => `<td>${PHASE_LABELS[outcome.phase]} in ${gap(outcome)}<br><span class="core-caption">Haltbarkeit ${days(outcome.durabilityDays)} · ${BAND_LABELS[outcome.band]}</span></td>`).join("")}</tr>`;
  }).join("")}</tbody></table>`;
  const timelines = EXAMPLE_CHAINS.map((chain) => {
    const contacts = runExampleChain(chain.ratings, DEFAULT_RETENTION);
    const mature = firstMature(contacts);
    const variant = firstVariant(contacts, DEFAULT_VARIANT_THRESHOLD);
    const steps = contacts.map((contact, index) => {
      const marks = [index === variant ? '<span class="docs-chain-mark" data-mark="variant">Variante</span>' : "", index === mature ? '<span class="docs-chain-mark" data-mark="mature">wird reif</span>' : ""].join("");
      return `<li class="docs-chain-step" data-phase="${contact.phaseBefore}"><span class="core-caption">Tag ${decimal(contact.day)}</span><strong>${RATING_LABELS[contact.rating]}</strong><span class="core-caption">${PHASE_LABELS[contact.phaseBefore]}</span><span class="docs-chain-gap">→ ${gap(contact)}</span>${marks}</li>`;
    }).join("");
    return `<h4 class="catalog-label">${chain.name}</h4><ol class="docs-chain" aria-label="Zeitleiste ${chain.name}">${steps}</ol>`;
  }).join("");
  const legend = `<ul class="docs-chain-legend">${Object.entries(PHASE_LABELS).map(([phase, label]) => `<li data-phase="${phase}">${label}</li>`).join("")}</ul>`;
  const tables = EXAMPLE_RETENTIONS.map((retention) => `<h4 class="catalog-label">Zielerinnerung ${percent(retention)}</h4><table><thead><tr><th>Kette</th><th>Kontakt</th><th>Tag</th><th>Phase</th><th>Bewertung</th><th>Nächster Abstand</th><th>Haltbarkeit danach</th><th>Reife danach</th><th>Variante bei Schwelle</th></tr></thead><tbody>${EXAMPLE_CHAINS.map((chain) => runExampleChain(chain.ratings, retention).map((contact, index) => `<tr>${index ? "" : `<th scope="rowgroup" rowspan="${chain.ratings.length}">${chain.name}</th>`}<td>${index + 1}</td><td>${decimal(contact.day)}</td><td>${PHASE_LABELS[contact.phaseBefore]}</td><td>${RATING_LABELS[contact.rating]}</td><td>${gap(contact)}</td><td>${days(contact.durabilityDays)}</td><td>${BAND_LABELS[contact.band]}</td><td>${contact.variantThresholds.length ? contact.variantThresholds.map((threshold) => `${threshold} T.`).join(", ") : "–"}</td></tr>`).join("")).join("")}</tbody></table>`).join("");
  const variants = `<table><thead><tr><th>Kette</th><th>Zielerinnerung</th>${EXAMPLE_VARIANT_THRESHOLDS.map((threshold) => `<th>Schwelle ${threshold} Tage</th>`).join("")}</tr></thead><tbody>${EXAMPLE_CHAINS.flatMap((chain) => EXAMPLE_RETENTIONS.map((retention) => {
    const contacts = runExampleChain(chain.ratings, retention);
    return `<tr><th scope="row">${chain.name}</th><td>${percent(retention)}</td>${EXAMPLE_VARIANT_THRESHOLDS.map((threshold) => {
      const index = firstVariant(contacts, threshold);
      return `<td>${index < 0 ? "nicht in der Kette" : `Kontakt ${index + 1} · Tag ${decimal(contacts[index].day)}`}</td>`;
    }).join("")}</tr>`;
  })).join("")}</tbody></table>`;
  return [
    { id: "specs--lernverlauf-bewertungen", title: "Was jede Bewertung bewirkt", html: `<p>Bei Zielerinnerung ${percent(DEFAULT_RETENTION)} und den Standardlernschritten 1 und 10 Minuten; „In der Wiederholung“ ist die Karte nach dreimal „Gut“.</p>${effects}${source}` },
    { id: "specs--lernverlauf-zeitleisten", title: `Beispielketten als Zeitleiste (${percent(DEFAULT_RETENTION)})`, html: `<p>Jeder Punkt ist ein Kontakt: Tag, Bewertung und Phase davor, dann der Abstand bis zum nächsten Kontakt. Markiert sind der Kontakt, nach dem die Karte reif ist, und der erste Kontakt mit Variante bei der Standardschwelle von ${DEFAULT_VARIANT_THRESHOLD} Tagen und einer aktiven Variante.</p>${legend}${timelines}${source}` },
    { id: "specs--lernverlauf-tabellen", title: "Beispielketten je Zielerinnerung", html: `<p>Die Haltbarkeit folgt dem Gedächtnis, nicht der Zielerinnerung; eine höhere Zielerinnerung verkürzt nur die Abstände und verschiebt damit die Tage.</p>${tables}${source}` },
    { id: "specs--lernverlauf-varianten", title: "Wann Varianten erscheinen", html: `<p>Erster Kontakt, bei dem statt der Karte die Variante kommt, je Stapelschwelle. Mit einer aktiven Variante wechseln Karte und Variante sich ab; nach „Nochmal“ kommt bis zur nächsten erfolgreichen Antwort die Karte selbst.</p>${variants}${source}` },
  ];
}

type SpecsBlock = { id: string; title: string; html: string };

/** Projiziert docs/specs.md als Leseseite wie die Journeys: Kapitel und Abschnitte als Überschriften, Rasterzeilen (`Zweck:` …) als Labels, erzeugte Blöcke hinter ihrem Abschnitt. */
export function specsDocument(markdown: string, appendix?: { title: string; html: string }, generated: Record<string, SpecsBlock[]> = {}) {
  let html = renderMarkdown(markdown, "specs.md").replace(/<hr>\n?/g, "").replace(/<p>(\p{L}[\p{L}\s/-]{0,40}):<\/p>/gu, '<p class="docs-label">$1</p>');
  for (const [id, blocks] of Object.entries(generated)) {
    html = appendToSection(html, id, blocks.map((block) => `<h4 id="${block.id}" class="core-control-label" tabindex="-1">${block.title}</h4>${block.html}`).join(""), "specs.md");
  }
  if (appendix) html += renderMarkdown(`## ${appendix.title}`, "specs.md") + appendix.html;
  return `<article id="specs--document" class="docs-document">${html}</article>`;
}

export function createCatalogData(): Omit<CatalogData, "sourceHash"> {
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
      const touch = rule.parent?.type === "atrule" && (rule.parent as postcss.AtRule).params === "(pointer: coarse)";
      token[touch ? "touch" : rule.selector.includes('data-core-theme="dark"') ? "dark" : "light"] = declaration.value;
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
  };
}

/** Verweise einer Journey auf Specs-Abschnitte (`#anker`) führen auf der Journey-Seite in die Specs. */
export const journeySpecsLinks = (markdown: string) => markdown.replace(/\]\(#/g, "](specs.md#");

/** Projiziert das Kapitel „Kernjourneys“: je Journey Zweck, die Schrittkette aus `Ablauf:` und die verlinkte `Akzeptanz:`. */
export function journeyProjection(specs: string) {
  const section = specs.match(/^## \d+\. Kernjourneys\n([\s\S]*?)(?=^## )/m)?.[1];
  if (!section) throw new Error("Kernjourneys fehlen in docs/specs.md.");
  const journeys = [...section.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
  if (!journeys.length) throw new Error("Das Kapitel Kernjourneys enthält keine Journey.");
  return journeys.map(([, title, body], index) => {
    const [intro, rest = ""] = body.split(/\nAblauf:\n/);
    const [flow, acceptance] = rest.split(/\nAkzeptanz:\n/);
    const steps = [...flow.matchAll(/^\d+\. (.+)$/gm)].map(([, step]) => step);
    if (!steps.length) throw new Error(`Ablauf fehlt in Journey ${title}.`);
    if (!acceptance) throw new Error(`Akzeptanz fehlt in Journey ${title}.`);
    const prefix = `journey-${index + 1}`;
    const step = (label: string) => renderMarkdown(journeySpecsLinks(label), "specs.md", prefix).trim().replace(/^<p>([\s\S]*)<\/p>$/, "$1");
    const flowHtml = steps.map((label, number) => `<li class="docs-flow-step"><span class="docs-flow-number" aria-hidden="true">${number + 1}</span><span>${step(label)}</span></li>`).join("");
    return `<article id="${prefix}" class="docs-document docs-journey">${renderMarkdown(`## ${title}\n${journeySpecsLinks(intro)}`, "specs.md", prefix)}<h3 id="${prefix}--ablauf" class="core-heading-3" tabindex="-1">Ablauf</h3><ol class="docs-flow">${flowHtml}</ol>${renderMarkdown(`### Akzeptanz\n${journeySpecsLinks(acceptance)}`, "specs.md", `${prefix}-rules`)}<p class="docs-source">Quelle: <a href="specs.html#specs--${markdownAnchor(title)}">Produktvertrag: ${title}</a></p></article>`;
  }).join("\n");
}

const RUNTIME_END = "/*catalog-runtime-end*/";
const BINARY_INPUT = /\.(?:woff2?|png|jpe?g|gif|ico|webp|wasm)$/;

function inputFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? inputFiles(file) : /\.test\./.test(file) ? [] : [file];
  });
}

/** Hashes every catalog input: product sources, files they import from outside src, catalog entry, generator, assets, lockfile and build config. */
function catalogInputHash() {
  const sources = inputFiles("src");
  const imported = sources.filter((file) => /\.tsx?$/.test(file)).flatMap((file) => [...text(file).matchAll(/(?:from|import\()\s*"(\.{1,2}\/[^"?]+)/g)]
    .map(([, specifier]) => path.relative(root, path.resolve(root, path.dirname(file), specifier)).replaceAll("\\", "/"))
    .filter((target) => !target.startsWith("src/") && existsSync(path.join(root, target))));
  const hash = createHash("sha256");
  for (const file of [...new Set([...sources, ...imported, ...inputFiles("public"), "scripts/uiCatalog.tsx", "scripts/uiCatalogDemos.tsx", "scripts/generateDocs.ts", "scripts/docsSite.ts", "package-lock.json", "tsconfig.json", "tailwind.config.ts"])].sort()) {
    hash.update(`${file}\n`).update(BINARY_INPUT.test(file) ? readFileSync(path.join(root, file)) : text(file)).update("\n");
  }
  return hash.digest("hex");
}

/** Reuses the escaped runtime of the current catalog page when it was built from the same inputs and is unchanged since. */
function currentRuntime(inputs: string) {
  const page = existsSync(path.join(docs, "ui-elements.html")) ? text("docs/ui-elements.html") : "";
  const start = page.indexOf(`/*catalog-runtime ${inputs} `);
  const end = page.indexOf(RUNTIME_END, start);
  if (start < 0 || end < 0) return null;
  const header = page.slice(start, page.indexOf("*/", start) + 2);
  const runtime = page.slice(start + header.length, end);
  return header === runtimeHeader(inputs, runtime) ? runtime : null;
}

function runtimeHeader(inputs: string, runtime: string) { return `/*catalog-runtime ${inputs} ${createHash("sha256").update(runtime).digest("hex")}*/`; }

async function buildCatalogRuntime(fonts: Map<string, string>, images: Map<string, string>) {
  const pdfWorker = (await transformWithEsbuild(readFileSync(path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.mjs"), "utf8"), "pdf.worker.js", { minify: true, target: "es2022" })).code;
  const bundle = await build({ configFile: false, logLevel: "error", publicDir: false, define: { "process.env.NODE_ENV": '"production"' }, esbuild: { supported: { "template-literal": false } },
    worker: { format: "es", rollupOptions: { output: { inlineDynamicImports: true } } },
    plugins: [{ name: "docs-inline-runtime-assets", transform(code, id) {
      const normalized = id.replaceAll("\\", "/");
      if (!normalized.includes("/src/")) return;
      let result = code;
      for (const [file, url] of [...fonts, ...images]) result = result.replaceAll(file, url);
      if (normalized.endsWith("/src/pdfRuntime.ts")) result = result.replace('new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString()', () => `URL.createObjectURL(new Blob([${JSON.stringify(pdfWorker)}], { type: "application/javascript" }))`);
      if (normalized.endsWith("/src/apkgImportInternal.ts")) result = 'import CatalogApkgWorker from "./apkgImportWorker.ts?worker&inline";\n' + result.replace('new Worker(new URL("./apkgImportWorker.ts", import.meta.url), { type: "module" })', 'new CatalogApkgWorker()');
      return result === code ? undefined : { code: result, map: null };
    } }],
    build: { write: false, emptyOutDir: false, target: "es2022", minify: "esbuild", lib: { entry: path.join(root, "scripts/uiCatalog.tsx"), formats: ["iife"], name: "CoReCatalog" }, rollupOptions: { output: { inlineDynamicImports: true } } },
  }) as Rollup.RollupOutput | Rollup.RollupOutput[];
  return (Array.isArray(bundle) ? bundle : [bundle]).flatMap((output) => output.output).filter((entry): entry is Rollup.OutputChunk => entry.type === "chunk").map((entry) => entry.code).join("\n").replace(/^[ \t]+$/gm, "");
}

export async function synchronizeDocs(mode: "write" | "check") {
  await synchronizeBrainLogo(mode);
  const inputs = catalogInputHash();
  const data: CatalogData = { ...createCatalogData(), sourceHash: inputs.slice(0, 16) };
  const raw = sourceFiles("src").map(text).join("\n") + text("scripts/uiCatalog.tsx") + text("scripts/uiCatalogDemos.tsx") + text("scripts/generateDocs.ts") + text("scripts/docsSite.ts") + Object.values(data.patterns).join("\n");
  let styles = (await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw, extension: "tsx" }] }), autoprefixer]).process(text("src/styles.css"), { from: path.join(root, "src/styles.css") })).css;
  const fonts = new Map(readdirSync(path.join(root, "public/fonts"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".woff2"))
    .map((file) => [`/fonts/${file.replaceAll("\\", "/")}`, `data:font/woff2;base64,${readFileSync(path.join(root, "public/fonts", file)).toString("base64")}`]));
  for (const [file, url] of fonts) styles = styles.replaceAll(file, url);
  const images = new Map([["/core-brain.svg", `data:image/svg+xml;base64,${Buffer.from(text("public/core-brain.svg")).toString("base64")}`]]);
  const css = `${styles}\n${text("src/ui/brainMascot.css")}\n${text("scripts/docsSite.css")}\n${text("scripts/uiCatalog.css")}`;
  const viewer = ts.transpileModule(text("scripts/docsViewer.ts"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const runtime = currentRuntime(inputs) ?? inlineScript(await buildCatalogRuntime(fonts, images));
  const results = new Map<string, string>();
  function reader(file: string, contents: string) {
    results.set(file, htmlPage(file, contents, css, viewer));
  }
  function document(file: string) { return `<article id="${documentId(file)}--document" class="docs-document"><p class="docs-source">Verbindliche Quelle: <a href="${file}">${file}</a></p>${renderMarkdown(text(`docs/${file}`), file)}</article>`; }
  reader("index.html", document("README.md"));
  const footprint = { title: "Codeumfang der Produktbereiche", html: `<p>CoRe ist eine App mit mehreren Bereichen. Die Tabelle zeigt deren Anteil am Bildschirmcode; gemeinsam genutzte Logik, UI und API stehen separat.</p>${codeFootprintMarkup()}` };
  reader("specs.html", specsDocument(text("docs/specs.md"), footprint, { "specs--lernverlauf-einer-karte": cardHistoryCards() }));
  reader("ai-eval.html", aiEvalDocument(text("docs/ai-eval.md"), readLedger()));
  reader("journeys.html", `<article class="docs-document"><h1 id="journeys--document" class="core-heading-1" tabindex="-1">Journeys</h1></article>${journeyProjection(text("docs/specs.md"))}`);
  for (const [file, catalog] of [["ui-elements.html", "ui"], ["card-types.html", "cards"]]) {
    const content = `<div id="catalog-root"></div><script id="catalog-data" type="application/json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;
    results.set(file, htmlPage(file, content, css, `${viewer}\n${runtimeHeader(inputs, runtime)}${runtime}${RUNTIME_END}`).replace("<body>", `<body data-catalog="${catalog}">`));
  }
  const failures = docLimitFailures(text);
  for (const [file, generated] of results) {
    const current = await readFile(path.join(docs, file), "utf8").catch(() => "");
    if (current.replace(/\r\n?/g, "\n") !== generated) {
      if (mode === "write") await writeFile(path.join(docs, file), generated, "utf8");
      else failures.push(`${file} ist veraltet`);
    }
  }
  const uiAnchors = new Set([...[...text("scripts/uiCatalog.tsx").matchAll(/\{ id: "([a-z-]+)", (?:nav|section): /g)].map((match) => match[1]), ...DEMO_GROUPS.map((group) => group.id)]);
  const cardAnchors = new Set([...text("scripts/uiCatalog.tsx").matchAll(/\{ id: "([a-z-]+)", label: /g)].map((match) => match[1]));
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
    else if (fragment && linkedTarget && linkSources.has(target) && !linkSources.get(target)!.includes(`id="${documentId(target)}--${decodeURIComponent(fragment)}"`)) failures.push(`${file}: Anker ${href} fehlt`);
  }
  if (failures.length) throw new Error(`${failures.join("\n")}\nQuellen korrigieren und npm run docs:build ausführen.`);
  console.log(`Dokumentation ${mode === "write" ? "erzeugt" : "geprüft"}: ${DOC_PAGES.length} Leseseiten, ${data.components.length} Komponenten, ${data.tokens.length} Tokens, ${data.icons.length} Icons.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) synchronizeDocs(process.argv.includes("--write") ? "write" : "check").catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
