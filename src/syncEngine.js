import {
  appendReviewEvent,
  listAccountSyncConflicts,
  loadAccountCloudState,
  registerAccountSyncDevice,
  resolveAccountSyncConflict,
  upsertAccountCloudState,
} from "./cloudRepository.js";
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

function normalizeDevice(device = {}) {
  const id = String(device?.id ?? "").trim();
  if (!id) throw new Error("Sync-Engine braucht eine Geräte-ID.");
  return {
    id,
    label: String(device?.label ?? "Browser").trim() || "Browser",
    userAgent: typeof device?.userAgent === "string" ? device.userAgent : "",
  };
}

function createDeviceRegistrationError(error) {
  const registrationError = new Error("Dieses Gerät konnte nicht für die Synchronisierung registriert werden.", { cause: error });
  registrationError.name = "SyncDeviceRegistrationError";
  registrationError.code = "sync_device_registration_failed";
  return registrationError;
}

function createMutation(input = {}, now = nowIso, deviceId) {
  return {
    id: input.id ?? makeId("mutation"),
    type: input.type ?? SYNC_MUTATION_TYPES.statePatch,
    payload: input.payload ?? {},
    baseRevision: input.baseRevision ?? null,
    deviceId,
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
    registerDevice(device, context = {}) {
      return registerAccountSyncDevice(client, device, { lastSeenAt: context.lastSeenAt });
    },
    loadSnapshot(fallbackState) {
      return loadAccountCloudState(client, fallbackState);
    },
    upsertState(state, context = {}) {
      return upsertAccountCloudState(client, state, {
        deviceId: context.deviceId,
        mutationIds: context.mutationIds,
        flushedAt: context.flushedAt,
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
          const acknowledgement = await appendReviewEvent(client, mutation.payload?.event, {
            mutationId: mutation.id,
            deviceId: mutation.deviceId ?? context.deviceId,
          });
          if (acknowledgement?.acknowledgedMutationId === mutation.id) {
            acknowledgedMutationIds.push(mutation.id);
          } else {
            failedMutationIds.push(mutation.id);
          }
        } catch (error) {
          failedMutationIds.push(mutation.id);
        }
      }
      return { acknowledgedMutationIds, failedMutationIds, conflicts: [] };
    },
  };
}

export function createSyncEngine({ adapter, device, now = nowIso, outbox } = {}) {
  if (!adapter) throw new Error("Sync-Engine braucht einen Adapter.");
  if (!outbox) throw new Error("Sync-Engine braucht eine persistente Outbox.");
  const syncDevice = normalizeDevice(device);
  let lastFlush = null;
  let activeFlush = null;

  return {
    async loadSnapshot(fallbackState = {}) {
      if (!adapter.registerDevice) throw new Error("Sync-Adapter kann kein Gerät registrieren.");
      try {
        await adapter.registerDevice(syncDevice, { lastSeenAt: now() });
      } catch (error) {
        throw createDeviceRegistrationError(error);
      }
      return adapter.loadSnapshot(fallbackState);
    },

    enqueueMutation(input = {}) {
      return outbox.enqueue(createMutation(input, now, syncDevice.id));
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
          deviceId: syncDevice.id,
          flushedAt: now(),
        };

        if (latestStatePatch?.payload?.state) {
          const statePatchIds = batch.filter((mutation) => mutation.type === SYNC_MUTATION_TYPES.statePatch).map((mutation) => mutation.id);
          try {
            result.saved = await adapter.upsertState(latestStatePatch.payload.state, {
              deviceId: syncDevice.id,
              mutationIds: statePatchIds,
              flushedAt: result.flushedAt,
            });
            const acknowledgedStatePatchIds = statePatchIds.filter((id) => result.saved?.acknowledgedMutationIds?.includes(id));
            const missingAcknowledgements = statePatchIds.filter((id) => !acknowledgedStatePatchIds.includes(id));
            outbox.markFlushed(acknowledgedStatePatchIds, result.flushedAt);
            outbox.remove(acknowledgedStatePatchIds);
            if (missingAcknowledgements.length > 0) {
              throw new Error("Cloud-Repository hat nicht alle Snapshot-Mutationen bestätigt.");
            }
          } catch (error) {
            outbox.markFailed(statePatchIds, error);
            throw error;
          }
        }

        const remaining = batch.filter((mutation) => mutation.type !== SYNC_MUTATION_TYPES.statePatch);
        if (remaining.length > 0 && adapter.applyMutationBatch) {
          try {
            const batchResult = await adapter.applyMutationBatch(remaining, { deviceId: syncDevice.id, flushedAt: result.flushedAt });
            result.conflicts = batchResult?.conflicts ?? [];
            const remainingIds = new Set(remaining.map((mutation) => mutation.id));
            const acknowledgedMutationIds = (batchResult?.acknowledgedMutationIds ?? []).filter((id) => remainingIds.has(id));
            const failedMutationIds = (batchResult?.failedMutationIds ?? []).filter((id) => remainingIds.has(id));
            outbox.markFlushed(acknowledgedMutationIds, result.flushedAt);
            outbox.remove(acknowledgedMutationIds);
            outbox.markFailed(failedMutationIds, new Error("Mutation konnte nicht synchronisiert werden."));
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
      return adapter.resolveConflict(conflictId, { ...resolution, deviceId: syncDevice.id, resolvedAt: now() });
    },
  };
}

export function createAccountSyncEngine(client, options = {}) {
  if (!options.userId || !options.storage || !options.device) {
    throw new Error("Account-Sync braucht Nutzer-ID, accountgebundenen Speicher und Gerätedaten.");
  }
  return createSyncEngine({
    ...options,
    adapter: options.adapter ?? createDefaultAdapter(client),
    outbox: options.outbox ?? createSyncOutbox({ userId: options.userId, storage: options.storage, now: options.now }),
  });
}
