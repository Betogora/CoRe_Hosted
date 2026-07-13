import * as v from "valibot";

const OUTBOX_KEY = "syncOutbox.v1";

const syncMutationSchema = v.looseObject({
  id: v.string(),
  userId: v.string(),
  deviceId: v.nullable(v.string()),
  type: v.string(),
  table: v.nullable(v.string()),
  entityId: v.nullable(v.string()),
  baseRevision: v.nullable(v.number()),
  payload: v.unknown(),
  createdAt: v.string(),
  flushedAt: v.nullable(v.string()),
  retryCount: v.number(),
  lastError: v.optional(v.nullable(v.string())),
});

export type SyncOutboxMutation = v.InferOutput<typeof syncMutationSchema>;

interface SyncOutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function parseRows(value: unknown, userId: string): SyncOutboxMutation[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row: unknown) => {
      const result = v.safeParse(syncMutationSchema, row);
      return result.success && result.output.userId === userId ? [result.output] : [];
    });
  } catch {
    return [];
  }
}

export function createSyncOutbox({ userId, storage, now = () => new Date().toISOString() }: {
  userId?: string;
  storage?: SyncOutboxStorage;
  now?: () => string;
} = {}) {
  if (!userId) throw new Error("Sync-Outbox braucht eine Account-ID.");
  if (!storage) throw new Error("Sync-Outbox braucht einen accountgebundenen Speicher.");
  const resolvedUserId = userId;
  const resolvedStorage = storage;

  function read() {
    return parseRows(resolvedStorage.getItem(OUTBOX_KEY), resolvedUserId);
  }

  function write(rows: SyncOutboxMutation[]) {
    resolvedStorage.setItem(OUTBOX_KEY, JSON.stringify(rows));
    return rows;
  }

  return {
    enqueue(input: Partial<SyncOutboxMutation> = {}) {
      if (!input.id || !input.type) throw new Error("Sync-Mutation braucht ID und Typ.");
      const rows = read();
      const existing = rows.find((row: any) => row.id === input.id);
      if (existing) return existing;
      const mutation: SyncOutboxMutation = {
        id: input.id,
        userId: resolvedUserId,
        deviceId: input.deviceId ?? null,
        type: input.type,
        table: input.table ?? null,
        entityId: input.entityId ?? null,
        baseRevision: input.baseRevision ?? null,
        payload: input.payload ?? {},
        createdAt: input.createdAt ?? now(),
        flushedAt: input.flushedAt ?? null,
        retryCount: Number(input.retryCount ?? 0),
      };
      write([...rows, mutation]);
      return mutation;
    },
    listPending() {
      return read().filter((row: any) => !row.flushedAt);
    },
    markFlushed(ids: any = [], flushedAt: any = now()) {
      const selected = new Set(ids);
      return write(read().map((row: any) => selected.has(row.id) ? { ...row, flushedAt } : row));
    },
    markFailed(ids: any = [], error: any = null) {
      const selected = new Set(ids);
      return write(read().map((row: any) => selected.has(row.id) ? {
        ...row,
        retryCount: Number(row.retryCount ?? 0) + 1,
        lastError: error ? String(error.message ?? error).slice(0, 300) : null,
      } : row));
    },
    remove(ids: any = []) {
      const selected = new Set(ids);
      return write(read().filter((row: any) => !selected.has(row.id)));
    },
    count() {
      return read().filter((row: any) => !row.flushedAt).length;
    },
  };
}
