import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Disclosure } from "../src/ui/actionUi.tsx";
import { CoreTooltipProvider } from "../src/ui/tooltipUi.tsx";
import { SuccessToastProvider } from "../src/ui/feedbackUi.tsx";
import { CatalogPreview, DEMO_GROUPS, NOTE_CASE_TITLES, NoteCaseDemo, StudyDemo, type CatalogCardKind, type CatalogSectionId } from "./uiCatalogDemos.tsx";

export interface CatalogData {
  components: { name: string; file: string; group: string; usage: number; usedIn: string[] }[];
  tokens: { name: string; light: string; dark: string; touch?: string; category: string }[];
  typography: { name: string; declarations: string }[];
  cssClasses: { name: string; files: string[] }[];
  icons: { name: string; svg: string; files: string[] }[];
  sourceHash: string;
}

const data = JSON.parse(document.getElementById("catalog-data")!.textContent!) as CatalogData;
/** Building blocks of the card reference; each demo is either a manual form or a renderer case. */
type BlockDemo = { manual: CatalogCardKind; index?: number; title: string } | { case: string };
const CARD_BLOCKS: { id: string; label: string; description: string; creation: string; demos: BlockDemo[] }[] = [
  { id: "frage-antwort", label: "Frage und Antwort", description: "Eine Frage, eine Antwort, eine Karte. Bilder sind Teil des Rich-Text-Inhalts.", creation: "Erstellen: Fragentyp Standard, Lernrichtung Standard.", demos: [{ manual: "basic", title: "Frage und Antwort" }, { manual: "basic-with-images", title: "Mit Bild im Text" }] },
  { id: "rueckrichtung", label: "Rückrichtung", description: "Vorwärts und rückwärts sind zwei Karten mit eigenem Lernstand aus demselben Inhalt.", creation: "Erstellen und Bearbeiten: Lernrichtung Beide Richtungen.", demos: [{ manual: "basic-reversed", title: "Vorwärts" }, { manual: "basic-reversed", index: 1, title: "Rückwärts · eigene Karte" }] },
  { id: "eintippen", label: "Antwort eintippen", description: "Die Antwort wird eingetippt und Zeichen für Zeichen mit der Rückseite verglichen.", creation: "Baustein Antwort eintippen.", demos: [{ case: "typed" }] },
  { id: "feldrollen", label: "Feldrollen", description: "Zusatzfrage, aufklappbarer Hinweis, Zusatz und Quelle nach der Antwort; Notizen erscheinen nur im Editor.", creation: "Bausteine Zusatzfrage, Hinweis, Zusatz und Quelle.", demos: [{ case: "roles" }] },
  { id: "lueckentext", label: "Lückentext", description: "Jede Lückengruppe ist eine eigene Karte; Lücken dürfen mehrere Nummern, Hinweise und Verschachtelung tragen.", creation: "Text markieren und in der Toolbar Lücke wählen.", demos: [{ manual: "cloze", title: "Eine Lücke" }, { case: "cloze" }, { case: "nested" }, { case: "cloze-math" }] },
  { id: "auswahl", label: "Auswahl", description: "Single Choice, Multiple Choice und Kprim sind Antwortformate eines Inhalts mit genau einer Karte.", creation: "Fragentyp Single Choice oder Multiple Choice; Kprim entsteht aus Anki-Importen.", demos: [{ manual: "single-choice", title: "Single Choice" }, { manual: "multiple-choice", title: "Multiple Choice" }, { case: "kprim" }, { case: "choice-rich" }] },
  { id: "bildverdeckung", label: "Bildverdeckung", description: "Masken verdecken Bereiche eines Bildes; jede Maskengruppe ist eine eigene Karte.", creation: "Erstellen: Fragentyp Bildverdeckung; Masken zeichnen und gruppieren.", demos: [{ case: "occlusion-all" }, { case: "occlusion-one" }] },
  { id: "originallayout", label: "Originallayout", description: "Importierte Karten aus eigenen Stapeldesigns zeigen Template und CSS ihres Autors ohne Script; die Bedienung um die Karte bleibt CoRe. Beim Aufdecken wechselt die Karte auf ihre Rückseite.", creation: "Nur über den Anki-Import, automatisch je Vorlage; kein Schalter.", demos: [{ case: "original-layout" }] },
  { id: "formeln-medien", label: "Formeln, Medien und Vorlesen", description: "Formeln, Tabellen, Audio, Video, System-Vorlesen und die AMBOSS-Textauswahl funktionieren in jedem Baustein.", creation: "Formeln über Auswahl als Formel setzen; Medien über die Toolbar oder Einfügen.", demos: [{ case: "math" }, { case: "rich-media" }, { case: "speech" }] },
];

