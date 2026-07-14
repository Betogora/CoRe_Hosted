import * as v from "valibot";
import { classifyMediaError, resolveReferences, syncReferences, type CloudMediaControl, type CloudMediaFile, type MediaFailureKind } from "./cloudMediaStore.ts";
import type { Deck, MediaAssetReference } from "./coreTypes.ts";
import { sanitizeCardHtml } from "./htmlSafety.ts";

const DB_NAME = "core-media-store";
const DB_VERSION = 2;
const LEGACY_STORE = "assets";
const ASSET_STORE = "account_assets";
const QUEUE_STORE = "media_queue";
const CLEANUP_STORE = "media_cleanup";
const sha1Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{40}$/));
const mediaFileSchema = v.looseObject({ sha1: sha1Schema, name: v.pipe(v.string(), v.minLength(1)), size: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), mimeType: v.optional(v.string(), "application/octet-stream"), bytes: v.optional(v.instance(Uint8Array)), blob: v.optional(v.instance(Blob)), cardId: v.optional(v.nullable(v.string())) });
const localAssetRecordSchema = v.looseObject({ key: v.string(), userId: v.string(), deckId: v.string(), sha1: sha1Schema, name: v.pipe(v.string(), v.minLength(1)), size: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), mimeType: v.string(), blob: v.instance(Blob), cardId: v.nullable(v.string()), updatedAt: v.string() });
const queueRecordSchema = v.looseObject({ id: v.string(), userId: v.string(), deckId: v.string(), sha1: sha1Schema, size: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), name: v.string(), cardId: v.nullable(v.string()), queuedAt: v.string() });

interface LocalAssetRecord { key: string; userId: string; deckId: string; sha1: string; name: string; size: number; mimeType: string; blob: Blob; cardId: string | null; updatedAt: string; }
interface QueueRecord { id: string; userId: string; deckId: string; sha1: string; size: number; name: string; cardId: string | null; queuedAt: string; }
export type MediaSyncStatus = "cloud-ready" | "local-pending" | "partial" | "paused" | "cancelled" | "blocked";
export interface MediaSyncProgress { completed: number; total: number; uploaded: number; reused: number; currentName: string; }
export interface MediaSyncResult { status: MediaSyncStatus; referencesByDeck: Map<string, MediaAssetReference[]>; progress: MediaSyncProgress; failureKind?: MediaFailureKind; message: string; }
export interface MediaSyncTask { result: Promise<MediaSyncResult>; readonly progress: MediaSyncProgress; pause(): Promise<void>; resume(): void; cancel(): Promise<void>; subscribe(listener: (progress: MediaSyncProgress, status: MediaSyncStatus) => void): () => void; }
export interface ResolvedDeckMedia { urls: Record<string, string>; missing: Array<{ name: string; status: string }>; expiresAt: string | null; refreshAfterMs: number | null; revoke(): void; }

const sessionAssets = new Map<string, LocalAssetRecord>();
const sessionQueue = new Map<string, QueueRecord>();
const sessionWarning = "IndexedDB ist nicht verfügbar; Medien bleiben nur für diese Browser-Sitzung erhalten und können nach einem Reload nicht sicher fortgesetzt werden.";
const keyFor = (userId: string, sha1: string) => `${userId}\u0000${sha1}`;
const queueIdFor = (userId: string, deckId: string, sha1: string, cardId: string | null) => `${userId}\u0000${deckId}\u0000${cardId ?? ""}\u0000${sha1}`;

