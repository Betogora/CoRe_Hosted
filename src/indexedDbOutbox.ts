// Private to indexedDbCoreRepository.ts: the in-memory mirror of the waiting outbox and its writes.
import type { SyncOutboxMutation } from "./syncEngine.ts";
import { STORE, mutationId, transactionDone } from "./indexedDbStore.ts";

export function createReplicaOutbox({ userId, database, outboxRows, enqueueWrite, flushWrites }: {
  userId: string;
  database: IDBDatabase;
  outboxRows: SyncOutboxMutation[];
  enqueueWrite: <T>(write: () => Promise<T>) => Promise<T>;
  flushWrites: () => Promise<void>;
}) {
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
  // A review and its take-back both carry the event, the card and the variant they change.
  const isReviewMutation = (mutation: SyncOutboxMutation) => mutation.type === "review-atomic" || mutation.type === "review-undo";
  const reviewTargetId = (mutation: SyncOutboxMutation, table: string) => {
    const payload = mutation.payload as any;
    return table === "cards" ? payload?.card?.id
      : table === "card_variants" ? payload?.variant?.id
        : table === "review_events" ? payload?.event?.id
          : null;
  };
  const pendingEntityMutation = (table: string, entityId: string) => pendingByTarget.get(mutationTargetKey({ type: "entity-mutation", table, entityId }))
    ?? (table === "cards" || table === "card_variants" || table === "review_events"
      ? [...pendingByTarget.values()].reverse().find((mutation) => isReviewMutation(mutation) && reviewTargetId(mutation, table) === entityId)
      : undefined);
  const pendingEntityIdsForTable = (table: string) => [...pendingByTarget.values()].flatMap((mutation) => {
    if (mutation.type === "entity-mutation" && mutation.table === table && mutation.entityId) return [mutation.entityId];
    if (!isReviewMutation(mutation)) return [];
    const id = reviewTargetId(mutation, table);
    return id ? [id] : [];
  });
  const pendingEntityMutationIds = (table: string, entityId: string) => [...pendingByTarget.values()]
    .filter((mutation) => mutation.type === "entity-mutation" && mutation.table === table && mutation.entityId === entityId)
    .map((mutation) => mutation.id);

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

  const persistOutboxEntries = (ids: string[]) => void enqueueWrite(async () => {
    const transaction = database.transaction(STORE.outbox, "readwrite");
    for (const id of ids) {
      const mutation = pendingOutbox.get(id);
      if (mutation) transaction.objectStore(STORE.outbox).put(mutation);
    }
    await transactionDone(transaction);
  });

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

  return { outbox, rememberPending, pendingEntityMutation, pendingEntityIdsForTable, pendingEntityMutationIds, queueMutations, writeOutbox };
}
