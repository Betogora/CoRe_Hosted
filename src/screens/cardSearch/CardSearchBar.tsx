import React from "react";
import { Layers, ListFilter, Search, X } from "lucide-react";
import { cardSearchGroupMembers, cardSearchTerms, cardSearchText, withCardSearchTermState, withCardSearchText, withoutCardSearchItem } from "./cardSearchExpression.ts";
import type { Deck } from "../../coreTypes.ts";
import { CrossLinkButton } from "../../ui/actionUi.tsx";
import { DeckSelect } from "../../ui/selectUi.tsx";
import { cardSearchTermLabel, type CardSearchMenuCategory } from "./cardSearchMenu.ts";

const ALL_DECKS = "__all__";

/**
 * Search row of the card management (KV2): free text, the deck filter (a `did:` term) and the switch for the
 * advanced search; below it the active terms as removable chips with the hit count.
 */
export function CardSearchBar({ query, onQueryChange, decks, categories, advancedOpen, onAdvancedOpenChange, advancedId, resultCount, resultAction, placeholder, hint, children }: {
  query: string;
  onQueryChange: (query: string) => void;
  decks: Deck[];
  categories: readonly CardSearchMenuCategory[];
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  advancedId: string;
  resultCount: number | null;
  /** Action for the hits at the end of their row, such as `Treffer lernen`. */
  resultAction?: React.ReactNode;
  /** The open advanced menu sits above the chips, so a new chip never shifts it under the pointer. */
  children?: React.ReactNode;
  placeholder: string;
  hint?: React.ReactNode;
}) {
  const [input, setInput] = React.useState(() => cardSearchText(query));
  // A reset or a term written elsewhere changes the query; the field follows its text part.
  React.useEffect(() => {
    setInput((current) => cardSearchText(current) === cardSearchText(query) ? current : cardSearchText(query));
  }, [query]);
  const terms = cardSearchTerms(query);
  // The deck filter shows a single `did:` term; it replaces every deck term, also a group of several decks.
  const deckTerm = terms.find((term) => /^did:/i.test(term));
  const deckValue = deckTerm ? deckTerm.slice("did:".length) : ALL_DECKS;
  const deckTerms = terms.filter((term) => /^-?did:/i.test(term) || cardSearchGroupMembers(term)?.members.every((member) => /^did:/i.test(member)));
  const filterCount = terms.filter((term) => term !== deckTerm).length;

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <label className="relative flex min-w-0 flex-1 md:flex-[1.4]">
          <span className="sr-only">Karten durchsuchen</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-core-muted" size={16} aria-hidden="true" />
          <input
            className="core-field min-w-0 !pl-10"
            value={input}
            placeholder={placeholder}
            aria-label="Karten durchsuchen"
            aria-keyshortcuts="/"
            aria-describedby={hint ? "card-search-hint" : undefined}
            onChange={(event) => {
              const next = withCardSearchText(query, event.target.value);
              setInput(next.input);
              onQueryChange(next.query);
            }}
          />
        </label>
        <div className="min-w-0 flex-1 max-md:hidden">
          <DeckSelect
            decks={decks}
            value={deckValue}
            ariaLabel="Stapel filtern"
            className="w-full"
            specialOption={{ value: ALL_DECKS, label: "Alle Stapel", icon: Layers }}
            onValueChange={(value) => {
              const without = deckTerms.reduce((current, term) => withoutCardSearchItem(current, term), query);
              onQueryChange(value === ALL_DECKS ? without : withCardSearchTermState(without, `did:${value}`, "in"));
            }}
          />
        </div>
        <button
          type="button"
          aria-pressed={advancedOpen}
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => onAdvancedOpenChange(!advancedOpen)}
          className="core-action-secondary relative shrink-0 gap-2 aria-pressed:border-core-action aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action max-md:size-control max-md:p-0"
        >
          <ListFilter size={16} aria-hidden="true" />
          <span className="max-md:sr-only">Erweiterte Suche</span>
          {filterCount ? <span className="grid min-h-5 min-w-5 place-items-center rounded-round bg-core-action px-1 core-caption font-bold text-core-on-accent max-md:absolute max-md:-right-1.5 max-md:-top-1.5" aria-label={`${filterCount} Filter aktiv`}>{filterCount}</span> : null}
        </button>
      </div>
      {hint ? <p id="card-search-hint" className="core-field-hint" data-testid="card-search-unsupported">{hint}</p> : null}
      {children}
      {/* A search always names its number of hits, also without filters (the flat hit list, KV3). */}
      {terms.length || resultCount !== null ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2" data-testid="card-search-chips">
          {resultCount !== null ? <p className="mr-1.5 shrink-0 whitespace-nowrap core-body font-semibold text-core-text">{resultCount === 1 ? "1 Karte" : `${resultCount} Karten`}</p> : null}
          {terms.length ? (
            <ul className="contents" aria-label="Aktive Filter">
              {terms.map((term) => {
                const { label, category, negated } = term === deckTerm
                  ? { label: decks.find((deck) => deck.id === deckValue)?.name ?? deckValue, category: "Stapel", negated: false }
                  : cardSearchTermLabel(term, categories);
                return (
                  <li key={term} className={`flex min-w-0 max-w-full items-center rounded-inset ${negated ? "bg-core-danger-soft" : "bg-core-subtle"} core-body text-core-text`}>
                    <span className="flex min-h-8 min-w-0 items-center gap-1.5 pl-2.5 pr-1">
                      {category ? <span className={negated ? "text-core-danger-text" : "text-core-muted"}>{negated ? `ohne ${category}` : category}</span> : negated ? <span className="text-core-danger-text">ohne</span> : null}
                      <span className="truncate font-semibold">{label}</span>
                    </span>
                    <button type="button" className="grid size-8 shrink-0 place-items-center rounded-inset text-core-muted hover:text-core-text" aria-label={`Filter ${label} entfernen`} onClick={() => onQueryChange(withoutCardSearchItem(query, term))}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {terms.length ? <CrossLinkButton className="ml-1" onSelect={() => onQueryChange(cardSearchText(query))}>Alle zurücksetzen</CrossLinkButton> : null}
          {resultAction ? <div className="ml-auto shrink-0">{resultAction}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
