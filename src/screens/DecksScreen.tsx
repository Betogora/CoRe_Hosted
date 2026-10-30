import React from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Layers, Minus, Network, NotebookPen, PanelsTopLeft, Play, RotateCcw, Search, Snail, Sparkles, Star, CircleHelp, X } from "lucide-react";
import type { CardDraftGuard, DecksScreenProps } from "../appScreenProps.ts";
export type { DecksCardPage, DecksCardPageRequest } from "../appScreenProps.ts";
export type DecksScreenCardPageProps = Pick<DecksScreenProps, "cardPages" | "onRequestCardPage">;
import { noteTextIndex } from "../coreModel.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { getVisibleDeckDepth } from "../deckHierarchy.ts";
import { CARD_TABLE_PAGE_SIZE, createCardTableModel, createDeckLibraryModel, createPagedCardTableModel, DEFAULT_CARD_TABLE_SORT, sameCardTableSort, type CardTableSort, type CardTableSortField } from "../libraryModel.ts";
import type { CardCatalogEntry, NoteGraph } from "../workspaceReplica.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { ActionDialog, CoreSegmentedControl, CoreSlidingTabs, EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { DeckOptionsMenu } from "../ui/DeckOptionsMenu.tsx";
import { DeckSummaryRow } from "../ui/DeckSummaryRow.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { FlagDot, flagName } from "../ui/flagUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { TagInput } from "../ui/TagInput.tsx";
import { readCardSearchFilters, withCardSearchFilter } from "../cardSearchQuery.ts";
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

const VARIANT_FILTER_SORT: CardTableSort = { field: "variants", direction: "asc" };

interface CardTableRowViewProps {
  deckId: string;
  card: CardCatalogEntry;
  frontPreview: string;
  nextStudyLabel: string;
  selected: boolean;
  marked: boolean;
  flag: number;
  flagNames: readonly string[];
  syncConflict: boolean;
  onSelect: (deckId: string, cardId: string) => void;
}

