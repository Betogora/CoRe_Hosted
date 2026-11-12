// Private to indexedDbCoreRepository.ts: card body residency, loading and hydration, offline decks and quota eviction.
import type { Card, Note } from "./coreTypes.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import type { NoteTypeSource } from "./apkgImport.ts";
import {
  bodyResidencyForRevision,
  type BodyResidency,
  type CardBodyResidencyRecord,
  type NoteGraph,
  type OfflineCardManifestEntry,
  type OfflineDeckRecord,
  type OfflineMediaManifestEntry,
} from "./workspaceReplica.ts";
import {
  STORE,
  type StoredCard,
  type StoredVariant,
  type StoredCardCatalog,
  requestResult,
  transactionDone,
  iterateCursor,
  cardRecord,
  variantRecord,
  hydrateCard,
  catalogRecordFor,
  residencyRecord,
  serializedBytes,
} from "./indexedDbStore.ts";

export async function readNotes(transaction: IDBTransaction, noteIds: string[]) {
  const store = transaction.objectStore(STORE.notes);
  const notes = await Promise.all([...new Set(noteIds)].map((id) => requestResult<Note | undefined>(store.get(id))));
  return new Map(notes.filter((note): note is Note => Boolean(note)).map((note) => [note.id, note]));
}

export async function readCardBodies(transaction: IDBTransaction, cardIds: string[]) {
  const cardStore = transaction.objectStore(STORE.cards);
  const variantIndex = transaction.objectStore(STORE.variants).index("cardId");
  const records = await Promise.all(cardIds.map((id) => requestResult<StoredCard | undefined>(cardStore.get(id))));
  const variants = await Promise.all(cardIds.map((id) => requestResult<StoredVariant[]>(variantIndex.getAll(id))));
  return records.map((record, index) => record ? hydrateCard(record, variants[index]) : null);
}

