import { createDefaultDeckSettings, rescheduleCard, resetCardStudy, restoreCardStudy, setCardLeech } from "./coreModel.ts";
import { normalizeWorkspaceState } from "./coreRepository.ts";
import type {
  Card,
  CardVariant,
  Deck,
  ImportVerificationRepairScope,
  ImportVerificationScope,
  Note,
  Profile,
  ReviewEvent,
} from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import type { CardTableSort } from "./libraryModel.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import type { CloudCatalogPage, CloudEntityPage } from "./cloudRepository.ts";
import type { ReviewAnswerResult } from "./reviewService.ts";
import type { ImportCommitGraph, NoteTypeSource } from "./apkgImport.ts";
import { getLearningDayKey, getLearningDayRange } from "./learningDay.ts";
import { insertEntityMutation, planEntityMutations } from "./syncMutationPlanner.ts";
import { isEmptyCardSearch, parseCardSearchQuery, type CardSearchContext } from "./cardSearchQuery.ts";
import { MANUAL_BURY_KIND, MANUAL_UNBURY_KIND } from "./siblingBurying.ts";
import { createTagDirectoryBuilder } from "./tagDirectory.ts";
import type { StatisticsSelection } from "./statisticsModel.ts";
import { requireCompleteProfile } from "./profileIntegrity.ts";
import { markStartupPhaseReady, markStartupPhaseStarted } from "./appPerformance.ts";
import {
  catalogEntryFromCard,
  withStudyEvents,
  MANUAL_RESCHEDULE_KIND,
  type AccountBaselineState,
  type AccountStatisticsSnapshot,
  type AccountStudyOverview,
  type CardBodyResidencyRecord,
  type DeckStudySummary,
  type ReplicaStatus,
} from "./workspaceReplica.ts";
import {
  STORE,
  CATALOG_PAGE_LIMIT,
  type NoteGraphChange,
  type StoredCard,
  type StoredCardCatalog,
  type StoredReviewDayCounts,
  type WorkspaceDeckSummary,
  requestResult,
  transactionDone,
  iterateCursor,
  openDatabase,
  cardRecord,
  variantRecord,
  hydrateCard,
  storedCatalogRecord,
  catalogRecordFor,
  residencyRecord,
  deckRecord,
  mutationId,
  loadShell,
  writeState,
  emptyDeckStudySummary,
} from "./indexedDbStore.ts";
import { loadAnsweredTodayFrom } from "./indexedDbStudyCounts.ts";
import { createReplicaOutbox } from "./indexedDbOutbox.ts";
import { createCatalogSearch, type CatalogCursor } from "./indexedDbCatalogSearch.ts";
import { createStudyOverview } from "./indexedDbStudyOverview.ts";
import { writeCloudCatalogPages } from "./indexedDbCatalogSync.ts";
import { createCardBodies, readCardBodies, readNotes } from "./indexedDbCardBodies.ts";
import { commitImportGraph, type ImportCommitOptions } from "./indexedDbImportCommit.ts";

export type { NoteGraphChange, WorkspaceDeckSummary } from "./indexedDbStore.ts";
export type { ReimportTargets } from "./indexedDbImportCommit.ts";

interface IndexedDbRepositoryOptions {
  userId: string;
  initialState: WorkspaceState;
  indexedDb?: IDBFactory | null;
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

  const flushWrites = () => writeChain;
  const {
    outbox,
    rememberPending,
    pendingEntityMutation,
    pendingEntityIdsForTable,
    pendingEntityMutationIds,
    queueMutations,
    writeOutbox,
  } = createReplicaOutbox({ userId, database, outboxRows, enqueueWrite, flushWrites });
  let syncConflictCardIds = new Set<string>(syncConflictCardIdRow?.value ?? []);
  let replicaStatus: ReplicaStatus = replicaStatusRow?.value ?? {
    accountBaselineState: shell!.decks.length > 0 ? "nonempty" : "uninitialized",
    catalogCompleteness: "empty",
    catalogCursor: 0,
    catalogServerCursor: 0,
  };
  const pageCursorsByKey = new Map<string, Map<number, CatalogCursor | null>>();
  const catalogSearch = createCatalogSearch(database, flushWrites);
  const { searchIndex, markCatalogChanged, ensureSearchIndex } = catalogSearch;

