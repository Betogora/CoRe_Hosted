import { appendReviewEvent, listAccountSyncConflicts, loadAccountCloudState, resolveAccountSyncConflict, upsertAccountCloudState } from "./cloudRepository.js";
import { createSyncOutbox } from "./syncOutbox.js";

export const SYNC_MUTATION_TYPES = Object.freeze({
  statePatch: "state-patch",
  reviewEventAppend: "review-event-append",
});

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "sync") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createMutation(input = {}, now = nowIso, deviceId = null) {
  return {
    id: input.id ?? makeId("mutation"),
    type: input.type ?? SYNC_MUTATION_TYPES.statePatch,
    payload: input.payload ?? {},
    baseRevision: input.baseRevision ?? null,
    deviceId: input.deviceId ?? deviceId,
    table: input.table ?? (input.type === SYNC_MUTATION_TYPES.reviewEventAppend ? "review_events" : null),
    entityId: input.entityId ?? input.payload?.event?.id ?? null,
    createdAt: input.createdAt ?? now(),
  };
}

function uniqueById(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function mergeAppendOnlyRows(localRows = [], remoteRows = []) {
  return uniqueById([...remoteRows, ...localRows]);
}

export function detectRevisionConflict({ localRow, remoteRow, baseRevision, contentFields = [] } = {}) {
  if (!localRow || !remoteRow || baseRevision == null) return null;
  const remoteRevision = Number(remoteRow.revision ?? 0);
  if (remoteRevision <= Number(baseRevision)) return null;

  const changedFields = contentFields.filter((field) => JSON.stringify(localRow[field] ?? null) !== JSON.stringify(remoteRow[field] ?? null));
  if (changedFields.length === 0) return null;

  return {
    entityId: localRow.id ?? remoteRow.id,
    baseRevision,
    localRevision: localRow.revision ?? null,
    remoteRevision,
    changedFields,
    localValue: Object.fromEntries(changedFields.map((field) => [field, localRow[field] ?? null])),
    remoteValue: Object.fromEntries(changedFields.map((field) => [field, remoteRow[field] ?? null])),
  };
}

function createDefaultAdapter(client) {
  return {
    loadSnapshot(fallbackState) {
      return loadAccountCloudState(client, fallbackState);
    },
    upsertState(state, context = {}) {
      return upsertAccountCloudState(client, state, {
        deviceId: context.deviceId,
        now: context.flushedAt ? () => context.flushedAt : undefined,
      });
    },
    listConflicts() {
      return listAccountSyncConflicts(client);
    },
    resolveConflict(conflictId, resolution) {
      return resolveAccountSyncConflict(client, conflictId, resolution);
    },
    async applyMutationBatch(mutations, context = {}) {
      const acknowledgedMutationIds = [];
      const failedMutationIds = [];
      for (const mutation of mutations) {
        if (mutation.type !== SYNC_MUTATION_TYPES.reviewEventAppend) {
          failedMutationIds.push(mutation.id);
          continue;
        }
        try {
          await appendReviewEvent(client, mutation.payload?.event, {
            mutationId: mutation.id,
            deviceId: mutation.deviceId ?? context.deviceId,
            flushedAt: context.flushedAt,
          });
          acknowledgedMutationIds.push(mutation.id);
        } catch (error) {
          failedMutationIds.push(mutation.id);
        }
      }
      return { acknowledgedMutationIds, failedMutationIds, conflicts: [] };
    },
  };
}

export function createSyncEngine({ adapter, deviceId = "browser-device", now = nowIso, outbox } = {}) {
  if (!adapter) throw new Error("Sync-Engine braucht einen Adapter.");
  if (!outbox) throw new Error("Sync-Engine braucht eine persistente Outbox.");
  let lastFlush = null;
  let activeFlush = null;

  return {
    async loadSnapshot(fallbackState = {}) {
      return adapter.loadSnapshot(fallbackState);
    },

    enqueueMutation(input = {}) {
      return outbox.enqueue(createMutation(input, now, deviceId));
    },

    pendingCount() {
      return outbox.count();
    },

    async flush() {
      if (activeFlush) return activeFlush;
      activeFlush = (async () => {
        const batch = outbox.listPending();
        if (batch.length === 0) return lastFlush ?? { mutations: 0, conflicts: [], saved: null };
        const latestStatePatch = [...batch].reverse().find((mutation) => mutation.type === SYNC_MUTATION_TYPES.statePatch);
        const result = {
          mutations: batch.length,
          conflicts: [],
          saved: null,
          deviceId,
          flushedAt: now(),
        };

        if (latestStatePatch?.payload?.state) {
          try {
            result.saved = await adapter.upsertState(latestStatePatch.payload.state, { deviceId, mutations: batch, flushedAt: result.flushedAt });
            const statePatchIds = batch.filter((mutation) => mutation.type === SYNC_MUTATION_TYPES.statePatch).map((mutation) => mutation.id);
            outbox.markFlushed(statePatchIds, result.flushedAt);
            outbox.remove(statePatchIds);
          } catch (error) {
            outbox.markFailed(batch.filter((mutation) => mutation.type === SYNC_MUTATION_TYPES.statePatch).map((mutation) => mutation.id), error);
            throw error;
          }
        }

        const remaining = batch.filter((mutation) => mutation.type !== SYNC_MUTATION_TYPES.statePatch);
        if (remaining.length > 0 && adapter.applyMutationBatch) {
          try {
            const batchResult = await adapter.applyMutationBatch(remaining, { deviceId, flushedAt: result.flushedAt });
            result.conflicts = batchResult?.conflicts ?? [];
            outbox.markFlushed(batchResult?.acknowledgedMutationIds ?? [], result.flushedAt);
            outbox.remove(batchResult?.acknowledgedMutationIds ?? []);
            outbox.markFailed(batchResult?.failedMutationIds ?? [], new Error("Mutation konnte nicht synchronisiert werden."));
          } catch (error) {
            outbox.markFailed(remaining.map((mutation) => mutation.id), error);
            throw error;
          }
        } else if (remaining.length > 0) {
          outbox.markFailed(remaining.map((mutation) => mutation.id), new Error("Sync-Adapter unterstützt diese Mutation nicht."));
        }

        lastFlush = result;
        return result;
      })();
      try {
        return await activeFlush;
      } finally {
        activeFlush = null;
      }
    },

    async listConflicts() {
      if (!adapter.listConflicts) return [];
      return adapter.listConflicts();
    },

    async resolveConflict(conflictId, resolution) {
      if (!adapter.resolveConflict) throw new Error("Dieser Sync-Adapter kann Konflikte nicht auflösen.");
      return adapter.resolveConflict(conflictId, { ...resolution, deviceId, resolvedAt: now() });
    },
  };
}

export function createAccountSyncEngine(client, options = {}) {
  if (!options.userId || !options.storage) throw new Error("Account-Sync braucht Nutzer-ID und accountgebundenen Speicher.");
  return createSyncEngine({
    ...options,
    adapter: options.adapter ?? createDefaultAdapter(client),
    outbox: options.outbox ?? createSyncOutbox({ userId: options.userId, storage: options.storage, now: options.now }),
  });
}