export function createCardBodies(database: IDBDatabase, {
  flushWrites,
  pendingEntityMutation,
  pendingEntityIdsForTable,
  markCatalogChanged,
  applyReplicaCatalogChange,
}: {
  flushWrites: () => Promise<void>;
  pendingEntityMutation: (table: string, entityId: string) => SyncOutboxMutation | undefined;
  pendingEntityIdsForTable: (table: string) => string[];
  markCatalogChanged: (id: string) => void;
  applyReplicaCatalogChange: (transaction: IDBTransaction, deckId: string, before: StoredCardCatalog | null, after: StoredCardCatalog | null) => Promise<void>;
}) {
  const missingCardBodyIds = async (cardIds: string[]) => {
    await flushWrites();
    const transaction = database.transaction([STORE.cardCatalog, STORE.cards, STORE.notes, STORE.bodyResidency], "readonly");
    const ids = [...new Set(cardIds.filter(Boolean))];
    const [catalogs, cards, residencies] = await Promise.all([
      Promise.all(ids.map((id) => requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(id)))),
      Promise.all(ids.map((id) => requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(id)))),
      Promise.all(ids.map((id) => requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(id)))),
    ]);
    const notes = await readNotes(transaction, cards.flatMap((card) => card ? [card.noteId] : []));
    await transactionDone(transaction);
    return ids.filter((_id, index) => {
      const catalog = catalogs[index];
      const card = cards[index];
      return !catalog || !card || !notes.has(card.noteId) || bodyResidencyForRevision(residencies[index], catalog) === "catalog-only";
    });
  };

  const markCardBodiesResident = async (cardIds: string[], state: Exclude<BodyResidency, "catalog-only">) => {
    await flushWrites();
    const transaction = database.transaction([STORE.cardCatalog, STORE.bodyResidency], "readwrite");
    const catalogs = await Promise.all([...new Set(cardIds.filter(Boolean))].map((id) => requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(id))));
    for (const catalog of catalogs) if (catalog) transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, state));
    await transactionDone(transaction);
  };

  const touchCardBodies = async (cardIds: string[], protectedUntil: string | null = null) => {
    const transaction = database.transaction(STORE.bodyResidency, "readwrite");
    const store = transaction.objectStore(STORE.bodyResidency);
    const records = await Promise.all([...new Set(cardIds.filter(Boolean))].map((id) => requestResult<CardBodyResidencyRecord | undefined>(store.get(id))));
    const lastAccessedAt = new Date().toISOString();
    for (const record of records) if (record) store.put({ ...record, lastAccessedAt, protectedUntil: protectedUntil ?? record.protectedUntil ?? null });
    await transactionDone(transaction);
  };

  /** Resident cards with their contents in the given order; null where only the catalog entry is local. */
  const loadCardBodies = async (cardIds: string[]): Promise<Array<{ card: Card; note: Note } | null>> => {
    await flushWrites();
    const transaction = database.transaction([STORE.cards, STORE.variants, STORE.notes, STORE.cardCatalog, STORE.bodyResidency], "readonly");
    const [cards, catalogs, residencies] = await Promise.all([
      readCardBodies(transaction, cardIds),
      Promise.all(cardIds.map((id) => requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(id)))),
      Promise.all(cardIds.map((id) => requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(id)))),
    ]);
    const notes = await readNotes(transaction, cards.flatMap((card) => card ? [card.noteId] : []));
    await transactionDone(transaction);
    return cards.map((card, index) => {
      const note = card ? notes.get(card.noteId) : undefined;
      const catalog = catalogs[index];
      if (!card || !note || (catalog && bodyResidencyForRevision(residencies[index], catalog) === "catalog-only")) return null;
      return { card, note };
    });
  };

  const loadCardBody = async (cardId: string) => (await loadCardBodies([cardId]))[0];

  const loadNotes = async (noteIds: string[]) => {
    await flushWrites();
    const transaction = database.transaction(STORE.notes, "readonly");
    const notes = await readNotes(transaction, noteIds.filter(Boolean));
    await transactionDone(transaction);
    return [...notes.values()];
  };

  /** A content with all its cards when every sibling the catalog knows is resident; otherwise null. */
  // The renderer prepares each template object once, so an unchanged template is returned as the same object.
  const loadedNoteTypeSources = new Map<string, NoteTypeSource & { updatedAt: string }>();
  /** The Anki template of an imported content, for its original layout (ADR-047); kept on every device. */
  const loadNoteTypeSource = async (id: string): Promise<NoteTypeSource | null> => {
    await flushWrites();
    const transaction = database.transaction(STORE.noteTypeSources, "readonly");
    const source = await requestResult<(NoteTypeSource & { updatedAt: string }) | undefined>(transaction.objectStore(STORE.noteTypeSources).get(id));
    await transactionDone(transaction);
    if (!source) return null;
    const known = loadedNoteTypeSources.get(id);
    if (known?.updatedAt === source.updatedAt) return known;
    loadedNoteTypeSources.set(id, source);
    return source;
  };

  /** Contents with all their cards in the given order; null where a sibling the catalog knows is not resident. */
  const loadNoteGraphs = async (noteIds: string[]): Promise<Array<NoteGraph | null>> => {
    await flushWrites();
    const transaction = database.transaction([STORE.notes, STORE.cards, STORE.variants, STORE.cardCatalog], "readonly");
    const [notes, cardKeys, catalogRows] = await Promise.all([
      Promise.all(noteIds.map((id) => requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(id)))),
      Promise.all(noteIds.map((id) => requestResult<IDBValidKey[]>(transaction.objectStore(STORE.cards).index("noteId").getAllKeys(id)))),
      Promise.all(noteIds.map((id) => requestResult<StoredCardCatalog[]>(transaction.objectStore(STORE.cardCatalog).index("noteId").getAll(id)))),
    ]);
    const cardIds = cardKeys.map((keys) => keys.map(String));
    const cards = new Map((await readCardBodies(transaction, cardIds.flat())).flatMap((card) => card && !card.deletedAt ? [[card.id, card] as const] : []));
    await transactionDone(transaction);
    return noteIds.map((_id, index) => {
      const note = notes[index];
      if (!note || catalogRows[index].some((row) => !row.deletedAt && !cardIds[index].includes(row.id))) return null;
      return { note, cards: cardIds[index].flatMap((id) => cards.get(id) ?? []) };
    });
  };

  const loadNoteGraph = async (noteId: string) => (await loadNoteGraphs([noteId]))[0];

  /** Writes card bodies and contents loaded from the cloud; local changes still waiting for sync win. */
  const applyHydratedBodies = async ({ cards, notes }: { cards: Card[]; notes: Note[] }, state: Exclude<BodyResidency, "catalog-only"> = "cached") => {
    await flushWrites();
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const transaction = database.transaction([STORE.notes, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.syncMetadata], "readwrite");
    for (const note of notes) {
      if (!pendingEntityMutation("notes", note.id)) transaction.objectStore(STORE.notes).put(note);
    }
    const catalogStore = transaction.objectStore(STORE.cardCatalog);
    for (const hydrated of cards) {
      if (pendingEntityMutation("cards", hydrated.id) || hydrated.deletedAt) continue;
      // Variants still waiting for sync (e.g. a freshly generated AI variant) win over the cloud body.
      const variantStore = transaction.objectStore(STORE.variants);
      const storedVariants = await requestResult<StoredVariant[]>(variantStore.index("cardId").getAll(hydrated.id));
      const pendingVariants = storedVariants
        .filter((variant) => pendingEntityMutation("card_variants", variant.id))
        .map(({ deckId: _deckId, activeForSummary: _active, ...variant }) => variant);
      const card: Card = {
        ...hydrated,
        variants: [...hydrated.variants.filter((variant) => !pendingEntityMutation("card_variants", variant.id)), ...pendingVariants],
      };
      const note = notesById.get(card.noteId) ?? await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId)) ?? null;
      const before = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(card.id)) ?? null;
      const catalog = catalogRecordFor(card, note, before);
      await applyReplicaCatalogChange(transaction, card.deckId, before?.deckId === card.deckId ? before : null, catalog);
      if (before && before.deckId !== card.deckId) await applyReplicaCatalogChange(transaction, before.deckId, before, null);
      transaction.objectStore(STORE.cards).put(cardRecord(card));
      catalogStore.put(catalog); markCatalogChanged(catalog.id);
      const residency = await requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(card.id));
      transaction.objectStore(STORE.bodyResidency).put({
        ...residencyRecord(catalog, residency?.state === "downloaded" ? "downloaded" : state),
        protectedUntil: residency?.protectedUntil ?? null,
      });
      for (const variant of storedVariants) variantStore.delete(variant.id);
      for (const variant of card.variants) variantStore.put(variantRecord(variant, card.deckId));
    }
    await transactionDone(transaction);
  };

  return {
    missingCardBodyIds,
    markCardBodiesResident,
    touchCardBodies,
    loadCardBody,
    loadCardBodies,
    loadNotes,
    loadNoteGraph,
    loadNoteGraphs,
    loadNoteTypeSource,
    applyHydratedBodies,
    async saveOfflineDeck(record: OfflineDeckRecord) {
      const transaction = database.transaction(STORE.offlineDecks, "readwrite");
      transaction.objectStore(STORE.offlineDecks).put({ ...record, id: record.deckId });
      await transactionDone(transaction);
    },
    async getOfflineDeck(deckId: string) {
      const transaction = database.transaction(STORE.offlineDecks, "readonly");
      const value = await requestResult<OfflineDeckRecord | undefined>(transaction.objectStore(STORE.offlineDecks).get(deckId));
      await transactionDone(transaction);
      return value ?? null;
    },
    async listOfflineDecks() {
      const transaction = database.transaction(STORE.offlineDecks, "readonly");
      const values = await requestResult<OfflineDeckRecord[]>(transaction.objectStore(STORE.offlineDecks).getAll());
      await transactionDone(transaction);
      return values;
    },
    async appendOfflineManifest(deckId: string, cards: OfflineCardManifestEntry[], media: OfflineMediaManifestEntry[], { reset = false }: { reset?: boolean } = {}) {
      const transaction = database.transaction(STORE.offlineManifests, "readwrite");
      const store = transaction.objectStore(STORE.offlineManifests);
      if (reset) for (const key of await requestResult<IDBValidKey[]>(store.index("deckId").getAllKeys(deckId))) store.delete(key);
      for (const card of cards) store.put({ id: `${deckId}\u0000card\u0000${card.id}`, deckId, kind: "card", value: card });
      for (const entry of media) store.put({ id: `${deckId}\u0000media\u0000${entry.sha1}`, deckId, kind: "media", value: entry });
      await transactionDone(transaction);
    },
    async readOfflineManifest(deckId: string) {
      const transaction = database.transaction(STORE.offlineManifests, "readonly");
      const rows = await requestResult<Array<{ kind: "card" | "media"; value: OfflineCardManifestEntry | OfflineMediaManifestEntry }>>(
        transaction.objectStore(STORE.offlineManifests).index("deckId").getAll(deckId),
      );
      await transactionDone(transaction);
      return {
        cards: rows.filter((row) => row.kind === "card").map((row) => row.value as OfflineCardManifestEntry),
        media: rows.filter((row) => row.kind === "media").map((row) => row.value as OfflineMediaManifestEntry),
      };
    },
    async clearOfflineManifest(deckId: string) {
      const transaction = database.transaction(STORE.offlineManifests, "readwrite");
      const store = transaction.objectStore(STORE.offlineManifests);
      for (const key of await requestResult<IDBValidKey[]>(store.index("deckId").getAllKeys(deckId))) store.delete(key);
      await transactionDone(transaction);
    },
    async removeOfflineDeck(deckId: string) {
      const transaction = database.transaction([STORE.offlineDecks, STORE.bodyResidency, STORE.offlineManifests], "readwrite");
      transaction.objectStore(STORE.offlineDecks).delete(deckId);
      const manifestStore = transaction.objectStore(STORE.offlineManifests);
      for (const key of await requestResult<IDBValidKey[]>(manifestStore.index("deckId").getAllKeys(deckId))) manifestStore.delete(key);
      const index = transaction.objectStore(STORE.bodyResidency).index("deckAccess");
      await iterateCursor<CardBodyResidencyRecord>(index.openCursor(IDBKeyRange.bound([deckId, "", ""], [deckId, "￿", "￿"])), (record) => {
        if (record.state === "downloaded") transaction.objectStore(STORE.bodyResidency).put({ ...record, state: "cached" });
      });
      await transactionDone(transaction);
    },
    /** Frees unpinned card bodies; a content goes once no resident card of it remains. */
    async evictCachedCardBodies(bytesToFree: number, protectedCardIds: string[] = []) {
      await flushWrites();
      const protectedIds = new Set([...protectedCardIds, ...pendingEntityIdsForTable("cards")]);
      const read = database.transaction(STORE.bodyResidency, "readonly");
      const candidates = await requestResult<CardBodyResidencyRecord[]>(
        read.objectStore(STORE.bodyResidency).index("stateAccess").getAll(IDBKeyRange.bound(["cached", "", ""], ["cached", "￿", "￿"])),
      );
      await transactionDone(read);
      let freedBytes = 0;
      let evictedCount = 0;
      for (const candidate of candidates) {
        if (freedBytes >= Math.max(0, bytesToFree)) break;
        if (protectedIds.has(candidate.id) || (candidate.protectedUntil && Date.parse(candidate.protectedUntil) > Date.now())) continue;
        const transaction = database.transaction([STORE.cards, STORE.variants, STORE.notes, STORE.bodyResidency], "readwrite");
        const card = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(candidate.id));
        const variants = await requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("cardId").getAll(candidate.id));
        if (card) {
          freedBytes += serializedBytes(card) + serializedBytes(variants);
          transaction.objectStore(STORE.cards).delete(candidate.id);
          for (const variant of variants) transaction.objectStore(STORE.variants).delete(variant.id);
          transaction.objectStore(STORE.bodyResidency).put({ ...candidate, state: "catalog-only" });
          const siblings = await requestResult<IDBValidKey[]>(transaction.objectStore(STORE.cards).index("noteId").getAllKeys(card.noteId));
          if (!siblings.some((id) => id !== candidate.id) && !pendingEntityMutation("notes", card.noteId)) {
            const note = await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId));
            if (note) freedBytes += serializedBytes(note);
            transaction.objectStore(STORE.notes).delete(card.noteId);
          }
          evictedCount += 1;
        }
        await transactionDone(transaction);
        if (evictedCount % 25 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      return { freedBytes, evictedCount };
    },
    async getDeckBodyResidencySummary(deckId: string) {
      const transaction = database.transaction([STORE.cardCatalog, STORE.bodyResidency], "readonly");
      const total = await requestResult(transaction.objectStore(STORE.cardCatalog).index("deckScan").count(IDBKeyRange.bound([deckId, ""], [deckId, "￿"])));
      const residency = await requestResult<CardBodyResidencyRecord[]>(transaction.objectStore(STORE.bodyResidency).index("deckAccess").getAll(
        IDBKeyRange.bound([deckId, "", ""], [deckId, "￿", "￿"]),
      ));
      await transactionDone(transaction);
      return {
        total,
        cached: residency.filter((record) => record.state === "cached").length,
        downloaded: residency.filter((record) => record.state === "downloaded").length,
      };
    },
  };
}