function openDatabase(api: IDBFactory | null): Promise<IDBDatabase | null> {
  if (!api) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = api.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE, { keyPath: "sha1" });
      if (!db.objectStoreNames.contains(ASSET_STORE)) { const store = db.createObjectStore(ASSET_STORE, { keyPath: "key" }); store.createIndex("userId", "userId"); store.createIndex("deckId", ["userId", "deckId"]); }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) { const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id" }); store.createIndex("userId", "userId"); }
      if (!db.objectStoreNames.contains(CLEANUP_STORE)) { const store = db.createObjectStore(CLEANUP_STORE, { keyPath: "id" }); store.createIndex("userId", "userId"); }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Medienspeicher konnte nicht geöffnet werden."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
async function put(db: IDBDatabase, store: string, value: unknown) { const transaction = db.transaction(store, "readwrite"); transaction.objectStore(store).put(value); await transactionDone(transaction); }
async function remove(db: IDBDatabase, store: string, key: IDBValidKey) { const transaction = db.transaction(store, "readwrite"); transaction.objectStore(store).delete(key); await transactionDone(transaction); }
async function get<T>(db: IDBDatabase, store: string, key: IDBValidKey) { const transaction = db.transaction(store, "readonly"); return requestResult(transaction.objectStore(store).get(key)) as Promise<T | undefined>; }
async function getAllByIndex<T>(db: IDBDatabase, store: string, index: string, key: IDBValidKey) { const transaction = db.transaction(store, "readonly"); return requestResult(transaction.objectStore(store).index(index).getAll(key)) as Promise<T[]>; }

function assetManifest(deck: Deck | any): unknown[] {
  const manifest = deck?.importMeta?.mediaManifest;
  return manifest && typeof manifest === "object" && Array.isArray(manifest.assets) ? manifest.assets : [];
}

function mediaUsageByName(deck: Deck) {
  const usage = new Map<string, Set<string>>();
  for (const card of deck.cards ?? []) {
    for (const reference of card.mediaRefs ?? []) {
      const names = new Set([String(reference), normalizeRef(reference)].filter(Boolean));
      for (const name of names) usage.set(name, new Set([...(usage.get(name) ?? []), card.id]));
    }
  }
  return usage;
}

function normalizeFile(file: unknown): CloudMediaFile | null {
  const parsed = v.safeParse(mediaFileSchema, file);
  if (!parsed.success) return null;
  const blob = parsed.output.blob ?? new Blob([parsed.output.bytes ?? new Uint8Array()], { type: parsed.output.mimeType });
  if (blob.size !== parsed.output.size) return null;
  return { sha1: parsed.output.sha1, name: parsed.output.name, size: parsed.output.size, mimeType: parsed.output.mimeType, blob, cardId: parsed.output.cardId ?? null };
}

function createControl(onStatus: (status: MediaSyncStatus) => void): CloudMediaControl & { pause(): Promise<void>; resume(): void; cancel(): Promise<void> } {
  let cancelled = false, paused = false, active: { abort(terminate: boolean): Promise<void>; start?(): void } | null = null, release: (() => void) | null = null, cancelHandler: (() => void) | null = null;
  return {
    isCancelled: () => cancelled,
    setActiveUpload(upload) { active = upload; },
    setCancelHandler(handler) { cancelHandler = handler; },
    waitUntilResumed() { return paused ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve(); },
    async pause() { if (cancelled || paused) return; paused = true; onStatus("paused"); await active?.abort(false); },
    resume() { if (cancelled || !paused) return; paused = false; onStatus("local-pending"); active?.start?.(); release?.(); release = null; },
    async cancel() {
      cancelled = true;
      paused = false;
      release?.();
      release = null;
      try { await active?.abort(true); }
      finally {
        cancelHandler?.();
        cancelHandler = null;
        active = null;
        onStatus("cancelled");
      }
    },
  };
}

function normalizeRef(value: unknown) { const raw = String(value ?? "").split(/[?#]/)[0].replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? ""; try { return decodeURIComponent(raw); } catch { return raw; } }
function escapeAttribute(value: unknown) { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

export function resolveCardHtmlMedia(html: unknown, mediaUrls: Record<string, string> = {}) {
  return sanitizeCardHtml(html).replace(/\s(src|href)=("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, attr, rawValue) => {
    const quote = rawValue.startsWith("'") ? "'" : rawValue.startsWith('"') ? '"' : "";
    const value = quote ? rawValue.slice(1, -1) : rawValue;
    const url = mediaUrls[value] ?? mediaUrls[normalizeRef(value)];
    if (!url) return match;
    const outputQuote = quote || '"';
    const escaped = outputQuote === '"' ? escapeAttribute(url) : String(url).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
    return ` ${attr}=${outputQuote}${escaped}${outputQuote}`;
  });
}

export function createAccountMediaStore({ client, supabaseUrl, userId, indexedDB: indexedDb = globalThis.indexedDB }: { client: any; supabaseUrl: string; userId: string; indexedDB?: IDBFactory | null }) {
  const databaseApi = indexedDb ?? null;

  async function readAsset(sha1: string): Promise<LocalAssetRecord | null> {
    const session = sessionAssets.get(keyFor(userId, sha1));
    if (session) return session;
    const db = await openDatabase(databaseApi).catch(() => null);
    if (!db) return null;
    const candidate = await get<unknown>(db, ASSET_STORE, keyFor(userId, sha1)).catch(() => undefined);
    let record = v.safeParse(localAssetRecordSchema, candidate).success ? candidate as LocalAssetRecord : undefined;
    if (!record) {
      const legacy = await get<any>(db, LEGACY_STORE, sha1).catch(() => undefined);
      if (legacy?.blob instanceof Blob && legacy.sha1 === sha1) {
        record = { key: keyFor(userId, sha1), userId, deckId: "legacy", sha1, name: String(legacy.name ?? sha1), size: Number(legacy.size ?? legacy.blob.size), mimeType: String(legacy.mimeType ?? legacy.blob.type), blob: legacy.blob, cardId: null, updatedAt: nowIso() };
        await put(db, ASSET_STORE, record);
      }
    }
    db.close();
    return record ?? null;
  }

  async function cachePreviewMedia(deck: Deck, files: unknown[] = []) {
    const valid = files.map(normalizeFile).filter((file): file is CloudMediaFile => Boolean(file));
    const errors = valid.length === files.length ? [] : ["Medien enthielten ungültige Metadaten oder Dateidaten."];
    const db = await openDatabase(databaseApi).catch(() => null);
    for (const file of valid) {
      const record: LocalAssetRecord = { key: keyFor(userId, file.sha1), userId, deckId: deck.id, sha1: file.sha1, name: file.name, size: file.size, mimeType: file.mimeType, blob: file.blob, cardId: file.cardId ?? null, updatedAt: nowIso() };
      sessionAssets.set(record.key, record);
      if (db) await put(db, ASSET_STORE, record);
    }
    db?.close();
    if (!db) errors.push(sessionWarning);
    return { persisted: Boolean(db), count: valid.length, errors };
  }

  function syncImportMedia(decks: Deck[], options: { onProgress?(progress: MediaSyncProgress): void } = {}): MediaSyncTask {
    let status: MediaSyncStatus = "local-pending";
    let progress: MediaSyncProgress = { completed: 0, total: 0, uploaded: 0, reused: 0, currentName: "" };
    const listeners = new Set<(progress: MediaSyncProgress, status: MediaSyncStatus) => void>();
    const queuedIds: string[] = [];
    const notify = () => { options.onProgress?.(progress); listeners.forEach((listener) => listener(progress, status)); };
    const control = createControl((next) => { status = next; notify(); });
    const result = (async (): Promise<MediaSyncResult> => {
      const inputs = [];
      const db = await openDatabase(databaseApi).catch(() => null);
      for (const deck of decks) {
        const files: CloudMediaFile[] = [];
        const usage = mediaUsageByName(deck);
        const usedReferenceKeys = new Set(usage.keys());
        for (const item of assetManifest(deck)) {
          const sha1 = String((item as any)?.sha1 ?? "").toLowerCase();
          const name = String((item as any)?.name ?? sha1);
          const cardIds = usage.get(name) ?? usage.get(normalizeRef(name));
          if (!cardIds?.size) continue;
          const record = /^[a-f0-9]{40}$/.test(sha1) ? await readAsset(sha1) : null;
          if (record) {
            const cardId = cardIds.size === 1 ? [...cardIds][0] : null;
            files.push({ sha1, name, size: record.size, mimeType: record.mimeType, blob: record.blob, cardId });
            const queue: QueueRecord = { id: queueIdFor(userId, deck.id, sha1, cardId), userId, deckId: deck.id, sha1, size: record.size, name, cardId, queuedAt: nowIso() };
            queuedIds.push(queue.id);
            sessionQueue.set(queue.id, queue); if (db) await put(db, QUEUE_STORE, queue);
          }
        }
        const retainedReferences = (deck.mediaAssets ?? []).filter((reference) => usedReferenceKeys.has(reference.originalName) || usedReferenceKeys.has(normalizeRef(reference.originalName)) || usedReferenceKeys.has(reference.sha1));
        inputs.push({ deckId: deck.id, files, previousReferences: deck.mediaAssets ?? [], retainedReferences });
      }
      db?.close();
      progress = { ...progress, total: inputs.reduce((sum, input) => sum + input.files.length, 0) }; notify();
      if (!client) return { status: "local-pending", referencesByDeck: new Map(), progress, failureKind: "network", message: "Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus." };
      try {
        const synced = await syncReferences({ client, supabaseUrl, userId, decks: inputs, control, onProgress(next) { progress = next; notify(); } });
        for (const input of inputs) for (const file of input.files) { const id = queueIdFor(userId, input.deckId, file.sha1, file.cardId ?? null); sessionQueue.delete(id); const queueDb = await openDatabase(databaseApi).catch(() => null); if (queueDb) { await remove(queueDb, QUEUE_STORE, id); queueDb.close(); } }
        status = "cloud-ready"; notify();
        return { status, referencesByDeck: synced.referencesByDeck, progress, message: `${synced.uploaded} Medien hochgeladen, ${synced.reused} wiederverwendet.` };
      } catch (error) {
        const kind = classifyMediaError(error);
        status = kind === "cancelled" ? "cancelled" : progress.completed > 0 ? "partial" : kind === "auth" || kind === "network" || kind === "rate-limited" ? "local-pending" : "blocked";
        notify();
        return { status, referencesByDeck: new Map(), progress, failureKind: kind, message: kind === "integrity" ? "Ein Medium hat die Integritätsprüfung nicht bestanden." : status === "cancelled" ? "Der Medien-Upload wurde abgebrochen." : "Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus." };
      }
    })();
    const cancel = async () => {
      await control.cancel();
      const db = await openDatabase(databaseApi).catch(() => null);
      for (const id of queuedIds) { sessionQueue.delete(id); if (db) await remove(db, QUEUE_STORE, id); }
      db?.close();
    };
    return { result, get progress() { return progress; }, pause: () => control.pause(), resume: () => control.resume(), cancel, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  }

  async function resolveDeckMedia(deck: Deck): Promise<ResolvedDeckMedia> {
    const objectUrls: string[] = [];
    const cloud = client && deck.mediaAssets?.length ? await resolveReferences(client, deck.mediaAssets).catch(() => ({ urls: {}, missing: deck.mediaAssets, expiresAt: null })) : { urls: {}, missing: deck.mediaAssets ?? [], expiresAt: null };
    const urls: Record<string, string> = { ...cloud.urls };
    const missing: Array<{ name: string; status: string }> = [];
    for (const item of assetManifest(deck)) {
      const sha1 = String((item as any)?.sha1 ?? "").toLowerCase();
      const name = String((item as any)?.name ?? sha1);
      if (urls[sha1]) { urls[name] = urls[sha1]; continue; }
      const record = await readAsset(sha1);
      if (record && typeof URL?.createObjectURL === "function") { const url = URL.createObjectURL(record.blob); objectUrls.push(url); urls[sha1] = url; urls[name] = url; missing.push({ name, status: "Nur lokal verfügbar; Cloud-Upload ausstehend." }); }
      else missing.push({ name, status: "Medium fehlt lokal und in der Cloud." });
    }
    return { urls, missing, expiresAt: cloud.expiresAt, refreshAfterMs: cloud.expiresAt ? Math.max(1_000, new Date(cloud.expiresAt).getTime() - Date.now() - 60_000) : null, revoke() { objectUrls.forEach((url) => URL.revokeObjectURL(url)); } };
  }

  function startRetryLifecycle({ getDecks, ensureCloudParents, onStatus }: { getDecks(): Deck[]; ensureCloudParents(): Promise<unknown>; onStatus?(result: MediaSyncResult): void }) {
    let stopped = false;
    const retry = async () => {
      if (stopped || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      try {
        const queuedDeckIds = new Set([...sessionQueue.values()].filter((item) => item.userId === userId).map((item) => item.deckId));
        const db = await openDatabase(databaseApi).catch(() => null);
        if (db) {
          for (const candidate of await getAllByIndex<unknown>(db, QUEUE_STORE, "userId", userId)) {
            const parsed = v.safeParse(queueRecordSchema, candidate);
            if (parsed.success) queuedDeckIds.add(parsed.output.deckId);
            else if (candidate && typeof candidate === "object" && "id" in candidate) await remove(db, QUEUE_STORE, String(candidate.id));
          }
          db.close();
        }
        if (queuedDeckIds.size === 0) return;
        await ensureCloudParents();
        const task = syncImportMedia(getDecks().filter((deck) => queuedDeckIds.has(deck.id)));
        onStatus?.(await task.result);
      } catch { /* Der nächste Online-Impuls versucht die persistente Queue erneut. */ }
    };
    const online = () => { void retry(); };
    globalThis.addEventListener?.("online", online);
    void retry();
    return { retry, stop() { stopped = true; globalThis.removeEventListener?.("online", online); } };
  }

  return { cachePreviewMedia, syncImportMedia, resolveDeckMedia, startRetryLifecycle };
}

function nowIso() { return new Date().toISOString(); }

const compatibilityStore = () => createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "local-user" });
export async function storeDeckMedia(deck: Deck, files: unknown[] = []) { return compatibilityStore().cachePreviewMedia(deck, files); }
export async function createDeckMediaUrlMap(deck: Deck | any) { return compatibilityStore().resolveDeckMedia(deck); }
