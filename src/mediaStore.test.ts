import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { resolvePresentationMedia } from "./cardPresentation.ts";
import { createAccountMediaStore, planDeckMediaSync, resolveCardHtmlMedia } from "./mediaStore.ts";

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

test("ein gemeinsam verwendeter Blob überlebt das Entfernen nur eines Stapels", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "shared-user", indexedDB });
  await store.cachePreviewMedia(deck("deck-a"), [file]);
  await store.cachePreviewMedia(deck("deck-b"), [file]);

  assert.equal(await store.removeCachedDeckMedia("deck-a"), 0);
  const shared = await store.resolveDeckMedia(deck("deck-b"));
  assert.ok(shared.urls[HASH]);
  shared.revoke();

  assert.equal(await store.removeCachedDeckMedia("deck-b"), 1);
  assert.deepEqual((await store.resolveDeckMedia(deck("deck-b"))).urls, {});
});

test("Offline-Download prüft Größe und SHA-1 und verwendet den persistenten Mediencache", async () => {
  const indexedDB = new IDBFactory();
  const sha1 = "12dada1fff4d4787ade3333147202c3b443e376f";
  let fetchCount = 0;
  const client = { storage: { from() { return { async createSignedUrls(paths: string[]) { return { data: paths.map((path) => ({ path, signedUrl: `https://project.test/storage/v1/object/sign/core-media/${path}?token=safe` })), error: null }; } }; } } };
  const store = createAccountMediaStore({
    client,
    supabaseUrl: "https://project.test",
    userId: "offline-media-user",
    indexedDB,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } });
    },
  });
  const manifest = [{
    id: "media-offline",
    sha1,
    size: 4,
    mimeType: "image/png",
    originalName: "offline.png",
    storageBucket: "core-media",
    storagePath: `offline-media-user/objects/${sha1}`,
    cardId: "card-offline",
    updatedAt: "2026-08-17T10:00:00.000Z",
  }];

  assert.deepEqual(await store.cacheCloudManifestMedia("deck-offline", manifest), { completed: 1, total: 1, downloadedBytes: 4 });
  assert.deepEqual(await store.cacheCloudManifestMedia("deck-offline", manifest), { completed: 1, total: 1, downloadedBytes: 4 });
  assert.equal(fetchCount, 1);

  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("account_assets", "readwrite");
    const store = transaction.objectStore("account_assets");
    const request = store.get(`offline-media-user\u0000${sha1}`);
    request.onsuccess = () => store.put({ ...request.result, blob: new Blob([new Uint8Array([4, 3, 2, 1])], { type: "image/png" }) });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  await store.cacheCloudManifestMedia("deck-offline", manifest);
  assert.equal(fetchCount, 2, "gleiche Dateigröße ersetzt keine SHA-1-Prüfung");
});

test("erfolgreich persistierte Blobs bleiben nicht zusätzlich im Sessioncache", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "no-session-copy", indexedDB });
  await store.cachePreviewMedia(deck(), [file]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  await new Promise<void>((resolve, reject) => { const tx = db.transaction("account_assets", "readwrite"); tx.objectStore("account_assets").delete(`no-session-copy\u0000${HASH}`); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
  const resolved = await store.resolveDeckMedia(deck());
  assert.deepEqual(resolved.urls, {});
});

test("kartenbezogene Auflösung signiert nur aktuelle Medien und nutzt den TTL-Cache", async () => {
  const signedPaths: string[][] = [];
  const client = { storage: { from() { return { async createSignedUrls(paths: string[]) { signedPaths.push(paths); return { data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })), error: null }; } }; } } };
  const assets = Array.from({ length: 1_000 }, (_, index) => {
    const sha1 = index.toString(16).padStart(40, "0");
    return { id: `media-${index}`, userId: "media-user", deckId: "deck-many", cardId: `card-${index}`, sha1, size: 4, mimeType: "image/png", originalName: `image-${index}.png`, storageBucket: "core-media", storagePath: `media-user/objects/${sha1}`, source: "apkg-media", metadata: {}, createdAt: "2026-07-14T08:00:00.000Z", updatedAt: "2026-07-14T08:00:00.000Z", deletedAt: null };
  });
  const manyDeck: any = {
    id: "deck-many",
    mediaAssets: assets,
    cards: assets.map((asset, index) => ({ id: `card-${index}`, mediaRefs: [asset.originalName] })),
    importMeta: { mediaManifest: { assets: assets.map((asset) => ({ sha1: asset.sha1, name: asset.originalName, size: asset.size, mimeType: asset.mimeType })) } },
  };
  const store = createAccountMediaStore({ client, supabaseUrl: "http://127.0.0.1", userId: "media-user", indexedDB: null });
  await store.resolveCardMedia(manyDeck, "card-7");
  await store.resolveCardMedia(manyDeck, "card-7");
  assert.equal(signedPaths.length, 1);
  assert.equal(signedPaths[0].length, 1);
  assert.equal(signedPaths[0][0], assets[7].storagePath);
});

