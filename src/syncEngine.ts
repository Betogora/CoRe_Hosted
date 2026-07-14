import {
  appendReviewEvent,
  listAccountSyncConflicts,
  loadAccountCloudState,
  mergeCloudSyncMetadata,
  registerAccountSyncDevice,
  resolveAccountSyncConflict,
  upsertAccountCloudState,
} from "./cloudRepository.ts";
import {
  createSyncConflictStatus,
  createSyncErrorStatus,
  createSyncIdleStatus,
  createSyncOfflineStatus,
  createSyncPendingStatus,
  createSyncSavedStatus,
  createSyncSavingStatus,
} from "./accountSession.ts";
import { createSyncOutbox } from "./syncOutbox.ts";

const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 429]);

function getDefaultNetworkTarget() {
  return typeof window !== "undefined" ? window : null;
}

function collectErrorValues(error: any) {
  const values: any[] = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    values.push(
      current?.code,
      current?.status,
      current?.statusCode,
      current?.name,
      current?.message,
    );
    current = current?.cause;
  }
  return values.filter((value: any) => value !== undefined && value !== null);
}

function errorText(error: any) {
  return collectErrorValues(error).map((value: any) => String(value).toLowerCase()).join(" ");
}

function errorStatuses(error: any) {
  return collectErrorValues(error)
    .map((value: any) => Number(value))
    .filter((value: any) => Number.isInteger(value));
}

function isConnectivityError(error: any) {
  const combined = errorText(error);
  return (
    combined.includes("failed to fetch") ||
    combined.includes("fetch failed") ||
    combined.includes("networkerror") ||
    combined.includes("network request failed") ||
    combined.includes("err_network") ||
    combined.includes("internetdisconnected") ||
    combined.includes("offline")
  );
}

function isRetryableSyncError(error: any) {
  if (error?.code === "sync_mutation_retry") return true;
  if (isConnectivityError(error)) return true;
  return errorStatuses(error).some((status: any) => RETRYABLE_HTTP_STATUSES.has(status) || status >= 500);
}

function isSyncConflictError(error: any) {
  return error?.code === "cloud_revision_conflict" || Boolean(error?.conflict);
}

function createRetryableMutationError() {
  const error = new Error("Mindestens eine vorgemerkte Änderung konnte noch nicht synchronisiert werden.") as Error & { code: string };
  error.code = "sync_mutation_retry";
  return error;
}

function addMilliseconds(timestamp: any, milliseconds: any) {
  const parsed = Date.parse(timestamp);
  return new Date((Number.isFinite(parsed) ? parsed : Date.now()) + milliseconds).toISOString();
}

export const SYNC_MUTATION_TYPES = Object.freeze({
  statePatch: "state-patch",
  reviewEventAppend: "review-event-append",
});

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: any = "sync") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDevice(device: any = {}) {
  const id = String(device?.id ?? "").trim();
  if (!id) throw new Error("Sync-Engine braucht eine Geräte-ID.");
  return {
    id,
    label: String(device?.label ?? "Browser").trim() || "Browser",
    userAgent: typeof device?.userAgent === "string" ? device.userAgent : "",
  };
}

function createDeviceRegistrationError(error: any) {
  const registrationError = new Error("Dieses Gerät konnte nicht für die Synchronisierung registriert werden.", { cause: error }) as Error & { code: string };
  registrationError.name = "SyncDeviceRegistrationError";
  registrationError.code = "sync_device_registration_failed";
  return registrationError;
}

