import React from "react";
import { ArrowLeft, Check, ChevronRight, Copy, Plus, RotateCcw, X } from "lucide-react";
import { cardSearchFieldTerms, cardSearchTermState, withCardSearchTermState } from "../../cardSearchQuery.ts";
import { fieldSearchKey } from "../../coreModel.ts";
import { ActionButton, IconButton } from "../../ui/actionUi.tsx";
import { CoreTriStateControl } from "../../ui/coreUi.tsx";
import { FlagDot } from "../../ui/flagUi.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import type { CardSearchMenuCategory, CardSearchMenuItem } from "./cardSearchMenu.ts";

const SYNTAX: ReadonlyArray<[string, string]> = [
  ["nacken", "Text in allen Feldern, Antwortoptionen und Tags"],
  ["-kopf", "schließt den Begriff aus"],
  ["ursprung:scaleni", "nur im Feld „Ursprung“, Leerzeichen im Feldnamen als _"],
  ["did:…", "Stapel samt Unterstapeln (über den Stapelfilter)"],
  ["tag:anatomie", "Tag samt Untertags; tag:none ohne Tags"],
  ["flag:1", "Flagge 1 bis 7; flag:0 ohne Flagge"],
  ["is:new  is:learn  is:young  is:mature", "Lernstand"],
  ["is:due  is:suspended", "heute fällig, ausgesetzt"],
  ["prop:due<0  prop:due=1", "überfällig, morgen fällig (Tage ab heute)"],
  ["tag:leech  tag:marked  has:variant", "Lernbremse, markiert, mit Variante"],
];

function TermRow({ item, query, onQueryChange }: { item: CardSearchMenuItem; query: string; onQueryChange: (query: string) => void }) {
  const state = cardSearchTermState(query, item.term);
  return (
    <li className="grid min-h-[2.875rem] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-core-border py-1 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]" style={item.depth ? { paddingLeft: item.depth * 20 } : undefined}>
      <span className={`flex min-w-0 items-center gap-2 core-body ${state === "in" ? "font-semibold text-core-action" : state === "out" ? "text-core-danger-text" : "text-core-text"}`}>
        {item.flag ? <FlagDot flag={item.flag} size={10} /> : null}
        <span className="grid min-w-0">
          <span className={`truncate ${state === "out" ? "line-through" : ""}`}>{item.label}</span>
          {item.hideTerm ? null : <code className="truncate font-mono core-caption font-normal text-core-muted sm:hidden">{item.term}</code>}
        </span>
      </span>
      {item.hideTerm ? <span className="max-sm:hidden" /> : <code className="hidden max-w-[14rem] truncate font-mono core-caption text-core-muted sm:block">{item.term}</code>}
      <CoreTriStateControl label={item.label} value={state} onValueChange={(next) => onQueryChange(withCardSearchTermState(query, item.term, next))} />
    </li>
  );
}

