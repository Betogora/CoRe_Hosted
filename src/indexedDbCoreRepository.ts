import { createDefaultDeckSettings, isLearningItemReviewBlocked, normalizeCoreDeck, normalizeLearningItem } from "./coreModel.ts";
import { normalizeContentEntities, normalizeWorkspaceState } from "./coreRepository.ts";
import type { CardVariant, Deck, ImportCommitGraph, ImportVerificationRepairScope, ImportVerificationScope, LearningItem, MaterializedImportCommitGraph, Profile, ReviewEvent, SourceDocument } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { stripHtml } from "./htmlSafety.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import type { CloudCatalogPage, CloudEntityPage } from "./cloudRepository.ts";
import type { ReviewAnswerResult } from "./reviewService.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import { getLearningDayRange } from "./learningDay.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";
import type { StatisticsSelection } from "./statisticsModel.ts";
import { requireCompleteProfile } from "./profileIntegrity.ts";
import { markStartupPhaseReady, markStartupPhaseStarted } from "./appPerformance.ts";
import {
  bodyResidencyForRevision,
  type AccountBaselineState,
  type AccountStatisticsSnapshot,
  type AccountStudyOverview,
  type BodyResidency,
  type CardBodyResidencyRecord,
  type CardCatalogEntry,
  type DeckStudySummary,
  type OfflineCardManifestEntry,
  type OfflineDeckRecord,
  type OfflineMediaManifestEntry,
  type ReplicaStatus,
} from "./workspaceReplica.ts";
const DATABASE_VERSION = 1;
const STORE = Object.freeze({
  meta: "meta",
  decks: "decks",
  cards: "cards",
  variants: "variants",
  reviewEvents: "reviewEvents",
  documents: "documents",
  noteTypeDefinitions: "noteTypeDefinitions",
  sourceSnapshots: "sourceSnapshots",
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

interface StoredCard extends Omit<LearningItem, "variants"> { deckId: string; variants?: never; }

interface StoredCardCatalog extends Omit<CardCatalogEntry, "reviewable" | "hasActiveVariants"> {
  reviewable: 0 | 1;
  hasActiveVariants: 0 | 1;
  dueSort: string;
}

type StoredVariant = CardVariant & { deckId: string; activeForSummary: 0 | 1 };

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
  cloudTombstones: WorkspaceState["cloudTombstones"];
  updatedAt: string;
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

function createStore(database: IDBDatabase, name: string, options: IDBObjectStoreParameters = { keyPath: "id" }) {
  return database.objectStoreNames.contains(name) ? null : database.createObjectStore(name, options);
}

function openDatabase(indexedDb: IDBFactory, userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(`core.workspace.entities.v2.${userId}`, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      createStore(database, STORE.meta, { keyPath: "key" });
      const decks = createStore(database, STORE.decks);
      decks?.createIndex("parentDeckId", "parentDeckId", { unique: false });
      const cards = createStore(database, STORE.cards)!;
      cards.createIndex("deckId", "deckId", { unique: false });
      cards.createIndex("deckScan", ["deckId", "id"], { unique: true });
      const variants = createStore(database, STORE.variants);
      variants?.createIndex("learningItemId", "learningItemId", { unique: false });
      variants?.createIndex("deckId", "deckId", { unique: false });
      variants?.createIndex("studyDeckId", "studyDeckId", { unique: false });
      variants?.createIndex("deckActive", ["deckId", "activeForSummary", "id"], { unique: false });
      const events = createStore(database, STORE.reviewEvents);
      events?.createIndex("deckId", "deckId", { unique: false });
      events?.createIndex("reviewableAnswered", ["reviewableId", "answeredAt", "id"], { unique: false });
      events?.createIndex("answeredAt", ["answeredAt", "id"], { unique: false });
      events?.createIndex("deckAnswered", ["deckId", "answeredAt", "id"], { unique: false });
      createStore(database, STORE.documents);
      createStore(database, STORE.noteTypeDefinitions);
      createStore(database, STORE.sourceSnapshots);
      const outbox = createStore(database, STORE.outbox);
      outbox?.createIndex("createdAt", ["createdAt", "id"], { unique: false });
      createStore(database, STORE.syncMetadata, { keyPath: "key" });
      const catalog = createStore(database, STORE.cardCatalog);
      catalog?.createIndex("deckScan", ["deckId", "id"], { unique: true });
      catalog?.createIndex("deckSort", ["deckId", "sortText", "id"], { unique: true });
      catalog?.createIndex("deckDue", ["deckId", "dueSort", "id"], { unique: true });
      catalog?.createIndex("deckReviewDue", ["deckId", "reviewable", "scheduleState", "dueSort", "id"], { unique: true });
      catalog?.createIndex("deckVariants", ["deckId", "hasActiveVariants", "id"], { unique: true });
      const residency = createStore(database, STORE.bodyResidency);
      residency?.createIndex("deckAccess", ["deckId", "lastAccessedAt", "id"], { unique: true });
      residency?.createIndex("stateAccess", ["state", "lastAccessedAt", "id"], { unique: true });
      createStore(database, STORE.offlineDecks);
      const offlineManifests = createStore(database, STORE.offlineManifests);
      offlineManifests?.createIndex("deckId", "deckId", { unique: false });
      createStore(database, STORE.statisticsSnapshots);
      createStore(database, STORE.deckStudySummaries, { keyPath: "deckId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Lokale Account-Datenbank konnte nicht geöffnet werden."));
  });
}

function dueAtOf(card: LearningItem): string {
  return String(card.learningItemState?.dueAt ?? card.reviewState?.dueAt ?? "9999-12-31T23:59:59.999Z");
}

function searchTextOf(card: LearningItem): string {
  return stripHtml([
    card.title,
    card.originalFront,
    card.originalBack,
    card.canonicalQuestion,
    card.canonicalAnswer,
    ...(card.contentDocument?.fields ?? []).map((field) => field.value),
    ...(card.tags ?? []),
  ].filter(Boolean).join(" ")).toLocaleLowerCase("de");
}

function cardRecord(card: LearningItem, deckId: string): StoredCard {
  const { variants: _variants, ...record } = card;
  return { ...record, deckId };
}

function serializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "undefined" ? serialized.length : new TextEncoder().encode(serialized).byteLength;
}

function catalogRecordFromCard(card: LearningItem, deckId: string, definitionRevision = 1): StoredCardCatalog {
  const activeVariants = card.variants
    .filter((variant) => variant.deletedAt == null && variant.isActive !== false && variant.qualityStatus === "active")
    .sort((left, right) => Number(left.isOriginal) - Number(right.isOriginal)
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.id.localeCompare(right.id));
  const activeVariant = activeVariants[0];
  const activeVariantCount = activeVariants.filter((variant) => !variant.isOriginal).length;
  const bodyRevision = Math.max(1, Number(card.contentRevision ?? 1), Number(card.revision ?? 1));
  const dependencyRevision = Math.max(1, Number(activeVariant?.renderRevision ?? 1), Number(definitionRevision));
  return {
    id: card.id,
    deckId,
    frontPreview: stripHtml(card.originalFront || card.canonicalQuestion || card.title).slice(0, 240),
    normalizedSearchText: searchTextOf(card).slice(0, 2_000),
    sortText: stripHtml(card.originalFront || card.canonicalQuestion || card.title).toLocaleLowerCase("de").slice(0, 512),
    dueAt: dueAtOf(card) === "9999-12-31T23:59:59.999Z" ? null : dueAtOf(card),
    dueSort: dueAtOf(card),
    scheduleState: (card.learningItemState ?? card.reviewState)?.state ?? "new",
    maturityBand: (card.learningItemState ?? card.reviewState)?.maturityBand ?? "new",
    reviewable: card.status !== "deleted" && card.draftStatus !== "draft" && !isLearningItemReviewBlocked(card) ? 1 : 0,
    hasActiveVariants: activeVariantCount > 0 ? 1 : 0,
    activeVariantCount,
    activeVariantId: activeVariant && !activeVariant.isOriginal ? activeVariant.id : null,
    bodyRevision,
    dependencyRevision,
    syncChangeId: 0,
    deletedAt: card.deletedAt ?? null,
    updatedAt: card.updatedAt,
  };
}

function storedCatalogRecord(entry: CardCatalogEntry): StoredCardCatalog {
  return {
    ...entry,
    normalizedSearchText: entry.normalizedSearchText.slice(0, 2_000),
    sortText: entry.sortText.slice(0, 512),
    dueSort: entry.dueAt ?? "9999-12-31T23:59:59.999Z",
    reviewable: entry.reviewable ? 1 : 0,
    hasActiveVariants: entry.hasActiveVariants ? 1 : 0,
  };
}

function catalogEntry(record: StoredCardCatalog): CardCatalogEntry {
  const { dueSort: _dueSort, ...entry } = record;
  return {
    ...entry,
    reviewable: record.reviewable === 1,
    hasActiveVariants: record.hasActiveVariants === 1,
  };
}

function emptyDeckStudySummary(deckId: string): DeckStudySummary {
  return {
    deckId,
    totalCount: 0,
    newCount: 0,
    learningCount: 0,
    matureCount: 0,
    suspendedCount: 0,
    activeVariantCount: 0,
    updatedAt: null,
  };
}

function deckStudySummaryFromDeck(deck: Deck): DeckStudySummary {
  const summary = emptyDeckStudySummary(deck.id);
  for (const card of deck.cards) {
    const catalog = catalogRecordFromCard(card, deck.id);
    if (catalog.deletedAt) continue;
    summary.totalCount += 1;
    if (catalog.reviewable !== 1) summary.suspendedCount += 1;
    if (catalog.reviewable === 1 && catalog.scheduleState === "new") summary.newCount += 1;
    if (catalog.reviewable === 1 && ["learning", "relearning"].includes(catalog.scheduleState)) summary.learningCount += 1;
    if (catalog.reviewable === 1 && ["mature", "variant_ready", "mastered"].includes(catalog.maturityBand)) summary.matureCount += 1;
    summary.activeVariantCount += catalog.activeVariantCount;
  }
  summary.updatedAt = deck.updatedAt;
  return summary;
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
  if (!card || card.deletedAt || card.reviewable !== 1 || card.scheduleState === "new" || !card.dueAt) return null;
  const context = studyOverviewContext(overview);
  if (!context || getStudyHeatmapDayKey(referenceAt, context.timeZone, context.dayStartHour) !== overview.dayKey) return null;
  const range = getLearningDayRange(referenceAt, context);
  if (!range) return null;
  const dueAt = Date.parse(card.dueAt);
  if (!Number.isFinite(dueAt)) return null;
  if (dueAt < range.end) return { kind: "due" as const, key: card.deckId };
  if (dueAt >= range.end + 365 * 24 * 60 * 60 * 1000) return null;
  const dayKey = getStudyHeatmapDayKey(card.dueAt, context.timeZone, context.dayStartHour);
  return dayKey ? { kind: "forecast" as const, key: dayKey } : null;
}

async function applyCatalogSummaryChange(
  transaction: IDBTransaction,
  deckId: string,
  before: StoredCardCatalog | null,
  after: StoredCardCatalog | null,
) {
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
  catalog: Pick<StoredCardCatalog, "id" | "deckId" | "bodyRevision" | "dependencyRevision">,
  state: BodyResidency,
  now = new Date().toISOString(),
): CardBodyResidencyRecord {
  return {
    id: catalog.id,
    deckId: catalog.deckId,
    state,
    bodyRevision: catalog.bodyRevision,
    dependencyRevision: catalog.dependencyRevision,
    lastAccessedAt: now,
    protectedUntil: null,
  };
}

function deckRecord(deck: Deck) {
  const { cards: _cards, reviewEvents: _reviewEvents, ...record } = deck;
  return record;
}

function shellFromState(state: WorkspaceState): WorkspaceShell {
  return {
    version: state.version,
    profile: state.profile,
    decks: state.decks.map((deck) => deckRecord(deck) as WorkspaceDeckSummary),
    cloudTombstones: state.cloudTombstones,
    updatedAt: state.updatedAt,
  };
}

function variantRecord(variant: CardVariant, deckId: string): StoredVariant {
  return { ...variant, deckId, activeForSummary: !variant.isOriginal && variant.isActive !== false && variant.qualityStatus === "active" ? 1 : 0 };
}

function reviewHourKey(value: unknown) {
  const timestamp = new Date(String(value ?? ""));
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString().slice(0, 13);
}

function hydrateCard(record: StoredCard, variantsByCardId: Map<string, StoredVariant[]>, conflictCardIds: ReadonlySet<string> = new Set()): LearningItem {
  const variants = (variantsByCardId.get(record.id) ?? []).map(({ deckId: _deckId, activeForSummary: _active, ...variant }) => variant);
  return { ...record, variants, syncConflict: conflictCardIds.has(record.id) } as LearningItem;
}

function ids(items: Array<{ id: string }> = []): Set<string> {
  return new Set(items.map((item) => item.id));
}

function changedEntity(previous: any, next: any): boolean {
  return previous !== next
    && (previous?.revision !== next?.revision || previous?.updatedAt !== next?.updatedAt || previous?.deletedAt !== next?.deletedAt);
}