test("kompakte Import-Summaries planen ihre Manifestmedien ohne Kartenmaterialisierung", () => {
  const compact = { ...deck(), cards: [], cardCount: 1 };
  const plan = planDeckMediaSync(compact);
  assert.deepEqual(plan.files.map(({ sha1, name, cardId }) => ({ sha1, name, cardId })), [
    { sha1: HASH, name: "card.png", cardId: null },
  ]);
});

test("Cloud-Bilder und -Audio werden vor der Sandbox als Blob-URLs materialisiert", async () => {
  const audioHash = "123456789abcdef0123456789abcdef012345678";
  const assets = [
    { id: "image", sha1: HASH, originalName: "card.png", size: 4, mimeType: "image/png", storagePath: `media-user/objects/${HASH}` },
    { id: "audio", sha1: audioHash, originalName: "answer.mp3", size: 3, mimeType: "audio/mpeg", storagePath: `media-user/objects/${audioHash}` },
  ].map((asset) => ({ ...asset, userId: "media-user", deckId: "cloud-deck", cardId: "cloud-card", storageBucket: "core-media", source: "apkg-media", metadata: {}, createdAt: "2026-07-14T08:00:00.000Z", updatedAt: "2026-07-14T08:00:00.000Z", deletedAt: null }));
  const cloudDeck: any = {
    id: "cloud-deck",
    mediaAssets: assets,
    cards: [{ id: "cloud-card", mediaRefs: ["card.png", "answer.mp3"] }],
    importMeta: { mediaManifest: { assets: assets.map(({ sha1, originalName: name, size, mimeType }) => ({ sha1, name, size, mimeType })) } },
  };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = { storage: { from() { return { async createSignedUrls(paths: string[]) { return { data: paths.map((path) => ({ path, signedUrl: `https://core.test/storage/v1/object/sign/core-media/${path}?token=secret` })), error: null }; } }; } } };
  const store = createAccountMediaStore({
    client,
    supabaseUrl: "https://core.test",
    userId: "media-user",
    indexedDB: null,
    fetchImpl: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      const isAudio = url.includes(audioHash);
      return new Response(new Blob([new Uint8Array(isAudio ? 3 : 4)], { type: isAudio ? "audio/mpeg" : "image/png" }));
    },
  });

  const resolved = await store.resolveCardMedia(cloudDeck, "cloud-card");
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => url.startsWith("https://core.test/storage/v1/object/sign/") && url.includes("token=secret")));
  assert.ok(requests.every(({ init }) => init?.credentials === "omit" && init.redirect === "error" && init.referrerPolicy === "no-referrer"));
  assert.match(resolved.urls["card.png"], /^blob:/);
  assert.match(resolved.urls["answer.mp3"], /^blob:/);
  const srcdoc = resolvePresentationMedia('<img src="card.png"><audio controls src="answer.mp3"></audio>', resolved.urls);
  assert.equal(srcdoc.includes("https://core.test"), false);
  assert.match(srcdoc, /<img src="blob:/);
  assert.match(srcdoc, /<audio controls src="blob:/);
  resolved.revoke();
});

test("fremde Signed-URL-Ursprünge werden weder geladen noch an den Renderer gegeben", async () => {
  let fetched = false;
  const cloudDeck: any = {
    ...deck("foreign-url"),
    mediaAssets: [{ id: "foreign", userId: "media-user", deckId: "foreign-url", cardId: "foreign-url-card", sha1: HASH, size: 4, mimeType: "image/png", originalName: "card.png", storageBucket: "core-media", storagePath: `media-user/objects/${HASH}`, source: "apkg-media", metadata: {}, createdAt: "2026-07-14T08:00:00.000Z", updatedAt: "2026-07-14T08:00:00.000Z", deletedAt: null }],
  };
  const client = { storage: { from() { return { async createSignedUrls(paths: string[]) { return { data: paths.map((path) => ({ path, signedUrl: `https://tracker.example/storage/v1/object/sign/core-media/${path}` })), error: null }; } }; } } };
  const store = createAccountMediaStore({ client, supabaseUrl: "https://core.test", userId: "media-user", indexedDB: null, fetchImpl: async () => { fetched = true; return new Response(new Blob([new Uint8Array(4)])); } });

  const resolved = await store.resolveCardMedia(cloudDeck, "foreign-url-card");
  assert.equal(fetched, false);
  assert.deepEqual(resolved.urls, {});
  assert.equal(resolved.missing[0].status, "Medium fehlt lokal und in der Cloud.");
});

