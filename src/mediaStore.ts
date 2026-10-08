import * as v from "valibot";
import { classifyMediaError, releaseUnreferencedMedia, signMediaUrls, uploadMediaFiles, type CloudMediaControl, type MediaFailureKind } from "./cloudMediaStore.ts";
import type { OfflineMediaManifestEntry } from "./workspaceReplica.ts";

// K4.7: one cached file per account and SHA-1; contents map their media names to SHA-1 (`Note.media`).
const DB_NAME = "core-media-store.v3";
const RETIRED_DB_NAME = "core-media-store.v2";
const DB_VERSION = 1;
const ASSET_STORE = "assets";
const QUEUE_STORE = "upload_queue";
const CLOUD_MEDIA_DOWNLOAD_CONCURRENCY = 4;
const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const sha1Schema = v.pipe(v.string(), v.regex(SHA1_PATTERN));
const mediaFileSchema = v.looseObject({
  sha1: sha1Schema,
  name: v.pipe(v.string(), v.minLength(1)),
  size: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  mimeType: v.optional(v.string(), "application/octet-stream"),
  bytes: v.optional(v.instance(Uint8Array)),
  blob: v.optional(v.instance(Blob)),
});
const assetRecordSchema = v.looseObject({
  key: v.string(),
  userId: v.string(),
  sha1: sha1Schema,
  name: v.pipe(v.string(), v.minLength(1)),
  size: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  mimeType: v.string(),
  blob: v.instance(Blob),
  pinnedDeckIds: v.array(v.string()),
  updatedAt: v.string(),
});
const queueRecordSchema = v.looseObject({ key: v.string(), userId: v.string(), sha1: sha1Schema, queuedAt: v.string() });

interface AssetRecord { key: string; userId: string; sha1: string; name: string; size: number; mimeType: string; blob: Blob; pinnedDeckIds: string[]; updatedAt: string; }
interface QueueRecord { key: string; userId: string; sha1: string; queuedAt: string; }
export interface MediaFileInput { sha1: string; name: string; size: number; mimeType?: string; blob?: Blob; bytes?: Uint8Array; }
export type MediaSyncStatus = "cloud-ready" | "local-pending" | "partial" | "paused" | "cancelled" | "blocked";
export interface MediaSyncProgress { completed: number; total: number; uploaded: number; reused: number; currentName: string; processedBytes: number; totalBytes: number; }
export interface MediaSyncResult { status: MediaSyncStatus; progress: MediaSyncProgress; failureKind?: MediaFailureKind; message: string; }
export interface MediaSyncTask { queued: Promise<void>; result: Promise<MediaSyncResult>; readonly progress: MediaSyncProgress; pause(): Promise<void>; resume(): void; cancel(): Promise<void>; subscribe(listener: (progress: MediaSyncProgress, status: MediaSyncStatus) => void): () => void; }
export interface ResolvedMedia { urls: Record<string, string>; missing: Array<{ name: string; status: string }>; expiresAt: string | null; revoke(): void; }

const sessionAssets = new Map<string, AssetRecord>();
const sessionQueue = new Map<string, QueueRecord>();
const sessionWarning = "IndexedDB ist nicht verfügbar; Medien bleiben nur für diese Browser-Sitzung erhalten und können nach einem Reload nicht sicher fortgesetzt werden.";
const keyFor = (userId: string, sha1: string) => `${userId}\u0000${sha1}`;

