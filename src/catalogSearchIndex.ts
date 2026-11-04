import { matchesCardSearch, parseCardSearchQuery } from "./cardSearchQuery.ts";
import { NO_DUE_DATE } from "./indexedDbStore.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { CardCatalogEntry } from "./workspaceReplica.ts";

/** Same sort keys and code-unit order as the catalog's IndexedDB indexes (`deckSort`, `deckDue`, `deckVariants`). */
export function catalogSortValue(entry: CardCatalogEntry, field: CardTableSort["field"]): string {
  if (field === "nextStudyDate") return entry.dueAt ?? NO_DUE_DATE;
  if (field === "variants") return entry.hasActiveVariants ? "1" : "0";
  return entry.sortText;
}

function compareEntries(field: CardTableSort["field"]) {
  return (left: CardCatalogEntry, right: CardCatalogEntry) => {
    const a = catalogSortValue(left, field);
    const b = catalogSortValue(right, field);
    if (a !== b) return a < b ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  };
}

/**
 * In-memory search over the whole local catalog. Each sort order is computed once and filtered in that order,
 * so a search is one pass; results stay cached per query and sort until the catalog changes.
 */
export function createCatalogSearchIndex() {
  const entries = new Map<string, CardCatalogEntry>();
  const orders = new Map<CardTableSort["field"], CardCatalogEntry[]>();
  let cached: { key: string; byDeck: Map<string, CardCatalogEntry[]> } | null = null;
  const changed = () => {
    orders.clear();
    cached = null;
  };
  const order = (field: CardTableSort["field"]) => {
    let sorted = orders.get(field);
    if (!sorted) {
      sorted = [...entries.values()].sort(compareEntries(field));
      orders.set(field, sorted);
    }
    return sorted;
  };
  return {
    replaceAll(rows: Iterable<CardCatalogEntry>) {
      entries.clear();
      for (const row of rows) if (!row.deletedAt) entries.set(row.id, row);
      changed();
    },
    put(row: CardCatalogEntry) {
      if (row.deletedAt) entries.delete(row.id);
      else entries.set(row.id, row);
      changed();
    },
    remove(id: string) {
      if (entries.delete(id)) changed();
    },
    /** Matching entries per deck in the requested order. */
    search(query: string, sort: CardTableSort): ReadonlyMap<string, readonly CardCatalogEntry[]> {
      const key = JSON.stringify([query, sort.field, sort.direction]);
      if (cached?.key === key) return cached.byDeck;
      const search = parseCardSearchQuery(query);
      const byDeck = new Map<string, CardCatalogEntry[]>();
      const sorted = order(sort.field);
      const descending = sort.direction === "desc";
      for (let index = 0; index < sorted.length; index += 1) {
        const entry = sorted[descending ? sorted.length - 1 - index : index];
        if (!matchesCardSearch(entry, search)) continue;
        const list = byDeck.get(entry.deckId);
        if (list) list.push(entry);
        else byDeck.set(entry.deckId, [entry]);
      }
      cached = { key, byDeck };
      return byDeck;
    },
  };
}

export type CatalogSearchIndex = ReturnType<typeof createCatalogSearchIndex>;
