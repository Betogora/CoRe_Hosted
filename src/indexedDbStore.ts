// Private to indexedDbCoreRepository.ts: schema, stores and stored record forms of the web replica.
import type { Card, CardVariant, Deck, Note } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import {
  catalogEntryFromCard,
  type BodyResidency,
  type CardBodyResidencyRecord,
  type CardCatalogEntry,
  type DeckStudySummary,
  type ReplicaStatus,
} from "./workspaceReplica.ts";

// ADR-034: a fresh database without upgrade path.
export const DATABASE_VERSION = 1;

export const DATABASE_PREFIX = "core.workspace.entities.v4.";

export const STORE = Object.freeze({
  meta: "meta",
  decks: "decks",
  notes: "notes",
  cards: "cards",
  variants: "variants",
  reviewEvents: "reviewEvents",
  noteTypeSources: "noteTypeSources",
  noteSources: "noteSources",
  outbox: "outbox",
  syncMetadata: "syncMetadata",
  deckStudySummaries: "deckStudySummaries",
  cardCatalog: "cardCatalog",
  bodyResidency: "bodyResidency",
  offlineDecks: "offlineDecks",
  offlineManifests: "offlineManifests",
  statisticsSnapshots: "statisticsSnapshots",
});

export const LOCAL_WRITE_CHUNK_SIZE = 250;

export const CATALOG_PAGE_LIMIT = 50;

export const NO_DUE_DATE = "9999-12-31T23:59:59.999Z";

export type StoredCard = Omit<Card, "variants">;

export type StoredVariant = CardVariant & { deckId: string; activeForSummary: 0 | 1 };

export interface StoredCardCatalog extends Omit<CardCatalogEntry, "reviewable" | "hasActiveVariants"> {
  reviewable: 0 | 1;
  hasActiveVariants: 0 | 1;
  dueSort: string;
}

export interface StoredReviewDayCounts {
  contextKey: string;
  timeZone?: string;
  dayStartHour: number;
  counts: Record<string, number>;
}

export type WorkspaceDeckSummary = Omit<Deck, "cards" | "reviewEvents">;

export interface WorkspaceShell {
  version?: number;
  profile: WorkspaceState["profile"];
  decks: WorkspaceDeckSummary[];
  updatedAt: string;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB-Anfrage ist fehlgeschlagen."));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB-Transaktion ist fehlgeschlagen."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB-Transaktion wurde abgebrochen."));
  });
}

export function iterateCursor<T>(request: IDBRequest<IDBCursorWithValue | null>, visit: (value: T) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB-Cursor ist fehlgeschlagen."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      visit(cursor.value as T);
      cursor.continue();
    };
  });
}

