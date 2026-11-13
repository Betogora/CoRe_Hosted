import React from "react";
import { ChevronRight, CopyCheck, FileText, GraduationCap, Layers, Network, NotebookPen, PanelsTopLeft, Play, RotateCcw, CircleHelp, type LucideIcon } from "lucide-react";
import type { CardDraftGuard, DecksScreenProps } from "../appScreenProps.ts";
import { noteTextIndex } from "../coreModel.ts";
import { collectDeckTreeIds } from "../coreWorkspace.ts";
import { CARD_TABLE_PAGE_SIZE, createDeckLibraryModel } from "../libraryModel.ts";
import { cardCount } from "./cardList/cardListModel.ts";
import type { NoteGraph } from "../workspaceReplica.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { useNoteMediaUrls } from "../ui/cardMedia.tsx";
import { useStableCallback } from "../ui/useStableCallback.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { ActionDialog, EmptyState, SoftPanel } from "../ui/coreUi.tsx";
import { CoreTabPanel, CoreTabs } from "../ui/CoreTabs.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { DialogFrame } from "../ui/DialogFrame.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { cardSearchTerms, unsupportedCardSearchTerms, withCardSearchTermState } from "./cardSearch/cardSearchExpression.ts";
import { AdvancedCardSearch } from "./cardSearch/AdvancedCardSearch.tsx";
import { CardSearchBar } from "./cardSearch/CardSearchBar.tsx";
import { createCardSearchMenu } from "./cardSearch/cardSearchMenu.ts";
import { HIT_LIST_KEY, useCardSearch } from "./cardList/useCardSearch.ts";
import { CardHitTable, MatchingDecks } from "./cardList/CardHitTable.tsx";
import { CardSelectionBar } from "./cardList/CardSelectionBar.tsx";
import { useCardSelection } from "./cardList/useCardSelection.ts";
import { DuplicatesDialog } from "./cardList/DuplicatesDialog.tsx";
import { TagManagerDialog } from "./cardList/TagManagerDialog.tsx";
import { renameDirectoryTag } from "../tagDirectory.ts";
import { HitPractice } from "./cardList/HitPractice.tsx";
import type { DuplicateKey } from "../duplicateContents.ts";
import { HitStudyDialog } from "./cardList/HitStudyDialog.tsx";
import type { Card, Note } from "../coreTypes.ts";
import { hitStudyQuery, orderHits, type HitStudyMode, type HitStudyOrder } from "../hitStudySession.ts";
import type { CardBatchAction } from "../cardBatchActions.ts";
import { CardEditorDialog, cardEditorFrameClass, type CardEditorHitNavigation } from "./cardEditor/CardEditorDialog.tsx";
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

/** Centered state of a content tab without its own content, e.g. `Demnächst verfügbar` or `Keine Unterstapel`. */
function DeckContentPlaceholder({ label, icon: Icon, title, action, testId }: { label: string; icon: LucideIcon; title: string; action?: React.ReactNode; testId?: string }) {
  return (
    <SoftPanel aria-label={label} className="flex min-h-[214px] items-center justify-center p-6 sm:p-10" data-testid={testId}>
      <div className="flex min-w-0 flex-col items-center gap-4 text-center">
        <Icon size={22} className="text-core-secondary" aria-hidden="true" />
        <p className="core-heading-3 text-core-text" role="status">{title}</p>
        {action}
      </div>
    </SoftPanel>
  );
}

// Summaries and mind maps are most of this screen's code but load with their tab only, so preloading the card
// management stays below the 50 ms task budget.
const DeckSummariesPanel = React.lazy(() => import("./DeckSummariesPanel.tsx").then((module) => ({ default: module.DeckSummariesPanel })));
const DeckMindMapsPanel = React.lazy(() => import("./DeckMindMapsPanel.tsx").then((module) => ({ default: module.DeckMindMapsPanel })));
const CONTENT_TAB_LOADING = <p className="p-6 core-body text-core-muted" role="status" data-testid="deck-content-tab-loading">Wird geladen …</p>;

