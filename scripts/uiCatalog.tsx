import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search } from "lucide-react";
import { CoreTooltipProvider } from "../src/ui/tooltipUi.tsx";
import { SuccessToastProvider } from "../src/ui/feedbackUi.tsx";
import { DEMO_GROUPS, Demo, StudyDemo, type CatalogCardKind, type CatalogSectionId } from "./uiCatalogDemos.tsx";
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

/** Catalog chapters; the navigation labels follow the shared catalog structure. */
export const CATALOG_SECTIONS: { id: CatalogSectionId; nav: string; title: string }[] = [
  { id: "grundlagen", nav: "Grundlagen", title: "Grundlagen" },
  { id: "primitive", nav: "Primitive", title: "Generische Primitive" },
  { id: "shared", nav: "Shared Patterns", title: "Gemeinsame App-Muster" },
  { id: "fachmuster", nav: "CoRe · Fachmuster", title: "CoRe · Fachmuster" },
  { id: "icons", nav: "Icons & Assets", title: "Icons, Illustrationen und Assets" },
  { id: "states", nav: "Zustände", title: "Zustandsmatrix" },
];

interface CatalogCard { id: string; section: CatalogSectionId; title: string; search: string; source?: string; wide?: boolean; render: () => React.ReactNode }

const NEUTRAL_ROLES = [["canvas", "--core-canvas"], ["surface", "--core-surface"], ["muted", "--core-surface-muted"], ["hover", "--core-surface-hover"], ["border", "--core-border"], ["border-strong", "--core-border-interactive"], ["muted-fg", "--core-text-muted"], ["secondary-fg", "--core-text-secondary"], ["foreground", "--core-text"]];
const ACCENT_ROLES = [["primary", "--core-action-primary", "--core-action-soft"], ["info", "--core-info", "--core-info-surface"], ["success", "--core-success", "--core-success-surface"], ["warning", "--core-warning", "--core-warning-surface"], ["danger", "--core-danger", "--core-danger-surface"], ["selection", "--core-selection", "--core-selection-track"]];
const PALETTE = data.tokens.filter((token) => token.name.startsWith("--core-palette-") && !token.name.endsWith("-glow"));

function Usage({ count, files }: { count: number; files: string[] }) {
  return <details><summary>{count} Verwendung{count === 1 ? "" : "en"} · {files.length} Datei{files.length === 1 ? "" : "en"}</summary><ul>{files.map((file) => <li key={file}><code>{file}</code></li>)}</ul></details>;
}

/** Actual size, line height and weight of a type role in the active theme. */
function TypeSpecimen({ name }: { name: string }) {
  const sample = useRef<HTMLSpanElement>(null);
  const [metrics, setMetrics] = useState("");
  useLayoutEffect(() => {
    const style = sample.current && getComputedStyle(sample.current);
    if (style) setMetrics(`${parseFloat(style.fontSize)} / ${parseFloat(style.lineHeight) || style.lineHeight} · ${style.fontWeight}`);
  }, []);
  return <div className="catalog-type-specimen"><code>.{name}</code><span ref={sample} className={name}>Lerne Inhalte, nicht Karten.</span><small>{metrics}</small></div>;
}

function ColorRoles() {
  return <>
    <p className="catalog-label">Neutral</p>
    <div className="catalog-scale">{NEUTRAL_ROLES.map(([, token]) => <span key={token} style={{ background: `var(${token})` }} title={token} />)}</div>
    <div className="catalog-scale-labels">{NEUTRAL_ROLES.map(([label]) => <span key={label}>{label}</span>)}</div>
    <div className="catalog-accents">{ACCENT_ROLES.map(([label, token, soft]) => <div key={token}><i style={{ background: `var(${token})` }} /><strong>{label}</strong><span className="catalog-meta"><code>{token}</code> · <code>{soft}</code></span></div>)}</div>
    <p className="catalog-label">CoRe-Palette</p>
    <div className="catalog-accents">{PALETTE.map((token) => <div key={token.name}><i style={{ background: `var(${token.name})` }} /><strong>{token.name.replace("--core-palette-", "")}</strong><span className="catalog-meta">{token.light}</span></div>)}</div>
  </>;
}

function ShapeTokens() {
  const radii = data.tokens.filter((token) => token.category === "Radius");
  const shadows = data.tokens.filter((token) => token.category === "Schatten" && !token.name.includes("selection"));
  const spaces = data.tokens.filter((token) => token.name.startsWith("--core-space-")).sort((a, b) => parseFloat(a.light) - parseFloat(b.light));
  return <div className="catalog-shapes">
    <div><p className="catalog-label">Radien</p><div className="catalog-shape-row">{radii.map((token) => <figure key={token.name}><span style={{ borderRadius: `var(${token.name})` }} /><figcaption className="catalog-meta">{token.name.replace("--core-radius-", "")} · {token.light}</figcaption></figure>)}</div></div>
    <div><p className="catalog-label">Schatten</p><div className="catalog-shape-row">{shadows.map((token) => <figure key={token.name}><span style={{ boxShadow: `var(${token.name})` }} /><figcaption className="catalog-meta">{token.name.replace("--core-shadow-", "")}</figcaption></figure>)}</div></div>
    <div><p className="catalog-label">Abstände und Bedienhöhe</p><ul className="catalog-spacing">{spaces.map((token) => <li key={token.name}><span className="catalog-meta">{token.name.replace("--core-space-", "")} · {token.light}</span><i style={{ width: `var(${token.name})` }} /></li>)}<li><span className="catalog-meta">control · 40 px, Touch 44 px</span><i style={{ width: "var(--core-control-height)" }} /></li></ul></div>
  </div>;
}

