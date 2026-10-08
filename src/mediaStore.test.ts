import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { resolvePresentationMedia } from "./presentationFrame.ts";
import { createAccountMediaStore } from "./mediaStore.ts";
import type { OfflineMediaManifestEntry } from "./workspaceReplica.ts";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const OTHER_HASH = "89abcdef0123456789abcdef0123456789abcdef";
const BYTES_SHA1 = "12dada1fff4d4787ade3333147202c3b443e376f";
const LOCAL_URL = "http://127.0.0.1";
const file = { sha1: HASH, name: "card.png", size: 4, mimeType: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) };
const otherFile = { sha1: OTHER_HASH, name: "other.png", size: 3, mimeType: "image/png", bytes: new Uint8Array([5, 6, 7]) };

function openRawDatabase(indexedDB: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("core-media-store.v3", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function readQueue(indexedDB: IDBFactory) {
  const db = await openRawDatabase(indexedDB);
  const records = await new Promise<any[]>((resolve, reject) => { const request = db.transaction("upload_queue", "readonly").objectStore("upload_queue").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  return records;
}

async function writeAssets(indexedDB: IDBFactory, change: (store: IDBObjectStore) => void) {
  const db = await openRawDatabase(indexedDB);
  await new Promise<void>((resolve, reject) => { const transaction = db.transaction("assets", "readwrite"); change(transaction.objectStore("assets")); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}

function signingClient(origin: string, onSign?: (paths: string[]) => void) {
  return { storage: { from() { return { async createSignedUrls(paths: string[]) { onSign?.(paths); return { data: paths.map((path) => ({ path, signedUrl: `${origin}/storage/v1/object/sign/core-media/${path}?token=secret` })), error: null }; } }; } } };
}

function cloudClient() {
  const rows: any[] = [];
  const objects = new Map<string, number>();
  const uploads: string[] = [];
  let uploadError: unknown = null;
  const bucket = {
    async upload(path: string, blob: Blob) { if (uploadError) return { data: null, error: uploadError }; objects.set(path, blob.size); uploads.push(path); return { data: { path }, error: null }; },
    async info(path: string) { return objects.has(path) ? { data: { size: objects.get(path) }, error: null } : { data: null, error: { message: "missing" } }; },
  };
  return {
    rows, objects, uploads,
    failUploads(error: unknown) { uploadError = error; },
    storage: { from: () => bucket },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async in(_field: string, sha1s: string[]) { return { data: rows.filter((row) => sha1s.includes(row.sha1)), error: null }; },
        async upsert(payload: any) { rows.push({ ...payload, created_at: "2026-07-14T08:00:00.000Z" }); return { error: null }; },
      };
    },
  };
}

function offlineManifest(userId: string): OfflineMediaManifestEntry[] {
  return [{ sha1: BYTES_SHA1, size: 4, mimeType: "image/png", originalName: "offline.png", storagePath: `${userId}/${BYTES_SHA1}`, createdAt: "2026-08-17T10:00:00.000Z" }];
}

test("accountgebundene Blobs überleben Schließen und Neueröffnen", async () => {
  const indexedDB = new IDBFactory();
  const first = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "persistent-user", indexedDB });
  assert.deepEqual(await first.cacheMedia([file]), { persisted: true, count: 1, errors: [] });
  const reopened = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "persistent-user", indexedDB });
  const resolved = await reopened.resolveMedia({ "card.png": HASH });
  assert.match(resolved.urls["card.png"], /^blob:/);
  assert.deepEqual(resolved.missing, []);
  resolved.revoke();
});

test("mehrere Mediennamen mit derselben SHA-1 teilen eine lokale Blob-URL", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "alias-user", indexedDB: new IDBFactory() });
  await store.cacheMedia([file]);
  const resolved = await store.resolveMedia({ "card.png": HASH, "kopie.png": HASH, "fehlt.png": OTHER_HASH });
  assert.match(resolved.urls["card.png"], /^blob:/);
  assert.equal(resolved.urls["kopie.png"], resolved.urls["card.png"]);
  assert.deepEqual(resolved.missing, [{ name: "fehlt.png", status: "Medium fehlt lokal und in der Cloud." }]);
  assert.equal(resolved.expiresAt, null);
  resolved.revoke();
});