function createMutation(input: any = {}, now: any = nowIso, deviceId: any) {
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

function createDefaultAdapter(client: any) {
  return {
    registerDevice(device: any, context: any = {}) {
      return registerAccountSyncDevice(client, device, { lastSeenAt: context.lastSeenAt });
    },
    loadSnapshot(fallbackState: any) {
      return loadAccountCloudState(client, fallbackState);
    },
    upsertState(state: any, context: any = {}) {
      return upsertAccountCloudState(client, state, {
        deviceId: context.deviceId,
        mutationIds: context.mutationIds,
        flushedAt: context.flushedAt,
      });
    },
    listConflicts() {
      return listAccountSyncConflicts(client);
    },
    resolveConflict(conflictId: any, decision: any, context: any = {}) {
      return resolveAccountSyncConflict(client, conflictId, decision, context);
    },
    async applyMutationBatch(mutations: any, context: any = {}) {
      const acknowledgedMutationIds: any[] = [];
      const failedMutationIds: any[] = [];
      const failures: any[] = [];
      for (const mutation of mutations) {
        if (mutation.type !== SYNC_MUTATION_TYPES.reviewEventAppend) {
          failedMutationIds.push(mutation.id);
          failures.push({ mutationId: mutation.id, error: createRetryableMutationError() });
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
          failures.push({ mutationId: mutation.id, error });
        }
      }
      return { acknowledgedMutationIds, failedMutationIds, failures, conflicts: [] };
    },
  };
}

export function createSyncEngine({
  adapter,
  device,
  now = nowIso,
  outbox,
  persistSnapshot,
  networkTarget = getDefaultNetworkTarget(),
  isOnline = () => networkTarget?.navigator?.onLine !== false,
  setTimer = (callback: any, delay: any) => setTimeout(callback, delay),
  clearTimer = (timerId: any) => clearTimeout(timerId),
  random = Math.random,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
}: any = {}) {
  if (!adapter) throw new Error("Sync-Engine braucht einen Adapter.");
  if (!outbox) throw new Error("Sync-Engine braucht eine persistente Outbox.");
  const syncDevice = normalizeDevice(device);
  let lastFlush: any = null;
  let activeFlush: any = null;
  let lastFallbackState: any = null;
  let retryTimer: any = null;
  let retryAttempt = 0;
  let lastRetryableError: any = null;
  let lifecycleActive = false;
  let lifecycleVersion = 0;
  let statusListener: any = null;
  let flushListener: any = null;
  let lifecycleCleanup: any = null;
  let currentStatus = createSyncIdleStatus();
  let lastOnlineStatus = currentStatus;
  const stateSnapshots = new Map();

  function removeMutations(ids: any = []) {
    outbox.remove(ids);
    ids.forEach((id: any) => stateSnapshots.delete(id));
  }

  function safelyIsOnline() {
    try {
      return isOnline() !== false;
    } catch {
      return true;
    }
  }

  function emitStatus(status: any) {
    currentStatus = status;
    if (status?.status !== "offline") lastOnlineStatus = status;
    statusListener?.(status);
    return status;
  }

  function clearRetryTimer() {
    if (retryTimer === null) return;
    clearTimer(retryTimer);
    retryTimer = null;
  }

  function resetRetry() {
    clearRetryTimer();
    retryAttempt = 0;
    lastRetryableError = null;
  }

  function deferredResult(extra: any = {}) {
    return {
      mutations: outbox.count(),
      conflicts: [],
      saved: null,
      deferred: true,
      syncStatus: currentStatus,
      ...extra,
    };
  }

  function flushForActiveLifecycle() {
    const version = lifecycleVersion;
    void api.flush(lastFallbackState, { force: true })
      .then((result: any) => {
        if (lifecycleActive && lifecycleVersion === version) flushListener?.(result);
      })
      .catch(() => {});
  }

  function retryDelayForAttempt(attempt: any) {
    const ceiling = Math.min(
      Math.max(1, Number(retryMaxDelayMs) || DEFAULT_RETRY_MAX_DELAY_MS),
      Math.max(1, Number(retryBaseDelayMs) || DEFAULT_RETRY_BASE_DELAY_MS) * (2 ** Math.max(0, attempt - 1)),
    );
    const jitter = Math.min(1, Math.max(0, Number(random()) || 0));
    return Math.round(ceiling * (0.5 + (jitter * 0.5)));
  }

  function scheduleRetry(error: any) {
    const pendingCount = outbox.count();
    if (pendingCount === 0 || currentStatus.status === "conflict") {
      resetRetry();
      return null;
    }

    lastRetryableError = error;
    if (!safelyIsOnline()) {
      clearRetryTimer();
      emitStatus(createSyncOfflineStatus({ pendingCount }));
      return null;
    }
    if (retryTimer !== null) return retryTimer;
    if (!lifecycleActive) {
      emitStatus(isConnectivityError(error)
        ? createSyncOfflineStatus({ pendingCount })
        : { ...createSyncPendingStatus(), pendingCount, message: "Synchronisierung wird automatisch erneut versucht." });
      return null;
    }

    retryAttempt += 1;
    const delay = retryDelayForAttempt(retryAttempt);
    const nextRetryAt = addMilliseconds(now(), delay);
    const retryStatus = isConnectivityError(error)
      ? createSyncOfflineStatus({ pendingCount, nextRetryAt })
      : {
          ...createSyncPendingStatus(),
          pendingCount,
          nextRetryAt,
          message: "Synchronisierung wird automatisch erneut versucht.",
        };
    emitStatus(retryStatus);
    retryTimer = setTimer(() => {
      retryTimer = null;
      flushForActiveLifecycle();
    }, delay);
    return retryTimer;
  }

  const api = {
    async loadSnapshot(fallbackState: any = {}) {
      lastFallbackState = fallbackState;
      if (!adapter.registerDevice) throw new Error("Sync-Adapter kann kein Gerät registrieren.");
      try {
        await adapter.registerDevice(syncDevice, { lastSeenAt: now() });
      } catch (error) {
        throw createDeviceRegistrationError(error);
      }
      if (outbox.count() > 0) {
        try {
          const replay = await api.flush(fallbackState, { force: true });
          if (replay?.paused || outbox.count() > 0) return fallbackState;
        } catch {
          return fallbackState;
        }
      }
      const snapshot = await adapter.loadSnapshot(fallbackState);
      emitStatus(createSyncSavedStatus("Cloud geladen.", now));
      return snapshot;
    },

    enqueueMutation(input: any = {}) {
      const mutation = createMutation(input, now, syncDevice.id);
      if (mutation.type !== SYNC_MUTATION_TYPES.statePatch || !mutation.payload || typeof mutation.payload !== "object") {
        const queued = outbox.enqueue(mutation);
        if (currentStatus.status !== "conflict") {
          emitStatus(safelyIsOnline() ? createSyncPendingStatus() : createSyncOfflineStatus({ pendingCount: outbox.count() }));
        }
        return queued;
      }

      const { state, ...payload } = mutation.payload;
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        throw new Error("Snapshot-Mutation braucht einen vollständigen Zustand.");
      }
      const staleStatePatchIds = outbox.listPending()
        .filter((pending: any) => pending.type === SYNC_MUTATION_TYPES.statePatch)
        .map((pending: any) => pending.id);
      removeMutations(staleStatePatchIds);
      stateSnapshots.set(mutation.id, state);
      lastFallbackState = state;
      const queued = outbox.enqueue({ ...mutation, payload });
      if (currentStatus.status !== "conflict") {
        emitStatus(safelyIsOnline() ? createSyncPendingStatus() : createSyncOfflineStatus({ pendingCount: outbox.count() }));
      }
      return queued;
    },

    pendingCount() {
      return outbox.count();
    },

    async flush(fallbackState: any = undefined, { force = false }: any = {}) {
      if (fallbackState && typeof fallbackState === "object" && !Array.isArray(fallbackState)) {
        lastFallbackState = fallbackState;
      }
      if (activeFlush) return activeFlush;
      if (retryTimer !== null && !force) return deferredResult({ retryScheduled: true });
      if (!force && !safelyIsOnline()) {
        emitStatus(createSyncOfflineStatus({ pendingCount: outbox.count() }));
        return deferredResult({ offline: true });
      }
      if (force) clearRetryTimer();

      activeFlush = (async () => {
        const batch = outbox.listPending();
        if (batch.length === 0) {
          resetRetry();
          const syncStatus = currentStatus.status === "conflict" ? currentStatus : emitStatus(createSyncSavedStatus("Synchronisiert.", now));
          return lastFlush ?? { mutations: 0, conflicts: [], saved: null, syncStatus };
        }
        emitStatus(createSyncSavingStatus());
        const latestStatePatch = [...batch].reverse().find((mutation: any) => mutation.type === SYNC_MUTATION_TYPES.statePatch);
        const latestStateSnapshot = latestStatePatch
          ? (stateSnapshots.has(latestStatePatch.id) ? stateSnapshots.get(latestStatePatch.id) : (fallbackState ?? lastFallbackState))
          : undefined;
        const result: any = {
          mutations: batch.length,
          conflicts: [],
          saved: null,
          deviceId: syncDevice.id,
          flushedAt: now(),
        };
        let batchFailure: any = null;

        const remaining = batch.filter((mutation: any) => mutation.type !== SYNC_MUTATION_TYPES.statePatch);
        if (remaining.length > 0 && adapter.applyMutationBatch) {
          try {
            const batchResult = await adapter.applyMutationBatch(remaining, { deviceId: syncDevice.id, flushedAt: result.flushedAt });
            result.conflicts = batchResult?.conflicts ?? [];
            const remainingIds = new Set(remaining.map((mutation: any) => mutation.id));
            const acknowledgedMutationIds = (batchResult?.acknowledgedMutationIds ?? []).filter((id: any) => remainingIds.has(id));
            const failedMutationIds = (batchResult?.failedMutationIds ?? []).filter((id: any) => remainingIds.has(id));
            outbox.markFlushed(acknowledgedMutationIds, result.flushedAt);
            removeMutations(acknowledgedMutationIds);
            outbox.markFailed(failedMutationIds, new Error("Mutation konnte nicht synchronisiert werden."));
            if (failedMutationIds.length > 0) {
              const failureErrors = (batchResult?.failures ?? [])
                .filter((failure: any) => failedMutationIds.includes(failure?.mutationId) && failure?.error)
                .map((failure: any) => failure.error);
              batchFailure = failureErrors.find((error: any) => !isRetryableSyncError(error))
                ?? failureErrors[0]
                ?? createRetryableMutationError();
            }
          } catch (error) {
            outbox.markFailed(remaining.map((mutation: any) => mutation.id), error);
            throw error;
          }
        } else if (remaining.length > 0) {
          batchFailure = new Error("Sync-Adapter unterstützt diese Mutation nicht.");
          outbox.markFailed(remaining.map((mutation: any) => mutation.id), batchFailure);
        }

        if (latestStatePatch) {
          const blockingConflicts = adapter.listConflicts ? await adapter.listConflicts() : [];
          if (blockingConflicts.length > 0) {
            result.conflicts = blockingConflicts;
            result.paused = true;
            resetRetry();
            result.syncStatus = emitStatus(createSyncConflictStatus(blockingConflicts.length));
            lastFlush = result;
            return result;
          }
          const statePatchIds = batch.filter((mutation: any) => mutation.type === SYNC_MUTATION_TYPES.statePatch).map((mutation: any) => mutation.id);
          try {
            if (!latestStateSnapshot || typeof latestStateSnapshot !== "object") {
              throw new Error("Persistierter Sync-Snapshot konnte nicht wiederhergestellt werden.");
            }
            result.saved = await adapter.upsertState(latestStateSnapshot, {
              deviceId: syncDevice.id,
              mutationIds: statePatchIds,
              flushedAt: result.flushedAt,
            });
            const acknowledgedStatePatchIds = statePatchIds.filter((id: any) => result.saved?.acknowledgedMutationIds?.includes(id));
            const missingAcknowledgements = statePatchIds.filter((id: any) => !acknowledgedStatePatchIds.includes(id));
            outbox.markFlushed(acknowledgedStatePatchIds, result.flushedAt);
            removeMutations(acknowledgedStatePatchIds);
            if (missingAcknowledgements.length > 0) {
              throw new Error("Cloud-Repository hat nicht alle Snapshot-Mutationen bestätigt.");
            }
          } catch (error) {
            outbox.markFailed(statePatchIds, error);
            throw error;
          }
        }

        if (batchFailure) throw batchFailure;
        if (outbox.count() > 0) throw createRetryableMutationError();

        resetRetry();
        result.syncStatus = emitStatus(createSyncSavedStatus("Synchronisiert.", now));
        lastFlush = result;
        return result;
      })();
      try {
        return await activeFlush;
      } catch (error) {
        if (isSyncConflictError(error)) {
          resetRetry();
          const conflictError = error as { conflict?: unknown };
          const conflicts = conflictError.conflict ? [conflictError.conflict] : [];
          const syncStatus = emitStatus(createSyncConflictStatus(Math.max(1, conflicts.length)));
          lastFlush = {
            mutations: outbox.count(),
            conflicts,
            saved: null,
            paused: true,
            syncStatus,
          };
          return lastFlush;
        }
        if (isRetryableSyncError(error)) {
          scheduleRetry(error);
          return deferredResult({
            offline: isConnectivityError(error) || !safelyIsOnline(),
            retryScheduled: retryTimer !== null,
          });
        }
        emitStatus(createSyncErrorStatus());
        throw error;
      } finally {
        activeFlush = null;
      }
    },

    startSyncLifecycle({ onStatus, onFlush }: any = {}) {
      if (typeof onStatus !== "function") throw new Error("Sync-Lifecycle braucht einen Status-Listener.");
      lifecycleCleanup?.();
      lifecycleActive = true;
      lifecycleVersion += 1;
      statusListener = onStatus;
      flushListener = typeof onFlush === "function" ? onFlush : null;

      const handleOffline = () => {
        clearRetryTimer();
        emitStatus(createSyncOfflineStatus({ pendingCount: outbox.count() }));
      };
      const handleOnline = () => {
        clearRetryTimer();
        retryAttempt = 0;
        if (outbox.count() > 0) {
          flushForActiveLifecycle();
        } else if (currentStatus.status === "offline") {
          emitStatus(lastOnlineStatus);
        }
      };

      networkTarget?.addEventListener?.("offline", handleOffline);
      networkTarget?.addEventListener?.("online", handleOnline);

      if (!safelyIsOnline()) {
        handleOffline();
      } else if (outbox.count() > 0 && currentStatus.status !== "conflict") {
        scheduleRetry(lastRetryableError ?? createRetryableMutationError());
      }

      let cleanedUp = false;
      lifecycleCleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        lifecycleActive = false;
        lifecycleVersion += 1;
        clearRetryTimer();
        networkTarget?.removeEventListener?.("offline", handleOffline);
        networkTarget?.removeEventListener?.("online", handleOnline);
        statusListener = null;
        flushListener = null;
        lifecycleCleanup = null;
      };
      return lifecycleCleanup;
    },

    async listConflicts() {
      if (!adapter.listConflicts) return [];
      return adapter.listConflicts();
    },

    async resolveConflict(conflictId: any, decision: any, currentState: any) {
      if (!adapter.resolveConflict) throw new Error("Dieser Sync-Adapter kann Konflikte nicht auflösen.");
      emitStatus(createSyncSavingStatus());
      const resolvedAt = now();
      const repositoryResult = await adapter.resolveConflict(conflictId, decision, {
        deviceId: syncDevice.id,
        resolvedAt,
        currentState,
      });
      let nextState = repositoryResult?.nextState ?? currentState;
      let flushResult: any = null;

      if (repositoryResult?.resolved) {
        if (persistSnapshot) nextState = await persistSnapshot(nextState) ?? nextState;
        const staleStatePatchIds = outbox.listPending()
          .filter((mutation: any) => mutation.type === SYNC_MUTATION_TYPES.statePatch)
          .map((mutation: any) => mutation.id);
        removeMutations(staleStatePatchIds);
        api.enqueueMutation({
          type: SYNC_MUTATION_TYPES.statePatch,
          payload: { state: nextState },
        });
        flushResult = await api.flush();
        nextState = mergeCloudSyncMetadata(nextState, flushResult.saved?.state);
      }

      const conflicts = adapter.listConflicts ? await adapter.listConflicts() : [];
      const syncStatus = flushResult?.syncStatus?.status === "offline" || flushResult?.syncStatus?.status === "pending"
        ? flushResult.syncStatus
        : conflicts.length > 0
          ? createSyncConflictStatus(conflicts.length)
          : createSyncSavedStatus("Konfliktentscheidung synchronisiert.", () => resolvedAt);
      emitStatus(syncStatus);
      return {
        conflict: repositoryResult?.conflict ?? null,
        nextState,
        conflicts,
        flushResult,
        syncStatus,
      };
    },
  };

  return api;
}

export function createAccountSyncEngine(client: any, options: any = {}) {
  if (!options.userId || !options.storage || !options.device) {
    throw new Error("Account-Sync braucht Nutzer-ID, accountgebundenen Speicher und Gerätedaten.");
  }
  return createSyncEngine({
    ...options,
    adapter: options.adapter ?? createDefaultAdapter(client),
    outbox: options.outbox ?? createSyncOutbox({ userId: options.userId, storage: options.storage, now: options.now }),
  });
}

export type AccountSyncEngine = ReturnType<typeof createAccountSyncEngine>;
