import {
  applyEntityMutation,
  applyEntityMutationBatch,
  listAccountSyncConflicts,
  registerAccountSyncDevice,
  recordAtomicReview,
  resolveAccountSyncConflict,
  upsertAccountCloudProfile,
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

const ENTITY_UPSERT_ORDER: Record<string, number> = {
  source_documents: 0,
  note_type_definitions: 0,
  decks: 1,
  cards: 2,
  learning_item_source_snapshots: 3,
  card_variants: 4,
  review_events: 5,
};

function orderMutationBatch(mutations: any[]) {
  return mutations
    .map((mutation, index) => ({ mutation, index }))
    .sort((left, right) => {
      const priority = (entry: { mutation: any }) => {
        const mutation = entry.mutation;
        if (mutation.type === SYNC_MUTATION_TYPES.profilePatch) return -10;
        if (mutation.type !== SYNC_MUTATION_TYPES.entityMutation) return 20;
        const table = mutation.payload?.table ?? mutation.table;
        const tableOrder = ENTITY_UPSERT_ORDER[table] ?? 10;
        return mutation.payload?.tombstone ? 10 - tableOrder : tableOrder;
      };
      return priority(left) - priority(right) || left.index - right.index;
    })
    .map(({ mutation }) => mutation);
}

export const SYNC_MUTATION_TYPES = Object.freeze({
  profilePatch: "profile-patch",
  entityMutation: "entity-mutation",
  reviewAtomic: "review-atomic",
});

export interface SyncOutboxMutation {
  id: string;
  userId: string;
  deviceId: string | null;
  type: string;
  table: string | null;
  entityId: string | null;
  baseRevision: number | null;
  payload: unknown;
  createdAt: string;
  flushedAt: string | null;
  retryCount: number;
  lastError?: string | null;
}

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
    type: input.type,
    payload: input.payload ?? {},
    baseRevision: input.baseRevision ?? null,
    deviceId,
    table: input.table ?? (input.type === SYNC_MUTATION_TYPES.profilePatch ? "profiles" : null),
    entityId: input.entityId ?? input.payload?.event?.id ?? null,
    createdAt: input.createdAt ?? now(),
  };
}