function AllTokens() {
  const categories = [...new Set(data.tokens.map((token) => token.category))];
  return <details className="catalog-legacy"><summary>Alle {data.tokens.length} Design-Tokens mit Light- und Dark-Wert</summary>{categories.map((category) => <div key={category}><p className="catalog-label">{category}</p><div className="catalog-token-grid">{data.tokens.filter((token) => token.category === category).map((token) => <article className="catalog-token" key={token.name}>{category === "Farbe" ? <div className="catalog-swatch" style={{ background: `var(${token.name})` }} /> : null}<code>{token.name}</code><small>Light: {token.light}</small><small>Dark: {token.dark}</small></article>)}</div></div>)}</details>;
}

function ComponentInventory() {
  const titles = new Map<string, string>(DEMO_GROUPS.map((group) => [group.id, group.title]));
  return <details className="catalog-legacy"><summary>{data.components.length} gemeinsame Komponenten mit Herkunft und Verwendung</summary><div className="catalog-table-scroll"><table className="catalog-inventory"><thead><tr><th>Komponente</th><th>Karte</th><th>Verwendet</th><th>Definiert in</th></tr></thead><tbody>{data.components.map((component) => <tr key={component.name}><td><code>{component.name}</code></td><td><a href={`#${component.group}`}>{titles.get(component.group)}</a></td><td><Usage count={component.usage} files={component.usedIn} /></td><td><code>{component.file}</code></td></tr>)}</tbody></table></div></details>;
}

function ClassInventory() {
  return <details className="catalog-legacy"><summary>{data.cssClasses.length} eigene core-Klassen einschließlich lokaler Screen-Muster</summary><div className="catalog-table-scroll"><table className="catalog-inventory"><thead><tr><th>Klasse</th><th>Verwendet in</th></tr></thead><tbody>{data.cssClasses.map((entry) => <tr key={entry.name}><td><code>.{entry.name}</code></td><td><Usage count={entry.files.length} files={entry.files} /></td></tr>)}</tbody></table></div></details>;
}

function LucideInventory() {
  return <ul className="catalog-icon-grid">{data.icons.map((icon) => <li key={icon.name} title={icon.files.join("\n")}><span dangerouslySetInnerHTML={{ __html: icon.svg }} /><code>{icon.name}</code><small>{icon.files.length}</small></li>)}</ul>;
}

const CARDS: CatalogCard[] = [
  { id: "farbrollen", section: "grundlagen", title: "Farbrollen", search: "Farbe Palette Token", source: "src/styles.css", render: ColorRoles },
  { id: "typografie", section: "grundlagen", title: "Typografierollen", search: `Typografie Schrift Manrope ${data.typography.map((rule) => rule.name).join(" ")}`, source: "src/styles.css", render: () => <>{data.typography.map((rule) => <TypeSpecimen key={rule.name} name={rule.name} />)}</> },
  { id: "formen", section: "grundlagen", title: "Radien, Schatten und Abstände", search: "Radius Schatten Abstand Bedienhöhe", source: "src/styles.css", render: ShapeTokens },
  { id: "tokens", section: "grundlagen", title: "Design-Tokens", search: `Token ${data.tokens.map((token) => token.name).join(" ")}`, source: "src/styles.css", render: AllTokens },
  { id: "komponenten", section: "grundlagen", title: "Komponenteninventar", search: `Komponenten Inventar ${data.components.map((component) => component.name).join(" ")}`, render: ComponentInventory },
  { id: "klassen", section: "grundlagen", title: "Eigene CSS-Klassen", search: `CSS Klassen ${data.cssClasses.map((entry) => entry.name).join(" ")}`, source: "src/styles.css", render: ClassInventory },
  ...DEMO_GROUPS.map((group): CatalogCard => {
    const components = data.components.filter((component) => component.group === group.id);
    const GroupDemo = group.render;
    return {
      id: group.id,
      section: group.section,
      title: group.title,
      wide: "wide" in group ? group.wide : false,
      search: [group.title, group.description, ...components.map((component) => component.name)].join(" "),
      source: [...new Set(components.map((component) => component.file))].join(" "),
      render: () => <div className="catalog-demo-grid"><GroupDemo />{data.patterns[group.id] && <div className="catalog-patterns catalog-demo-wide" dangerouslySetInnerHTML={{ __html: data.patterns[group.id] }} />}</div>,
    };
  }),
  { id: "lucide", section: "icons", title: "Lucide-Inventar", search: `Icons Lucide ${data.icons.map((icon) => icon.name).join(" ")}`, wide: true, render: LucideInventory },
];

