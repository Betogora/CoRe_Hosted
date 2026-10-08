import { createDefaultDeckSettings, normalizeCoreDeck, rescheduleCard } from "./coreModel.ts";
import { normalizeWorkspaceState } from "./coreRepository.ts";
import type { Card, CardVariant, Deck, DeckSettings, ImportVerificationRepairScope, ImportVerificationScope, Note, Profile, ReviewEvent } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { CardTableSort, DeckLibrarySummary } from "./libraryModel.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import type { CloudCatalogPage, CloudEntityPage } from "./cloudRepository.ts";
import type { ReviewAnswerResult } from "./reviewService.ts";
import type { ImportCommitGraph, ImportMediaFile, NoteTypeSource } from "./apkgImport.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";
import { getLearningDayKey, getLearningDayRange } from "./learningDay.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";
import type { StatisticsSelection } from "./statisticsModel.ts";
import { requireCompleteProfile } from "./profileIntegrity.ts";
import { markStartupPhaseReady, markStartupPhaseStarted } from "./appPerformance.ts";
import {
  bodyResidencyForRevision,
  catalogEntryFromCard,
  type AccountBaselineState,
  type AccountStatisticsSnapshot,
  type AccountStudyOverview,
  type BodyResidency,
  type CardBodyResidencyRecord,
  type CardCatalogEntry,
  type DeckStudySummary,
  type NoteGraph,
  type OfflineCardManifestEntry,
  type OfflineDeckRecord,
  type OfflineMediaManifestEntry,
  type ReplicaStatus,
} from "./workspaceReplica.ts";

// ADR-034: a fresh database without upgrade path; the previous replica is deleted instead of read.
const DATABASE_VERSION = 1;
const DATABASE_PREFIX = "core.workspace.entities.v4.";
const RETIRED_DATABASE_PREFIX = "core.workspace.entities.v3.";
const STORE = Object.freeze({
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

const LOCAL_WRITE_CHUNK_SIZE = 250;
const CATALOG_PAGE_LIMIT = 50;
const NO_DUE_DATE = "9999-12-31T23:59:59.999Z";

type StoredCard = Omit<Card, "variants">;
type StoredVariant = CardVariant & { deckId: string; activeForSummary: 0 | 1 };

interface StoredCardCatalog extends Omit<CardCatalogEntry, "reviewable" | "hasActiveVariants"> {
  reviewable: 0 | 1;
  hasActiveVariants: 0 | 1;
  dueSort: string;
}

interface StoredReviewDayCounts {
  contextKey: string;
  timeZone?: string;
  dayStartHour: number;
  counts: Record<string, number>;
}

interface IndexedDbRepositoryOptions {
  userId: string;
  initialState: WorkspaceState;
  indexedDb?: IDBFactory | null;
}

export type WorkspaceDeckSummary = Omit<Deck, "cards" | "reviewEvents">;

export interface WorkspaceShell {
  version?: number;
  profile: WorkspaceState["profile"];
  decks: WorkspaceDeckSummary[];
  updatedAt: string;
}

export interface CatalogCursor {
  sortValue: string;
  id: string;
}

export interface NoteGraphChange {
  previous: NoteGraph | null;
  next: NoteGraph;
}

/** Existing imported contents found per Anki GUID before a commit (K5.7). */
export interface ReimportTargets {
  notes: Note[];
  cards: Array<{ id: string; noteId: string; deckId: string; promptKey: string; ankiCardId: string | null }>;
  noteTypeSources: Array<{ id: string; ankiNotetypeId: string }>;
}

export interface ImportCommitResult {
  decks: WorkspaceDeckSummary[];
  scope: ImportVerificationScope;
  /** Reimported contents whose local edits were kept. */
  keptLocalEdits: number;
  /** Cards present in CoRe but no longer in the package; they are only reported. */
  missingInPackage: number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB-Anfrage ist fehlgeschlagen."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB-Transaktion ist fehlgeschlagen."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB-Transaktion wurde abgebrochen."));
  });
}

