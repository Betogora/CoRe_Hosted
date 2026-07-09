import { listAccountSyncConflicts, loadAccountCloudState, resolveAccountSyncConflict, upsertAccountCloudState } from "./cloudRepository.js";

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

function createMutation(input = {}, now = nowIso) {
  return {
    id: input.id ?? makeId("mutation"),
    type: input.type ?? SYNC_MUTATION_TYPES.statePatch,
    payload: input.payload ?? {},
    baseRevision: input.baseRevision ?? null,
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
    upsertState(state) {
      return upsertAccountCloudState(client, state);
    },
    listConflicts() {
      return listAccountSyncConflicts(client);
    },
    resolveConflict(conflictId, resolution) {
      return resolveAccountSyncConflict(client, conflictId, resolution);
    },
  };
}

export function createSyncEngine({ adapter, deviceId = "browser-device", now = nowIso } = {}) {
  if (!adapter) throw new Error("Sync-Engine braucht einen Adapter.");
  const queue = [];
  let lastFlush = null;

  return {
    async loadSnapshot(fallbackState = {}) {
      return adapter.loadSnapshot(fallbackState);
    },

    enqueueMutation(input = {}) {
      const mutation = createMutation(input, now);
      queue.push(mutation);
      return mutation;
    },

    pendingCount() {
      return queue.length;
    },

    async flush() {
      if (queue.length === 0) {
        return lastFlush ?? { mutations: 0, conflicts: [], saved: null };
      }

      const batch = queue.splice(0, queue.length);
      const latestStatePatch = [...batch].reverse().find((mutation) => mutation.type === SYNC_MUTATION_TYPES.statePatch);
      const result = {
        mutations: batch.length,
        conflicts: [],
        saved: null,
        deviceId,
        flushedAt: now(),
      };

      if (latestStatePatch?.payload?.state) {
        result.saved = await adapter.upsertState(latestStatePatch.payload.state, { deviceId, mutations: batch });
      }

      const remaining = batch.filter((mutation) => mutation !== latestStatePatch);
      if (remaining.length > 0 && adapter.applyMutationBatch) {
        const batchResult = await adapter.applyMutationBatch(remaining, { deviceId });
        result.conflicts = batchResult?.conflicts ?? [];
      }

      lastFlush = result;
      return result;
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
  return createSyncEngine({
    ...options,
    adapter: options.adapter ?? createDefaultAdapter(client),
  });
}
