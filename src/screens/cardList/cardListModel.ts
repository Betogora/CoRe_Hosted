import { parseCardSearchQuery, pathMatchesCardSearch } from "../../cardSearchQuery.ts";
import type { Deck } from "../../coreTypes.ts";
import { CARD_TABLE_PAGE_SIZE, createCardTableModel, createCardTableRow, sameCardTableSort, type CardTableSort, type LibraryOptions } from "../../libraryModel.ts";
import type { CardCatalogEntry } from "../../workspaceReplica.ts";

export function cardCount(count: number) {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? "Karte" : "Karten"}`;
}

// Card lists of the card management (KV3). Kept apart from libraryModel.ts so they load with the card management only.

type CardTableRow = ReturnType<typeof createCardTableRow>;

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Loaded windows of one card list (a deck or the flat hit list); it only counts while query and sort still match. */
interface CardTableList {
  pages: Readonly<Record<number, CardCatalogEntry[]>>;
  pageSize: number;
  totalCount: number;
  query: string;
  sort: CardTableSort;
}

/** Rows per catalog entry: a list with many loaded pages builds only the rows of a newly arrived page. */
const cardTableRowCache = new WeakMap<CardCatalogEntry, { options: string; row: CardTableRow }>();

function cachedCardTableRow(entry: CardCatalogEntry, options: Pick<LibraryOptions, "dayStartHour" | "timeZone">) {
  const key = `${options.dayStartHour ?? ""}|${options.timeZone ?? ""}`;
  const cached = cardTableRowCache.get(entry);
  if (cached?.options === key) return cached.row;
  const row = createCardTableRow(entry, options);
  cardTableRowCache.set(entry, { options: key, row });
  return row;
}

/**
 * Rows of one list by position: the loaded pages of the current query and sort, or while they are requested the
 * previous list as a stale placeholder. `totalCount` is the list length the virtual table reserves rows for.
 */
function createCardTableListRows(
  list: CardTableList | undefined,
  { query, cardSort, awaitingPages, fallbackTotal, ...rowOptions }: Pick<LibraryOptions, "dayStartHour" | "timeZone"> & {
    query: string;
    cardSort: CardTableSort;
    awaitingPages: boolean;
    fallbackTotal: number;
  },
) {
  const current = list && list.query === query && sameCardTableSort(list.sort, cardSort) ? list : undefined;
  const loading = awaitingPages && !current;
  const shown = current ?? (loading ? list : undefined);
  const rowsByIndex = new Map<number, CardTableRow>();
  let end = 0;
  for (const page of Object.keys(shown?.pages ?? {}).map(Number).sort((left, right) => left - right)) {
    const offset = page * (shown?.pageSize ?? CARD_TABLE_PAGE_SIZE);
    shown!.pages[page].forEach((entry, index) => rowsByIndex.set(offset + index, cachedCardTableRow(entry, rowOptions)));
    // An empty page (asked for while a longer list was still shown) does not lengthen the list.
    if (shown!.pages[page].length) end = Math.max(end, offset + shown!.pages[page].length);
  }
  const cardRows = [...rowsByIndex.values()];
  const totalCardCount = Math.max(end, Math.floor(shown?.totalCount ?? fallbackTotal));
  return { rowsByIndex, cardRows, totalCardCount, loading };
}

/**
 * Card table over catalog lists: each group keeps its locally loaded deck and its rows come from that deck's list;
 * groups whose list is still requested stay visible during a search.
 */
export function createPagedCardTableModel(
  decks: Deck[],
  cardPages: Readonly<Record<string, CardTableList | undefined>> | undefined,
  options: Omit<LibraryOptions, "query" | "cardSort" | "notesById"> & {
    query: string;
    cardSort: CardTableSort;
    awaitingPages: boolean;
  },
) {
  const { query, cardSort, awaitingPages, ...modelOptions } = options;
  const originalDecks = new Map(decks.map((deck) => [deck.id, deck]));
  const baseModel = createCardTableModel(decks.map((deck) => ({ ...deck, cards: [] })), modelOptions);
  const normalizedQuery = normalize(query);
  const search = parseCardSearchQuery(query);
  const allGroups = baseModel.allGroups.map((group) => {
    const list = createCardTableListRows(cardPages?.[group.id], {
      query, cardSort, awaitingPages, dayStartHour: options.dayStartHour, timeZone: options.timeZone,
      fallbackTotal: normalizedQuery ? 0 : options.deckSummaries?.get(group.id)?.inventory.totalCards ?? 0,
    });
    const deckMatches = pathMatchesCardSearch(group.path, search);
    return { ...group, deck: originalDecks.get(group.id) ?? group.deck, ...list, deckMatches };
  });
  const groups = allGroups.filter((group) => (
    !normalizedQuery
    || group.deckMatches
    || group.totalCardCount > 0
    || group.loading
  ));
  return { allGroups, groups, cardSort };
}

/** The flat hit list of a search over all decks in scope (KV3), from its own card list. */
export function createHitListModel(
  list: CardTableList | undefined,
  options: Pick<LibraryOptions, "dayStartHour" | "timeZone"> & { query: string; cardSort: CardTableSort; awaitingPages: boolean },
) {
  return createCardTableListRows(list, { ...options, fallbackTotal: 0 });
}
