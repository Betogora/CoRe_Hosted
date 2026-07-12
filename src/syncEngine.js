import {
  appendReviewEvent,
  listAccountSyncConflicts,
  loadAccountCloudState,
  mergeCloudSyncMetadata,
  registerAccountSyncDevice,
  resolveAccountSyncConflict,
  upsertAccountCloudState,
} from "./cloudRepository.js";
import { createSyncConflictStatus, createSyncSavedStatus } from "./accountSession.js";
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
    resolveConflict(conflictId, decision, context = {}) {
      return resolveAccountSyncConflict(client, conflictId, decision, context);
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

        if (latestStatePatch?.payload?.state) {
          const blockingConflicts = adapter.listConflicts ? await adapter.listConflicts() : [];
          if (blockingConflicts.length > 0) {
            result.conflicts = blockingConflicts;
            result.paused = true;
            lastFlush = result;
            return result;
          }
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

    async resolveConflict(conflictId, decision, currentState) {
      if (!adapter.resolveConflict) throw new Error("Dieser Sync-Adapter kann Konflikte nicht auflösen.");
      const resolvedAt = now();
      const repositoryResult = await adapter.resolveConflict(conflictId, decision, {
        deviceId: syncDevice.id,
        resolvedAt,
        currentState,
      });
      let nextState = repositoryResult?.nextState ?? currentState;
      let flushResult = null;

      if (repositoryResult?.resolved) {
        const staleStatePatchIds = outbox.listPending()
          .filter((mutation) => mutation.type === SYNC_MUTATION_TYPES.statePatch)
          .map((mutation) => mutation.id);
        outbox.remove(staleStatePatchIds);
        this.enqueueMutation({
          type: SYNC_MUTATION_TYPES.statePatch,
          payload: { state: nextState },
        });
        flushResult = await this.flush();
        nextState = mergeCloudSyncMetadata(nextState, flushResult.saved?.state);
      }

      const conflicts = adapter.listConflicts ? await adapter.listConflicts() : [];
      return {
        conflict: repositoryResult?.conflict ?? null,
        nextState,
        conflicts,
        flushResult,
        syncStatus: conflicts.length > 0
          ? createSyncConflictStatus(conflicts.length)
          : createSyncSavedStatus("Konfliktentscheidung synchronisiert.", () => resolvedAt),
      };
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