function mutationId() {
  return `mutation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function reviewHourCountsFromState(state: WorkspaceState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of state.decks.flatMap((deck) => deck.reviewEvents)) {
    const key = reviewHourKey(event.answeredAt ?? event.createdAt);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function loadShell(database: IDBDatabase): Promise<WorkspaceShell | null> {
  const transaction = database.transaction([
    STORE.meta,
    STORE.decks,
    STORE.syncMetadata,
  ], "readonly");
  const [metaRows, deckRows, syncRows] = await Promise.all([
    requestResult<any[]>(transaction.objectStore(STORE.meta).getAll()),
    requestResult<any[]>(transaction.objectStore(STORE.decks).getAll()),
    requestResult<any[]>(transaction.objectStore(STORE.syncMetadata).getAll()),
  ]);
  await transactionDone(transaction);
  if (!metaRows.some((row) => row.key === "initialized")) return null;

  const meta = new Map(metaRows.map((row) => [row.key, row.value]));
  const syncMeta = new Map(syncRows.map((row) => [row.key, row.value]));
  return {
    version: 4,
    profile: meta.get("profile"),
    updatedAt: meta.get("updatedAt"),
    decks: deckRows as WorkspaceDeckSummary[],
    cloudTombstones: syncMeta.get("cloudTombstones") ?? [],
  } as WorkspaceShell;
}

async function materializeState(database: IDBDatabase, shell: WorkspaceShell): Promise<WorkspaceState> {
  const transaction = database.transaction([STORE.cards, STORE.variants, STORE.reviewEvents, STORE.documents, STORE.noteTypeDefinitions, STORE.sourceSnapshots], "readonly");
  const [cardRows, variantRows, eventRows, documents, noteTypeDefinitions, learningItemSourceSnapshots] = await Promise.all([
    requestResult<StoredCard[]>(transaction.objectStore(STORE.cards).getAll()),
    requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).getAll()),
    requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).getAll()),
    requestResult<WorkspaceState["documents"]>(transaction.objectStore(STORE.documents).getAll()),
    requestResult<WorkspaceState["noteTypeDefinitions"]>(transaction.objectStore(STORE.noteTypeDefinitions).getAll()),
    requestResult<WorkspaceState["learningItemSourceSnapshots"]>(transaction.objectStore(STORE.sourceSnapshots).getAll()),
  ]);
  await transactionDone(transaction);

  const variantsByCardId = new Map<string, StoredVariant[]>();
  for (const variant of variantRows) {
    const cardId = String(variant.learningItemId ?? variant.cardId ?? "");
    const bucket = variantsByCardId.get(cardId);
    if (bucket) bucket.push(variant);
    else variantsByCardId.set(cardId, [variant]);
  }
  const cardsByDeckId = new Map<string, LearningItem[]>();
  for (const record of cardRows) {
    const card = hydrateCard(record, variantsByCardId);
    const bucket = cardsByDeckId.get(record.deckId);
    if (bucket) bucket.push(card);
    else cardsByDeckId.set(record.deckId, [card]);
  }
  const eventsByDeckId = new Map<string, ReviewEvent[]>();
  for (const event of eventRows) {
    const bucket = eventsByDeckId.get(event.deckId);
    if (bucket) bucket.push(event);
    else eventsByDeckId.set(event.deckId, [event]);
  }
  return normalizeWorkspaceState({
    ...shell,
    documents,
    noteTypeDefinitions,
    learningItemSourceSnapshots,
    decks: shell.decks.map((deck) => ({
      ...deck,
      cards: cardsByDeckId.get(deck.id) ?? [],
      reviewEvents: eventsByDeckId.get(deck.id) ?? [],
    })),
  }) as WorkspaceState;
}

async function loadDeck(database: IDBDatabase, summary: WorkspaceDeckSummary): Promise<Deck> {
  const transaction = database.transaction([STORE.cards, STORE.variants, STORE.reviewEvents], "readonly");
  const [cardRows, variantRows, reviewEvents] = await Promise.all([
    requestResult<StoredCard[]>(transaction.objectStore(STORE.cards).index("deckId").getAll(summary.id)),
    requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("deckId").getAll(summary.id)),
    requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("deckId").getAll(summary.id)),
  ]);
  await transactionDone(transaction);
  const variantsByCardId = new Map<string, StoredVariant[]>();
  for (const variant of variantRows) {
    const cardId = String(variant.learningItemId ?? variant.cardId ?? "");
    const bucket = variantsByCardId.get(cardId);
    if (bucket) bucket.push(variant);
    else variantsByCardId.set(cardId, [variant]);
  }
  return normalizeCoreDeck({
    ...summary,
    cards: cardRows.map((record) => hydrateCard(record, variantsByCardId)),
    reviewEvents,
  });
}

function writeState(database: IDBDatabase, state: WorkspaceState): Promise<void> {
  const storeNames = [STORE.meta, STORE.decks, STORE.cards, STORE.variants, STORE.reviewEvents, STORE.documents, STORE.noteTypeDefinitions, STORE.sourceSnapshots, STORE.syncMetadata, STORE.deckStudySummaries, STORE.cardCatalog, STORE.bodyResidency, STORE.offlineDecks, STORE.offlineManifests, STORE.statisticsSnapshots];
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames.filter((name) => name !== STORE.syncMetadata)) transaction.objectStore(storeName).clear();
  const meta = transaction.objectStore(STORE.meta);
  meta.put({ key: "initialized", value: true });
  meta.put({ key: "profile", value: state.profile });
  meta.put({ key: "updatedAt", value: state.updatedAt });
  for (const deck of state.decks) {
    transaction.objectStore(STORE.decks).put(deckRecord(deck));
    transaction.objectStore(STORE.deckStudySummaries).put(deckStudySummaryFromDeck(deck));
    for (const card of deck.cards) {
      transaction.objectStore(STORE.cards).put(cardRecord(card, deck.id));
      const catalog = catalogRecordFromCard(card, deck.id);
      transaction.objectStore(STORE.cardCatalog).put(catalog);
      transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
      for (const variant of card.variants) transaction.objectStore(STORE.variants).put(variantRecord(variant, deck.id));
    }
    for (const event of deck.reviewEvents) transaction.objectStore(STORE.reviewEvents).put(event);
  }
  for (const document of state.documents) transaction.objectStore(STORE.documents).put(document);
  for (const definition of state.noteTypeDefinitions) transaction.objectStore(STORE.noteTypeDefinitions).put(definition);
  for (const snapshot of state.learningItemSourceSnapshots) transaction.objectStore(STORE.sourceSnapshots).put(snapshot);
  transaction.objectStore(STORE.syncMetadata).put({ key: "cloudTombstones", value: state.cloudTombstones });
  transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: reviewHourCountsFromState(state) });
  transaction.objectStore(STORE.syncMetadata).delete("reviewDayCounts");
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
  let initializedDecks: Deck[] = [];
  let writeChain = Promise.resolve();
  const enqueueWrite = (write: () => Promise<void>) => {
    writeChain = writeChain.catch(() => undefined).then(write);
    return writeChain;
  };

  if (!shell) {
    const initializedState = normalizeWorkspaceState(initialState) as WorkspaceState;
    initializedDecks = initializedState.decks;
    await writeState(database, initializedState);
    shell = shellFromState(initializedState);
  }

  const hydratedDecks = new Map<string, Deck>(initializedDecks.map((deck) => [deck.id, deck]));
  const hydrateDeck = async (deckId: string) => {
    await writeChain;
    const existing = hydratedDecks.get(deckId);
    if (existing) return existing;
    const summary = shell!.decks.find((deck) => deck.id === deckId);
    if (!summary) return null;
    const deck = await loadDeck(database, summary);
    hydratedDecks.set(deck.id, deck);
    return deck;
  };

  markStartupPhaseStarted("indexedDbStartupMetadata");
  const startupTransaction = database.transaction([STORE.outbox, STORE.syncMetadata], "readonly");
  const startupSyncMetadata = startupTransaction.objectStore(STORE.syncMetadata);
  const [
    outboxRows,
    reviewHourCountRow,
    reviewDayCountRow,
    syncConflictCardIdRow,
    replicaStatusRow,
    studyOverviewRow,
  ] = await Promise.all([
    requestResult<SyncOutboxMutation[]>(startupTransaction.objectStore(STORE.outbox).getAll()),
    requestResult<any>(startupSyncMetadata.get("reviewHourCounts")),
    requestResult<{ value?: StoredReviewDayCounts } | undefined>(startupSyncMetadata.get("reviewDayCounts")),
    requestResult<any>(startupSyncMetadata.get("syncConflictCardIds")),
    requestResult<{ value?: ReplicaStatus } | undefined>(startupSyncMetadata.get("replicaStatus")),
    requestResult<{ value?: AccountStudyOverview } | undefined>(startupSyncMetadata.get("accountStudyOverview")),
  ]);
  await transactionDone(startupTransaction);
  markStartupPhaseReady("indexedDbStartupMetadata", {
    outboxCount: outboxRows.filter((mutation) => !mutation.flushedAt).length,
  });
  const pendingOutbox = new Map<string, SyncOutboxMutation>(outboxRows.map((mutation) => [mutation.id, mutation]));
  const mutationTargetKey = (mutation: Pick<SyncOutboxMutation, "type" | "table" | "entityId">) => (
    mutation.type === "profile-patch" ? "profile" : `${mutation.type}:${mutation.table}:${mutation.entityId}`
  );
  const pendingByTarget = new Map<string, SyncOutboxMutation>();
  for (const mutation of pendingOutbox.values()) {
    if (!mutation.flushedAt) pendingByTarget.set(mutationTargetKey(mutation), mutation);
  }
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
  const definitionCache = new Map<string, any>();
  const catalogRecordForLocalCard = (card: LearningItem, deckId: string) => catalogRecordFromCard(
    card,
    deckId,
    Number(definitionCache.get(card.noteTypeDefinitionId)?.revision ?? 1),
  );
  const pendingEntityMutation = (table: string, entityId: string) => pendingByTarget.get(mutationTargetKey({
    type: "entity-mutation",
    table,
    entityId,
  })) ?? [...pendingByTarget.values()].find((mutation) => {
    if (mutation.type !== "review-atomic") return false;
    const payload = mutation.payload as any;
    return (table === "decks" && payload?.deck?.id === entityId)
      || (table === "cards" && payload?.card?.id === entityId)
      || (table === "card_variants" && payload?.variant?.id === entityId)
      || (table === "review_events" && payload?.event?.id === entityId);
  });
  const pendingEntityIdsForTable = (table: string) => [...pendingByTarget.values()]
    .flatMap((mutation) => {
      if (mutation.type === "entity-mutation" && mutation.table === table && mutation.entityId) return [mutation.entityId];
      if (mutation.type !== "review-atomic") return [];
      const payload = mutation.payload as any;
      const id = table === "decks" ? payload?.deck?.id
        : table === "cards" ? payload?.card?.id
        : table === "card_variants" ? payload?.variant?.id
        : table === "review_events" ? payload?.event?.id
        : null;
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
    const dueByDeck = { ...studyOverview.dueByDeck };
    const forecastByDay = { ...studyOverview.forecastByDay };
    if (previousBucket) adjustOverviewCount(previousBucket.kind === "due" ? dueByDeck : forecastByDay, previousBucket.key, -1);
    if (nextBucket) adjustOverviewCount(nextBucket.kind === "due" ? dueByDeck : forecastByDay, nextBucket.key, 1);
    studyOverview = { ...studyOverview, dueByDeck, forecastByDay, generatedAt: referenceAt };
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
      const mutation: SyncOutboxMutation = {
        id: mutationId(),
        userId,
        deviceId: null,
        type: input.type,
        table: input.table ?? null,
        entityId: input.entityId ?? null,
        baseRevision: input.baseRevision ?? null,
        payload: input.payload ?? {},
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

  const persistDecks = (
    previousDecks: Deck[],
    nextDecks: Deck[],
    previousDefinitions: any[] = [],
    nextDefinitions: any[] = [],
    previousSnapshots: any[] = [],
    nextSnapshots: any[] = [],
    mutationBatch: { queued: SyncOutboxMutation[]; removedIds: string[] } = { queued: [], removedIds: [] },
  ) => enqueueWrite(async () => {
    const nextIds = ids(nextDecks);
    const operations: Array<{ store: string; type: "put" | "delete"; value: any }> = [];
    const put = (store: string, value: any) => operations.push({ store, type: "put", value });
    const remove = (store: string, value: any) => operations.push({ store, type: "delete", value });
    const previousById = new Map(previousDecks.map((deck) => [deck.id, deck]));
    for (const removedDeck of previousDecks.filter((deck) => !nextIds.has(deck.id))) {
      remove(STORE.decks, removedDeck.id);
      remove(STORE.deckStudySummaries, removedDeck.id);
      for (const card of removedDeck.cards) {
        remove(STORE.cards, card.id);
        remove(STORE.cardCatalog, card.id);
        remove(STORE.bodyResidency, card.id);
        for (const variant of card.variants) remove(STORE.variants, variant.id);
      }
      for (const event of removedDeck.reviewEvents) remove(STORE.reviewEvents, event.id);
    }
    for (const deck of nextDecks) {
      put(STORE.deckStudySummaries, deckStudySummaryFromDeck(deck));
      const previous = previousById.get(deck.id);
      if (!previous || changedEntity(previous, deck) || previous.cards !== deck.cards || previous.reviewEvents !== deck.reviewEvents) {
        put(STORE.decks, deckRecord(deck));
      }
      const previousCards = new Map((previous?.cards ?? []).map((card) => [card.id, card]));
      const nextCardIds = ids(deck.cards);
      for (const removed of (previous?.cards ?? []).filter((card) => !nextCardIds.has(card.id))) {
        remove(STORE.cards, removed.id);
        remove(STORE.cardCatalog, removed.id);
        remove(STORE.bodyResidency, removed.id);
        for (const variant of removed.variants) remove(STORE.variants, variant.id);
      }
      for (const card of deck.cards) {
        const previousCard = previousCards.get(card.id);
        if (!previousCard || changedEntity(previousCard, card)) {
          const catalog = catalogRecordForLocalCard(card, deck.id);
          put(STORE.cards, cardRecord(card, deck.id));
          put(STORE.cardCatalog, catalog);
          put(STORE.bodyResidency, residencyRecord(catalog, "cached"));
        }
        const previousVariants = new Map((previousCard?.variants ?? []).map((variant) => [variant.id, variant]));
        const nextVariantIds = ids(card.variants);
        for (const removed of (previousCard?.variants ?? []).filter((variant) => !nextVariantIds.has(variant.id))) remove(STORE.variants, removed.id);
        for (const variant of card.variants) if (!previousVariants.has(variant.id) || changedEntity(previousVariants.get(variant.id), variant)) put(STORE.variants, variantRecord(variant, deck.id));
      }
      const previousEvents = new Set((previous?.reviewEvents ?? []).map((event) => event.id));
      for (const event of deck.reviewEvents) if (!previousEvents.has(event.id)) put(STORE.reviewEvents, event);
      for (const document of deck.sourceDocuments ?? []) put(STORE.documents, document);
    }
    const previousDefinitionsById = new Map(previousDefinitions.map((definition) => [definition.id, definition]));
    for (const definition of nextDefinitions) {
      if (!previousDefinitionsById.has(definition.id) || changedEntity(previousDefinitionsById.get(definition.id), definition)) {
        put(STORE.noteTypeDefinitions, definition);
      }
    }
    const previousSnapshotIds = ids(previousSnapshots);
    for (const snapshot of nextSnapshots) {
      if (!previousSnapshotIds.has(snapshot.id)) put(STORE.sourceSnapshots, snapshot);
    }
    for (const id of mutationBatch.removedIds) remove(STORE.outbox, id);
    for (const mutation of mutationBatch.queued) put(STORE.outbox, mutation);
    put(STORE.meta, { key: "updatedAt", value: shell!.updatedAt });
    for (let offset = 0; offset < operations.length; offset += LOCAL_WRITE_CHUNK_SIZE) {
      const chunk = operations.slice(offset, offset + LOCAL_WRITE_CHUNK_SIZE);
      const transaction = database.transaction([...new Set(chunk.map((operation) => operation.store))], "readwrite");
      for (const operation of chunk) transaction.objectStore(operation.store)[operation.type](operation.value);
      await transactionDone(transaction);
    }
  });

  const findMissing = async <T extends { id: string }>(storeName: string, items: T[]) => {
    const missing: T[] = [];
    for (let offset = 0; offset < items.length; offset += LOCAL_WRITE_CHUNK_SIZE) {
      const chunk = items.slice(offset, offset + LOCAL_WRITE_CHUNK_SIZE);
      const transaction = database.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const existing = await Promise.all(chunk.map((item) => requestResult(store.getKey(item.id))));
      await transactionDone(transaction);
      chunk.forEach((item, index) => { if (existing[index] == null) missing.push(item); });
    }
    return missing;
  };
  const saveContentGraph = async (decks: Deck[] = [], definitions: unknown[] = [], snapshots: unknown[] = []) => {
    await writeChain;
    const normalizedDecks = decks.filter(Boolean).map((deck) => normalizeCoreDeck(deck));
    if (!normalizedDecks.length) return [];
    const content = normalizeContentEntities(
      normalizedDecks,
      [...definitionCache.values(), ...definitions],
      snapshots,
    );
    const normalized = content.decks as Deck[];
    const previousDecks = normalized.flatMap((deck) => {
      const previous = hydratedDecks.get(deck.id);
      if (!previous && shell!.decks.some((candidate) => candidate.id === deck.id)) {
        throw new Error("Der Stapel muss vor einer Änderung geladen werden.");
      }
      return previous ? [previous] : [];
    });
    const [newDefinitions, newSnapshots] = await Promise.all([
      findMissing(STORE.noteTypeDefinitions, content.definitions),
      findMissing(STORE.sourceSnapshots, content.snapshots),
    ]);
    const updatedAt = new Date().toISOString();
    const replacements = new Map(normalized.map((deck) => [deck.id, deckRecord(deck) as WorkspaceDeckSummary]));
    shell = {
      ...shell!,
      decks: [...replacements.values(), ...shell!.decks.filter((deck) => !replacements.has(deck.id))],
      updatedAt,
    };
    for (const deck of normalized) hydratedDecks.set(deck.id, deck);
    for (const definition of content.definitions) definitionCache.set(definition.id, definition);
    const mutations = queueMutations(planEntityMutations({
      decks: previousDecks,
      documents: previousDecks.flatMap((deck) => deck.sourceDocuments ?? []),
      tombstones: shell!.cloudTombstones,
    }, {
      decks: normalized,
      documents: normalized.flatMap((deck) => deck.sourceDocuments ?? []),
      noteTypeDefinitions: newDefinitions,
      sourceSnapshots: newSnapshots,
    }));
    await persistDecks(
      previousDecks,
      normalized,
      [],
      newDefinitions,
      [],
      newSnapshots,
      mutations,
    );
    return normalized;
  };
  const shellState = () => ({
    version: 4,
    profile: shell!.profile,
    decks: shell!.decks.map((deck) => ({ ...deck, cards: [], reviewEvents: [] })),
    documents: [],
    noteTypeDefinitions: [],
    learningItemSourceSnapshots: [],
    cloudTombstones: shell!.cloudTombstones,
    updatedAt: shell!.updatedAt,
  } as WorkspaceState);
  const saveDeckMetadata = (decks: Deck[]) => {
    const previous = new Map(shell!.decks.map((deck) => [deck.id, deck]));
    const next = decks.map((deck) => deckRecord(deck) as WorkspaceDeckSummary);
    const updatedAt = new Date().toISOString();
    const replacementIds = new Set(next.map((deck) => deck.id));
    const mutationBatch = queueMutations(planEntityMutations(
      { decks: next.flatMap((deck) => {
        const item = previous.get(deck.id);
        return item ? [{ ...item, cards: [], reviewEvents: [] } as Deck] : [];
      }), tombstones: shell!.cloudTombstones },
      { decks: next.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck)) },
    ));
    shell = { ...shell!, decks: [...next, ...shell!.decks.filter((deck) => !replacementIds.has(deck.id))], updatedAt };
    void enqueueWrite(async () => {
      const transaction = database.transaction([STORE.decks, STORE.outbox, STORE.meta], "readwrite");
      for (const deck of next) transaction.objectStore(STORE.decks).put(deck);
      for (const id of mutationBatch.removedIds) transaction.objectStore(STORE.outbox).delete(id);
      for (const mutation of mutationBatch.queued) transaction.objectStore(STORE.outbox).put(mutation);
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      await transactionDone(transaction);
    });
    return next.map((deck) => ({ ...deck, cards: hydratedDecks.get(deck.id)?.cards ?? [], reviewEvents: hydratedDecks.get(deck.id)?.reviewEvents ?? [] } as Deck));
  };

  const writeCard = async (
    deckId: string,
    cardId: string,
    updater: (card: LearningItem | null) => LearningItem | null,
    documents: SourceDocument[] = [],
  ) => {
    if (!shell!.decks.some((deck) => deck.id === deckId)) return null;
    const transaction = database.transaction([STORE.cards, STORE.variants], "readonly");
    const stored = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(cardId));
    const storedVariants = stored
      ? await requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("learningItemId").getAll(cardId))
      : [];
    await transactionDone(transaction);
    if (stored && stored.deckId !== deckId) return null;
    const summary = shell!.decks.find((deck) => deck.id === deckId);
    if (!summary) return null;
    const previousCard = stored ? hydrateCard(stored, new Map([[cardId, storedVariants]])) : null;
    const candidate = updater(previousCard);
    if (!candidate || candidate.id !== cardId) return null;
    const updatedAt = candidate.updatedAt || new Date().toISOString();
    const wasActive = Boolean(previousCard && previousCard.status !== "deleted");
    const isActive = candidate.status !== "deleted";
    const nextSummary = {
      ...summary,
      cardCount: Math.max(0, Number(summary.cardCount ?? 0) + Number(isActive) - Number(wasActive)),
      updatedAt,
    } as WorkspaceDeckSummary;
    if (!isActive) {
      const previousDeck = { ...summary, cards: previousCard ? [previousCard] : [], reviewEvents: [], sourceDocuments: [] } as Deck;
      const nextDeck = { ...nextSummary, cards: [], reviewEvents: [], sourceDocuments: [] } as Deck;
      const mutationBatch = queueMutations(planEntityMutations(
        { decks: [previousDeck], tombstones: shell!.cloudTombstones },
        { decks: [nextDeck] },
      ));
      const tombstones = mutationBatch.queued.flatMap((mutation) => mutation.table === "cards" && mutation.entityId === cardId && (mutation.payload as any)?.tombstone
        ? [{ entityTable: "cards", entityId: cardId, revision: mutation.baseRevision ?? previousCard?.revision ?? 1, deletedAt: updatedAt, updatedByDeviceId: null }]
        : []);
      shell = {
        ...shell!,
        decks: shell!.decks.map((deck) => deck.id === deckId ? nextSummary : deck),
        cloudTombstones: [...shell!.cloudTombstones.filter((row) => row.entityTable !== "cards" || row.entityId !== cardId), ...tombstones],
        updatedAt,
      };
      const cached = hydratedDecks.get(deckId);
      if (cached) hydratedDecks.set(deckId, { ...cached, ...nextSummary, cards: cached.cards.filter((card) => card.id !== cardId) });
      const write = database.transaction([STORE.decks, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
      await applyReplicaCatalogChange(write, deckId, previousCard ? catalogRecordForLocalCard(previousCard, deckId) : null, null, updatedAt);
      write.objectStore(STORE.decks).put(nextSummary);
      write.objectStore(STORE.cards).delete(cardId);
      write.objectStore(STORE.cardCatalog).delete(cardId);
      write.objectStore(STORE.bodyResidency).delete(cardId);
      for (const variant of storedVariants) write.objectStore(STORE.variants).delete(variant.id);
      for (const id of mutationBatch.removedIds) write.objectStore(STORE.outbox).delete(id);
      for (const mutation of mutationBatch.queued) write.objectStore(STORE.outbox).put(mutation);
      write.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      write.objectStore(STORE.syncMetadata).put({ key: "cloudTombstones", value: shell!.cloudTombstones });
      await transactionDone(write);
      return candidate;
    }
    const content = normalizeContentEntities(
      [{ ...nextSummary, cards: [candidate], reviewEvents: [], sourceDocuments: documents }],
      [...definitionCache.values()],
      [],
    );
    const nextCard = content.decks[0].cards[0] as LearningItem;
    const newDefinitions = await findMissing(STORE.noteTypeDefinitions, content.definitions);
    const previousDeck = { ...summary, cards: previousCard ? [previousCard] : [], reviewEvents: [], sourceDocuments: [] } as Deck;
    const nextDeck = { ...nextSummary, cards: [nextCard], reviewEvents: [], sourceDocuments: documents } as Deck;
    const mutationBatch = queueMutations(planEntityMutations(
      { decks: [previousDeck], tombstones: shell!.cloudTombstones },
      { decks: [nextDeck], documents, noteTypeDefinitions: newDefinitions },
    ));
    shell = { ...shell!, decks: shell!.decks.map((deck) => deck.id === deckId ? nextSummary : deck), updatedAt };
    const cached = hydratedDecks.get(deckId);
    if (cached) {
      const cards = previousCard
        ? cached.cards.map((card) => card.id === cardId ? nextCard : card)
        : [...cached.cards, nextCard];
      hydratedDecks.set(deckId, { ...cached, ...nextSummary, cards });
    }
    for (const definition of content.definitions) definitionCache.set(definition.id, definition);
    await (async () => {
      const stores = [STORE.decks, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.documents, STORE.noteTypeDefinitions, STORE.outbox, STORE.meta, STORE.syncMetadata];
      const write = database.transaction(stores, "readwrite");
      const catalog = catalogRecordForLocalCard(nextCard, deckId);
      await applyReplicaCatalogChange(write, deckId, previousCard ? catalogRecordForLocalCard(previousCard, deckId) : null, catalog, updatedAt);
      write.objectStore(STORE.decks).put(nextSummary);
      write.objectStore(STORE.cards).put(cardRecord(nextCard, deckId));
      write.objectStore(STORE.cardCatalog).put(catalog);
      write.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
      const variants = write.objectStore(STORE.variants);
      const nextVariantIds = new Set(nextCard.variants.map((variant) => variant.id));
      for (const variant of storedVariants) if (!nextVariantIds.has(variant.id)) variants.delete(variant.id);
      for (const variant of nextCard.variants) variants.put(variantRecord(variant, deckId));
      for (const document of documents) write.objectStore(STORE.documents).put(document);
      for (const definition of newDefinitions) write.objectStore(STORE.noteTypeDefinitions).put(definition);
      for (const id of mutationBatch.removedIds) write.objectStore(STORE.outbox).delete(id);
      for (const mutation of mutationBatch.queued) write.objectStore(STORE.outbox).put(mutation);
      write.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      await transactionDone(write);
    })();
    return nextCard;
  };

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
      const entities = page.entities.filter((entity: any) => !pendingEntityMutation("decks", entity.id));
      const transaction = database.transaction(STORE.decks, "readwrite");
      const store = transaction.objectStore(STORE.decks);
      if (page.reset) {
        const protectedRows = (await Promise.all(pendingEntityIdsForTable("decks").map((id) => requestResult<any>(store.get(id))))).filter(Boolean);
        store.clear();
        for (const row of protectedRows) store.put(row);
      }
      for (const entity of entities as any[]) {
        if (entity.deletedAt) store.delete(entity.id);
        else {
          const existing = await requestResult<any>(store.get(entity.id));
          store.put(existing ? { ...entity, mediaAssets: existing.mediaAssets ?? [] } : entity);
        }
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
      const transaction = database.transaction([STORE.cardCatalog, STORE.cards, STORE.variants, STORE.bodyResidency, STORE.deckStudySummaries, STORE.offlineDecks, STORE.syncMetadata], "readwrite");
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
        if (pendingEntityMutation("cards", entity.id)) continue;
        const previousCatalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(entity.id));
        if (!previousCatalog || previousCatalog.bodyRevision !== entity.bodyRevision
          || previousCatalog.dependencyRevision !== entity.dependencyRevision
          || previousCatalog.deletedAt !== entity.deletedAt) {
          changedDeckIds.add(entity.deckId);
        }
        if (entity.deletedAt) {
          await applyReplicaCatalogChange(transaction, entity.deckId, previousCatalog ?? null, null, new Date().toISOString(), !page.reset);
          catalogStore.delete(entity.id);
          cardStore.delete(entity.id);
          residencyStore.delete(entity.id);
          const variantKeys = await requestResult<IDBValidKey[]>(variantStore.index("learningItemId").getAllKeys(entity.id));
          for (const key of variantKeys) variantStore.delete(key);
          continue;
        }
        const catalog = storedCatalogRecord(entity);
        if (previousCatalog && previousCatalog.deckId !== catalog.deckId) {
          await applyReplicaCatalogChange(transaction, previousCatalog.deckId, previousCatalog, null, new Date().toISOString(), !page.reset);
        }
        await applyReplicaCatalogChange(transaction, catalog.deckId, previousCatalog?.deckId === catalog.deckId ? previousCatalog : null, catalog, new Date().toISOString(), !page.reset);
        catalogStore.put(catalog);
        const residency = await requestResult<CardBodyResidencyRecord | undefined>(residencyStore.get(entity.id));
        if (residency && (residency.bodyRevision !== entity.bodyRevision || residency.dependencyRevision !== entity.dependencyRevision)) {
          const storedCard = await requestResult<StoredCard | undefined>(cardStore.get(entity.id));
          const storedVariants = storedCard
            ? await requestResult<StoredVariant[]>(variantStore.index("learningItemId").getAll(entity.id))
            : [];
          const localCatalog = storedCard
            ? catalogRecordForLocalCard(hydrateCard(storedCard, new Map([[entity.id, storedVariants]])), entity.deckId)
            : null;
          const bodyStillCurrent = residency.state !== "catalog-only"
            && localCatalog?.bodyRevision === entity.bodyRevision
            && localCatalog.dependencyRevision === entity.dependencyRevision;
          residencyStore.put({
            ...residency,
            state: bodyStillCurrent ? residency.state : "catalog-only",
            bodyRevision: entity.bodyRevision,
            dependencyRevision: entity.dependencyRevision,
          });
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

  const listCatalogPage = async (deckId: string, { page = 0, pageSize = 50, query = "", sort = { field: "sortField", direction: "asc" } as CardTableSort } = {}) => {
    await writeChain;
    const normalizedQuery = String(query).trim().toLocaleLowerCase("de");
    const normalizedPage = Math.max(0, Math.floor(Number(page)));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(pageSize))));
    const offset = normalizedPage * limit;
    const indexName = sort.field === "nextStudyDate" ? "deckDue" : sort.field === "variants" ? "deckVariants" : "deckSort";
    const lower = indexName === "deckVariants" ? [deckId, 0, ""] : [deckId, "", ""];
    const upper = indexName === "deckVariants" ? [deckId, 1, "\uffff"] : [deckId, "\uffff", "\uffff"];
    const rows: StoredCardCatalog[] = [];
    let totalCount = 0;
    let boundary: IDBValidKey | null = null;
    let complete = false;
    let skipped = 0;
    do {
      const transaction = database.transaction(STORE.cardCatalog, "readonly");
      const index = transaction.objectStore(STORE.cardCatalog).index(indexName);
      const range = boundary == null
        ? IDBKeyRange.bound(lower, upper)
        : sort.direction === "desc"
          ? IDBKeyRange.bound(lower, boundary, false, true)
          : IDBKeyRange.bound(boundary, upper, true, false);
      if (!normalizedQuery && boundary == null) totalCount = await requestResult(index.count(range));
      const request = index.openCursor(range, sort.direction === "desc" ? "prev" : "next");
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      let scanned = 0;
      await new Promise<void>((resolve, reject) => {
        request.onerror = () => reject(request.error ?? new Error("Kartenkatalog konnte nicht gelesen werden."));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { complete = true; resolve(); return; }
          const row = cursor.value as StoredCardCatalog;
          scanned += 1;
          const matches = !normalizedQuery || row.normalizedSearchText.includes(normalizedQuery);
          if (matches) {
            if (normalizedQuery) totalCount += 1;
            if (skipped < offset) skipped += 1;
            else if (rows.length < limit) rows.push(row);
          }
          const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
          if (scanned >= LOCAL_WRITE_CHUNK_SIZE || elapsed >= 25 || (!normalizedQuery && rows.length >= limit)) {
            boundary = cursor.key;
            resolve();
            return;
          }
          cursor.continue();
        };
      });
      await transactionDone(transaction);
      if (!complete && (Boolean(normalizedQuery) || rows.length < limit)) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } while (!complete && (Boolean(normalizedQuery) || rows.length < limit));
    return {
      items: rows.map(catalogEntry),
      page: normalizedPage,
      pageSize: limit,
      totalCount,
      hasMore: totalCount > offset + rows.length,
      catalogCompleteness: replicaStatus.catalogCompleteness,
    };
  };

  const missingCardBodyIds = async (cardIds: string[]) => {
    await writeChain;
    const transaction = database.transaction([STORE.cardCatalog, STORE.cards, STORE.bodyResidency], "readonly");
    const catalogStore = transaction.objectStore(STORE.cardCatalog);
    const cardStore = transaction.objectStore(STORE.cards);
    const residencyStore = transaction.objectStore(STORE.bodyResidency);
    const missing: string[] = [];
    for (const id of [...new Set(cardIds.filter(Boolean))]) {
      const [catalog, card, residency] = await Promise.all([
        requestResult<StoredCardCatalog | undefined>(catalogStore.get(id)),
        requestResult<StoredCard | undefined>(cardStore.get(id)),
        requestResult<CardBodyResidencyRecord | undefined>(residencyStore.get(id)),
      ]);
      if (!catalog || !card || !residency || residency.state === "catalog-only"
        || residency.bodyRevision !== catalog.bodyRevision || residency.dependencyRevision !== catalog.dependencyRevision) {
        missing.push(id);
      }
    }
    await transactionDone(transaction);
    return missing;
  };

  const markCardBodiesResident = async (cardIds: string[], state: Exclude<BodyResidency, "catalog-only">) => {
    await writeChain;
    const transaction = database.transaction([STORE.cardCatalog, STORE.bodyResidency], "readwrite");
    const catalogStore = transaction.objectStore(STORE.cardCatalog);
    const residencyStore = transaction.objectStore(STORE.bodyResidency);
    for (const id of [...new Set(cardIds.filter(Boolean))]) {
      const catalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(id));
      if (catalog) residencyStore.put(residencyRecord(catalog, state));
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

  const loadCardBody = async (cardId: string) => {
    await writeChain;
    const transaction = database.transaction([STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency], "readonly");
    const record = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(cardId));
    if (!record) {
      await transactionDone(transaction);
      return null;
    }
    const [variants, catalog, residency] = await Promise.all([
      requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("learningItemId").getAll(cardId)),
      requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(cardId)),
      requestResult<CardBodyResidencyRecord | undefined>(transaction.objectStore(STORE.bodyResidency).get(cardId)),
    ]);
    await transactionDone(transaction);
    if (catalog && bodyResidencyForRevision(residency, catalog) === "catalog-only") return null;
    return hydrateCard(record, new Map([[cardId, variants]]), syncConflictCardIds);
  };

  const saveOfflineDeck = async (record: OfflineDeckRecord) => {
    const transaction = database.transaction(STORE.offlineDecks, "readwrite");
    transaction.objectStore(STORE.offlineDecks).put({ ...record, id: record.deckId });
    await transactionDone(transaction);
  };

  const getOfflineDeck = async (deckId: string) => {
    const transaction = database.transaction(STORE.offlineDecks, "readonly");
    const value = await requestResult<OfflineDeckRecord | undefined>(transaction.objectStore(STORE.offlineDecks).get(deckId));
    await transactionDone(transaction);
    return value ?? null;
  };

  const listOfflineDecks = async () => {
    const transaction = database.transaction(STORE.offlineDecks, "readonly");
    const values = await requestResult<OfflineDeckRecord[]>(transaction.objectStore(STORE.offlineDecks).getAll());
    await transactionDone(transaction);
    return values;
  };

  const appendOfflineManifest = async (
    deckId: string,
    cards: OfflineCardManifestEntry[],
    media: OfflineMediaManifestEntry[],
    { reset = false }: { reset?: boolean } = {},
  ) => {
    const transaction = database.transaction(STORE.offlineManifests, "readwrite");
    const store = transaction.objectStore(STORE.offlineManifests);
    if (reset) {
      const keys = await requestResult<IDBValidKey[]>(store.index("deckId").getAllKeys(deckId));
      for (const key of keys) store.delete(key);
    }
    for (const card of cards) store.put({ id: `${deckId}\u0000card\u0000${card.id}`, deckId, kind: "card", value: card });
    for (const entry of media) store.put({ id: `${deckId}\u0000media\u0000${entry.sha1}`, deckId, kind: "media", value: entry });
    await transactionDone(transaction);
  };

  const readOfflineManifest = async (deckId: string) => {
    const transaction = database.transaction(STORE.offlineManifests, "readonly");
    const rows = await requestResult<Array<{ kind: "card" | "media"; value: OfflineCardManifestEntry | OfflineMediaManifestEntry }>>(
      transaction.objectStore(STORE.offlineManifests).index("deckId").getAll(deckId),
    );
    await transactionDone(transaction);
    return {
      cards: rows.filter((row) => row.kind === "card").map((row) => row.value as OfflineCardManifestEntry),
      media: rows.filter((row) => row.kind === "media").map((row) => row.value as OfflineMediaManifestEntry),
    };
  };

  const clearOfflineManifest = async (deckId: string) => {
    const transaction = database.transaction(STORE.offlineManifests, "readwrite");
    const store = transaction.objectStore(STORE.offlineManifests);
    const keys = await requestResult<IDBValidKey[]>(store.index("deckId").getAllKeys(deckId));
    for (const key of keys) store.delete(key);
    await transactionDone(transaction);
  };

  const evictCachedCardBodies = async (bytesToFree: number, protectedCardIds: string[] = []) => {
    await writeChain;
    const protectedIds = new Set([
      ...protectedCardIds,
      ...pendingEntityIdsForTable("cards"),
    ]);
    const read = database.transaction(STORE.bodyResidency, "readonly");
    const candidates = await requestResult<CardBodyResidencyRecord[]>(
      read.objectStore(STORE.bodyResidency).index("stateAccess").getAll(
        IDBKeyRange.bound(["cached", "", ""], ["cached", "\uffff", "\uffff"]),
      ),
    );
    await transactionDone(read);
    let freedBytes = 0;
    let evictedCount = 0;
    for (const candidate of candidates) {
      if (freedBytes >= Math.max(0, bytesToFree)) break;
      if (protectedIds.has(candidate.id) || (candidate.protectedUntil && Date.parse(candidate.protectedUntil) > Date.now())) continue;
      const transaction = database.transaction([STORE.cards, STORE.variants, STORE.bodyResidency], "readwrite");
      const card = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(candidate.id));
      const variants = await requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("learningItemId").getAll(candidate.id));
      if (card) {
        freedBytes += serializedBytes(card) + serializedBytes(variants);
        transaction.objectStore(STORE.cards).delete(candidate.id);
        for (const variant of variants) transaction.objectStore(STORE.variants).delete(variant.id);
        transaction.objectStore(STORE.bodyResidency).put({ ...candidate, state: "catalog-only" });
        hydratedDecks.delete(candidate.deckId);
        evictedCount += 1;
      }
      await transactionDone(transaction);
      if (evictedCount % 25 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return { freedBytes, evictedCount };
  };

  const removeOfflineDeck = async (deckId: string) => {
    const transaction = database.transaction([STORE.offlineDecks, STORE.bodyResidency, STORE.offlineManifests], "readwrite");
    transaction.objectStore(STORE.offlineDecks).delete(deckId);
    const manifestStore = transaction.objectStore(STORE.offlineManifests);
    const manifestKeys = await requestResult<IDBValidKey[]>(manifestStore.index("deckId").getAllKeys(deckId));
    for (const key of manifestKeys) manifestStore.delete(key);
    const index = transaction.objectStore(STORE.bodyResidency).index("deckAccess");
    await iterateCursor<CardBodyResidencyRecord>(index.openCursor(IDBKeyRange.bound([deckId, "", ""], [deckId, "\uffff", "\uffff"])), (record) => {
      if (record.state === "downloaded") transaction.objectStore(STORE.bodyResidency).put({ ...record, state: "cached" });
    });
    await transactionDone(transaction);
  };

  const cacheStatisticsSnapshot = async (id: string, snapshot: AccountStatisticsSnapshot) => {
    const transaction = database.transaction(STORE.statisticsSnapshots, "readwrite");
    transaction.objectStore(STORE.statisticsSnapshots).put({ id, ...snapshot });
    await transactionDone(transaction);
  };

  const readStatisticsSnapshot = async (id: string) => {
    const transaction = database.transaction(STORE.statisticsSnapshots, "readonly");
    const snapshot = await requestResult<(AccountStatisticsSnapshot & { id: string }) | undefined>(transaction.objectStore(STORE.statisticsSnapshots).get(id));
    await transactionDone(transaction);
    if (!snapshot) return null;
    const { id: _id, ...value } = snapshot;
    return value;
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

  return {
    loadShell: async () => shell!,
    getReplicaStatus: () => ({ ...replicaStatus }),
    setAccountBaselineState(state: AccountBaselineState, serverCatalogCursor = replicaStatus.catalogServerCursor) {
      return persistReplicaStatus({
        accountBaselineState: state,
        catalogServerCursor: Math.max(0, serverCatalogCursor),
      });
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
    applyCloudCatalogPage,
    listCatalogPage,
    missingCardBodyIds,
    markCardBodiesResident,
    touchCardBodies,
    saveOfflineDeck,
    getOfflineDeck,
    listOfflineDecks,
    appendOfflineManifest,
    readOfflineManifest,
    clearOfflineManifest,
    removeOfflineDeck,
    evictCachedCardBodies,
    cacheStatisticsSnapshot,
    readStatisticsSnapshot,
    async listDeckStudySummaries() {
      const transaction = database.transaction(STORE.deckStudySummaries, "readonly");
      const summaries = await requestResult<DeckStudySummary[]>(transaction.objectStore(STORE.deckStudySummaries).getAll());
      await transactionDone(transaction);
      return summaries;
    },
    async getDeckBodyResidencySummary(deckId: string) {
      const transaction = database.transaction([STORE.cardCatalog, STORE.bodyResidency], "readonly");
      const total = await requestResult(transaction.objectStore(STORE.cardCatalog).index("deckScan").count(
        IDBKeyRange.bound([deckId, ""], [deckId, "\uffff"]),
      ));
      const residency = await requestResult<CardBodyResidencyRecord[]>(transaction.objectStore(STORE.bodyResidency).index("deckAccess").getAll(
        IDBKeyRange.bound([deckId, "", ""], [deckId, "\uffff", "\uffff"]),
      ));
      await transactionDone(transaction);
      return {
        total,
        cached: residency.filter((record) => record.state === "cached").length,
        downloaded: residency.filter((record) => record.state === "downloaded").length,
      };
    },
    async materializeFullState() {
      await writeChain;
      return materializeState(database, shell!);
    },
    async loadCard(cardId: string) {
      return loadCardBody(cardId);
    },
    updateCard(deckId: string, cardId: string, updater: (card: LearningItem) => LearningItem) {
      return writeCard(deckId, cardId, (card) => card ? updater(card) : null);
    },
    insertCard(deckId: string, card: LearningItem, documents: SourceDocument[] = []) {
      return writeCard(deckId, card.id, (previous) => previous ? card : card, documents);
    },
    async loadNoteTypeDefinitions(idsToLoad: string[] = []) {
      await writeChain;
      const transaction = database.transaction(STORE.noteTypeDefinitions, "readonly");
      const store = transaction.objectStore(STORE.noteTypeDefinitions);
      const ids = [...new Set(idsToLoad.filter(Boolean))];
      const definitions = await Promise.all(ids.map((id) => definitionCache.has(id) ? definitionCache.get(id) : requestResult<any>(store.get(id))));
      await transactionDone(transaction);
      for (const definition of definitions.filter(Boolean)) definitionCache.set(definition.id, definition);
      return definitions.filter(Boolean);
    },
    async createImportVerificationScope(deckIdsToVerify: string[]): Promise<ImportVerificationScope> {
      await writeChain;
      const deckIds = [...new Set(deckIdsToVerify.filter(Boolean))];
      const scope = latestImportVerificationScope;
      if (!scope || scope.deckIds.length !== deckIds.length || scope.deckIds.some((deckId) => !deckIds.includes(deckId))) {
        throw new Error("Der Prüfumfang des letzten APKG-Imports ist nicht mehr verfügbar.");
      }
      const knownDeckIds = new Set(shell!.decks.map((deck) => deck.id));
      const decks = deckIds.map((deckId) => shell!.decks.find((deck) => deck.id === deckId) ?? null);
      if (decks.some((deck) => !deck)) throw new Error("Mindestens ein importierter Stapel fehlt im lokalen Commitgraphen.");
      for (const deck of decks) {
        if (deck?.parentDeckId && !knownDeckIds.has(deck.parentDeckId)) {
          throw new Error(`Der übergeordnete Stapel für „${deck.name}“ fehlt im lokalen Commitgraphen.`);
        }
        const visited = new Set<string>();
        let current = deck;
        while (current) {
          if (visited.has(current.id)) throw new Error("Die importierte Stapelhierarchie enthält einen Zyklus.");
          visited.add(current.id);
          current = current.parentDeckId ? shell!.decks.find((candidate) => candidate.id === current!.parentDeckId) ?? null : null;
        }
      }

      const graphRead = database.transaction([STORE.cards, STORE.variants, STORE.reviewEvents], "readonly");
      const cardRequests = scope.cardIds.map((cardId) => requestResult<StoredCard | undefined>(graphRead.objectStore(STORE.cards).get(cardId)));
      const variantRequests = scope.variantIds.map((variantId) => requestResult<StoredVariant | undefined>(graphRead.objectStore(STORE.variants).get(variantId)));
      const reviewRequests = scope.reviewEventIds.map((reviewId) => requestResult<ReviewEvent | undefined>(graphRead.objectStore(STORE.reviewEvents).get(reviewId)));
      const [cardRows, variantRows, reviewRows] = await Promise.all([
        Promise.all(cardRequests),
        Promise.all(variantRequests),
        Promise.all(reviewRequests),
      ]);
      await transactionDone(graphRead);

      if ([...cardRows, ...variantRows, ...reviewRows].some((row) => !row)) {
        throw new Error("Mindestens eine erwartete Entität fehlt im lokalen Importgraphen.");
      }
      const cards = cardRows as StoredCard[];
      const variants = variantRows as StoredVariant[];
      const cardIds = new Set(cards.map((card) => card.id));
      const importedDeckIds = new Set(deckIds);
      if (cards.some((card) => !importedDeckIds.has(card.deckId))) {
        throw new Error("Mindestens eine Karte ist dem falschen importierten Stapel zugeordnet.");
      }
      const variantsByCardId = new Map<string, StoredVariant[]>();
      for (const variant of variants) {
        const cardId = String(variant.learningItemId ?? variant.cardId ?? "");
        if (!cardIds.has(cardId)) throw new Error(`Variante ${variant.id} verweist nicht auf eine importierte Karte.`);
        if (variant.studyDeckId && !importedDeckIds.has(variant.studyDeckId)) throw new Error(`Variante ${variant.id} verweist auf den falschen Lernstapel.`);
        const bucket = variantsByCardId.get(cardId);
        if (bucket) bucket.push(variant);
        else variantsByCardId.set(cardId, [variant]);
      }
      for (const card of cards) {
        const originals = (variantsByCardId.get(card.id) ?? []).filter((variant) => variant.isOriginal);
        if (originals.length !== 1) throw new Error(`Karte ${card.id} besitzt nicht genau eine Originalvariante.`);
        if (!card.noteTypeDefinitionId) throw new Error(`Karte ${card.id} besitzt keinen Notiztyp.`);
        if (!card.latestSourceSnapshotId) throw new Error(`Karte ${card.id} besitzt keinen verknüpften Quell-Snapshot.`);
      }
      if (reviewRows.some((review) => !importedDeckIds.has(review!.deckId))) {
        throw new Error("Mindestens ein Review-Ereignis ist dem falschen importierten Stapel zugeordnet.");
      }

      const noteTypeDefinitionIds = [...new Set(cards.map((card) => card.noteTypeDefinitionId))];
      const sourceSnapshots = cards.map((card) => ({ id: card.latestSourceSnapshotId!, cardId: card.id, attachToCard: true }));
      if (new Set(sourceSnapshots.map((snapshot) => snapshot.id)).size !== sourceSnapshots.length) {
        throw new Error("Ein Quell-Snapshot ist mit mehreren importierten Karten verknüpft.");
      }
      const contractRead = database.transaction([STORE.noteTypeDefinitions, STORE.sourceSnapshots], "readonly");
      const definitionRequests = noteTypeDefinitionIds.map((id) => requestResult(contractRead.objectStore(STORE.noteTypeDefinitions).getKey(id)));
      const snapshotRequests = sourceSnapshots.map(({ id }) => requestResult(contractRead.objectStore(STORE.sourceSnapshots).getKey(id)));
      const [definitionKeys, snapshotKeys] = await Promise.all([Promise.all(definitionRequests), Promise.all(snapshotRequests)]);
      await transactionDone(contractRead);
      if (definitionKeys.some((key) => key == null)) throw new Error("Mindestens ein importierter Notiztyp fehlt im lokalen Commitgraphen.");
      if (snapshotKeys.some((key) => key == null)) throw new Error("Mindestens ein importierter Quell-Snapshot fehlt im lokalen Commitgraphen.");

      return {
        deckIds: [...deckIds].sort(),
        cardIds: [...cardIds].sort(),
        variantIds: variants.map((variant) => variant.id).sort(),
        sourceSnapshots: sourceSnapshots.sort((left, right) => left.id.localeCompare(right.id)),
        noteTypeDefinitionIds: noteTypeDefinitionIds.sort(),
        reviewEventIds: reviewRows.map((review) => review!.id).sort(),
      };
    },
    async requeueImportVerificationScope(scope: ImportVerificationScope, repairScope: ImportVerificationRepairScope | null = null) {
      await writeChain;
      const repairIds = (selected: string[] | undefined, all: string[]) => repairScope ? selected ?? [] : all;
      const targetDeckIds = repairIds(repairScope?.deckIds, scope.deckIds);
      const targetCardIds = repairIds(repairScope?.cardIds, scope.cardIds);
      const targetVariantIds = repairIds(repairScope?.variantIds, scope.variantIds);
      const targetSnapshotIds = repairIds(repairScope?.sourceSnapshotIds, scope.sourceSnapshots.map((snapshot) => snapshot.id));
      const targetDefinitionIds = repairIds(repairScope?.noteTypeDefinitionIds, scope.noteTypeDefinitionIds);
      const targetReviewIds = repairIds(repairScope?.reviewEventIds, scope.reviewEventIds);
      const decks = targetDeckIds.map((deckId) => shell!.decks.find((deck) => deck.id === deckId) ?? null);
      if (decks.some((deck) => !deck)) throw new Error("Der unvollständige Import kann lokal nicht mehr rekonstruiert werden.");
      const read = database.transaction([STORE.cards, STORE.variants, STORE.reviewEvents, STORE.noteTypeDefinitions, STORE.sourceSnapshots], "readonly");
      const cardRequests = targetCardIds.map((id) => requestResult<StoredCard | undefined>(read.objectStore(STORE.cards).get(id)));
      const variantRequests = targetVariantIds.map((id) => requestResult<StoredVariant | undefined>(read.objectStore(STORE.variants).get(id)));
      const reviewRequests = targetReviewIds.map((id) => requestResult<ReviewEvent | undefined>(read.objectStore(STORE.reviewEvents).get(id)));
      const definitionRequests = targetDefinitionIds.map((id) => requestResult<any>(read.objectStore(STORE.noteTypeDefinitions).get(id)));
      const snapshotRequests = targetSnapshotIds.map((id) => requestResult<any>(read.objectStore(STORE.sourceSnapshots).get(id)));
      const [cards, variants, reviews, definitions, snapshots] = await Promise.all([
        Promise.all(cardRequests),
        Promise.all(variantRequests),
        Promise.all(reviewRequests),
        Promise.all(definitionRequests),
        Promise.all(snapshotRequests),
      ]);
      await transactionDone(read);
      if ([...cards, ...variants, ...reviews, ...definitions, ...snapshots].some((entity) => !entity)) {
        throw new Error("Der unvollständige Import kann lokal nicht mehr vollständig rekonstruiert werden.");
      }

      const deckIdByCardId = new Map(cards.map((card) => [card!.id, String((card as StoredCard & { deckId?: string }).deckId ?? "")]));
      const snapshotLinks = new Map(scope.sourceSnapshots.map((snapshot) => [snapshot.id, snapshot]));
      const requeuedSnapshotIds = new Set(targetSnapshotIds);
      const inputs = [
        ...(decks.filter(Boolean) as WorkspaceDeckSummary[]).map((deck) => ({ type: "entity-mutation", table: "decks", entityId: deck.id, baseRevision: null, payload: { table: "decks", entity: deck, baseRevision: null } })),
        ...definitions.map((definition) => ({ type: "entity-mutation", table: "note_type_definitions", entityId: definition.id, baseRevision: null, payload: { table: "note_type_definitions", entity: definition, baseRevision: null } })),
        ...(cards.filter(Boolean) as StoredCard[]).map((card) => {
          const { variants: _variants, ...cloudCard } = card as StoredCard & { variants?: never };
          const latestSourceSnapshotId = requeuedSnapshotIds.has(card.latestSourceSnapshotId ?? "") ? null : card.latestSourceSnapshotId;
          return { type: "entity-mutation", table: "cards", entityId: card.id, baseRevision: null, payload: { table: "cards", entity: { ...cloudCard, latestSourceSnapshotId }, deckId: deckIdByCardId.get(card.id), baseRevision: null } };
        }),
        ...(variants.filter(Boolean) as StoredVariant[]).map((variant) => ({ type: "entity-mutation", table: "card_variants", entityId: variant.id, baseRevision: null, payload: { table: "card_variants", entity: variant, cardId: variant.learningItemId, baseRevision: null } })),
        ...snapshots.map((snapshot) => {
          const link = snapshotLinks.get(snapshot.id)!;
          return { type: "entity-mutation", table: "learning_item_source_snapshots", entityId: snapshot.id, baseRevision: null, payload: { table: "learning_item_source_snapshots", entity: snapshot, cardId: link.cardId, attachToCard: link.attachToCard, baseRevision: null } };
        }),
        ...(reviews.filter(Boolean) as ReviewEvent[]).map((review) => ({ type: "entity-mutation", table: "review_events", entityId: review.id, baseRevision: null, payload: { table: "review_events", entity: review, deckId: review.deckId, baseRevision: null } })),
      ];
      const batch = queueMutations(inputs);
      const write = database.transaction(STORE.outbox, "readwrite");
      for (const id of batch.removedIds) write.objectStore(STORE.outbox).delete(id);
      for (const mutation of batch.queued) write.objectStore(STORE.outbox).put(mutation);
      await transactionDone(write);
      return batch.queued.length;
    },
    getShellState() {
      return shellState();
    },
    replaceFullState(nextState: WorkspaceState) {
      const normalized = normalizeWorkspaceState(nextState) as WorkspaceState;
      shell = shellFromState(normalized);
      hydratedDecks.clear();
      reviewHourCounts = reviewHourCountsFromState(normalized);
      reviewDayCountsCache = null;
      void enqueueWrite(() => writeState(database, normalized));
      return normalized;
    },
    async setSyncConflicts(conflicts: any[] = []) {
      syncConflictCardIds = new Set(conflicts.flatMap((conflict) => conflict?.cardId ? [String(conflict.cardId)] : []));
      const conflictedDeckIds = [...new Set(conflicts
        .filter((conflict) => conflict?.entityTable === "decks" && conflict?.entityId)
        .map((conflict) => String(conflict.entityId)))];
      if (conflictedDeckIds.length > 0) {
        const read = database.transaction(STORE.cards, "readonly");
        const cardStore = read.objectStore(STORE.cards);
        const cardsByDeck = await Promise.all(conflictedDeckIds.map((deckId) => requestResult<StoredCard[]>(cardStore.index("deckId").getAll(deckId))));
        await transactionDone(read);
        for (const card of cardsByDeck.flat()) syncConflictCardIds.add(card.id);
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
      const storeName = ({
        decks: STORE.decks,
        cards: STORE.cards,
        card_variants: STORE.variants,
        source_documents: STORE.documents,
        note_type_definitions: STORE.noteTypeDefinitions,
      } as Record<string, string>)[target.table];
      if (!storeName) return;
      const stores = target.table === "cards" ? [STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency] : [storeName];
      const transaction = database.transaction(stores, "readwrite");
      transaction.objectStore(storeName).delete(target.entityId);
      if (target.table === "cards") {
        const variants = await requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("learningItemId").getAll(target.entityId));
        for (const variant of variants) transaction.objectStore(STORE.variants).delete(variant.id);
        transaction.objectStore(STORE.cardCatalog).delete(target.entityId);
        transaction.objectStore(STORE.bodyResidency).delete(target.entityId);
      }
      await transactionDone(transaction);
      hydratedDecks.clear();
      shell = await loadShell(database);
    },
    async applyCloudPage(page: CloudEntityPage) {
      await writeChain;
      hydratedDecks.clear();
      const entities = page.table === "media_assets"
        ? page.entities
        : page.entities.filter((entity) => !pendingEntityMutation(page.table, entity.id));
      const storeName = page.table === "media_assets" ? STORE.decks : ({
        decks: STORE.decks,
        cards: STORE.cards,
        card_variants: STORE.variants,
        review_events: STORE.reviewEvents,
        source_documents: STORE.documents,
        note_type_definitions: STORE.noteTypeDefinitions,
        learning_item_source_snapshots: STORE.sourceSnapshots,
      } as const)[page.table];
      if (page.table === "media_assets") {
        const transaction = database.transaction(STORE.decks, "readwrite");
        const store = transaction.objectStore(STORE.decks);
        if (page.reset) {
          const decks = await requestResult<any[]>(store.getAll());
          for (const deck of decks) store.put({ ...deck, mediaAssets: [] });
        }
        const referencesByDeck = new Map<string, any[]>();
        for (const reference of entities) {
          if (reference.deletedAt) continue;
          const bucket = referencesByDeck.get(reference.deckId);
          if (bucket) bucket.push(reference);
          else referencesByDeck.set(reference.deckId, [reference]);
        }
        for (const [deckId, references] of referencesByDeck) {
          const deck = await requestResult<any>(store.get(deckId));
          if (deck) store.put({ ...deck, mediaAssets: [...(deck.mediaAssets ?? []), ...references] });
        }
        await transactionDone(transaction);
      } else if (page.table === "card_variants") {
        const cardTransaction = database.transaction(STORE.cards, "readonly");
        const cardStore = cardTransaction.objectStore(STORE.cards);
        const deckIds = await Promise.all(entities.map(async (variant) => (await requestResult<StoredCard | undefined>(cardStore.get(variant.learningItemId ?? variant.cardId)))?.deckId ?? ""));
        await transactionDone(cardTransaction);
        const transaction = database.transaction(STORE.variants, "readwrite");
        const store = transaction.objectStore(STORE.variants);
        const pendingRecords = page.reset
          ? (await Promise.all(pendingEntityIdsForTable(page.table).map((id) => requestResult<StoredVariant | undefined>(store.get(id))))).filter(Boolean)
          : [];
        if (page.reset) {
          store.clear();
          for (const record of pendingRecords) store.put(record);
        }
        entities.forEach((variant, index) => variant.deletedAt ? store.delete(variant.id) : store.put(variantRecord(variant, deckIds[index])));
        await transactionDone(transaction);
      } else {
        const transactionStores = page.table === "cards"
          ? [STORE.cards, STORE.cardCatalog, STORE.bodyResidency]
          : [storeName];
        const transaction = database.transaction(transactionStores, "readwrite");
        const store = transaction.objectStore(storeName);
        const pendingRecords = page.reset
          ? (await Promise.all(pendingEntityIdsForTable(page.table).map((id) => requestResult<any>(store.get(id))))).filter(Boolean)
          : [];
        if (page.reset) {
          store.clear();
          for (const record of pendingRecords) store.put(record);
        }
        for (const entity of entities) {
          if (entity.deletedAt) {
            store.delete(entity.id);
            if (page.table === "cards") {
              transaction.objectStore(STORE.cardCatalog).delete(entity.id);
              transaction.objectStore(STORE.bodyResidency).delete(entity.id);
            }
          } else if (page.table === "cards") {
            store.put(cardRecord(entity, entity.deckId));
            const catalogStore = transaction.objectStore(STORE.cardCatalog);
            const residencyStore = transaction.objectStore(STORE.bodyResidency);
            const catalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(entity.id))
              ?? catalogRecordForLocalCard(entity, entity.deckId);
            catalogStore.put(catalog);
            const currentResidency = await requestResult<CardBodyResidencyRecord | undefined>(residencyStore.get(entity.id));
            residencyStore.put({
              ...residencyRecord(catalog, currentResidency?.state === "downloaded" ? "downloaded" : "cached"),
              protectedUntil: currentResidency?.protectedUntil ?? null,
            });
          } else {
            const existing = page.table === "decks" ? await requestResult<any>(store.get(entity.id)) : null;
            store.put(page.table === "decks" && existing ? { ...entity, mediaAssets: existing.mediaAssets ?? [] } : entity);
          }
        }
        await transactionDone(transaction);
      }
      if (page.table === "review_events") {
        const counts = page.reset || !reviewHourCounts ? {} : { ...reviewHourCounts };
        for (const event of entities) {
          const key = reviewHourKey(event.answeredAt ?? event.createdAt);
          if (key) counts[key] = (counts[key] ?? 0) + 1;
        }
        reviewHourCounts = counts;
        if (page.reset) {
          reviewDayCountsCache = null;
        } else if (reviewDayCountsCache) {
          const dayCounts = { ...reviewDayCountsCache.counts };
          for (const event of entities) {
            const key = getStudyHeatmapDayKey(event.answeredAt ?? event.createdAt, reviewDayCountsCache.timeZone, reviewDayCountsCache.dayStartHour);
            if (key) dayCounts[key] = (dayCounts[key] ?? 0) + 1;
          }
          reviewDayCountsCache = { ...reviewDayCountsCache, counts: dayCounts };
        }
        const transaction = database.transaction(STORE.syncMetadata, "readwrite");
        transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: counts });
        if (reviewDayCountsCache) transaction.objectStore(STORE.syncMetadata).put({ key: "reviewDayCounts", value: reviewDayCountsCache });
        else transaction.objectStore(STORE.syncMetadata).delete("reviewDayCounts");
        await transactionDone(transaction);
      }
      shell = await loadShell(database);
    },
    async applyCloudProfile(profile: WorkspaceState["profile"]) {
      const completeProfile = requireCompleteProfile(profile, userId);
      const updatedAt = new Date().toISOString();
      const transaction = database.transaction(STORE.meta, "readwrite");
      transaction.objectStore(STORE.meta).put({ key: "profile", value: completeProfile });
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      await transactionDone(transaction);
      shell = { ...shell!, profile: completeProfile, updatedAt };
    },
    getCloudTombstones: () => shell!.cloudTombstones,
    removeCloudTombstone(table: string, entityId: string) {
      shell = { ...shell!, cloudTombstones: shell!.cloudTombstones.filter((row) => row.entityTable !== table || row.entityId !== entityId) };
      void enqueueWrite(async () => {
        const transaction = database.transaction(STORE.syncMetadata, "readwrite");
        transaction.objectStore(STORE.syncMetadata).put({ key: "cloudTombstones", value: shell!.cloudTombstones });
        await transactionDone(transaction);
      });
    },
    saveDeckMetadata,
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
          deck: { id: deck.id },
          card: {
            id: updatedCard.id,
            learningItemState: updatedCard.learningItemState,
            reviewState: updatedCard.reviewState,
            coreState: updatedCard.coreState,
            updatedAt: updatedCard.updatedAt,
          },
          variant: variant ? {
            id: variant.id,
            reviewState: variant.reviewState,
            performance: variant.performance,
            updatedAt: variant.updatedAt,
          } : null,
        },
        createdAt: event.answeredAt,
        flushedAt: null,
        retryCount: 0,
        lastError: null,
      };
      const deckSummary = deckRecord(deck) as WorkspaceDeckSummary;
      shell = {
        ...shell!,
        decks: shell!.decks.map((candidate) => candidate.id === deck.id ? deckSummary : candidate),
        updatedAt: deck.updatedAt,
      };
      const cachedDeck = hydratedDecks.get(deck.id);
      if (cachedDeck) hydratedDecks.set(deck.id, {
        ...cachedDeck,
        ...deckSummary,
        cards: cachedDeck.cards.map((card) => card.id === updatedCard.id ? updatedCard : card),
        reviewEvents: [event, ...cachedDeck.reviewEvents.filter((candidate) => candidate.id !== event.id)],
      });
      rememberPending(mutation);
      const hourKey = reviewHourKey(event.answeredAt);
      if (hourKey) reviewHourCounts = { ...(reviewHourCounts ?? {}), [hourKey]: ((reviewHourCounts ?? {})[hourKey] ?? 0) + 1 };
      if (reviewDayCountsCache) {
        const dayKey = getStudyHeatmapDayKey(event.answeredAt, reviewDayCountsCache.timeZone, reviewDayCountsCache.dayStartHour);
        if (dayKey) reviewDayCountsCache = {
          ...reviewDayCountsCache,
          counts: { ...reviewDayCountsCache.counts, [dayKey]: (reviewDayCountsCache.counts[dayKey] ?? 0) + 1 },
        };
      }
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.decks, STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.reviewEvents, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
        const cardStore = transaction.objectStore(STORE.cards);
        const catalogStore = transaction.objectStore(STORE.cardCatalog);
        const previousCatalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(updatedCard.id));
        const catalog = catalogRecordForLocalCard(updatedCard, deck.id);
        await applyReplicaCatalogChange(transaction, deck.id, previousCatalog ?? null, catalog, event.answeredAt);
        const overviewContext = studyOverview ? studyOverviewContext(studyOverview) : null;
        const overviewDay = overviewContext ? getStudyHeatmapDayKey(event.answeredAt, overviewContext.timeZone, overviewContext.dayStartHour) : null;
        if (studyOverview && overviewContext && overviewDay === studyOverview.dayKey) {
          const range = getLearningDayRange(event.answeredAt, overviewContext);
          const reviewableId = event.reviewableId || event.variantId || event.learningItemId;
          const priorEvents = range ? await requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("reviewableAnswered").getAll(IDBKeyRange.bound(
            [reviewableId, new Date(range.start).toISOString(), ""],
            [reviewableId, new Date(range.end).toISOString(), ""],
            false,
            true,
          ))) : [];
          const isIntroduction = ((event as any).schedulerBefore?.card?.state ?? (event as any).schedulerBefore?.state ?? "new") === "new";
          const alreadyCounted = priorEvents.some((prior) => ((((prior as any).schedulerBefore?.card?.state ?? (prior as any).schedulerBefore?.state ?? "new") === "new") === isIntroduction));
          if (!alreadyCounted) {
            const key = isIntroduction ? "introducedTodayByDeck" : "reviewedTodayByDeck";
            studyOverview = {
              ...studyOverview,
              [key]: { ...studyOverview[key], [deck.id]: (studyOverview[key][deck.id] ?? 0) + 1 },
              generatedAt: event.answeredAt,
            };
            transaction.objectStore(STORE.syncMetadata).put({ key: "accountStudyOverview", value: studyOverview });
          }
        }
        transaction.objectStore(STORE.decks).put(deckSummary);
        cardStore.put(cardRecord(updatedCard, deck.id));
        catalogStore.put(catalog);
        transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
        if (variant) transaction.objectStore(STORE.variants).put(variantRecord(variant, deck.id));
        transaction.objectStore(STORE.reviewEvents).put(event);
        transaction.objectStore(STORE.outbox).put(mutation);
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: deck.updatedAt });
        transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: reviewHourCounts ?? {} });
        if (reviewDayCountsCache) transaction.objectStore(STORE.syncMetadata).put({ key: "reviewDayCounts", value: reviewDayCountsCache });
        await transactionDone(transaction);
      });
      return result;
    },
    async commitImportGraph(graph: ImportCommitGraph) {
      if (graph.kind === "worker-import") {
        const importedDeckIds: string[] = [];
        const importedCardIds = new Set<string>();
        const importedVariantIds = new Set<string>();
        const importedSourceSnapshots = new Map<string, { id: string; cardId: string; attachToCard: boolean }>();
        const importedDefinitionIds = new Set<string>();
        const importedReviewIds = new Set<string>();
        const persistedDeckIdByIncomingId = new Map(graph.deckIdentities.map((identity) => {
          const existing = shell!.decks.find((candidate) => candidate.id === identity.id || (
            Boolean(identity.originalDeckId)
            && candidate.source === "anki-apkg"
            && candidate.originalDeckId === identity.originalDeckId
          ));
          return [identity.id, existing?.id ?? identity.id];
        }));
        const deckContexts = new Map<string, { summary: any; existing: Deck | null; cardIds: Map<string, string>; variantIds: Map<string, string> }>();
        const persistOutbox = (transaction: IDBTransaction, inputs: any[]) => {
          const batch = queueMutations(inputs);
          const store = transaction.objectStore(STORE.outbox);
          for (const id of batch.removedIds) store.delete(id);
          for (const mutation of batch.queued) store.put(mutation);
        };
        await graph.streamChunks(async (value) => {
          const chunk = value as any;
          if (chunk.kind === "definitions") return;
          if (chunk.kind === "deck") {
            const incoming = chunk.summary;
            const persistedDeckId = persistedDeckIdByIncomingId.get(incoming.id) ?? incoming.id;
            const parentDeckId = incoming.parentDeckId
              ? persistedDeckIdByIncomingId.get(incoming.parentDeckId) ?? incoming.parentDeckId
              : null;
            const existingSummary = shell!.decks.find((candidate) => candidate.id === persistedDeckId);
            const existing = existingSummary ? await hydrateDeck(existingSummary.id) : null;
            const summary = existing ? {
              ...incoming,
              id: existing.id,
              parentDeckId,
              name: existing.name || incoming.name,
              description: existing.description ?? incoming.description,
              createdAt: existing.createdAt,
              updatedAt: new Date().toISOString(),
              revision: existing.revision + 1,
              deckSettings: existing.deckSettings,
              mediaAssets: existing.mediaAssets,
              versionLog: existing.versionLog,
            } : { ...incoming, id: persistedDeckId, parentDeckId };
            const transaction = database.transaction([STORE.decks, STORE.deckStudySummaries, STORE.outbox], "readwrite");
            transaction.objectStore(STORE.decks).put(summary);
            if (!existing) transaction.objectStore(STORE.deckStudySummaries).put(emptyDeckStudySummary(summary.id));
            persistOutbox(transaction, [{ type: "entity-mutation", table: "decks", entityId: summary.id, baseRevision: existing?.revision ?? null, payload: { table: "decks", entity: summary, baseRevision: existing?.revision ?? null } }]);
            await transactionDone(transaction);
            importedDeckIds.push(summary.id);
            deckContexts.set(incoming.id, { summary, existing, cardIds: new Map(), variantIds: new Map() });
            shell = { ...shell!, decks: [summary, ...shell!.decks.filter((deck) => deck.id !== summary.id)], updatedAt: summary.updatedAt };
          } else if (chunk.kind === "cards") {
            const context = deckContexts.get(chunk.deckId);
            if (!context) throw new Error("APKG-Worker lieferte Karten vor ihrem Stapel.");
            const incomingCards = chunk.values ?? [];
            const mappedIncomingCards = incomingCards.map((card: LearningItem) => ({
              ...card,
              deckId: context.summary.id,
              variants: card.variants.map((variant) => ({
                ...variant,
                studyDeckId: variant.studyDeckId
                  ? persistedDeckIdByIncomingId.get(variant.studyDeckId) ?? variant.studyDeckId
                  : variant.studyDeckId,
              })),
            }));
            let cards = mappedIncomingCards;
            if (context.existing) {
              const { mergeImportedDeck } = await import("./apkgImportInternal.ts");
              const snapshots = new Map((chunk.snapshots ?? []).map(({ snapshot }: any) => [snapshot.id, snapshot]));
              cards = mergeImportedDeck({ ...context.summary, cards: mappedIncomingCards, reviewEvents: [] }, [context.existing], {
                definitions: new Map((chunk.definitions ?? []).map((definition: any) => [definition.id, definition])),
                snapshots,
              }).cards;
            }
            const persistedCardId = new Map<string, string>(incomingCards.map((card: LearningItem, index: number) => [card.id, String(cards[index]?.id ?? card.id)]));
            for (const [incomingCardId, persistedCardIdValue] of persistedCardId) context.cardIds.set(incomingCardId, persistedCardIdValue);
            incomingCards.forEach((incomingCard: LearningItem, cardIndex: number) => {
              const persistedCard = cards[cardIndex];
              incomingCard.variants.forEach((incomingVariant, variantIndex) => {
                context.variantIds.set(incomingVariant.id, persistedCard?.variants[variantIndex]?.id ?? incomingVariant.id);
              });
            });
            const snapshotRead = database.transaction(STORE.sourceSnapshots, "readonly");
            const snapshotStore = snapshotRead.objectStore(STORE.sourceSnapshots);
            const snapshotIds = (chunk.snapshots ?? []).map(({ snapshot }: any) => snapshot.id);
            const snapshotKeys = await Promise.all(snapshotIds.map((id: string) => requestResult(snapshotStore.getKey(id))));
            await transactionDone(snapshotRead);
            const existingSnapshotIds = new Set(snapshotIds.filter((_: string, index: number) => snapshotKeys[index] != null));
            const chunkMutations: any[] = [];
            const transaction = database.transaction([STORE.cards, STORE.variants, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.noteTypeDefinitions, STORE.sourceSnapshots, STORE.outbox, STORE.syncMetadata], "readwrite");
            for (const definition of chunk.definitions ?? []) {
              importedDefinitionIds.add(definition.id);
              definitionCache.set(definition.id, definition);
              transaction.objectStore(STORE.noteTypeDefinitions).put(definition);
              if (!pendingByTarget.has(mutationTargetKey({ type: "entity-mutation", table: "note_type_definitions", entityId: definition.id }))) {
                chunkMutations.push({ type: "entity-mutation", table: "note_type_definitions", entityId: definition.id, baseRevision: null, payload: { table: "note_type_definitions", entity: definition, baseRevision: null } });
              }
            }
            for (const card of cards) {
              importedCardIds.add(card.id);
              const previousCard = context.existing?.cards.find((candidate) => candidate.id === card.id);
              const baseRevision = previousCard?.revision ?? null;
              const cloudCard = { ...Object.fromEntries(Object.entries(card).filter(([key]) => key !== "variants")), latestSourceSnapshotId: null };
              const catalog = catalogRecordForLocalCard(card, context.summary.id);
              await applyReplicaCatalogChange(transaction, context.summary.id, previousCard ? catalogRecordForLocalCard(previousCard, context.summary.id) : null, catalog);
              transaction.objectStore(STORE.cards).put(cardRecord(card, context.summary.id));
              transaction.objectStore(STORE.cardCatalog).put(catalog);
              transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
              chunkMutations.push({ type: "entity-mutation", table: "cards", entityId: card.id, baseRevision, payload: { table: "cards", entity: cloudCard, deckId: context.summary.id, baseRevision } });
              for (const variant of card.variants) {
                importedVariantIds.add(variant.id);
                const variantBase = previousCard?.variants.find((candidate) => candidate.id === variant.id)?.revision ?? null;
                transaction.objectStore(STORE.variants).put(variantRecord(variant, context.summary.id));
                chunkMutations.push({ type: "entity-mutation", table: "card_variants", entityId: variant.id, baseRevision: variantBase, payload: { table: "card_variants", entity: variant, cardId: card.id, baseRevision: variantBase } });
              }
            }
            for (const { snapshot, cardId, attachToCard } of chunk.snapshots ?? []) {
              const resolvedCardId = persistedCardId.get(cardId) ?? cardId;
              importedSourceSnapshots.set(snapshot.id, { id: snapshot.id, cardId: resolvedCardId, attachToCard: Boolean(attachToCard) });
              const previousCard = context.existing?.cards.find((candidate) => candidate.id === resolvedCardId);
              const linkedSnapshot = snapshot.previousSnapshotId || !previousCard?.latestSourceSnapshotId || previousCard.latestSourceSnapshotId === snapshot.id
                ? snapshot
                : { ...snapshot, previousSnapshotId: previousCard.latestSourceSnapshotId };
              if (!existingSnapshotIds.has(snapshot.id)) transaction.objectStore(STORE.sourceSnapshots).put(linkedSnapshot);
              chunkMutations.push({ type: "entity-mutation", table: "learning_item_source_snapshots", entityId: snapshot.id, baseRevision: null, payload: { table: "learning_item_source_snapshots", entity: linkedSnapshot, cardId: resolvedCardId, attachToCard, baseRevision: null } });
            }
            persistOutbox(transaction, chunkMutations);
            await transactionDone(transaction);
          } else if (chunk.kind === "reviews") {
            const reviewMutations: any[] = [];
            const transaction = database.transaction([STORE.reviewEvents, STORE.outbox], "readwrite");
            const context = deckContexts.get(chunk.deckId);
            for (const event of chunk.values ?? []) {
              const mappedCardId = context?.cardIds.get(event.learningItemId ?? event.sourceCardId ?? event.reviewableId) ?? null;
              const mappedVariantId = context?.variantIds.get(event.variantId ?? event.reviewableId) ?? null;
              const mapped = context ? {
                ...event,
                deckId: context.summary.id,
                ...(mappedCardId ? {
                  learningItemId: mappedCardId,
                  ...(event.reviewableType === "card" ? { reviewableId: mappedCardId } : {}),
                } : {}),
                ...(mappedVariantId ? {
                  variantId: mappedVariantId,
                  ...(event.reviewableType === "variant" ? { reviewableId: mappedVariantId } : {}),
                } : {}),
              } : event;
              transaction.objectStore(STORE.reviewEvents).put(mapped);
              importedReviewIds.add(mapped.id);
              reviewMutations.push({ type: "entity-mutation", table: "review_events", entityId: mapped.id, baseRevision: null, payload: { table: "review_events", entity: mapped, deckId: mapped.deckId, baseRevision: null } });
            }
            persistOutbox(transaction, reviewMutations);
            await transactionDone(transaction);
          } else if (chunk.kind === "outbox") {
            const transaction = database.transaction(STORE.meta, "readwrite");
            transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: shell!.updatedAt });
            await transactionDone(transaction);
          }
        });
        latestImportVerificationScope = {
          deckIds: [...new Set(importedDeckIds)].sort(),
          cardIds: [...importedCardIds].sort(),
          variantIds: [...importedVariantIds].sort(),
          sourceSnapshots: [...importedSourceSnapshots.values()].sort((left, right) => left.id.localeCompare(right.id)),
          noteTypeDefinitionIds: [...importedDefinitionIds].sort(),
          reviewEventIds: [...importedReviewIds].sort(),
        };
        return importedDeckIds.map((id) => shell!.decks.find((deck) => deck.id === id)).filter(Boolean) as WorkspaceDeckSummary[];
      }
      const existingDecks = (await Promise.all(graph.decks.map(async (incoming) => {
        const summary = shell!.decks.find((candidate) => candidate.id === incoming.id || (
          candidate.source === "anki-apkg" && incoming.source === "anki-apkg" && candidate.originalDeckId === incoming.originalDeckId
        ));
        return summary ? hydrateDeck(summary.id) : null;
      }))).filter((deck): deck is Deck => Boolean(deck));
      if (!existingDecks.length) return await saveContentGraph(graph.decks, graph.noteTypeDefinitions, graph.sourceSnapshots);
      const { mergeImportedDeck } = await import("./apkgImportInternal.ts");
      const content = {
        definitions: new Map(graph.noteTypeDefinitions.map((definition) => [definition.id, definition])),
        snapshots: new Map(graph.sourceSnapshots.map((snapshot) => [snapshot.id, snapshot])),
      };
      const decks = graph.decks.map((deck) => mergeImportedDeck(deck, existingDecks, content));
      return await saveContentGraph(decks, graph.noteTypeDefinitions, graph.sourceSnapshots);
    },
    async deleteDeckTree(deckId: string) {
      await writeChain;
      const deletedIds = new Set<string>([deckId]);
      for (let size = -1; size !== deletedIds.size;) {
        size = deletedIds.size;
        for (const deck of shell!.decks) if (deck.parentDeckId && deletedIds.has(deck.parentDeckId)) deletedIds.add(deck.id);
      }
      const deletedDecks = shell!.decks
        .filter((deck) => deletedIds.has(deck.id))
        .map((deck) => ({ ...deck, cards: [], reviewEvents: [], sourceDocuments: [], mediaAssets: [] }) as Deck);
      if (!deletedDecks.length) return { deletedDeckIds: [], deletedDecks: [], nextSelectedDeckId: shell!.decks[0]?.id ?? null };
      const deletedAt = new Date().toISOString();
      const mutationBatch = queueMutations([{
        type: "deck-command",
        table: "decks",
        entityId: deckId,
        payload: { deckId, deletedAt },
      }]);
      shell = {
        ...shell!,
        decks: shell!.decks.filter((deck) => !deletedIds.has(deck.id)),
        updatedAt: deletedAt,
      };
      for (const id of deletedIds) hydratedDecks.delete(id);
      await enqueueWrite(async () => {
        const stores = [
          STORE.decks, STORE.cards, STORE.variants, STORE.reviewEvents, STORE.cardCatalog,
          STORE.bodyResidency, STORE.deckStudySummaries, STORE.offlineDecks, STORE.offlineManifests,
          STORE.statisticsSnapshots, STORE.outbox, STORE.meta,
        ];
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
            deleteCursor(transaction.objectStore(STORE.cards).index("deckScan").openCursor(IDBKeyRange.bound([id, ""], [id, "\uffff"]))),
            deleteCursor(transaction.objectStore(STORE.variants).index("deckId").openCursor(IDBKeyRange.only(id))),
            deleteCursor(transaction.objectStore(STORE.reviewEvents).index("deckId").openCursor(IDBKeyRange.only(id))),
            deleteCursor(transaction.objectStore(STORE.cardCatalog).index("deckScan").openCursor(IDBKeyRange.bound([id, ""], [id, "\uffff"]))),
            deleteCursor(transaction.objectStore(STORE.bodyResidency).index("deckAccess").openCursor(IDBKeyRange.bound([id, "", ""], [id, "\uffff", "\uffff"]))),
            deleteCursor(transaction.objectStore(STORE.offlineManifests).index("deckId").openCursor(IDBKeyRange.only(id))),
          );
        }
        transaction.objectStore(STORE.statisticsSnapshots).clear();
        for (const id of mutationBatch.removedIds) transaction.objectStore(STORE.outbox).delete(id);
        for (const mutation of mutationBatch.queued) transaction.objectStore(STORE.outbox).put(mutation);
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
      } as Deck])[0] ?? null;
    },
    saveProfile(profile: Profile) {
      const completeProfile = requireCompleteProfile(profile, userId);
      const updatedAt = new Date().toISOString();
      shell = { ...shell!, profile: completeProfile, updatedAt };
      const mutationBatch = queueMutations([{
        type: "profile-patch",
        table: "profiles",
        entityId: completeProfile.userId,
        payload: { profile: completeProfile },
      }]);
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.meta, STORE.outbox], "readwrite");
        transaction.objectStore(STORE.meta).put({ key: "profile", value: completeProfile });
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
        for (const id of mutationBatch.removedIds) transaction.objectStore(STORE.outbox).delete(id);
        for (const mutation of mutationBatch.queued) transaction.objectStore(STORE.outbox).put(mutation);
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
      const summaryRequest = requestResult<DeckStudySummary[]>(transaction.objectStore(STORE.deckStudySummaries).getAll());
      const todayEventsRequest = dayRange && catalogIsComplete && !overviewMatches
        ? Promise.all(shell!.decks.map((deck) => requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("deckAnswered").getAll(IDBKeyRange.bound(
          [deck.id, new Date(dayRange.start).toISOString(), ""],
          [deck.id, new Date(dayRange.end).toISOString(), ""],
          false,
          true,
        )))))
        : Promise.resolve([] as ReviewEvent[][]);
      const dueRequest = dayRange && catalogIsComplete
        ? Promise.all(shell!.decks.map((deck) => requestResult(transaction.objectStore(STORE.cardCatalog).index("deckReviewDue").count(IDBKeyRange.bound(
          [deck.id, 1, "review", "", ""],
          [deck.id, 1, "review", new Date(dayRange.end).toISOString(), ""],
          false,
          true,
        )))))
        : Promise.resolve([] as number[]);
      const [summaryRows, todayEventRows, dueRows] = await Promise.all([summaryRequest, todayEventsRequest, dueRequest]);
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
        const summary = summaries.get(deck.id) ?? {
          deckId: deck.id,
          totalCount: 0,
          newCount: 0,
          learningCount: 0,
          matureCount: 0,
          suspendedCount: 0,
          activeVariantCount: 0,
          updatedAt: null,
        };
        const introduced = new Set<string>();
        const reviewed = new Set<string>();
        if (catalogIsComplete && !overviewMatches) {
          for (const event of todayEventRows[index] ?? []) {
            const key = event.learningItemId;
            const before = (event as any).schedulerBefore?.card ?? (event as any).previousLearningItemStateJson;
            if (before?.state === "new" || Number(before?.repetitions ?? before?.reps ?? 0) === 0) introduced.add(key);
            else reviewed.add(key);
          }
          for (const key of introduced) reviewed.delete(key);
        }
        const introducedCount = overviewMatches ? studyOverview!.introducedTodayByDeck[deck.id] ?? 0 : catalogIsComplete ? introduced.size : 0;
        const reviewedCount = overviewMatches ? studyOverview!.reviewedTodayByDeck[deck.id] ?? 0 : catalogIsComplete ? reviewed.size : 0;
        const dueCards = catalogIsComplete ? dueRows[index] ?? 0 : overviewMatches ? studyOverview!.dueByDeck[deck.id] ?? 0 : 0;
        const settings = createDefaultDeckSettings(deck.deckSettings);
        const newLimit = Math.max(0, settings.newCardsTodayOverride?.date === todayKey ? settings.newCardsTodayOverride.limit : settings.newCardsPerDay);
        const remainingNew = Math.max(0, newLimit - introducedCount);
        const remainingReviews = Math.max(0, settings.maximumReviewsPerDay - introducedCount - reviewedCount);
        const inProgressCards = summary.learningCount;
        const selectedNew = Math.min(summary.newCount, remainingNew, remainingReviews);
        const selectedDue = Math.min(dueCards + inProgressCards, Math.max(0, remainingReviews - selectedNew));
        const inventory = {
          totalCards: Math.max(0, summary.totalCount - summary.suspendedCount),
          dueCards,
          newCards: summary.newCount,
          inProgressCards,
          matureCards: summary.matureCount,
          activeVariants: summary.activeVariantCount,
          averageMaturityXp: 0,
        };
        const completedTodayCount = introducedCount + reviewedCount;
        const dailyProgress = { completedTodayCount, newCount: selectedNew, inProgressCount: inProgressCards, dueCount: Math.max(0, selectedDue - inProgressCards), total: completedTodayCount + selectedNew + selectedDue };
        result.set(deck.id, {
          inventory,
          dailyProgress,
          startableCount: selectedNew + selectedDue,
          additionalNewCount: Math.max(0, summary.newCount - selectedNew),
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
      if (measureFirstRun) {
        markStartupPhaseReady("firstDeckSummaries", { deckCount: result.size });
      }
      return summaryResult;
    },
    async listCardPage(deckId: string, { page = 0, pageSize = 50, query = "", sort = { field: "sortField", direction: "asc" } as CardTableSort, selectedCardId = null }: {
      page?: number;
      pageSize?: number;
      query?: string;
      sort?: CardTableSort;
      selectedCardId?: string | null;
    } = {}) {
      const catalog = await listCatalogPage(deckId, { page, pageSize, query, sort });
      const loaded = await Promise.all(catalog.items.map((entry) => loadCardBody(entry.id)));
      const selectedCard = selectedCardId ? await loadCardBody(selectedCardId) : null;
      return {
        ...catalog,
        items: loaded.filter((card): card is LearningItem => Boolean(card)),
        selectedCard: selectedCard?.deckId === deckId ? selectedCard : null,
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
      const catalogPagePromises = requestedCatalog ? [] : deckIds.map((deckId) => new Promise<StoredCardCatalog[]>((resolve, reject) => {
        const cursor = options.cursorByDeck?.[deckId];
        const lower = cursor ? [deckId, cursor.dueAt, cursor.id] : [deckId, "", ""];
        const range = IDBKeyRange.bound(lower, [deckId, "\uffff", "\uffff"], Boolean(cursor), false);
        const rows: StoredCardCatalog[] = [];
        const request = dueIndex.openCursor(range);
        request.onerror = () => reject(request.error ?? new Error("Lernkarten konnten nicht gelesen werden."));
        request.onsuccess = () => {
          const entry = request.result;
          if (!entry || rows.length >= perDeckLimit) { resolve(rows); return; }
          const row = entry.value as StoredCardCatalog;
          if (row.reviewable === 1 && !syncConflictCardIds.has(row.id)) rows.push(row);
          entry.continue();
        };
      }));
      const range = getLearningDayRange(options.now ?? new Date(), { dayStartHour: options.dayStartHour, timeZone: options.timeZone });
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
      const reviewEvents = reviewEventsByDeck.flat();
      await transactionDone(transaction);
      const candidates = requestedCatalog
        ? catalogByDeck.flat().sort((left, right) => requestedIds.indexOf(left.id) - requestedIds.indexOf(right.id))
        : catalogByDeck.flat().sort((left, right) => left.dueSort.localeCompare(right.dueSort) || left.id.localeCompare(right.id));
      const selectedCatalog = candidates.slice(0, limit);
      const cards = (await Promise.all(selectedCatalog.map((entry) => loadCardBody(entry.id))))
        .filter((card): card is LearningItem => Boolean(card));
      const cursorByDeck = { ...(options.cursorByDeck ?? {}) };
      for (const card of cards) {
        const catalog = selectedCatalog.find((entry) => entry.id === card.id)!;
        cursorByDeck[card.deckId] = { dueAt: catalog.dueSort, id: card.id };
      }
      return {
        cards: cards.map((item) => ({ deckId: item.deckId, item })),
        reviewEvents,
        cursorByDeck,
        hasMore: candidates.length > cards.length || catalogByDeck.some((rows) => rows.length >= perDeckLimit),
      };
    },
    async queryStatistics(input: StatisticsSelection) {
      await writeChain;
      const { createStatisticsAccumulator } = await import("./statisticsModel.ts");
      const decks = shell!.decks.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck));
      return createStatisticsAccumulator(decks, input).finish();
    },
    outbox,
    flush: () => writeChain,
    persistMutationAcknowledgements(persistedRows: Array<{ table: string; row: any; entity?: any }> = []) {
      return enqueueWrite(async () => {
        const stores = [...new Set(persistedRows.map(({ table }) => ({ decks: STORE.decks, cards: STORE.cards, card_variants: STORE.variants, source_documents: STORE.documents, note_type_definitions: STORE.noteTypeDefinitions } as Record<string, string>)[table]).filter(Boolean))];
        if (!stores.length) return;
        const transaction = database.transaction(stores, "readwrite");
        for (const { table, row, entity } of persistedRows) {
          const storeName = ({ decks: STORE.decks, cards: STORE.cards, card_variants: STORE.variants, source_documents: STORE.documents, note_type_definitions: STORE.noteTypeDefinitions } as Record<string, string>)[table];
          if (!storeName || !row?.id) continue;
          const store = transaction.objectStore(storeName);
          const current = await requestResult<any>(store.get(row.id));
          if (!current) continue;
          const pending = pendingEntityMutation(table, row.id);
          if (pending && Boolean((pending.payload as any)?.tombstone) !== Boolean(row.deleted_at)) continue;
          if (entity && table === "cards") {
            store.put(cardRecord({ ...entity, variants: [] }, current.deckId ?? entity.deckId));
            continue;
          }
          if (entity && table === "card_variants") {
            store.put(variantRecord(entity, current.deckId));
            continue;
          }
          if (entity && table === "decks") {
            store.put({ ...entity, mediaAssets: current.mediaAssets ?? [] });
            continue;
          }
          store.put({
            ...current,
            revision: Number(row.revision ?? current.revision ?? 1),
            updatedAt: row.updated_at ?? current.updatedAt,
            deletedAt: row.deleted_at ?? current.deletedAt ?? null,
            updatedByDeviceId: row.updated_by_device_id ?? current.updatedByDeviceId ?? null,
          });
        }
        await transactionDone(transaction);
        shell = await loadShell(database);
      });
    },
    close: () => database.close(),
  };
}

export type IndexedDbCoreRepository = Awaited<ReturnType<typeof createIndexedDbCoreRepository>>;
