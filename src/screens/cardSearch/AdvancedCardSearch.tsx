import React from "react";
import { BookmarkPlus, Check, ChevronLeft, ChevronRight, Copy, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { cardSearchTermState, cardSearchTerms, cardSearchTermsOfKind, cardSearchText, withCardSearchTermState } from "../../cardSearchQuery.ts";
import { fieldSearchKey } from "../../coreModel.ts";
import type { SavedCardSearch } from "../../coreTypes.ts";
import { SAVED_SEARCH_LIMIT, SAVED_SEARCH_NAME_LENGTH } from "../../uiPreferences.ts";
import { ActionButton, CloseButton, CrossLinkButton, Disclosure, IconButton } from "../../ui/actionUi.tsx";
import { CoreTriStateControl } from "../../ui/coreUi.tsx";
import { StatusMessage, useSuccessToast } from "../../ui/feedbackUi.tsx";
import { FlagDot } from "../../ui/flagUi.tsx";
import { CoreSelect } from "../../ui/selectUi.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import {
  CARD_SEARCH_OPERATORS,
  CARD_SEARCH_PROP_OPTIONS,
  CARD_SEARCH_SINCE_OPTIONS,
  cardSearchConflictMessage,
  cardSearchTermLabel,
  type CardSearchMenuCategory,
  type CardSearchMenuItem,
} from "./cardSearchMenu.ts";

const SYNTAX: ReadonlyArray<[string, string]> = [
  ["nacken hals", "Text in allen Feldern, Antwortoptionen und Tags; jedes Wort muss vorkommen"],
  ["-kopf", "Schließt den Begriff aus"],
  ["\"vena cava\"  deck:\"Anatomie 1\"", "Genau diese Wortfolge; Anführungszeichen auch für Begriffe mit Leerzeichen"],
  ["flag:1 or flag:2", "Einer der beiden genügt; `or` bindet schwächer als das Nebeneinander"],
  ["(herz or lunge)  -(tag:a or tag:b)", "Klammern fassen zusammen; ein Minuszeichen\u00a0`-` davor schließt die ganze Gruppe aus"],
  ["ursprung:scaleni", "Nur im Feld „Ursprung“, Leerzeichen im Feldnamen als Unterstrich\u00a0`_`"],
  ["did:<Stapel-ID>", "Stapel samt Unterstapeln über seine ID; setzt der Stapelfilter"],
  ["tag:anatomie", "Tag samt Untertags; `tag:none` ohne Tags"],
  ["flag:1", "Flagge 1 bis 7; `flag:0` ohne Flagge"],
  ["is:new  is:learn  is:young  is:mature", "Lernstand"],
  ["is:due  is:suspended", "Heute fällig, ausgesetzt"],
  ["prop:due<0  prop:due=1", "Überfällig, morgen fällig (Tage ab heute)"],
  ["tag:leech  tag:marked  has:variant", "Lernbremse, markiert, mit Variante"],
  ["deck:Biologie  deck:*zell*", "Stapel nach Pfad (`A::B`) samt Unterstapeln; `*` beliebig, Unterstrich\u00a0`_` ein Zeichen"],
  ["rated:7  rated:7:1", "In den letzten 7 Tagen gelernt, davon mit Nochmal (2 Schwer, 3 Gut, 4 Leicht)"],
  ["added:1  edited:1  introduced:1  resched:1", "Heute hinzugefügt, bearbeitet, erstmals gelernt, neu geplant"],
  ["prop:ivl>=21  prop:d>7  prop:reps=0  prop:lapses>3", "Intervall in Tagen, Schwierigkeit 1 bis 10, Wiederholungen, Fehler; auch `<`, `<=`, `=`, `!=`"],
  ["prop:s>=90", "Haltbarkeit in Tagen; zählt ab der nächsten Antwort einer Karte"],
  ["is:reveal  is:choice  is:cloze  is:occlusion", "Frage–Antwort, Auswahl, Lückentext, Bildverdeckung"],
  ["note:Basic  has:outdated", "Anki-Notiztyp (wie `deck:` mit `*` und Unterstrich\u00a0`_`), Karten mit veralteter Variante"],
  ["is:unrephrasable", "Karten, für die keine Variante entsteht"],
  ["card:2  is:buried", "Zweite Abfrage (Vorlage, Lücke oder Maske), heute manuell zurückgestellt"],
  ["is:duplicate", "Inhalte mit gleicher Vorderseite im ganzen Konto, nebeneinander; Groß- und Kleinschreibung und Abstände zählen nicht"],
];