export function openDatabase(indexedDb: IDBFactory, userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(`${DATABASE_PREFIX}${userId}`, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(STORE.meta, { keyPath: "key" });
      database.createObjectStore(STORE.decks, { keyPath: "id" }).createIndex("parentDeckId", "parentDeckId", { unique: false });
      database.createObjectStore(STORE.notes, { keyPath: "id" }).createIndex("ankiGuid", "ankiGuid", { unique: false });
      const cards = database.createObjectStore(STORE.cards, { keyPath: "id" });
      cards.createIndex("deckScan", ["deckId", "id"], { unique: true });
      cards.createIndex("noteId", "noteId", { unique: false });
      const variants = database.createObjectStore(STORE.variants, { keyPath: "id" });
      variants.createIndex("cardId", "cardId", { unique: false });
      variants.createIndex("deckId", "deckId", { unique: false });
      const events = database.createObjectStore(STORE.reviewEvents, { keyPath: "id" });
      events.createIndex("deckId", "deckId", { unique: false });
      events.createIndex("cardAnswered", ["cardId", "answeredAt", "id"], { unique: false });
      events.createIndex("deckAnswered", ["deckId", "answeredAt", "id"], { unique: false });
      database.createObjectStore(STORE.noteTypeSources, { keyPath: "id" }).createIndex("ankiNotetypeId", "ankiNotetypeId", { unique: false });
      database.createObjectStore(STORE.noteSources, { keyPath: "noteId" });
      database.createObjectStore(STORE.outbox, { keyPath: "id" }).createIndex("createdAt", ["createdAt", "id"], { unique: false });
      database.createObjectStore(STORE.syncMetadata, { keyPath: "key" });
      const catalog = database.createObjectStore(STORE.cardCatalog, { keyPath: "id" });
      catalog.createIndex("deckScan", ["deckId", "id"], { unique: true });
      catalog.createIndex("noteId", "noteId", { unique: false });
      catalog.createIndex("deckSort", ["deckId", "sortText", "id"], { unique: true });
      catalog.createIndex("deckDue", ["deckId", "dueSort", "id"], { unique: true });
      catalog.createIndex("deckReviewDue", ["deckId", "reviewable", "scheduleState", "dueSort", "id"], { unique: true });
      catalog.createIndex("deckVariants", ["deckId", "hasActiveVariants", "id"], { unique: true });
      const residency = database.createObjectStore(STORE.bodyResidency, { keyPath: "id" });
      residency.createIndex("deckAccess", ["deckId", "lastAccessedAt", "id"], { unique: true });
      residency.createIndex("stateAccess", ["state", "lastAccessedAt", "id"], { unique: true });
      database.createObjectStore(STORE.offlineDecks, { keyPath: "id" });
      database.createObjectStore(STORE.offlineManifests, { keyPath: "id" }).createIndex("deckId", "deckId", { unique: false });
      database.createObjectStore(STORE.statisticsSnapshots, { keyPath: "id" });
      database.createObjectStore(STORE.deckStudySummaries, { keyPath: "deckId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Lokale Account-Datenbank konnte nicht geöffnet werden."));
  });
}

export function cardRecord(card: Card): StoredCard {
  const { variants: _variants, ...record } = card;
  return record;
}

export function variantRecord(variant: CardVariant, deckId: string): StoredVariant {
  return { ...variant, deckId, activeForSummary: variant.isActive !== false && variant.qualityStatus === "active" && !variant.deletedAt ? 1 : 0 };
}

export function hydrateCard(record: StoredCard, variants: StoredVariant[] = []): Card {
  return { ...record, variants: variants.map(({ deckId: _deckId, activeForSummary: _active, ...variant }) => variant) };
}

export function storedCatalogRecord(entry: CardCatalogEntry): StoredCardCatalog {
  return {
    ...entry,
    normalizedSearchText: entry.normalizedSearchText.slice(0, 4_000),
    sortText: entry.sortText.slice(0, 128),
    dueSort: entry.dueAt ?? NO_DUE_DATE,
    reviewable: entry.reviewable ? 1 : 0,
    hasActiveVariants: entry.hasActiveVariants ? 1 : 0,
  };
}

export function catalogEntry(record: StoredCardCatalog): CardCatalogEntry {
  const { dueSort: _dueSort, ...entry } = record;
  return { ...entry, reviewable: record.reviewable === 1, hasActiveVariants: record.hasActiveVariants === 1 };
}

export function catalogRecordFor(card: Card, note: Note | null): StoredCardCatalog {
  return storedCatalogRecord(catalogEntryFromCard(card, note));
}

export function residencyRecord(
  catalog: Pick<StoredCardCatalog, "id" | "deckId" | "bodyRevision" | "studyRevision" | "dependencyRevision">,
  state: BodyResidency,
  now = new Date().toISOString(),
): CardBodyResidencyRecord {
  return {
    id: catalog.id,
    deckId: catalog.deckId,
    state,
    bodyRevision: catalog.bodyRevision,
    studyRevision: catalog.studyRevision,
    dependencyRevision: catalog.dependencyRevision,
    lastAccessedAt: now,
    protectedUntil: null,
  };
}

export function deckRecord(deck: Deck | WorkspaceDeckSummary): WorkspaceDeckSummary {
  const { cards: _cards, reviewEvents: _reviewEvents, ...record } = deck as Deck;
  return record;
}

export function serializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "undefined" ? serialized.length : new TextEncoder().encode(serialized).byteLength;
}

export function reviewHourKey(value: unknown) {
  const timestamp = new Date(String(value ?? ""));
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString().slice(0, 13);
}

