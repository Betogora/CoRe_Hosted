import type { CardStudyState, ReviewEvent } from "./coreTypes.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import { STORE, mutationId, transactionDone } from "./indexedDbStore.ts";

/** A local change for the cloud; the outbox adds identity, account and retry bookkeeping. */
export interface OutboxMutationInput {
  type: string;
  table?: string | null;
  entityId?: string | null;
  baseRevision?: number | null;
  payload?: object;
  /** Only for mutations whose id the cloud recognizes again, such as an answer. */
  id?: string;
  createdAt?: string;
}

/** Staged mutations are pending at once; `write` stores them in the transaction of the change they describe. */
export interface StagedMutations {
  readonly count: number;
  write(transaction: IDBTransaction): void;
}

type ReviewPayload = { event: ReviewEvent; card: { id: string; study: CardStudyState; updatedAt: string }; variant: { id: string } | null };
// An answer and its take-back both carry the event, the card and the variant they change.
const reviewPayload = (mutation: SyncOutboxMutation) => (mutation.type === "review-atomic" || mutation.type === "review-undo" ? mutation.payload as ReviewPayload : null);

export function createReplicaOutbox({ userId, database, outboxRows, enqueueWrite, flushWrites }: {
  userId: string;
  database: IDBDatabase;
  outboxRows: SyncOutboxMutation[];
  enqueueWrite: <T>(write: () => Promise<T>) => Promise<T>;
  flushWrites: () => Promise<void>;
}) {
  const pendingOutbox = new Map<string, SyncOutboxMutation>(outboxRows.map((mutation) => [mutation.id, mutation]));
  const mutationTargetKey = (mutation: Pick<OutboxMutationInput, "type" | "table" | "entityId">) => (
    mutation.type === "profile-patch" ? "profile" : `${mutation.type}:${mutation.table ?? null}:${mutation.entityId ?? null}`
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
    const payload = reviewPayload(mutation);
    return table === "cards" ? payload?.card.id
      : table === "card_variants" ? payload?.variant?.id
        : table === "review_events" ? payload?.event.id
          : undefined;
  };
  const pendingEntityMutation = (table: string, entityId: string) => pendingByTarget.get(mutationTargetKey({ type: "entity-mutation", table, entityId }))
    ?? (table === "cards" || table === "card_variants" || table === "review_events"
      ? [...pendingByTarget.values()].reverse().find((mutation) => reviewTargetId(mutation, table) === entityId)
      : undefined);
  const pendingEntityIdsForTable = (table: string) => [...pendingByTarget.values()].flatMap((mutation) => {
    if (mutation.type === "entity-mutation" && mutation.table === table && mutation.entityId) return [mutation.entityId];
    const id = reviewTargetId(mutation, table);
    return id ? [id] : [];
  });
  const pendingEntityMutationIds = (table: string, entityId: string) => [...pendingByTarget.values()]
    .filter((mutation) => mutation.type === "entity-mutation" && mutation.table === table && mutation.entityId === entityId)
    .map((mutation) => mutation.id);

  const stageMutations = (inputs: readonly OutboxMutationInput[]): StagedMutations => {
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
      const tombstone = (payload: unknown) => Boolean((payload as { tombstone?: unknown } | undefined)?.tombstone);
      const keepsPendingInsert = replaced?.type === "entity-mutation" && replaced.baseRevision == null && !tombstone(replaced.payload) && !tombstone(input.payload);
      const mutation: SyncOutboxMutation = {
        id: input.id ?? mutationId(),
        userId,
        deviceId: null,
        type: input.type,
        table: input.table ?? null,
        entityId: input.entityId ?? null,
        baseRevision: keepsPendingInsert ? null : input.baseRevision ?? null,
        payload: keepsPendingInsert ? { ...input.payload, baseRevision: null } : input.payload ?? {},
        createdAt: input.createdAt ?? new Date().toISOString(),
        flushedAt: null,
        retryCount: 0,
        lastError: null,
      };
      rememberPending(mutation);
      queued.push(mutation);
    }
    return {
      count: queued.length,
      write(transaction) {
        const store = transaction.objectStore(STORE.outbox);
        for (const id of removedIds) store.delete(id);
        for (const mutation of queued) store.put(mutation);
      },
    };
  };
  const listPending = () => [...pendingOutbox.values()].filter((mutation) => !mutation.flushedAt).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));

  const persistOutboxEntries = (ids: string[]) => void enqueueWrite(async () => {
    const transaction = database.transaction(STORE.outbox, "readwrite");
    for (const id of ids) {
      const mutation = pendingOutbox.get(id);
      if (mutation) transaction.objectStore(STORE.outbox).put(mutation);
    }
    await transactionDone(transaction);
  });

  const outbox = {
    listPending,
    /** Cards and contents whose local change has not reached the cloud; `createdCardIds` were created here. */
    pendingChangeIds() {
      const cardIds = new Set<string>();
      const noteIds = new Set<string>();
      const createdCardIds = new Set<string>();
      for (const mutation of listPending()) {
        const review = reviewPayload(mutation);
        if (review) cardIds.add(review.card.id);
        else if (mutation.table === "cards" && mutation.entityId) {
          cardIds.add(mutation.entityId);
          if (mutation.baseRevision === null) createdCardIds.add(mutation.entityId);
        } else if (mutation.table === "notes" && mutation.entityId) noteIds.add(mutation.entityId);
      }
      return { cardIds, noteIds, createdCardIds };
    },
    /** The study state of each card after its latest answer or take-back that has not reached the cloud. */
    pendingStudyStates() {
      const states = new Map<string, CardStudyState>();
      for (const mutation of listPending()) {
        const review = reviewPayload(mutation);
        if (review) states.set(review.card.id, review.card.study);
      }
      return states;
    },
    takenBackReviewEventIds() {
      return new Set(listPending().flatMap((mutation) => mutation.type === "review-undo" && mutation.entityId ? [mutation.entityId] : []));
    },
    /** Answers that have not reached the cloud and were not taken back. */
    pendingReviewEvents() {
      const takenBack = outbox.takenBackReviewEventIds();
      return listPending().flatMap((mutation) => {
        const review = mutation.type === "review-atomic" ? reviewPayload(mutation) : null;
        return review && !takenBack.has(review.event.id) ? [review.event] : [];
      });
    },
    markFlushed(idsToFlush: string[] = [], flushedAt = new Date().toISOString()) {
      for (const id of idsToFlush) {
        const mutation = pendingOutbox.get(id);
        if (mutation) {
          forgetPending(id);
          pendingOutbox.set(id, { ...mutation, flushedAt });
        }
      }
      persistOutboxEntries(idsToFlush);
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
      persistOutboxEntries(idsToFail);
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
    flushPersistence: flushWrites,
  };

  return { outbox, pendingEntityMutation, pendingEntityIdsForTable, pendingEntityMutationIds, stageMutations };
}
