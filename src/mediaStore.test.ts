import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { createAccountMediaStore, resolveCardHtmlMedia } from "./mediaStore.ts";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const OTHER_HASH = "89abcdef0123456789abcdef0123456789abcdef";
function deck(id = "deck-1"): any { return { id, mediaAssets: [], cards: [{ id: `${id}-card`, mediaRefs: ["card.png"] }], importMeta: { mediaManifest: { assets: [{ sha1: HASH, name: "card.png", size: 4, mimeType: "image/png" }] } } }; }
const file = { sha1: HASH, name: "card.png", size: 4, mimeType: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) };

test("HTML-Medienauflösung ersetzt nur bekannte, bereinigte Referenzen", () => {
  const resolved = resolveCardHtmlMedia('<script>alert(1)</script><img src="card.png" onerror="x"><img src="missing.png">', { "card.png": "blob:http://local/card" });
  assert.equal(resolved.includes("<script"), false);
  assert.equal(resolved.includes("onerror"), false);
  assert.equal(resolved.includes('src="blob:http://local/card"'), true);
  assert.equal(resolved.includes('src="missing.png"'), true);
});

test("accountgebundene Blobs überleben Schließen und Neueröffnen", async () => {
  const indexedDB = new IDBFactory();
  const first = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "persistent-user", indexedDB });
  assert.deepEqual(await first.cachePreviewMedia(deck(), [file]), { persisted: true, count: 1, errors: [] });
  const reopened = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "persistent-user", indexedDB });
  const resolved = await reopened.resolveDeckMedia(deck());
  assert.ok(resolved.urls[HASH]);
  assert.equal(resolved.missing[0].status, "Nur lokal verfügbar; Cloud-Upload ausstehend.");
  resolved.revoke();
});

test("Accountwechsel gibt fremde lokale Medien nicht frei", async () => {
  const indexedDB = new IDBFactory();
  await createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "account-a", indexedDB }).cachePreviewMedia(deck(), [file]);
  const other = await createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "account-b", indexedDB }).resolveDeckMedia(deck());
  assert.deepEqual(other.urls, {});
  assert.equal(other.missing[0].status, "Medium fehlt lokal und in der Cloud.");
});

test("Pending-Queue bleibt ohne Cloud reloadfest und enthält keine Tokens oder URLs", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "pending-user", indexedDB });
  await store.cachePreviewMedia(deck(), [file]);
  const result = await store.syncImportMedia([deck()]).result;
  assert.equal(result.status, "local-pending");
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("media_queue", "readonly").objectStore("media_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert.equal(records.length, 1);
  assert.equal(JSON.stringify(records).includes("token"), false);
  assert.equal(JSON.stringify(records).includes("http"), false);
  let cloudParentChecks = 0;
  const retryLifecycle = store.startRetryLifecycle({ getDecks: () => [deck()], async ensureCloudParents() { cloudParentChecks += 1; }, onStatus() {} });
  await retryLifecycle.retry();
  retryLifecycle.stop();
  assert.ok(cloudParentChecks >= 1);
});

test("Hierarchie-Decks queueen nur die Medien ihrer tatsächlichen Kartenreferenzen", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "hierarchy-user", indexedDB });
  const manifest = { assets: [
    { sha1: HASH, name: "card.png", size: 4, mimeType: "image/png" },
    { sha1: OTHER_HASH, name: "other.png", size: 3, mimeType: "image/png" },
  ] };
  const decks: any[] = [
    { id: "deck-a", mediaAssets: [], cards: [{ id: "card-a", mediaRefs: ["card.png"] }], importMeta: { mediaManifest: manifest } },
    { id: "deck-b", mediaAssets: [], cards: [{ id: "card-b", mediaRefs: ["other.png"] }], importMeta: { mediaManifest: manifest } },
  ];
  await store.cachePreviewMedia(decks[0], [file, { sha1: OTHER_HASH, name: "other.png", size: 3, mimeType: "image/png", bytes: new Uint8Array([5, 6, 7]) }]);
  const result = await store.syncImportMedia(decks).result;
  assert.equal(result.progress.total, 2);
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("media_queue", "readonly").objectStore("media_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert.deepEqual(records.map(({ deckId, name, cardId }) => ({ deckId, name, cardId })).sort((left, right) => left.deckId.localeCompare(right.deckId)), [
    { deckId: "deck-a", name: "card.png", cardId: "card-a" },
    { deckId: "deck-b", name: "other.png", cardId: "card-b" },
  ]);
});

test("Legacy-SHA-1-Blobs werden beim ersten accountgebundenen Lesen übernommen", async () => {
  const indexedDB = new IDBFactory();
  const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store", 1); request.onupgradeneeded = () => request.result.createObjectStore("assets", { keyPath: "sha1" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  await new Promise<void>((resolve, reject) => { const tx = legacyDb.transaction("assets", "readwrite"); tx.objectStore("assets").put({ sha1: HASH, name: "card.png", size: 4, mimeType: "image/png", blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  legacyDb.close();
  const resolved = await createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "legacy-user", indexedDB }).resolveDeckMedia(deck());
  assert.ok(resolved.urls[HASH]);
  resolved.revoke();
});

test("ungültige persistierte Blob-Records werden als fehlend behandelt", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "invalid-user", indexedDB });
  const lifecycle = store.startRetryLifecycle({ getDecks: () => [], async ensureCloudParents() {} });
  await lifecycle.retry();
  lifecycle.stop();
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  await new Promise<void>((resolve, reject) => { const tx = db.transaction("account_assets", "readwrite"); tx.objectStore("account_assets").put({ key: `invalid-user\u0000${HASH}`, userId: "invalid-user", deckId: "deck-1", sha1: HASH, name: "card.png", size: 4, mimeType: "image/png", blob: "kein Blob", cardId: null, updatedAt: "invalid" }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
  const result = await store.resolveDeckMedia(deck());
  assert.deepEqual(result.urls, {});
  assert.equal(result.missing[0].status, "Medium fehlt lokal und in der Cloud.");
});

test("Session-Fallback warnt ausdrücklich vor fehlender Reload-Fortsetzung", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "fallback-user", indexedDB: null });
  const result = await store.cachePreviewMedia(deck(), [file]);
  assert.equal(result.persisted, false);
  assert.match(result.errors[0], /Reload.*nicht sicher fortgesetzt/);
});