export function mutationId() {
  return `mutation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadShell(database: IDBDatabase): Promise<WorkspaceShell | null> {
  const transaction = database.transaction([STORE.meta, STORE.decks], "readonly");
  const [metaRows, deckRows] = await Promise.all([
    requestResult<any[]>(transaction.objectStore(STORE.meta).getAll()),
    requestResult<WorkspaceDeckSummary[]>(transaction.objectStore(STORE.decks).getAll()),
  ]);
  await transactionDone(transaction);
  if (!metaRows.some((row) => row.key === "initialized")) return null;
  const meta = new Map(metaRows.map((row) => [row.key, row.value]));
  return { version: 6, profile: meta.get("profile"), updatedAt: meta.get("updatedAt"), decks: deckRows };
}

export function writeState(database: IDBDatabase, state: WorkspaceState): Promise<void> {
  const storeNames = Object.values(STORE).filter((name) => name !== STORE.outbox);
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames) transaction.objectStore(storeName).clear();
  const meta = transaction.objectStore(STORE.meta);
  meta.put({ key: "initialized", value: true });
  meta.put({ key: "profile", value: state.profile });
  meta.put({ key: "updatedAt", value: state.updatedAt });
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  for (const note of state.notes) transaction.objectStore(STORE.notes).put(note);
  const summaries = new Map<string, DeckStudySummary>();
  const reviewHourCounts: Record<string, number> = {};
  for (const deck of state.decks) {
    transaction.objectStore(STORE.decks).put(deckRecord(deck));
    const summary = summaries.get(deck.id) ?? emptyDeckStudySummary(deck.id);
    for (const card of deck.cards) {
      const catalog = catalogRecordFor(card, notesById.get(card.noteId) ?? null);
      const counts = catalogSummaryContribution(catalog);
      summary.totalCount += counts.totalCount;
      summary.newCount += counts.newCount;
      summary.learningCount += counts.learningCount;
      summary.matureCount += counts.matureCount;
      summary.suspendedCount += counts.suspendedCount;
      summary.activeVariantCount += counts.activeVariantCount;
      transaction.objectStore(STORE.cards).put(cardRecord(card));
      transaction.objectStore(STORE.cardCatalog).put(catalog);
      transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
      for (const variant of card.variants) transaction.objectStore(STORE.variants).put(variantRecord(variant, card.deckId));
    }
    summaries.set(deck.id, { ...summary, updatedAt: deck.updatedAt });
    for (const event of deck.reviewEvents) {
      transaction.objectStore(STORE.reviewEvents).put(event);
      const key = event.rating === "manual" ? null : reviewHourKey(event.answeredAt);
      if (key) reviewHourCounts[key] = (reviewHourCounts[key] ?? 0) + 1;
    }
  }
  for (const summary of summaries.values()) transaction.objectStore(STORE.deckStudySummaries).put(summary);
  transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: reviewHourCounts });
  transaction.objectStore(STORE.syncMetadata).put({
    key: "replicaStatus",
    value: {
      accountBaselineState: state.decks.length > 0 ? "nonempty" : "uninitialized",
      catalogCompleteness: state.decks.some((deck) => deck.cards.length > 0) ? "complete" : "empty",
      catalogCursor: 0,
      catalogServerCursor: 0,
    } satisfies ReplicaStatus,
  });
  return transactionDone(transaction);
}

export function emptyDeckStudySummary(deckId: string): DeckStudySummary {
  return { deckId, totalCount: 0, newCount: 0, learningCount: 0, matureCount: 0, suspendedCount: 0, activeVariantCount: 0, updatedAt: null };
}

export function catalogSummaryContribution(card: StoredCardCatalog | null) {
  const active = Boolean(card && !card.deletedAt);
  return {
    totalCount: active ? 1 : 0,
    newCount: active && card!.reviewable === 1 && card!.scheduleState === "new" ? 1 : 0,
    learningCount: active && card!.reviewable === 1 && ["learning", "relearning"].includes(card!.scheduleState) ? 1 : 0,
    matureCount: active && card!.reviewable === 1 && ["mature", "variant_ready", "mastered"].includes(card!.maturityBand) ? 1 : 0,
    suspendedCount: active && card!.reviewable !== 1 ? 1 : 0,
    activeVariantCount: active ? card!.activeVariantCount : 0,
  };
}
