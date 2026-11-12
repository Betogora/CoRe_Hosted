// Private to indexedDbCoreRepository.ts: applies catalog delta pages from the cloud while pending local edits keep their rows.
import type { Deck } from "./coreTypes.ts";
import type { CloudCatalogPage } from "./cloudRepository.ts";
import type { ReplicatedNoteTypeSource } from "./cloudRepositoryValidation.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import {
  bodyResidencyForRevision,
  type CardBodyResidencyRecord,
  type CardCatalogEntry,
  type DeckStudySummary,
  type NoteSearchEntry,
  type NoteSearchField,
  type OfflineDeckRecord,
} from "./workspaceReplica.ts";
import {
  STORE,
  type StoredCardCatalog,
  type WorkspaceDeckSummary,
  requestResult,
  transactionDone,
  storedCatalogRecord,
  deckRecord,
} from "./indexedDbStore.ts";

/** Object stores each catalog table writes; one call opens the union of the tables it applies. */
const CATALOG_PAGE_STORES: Record<CloudCatalogPage["table"], string[]> = {
  decks: [STORE.decks],
  note_type_sources: [STORE.noteTypeSources],
  deck_study_summaries: [STORE.deckStudySummaries],
  note_search: [STORE.noteSearch, STORE.cardCatalog],
  card_catalog: [STORE.cardCatalog, STORE.noteSearch, STORE.cards, STORE.variants, STORE.bodyResidency, STORE.deckStudySummaries, STORE.offlineDecks, STORE.syncMetadata],
};

/**
 * Applies the tables of one catalog delta page in one transaction, in the given order. Search texts that arrive in
 * the same call go into the catalog rows before they are written, so each row is written once.
 */
