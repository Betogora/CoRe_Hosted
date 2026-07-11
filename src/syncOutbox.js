const OUTBOX_KEY = "syncOutbox.v1";

function parseRows(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.id === "string" && typeof row.type === "string") : [];
  } catch {
    return [];
  }
}

export function createSyncOutbox({ userId, storage, now = () => new Date().toISOString() } = {}) {
  if (!userId) throw new Error("Sync-Outbox braucht eine Account-ID.");
  if (!storage) throw new Error("Sync-Outbox braucht einen accountgebundenen Speicher.");

  function read() {
    return parseRows(storage.getItem(OUTBOX_KEY));
  }

  function write(rows) {
    storage.setItem(OUTBOX_KEY, JSON.stringify(rows));
    return rows;
  }

  return {
    enqueue(input = {}) {
      if (!input.id || !input.type) throw new Error("Sync-Mutation braucht ID und Typ.");
      const rows = read();
      const existing = rows.find((row) => row.id === input.id);
      if (existing) return existing;
      const mutation = {
        id: input.id,
        userId: String(userId),
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
      return read().filter((row) => !row.flushedAt);
    },
    markFlushed(ids = [], flushedAt = now()) {
      const selected = new Set(ids);
      return write(read().map((row) => selected.has(row.id) ? { ...row, flushedAt } : row));
    },
    markFailed(ids = [], error = null) {
      const selected = new Set(ids);
      return write(read().map((row) => selected.has(row.id) ? {
        ...row,
        retryCount: Number(row.retryCount ?? 0) + 1,
        lastError: error ? String(error.message ?? error).slice(0, 300) : null,
      } : row));
    },
    remove(ids = []) {
      const selected = new Set(ids);
      return write(read().filter((row) => !selected.has(row.id)));
    },
    count() {
      return read().filter((row) => !row.flushedAt).length;
    },
  };
}

export const syncOutboxKeys = { OUTBOX_KEY };