test("ungültige Mediendateien werden nicht gespeichert", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "invalid-input-user", indexedDB: new IDBFactory() });
  const result = await store.cacheMedia([file, { ...file, sha1: OTHER_HASH, size: 9 }, { ...file, sha1: "keine-sha1" }]);
  assert.deepEqual(result, { persisted: true, count: 1, errors: ["Medien enthielten ungültige Metadaten oder Dateidaten."] });
  assert.deepEqual((await store.resolveMedia({ "other.png": OTHER_HASH })).urls, {});
});

test("ein gemeinsam verwendeter Blob überlebt das Entfernen nur eines Stapels", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "shared-user", indexedDB: new IDBFactory() });
  await store.cacheMedia([file], { queueUpload: false, pinDeckId: "deck-a" });
  await store.cacheMedia([file], { queueUpload: false, pinDeckId: "deck-b" });

  assert.equal(await store.removeCachedDeckMedia("deck-a"), 0);
  const shared = await store.resolveMedia({ "card.png": HASH });
  assert.ok(shared.urls["card.png"]);
  shared.revoke();

  assert.equal(await store.removeCachedDeckMedia("deck-b"), 1);
  assert.deepEqual((await store.resolveMedia({ "card.png": HASH })).urls, {});
});

test("ausstehende Uploads halten entpinnte Medien lokal", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "pending-pin-user", indexedDB: new IDBFactory() });
  await store.cacheMedia([file], { pinDeckId: "deck-a" });
  assert.equal(await store.removeCachedDeckMedia("deck-a"), 0);
  const resolved = await store.resolveMedia({ "card.png": HASH });
  assert.ok(resolved.urls["card.png"]);
  resolved.revoke();
});

test("Offline-Download prüft Größe und SHA-1 und verwendet den persistenten Mediencache", async () => {
  const indexedDB = new IDBFactory();
  const signed: string[][] = [];
  let fetchCount = 0;
  const store = createAccountMediaStore({
    client: signingClient("https://project.test", (paths) => signed.push(paths)),
    supabaseUrl: "https://project.test",
    userId: "offline-media-user",
    indexedDB,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/png" } });
    },
  });
  const manifest = offlineManifest("offline-media-user");

  assert.deepEqual(await store.cacheCloudManifestMedia("deck-offline", manifest), { completed: 1, total: 1, downloadedBytes: 4 });
  assert.deepEqual(signed, [[`offline-media-user/${BYTES_SHA1}`]]);
  assert.deepEqual(await store.cacheCloudManifestMedia("deck-offline", manifest), { completed: 1, total: 1, downloadedBytes: 4 });
  assert.equal(fetchCount, 1);
  assert.equal(await store.removeCachedDeckMedia("deck-other"), 0);

  await writeAssets(indexedDB, (assets) => {
    const request = assets.get(`offline-media-user\u0000${BYTES_SHA1}`);
    request.onsuccess = () => assets.put({ ...request.result, blob: new Blob([new Uint8Array([4, 3, 2, 1])], { type: "image/png" }) });
  });
  await store.cacheCloudManifestMedia("deck-offline", manifest);
  assert.equal(fetchCount, 2, "gleiche Dateigröße ersetzt keine SHA-1-Prüfung");

  assert.equal(await store.removeCachedDeckMedia("deck-offline"), 1);
  assert.deepEqual((await createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "offline-media-user", indexedDB }).resolveMedia({ "offline.png": BYTES_SHA1 })).urls, {});
});

test("Offline-Download bricht bei fehlenden, fremden oder manipulierten Cloud-Medien ab", async () => {
  const manifest = offlineManifest("offline-error-user");
  const offline = createAccountMediaStore({ client: null, supabaseUrl: "https://project.test", userId: "offline-error-user", indexedDB: new IDBFactory() });
  await assert.rejects(() => offline.cacheCloudManifestMedia("deck", manifest), { message: "Cloud-Medien können ohne Verbindung nicht geladen werden." });

  const missingClient = { storage: { from: () => ({ async createSignedUrls(paths: string[]) { return { data: paths.map((path) => ({ path, signedUrl: null })), error: null }; } }) } };
  const missing = createAccountMediaStore({ client: missingClient, supabaseUrl: "https://project.test", userId: "offline-error-user", indexedDB: new IDBFactory(), fetchImpl: async () => assert.fail("Fehlende Medien werden nicht geladen.") });
  await assert.rejects(() => missing.cacheCloudManifestMedia("deck", manifest), { message: "Mindestens ein Cloud-Medium ist nicht mehr verfügbar." });

  const foreign = createAccountMediaStore({ client: signingClient("https://tracker.example"), supabaseUrl: "https://project.test", userId: "offline-error-user", indexedDB: new IDBFactory(), fetchImpl: async () => assert.fail("Fremde URLs werden nicht geladen.") });
  await assert.rejects(() => foreign.cacheCloudManifestMedia("deck", manifest), { message: "Eine Medien-URL konnte nicht sicher geprüft werden." });

  const tamperedDb = new IDBFactory();
  const tampered = createAccountMediaStore({ client: signingClient("https://project.test"), supabaseUrl: "https://project.test", userId: "offline-error-user", indexedDB: tamperedDb, fetchImpl: async () => new Response(new Uint8Array([9, 9, 9, 9])) });
  await assert.rejects(() => tampered.cacheCloudManifestMedia("deck", manifest), { message: "Medium „offline.png“ hat eine ungültige Prüfsumme." });
  const localOnly = createAccountMediaStore({ client: null, supabaseUrl: "https://project.test", userId: "offline-error-user", indexedDB: tamperedDb });
  assert.deepEqual((await localOnly.resolveMedia({ "offline.png": BYTES_SHA1 })).urls, {});
});