/** Marks the chapter whose heading was scrolled past last. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const passed = ids.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) < 160);
      setActive(passed.at(-1) ?? ids[0]);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); cancelAnimationFrame(frame); };
  }, [ids]);
  return active;
}

function CatalogFrame({ title, lede, navigation, toolbar, footer, children }: { title: string; lede: string; navigation: { id: string; label: string }[]; toolbar?: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const ids = React.useMemo(() => navigation.map((item) => item.id), [navigation]);
  const active = useActiveSection(ids);
  return <div className="catalog">
    <header className="catalog-hero"><div className="catalog-hero-inner"><h1>{title}</h1><p className="catalog-lede">{lede}</p></div></header>
    <div className="catalog-shell">
      <nav className="catalog-nav" aria-label="Katalogbereiche"><strong>Inhalt</strong>{navigation.map((item) => <a key={item.id} href={`#${item.id}`} aria-current={item.id === active ? "location" : undefined}>{item.label}</a>)}</nav>
      <main className="catalog-main">{toolbar}{children}</main>
    </div>
    <footer className="catalog-footer">{footer}</footer>
  </div>;
}

function Catalog() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("de");
  const visible = CARDS.filter((card) => !normalized || `${card.title} ${card.search}`.toLocaleLowerCase("de").includes(normalized));
  return <CoreTooltipProvider><SuccessToastProvider><CatalogFrame
    title="UI-Elemente-Katalog"
    lede="Gemeinsame Controls ausprobieren und die Oberflächen von CoRe entdecken."
    navigation={CATALOG_SECTIONS.map((section) => ({ id: section.id, label: section.nav }))}
    toolbar={<div className="catalog-toolbar" aria-label="Katalogsuche"><label className="catalog-search"><span className="catalog-search-label">Katalog durchsuchen</span><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Komponente oder Zustand suchen …" autoComplete="off" /></label></div>}
    footer={<>CoRe UI-Elemente-Katalog · {data.components.length} Komponenten · {data.tokens.length} Tokens · {data.icons.length} Icons · Quellenstand <code>{data.sourceHash}</code></>}
  >
    {visible.length === 0 ? <p className="catalog-empty" role="status">Keine Katalogeinträge passen zur Suche.</p> : null}
    {CATALOG_SECTIONS.map((section) => {
      const cards = visible.filter((card) => card.section === section.id);
      if (!cards.length) return null;
      return <section key={section.id} id={section.id} className="catalog-section">
        <div className="catalog-section-heading"><h2>{section.title}</h2></div>
        <div className={`catalog-grid${section.id === "grundlagen" ? " catalog-grid-wide" : ""}`}>{cards.map((card) => <article key={card.id} id={card.id} className={`catalog-card${card.wide ? " catalog-card-wide" : ""}`} data-source={card.source || undefined}>
          <div className="catalog-card-header"><h3>{card.title}</h3></div>
          <div className="catalog-preview">{card.render()}</div>
        </article>)}</div>
      </section>;
    })}
  </CatalogFrame></SuccessToastProvider></CoreTooltipProvider>;
}

function CardForms() {
  return <CoreTooltipProvider><SuccessToastProvider><CatalogFrame
    title="Kartentypen"
    lede="Alle sechs manuell erstellbaren Formen verwenden denselben Kartenrenderer wie die App. Aufdecken, Auswahl und Zurücksetzen sind interaktiv."
    navigation={cardTypes.map((type) => ({ id: type.kind, label: type.label }))}
    footer={<>Weitere Formen aus Anki-Importen zeigen die <a href="ui-elements.html#note-content">Kartenbausteine</a> im UI-Elemente-Katalog.</>}
  >
    {cardTypes.map((type) => <section key={type.kind} id={type.kind} className="catalog-section">
      <div className="catalog-section-heading"><h2>{type.label}</h2><p>{type.description}</p></div>
      <div className="catalog-grid">
        <article className="catalog-card"><div className="catalog-card-header"><h3>{type.kind === "basic-reversed" ? "Vorwärtsrichtung" : "Review"}</h3></div><div className="catalog-preview"><Demo title="Lernansicht"><StudyDemo kind={type.kind} /></Demo></div></article>
        {type.kind === "basic-reversed" && <article className="catalog-card"><div className="catalog-card-header"><h3>Rückrichtung · eigenständige Karte</h3></div><div className="catalog-preview"><Demo title="Lernansicht"><StudyDemo kind={type.kind} index={1} /></Demo></div></article>}
      </div>
    </section>)}
  </CatalogFrame></SuccessToastProvider></CoreTooltipProvider>;
}

loadDeferredBrowserAssets(document);
createRoot(document.getElementById("catalog-root")!).render(document.body.dataset.catalog === "cards" ? <CardForms /> : <Catalog />);
