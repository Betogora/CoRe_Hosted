import React from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, CopyCheck, FileText, GraduationCap, Layers, ListChecks, Minus, Network, NotebookPen, PanelsTopLeft, Play, RotateCcw, Search, Star, CircleHelp, type LucideIcon } from "lucide-react";
import type { CardDraftGuard, DecksCardPage, DecksScreenProps } from "../appScreenProps.ts";
export type { DecksCardPage, DecksCardPageRequest } from "../appScreenProps.ts";
export type DecksScreenCardPageProps = Pick<DecksScreenProps, "cardPages" | "onRequestCardPage">;
import { noteTextIndex } from "../coreModel.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { CARD_TABLE_PAGE_SIZE, createCardSearchContext, createCardTableModel, createDeckLibraryModel, DEFAULT_CARD_TABLE_SORT, sameCardTableSort, type CardTableSort, type CardTableSortField } from "../libraryModel.ts";
import { cardCount, createHitListModel, createPagedCardTableModel } from "./cardList/cardListModel.ts";
import type { CardCatalogEntry, NoteGraph } from "../workspaceReplica.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { ActionDialog, CoreSlidingTabs, EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";
import { FlagDot } from "../ui/flagUi.tsx";
import { cardSearchTerms, unsupportedCardSearchTerms, withCardSearchTermState } from "./cardSearch/cardSearchExpression.ts";
import { AdvancedCardSearch } from "./cardSearch/AdvancedCardSearch.tsx";
import { CardSearchBar } from "./cardSearch/CardSearchBar.tsx";
import { createCardSearchMenu } from "./cardSearch/cardSearchMenu.ts";
import { useVirtualRows } from "./cardList/virtualRows.ts";
import { CardSelectionBar, type CardSelectionActionId } from "./cardList/CardSelectionBar.tsx";
import { DuplicatesDialog } from "./cardList/DuplicatesDialog.tsx";
import { TagManagerDialog } from "./cardList/TagManagerDialog.tsx";
import { renameDirectoryTag } from "../tagDirectory.ts";
import { HitPractice } from "./cardList/HitPractice.tsx";
import type { DuplicateKey } from "../duplicateContents.ts";
import { HitStudyDialog } from "./cardList/HitStudyDialog.tsx";
import type { Card, Note } from "../coreTypes.ts";
import { hitStudyQuery, orderHits, type HitStudyMode, type HitStudyOrder } from "../hitStudySession.ts";
import type { CardBatchAction } from "../cardBatchActions.ts";
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
/** Heights until a row is measured (desktop): card row (the deck path stands beside the text) and notice row. */
const ROW_ESTIMATE = { card: 28.72, notice: 29 } as const;

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

