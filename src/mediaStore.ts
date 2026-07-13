import * as v from "valibot";
import { sanitizeCardHtml } from "./htmlSafety.js";

const DB_NAME = "core-media-store";
const DB_VERSION = 1;
const STORE_NAME = "assets";
const mediaKeySchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^[A-Za-z0-9]+$/));
const mediaAssetSchema = v.looseObject({
  sha1: mediaKeySchema,
  name: v.pipe(v.string(), v.minLength(1)),
  size: v.pipe(v.number(), v.minValue(0)),
  mimeType: v.optional(v.string(), "application/octet-stream"),
});
const mediaFileSchema = v.looseObject({
  ...mediaAssetSchema.entries,
  bytes: v.instance(Uint8Array),
});
const mediaRecordSchema = v.looseObject({
  ...mediaAssetSchema.entries,
  updatedAt: v.string(),
  blob: v.instance(Blob),
});

type MediaRecord = v.InferOutput<typeof mediaRecordSchema>;

const sessionAssets = new Map<string, MediaRecord>();

function getIndexedDb() {
  return typeof indexedDB === "undefined" ? null : indexedDB;
}

function openMediaDatabase(): Promise<IDBDatabase | null> {
  const databaseApi = getIndexedDb();
  if (!databaseApi) return Promise.resolve(null);

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = databaseApi.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "sha1" });
        store.createIndex("name", "name", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Medienspeicher konnte nicht geöffnet werden."));
  });
}

function putRecord(db: IDBDatabase, record: MediaRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Medium konnte nicht gespeichert werden."));
  });
}

function getRecord(db: IDBDatabase, sha1: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(sha1);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Medium konnte nicht geladen werden."));
  });
}

function toBlob(file: any) {
  return new Blob([file.bytes], { type: file.mimeType || "application/octet-stream" });
}

function normalizeRef(value: any) {
  const withoutQuery = String(value ?? "").split(/[?#]/)[0];
  const normalized = withoutQuery.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? withoutQuery;

  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function lookupMediaUrl(mediaUrls: any, ref: any) {
  const candidates = [ref, normalizeRef(ref)];
  return candidates.map((candidate: any) => mediaUrls?.[candidate]).find(Boolean) ?? null;
}

function escapeAttribute(value: any) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function resolveCardHtmlMedia(html: any, mediaUrls: any = {}) {
  const safeHtml = sanitizeCardHtml(html);
  return safeHtml.replace(/\s(src|href)=("[^"]*"|'[^']*'|[^\s>]+)/gi, (match: any, attr: any, rawValue: any) => {
    const quote = rawValue.startsWith("'") ? "'" : rawValue.startsWith('"') ? '"' : "";
    const value = quote ? rawValue.slice(1, -1) : rawValue;
    const mediaUrl = lookupMediaUrl(mediaUrls, value);

    if (!mediaUrl) return match;

    const outputQuote = quote || '"';
    const escapedUrl =
      outputQuote === '"' ? escapeAttribute(mediaUrl) : String(mediaUrl).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
    return ` ${attr}=${outputQuote}${escapedUrl}${outputQuote}`;
  });
}

export async function storeDeckMedia(deck: any, mediaFiles: any = []) {
  if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) {
    return { persisted: true, count: 0, errors: [] };
  }

  const invalidFiles: unknown[] = [];
  const records = mediaFiles.flatMap((file: unknown) => {
    const parsed = v.safeParse(mediaFileSchema, file);
    if (!parsed.success) {
      invalidFiles.push(file);
      return [];
    }
    const record: MediaRecord = {
      sha1: parsed.output.sha1,
      name: parsed.output.name,
      size: parsed.output.size,
      mimeType: parsed.output.mimeType,
      updatedAt: new Date().toISOString(),
      blob: toBlob(parsed.output),
    };
    sessionAssets.set(record.sha1, record);
    return [record];
  });

  if (records.length === 0 && invalidFiles.length > 0) {
    return { persisted: false, count: 0, errors: ["Medien enthielten ungültige Metadaten oder Dateidaten."] };
  }

  try {
    const db = await openMediaDatabase();
    if (!db) {
      return {
        persisted: false,
        count: records.length,
        errors: ["IndexedDB ist nicht verfügbar; Medien bleiben nur für diese Browser-Sitzung sichtbar."],
      };
    }

    await Promise.all(records.map((record: any) => putRecord(db, record)));
    db.close();
    return { persisted: true, count: records.length, errors: [] };
  } catch (error) {
    return {
      persisted: false,
      count: records.length,
      errors: [error instanceof Error ? error.message : "Medienspeicher konnte nicht verwendet werden."],
    };
  }
}

export async function createDeckMediaUrlMap(deck: any) {
  const assets: unknown[] = Array.isArray(deck?.importMeta?.mediaManifest?.assets)
    ? deck.importMeta.mediaManifest.assets
    : [];
  const urls: Record<string, any> = {};
  const objectUrls: any[] = [];
  const missing: any[] = [];

  if (assets.length === 0 || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return {
      urls,
      missing,
      revoke() {},
    };
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openMediaDatabase();
  } catch {
    db = null;
  }

  for (const candidate of assets) {
    const assetResult = v.safeParse(mediaAssetSchema, candidate);
    if (!assetResult.success) {
      missing.push(candidate);
      continue;
    }
    const asset = assetResult.output;
    const sessionRecord = sessionAssets.get(asset.sha1);
    const storedRecord = sessionRecord ?? (db ? await getRecord(db, asset.sha1).catch(() => null) : null);
    const recordResult = v.safeParse(mediaRecordSchema, storedRecord);

    if (!recordResult.success || recordResult.output.sha1 !== asset.sha1 || recordResult.output.name !== asset.name) {
      missing.push(asset);
      continue;
    }

    const url = URL.createObjectURL(recordResult.output.blob);
    objectUrls.push(url);
    urls[asset.name] = url;
    urls[normalizeRef(asset.name)] = url;
  }

  db?.close();

  return {
    urls,
    missing,
    revoke() {
      objectUrls.forEach((url: any) => URL.revokeObjectURL(url));
    },
  };
}
