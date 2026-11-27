import React from "react";
import { ArrowDown, ArrowUp, Layers, Pause, Search, Star } from "lucide-react";
import type { CardTableSort, CardTableSortField } from "../../libraryModel.ts";
import type { CardCatalogEntry, NoteGraph } from "../../workspaceReplica.ts";
import { FlagDot } from "../../ui/flagUi.tsx";
import { CoreTag, EmptyState } from "../../ui/coreUi.tsx";
import { CoreCheckbox } from "../../ui/formControls.tsx";
import type { createHitListModel } from "./cardListModel.ts";
import type { useVirtualRows } from "./virtualRows.ts";

export type CardListItem =
  | { kind: "notice"; key: string }
  | { kind: "card"; key: string; listKey: string; index: number };
type CardHitRow = ReturnType<typeof createHitListModel>["cardRows"][number];

function SortHeader({ field, label, sort, onChange, leading, children }: {
  field: CardTableSortField;
  label: string;
  sort: CardTableSort;
  onChange: (field: CardTableSortField) => void;
  leading?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const active = sort.field === field;
  const first = field === "sortField";
  const headerPadding = field === "variants" ? "px-1 sm:pr-3" : first ? "px-2 sm:pl-3 sm:pr-4 md:pl-4" : "px-1";
  const directionLabel = active && sort.direction === "desc" ? "absteigend" : "aufsteigend";
  const SortIcon = active && sort.direction === "desc" ? ArrowDown : ArrowUp;

  const button = (
    <button
      type="button"
      onClick={() => onChange(field)}
      className={`core-table-header-control flex min-w-0 items-center justify-end gap-0.5 rounded-inset core-caption font-medium text-core-muted hover:text-core-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)] ${first ? "ml-auto" : "w-full"}`}
      aria-label={`${label} ${directionLabel} sortieren`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <SortIcon size={14} aria-hidden="true" className={`shrink-0 ${active ? "opacity-100" : "opacity-35"}`} />
    </button>
  );
  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`min-w-0 ${headerPadding} ${first ? "py-0 text-left" : "text-right"}`}>
      {/* The leading control sits on the axis of the rows' checkboxes; the label closes the column like the others. */}
      {first ? <div className="flex h-[var(--core-card-table-header-height)] min-w-0 items-center gap-3">{leading}{button}</div> : <>{button}{children}</>}
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
  checked: boolean;
  selecting: boolean;
  onToggleCheck: (cardId: string, range: boolean) => void;
}

const LONG_PRESS_MS = 500;

/** Memoized so a page of up to 50 rows does not repaint on unrelated state changes. */
const CardTableRowView = React.memo(function CardTableRowView({ virtualKey, deckId, card, frontPreview, nextStudyLabel, selected, marked, flag, flagNames, syncConflict, deckPath, onSelect, checked, selecting, onToggleCheck }: CardTableRowViewProps) {
  const suspended = !card.reviewable;
  const pressTimer = React.useRef<number | null>(null);
  const pressed = React.useRef(false);
  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
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
      <td className="min-w-0 px-2 py-1 align-middle sm:pl-3 sm:pr-4 md:pl-4">
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
        {suspended ? (
          <span data-testid="card-row-suspended" className="mt-0.5 flex shrink-0 items-center gap-1.5 core-caption font-semibold text-core-text">
            <Pause size={16} aria-hidden="true" />
            <span className="max-sm:sr-only">Ausgesetzt</span>
          </span>
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
          {/* Without variants the slot stays empty, so the few cards with variants stand out. */}
          <span className="min-w-4 text-right core-body font-semibold tabular-nums text-core-text" aria-label={card.activeVariantCount ? card.activeVariantCount === 1 ? "1 aktive Variante" : `${card.activeVariantCount} aktive Varianten` : undefined}>{card.activeVariantCount || null}</span>
        </span>
      </td>
    </tr>
  );
});

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



export function CardHitTable({ items, rowOf, virtual, loading, searching, selectionBar, sort, onSort, onStartSelecting, selectedCardId, selectedGraph, flagNames, syncConflictCardIds, deckPathOf, onSelect, isChecked, selecting, onToggleCheck }: {
  items: CardListItem[];
  rowOf: (item: Extract<CardListItem, { kind: "card" }>) => CardHitRow | undefined;
  virtual: ReturnType<typeof useVirtualRows>;
  loading: boolean;
  searching: boolean;
  selectionBar: React.ReactNode;
  sort: CardTableSort;
  onSort: (field: CardTableSortField) => void;
  onStartSelecting?: () => void;
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
  const theadRef = React.useRef<HTMLTableSectionElement>(null);
  const dueColumnRef = React.useRef<HTMLTableColElement>(null);
  const dueSampleRef = React.useRef<HTMLSpanElement>(null);
  const toggledInHeader = React.useRef(false);
  const barShown = Boolean(selectionBar);
  const tableShown = Boolean(items.length || loading);
  React.useEffect(() => {
    if (!toggledInHeader.current) return;
    toggledInHeader.current = false;
    theadRef.current?.querySelector<HTMLInputElement>(".core-checkbox input")?.focus();
  }, [barShown]);
  // Platforms round glyph widths differently, so the date column takes the rendered width of a date; the class width is
  // the fallback.
  React.useLayoutEffect(() => {
    const sample = dueSampleRef.current;
    if (!sample) return undefined;
    const fit = () => { if (dueColumnRef.current) dueColumnRef.current.style.width = `calc(${sample.getBoundingClientRect().width}px + 0.5rem)`; };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(sample);
    return () => observer.disconnect();
  }, [barShown, tableShown]);
  return tableShown ? (
    <div className="min-w-0 max-w-full overflow-clip rounded-panel border border-core-border bg-core-surface" data-testid="card-library-sheet">
  <table className="w-full table-fixed border-collapse" data-testid="card-library-table" aria-busy={loading || undefined} aria-rowcount={items.length}>
      <colgroup>
        <col />
        <col ref={dueColumnRef} className="w-[5.5rem]" />
        <col className="w-20 sm:w-[5.5rem]" />
      </colgroup>
      {/* From xl the screen region scrolls; its top padding (xl:py-10 in App) would otherwise hold the header 40 px low. */}
      <thead ref={theadRef} onChangeCapture={(event) => { toggledInHeader.current = event.target instanceof HTMLInputElement && event.target.type === "checkbox" && event.currentTarget.contains(event.target); }} onClickCapture={(event) => { if (event.target instanceof Element && event.target.closest(".core-card-selection-close")) toggledInHeader.current = true; }} className="sticky top-[var(--shell-sticky-top)] z-10 bg-core-surface">
        {selectionBar ? (
          <tr className="core-card-table-header border-b border-core-border">
            <th scope="col" colSpan={3} className="p-0 text-left font-normal">
              {selectionBar}
            </th>
          </tr>
        ) : (
          <tr className="core-card-table-header border-b border-core-border">
            <SortHeader
              field="sortField"
              label="Sortierfeld"
              sort={sort}
              onChange={onSort}
              leading={onStartSelecting ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 core-caption font-medium text-core-muted hover:text-core-text">
                  <CoreCheckbox className="shrink-0" data-testid="card-selection-start" aria-label="Karten auswählen" checked={false} onCheckedChange={onStartSelecting} />
                  {/* Below 400 px the word would cut „Sortierfeld“; the checkbox keeps its name. */}
                  <span aria-hidden="true" className="max-[399px]:hidden">Auswählen</span>
                </label>
              ) : null}
            />
            <SortHeader field="nextStudyDate" label="Datum" sort={sort} onChange={onSort}>
              <span ref={dueSampleRef} aria-hidden="true" className="invisible block h-0 w-max overflow-hidden whitespace-nowrap core-body tabular-nums">00.00.0000</span>
            </SortHeader>
            <SortHeader field="variants" label="Varianten" sort={sort} onChange={onSort} />
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
