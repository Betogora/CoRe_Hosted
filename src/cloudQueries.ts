// Private to cloudRepository.ts: the Supabase client shape, account-scoped selects, chunked writes and input checks the cloud modules share.
import { validateAccountRows, type AccountTable } from "./cloudRepositoryValidation.ts";

/** A row the cloud modules read without a validator from `cloudRepositoryValidation.ts`. */
export type CloudRow = Record<string, unknown>;
export interface CloudUser { id: string }
interface CloudError { code?: string; message?: string }
interface CloudResponse { data: unknown; error: CloudError | null }
interface CloudRequest extends PromiseLike<CloudResponse> {
  abortSignal(signal: AbortSignal): PromiseLike<CloudResponse>;
}
interface CloudQuery extends CloudRequest {
  select(columns?: string): CloudQuery;
  eq(column: string, value: unknown): CloudQuery;
  in(column: string, values: readonly unknown[]): CloudQuery;
  gt(column: string, value: unknown): CloudQuery;
  order(column: string, options?: { ascending?: boolean }): CloudQuery;
  limit(count: number): CloudQuery;
  single(): PromiseLike<CloudResponse>;
  maybeSingle(): PromiseLike<CloudResponse>;
}
interface CloudTable {
  select(columns?: string): CloudQuery;
  insert(values: object): CloudQuery;
  upsert(values: object, options?: { onConflict?: string; ignoreDuplicates?: boolean }): CloudQuery;
  update(values: object): CloudQuery;
}

/**
 * The part of the Supabase client this module and the sync engine use; every answer stays `unknown` until validated.
 * `from` is `unknown` because PostgREST's builder types exceed the compiler's depth in a structural comparison (TS2589);
 * `cloudTable` reads it as `CloudTable`.
 */
export interface CloudClient {
  auth: { getUser(): PromiseLike<{ data: { user: CloudUser | null } | null; error: unknown }> };
  rpc(fn: string, args?: Record<string, unknown>): CloudRequest;
  from(table: string): unknown;
}

export function cloudTable(client: CloudClient, table: string) {
  return client.from(table) as CloudTable;
}

/** Full rows of a revisioned entity table, checked by the table's validator. */
export const entityRows = (table: string) => (rows: unknown) => validateAccountRows(table as AccountTable, rows);

export const ACCOUNT_UPSERT_CONFLICT = "user_id,id";
const REVISIONED_TABLES = ["decks", "notes", "cards", "card_variants"];
/** Raw Anki import data: written by imports and re-translation only, last write wins. */
export const UPSERT_TABLES = new Set(["note_type_sources", "note_sources"]);
export const REVISIONED_TABLE_SET = new Set(REVISIONED_TABLES);
export const CLOUD_PAGE_SIZE = 500;
const CLOUD_WRITE_ROW_LIMIT = 250;
export const CLOUD_WRITE_BYTE_LIMIT = 1024 * 1024;
export const CLOUD_WRITE_CONCURRENCY = 4;
export function nowIso() {
  return new Date().toISOString();
}

export function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export function toJson<T, F>(value: T, fallback: F) {
  return value == null ? fallback : value;
}

export function toObject(value: unknown): CloudRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CloudRow : {};
}

export function normalizeRevision(value: unknown, fallback = 1) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : fallback;
}

export function uniqueRowsById<Row extends { id?: unknown }>(rows: Row[]) {
  const byId = new Map<unknown, Row>();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function getAuthenticatedUser(client: CloudClient | null | undefined) {
  if (!client?.auth || !client?.from) throw new Error("Supabase ist noch nicht konfiguriert.");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user) {
    const missingSessionError = new Error("Bitte melde dich zuerst an.") as Error & { code: string };
    missingSessionError.code = "session_not_found";
    throw missingSessionError;
  }
  return data.user;
}

export function authenticatedUserForKnownSession(client: CloudClient, userId?: string): Promise<CloudUser> {
  if (!userId) return getAuthenticatedUser(client);
  if (!client?.auth || !client?.from) throw new Error("Supabase ist noch nicht konfiguriert.");
  return Promise.resolve({ id: requireNonEmptyString(userId, "Nutzer-ID fehlt.") });
}