/** Catalog chapters; the navigation labels follow the shared catalog structure. */
export const CATALOG_SECTIONS: { id: CatalogSectionId; nav: string; title: string }[] = [
  { id: "grundlagen", nav: "Grundlagen", title: "Grundlagen" },
  { id: "primitive", nav: "Grundbausteine", title: "Grundbausteine" },
  { id: "shared", nav: "App-Muster", title: "App-Muster" },
  { id: "fachmuster", nav: "Fachmuster", title: "Fachmuster" },
  { id: "icons", nav: "Icons", title: "Icons und Illustrationen" },
  { id: "inventar", nav: "Inventar", title: "Inventar" },
];

interface CatalogCard { id: string; section: CatalogSectionId; title: string; search: string; source?: string; wide?: boolean; render: () => React.ReactNode }

const NEUTRAL_ROLES = [["canvas", "--core-canvas"], ["surface", "--core-surface"], ["muted", "--core-surface-muted"], ["hover", "--core-surface-hover"], ["border", "--core-border"], ["border-strong", "--core-border-interactive"], ["muted-fg", "--core-text-muted"], ["secondary-fg", "--core-text-secondary"], ["foreground", "--core-text"]];
const ACCENT_ROLES = [["primary", "--core-action-primary", "--core-action-soft"], ["info", "--core-info", "--core-info-surface"], ["success", "--core-success", "--core-success-surface"], ["warning", "--core-warning", "--core-warning-surface"], ["danger", "--core-danger", "--core-danger-surface"], ["selection", "--core-selection", "--core-selection-track"]];
const PALETTE = data.tokens.filter((token) => token.name.startsWith("--core-brand-"));
/** Demo groups shown on the card reference instead of the UI catalog. */
const CARD_GROUPS = DEMO_GROUPS.filter((group) => group.section === "karten");

function Usage({ count, files }: { count: number; files: string[] }) {
  return <Disclosure summary={`${count} Verwendung${count === 1 ? "" : "en"} · ${files.length} Datei${files.length === 1 ? "" : "en"}`}><ul>{files.map((file) => <li key={file}><code>{file}</code></li>)}</ul></Disclosure>;
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
    <p className="catalog-label">ToolBox-Markenpalette</p>
    <div className="catalog-accents">{PALETTE.map((token) => <div key={token.name}><i style={{ background: `var(${token.name})` }} /><strong>{token.name.replace("--core-brand-", "")}</strong><span className="catalog-meta">{token.light}</span></div>)}</div>
  </>;
}

function Radii() {
  return <div className="catalog-shape-row">{data.tokens.filter((token) => token.category === "Radius").map((token) => <figure key={token.name}><span style={{ borderRadius: `var(${token.name})` }} /><figcaption className="catalog-meta"><span>{token.name.replace("--core-radius-", "")}</span><span>{token.light}</span></figcaption></figure>)}</div>;
}

function Shadows() {
  return <div className="catalog-shape-row">{data.tokens.filter((token) => token.category === "Schatten" && !token.name.includes("selection")).map((token) => <figure key={token.name}><span style={{ boxShadow: `var(${token.name})` }} /><figcaption className="catalog-meta">{token.name.replace("--core-shadow-", "")}</figcaption></figure>)}</div>;
}

