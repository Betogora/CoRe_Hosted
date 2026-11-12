// Private to indexedDbCoreRepository.ts: catalog reads, the in-memory search index with its change marks, keyset pages.
import type { CardTableSort } from "./libraryModel.ts";
import { duplicateFieldNames, findDuplicateGroups, type DuplicateKey } from "./duplicateContents.ts";
import { isEmptyCardSearch, parseCardSearchQuery, type CardSearchContext } from "./cardSearchQuery.ts";
import { catalogSortValue, createCatalogSearchIndex } from "./catalogSearchIndex.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";
import {
  STORE,
  LOCAL_WRITE_CHUNK_SIZE,
  CATALOG_PAGE_LIMIT,
  type StoredCardCatalog,
  requestResult,
  transactionDone,
  catalogEntry,
} from "./indexedDbStore.ts";

export interface CatalogCursor {
  sortValue: string;
  id: string;
}

/** Catalog rows read per transaction while the search index loads; small enough to keep each task short. */
const SEARCH_INDEX_BATCH_SIZE = 1_000;

export function createCatalogSearch(database: IDBDatabase, flushWrites: () => Promise<void>) {
  // Searches run over an in-memory copy of the catalog (KV1). Writes only mark rows; the copy catches up before the
  // next search, and a cleared catalog reloads it in batches that do not block the page.
  const searchIndex = createCatalogSearchIndex();
  let searchIndexGeneration = 0;
  let searchIndexReady = false;
  let searchIndexLoad: Promise<void> | null = null;
  const changedCatalogIds = new Set<string>();
  const markCatalogChanged = (id: string) => { changedCatalogIds.add(id); };
  const markCatalogReset = () => {
    searchIndexGeneration += 1;
    searchIndexReady = false;
    changedCatalogIds.clear();
  };
  const loadSearchIndex = async () => {
    const generation = searchIndexGeneration;
    changedCatalogIds.clear();
    const rows: CardCatalogEntry[] = [];
    let after: string | null = null;
    while (true) {
      const transaction = database.transaction(STORE.cardCatalog, "readonly");
      const range: IDBKeyRange | undefined = after === null ? undefined : IDBKeyRange.lowerBound(after, true);
      const batch: StoredCardCatalog[] = await requestResult<StoredCardCatalog[]>(transaction.objectStore(STORE.cardCatalog).getAll(range, SEARCH_INDEX_BATCH_SIZE));
      for (const row of batch) rows.push(catalogEntry(row));
      if (batch.length < SEARCH_INDEX_BATCH_SIZE) break;
      after = batch.at(-1)!.id;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (generation !== searchIndexGeneration) return;
    searchIndex.replaceAll(rows);
    searchIndexReady = true;
  };
  // Rows written since the index last read them; a caller that finds them being read waits, so no page is served from
  // the index in between (a mass action followed by its list reload).
  let changedRowsRead: Promise<void> | null = null;
  const readChangedRows = async (ids: string[]) => {
    const transaction = database.transaction(STORE.cardCatalog, "readonly");
    const store = transaction.objectStore(STORE.cardCatalog);
    const rows = await Promise.all(ids.map((id) => requestResult<StoredCardCatalog | undefined>(store.get(id))));
    ids.forEach((id, index) => {
      const row = rows[index];
      if (row) searchIndex.put(catalogEntry(row));
      else searchIndex.remove(id);
    });
  };
  const ensureSearchIndex = async () => {
    await flushWrites();
    while (!searchIndexReady) {
      searchIndexLoad ??= loadSearchIndex().finally(() => { searchIndexLoad = null; });
      await searchIndexLoad;
    }
    while (changedRowsRead || changedCatalogIds.size) {
      if (!changedRowsRead) {
        const ids = [...changedCatalogIds];
        changedCatalogIds.clear();
        changedRowsRead = readChangedRows(ids).finally(() => { changedRowsRead = null; });
      }
      await changedRowsRead;
    }
  };

  /** Keyset page of a deck's local catalog; a query is answered from the in-memory search index. */
  const listCatalogPage = async (deckId: string, {
    cursor = null,
    limit = CATALOG_PAGE_LIMIT,
    query = "",
    sort = { field: "sortField", direction: "asc" } as CardTableSort,
    includeTotal = false,
    searchContext,
  }: { cursor?: CatalogCursor | null; limit?: number; query?: string; sort?: CardTableSort; includeTotal?: boolean; searchContext?: CardSearchContext } = {}) => {
    await flushWrites();
    const pageLimit = Math.min(CATALOG_PAGE_LIMIT, Math.max(1, Math.floor(Number(limit))));
    if (!isEmptyCardSearch(parseCardSearchQuery(query))) {
      await ensureSearchIndex();
      const matches = searchIndex.search(query, sort, searchContext).get(deckId) ?? [];
      const descending = sort.direction === "desc";
      const start = cursor ? matches.findIndex((entry) => {
        const value = catalogSortValue(entry, sort.field);
        const order = value !== cursor.sortValue ? (value < cursor.sortValue ? -1 : 1) : (entry.id < cursor.id ? -1 : entry.id > cursor.id ? 1 : 0);
        return descending ? order < 0 : order > 0;
      }) : 0;
      const from = start < 0 ? matches.length : start;
      const items = matches.slice(from, from + pageLimit);
      const hasMore = from + pageLimit < matches.length;
      const lastItem = items.at(-1);
      return {
        items,
        totalCount: includeTotal ? matches.length : null,
        hasMore,
        nextCursor: hasMore && lastItem ? { sortValue: catalogSortValue(lastItem, sort.field), id: lastItem.id } : null,
      };
    }
    const indexName = sort.field === "nextStudyDate" ? "deckDue" : sort.field === "variants" ? "deckVariants" : "deckSort";
    const sortValueOf = (row: StoredCardCatalog) => indexName === "deckDue" ? row.dueSort : indexName === "deckVariants" ? String(row.hasActiveVariants) : row.sortText;
    const keyFor = (value: string, id: string): IDBValidKey => indexName === "deckVariants" ? [deckId, Number(value), id] : [deckId, value, id];
    const lower = indexName === "deckVariants" ? [deckId, 0, ""] : [deckId, "", ""];
    const upper = indexName === "deckVariants" ? [deckId, 1, "￿"] : [deckId, "￿", "￿"];
    const descending = sort.direction === "desc";
    const rows: StoredCardCatalog[] = [];
    let totalCount: number | null = null;
    let boundary: IDBValidKey | null = cursor ? keyFor(cursor.sortValue, cursor.id) : null;
    let complete = false;
    let hasMore = false;
    if (includeTotal) {
      const countTransaction = database.transaction(STORE.cardCatalog, "readonly");
      totalCount = await requestResult(countTransaction.objectStore(STORE.cardCatalog).index(indexName).count(IDBKeyRange.bound(lower, upper)));
      await transactionDone(countTransaction);
    }
    while (!complete && rows.length <= pageLimit) {
      const transaction = database.transaction(STORE.cardCatalog, "readonly");
      const index = transaction.objectStore(STORE.cardCatalog).index(indexName);
      const range = boundary == null
        ? IDBKeyRange.bound(lower, upper)
        : descending ? IDBKeyRange.bound(lower, boundary, false, true) : IDBKeyRange.bound(boundary, upper, true, false);
      const request = index.openCursor(range, descending ? "prev" : "next");
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      let scanned = 0;
      await new Promise<void>((resolve, reject) => {
        request.onerror = () => reject(request.error ?? new Error("Kartenkatalog konnte nicht gelesen werden."));
        request.onsuccess = () => {
          const entry = request.result;
          if (!entry) { complete = true; resolve(); return; }
          const row = entry.value as StoredCardCatalog;
          scanned += 1;
          boundary = entry.key;
          if (!row.deletedAt) rows.push(row);
          const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
          if (rows.length > pageLimit || scanned >= LOCAL_WRITE_CHUNK_SIZE || elapsed >= 25) { resolve(); return; }
          entry.continue();
        };
      });
      await transactionDone(transaction);
      if (!complete && rows.length <= pageLimit) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (rows.length > pageLimit) {
      rows.length = pageLimit;
      hasMore = true;
    }
    const last = rows.at(-1);
    return {
      items: rows.map(catalogEntry),
      totalCount,
      hasMore,
      nextCursor: hasMore && last ? { sortValue: sortValueOf(last), id: last.id } : null,
    };
  };

  return {
    searchIndex,
    isSearchIndexReady: () => searchIndexReady,
    markCatalogChanged,
    markCatalogReset,
    ensureSearchIndex,
    listCatalogPage,
    /** Local catalog rows of the given cards; missing ones (e.g. deleted here) are absent. */
    async loadCatalogEntries(cardIds: readonly string[]) {
      await flushWrites();
      const transaction = database.transaction(STORE.cardCatalog, "readonly");
      const store = transaction.objectStore(STORE.cardCatalog);
      const rows = await Promise.all(cardIds.map((id) => requestResult<StoredCardCatalog | undefined>(store.get(id))));
      return new Map(rows.filter((row): row is StoredCardCatalog => Boolean(row)).map((row) => [row.id, catalogEntry(row)]));
    },
    /** Ids of every card in scope that matches the search, in index order: `Alle N Treffer auswählen` (KV4). */
    /** `Duplikate finden` (KV5) over the searched cards of the scope, with the field names to choose from. */
    async findDuplicates(scope: readonly string[], { key, query = "", searchContext }: { key: DuplicateKey; query?: string; searchContext?: CardSearchContext }) {
      await flushWrites();
      await ensureSearchIndex();
      const entries = searchIndex.slice(query, { field: "sortField", direction: "asc" }, searchContext, scope, 0, Number.MAX_SAFE_INTEGER).items;
      return { fieldNames: duplicateFieldNames(entries), groups: findDuplicateGroups(entries, key) };
    },
    async listCardIds(scope: readonly string[], { query = "", searchContext, sort = { field: "sortField", direction: "asc" } }: { query?: string; searchContext?: CardSearchContext; sort?: CardTableSort } = {}) {
      await flushWrites();
      await ensureSearchIndex();
      return searchIndex.slice(query, sort, searchContext, scope, 0, Number.MAX_SAFE_INTEGER).items.map((entry) => entry.id);
    },
  };
}
