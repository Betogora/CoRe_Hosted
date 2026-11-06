import React from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, FileText, Layers, Minus, Network, NotebookPen, PanelsTopLeft, Play, RotateCcw, Search, Sparkles, Star, CircleHelp, type LucideIcon } from "lucide-react";
import type { CardDraftGuard, DecksCardPage, DecksScreenProps } from "../appScreenProps.ts";
export type { DecksCardPage, DecksCardPageRequest } from "../appScreenProps.ts";
export type DecksScreenCardPageProps = Pick<DecksScreenProps, "cardPages" | "onRequestCardPage">;
import { noteTextIndex } from "../coreModel.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { DECK_DEPTH_INDENT_PX, getVisibleDeckDepth } from "../deckHierarchy.ts";
import { CARD_TABLE_PAGE_SIZE, createCardSearchContext, createCardTableModel, createDeckLibraryModel, createHitListModel, createPagedCardTableModel, DEFAULT_CARD_TABLE_SORT, sameCardTableSort, type CardTableSort, type CardTableSortField } from "../libraryModel.ts";
import type { CardCatalogEntry, NoteGraph } from "../workspaceReplica.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { ActionDialog, CoreSlidingTabs, EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { DeckOptionsMenu } from "../ui/DeckOptionsMenu.tsx";
import { DeckSummaryRow } from "../ui/DeckSummaryRow.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { FlagDot } from "../ui/flagUi.tsx";
import { cardSearchTermState, cardSearchTerms, unsupportedCardSearchTerms, withCardSearchTermState } from "../cardSearchQuery.ts";
import { AdvancedCardSearch } from "./cardSearch/AdvancedCardSearch.tsx";
import { CardSearchBar } from "./cardSearch/CardSearchBar.tsx";
import { createCardSearchMenu } from "./cardSearch/cardSearchMenu.ts";
import { useVirtualRows } from "./cardList/virtualRows.ts";
import { CardEditorDialog, CardEditorSurface, type CardEditorHitNavigation } from "./cardEditor/CardEditorDialog.tsx";
import { DeckSummariesPanel } from "./DeckSummariesPanel.tsx";
import { DeckMindMapsPanel } from "./DeckMindMapsPanel.tsx";
import { DeckSubstacksPanel } from "./DeckSubstacksPanel.tsx";
import { LearningAreaHeader } from "./LearningAreaHeader.tsx";

interface PendingDetailAction {
  run: () => void;
}

const deckContentTabs = [
  { value: "children", label: "Unterstapel", icon: Layers },
  { value: "summary", label: "Zusammenfassungen", icon: NotebookPen },
  { value: "quiz", label: "Quiz", icon: CircleHelp },
  { value: "mind-map", label: "Mind Map", icon: Network },
  { value: "cards", label: "Karten", icon: PanelsTopLeft },
  { value: "source", label: "Quelle", icon: FileText },
] as const;

const CARD_SEARCH_DEBOUNCE_MS = 250;
/** List key of the flat hit list of a search (KV3); its pages span every deck in scope. */
const HIT_LIST_KEY = "__hits__";
/** Heights until a row is measured: deck header, card row, card row with deck path, notice or empty row. */
const ROW_ESTIMATE = { header: 56, card: 45, hit: 62, notice: 41 } as const;

/** Centered state of a content tab without its own content, e.g. `Demnächst verfügbar` or `Keine Unterstapel`. */
function DeckContentPlaceholder({ label, icon: Icon, title, action, testId }: { label: string; icon: LucideIcon; title: string; action?: React.ReactNode; testId?: string }) {
  return (
    <SoftPanel aria-label={label} className="flex min-h-[214px] items-center justify-center p-6 sm:p-10" data-testid={testId}>
      <div className="flex min-w-0 flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-control bg-core-subtle text-core-action"><Icon size={22} aria-hidden="true" /></span>
        <p className="core-heading-3 text-core-text" role="status">{title}</p>
        {action}
      </div>
    </SoftPanel>
  );
}

