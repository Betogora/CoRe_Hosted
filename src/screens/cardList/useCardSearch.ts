import React from "react";
import type { DecksCardPage, DecksScreenProps } from "../../appScreenProps.ts";
import type { Deck } from "../../coreTypes.ts";
import { cancelFieldTiming, finishFieldTiming, startFieldTiming } from "../../fieldTimings.ts";
import { CARD_TABLE_PAGE_SIZE, createCardSearchContext, createCardTableModel, DEFAULT_CARD_TABLE_SORT, sameCardTableSort, type CardTableSort, type CardTableSortField, type LibraryOptions } from "../../libraryModel.ts";
import type { CardListItem } from "./CardHitTable.tsx";
import { createHitListModel, createPagedCardTableModel } from "./cardListModel.ts";
import { useVirtualRows } from "./virtualRows.ts";

const CARD_SEARCH_DEBOUNCE_MS = 250;
/** List key of the flat hit list of a search (KV3); its pages span every deck in scope. */
export const HIT_LIST_KEY = "__hits__";
/** Heights until a row is measured (desktop): card row (the deck path stands beside the text) and notice row. */
const ROW_ESTIMATE = { card: 28.72, notice: 29 } as const;

/**
 * The search of the card management and its flat hit list (KV3): the typed query with its debounced, applied form and
 * the search timing, the sort, the list model and its virtual rows, and the page requests for the rows near the visible area
 * and for the open card.
 */
export function useCardSearch({ decks, libraryDecks, cardPages, deckSummaries, noteTypes, now, dayStartHour, learnAheadMinutes, timeZone, onRequestCardPage, paused, selectedCardId, pendingHit, linkedQuery = "" }: Pick<LibraryOptions, "dayStartHour" | "learnAheadMinutes" | "timeZone" | "deckSummaries"> & {
  decks: Deck[];
  /** Decks in scope: every deck, or the tree of the open deck content. */
  libraryDecks: Deck[];
  cardPages: Readonly<Record<string, DecksCardPage | undefined>> | undefined;
  noteTypes: NonNullable<Parameters<typeof createCardSearchContext>[2]>["noteTypes"];
  now: string;
  onRequestCardPage: DecksScreenProps["onRequestCardPage"];
  /** True while another content tab hides the list, so it asks for nothing. */
  paused: boolean;
  selectedCardId: string | null;
  /** Prev/next to a row whose page is not loaded yet. */
  pendingHit: { listKey: string; index: number } | null;
  /** A search opened from a link; each new one replaces the typed search right away. */
  linkedQuery?: string;
}) {
  const [cardSort, setCardSort] = React.useState<CardTableSort>(DEFAULT_CARD_TABLE_SORT);
  function changeSort(field: CardTableSortField) {
    setCardSort((current) => current.field === field
      ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field, direction: "asc" });
  }
  const [query, setQuery] = React.useState(linkedQuery);
  const [deferredQuery, setDeferredQuery] = React.useState(linkedQuery);
  React.useEffect(() => {
    if (!linkedQuery) return;
    setQuery(linkedQuery);
    setDeferredQuery(linkedQuery);
  }, [linkedQuery]);
  const searchContext = React.useMemo(() => createCardSearchContext(deferredQuery, decks, { now, dayStartHour, timeZone, noteTypes }), [dayStartHour, decks, deferredQuery, noteTypes, now, timeZone]);
  function changeQuery(next: string) {
    startFieldTiming("core:card_search_results");
    setQuery(next);
  }
  React.useEffect(() => {
    if (query === deferredQuery) return;
    const timer = window.setTimeout(() => setDeferredQuery(query), CARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, query]);
  const usesCardPages = Boolean(onRequestCardPage);
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
  // The search timing ends once the shown list belongs to the typed query; leaving the screen drops it.
  React.useEffect(() => {
    if (query === deferredQuery && !cardsLoading) finishFieldTiming("card-list");
  }, [cardsLoading, deferredQuery, query]);
  React.useEffect(() => () => cancelFieldTiming("card-list"), []);
  // Items hold only the structure; rows are looked up at render, so an arriving page does not rebuild 50,000 items.
  const limitedHits = Boolean(cardPages?.[HIT_LIST_KEY]?.limitedToLocalCatalog);
  const items = React.useMemo<CardListItem[]>(() => {
    const list: CardListItem[] = limitedHits ? [{ kind: "notice", key: "notice:hits" }] : [];
    for (let index = 0; index < hitList.totalCardCount; index += 1) list.push({ kind: "card", key: `hit:${index}`, listKey: HIT_LIST_KEY, index });
    return list;
    // The length and the notice stand for the structure; the rows are read at render.
  }, [hitList.totalCardCount, limitedHits]);
  const rowOf = (item: Extract<CardListItem, { kind: "card" }> | undefined) => item ? hitList.rowsByIndex.get(item.index) : undefined;
  const cardItems = React.useMemo(() => items.filter((item): item is Extract<CardListItem, { kind: "card" }> => item.kind === "card"), [items]);
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
  const itemKey = React.useCallback((index: number) => items[index].key, [items]);
  const itemEstimate = React.useCallback((index: number) => {
    const item = items[index];
    return item.kind === "card" ? ROW_ESTIMATE.card : ROW_ESTIMATE.notice;
  }, [items]);
  const virtual = useVirtualRows({ count: items.length, keyAt: itemKey, estimate: itemEstimate });
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
    if (!onRequestCardPage || paused) return;
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
  }, [cardPages, cardSort, deferredQuery, droppedPages, hitList, hitScope, items, onRequestCardPage, paused, pendingHit, searchContext, virtual.end, virtual.start]);

  // The open card loads with a page of its list: a shown page when there is one, so only the card is read.
  React.useEffect(() => {
    if (!onRequestCardPage || !selectedCardId || paused) return;
    const list = cardPages?.[HIT_LIST_KEY];
    const shown = Boolean(list && list.query === deferredQuery && sameCardTableSort(list.sort, cardSort));
    if (shown && (list!.requestedCardId === selectedCardId || list!.loadError)) return;
    const loadedPage = shown ? Number(Object.keys(list!.pages)[0] ?? 0) : 0;
    void onRequestCardPage({
      deckId: HIT_LIST_KEY,
      deckIds: hitScope,
      page: loadedPage,
      pageSize: CARD_TABLE_PAGE_SIZE,
      query: deferredQuery,
      sort: cardSort,
      selectedCardId,
      searchContext,
    });
  }, [cardPages, cardSort, deferredQuery, hitScope, onRequestCardPage, paused, searchContext, selectedCardId]);

  return { query, deferredQuery, changeQuery, cardSort, changeSort, searchContext, tableModel, hitScope, hitList, cardsLoading, items, rowOf, cardItems, locateCard, virtual };
}
