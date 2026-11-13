import React from "react";
import { ArrowDown, ArrowUp, Layers, Minus, Search, Star } from "lucide-react";
import type { CardTableSort, CardTableSortField } from "../../libraryModel.ts";
import type { CardCatalogEntry, NoteGraph } from "../../workspaceReplica.ts";
import { FlagDot } from "../../ui/flagUi.tsx";
import { CoreTag, EmptyState } from "../../ui/coreUi.tsx";
import { CoreCheckbox } from "../../ui/formControls.tsx";
import type { createHitListModel } from "./cardListModel.ts";
import type { useVirtualRows } from "./virtualRows.ts";

/** Rows of the virtual table (KV3): an offline notice when the list is limited, then one row per hit. */
export type CardListItem =
  | { kind: "notice"; key: string }
  | { kind: "card"; key: string; listKey: string; index: number };
type CardHitRow = ReturnType<typeof createHitListModel>["cardRows"][number];

function SortHeader({ field, label, sort, onChange }: {
  field: CardTableSortField;
  label: string;
  sort: CardTableSort;
  onChange: (field: CardTableSortField) => void;
}) {
  const active = sort.field === field;
  const rightAligned = field !== "sortField";
  // Matches the padding of the column's cells, so header and values share their edge.
  const headerPadding = field === "variants" ? "px-1 sm:pr-3" : rightAligned ? "px-1" : "px-1 sm:px-3 md:px-4";
  const headerGap = rightAligned ? "gap-0.5" : "gap-1 sm:gap-2";
  const directionLabel = active && sort.direction === "desc" ? "absteigend" : "aufsteigend";
  const SortIcon = active && sort.direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`min-w-0 ${headerPadding} ${rightAligned ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onChange(field)}
        className={`core-table-header-control flex w-full min-w-0 items-center ${headerGap} rounded-inset core-caption font-medium text-core-muted hover:text-core-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)] ${rightAligned ? "justify-end" : ""}`}
        aria-label={`${label} ${directionLabel} sortieren`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <SortIcon size={14} aria-hidden="true" className={`shrink-0 ${active ? "opacity-100" : "opacity-35"}`} />
      </button>
    </th>
  );
}

interface CardTableRowViewProps {
  virtualKey: string;
  deckId: string;
  card: CardCatalogEntry;
  frontPreview: string;
  nextStudyLabel: string;
  selected: boolean;
  marked: boolean;
  flag: number;
  flagNames: readonly string[];
  syncConflict: boolean;
  /** Deck path of the card; absent when the list covers a single deck. */
  deckPath?: string;
  onSelect: (deckId: string, cardId: string) => void;
  /** Selection for mass actions (KV4): checked, the table in selection mode, and toggling (with Shift a range). */
  checked: boolean;
  selecting: boolean;
  onToggleCheck: (cardId: string, range: boolean) => void;
}

const LONG_PRESS_MS = 500;

/** One card row of the table; memoized so a page of up to 50 rows does not repaint on unrelated state changes. */
const CardTableRowView = React.memo(function CardTableRowView({ virtualKey, deckId, card, frontPreview, nextStudyLabel, selected, marked, flag, flagNames, syncConflict, deckPath, onSelect, checked, selecting, onToggleCheck }: CardTableRowViewProps) {
  const suspended = !card.reviewable;
  const pressTimer = React.useRef<number | null>(null);
  const pressed = React.useRef(false);
  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  // A click opens the card; while selecting, or with Ctrl/Cmd or Shift, it selects. A long touch starts selecting.
  const activate = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    if (selecting || event.ctrlKey || event.metaKey || event.shiftKey) onToggleCheck(card.id, event.shiftKey);
    else onSelect(deckId, card.id);
  };
  return (
    <tr
      data-virtual-key={virtualKey}
      onClick={activate}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        cancelPress();
        pressTimer.current = window.setTimeout(() => {
          pressTimer.current = null;
          pressed.current = true;
          onToggleCheck(card.id, false);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerMove={(event) => { if (event.pointerType === "touch" && (Math.abs(event.movementX) > 4 || Math.abs(event.movementY) > 4)) cancelPress(); }}
      onContextMenu={(event) => { if (pressed.current) event.preventDefault(); }}
      className={`cursor-pointer border-b border-core-border transition-colors ${checked ? "bg-core-info-soft" : suspended ? "bg-core-warning-soft hover:bg-core-warning-soft" : selected ? "bg-core-info-soft" : "bg-core-surface hover:bg-core-subtle"}`}
      data-selected={selected ? "true" : undefined}
      data-suspended={suspended ? "true" : undefined}
      data-card-row="true"
    >
      <td className="min-w-0 px-2 py-1 align-middle sm:px-3 md:px-4">
        <div className="flex min-w-0 items-start gap-2.5">
        {selecting ? (
          <CoreCheckbox
            className="mt-0.5 shrink-0"
            data-testid={"select-card-" + card.id}
            aria-label={`${frontPreview} auswählen`}
            checked={checked}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCheck(card.id, event.shiftKey);
            }}
          />
        ) : null}
        <button
          type="button"
          data-testid={"deck-card-" + card.id}
          aria-pressed={selected}
          className="block !min-h-0 min-w-0 flex-1 truncate text-left core-body text-core-text focus-visible:rounded-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
          onClick={activate}
        >
          {/* One compact line: the front, from sm on the deck path beside it, both cut with an ellipsis. */}
          <span className="flex min-w-0 items-baseline gap-2 sm:gap-3">
            <span className="min-w-0 flex-1 truncate">
              {frontPreview}
              {syncConflict ? <CoreTag tone="warning" className="ml-2">Synchronisierung klären</CoreTag> : null}
            </span>
            {deckPath ? <span className="hidden min-w-0 max-w-[40%] shrink-0 truncate core-caption font-normal text-core-muted sm:block">{deckPath}</span> : null}
          </span>
        </button>
        </div>
      </td>
      <td className="min-w-0 whitespace-nowrap px-1 py-1 text-right align-middle core-body tabular-nums text-core-secondary">
        {nextStudyLabel}
        {suspended ? <span className="sr-only"> · Ausgesetzt</span> : null}
      </td>
      <td className="min-w-0 px-1 py-1 text-right align-middle sm:pr-3">
        {/* Flag and mark keep their slots left of the count, so the count closes the column under its right-aligned header. */}
        <span className="inline-flex items-center justify-end gap-1 align-middle">
          <span className="grid size-[1.125rem] place-items-center">
            {flag ? <FlagDot flag={flag} names={flagNames} size={10} /> : null}
          </span>
          <span className="grid size-[1.125rem] place-items-center">
            {marked ? <Star size={18} fill="currentColor" className="text-core-warning" role="img" aria-label="Markiert" /> : null}
          </span>
          {card.activeVariantCount > 0
            ? <span className="min-w-4 text-right core-body font-semibold tabular-nums text-core-text" aria-label={card.activeVariantCount === 1 ? "1 aktive Variante" : `${card.activeVariantCount} aktive Varianten`}>{card.activeVariantCount}</span>
            : <Minus size={16} className="shrink-0 text-core-muted" role="img" aria-label="Keine Variante" />}
        </span>
      </td>
    </tr>
  );
});

/** Decks whose path matches the search text, above the flat hit list: a click lists the deck's cards. */
export function MatchingDecks({ groups, onOpen }: { groups: ReadonlyArray<{ id: string; path: string }>; onOpen: (deckId: string) => void }) {
  if (!groups.length) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="card-search-matching-decks">
      <span className="mr-1 core-body text-core-muted">Passende Stapel</span>
      {groups.map((group) => (
        <button key={group.id} type="button" className="flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-inset bg-core-subtle px-2.5 core-body font-semibold text-core-text hover:bg-core-border" onClick={() => onOpen(group.id)}>
          <Layers size={14} className="shrink-0 text-core-muted" aria-hidden="true" />
          <span className="truncate">{group.path}</span>
        </button>
      ))}
    </div>
  );
}



/**
 * The flat hit list of the card management (KV3) as a virtual table: sortable header or the selection bar, a loading
 * bar while the list's pages load, and one memoized row per loaded hit; without rows the empty state.
 */
export function CardHitTable({ items, rowOf, virtual, loading, searching, selectionBar, sort, onSort, selectedCardId, selectedGraph, flagNames, syncConflictCardIds, deckPathOf, onSelect, isChecked, selecting, onToggleCheck }: {
  items: CardListItem[];
  rowOf: (item: Extract<CardListItem, { kind: "card" }>) => CardHitRow | undefined;
  virtual: ReturnType<typeof useVirtualRows>;
  loading: boolean;
  searching: boolean;
  /** Replaces the sort header while cards are selected for a mass action. */
  selectionBar: React.ReactNode;
  sort: CardTableSort;
  onSort: (field: CardTableSortField) => void;
  selectedCardId: string | null;
  /** The open card's content; its mark and flags win over the catalog row until the list reloads. */
  selectedGraph: (NoteGraph & { cardId: string }) | null;
  flagNames: readonly string[];
  syncConflictCardIds: ReadonlySet<string>;
  deckPathOf?: (deckId: string) => string | undefined;
  onSelect: (deckId: string, cardId: string) => void;
  isChecked: (cardId: string) => boolean;
  selecting: boolean;
  onToggleCheck: (cardId: string, range: boolean) => void;
}) {
  // Below xl the page scrolls under the sticky mobile header, so the table header sticks right beneath it.
  const [mobileHeaderHeight, setMobileHeaderHeight] = React.useState(0);
  React.useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-navigation-layout="mobile-header"]');
    if (!header) return;
    const observer = new ResizeObserver(() => setMobileHeaderHeight(header.offsetHeight));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return items.length || loading ? (
    <div className="min-w-0 max-w-full overflow-clip rounded-panel border border-core-border bg-core-surface" data-testid="card-library-sheet">
  <table className="w-full table-fixed border-collapse" data-testid="card-library-table" aria-busy={loading || undefined} aria-rowcount={items.length}>
      <colgroup>
        <col />
        <col className="w-[5.5rem] sm:w-[5.75rem]" />
        <col className="w-20" />
      </colgroup>
      {/* From xl the screen region scrolls; its top padding (xl:py-10 in App) would otherwise hold the header 40 px low. */}
      <thead className="sticky top-[var(--core-card-table-sticky-top)] z-10 bg-core-surface xl:-top-10" style={{ "--core-card-table-sticky-top": `${mobileHeaderHeight}px` } as React.CSSProperties}>
        {selectionBar ? (
          <tr className="core-card-table-header border-b border-core-border">
            <th scope="col" colSpan={3} className="p-0 text-left font-normal">
              {selectionBar}
            </th>
          </tr>
        ) : (
          <tr className="core-card-table-header border-b border-core-border">
            <SortHeader field="sortField" label="Sortierfeld" sort={sort} onChange={onSort} />
            <SortHeader field="nextStudyDate" label="Datum" sort={sort} onChange={onSort} />
            <SortHeader field="variants" label="Variante" sort={sort} onChange={onSort} />
          </tr>
        )}
        {loading ? (
          <tr aria-hidden="true">
            <td colSpan={3} className="p-0">
              <div className="core-statistics-load-track !mt-0" data-testid="card-library-loading"><span /></div>
            </td>
          </tr>
        ) : null}
      </thead>
      <tbody ref={virtual.listRef as React.Ref<HTMLTableSectionElement>} data-testid="card-library-rows" className={loading ? "[&>tr[data-card-row]]:opacity-60" : undefined}>
        {virtual.paddingTop > 0 ? <tr aria-hidden="true" style={{ height: virtual.paddingTop }} /> : null}
        {items.slice(virtual.start, virtual.end + 1).map((item) => {
          if (item.kind === "notice") {
            return (
              <tr key={item.key} data-virtual-key={item.key} className="border-b border-core-border bg-core-warning-soft">
                <td colSpan={3} className="px-3 py-1.5 core-caption text-core-secondary sm:px-4">
                  Offline werden nur bereits lokal indexierte Karten durchsucht und sortiert.
                </td>
              </tr>
            );
          }
          const row = rowOf(item);
          if (!row) {
            return (
              <tr key={item.key} data-virtual-key={item.key} aria-hidden="true" className="border-b border-core-border bg-core-surface" data-card-placeholder="true">
                <td colSpan={3} className="px-3 py-1 sm:px-4">
                  <span className="block h-5 w-2/3 rounded-inset bg-core-subtle" />
                </td>
              </tr>
            );
          }
          const { entry: card, frontPreview, nextStudyLabel } = row;
          return (
            <CardTableRowView
              key={item.key}
              virtualKey={item.key}
              deckId={card.deckId}
              card={card}
              frontPreview={frontPreview}
              nextStudyLabel={nextStudyLabel}
              selected={selectedCardId === card.id}
              marked={selectedGraph && selectedGraph.note.id === card.noteId ? selectedGraph.note.marked : card.marked}
              flag={selectedGraph?.cards.find((candidate) => candidate.id === card.id)?.ankiFlag ?? card.ankiFlag}
              flagNames={flagNames}
              syncConflict={syncConflictCardIds.has(card.id)}
              deckPath={deckPathOf?.(card.deckId)}
              onSelect={onSelect}
              checked={isChecked(card.id)}
              selecting={selecting}
              onToggleCheck={onToggleCheck}
            />
          );
        })}
        {virtual.paddingBottom > 0 ? <tr aria-hidden="true" style={{ height: virtual.paddingBottom }} /> : null}
      </tbody>
  </table>
    </div>
  ) : (
    <EmptyState icon={Search} title={searching ? "Keine Karten gefunden" : "Keine Karten"} />
  );
}