function createDefaultAdapter(client: any) {
  return {
    registerDevice(device: any, context: any = {}) {
      return registerAccountSyncDevice(client, device, { lastSeenAt: context.lastSeenAt });
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
      const persistedRows: any[] = [];
      for (let mutationIndex = 0; mutationIndex < mutations.length;) {
        const mutation = mutations[mutationIndex];
        if (mutation.type === SYNC_MUTATION_TYPES.entityMutation && !mutation.payload?.tombstone) {
          let groupEnd = mutationIndex + 1;
          while (
            groupEnd < mutations.length
            && mutations[groupEnd].type === SYNC_MUTATION_TYPES.entityMutation
            && !mutations[groupEnd].payload?.tombstone
            && mutations[groupEnd].payload?.table === mutation.payload?.table
          ) groupEnd += 1;
          const group = mutations.slice(mutationIndex, groupEnd);
          try {
            const acknowledgements = await applyEntityMutationBatch(client, group.map((item: any) => item.payload), {
              deviceId: mutation.deviceId ?? context.deviceId,
              flushedAt: context.flushedAt,
            });
            group.forEach((item: any, index: number) => {
              acknowledgedMutationIds.push(item.id);
              if (acknowledgements[index]?.persistedRow) persistedRows.push({ table: item.payload.table, row: acknowledgements[index].persistedRow });
            });
          } catch (error) {
            group.forEach((item: any) => { failedMutationIds.push(item.id); failures.push({ mutationId: item.id, error }); });
          }
          mutationIndex = groupEnd;
          continue;
        }
        mutationIndex += 1;
        if (![SYNC_MUTATION_TYPES.profilePatch, SYNC_MUTATION_TYPES.entityMutation, SYNC_MUTATION_TYPES.reviewAtomic].includes(mutation.type)) {
          failedMutationIds.push(mutation.id);
          failures.push({ mutationId: mutation.id, error: createRetryableMutationError() });
          continue;
        }
        try {
          const acknowledgement = mutation.type === SYNC_MUTATION_TYPES.profilePatch
            ? await upsertAccountCloudProfile(client, mutation.payload?.profile, {
                mutationId: mutation.id,
                flushedAt: context.flushedAt,
              })
            : mutation.type === SYNC_MUTATION_TYPES.entityMutation
              ? { ...(await applyEntityMutation(client, mutation.payload, {
                  deviceId: mutation.deviceId ?? context.deviceId,
                  flushedAt: context.flushedAt,
                })), acknowledgedMutationId: mutation.id }
              : await recordAtomicReview(client, mutation.payload, {
                    mutationId: mutation.id,
                    deviceId: mutation.deviceId ?? context.deviceId,
                  });
          const acknowledged = acknowledgement as any;
          if (acknowledged?.acknowledgedMutationId === mutation.id) {
            acknowledgedMutationIds.push(mutation.id);
            if (acknowledged.persistedRow) persistedRows.push({ table: mutation.payload?.table ?? mutation.table, row: acknowledged.persistedRow });
            const atomicRows = acknowledged.rows && !Array.isArray(acknowledged.rows) ? acknowledged.rows : null;
            if (atomicRows?.deck) persistedRows.push({ table: "decks", row: atomicRows.deck });
            if (atomicRows?.card) persistedRows.push({ table: "cards", row: atomicRows.card });
            if (atomicRows?.variant) persistedRows.push({ table: "card_variants", row: atomicRows.variant });
          } else {
            failedMutationIds.push(mutation.id);
          }
        } catch (error) {
          failedMutationIds.push(mutation.id);
          failures.push({ mutationId: mutation.id, error });
        }
      }
      return { acknowledgedMutationIds, failedMutationIds, failures, conflicts: [], persistedRows };
    },
  };
}