export function requireNonEmptyString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

export function requireTimestamp(value: unknown, fallback: () => string, message: string) {
  const timestamp = value ?? fallback();
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) throw new Error(message);
  return timestamp;
}

function serializedBytes(value: unknown) {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "undefined" ? serialized.length : new TextEncoder().encode(serialized).byteLength;
}

export function chunkRows<Row>(rows: Row[] = []) {
  const chunks: Row[][] = [];
  let chunk: Row[] = [];
  let chunkBytes = 2;
  for (const row of rows) {
    const rowBytes = serializedBytes(row) + (chunk.length > 0 ? 1 : 0);
    if (rowBytes + 2 > CLOUD_WRITE_BYTE_LIMIT) {
      throw new Error("Eine einzelne Cloud-Zeile überschreitet das maximale Schreib-Payload von 1 MiB.");
    }
    if (chunk.length > 0 && (chunk.length >= CLOUD_WRITE_ROW_LIMIT || chunkBytes + rowBytes > CLOUD_WRITE_BYTE_LIMIT)) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 2;
    }
    chunk.push(row);
    chunkBytes += rowBytes;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

export async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency = CLOUD_WRITE_CONCURRENCY) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export async function upsertRows(client: CloudClient, table: string, rows: object[], options: { concurrency?: number; ignoreDuplicates?: boolean } = {}) {
  const { concurrency = 1, ...upsertOptions } = options;
  await mapWithConcurrency(chunkRows(rows), async (chunk) => {
    const { error } = await cloudTable(client, table).upsert(chunk, { onConflict: ACCOUNT_UPSERT_CONFLICT, ...upsertOptions });
    if (error) throw error;
  }, concurrency);
}

export async function selectKeysetRows<Row extends { id: string }>(client: CloudClient, table: string, userId: string, validate: (rows: unknown) => Row[], { optional = false }: { optional?: boolean } = {}) {
  const rows: Row[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = cloudTable(client, table).select("*").eq("user_id", userId).order("id", { ascending: true }).limit(CLOUD_PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) {
      if (optional && (String(error?.code ?? "") === "42P01" || /does not exist|not exist/i.test(error?.message ?? ""))) return [];
      throw error;
    }
    const page = validate(data ?? []);
    rows.push(...page);
    if (page.length < CLOUD_PAGE_SIZE) break;
    const nextCursor = String(page.at(-1)?.id ?? "");
    if (!nextCursor || nextCursor === cursor) throw new Error(`Cloud-Pagination für ${table} konnte nicht fortgesetzt werden.`);
    cursor = nextCursor;
  }
  return rows;
}

export async function selectRowsByField(client: CloudClient, table: AccountTable, userId: string, field: string, values: string[]) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  const rows: CloudRow[] = [];
  for (let offset = 0; offset < uniqueValues.length; offset += 100) {
    const batch = uniqueValues.slice(offset, offset + 100);
    let cursor: string | null = null;
    while (true) {
      let query = cloudTable(client, table)
        .select("*")
        .eq("user_id", userId)
        .in(field, batch)
        .order("id", { ascending: true })
        .limit(CLOUD_PAGE_SIZE);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw error;
      const page = validateAccountRows(table, data ?? []);
      rows.push(...page);
      if (page.length < CLOUD_PAGE_SIZE) break;
      const nextCursor = String(page.at(-1)?.id ?? "");
      if (!nextCursor || nextCursor === cursor) throw new Error(`Cloud-Pagination für ${table} konnte nicht fortgesetzt werden.`);
      cursor = nextCursor;
    }
  }
  return uniqueRowsById(rows);
}

export async function selectRowById<Row>(client: CloudClient, table: string, userId: string, entityId: string, validate: (rows: unknown) => Row[]) {
  const { data, error } = await cloudTable(client, table).select("*").eq("user_id", userId).eq("id", entityId).maybeSingle();
  if (error) throw error;
  return data == null ? null : validate([data])[0];
}

export function requireBaseRevision(value: unknown) {
  if (value === null) return null;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Basisrevision ist ungültig.");
  return revision;
}