export function DecksScreen({
  decks,
  summaryAccountId,
  learningContentCloud = null,
  onGenerateSummary,
  onStartDeck,
  contentDeckId = null,
  contentTab: requestedContentTab = "children", cardQuery = "",
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
  onRequestCardPage,
}: DecksScreenProps) {
  const { deckSummaries, syncConflictCardIds, cardPages } = useWorkspaceValue(({ deckSummaries, syncConflictCardIds, cardPages }) => ({ deckSummaries, syncConflictCardIds, cardPages }));
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
  const contentNavigationRef = React.useRef<HTMLDivElement>(null);
  const contentPanelId = `${React.useId().replace(/:/g, "")}-deck-content`;
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
  // Prev/next to a row whose page is not loaded yet: it opens once the page arrives.
  const [pendingHit, setPendingHit] = React.useState<{ listKey: string; index: number } | null>(null);
  const previouslySelectedCardId = React.useRef<string | null>(null);
  const { query, deferredQuery, changeQuery, cardSort, changeSort, searchContext, tableModel, hitScope, hitList, cardsLoading, items, rowOf, cardItems, locateCard, virtual } = useCardSearch({
    decks, libraryDecks, cardPages, deckSummaries, noteTypes, now, dayStartHour, learnAheadMinutes, timeZone,
    onRequestCardPage, paused: Boolean(contentDeckId && contentTab !== "cards"), selectedCardId, pendingHit, linkedQuery: cardQuery,
  });
  // Every filter is a search term in the query (Anki notation), so search, chips and menu stay one state.
  const unsupportedTerms = React.useMemo(() => unsupportedCardSearchTerms(deferredQuery), [deferredQuery]);
  const searchResultCount = deferredQuery.trim() && !cardsLoading ? hitList.totalCardCount : null;
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

  const selectedLocation = locateCard(selectedCardId);
  const deckPathById = React.useMemo(() => new Map(tableModel.allGroups.map((group) => [group.id, group.path])), [tableModel.allGroups]);
  const deckPathOf = (deckId: string) => deckPathById.get(deckId);
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
    if (preserveToastForSelectionChange.current) {
      preserveToastForSelectionChange.current = false;
      return;
    }
    setSuccessToast("");
  }, [selectedCardId, setSuccessToast]);

  React.useEffect(() => {
    if (!detailOpen) return;
    previouslySelectedCardId.current = selectedCardId;
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="card-detail-dialog"] [data-card-editor-heading]')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [detailOpen, selectedCardId]);

  React.useEffect(() => {
    if (!detailOpen) return;

    // A click beside the delete question cancels it and also closes the editor (specs.md#karten-löschen-und-duplizieren).
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!pendingCardDelete || !(target instanceof Element) || !target.matches('[data-testid="action-dialog-backdrop"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (deletingCard) return;
      setPendingCardDelete(null);
      requestDetailAction(closeDetail);
    }

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [deletingCard, detailOpen, pendingCardDelete, selectedCardId, selectedDeckId]);

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

  const canSelect = Boolean(onRunCardBatch) && !onCloseSelectedCard;
  const { selecting, setSelecting, checkedIds, allHits, setAllHits, clearSelection, toggleCheck: stableToggleCheck, selectionCount, selectionRequest, lastUndoRef, keyActionRowRef, setFocusRowAfterAction } = useCardSelection({
    canSelect, hitList, items, cardItems, rowOf, locateCard, deferredQuery, hitScope,
  });
  const [runningBatch, setRunningBatch] = React.useState(false);

  async function selectedIds() {
    if (!allHits) return [...checkedIds];
    if (!onListHitCardIds) return [];
    return onListHitCardIds({ deckIds: hitScope, query: deferredQuery, searchContext });
  }

  const runSelectionAction = async (action: CardBatchAction, label: string) => {
    await runCardBatchAction(selectedIds, action, label);
  };


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
          syncConflict={syncConflictCardIds.has(selectedGraph.cardId)}
          now={now}
          dayStartHour={dayStartHour}
          timeZone={timeZone}
          mediaUrls={selectedNoteMediaUrls}
          mediaStore={mediaStore}
          services={cardEditor}
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
        <DialogFrame open size="l" title="Karte" testId="card-detail-dialog" className={cardEditorFrameClass()} closeLabel="Detailansicht schließen" onClose={closeDetail}>
          <div className="px-5 pt-5" data-testid="card-detail-loading">
            <div className="core-statistics-load-track" role="progressbar" aria-label="Karte wird geladen"><span aria-hidden="true" /></div>
          </div>
        </DialogFrame>
      );
    }
    return (
      <DialogFrame open size="l" title="Karte" testId="card-detail-dialog" className={cardEditorFrameClass()} closeLabel="Detailansicht schließen" onClose={closeDetail}>
        <div className="grid flex-1 place-items-center p-6">
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
      </DialogFrame>
    );
  }

  const content = contentDeckId && contentTab === "children" ? (
    contentRow && contentLibrary ? contentRow.hasChildren ? <DeckSubstacksPanel key={contentRow.id} rows={contentLibrary.rows} current={contentRow}
      onOpenDeck={(id) => onOpenDeckContent(id, "children")}
      onStudy={onStartDeck} onOpenSettings={onOpenDeckSettings} onSetCoreMode={onSetDeckCoreMode} onMoveDeck={onMoveDeck} />
      : <DeckContentPlaceholder label="Unterstapel" icon={Layers} title="Keine Unterstapel" testId="deck-content-substacks"
        action={<ActionButton variant="secondary" icon={Play} disabled={!hasStudyCards} onClick={() => onStartDeck(contentRow.deck)}>Karten lernen</ActionButton>} />
      : <EmptyState icon={Layers} title="Stapel nicht gefunden oder nicht verfügbar." />
  ) : contentDeckId && contentTab === "summary" ? (
    contentDeck ? <React.Suspense fallback={CONTENT_TAB_LOADING}><DeckSummariesPanel key={`${summaryAccountId ?? contentDeck.ownerId}:${contentDeck.id}`} deck={contentDeck}
      userId={summaryAccountId ?? contentDeck.ownerId} cloud={learningContentCloud} onGenerateSummary={onGenerateSummary} onDraftStateChange={handleEditorDraftStateChange} /></React.Suspense>
      : <EmptyState icon={FileText} title="Stapel nicht gefunden oder nicht verfügbar." />
  ) : contentDeckId && contentTab === "mind-map" ? (
    contentDeck ? <React.Suspense fallback={CONTENT_TAB_LOADING}><DeckMindMapsPanel key={`${summaryAccountId ?? contentDeck.ownerId}:${contentDeck.id}`} deck={contentDeck}
      userId={summaryAccountId ?? contentDeck.ownerId} cloud={learningContentCloud} onGenerateSummary={onGenerateSummary} onDraftStateChange={handleEditorDraftStateChange} /></React.Suspense>
      : <EmptyState icon={Network} title="Stapel nicht gefunden oder nicht verfügbar." />
  ) : contentDeckId && contentTab !== "cards" ? (
    <DeckContentPlaceholder label={selectedContentTab.label} icon={selectedContentTab.icon} title="Demnächst verfügbar" />
  ) : <section className="grid min-w-0 gap-4" aria-label="Karten" data-testid="card-library-panel">
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
            <CrossLinkButton onSelect={() => setHitStudy("hits")}><GraduationCap size={16} aria-hidden="true" />Treffer lernen</CrossLinkButton>
          ) : undefined}
          selecting={selecting} onSelectingChange={canSelect ? (next) => next ? setSelecting(true) : clearSelection() : undefined}
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
      <CardHitTable
        items={items}
        rowOf={rowOf}
        virtual={virtual}
        loading={cardsLoading}
        searching={Boolean(deferredQuery.trim())}
        selectionBar={selecting ? (
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
        ) : null}
        sort={cardSort}
        onSort={changeSort}
        selectedCardId={selectedCardId}
        selectedGraph={selectedGraph}
        flagNames={cardEditor.flagNames}
        syncConflictCardIds={syncConflictCardIds}
        deckPathOf={hitScope.length > 1 ? deckPathOf : undefined}
        onSelect={stableRequestCardSelection}
        isChecked={(cardId) => allHits || checkedIds.has(cardId)}
        selecting={selecting}
        onToggleCheck={stableToggleCheck}
      />
  </section>;

  return (
    <div className="relative grid min-w-0 gap-6">
      {contentDeckId ? (
        <div className="core-deck-content-head" data-deck-content-navigation="true" ref={contentNavigationRef}>
          <nav className="core-deck-folder-breadcrumb" aria-label="Stapelpfad" data-testid="deck-content-path">
            <button type="button" onClick={() => requestDetailAction(() => onOpenLearn(null))}>Alle Stapel</button>
            {contentTrail.map((row) => <React.Fragment key={row.id}>
              <ChevronRight size={16} aria-hidden="true" />
              {row.id === contentDeckId ? <span aria-current="page">{row.name}</span> : <button type="button" onClick={() => requestDetailAction(() => onOpenDeckContent(row.id, "children"))}>{row.name}</button>}
            </React.Fragment>)}
          </nav>
          <div className="core-deck-content-heading" data-testid="deck-content-heading">
            {contentDeck ? <DeckAppearanceIcon deck={contentDeck} className="size-7" iconSize={16} /> : null}
            <h2 className="core-deck-content-title outline-none" data-screen-heading tabIndex={-1}>{contentDeck?.name ?? "Stapelinhalte"}</h2>
          </div>
          <div className="core-deck-content-tabs" data-testid="deck-content-actions">
            <CoreTabs ariaLabel="Stapelinhalte" tabs={deckContentTabs} value={contentTab} panelId={contentPanelId}
              onValueChange={(tab) => requestDetailAction(() => onOpenDeckContent(contentDeckId, tab))} />
          </div>
          {contentDeck ? <ActionButton variant="primary" icon={Play} disabled={!hasStudyCards} className="core-deck-content-study"
            onClick={() => requestDetailAction(() => onStartDeck(contentDeck))} data-testid="deck-content-study">Karten lernen</ActionButton> : null}
        </div>
      ) : <LearningAreaHeader area="cards" onOpenCardSettings={onOpenCardSettings} action={onFindDuplicates && onRunCardBatch ? (
        <ActionButton type="button" variant="secondary" icon={CopyCheck} onClick={() => setDuplicatesOpen(true)}>Duplikate finden</ActionButton>
      ) : undefined} />}

      {contentDeckId ? <CoreTabPanel panelId={contentPanelId} value={contentTab} className="grid min-w-0 gap-6 outline-none">{content}</CoreTabPanel> : content}
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