function FieldTerms({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const [field, setField] = React.useState("");
  const [text, setText] = React.useState("");
  const fieldTerms = cardSearchFieldTerms(query);
  const name = fieldSearchKey(field);
  const value = text.trim().split(/\s+/)[0] ?? "";
  return (
    <div className="grid min-w-0 gap-3">
      <form
        className="flex min-w-0 flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name || !value) return;
          onQueryChange(withCardSearchTermState(query, `${name}:${value}`, "in"));
          setText("");
        }}
      >
        <label className="grid min-w-0 flex-1 basis-32 gap-1">
          <span className="core-field-label">Feld</span>
          <input className="core-field" value={field} onChange={(event) => setField(event.target.value)} placeholder="Rückseite" />
        </label>
        <label className="grid min-w-0 flex-[2] basis-40 gap-1">
          <span className="core-field-label">Text</span>
          <input className="core-field" value={text} onChange={(event) => setText(event.target.value)} placeholder="Wort im Feld" />
        </label>
        <ActionButton type="submit" variant="secondary" icon={Plus} disabled={!name || !value}>Hinzufügen</ActionButton>
      </form>
      {fieldTerms.length ? (
        <ul className="grid min-w-0">
          {fieldTerms.map((term) => {
            const bare = term.replace(/^-/, "");
            return <TermRow key={bare} item={{ label: bare.replace(":", ": "), term: bare }} query={query} onQueryChange={onQueryChange} />;
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SyntaxHelp() {
  return (
    <div className="grid min-w-0 gap-3">
      <p className="core-body text-core-secondary">
        Eine Karte erscheint nur, wenn alle Begriffe zutreffen.
        Jede Zeile filtert mit, ohne oder egal; Begriffe im Suchfeld wirken genauso und erscheinen als Filter.
      </p>
      <table className="w-full table-fixed border-collapse core-body">
        <tbody>
          {SYNTAX.map(([term, meaning]) => (
            <tr key={term} className="border-t border-core-border">
              <td className="w-[45%] py-2 pr-3 align-top"><code className="break-words font-mono core-caption text-core-text">{term}</code></td>
              <td className="py-2 align-top text-core-secondary">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The advanced search (KV2): categories on the left, the rows of the chosen category with their term and a
 * three-position switch on the right, above them the whole search expression. Below 768 px a full screen sheet
 * that shows the category list first.
 */
export function AdvancedCardSearch({ id, query, onQueryChange, categories, resultCount, onClose }: {
  id: string;
  query: string;
  onQueryChange: (query: string) => void;
  categories: readonly CardSearchMenuCategory[];
  resultCount: number | null;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = React.useState<CardSearchMenuCategory["id"]>("heute");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const active = categories.find((category) => category.id === activeId) ?? categories[0];
  const activeCount = (category: CardSearchMenuCategory) => category.items.filter((item) => cardSearchTermState(query, item.term)).length
    + (category.id === "felder" ? cardSearchFieldTerms(query).length : 0);
  const expression = query.trim();

  return (
    <section
      id={id}
      aria-label="Erweiterte Suche"
      className="grid min-w-0 gap-4 rounded-panel border border-core-border bg-core-surface p-4 md:p-5 max-md:fixed max-md:inset-0 max-md:z-50 max-md:content-start max-md:overflow-y-auto max-md:rounded-none max-md:border-0 max-md:pb-28"
      data-testid="advanced-card-search"
    >
      <div className="flex min-h-11 items-center gap-1 md:hidden">
        {mobileOpen ? <IconButton icon={ArrowLeft} variant="ghost" label="Zurück zu den Kategorien" onClick={() => setMobileOpen(false)} /> : null}
        <h2 className="min-w-0 flex-1 truncate core-heading-2 text-core-text">{mobileOpen ? active.label : "Erweiterte Suche"}</h2>
        <IconButton icon={X} variant="ghost" label="Erweiterte Suche schließen" onClick={onClose} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex min-h-control min-w-0 flex-1 basis-64 items-center gap-1 rounded-control border border-core-border bg-core-canvas py-0.5 pl-3" data-testid="card-search-expression">
          <code className="min-w-0 flex-1 break-words py-1.5 font-mono core-caption text-core-text">{expression || "—"}</code>
          <CoreTooltip label={copied ? "Kopiert" : "Suchausdruck kopieren"}>
            <IconButton icon={copied ? Check : Copy} variant="ghost" label="Suchausdruck kopieren" disabled={!expression} onClick={() => {
              void navigator.clipboard?.writeText(expression).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }} />
          </CoreTooltip>
        </div>
        <ActionButton type="button" variant="secondary" icon={RotateCcw} disabled={!expression} className="max-md:hidden" onClick={() => onQueryChange("")}>Zurücksetzen</ActionButton>
      </div>
      <div className="grid min-w-0 items-start gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Filterkategorien" className={`min-w-0 ${mobileOpen ? "max-md:hidden" : ""}`}>
          <ul className="grid min-w-0">
            {categories.map((category, index) => {
              const Icon = category.icon;
              const selected = category.id === active.id;
              const count = activeCount(category);
              return (
                <li key={category.id} className={`min-w-0 md:border-l md:border-core-border ${index === categories.length - 1 ? "mt-2 border-t border-core-border pt-2" : ""}`}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => { setActiveId(category.id); setMobileOpen(true); }}
                    className={`flex min-h-12 w-full min-w-0 items-center gap-3 px-1 text-left core-body transition-colors md:-ml-px md:min-h-control md:rounded-r-control md:border-l-strong md:px-3 md:py-2 ${selected ? "md:border-core-action md:bg-core-subtle md:font-semibold md:text-core-action" : "font-medium text-core-secondary md:border-transparent hover:bg-core-subtle hover:text-core-text"}`}
                  >
                    <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{category.label}</span>
                    {count ? <span className="grid min-h-5 min-w-5 place-items-center rounded-round bg-core-action px-1 core-caption font-bold text-core-on-accent" aria-label={`${count} aktiv`}>{count}</span> : null}
                    <ChevronRight className="size-4 shrink-0 text-core-muted md:hidden" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={`min-w-0 ${mobileOpen ? "" : "max-md:hidden"}`} data-testid={`advanced-card-search-${active.id}`}>
          {active.id === "syntax" ? <SyntaxHelp />
            : active.id === "felder" ? <FieldTerms query={query} onQueryChange={onQueryChange} />
              : active.items.length ? (
                <ul className={`grid min-w-0 ${active.id === "stapel" || active.id === "tags" ? "max-h-[28rem] overflow-y-auto pr-1" : ""}`}>
                  {active.items.map((item) => <TermRow key={item.term} item={item} query={query} onQueryChange={onQueryChange} />)}
                </ul>
              ) : <p className="core-body text-core-muted">Keine Einträge</p>}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-core-border bg-core-surface px-4 py-3 md:hidden">
        <IconButton type="button" label="Zurücksetzen" icon={RotateCcw} disabled={!expression} onClick={() => onQueryChange("")} />
        <ActionButton type="button" variant="primary" className="min-w-0 flex-1" onClick={onClose}>
          {resultCount === null ? "Karten anzeigen" : resultCount === 1 ? "1 Karte anzeigen" : `${resultCount} Karten anzeigen`}
        </ActionButton>
      </div>
    </section>
  );
}