const WRITTEN_KINDS = { felder: "field", zeitraum: "since", werte: "prop" } as const;
type WrittenCategory = keyof typeof WRITTEN_KINDS;

/** `siblings` are the terms of its group: several included ones need only one to match. */
function TermRow({ item, query, onQueryChange, siblings }: { item: CardSearchMenuItem; query: string; onQueryChange: (query: string) => void; siblings?: readonly string[] }) {
  const state = cardSearchTermState(query, item.term);
  return (
    <li className={`core-card-search-term grid min-h-10 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-core-border py-0.5 pl-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${state ? "bg-core-subtle" : ""}`} style={item.depth ? { paddingLeft: 8 + item.depth * 20 } : undefined}>
      <span className={`flex min-w-0 items-center gap-2 core-body ${state === "in" ? "font-semibold text-core-text" : state === "out" ? "text-core-danger-text" : "text-core-text"}`}>
        {item.flag ? <FlagDot flag={item.flag} size={10} /> : null}
        <span className="grid min-w-0">
          <span className={`truncate ${state === "out" ? "line-through" : ""}`}>{item.label}</span>
          {item.hideTerm ? null : <code className="truncate font-mono core-caption font-normal text-core-muted sm:hidden">{item.term}</code>}
        </span>
      </span>
      {item.hideTerm ? <span className="max-sm:hidden" /> : <code className="hidden max-w-[14rem] truncate font-mono core-body text-core-muted sm:block">{item.term}</code>}
      <CoreTriStateControl label={item.label} description={item.description} value={state} onValueChange={(next) => onQueryChange(withCardSearchTermState(query, item.term, next, siblings))} />
    </li>
  );
}

function writtenTerms(query: string, category: WrittenCategory, categories: readonly CardSearchMenuCategory[]): string[] {
  const fixed = new Set(categories.flatMap((entry) => entry.items.map((item) => item.term.toLocaleLowerCase("und"))));
  return cardSearchTermsOfKind(query, WRITTEN_KINDS[category]).filter((term) => !fixed.has(term.replace(/^-/, "").toLocaleLowerCase("und")));
}

function TermForm({ terms, label, query, onQueryChange, term, children }: {
  terms: string[];
  label: (bare: string) => string;
  query: string;
  onQueryChange: (query: string) => void;
  /** The term the form would add, null while incomplete. */
  term: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <form
        className="flex min-w-0 flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (term) onQueryChange(withCardSearchTermState(query, term, "in"));
        }}
      >
        {children}
        <ActionButton type="submit" variant="secondary" icon={Plus} disabled={!term}>Hinzufügen</ActionButton>
      </form>
      {terms.length ? (
        <ul className="-ml-2 grid min-w-0">
          {terms.map((written) => {
            const bare = written.replace(/^-/, "");
            return <TermRow key={bare} item={{ label: label(bare), description: "passende Karten", term: bare }} query={query} onQueryChange={onQueryChange} />;
          })}
        </ul>
      ) : null}
    </div>
  );
}