function Spacing() {
  return <ul className="catalog-spacing">{data.tokens.filter((token) => token.name.startsWith("--core-space-")).sort((a, b) => parseFloat(a.light) - parseFloat(b.light)).map((token) => <li key={token.name}><span className="catalog-meta">{token.name.replace("--core-space-", "")} · {token.light}</span><i style={{ width: `var(${token.name})` }} /></li>)}</ul>;
}

/** Control heights for mouse and touch (`pointer: coarse`); the pointer is their only split. */
function ControlHeights() {
  return <ul className="catalog-heights"><li className="catalog-meta"><span /><span>Maus</span><span>Touch</span></li>{data.tokens.filter((token) => token.touch).map((token) => <li key={token.name}><span className="catalog-meta"><span>{token.name.replace("--core-", "")}</span><span>{token.light} | {token.touch}</span></span><i style={{ height: token.light }} /><i style={{ height: token.touch }} /></li>)}</ul>;
}

function AllTokens() {
  const categories = [...new Set(data.tokens.map((token) => token.category))];
  return <Disclosure summary={`Alle ${data.tokens.length} Design-Tokens mit Light- und Dark-Wert`}>{categories.map((category) => <div key={category}><p className="catalog-label">{category}</p><div className="catalog-token-grid">{data.tokens.filter((token) => token.category === category).map((token) => <article className="catalog-token" key={token.name}>{category === "Farbe" ? <div className="catalog-swatch" style={{ background: `var(${token.name})` }} /> : null}<code>{token.name}</code><small>Light: {token.light}</small><small>Dark: {token.dark}</small>{token.touch ? <small>Touch: {token.touch}</small> : null}</article>)}</div></div>)}</Disclosure>;
}

function ComponentInventory() {
  const titles = new Map<string, string>(DEMO_GROUPS.map((group) => [group.id, group.title]));
  const cardGroups = new Set<string>(CARD_GROUPS.map((group) => group.id));
  return <Disclosure summary={`${data.components.length} gemeinsame Komponenten mit Herkunft und Verwendung`}><div className="catalog-table-scroll"><table className="catalog-inventory"><thead><tr><th>Komponente</th><th>Karte</th><th>Verwendet</th><th>Definiert in</th></tr></thead><tbody>{data.components.map((component) => <tr key={component.name}><td><code>{component.name}</code></td><td><a href={`${cardGroups.has(component.group) ? "card-types.html" : ""}#${component.group}`}>{titles.get(component.group)}</a></td><td><Usage count={component.usage} files={component.usedIn} /></td><td><code>{component.file}</code></td></tr>)}</tbody></table></div></Disclosure>;
}

function ClassInventory() {
  return <Disclosure summary={`${data.cssClasses.length} eigene core-Klassen einschließlich lokaler Screen-Muster`}><div className="catalog-table-scroll"><table className="catalog-inventory"><thead><tr><th>Klasse</th><th>Verwendet in</th></tr></thead><tbody>{data.cssClasses.map((entry) => <tr key={entry.name}><td><code>.{entry.name}</code></td><td><Usage count={entry.files.length} files={entry.files} /></td></tr>)}</tbody></table></div></Disclosure>;
}

function LucideInventory() {
  return <ul className="catalog-icon-grid">{data.icons.map((icon) => <li key={icon.name} title={icon.files.join("\n")}><span dangerouslySetInnerHTML={{ __html: icon.svg }} /><code>{icon.name}</code><small>{icon.files.length}</small></li>)}</ul>;
}