function openDatabase(api: IDBFactory | null): Promise<IDBDatabase | null> {
  if (!api) return Promise.resolve(null);
  try { api.deleteDatabase(RETIRED_DB_NAME); } catch { /* The retired cache is only removed opportunistically. */ }
  return new Promise((resolve, reject) => {
    const request = api.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(ASSET_STORE, { keyPath: "key" }).createIndex("userId", "userId");
      db.createObjectStore(QUEUE_STORE, { keyPath: "key" }).createIndex("userId", "userId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Medienspeicher konnte nicht geöffnet werden."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
async function getAllByIndex<T>(db: IDBDatabase, store: string, index: string, key: IDBValidKey) { const transaction = db.transaction(store, "readonly"); return requestResult(transaction.objectStore(store).index(index).getAll(key)) as Promise<T[]>; }

async function sha1Hex(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error("Der Browser kann Medienprüfsummen nicht verifizieren.");
  const digest = await globalThis.crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeFile(file: unknown) {
  const parsed = v.safeParse(mediaFileSchema, file);
  if (!parsed.success) return null;
  const blob = parsed.output.blob ?? new Blob([parsed.output.bytes ?? new Uint8Array()], { type: parsed.output.mimeType });
  if (blob.size !== parsed.output.size) return null;
  return { sha1: parsed.output.sha1, name: parsed.output.name, size: parsed.output.size, mimeType: parsed.output.mimeType, blob };
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

function trustedSignedMediaUrl(value: unknown, supabaseUrl: string) {
  try {
    const base = new URL(supabaseUrl);
    const candidate = new URL(String(value), base);
    return candidate.origin === base.origin && candidate.pathname.startsWith("/storage/v1/object/sign/") ? candidate.href : null;
  } catch {
    return null;
  }
}

export function createAccountMediaStore({ client, supabaseUrl, userId, indexedDB: indexedDb = globalThis.indexedDB, fetchImpl = globalThis.fetch }: { client: any; supabaseUrl: string; userId: string; indexedDB?: IDBFactory | null; fetchImpl?: typeof fetch }) {
  const databaseApi = indexedDb ?? null;

  async function readAsset(sha1: string): Promise<AssetRecord | null> {
    const session = sessionAssets.get(keyFor(userId, sha1));
    if (session) return session;
    const db = await openDatabase(databaseApi).catch(() => null);
    if (!db) return null;
    const transaction = db.transaction(ASSET_STORE, "readonly");
    const candidate = await requestResult(transaction.objectStore(ASSET_STORE).get(keyFor(userId, sha1))).catch(() => undefined);
    db.close();
    return v.safeParse(assetRecordSchema, candidate).success ? candidate as AssetRecord : null;
  }

  /** Caches files locally and, unless they only serve a preview, queues their upload persistently. */
  async function cacheMedia(files: unknown[], { queueUpload = true, pinDeckId = null }: { queueUpload?: boolean; pinDeckId?: string | null } = {}) {
    const valid = files.map(normalizeFile).filter((file): file is NonNullable<ReturnType<typeof normalizeFile>> => Boolean(file));
    const errors = valid.length === files.length ? [] : ["Medien enthielten ungültige Metadaten oder Dateidaten."];
    const now = new Date().toISOString();
    const db = await openDatabase(databaseApi).catch(() => null);
    if (db) {
      const transaction = db.transaction([ASSET_STORE, QUEUE_STORE], "readwrite");
      const store = transaction.objectStore(ASSET_STORE);
      for (const file of valid) {
        const key = keyFor(userId, file.sha1);
        const current = await requestResult<AssetRecord | undefined>(store.get(key));
        const pinnedDeckIds = [...new Set([...(current?.pinnedDeckIds ?? []), ...(pinDeckId ? [pinDeckId] : [])])];
        store.put({ key, userId, sha1: file.sha1, name: current?.name ?? file.name, size: file.size, mimeType: file.mimeType, blob: file.blob, pinnedDeckIds, updatedAt: now });
        if (queueUpload) transaction.objectStore(QUEUE_STORE).put({ key, userId, sha1: file.sha1, queuedAt: now });
      }
      await transactionDone(transaction);
      db.close();
    } else {
      for (const file of valid) {
        const key = keyFor(userId, file.sha1);
        const current = sessionAssets.get(key);
        sessionAssets.set(key, { key, userId, sha1: file.sha1, name: current?.name ?? file.name, size: file.size, mimeType: file.mimeType, blob: file.blob, pinnedDeckIds: [...new Set([...(current?.pinnedDeckIds ?? []), ...(pinDeckId ? [pinDeckId] : [])])], updatedAt: now });
        if (queueUpload) sessionQueue.set(key, { key, userId, sha1: file.sha1, queuedAt: now });
      }
      errors.push(sessionWarning);
    }
    return { persisted: Boolean(db), count: valid.length, errors };
  }

  async function queuedRecords(sha1s?: readonly string[]) {
    const records = new Map<string, QueueRecord>();
    for (const record of sessionQueue.values()) if (record.userId === userId) records.set(record.key, record);
    const db = await openDatabase(databaseApi).catch(() => null);
    if (db) {
      for (const candidate of await getAllByIndex<unknown>(db, QUEUE_STORE, "userId", userId)) {
        const parsed = v.safeParse(queueRecordSchema, candidate);
        if (parsed.success) records.set(parsed.output.key, parsed.output as QueueRecord);
      }
      db.close();
    }
    const wanted = sha1s ? new Set(sha1s) : null;
    return [...records.values()].filter((record) => !wanted || wanted.has(record.sha1));
  }

  async function dequeue(sha1s: string[]) {
    for (const sha1 of sha1s) sessionQueue.delete(keyFor(userId, sha1));
    const db = await openDatabase(databaseApi).catch(() => null);
    if (!db) return;
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    for (const sha1 of sha1s) transaction.objectStore(QUEUE_STORE).delete(keyFor(userId, sha1));
    await transactionDone(transaction);
    db.close();
  }

  /** Uploads queued files (all or the given SHA-1s); the queue survives reloads until the cloud confirms a file. */
  function syncQueuedMedia({ sha1s, waitUntilReady, onProgress }: { sha1s?: readonly string[]; waitUntilReady?: Promise<unknown>; onProgress?(progress: MediaSyncProgress): void } = {}): MediaSyncTask {
    let status: MediaSyncStatus = "local-pending";
    let progress: MediaSyncProgress = { completed: 0, total: 0, uploaded: 0, reused: 0, currentName: "", processedBytes: 0, totalBytes: 0 };
    const listeners = new Set<(progress: MediaSyncProgress, status: MediaSyncStatus) => void>();
    let resolveQueued!: () => void;
    let rejectQueued!: (error: unknown) => void;
    const queued = new Promise<void>((resolve, reject) => { resolveQueued = resolve; rejectQueued = reject; });
    const notify = () => { onProgress?.(progress); listeners.forEach((listener) => listener(progress, status)); };
    const control = createControl((next) => { status = next; notify(); });
    const result = (async (): Promise<MediaSyncResult> => {
      const files: Array<{ sha1: string; name: string; size: number; mimeType: string; blob: Blob }> = [];
      try {
        for (const record of await queuedRecords(sha1s)) {
          const asset = await readAsset(record.sha1);
          if (asset) files.push({ sha1: asset.sha1, name: asset.name, size: asset.size, mimeType: asset.mimeType, blob: asset.blob });
        }
        progress = { ...progress, total: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0) };
        notify();
        resolveQueued();
      } catch (error) {
        rejectQueued(error);
        throw error;
      }
      if (!files.length) {
        status = "cloud-ready";
        notify();
        return { status, progress, message: "Keine Medien ausstehend." };
      }
      if (!client) return { status: "local-pending", progress, failureKind: "network", message: "Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus." };
      try {
        await waitUntilReady;
        const synced = await uploadMediaFiles({ client, supabaseUrl, userId, files, control, onProgress(next) { progress = next; notify(); } });
        await dequeue(synced.syncedSha1s);
        status = "cloud-ready";
        notify();
        return { status, progress, message: `${synced.uploaded} Medien hochgeladen, ${synced.reused} wiederverwendet.` };
      } catch (error) {
        const kind = classifyMediaError(error);
        const retryable = kind === "auth" || kind === "network" || kind === "rate-limited";
        status = kind === "cancelled" ? "cancelled" : retryable ? "local-pending" : progress.completed > 0 ? "partial" : "blocked";
        notify();
        const message = kind === "integrity"
          ? "Ein Medium hat die Integritätsprüfung nicht bestanden."
          : status === "cancelled" ? "Der Medien-Upload wurde abgebrochen."
            : status === "local-pending" ? "Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus."
              : "Mindestens ein Medium konnte nicht vollständig in der Cloud gespeichert werden.";
        return { status, progress, failureKind: kind, message };
      }
    })();
    return {
      queued,
      result,
      get progress() { return progress; },
      pause: () => control.pause(),
      resume: () => control.resume(),
      cancel: () => control.cancel(),
      subscribe(listener) { listeners.add(listener); listener(progress, status); return () => listeners.delete(listener); },
    };
  }

  /** Blob URLs for the media names of a content: local file first, otherwise downloaded from a signed URL. */
  async function resolveMedia(media: Record<string, string>): Promise<ResolvedMedia> {
    const objectUrls: string[] = [];
    const urls: Record<string, string> = {};
    const missing: Array<{ name: string; status: string }> = [];
    const namesBySha1 = new Map<string, string[]>();
    for (const [name, sha1] of Object.entries(media)) namesBySha1.set(sha1, [...(namesBySha1.get(sha1) ?? []), name]);
    const cloudSha1s: string[] = [];
    for (const [sha1, names] of namesBySha1) {
      const record = await readAsset(sha1);
      if (!record || typeof URL?.createObjectURL !== "function") {
        cloudSha1s.push(sha1);
        continue;
      }
      const url = URL.createObjectURL(record.blob);
      objectUrls.push(url);
      for (const name of names) urls[name] = url;
    }
    let expiresAt: string | null = null;
    if (cloudSha1s.length && client && fetchImpl && typeof URL?.createObjectURL === "function") {
      const signed = await signMediaUrls(client, userId, cloudSha1s).catch(() => ({ urls: {} as Record<string, string>, missing: cloudSha1s, expiresAt: null }));
      expiresAt = signed.expiresAt;
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CLOUD_MEDIA_DOWNLOAD_CONCURRENCY, cloudSha1s.length) }, async () => {
        while (next < cloudSha1s.length) {
          const sha1 = cloudSha1s[next++];
          const url = trustedSignedMediaUrl(signed.urls[sha1], supabaseUrl);
          if (!url) continue;
          try {
            const response = await fetchImpl(url, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
            if (!response.ok) continue;
            const objectUrl = URL.createObjectURL(await response.blob());
            objectUrls.push(objectUrl);
            for (const name of namesBySha1.get(sha1) ?? []) urls[name] = objectUrl;
          } catch {
            // The card renders without this file; the missing list names it.
          }
        }
      }));
    }
    for (const [name] of Object.entries(media)) if (!urls[name]) missing.push({ name, status: "Medium fehlt lokal und in der Cloud." });
    return { urls, missing, expiresAt, revoke() { objectUrls.forEach((url) => URL.revokeObjectURL(url)); } };
  }

  /** Offline download: verifies and pins each file of a deck's manifest. */
  async function cacheCloudManifestMedia(
    deckId: string,
    manifest: OfflineMediaManifestEntry[],
    onProgress?: (progress: { completed: number; total: number; downloadedBytes: number }) => void,
  ) {
    if (!client || !fetchImpl) throw new Error("Cloud-Medien können ohne Verbindung nicht geladen werden.");
    const unique = [...new Map(manifest.map((entry) => [entry.sha1, entry])).values()];
    let completed = 0;
    let downloadedBytes = 0;
    const missing: OfflineMediaManifestEntry[] = [];
    for (const entry of unique) {
      const local = await readAsset(entry.sha1);
      if (local && local.size === entry.size && await sha1Hex(local.blob) === entry.sha1) {
        await cacheMedia([{ sha1: local.sha1, name: local.name, size: local.size, mimeType: local.mimeType, blob: local.blob }], { queueUpload: false, pinDeckId: deckId });
        completed += 1;
        downloadedBytes += entry.size;
        onProgress?.({ completed, total: unique.length, downloadedBytes });
      } else {
        missing.push(entry);
      }
    }
    const signed = await signMediaUrls(client, userId, missing.map((entry) => entry.sha1));
    if (signed.missing.length > 0) throw new Error("Mindestens ein Cloud-Medium ist nicht mehr verfügbar.");
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CLOUD_MEDIA_DOWNLOAD_CONCURRENCY, missing.length) }, async () => {
      while (next < missing.length) {
        const entry = missing[next++];
        const url = trustedSignedMediaUrl(signed.urls[entry.sha1], supabaseUrl);
        if (!url) throw new Error("Eine Medien-URL konnte nicht sicher geprüft werden.");
        const response = await fetchImpl(url, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error(`Medium „${entry.originalName}“ konnte nicht geladen werden.`);
        const blob = await response.blob();
        if (blob.size !== entry.size) throw new Error(`Medium „${entry.originalName}“ hat eine unerwartete Größe.`);
        if (await sha1Hex(blob) !== entry.sha1) throw new Error(`Medium „${entry.originalName}“ hat eine ungültige Prüfsumme.`);
        const cached = await cacheMedia([{ sha1: entry.sha1, name: entry.originalName, size: entry.size, mimeType: entry.mimeType, blob }], { queueUpload: false, pinDeckId: deckId });
        if (cached.count !== 1 || cached.errors.length > 0) throw new Error(cached.errors[0] ?? "Medium konnte nicht lokal gespeichert werden.");
        completed += 1;
        downloadedBytes += entry.size;
        onProgress?.({ completed, total: unique.length, downloadedBytes });
      }
    }));
    return { completed, total: unique.length, downloadedBytes };
  }

  /** Unpins a deck's offline files; a file stays while another deck pins it or its upload is pending. */
  async function removeCachedDeckMedia(deckId: string) {
    const pending = new Set((await queuedRecords()).map((record) => record.sha1));
    let removed = 0;
    for (const [key, record] of sessionAssets) {
      if (record.userId !== userId || !record.pinnedDeckIds.includes(deckId)) continue;
      const pinnedDeckIds = record.pinnedDeckIds.filter((id) => id !== deckId);
      if (pinnedDeckIds.length || pending.has(record.sha1)) sessionAssets.set(key, { ...record, pinnedDeckIds });
      else { sessionAssets.delete(key); removed += 1; }
    }
    const db = await openDatabase(databaseApi).catch(() => null);
    if (!db) return removed;
    const rows = (await getAllByIndex<AssetRecord>(db, ASSET_STORE, "userId", userId)).filter((row) => row.pinnedDeckIds?.includes(deckId));
    const transaction = db.transaction(ASSET_STORE, "readwrite");
    const store = transaction.objectStore(ASSET_STORE);
    for (const row of rows) {
      const pinnedDeckIds = row.pinnedDeckIds.filter((id) => id !== deckId);
      if (pinnedDeckIds.length || pending.has(row.sha1)) store.put({ ...row, pinnedDeckIds });
      else { store.delete(row.key); removed += 1; }
    }
    await transactionDone(transaction);
    db.close();
    return removed;
  }

  function startRetryLifecycle({ ensureCloudParents, onStatus }: { ensureCloudParents(): Promise<unknown>; onStatus?(result: MediaSyncResult): void }) {
    let stopped = false;
    const retry = async () => {
      if (stopped || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      try {
        if (!(await queuedRecords()).length) return;
        await ensureCloudParents();
        onStatus?.(await syncQueuedMedia().result);
      } catch { /* Der nächste Online-Impuls versucht die persistente Queue erneut. */ }
    };
    const online = () => { void retry(); };
    globalThis.addEventListener?.("online", online);
    void retry();
    return { retry, stop() { stopped = true; globalThis.removeEventListener?.("online", online); } };
  }

  return {
    cacheMedia,
    syncQueuedMedia,
    resolveMedia,
    cacheCloudManifestMedia,
    removeCachedDeckMedia,
    releaseUnreferencedMedia: () => client ? releaseUnreferencedMedia(client, userId) : Promise.resolve(0),
    startRetryLifecycle,
  };
}

export type AccountMediaStore = ReturnType<typeof createAccountMediaStore>;