function FieldTerms({ terms, query, onQueryChange }: { terms: string[]; query: string; onQueryChange: (query: string) => void }) {
  const [field, setField] = React.useState("");
  const [text, setText] = React.useState("");
  const name = fieldSearchKey(field);
  const value = text.trim().split(/\s+/)[0] ?? "";
  return (
    <TermForm terms={terms} label={(bare) => bare.replace(/:(.*)$/, " enthält „$1“")} query={query} onQueryChange={(next) => { onQueryChange(next); setText(""); }} term={name && value ? `${name}:${value}` : null}>
      <label className="grid min-w-0 flex-1 basis-32 gap-1">
        <span className="core-field-label">Feld</span>
        <input className="core-field" value={field} onChange={(event) => setField(event.target.value)} placeholder="Rückseite" />
      </label>
      <label className="grid min-w-0 flex-[2] basis-40 gap-1">
        <span className="core-field-label">Text</span>
        <input className="core-field" value={text} onChange={(event) => setText(event.target.value)} placeholder="Wort im Feld" />
      </label>
    </TermForm>
  );
}

function SinceTerms({ terms, query, onQueryChange, categories }: { terms: string[]; query: string; onQueryChange: (query: string) => void; categories: readonly CardSearchMenuCategory[] }) {
  const [kind, setKind] = React.useState<string>(CARD_SEARCH_SINCE_OPTIONS[0].value);
  const [days, setDays] = React.useState("7");
  const option = CARD_SEARCH_SINCE_OPTIONS.find((candidate) => candidate.value === kind)!;
  const count = Number(days);
  return (
    <TermForm terms={terms} label={(bare) => cardSearchTermLabel(bare, categories).label} query={query} onQueryChange={onQueryChange} term={Number.isInteger(count) && count >= 1 && count <= 9999 ? option.term(count) : null}>
      <div className="grid min-w-0 flex-[2] basis-44 gap-1">
        <span className="core-field-label">Was</span>
        <CoreSelect ariaLabel="Was" value={kind} onValueChange={setKind} options={CARD_SEARCH_SINCE_OPTIONS} className="w-full" />
      </div>
      <label className="grid min-w-0 flex-1 basis-28 gap-1">
        <span className="core-field-label">Letzte Tage</span>
        <input className="core-field" type="number" inputMode="numeric" min={1} max={9999} value={days} onChange={(event) => setDays(event.target.value)} />
      </label>
    </TermForm>
  );
}

function PropTerms({ terms, query, onQueryChange, categories }: { terms: string[]; query: string; onQueryChange: (query: string) => void; categories: readonly CardSearchMenuCategory[] }) {
  const [field, setField] = React.useState<string>(CARD_SEARCH_PROP_OPTIONS[0].value);
  const [operator, setOperator] = React.useState<string>(">=");
  const [value, setValue] = React.useState("21");
  const number = value.trim().replace(",", ".");
  return (
    <TermForm terms={terms} label={(bare) => cardSearchTermLabel(bare, categories).label} query={query} onQueryChange={onQueryChange} term={/^\d{1,5}(\.\d+)?$/.test(number) ? `prop:${field}${operator}${number}` : null}>
      <div className="grid min-w-0 flex-[2] basis-40 gap-1">
        <span className="core-field-label">Wert</span>
        <CoreSelect ariaLabel="Wert" value={field} onValueChange={setField} options={CARD_SEARCH_PROP_OPTIONS} className="w-full" />
      </div>
      <div className="grid min-w-0 basis-20 gap-1">
        <span className="core-field-label">Vergleich</span>
        <CoreSelect ariaLabel="Vergleich" value={operator} onValueChange={setOperator} options={CARD_SEARCH_OPERATORS} className="w-full" />
      </div>
      <label className="grid min-w-0 flex-1 basis-24 gap-1">
        <span className="core-field-label">Zahl</span>
        <input className="core-field" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
    </TermForm>
  );
}

export function suggestedSearchName(query: string, categories: readonly CardSearchMenuCategory[]): string {
  const filters = cardSearchTerms(query).map((term) => {
    const { label, negated } = cardSearchTermLabel(term, categories);
    return negated ? `ohne ${label}` : label;
  });
  return [...filters, cardSearchText(query)].filter(Boolean).join(", ").slice(0, SAVED_SEARCH_NAME_LENGTH);
}