export function createSyncEngine({
  adapter,
  device,
  now = nowIso,
  outbox,
  beforeFlush,
  persistMutationAcknowledgements,
  persistResolvedPage,
  initialize,
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

  function removeMutations(ids: any = []) {
    outbox.remove(ids);
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

  function enqueuePendingMutation(mutation: any) {
    const queued = outbox.enqueue(mutation);
    if (currentStatus.status !== "conflict") {
      emitStatus(safelyIsOnline() ? createSyncPendingStatus() : createSyncOfflineStatus({ pendingCount: outbox.count() }));
    }
    return queued;
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
    void api.flush({ force: true })
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
    async initialize() {
      if (!adapter.registerDevice) throw new Error("Sync-Adapter kann kein Gerät registrieren.");
      try {
        await adapter.registerDevice(syncDevice, { lastSeenAt: now() });
      } catch (error) {
        throw createDeviceRegistrationError(error);
      }
      await initialize?.();
      emitStatus(outbox.count() > 0 ? createSyncPendingStatus() : createSyncSavedStatus("Cloud geladen.", now));
    },
    enqueueMutation(input: any = {}) {
      const mutation = createMutation(input, now, syncDevice.id);
      if (!mutation.type) throw new Error("Sync-Mutation braucht einen Typ.");
      if (mutation.type === SYNC_MUTATION_TYPES.profilePatch) {
        if (!mutation.payload?.profile || typeof mutation.payload.profile !== "object" || Array.isArray(mutation.payload.profile)) {
          throw new Error("Profil-Mutation braucht ein vollständiges Profil.");
        }
        const staleProfilePatchIds = outbox.listPending()
          .filter((pending: any) => pending.type === SYNC_MUTATION_TYPES.profilePatch)
          .map((pending: any) => pending.id);
        removeMutations(staleProfilePatchIds);
        return enqueuePendingMutation(mutation);
      }
      if (mutation.type === SYNC_MUTATION_TYPES.entityMutation) {
        const table = mutation.payload?.table ?? mutation.table;
        const entityId = mutation.entityId ?? mutation.payload?.entity?.id ?? mutation.payload?.entityId;
        if (!table || !entityId) throw new Error("Entity-Mutation braucht Tabelle und ID.");
        const staleEntityMutationIds = outbox.listPending()
          .filter((pending: any) => pending.type === SYNC_MUTATION_TYPES.entityMutation
            && (pending.payload?.table ?? pending.table) === table
            && (pending.entityId ?? pending.payload?.entity?.id ?? pending.payload?.entityId) === entityId)
          .map((pending: any) => pending.id);
        removeMutations(staleEntityMutationIds);
        return enqueuePendingMutation(mutation);
      }
      return enqueuePendingMutation(mutation);
    },

    pendingCount() {
      return outbox.count();
    },

    async flush({ force = false }: any = {}) {
      if (activeFlush) return activeFlush;
      if (retryTimer !== null && !force) return deferredResult({ retryScheduled: true });
      if (!force && !safelyIsOnline()) {
        emitStatus(createSyncOfflineStatus({ pendingCount: outbox.count() }));
        return deferredResult({ offline: true });
      }
      if (force) clearRetryTimer();

      activeFlush = (async () => {
        await beforeFlush?.();
        await outbox.flushPersistence?.();
        const batch = outbox.listPending();
        if (batch.length === 0) {
          resetRetry();
          const syncStatus = currentStatus.status === "conflict" ? currentStatus : emitStatus(createSyncSavedStatus("Synchronisiert.", now));
          return lastFlush ?? { mutations: 0, conflicts: [], saved: null, syncStatus };
        }
        emitStatus(createSyncSavingStatus());
        const result: any = {
          mutations: batch.length,
          conflicts: [],
          saved: null,
          deviceId: syncDevice.id,
          flushedAt: now(),
        };
        let batchFailure: any = null;
        const remaining = orderMutationBatch(batch);
        if (remaining.length > 0 && adapter.applyMutationBatch) {
          try {
            const batchResult = await adapter.applyMutationBatch(remaining, { deviceId: syncDevice.id, flushedAt: result.flushedAt });
            result.conflicts = batchResult?.conflicts ?? [];
            const remainingIds = new Set(remaining.map((mutation: any) => mutation.id));
            const acknowledgedMutationIds = (batchResult?.acknowledgedMutationIds ?? []).filter((id: any) => remainingIds.has(id));
            if (acknowledgedMutationIds.length > 0 && batchResult?.persistedRows?.length > 0) {
              await persistMutationAcknowledgements?.(batchResult.persistedRows);
            }
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

        if (batchFailure) throw batchFailure;
        if (outbox.count() > 0) throw createRetryableMutationError();

        await outbox.flushPersistence?.();
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

    async resolveConflict(conflictId: any, decision: any) {
      if (!adapter.resolveConflict) throw new Error("Dieser Sync-Adapter kann Konflikte nicht auflösen.");
      emitStatus(createSyncSavingStatus());
      const resolvedAt = now();
      const repositoryResult = await adapter.resolveConflict(conflictId, decision, {
        deviceId: syncDevice.id,
        resolvedAt,
      });
      if (repositoryResult?.resolvedPage) await persistResolvedPage?.(repositoryResult.resolvedPage);

      const conflicts = adapter.listConflicts ? await adapter.listConflicts() : [];
      const syncStatus = conflicts.length > 0
        ? createSyncConflictStatus(conflicts.length)
        : createSyncSavedStatus("Konfliktentscheidung synchronisiert.", () => resolvedAt);
      emitStatus(syncStatus);
      return {
        conflict: repositoryResult?.conflict ?? null,
        conflicts,
        syncStatus,
      };
    },
  };

  return api;
}

export function createAccountSyncEngine(client: any, options: any = {}) {
  if (!options.userId || !options.device || !options.outbox) {
    throw new Error("Account-Sync braucht Nutzer-ID, accountgebundenen Speicher und Gerätedaten.");
  }
  return createSyncEngine({
    ...options,
    adapter: options.adapter ?? createDefaultAdapter(client),
  });
}

export type AccountSyncEngine = ReturnType<typeof createAccountSyncEngine>;
