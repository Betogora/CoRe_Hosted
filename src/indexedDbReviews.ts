// Private to indexedDbCoreRepository.ts: an answer and its take-back, each one local write with its outbox mutation.
import type { Card, CardVariant, Note } from "./coreTypes.ts";
import type { createReplicaOutbox } from "./indexedDbOutbox.ts";
import {
  STORE,
  cardRecord,
  catalogRecordFor,
  hydrateCard,
  requestResult,
  residencyRecord,
  storedCatalogRecord,
  transactionDone,
  variantRecord,
  type StoredCard,
  type StoredCardCatalog,
} from "./indexedDbStore.ts";
import type { createStudyOverview } from "./indexedDbStudyOverview.ts";
import type { ReviewAnswerResult } from "./reviewService.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import { planEntityMutations } from "./syncMutationPlanner.ts";
import { catalogEntryFromCard, catalogReviewHistory, withStudyEvents, type CatalogReviewHistory } from "./workspaceReplica.ts";

const REVIEW_STORES = [STORE.cards, STORE.variants, STORE.notes, STORE.cardCatalog, STORE.bodyResidency, STORE.deckStudySummaries, STORE.reviewEvents, STORE.outbox, STORE.meta, STORE.syncMetadata];

export function createReviewWrites({ userId, database, enqueueWrite, outbox, studyOverview, markCatalogChanged }: {
  userId: string;
  database: IDBDatabase;
  enqueueWrite: <T>(write: () => Promise<T>) => Promise<T>;
  outbox: Pick<ReturnType<typeof createReplicaOutbox>, "rememberPending" | "queueMutations" | "writeOutbox">;
  studyOverview: ReturnType<typeof createStudyOverview>;
  markCatalogChanged: (cardId: string) => void;
}) {
  /** Catalog history of a card before each answer of this app session, so taking the answer back restores it. */
  const historyBeforeAnswer = new Map<string, CatalogReviewHistory>();

  /**
   * Stores the answered or restored card with its variant, catalog entry, counters and mutation. An answer stores its
   * event and counts +1; a take-back removes the event and counts -1.
   */
  const write = (result: ReviewAnswerResult, card: Card, variant: CardVariant | null, type: "review-atomic" | "review-undo", at: string, catalogFor: (stored: StoredCardCatalog | null, note: Note | null) => StoredCardCatalog | null) => {
    const { deck, event } = result;
    const takenBack = type === "review-undo";
    const mutation: SyncOutboxMutation = {
      id: takenBack ? `review_undo_${event.id}` : `review_${event.id}`,
      userId,
      deviceId: null,
      type,
      table: "review_events",
      entityId: event.id,
      baseRevision: null,
      payload: {
        event,
        card: { id: card.id, study: card.study, updatedAt: card.updatedAt },
        variant: variant ? { id: variant.id, performance: variant.performance, updatedAt: variant.updatedAt } : null,
      },
      createdAt: at,
      flushedAt: null,
      retryCount: 0,
      lastError: null,
    };
    outbox.rememberPending(mutation);
    studyOverview.countReview(event.answeredAt, takenBack ? -1 : 1);
    void enqueueWrite(async () => {
      const transaction = database.transaction(REVIEW_STORES, "readwrite");
      const catalogStore = transaction.objectStore(STORE.cardCatalog);
      const storedCatalog = await requestResult<StoredCardCatalog | undefined>(catalogStore.get(card.id)) ?? null;
      const note = await requestResult<Note | undefined>(transaction.objectStore(STORE.notes).get(card.noteId)) ?? null;
      const catalog = catalogFor(storedCatalog, note);
      if (takenBack) transaction.objectStore(STORE.reviewEvents).delete(event.id);
      if (catalog) {
        await studyOverview.applyReplicaCatalogChange(transaction, deck.id, storedCatalog, catalog, at);
        catalogStore.put(catalog); markCatalogChanged(catalog.id);
        transaction.objectStore(STORE.bodyResidency).put(residencyRecord(catalog, "cached"));
      }
      // Counted against the other answers of the day: before an answer is stored, after a take-back removed it.
      await studyOverview.countReviewInOverview(transaction, event, deck.id, takenBack ? -1 : 1);
      // A leech the deck suspends (or its take-back) also changes the card itself; that edit syncs like any card change.
      const stored = await requestResult<StoredCard | undefined>(transaction.objectStore(STORE.cards).get(card.id));
      if (stored && stored.status !== card.status) {
        outbox.writeOutbox(transaction, outbox.queueMutations(planEntityMutations({ cards: [hydrateCard(stored)] }, { cards: [{ ...card, variants: [] }] })));
      }
      transaction.objectStore(STORE.cards).put(cardRecord(card));
      if (variant) transaction.objectStore(STORE.variants).put(variantRecord(variant, card.deckId));
      if (!takenBack) transaction.objectStore(STORE.reviewEvents).put(event);
      transaction.objectStore(STORE.outbox).put(mutation);
      transaction.objectStore(STORE.meta).put({ key: "updatedAt", value: at });
      studyOverview.writeReviewCounts(transaction);
      await transactionDone(transaction);
      if (takenBack) historyBeforeAnswer.delete(event.id);
    });
  };

  return {
    recordReview(result: ReviewAnswerResult) {
      const { event, updatedCard, variant } = result;
      write(result, updatedCard, variant, "review-atomic", event.answeredAt, (previous, note) => {
        historyBeforeAnswer.set(event.id, catalogReviewHistory(previous));
        const history = withStudyEvents(previous, [event]);
        return note ? catalogRecordFor(updatedCard, note, history) : storedCatalogRecord({ ...catalogEntryFromCard(updatedCard, null, history), ...(previous ? { frontPreview: previous.frontPreview, sortText: previous.sortText, normalizedSearchText: previous.normalizedSearchText, marked: previous.marked, tagKeys: previous.tagKeys, editedAt: previous.editedAt, contentKind: previous.contentKind, noteTypeId: previous.noteTypeId } : {}) });
      });
      return result;
    },
    /**
     * Takes back an answer of this app session (Strg+Z/U while learning): the event leaves history and counters, the card
     * and its variant get their state from before (`previous`, the card as it was answered), and `undo_review_atomic`
     * removes the event in the account.
     */
    undoReview(result: ReviewAnswerResult, previous: Card) {
      // Never before the answer (a simulated clock runs ahead), so the take-back follows it in the outbox.
      const at = new Date(Math.max(Date.now(), Date.parse(result.event.answeredAt))).toISOString();
      const card: Card = { ...previous, studyRevision: result.updatedCard.studyRevision + 1, updatedAt: at };
      const variant = result.variant ? previous.variants.find((candidate) => candidate.id === result.variant!.id) ?? null : null;
      write(result, card, variant && { ...variant, updatedAt: at }, "review-undo", at, (_, note) => note ? catalogRecordFor(card, note, historyBeforeAnswer.get(result.event.id)) : null);
      return card;
    },
  };
}