function NameForm({ initialName, label, submitLabel, onSubmit, onCancel }: {
  initialName: string;
  label: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  return (
    <form
      className="flex min-w-0 items-center gap-2 py-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <input className="core-field min-w-0 flex-1" value={name} maxLength={SAVED_SEARCH_NAME_LENGTH} aria-label={label} autoFocus onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} />
      <ActionButton type="submit" variant="secondary" icon={Check} disabled={!name.trim()} className="max-sm:hidden">{submitLabel}</ActionButton>
      <IconButton type="submit" label={submitLabel} icon={Check} disabled={!name.trim()} className="sm:hidden" />
      <IconButton type="button" label="Abbrechen" icon={X} variant="ghost" onClick={onCancel} />
    </form>
  );
}

function SavedSearches({ query, onQueryChange, searches, onSearchesChange, draftName, onDraftDone }: {
  query: string;
  onQueryChange: (query: string) => void;
  searches: readonly SavedCardSearch[];
  onSearchesChange: (searches: SavedCardSearch[]) => void;
  /** Name for a new saved search of the current query; null while none is being named. */
  draftName: string | null;
  onDraftDone: () => void;
}) {
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const setToast = useSuccessToast();
  const latest = React.useRef(searches);
  latest.current = searches;
  const expression = query.trim();
  return (
    <section className="grid min-w-0 gap-2" aria-labelledby="saved-searches-heading">
      <h3 id="saved-searches-heading" className="core-body font-semibold text-core-text">Gespeicherte Suchen</h3>
      {draftName !== null ? (
        <NameForm initialName={draftName} label="Name der Suche" submitLabel="Speichern" onCancel={onDraftDone} onSubmit={(name) => {
          onSearchesChange([...latest.current, { id: crypto.randomUUID(), name, query: expression }]);
          onDraftDone();
          setToast(`Suche „${name}“ gespeichert.`);
        }} />
      ) : null}
      {searches.length ? (
        <ul className="grid min-w-0">
          {searches.map((search, index) => (
            <li key={search.id} className="min-w-0 border-b border-core-border last:border-b-0">
              {renamingId === search.id ? (
                <NameForm initialName={search.name} label={`Neuer Name für „${search.name}“`} submitLabel="Umbenennen" onCancel={() => setRenamingId(null)} onSubmit={(name) => {
                  onSearchesChange(latest.current.map((entry) => entry.id === search.id ? { ...entry, name } : entry));
                  setRenamingId(null);
                }} />
              ) : (
                <div className="flex min-h-[2.875rem] min-w-0 items-center gap-1 py-1">
                  <button
                    type="button"
                    aria-current={search.query === expression ? "true" : undefined}
                    className="-ml-1 grid min-w-0 flex-1 rounded-inset px-1 py-1 text-left hover:bg-core-subtle aria-[current=true]:text-core-action"
                    onClick={() => onQueryChange(search.query)}
                  >
                    <span className="truncate core-body font-semibold">{search.name}</span>
                    <code className="truncate font-mono core-body text-core-muted">{search.query}</code>
                  </button>
                  <IconButton type="button" label={`„${search.name}“ umbenennen`} icon={Pencil} variant="ghost" onClick={() => setRenamingId(search.id)} />
                  <IconButton type="button" label={`„${search.name}“ löschen`} icon={Trash2} variant="destructive-quiet" onClick={() => {
                    onSearchesChange(latest.current.filter((entry) => entry.id !== search.id));
                    setToast(`Suche „${search.name}“ gelöscht.`, {
                      appearance: "neutral",
                      action: {
                        label: "Rückgängig",
                        onAction: () => {
                          const next = [...latest.current];
                          next.splice(Math.min(index, next.length), 0, search);
                          onSearchesChange(next);
                        },
                      },
                    });
                  }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : draftName === null ? <p className="core-body text-core-muted">Keine gespeicherten Suchen</p> : null}
    </section>
  );
}

function SyntaxHelp() {
  return (
    <div className="grid min-w-0 gap-3">
      <h3 className="core-body font-semibold text-core-text">Suchsyntax</h3>
      <p className="core-body text-pretty text-core-secondary">
        Eine Karte erscheint nur, wenn alle Begriffe zutreffen.
        Plus zeigt nur passende Karten, Minus blendet sie aus, der Kreis filtert nicht; stehen mehrere Zeilen einer Kategorie auf Plus, genügt eine davon.
        Begriffe im Suchfeld wirken genauso und erscheinen als Filter.
      </p>
      <Disclosure summary="Alle Schreibweisen">
        <dl className="mt-2 grid min-w-0 core-body">
          {SYNTAX.map(([term, meaning]) => (
            <div key={term} className="grid min-w-0 gap-1 border-t border-core-border py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
              <dt><code className="font-mono text-core-text">{term.split("  ").map((part, index) => <React.Fragment key={part}>{index ? " " : null}<span className="whitespace-nowrap">{part}</span></React.Fragment>)}</code></dt>
              <dd className="text-core-secondary">{meaning.split("`").map((part, index) => index % 2 ? <code key={index} className={`rounded-inset bg-core-subtle font-mono font-semibold text-core-text ${part.length === 1 ? "px-1.5" : "px-1"}`}>{part}</code> : part)}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </div>
  );
}

export function AdvancedCardSearch({ id, query, onQueryChange, categories, resultCount, onClose, savedSearches, onSavedSearchesChange, onManageTags }: {
  id: string;
  query: string;
  onQueryChange: (query: string) => void;
  categories: readonly CardSearchMenuCategory[];
  resultCount: number | null;
  onClose: () => void;
  savedSearches: readonly SavedCardSearch[];
  onSavedSearchesChange: (searches: SavedCardSearch[]) => void;
  onManageTags?: () => void;
}) {
  const [activeId, setActiveId] = React.useState<CardSearchMenuCategory["id"]>("heute");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [draftName, setDraftName] = React.useState<string | null>(null);
  const active = categories.find((category) => category.id === activeId) ?? categories[0];
  const activeTerms = active.items.map((item) => item.term);
  const writtenOf = (category: CardSearchMenuCategory) => category.id in WRITTEN_KINDS ? writtenTerms(query, category.id as WrittenCategory, categories) : [];
  const activeCount = (category: CardSearchMenuCategory) => category.items.filter((item) => cardSearchTermState(query, item.term)).length
    + writtenOf(category).length;
  const expression = query.trim();
  const conflict = cardSearchConflictMessage(query, categories);

  return (
    <section
      id={id}
      aria-label="Erweiterte Suche"
      className="grid min-w-0 gap-4 rounded-panel border border-core-border bg-core-surface p-4 md:p-5 max-md:fixed max-md:inset-0 max-md:z-50 max-md:content-start max-md:overflow-y-auto max-md:rounded-none max-md:border-0 max-md:pb-28"
      data-testid="advanced-card-search"
    >
      <div className={`-mr-2 -mt-2 flex min-h-button items-center gap-1 md:hidden ${mobileOpen ? "-ml-2" : ""}`}>
        {mobileOpen ? <IconButton icon={ChevronLeft} variant="ghost" label="Zurück zu den Kategorien" onClick={() => setMobileOpen(false)} /> : null}
        <h2 className="min-w-0 flex-1 truncate core-heading-2 text-core-text">{mobileOpen ? active.label : "Erweiterte Suche"}</h2>
        <CloseButton label="Erweiterte Suche schließen" onClick={onClose} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex min-h-control min-w-0 flex-1 basis-64 items-center gap-1 rounded-control border border-core-border bg-core-canvas py-0.5 pl-3" data-testid="card-search-expression">
          {expression ? <code className="min-w-0 flex-1 break-words py-1.5 font-mono core-body text-core-text">{expression}</code> : <span className="min-w-0 flex-1 py-1.5 core-body text-core-muted">Keine Filter</span>}
          <CoreTooltip label={copied ? "Kopiert" : "Suchausdruck kopieren"}>
            <IconButton icon={copied ? Check : Copy} variant="ghost" label="Suchausdruck kopieren" disabled={!expression} onClick={() => {
              void navigator.clipboard?.writeText(expression).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }} />
          </CoreTooltip>
          <CoreTooltip label={savedSearches.length >= SAVED_SEARCH_LIMIT ? `Höchstens ${SAVED_SEARCH_LIMIT} gespeicherte Suchen` : "Suche speichern"}>
            <IconButton icon={BookmarkPlus} variant="ghost" label="Suche speichern" disabled={!expression || savedSearches.length >= SAVED_SEARCH_LIMIT} onClick={() => {
              setActiveId("syntax");
              setMobileOpen(true);
              setDraftName(suggestedSearchName(query, categories));
            }} />
          </CoreTooltip>
        </div>
        {expression ? <ActionButton type="button" variant="secondary" icon={RotateCcw} className="max-md:hidden" onClick={() => onQueryChange("")}>Zurücksetzen</ActionButton> : null}
      </div>
      {conflict ? <StatusMessage tone="warning" announce="polite" data-testid="card-search-conflict">{conflict}</StatusMessage> : null}
      <div className="grid min-w-0 items-start gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Filterkategorien" className={`min-w-0 ${mobileOpen ? "max-md:hidden" : ""}`}>
          <ul className="grid min-w-0 md:gap-0.5">
            {categories.map((category, index) => {
              const Icon = category.icon;
              const selected = category.id === active.id;
              const count = activeCount(category);
              return (
                <li key={category.id} className={`min-w-0 ${index === categories.length - 1 ? "mt-2 border-t border-core-border pt-2" : ""}`}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => { setActiveId(category.id); setMobileOpen(true); }}
                    className={`flex min-h-12 w-full min-w-0 items-center gap-3 px-1 text-left core-body text-core-text transition-colors hover:bg-core-subtle md:min-h-button md:rounded-control md:px-3 ${selected ? "md:bg-core-subtle md:font-semibold md:text-core-action" : ""}`}
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
          {active.id === "tags" && onManageTags ? (
            <CrossLinkButton className="mb-1" onSelect={onManageTags}>Tags verwalten</CrossLinkButton>
          ) : null}
          {active.id === "syntax" ? (
            <div className="grid min-w-0 max-w-prose gap-6">
              <SavedSearches query={query} onQueryChange={onQueryChange} searches={savedSearches} onSearchesChange={onSavedSearchesChange} draftName={draftName} onDraftDone={() => setDraftName(null)} />
              <SyntaxHelp />
            </div>
          )
            : active.id === "felder" ? <FieldTerms terms={writtenOf(active)} query={query} onQueryChange={onQueryChange} />
            : active.id === "zeitraum" ? <SinceTerms terms={writtenOf(active)} query={query} onQueryChange={onQueryChange} categories={categories} />
            : active.id === "werte" ? <PropTerms terms={writtenOf(active)} query={query} onQueryChange={onQueryChange} categories={categories} />
              : active.items.length ? (
                <ul className={`-ml-2 grid min-w-0 ${active.id === "stapel" || active.id === "tags" || active.id === "inhalt" ? "max-h-[28rem] overflow-y-auto pr-1" : ""}`}>
                  {active.items.map((item) => <TermRow key={item.term} item={item} query={query} onQueryChange={onQueryChange} siblings={activeTerms} />)}
                </ul>
              ) : <p className="core-body text-core-muted">Keine Einträge</p>}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-core-border bg-core-surface px-4 py-3 md:hidden">
        {expression ? <IconButton type="button" label="Zurücksetzen" icon={RotateCcw} onClick={() => onQueryChange("")} /> : null}
        <ActionButton type="button" variant={resultCount === 0 ? "secondary" : "primary"} className="min-w-0 flex-1" onClick={onClose}>
          {resultCount === null ? (expression ? "Karten anzeigen" : "Alle Karten anzeigen") : resultCount === 1 ? "1 Karte anzeigen" : `${resultCount} Karten anzeigen`}
        </ActionButton>
      </div>
    </section>
  );
}
