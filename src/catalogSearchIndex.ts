import { matchesCardSearch, parseCardSearchQuery, searchesDuplicates, type CardSearchContext } from "./cardSearchQuery.ts";
import { duplicateContents, groupDuplicates } from "./duplicateContents.ts";
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

export function compareCatalogEntries(sort: CardTableSort) {
  const compare = compareEntries(sort.field);
  return sort.direction === "desc" ? (left: CardCatalogEntry, right: CardCatalogEntry) => compare(right, left) : compare;
}

/** Index of `entry` in `sorted`, or where it belongs; `sorted` is in `compare` order. */
function position(sorted: readonly CardCatalogEntry[], entry: CardCatalogEntry, compare: (left: CardCatalogEntry, right: CardCatalogEntry) => number) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(sorted[middle], entry) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Each sort order is computed once and filtered in that order, so a search is one pass; a changed or removed entry
 * moves only itself within the computed orders. Results stay cached per query and sort until the catalog changes.
 * The duplicate contents of `is:duplicate` stay cached until a front changes or a card comes or goes; its hits keep
 * each group of equal fronts together.
 */
export function createCatalogSearchIndex() {
  const entries = new Map<string, CardCatalogEntry>();
  const orders = new Map<CardTableSort["field"], CardCatalogEntry[]>();
  let cached: { key: string; all: CardCatalogEntry[]; byDeck: Map<string, CardCatalogEntry[]>; scoped: Map<string, CardCatalogEntry[]> } | null = null;
  let duplicates: Map<string, string> | null = null;
  const move = (previous: CardCatalogEntry | undefined, next: CardCatalogEntry | undefined) => {
    for (const [field, sorted] of orders) {
      const compare = compareEntries(field);
      if (previous) {
        const at = position(sorted, previous, compare);
        if (next && catalogSortValue(previous, field) === catalogSortValue(next, field)) {
          sorted[at] = next;
          continue;
        }
        sorted.splice(at, 1);
      }
      if (next) sorted.splice(position(sorted, next, compare), 0, next);
    }
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
      orders.clear();
      cached = null;
      duplicates = null;
    },
    put(row: CardCatalogEntry) {
      const previous = entries.get(row.id);
      if (row.deletedAt) entries.delete(row.id);
      else entries.set(row.id, row);
      if (!previous || row.deletedAt || previous.noteId !== row.noteId || previous.frontPreview !== row.frontPreview || previous.sortText !== row.sortText) duplicates = null;
      move(previous, row.deletedAt ? undefined : row);
    },
    remove(id: string) {
      const previous = entries.get(id);
      if (previous && entries.delete(id)) {
        duplicates = null;
        move(previous, undefined);
      }
    },
    search(query: string, sort: CardTableSort, context?: CardSearchContext): ReadonlyMap<string, readonly CardCatalogEntry[]> {
      return matching(query, sort, context).byDeck;
    },
    /** `deckIds` null means all decks. Any window is a slice of the cached result, so scrolling far needs no walk. */
    slice(query: string, sort: CardTableSort, context: CardSearchContext | undefined, deckIds: readonly string[] | null, offset: number, limit: number) {
      const result = matching(query, sort, context);
      let list: readonly CardCatalogEntry[];
      if (deckIds === null) list = result.all;
      else if (deckIds.length === 1) list = result.byDeck.get(deckIds[0]) ?? [];
      else {
        const scopeKey = [...deckIds].sort().join("\n");
        let scoped = result.scoped.get(scopeKey);
        if (!scoped) {
          const allowed = new Set(deckIds);
          scoped = result.all.filter((entry) => allowed.has(entry.deckId));
          result.scoped.set(scopeKey, scoped);
        }
        list = scoped;
      }
      return { items: list.slice(offset, offset + limit), totalCount: list.length };
    },
  };
  function matching(query: string, sort: CardTableSort, context?: CardSearchContext) {
    const key = JSON.stringify([query, sort.field, sort.direction, context ?? null]);
    if (cached?.key === key) return cached;
    const search = parseCardSearchQuery(query, context);
    const duplicateGroups = searchesDuplicates(search) ? duplicates ??= duplicateContents(entries.values()) : undefined;
    let all: CardCatalogEntry[] = [];
    const byDeck = new Map<string, CardCatalogEntry[]>();
    const addToDeck = (entry: CardCatalogEntry) => {
      const list = byDeck.get(entry.deckId);
      if (list) list.push(entry);
      else byDeck.set(entry.deckId, [entry]);
    };
    const sorted = order(sort.field);
    const descending = sort.direction === "desc";
    for (let index = 0; index < sorted.length; index += 1) {
      const entry = sorted[descending ? sorted.length - 1 - index : index];
      if (!matchesCardSearch(entry, search, duplicateGroups)) continue;
      all.push(entry);
      if (!duplicateGroups) addToDeck(entry);
    }
    if (duplicateGroups) {
      all = groupDuplicates(all, duplicateGroups);
      all.forEach(addToDeck);
    }
    cached = { key, all, byDeck, scoped: new Map() };
    return cached;
  }
}