test("erfolgreich persistierte Blobs bleiben nicht zusätzlich im Sessioncache", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "no-session-copy", indexedDB });
  await store.cacheMedia([file]);
  await writeAssets(indexedDB, (assets) => { assets.delete(`no-session-copy\u0000${HASH}`); });
  const resolved = await store.resolveMedia({ "card.png": HASH });
  assert.deepEqual(resolved.urls, {});
});

test("Cloud-Bilder und -Audio werden vor der Sandbox als Blob-URLs materialisiert", async () => {
  const audioHash = "123456789abcdef0123456789abcdef012345678";
  const signed: string[][] = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const store = createAccountMediaStore({
    client: signingClient("https://core.test", (paths) => signed.push(paths)),
    supabaseUrl: "https://core.test",
    userId: "cloud-media-user",
    indexedDB: null,
    fetchImpl: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      const isAudio = url.includes(audioHash);
      return new Response(new Blob([new Uint8Array(isAudio ? 3 : 4)], { type: isAudio ? "audio/mpeg" : "image/png" }));
    },
  });

  const resolved = await store.resolveMedia({ "card.png": HASH, "answer.mp3": audioHash });
  assert.deepEqual(signed, [[`cloud-media-user/${HASH}`, `cloud-media-user/${audioHash}`]]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => url.startsWith("https://core.test/storage/v1/object/sign/") && url.includes("token=secret")));
  assert.ok(requests.every(({ init }) => init?.credentials === "omit" && init.redirect === "error" && init.referrerPolicy === "no-referrer"));
  assert.match(resolved.urls["card.png"], /^blob:/);
  assert.match(resolved.urls["answer.mp3"], /^blob:/);
  assert.deepEqual(resolved.missing, []);
  assert.ok(resolved.expiresAt);
  const srcdoc = resolvePresentationMedia('<img src="card.png"><audio controls src="answer.mp3"></audio>', resolved.urls);
  assert.equal(srcdoc.includes("https://core.test"), false);
  assert.match(srcdoc, /<img src="blob:/);
  assert.match(srcdoc, /<audio controls src="blob:/);
  resolved.revoke();
});

test("fremde Signed-URL-Ursprünge werden weder geladen noch an den Renderer gegeben", async () => {
  let fetched = false;
  const store = createAccountMediaStore({ client: signingClient("https://tracker.example"), supabaseUrl: "https://core.test", userId: "foreign-url-user", indexedDB: null, fetchImpl: async () => { fetched = true; return new Response(new Blob([new Uint8Array(4)])); } });

  const resolved = await store.resolveMedia({ "card.png": HASH });
  assert.equal(fetched, false);
  assert.deepEqual(resolved.urls, {});
  assert.deepEqual(resolved.missing, [{ name: "card.png", status: "Medium fehlt lokal und in der Cloud." }]);
});

test("Accountwechsel gibt fremde lokale Medien nicht frei", async () => {
  const indexedDB = new IDBFactory();
  await createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "account-a", indexedDB }).cacheMedia([file]);
  const other = await createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "account-b", indexedDB }).resolveMedia({ "card.png": HASH });
  assert.deepEqual(other.urls, {});
  assert.equal(other.missing[0].status, "Medium fehlt lokal und in der Cloud.");
  assert.equal((await createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "account-b", indexedDB }).syncQueuedMedia().result).progress.total, 0);
});

