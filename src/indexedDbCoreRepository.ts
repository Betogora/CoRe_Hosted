import { createDefaultDeckSettings, isLearningItemReviewBlocked, normalizeCoreDeck, normalizeLearningItem } from "./coreModel.ts";
import { normalizeContentEntities, normalizeWorkspaceState } from "./coreRepository.ts";
import type { CardVariant, Deck, ImportCommitGraph, ImportVerificationRepairScope, ImportVerificationScope, LearningItem, MaterializedImportCommitGraph, ReviewEvent, SourceDocument } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { stripHtml } from "./htmlSafety.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import type { CloudDeltaCursors, CloudEntityPage } from "./cloudRepository.ts";
import type { ReviewAnswerResult } from "./reviewService.ts";
import { getLocalReviewDateKey } from "./reviewService.ts";
import { createStudyHeatmapModelFromCounts, getStudyHeatmapDayKey } from "./studyHeatmapModel.ts";
import type { DeckLibrarySummary } from "./libraryModel.ts";
import { getLearningDayRange } from "./learningDay.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";
import type { StatisticsSelection } from "./statisticsModel.ts";

const DATABASE_VERSION = 4;
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
});

const LEGACY_STATE_KEYS = ["core.appState.v4", "core.appState.v3", "core.appState.v2", "syncOutbox.v1"];
const LOCAL_WRITE_CHUNK_SIZE = 250;

interface KeyValueStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

interface StoredCard extends Omit<LearningItem, "variants"> {
  variants?: never;
  dueAt: string;
  hasActiveVariants: 0 | 1;
  normalizedFrontText: string;
  normalizedSearchText: string;
  reviewable: 0 | 1;
  scheduleState: string;
  maturityBand: string;
}

type StoredVariant = CardVariant & { deckId: string; activeForSummary: 0 | 1 };