function iterateCursor<T>(request: IDBRequest<IDBCursorWithValue | null>, visit: (value: T) => void): Promise<void> {
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

function openDatabase(indexedDb: IDBFactory, userId: string): Promise<IDBDatabase> {
  try {
    indexedDb.deleteDatabase(`${RETIRED_DATABASE_PREFIX}${userId}`);
  } catch {
    // A missing or blocked old replica does not affect the new one.
  }
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

function cardRecord(card: Card): StoredCard {
  const { variants: _variants, ...record } = card;
  return record;
}

function variantRecord(variant: CardVariant, deckId: string): StoredVariant {
  return { ...variant, deckId, activeForSummary: variant.isActive !== false && variant.qualityStatus === "active" && !variant.deletedAt ? 1 : 0 };
}

function hydrateCard(record: StoredCard, variants: StoredVariant[] = []): Card {
  return { ...record, variants: variants.map(({ deckId: _deckId, activeForSummary: _active, ...variant }) => variant) };
}

function storedCatalogRecord(entry: CardCatalogEntry): StoredCardCatalog {
  return {
    ...entry,
    normalizedSearchText: entry.normalizedSearchText.slice(0, 4_000),
    sortText: entry.sortText.slice(0, 128),
    dueSort: entry.dueAt ?? NO_DUE_DATE,
    reviewable: entry.reviewable ? 1 : 0,
    hasActiveVariants: entry.hasActiveVariants ? 1 : 0,
  };
}

function catalogEntry(record: StoredCardCatalog): CardCatalogEntry {
  const { dueSort: _dueSort, ...entry } = record;
  return { ...entry, reviewable: record.reviewable === 1, hasActiveVariants: record.hasActiveVariants === 1 };
}

function catalogRecordFor(card: Card, note: Note | null): StoredCardCatalog {
  return storedCatalogRecord(catalogEntryFromCard(card, note));
}

function emptyDeckStudySummary(deckId: string): DeckStudySummary {
  return { deckId, totalCount: 0, newCount: 0, learningCount: 0, matureCount: 0, suspendedCount: 0, activeVariantCount: 0, updatedAt: null };
}

function catalogSummaryContribution(card: StoredCardCatalog | null) {
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

function studyOverviewContext(overview: AccountStudyOverview) {
  const separator = overview.contextKey.lastIndexOf(":");
  const dayStartHour = Number(overview.contextKey.slice(separator + 1));
  if (separator < 1 || !Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) return null;
  return { timeZone: overview.contextKey.slice(0, separator), dayStartHour };
}

function overviewScheduleBucket(card: StoredCardCatalog | null, overview: AccountStudyOverview, referenceAt: string) {
  if (!card || card.deletedAt || card.reviewable !== 1 || !card.dueAt) return null;
  const context = studyOverviewContext(overview);
  if (!context || getStudyHeatmapDayKey(referenceAt, context.timeZone, context.dayStartHour) !== overview.dayKey) return null;
  const range = getLearningDayRange(referenceAt, context);
  if (!range) return null;
  const dueAt = Date.parse(card.dueAt);
  if (!Number.isFinite(dueAt)) return null;
  if (dueAt < range.end) {
    if (card.scheduleState === "new") return { kind: "available-new" as const, key: card.deckId };
    if (["learning", "relearning"].includes(card.scheduleState)) return { kind: "available-learning" as const, key: card.deckId };
    return { kind: "due" as const, key: card.deckId };
  }
  if (dueAt >= range.end + 365 * 24 * 60 * 60 * 1000) return null;
  const dayKey = getStudyHeatmapDayKey(card.dueAt, context.timeZone, context.dayStartHour);
  return dayKey ? { kind: "forecast" as const, key: dayKey } : null;
}

async function applyCatalogSummaryChange(transaction: IDBTransaction, deckId: string, before: StoredCardCatalog | null, after: StoredCardCatalog | null) {
  const store = transaction.objectStore(STORE.deckStudySummaries);
  const current = await requestResult<DeckStudySummary | undefined>(store.get(deckId)) ?? emptyDeckStudySummary(deckId);
  const oldCounts = catalogSummaryContribution(before);
  const newCounts = catalogSummaryContribution(after);
  store.put({
    ...current,
    totalCount: Math.max(0, current.totalCount - oldCounts.totalCount + newCounts.totalCount),
    newCount: Math.max(0, current.newCount - oldCounts.newCount + newCounts.newCount),
    learningCount: Math.max(0, current.learningCount - oldCounts.learningCount + newCounts.learningCount),
    matureCount: Math.max(0, current.matureCount - oldCounts.matureCount + newCounts.matureCount),
    suspendedCount: Math.max(0, current.suspendedCount - oldCounts.suspendedCount + newCounts.suspendedCount),
    activeVariantCount: Math.max(0, current.activeVariantCount - oldCounts.activeVariantCount + newCounts.activeVariantCount),
    updatedAt: after?.updatedAt ?? before?.updatedAt ?? current.updatedAt,
  });
}

function residencyRecord(
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

function deckRecord(deck: Deck | WorkspaceDeckSummary): WorkspaceDeckSummary {
  const { cards: _cards, reviewEvents: _reviewEvents, ...record } = deck as Deck;
  return record;
}

function serializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "undefined" ? serialized.length : new TextEncoder().encode(serialized).byteLength;
}

function reviewHourKey(value: unknown) {
  const timestamp = new Date(String(value ?? ""));
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString().slice(0, 13);
}

function mutationId() {
  return `mutation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadShell(database: IDBDatabase): Promise<WorkspaceShell | null> {
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

function writeState(database: IDBDatabase, state: WorkspaceState): Promise<void> {
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

export async function createIndexedDbCoreRepository({ userId, initialState, indexedDb = globalThis.indexedDB }: IndexedDbRepositoryOptions) {
  if (!userId) throw new Error("IndexedDB-Repository braucht eine Account-ID.");
  if (!indexedDb) throw new Error("IndexedDB ist in diesem Browser nicht verfügbar.");
  markStartupPhaseStarted("indexedDbOpen");
  const database = await openDatabase(indexedDb, userId);
  markStartupPhaseReady("indexedDbOpen");
  markStartupPhaseStarted("indexedDbShell");
  let shell = await loadShell(database);
  markStartupPhaseReady("indexedDbShell", { deckCount: shell?.decks.length ?? 0 });
  let writeChain: Promise<void> = Promise.resolve();
  const enqueueWrite = <T,>(write: () => Promise<T>): Promise<T> => {
    const result = writeChain.catch(() => undefined).then(write);
    writeChain = result.then(() => undefined, () => undefined);
    return result;
  };

  if (!shell) {
    const initializedState = normalizeWorkspaceState(initialState);
    await writeState(database, initializedState);
    shell = await loadShell(database);
  }

  markStartupPhaseStarted("indexedDbStartupMetadata");
  const startupTransaction = database.transaction([STORE.outbox, STORE.syncMetadata], "readonly");
  const startupSyncMetadata = startupTransaction.objectStore(STORE.syncMetadata);
  const [outboxRows, reviewHourCountRow, reviewDayCountRow, syncConflictCardIdRow, replicaStatusRow, studyOverviewRow] = await Promise.all([
    requestResult<SyncOutboxMutation[]>(startupTransaction.objectStore(STORE.outbox).getAll()),
    requestResult<{ value?: Record<string, number> } | undefined>(startupSyncMetadata.get("reviewHourCounts")),
    requestResult<{ value?: StoredReviewDayCounts } | undefined>(startupSyncMetadata.get("reviewDayCounts")),
    requestResult<{ value?: string[] } | undefined>(startupSyncMetadata.get("syncConflictCardIds")),
    requestResult<{ value?: ReplicaStatus } | undefined>(startupSyncMetadata.get("replicaStatus")),
    requestResult<{ value?: AccountStudyOverview } | undefined>(startupSyncMetadata.get("accountStudyOverview")),
  ]);
  await transactionDone(startupTransaction);
  markStartupPhaseReady("indexedDbStartupMetadata", { outboxCount: outboxRows.filter((mutation) => !mutation.flushedAt).length });

  const pendingOutbox = new Map<string, SyncOutboxMutation>(outboxRows.map((mutation) => [mutation.id, mutation]));
  const mutationTargetKey = (mutation: Pick<SyncOutboxMutation, "type" | "table" | "entityId">) => (
    mutation.type === "profile-patch" ? "profile" : `${mutation.type}:${mutation.table}:${mutation.entityId}`
  );
  const pendingByTarget = new Map<string, SyncOutboxMutation>();
  for (const mutation of pendingOutbox.values()) if (!mutation.flushedAt) pendingByTarget.set(mutationTargetKey(mutation), mutation);
  const rememberPending = (mutation: SyncOutboxMutation) => {
    pendingOutbox.set(mutation.id, mutation);
    if (!mutation.flushedAt) pendingByTarget.set(mutationTargetKey(mutation), mutation);
  };
  const forgetPending = (id: string) => {
    const mutation = pendingOutbox.get(id);
    if (!mutation) return;
    pendingOutbox.delete(id);
    const key = mutationTargetKey(mutation);
    if (pendingByTarget.get(key)?.id === id) pendingByTarget.delete(key);
  };
  const reviewTargetId = (mutation: SyncOutboxMutation, table: string) => {
    const payload = mutation.payload as any;
    return table === "cards" ? payload?.card?.id
      : table === "card_variants" ? payload?.variant?.id
        : table === "review_events" ? payload?.event?.id
          : null;
  };
  const pendingEntityMutation = (table: string, entityId: string) => pendingByTarget.get(mutationTargetKey({ type: "entity-mutation", table, entityId }))
    ?? [...pendingByTarget.values()].find((mutation) => mutation.type === "review-atomic" && reviewTargetId(mutation, table) === entityId);
  const pendingEntityIdsForTable = (table: string) => [...pendingByTarget.values()].flatMap((mutation) => {
    if (mutation.type === "entity-mutation" && mutation.table === table && mutation.entityId) return [mutation.entityId];
    if (mutation.type !== "review-atomic") return [];
    const id = reviewTargetId(mutation, table);
    return id ? [id] : [];
  });
  let reviewHourCounts: Record<string, number> | null = reviewHourCountRow?.value ?? null;
  let reviewDayCountsCache: StoredReviewDayCounts | null = reviewDayCountRow?.value ?? null;
  let syncConflictCardIds = new Set<string>(syncConflictCardIdRow?.value ?? []);
  let replicaStatus: ReplicaStatus = replicaStatusRow?.value ?? {
    accountBaselineState: shell!.decks.length > 0 ? "nonempty" : "uninitialized",
    catalogCompleteness: "empty",
    catalogCursor: 0,
    catalogServerCursor: 0,
  };
  let studyOverview: AccountStudyOverview | null = studyOverviewRow?.value ?? null;
  let latestImportVerificationScope: ImportVerificationScope | null = null;
  let firstDeckSummariesStarted = false;
  const pageCursorsByKey = new Map<string, Map<number, CatalogCursor | null>>();

  const adjustOverviewCount = (counts: Record<string, number>, key: string, delta: number) => {
    const next = Math.max(0, (counts[key] ?? 0) + delta);
    if (next === 0) delete counts[key];
    else counts[key] = next;
  };

  const applyReplicaCatalogChange = async (
    transaction: IDBTransaction,
    deckId: string,
    before: StoredCardCatalog | null,
    after: StoredCardCatalog | null,
    referenceAt = new Date().toISOString(),
    updateOverview = true,
  ) => {
    await applyCatalogSummaryChange(transaction, deckId, before, after);
    if (!studyOverview || !updateOverview) return;
    const previousBucket = overviewScheduleBucket(before, studyOverview, referenceAt);
    const nextBucket = overviewScheduleBucket(after, studyOverview, referenceAt);
    if (previousBucket?.kind === nextBucket?.kind && previousBucket?.key === nextBucket?.key) return;
    const next = {
      dueByDeck: { ...studyOverview.dueByDeck },
      availableNewByDeck: { ...studyOverview.availableNewByDeck },
      availableLearningByDeck: { ...studyOverview.availableLearningByDeck },
      forecastByDay: { ...studyOverview.forecastByDay },
    };
    const countsFor = (kind: "available-new" | "available-learning" | "due" | "forecast") => (
      kind === "available-new" ? next.availableNewByDeck
        : kind === "available-learning" ? next.availableLearningByDeck
          : kind === "due" ? next.dueByDeck
            : next.forecastByDay
    );
    if (previousBucket) adjustOverviewCount(countsFor(previousBucket.kind), previousBucket.key, -1);
    if (nextBucket) adjustOverviewCount(countsFor(nextBucket.kind), nextBucket.key, 1);
    studyOverview = { ...studyOverview, ...next, generatedAt: referenceAt };
    transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: studyOverview });
  };

  const queueMutations = (inputs: any[]) => {
    const queued: SyncOutboxMutation[] = [];
    const removedIds: string[] = [];
    for (const input of inputs) {
      const targetKey = mutationTargetKey(input);
      const replaced = pendingByTarget.get(targetKey);
      if (replaced) {
        forgetPending(replaced.id);
        removedIds.push(replaced.id);
      }
      // Replacing a pending insert keeps it an insert; the cloud then matches it to the device's own row.
      const keepsPendingInsert = replaced?.type === "entity-mutation" && replaced.baseRevision == null && !(replaced.payload as any)?.tombstone && !input.payload?.tombstone;
      const mutation: SyncOutboxMutation = {
        id: mutationId(),
        userId,
        deviceId: null,
        type: input.type,
        table: input.table ?? null,
        entityId: input.entityId ?? null,
        baseRevision: keepsPendingInsert ? null : input.baseRevision ?? null,
        payload: keepsPendingInsert ? { ...input.payload, baseRevision: null } : input.payload ?? {},
        createdAt: new Date().toISOString(),
        flushedAt: null,
        retryCount: 0,
        lastError: null,
      };
      rememberPending(mutation);
      queued.push(mutation);
    }
    return { queued, removedIds };
  };

  const writeOutbox = (transaction: IDBTransaction, batch: { queued: SyncOutboxMutation[]; removedIds: string[] }) => {
    const store = transaction.objectStore(STORE.outbox);
    for (const id of batch.removedIds) store.delete(id);
    for (const mutation of batch.queued) store.put(mutation);
  };

  const replaceShellDecks = (decks: WorkspaceDeckSummary[], updatedAt = new Date().toISOString()) => {
    const replacements = new Map(decks.map((deck) => [deck.id, deck]));
    shell = { ...shell!, decks: [...decks, ...shell!.decks.filter((deck) => !replacements.has(deck.id))], updatedAt };
  };

  const readNotes = async (transaction: IDBTransaction, noteIds: string[]) => {
    const store = transaction.objectStore(STORE.notes);
    const notes = await Promise.all([...new Set(noteIds)].map((id) => requestResult<Note | undefined>(store.get(id))));
    return new Map(notes.filter((note): note is Note => Boolean(note)).map((note) => [note.id, note]));
  };

  const readCardBodies = async (transaction: IDBTransaction, cardIds: string[]) => {
    const cardStore = transaction.objectStore(STORE.cards);
    const variantIndex = transaction.objectStore(STORE.variants).index("cardId");
    const records = await Promise.all(cardIds.map((id) => requestResult<StoredCard | undefined>(cardStore.get(id))));
    const variants = await Promise.all(cardIds.map((id) => requestResult<StoredVariant[]>(variantIndex.getAll(id))));
    return records.map((record, index) => record ? hydrateCard(record, variants[index]) : null);
  };

  /**
   * Central local write of contents with their cards: stores, catalog, deck summaries and outbox in one
   * transaction. Deleted contents and cards leave the replica; their soft-delete travels through the outbox.
   */
  const writeNoteGraphs = (changes: NoteGraphChange[]) => enqueueWrite(async () => {
    if (!changes.length) return;
    const updatedAt = new Date().toISOString();
    const mutationBatch = queueMutations(planEntityMutations(
      { notes: changes.flatMap((change) => change.previous ? [change.previous.note] : []), cards: changes.flatMap((change) => change.previous?.cards ?? []) },
      { notes: changes.map((change) => change.next.note), cards: changes.flatMap((change) => change.next.cards) },
    ));
    const transaction = database.transaction([
      STORE.notes, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries,
      STORE.outbox, STORE.meta, STORE.syncMetadata,
    ], "readwrite");
    const done = transactionDone(transaction);
    const catalogStore = transaction.objectStore(STORE.cardCatalog);
    for (const { next } of changes) {
      const note = next.note;
      if (note.deletedAt) transaction.objectStore(STORE.notes).delete(note.id);
      else transaction.objectStore(STORE.notes).put(note);
      for (const card of next.cards) {
        const before = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(card.id)) ?? null;
        const variantStore = transaction.objectStore(STORE.variants);
        const storedVariantKeys = await requestResult<IDBValidKey[]>(variantStore.index("cardId").getAllKeys(card.id));
        if (card.deletedAt || note.deletedAt) {
          if (before) await applyReplicaCatalogChange(transaction, before.deckId, before, null, updatedAt);
          transaction.objectStore(STORE.cards).delete(card.id);
          catalogStore.delete(card.id);
          transaction.objectStore(STORE.bodyResidency).delete(card.id);
          for (const key of storedVariantKeys) variantStore.delete(key);
          continue;
        }
        const catalog = catalogRecordFor(card, note);
        if (before && before.deckId !== card.deckId) {
          await applyReplicaCatalogChange(transaction, before.deckId, before, null, updatedAt);
          await applyReplicaCatalogChange(transaction, card.deckId, null, catalog, updatedAt);
        } else {
          await applyReplicaCatalogChange(transaction, card.deckId, before, catalog, updatedAt);
        }
        transaction.objectStore(STORE.cards).put(cardRecord(card));
        catalogStore.put(catalog);
        transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
        const nextVariantIds = new Set(card.variants.map((variant) => variant.id));
        for (const key of storedVariantKeys) if (!nextVariantIds.has(String(key))) variantStore.delete(key);
        for (const variant of card.variants) variantStore.put(variantRecord(variant, card.deckId));
      }
    }
    writeOutbox(transaction, mutationBatch);
    transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
    await done;
    shell = { ...shell!, updatedAt };
  });

  const persistReplicaStatus = async (patch: Partial<ReplicaStatus>) => {
    replicaStatus = { ...replicaStatus, ...patch };
    const transaction = database.transaction(STORE.syncMetadata, "readwrite");
    transaction.objectStore(STORE.syncMetadata).put({ key: "replicaStatus", value: replicaStatus });
    await transactionDone(transaction);
    return replicaStatus;
  };

  const applyCloudCatalogPage = async (page: CloudCatalogPage) => {
    await writeChain;
    if (page.table === "decks") {
      const entities = (page.entities as Deck[]).filter((entity) => !pendingEntityMutation("decks", entity.id));
      const transaction = database.transaction(STORE.decks, "readwrite");
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
      await transactionDone(transaction);
      shell = await loadShell(database);
    } else if (page.table === "deck_study_summaries") {
      const transaction = database.transaction(STORE.deckStudySummaries, "readwrite");
      const store = transaction.objectStore(STORE.deckStudySummaries);
      if (page.reset) store.clear();
      for (const entity of page.entities as DeckStudySummary[]) store.put(entity);
      await transactionDone(transaction);
    } else {
      const transaction = database.transaction([STORE.cardCatalog, STORE.cards, STORE.variants, STORE.notes, STORE.bodyResidency, STORE.deckStudySummaries, STORE.offlineDecks, STORE.syncMetadata], "readwrite");
      const catalogStore = transaction.objectStore(STORE.cardCatalog);
      const cardStore = transaction.objectStore(STORE.cards);
      const variantStore = transaction.objectStore(STORE.variants);
      const residencyStore = transaction.objectStore(STORE.bodyResidency);
      const offlineStore = transaction.objectStore(STORE.offlineDecks);
      if (page.reset) {
        const protectedRows = (await Promise.all(pendingEntityIdsForTable("cards").map((id) => requestResult<StoredCardCatalog | undefined>(catalogStore.get(id))))).filter(Boolean);
        catalogStore.clear();
        for (const row of protectedRows) catalogStore.put(row);
      }
      const changedDeckIds = new Set<string>();
      for (const entity of page.entities as CardCatalogEntry[]) {
        if (pendingEntityMutation("cards", entity.id) || pendingEntityMutation("notes", entity.noteId)) continue;
        const previousCatalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(entity.id)) ?? null;
        if (!previousCatalog || previousCatalog.bodyRevision !== entity.bodyRevision || previousCatalog.studyRevision !== entity.studyRevision
          || previousCatalog.dependencyRevision !== entity.dependencyRevision || previousCatalog.deletedAt !== entity.deletedAt) {
          changedDeckIds.add(entity.deckId);
        }
        const referenceAt = new Date().toISOString();
        if (entity.deletedAt) {
          await applyReplicaCatalogChange(transaction, entity.deckId, previousCatalog, null, referenceAt, !page.reset);
          catalogStore.delete(entity.id);
          cardStore.delete(entity.id);
          residencyStore.delete(entity.id);
          for (const key of await requestResult<IDBValidKey[]>(variantStore.index("cardId").getAllKeys(entity.id))) variantStore.delete(key);
          continue;
        }
        // Cloud entries carry only the preview; a local content keeps the full search text.
        const localSearchText = previousCatalog && previousCatalog.noteId === entity.noteId && previousCatalog.dependencyRevision === entity.dependencyRevision
          ? previousCatalog.normalizedSearchText
          : entity.normalizedSearchText;
        const catalog = storedCatalogRecord({ ...entity, normalizedSearchText: localSearchText });
        if (previousCatalog && previousCatalog.deckId !== catalog.deckId) {
          await applyReplicaCatalogChange(transaction, previousCatalog.deckId, previousCatalog, null, referenceAt, !page.reset);
        }
        await applyReplicaCatalogChange(transaction, catalog.deckId, previousCatalog?.deckId === catalog.deckId ? previousCatalog : null, catalog, referenceAt, !page.reset);
        catalogStore.put(catalog);
        const residency = await requestResult<CardBodyResidencyRecord | undefined>(residencyStore.get(entity.id));
        if (residency && bodyResidencyForRevision(residency, entity) === "catalog-only") {
          residencyStore.put({ ...residency, state: "catalog-only", bodyRevision: entity.bodyRevision, studyRevision: entity.studyRevision, dependencyRevision: entity.dependencyRevision });
        }
      }
      for (const deckId of changedDeckIds) {
        const download = await requestResult<OfflineDeckRecord | undefined>(offlineStore.get(deckId));
        if (download?.state === "available") offlineStore.put({ ...download, state: "outdated", updatedAt: new Date().toISOString() });
      }
      await transactionDone(transaction);
    }
    await persistReplicaStatus({
      ...(page.advanceCursor === false ? {} : { catalogCursor: Math.max(replicaStatus.catalogCursor, page.cursor) }),
      catalogCompleteness: "partial",
    });
  };

  /** Keyset page of a deck's local catalog; with a query, rows are scanned from the cursor until the page is full. */
  const listCatalogPage = async (deckId: string, {
    cursor = null,
    limit = CATALOG_PAGE_LIMIT,
    query = "",
    sort = { field: "sortField", direction: "asc" } as CardTableSort,
    includeTotal = false,
  }: { cursor?: CatalogCursor | null; limit?: number; query?: string; sort?: CardTableSort; includeTotal?: boolean } = {}) => {
    await writeChain;
    const normalizedQuery = String(query).trim().toLocaleLowerCase("de");
    const pageLimit = Math.min(CATALOG_PAGE_LIMIT, Math.max(1, Math.floor(Number(limit))));
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
    if (includeTotal && !normalizedQuery) {
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
          if (!row.deletedAt && (!normalizedQuery || row.normalizedSearchText.includes(normalizedQuery))) rows.push(row);
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
    if (includeTotal && normalizedQuery) {
      let matches = 0;
      const countTransaction = database.transaction(STORE.cardCatalog, "readonly");
      await iterateCursor<StoredCardCatalog>(countTransaction.objectStore(STORE.cardCatalog).index("deckScan").openCursor(IDBKeyRange.bound([deckId, ""], [deckId, "￿"])), (row) => {
        if (!row.deletedAt && row.normalizedSearchText.includes(normalizedQuery)) matches += 1;
      });
      await transactionDone(countTransaction);
      totalCount = matches;
    }
    const last = rows.at(-1);
    return {
      items: rows.map(catalogEntry),
      totalCount,
      hasMore,
      nextCursor: hasMore && last ? { sortValue: sortValueOf(last), id: last.id } : null,
    };
  };

  const missingCardBodyIds = async (cardIds: string[]) => {
    await writeChain;
    const transaction = database.transaction([STORE.cardCatalog, STORE.cards, STORE.notes, STORE.bodyResidency], "readonly");
    const missing: string[] = [];
    for (const id of [...new Set(cardIds.filter(Boolean))]) {
      const [catalog, card, residency] = await Promise.all([
        requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(id)),
        requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(id)),
        requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(id)),
      ]);
      const note = card ? await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId)) : undefined;
      if (!catalog || !card || !note || bodyResidencyForRevision(residency, catalog) === "catalog-only") missing.push(id);
    }
    await transactionDone(transaction);
    return missing;
  };

  const markCardBodiesResident = async (cardIds: string[], state: Exclude<BodyResidency, "catalog-only">) => {
    await writeChain;
    const transaction = database.transaction([STORE.cardCatalog, STORE.bodyResidency], "readwrite");
    for (const id of [...new Set(cardIds.filter(Boolean))]) {
      const catalog = await requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(id));
      if (catalog) transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, state));
    }
    await transactionDone(transaction);
  };

  const touchCardBodies = async (cardIds: string[], protectedUntil: string | null = null) => {
    const transaction = database.transaction(STORE.bodyResidency, "readwrite");
    const store = transaction.objectStore(STORE.bodyResidency);
    for (const id of [...new Set(cardIds.filter(Boolean))]) {
      const record = await requestResult<CardBodyResidencyRecord | undefined>(store.get(id));
      if (record) store.put({ ...record, lastAccessedAt: new Date().toISOString(), protectedUntil: protectedUntil ?? record.protectedUntil ?? null });
    }
    await transactionDone(transaction);
  };

  /** A resident card with its content, or null when only the catalog entry is local. */
  const loadCardBody = async (cardId: string): Promise<{ card: Card; note: Note } | null> => {
    await writeChain;
    const transaction = database.transaction([STORE.cards, STORE.variants, STORE.notes, STORE.cardCatalog, STORE.bodyResidency], "readonly");
    const [card] = await readCardBodies(transaction, [cardId]);
    if (!card) {
      await transactionDone(transaction);
      return null;
    }
    const [note, catalog, residency] = await Promise.all([
      requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId)),
      requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(cardId)),
      requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(cardId)),
    ]);
    await transactionDone(transaction);
    if (!note || (catalog && bodyResidencyForRevision(residency, catalog) === "catalog-only")) return null;
    return { card, note };
  };

  const loadNotes = async (noteIds: string[]) => {
    await writeChain;
    const transaction = database.transaction(STORE.notes, "readonly");
    const notes = await readNotes(transaction, noteIds.filter(Boolean));
    await transactionDone(transaction);
    return [...notes.values()];
  };

  /** A content with all its cards when every sibling the catalog knows is resident; otherwise null. */
  const loadNoteGraph = async (noteId: string): Promise<NoteGraph | null> => {
    await writeChain;
    const transaction = database.transaction([STORE.notes, STORE.cards, STORE.variants, STORE.cardCatalog], "readonly");
    const note = await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(noteId));
    const cardIds = (await requestResult<IDBValidKey[]>(transaction.objectStore(STORE.cards).index("noteId").getAllKeys(noteId))).map(String);
    const catalogIds = (await requestResult<StoredCardCatalog[]>(transaction.objectStore(STORE.cardCatalog).index("noteId").getAll(noteId)))
      .filter((row) => !row.deletedAt)
      .map((row) => row.id);
    const cards = (await readCardBodies(transaction, cardIds)).filter((card): card is Card => Boolean(card && !card.deletedAt));
    await transactionDone(transaction);
    if (!note || catalogIds.some((id) => !cardIds.includes(id))) return null;
    return { note, cards };
  };

  /** Writes card bodies and contents loaded from the cloud; local changes still waiting for sync win. */
  const applyHydratedBodies = async ({ cards, notes }: { cards: Card[]; notes: Note[] }, state: Exclude<BodyResidency, "catalog-only"> = "cached") => {
    await writeChain;
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const transaction = database.transaction([STORE.notes, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.syncMetadata], "readwrite");
    for (const note of notes) {
      if (!pendingEntityMutation("notes", note.id)) transaction.objectStore(STORE.notes).put(note);
    }
    const catalogStore = transaction.objectStore(STORE.cardCatalog);
    for (const card of cards) {
      if (pendingEntityMutation("cards", card.id) || card.deletedAt) continue;
      const note = notesById.get(card.noteId) ?? await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId)) ?? null;
      const before = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(card.id)) ?? null;
      const catalog = catalogRecordFor(card, note);
      await applyReplicaCatalogChange(transaction, card.deckId, before?.deckId === card.deckId ? before : null, catalog);
      if (before && before.deckId !== card.deckId) await applyReplicaCatalogChange(transaction, before.deckId, before, null);
      transaction.objectStore(STORE.cards).put(cardRecord(card));
      catalogStore.put(catalog);
      const residency = await requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(card.id));
      transaction.objectStore(STORE.bodyResidency).put({
        ...residencyRecord(catalog, residency?.state === "downloaded" ? "downloaded" : state),
        protectedUntil: residency?.protectedUntil ?? null,
      });
      const variantStore = transaction.objectStore(STORE.variants);
      for (const key of await requestResult<IDBValidKey[]>(variantStore.index("cardId").getAllKeys(card.id))) variantStore.delete(key);
      for (const variant of card.variants) variantStore.put(variantRecord(variant, card.deckId));
    }
    await transactionDone(transaction);
  };

  const updateCard = async (cardId: string, updater: (card: Card, note: Note) => Card) => {
    const body = await loadCardBody(cardId);
    if (!body) return null;
    const next = updater(body.card, body.note);
    if (next === body.card) return body;
    await writeNoteGraphs([{ previous: { note: body.note, cards: [body.card] }, next: { note: body.note, cards: [next] } }]);
    return { card: next, note: body.note };
  };

  const saveDeckMetadata = (decks: Array<Deck | WorkspaceDeckSummary>) => {
    const previous = new Map(shell!.decks.map((deck) => [deck.id, deck]));
    const next = decks.map(deckRecord);
    const updatedAt = new Date().toISOString();
    const mutationBatch = queueMutations(planEntityMutations(
      { decks: next.flatMap((deck) => previous.has(deck.id) ? [{ ...previous.get(deck.id)!, cards: [], reviewEvents: [] } as Deck] : []) },
      { decks: next.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck)) },
    ));
    replaceShellDecks(next, updatedAt);
    void enqueueWrite(async () => {
      const transaction = database.transaction([STORE.decks, STORE.outbox, STORE.meta, STORE.deckStudySummaries], "readwrite");
      for (const deck of next) {
        transaction.objectStore(STORE.decks).put(deck);
        if (!previous.has(deck.id)) transaction.objectStore(STORE.deckStudySummaries).put(emptyDeckStudySummary(deck.id));
      }
      writeOutbox(transaction, mutationBatch);
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      await transactionDone(transaction);
    });
    return next.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck));
  };

  const commitImportGraph = async (
    graph: ImportCommitGraph,
    { deckSettings, reimportTargets = { notes: [], cards: [], noteTypeSources: [] }, onMedia = async () => {} }: {
      deckSettings: Partial<DeckSettings>;
      reimportTargets?: ReimportTargets;
      onMedia?: (file: ImportMediaFile) => Promise<void>;
    },
  ): Promise<ImportCommitResult> => {
    await writeChain;
    const now = new Date().toISOString();
    const scope: ImportVerificationScope = { deckIds: [], noteTypeSourceIds: [], noteIds: [], cardIds: [], reviewEventIds: [] };
    const persistedDeckIds = new Map<string, string>();
    const persistedNoteTypeSourceIds = new Map<string, string>();
    const persistedCardIds = new Map<string, string>();
    let keptLocalEdits = 0;
    let missingInPackage = 0;

    // Existing imports: local records first, cloud targets (loaded before the commit) for everything else.
    const targetNotesByGuid = new Map(reimportTargets.notes.flatMap((note) => note.ankiGuid ? [[note.ankiGuid, note] as const] : []));
    const targetCardsByNote = new Map<string, ReimportTargets["cards"]>();
    for (const card of reimportTargets.cards) targetCardsByNote.set(card.noteId, [...(targetCardsByNote.get(card.noteId) ?? []), card]);
    const targetSourceByAnkiId = new Map(reimportTargets.noteTypeSources.map((source) => [source.ankiNotetypeId, source.id]));

    const queueAndWrite = async (stores: string[], inputs: any[], write: (transaction: IDBTransaction) => Promise<void> | void) => {
      const batch = queueMutations(inputs);
      const transaction = database.transaction([...new Set([...stores, STORE.outbox])], "readwrite");
      const done = transactionDone(transaction);
      await write(transaction);
      writeOutbox(transaction, batch);
      await done;
    };

    await graph.streamChunks(async (chunk) => {
      if (chunk.kind === "media") {
        await onMedia(chunk.file);
        return;
      }
      if (chunk.kind === "decks") {
        const decks: WorkspaceDeckSummary[] = [];
        const inputs: any[] = [];
        for (const incoming of chunk.decks) {
          const existing = shell!.decks.find((deck) => deck.source === "anki-apkg" && (
            (incoming.ankiDeckId && deck.ankiDeckId === incoming.ankiDeckId)
            || (!incoming.ankiDeckId && !deck.ankiDeckId && deck.hierarchyPath.join("::") === incoming.hierarchyPath.join("::"))
          ));
          // Reimport keeps the local name, parent, path and settings of an existing deck.
          const deck: WorkspaceDeckSummary = existing ?? {
            ...deckRecord(normalizeCoreDeck({
              id: incoming.id,
              ownerId: userId,
              name: incoming.name,
              source: "anki-apkg",
              ankiDeckId: incoming.ankiDeckId,
              parentDeckId: incoming.parentDeckId ? persistedDeckIds.get(incoming.parentDeckId) ?? incoming.parentDeckId : null,
              hierarchyPath: incoming.hierarchyPath,
              deckSettings,
              createdAt: now,
            })),
          };
          persistedDeckIds.set(incoming.id, deck.id);
          scope.deckIds.push(deck.id);
          if (!existing) {
            decks.push(deck);
            inputs.push(...planEntityMutations({}, { decks: [{ ...deck, cards: [], reviewEvents: [] } as Deck] }));
          }
        }
        await queueAndWrite([STORE.decks, STORE.deckStudySummaries], inputs, (transaction) => {
          for (const deck of decks) {
            transaction.objectStore(STORE.decks).put(deck);
            transaction.objectStore(STORE.deckStudySummaries).put(emptyDeckStudySummary(deck.id));
          }
        });
        replaceShellDecks(decks, now);
        return;
      }
      if (chunk.kind === "note-type-sources") {
        const sources: Array<NoteTypeSource & { revision: number; createdAt: string; updatedAt: string }> = [];
        const read = database.transaction(STORE.noteTypeSources, "readonly");
        for (const incoming of chunk.values) {
          const local = await requestResult<Array<{ id: string }>>(read.objectStore(STORE.noteTypeSources).index("ankiNotetypeId").getAll(incoming.ankiNotetypeId));
          const id = local[0]?.id ?? targetSourceByAnkiId.get(incoming.ankiNotetypeId) ?? incoming.id;
          persistedNoteTypeSourceIds.set(incoming.id, id);
          sources.push({ ...incoming, id, revision: 1, createdAt: now, updatedAt: now });
          scope.noteTypeSourceIds.push(id);
        }
        await transactionDone(read);
        await queueAndWrite(
          [STORE.noteTypeSources],
          sources.map((source) => ({ type: "entity-mutation", table: "note_type_sources", entityId: source.id, baseRevision: null, payload: { table: "note_type_sources", entity: source, baseRevision: null } })),
          (transaction) => { for (const source of sources) transaction.objectStore(STORE.noteTypeSources).put(source); },
        );
        return;
      }
      if (chunk.kind === "notes") {
        const read = database.transaction([STORE.notes, STORE.cards], "readonly");
        const changes: NoteGraphChange[] = [];
        const persistedNoteIds = new Map<string, string>();
        const incomingCardsByNote = new Map<string, Card[]>();
        for (const card of chunk.cards) incomingCardsByNote.set(card.noteId, [...(incomingCardsByNote.get(card.noteId) ?? []), card]);
        for (const incoming of chunk.notes) {
          const noteTypeSourceId = incoming.noteTypeSourceId ? persistedNoteTypeSourceIds.get(incoming.noteTypeSourceId) ?? incoming.noteTypeSourceId : null;
          const localMatches = incoming.ankiGuid ? await requestResult<Note[]>(read.objectStore(STORE.notes).index("ankiGuid").getAll(incoming.ankiGuid)) : [];
          const existing = localMatches.find((note) => !note.deletedAt) ?? (incoming.ankiGuid ? targetNotesByGuid.get(incoming.ankiGuid) : undefined);
          const incomingCards = (incomingCardsByNote.get(incoming.id) ?? []).map((card) => ({ ...card, deckId: persistedDeckIds.get(card.deckId) ?? card.deckId }));
          if (!existing) {
            const note: Note = { ...incoming, userId, noteTypeSourceId };
            persistedNoteIds.set(incoming.id, note.id);
            changes.push({ previous: null, next: { note, cards: incomingCards } });
            for (const card of incomingCards) persistedCardIds.set(card.id, card.id);
            continue;
          }
          // K5.7: local edits, study state, suspension, mark and deck placement stay; new prompts become new cards.
          persistedNoteIds.set(incoming.id, existing.id);
          const locallyEdited = existing.importedContentRevision === null || existing.contentRevision > existing.importedContentRevision;
          if (locallyEdited) keptLocalEdits += 1;
          const contentChanged = !locallyEdited && JSON.stringify(existing.content) !== JSON.stringify(incoming.content);
          const note: Note = contentChanged
            ? {
              ...existing,
              content: incoming.content,
              media: incoming.media,
              translator: incoming.translator,
              noteTypeSourceId,
              contentRevision: existing.contentRevision + 1,
              importedContentRevision: existing.contentRevision + 1,
              revision: existing.revision + 1,
              updatedAt: now,
            }
            : existing;
          const localCards = (await Promise.all((await requestResult<IDBValidKey[]>(read.objectStore(STORE.cards).index("noteId").getAllKeys(existing.id)))
            .map((id) => requestResult<StoredCard | undefined>(read.objectStore(STORE.cards).get(id)))))
            .filter((card): card is StoredCard => Boolean(card && !card.deletedAt));
          const knownCards = [...localCards, ...(targetCardsByNote.get(existing.id) ?? [])];
          const existingIds = new Map<string, string>();
          for (const card of knownCards) {
            if (card.ankiCardId) existingIds.set(`anki:${card.ankiCardId}`, card.id);
            existingIds.set(`key:${card.promptKey}`, card.id);
          }
          const newCards: Card[] = [];
          const matchedIds = new Set<string>();
          for (const card of incomingCards) {
            const matched = (card.ankiCardId ? existingIds.get(`anki:${card.ankiCardId}`) : undefined) ?? existingIds.get(`key:${card.promptKey}`);
            if (matched) {
              persistedCardIds.set(card.id, matched);
              matchedIds.add(matched);
            } else if (!locallyEdited) {
              newCards.push({ ...card, noteId: existing.id });
              persistedCardIds.set(card.id, card.id);
            }
          }
          missingInPackage += new Set(knownCards.map((card) => card.id).filter((id) => !matchedIds.has(id))).size;
          if (note !== existing || newCards.length) changes.push({ previous: { note: existing, cards: [] }, next: { note, cards: newCards } });
        }
        await transactionDone(read);
        // Raw field values are kept for every imported content; re-translation only touches unedited ones.
        const noteSources = chunk.noteSources.map((source) => ({
          noteId: persistedNoteIds.get(source.noteId) ?? source.noteId,
          noteTypeSourceId: persistedNoteTypeSourceIds.get(source.noteTypeSourceId) ?? source.noteTypeSourceId,
          fields: source.fields,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        }));
        if (changes.length) await writeNoteGraphs(changes);
        await queueAndWrite(
          [STORE.noteSources],
          noteSources.map((source) => ({ type: "entity-mutation", table: "note_sources", entityId: source.noteId, baseRevision: null, payload: { table: "note_sources", entity: source, baseRevision: null } })),
          (transaction) => { for (const source of noteSources) transaction.objectStore(STORE.noteSources).put(source); },
        );
        for (const change of changes) {
          scope.noteIds.push(change.next.note.id);
          for (const card of change.next.cards) scope.cardIds.push(card.id);
        }
        return;
      }
      const events: ReviewEvent[] = chunk.values.flatMap((incoming) => {
        const cardId = persistedCardIds.get(incoming.cardId);
        if (!cardId) return [];
        return [{
          id: incoming.id,
          userId,
          deckId: "",
          cardId,
          variantId: null,
          rating: incoming.rating,
          answeredAt: incoming.answeredAt,
          responseTimeMs: incoming.responseTimeMs,
          schedulerBefore: incoming.schedulerBefore,
          schedulerAfter: incoming.schedulerAfter,
          flags: incoming.flags,
          createdAt: incoming.answeredAt,
        }];
      });
      const read = database.transaction([STORE.cards, STORE.reviewEvents], "readonly");
      const cards = await Promise.all(events.map((event) => requestResult<StoredCard | undefined>(read.objectStore(STORE.cards).get(event.cardId))));
      const existing = await Promise.all(events.map((event) => requestResult<IDBValidKey | undefined>(read.objectStore(STORE.reviewEvents).getKey(event.id))));
      await transactionDone(read);
      const newEvents = events
        .map((event, index) => ({ ...event, deckId: cards[index]?.deckId ?? "" }))
        .filter((event, index) => event.deckId && existing[index] == null);
      await queueAndWrite(
        [STORE.reviewEvents],
        newEvents.map((event) => ({ type: "entity-mutation", table: "review_events", entityId: event.id, baseRevision: null, payload: { table: "review_events", entity: event, baseRevision: null } })),
        (transaction) => { for (const event of newEvents) transaction.objectStore(STORE.reviewEvents).put(event); },
      );
      scope.reviewEventIds.push(...newEvents.map((event) => event.id));
    });

    const finalScope = {
      deckIds: [...new Set(scope.deckIds)].sort(),
      noteTypeSourceIds: [...new Set(scope.noteTypeSourceIds)].sort(),
      noteIds: [...new Set(scope.noteIds)].sort(),
      cardIds: [...new Set(scope.cardIds)].sort(),
      reviewEventIds: [...new Set(scope.reviewEventIds)].sort(),
    };
    latestImportVerificationScope = finalScope;
    return {
      decks: finalScope.deckIds.map((id) => shell!.decks.find((deck) => deck.id === id)).filter((deck): deck is WorkspaceDeckSummary => Boolean(deck)),
      scope: finalScope,
      keptLocalEdits,
      missingInPackage,
    };
  };

  const outbox = {
    enqueue(input: Partial<SyncOutboxMutation> = {}) {
      if (!input.id || !input.type) throw new Error("Sync-Mutation braucht ID und Typ.");
      const existing = pendingOutbox.get(input.id);
      if (existing) return existing;
      const mutation = {
        id: input.id,
        userId,
        deviceId: input.deviceId ?? null,
        type: input.type,
        table: input.table ?? null,
        entityId: input.entityId ?? null,
        baseRevision: input.baseRevision ?? null,
        payload: input.payload ?? {},
        createdAt: input.createdAt ?? new Date().toISOString(),
        flushedAt: input.flushedAt ?? null,
        retryCount: Number(input.retryCount ?? 0),
        lastError: input.lastError ?? null,
      } satisfies SyncOutboxMutation;
      rememberPending(mutation);
      void enqueueWrite(async () => {
        const transaction = database.transaction(STORE.outbox, "readwrite");
        transaction.objectStore(STORE.outbox).put(mutation);
        await transactionDone(transaction);
      });
      return mutation;
    },
    listPending: () => [...pendingOutbox.values()].filter((mutation) => !mutation.flushedAt).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)),
    markFlushed(idsToFlush: string[] = [], flushedAt = new Date().toISOString()) {
      for (const id of idsToFlush) {
        const mutation = pendingOutbox.get(id);
        if (mutation) {
          forgetPending(id);
          pendingOutbox.set(id, { ...mutation, flushedAt });
        }
      }
      void enqueueWrite(async () => {
        const transaction = database.transaction(STORE.outbox, "readwrite");
        for (const id of idsToFlush) {
          const mutation = pendingOutbox.get(id);
          if (mutation) transaction.objectStore(STORE.outbox).put(mutation);
        }
        await transactionDone(transaction);
      });
      return [...pendingOutbox.values()];
    },
    markFailed(idsToFail: string[] = [], error: unknown = null) {
      for (const id of idsToFail) {
        const mutation = pendingOutbox.get(id);
        if (mutation) pendingOutbox.set(id, {
          ...mutation,
          retryCount: mutation.retryCount + 1,
          lastError: error ? String((error as Error).message ?? error).slice(0, 300) : null,
        });
      }
      void enqueueWrite(async () => {
        const transaction = database.transaction(STORE.outbox, "readwrite");
        for (const id of idsToFail) {
          const mutation = pendingOutbox.get(id);
          if (mutation) transaction.objectStore(STORE.outbox).put(mutation);
        }
        await transactionDone(transaction);
      });
      return [...pendingOutbox.values()];
    },
    remove(idsToRemove: string[] = []) {
      for (const id of idsToRemove) forgetPending(id);
      void enqueueWrite(async () => {
        const transaction = database.transaction(STORE.outbox, "readwrite");
        for (const id of idsToRemove) transaction.objectStore(STORE.outbox).delete(id);
        await transactionDone(transaction);
      });
      return [...pendingOutbox.values()];
    },
    count: () => [...pendingOutbox.values()].filter((mutation) => !mutation.flushedAt).length,
    flushPersistence: () => writeChain,
  };

  const reviewDayCountUpdate = (answeredAt: string) => {
    const hourKey = reviewHourKey(answeredAt);
    if (hourKey) reviewHourCounts = { ...(reviewHourCounts ?? {}), [hourKey]: ((reviewHourCounts ?? {})[hourKey] ?? 0) + 1 };
    if (!reviewDayCountsCache) return;
    const dayKey = getStudyHeatmapDayKey(answeredAt, reviewDayCountsCache.timeZone, reviewDayCountsCache.dayStartHour);
    if (dayKey) reviewDayCountsCache = { ...reviewDayCountsCache, counts: { ...reviewDayCountsCache.counts, [dayKey]: (reviewDayCountsCache.counts[dayKey] ?? 0) + 1 } };
  };

  return {
    loadShell: async () => shell!,
    getShellState(): WorkspaceState {
      return {
        version: 6,
        profile: shell!.profile,
        decks: shell!.decks.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck)),
        notes: [],
        updatedAt: shell!.updatedAt,
      };
    },
    getReplicaStatus: () => ({ ...replicaStatus }),
    setAccountBaselineState(state: AccountBaselineState, serverCatalogCursor = replicaStatus.catalogServerCursor) {
      return persistReplicaStatus({ accountBaselineState: state, catalogServerCursor: Math.max(0, serverCatalogCursor) });
    },
    completeCatalogReconciliation(serverCatalogCursor = replicaStatus.catalogCursor) {
      return persistReplicaStatus({
        catalogCompleteness: "complete",
        catalogCursor: Math.max(replicaStatus.catalogCursor, serverCatalogCursor),
        catalogServerCursor: Math.max(replicaStatus.catalogServerCursor, serverCatalogCursor),
      });
    },
    async applyAccountStudyOverview(overview: AccountStudyOverview) {
      studyOverview = overview;
      const transaction = database.transaction(STORE.syncMetadata, "readwrite");
      transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: overview });
      await transactionDone(transaction);
    },
    /** The 365-day forecast arrives after the bootstrap and only completes the matching overview. */
    async applyDueForecast(forecast: { contextKey: string; forecastByDay: Record<string, number> }) {
      if (!studyOverview || studyOverview.contextKey !== forecast.contextKey) return;
      studyOverview = { ...studyOverview, forecastByDay: forecast.forecastByDay };
      const transaction = database.transaction(STORE.syncMetadata, "readwrite");
      transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: studyOverview });
      await transactionDone(transaction);
    },
    applyCloudCatalogPage,
    listCatalogPage,
    missingCardBodyIds,
    markCardBodiesResident,
    touchCardBodies,
    loadCardBody,
    loadNotes,
    loadNoteGraph,
    applyHydratedBodies,
    saveNoteGraphs: writeNoteGraphs,
    updateCard,
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
      await writeChain;
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
    async cacheStatisticsSnapshot(id: string, snapshot: AccountStatisticsSnapshot) {
      const transaction = database.transaction(STORE.statisticsSnapshots, "readwrite");
      transaction.objectStore(STORE.statisticsSnapshots).put({ id, ...snapshot });
      await transactionDone(transaction);
    },
    async readStatisticsSnapshot(id: string) {
      const transaction = database.transaction(STORE.statisticsSnapshots, "readonly");
      const snapshot = await requestResult<(AccountStatisticsSnapshot & { id: string }) | undefined>(transaction.objectStore(STORE.statisticsSnapshots).get(id));
      await transactionDone(transaction);
      if (!snapshot) return null;
      const { id: _id, ...value } = snapshot;
      return value;
    },
    async listDeckStudySummaries() {
      const transaction = database.transaction(STORE.deckStudySummaries, "readonly");
      const summaries = await requestResult<DeckStudySummary[]>(transaction.objectStore(STORE.deckStudySummaries).getAll());
      await transactionDone(transaction);
      return summaries;
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
    /** Manual reschedule: only the due date changes; it travels as an idempotent manual review event. */
    rescheduleCards(cardIds: string[], dueAt: string, occurredAt = new Date().toISOString()) {
      const idsToUpdate = [...new Set(cardIds.filter(Boolean))];
      if (!idsToUpdate.length) return Promise.resolve([] as Card[]);
      return enqueueWrite(async () => {
        const transaction = database.transaction([STORE.cards, STORE.variants, STORE.notes, STORE.reviewEvents, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
        const completed = transactionDone(transaction);
        const cards = await readCardBodies(transaction, idsToUpdate);
        if (cards.some((card) => !card || card.deletedAt)) {
          transaction.abort();
          await completed.catch(() => undefined);
          throw new Error("Mindestens eine Karte wurde nicht gefunden.");
        }
        const notes = await readNotes(transaction, cards.map((card) => card!.noteId));
        const changes = (cards as Card[]).flatMap((previous) => {
          const card = rescheduleCard(previous, dueAt, occurredAt);
          if (card === previous) return [];
          const event: ReviewEvent = {
            id: `manual_${mutationId()}`,
            userId,
            deckId: card.deckId,
            cardId: card.id,
            variantId: null,
            rating: "manual",
            answeredAt: occurredAt,
            responseTimeMs: null,
            schedulerBefore: { card: { state: previous.study.state, dueAt: previous.study.dueAt, intervalDays: previous.study.intervalDays } },
            schedulerAfter: { card: { state: card.study.state, dueAt, intervalDays: card.study.intervalDays } },
            flags: { kind: "manual_reschedule" },
            createdAt: occurredAt,
          };
          return [{ previous, card, event }];
        });
        if (!changes.length) {
          await completed;
          return cards as Card[];
        }
        const mutationBatch = queueMutations(changes.map(({ card, event }) => ({
          type: "review-atomic",
          table: "review_events",
          entityId: event.id,
          payload: { event, card: { id: card.id, study: card.study, updatedAt: card.updatedAt }, variant: null },
        })));
        for (const { previous, card, event } of changes) {
          const note = notes.get(card.noteId) ?? null;
          const nextCatalog = catalogRecordFor(card, note);
          const previousCatalog = await requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(card.id)) ?? catalogRecordFor(previous, note);
          await applyReplicaCatalogChange(transaction, card.deckId, previousCatalog, nextCatalog, occurredAt);
          transaction.objectStore(STORE.cards).put(cardRecord(card));
          transaction.objectStore(STORE.reviewEvents).put(event);
          transaction.objectStore(STORE.cardCatalog).put(nextCatalog);
          transaction.objectStore(STORE.bodyResidency).put(residencyRecord(nextCatalog, "cached"));
        }
        writeOutbox(transaction, mutationBatch);
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: occurredAt });
        await completed;
        shell = { ...shell!, updatedAt: occurredAt };
        return changes.map((change) => change.card);
      });
    },
    recordReview(result: ReviewAnswerResult) {
      const { deck, event, updatedCard, variant } = result;
      const mutation: SyncOutboxMutation = {
        id: `review_${event.id}`,
        userId,
        deviceId: null,
        type: "review-atomic",
        table: "review_events",
        entityId: event.id,
        baseRevision: null,
        payload: {
          event,
          card: { id: updatedCard.id, study: updatedCard.study, updatedAt: updatedCard.updatedAt },
          variant: variant ? { id: variant.id, performance: variant.performance, updatedAt: variant.updatedAt } : null,
        },
        createdAt: event.answeredAt,
        flushedAt: null,
        retryCount: 0,
        lastError: null,
      };
      rememberPending(mutation);
      reviewDayCountUpdate(event.answeredAt);
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.cards, STORE.variants, STORE.notes, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.reviewEvents, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
        const catalogStore = transaction.objectStore(STORE.cardCatalog);
        const previousCatalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(updatedCard.id)) ?? null;
        const note = await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(updatedCard.noteId)) ?? null;
        const catalog = note ? catalogRecordFor(updatedCard, note) : storedCatalogRecord({ ...catalogEntryFromCard(updatedCard, null), ...(previousCatalog ? { frontPreview: previousCatalog.frontPreview, sortText: previousCatalog.sortText, normalizedSearchText: previousCatalog.normalizedSearchText } : {}) });
        await applyReplicaCatalogChange(transaction, deck.id, previousCatalog, catalog, event.answeredAt);
        const overviewContext = studyOverview ? studyOverviewContext(studyOverview) : null;
        const overviewDay = overviewContext ? getStudyHeatmapDayKey(event.answeredAt, overviewContext.timeZone, overviewContext.dayStartHour) : null;
        if (studyOverview && overviewContext && overviewDay === studyOverview.dayKey) {
          const range = getLearningDayRange(event.answeredAt, overviewContext);
          const priorEvents = range ? await requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("cardAnswered").getAll(IDBKeyRange.bound(
            [event.cardId, new Date(range.start).toISOString(), ""],
            [event.cardId, new Date(range.end).toISOString(), ""],
            false,
            true,
          ))) : [];
          const wasNew = (candidate: ReviewEvent) => ((candidate.schedulerBefore as any)?.card?.state ?? "new") === "new";
          const isIntroduction = wasNew(event);
          if (!priorEvents.some((prior) => prior.rating !== "manual" && wasNew(prior) === isIntroduction)) {
            const key = isIntroduction ? "introducedTodayByDeck" : "reviewedTodayByDeck";
            studyOverview = { ...studyOverview, [key]: { ...studyOverview[key], [deck.id]: (studyOverview[key][deck.id] ?? 0) + 1 }, generatedAt: event.answeredAt };
            transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: studyOverview });
          }
        }
        transaction.objectStore(STORE.cards).put(cardRecord(updatedCard));
        catalogStore.put(catalog);
        transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
        if (variant) transaction.objectStore(STORE.variants).put(variantRecord(variant, updatedCard.deckId));
        transaction.objectStore(STORE.reviewEvents).put(event);
        transaction.objectStore(STORE.outbox).put(mutation);
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: event.answeredAt });
        transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: reviewHourCounts ?? {} });
        if (reviewDayCountsCache) transaction.objectStore(STORE.syncMetadata).put({ key: "reviewDayCounts", value: reviewDayCountsCache });
        await transactionDone(transaction);
      });
      return result;
    },
    commitImportGraph,
    async createImportVerificationScope(deckIdsToVerify: string[]): Promise<ImportVerificationScope> {
      await writeChain;
      const deckIds = [...new Set(deckIdsToVerify.filter(Boolean))];
      const scope = latestImportVerificationScope;
      if (!scope || scope.deckIds.length !== deckIds.length || scope.deckIds.some((deckId) => !deckIds.includes(deckId))) {
        throw new Error("Der Prüfumfang des letzten APKG-Imports ist nicht mehr verfügbar.");
      }
      const known = new Set(shell!.decks.map((deck) => deck.id));
      for (const deckId of deckIds) {
        const deck = shell!.decks.find((candidate) => candidate.id === deckId);
        if (!deck) throw new Error("Mindestens ein importierter Stapel fehlt im lokalen Commitgraphen.");
        if (deck.parentDeckId && !known.has(deck.parentDeckId)) throw new Error(`Der übergeordnete Stapel für „${deck.name}“ fehlt im lokalen Commitgraphen.`);
      }
      const read = database.transaction([STORE.notes, STORE.cards, STORE.reviewEvents], "readonly");
      const [notes, cards, reviews] = await Promise.all([
        Promise.all(scope.noteIds.map((id) => requestResult(read.objectStore(STORE.notes).getKey(id)))),
        Promise.all(scope.cardIds.map((id) => requestResult<StoredCard | undefined>(read.objectStore(STORE.cards).get(id)))),
        Promise.all(scope.reviewEventIds.map((id) => requestResult(read.objectStore(STORE.reviewEvents).getKey(id)))),
      ]);
      await transactionDone(read);
      if ([...notes, ...cards, ...reviews].some((row) => row == null)) throw new Error("Mindestens eine erwartete Entität fehlt im lokalen Importgraphen.");
      if (cards.some((card) => !known.has(card!.deckId))) throw new Error("Mindestens eine Karte ist einem unbekannten Stapel zugeordnet.");
      return scope;
    },
    /** Re-queues the inserts of a verified import graph; the cloud matches existing rows idempotently. */
    async requeueImportVerificationScope(scope: ImportVerificationScope, repairScope: ImportVerificationRepairScope | null = null) {
      await writeChain;
      const target = (key: keyof ImportVerificationScope) => repairScope ? repairScope[key] ?? [] : scope[key];
      const read = database.transaction([STORE.notes, STORE.cards, STORE.variants, STORE.reviewEvents, STORE.noteTypeSources, STORE.noteSources], "readonly");
      const [notes, cards, reviews, noteTypeSources, noteSources] = await Promise.all([
        Promise.all(target("noteIds").map((id) => requestResult<Note | undefined>(read.objectStore(STORE.notes).get(id)))),
        readCardBodies(read, target("cardIds")),
        Promise.all(target("reviewEventIds").map((id) => requestResult<ReviewEvent | undefined>(read.objectStore(STORE.reviewEvents).get(id)))),
        Promise.all(target("noteTypeSourceIds").map((id) => requestResult<any>(read.objectStore(STORE.noteTypeSources).get(id)))),
        Promise.all(target("noteIds").map((id) => requestResult<any>(read.objectStore(STORE.noteSources).get(id)))),
      ]);
      await transactionDone(read);
      const decks = target("deckIds").map((id) => shell!.decks.find((deck) => deck.id === id) ?? null);
      if ([...decks, ...notes, ...cards, ...reviews, ...noteTypeSources].some((entity) => !entity)) {
        throw new Error("Der unvollständige Import kann lokal nicht mehr vollständig rekonstruiert werden.");
      }
      const insert = (table: string, entity: any, entityId = entity.id) => ({ type: "entity-mutation", table, entityId, baseRevision: null, payload: { table, entity, baseRevision: null } });
      const inputs = [
        ...noteTypeSources.map((source) => insert("note_type_sources", source)),
        ...(decks as WorkspaceDeckSummary[]).map((deck) => insert("decks", deck)),
        ...(notes as Note[]).map((note) => insert("notes", note)),
        ...noteSources.filter(Boolean).map((source) => insert("note_sources", source, source.noteId)),
        ...(cards as Card[]).map((card) => insert("cards", cardRecord(card))),
        ...(cards as Card[]).flatMap((card) => card.variants.map((variant) => insert("card_variants", variant))),
        ...(reviews as ReviewEvent[]).map((review) => insert("review_events", review)),
      ];
      const batch = queueMutations(inputs);
      const write = database.transaction(STORE.outbox, "readwrite");
      writeOutbox(write, batch);
      await transactionDone(write);
      return batch.queued.length;
    },
    getSyncConflictCardIds: (): ReadonlySet<string> => new Set(syncConflictCardIds),
    async setSyncConflicts(conflicts: any[] = []) {
      syncConflictCardIds = new Set(conflicts.flatMap((conflict) => conflict?.cardId ? [String(conflict.cardId)] : []));
      const conflictedDeckIds = [...new Set(conflicts.filter((conflict) => conflict?.entityTable === "decks" && conflict?.entityId).map((conflict) => String(conflict.entityId)))];
      const conflictedNoteIds = [...new Set(conflicts.flatMap((conflict) => conflict?.noteId ? [String(conflict.noteId)] : []))];
      if (conflictedDeckIds.length || conflictedNoteIds.length) {
        const read = database.transaction(STORE.cardCatalog, "readonly");
        const catalog = read.objectStore(STORE.cardCatalog);
        const rows = await Promise.all([
          ...conflictedDeckIds.map((deckId) => requestResult<IDBValidKey[]>(catalog.index("deckScan").getAllKeys(IDBKeyRange.bound([deckId, ""], [deckId, "￿"])))),
          ...conflictedNoteIds.map((noteId) => requestResult<IDBValidKey[]>(catalog.index("noteId").getAllKeys(noteId))),
        ]);
        await transactionDone(read);
        for (const id of rows.flat()) syncConflictCardIds.add(String(id));
      }
      const transaction = database.transaction(STORE.syncMetadata, "readwrite");
      transaction.objectStore(STORE.syncMetadata).put({ key: "syncConflictCardIds", value: [...syncConflictCardIds] });
      await transactionDone(transaction);
    },
    async prepareConflictResolution(result: any, decision: any) {
      const target = result?.resolutionTarget;
      if (!target || !["keep-local", "keep-remote", "merge-fields"].includes(decision?.action)) return;
      const mutationIds = [...pendingByTarget.values()]
        .filter((mutation) => mutation.type === "entity-mutation" && mutation.table === target.table && mutation.entityId === target.entityId)
        .map((mutation) => mutation.id);
      outbox.remove(mutationIds);
      await outbox.flushPersistence();
      if (decision.action !== "keep-remote" || result.resolvedPage) return;
      const storeName = ({ decks: STORE.decks, notes: STORE.notes, cards: STORE.cards, card_variants: STORE.variants } as Record<string, string>)[target.table];
      if (!storeName) return;
      const stores = target.table === "cards" ? [STORE.cards, STORE.variants, STORE.bodyResidency] : [storeName];
      const transaction = database.transaction(stores, "readwrite");
      transaction.objectStore(storeName).delete(target.entityId);
      if (target.table === "cards") {
        for (const key of await requestResult<IDBValidKey[]>(transaction.objectStore(STORE.variants).index("cardId").getAllKeys(target.entityId))) transaction.objectStore(STORE.variants).delete(key);
        const residency = await requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(target.entityId));
        if (residency) transaction.objectStore(STORE.bodyResidency).put({ ...residency, state: "catalog-only" });
      }
      await transactionDone(transaction);
      shell = await loadShell(database);
    },
    /** Applies resolved conflict rows: decks to the shell, contents and cards as bodies. */
    async applyCloudPage(page: CloudEntityPage) {
      await writeChain;
      if (page.table === "decks") {
        const transaction = database.transaction(STORE.decks, "readwrite");
        for (const deck of page.entities as Deck[]) {
          if (deck.deletedAt) transaction.objectStore(STORE.decks).delete(deck.id);
          else transaction.objectStore(STORE.decks).put(deckRecord(deck));
        }
        await transactionDone(transaction);
        shell = await loadShell(database);
        return;
      }
      if (page.table === "notes") return applyHydratedBodies({ cards: [], notes: page.entities as Note[] });
      if (page.table === "cards") return applyHydratedBodies({ cards: page.entities as Card[], notes: [] });
      if (page.table === "card_variants") {
        const transaction = database.transaction([STORE.variants, STORE.cards], "readwrite");
        for (const variant of page.entities as CardVariant[]) {
          const card = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(variant.cardId));
          if (card) transaction.objectStore(STORE.variants).put(variantRecord(variant, card.deckId));
        }
        await transactionDone(transaction);
      }
    },
    async applyCloudProfile(profile: Profile) {
      const completeProfile = requireCompleteProfile(profile, userId);
      const updatedAt = new Date().toISOString();
      const transaction = database.transaction(STORE.meta, "readwrite");
      transaction.objectStore(STORE.meta).put({ key: "profile", value: completeProfile });
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      await transactionDone(transaction);
      shell = { ...shell!, profile: completeProfile, updatedAt };
    },
    saveDeckMetadata,
    async deleteDeckTree(deckId: string) {
      await writeChain;
      const deletedIds = new Set<string>([deckId]);
      for (let size = -1; size !== deletedIds.size;) {
        size = deletedIds.size;
        for (const deck of shell!.decks) if (deck.parentDeckId && deletedIds.has(deck.parentDeckId)) deletedIds.add(deck.id);
      }
      const deletedDecks = shell!.decks.filter((deck) => deletedIds.has(deck.id));
      if (!deletedDecks.length) return { deletedDeckIds: [] as string[], deletedDecks, nextSelectedDeckId: shell!.decks[0]?.id ?? null };
      const deletedAt = new Date().toISOString();
      const mutationBatch = queueMutations([{ type: "deck-command", table: "decks", entityId: deckId, payload: { deckId, deletedAt } }]);
      shell = { ...shell!, decks: shell!.decks.filter((deck) => !deletedIds.has(deck.id)), updatedAt: deletedAt };
      await enqueueWrite(async () => {
        const stores = [STORE.decks, STORE.cards, STORE.variants, STORE.reviewEvents, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.offlineDecks, STORE.offlineManifests, STORE.statisticsSnapshots, STORE.outbox, STORE.meta];
        const transaction = database.transaction(stores, "readwrite");
        const deleteCursor = (request: IDBRequest<IDBCursorWithValue | null>) => new Promise<void>((resolve, reject) => {
          request.onerror = () => reject(request.error ?? new Error("Lokale Stapeldaten konnten nicht entfernt werden."));
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) { resolve(); return; }
            cursor.delete();
            cursor.continue();
          };
        });
        const deletions: Promise<void>[] = [];
        for (const id of deletedIds) {
          transaction.objectStore(STORE.decks).delete(id);
          transaction.objectStore(STORE.deckStudySummaries).delete(id);
          transaction.objectStore(STORE.offlineDecks).delete(id);
          deletions.push(
            deleteCursor(transaction.objectStore(STORE.cards).index("deckScan").openCursor(IDBKeyRange.bound([id, ""], [id, "￿"]))),
            deleteCursor(transaction.objectStore(STORE.variants).index("deckId").openCursor(IDBKeyRange.only(id))),
            deleteCursor(transaction.objectStore(STORE.reviewEvents).index("deckId").openCursor(IDBKeyRange.only(id))),
            deleteCursor(transaction.objectStore(STORE.cardCatalog).index("deckScan").openCursor(IDBKeyRange.bound([id, ""], [id, "￿"]))),
            deleteCursor(transaction.objectStore(STORE.bodyResidency).index("deckAccess").openCursor(IDBKeyRange.bound([id, "", ""], [id, "￿", "￿"]))),
            deleteCursor(transaction.objectStore(STORE.offlineManifests).index("deckId").openCursor(IDBKeyRange.only(id))),
          );
        }
        transaction.objectStore(STORE.statisticsSnapshots).clear();
        writeOutbox(transaction, mutationBatch);
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: deletedAt });
        await Promise.all(deletions);
        await transactionDone(transaction);
      });
      return { deletedDeckIds: [...deletedIds], deletedDecks, nextSelectedDeckId: shell!.decks[0]?.id ?? null };
    },
    updateDeckSettings(deckId: string, settings: any) {
      const summary = shell!.decks.find((deck) => deck.id === deckId);
      if (!summary) return null;
      return saveDeckMetadata([{
        ...summary,
        updatedAt: new Date().toISOString(),
        deckSettings: createDefaultDeckSettings({
          ...summary.deckSettings,
          ...settings,
          appearance: { ...(summary.deckSettings?.appearance ?? {}), ...(settings.appearance ?? {}) },
        }),
      }])[0] ?? null;
    },
    saveProfile(profile: Profile) {
      const completeProfile = requireCompleteProfile(profile, userId);
      const updatedAt = new Date().toISOString();
      shell = { ...shell!, profile: completeProfile, updatedAt };
      const mutationBatch = queueMutations([{ type: "profile-patch", table: "profiles", entityId: completeProfile.userId, payload: { profile: completeProfile } }]);
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.meta, STORE.outbox], "readwrite");
        transaction.objectStore(STORE.meta).put({ key: "profile", value: completeProfile });
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
        writeOutbox(transaction, mutationBatch);
        await transactionDone(transaction);
      });
      return completeProfile;
    },
    async listDeckSummaries({ now = new Date().toISOString(), dayStartHour = 0, timeZone }: { now?: string; dayStartHour?: number; learnAheadMinutes?: number; timeZone?: string } = {}) {
      const measureFirstRun = !firstDeckSummariesStarted;
      if (measureFirstRun) {
        firstDeckSummariesStarted = true;
        markStartupPhaseStarted("firstDeckSummaries");
      }
      await writeChain;
      const todayKey = getStudyHeatmapDayKey(now, timeZone, dayStartHour) ?? now.slice(0, 10);
      const contextKey = `${timeZone ?? "local"}:${dayStartHour}`;
      const dayRange = getLearningDayRange(now, { dayStartHour, timeZone });
      const overviewMatches = studyOverview?.contextKey === contextKey && studyOverview.dayKey === todayKey;
      const catalogIsComplete = replicaStatus.catalogCompleteness === "complete";
      const transaction = database.transaction([
        STORE.deckStudySummaries,
        ...(catalogIsComplete ? [STORE.cardCatalog] : []),
        ...(!overviewMatches && catalogIsComplete ? [STORE.reviewEvents] : []),
      ], "readonly");
      const countState = (deckId: string, state: string) => requestResult(transaction.objectStore(STORE.cardCatalog).index("deckReviewDue").count(IDBKeyRange.bound(
        [deckId, 1, state, "", ""],
        [deckId, 1, state, new Date(dayRange!.end).toISOString(), ""],
        false,
        true,
      )));
      const [summaryRows, todayEventRows, dueRows, availableNewRows, availableLearningRows] = await Promise.all([
        requestResult<DeckStudySummary[]>(transaction.objectStore(STORE.deckStudySummaries).getAll()),
        dayRange && catalogIsComplete && !overviewMatches
          ? Promise.all(shell!.decks.map((deck) => requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("deckAnswered").getAll(IDBKeyRange.bound(
            [deck.id, new Date(dayRange.start).toISOString(), ""],
            [deck.id, new Date(dayRange.end).toISOString(), ""],
            false,
            true,
          )))))
          : Promise.resolve([] as ReviewEvent[][]),
        dayRange && catalogIsComplete ? Promise.all(shell!.decks.map((deck) => countState(deck.id, "review"))) : Promise.resolve([] as number[]),
        dayRange && catalogIsComplete ? Promise.all(shell!.decks.map((deck) => countState(deck.id, "new"))) : Promise.resolve([] as number[]),
        dayRange && catalogIsComplete
          ? Promise.all(shell!.decks.map(async (deck) => (await countState(deck.id, "learning")) + (await countState(deck.id, "relearning"))))
          : Promise.resolve([] as number[]),
      ]);
      await transactionDone(transaction);

      if (reviewDayCountsCache?.contextKey !== contextKey) {
        reviewDayCountsCache = { contextKey, timeZone, dayStartHour, counts: {} };
        const cacheTransaction = database.transaction(STORE.syncMetadata, "readwrite");
        cacheTransaction.objectStore(STORE.syncMetadata).put({ key: "reviewDayCounts", value: reviewDayCountsCache });
        await transactionDone(cacheTransaction);
      }

      const summaries = new Map(summaryRows.map((summary) => [summary.deckId, summary]));
      const result = new Map<string, DeckLibrarySummary>();
      for (const [index, deck] of shell!.decks.entries()) {
        const summary = summaries.get(deck.id) ?? emptyDeckStudySummary(deck.id);
        const introduced = new Set<string>();
        const reviewed = new Set<string>();
        if (catalogIsComplete && !overviewMatches) {
          for (const event of todayEventRows[index] ?? []) {
            if (event.rating === "manual") continue;
            const before = (event.schedulerBefore as any)?.card;
            if (before?.state === "new" || Number(before?.reps ?? 0) === 0) introduced.add(event.cardId);
            else reviewed.add(event.cardId);
          }
          for (const key of introduced) reviewed.delete(key);
        }
        const introducedCount = overviewMatches ? studyOverview!.introducedTodayByDeck[deck.id] ?? 0 : catalogIsComplete ? introduced.size : 0;
        const reviewedCount = overviewMatches ? studyOverview!.reviewedTodayByDeck[deck.id] ?? 0 : catalogIsComplete ? reviewed.size : 0;
        const dueCards = catalogIsComplete ? dueRows[index] ?? 0 : overviewMatches ? studyOverview!.dueByDeck[deck.id] ?? 0 : 0;
        const availableNewCards = catalogIsComplete ? availableNewRows[index] ?? 0 : overviewMatches ? studyOverview!.availableNewByDeck?.[deck.id] ?? 0 : 0;
        const availableLearningCards = catalogIsComplete ? availableLearningRows[index] ?? 0 : overviewMatches ? studyOverview!.availableLearningByDeck?.[deck.id] ?? 0 : 0;
        const settings = createDefaultDeckSettings(deck.deckSettings);
        const newLimit = Math.max(0, settings.newCardsTodayOverride?.date === todayKey ? settings.newCardsTodayOverride.limit : settings.newCardsPerDay);
        const remainingNew = Math.max(0, newLimit - introducedCount);
        const remainingReviews = Math.max(0, settings.maximumReviewsPerDay - introducedCount - reviewedCount);
        const selectedNew = Math.min(availableNewCards, remainingNew, remainingReviews);
        const selectedDue = Math.min(dueCards + availableLearningCards, Math.max(0, remainingReviews - selectedNew));
        const completedTodayCount = introducedCount + reviewedCount;
        result.set(deck.id, {
          inventory: {
            totalCards: Math.max(0, summary.totalCount - summary.suspendedCount),
            dueCards,
            newCards: summary.newCount,
            inProgressCards: summary.learningCount,
            matureCards: summary.matureCount,
            activeVariants: summary.activeVariantCount,
            averageMaturityXp: 0,
          },
          dailyProgress: { completedTodayCount, newCount: selectedNew, inProgressCount: availableLearningCards, dueCount: Math.max(0, selectedDue - availableLearningCards), total: completedTodayCount + selectedNew + selectedDue },
          startableCount: selectedNew + selectedDue,
          additionalNewCount: Math.max(0, availableNewCards - selectedNew),
          effectiveNewLimit: newLimit,
          introducedTodayCount: introducedCount,
          dateKey: todayKey,
        });
      }
      const summaryResult = {
        summaries: result,
        studyHeatmap: createStudyHeatmapModelFromCounts({
          todayKey,
          countsByDay: new Map(Object.entries(reviewDayCountsCache?.counts ?? {})),
          forecastCountsByDay: overviewMatches ? new Map(Object.entries(studyOverview!.forecastByDay)) : new Map(),
        }),
      };
      if (measureFirstRun) markStartupPhaseReady("firstDeckSummaries", { deckCount: result.size });
      return summaryResult;
    },
    /** Catalog page by page number (cursors are remembered per query) plus the opened content with its siblings. */
    async listCardPage(deckId: string, { page = 0, pageSize = CATALOG_PAGE_LIMIT, query = "", sort = { field: "sortField", direction: "asc" } as CardTableSort, selectedCardId = null }: {
      page?: number;
      pageSize?: number;
      query?: string;
      sort?: CardTableSort;
      selectedCardId?: string | null;
    } = {}) {
      const key = JSON.stringify([deckId, query, sort.field, sort.direction]);
      const cursors = pageCursorsByKey.get(key) ?? new Map<number, CatalogCursor | null>([[0, null]]);
      pageCursorsByKey.set(key, cursors);
      let requestedPage = Math.max(0, Math.floor(page));
      while (!cursors.has(requestedPage)) requestedPage -= 1;
      let result = await listCatalogPage(deckId, { cursor: cursors.get(requestedPage) ?? null, limit: pageSize, query, sort, includeTotal: true });
      while (requestedPage < page && result.nextCursor) {
        requestedPage += 1;
        cursors.set(requestedPage, result.nextCursor);
        result = await listCatalogPage(deckId, { cursor: result.nextCursor, limit: pageSize, query, sort, includeTotal: true });
      }
      if (result.nextCursor) cursors.set(requestedPage + 1, result.nextCursor);
      const selectedBody = selectedCardId ? await loadCardBody(selectedCardId) : null;
      const selectedGraph = selectedBody && selectedBody.card.deckId === deckId ? await loadNoteGraph(selectedBody.note.id) : null;
      return {
        items: result.items,
        page: requestedPage,
        pageSize,
        totalCount: result.totalCount ?? result.items.length,
        hasMore: result.hasMore,
        selected: selectedGraph && selectedBody ? { ...selectedGraph, cardId: selectedBody.card.id } : null,
      };
    },
    async loadReviewSession(deckIds: string[], options: {
      now?: string;
      dayStartHour?: number;
      timeZone?: string;
      limit?: number;
      cursorByDeck?: Record<string, { dueAt: string; id: string }>;
      cardIds?: string[];
    } = {}) {
      await writeChain;
      const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 50)));
      const perDeckLimit = limit + 1;
      const transaction = database.transaction([STORE.cardCatalog, STORE.reviewEvents], "readonly");
      const catalogStore = transaction.objectStore(STORE.cardCatalog);
      const dueIndex = catalogStore.index("deckDue");
      const requestedIds = [...new Set(options.cardIds ?? [])];
      const requestedCatalog = requestedIds.length > 0
        ? Promise.all(requestedIds.map((id) => requestResult<StoredCardCatalog | undefined>(catalogStore.get(id))))
        : null;
      const learningDayOptions = { dayStartHour: options.dayStartHour, timeZone: options.timeZone };
      const currentDayKey = getLearningDayKey(options.now ?? new Date(), learningDayOptions);
      const catalogPagePromises = requestedCatalog ? [] : deckIds.map((deckId) => new Promise<StoredCardCatalog[]>((resolve, reject) => {
        const cursor = options.cursorByDeck?.[deckId];
        const lower = cursor ? [deckId, cursor.dueAt, cursor.id] : [deckId, "", ""];
        const range = IDBKeyRange.bound(lower, [deckId, "￿", "￿"], Boolean(cursor), false);
        const rows: StoredCardCatalog[] = [];
        const request = dueIndex.openCursor(range);
        request.onerror = () => reject(request.error ?? new Error("Lernkarten konnten nicht gelesen werden."));
        request.onsuccess = () => {
          const entry = request.result;
          if (!entry || rows.length >= perDeckLimit) { resolve(rows); return; }
          const row = entry.value as StoredCardCatalog;
          const dueKey = getLearningDayKey(row.dueAt ?? Number.NaN, learningDayOptions);
          if (row.reviewable === 1 && !row.deletedAt && dueKey && currentDayKey && dueKey <= currentDayKey && !syncConflictCardIds.has(row.id)) rows.push(row);
          entry.continue();
        };
      }));
      const range = getLearningDayRange(options.now ?? new Date(), learningDayOptions);
      const reviewEventPromises = range
        ? deckIds.map((deckId) => requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("deckAnswered").getAll(IDBKeyRange.bound(
          [deckId, new Date(range.start).toISOString(), ""],
          [deckId, new Date(range.end).toISOString(), ""],
          false,
          true,
        ))))
        : [];
      const [catalogByDeck, reviewEventsByDeck] = await Promise.all([
        requestedCatalog ? requestedCatalog.then((rows) => [rows.filter((row): row is StoredCardCatalog => Boolean(row))]) : Promise.all(catalogPagePromises),
        Promise.all(reviewEventPromises),
      ]);
      await transactionDone(transaction);
      const candidates = requestedCatalog
        ? catalogByDeck.flat().sort((left, right) => requestedIds.indexOf(left.id) - requestedIds.indexOf(right.id))
        : catalogByDeck.flat().sort((left, right) => left.dueSort.localeCompare(right.dueSort) || left.id.localeCompare(right.id));
      const selectedCatalog = candidates.slice(0, limit);
      const bodies = (await Promise.all(selectedCatalog.map((entry) => loadCardBody(entry.id)))).filter((body): body is { card: Card; note: Note } => Boolean(body));
      const cursorByDeck = { ...(options.cursorByDeck ?? {}) };
      for (const { card } of bodies) {
        const catalog = selectedCatalog.find((entry) => entry.id === card.id)!;
        cursorByDeck[card.deckId] = { dueAt: catalog.dueSort, id: card.id };
      }
      return {
        cards: bodies.map(({ card }) => ({ deckId: card.deckId, card })),
        notes: [...new Map(bodies.map(({ note }) => [note.id, note])).values()],
        reviewEvents: reviewEventsByDeck.flat(),
        cursorByDeck,
        hasMore: candidates.length > bodies.length || catalogByDeck.some((rows) => rows.length >= perDeckLimit),
      };
    },
    async queryStatistics(input: StatisticsSelection) {
      await writeChain;
      const { createStatisticsAccumulator } = await import("./statisticsModel.ts");
      return createStatisticsAccumulator(shell!.decks.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck)), input).finish();
    },
    outbox,
    flush: () => writeChain,
    /** Takes over revisions the cloud confirmed; a pending later change of the same row keeps its local state. */
    persistMutationAcknowledgements(persistedRows: Array<{ table: string; row: any; entity?: any }> = []) {
      return enqueueWrite(async () => {
        const relevant = persistedRows.filter(({ table, row }) => row?.id && ["decks", "notes", "cards", "card_variants"].includes(table));
        if (!relevant.length) return;
        const transaction = database.transaction([STORE.decks, STORE.notes, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.syncMetadata], "readwrite");
        const touchedCards = new Set<string>();
        for (const { table, row, entity } of relevant) {
          const storeName = ({ decks: STORE.decks, notes: STORE.notes, cards: STORE.cards, card_variants: STORE.variants } as Record<string, string>)[table];
          const store = transaction.objectStore(storeName);
          const current = await requestResult<any>(store.get(row.id));
          if (!current) continue;
          const pending = pendingEntityMutation(table, row.id);
          if (pending && Boolean((pending.payload as any)?.tombstone) !== Boolean(row.deleted_at)) continue;
          if (table === "cards" && entity) {
            store.put(cardRecord({ ...entity, variants: [] }));
            touchedCards.add(row.id);
            continue;
          }
          store.put({
            ...current,
            revision: Number(row.revision ?? current.revision ?? 1),
            ...(table === "decks" ? {} : { updatedAt: row.updated_at ?? current.updatedAt }),
            deletedAt: row.deleted_at ?? current.deletedAt ?? null,
            updatedByDeviceId: row.updated_by_device_id ?? current.updatedByDeviceId ?? null,
          });
          if (table === "cards") touchedCards.add(row.id);
          if (table === "card_variants") touchedCards.add(current.cardId);
        }
        // Keep local catalog revisions equal to the cloud so resident bodies stay current.
        for (const cardId of touchedCards) {
          const [card] = await readCardBodies(transaction, [cardId]);
          if (!card) continue;
          const note = await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId)) ?? null;
          const before = await requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(cardId)) ?? null;
          const catalog = note ? catalogRecordFor(card, note) : before ? { ...before, bodyRevision: card.revision, studyRevision: card.studyRevision } : null;
          if (!catalog) continue;
          await applyReplicaCatalogChange(transaction, card.deckId, before, catalog);
          transaction.objectStore(STORE.cardCatalog).put(catalog);
          const residency = await requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(cardId));
          if (residency && residency.state !== "catalog-only") transaction.objectStore(STORE.bodyResidency).put({ ...residency, bodyRevision: catalog.bodyRevision, studyRevision: catalog.studyRevision, dependencyRevision: catalog.dependencyRevision });
        }
        await transactionDone(transaction);
        shell = await loadShell(database);
      });
    },
    close: () => database.close(),
  };
}

export type IndexedDbCoreRepository = Awaited<ReturnType<typeof createIndexedDbCoreRepository>>;