test("Pending-Queue bleibt ohne Cloud reloadfest und enthält keine Tokens oder URLs", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "pending-user", indexedDB });
  await store.cacheMedia([file]);
  const result = await store.syncQueuedMedia().result;
  assert.equal(result.status, "local-pending");
  assert.equal(result.failureKind, "network");
  assert.equal(result.message, "Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus.");
  const records = await readQueue(indexedDB);
  assert.deepEqual(records.map(({ userId, sha1 }) => ({ userId, sha1 })), [{ userId: "pending-user", sha1: HASH }]);
  assert.equal(JSON.stringify(records).includes("token"), false);
  assert.equal(JSON.stringify(records).includes("http"), false);

  const reopened = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "pending-user", indexedDB });
  const task = reopened.syncQueuedMedia();
  await task.queued;
  assert.deepEqual({ total: task.progress.total, totalBytes: task.progress.totalBytes }, { total: 1, totalBytes: 4 });
  await task.result;

  let cloudParentChecks = 0;
  const retryLifecycle = reopened.startRetryLifecycle({ async ensureCloudParents() { cloudParentChecks += 1; }, onStatus() {} });
  await retryLifecycle.retry();
  retryLifecycle.stop();
  assert.ok(cloudParentChecks >= 1);
});

test("Medienqueue ist vor der Freigabe der Cloud-Eltern dauerhaft geschrieben und wird nach dem Upload geleert", async () => {
  const indexedDB = new IDBFactory();
  const client = cloudClient();
  let releaseCloudParents!: () => void;
  const cloudParentsReady = new Promise<void>((resolve) => { releaseCloudParents = resolve; });
  const store = createAccountMediaStore({ client, supabaseUrl: LOCAL_URL, userId: "gated-user", indexedDB });
  await store.cacheMedia([file]);

  const task = store.syncQueuedMedia({ waitUntilReady: cloudParentsReady });
  await task.queued;
  let settled = false;
  void task.result.then(() => { settled = true; });

  const records = await readQueue(indexedDB);
  assert.equal(settled, false);
  assert.equal(records.length, 1);
  assert.deepEqual(client.uploads, []);

  releaseCloudParents();
  const result = await task.result;
  assert.equal(result.status, "cloud-ready");
  assert.equal(result.message, "1 Medien hochgeladen, 0 wiederverwendet.");
  assert.deepEqual(client.uploads, [`gated-user/${HASH}`]);
  assert.deepEqual(await readQueue(indexedDB), []);
});

test("gezielte Synchronisierung lädt nur die angegebenen SHA-1-Dateien hoch", async () => {
  const indexedDB = new IDBFactory();
  const client = cloudClient();
  const store = createAccountMediaStore({ client, supabaseUrl: LOCAL_URL, userId: "targeted-user", indexedDB });
  await store.cacheMedia([file, otherFile]);
  const progress: number[] = [];

  const result = await store.syncQueuedMedia({ sha1s: [OTHER_HASH], onProgress: (next) => progress.push(next.completed) }).result;
  assert.equal(result.status, "cloud-ready");
  assert.equal(result.progress.total, 1);
  assert.equal(progress.at(-1), 1);
  assert.deepEqual(client.uploads, [`targeted-user/${OTHER_HASH}`]);
  assert.deepEqual((await readQueue(indexedDB)).map((record) => record.sha1), [HASH]);
});

test("vorübergehende Cloud-Fehler behalten die Queue, Integritätsfehler blockieren", async () => {
  const indexedDB = new IDBFactory();
  const client = cloudClient();
  client.failUploads({ message: "JWT expired" });
  const store = createAccountMediaStore({ client, supabaseUrl: LOCAL_URL, userId: "retry-user", indexedDB });
  await store.cacheMedia([file]);

  const pending = await store.syncQueuedMedia().result;
  assert.deepEqual({ status: pending.status, failureKind: pending.failureKind, message: pending.message }, { status: "local-pending", failureKind: "auth", message: "Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus." });
  assert.equal((await readQueue(indexedDB)).length, 1);

  client.rows.push({ user_id: "retry-user", sha1: HASH, size: 99, mime_type: "image/png", original_name: "card.png", storage_path: `retry-user/${HASH}`, created_at: "2026-07-14T08:00:00.000Z" });
  const blocked = await store.syncQueuedMedia().result;
  assert.deepEqual({ status: blocked.status, failureKind: blocked.failureKind, message: blocked.message }, { status: "blocked", failureKind: "integrity", message: "Ein Medium hat die Integritätsprüfung nicht bestanden." });
  assert.equal((await readQueue(indexedDB)).length, 1);
});

