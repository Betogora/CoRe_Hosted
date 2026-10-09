import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CoreTooltipProvider } from "../src/ui/tooltipUi.tsx";
import { SuccessToastProvider } from "../src/ui/feedbackUi.tsx";
import { DEMO_GROUPS, Demo, StudyDemo, type CatalogCardKind } from "./uiCatalogDemos.tsx";
import { loadDeferredBrowserAssets } from "../src/deferredBrowserAssets.ts";

export interface CatalogData {
  components: { name: string; file: string; group: string; usage: number; usedIn: string[] }[];
  tokens: { name: string; light: string; dark: string; category: string }[];
  typography: { name: string; declarations: string }[];
  cssClasses: { name: string; files: string[] }[];
  icons: { name: string; svg: string; files: string[] }[];
  patterns: Record<string, string>;
  sourceHash: string;
}

const data = JSON.parse(document.getElementById("catalog-data")!.textContent!) as CatalogData;
const cardTypes = [
  { kind: "basic", label: "Basic", description: "Frage und Antwort als eigenständige Karte." },
  { kind: "basic-with-images", label: "Basic mit Bildern", description: "Bilder sind Teil des Rich-Text-Inhalts; die Lernlogik entspricht Basic." },
  { kind: "basic-reversed", label: "Basic umgekehrt", description: "Vorwärts- und Rückrichtung sind zwei eigenständige Karten mit jeweils eigenem Lernzustand." },
  { kind: "cloze", label: "Lückentext", description: "Jede Lückengruppe ist eine eigenständige Karte." },
  { kind: "single-choice", label: "Single Choice", description: "Eine Auswahl deckt die Antwort unmittelbar auf." },
  { kind: "multiple-choice", label: "Multiple Choice", description: "Mehrere Optionen werden ausgewählt und gemeinsam geprüft." },
] satisfies { kind: CatalogCardKind; label: string; description: string }[];

function Usage({ count, files }: { count: number; files: string[] }) {
  return <details><summary>{count} Verwendung{count === 1 ? "" : "en"} · {files.length} Datei{files.length === 1 ? "" : "en"}</summary><ul>{files.map((file) => <li key={file}><code>{file}</code></li>)}</ul></details>;
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return <section id={id} className="catalog-section"><h2>{title} <a className="docs-anchor" href={`#${id}`} aria-label={`Link zu ${title}`}>#</a></h2>{lead && <p className="catalog-lead">{lead}</p>}{children}</section>;
}