  const putSyncMetadata = async (key: string, value: unknown) => {
    const transaction = database.transaction(STORE.syncMetadata, "readwrite");
    transaction.objectStore(STORE.syncMetadata).put({ key, value });
    await transactionDone(transaction);
  };

  const studyOverview = createStudyOverview({
    database,
    flushWrites,
    decks: () => shell!.decks,
    isCatalogComplete: () => replicaStatus.catalogCompleteness === "complete",
    putSyncMetadata,
    initial: {
      studyOverview: studyOverviewRow?.value ?? null,
      reviewHourCounts: reviewHourCountRow?.value ?? null,
      reviewDayCounts: reviewDayCountRow?.value ?? null,
    },
  });
  const { applyReplicaCatalogChanges, applyReplicaCatalogChange } = studyOverview;
  const cardBodies = createCardBodies(database, {
    flushWrites,
    pendingEntityMutation,
    pendingEntityIdsForTable,
    markCatalogChanged,
    applyReplicaCatalogChange,
  });
  const { loadCardBody, loadCardBodies, loadNoteGraph, applyHydratedBodies } = cardBodies;

  const replaceShellDecks = (decks: WorkspaceDeckSummary[], updatedAt = new Date().toISOString()) => {
    const replacements = new Map(decks.map((deck) => [deck.id, deck]));
    shell = { ...shell!, decks: [...decks, ...shell!.decks.filter((deck) => !replacements.has(deck.id))], updatedAt };
  };