const CARDS: CatalogCard[] = [
  { id: "farbrollen", section: "grundlagen", title: "Farbrollen", search: "Farbe Palette Token", source: "src/styles.css", wide: true, render: ColorRoles },
  { id: "typografie", section: "grundlagen", title: "Typografierollen", wide: true, search: `Typografie Schrift Manrope ${data.typography.map((rule) => rule.name).join(" ")}`, source: "src/styles.css", render: () => <>{data.typography.map((rule) => <TypeSpecimen key={rule.name} name={rule.name} />)}</> },
  { id: "radien", section: "grundlagen", title: "Radien", search: "Radius Ecken", source: "src/styles.css", render: Radii },
  { id: "schatten", section: "grundlagen", title: "Schatten", search: "Schatten Ebene", source: "src/styles.css", render: Shadows },
  { id: "abstaende", section: "grundlagen", title: "Abstände", search: "Abstand Spacing", source: "src/styles.css", render: Spacing },
  { id: "bedienhoehe", section: "grundlagen", title: "Bedienhöhe", search: "Bedienhöhe Maus Touch pointer coarse Höhe", source: "src/styles.css", render: ControlHeights },
  { id: "tokens", section: "inventar", title: "Design-Tokens", search: `Token ${data.tokens.map((token) => token.name).join(" ")}`, source: "src/styles.css", wide: true, render: AllTokens },
  { id: "komponenten", section: "inventar", title: "Komponenteninventar", search: `Komponenten Inventar ${data.components.map((component) => component.name).join(" ")}`, wide: true, render: ComponentInventory },
  { id: "klassen", section: "inventar", title: "Eigene CSS-Klassen", search: `CSS Klassen ${data.cssClasses.map((entry) => entry.name).join(" ")}`, source: "src/styles.css", wide: true, render: ClassInventory },
  ...DEMO_GROUPS.filter((group) => group.section !== "karten").map((group): CatalogCard => {
    const components = data.components.filter((component) => component.group === group.id);
    const GroupDemo = group.render;
    return {
      id: group.id,
      section: group.section,
      title: group.title,
      wide: "wide" in group ? group.wide : false,
      search: [group.title, group.description, ...components.map((component) => component.name)].join(" "),
      source: [...new Set(components.map((component) => component.file))].join(" "),
      render: () => <div className="catalog-demo-grid"><GroupDemo /></div>,
    };
  }),
  { id: "lucide", section: "inventar", title: "Lucide-Icons", search: `Icons Lucide ${data.icons.map((icon) => icon.name).join(" ")}`, wide: true, render: LucideInventory },
];

/** Marks the chapter whose heading was scrolled past last. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const passed = ids.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) < 64);
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

/** Normalized query of the search field in the shared docs sidebar. */
function useDocsSearch() {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const input = document.getElementById("docs-search") as HTMLInputElement;
    const update = () => setQuery(input.value.trim().toLocaleLowerCase("de"));
    update();
    input.addEventListener("input", update);
    return () => input.removeEventListener("input", update);
  }, []);
  return query;
}

function CatalogFrame({ title, navigation, footer, children }: { title: string; navigation: { id: string; label: string; depth?: number }[]; footer: React.ReactNode; children: React.ReactNode }) {
  const ids = React.useMemo(() => navigation.map((item) => item.id), [navigation]);
  const active = useActiveSection(ids);
  return <div className="catalog">
    {createPortal(navigation.map((item) => <a key={item.id} href={`#${item.id}`} data-depth={item.depth} aria-current={item.id === active ? "location" : undefined}>{item.label}</a>), document.getElementById("docs-toc")!)}
    <h1 className="core-heading-1 catalog-title">{title}</h1>
    {children}
    <footer className="catalog-footer">{footer}</footer>
  </div>;
}

