import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-memory learning document tables and image bucket with the database's revision stamping and unique ids;
 * `offline` makes every request fail like a lost connection.
 */
export function fakeLearningCloud() {
  const tables = new Map<string, Map<string, Record<string, any>>>(), objects = new Map<string, Blob>(), state = { offline: false };
  const table = (name: string) => tables.get(name) ?? tables.set(name, new Map()).get(name)!;
  const failed = () => ({ data: null, error: new Error("offline") });
  const client = {
    from: (name: string) => {
      const rows = table(name), filters: Array<[string, unknown]> = [];
      let op = "select", payload: Record<string, unknown> = {};
      const run = () => {
        if (state.offline) return failed();
        if (op === "insert") {
          if (rows.has(String(payload.id))) return { data: null, error: { code: "23505", message: "duplicate key" } };
          const row: Record<string, any> = { ...structuredClone(payload), revision: 1, deleted_at: null };
          rows.set(String(row.id), row);
          return { data: [structuredClone(row)], error: null };
        }
        const hits = [...rows.values()].filter((row) => filters.every(([column, value]) => row[column] === value));
        if (op === "update") for (const row of hits) Object.assign(row, structuredClone(payload), { revision: row.revision + 1 });
        return { data: structuredClone(hits), error: null };
      };
      const builder: any = {
        select: () => builder, eq: (column: string, value: unknown) => { filters.push([column, value]); return builder; },
        insert: (row: Record<string, unknown>) => { op = "insert"; payload = row; return builder; },
        update: (values: Record<string, unknown>) => { op = "update"; payload = values; return builder; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return builder;
    },
    storage: { from: () => ({
      upload: async (path: string, blob: Blob) => state.offline ? failed() : objects.has(path) ? { data: null, error: { message: "The resource already exists" } } : (objects.set(path, blob), { data: { path }, error: null }),
      download: async (path: string) => state.offline || !objects.has(path) ? failed() : { data: objects.get(path)!, error: null },
      remove: async (paths: string[]) => state.offline ? failed() : (paths.forEach((path) => objects.delete(path)), { data: [], error: null }),
    }) },
  };
  return { table, objects, state, account: (userId: string) => ({ userId, cloud: client as unknown as SupabaseClient }) };
}

/** A new browser of the same account: its local copies start empty. */
export function freshDevice(databaseName: string) {
  return new Promise((resolve) => { indexedDB.deleteDatabase(databaseName).onsuccess = resolve; });
}