function Catalog() {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const normalized = query.trim().toLocaleLowerCase("de");
  const matches = (...parts: string[]) => !normalized || parts.join(" ").toLocaleLowerCase("de").includes(normalized);
  const navigation = [{ id: "tokens", title: "Design-Tokens" }, { id: "typografie", title: "Typografie" }, ...DEMO_GROUPS.map(({ id, title }) => ({ id, title })), { id: "klassen", title: "Eigene CSS-Klassen" }, { id: "icons", title: "Icons" }];
  const visibleComponents = data.components.filter((component) => matches(component.name, component.file, component.group));
  return <CoreTooltipProvider><SuccessToastProvider><div className="catalog">
    <button type="button" className="docs-mobile-nav core-action-secondary" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>Katalogbereiche {menu ? "schließen" : "öffnen"}</button>
    <div className="docs-layout"><aside className={`docs-rail${menu ? " is-open" : ""}`}><h1 className="core-heading-3">UI-Elements</h1><p>Design-Arbeitsfläche für CoRe</p><label className="catalog-controls"><span className="sr-only">Elemente durchsuchen</span><input className="docs-search core-field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Elemente durchsuchen" /></label><p className="docs-count" role="status">{normalized ? `${visibleComponents.length} Komponenten-Treffer` : `${data.components.length} Komponenten · ${data.tokens.length} Tokens · ${data.icons.length} Icons`}</p><nav className="docs-toc" aria-label="Katalogbereiche">{navigation.map((item) => <a key={item.id} href={`#${item.id}`} onClick={() => { setQuery(""); setMenu(false); }}>{item.title}</a>)}</nav><p className="catalog-source">Quellenstand <code>{data.sourceHash}</code></p></aside>
    <main className="docs-content"><header className="catalog-intro"><p>CoRe · Design-Arbeitsfläche</p><h1>UI-Elements</h1><p>Alle CoRe-Elementfamilien, Design-Tokens, Schriften und Icons. Die Demos verwenden die echten Komponenten und reagieren auf Eingaben.</p><p>Designänderungen werden von dieser Referenz aus beschrieben, in den angegebenen App-Quellen umgesetzt und anschließend neu erzeugt. Beispielaktionen arbeiten mit Demodaten.</p></header>
      <Section id="tokens" title="Design-Tokens" lead="Alle --core-Werte aus src/styles.css. Light und Dark stehen nebeneinander; die Vorschau folgt dem gewählten Theme.">{[...new Set(data.tokens.map((token) => token.category))].map((category) => {
        const tokens = data.tokens.filter((token) => token.category === category && matches(category, token.name, token.light, token.dark));
        return tokens.length > 0 && <div key={category}><h3 className="catalog-subtitle">{category}</h3><div className="catalog-token-grid">{tokens.map((token) => <article className="catalog-token" key={token.name}>{category === "Farbe" ? <div className="catalog-swatch" style={{ background: `var(${token.name})` }} /> : <div className="catalog-shape" style={category === "Radius" ? { borderRadius: `var(${token.name})` } : category === "Schatten" ? { boxShadow: `var(${token.name})` } : category === "Typografie" ? token.name.includes("--core-type-") ? { fontSize: `var(${token.name})` } : token.name.includes("--core-weight-") ? { fontWeight: `var(${token.name})` } : { lineHeight: `var(${token.name})` } : category === "Maße" ? { border: `var(--core-border-width) solid var(--core-border)`, padding: token.name.includes("space") ? `var(${token.name})` : undefined } : undefined}>Aa</div>}<code>{token.name}</code><small>Light: {token.light}</small><small>Dark: {token.dark}</small></article>)}</div></div>;
      })}</Section>
      <Section id="typografie" title="Typografie" lead="Produktive Typostufen aus src/styles.css; die lokale Schrift Manrope ist eingebettet.">{data.typography.filter((rule) => matches(rule.name, rule.declarations)).map((rule) => <div className="catalog-type-row" key={rule.name}><code>.{rule.name}</code><p className={rule.name}>Lerne Inhalte, nicht Karten.</p><small>{rule.declarations}</small></div>)}</Section>
      {DEMO_GROUPS.map((group) => {
        const components = data.components.filter((component) => component.group === group.id && matches(group.title, component.name, component.file));
        if (!components.length && !matches(group.title, group.description)) return null;
        const GroupDemo = group.render;
        return <Section key={group.id} id={group.id} title={group.title} lead={group.description}><div className="catalog-demo-grid"><GroupDemo />{data.patterns[group.id] && <div className="catalog-patterns catalog-demo-wide" dangerouslySetInnerHTML={{ __html: data.patterns[group.id] }} />}</div>{components.length > 0 && <div className="catalog-table-scroll"><table className="catalog-inventory"><thead><tr><th>Komponente</th><th>Verwendet</th><th>Definiert in</th></tr></thead><tbody>{components.map((component) => <tr key={component.name}><td><code>{component.name}</code></td><td><Usage count={component.usage} files={component.usedIn} /></td><td><code>{component.file}</code></td></tr>)}</tbody></table></div>}</Section>;
      })}
      <Section id="klassen" title="Eigene CSS-Klassen" lead="Alle kanonischen core-Klassen einschließlich lokaler Screen-Muster und ihrer Verwendung."><div className="catalog-table-scroll"><table className="catalog-inventory"><thead><tr><th>Klasse</th><th>Verwendet in</th></tr></thead><tbody>{data.cssClasses.filter((entry) => matches(entry.name, ...entry.files)).map((entry) => <tr key={entry.name}><td><code>.{entry.name}</code></td><td><Usage count={entry.files.length} files={entry.files} /></td></tr>)}</tbody></table></div></Section>
      <Section id="icons" title="Icons" lead="Alle in produktiven TSX-Dateien importierten Lucide-Icons; Herkunft und Verwendung werden aus dem Code ermittelt."><div className="catalog-icon-grid">{data.icons.filter((icon) => matches(icon.name, ...icon.files)).map((icon) => <article key={icon.name}><span dangerouslySetInnerHTML={{ __html: icon.svg }} /><code>{icon.name}</code><Usage count={icon.files.length} files={icon.files} /></article>)}</div></Section>
    </main></div>
  </div></SuccessToastProvider></CoreTooltipProvider>;
}

function CardForms() {
  return <CoreTooltipProvider><SuccessToastProvider><main className="catalog catalog-card-types"><header className="catalog-intro"><p>CoRe · Reviewreferenz</p><h1>Kartentypen</h1><p>Alle sechs manuell erstellbaren Formen verwenden denselben Kartenrenderer wie die App. Aufdecken, Auswahl und Zurücksetzen sind interaktiv. Importierte Image-Occlusion-Karten werden zusätzlich über ihre erhaltenen Anki-Schablonen dargestellt.</p><p>Weitere Formen aus Anki-Importen zeigen die <a href="ui-elements.html#note-content">Kartenbausteine</a> im UI-Katalog.</p><nav className="catalog-card-links" aria-label="Kartentypen">{cardTypes.map((type) => <a key={type.kind} href={`#${type.kind}`}>{type.label}</a>)}</nav></header>{cardTypes.map((type) => <Section key={type.kind} id={type.kind} title={type.label} lead={type.description}><div className="catalog-demo-grid"><Demo title={type.kind === "basic-reversed" ? "Vorwärtsrichtung" : "Review"}><StudyDemo kind={type.kind} /></Demo>{type.kind === "basic-reversed" && <Demo title="Rückrichtung · eigenständige Karte"><StudyDemo kind={type.kind} index={1} /></Demo>}</div></Section>)}</main></SuccessToastProvider></CoreTooltipProvider>;
}

loadDeferredBrowserAssets(document);
createRoot(document.getElementById("catalog-root")!).render(document.body.dataset.catalog === "cards" ? <CardForms /> : <Catalog />);