interface IndexedDbRepositoryOptions {
  userId: string;
  initialState: WorkspaceState;
  legacyStorage?: KeyValueStorage | null;
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
    const request = indexedDb.open(`core.workspace.entities.v1.${userId}`, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      createStore(database, STORE.meta, { keyPath: "key" });
      const decks = createStore(database, STORE.decks);
      decks?.createIndex("parentDeckId", "parentDeckId", { unique: false });
      const cards = createStore(database, STORE.cards) ?? request.transaction!.objectStore(STORE.cards);
      if (!cards.indexNames.contains("deckId")) cards.createIndex("deckId", "deckId", { unique: false });
      if (!cards.indexNames.contains("deckDue")) cards.createIndex("deckDue", ["deckId", "dueAt", "id"], { unique: false });
      if (!cards.indexNames.contains("deckSearch")) cards.createIndex("deckSearch", ["deckId", "normalizedSearchText", "id"], { unique: false });
      if (!cards.indexNames.contains("normalizedSearchText")) cards.createIndex("normalizedSearchText", "normalizedSearchText", { unique: false });
      if (!cards.indexNames.contains("deckFront")) cards.createIndex("deckFront", ["deckId", "normalizedFrontText", "id"], { unique: false });
      if (!cards.indexNames.contains("deckVariants")) cards.createIndex("deckVariants", ["deckId", "hasActiveVariants", "id"], { unique: false });
      if (!cards.indexNames.contains("deckReviewable")) cards.createIndex("deckReviewable", ["deckId", "reviewable", "id"], { unique: false });
      if (!cards.indexNames.contains("deckReviewState")) cards.createIndex("deckReviewState", ["deckId", "reviewable", "scheduleState", "dueAt", "id"], { unique: false });
      if (!cards.indexNames.contains("deckMaturity")) cards.createIndex("deckMaturity", ["deckId", "reviewable", "maturityBand", "id"], { unique: false });
      if (event.oldVersion < 3) {
        const cursor = cards.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          const card = entry.value;
          const state = card.learningItemState ?? card.reviewState ?? {};
          entry.update({
            ...card,
            hasActiveVariants: card.hasActiveVariants ? 1 : 0,
            reviewable: card.status !== "deleted" && card.draftStatus !== "draft" && !isLearningItemReviewBlocked(card) ? 1 : 0,
            scheduleState: state.state ?? "new",
            maturityBand: state.maturityBand ?? "new",
          });
          entry.continue();
        };
      }
      const variants = createStore(database, STORE.variants);
      variants?.createIndex("learningItemId", "learningItemId", { unique: false });
      variants?.createIndex("deckId", "deckId", { unique: false });
      variants?.createIndex("studyDeckId", "studyDeckId", { unique: false });
      const variantStore = variants ?? request.transaction!.objectStore(STORE.variants);
      if (!variantStore.indexNames.contains("deckActive")) variantStore.createIndex("deckActive", ["deckId", "activeForSummary", "id"], { unique: false });
      if (event.oldVersion < 3 && !variants) {
        const cursor = variantStore.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          const variant = entry.value;
          entry.update({ ...variant, activeForSummary: !variant.isOriginal && variant.isActive !== false && variant.qualityStatus === "active" ? 1 : 0 });
          entry.continue();
        };
      }
      const events = createStore(database, STORE.reviewEvents);
      events?.createIndex("deckId", "deckId", { unique: false });
      events?.createIndex("reviewableAnswered", ["reviewableId", "answeredAt", "id"], { unique: false });
      events?.createIndex("answeredAt", ["answeredAt", "id"], { unique: false });
      const eventStore = events ?? request.transaction!.objectStore(STORE.reviewEvents);
      if (!eventStore.indexNames.contains("deckAnswered")) eventStore.createIndex("deckAnswered", ["deckId", "answeredAt", "id"], { unique: false });
      createStore(database, STORE.documents);
      createStore(database, STORE.noteTypeDefinitions);
      createStore(database, STORE.sourceSnapshots);
      const outbox = createStore(database, STORE.outbox);
      outbox?.createIndex("createdAt", ["createdAt", "id"], { unique: false });
      createStore(database, STORE.syncMetadata, { keyPath: "key" });
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
  return {
    ...record,
    deckId,
    dueAt: dueAtOf(card),
    hasActiveVariants: card.variants.some((variant) => !variant.isOriginal && variant.isActive !== false && variant.qualityStatus === "active") ? 1 : 0,
    normalizedFrontText: stripHtml(card.originalFront).toLocaleLowerCase("de"),
    normalizedSearchText: searchTextOf(card),
    reviewable: card.status !== "deleted" && card.draftStatus !== "draft" && !isLearningItemReviewBlocked(card) ? 1 : 0,
    scheduleState: (card.learningItemState ?? card.reviewState)?.state ?? "new",
    maturityBand: (card.learningItemState ?? card.reviewState)?.maturityBand ?? "new",
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
  const { dueAt: _dueAt, hasActiveVariants: _hasActiveVariants, normalizedFrontText: _frontText, normalizedSearchText: _searchText, reviewable: _reviewable, scheduleState: _scheduleState, maturityBand: _maturityBand, ...card } = record;
  const variants = (variantsByCardId.get(record.id) ?? []).map(({ deckId: _deckId, activeForSummary: _active, ...variant }) => variant);
  return { ...card, variants, syncConflict: conflictCardIds.has(record.id) } as LearningItem;
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

function writeState(database: IDBDatabase, state: WorkspaceState, cloudDeltaCursors?: CloudDeltaCursors): Promise<void> {
  const storeNames = [STORE.meta, STORE.decks, STORE.cards, STORE.variants, STORE.reviewEvents, STORE.documents, STORE.noteTypeDefinitions, STORE.sourceSnapshots, STORE.syncMetadata];
  const transaction = database.transaction(storeNames, "readwrite");
  for (const storeName of storeNames.filter((name) => name !== STORE.syncMetadata)) transaction.objectStore(storeName).clear();
  const meta = transaction.objectStore(STORE.meta);
  meta.put({ key: "initialized", value: true });
  meta.put({ key: "profile", value: state.profile });
  meta.put({ key: "updatedAt", value: state.updatedAt });
  for (const deck of state.decks) {
    transaction.objectStore(STORE.decks).put(deckRecord(deck));
    for (const card of deck.cards) {
      transaction.objectStore(STORE.cards).put(cardRecord(card, deck.id));
      for (const variant of card.variants) transaction.objectStore(STORE.variants).put(variantRecord(variant, deck.id));
    }
    for (const event of deck.reviewEvents) transaction.objectStore(STORE.reviewEvents).put(event);
  }
  for (const document of state.documents) transaction.objectStore(STORE.documents).put(document);
  for (const definition of state.noteTypeDefinitions) transaction.objectStore(STORE.noteTypeDefinitions).put(definition);
  for (const snapshot of state.learningItemSourceSnapshots) transaction.objectStore(STORE.sourceSnapshots).put(snapshot);
  transaction.objectStore(STORE.syncMetadata).put({ key: "cloudTombstones", value: state.cloudTombstones });
  if (cloudDeltaCursors) transaction.objectStore(STORE.syncMetadata).put({ key: "cloudDeltaCursors", value: cloudDeltaCursors });
  return transactionDone(transaction);
}

function parseLegacyOutbox(storage: KeyValueStorage | null | undefined, userId: string): SyncOutboxMutation[] {
  try {
    const rows = JSON.parse(storage?.getItem("syncOutbox.v1") ?? "[]");
    return Array.isArray(rows) ? rows.filter((row) => row?.userId === userId && row?.id && row?.type && row.type !== "state-patch") : [];
  } catch {
    return [];
  }
}

export async function createIndexedDbCoreRepository({ userId, initialState, legacyStorage = null, indexedDb = globalThis.indexedDB }: IndexedDbRepositoryOptions) {
  if (!userId) throw new Error("IndexedDB-Repository braucht eine Account-ID.");
  if (!indexedDb) throw new Error("IndexedDB ist in diesem Browser nicht verfügbar.");
  const database = await openDatabase(indexedDb, userId);
  let shell = await loadShell(database);
  let migratedDecks: Deck[] = [];
  let writeChain = Promise.resolve();
  const enqueueWrite = (write: () => Promise<void>) => {
    writeChain = writeChain.catch(() => undefined).then(write);
    return writeChain;
  };

  if (!shell) {
    const migratedState = normalizeWorkspaceState(initialState) as WorkspaceState;
    migratedDecks = migratedState.decks;
    await writeState(database, migratedState);
    shell = shellFromState(migratedState);
    const legacyOutbox = parseLegacyOutbox(legacyStorage, userId);
    if (legacyOutbox.length) {
      const transaction = database.transaction(STORE.outbox, "readwrite");
      for (const mutation of legacyOutbox) transaction.objectStore(STORE.outbox).put(mutation);
      await transactionDone(transaction);
    }
  }

  const hydratedDecks = new Map<string, Deck>(migratedDecks.map((deck) => [deck.id, deck]));
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

  const pendingOutbox = new Map<string, SyncOutboxMutation>(
    (await requestResult<SyncOutboxMutation[]>(database.transaction(STORE.outbox, "readonly").objectStore(STORE.outbox).getAll()))
      .map((mutation) => [mutation.id, mutation]),
  );
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
  let cloudDeltaCursors = (await requestResult<any>(database.transaction(STORE.syncMetadata, "readonly").objectStore(STORE.syncMetadata).get("cloudDeltaCursors")))?.value ?? {};
  let reviewHourCounts: Record<string, number> | null = (await requestResult<any>(database.transaction(STORE.syncMetadata, "readonly").objectStore(STORE.syncMetadata).get("reviewHourCounts")))?.value ?? null;
  let syncConflictCardIds = new Set<string>((await requestResult<any>(database.transaction(STORE.syncMetadata, "readonly").objectStore(STORE.syncMetadata).get("syncConflictCardIds")))?.value ?? []);
  let syncRepairVersion = Number((await requestResult<any>(database.transaction(STORE.syncMetadata, "readonly").objectStore(STORE.syncMetadata).get("syncRepairVersion")))?.value ?? 0);
  let latestImportVerificationScope: ImportVerificationScope | null = null;

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
    const operations: Array<{ store: string; type: "put" | "delete"; value: any }> = [];
    const put = (store: string, value: any) => operations.push({ store, type: "put", value });
    const remove = (store: string, value: any) => operations.push({ store, type: "delete", value });
    const previousById = new Map(previousDecks.map((deck) => [deck.id, deck]));
    const nextIds = ids(nextDecks);
    for (const removedDeck of previousDecks.filter((deck) => !nextIds.has(deck.id))) {
      remove(STORE.decks, removedDeck.id);
      for (const card of removedDeck.cards) {
        remove(STORE.cards, card.id);
        for (const variant of card.variants) remove(STORE.variants, variant.id);
      }
      for (const event of removedDeck.reviewEvents) remove(STORE.reviewEvents, event.id);
    }
    for (const deck of nextDecks) {
      const previous = previousById.get(deck.id);
      if (!previous || changedEntity(previous, deck) || previous.cards !== deck.cards || previous.reviewEvents !== deck.reviewEvents) {
        put(STORE.decks, deckRecord(deck));
      }
      const previousCards = new Map((previous?.cards ?? []).map((card) => [card.id, card]));
      const nextCardIds = ids(deck.cards);
      for (const removed of (previous?.cards ?? []).filter((card) => !nextCardIds.has(card.id))) {
        remove(STORE.cards, removed.id);
        for (const variant of removed.variants) remove(STORE.variants, variant.id);
      }
      for (const card of deck.cards) {
        const previousCard = previousCards.get(card.id);
        if (!previousCard || changedEntity(previousCard, card)) put(STORE.cards, cardRecord(card, deck.id));
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
      const write = database.transaction([STORE.decks, STORE.cards, STORE.variants, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
      write.objectStore(STORE.decks).put(nextSummary);
      write.objectStore(STORE.cards).delete(cardId);
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
      const stores = [STORE.decks, STORE.cards, STORE.variants, STORE.documents, STORE.noteTypeDefinitions, STORE.outbox, STORE.meta];
      const write = database.transaction(stores, "readwrite");
      write.objectStore(STORE.decks).put(nextSummary);
      write.objectStore(STORE.cards).put(cardRecord(nextCard, deckId));
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
    async materializeFullState() {
      await writeChain;
      return materializeState(database, shell!);
    },
    async loadCard(cardId: string) {
      await writeChain;
      const transaction = database.transaction([STORE.cards, STORE.variants], "readonly");
      const record = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(cardId));
      if (!record) {
        await transactionDone(transaction);
        return null;
      }
      const variants = await requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("learningItemId").getAll(cardId));
      await transactionDone(transaction);
      return hydrateCard(record, new Map([[cardId, variants]]), syncConflictCardIds);
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
    needsSyncRepair(version = 1) {
      return syncRepairVersion < version;
    },
    replaceFullState(nextState: WorkspaceState, nextCursors: CloudDeltaCursors = cloudDeltaCursors) {
      const normalized = normalizeWorkspaceState(nextState) as WorkspaceState;
      shell = shellFromState(normalized);
      hydratedDecks.clear();
      cloudDeltaCursors = nextCursors;
      void enqueueWrite(() => writeState(database, normalized, cloudDeltaCursors));
      return normalized;
    },
    async repairSyncState(manifest: { cardIds: string[]; originalVariantIds: string[] }, version = 1) {
      await writeChain;
      if (syncRepairVersion >= version) return 0;
      const read = database.transaction([STORE.cards, STORE.variants], "readonly");
      const [cards, variants] = await Promise.all([
        requestResult<StoredCard[]>(read.objectStore(STORE.cards).getAll()),
        requestResult<StoredVariant[]>(read.objectStore(STORE.variants).getAll()),
      ]);
      await transactionDone(read);
      const cloudCardIds = new Set(manifest.cardIds);
      const cloudOriginalVariantIds = new Set(manifest.originalVariantIds);
      const cardsById = new Map(cards.map((card) => [card.id, card]));
      const variantsByCardId = new Map<string, StoredVariant[]>();
      for (const variant of variants) {
        const bucket = variantsByCardId.get(variant.learningItemId);
        if (bucket) bucket.push(variant);
        else variantsByCardId.set(variant.learningItemId, [variant]);
      }
      const synthesizedOriginals: StoredVariant[] = [];
      for (const card of cards.filter((candidate) => cloudCardIds.has(candidate.id))) {
        if ((variantsByCardId.get(card.id) ?? []).some((variant) => variant.isOriginal)) continue;
        const original = normalizeLearningItem(hydrateCard(card, variantsByCardId)).variants.find((variant) => variant.isOriginal);
        if (!original) continue;
        const stored = variantRecord(original, card.deckId);
        synthesizedOriginals.push(stored);
        variantsByCardId.set(card.id, [...(variantsByCardId.get(card.id) ?? []), stored]);
      }
      const inputs = [...variants, ...synthesizedOriginals]
        .filter((variant) => variant.isOriginal && cloudCardIds.has(variant.learningItemId) && !cloudOriginalVariantIds.has(variant.id))
        .flatMap((variant) => {
          const card = cardsById.get(variant.learningItemId);
          return card ? [{
            type: "entity-mutation",
            table: "card_variants",
            entityId: variant.id,
            baseRevision: null,
            payload: { table: "card_variants", entity: variant, cardId: card.id, baseRevision: null },
          }] : [];
        });
      const batch = queueMutations(inputs);
      const repairComplete = manifest.cardIds.every((cardId) => cardsById.has(cardId));
      if (repairComplete) syncRepairVersion = version;
      const write = database.transaction([STORE.variants, STORE.outbox, STORE.syncMetadata], "readwrite");
      for (const variant of synthesizedOriginals) write.objectStore(STORE.variants).put(variant);
      for (const id of batch.removedIds) write.objectStore(STORE.outbox).delete(id);
      for (const mutation of batch.queued) write.objectStore(STORE.outbox).put(mutation);
      if (repairComplete) write.objectStore(STORE.syncMetadata).put({ key: "syncRepairVersion", value: version });
      await transactionDone(write);
      return batch.queued.length;
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
      const stores = target.table === "cards" ? [STORE.cards, STORE.variants] : [storeName];
      const transaction = database.transaction(stores, "readwrite");
      transaction.objectStore(storeName).delete(target.entityId);
      if (target.table === "cards") {
        const variants = await requestResult<StoredVariant[]>(transaction.objectStore(STORE.variants).index("learningItemId").getAll(target.entityId));
        for (const variant of variants) transaction.objectStore(STORE.variants).delete(variant.id);
      }
      await transactionDone(transaction);
      hydratedDecks.clear();
      shell = await loadShell(database);
    },
    getCloudDeltaCursors: () => reviewHourCounts ? cloudDeltaCursors as CloudDeltaCursors : Object.fromEntries(Object.entries(cloudDeltaCursors).filter(([table]) => table !== "review_events")) as CloudDeltaCursors,
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
        const transaction = database.transaction(storeName, "readwrite");
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
          } else if (page.table === "cards") {
            store.put(cardRecord(entity, entity.deckId));
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
        const transaction = database.transaction(STORE.syncMetadata, "readwrite");
        transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: counts });
        await transactionDone(transaction);
      }
      if (page.cursor) {
        cloudDeltaCursors = { ...cloudDeltaCursors, [page.table]: page.cursor };
        const transaction = database.transaction(STORE.syncMetadata, "readwrite");
        transaction.objectStore(STORE.syncMetadata).put({ key: "cloudDeltaCursors", value: cloudDeltaCursors });
        await transactionDone(transaction);
      }
      shell = await loadShell(database);
    },
    async applyCloudProfile(profile: WorkspaceState["profile"]) {
      const updatedAt = new Date().toISOString();
      const transaction = database.transaction(STORE.meta, "readwrite");
      transaction.objectStore(STORE.meta).put({ key: "profile", value: profile });
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
      await transactionDone(transaction);
      shell = { ...shell!, profile, updatedAt };
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
          deck: { id: deck.id, revision: deck.revision, updatedAt: deck.updatedAt },
          card: Object.fromEntries(Object.entries(updatedCard).filter(([key]) => key !== "variants")),
          variant,
          baseRevisions: {
            deck: deck.revision,
            card: updatedCard.revision,
            variant: variant?.revision ?? null,
          },
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
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.decks, STORE.cards, STORE.variants, STORE.reviewEvents, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
        transaction.objectStore(STORE.decks).put(deckSummary);
        transaction.objectStore(STORE.cards).put(cardRecord(updatedCard, deck.id));
        if (variant) transaction.objectStore(STORE.variants).put(variantRecord(variant, deck.id));
        transaction.objectStore(STORE.reviewEvents).put(event);
        transaction.objectStore(STORE.outbox).put(mutation);
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: deck.updatedAt });
        transaction.objectStore(STORE.syncMetadata).put({ key: "reviewHourCounts", value: reviewHourCounts ?? {} });
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
            const transaction = database.transaction([STORE.decks, STORE.outbox], "readwrite");
            transaction.objectStore(STORE.decks).put(summary);
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
            const transaction = database.transaction([STORE.cards, STORE.variants, STORE.noteTypeDefinitions, STORE.sourceSnapshots, STORE.outbox], "readwrite");
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
              transaction.objectStore(STORE.cards).put(cardRecord(card, context.summary.id));
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
      const deletedDecks = (await Promise.all([...deletedIds].map(hydrateDeck))).filter((deck): deck is Deck => Boolean(deck));
      if (!deletedDecks.length) return { deletedDeckIds: [], deletedDecks: [], nextSelectedDeckId: shell!.decks[0]?.id ?? null };
      const deletedAt = new Date().toISOString();
      const mutationBatch = queueMutations(planEntityMutations(
        { decks: deletedDecks, tombstones: shell!.cloudTombstones },
        { decks: [] },
      ));
      const tombstones = mutationBatch.queued.flatMap((mutation) => mutation.payload && typeof mutation.payload === "object" && (mutation.payload as any).tombstone
        ? [{ entityTable: mutation.table!, entityId: mutation.entityId!, revision: mutation.baseRevision ?? 1, deletedAt, updatedByDeviceId: null }]
        : []);
      shell = {
        ...shell!,
        decks: shell!.decks.filter((deck) => !deletedIds.has(deck.id)),
        cloudTombstones: [...shell!.cloudTombstones.filter((row) => !deletedIds.has(row.entityId)), ...tombstones],
        updatedAt: deletedAt,
      };
      for (const id of deletedIds) hydratedDecks.delete(id);
      void persistDecks(deletedDecks, [], [], [], [], [], mutationBatch);
      void enqueueWrite(async () => {
        const transaction = database.transaction(STORE.syncMetadata, "readwrite");
        transaction.objectStore(STORE.syncMetadata).put({ key: "cloudTombstones", value: shell!.cloudTombstones });
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
    saveProfile(profile: any) {
      const updatedAt = new Date().toISOString();
      shell = { ...shell!, profile, updatedAt };
      const mutationBatch = queueMutations([{
        type: "profile-patch",
        table: "profiles",
        entityId: String(profile?.userId ?? userId),
        payload: { profile },
      }]);
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.meta, STORE.outbox], "readwrite");
        transaction.objectStore(STORE.meta).put({ key: "profile", value: profile });
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
        for (const id of mutationBatch.removedIds) transaction.objectStore(STORE.outbox).delete(id);
        for (const mutation of mutationBatch.queued) transaction.objectStore(STORE.outbox).put(mutation);
        await transactionDone(transaction);
      });
      return profile;
    },
    async listDeckSummaries({ now = new Date().toISOString(), dayStartHour = 0, timeZone }: { now?: string; dayStartHour?: number; learnAheadMinutes?: number; timeZone?: string } = {}) {
      await writeChain;
      const result = new Map<string, DeckLibrarySummary>();
      const countsByDay = new Map<string, number>();
      const forecastCountsByDay = new Map<string, number>();
      const todayKey = getStudyHeatmapDayKey(now, timeZone, dayStartHour) ?? now.slice(0, 10);
      const dayRange = getLearningDayRange(now, { dayStartHour, timeZone });
      for (const [hour, count] of Object.entries(reviewHourCounts ?? {})) {
        const key = getStudyHeatmapDayKey(`${hour}:00:00.000Z`, timeZone, dayStartHour);
        if (key) countsByDay.set(key, (countsByDay.get(key) ?? 0) + count);
      }
      for (const summary of shell!.decks) {
        const transaction = database.transaction([STORE.cards, STORE.variants, STORE.reviewEvents], "readonly");
        const done = transactionDone(transaction);
        const cards = transaction.objectStore(STORE.cards);
        const states = cards.index("deckReviewState");
        const maturity = cards.index("deckMaturity");
        const variants = transaction.objectStore(STORE.variants).index("deckActive");
        const events = transaction.objectStore(STORE.reviewEvents).index("deckAnswered");
        const todayEvents = dayRange
          ? requestResult<ReviewEvent[]>(events.getAll(IDBKeyRange.bound(
            [summary.id, new Date(dayRange.start).toISOString(), ""],
            [summary.id, new Date(dayRange.end - 1).toISOString(), "\uffff"],
          )))
          : Promise.resolve([]);
        const dueUntil = dayRange ? new Date(dayRange.end - 1).toISOString() : now;
        const dueCursor = cards.index("deckDue").openKeyCursor(IDBKeyRange.bound([summary.id, `${todayKey}T00:00:00.000Z`, ""], [summary.id, "9999", "\uffff"]));
        const forecastDone = new Promise<void>((resolve, reject) => {
          dueCursor.onerror = () => reject(dueCursor.error);
          dueCursor.onsuccess = () => {
            const cursor = dueCursor.result;
            if (!cursor) return resolve();
            const key = getStudyHeatmapDayKey(String((cursor.key as any[])[1]), timeZone, dayStartHour);
            if (key) forecastCountsByDay.set(key, (forecastCountsByDay.get(key) ?? 0) + 1);
            cursor.continue();
          };
        });
        const [totalCards, newCards, inProgressLearning, inProgressRelearning, mature, mastered, activeVariants, dueCards, deckEvents] = await Promise.all([
          requestResult(cards.index("deckReviewable").count(IDBKeyRange.bound([summary.id, 1, ""], [summary.id, 1, "\uffff"]))),
          requestResult(states.count(IDBKeyRange.bound([summary.id, 1, "new", "", ""], [summary.id, 1, "new", "\uffff", "\uffff"]))),
          requestResult(states.count(IDBKeyRange.bound([summary.id, 1, "learning", "", ""], [summary.id, 1, "learning", "\uffff", "\uffff"]))),
          requestResult(states.count(IDBKeyRange.bound([summary.id, 1, "relearning", "", ""], [summary.id, 1, "relearning", "\uffff", "\uffff"]))),
          requestResult(maturity.count(IDBKeyRange.bound([summary.id, 1, "variant_ready", ""], [summary.id, 1, "variant_ready", "\uffff"]))),
          requestResult(maturity.count(IDBKeyRange.bound([summary.id, 1, "mastered", ""], [summary.id, 1, "mastered", "\uffff"]))),
          requestResult(variants.count(IDBKeyRange.bound([summary.id, 1, ""], [summary.id, 1, "\uffff"]))),
          requestResult(states.count(IDBKeyRange.bound(
            [summary.id, 1, "review", "", ""],
            [summary.id, 1, "review", dueUntil, "\uffff"],
          ))),
          todayEvents,
          forecastDone,
        ]);
        const introduced = new Set<string>();
        const reviewed = new Set<string>();
        for (const event of deckEvents) {
          const key = `${summary.id}:${event.learningItemId}`;
          const before = (event as any).schedulerBefore?.card ?? (event as any).previousLearningItemStateJson;
          if (before?.state === "new" || Number(before?.repetitions ?? before?.reps ?? 0) === 0) introduced.add(key);
          else reviewed.add(key);
        }
        for (const key of introduced) reviewed.delete(key);
        const settings = createDefaultDeckSettings(summary.deckSettings);
        const newLimit = Math.max(0, settings.newCardsTodayOverride?.date === todayKey ? settings.newCardsTodayOverride.limit : settings.newCardsPerDay);
        const remainingNew = Math.max(0, newLimit - introduced.size);
        const remainingReviews = Math.max(0, settings.maximumReviewsPerDay - introduced.size - reviewed.size);
        const inProgressCards = inProgressLearning + inProgressRelearning;
        const selectedNew = Math.min(newCards, remainingNew, remainingReviews);
        const selectedDue = Math.min(dueCards + inProgressCards, Math.max(0, remainingReviews - selectedNew));
        const inventory = { totalCards, dueCards, newCards, inProgressCards, matureCards: mature + mastered, activeVariants, averageMaturityXp: 0 };
        const dailyProgress = { completedTodayCount: introduced.size + reviewed.size, newCount: selectedNew, inProgressCount: inProgressCards, dueCount: Math.max(0, selectedDue - inProgressCards), total: introduced.size + reviewed.size + selectedNew + selectedDue };
        result.set(summary.id, {
          inventory,
          dailyProgress,
          startableCount: selectedNew + selectedDue,
          additionalNewCount: Math.max(0, newCards - selectedNew),
          effectiveNewLimit: newLimit,
          introducedTodayCount: introduced.size,
          dateKey: getLocalReviewDateKey(now, { dayStartHour, timeZone }),
        });
        await done;
      }
      return { summaries: result, studyHeatmap: createStudyHeatmapModelFromCounts({ todayKey, countsByDay, forecastCountsByDay }) };
    },
    async listCardPage(deckId: string, { page = 0, pageSize = 50, query = "", sort = { field: "sortField", direction: "asc" } as CardTableSort, selectedCardId = null }: {
      page?: number;
      pageSize?: number;
      query?: string;
      sort?: CardTableSort;
      selectedCardId?: string | null;
    } = {}) {
      const normalizedQuery = query.trim().toLocaleLowerCase("de");
      const normalizedPage = Math.max(0, Math.floor(page));
      const limit = Math.min(50, Math.max(1, pageSize));
      const offset = normalizedPage * limit;
      const indexName = sort.field === "nextStudyDate" ? "deckDue" : sort.field === "variants" ? "deckVariants" : "deckFront";
      const lower = indexName === "deckVariants" ? [deckId, 0, ""] : [deckId, "", ""];
      const upper = indexName === "deckVariants" ? [deckId, 1, "\uffff"] : [deckId, "\uffff", "\uffff"];
      const retained: StoredCard[] = [];
      let totalCount = 0;
      let advanced = false;
      let boundary: IDBValidKey | null = null;
      let finished = false;
      do {
        const transaction = database.transaction(STORE.cards, "readonly");
        const cardStore = transaction.objectStore(STORE.cards);
        const index = cardStore.index(indexName);
        const range = boundary == null
          ? IDBKeyRange.bound(lower, upper)
          : sort.direction === "desc"
            ? IDBKeyRange.bound(lower, boundary, false, true)
            : IDBKeyRange.bound(boundary, upper, true, false);
        const totalCountPromise = !normalizedQuery && boundary == null ? requestResult(index.count(range)) : null;
        const request = index.openCursor(range, sort.direction === "desc" ? "prev" : "next");
        let scanned = 0;
        await new Promise<void>((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) { finished = true; resolve(); return; }
            if (!normalizedQuery && offset > 0 && !advanced) {
              advanced = true;
              cursor.advance(offset);
              return;
            }
            const row = cursor.value as StoredCard;
            scanned += 1;
            if (!normalizedQuery || row.normalizedSearchText.includes(normalizedQuery)) {
              if (!normalizedQuery || totalCount >= offset) {
                if (retained.length <= limit) retained.push(row);
              }
              totalCount += 1;
            }
            if ((!normalizedQuery && retained.length > limit) || (normalizedQuery && scanned >= 500)) {
              boundary = cursor.key;
              resolve();
              return;
            }
            cursor.continue();
          };
        });
        if (totalCountPromise) totalCount = await totalCountPromise;
        await transactionDone(transaction);
      } while (normalizedQuery && !finished);
      const rows = retained.slice(0, limit);
      const selectedTransaction = database.transaction(STORE.cards, "readonly");
      const selectedCandidate = selectedCardId
        ? await requestResult<StoredCard | undefined>(selectedTransaction.objectStore(STORE.cards).get(selectedCardId))
        : undefined;
      await transactionDone(selectedTransaction);
      const selectedRecord = selectedCandidate && !rows.some((row) => row.id === selectedCandidate.id) ? selectedCandidate : undefined;
      const recordsToHydrate = selectedRecord?.deckId === deckId ? [...rows, selectedRecord] : rows;
      const variantTransaction = database.transaction(STORE.variants, "readonly");
      const variantsDone = transactionDone(variantTransaction);
      const variantIndex = variantTransaction.objectStore(STORE.variants).index("learningItemId");
      const variantsByCardId = new Map<string, StoredVariant[]>();
      await Promise.all(recordsToHydrate.map(async (record) => {
        variantsByCardId.set(record.id, await requestResult<StoredVariant[]>(variantIndex.getAll(record.id)));
      }));
      await variantsDone;
      return {
        items: rows.map((row) => hydrateCard(row, variantsByCardId, syncConflictCardIds)),
        page: normalizedPage,
        pageSize: limit,
        totalCount,
        hasMore: retained.length > limit || totalCount > offset + limit,
        selectedCard: selectedRecord?.deckId === deckId ? hydrateCard(selectedRecord, variantsByCardId, syncConflictCardIds) : null,
      };
    },
    async loadReviewSession(deckIds: string[], options: {
      now?: string;
      dayStartHour?: number;
      timeZone?: string;
      limit?: number;
      cursorByDeck?: Record<string, { dueAt: string; id: string }>;
    } = {}) {
      await writeChain;
      const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 50)));
      const perDeckLimit = limit + 1;
      const transaction = database.transaction([STORE.cards, STORE.reviewEvents], "readonly");
      const dueIndex = transaction.objectStore(STORE.cards).index("deckDue");
      const cardPagePromises = deckIds.map((deckId) => new Promise<StoredCard[]>((resolve, reject) => {
        const cursor = options.cursorByDeck?.[deckId];
        const lower = cursor ? [deckId, cursor.dueAt, cursor.id] : [deckId, "", ""];
        const range = IDBKeyRange.bound(lower, [deckId, "\uffff", "\uffff"], Boolean(cursor), false);
        const rows: StoredCard[] = [];
        const request = dueIndex.openCursor(range);
        request.onerror = () => reject(request.error ?? new Error("Lernkarten konnten nicht gelesen werden."));
        request.onsuccess = () => {
          const entry = request.result;
          if (!entry || rows.length >= perDeckLimit) { resolve(rows); return; }
          const row = entry.value as StoredCard;
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
      const [cardsByDeck, reviewEventsByDeck] = await Promise.all([
        Promise.all(cardPagePromises),
        Promise.all(reviewEventPromises),
      ]);
      const reviewEvents = reviewEventsByDeck.flat();
      await transactionDone(transaction);
      const candidates = cardsByDeck.flat().sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id));
      const cards = candidates.slice(0, limit);
      const cursorByDeck = { ...(options.cursorByDeck ?? {}) };
      for (const card of cards) cursorByDeck[card.deckId] = { dueAt: card.dueAt, id: card.id };
      const variantTransaction = database.transaction(STORE.variants, "readonly");
      const variantIndex = variantTransaction.objectStore(STORE.variants).index("learningItemId");
      const variantsByCardId = new Map<string, StoredVariant[]>();
      await Promise.all(cards.map(async (card) => {
        variantsByCardId.set(card.id, await requestResult<StoredVariant[]>(variantIndex.getAll(card.id)));
      }));
      await transactionDone(variantTransaction);
      return {
        cards: cards
          .map((record) => ({ deckId: record.deckId, item: hydrateCard(record, variantsByCardId, syncConflictCardIds) })),
        reviewEvents,
        cursorByDeck,
        hasMore: candidates.length > cards.length || cardsByDeck.some((rows) => rows.length >= perDeckLimit),
      };
    },
    async queryStatistics(input: StatisticsSelection) {
      await writeChain;
      const { createStatisticsAccumulator } = await import("./statisticsModel.ts");
      const decks = shell!.decks.map((deck) => ({ ...deck, cards: [], reviewEvents: [] } as Deck));
      const accumulator = createStatisticsAccumulator(decks, input);
      const scopeIds = new Set(accumulator.scopeDeckIds);

      const cardTransaction = database.transaction(STORE.cards, "readonly");
      await iterateCursor(cardTransaction.objectStore(STORE.cards).openCursor(), (record: StoredCard) => {
        if (scopeIds.has(record.deckId)) accumulator.addCard(record.deckId, hydrateCard(record, new Map()));
      });
      await transactionDone(cardTransaction);

      const variantTransaction = database.transaction(STORE.variants, "readonly");
      await iterateCursor(variantTransaction.objectStore(STORE.variants).openCursor(), (variant: StoredVariant) => {
        if (scopeIds.has(variant.deckId)) accumulator.addVariant(variant.deckId, variant);
      });
      await transactionDone(variantTransaction);

      const eventTransaction = database.transaction(STORE.reviewEvents, "readonly");
      await iterateCursor(eventTransaction.objectStore(STORE.reviewEvents).index("answeredAt").openCursor(), (event: ReviewEvent) => accumulator.addReview(event));
      await transactionDone(eventTransaction);

      const retentionTransaction = database.transaction(STORE.reviewEvents, "readonly");
      await iterateCursor(retentionTransaction.objectStore(STORE.reviewEvents).index("reviewableAnswered").openCursor(), (event: ReviewEvent) => accumulator.addRetentionReview(event));
      await transactionDone(retentionTransaction);
      return accumulator.finish();
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
    confirmCloudSync() {
      for (const key of LEGACY_STATE_KEYS) legacyStorage?.removeItem(key);
    },
    close: () => database.close(),
  };
}

export type IndexedDbCoreRepository = Awaited<ReturnType<typeof createIndexedDbCoreRepository>>;