export async function writeCloudCatalogPages(database: IDBDatabase, pages: CloudCatalogPage[], {
  pendingEntityMutation,
  pendingEntityIdsForTable,
  markCatalogChanged,
  markCatalogReset,
  applyReplicaCatalogChanges,
}: {
  pendingEntityMutation: (table: string, entityId: string) => SyncOutboxMutation | undefined;
  pendingEntityIdsForTable: (table: string) => string[];
  markCatalogChanged: (id: string) => void;
  markCatalogReset: () => void;
  applyReplicaCatalogChanges: (
    transaction: IDBTransaction,
    changes: ReadonlyArray<{ deckId: string; before: StoredCardCatalog | null; after: StoredCardCatalog | null }>,
    referenceAt?: string,
    updateOverview?: boolean,
  ) => Promise<void>;
}) {
  const tables = new Set(pages.map((page) => page.table));
  const transaction = database.transaction([...new Set(pages.flatMap((page) => CATALOG_PAGE_STORES[page.table]))], "readwrite");
  const done = transactionDone(transaction);
  // A pending local edit keeps its own, newer rows and text until its upload comes back.
  const pendingCardIds = new Set(tables.has("card_catalog") ? pendingEntityIdsForTable("cards") : []);
  const pendingNoteIds = new Set(tables.has("card_catalog") || tables.has("note_search") ? pendingEntityIdsForTable("notes") : []);
  const incomingSearch = new Map<string, { searchText: string; searchFields: NoteSearchField[] }>();
  for (const page of pages) {
    if (page.table !== "note_search") continue;
    for (const entry of page.entities as NoteSearchEntry[]) {
      if (!entry.deletedAt) incomingSearch.set(entry.noteId, { searchText: entry.searchText.slice(0, 4_000), searchFields: entry.searchFields });
    }
  }
  const rowsWithIncomingText = new Set<string>();
  for (const page of pages) {
    if (page.table === "decks") {
      const entities = (page.entities as Deck[]).filter((entity) => !pendingEntityMutation("decks", entity.id));
      const store = transaction.objectStore(STORE.decks);
      if (page.reset) {
        const protectedRows = (await Promise.all(pendingEntityIdsForTable("decks").map((id) => requestResult<WorkspaceDeckSummary | undefined>(store.get(id))))).filter(Boolean);
        store.clear();
        for (const row of protectedRows) store.put(row);
      }
      for (const entity of entities) {
        if (entity.deletedAt) store.delete(entity.id);
        else store.put(deckRecord(entity));
      }
    } else if (page.table === "note_type_sources") {
      const store = transaction.objectStore(STORE.noteTypeSources);
      for (const source of page.entities as ReplicatedNoteTypeSource[]) {
        if (pendingEntityMutation("note_type_sources", source.id)) continue;
        if (source.deletedAt) store.delete(source.id);
        else store.put(source);
      }
    } else if (page.table === "deck_study_summaries") {
      const store = transaction.objectStore(STORE.deckStudySummaries);
      if (page.reset) store.clear();
      for (const entity of page.entities as DeckStudySummary[]) store.put(entity);
    } else if (page.table === "note_search") {
      const searchStore = transaction.objectStore(STORE.noteSearch);
      const catalogStore = transaction.objectStore(STORE.cardCatalog);
      const entries = page.entities as NoteSearchEntry[];
      for (const entry of entries) {
        if (entry.deletedAt) searchStore.delete(entry.noteId);
        else searchStore.put({ noteId: entry.noteId, ...incomingSearch.get(entry.noteId)! });
      }
      const noteIds = [...new Set(entries.filter((entry) => !entry.deletedAt && !pendingNoteIds.has(entry.noteId)).map((entry) => entry.noteId))];
      const rowsByNote = await Promise.all(noteIds.map((noteId) => requestResult<StoredCardCatalog[]>(catalogStore.index("noteId").getAll(noteId))));
      noteIds.forEach((noteId, index) => {
        const { searchText, searchFields } = incomingSearch.get(noteId)!;
        for (const row of rowsByNote[index]) {
          if (rowsWithIncomingText.has(row.id)) continue;
          catalogStore.put({ ...row, normalizedSearchText: searchText, searchFields }); markCatalogChanged(row.id);
        }
      });
    } else {
      const catalogStore = transaction.objectStore(STORE.cardCatalog);
      const searchStore = transaction.objectStore(STORE.noteSearch);
      const variantStore = transaction.objectStore(STORE.variants);
      const residencyStore = transaction.objectStore(STORE.bodyResidency);
      const offlineStore = transaction.objectStore(STORE.offlineDecks);
      if (page.reset) {
        const protectedRows = (await Promise.all(pendingEntityIdsForTable("cards").map((id) => requestResult<StoredCardCatalog | undefined>(catalogStore.get(id))))).filter(Boolean);
        catalogStore.clear(); markCatalogReset();
        for (const row of protectedRows) catalogStore.put(row);
      }
      const entities = (page.entities as CardCatalogEntry[]).filter((entity) => !pendingCardIds.has(entity.id) && !pendingNoteIds.has(entity.noteId));
      // All reads of the page go out at once; the maps then follow the page's own writes.
      const ids = [...new Set(entities.map((entity) => entity.id))];
      const deletedIds = [...new Set(entities.filter((entity) => entity.deletedAt).map((entity) => entity.id))];
      const [storedCatalogs, storedResidencies, deletedVariantKeys] = await Promise.all([
        Promise.all(ids.map((id) => requestResult<StoredCardCatalog | undefined>(catalogStore.get(id)))),
        Promise.all(ids.map((id) => requestResult<CardBodyResidencyRecord | undefined>(residencyStore.get(id)))),
        Promise.all(deletedIds.map((id) => requestResult<IDBValidKey[]>(variantStore.index("cardId").getAllKeys(id)))),
      ]);
      const catalogs = new Map(ids.map((id, index) => [id, storedCatalogs[index] ?? null]));
      const residencies = new Map(ids.map((id, index) => [id, storedResidencies[index]]));
      const variantKeys = new Map(deletedIds.map((id, index) => [id, deletedVariantKeys[index]]));
      // Cloud entries carry only the preview; the full text comes from a local content or the replicated note search.
      const keepsLocalText = (entity: CardCatalogEntry, previous: StoredCardCatalog | null): previous is StoredCardCatalog => (
        Boolean(previous && previous.noteId === entity.noteId && previous.dependencyRevision === entity.dependencyRevision)
      );
      type StoredSearch = { searchText: string; searchFields?: NoteSearchField[] } | undefined;
      const searchNoteIds = [...new Set(entities
        .filter((entity) => !entity.deletedAt && !incomingSearch.has(entity.noteId) && !keepsLocalText(entity, catalogs.get(entity.id)!))
        .map((entity) => entity.noteId))];
      const storedSearch = await Promise.all(searchNoteIds.map((noteId) => requestResult<StoredSearch>(searchStore.get(noteId))));
      const searchTexts = new Map(searchNoteIds.map((noteId, index) => [noteId, storedSearch[index]]));
      const referenceAt = new Date().toISOString();
      const catalogChanges: Array<{ deckId: string; before: StoredCardCatalog | null; after: StoredCardCatalog | null }> = [];
      const changedDeckIds = new Set<string>();
      for (const entity of entities) {
        const previousCatalog = catalogs.get(entity.id)!;
        if (!previousCatalog || previousCatalog.bodyRevision !== entity.bodyRevision || previousCatalog.studyRevision !== entity.studyRevision
          || previousCatalog.dependencyRevision !== entity.dependencyRevision || previousCatalog.deletedAt !== entity.deletedAt) {
          changedDeckIds.add(entity.deckId);
        }
        if (entity.deletedAt) {
          catalogChanges.push({ deckId: entity.deckId, before: previousCatalog, after: null });
          catalogStore.delete(entity.id); markCatalogChanged(entity.id);
          transaction.objectStore(STORE.cards).delete(entity.id);
          residencyStore.delete(entity.id);
          for (const key of variantKeys.get(entity.id)!) variantStore.delete(key);
          catalogs.set(entity.id, null);
          residencies.set(entity.id, undefined);
          continue;
        }
        const incoming = incomingSearch.get(entity.noteId);
        const keepsText = !incoming && keepsLocalText(entity, previousCatalog);
        const replicated = incoming ?? (keepsText ? null
          : searchTexts.has(entity.noteId) ? searchTexts.get(entity.noteId) : await requestResult<StoredSearch>(searchStore.get(entity.noteId)));
        const catalog = storedCatalogRecord({
          ...entity,
          normalizedSearchText: keepsText ? previousCatalog.normalizedSearchText : replicated?.searchText ?? entity.normalizedSearchText,
          searchFields: keepsText ? previousCatalog.searchFields : replicated?.searchFields,
        });
        if (incoming) rowsWithIncomingText.add(catalog.id);
        if (previousCatalog && previousCatalog.deckId !== catalog.deckId) catalogChanges.push({ deckId: previousCatalog.deckId, before: previousCatalog, after: null });
        catalogChanges.push({ deckId: catalog.deckId, before: previousCatalog?.deckId === catalog.deckId ? previousCatalog : null, after: catalog });
        catalogStore.put(catalog); markCatalogChanged(catalog.id);
        catalogs.set(catalog.id, catalog);
        const residency = residencies.get(entity.id);
        if (residency && bodyResidencyForRevision(residency, entity) === "catalog-only") {
          const next: CardBodyResidencyRecord = { ...residency, state: "catalog-only", bodyRevision: entity.bodyRevision, studyRevision: entity.studyRevision, dependencyRevision: entity.dependencyRevision };
          residencyStore.put(next);
          residencies.set(entity.id, next);
        }
      }
      await applyReplicaCatalogChanges(transaction, catalogChanges, referenceAt, !page.reset);
      const deckIds = [...changedDeckIds];
      const downloads = await Promise.all(deckIds.map((deckId) => requestResult<OfflineDeckRecord | undefined>(offlineStore.get(deckId))));
      for (const download of downloads) {
        if (download?.state === "available") offlineStore.put({ ...download, state: "outdated", updatedAt: new Date().toISOString() });
      }
    }
  }
  await done;
}