/** One card row of the table; memoized so a page of up to 50 rows does not repaint on unrelated state changes. */
const CardTableRowView = React.memo(function CardTableRowView({ deckId, card, frontPreview, nextStudyLabel, selected, marked, flag, flagNames, syncConflict, onSelect }: CardTableRowViewProps) {
  const suspended = !card.reviewable;
  return (
    <tr
      onClick={() => onSelect(deckId, card.id)}
      className={`cursor-pointer border-b border-core-border transition ${suspended ? "bg-core-warning-soft hover:bg-core-warning-soft" : selected ? "bg-core-info-soft hover:bg-core-subtle" : "bg-core-surface hover:bg-core-subtle"} ${selected ? "core-card-row-selected" : ""}`}
      data-selected={selected ? "true" : undefined}
      data-suspended={suspended ? "true" : undefined}
      data-card-row="true"
    >
      <td className="min-w-0 px-2 py-1 align-middle sm:px-3 md:px-4">
        <button
          type="button"
          data-testid={"deck-card-" + card.id}
          aria-pressed={selected}
          className="block !min-h-0 w-full truncate text-left core-body font-semibold text-core-text focus-visible:rounded-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(deckId, card.id);
          }}
        >
          {frontPreview}
          {syncConflict ? <span className="ml-2 rounded-inset bg-core-warning-soft px-2 py-0.5 core-caption text-core-text">Synchronisierung klären</span> : null}
        </button>
      </td>
      <td className="min-w-0 whitespace-nowrap px-1 py-1 text-right align-middle core-body text-core-secondary">
        {nextStudyLabel}
        {suspended ? <span className="sr-only"> · Ausgesetzt</span> : null}
      </td>
      <td className="min-w-0 px-1 py-1 text-right align-middle">
        <span className="inline-flex items-center justify-end gap-1 align-middle">
          {card.activeVariantCount > 0
            ? <span className="min-w-[1.125rem] text-center core-body font-semibold text-core-secondary" aria-label={card.activeVariantCount === 1 ? "1 aktive Variante" : `${card.activeVariantCount} aktive Varianten`}>{card.activeVariantCount}</span>
            : <Minus size={18} className="shrink-0 text-core-muted" role="img" aria-label="Keine Variante" />}
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
  const ContentIcon = selectedContentTab.icon;
  const [query, setQuery] = React.useState("");
  const [deferredQuery, setDeferredQuery] = React.useState("");
  // Flag, leech and tag filters are search terms in the query (Anki notation), so search and filters stay one state.
  const searchFilters = React.useMemo(() => readCardSearchFilters(query), [query]);
  const flagFilterOptions = React.useMemo(() => [
    { value: "any", label: "Alle Flaggen" },
    { value: "0", label: "Ohne Flagge" },
    ...[1, 2, 3, 4, 5, 6, 7].map((flag) => ({ value: String(flag), label: `Flagge ${flagName(flag, cardEditor.flagNames)}` })),
  ], [cardEditor.flagNames]);
  function changeQuery(next: string) {
    setQuery(next);
    setCardPageByDeckId({});
  }
  React.useEffect(() => {
    if (query === deferredQuery) return;
    const timer = window.setTimeout(() => setDeferredQuery(query), CARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, query]);
  const [cardPageByDeckId, setCardPageByDeckId] = React.useState<Record<string, number>>({});
  const [chosenSort, setChosenSort] = React.useState<CardTableSort>(DEFAULT_CARD_TABLE_SORT);
  const [withoutVariants, setWithoutVariants] = React.useState(false);
  // Neither the local catalog nor the cloud search filter by variants; sorting cards without one first and
  // cutting at the first card with a variant gives the same rows on both paths.
  const cardSort = React.useMemo<CardTableSort>(() => withoutVariants ? VARIANT_FILTER_SORT : chosenSort, [chosenSort, withoutVariants]);
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
  const [pendingHit, setPendingHit] = React.useState<{ deckId: string; page: number; edge: "first" | "last" } | null>(null);
  const previouslySelectedCardId = React.useRef<string | null>(null);
  const autoExpandedSelectedDeckIdRef = React.useRef<string | null>(null);
  const usesCardPages = cardPages !== undefined || Boolean(onRequestCardPage);
  const tableModel = React.useMemo(() => {
    if (!usesCardPages) {
      return createCardTableModel(libraryDecks, { query: deferredQuery, cardSort, cardPageByDeckId, now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries });
    }
    return createPagedCardTableModel(libraryDecks, cardPages, {
      query: deferredQuery, cardSort, cardPageByDeckId, withoutVariants, awaitingPages: Boolean(onRequestCardPage),
      now, dayStartHour, learnAheadMinutes, timeZone, deckSummaries,
    });
  }, [cardPageByDeckId, cardPages, cardSort, dayStartHour, deckSummaries, libraryDecks, deferredQuery, learnAheadMinutes, now, onRequestCardPage, timeZone, usesCardPages, withoutVariants]);
  const searchExpandsGroups = Boolean(deferredQuery.trim());
  const [expandedDeckIdSet, setExpandedDeckIdSet] = React.useState(() => new Set(expandedDeckIds));
  const [collapsedContentDeckIds, setCollapsedContentDeckIds] = React.useState(() => new Set<string>());
  const groupById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group])), [tableModel.allGroups]);
  const deckNameById = React.useMemo(() => new Map(decks.map((deck) => [deck.id, deck.name])), [decks]);
  const selectedContentDeckId = React.useMemo(() => {
    if (!contentDeckId || !selectedCardId) return null;
    for (const group of tableModel.allGroups) {
      if (cardPages?.[group.id]?.selected?.cardId === selectedCardId) return group.id;
      if (group.cardRows.some((row) => row.id === selectedCardId)) return group.id;
    }
    return null;
  }, [cardPages, contentDeckId, selectedCardId, tableModel.allGroups]);
  const selectedDeckId = selectedContentDeckId ?? focusedDeckId;
  const selectedGroup = selectedDeckId ? groupById.get(selectedDeckId) ?? null : null;
  const selectedDeck = selectedGroup?.deck ?? null;
  const selectedPage = selectedDeckId ? cardPages?.[selectedDeckId] : undefined;
  const selectedGraph = selectedPage?.selected?.cardId === selectedCardId ? selectedPage?.selected ?? null : null;
  const selectedDeckMissing = Boolean(selectedDeckId && !selectedDeck);
  const selectedCardMissing = Boolean(selectedDeck && selectedCardId && !selectedGraph);
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

  React.useEffect(() => {
    if (!onRequestCardPage) return;
    if (contentDeckId && contentTab !== "cards") return;
    const requestedGroups = tableModel.allGroups.filter((group) => (
      Boolean(contentDeckId) || searchExpandsGroups || expandedDeckIdSet.has(group.id) || selectedDeckId === group.id
    ));
    for (const group of requestedGroups) {
      const page = Math.max(0, cardPageByDeckId[group.id] ?? cardPages?.[group.id]?.page ?? 0);
      const selectedCardForDeck = selectedDeckId === group.id ? selectedCardId : null;
      const current = cardPages?.[group.id];
      const hasSelectedCard = !selectedCardForDeck || current?.selected?.cardId === selectedCardForDeck;
      if (current
        && current.page === page
        && current.query === deferredQuery
        && sameCardTableSort(current.sort, cardSort)
        && (hasSelectedCard || Boolean(current.loadError))) continue;
      void onRequestCardPage({
        deckId: group.id,
        page,
        pageSize: CARD_TABLE_PAGE_SIZE,
        query: deferredQuery,
        sort: cardSort,
        selectedCardId: selectedCardForDeck,
      });
    }
  }, [cardPageByDeckId, cardPages, cardSort, contentDeckId, contentTab, deferredQuery, expandedDeckIdSet, onRequestCardPage, searchExpandsGroups, selectedCardId, selectedDeckId, tableModel.allGroups]);

  React.useEffect(() => {
    if (contentDeckId) return;
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

  // Prev/next walks the loaded rows of the expanded groups; at a page end it loads the neighbouring page (B2).
  const hitRows = React.useMemo(() => {
    if (onCloseSelectedCard || !selectedCardId) return null;
    const rows: Array<{ deckId: string; cardId: string; position: number; index: number; group: (typeof tableModel.groups)[number] }> = [];
    let offset = 0;
    for (const group of tableModel.groups) {
      const expanded = searchExpandsGroups || (contentDeckId ? !collapsedContentDeckIds.has(group.id) : expandedDeckIdSet.has(group.id));
      if (!expanded) continue;
      group.cardRows.forEach((row, index) => rows.push({ deckId: group.id, cardId: row.entry.id, position: offset + group.page * group.pageSize + index + 1, index, group }));
      offset += group.totalCardCount;
    }
    return { rows, total: offset };
  }, [collapsedContentDeckIds, contentDeckId, expandedDeckIdSet, onCloseSelectedCard, searchExpandsGroups, selectedCardId, tableModel.groups]);
  const hits = React.useMemo<CardEditorHitNavigation | null>(() => {
    const index = hitRows?.rows.findIndex((row) => row.cardId === selectedCardId) ?? -1;
    if (!hitRows || index < 0) return null;
    const current = hitRows.rows[index];
    const select = (row: { deckId: string; cardId: string } | undefined) => row ? () => requestDetailAction(() => onSelectDeck(row.deckId, row.cardId, cardEditorTab)) : null;
    const loadPage = (page: number, edge: "first" | "last") => () => requestDetailAction(() => {
      setPendingHit({ deckId: current.deckId, page, edge });
      setCardPageByDeckId((pages) => ({ ...pages, [current.deckId]: page }));
    });
    const lastOnPage = current.index === current.group.cardRows.length - 1;
    return {
      position: current.position,
      total: hitRows.total,
      onPrevious: current.index === 0 && current.group.page > 0 ? loadPage(current.group.page - 1, "last") : select(hitRows.rows[index - 1]),
      onNext: lastOnPage && current.group.page + 1 < current.group.pageCount ? loadPage(current.group.page + 1, "first") : select(hitRows.rows[index + 1]),
    };
    // requestDetailAction and onSelectDeck read the latest state when they run.
  }, [cardEditorTab, hitRows, selectedCardId]);
  React.useEffect(() => {
    if (!pendingHit) return;
    const group = tableModel.groups.find((candidate) => candidate.id === pendingHit.deckId);
    if (!group || group.page !== pendingHit.page || !group.cardRows.length || cardPages?.[group.id]?.page !== pendingHit.page) return;
    setPendingHit(null);
    const row = pendingHit.edge === "first" ? group.cardRows[0] : group.cardRows.at(-1)!;
    onSelectDeck(group.id, row.entry.id, cardEditorTab);
  }, [cardEditorTab, cardPages, onSelectDeck, pendingHit, tableModel.groups]);

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
    setCardPageByDeckId({});
    setWithoutVariants(false);
    setChosenSort((current) => current.field === field
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
                    deckId: selectedDeckId,
                    page: selectedPage.page,
                    pageSize: CARD_TABLE_PAGE_SIZE,
                    query: selectedPage.query,
                    sort: selectedPage.sort,
                    selectedCardId,
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
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3" data-testid="deck-content-heading">
            <div className="flex min-w-0 items-center gap-3">
              {contentDeck ? <DeckAppearanceIcon deck={contentDeck} className="size-11 shrink-0 rounded-control bg-core-subtle" iconSize={24} /> : null}
              <h2 className="min-w-0 break-words core-heading-2 text-core-text outline-none" data-screen-heading tabIndex={-1}>{contentDeck?.name ?? "Stapelinhalte"}</h2>
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
      ) : <LearningAreaHeader area="cards" onOpenCardSettings={onOpenCardSettings} onAreaChange={(area) => {
        if (area === "overview") onOpenLearn(selectedDeckId);
      }} />}

      {contentDeckId && contentTab === "children" ? (
        contentRow && contentLibrary ? <DeckSubstacksPanel rows={contentLibrary.rows} current={contentRow} decks={decks} hasStudyCards={hasStudyCards}
          onOpenSubstack={(id) => onOpenDeckContent(id, "children")} onOpenCards={(id) => onOpenDeckContent(id, "cards")}
          onStudy={onStartDeck} onOpenSettings={onOpenDeckSettings} onSetCoreMode={onSetDeckCoreMode} onMoveDeck={onMoveDeck} />
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
        <SoftPanel aria-label={selectedContentTab.label} className="flex min-h-[214px] items-center justify-center p-6 sm:p-10">
          <div className="flex min-w-0 flex-col items-center gap-4 text-center" role="status">
            <span className="grid size-14 place-items-center rounded-panel bg-core-subtle text-core-muted"><ContentIcon size={28} strokeWidth={2} aria-hidden="true" /></span>
            <p className="core-body-large text-core-muted">Demnächst verfügbar</p>
          </div>
        </SoftPanel>
      ) : <SoftPanel className="min-w-0 overflow-hidden p-4 sm:p-6" aria-labelledby={contentDeckId ? undefined : "card-library-heading"} aria-label={contentDeckId ? "Karten" : undefined} data-testid="card-library-panel">
        <div className="grid gap-6">
          {!contentDeckId ? <h3 id="card-library-heading" className="flex min-h-control items-center whitespace-nowrap core-heading-3 font-semibold text-core-text">Aktive Stapel</h3> : null}
          <div className="grid gap-3">
            <label className="grid min-w-0 gap-2 core-body font-semibold text-core-secondary">
                Karten durchsuchen
                <span className="flex min-h-control min-w-0 items-center gap-2 rounded-control border border-core-border bg-core-surface px-3 font-normal text-core-muted transition">
                  <Search size={17} aria-hidden="true" />
                  <input className="min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none" value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={contentDeckId ? "Vorderseite, Rückseite oder Tags suchen" : "Stapel, Vorderseite, Rückseite oder Tags suchen"} aria-label="Karten durchsuchen" />
                </span>
              </label>
            <div className="flex flex-wrap items-center gap-3">
              <CoreSegmentedControl
                ariaLabel="Karten nach Variante filtern"
                value={withoutVariants ? "without" : "all"}
                options={[{ value: "all", label: "Alle Karten" }, { value: "without", label: "Ohne Variante" }]}
                onValueChange={(value) => { setWithoutVariants(value === "without"); setCardPageByDeckId({}); }}
              />
              <CoreSelect
                ariaLabel="Nach Flagge filtern"
                value={searchFilters.flag === null ? "any" : String(searchFilters.flag)}
                options={flagFilterOptions}
                onValueChange={(value) => changeQuery(withCardSearchFilter(query, "flag", value === "any" ? null : Number(value)))}
              />
              <button
                type="button"
                aria-pressed={searchFilters.leech}
                className="core-action-secondary aria-pressed:border-core-action aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action"
                onClick={() => changeQuery(withCardSearchFilter(query, "leech", !searchFilters.leech))}
              >
                <Snail size={16} aria-hidden="true" />Lernbremse
              </button>
              <div className="min-w-0 flex-1 basis-56">
                <TagInput
                  tags={searchFilters.tags}
                  loadDirectory={cardEditor.listTagDirectory}
                  label="Nach Tags filtern"
                  labelHidden
                  placeholder="Nach Tag filtern"
                  onChange={(tags) => changeQuery(withCardSearchFilter(query, "tags", tags))}
                />
              </div>
              {withoutVariants && contentDeck && onGenerateDeckVariants ? (
                <ActionButton type="button" variant="secondary" icon={Sparkles} disabled={variantGenerationRunning} onClick={() => onGenerateDeckVariants(contentDeck)}>
                  Für diese Karten Varianten generieren
                </ActionButton>
              ) : null}
            </div>
            {deckStatus ? <p className={"core-body font-semibold " + (deckStatusType === "alert" ? "core-status-error" : "core-status-info")} role={deckStatusType}>{deckStatus}</p> : null}
            {deletedCardUndo ? (
              <div className="flex flex-wrap items-center gap-3 rounded-control border border-core-border bg-core-subtle p-3">
                <p className="min-w-0 flex-1 truncate core-body text-core-text">„{deletedCardUndo.description}“ gelöscht.</p>
                <ActionButton type="button" variant="secondary" icon={RotateCcw} onClick={() => void undoCardDelete()}>Rückgängig</ActionButton>
              </div>
            ) : null}
          </div>

          {tableModel.groups.length ? (
            <div className="min-w-0 max-w-full overflow-hidden rounded-panel border border-core-border">
          <table className="w-full table-fixed border-collapse" data-testid="card-library-table">
              <colgroup>
                <col />
                <col className="w-20 sm:w-[5.75rem]" />
                <col className="w-20" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-core-surface">
                <tr className="core-table-header-row border-b border-core-border">
                  <SortHeader field="sortField" label="Sortierfeld" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="nextStudyDate" label="Datum" sort={cardSort} onChange={changeSort} />
                  <SortHeader field="variants" label="Variante" sort={cardSort} onChange={changeSort} />
                </tr>
              </thead>
              {tableModel.groups.map((group) => {
                const expanded = searchExpandsGroups || (contentDeckId ? !collapsedContentDeckIds.has(group.id) : expandedDeckIdSet.has(group.id));
                const visibleDepth = getVisibleDeckDepth(group.depth);
                const groupLeadingControl = (
                  <span className="grid size-9 shrink-0 place-items-center text-core-action" aria-hidden="true">
                    {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                  </span>
                );
                const groupActions = (
                  <DeckOptionsMenu
                    row={group}
                    decks={decks}
                    onSetCoreMode={onSetDeckCoreMode}
                    onOpenSettings={onOpenDeckSettings}
                    onMoveDeck={onMoveDeck}
                  />
                );
                return (
                <tbody key={group.id} id={"deck-card-list-" + group.id} data-testid={"card-group-" + group.id}>
                  {!contentDeckId || libraryDecks.length > 1 ? <tr
                    data-testid={"deck-header-" + group.id}
                    data-deck-depth={visibleDepth}
                    className="core-deck-summary-row"
                    style={selectedDeckId === group.id ? { backgroundColor: "var(--core-info-surface)" } : undefined}
                  >
                    <th scope="rowgroup" colSpan={3} className="relative px-3 text-left">
                      <button
                        type="button"
                        data-testid={"deck-toggle-" + group.id}
                        aria-expanded={expanded}
                        aria-controls={"deck-card-list-" + group.id}
                        aria-label={expanded ? `Karten von ${group.path} einklappen` : `Karten von ${group.path} aufklappen`}
                        onClick={() => toggleDeckCards(group.id)}
                        data-deck-row-activation="true"
                        className="absolute inset-0 z-0 cursor-pointer transition-colors hover:bg-[var(--core-focus-ring-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-core-focus"
                      />
                      <DeckSummaryRow
                        row={group}
                        leadingControl={groupLeadingControl}
                        actions={groupActions}
                        density="responsive"
                      />
                    </th>
                  </tr> : null}
                  {expanded && cardPages?.[group.id]?.limitedToLocalCatalog ? (
                    <tr className="border-b border-core-border bg-core-warning-soft">
                      <td colSpan={3} className="px-4 py-2 core-caption text-core-secondary">
                        Offline werden nur bereits lokal indexierte Karten durchsucht und sortiert.
                      </td>
                    </tr>
                  ) : null}
                  {expanded && group.cardRows.length ? <>{group.cardRows.map(({ entry: card, frontPreview, nextStudyLabel }) => (
                    <CardTableRowView
                      key={card.id}
                      deckId={group.id}
                      card={card}
                      frontPreview={frontPreview}
                      nextStudyLabel={nextStudyLabel}
                      selected={selectedCardId === card.id}
                      marked={selectedGraph?.note.id === card.noteId ? selectedGraph.note.marked : card.marked}
                      flag={selectedGraph?.cards.find((candidate) => candidate.id === card.id)?.ankiFlag ?? card.ankiFlag}
                      flagNames={cardEditor.flagNames}
                      syncConflict={Boolean(syncConflictCardIds?.has(card.id))}
                      onSelect={stableRequestCardSelection}
                    />
                  ))}{group.pageCount > 1 ? (
                    <tr className="border-b border-core-border bg-core-surface" data-testid={`card-page-${group.id}`}>
                      <td colSpan={3} className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <CoreTooltip label="Vorherige Seite anzeigen">
                            <button type="button" aria-label="Vorherige Seite anzeigen" className="inline-flex size-control shrink-0 items-center justify-center rounded-control border border-core-border bg-core-surface text-core-action transition hover:bg-core-hover disabled:cursor-not-allowed disabled:opacity-40" disabled={group.page === 0} onClick={() => setCardPageByDeckId((pages) => ({ ...pages, [group.id]: Math.max(0, group.page - 1) }))}>
                              <ChevronLeft size={16} aria-hidden="true" />
                            </button>
                          </CoreTooltip>
                          <span className="core-body text-core-muted">Seite {group.page + 1} von {group.pageCount}</span>
                          <CoreTooltip label="Nächste Seite anzeigen">
                            <button type="button" aria-label="Nächste Seite anzeigen" className="inline-flex size-control shrink-0 items-center justify-center rounded-control border border-core-border bg-core-surface text-core-action transition hover:bg-core-hover disabled:cursor-not-allowed disabled:opacity-40" disabled={group.page + 1 >= group.pageCount} onClick={() => setCardPageByDeckId((pages) => ({ ...pages, [group.id]: Math.min(group.pageCount - 1, group.page + 1) }))}>
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          </CoreTooltip>
                        </div>
                      </td>
                    </tr>
                  ) : null}</> : expanded ? (
                    <tr className="border-b border-core-border bg-core-surface">
                      <td colSpan={3} className="px-4 py-1 core-body text-core-muted">Keine Karten</td>
                    </tr>
                  ) : null}
                </tbody>
              );})}
          </table>
            </div>
          ) : (
            <div className="rounded-panel border border-core-border p-6 sm:p-8" role="status">
              <h4 className="core-heading-3 text-core-text">Keine Karten gefunden</h4>
              <p className="mt-1 core-body-large text-core-muted">Passe die Suche an.</p>
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
        description={pendingCardDelete && pendingCardDelete.graph.cards.length > 1 ? "Alle Karten dieses Inhalts werden gelöscht, auch in anderen Stapeln." : null}
        confirmLabel="Ja"
        cancelLabel="Nein"
        actionIcons={{ cancel: X, confirm: Check }}
        confirmLoading={deletingCard}
        onCancel={() => {
          if (!deletingCard) setPendingCardDelete(null);
        }}
        onConfirm={() => void confirmCardDelete()}
      />
    </div>
  );
}