test("direkte SHA-1-Referenzen benötigen kein APKG-Medienmanifest", async () => {
  const indexedDB = new IDBFactory();
  const directDeck: any = { id: "manual-deck", mediaAssets: [], cards: [{ id: "manual-card", mediaRefs: [HASH] }], importMeta: {} };
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "manual-user", indexedDB });
  await store.cachePreviewMedia(directDeck, [{ ...file, name: HASH }]);

  const resolved = await store.resolveDeckMedia(directDeck);
  assert.ok(resolved.urls[HASH]);
  resolved.revoke();

  const synced = await store.syncImportMedia([directDeck]).result;
  assert.equal(synced.progress.total, 1);
  assert.equal(synced.status, "local-pending");
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
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
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

test("Medienqueue ist vor der Freigabe der Cloud-Eltern dauerhaft geschrieben", async () => {
  const indexedDB = new IDBFactory();
  let releaseCloudParents!: () => void;
  const cloudParentsReady = new Promise<void>((resolve) => { releaseCloudParents = resolve; });
  const store = createAccountMediaStore({ client: {}, supabaseUrl: "http://127.0.0.1", userId: "gated-user", indexedDB });
  await store.cachePreviewMedia(deck(), [file]);

  const task = store.syncImportMedia([deck()], { waitUntilReady: cloudParentsReady });
  await task.queued;
  let settled = false;
  void task.result.then(() => { settled = true; });

  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("media_queue", "readonly").objectStore("media_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert.equal(settled, false);
  assert.equal(records.length, 1);

  releaseCloudParents();
  const result = await task.result;
  assert.notEqual(result.status, "cloud-ready");
});

test("Medien-Tasks melden ihren aktuellen Status beim Abonnieren sofort", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "subscriber-user", indexedDB: new IDBFactory() });
  const task = store.syncImportMedia([deck()]);
  const statuses: string[] = [];

  const unsubscribe = task.subscribe((_progress, status) => statuses.push(status));
  assert.equal(statuses[0], "local-pending");
  unsubscribe();
  await task.result;
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
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("media_queue", "readonly").objectStore("media_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert.deepEqual(records.map(({ deckId, name, cardId }) => ({ deckId, name, cardId })).sort((left, right) => left.deckId.localeCompare(right.deckId)), [
    { deckId: "deck-a", name: "card.png", cardId: "card-a" },
    { deckId: "deck-b", name: "other.png", cardId: "card-b" },
  ]);
});

test("ungenutzte Manifestdateien werden als Objekte ohne redundante Medienreferenz eingeplant", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "object-user", indexedDB });
  const unusedHash = "fedcba9876543210fedcba9876543210fedcba98";
  const importDeck: any = {
    id: "deck-object",
    mediaAssets: [],
    cards: [{ id: "card-object", mediaRefs: ["card.png"] }],
    importMeta: { mediaManifest: { assets: [
      { sha1: HASH, name: "card.png", size: 4, mimeType: "image/png" },
      { sha1: unusedHash, name: "unused.png", size: 2, mimeType: "image/png" },
    ] } },
  };
  await store.cachePreviewMedia(importDeck, [
    file,
    { sha1: unusedHash, name: "unused.png", size: 2, mimeType: "image/png", bytes: new Uint8Array([8, 9]) },
  ]);

  const result = await store.syncImportMedia([importDeck], {
    objectUploads: { deckId: importDeck.id, assets: [importDeck.importMeta.mediaManifest.assets[1]] },
  }).result;
  assert.equal(result.progress.total, 2);

  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("media_queue", "readonly").objectStore("media_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert.deepEqual(records.map(({ name, createReference }) => ({ name, createReference })).sort((left, right) => left.name.localeCompare(right.name)), [
    { name: "card.png", createReference: true },
    { name: "unused.png", createReference: false },
  ]);
});

test("ungültige persistierte Blob-Records werden als fehlend behandelt", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "invalid-user", indexedDB });
  const lifecycle = store.startRetryLifecycle({ getDecks: () => [], async ensureCloudParents() {} });
  await lifecycle.retry();
  lifecycle.stop();
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
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

test("Pending-Queue entfernt Einträge für ausgemusterte Stapel", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: "http://127.0.0.1", userId: "retired-user", indexedDB });
  await store.cachePreviewMedia(deck("retired-deck"), [file]);
  await store.syncImportMedia([deck("retired-deck")]).result;

  const lifecycle = store.startRetryLifecycle({
    getDecks: () => [],
    async ensureCloudParents() { assert.fail("Ohne aktiven Stapel darf kein Cloud-Sync starten."); },
  });
  await lifecycle.retry();
  lifecycle.stop();

  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("media_queue", "readonly").objectStore("media_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert.deepEqual(records, []);
});