test("Medien-Tasks melden ihren aktuellen Status beim Abonnieren sofort", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "subscriber-user", indexedDB: new IDBFactory() });
  const task = store.syncQueuedMedia();
  const statuses: string[] = [];

  const unsubscribe = task.subscribe((_progress, status) => statuses.push(status));
  assert.equal(statuses[0], "local-pending");
  const result = await task.result;
  assert.deepEqual({ status: result.status, message: result.message }, { status: "cloud-ready", message: "Keine Medien ausstehend." });
  assert.equal(statuses.at(-1), "cloud-ready");
  unsubscribe();
});

test("ungültige persistierte Blob-Records werden als fehlend behandelt", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "invalid-user", indexedDB });
  await store.cacheMedia([]);
  await writeAssets(indexedDB, (assets) => { assets.put({ key: `invalid-user\u0000${HASH}`, userId: "invalid-user", sha1: HASH, name: "card.png", size: 4, mimeType: "image/png", blob: "kein Blob", pinnedDeckIds: [], updatedAt: "invalid" }); });
  const result = await store.resolveMedia({ "card.png": HASH });
  assert.deepEqual(result.urls, {});
  assert.equal(result.missing[0].status, "Medium fehlt lokal und in der Cloud.");
});

test("Queue-Einträge ohne lokale Datei werden verworfen statt endlos wiederholt", async () => {
  const indexedDB = new IDBFactory();
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "orphan-user", indexedDB });
  await store.cacheMedia([file]);
  await writeAssets(indexedDB, (assets) => { assets.delete(`orphan-user\u0000${HASH}`); });
  const result = await store.syncQueuedMedia().result;
  assert.equal(result.status, "cloud-ready");
  assert.deepEqual(await readQueue(indexedDB), []);
});

test("Session-Fallback warnt ausdrücklich vor fehlender Reload-Fortsetzung", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "fallback-user", indexedDB: null });
  const result = await store.cacheMedia([file]);
  assert.equal(result.persisted, false);
  assert.deepEqual(result.errors, ["IndexedDB ist nicht verfügbar; Medien bleiben nur für diese Browser-Sitzung erhalten und können nach einem Reload nicht sicher fortgesetzt werden."]);
  const resolved = await store.resolveMedia({ "card.png": HASH });
  assert.match(resolved.urls["card.png"], /^blob:/);
  resolved.revoke();
  assert.equal((await store.syncQueuedMedia().result).progress.total, 1);
});

test("Retry-Lebenszyklus startet ohne ausstehende Uploads keinen Cloud-Sync", async () => {
  const store = createAccountMediaStore({ client: cloudClient(), supabaseUrl: LOCAL_URL, userId: "idle-user", indexedDB: new IDBFactory() });
  await store.cacheMedia([file], { queueUpload: false });
  const lifecycle = store.startRetryLifecycle({
    async ensureCloudParents() { assert.fail("Ohne ausstehende Uploads darf kein Cloud-Sync starten."); },
    onStatus() { assert.fail("Ohne ausstehende Uploads gibt es kein Ergebnis."); },
  });
  await lifecycle.retry();
  lifecycle.stop();
});

test("Retry-Lebenszyklus lädt die persistente Queue erst nach den Cloud-Eltern hoch", async () => {
  const indexedDB = new IDBFactory();
  const client = cloudClient();
  await createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "lifecycle-user", indexedDB }).cacheMedia([file]);
  const store = createAccountMediaStore({ client, supabaseUrl: LOCAL_URL, userId: "lifecycle-user", indexedDB });
  const uploadsAtParentCheck: number[] = [];
  const settled = new Promise<string>((resolve) => {
    const lifecycle = store.startRetryLifecycle({
      async ensureCloudParents() { uploadsAtParentCheck.push(client.uploads.length); },
      onStatus(result) { lifecycle.stop(); resolve(result.status); },
    });
  });
  assert.equal(await settled, "cloud-ready");
  assert.deepEqual(uploadsAtParentCheck, [0]);
  assert.deepEqual(client.uploads, [`lifecycle-user/${HASH}`]);
  assert.deepEqual(await readQueue(indexedDB), []);
});

test("ohne Cloud-Client werden keine Medien freigegeben", async () => {
  const store = createAccountMediaStore({ client: null, supabaseUrl: LOCAL_URL, userId: "release-user", indexedDB: null });
  assert.equal(await store.releaseUnreferencedMedia(), 0);
});