function SortHeader({ field, label, sort, onChange, leading }: {
  field: CardTableSortField;
  label: string;
  sort: CardTableSort;
  onChange: (field: CardTableSortField) => void;
  leading?: React.ReactNode;
}) {
  const active = sort.field === field;
  const rightAligned = field !== "sortField";
  const headerPadding = rightAligned ? "px-1" : "px-1 sm:px-3 md:px-4";
  const headerGap = rightAligned ? "gap-0.5" : "gap-1 sm:gap-2";
  const directionLabel = active && sort.direction === "desc" ? "absteigend" : "aufsteigend";
  const SortIcon = active && sort.direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`min-w-0 ${headerPadding} ${rightAligned ? "text-right" : "text-left"}`}>
      <div className="flex min-w-0 items-center gap-1">
      {leading}
      <button
        type="button"
        onClick={() => onChange(field)}
        className={`core-table-header-control flex w-full min-w-0 items-center ${headerGap} rounded-inset core-caption font-semibold text-core-muted hover:text-core-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)] ${rightAligned ? "justify-end" : ""}`}
        aria-label={`${label} ${directionLabel} sortieren`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <SortIcon size={14} aria-hidden="true" className={`shrink-0 ${active ? "opacity-100" : "opacity-35"}`} />
      </button>
      </div>
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
      className={`cursor-pointer border-b border-core-border transition-colors ${suspended ? "bg-core-warning-soft hover:bg-core-warning-soft" : selected ? "bg-core-info-soft" : "bg-core-surface hover:bg-core-subtle"} ${selected ? "core-card-row-selected" : ""}`}
      data-selected={selected ? "true" : undefined}
      data-suspended={suspended ? "true" : undefined}
      data-card-row="true"
    >
      <td className="min-w-0 px-2 py-1 align-middle sm:px-3 md:px-4">
        <div className="flex min-w-0 items-start gap-2.5">
        {selecting ? (
          <span className="relative mt-px size-5 shrink-0">
            <input
              type="checkbox"
              data-testid={"select-card-" + card.id}
              aria-label={`${frontPreview} auswählen`}
              className="absolute inset-0 size-5 cursor-pointer appearance-none rounded-marker border border-core-border bg-core-surface checked:border-core-action checked:bg-core-action"
              checked={checked}
              onClick={(event) => {
                event.stopPropagation();
                onToggleCheck(card.id, event.shiftKey);
              }}
              onChange={() => undefined}
            />
            {checked ? <Check size={16} aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 text-core-on-accent" /> : null}
          </span>
        ) : null}
        <button
          type="button"
          data-testid={"deck-card-" + card.id}
          aria-pressed={selected}
          className="block !min-h-0 min-w-0 flex-1 truncate text-left core-body font-medium text-core-text focus-visible:rounded-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]"
          onClick={activate}
        >
          {/* One compact line: the front, from sm on the deck path beside it, both cut with an ellipsis. */}
          <span className="flex min-w-0 items-baseline gap-2 sm:gap-3">
            <span className="min-w-0 flex-1 truncate">
              {frontPreview}
              {syncConflict ? <span className="ml-2 inline-flex min-h-5 items-center rounded-round bg-core-warning-soft px-2 core-caption font-semibold text-core-warning">Synchronisierung klären</span> : null}
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


const WIDE_EDITOR_QUERY = "(min-width: 1280px)";

function useWideEditor() {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE_EDITOR_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_EDITOR_QUERY).matches,
    () => false,
  );
}

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
  onGenerateCardVariants,
  onRunCardBatch,
  onPrepareTextReplace,
  onStudyHits,
  onLoadPracticeCards,
  onFindDuplicates,
  onListHitCardIds,
  variantGenerationRunning = false,
  onUpdateVariant,
  onMoveDeck,
  onOpenLearn,
  onOpenCardSettings,
  onOpenDeckSettings,
  onDraftStateChange,
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
  const [tagManagerOpen, setTagManagerOpen] = React.useState(false);
  // A tag change reloads the directory of the menu and the manager.
  const [tagDirectoryVersion, setTagDirectoryVersion] = React.useState(0);
  const [noteTypes, setNoteTypes] = React.useState<Awaited<ReturnType<typeof cardEditor.listNoteTypes>>>([]);
  React.useEffect(() => {
    if (!advancedSearchOpen && !tagManagerOpen) return;
    let current = true;
    void cardEditor.listTagDirectory().then((entries) => { if (current) setTagDirectory(entries); }).catch(() => undefined);
    return () => { current = false; };
  }, [advancedSearchOpen, cardEditor, tagDirectoryVersion, tagManagerOpen]);
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
  // One flat list over all decks in scope, with or without a search (KV3b); each row names its deck.
  const hitScope = React.useMemo(() => libraryDecks.map((deck) => deck.id), [libraryDecks]);
  const hitList = React.useMemo(() => "hits" in tableModel
    ? tableModel.hits
    : createHitListModel(cardPages?.[HIT_LIST_KEY], { query: deferredQuery, cardSort, awaitingPages: Boolean(onRequestCardPage), dayStartHour, timeZone }),
  [cardPages, cardSort, dayStartHour, deferredQuery, onRequestCardPage, tableModel, timeZone]);
  const cardsLoading = hitList.loading;
  const searchResultCount = deferredQuery.trim() && !cardsLoading ? hitList.totalCardCount : null;
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
    const hit = hitList.cardRows.find((row) => row.id === selectedCardId) ?? (cardPages?.[HIT_LIST_KEY]?.selected?.cardId === selectedCardId ? { entry: cardPages[HIT_LIST_KEY]!.selected!.cards.find((card) => card.id === selectedCardId) } : null);
    return hit?.entry?.deckId ?? null;
  }, [cardPages, contentDeckId, hitList, selectedCardId]);
  const selectedDeckId = selectedContentDeckId ?? focusedDeckId;
  const selectedGroup = selectedDeckId ? groupById.get(selectedDeckId) ?? null : null;
  const selectedDeck = selectedGroup?.deck ?? null;
  // The open card comes with the hit list's pages.
  const selectedListKey = HIT_LIST_KEY;
  const selectedPage = selectedListKey ? cardPages?.[selectedListKey] : undefined;

  // Rows of the virtual table (KV3): the hits of the flat list, after an offline notice when the list is limited.
  // Items hold only the structure; rows are looked up at render, so an arriving page does not rebuild 50,000 items.
  type ListItem =
    | { kind: "notice"; key: string }
    | { kind: "card"; key: string; listKey: string; index: number };
  const limitedHits = Boolean(cardPages?.[HIT_LIST_KEY]?.limitedToLocalCatalog);
  const items = React.useMemo<ListItem[]>(() => {
    const list: ListItem[] = limitedHits ? [{ kind: "notice", key: "notice:hits" }] : [];
    for (let index = 0; index < hitList.totalCardCount; index += 1) list.push({ kind: "card", key: `hit:${index}`, listKey: HIT_LIST_KEY, index });
    return list;
    // The length and the notice stand for the structure; the rows are read at render.
  }, [hitList.totalCardCount, limitedHits]);
  const rowOf = (item: Extract<ListItem, { kind: "card" }> | undefined) => item ? hitList.rowsByIndex.get(item.index) : undefined;
  const cardItems = React.useMemo(() => items.filter((item): item is Extract<ListItem, { kind: "card" }> => item.kind === "card"), [items]);
  // Each list's rows are consecutive, so a row's position follows from where its list starts.
  const listStarts = React.useMemo(() => {
    const starts = new Map<string, { card: number; item: number }>();
    let card = 0;
    items.forEach((item, index) => {
      if (item.kind !== "card") return;
      if (!starts.has(item.listKey)) starts.set(item.listKey, { card, item: index });
      card += 1;
    });
    return starts;
  }, [items]);
  /** Position of a loaded card among all card rows (`card`) and all items (`item`). */
  const locateCard = (cardId: string | null) => {
    if (!cardId) return null;
    for (const [index, row] of hitList.rowsByIndex) {
      const start = row.id === cardId ? listStarts.get(HIT_LIST_KEY) : undefined;
      if (start) return { card: start.card + index, item: start.item + index };
    }
    return null;
  };
  const selectedLocation = locateCard(selectedCardId);
  const itemKey = React.useCallback((index: number) => items[index].key, [items]);
  const itemEstimate = React.useCallback((index: number) => {
    const item = items[index];
    return item.kind === "card" ? ROW_ESTIMATE.card : ROW_ESTIMATE.notice;
  }, [items]);
  const virtual = useVirtualRows({ count: items.length, keyAt: itemKey, estimate: itemEstimate });
  const deckPathById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group.path])), [tableModel.allGroups]);
  const selectedGraph = selectedPage?.selected?.cardId === selectedCardId ? selectedPage?.selected ?? null : null;
  const selectedDeckMissing = Boolean(selectedDeckId && !selectedDeck);
  const selectedCardMissing = Boolean(selectedDeck && selectedCardId && !selectedGraph);
  // Until the page answers for the selected card the editor shows the loading bar, never "Karte nicht gefunden".
  const selectedCardLoading = selectedCardMissing && Boolean(onRequestCardPage) && !selectedPage?.loadError && selectedPage?.requestedCardId !== selectedCardId;
  const detailOpen = Boolean(selectedGraph || selectedDeckMissing || selectedCardMissing);
  // From 1280 px the editor opens beside the list, which keeps its selection and scroll position (KV6).
  const dockedDetail = useWideEditor() && !(contentDeckId && contentTab !== "cards");
  const splitDetail = dockedDetail && detailOpen;
  const { urls: selectedNoteMediaUrls } = useNoteMediaUrls(selectedGraph?.note.media, mediaStore);
  const handleEditorDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
    onDraftStateChange(guard);
  }, [onDraftStateChange]);

  React.useEffect(() => {
    if (preserveToastForSelectionChange.current) {
      preserveToastForSelectionChange.current = false;
      return;
    }
    setSuccessToast("");
  }, [selectedCardId, setSuccessToast]);

  // Pages of the rows near the visible area load as the list scrolls; a list not shown for the current search, sort
  // and scope loads its first page, which also brings its length. Each page is asked once per list version.
  // Each request carries a token: only the latest request of a page may ask again when its answer is dropped.
  const requestedPagesRef = React.useRef(new Map<string, { list: DecksCardPage | undefined; token: number }>());
  const requestTokenRef = React.useRef(0);
  // Every search, sort and scope uses the same page keys, so a new view forgets what the previous one asked.
  const requestedViewRef = React.useRef("");
  // A dropped answer (replaced or aborted, e.g. by a local write) frees its page, and the list asks again.
  const [droppedPages, setDroppedPages] = React.useState(0);
  // Emptied pages (a local write such as a mass action) load again, also those first asked before anything was shown.
  React.useEffect(() => {
    if (cardPages && !Object.keys(cardPages).length) requestedPagesRef.current.clear();
  }, [cardPages]);
  React.useEffect(() => {
    if (!onRequestCardPage) return;
    if (contentDeckId && contentTab !== "cards") return;
    const isShown = (listKey: string) => {
      const list = cardPages?.[listKey];
      return Boolean(list && list.query === deferredQuery && sameCardTableSort(list.sort, cardSort) && (list.deckIds ?? []).join("\n") === hitScope.join("\n"));
    };
    const needed = new Map<string, { listKey: string; page: number }>();
    const need = (listKey: string, page: number) => needed.set(`${listKey}#${page}`, { listKey, page });
    if (!isShown(HIT_LIST_KEY)) need(HIT_LIST_KEY, 0);
    for (let index = Math.max(0, virtual.start); index <= virtual.end; index += 1) {
      const item = items[index];
      if (item?.kind === "card" && (!rowOf(item) || !isShown(item.listKey))) need(item.listKey, Math.floor(item.index / CARD_TABLE_PAGE_SIZE));
    }
    if (pendingHit) need(pendingHit.listKey, Math.floor(pendingHit.index / CARD_TABLE_PAGE_SIZE));
    const requested = requestedPagesRef.current;
    const view = JSON.stringify([deferredQuery, cardSort, hitScope, searchContext ?? null]);
    if (requestedViewRef.current !== view) {
      requested.clear();
      requestedViewRef.current = view;
    }
    for (const [key, { listKey, page }] of needed) {
      const list = cardPages?.[listKey];
      // Asked before for this very list object: still loading, or answered without that page (a shorter list).
      const marker = isShown(listKey) ? list : undefined;
      if (requested.has(key) && requested.get(key)!.list === marker) continue;
      const token = ++requestTokenRef.current;
      requested.set(key, { list: marker, token });
      void Promise.resolve(onRequestCardPage({ deckId: listKey, deckIds: hitScope, page, pageSize: CARD_TABLE_PAGE_SIZE, query: deferredQuery, sort: cardSort, selectedCardId: null, searchContext }))
        .then((applied) => {
          // A request replaced by a newer one (also a repeated effect) leaves the asking to that one.
          if (applied !== false || requested.get(key)?.token !== token) return;
          requested.delete(key);
          setDroppedPages((count) => count + 1);
        });
    }
  }, [cardPages, cardSort, contentDeckId, contentTab, deferredQuery, droppedPages, hitList, hitScope, items, onRequestCardPage, pendingHit, searchContext, virtual.end, virtual.start]);

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
      deckIds: hitScope,
      page: loadedPage,
      pageSize: CARD_TABLE_PAGE_SIZE,
      query: deferredQuery,
      sort: cardSort,
      selectedCardId,
      searchContext,
    });
  }, [cardPages, cardSort, contentDeckId, contentTab, deferredQuery, hitScope, onRequestCardPage, searchContext, selectedCardId, selectedListKey]);

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

    // A click beside the delete question cancels it and also closes the editor (specs.md#karten-löschen).
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
  const selectedPosition = selectedLocation && !onCloseSelectedCard ? selectedLocation.card : -1;
  const previousHit = selectedPosition >= 0 ? cardItems[selectedPosition - 1] : undefined;
  const nextHit = selectedPosition >= 0 ? cardItems[selectedPosition + 1] : undefined;
  const previousRow = rowOf(previousHit);
  const nextRow = rowOf(nextHit);
  const hits = React.useMemo<CardEditorHitNavigation | null>(() => {
    if (selectedPosition < 0) return null;
    const step = (item: (typeof cardItems)[number] | undefined, row: ReturnType<typeof rowOf>) => item
      ? () => requestDetailAction(() => row ? onSelectDeck(row.entry.deckId, row.id, cardEditorTab) : setPendingHit({ listKey: item.listKey, index: item.index }))
      : null;
    return { position: selectedPosition + 1, total: cardItems.length, onPrevious: step(previousHit, previousRow), onNext: step(nextHit, nextRow) };
    // requestDetailAction and onSelectDeck read the latest state when they run.
  }, [cardEditorTab, cardItems.length, nextHit, nextRow, previousHit, previousRow, selectedPosition]);
  // The neighbouring hits load ahead once the open card is shown, so prev/next opens without waiting.
  React.useEffect(() => {
    if (selectedPosition < 0 || !selectedGraph) return;
    for (const row of [nextRow, previousRow]) if (row) cardEditor.prefetchCard(row.id);
  }, [cardEditor, nextRow, previousRow, selectedGraph, selectedPosition]);
  const pendingRow = pendingHit ? hitList.rowsByIndex.get(pendingHit.index) : undefined;
  React.useEffect(() => {
    if (!pendingHit || !pendingRow) return;
    setPendingHit(null);
    onSelectDeck(pendingRow.entry.deckId, pendingRow.id, cardEditorTab);
  }, [cardEditorTab, onSelectDeck, pendingHit, pendingRow]);
  // The open card's row scrolls into view, e.g. after prev/next, so closing the editor lands on it.
  const selectedItemIndex = selectedLocation?.item ?? -1;
  React.useEffect(() => {
    if (selectedItemIndex >= 0) virtual.scrollToIndex(selectedItemIndex);
    // Only a newly selected row scrolls; later renders of the same selection leave the scroll position alone.
  }, [selectedCardId, selectedItemIndex >= 0]);

  // Selection for mass actions (KV4): card ids, or every hit of the flat list; a new search or scope clears it.
  const [selecting, setSelecting] = React.useState(false);
  const [checkedIds, setCheckedIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [allHits, setAllHits] = React.useState(false);
  const selectionAnchorRef = React.useRef<number | null>(null);
  const clearSelection = React.useCallback(() => {
    setSelecting(false);
    setCheckedIds(new Set());
    setAllHits(false);
    selectionAnchorRef.current = null;
  }, []);
  // The scope compares by its decks: a sync renews the deck list without changing it.
  const hitScopeKey = hitScope.join("\n");
  React.useEffect(clearSelection, [clearSelection, deferredQuery, hitScopeKey]);
  const canSelect = Boolean(onRunCardBatch) && !onCloseSelectedCard;
  function toggleCheck(cardId: string, range: boolean) {
    if (!canSelect) return;
    const position = locateCard(cardId)?.card ?? null;
    const anchor = selectionAnchorRef.current;
    setSelecting(true);
    setAllHits(false);
    setCheckedIds((current) => {
      const next = new Set(current);
      if (range && anchor !== null && position !== null) {
        // A range takes the loaded rows between the last toggled row and this one.
        for (let index = Math.min(anchor, position); index <= Math.max(anchor, position); index += 1) {
          const row = rowOf(cardItems[index]);
          if (row) next.add(row.id);
        }
      } else if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    selectionAnchorRef.current = position;
  }
  const stableToggleCheck = useStableCallback(toggleCheck);
  const [runningBatch, setRunningBatch] = React.useState(false);
  const selectionCount = allHits ? hitList?.totalCardCount ?? 0 : checkedIds.size;

  async function selectedIds() {
    if (!allHits) return [...checkedIds];
    if (!onListHitCardIds) return [];
    return onListHitCardIds({ deckIds: hitScope, query: deferredQuery, searchContext });
  }

  const runSelectionAction = async (action: CardBatchAction, label: string) => {
    await runCardBatchAction(selectedIds, action, label);
  };

  const lastUndoRef = React.useRef<(() => void) | null>(null);
  // The row a key action started from takes the focus back once the action ran, so the keyboard flow goes on.
  const keyActionRowRef = React.useRef<string | null>(null);
  const [focusRowAfterAction, setFocusRowAfterAction] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusRowAfterAction) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="deck-card-${CSS.escape(focusRowAfterAction)}"]`);
    if (!row) return;
    row.focus({ preventScroll: true });
    setFocusRowAfterAction(null);
  }, [focusRowAfterAction, items]);
  const [selectionRequest, setSelectionRequest] = React.useState<{ id: CardSelectionActionId; flag?: number; nonce: number } | null>(null);
  // Keys of the card list (KV6): `/` searches; on a focused row ↑/↓ move, Enter opens, X selects, Escape clears the
  // selection, and the action keys open the confirmation of the selection or of the focused card. Dialogs, menus, the
  // editor and text fields keep their own keys; browser shortcuts stay untouched.
  const handleListKey = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if (target?.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]') || document.querySelector('[aria-modal="true"]')) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() !== "z" || event.shiftKey || !lastUndoRef.current) return;
      event.preventDefault();
      lastUndoRef.current();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('input[aria-label="Karten durchsuchen"]')?.focus();
      return;
    }
    if (event.key === "Escape" && selecting) {
      event.preventDefault();
      clearSelection();
      return;
    }
    const cardId = target?.dataset.testid?.startsWith("deck-card-") ? target.dataset.testid.slice("deck-card-".length) : null;
    if (!cardId) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = (row: Element | null | undefined) => event.key === "ArrowDown" ? row?.nextElementSibling : row?.previousElementSibling;
      let row = step(target!.closest("tr"));
      while (row && !(row as HTMLElement).dataset.cardRow) row = step(row);
      const next = row?.querySelector<HTMLElement>('[data-testid^="deck-card-"]');
      if (!next) return;
      event.preventDefault();
      next.focus();
      return;
    }
    if (!canSelect) return;
    const key = event.key.toLowerCase();
    if (key === "x") {
      event.preventDefault();
      toggleCheck(cardId, event.shiftKey);
      return;
    }
    const entry = [...hitList.rowsByIndex.values()].find((row) => row.id === cardId)?.entry;
    const request: { id: CardSelectionActionId; flag?: number } | null = /^[1-7]$/.test(key) ? { id: "flag", flag: Number(key) }
      : key === "0" ? { id: "flag-remove" }
        : key === "m" ? { id: entry?.marked ? "unmark" : "mark" }
          : key === "a" ? { id: entry && !entry.reviewable ? "unsuspend" : "suspend" }
            : key === "s" ? { id: "deck" }
              : key === "t" ? { id: "tags-add" }
                : event.key === "Delete" ? { id: "delete" } : null;
    if (!request) return;
    event.preventDefault();
    // Without a selection the action takes the focused card.
    if (!selecting || (!allHits && !checkedIds.size)) {
      setSelecting(true);
      setAllHits(false);
      setCheckedIds(new Set([cardId]));
    }
    keyActionRowRef.current = cardId;
    setSelectionRequest({ ...request, nonce: Date.now() });
  });
  React.useEffect(() => {
    window.addEventListener("keydown", handleListKey);
    return () => window.removeEventListener("keydown", handleListKey);
  }, [handleListKey]);

  /** Runs a mass action with its toast and `Rückgängig`; true once it ran. */
  async function runCardBatchAction(loadIds: () => Promise<string[]>, action: CardBatchAction, label: string, onUndone?: () => void) {
    if (!onRunCardBatch || runningBatch) return false;
    setRunningBatch(true);
    try {
      const ids = await loadIds();
      const result = await onRunCardBatch(ids, action);
      if (action.kind === "delete" && selectedCardId && ids.includes(selectedCardId)) closeDetail();
      clearSelection();
      const undo = () => {
        lastUndoRef.current = null;
        void result.undo().then(({ restoredCount, skippedCount }) => {
          onUndone?.();
          setSuccessToast(skippedCount
            ? `Rückgängig gemacht: ${cardCount(restoredCount)}. ${cardCount(skippedCount)} wurden inzwischen geändert und bleiben so.`
            : `Rückgängig gemacht: ${cardCount(restoredCount)}.`, { appearance: skippedCount ? "neutral" : "success" });
        }, () => setSuccessToast("Rückgängig ist fehlgeschlagen.", { appearance: "neutral" }));
      };
      // Ctrl+Z in the list takes the latest mass action back, like its toast (KV6).
      lastUndoRef.current = undo;
      setSuccessToast(`${label}: ${cardCount(result.changedCount)}`, { action: { label: "Rückgängig", onAction: undo } });
      return true;
    } catch (error) {
      setDeckStatusType("alert");
      setDeckStatus(error instanceof Error ? error.message : "Die Aktion konnte nicht ausgeführt werden.");
      return false;
    } finally {
      setRunningBatch(false);
      // The list reloads after the action; the row takes the focus once it is rendered again.
      setFocusRowAfterAction(keyActionRowRef.current);
      keyActionRowRef.current = null;
    }
  }

  const prepareSelectionReplace = useStableCallback(async () => onPrepareTextReplace!(await selectedIds()));
  // `Duplikate finden` (KV5) compares the contents of the list, optionally only its hits.
  const [duplicatesOpen, setDuplicatesOpen] = React.useState(false);
  const findDuplicates = useStableCallback((key: DuplicateKey, withinHits: boolean) => onFindDuplicates!({ deckIds: hitScope, key, query: withinHits ? deferredQuery : "", searchContext }));
  // `Treffer lernen` (KV5) studies the hits or the selection without suspended and buried cards.
  const [hitStudy, setHitStudy] = React.useState<"hits" | "selection" | null>(null);
  const canStudyHits = Boolean(onStudyHits && onLoadPracticeCards && onListHitCardIds);
  const [practiceBodies, setPracticeBodies] = React.useState<Array<{ card: Card; note: Note }> | null>(null);
  async function startHitStudy(cardIds: string[], order: HitStudyOrder, mode: HitStudyMode) {
    if (mode === "advance") return onStudyHits!(cardIds, order);
    const bodies = await onLoadPracticeCards!(cardIds);
    if (!bodies.length) throw new Error("Diese Karten sind erst online verfügbar.");
    setPracticeBodies(orderHits(bodies, order));
  }
  const loadHitStudyIds = useStableCallback(async () => {
    const ids = await onListHitCardIds!({ deckIds: hitScope, query: hitStudyQuery(deferredQuery), searchContext, sort: cardSort });
    return hitStudy === "selection" && !allHits ? ids.filter((id) => checkedIds.has(id)) : ids;
  });

  async function generateSelectionVariants() {
    if (!onGenerateCardVariants) return;
    const ids = await selectedIds();
    const selected = new Set(ids);
    const firstRow = [...hitList.rowsByIndex.values()].find((row) => selected.has(row.id));
    const deckId = firstRow?.entry.deckId ?? contentDeckId ?? selectedDeckId;
    if (!deckId || !ids.length) return;
    onGenerateCardVariants(deckId, ids);
    clearSelection();
  }

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
          docked={dockedDetail}
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
        <CardEditorSurface label="Kartendetail" docked={dockedDetail} surfaceRef={detailRef}>
          <div className="px-3 pt-3 sm:px-6 sm:pt-4" data-testid="card-detail-loading">
            <div className="core-statistics-load-track" role="progressbar" aria-label="Karte wird geladen"><span aria-hidden="true" /></div>
          </div>
        </CardEditorSurface>
      );
    }
    return (
      <CardEditorSurface label="Kartendetail" docked={dockedDetail} surfaceRef={detailRef}>
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
      ) : <LearningAreaHeader area="cards" onOpenCardSettings={onOpenCardSettings} action={onFindDuplicates && onRunCardBatch ? (
        <ActionButton type="button" variant="secondary" icon={CopyCheck} onClick={() => setDuplicatesOpen(true)}>Duplikate finden</ActionButton>
      ) : undefined} />}

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
              resultAction={canStudyHits && searchResultCount ? (
                <button type="button" className="inline-flex items-center gap-1.5 core-body font-semibold text-core-action hover:underline" onClick={() => setHitStudy("hits")}>
                  <GraduationCap size={16} aria-hidden="true" />Treffer lernen
                </button>
              ) : undefined}
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
                  onManageTags={onRunCardBatch && onListHitCardIds ? () => setTagManagerOpen(true) : undefined}
                />
              ) : null}
            </CardSearchBar>
            {hitStudy ? (
              <HitStudyDialog
                title={hitStudy === "selection" ? "Auswahl lernen" : "Treffer lernen"}
                loadCardIds={loadHitStudyIds}
                onStart={startHitStudy}
                onClose={() => setHitStudy(null)}
              />
            ) : null}
            {tagManagerOpen ? (
              <TagManagerDialog
                tags={tagDirectory}
                onRename={async (from, to) => {
                  // Tags belong to the account: every deck, also the ones outside the list.
                  const deckIds = decks.filter((deck) => !deck.deletedAt).map((deck) => deck.id);
                  // The cloud directory follows only once the change is synchronized, so the list shows it locally;
                  // reopening the manager loads it again. Undoing a plain rename renames back, anything else reloads.
                  const merged = to !== null && tagDirectory.some((entry) => entry.tag.toLocaleLowerCase("und") === to.toLocaleLowerCase("und"));
                  const ran = await runCardBatchAction(() => onListHitCardIds!({ deckIds, query: `tag:${from}`, searchContext }), { kind: "tag-rename", from, to }, to === null ? "Tag löschen" : "Tag umbenennen", () => {
                    if (to !== null && !merged) setTagDirectory((entries) => renameDirectoryTag(entries, to, from));
                    else setTagDirectoryVersion((version) => version + 1);
                  });
                  if (ran) setTagDirectory((entries) => renameDirectoryTag(entries, from, to));
                }}
                onClose={() => setTagManagerOpen(false)}
              />
            ) : null}
            {duplicatesOpen ? (
              <DuplicatesDialog
                searching={Boolean(deferredQuery.trim())}
                find={findDuplicates}
                deckName={(deckId) => deckNameById.get(deckId) ?? "Unbekannter Stapel"}
                onOpen={(deckId, cardId) => {
                  setDuplicatesOpen(false);
                  requestCardSelection(deckId, cardId);
                }}
                onTag={async (cardIds) => {
                  await runCardBatchAction(async () => cardIds, { kind: "tags", add: ["Duplikat"], remove: [] }, "Duplikate taggen");
                }}
                onClose={() => setDuplicatesOpen(false)}
              />
            ) : null}
            {practiceBodies ? <HitPractice bodies={practiceBodies} mediaStore={mediaStore} onClose={() => setPracticeBodies(null)} /> : null}
            {deckStatus ? <p className={"core-body font-semibold " + (deckStatusType === "alert" ? "core-status-error" : "core-status-info")} role={deckStatusType}>{deckStatus}</p> : null}
            {deletedCardUndo ? (
              <div className="flex flex-wrap items-center gap-3 rounded-panel border border-core-border bg-core-subtle px-4 py-3">
                <p className="min-w-0 flex-1 truncate core-body text-core-text">„{deletedCardUndo.description}“ gelöscht.</p>
                <ActionButton type="button" variant="secondary" icon={RotateCcw} onClick={() => void undoCardDelete()}>Rückgängig</ActionButton>
              </div>
            ) : null}
          </div>

          {deferredQuery.trim() ? <MatchingDecks groups={tableModel.groups.filter((group) => group.deckMatches)} onOpen={(deckId) => changeQuery(withCardSearchTermState(cardSearchTerms(query).filter((term) => !/^-?did:/i.test(term)).join(" "), `did:${deckId}`, "in"))} /> : null}
          <div className={splitDetail ? "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-4" : "contents"} data-testid="card-library-split">
          {items.length || cardsLoading ? (
            <div className="min-w-0 max-w-full overflow-clip rounded-panel border border-core-border bg-core-surface">
          <table className="w-full table-fixed border-collapse" data-testid="card-library-table" aria-busy={cardsLoading || undefined} aria-rowcount={items.length}>
              <colgroup>
                <col />
                <col className="w-20 sm:w-[5.75rem]" />
                <col className="w-20" />
              </colgroup>
              {/* From xl the screen region scrolls; its top padding (xl:py-10 in App) would otherwise hold the header 40 px low. */}
              <thead className="sticky top-[var(--core-card-table-sticky-top)] z-10 bg-core-surface xl:-top-10" style={{ "--core-card-table-sticky-top": `${mobileHeaderHeight}px` } as React.CSSProperties}>
                {selecting ? (
                  <tr className="border-b border-core-border bg-core-info-soft">
                    <th scope="col" colSpan={3} className="p-0 text-left font-normal">
                      <CardSelectionBar
                        count={selectionCount}
                        hitTotal={onListHitCardIds && !cardsLoading ? hitList.totalCardCount : null}
                        searching={Boolean(deferredQuery.trim())}
                        allHits={allHits}
                        onSelectAllHits={() => setAllHits(true)}
                        onClear={clearSelection}
                        decks={decks}
                        flagNames={cardEditor.flagNames}
                        loadTagDirectory={cardEditor.listTagDirectory}
                        now={now}
                        dayStartHour={dayStartHour}
                        timeZone={timeZone}
                        disabled={runningBatch || selectionCount === 0}
                        onGenerateVariants={onGenerateCardVariants && !variantGenerationRunning ? () => void generateSelectionVariants() : undefined}
                        onStudy={canStudyHits ? () => setHitStudy("selection") : undefined}
                        onPrepareReplace={onPrepareTextReplace ? prepareSelectionReplace : undefined}
                        onRun={runSelectionAction}
                        request={selectionRequest}
                      />
                    </th>
                  </tr>
                ) : (
                  <tr className="core-table-header-row border-b border-core-border">
                    <SortHeader
                      field="sortField"
                      label="Sortierfeld"
                      sort={cardSort}
                      onChange={changeSort}
                      leading={canSelect ? (
                        // Touch starts selecting with a long press, so the narrow header stays compact.
                        <CoreTooltip label="Karten auswählen">
                          <button type="button" aria-label="Karten auswählen" data-testid="card-selection-start" className="hidden size-6 !min-h-0 shrink-0 place-items-center rounded-inset text-core-muted hover:bg-core-subtle hover:text-core-text sm:grid" onClick={() => setSelecting(true)}>
                            <ListChecks size={16} aria-hidden="true" />
                          </button>
                        </CoreTooltip>
                      ) : null}
                    />
                    <SortHeader field="nextStudyDate" label="Datum" sort={cardSort} onChange={changeSort} />
                    <SortHeader field="variants" label="Variante" sort={cardSort} onChange={changeSort} />
                  </tr>
                )}
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
                      flagNames={cardEditor.flagNames}
                      syncConflict={Boolean(syncConflictCardIds?.has(card.id))}
                      deckPath={hitScope.length > 1 ? deckPathById.get(card.deckId) : undefined}
                      onSelect={stableRequestCardSelection}
                      checked={allHits || checkedIds.has(card.id)}
                      selecting={selecting}
                      onToggleCheck={stableToggleCheck}
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
              <h4 className="core-heading-3 text-core-text">{deferredQuery.trim() ? "Keine Karten gefunden" : "Keine Karten"}</h4>
              {deferredQuery.trim() ? <p className="core-body text-core-secondary">Passe die Suche an.</p> : null}
            </div>
          )}
          {splitDetail ? renderDetailLayer() : null}
          </div>
        </div>
      </SoftPanel>}
      {detailOpen && !dockedDetail ? renderDetailLayer() : null}

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
