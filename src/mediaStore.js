import { sanitizeCardHtml } from "./htmlSafety.js";

const DB_NAME = "core-media-store";
const DB_VERSION = 1;
const STORE_NAME = "assets";
const sessionAssets = new Map();

function getIndexedDb() {
  return typeof indexedDB === "undefined" ? null : indexedDB;
}

function openMediaDatabase() {
  const databaseApi = getIndexedDb();
  if (!databaseApi) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
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

function putRecord(db, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Medium konnte nicht gespeichert werden."));
  });
}

function getRecord(db, sha1) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(sha1);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Medium konnte nicht geladen werden."));
  });
}

function toBlob(file) {
  return new Blob([file.bytes], { type: file.mimeType || "application/octet-stream" });
}

function normalizeRef(value) {
  const withoutQuery = String(value ?? "").split(/[?#]/)[0];
  const normalized = withoutQuery.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? withoutQuery;

  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function lookupMediaUrl(mediaUrls, ref) {
  const candidates = [ref, normalizeRef(ref)];
  return candidates.map((candidate) => mediaUrls?.[candidate]).find(Boolean) ?? null;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function resolveCardHtmlMedia(html, mediaUrls = {}) {
  const safeHtml = sanitizeCardHtml(html);
  return safeHtml.replace(/\s(src|href)=("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, attr, rawValue) => {
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

export async function storeDeckMedia(deck, mediaFiles = []) {
  if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) {
    return { persisted: true, count: 0, errors: [] };
  }

  const records = mediaFiles.map((file) => {
    const record = {
      sha1: file.sha1,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      updatedAt: new Date().toISOString(),
      blob: toBlob(file),
    };
    sessionAssets.set(record.sha1, record);
    return record;
  });

  try {
    const db = await openMediaDatabase();
    if (!db) {
      return {
        persisted: false,
        count: records.length,
        errors: ["IndexedDB ist nicht verfügbar; Medien bleiben nur für diese Browser-Sitzung sichtbar."],
      };
    }

    await Promise.all(records.map((record) => putRecord(db, record)));
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

export async function createDeckMediaUrlMap(deck) {
  const assets = deck?.importMeta?.mediaManifest?.assets ?? [];
  const urls = {};
  const objectUrls = [];
  const missing = [];

  if (assets.length === 0 || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return {
      urls,
      missing,
      revoke() {},
    };
  }

  let db = null;
  try {
    db = await openMediaDatabase();
  } catch {
    db = null;
  }

  for (const asset of assets) {
    const sessionRecord = sessionAssets.get(asset.sha1);
    const record = sessionRecord ?? (db ? await getRecord(db, asset.sha1).catch(() => null) : null);

    if (!record?.blob) {
      missing.push(asset);
      continue;
    }

    const url = URL.createObjectURL(record.blob);
    objectUrls.push(url);
    urls[asset.name] = url;
    urls[normalizeRef(asset.name)] = url;
  }

  db?.close();

  return {
    urls,
    missing,
    revoke() {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