function Catalog() {
  const query = useDocsSearch();
  const visible = React.useMemo(() => CARDS.filter((card) => !query || `${card.title} ${card.search}`.toLocaleLowerCase("de").includes(query)), [query]);
  const navigation = React.useMemo(() => CATALOG_SECTIONS.flatMap((section) => {
    const cards = visible.filter((card) => card.section === section.id);
    return cards.length ? [{ id: section.id, label: section.nav }, ...cards.map((card) => ({ id: card.id, label: card.title, depth: 3 }))] : [];
  }), [visible]);
  return <CoreTooltipProvider><SuccessToastProvider><CatalogFrame
    title="UI-Elements"
    navigation={navigation}
    footer={<>UI-Elements · {data.components.length} Komponenten · {data.tokens.length} Tokens · {data.icons.length} Icons · Quellenstand <code>{data.sourceHash}</code></>}
  >
    {visible.length === 0 ? <p className="catalog-empty" role="status">Keine Katalogeinträge passen zur Suche.</p> : null}
    {CATALOG_SECTIONS.map((section) => {
      const cards = visible.filter((card) => card.section === section.id);
      if (!cards.length) return null;
      return <section key={section.id} id={section.id} className="catalog-section">
        <div className="catalog-section-heading"><h2>{section.title}</h2></div>
        <div className="catalog-grid">{cards.map((card) => <article key={card.id} id={card.id} className={`catalog-card${card.wide ? " catalog-card-wide" : ""}`} data-source={card.source || undefined}>
          <div className="catalog-card-header"><h3>{card.title}</h3></div>
          <div className="catalog-preview">{card.render()}</div>
        </article>)}</div>
      </section>;
    })}
  </CatalogFrame></SuccessToastProvider></CoreTooltipProvider>;
}

function CardBlocks() {
  const query = useDocsSearch();
  const visible = CARD_BLOCKS.filter((block) => !query || [block.label, block.description, block.creation, ...block.demos.map((demo) => "case" in demo ? NOTE_CASE_TITLES[demo.case] : demo.title)].join(" ").toLocaleLowerCase("de").includes(query));
  const visibleGroups = CARD_GROUPS.filter((group) => !query || `${group.title} ${group.description}`.toLocaleLowerCase("de").includes(query));
  return <CoreTooltipProvider><SuccessToastProvider><CatalogFrame
    title="Kartenbausteine"
    navigation={[...CARD_BLOCKS.map((block) => ({ id: block.id, label: block.label })), ...CARD_GROUPS.map((group) => ({ id: group.id, label: group.title }))]}
    footer={<>Alle Komponenten der Oberfläche zeigt <a href="ui-elements.html">UI-Elements</a>.</>}
  >
    {visible.length === 0 && !visibleGroups.length ? <p className="catalog-empty" role="status">Keine Kartenbausteine passen zur Suche.</p> : null}
    {visible.map((block) => <section key={block.id} id={block.id} className="catalog-section">
      <div className="catalog-section-heading"><h2>{block.label}</h2><p>{block.description} {block.creation}</p></div>
      <div className="catalog-grid">{block.demos.map((demo) => "case" in demo
        ? <article key={demo.case} className="catalog-card catalog-card-wide"><div className="catalog-card-header"><h3>{NOTE_CASE_TITLES[demo.case]}</h3></div><div className="catalog-preview"><NoteCaseDemo id={demo.case} /></div></article>
        : <article key={`${demo.manual}-${demo.index ?? 0}`} className="catalog-card"><div className="catalog-card-header"><h3>{demo.title}</h3></div><div className="catalog-preview"><StudyDemo kind={demo.manual} index={demo.index} /></div></article>)}</div>
    </section>)}
    {visibleGroups.map((group) => <section key={group.id} id={group.id} className="catalog-section">
      <div className="catalog-section-heading"><h2>{group.title}</h2><p>{group.description}</p></div>
      <div className="catalog-demo-grid"><group.render /></div>
    </section>)}
  </CatalogFrame></SuccessToastProvider></CoreTooltipProvider>;
}

const preview = new URLSearchParams(window.location.search).get("preview");
createRoot(document.getElementById("catalog-root")!).render(preview
  ? <CoreTooltipProvider><SuccessToastProvider><CatalogPreview kind={preview} /></SuccessToastProvider></CoreTooltipProvider>
  : document.body.dataset.catalog === "cards" ? <CardBlocks /> : <Catalog />);