  /**
   * Manual study changes (reschedule, reset, leech, bury, undo) travel as idempotent manual review events, so they
   * never conflict with reviews or card edits on other devices; statistics and FSRS ignore them.
   */
  const applyManualStudyChanges = (cardIds: string[], kind: string, change: (card: Card) => Card, occurredAt: string) => {
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
        const card = change(previous);
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
          schedulerAfter: { card: { state: card.study.state, dueAt: card.study.dueAt, intervalDays: card.study.intervalDays } },
          flags: { kind },
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
      const storedCatalogs = await Promise.all(changes.map(({ card }) => requestResult<StoredCardCatalog | undefined>(transaction.objectStore(STORE.cardCatalog).get(card.id))));
      const catalogChanges = changes.map(({ previous, card, event }, index) => {
        const note = notes.get(card.noteId) ?? null;
        const previousCatalog = storedCatalogs[index] ?? catalogRecordFor(previous, note);
        const nextCatalog = catalogRecordFor(card, note, withStudyEvents(previousCatalog, [event]));
        transaction.objectStore(STORE.cards).put(cardRecord(card));
        transaction.objectStore(STORE.reviewEvents).put(event);
        transaction.objectStore(STORE.cardCatalog).put(nextCatalog); markCatalogChanged(nextCatalog.id);
        transaction.objectStore(STORE.bodyResidency).put(residencyRecord(nextCatalog, "cached"));
        return { deckId: card.deckId, before: previousCatalog, after: nextCatalog };
      });
      await applyReplicaCatalogChanges(transaction, catalogChanges, occurredAt);
      writeOutbox(transaction, mutationBatch);
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: occurredAt });
      await completed;
      shell = { ...shell!, updatedAt: occurredAt };
      return changes.map((change) => change.card);
    });
  };

  /**
   * Central local write of contents with their cards: stores, catalog, deck summaries and outbox in one
   * transaction. Deleted contents and cards leave the replica; their soft-delete travels through the outbox.
   */
  const keepsVariants = (previous: Card | undefined, card: Card) => !card.deletedAt && previous?.variants === card.variants && previous.deckId === card.deckId;
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
    const variantStore = transaction.objectStore(STORE.variants);
    // A card handed back unchanged (same object, same content) is not written again; a changed content rewrites the
    // catalog rows of all its cards. All reads go out at once, so a mass action (KV4) waits for one round trip.
    const entries = changes.flatMap(({ previous, next }) => {
      const noteChanged = previous?.note !== next.note;
      const unchanged = new Set(noteChanged ? [] : previous?.cards ?? []);
      return next.cards.filter((card) => !unchanged.has(card)).map((card) => ({ note: next.note, card, previous: previous?.cards.find((candidate) => candidate.id === card.id) }));
    });
    const [befores, variantKeys] = await Promise.all([
      Promise.all(entries.map(({ card }) => requestResult<StoredCardCatalog | undefined>(catalogStore.get(card.id)))),
      // Unchanged variants of a card moved within its deck need no key lookup.
      Promise.all(entries.map(({ note, card, previous }) => !note.deletedAt && keepsVariants(previous, card) ? null : requestResult<IDBValidKey[]>(variantStore.index("cardId").getAllKeys(card.id)))),
    ]);
    const catalogChanges: Array<{ deckId: string; before: StoredCardCatalog | null; after: StoredCardCatalog | null }> = [];
    for (const { previous, next } of changes) {
      if (next.note.deletedAt) transaction.objectStore(STORE.notes).delete(next.note.id);
      else if (previous?.note !== next.note) transaction.objectStore(STORE.notes).put(next.note);
    }
    entries.forEach(({ note, card, previous }, index) => {
      const before = befores[index] ?? null;
      const storedVariantKeys = variantKeys[index] ?? [];
      if (card.deletedAt || note.deletedAt) {
        if (before) catalogChanges.push({ deckId: before.deckId, before, after: null });
        transaction.objectStore(STORE.cards).delete(card.id);
        catalogStore.delete(card.id); markCatalogChanged(card.id);
        transaction.objectStore(STORE.bodyResidency).delete(card.id);
        for (const key of storedVariantKeys) variantStore.delete(key);
        return;
      }
      const catalog = catalogRecordFor(card, note, before);
      if (before && before.deckId !== card.deckId) {
        catalogChanges.push({ deckId: before.deckId, before, after: null }, { deckId: card.deckId, before: null, after: catalog });
      } else {
        catalogChanges.push({ deckId: card.deckId, before, after: catalog });
      }
      // A card handed back unchanged under a changed content keeps its stored record.
      if (previous !== card) transaction.objectStore(STORE.cards).put(cardRecord(card));
      catalogStore.put(catalog); markCatalogChanged(catalog.id);
      transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
      if (keepsVariants(previous, card)) return;
      const nextVariantIds = new Set(card.variants.map((variant) => variant.id));
      for (const key of storedVariantKeys) if (!nextVariantIds.has(String(key))) variantStore.delete(key);
      for (const variant of card.variants) variantStore.put(variantRecord(variant, card.deckId));
    });
    await applyReplicaCatalogChanges(transaction, catalogChanges, updatedAt);
    writeOutbox(transaction, mutationBatch);
    transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: updatedAt });
    await done;
    shell = { ...shell!, updatedAt };
  });

  const persistReplicaStatus = async (patch: Partial<ReplicaStatus>) => {
    replicaStatus = { ...replicaStatus, ...patch };
    await putSyncMetadata("replicaStatus", replicaStatus);
    return replicaStatus;
  };

  /**
   * Applies the tables of one catalog delta page in one transaction, in the given order. Search texts that arrive in
   * the same call go into the catalog rows before they are written, so each row is written once.
   */
  const applyCloudCatalogPages = async (pages: CloudCatalogPage[]) => {
    await writeChain;
    await writeCloudCatalogPages(database, pages, {
      pendingEntityMutation,
      pendingEntityIdsForTable,
      markCatalogChanged,
      markCatalogReset: catalogSearch.markCatalogReset,
      applyReplicaCatalogChanges,
    });
    if (pages.some((page) => page.table === "decks")) shell = await loadShell(database);
    await persistReplicaStatus({
      catalogCursor: Math.max(replicaStatus.catalogCursor, ...pages.map((page) => page.cursor)),
      catalogCompleteness: "partial",
    });
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
    async completeCatalogReconciliation(serverCatalogCursor = replicaStatus.catalogCursor) {
      await writeChain;
      const transaction = database.transaction([STORE.cardCatalog, STORE.noteSearch], "readonly");
      const [catalogRows, searchTexts] = await Promise.all([
        requestResult(transaction.objectStore(STORE.cardCatalog).count()),
        requestResult(transaction.objectStore(STORE.noteSearch).count()),
      ]);
      return persistReplicaStatus({
        catalogCompleteness: "complete",
        searchTextsReady: catalogRows === 0 || searchTexts > 0,
        catalogCursor: Math.max(replicaStatus.catalogCursor, serverCatalogCursor),
        catalogServerCursor: Math.max(replicaStatus.catalogServerCursor, serverCatalogCursor),
      });
    },
    applyAccountStudyOverview: studyOverview.applyAccountStudyOverview,
    loadDueForecast: studyOverview.loadDueForecast,
    applyDueForecast: studyOverview.applyDueForecast,
    applyCloudCatalogPages,
    listCatalogPage: catalogSearch.listCatalogPage,
    missingCardBodyIds: cardBodies.missingCardBodyIds,
    markCardBodiesResident: cardBodies.markCardBodiesResident,
    touchCardBodies: cardBodies.touchCardBodies,
    loadCardBody,
    loadCardBodies,
    loadNotes: cardBodies.loadNotes,
    loadNoteGraph,
    loadNoteGraphs: cardBodies.loadNoteGraphs,
    loadNoteTypeSource: cardBodies.loadNoteTypeSource,
    applyHydratedBodies,
    saveNoteGraphs: writeNoteGraphs,
    updateCard,
    saveOfflineDeck: cardBodies.saveOfflineDeck,
    getOfflineDeck: cardBodies.getOfflineDeck,
    listOfflineDecks: cardBodies.listOfflineDecks,
    appendOfflineManifest: cardBodies.appendOfflineManifest,
    readOfflineManifest: cardBodies.readOfflineManifest,
    clearOfflineManifest: cardBodies.clearOfflineManifest,
    removeOfflineDeck: cardBodies.removeOfflineDeck,
    evictCachedCardBodies: cardBodies.evictCachedCardBodies,
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
    getDeckBodyResidencySummary: cardBodies.getDeckBodyResidencySummary,
    /** All local answers of one card, oldest first, including manual events. */
    async listCardReviewEvents(cardId: string) {
      await writeChain;
      const transaction = database.transaction(STORE.reviewEvents, "readonly");
      const events = await requestResult<ReviewEvent[]>(transaction.objectStore(STORE.reviewEvents).index("cardAnswered").getAll(IDBKeyRange.bound([cardId, "", ""], [cardId, "￿", "￿"])));
      await transactionDone(transaction);
      return events;
    },
    /** Tags of the contents in the replica; offline counterpart of `list_account_tags`. */
    async listTagDirectory() {
      await writeChain;
      const builder = createTagDirectoryBuilder();
      const transaction = database.transaction(STORE.notes, "readonly");
      await iterateCursor<Note>(transaction.objectStore(STORE.notes).openCursor(), (note) => builder.add(note));
      await transactionDone(transaction);
      return builder.entries();
    },
    /** Anki note types of the replica (`note:` search); the catalog delta keeps them complete on every device. */
    async listNoteTypes() {
      await writeChain;
      const transaction = database.transaction(STORE.noteTypeSources, "readonly");
      const sources = await requestResult<NoteTypeSource[]>(transaction.objectStore(STORE.noteTypeSources).getAll());
      await transactionDone(transaction);
      return sources.map(({ id, name }) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "de"));
    },
    /** Manual reschedule: only the due date changes; suspension stays. A map gives each card its own date (KV4). */
    rescheduleCards(cardIds: string[], dueAt: string | ReadonlyMap<string, string>, occurredAt = new Date().toISOString()) {
      return applyManualStudyChanges(cardIds, MANUAL_RESCHEDULE_KIND, (card) => rescheduleCard(card, typeof dueAt === "string" ? dueAt : dueAt.get(card.id)!, occurredAt), occurredAt);
    },
    /** "Lernstand zurücksetzen": the cards start over as new cards; their review history stays. */
    resetCards(cardIds: string[], occurredAt = new Date().toISOString()) {
      return applyManualStudyChanges(cardIds, "manual_reset", (card) => resetCardStudy(card, occurredAt), occurredAt);
    },
    /** Lifts the leech state (`null`) or puts it back, e.g. to undo the reset. */
    setCardsLeech(cardIds: string[], leechedAt: string | null, occurredAt = new Date().toISOString()) {
      return applyManualStudyChanges(cardIds, "manual_leech", (card) => setCardLeech(card, leechedAt, occurredAt), occurredAt);
    },
    /** Puts back earlier study states, to undo a manual study change. */
    restoreCardStudies(studies: ReadonlyMap<string, Card["study"]>, occurredAt = new Date().toISOString()) {
      return applyManualStudyChanges([...studies.keys()], "manual_restore", (card) => restoreCardStudy(card, studies.get(card.id)!, occurredAt), occurredAt);
    },
    /** Buries the cards until the next learning day (or lifts that), the way answered siblings bury theirs. */
    buryCards(cardIds: string[], buried: boolean, occurredAt = new Date().toISOString()) {
      return applyManualStudyChanges(cardIds, buried ? MANUAL_BURY_KIND : MANUAL_UNBURY_KIND, (card) => ({ ...card, studyRevision: card.studyRevision + 1, updatedAt: occurredAt }), occurredAt);
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
      studyOverview.countReview(event.answeredAt);
      void enqueueWrite(async () => {
        const transaction = database.transaction([STORE.cards, STORE.variants, STORE.notes, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.reviewEvents, STORE.outbox, STORE.meta, STORE.syncMetadata], "readwrite");
        const catalogStore = transaction.objectStore(STORE.cardCatalog);
        const previousCatalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(updatedCard.id)) ?? null;
        const note = await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(updatedCard.noteId)) ?? null;
        const history = withStudyEvents(previousCatalog, [event]);
        const catalog = note ? catalogRecordFor(updatedCard, note, history) : storedCatalogRecord({ ...catalogEntryFromCard(updatedCard, null, history), ...(previousCatalog ? { frontPreview: previousCatalog.frontPreview, sortText: previousCatalog.sortText, normalizedSearchText: previousCatalog.normalizedSearchText, marked: previousCatalog.marked, tagKeys: previousCatalog.tagKeys, editedAt: previousCatalog.editedAt, contentKind: previousCatalog.contentKind, noteTypeId: previousCatalog.noteTypeId } : {}) });
        await applyReplicaCatalogChange(transaction, deck.id, previousCatalog, catalog, event.answeredAt);
        await studyOverview.countReviewInOverview(transaction, event, deck.id);
        // A leech the deck suspends also changes the card itself; that edit syncs like any other card change.
        const stored = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(updatedCard.id));
        if (stored && stored.status !== updatedCard.status) {
          writeOutbox(transaction, queueMutations(planEntityMutations({ cards: [hydrateCard(stored)] }, { cards: [{ ...updatedCard, variants: [] }] })));
        }
        transaction.objectStore(STORE.cards).put(cardRecord(updatedCard));
        catalogStore.put(catalog); markCatalogChanged(catalog.id);
        transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
        if (variant) transaction.objectStore(STORE.variants).put(variantRecord(variant, updatedCard.deckId));
        transaction.objectStore(STORE.reviewEvents).put(event);
        transaction.objectStore(STORE.outbox).put(mutation);
        transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: event.answeredAt });
        studyOverview.writeReviewCounts(transaction);
        await transactionDone(transaction);
      });
      return result;
    },
    async commitImportGraph(graph: ImportCommitGraph, options: ImportCommitOptions) {
      await writeChain;
      return commitImportGraph({
        database,
        userId,
        shellDecks: () => shell!.decks,
        replaceShellDecks,
        queueMutations,
        writeOutbox,
        writeNoteGraphs,
      }, graph, options);
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
      const inputs = [
        ...noteTypeSources.map((source) => insertEntityMutation("note_type_sources", source)),
        ...(decks as WorkspaceDeckSummary[]).map((deck) => insertEntityMutation("decks", deck)),
        ...(notes as Note[]).map((note) => insertEntityMutation("notes", note)),
        ...noteSources.filter(Boolean).map((source) => insertEntityMutation("note_sources", source, source.noteId)),
        ...(cards as Card[]).map((card) => insertEntityMutation("cards", cardRecord(card))),
        ...(cards as Card[]).flatMap((card) => card.variants.map((variant) => insertEntityMutation("card_variants", variant))),
        ...(reviews as ReviewEvent[]).map((review) => insertEntityMutation("review_events", review)),
      ];
      const batch = queueMutations(inputs);
      const write = database.transaction(STORE.outbox, "readwrite");
      writeOutbox(write, batch);
      await transactionDone(write);
      return batch.queued.length;
    },
    getSyncConflictCardIds: (): ReadonlySet<string> => new Set(syncConflictCardIds),
    async readSyncMetadata(key: string): Promise<unknown> {
      const transaction = database.transaction(STORE.syncMetadata, "readonly");
      const row = await requestResult<{ value?: unknown } | undefined>(transaction.objectStore(STORE.syncMetadata).get(key));
      return row?.value;
    },
    writeSyncMetadata: putSyncMetadata,
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
      await putSyncMetadata("syncConflictCardIds", [...syncConflictCardIds]);
    },
    async prepareConflictResolution(result: any, decision: any) {
      const target = result?.resolutionTarget;
      if (!target || !["keep-local", "keep-remote", "merge-fields"].includes(decision?.action)) return;
      const mutationIds = pendingEntityMutationIds(target.table, target.entityId);
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
    listDeckSummaries: studyOverview.listDeckSummaries,
    /** Loads the search index ahead of the first search, in short batches. */
    prepareCardSearch: () => ensureSearchIndex(),
    loadCatalogEntries: catalogSearch.loadCatalogEntries,
    findDuplicates: catalogSearch.findDuplicates,
    listCardIds: catalogSearch.listCardIds,
    /**
     * Catalog page by page number of one deck, or of several decks as one list (the flat hit list), plus the opened
     * content with its siblings. The search index answers any page at once (KV3); a single deck without a search
     * walks its keyset pages only until the index is loaded.
     */
    async listCardPage(scope: string | readonly string[], { page = 0, pageSize = CATALOG_PAGE_LIMIT, query = "", sort = { field: "sortField", direction: "asc" } as CardTableSort, selectedCardId = null, searchContext }: {
      page?: number;
      pageSize?: number;
      query?: string;
      sort?: CardTableSort;
      selectedCardId?: string | null;
      searchContext?: CardSearchContext;
    } = {}) {
      const deckIds = typeof scope === "string" ? [scope] : scope;
      const selected = async () => {
        const selectedBody = selectedCardId ? await loadCardBody(selectedCardId) : null;
        const selectedGraph = selectedBody && deckIds.includes(selectedBody.card.deckId) ? await loadNoteGraph(selectedBody.note.id) : null;
        return selectedGraph && selectedBody ? { ...selectedGraph, cardId: selectedBody.card.id } : null;
      };
      await writeChain;
      if (deckIds.length !== 1 || catalogSearch.isSearchIndexReady() || !isEmptyCardSearch(parseCardSearchQuery(query))) {
        await ensureSearchIndex();
        const requestedPage = Math.max(0, Math.floor(page));
        const slice = searchIndex.slice(query, sort, searchContext, deckIds, requestedPage * pageSize, pageSize);
        return {
          items: slice.items,
          page: requestedPage,
          pageSize,
          totalCount: slice.totalCount,
          hasMore: (requestedPage + 1) * pageSize < slice.totalCount,
          selected: await selected(),
        };
      }
      const deckId = deckIds[0];
      const key = JSON.stringify([deckId, query, sort.field, sort.direction, searchContext ?? null]);
      const cursors = pageCursorsByKey.get(key) ?? new Map<number, CatalogCursor | null>([[0, null]]);
      pageCursorsByKey.set(key, cursors);
      let requestedPage = Math.max(0, Math.floor(page));
      while (!cursors.has(requestedPage)) requestedPage -= 1;
      let result = await catalogSearch.listCatalogPage(deckId, { cursor: cursors.get(requestedPage) ?? null, limit: pageSize, query, sort, includeTotal: true, searchContext });
      while (requestedPage < page && result.nextCursor) {
        requestedPage += 1;
        cursors.set(requestedPage, result.nextCursor);
        result = await catalogSearch.listCatalogPage(deckId, { cursor: result.nextCursor, limit: pageSize, query, sort, includeTotal: true, searchContext });
      }
      if (result.nextCursor) cursors.set(requestedPage + 1, result.nextCursor);
      return {
        items: result.items,
        page: requestedPage,
        pageSize,
        totalCount: result.totalCount ?? result.items.length,
        hasMore: result.hasMore,
        selected: await selected(),
      };
    },
    async loadReviewSession(deckIds: string[], options: {
      now?: string;
      dayStartHour?: number;
      timeZone?: string;
      limit?: number;
      cursorByDeck?: Record<string, { dueAt: string; id: string }>;
      cardIds?: string[];
      /** Also returns the cards answered today that sibling burying needs; only set while a burying option is on. */
      answeredSiblings?: boolean;
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
        // Requested cards follow the same rule as the scan: a sync conflict keeps a card out of the session.
        requestedCatalog ? requestedCatalog.then((rows) => [rows.filter((row): row is StoredCardCatalog => Boolean(row) && !syncConflictCardIds.has(row!.id))]) : Promise.all(catalogPagePromises),
        Promise.all(reviewEventPromises),
      ]);
      await transactionDone(transaction);
      const candidates = requestedCatalog
        ? catalogByDeck.flat().sort((left, right) => requestedIds.indexOf(left.id) - requestedIds.indexOf(right.id))
        : catalogByDeck.flat().sort((left, right) => left.dueSort.localeCompare(right.dueSort) || left.id.localeCompare(right.id));
      const selectedCatalog = candidates.slice(0, limit);
      const bodies = (await loadCardBodies(selectedCatalog.map((entry) => entry.id))).filter((body): body is { card: Card; note: Note } => Boolean(body));
      const cursorByDeck = { ...(options.cursorByDeck ?? {}) };
      for (const { card } of bodies) {
        const catalog = selectedCatalog.find((entry) => entry.id === card.id)!;
        cursorByDeck[card.deckId] = { dueAt: catalog.dueSort, id: card.id };
      }
      const reviewEvents = reviewEventsByDeck.flat();
      return {
        cards: bodies.map(({ card }) => ({ deckId: card.deckId, card })),
        notes: [...new Map(bodies.map(({ note }) => [note.id, note])).values()],
        reviewEvents,
        answeredToday: options.answeredSiblings && range
          ? await loadAnsweredTodayFrom(database, reviewEvents, bodies.map(({ card }) => card.noteId), deckIds, range)
          : [],
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
          const catalog = note ? catalogRecordFor(card, note, before) : before ? { ...before, bodyRevision: card.revision, studyRevision: card.studyRevision } : null;
          if (!catalog) continue;
          await applyReplicaCatalogChange(transaction, card.deckId, before, catalog);
          transaction.objectStore(STORE.cardCatalog).put(catalog); markCatalogChanged(catalog.id);
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