/** Decks whose path matches the search text, above the flat hit list: a click lists the deck's cards. */
function MatchingDecks({ groups, onOpen }: { groups: ReadonlyArray<{ id: string; path: string }>; onOpen: (deckId: string) => void }) {
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

function SortHeader({ field, label, sort, onChange }: {
  field: CardTableSortField;
  label: string;
  sort: CardTableSort;
  onChange: (field: CardTableSortField) => void;
}) {
  const active = sort.field === field;
  const rightAligned = field !== "sortField";
  const headerPadding = rightAligned ? "px-1" : "px-1 sm:px-3 md:px-4";
  const headerGap = rightAligned ? "gap-0.5" : "gap-1 sm:gap-2";
  const directionLabel = active && sort.direction === "desc" ? "absteigend" : "aufsteigend";
  const SortIcon = active && sort.direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`min-w-0 ${headerPadding} ${rightAligned ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onChange(field)}
        className={`core-table-header-control flex w-full min-w-0 items-center ${headerGap} rounded-inset core-caption font-semibold text-core-muted hover:text-core-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)] ${rightAligned ? "justify-end" : ""}`}
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
  /** Visible depth of the deck header above the row; null without deck headers. */
  depth: number | null;
  /** Deck path under the front text in the flat hit list. */
  deckPath?: string;
  onSelect: (deckId: string, cardId: string) => void;
}

/** One card row of the table; memoized so a page of up to 50 rows does not repaint on unrelated state changes. */
const CardTableRowView = React.memo(function CardTableRowView({ virtualKey, deckId, card, frontPreview, nextStudyLabel, selected, marked, flag, flagNames, syncConflict, depth, deckPath, onSelect }: CardTableRowViewProps) {
  const suspended = !card.reviewable;
  return (
    <tr
      data-virtual-key={virtualKey}
      onClick={() => onSelect(deckId, card.id)}
      className={`cursor-pointer border-b border-core-border transition-colors ${suspended ? "bg-core-warning-soft hover:bg-core-warning-soft" : selected ? "bg-core-info-soft" : "bg-core-surface hover:bg-core-subtle"} ${selected ? "core-card-row-selected" : ""}`}
      data-selected={selected ? "true" : undefined}
      data-suspended={suspended ? "true" : undefined}
      data-card-row="true"
    >
      <td
        className={`min-w-0 px-2 py-2.5 align-middle sm:px-3 md:px-4 ${depth === null ? "" : "[--core-card-row-lead:1.25rem] sm:[--core-card-row-lead:3rem]"}`}
        // Under the deck header the text starts where the header's deck icon starts (behind the chevron).
        style={depth === null ? undefined : { paddingLeft: `calc(var(--core-card-row-lead) + ${depth} * var(--core-deck-depth-indent, ${DECK_DEPTH_INDENT_PX}px))` }}
      >
        <button
          type="button"
          data-testid={"deck-card-" + card.id}
          aria-pressed={selected}
          className="block !min-h-0 w-full text-left core-body font-medium text-core-text focus-visible:rounded-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(deckId, card.id);
          }}
        >
          {/* Narrow screens show two lines of the front, wider ones one. */}
          <span className="line-clamp-2 break-words sm:line-clamp-1 sm:break-all">
            {frontPreview}
            {syncConflict ? <span className="ml-2 inline-flex min-h-5 items-center rounded-round bg-core-warning-soft px-2 core-caption font-semibold text-core-warning">Synchronisierung klären</span> : null}
          </span>
          {deckPath ? <span className="block truncate core-caption font-normal text-core-muted">{deckPath}</span> : null}
        </button>
      </td>
      <td className="min-w-0 whitespace-nowrap px-1 py-2.5 text-right align-middle core-body tabular-nums text-core-secondary">
        {nextStudyLabel}
        {suspended ? <span className="sr-only"> · Ausgesetzt</span> : null}
      </td>
      <td className="min-w-0 px-1 py-2.5 text-right align-middle sm:pr-3">
        <span className="inline-flex items-center justify-end gap-1 align-middle">
          {card.activeVariantCount > 0
            ? <span className="min-w-[1.125rem] text-center core-body font-semibold tabular-nums text-core-text" aria-label={card.activeVariantCount === 1 ? "1 aktive Variante" : `${card.activeVariantCount} aktive Varianten`}>{card.activeVariantCount}</span>
            : <Minus size={16} className="shrink-0 text-core-muted" role="img" aria-label="Keine Variante" />}
          <span className="grid size-[1.125rem] place-items-center">
            {flag ? <FlagDot flag={flag} names={flagNames} size={10} /> : null}
          </span>
          <span className="grid size-[1.125rem] place-items-center">
            {marked ? <Star size={18} fill="currentColor" className="text-core-warning" role="img" aria-label="Markiert" /> : null}
          </span>
        </span>
      </td>
    </tr>
  );
});

export function DecksScreen({
  decks,
  summaryAccountId,
  learningContentCloud = null,
  onGenerateSummary,
  deckSummaries,
  onStartDeck,
  contentDeckId = null,
  contentTab: requestedContentTab = "children",
  onOpenDeckContent,
  now,
  dayStartHour,
  learnAheadMinutes,
  timeZone,
  mediaStore,
  selectedDeckId: focusedDeckId = null,
  selectedCardId = null,
  cardEditorTab,
  onCardEditorTabChange,
  cardEditor,
  onSelectDeck,
  onCloseSelectedCard,
  onSetDeckCoreMode,
  onSaveNote,
  onSetCardStudyState,
  onDuplicateNote,
  onDeleteNote,
  onUndoDeleteNote,
  onRescheduleCards,
  onGenerateVariant,
  onGenerateDeckVariants,
  variantGenerationRunning = false,
  onUpdateVariant,
  onMoveDeck,
  onOpenLearn,
  onOpenCardSettings,
  onOpenDeckSettings,
  onDraftStateChange,
  expandedDeckIds,
  onSetDeckExpanded,
  savedSearches,
  onSavedSearchesChange,
  cardPages,
  onRequestCardPage,
  syncConflictCardIds,
}: DecksScreenProps) {
  const contentTab = selectedCardId ? "cards" : requestedContentTab;
  const contentLibrary = React.useMemo(() => contentDeckId ? createDeckLibraryModel(decks, { now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries }) : null,
    [contentDeckId, dayStartHour, deckSummaries, decks, learnAheadMinutes, now, timeZone]);
  const contentRowById = React.useMemo(() => new Map(contentLibrary?.rows.map((row) => [row.id, row])), [contentLibrary]);
  const contentRow = contentDeckId ? contentRowById.get(contentDeckId) : undefined;
  const contentTrail = React.useMemo(() => {
    const trail = [];
    for (let row = contentRow; row; row = contentRowById.get(row.parentDeckId ?? "")) trail.push(row);
    return trail.reverse();
  }, [contentRow, contentRowById]);
  const contentTabsRef = React.useRef<HTMLDivElement>(null);
  const contentNavigationRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    contentTabsRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [contentTab]);
  React.useEffect(() => {
    if (!contentDeckId) return;
    const frame = window.requestAnimationFrame(() => {
      const navigation = contentNavigationRef.current;
      if (!navigation) return;
      const headerHeight = document.querySelector('[data-navigation-layout="mobile-header"]')?.getBoundingClientRect().height ?? 0;
      navigation.style.scrollMarginTop = `${headerHeight}px`;
      navigation.scrollIntoView({ block: "start" });
      navigation.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contentDeckId]);
  const libraryDecks = React.useMemo(() => {
    if (!contentDeckId) return decks;
    const treeIds = collectDeckTreeIds(decks, contentDeckId);
    return decks.filter((deck) => treeIds.has(deck.id));
  }, [contentDeckId, decks]);
  const contentDeck = contentDeckId ? libraryDecks.find((deck) => deck.id === contentDeckId) : null;
  const hasStudyCards = React.useMemo(() => Boolean(contentDeckId) && libraryDecks.some((deck) => (
    !deck.deletedAt && ((deckSummaries?.get(deck.id)?.inventory.totalCards ?? 0) > 0 || deck.cards.some((card) => !card.deletedAt))
  )), [contentDeckId, deckSummaries, libraryDecks]);
  const selectedContentTab = deckContentTabs.find((tab) => tab.value === contentTab)!;
  const [query, setQuery] = React.useState("");
  const [deferredQuery, setDeferredQuery] = React.useState("");
  // Every filter is a search term in the query (Anki notation), so search, chips and menu stay one state.
  const unsupportedTerms = React.useMemo(() => unsupportedCardSearchTerms(deferredQuery), [deferredQuery]);
  const [advancedSearchOpen, setAdvancedSearchOpen] = React.useState(false);
  const [tagDirectory, setTagDirectory] = React.useState<Awaited<ReturnType<typeof cardEditor.listTagDirectory>>>([]);
  const [noteTypes, setNoteTypes] = React.useState<Awaited<ReturnType<typeof cardEditor.listNoteTypes>>>([]);
  React.useEffect(() => {
    if (!advancedSearchOpen) return;
    let current = true;
    void cardEditor.listTagDirectory().then((entries) => { if (current) setTagDirectory(entries); }).catch(() => undefined);
    return () => { current = false; };
  }, [advancedSearchOpen, cardEditor]);
  // Note types resolve typed `note:` terms too, so they load with the screen and again with the menu.
  React.useEffect(() => {
    let current = true;
    void cardEditor.listNoteTypes().then((entries) => { if (current) setNoteTypes(entries); }).catch(() => undefined);
    return () => { current = false; };
  }, [advancedSearchOpen, cardEditor]);
  const searchMenu = React.useMemo(() => createCardSearchMenu({ decks: libraryDecks, tags: tagDirectory, flagNames: cardEditor.flagNames, noteTypes }), [cardEditor.flagNames, libraryDecks, noteTypes, tagDirectory]);
  const searchContext = React.useMemo(() => createCardSearchContext(deferredQuery, decks, { now, dayStartHour, timeZone, noteTypes }), [dayStartHour, decks, deferredQuery, noteTypes, now, timeZone]);
  function changeQuery(next: string) {
    setQuery(next);
  }
  React.useEffect(() => {
    if (query === deferredQuery) return;
    const timer = window.setTimeout(() => setDeferredQuery(query), CARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, query]);
  const [cardSort, setCardSort] = React.useState<CardTableSort>(DEFAULT_CARD_TABLE_SORT);
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const setSuccessToast = useSuccessToast();
  const [pendingCardDelete, setPendingCardDelete] = React.useState<{ deckId: string; cardId: string; graph: NoteGraph } | null>(null);
  const preserveToastForSelectionChange = React.useRef(false);
  const [deletingCard, setDeletingCard] = React.useState(false);
  const [deletedCardUndo, setDeletedCardUndo] = React.useState<{ deckId: string; cardId: string; undo: NoteGraph; deleted: NoteGraph; description: string } | null>(null);
  const [pendingDetailAction, setPendingDetailAction] = React.useState<PendingDetailAction | null>(null);
  const [savingPendingDraft, setSavingPendingDraft] = React.useState(false);
  const cardDraftGuardRef = React.useRef<CardDraftGuard | null>(null);
  const detailRef = React.useRef<HTMLDivElement | null>(null);
  // Prev/next to a row whose page is not loaded yet: it opens once the page arrives.
  const [pendingHit, setPendingHit] = React.useState<{ listKey: string; index: number } | null>(null);
  const previouslySelectedCardId = React.useRef<string | null>(null);
  const autoExpandedSelectedDeckIdRef = React.useRef<string | null>(null);
  const usesCardPages = cardPages !== undefined || Boolean(onRequestCardPage);
  const tableModel = React.useMemo(() => {
    if (!usesCardPages) {
      return createCardTableModel(libraryDecks, { query: deferredQuery, cardSort, now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries });
    }
    return createPagedCardTableModel(libraryDecks, cardPages, {
      query: deferredQuery, cardSort, awaitingPages: Boolean(onRequestCardPage),
      now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries,
    });
  }, [cardPages, cardSort, dayStartHour, deckSummaries, libraryDecks, deferredQuery, learnAheadMinutes, now, onRequestCardPage, timeZone, usesCardPages]);
  const searchExpandsGroups = Boolean(deferredQuery.trim());
  // A search shows one flat list over all decks in scope (KV3); without one the deck tree with its cards.
  const hitScope = React.useMemo(() => libraryDecks.map((deck) => deck.id), [libraryDecks]);
  const hitList = React.useMemo(() => {
    if (!searchExpandsGroups) return null;
    if ("hits" in tableModel) return tableModel.hits;
    return createHitListModel(cardPages?.[HIT_LIST_KEY], { query: deferredQuery, cardSort, awaitingPages: Boolean(onRequestCardPage), dayStartHour, timeZone });
  }, [cardPages, cardSort, dayStartHour, deferredQuery, onRequestCardPage, searchExpandsGroups, tableModel, timeZone]);
  const [expandedDeckIdSet, setExpandedDeckIdSet] = React.useState(() => new Set(expandedDeckIds));
  const [collapsedContentDeckIds, setCollapsedContentDeckIds] = React.useState(() => new Set<string>());
  const isGroupExpanded = (groupId: string) => searchExpandsGroups || (contentDeckId ? !collapsedContentDeckIds.has(groupId) : expandedDeckIdSet.has(groupId));
  const cardsLoading = hitList ? hitList.loading : tableModel.groups.some((group) => group.loading && isGroupExpanded(group.id));
  const searchResultCount = hitList && !cardsLoading ? hitList.totalCardCount : null;
  const showsDeckHeader = !contentDeckId || libraryDecks.length > 1;
  // Below xl the page scrolls under the sticky mobile header, so the table header sticks right beneath it.
  const [mobileHeaderHeight, setMobileHeaderHeight] = React.useState(0);
  React.useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-navigation-layout="mobile-header"]');
    if (!header) return;
    const observer = new ResizeObserver(() => setMobileHeaderHeight(header.offsetHeight));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const groupById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group])), [tableModel.allGroups]);
  const deckNameById = React.useMemo(() => new Map(decks.map((deck) => [deck.id, deck.name])), [decks]);
  const selectedContentDeckId = React.useMemo(() => {
    if (!contentDeckId || !selectedCardId) return null;
    const hit = hitList?.cardRows.find((row) => row.id === selectedCardId) ?? (cardPages?.[HIT_LIST_KEY]?.selected?.cardId === selectedCardId ? { entry: cardPages[HIT_LIST_KEY]!.selected!.cards.find((card) => card.id === selectedCardId) } : null);
    if (hit?.entry) return hit.entry.deckId;
    for (const group of tableModel.allGroups) {
      if (cardPages?.[group.id]?.selected?.cardId === selectedCardId) return group.id;
      if (group.cardRows.some((row) => row.id === selectedCardId)) return group.id;
    }
    return null;
  }, [cardPages, contentDeckId, hitList, selectedCardId, tableModel.allGroups]);
  const selectedDeckId = selectedContentDeckId ?? focusedDeckId;
  const selectedGroup = selectedDeckId ? groupById.get(selectedDeckId) ?? null : null;
  const selectedDeck = selectedGroup?.deck ?? null;
  // In the flat hit list the open card comes with the hit list's pages, in the tree with its deck's.
  const selectedListKey = hitList ? HIT_LIST_KEY : selectedDeckId;
  const selectedPage = selectedListKey ? cardPages?.[selectedListKey] : undefined;

  // Rows of the virtual table (KV3): deck headers with their cards in the tree, or the hits of the flat list.
  type ListItem =
    | { kind: "header"; key: string; group: (typeof tableModel.groups)[number]; expanded: boolean; depth: number }
    | { kind: "notice"; key: string }
    | { kind: "empty"; key: string }
    | { kind: "card"; key: string; listKey: string; index: number; depth: number | null; row: (typeof tableModel.groups)[number]["cardRows"][number] | undefined };
  const items = React.useMemo<ListItem[]>(() => {
    const list: ListItem[] = [];
    if (hitList) {
      if (cardPages?.[HIT_LIST_KEY]?.limitedToLocalCatalog) list.push({ kind: "notice", key: "notice:hits" });
      for (let index = 0; index < hitList.totalCardCount; index += 1) {
        list.push({ kind: "card", key: `hit:${index}`, listKey: HIT_LIST_KEY, index, depth: null, row: hitList.rowsByIndex.get(index) });
      }
      return list;
    }
    for (const group of tableModel.groups) {
      const expanded = isGroupExpanded(group.id);
      const depth = getVisibleDeckDepth(group.depth);
      if (showsDeckHeader) list.push({ kind: "header", key: `deck:${group.id}`, group, expanded, depth });
      if (!expanded) continue;
      if (cardPages?.[group.id]?.limitedToLocalCatalog) list.push({ kind: "notice", key: `notice:${group.id}` });
      for (let index = 0; index < group.totalCardCount; index += 1) {
        list.push({ kind: "card", key: `card:${group.id}:${index}`, listKey: group.id, index, depth: showsDeckHeader ? depth : null, row: group.rowsByIndex.get(index) });
      }
      if (!group.totalCardCount && !group.loading && !group.hasChildren) list.push({ kind: "empty", key: `empty:${group.id}` });
    }
    return list;
    // isGroupExpanded reads the expansion state named here.
  }, [cardPages, collapsedContentDeckIds, contentDeckId, expandedDeckIdSet, hitList, searchExpandsGroups, showsDeckHeader, tableModel.groups]);
  const cardItems = React.useMemo(() => items.filter((item): item is Extract<ListItem, { kind: "card" }> => item.kind === "card"), [items]);
  const itemKey = React.useCallback((index: number) => items[index].key, [items]);
  const itemEstimate = React.useCallback((index: number) => {
    const item = items[index];
    return item.kind === "header" ? ROW_ESTIMATE.header : item.kind === "card" ? (item.listKey === HIT_LIST_KEY ? ROW_ESTIMATE.hit : ROW_ESTIMATE.card) : ROW_ESTIMATE.notice;
  }, [items]);
  const virtual = useVirtualRows({ count: items.length, keyAt: itemKey, estimate: itemEstimate });
  const deckPathById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group.path])), [tableModel.allGroups]);
  const selectedGraph = selectedPage?.selected?.cardId === selectedCardId ? selectedPage?.selected ?? null : null;
  const selectedDeckMissing = Boolean(selectedDeckId && !selectedDeck);
  const selectedCardMissing = Boolean(selectedDeck && selectedCardId && !selectedGraph);
  // Until the page answers for the selected card the editor shows the loading bar, never "Karte nicht gefunden".
  const selectedCardLoading = selectedCardMissing && Boolean(onRequestCardPage) && !selectedPage?.loadError && selectedPage?.requestedCardId !== selectedCardId;
  const detailOpen = Boolean(selectedGraph || selectedDeckMissing || selectedCardMissing);
  const { urls: selectedNoteMediaUrls } = useNoteMediaUrls(selectedGraph?.note.media, mediaStore);
  const handleEditorDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
    onDraftStateChange(guard);
  }, [onDraftStateChange]);

  React.useEffect(() => {
    setExpandedDeckIdSet((current) => (
      current.size === expandedDeckIds.length && expandedDeckIds.every((deckId) => current.has(deckId))
        ? current
        : new Set(expandedDeckIds)
    ));
  }, [expandedDeckIds]);

  React.useEffect(() => {
    if (preserveToastForSelectionChange.current) {
      preserveToastForSelectionChange.current = false;
      return;
    }
    setSuccessToast("");
  }, [selectedCardId, setSuccessToast]);

  // Pages of the rows near the visible area load as the list scrolls; a list not shown for the current search, sort
  // and scope loads its first page, which also brings its length. Each page is asked once per list version.
  const requestedPagesRef = React.useRef(new Map<string, DecksCardPage | undefined>());
  const pendingHitPage = pendingHit ? `${pendingHit.listKey}#${Math.floor(pendingHit.index / CARD_TABLE_PAGE_SIZE)}` : null;
  React.useEffect(() => {
    if (!onRequestCardPage) return;
    if (contentDeckId && contentTab !== "cards") return;
    const deckIdsOf = (listKey: string) => listKey === HIT_LIST_KEY ? hitScope : undefined;
    const isShown = (listKey: string) => {
      const list = cardPages?.[listKey];
      return Boolean(list && list.query === deferredQuery && sameCardTableSort(list.sort, cardSort)
        && (listKey !== HIT_LIST_KEY || (list.deckIds ?? []).join("\n") === hitScope.join("\n")));
    };
    const needed = new Map<string, { listKey: string; page: number }>();
    const need = (listKey: string, page: number) => needed.set(`${listKey}#${page}`, { listKey, page });
    if (hitList && !isShown(HIT_LIST_KEY)) need(HIT_LIST_KEY, 0);
    for (let index = Math.max(0, virtual.start); index <= virtual.end; index += 1) {
      const item = items[index];
      if (item?.kind === "header" && item.expanded && !isShown(item.group.id)) need(item.group.id, 0);
      if (item?.kind === "card" && (!item.row || !isShown(item.listKey))) need(item.listKey, Math.floor(item.index / CARD_TABLE_PAGE_SIZE));
    }
    if (pendingHit) need(pendingHit.listKey, Math.floor(pendingHit.index / CARD_TABLE_PAGE_SIZE));
    const requested = requestedPagesRef.current;
    for (const [key, { listKey, page }] of needed) {
      const list = cardPages?.[listKey];
      // Asked before for this very list object: still loading, or answered without that page (a shorter list).
      if (requested.has(key) && requested.get(key) === (isShown(listKey) ? list : undefined)) continue;
      requested.set(key, isShown(listKey) ? list : undefined);
      void onRequestCardPage({ deckId: listKey, deckIds: deckIdsOf(listKey), page, pageSize: CARD_TABLE_PAGE_SIZE, query: deferredQuery, sort: cardSort, selectedCardId: null, searchContext });
    }
  }, [cardPages, cardSort, contentDeckId, contentTab, deferredQuery, hitList, hitScope, items, onRequestCardPage, pendingHit, searchContext, virtual.end, virtual.start]);
  // A changed search, sort or scope starts every list over.
  React.useEffect(() => { requestedPagesRef.current.clear(); }, [cardSort, deferredQuery, hitScope, searchContext]);

  // The open card loads with a page of its list: a shown page when there is one, so only the card is read.
  React.useEffect(() => {
    if (!onRequestCardPage || !selectedCardId || !selectedListKey) return;
    if (contentDeckId && contentTab !== "cards") return;
    const list = cardPages?.[selectedListKey];
    const shown = Boolean(list && list.query === deferredQuery && sameCardTableSort(list.sort, cardSort));
    if (shown && (list!.requestedCardId === selectedCardId || list!.loadError)) return;
    const loadedPage = shown ? Number(Object.keys(list!.pages)[0] ?? 0) : 0;
    void onRequestCardPage({
      deckId: selectedListKey,
      deckIds: selectedListKey === HIT_LIST_KEY ? hitScope : undefined,
      page: loadedPage,
      pageSize: CARD_TABLE_PAGE_SIZE,
      query: deferredQuery,
      sort: cardSort,
      selectedCardId,
      searchContext,
    });
  }, [cardPages, cardSort, contentDeckId, contentTab, deferredQuery, hitScope, onRequestCardPage, searchContext, selectedCardId, selectedListKey]);

  React.useEffect(() => {
    if (contentDeckId || hitList) return;
    if (!selectedDeckId) {
      autoExpandedSelectedDeckIdRef.current = null;
      return;
    }
    if (autoExpandedSelectedDeckIdRef.current === selectedDeckId) return;
    autoExpandedSelectedDeckIdRef.current = selectedDeckId;
    if (!expandedDeckIdSet.has(selectedDeckId)) setDeckCardsExpanded(selectedDeckId, true);
  }, [contentDeckId, expandedDeckIdSet, onSetDeckExpanded, selectedDeckId]);

  React.useEffect(() => {
    if (!detailOpen) return;
    previouslySelectedCardId.current = selectedCardId;
    const frame = window.requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>("[data-card-editor-heading]")?.focus() ?? detailRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [detailOpen, selectedCardId]);

  React.useEffect(() => {
    if (!detailOpen) return;

    // Nested dialogs and popovers handle their own Escape first (they prevent the default).
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || pendingDetailAction || pendingCardDelete) return;
      if (document.querySelector('[data-radix-popper-content-wrapper], [data-card-preview-overlay="true"]')) return;
      event.preventDefault();
      requestDetailAction(closeDetail);
    }

    // A click beside the delete question cancels it and also closes the editor (specs §5.3).
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!pendingCardDelete || !(target instanceof Element) || !target.matches('[data-testid="action-dialog-backdrop"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (deletingCard) return;
      setPendingCardDelete(null);
      requestDetailAction(closeDetail);
    }

    window.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
    };
  }, [deletingCard, detailOpen, pendingCardDelete, pendingDetailAction, selectedCardId, selectedDeckId]);

  function focusCardRow(cardId: string | null, preventScroll = false) {
    window.requestAnimationFrame(() => {
      const target = cardId ? document.querySelector<HTMLElement>('[data-testid="deck-card-' + cardId + '"]') : null;
      (target ?? document.querySelector<HTMLElement>("[data-screen-heading]"))?.focus({ preventScroll });
    });
  }

  function closeDetail() {
    const cardId = previouslySelectedCardId.current ?? selectedCardId;
    if (onCloseSelectedCard) {
      onCloseSelectedCard();
      return;
    }
    onSelectDeck(selectedDeckId);
    focusCardRow(cardId);
  }

  function requestDetailAction(run: () => void) {
    if (cardDraftGuardRef.current) {
      setPendingDetailAction({ run });
      return;
    }
    run();
  }

  function requestCardSelection(deckId: string, cardId: string) {
    requestDetailAction(() => {
      if (selectedDeckId === deckId && selectedCardId === cardId) closeDetail();
      else onSelectDeck(deckId, cardId);
    });
  }
  const stableRequestCardSelection = useStableCallback(requestCardSelection);

  // Prev/next walks every row of the list in table order (KV3); a row whose page is not loaded yet opens once it is.
  const selectedPosition = React.useMemo(() => selectedCardId && !onCloseSelectedCard ? cardItems.findIndex((item) => item.row?.id === selectedCardId) : -1, [cardItems, onCloseSelectedCard, selectedCardId]);
  const hits = React.useMemo<CardEditorHitNavigation | null>(() => {
    if (selectedPosition < 0) return null;
    const step = (item: (typeof cardItems)[number] | undefined) => item
      ? () => requestDetailAction(() => item.row ? onSelectDeck(item.row.entry.deckId, item.row.id, cardEditorTab) : setPendingHit({ listKey: item.listKey, index: item.index }))
      : null;
    return { position: selectedPosition + 1, total: cardItems.length, onPrevious: step(cardItems[selectedPosition - 1]), onNext: step(cardItems[selectedPosition + 1]) };
    // requestDetailAction and onSelectDeck read the latest state when they run.
  }, [cardEditorTab, cardItems, selectedPosition]);
  // The neighbouring hits load ahead once the open card is shown, so prev/next opens without waiting.
  React.useEffect(() => {
    if (selectedPosition < 0 || !selectedGraph) return;
    for (const item of [cardItems[selectedPosition + 1], cardItems[selectedPosition - 1]]) if (item?.row) cardEditor.prefetchCard(item.row.id);
  }, [cardEditor, cardItems, selectedGraph, selectedPosition]);
  React.useEffect(() => {
    if (!pendingHit) return;
    const item = cardItems.find((candidate) => candidate.listKey === pendingHit.listKey && candidate.index === pendingHit.index);
    if (!item?.row) return;
    setPendingHit(null);
    onSelectDeck(item.row.entry.deckId, item.row.id, cardEditorTab);
  }, [cardEditorTab, cardItems, onSelectDeck, pendingHit]);
  // The open card's row scrolls into view, e.g. after prev/next, so closing the editor lands on it.
  const selectedItemIndex = React.useMemo(() => selectedCardId ? items.findIndex((item) => item.kind === "card" && item.row?.id === selectedCardId) : -1, [items, selectedCardId]);
  React.useEffect(() => {
    if (selectedItemIndex >= 0) virtual.scrollToIndex(selectedItemIndex);
    // Only a newly selected row scrolls; later renders of the same selection leave the scroll position alone.
  }, [selectedCardId, selectedItemIndex >= 0]);

  async function savePendingDetailDraft() {
    const guard = cardDraftGuardRef.current;
    if (!pendingDetailAction || !guard) return;
    setSavingPendingDraft(true);
    try {
      if (!await guard.save()) return;
      const action = pendingDetailAction;
      setPendingDetailAction(null);
      action.run();
    } finally {
      setSavingPendingDraft(false);
    }
  }

  function discardPendingDetailDraft() {
    const action = pendingDetailAction;
    setPendingDetailAction(null);
    action?.run();
  }

  function changeSort(field: CardTableSortField) {
    setCardSort((current) => current.field === field
      ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field, direction: "asc" });
  }

  function toggleDeckCards(deckId: string) {
    setDeckCardsExpanded(deckId, contentDeckId ? collapsedContentDeckIds.has(deckId) : !expandedDeckIdSet.has(deckId));
  }

  function setDeckCardsExpanded(deckId: string, expanded: boolean) {
    if (contentDeckId) {
      setCollapsedContentDeckIds((current) => {
        const next = new Set(current);
        if (expanded) next.delete(deckId);
        else next.add(deckId);
        return next;
      });
      return;
    }
    setExpandedDeckIdSet((current) => {
      if (current.has(deckId) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(deckId);
      else next.delete(deckId);
      return next;
    });
    onSetDeckExpanded("deck-manager", deckId, expanded);
  }

  function requestCardDelete() {
    if (!selectedDeck || !selectedGraph) return;
    setPendingCardDelete({ deckId: selectedDeck.id, cardId: selectedGraph.cardId, graph: selectedGraph });
  }

  async function confirmCardDelete() {
    if (!pendingCardDelete || deletingCard) return;
    const deletion = pendingCardDelete;
    const description = noteTextIndex(deletion.graph.note.content).sortText || "Karte ohne Vorderseitentext";
    const contentRegion = document.querySelector<HTMLElement>('section[aria-label="Seiteninhalt"]');
    const contentBounds = contentRegion?.getBoundingClientRect();
    const visibleDeckHeader = contentRegion && contentBounds
      ? Array.from(contentRegion.querySelectorAll<HTMLElement>('[data-testid^="deck-header-"]'))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom >= contentBounds.top && bounds.top <= contentBounds.bottom;
        })
        .sort((left, right) => Math.abs(left.getBoundingClientRect().top - contentBounds.top - contentBounds.height / 2)
          - Math.abs(right.getBoundingClientRect().top - contentBounds.top - contentBounds.height / 2))[0]
      : null;
    const visibleDeckHeaderTop = visibleDeckHeader?.getBoundingClientRect().top;
    setDeletingCard(true);
    setDeckStatus("");
    setSuccessToast("");
    try {
      const result = await onDeleteNote(deletion.graph);
      if (!result?.deleted.note.deletedAt) throw new Error("Löschung fehlgeschlagen.");
      setDeletedCardUndo({ deckId: deletion.deckId, cardId: deletion.cardId, undo: result.undo, deleted: result.deleted, description });
      setPendingCardDelete(null);
      preserveToastForSelectionChange.current = true;
      onSelectDeck(deletion.deckId);
      setSuccessToast(deletion.graph.cards.length > 1 ? `Inhalt mit ${deletion.graph.cards.length} Karten wurde erfolgreich gelöscht.` : "Karte wurde erfolgreich gelöscht.");
      if (contentRegion && visibleDeckHeader && visibleDeckHeaderTop !== undefined) {
        window.requestAnimationFrame(() => {
          if (visibleDeckHeader.isConnected) {
            contentRegion.scrollTop += visibleDeckHeader.getBoundingClientRect().top - visibleDeckHeaderTop;
          }
        });
      }
      focusCardRow(null, true);
    } catch (error) {
      setDeckStatus(error instanceof Error ? `Die Karte konnte nicht sicher gelöscht werden: ${error.message}` : "Die Karte konnte nicht sicher gelöscht werden.");
      setDeckStatusType("alert");
    } finally {
      setDeletingCard(false);
    }
  }

  async function undoCardDelete() {
    if (!deletedCardUndo) return;
    try {
      const result = await onUndoDeleteNote(deletedCardUndo.undo, deletedCardUndo.deleted);
      if (!result) throw new Error("Undo fehlgeschlagen.");
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.cardId);
      setDeckStatus("");
      setDeckStatusType("status");
      setSuccessToast("Kartenlöschung wurde erfolgreich rückgängig gemacht.");
      setDeletedCardUndo(null);
    } catch {
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.cardId);
      setDeckStatus("Kartenlöschung lokal rückgängig gemacht; die Cloud-Synchronisierung steht noch aus.");
      setDeckStatusType("alert");
      setDeletedCardUndo(null);
    }
  }

  function selectFromEditor(deckId: string, cardId: string) {
    requestDetailAction(() => onSelectDeck(deckId, cardId, cardEditorTab));
  }

  /** A moved card stays open unless it left the opened deck tree; then the editor closes. */
  function handleCardMoved(deckId: string, cardId: string) {
    if (contentDeckId && !libraryDecks.some((deck) => deck.id === deckId)) {
      // The move's toast with `Rückgängig` outlives the closed editor; undo reopens the card in its former deck.
      preserveToastForSelectionChange.current = true;
      closeDetail();
      return;
    }
    onSelectDeck(deckId, cardId, cardEditorTab);
  }

  function renderDetailLayer() {
    if (selectedDeck && selectedGraph) {
      return (
        <CardEditorDialog
          key={selectedGraph.note.id}
          deck={selectedDeck}
          decks={decks}
          graph={selectedGraph}
          cardId={selectedGraph.cardId}
          tab={cardEditorTab}
          onTabChange={onCardEditorTabChange}
          hits={hits}
          syncConflict={syncConflictCardIds?.has(selectedGraph.cardId) ?? false}
          now={now}
          dayStartHour={dayStartHour}
          timeZone={timeZone}
          mediaUrls={selectedNoteMediaUrls}
          mediaStore={mediaStore}
          services={cardEditor}
          surfaceRef={detailRef}
          onSaveNote={onSaveNote}
          onSetStudyState={(cardId, patch) => onSetCardStudyState(selectedDeck.id, cardId, patch)}
          onDuplicateNote={() => onDuplicateNote(selectedGraph)}
          onDeleteNote={requestCardDelete}
          onRescheduleCards={onRescheduleCards}
          onGenerateVariant={(cardId) => onGenerateVariant(selectedDeck.id, cardId)}
          onUpdateVariant={onUpdateVariant}
          onSelectCard={selectFromEditor}
          onCardMoved={handleCardMoved}
          onOpenDeckSettings={onOpenDeckSettings}
          deckName={(deckId) => deckNameById.get(deckId) ?? "Unbekannter Stapel"}
          onClose={() => requestDetailAction(closeDetail)}
          onDraftStateChange={handleEditorDraftStateChange}
        />
      );
    }
    if (selectedCardLoading) {
      return (
        <CardEditorSurface label="Kartendetail" surfaceRef={detailRef}>
          <div className="px-3 pt-3 sm:px-6 sm:pt-4" data-testid="card-detail-loading">
            <div className="core-statistics-load-track" role="progressbar" aria-label="Karte wird geladen"><span aria-hidden="true" /></div>
          </div>
        </CardEditorSurface>
      );
    }
    return (
      <CardEditorSurface label="Kartendetail" surfaceRef={detailRef}>
        <div className="grid min-h-full place-items-center p-6">
          {selectedDeckMissing ? (
            <EmptyState
              icon={Layers}
              title="Stapel nicht gefunden"
              body="Der verlinkte Stapel ist nicht mehr verfügbar."
              action={<div className="flex flex-wrap justify-center gap-2"><ActionButton type="button" variant="primary" onClick={() => onOpenLearn(null)}>Zu Lernen</ActionButton><ActionButton type="button" variant="secondary" onClick={() => onSelectDeck(null)}>Alle Karten</ActionButton></div>}
            />
          ) : (
            <EmptyState
              icon={Layers}
              title={selectedPage?.loadError ? "Karte noch nicht geladen" : "Karte nicht gefunden"}
              body={selectedPage?.loadError ?? "Die verlinkte Karte ist in diesem Stapel nicht mehr verfügbar."}
              action={<div className="flex flex-wrap justify-center gap-2">
                {selectedPage?.loadError && selectedDeckId && onRequestCardPage ? (
                  <ActionButton type="button" variant="primary" onClick={() => onRequestCardPage({
                    deckId: selectedListKey ?? selectedDeckId,
                    deckIds: selectedListKey === HIT_LIST_KEY ? hitScope : undefined,
                    page: 0,
                    pageSize: CARD_TABLE_PAGE_SIZE,
                    query: selectedPage.query,
                    sort: selectedPage.sort,
                    selectedCardId,
                    searchContext,
                  })}>Erneut laden</ActionButton>
                ) : null}
                <ActionButton type="button" variant="secondary" onClick={closeDetail}>Zur Kartenliste</ActionButton>
              </div>}
            />
          )}
        </div>
      </CardEditorSurface>
    );
  }

  return (
    <div className="relative grid min-w-0 gap-6">
      {contentDeckId ? (
        <div className="grid min-w-0 gap-6" data-deck-content-navigation="true" ref={contentNavigationRef}>
          <nav className="core-deck-folder-breadcrumb" aria-label="Stapelpfad" data-testid="deck-content-path">
            <button type="button" onClick={() => requestDetailAction(() => onOpenLearn(null))}>Alle Stapel</button>
            {contentTrail.map((row) => <React.Fragment key={row.id}>
              <ChevronRight size={16} aria-hidden="true" />
              {row.id === contentDeckId ? <span aria-current="page">{row.name}</span> : <button type="button" onClick={() => requestDetailAction(() => onOpenDeckContent(row.id, "children"))}>{row.name}</button>}
            </React.Fragment>)}
          </nav>
          <div className="flex min-w-0 items-center justify-between gap-3" data-testid="deck-content-heading">
            <div className="flex min-w-0 items-center gap-3">
              {contentDeck ? <DeckAppearanceIcon deck={contentDeck} className="size-11 shrink-0 rounded-control bg-core-subtle" iconSize={22} /> : null}
              <h2 className="min-w-0 break-words core-heading-1 text-core-text outline-none" data-screen-heading tabIndex={-1}>{contentDeck?.name ?? "Stapelinhalte"}</h2>
            </div>
            <CoreTooltip label={contentRow?.parentDeckId ? "Eine Ebene zurück" : "Zur Stapelübersicht"}>
              <IconButton label={contentRow?.parentDeckId ? "Eine Ebene zurück" : "Zur Stapelübersicht"} icon={ArrowLeft}
                onClick={() => requestDetailAction(() => contentRow?.parentDeckId ? onOpenDeckContent(contentRow.parentDeckId, "children") : onOpenLearn(null))} />
            </CoreTooltip>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start" data-testid="deck-content-actions">
            <div className="core-deck-content-tab-scroll" ref={contentTabsRef}>
              <CoreSlidingTabs className="core-deck-content-tabs" ariaLabel="Stapelinhalte" options={deckContentTabs} value={contentTab}
                onValueChange={(tab) => requestDetailAction(() => onOpenDeckContent(contentDeckId, tab))} />
            </div>
            {contentDeck ? <ActionButton variant="primary" icon={Play} disabled={!hasStudyCards} className="shrink-0 sm:mt-1"
              onClick={() => requestDetailAction(() => onStartDeck(contentDeck))} data-testid="deck-content-study">Karten lernen</ActionButton> : null}
          </div>
        </div>
      ) : <LearningAreaHeader area="cards" onOpenCardSettings={onOpenCardSettings} />}

      {contentDeckId && contentTab === "children" ? (
        contentRow && contentLibrary ? contentRow.hasChildren ? <DeckSubstacksPanel key={contentRow.id} rows={contentLibrary.rows} current={contentRow}
          onOpenDeck={(id) => onOpenDeckContent(id, "children")}
          onStudy={onStartDeck} onOpenSettings={onOpenDeckSettings} onSetCoreMode={onSetDeckCoreMode} onMoveDeck={onMoveDeck} />
          : <DeckContentPlaceholder label="Unterstapel" icon={Layers} title="Keine Unterstapel" testId="deck-content-substacks"
            action={<ActionButton variant="secondary" icon={Play} disabled={!hasStudyCards} onClick={() => onStartDeck(contentRow.deck)}>Karten lernen</ActionButton>} />
          : <EmptyState icon={Layers} title="Stapel nicht gefunden oder nicht verfügbar." />
      ) : contentDeckId && contentTab === "summary" ? (
        contentDeck ? <DeckSummariesPanel key={`${summaryAccountId ?? contentDeck.ownerId}:${contentDeck.id}`} deck={contentDeck}
          userId={summaryAccountId ?? contentDeck.ownerId} cloud={learningContentCloud} onGenerateSummary={onGenerateSummary} onDraftStateChange={handleEditorDraftStateChange} />
          : <EmptyState icon={FileText} title="Stapel nicht gefunden oder nicht verfügbar." />
      ) : contentDeckId && contentTab === "mind-map" ? (
        contentDeck ? <DeckMindMapsPanel key={`${summaryAccountId ?? contentDeck.ownerId}:${contentDeck.id}`} deck={contentDeck}
          userId={summaryAccountId ?? contentDeck.ownerId} cloud={learningContentCloud} onGenerateSummary={onGenerateSummary} onDraftStateChange={handleEditorDraftStateChange} />
          : <EmptyState icon={Network} title="Stapel nicht gefunden oder nicht verfügbar." />
      ) : contentDeckId && contentTab !== "cards" ? (
        <DeckContentPlaceholder label={selectedContentTab.label} icon={selectedContentTab.icon} title="Demnächst verfügbar" />
      ) : <SoftPanel className="min-w-0 overflow-clip p-5 sm:p-6" aria-label="Karten" data-testid="card-library-panel">
        <div className="grid gap-6">
          <div className="grid gap-4">
            <CardSearchBar
              query={query}
              onQueryChange={changeQuery}
              decks={libraryDecks}
              categories={searchMenu}
              advancedOpen={advancedSearchOpen}
              onAdvancedOpenChange={setAdvancedSearchOpen}
              advancedId="advanced-card-search"
              resultCount={searchResultCount}
              placeholder={contentDeckId ? "Vorderseite, Rückseite, Felder oder Tags durchsuchen" : "Stapel, Vorderseite, Rückseite, Felder oder Tags durchsuchen"}
              hint={unsupportedTerms.length ? `Noch nicht unterstützt, wird als Text gesucht: ${unsupportedTerms.join(" ")}` : undefined}
            >
              {advancedSearchOpen ? (
                <AdvancedCardSearch
                  id="advanced-card-search"
                  query={query}
                  onQueryChange={changeQuery}
                  categories={searchMenu}
                  resultCount={searchResultCount}
                  onClose={() => setAdvancedSearchOpen(false)}
                  savedSearches={savedSearches}
                  onSavedSearchesChange={onSavedSearchesChange}
                />
              ) : null}
            </CardSearchBar>
            {cardSearchTermState(query, "has:variant") === "out" && contentDeck && onGenerateDeckVariants ? (
              <ActionButton type="button" variant="secondary" icon={Sparkles} disabled={variantGenerationRunning} className="justify-self-start" onClick={() => onGenerateDeckVariants(contentDeck)}>
                Für diese Karten Varianten generieren
              </ActionButton>
            ) : null}
            {deckStatus ? <p className={"core-body font-semibold " + (deckStatusType === "alert" ? "core-status-error" : "core-status-info")} role={deckStatusType}>{deckStatus}</p> : null}
            {deletedCardUndo ? (
              <div className="flex flex-wrap items-center gap-3 rounded-panel border border-core-border bg-core-subtle px-4 py-3">
                <p className="min-w-0 flex-1 truncate core-body text-core-text">„{deletedCardUndo.description}“ gelöscht.</p>
                <ActionButton type="button" variant="secondary" icon={RotateCcw} onClick={() => void undoCardDelete()}>Rückgängig</ActionButton>
              </div>
            ) : null}
          </div>

          {hitList ? <MatchingDecks groups={tableModel.groups.filter((group) => group.deckMatches)} onOpen={(deckId) => changeQuery(withCardSearchTermState(cardSearchTerms(query).filter((term) => !/^-?did:/i.test(term)).join(" "), `did:${deckId}`, "in"))} /> : null}
          {items.length ? (
            <div className="min-w-0 max-w-full overflow-clip rounded-panel border border-core-border bg-core-surface">
          <table className="w-full table-fixed border-collapse" data-testid="card-library-table" aria-busy={cardsLoading || undefined} aria-rowcount={items.length}>
              <colgroup>
                <col />
                <col className="w-20 sm:w-[5.75rem]" />
                <col className="w-20" />
              </colgroup>
              {/* From xl the screen region scrolls; its top padding (xl:py-10 in App) would otherwise hold the header 40 px low. */}
              <thead className="sticky top-[var(--core-card-table-sticky-top)] z-10 bg-core-surface xl:-top-10" style={{ "--core-card-table-sticky-top": `${mobileHeaderHeight}px` } as React.CSSProperties}>
                <tr className="core-table-header-row h-10 border-b border-core-border">
                  <SortHeader field="sortField" label="Sortierfeld" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="nextStudyDate" label="Datum" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="variants" label="Variante" sort={cardSort} onChange={changeSort} />
                </tr>
                {cardsLoading ? (
                  <tr aria-hidden="true">
                    <td colSpan={3} className="p-0">
                      <div className="core-statistics-load-track !mt-0" data-testid="card-library-loading"><span /></div>
                    </td>
                  </tr>
                ) : null}
              </thead>
              <tbody ref={virtual.listRef as React.Ref<HTMLTableSectionElement>} data-testid="card-library-rows" className={cardsLoading ? "[&>tr[data-card-row]]:opacity-60" : undefined}>
                {virtual.paddingTop > 0 ? <tr aria-hidden="true" style={{ height: virtual.paddingTop }} /> : null}
                {items.slice(virtual.start, virtual.end + 1).map((item) => {
                  if (item.kind === "header") {
                    const { group, expanded } = item;
                    return (
                      <tr
                        key={item.key}
                        data-virtual-key={item.key}
                        data-testid={"deck-header-" + group.id}
                        data-deck-depth={item.depth}
                        className="core-deck-summary-row"
                        style={selectedDeckId === group.id ? { backgroundColor: "var(--core-info-surface)" } : undefined}
                      >
                        <th scope="row" colSpan={3} className="relative px-3 text-left">
                          <button
                            type="button"
                            data-testid={"deck-toggle-" + group.id}
                            aria-expanded={expanded}
                            aria-label={expanded ? `Karten von ${group.path} einklappen` : `Karten von ${group.path} aufklappen`}
                            onClick={() => toggleDeckCards(group.id)}
                            data-deck-row-activation="true"
                            className="absolute inset-0 z-0 cursor-pointer transition-colors hover:bg-[var(--core-focus-ring-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-core-focus"
                          />
                          <DeckSummaryRow
                            row={group}
                            leadingControl={(
                              <span className="grid size-9 shrink-0 place-items-center text-core-action" aria-hidden="true">
                                {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                              </span>
                            )}
                            actions={<DeckOptionsMenu row={group} decks={decks} onSetCoreMode={onSetDeckCoreMode} onOpenSettings={onOpenDeckSettings} onMoveDeck={onMoveDeck} />}
                            density="responsive"
                          />
                        </th>
                      </tr>
                    );
                  }
                  if (item.kind === "notice") {
                    return (
                      <tr key={item.key} data-virtual-key={item.key} className="border-b border-core-border bg-core-warning-soft">
                        <td colSpan={3} className="px-3 py-2.5 core-caption text-core-secondary sm:px-4">
                          Offline werden nur bereits lokal indexierte Karten durchsucht und sortiert.
                        </td>
                      </tr>
                    );
                  }
                  if (item.kind === "empty") {
                    return (
                      <tr key={item.key} data-virtual-key={item.key} className="border-b border-core-border bg-core-surface">
                        <td colSpan={3} className="px-3 py-2.5 core-body text-core-muted sm:px-4">Keine Karten</td>
                      </tr>
                    );
                  }
                  if (!item.row) {
                    return (
                      <tr key={item.key} data-virtual-key={item.key} aria-hidden="true" className="border-b border-core-border bg-core-surface" data-card-placeholder="true">
                        <td colSpan={3} className="px-3 py-2.5 sm:px-4">
                          <span className="block h-5 w-2/3 rounded-inset bg-core-subtle" />
                        </td>
                      </tr>
                    );
                  }
                  const { entry: card, frontPreview, nextStudyLabel } = item.row;
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
                      flagNames={cardEditor.flagNames}
                      syncConflict={Boolean(syncConflictCardIds?.has(card.id))}
                      depth={item.depth}
                      deckPath={item.listKey === HIT_LIST_KEY ? deckPathById.get(card.deckId) : undefined}
                      onSelect={stableRequestCardSelection}
                    />
                  );
                })}
                {virtual.paddingBottom > 0 ? <tr aria-hidden="true" style={{ height: virtual.paddingBottom }} /> : null}
              </tbody>
          </table>
            </div>
          ) : (
            <div className="grid justify-items-center gap-3 rounded-panel border border-core-border p-6 text-center sm:p-8" role="status">
              <span className="grid size-12 place-items-center rounded-control bg-core-subtle text-core-action" aria-hidden="true"><Search size={22} /></span>
              <h4 className="core-heading-3 text-core-text">Keine Karten gefunden</h4>
              <p className="core-body text-core-secondary">Passe die Suche an.</p>
            </div>
          )}
        </div>
      </SoftPanel>}
      {detailOpen ? renderDetailLayer() : null}

      <ActionDialog
        open={Boolean(pendingDetailAction)}
        title="Änderungen übernehmen?"
        description="Du hast ungespeicherte Änderungen in diesem Entwurf. Speichere oder verwirf sie, bevor du den Editor verlässt."
        confirmLabel="Speichern"
        cancelLabel="Weiter bearbeiten"
        discardLabel="Verwerfen"
        confirmLoading={savingPendingDraft}
        restoreFocus={(reason) => {
          if (reason === "cancel") cardDraftGuardRef.current?.focus();
        }}
        onCancel={() => setPendingDetailAction(null)}
        onDiscard={discardPendingDetailDraft}
        onConfirm={() => void savePendingDetailDraft()}
      />
      <ActionDialog
        open={Boolean(pendingCardDelete)}
        title={pendingCardDelete && pendingCardDelete.graph.cards.length > 1 ? `Inhalt mit ${pendingCardDelete.graph.cards.length} Karten löschen?` : "Karte löschen?"}
        description={pendingCardDelete && pendingCardDelete.graph.cards.length > 1
          ? "Alle Karten dieses Inhalts werden auf allen Geräten gelöscht, auch in anderen Stapeln."
          : "Die Karte wird auf allen Geräten gelöscht."}
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        destructive
        confirmLoading={deletingCard}
        onCancel={() => {
          if (!deletingCard) setPendingCardDelete(null);
        }}
        onConfirm={() => void confirmCardDelete()}
      />
    </div>
  );
}
