import assert from "node:assert/strict";
import test from "node:test";
import { accountMediaPath, classifyMediaError, releaseUnreferencedMedia, signMediaUrls, uploadMediaFiles, type CloudMediaFile } from "./cloudMediaStore.ts";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const OTHER_HASH = "89abcdef0123456789abcdef0123456789abcdef";
const SUPABASE_URL = "http://127.0.0.1:54321";
const now = "2026-07-14T08:00:00.000Z";

function createClient() {
  const rows: any[] = [];
  const objects = new Map<string, number>();
  const uploads: string[] = [], removals: string[][] = [], deletedSha1s: string[][] = [];
  const hashBatches: number[] = [];
  let releasable: Array<{ sha1: string; storagePath: string }> = [];
  class Query {
    filters: Array<(row: any) => boolean> = []; operation = "select"; payload: any; options: any;
    constructor(readonly table: string) {}
    select() { return this; }
    eq(field: string, value: unknown) { this.filters.push((row) => row[field] === value); return this; }
    in(field: string, values: unknown[]) {
      if (field === "sha1" && this.operation === "select") hashBatches.push(values.length);
      if (field === "sha1" && this.operation === "delete") deletedSha1s.push(values as string[]);
      this.filters.push((row) => values.includes(row[field]));
      return this;
    }
    upsert(payload: any, options: any) { this.operation = "upsert"; this.payload = payload; this.options = options; return this; }
    delete() { this.operation = "delete"; return this; }
    async execute() {
      if (this.operation === "upsert") {
        assert.deepEqual(this.options, { onConflict: "user_id,sha1", ignoreDuplicates: true });
        const exists = rows.some((row) => row.user_id === this.payload.user_id && row.sha1 === this.payload.sha1);
        if (!exists) rows.push({ ...structuredClone(this.payload), created_at: now });
        return { data: null, error: null };
      }
      const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === "delete") {
        for (const row of matching) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      return { data: structuredClone(matching), error: null };
    }
    then(resolve: any, reject: any) { return this.execute().then(resolve, reject); }
  }
  const bucket = {
    async upload(path: string, blob: Blob) { if (objects.has(path)) return { data: null, error: { message: "Asset Already Exists" } }; objects.set(path, blob.size); uploads.push(path); return { data: { path }, error: null }; },
    async info(path: string) { return objects.has(path) ? { data: { size: objects.get(path) }, error: null } : { data: null, error: { message: "missing" } }; },
    async remove(paths: string[]) { paths.forEach((path) => objects.delete(path)); removals.push(paths); return { data: paths, error: null }; },
    async createSignedUrls(paths: string[]) { return { data: paths.map((path) => objects.has(path) ? { path, signedUrl: `https://signed.test/core-media/${path}` } : { path, error: "missing", signedUrl: null }), error: null }; },
  };
  return {
    rows, objects, uploads, removals, deletedSha1s, hashBatches, bucket,
    storage: { from: (name: string) => { assert.equal(name, "core-media"); return bucket; } },
    setReleasable(entries: Array<{ sha1: string; storagePath: string }>) { releasable = entries; },
    auth: { async getSession() { return { data: { session: { access_token: "token-not-persisted" } }, error: null }; } },
    from(table: string) { return new Query(table); },
    async rpc(name: string) { assert.equal(name, "list_releasable_media"); return { data: releasable, error: null }; },
  };
}

function file(sha1 = HASH, name = "bild.png"): CloudMediaFile { return { sha1, name, size: 4, mimeType: "image/png", blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }; }
function control(cancelled = false) { return { isCancelled: () => cancelled, waitUntilResumed: async () => {}, setActiveUpload() {}, setCancelHandler() {} }; }
function upload(client: ReturnType<typeof createClient>, files: CloudMediaFile[], extra: Partial<Parameters<typeof uploadMediaFiles>[0]> = {}) {
  return uploadMediaFiles({ client, supabaseUrl: SUPABASE_URL, userId: "user-a", files, control: control(), ...extra });
}

test("Medienpfade sind pro Account und SHA-1 eindeutig", () => {
  assert.equal(accountMediaPath("user-a", HASH), `user-a/${HASH}`);
  assert.equal(accountMediaPath("user-a", ` ${HASH.toUpperCase()} `), `user-a/${HASH}`);
  assert.throws(() => accountMediaPath("user-a", "kein-hash"), (error: any) => error.kind === "integrity");
});

test("accountweite SHA-1-Wiederverwendung erzeugt ein Objekt und eine Mediendatei", async () => {
  const client = createClient();
  const first = await upload(client, [file()]);
  const second = await upload(client, [file(HASH, "kopie.png")]);
  assert.equal(client.uploads.length, 1);
  assert.equal(client.rows.length, 1);
  assert.equal(first.uploaded, 1);
  assert.equal(second.reused, 1);
  assert.deepEqual(first.syncedSha1s, [HASH]);
  assert.deepEqual(second.syncedSha1s, [HASH]);
  assert.deepEqual(
    { user_id: client.rows[0].user_id, sha1: client.rows[0].sha1, size: client.rows[0].size, mime_type: client.rows[0].mime_type, original_name: client.rows[0].original_name, storage_path: client.rows[0].storage_path },
    { user_id: "user-a", sha1: HASH, size: 4, mime_type: "image/png", original_name: "bild.png", storage_path: `user-a/${HASH}` },
  );
});

test("doppelte SHA-1-Dateien eines Aufrufs werden nur einmal hochgeladen", async () => {
  const client = createClient();
  const result = await upload(client, [file(HASH, "a.png"), file(HASH, "b.png")]);
  assert.equal(result.total, 1);
  assert.equal(result.uploaded, 1);
  assert.equal(client.uploads.length, 1);
  assert.equal(client.rows.length, 1);
});

test("serverseitiger Uploadadapter nutzt dieselben Pfad- und Deduplizierungsregeln", async () => {
  const client = createClient();
  const metadataOnly = { ...file(), blob: undefined };
  const paths: string[] = [];
  const result = await upload(client, [metadataOnly], {
    async uploadFile(item, path) {
      paths.push(path);
      client.objects.set(path, item.size);
      return "uploaded";
    },
  });
  assert.deepEqual(paths, [`user-a/${HASH}`]);
  assert.equal(result.uploaded, 1);
  assert.equal(client.rows[0].storage_path, `user-a/${HASH}`);
});

test("Byte-Fortschritt bleibt bei mehreren Dateien, Wiederverwendung und Retry-Rücksprung monoton", async () => {
  const client = createClient();
  await upload(client, [file()]);
  const freshFile = { ...file(OTHER_HASH, "großes-bild.png"), size: 6, blob: new Blob([new Uint8Array(6)]) };
  const progress: Array<{ completed: number; processedBytes: number; totalBytes: number }> = [];

  const result = await upload(client, [file(), freshFile], {
    async uploadFile(item, path, onProgress) {
      onProgress(3);
      onProgress(1);
      onProgress(item.size);
      client.objects.set(path, item.size);
      return "uploaded";
    },
    onProgress(next) {
      progress.push({ completed: next.completed, processedBytes: next.processedBytes, totalBytes: next.totalBytes });
    },
  });

  assert.deepEqual(progress.map((item) => item.processedBytes), [...progress.map((item) => item.processedBytes)].sort((left, right) => left - right));
  assert.equal(progress.every((item) => item.totalBytes === 10), true);
  assert.equal(progress.slice(0, -1).every((item) => item.processedBytes < item.totalBytes), true);
  assert.deepEqual(progress.at(-1), { completed: 2, processedBytes: 10, totalBytes: 10 });
  assert.equal(result.uploaded, 1);
  assert.equal(result.reused, 1);
});

test("Medienmetadaten werden in 100er-Chunks geladen und kleine Uploads auf vier begrenzt", async () => {
  const client = createClient();
  const files = Array.from({ length: 205 }, (_, index) => file(index.toString(16).padStart(40, "0"), `bild-${index}.png`));
  let active = 0;
  let maximumActive = 0;
  await upload(client, files, {
    async uploadFile(item, path) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      client.objects.set(path, item.size);
      active -= 1;
      return "uploaded";
    },
  });
  assert.deepEqual(client.hashBatches, [100, 100, 5]);
  assert.equal(maximumActive, 4);
  assert.equal(client.rows.length, 205);
});

test("parallele Duplicate-Uploads bestätigen dasselbe Objekt", async () => {
  const client = createClient();
  const [first, second] = await Promise.all([upload(client, [file()]), upload(client, [file()])]);
  assert.equal(client.objects.size, 1);
  assert.equal(client.rows.length, 1);
  assert.equal(first.uploaded + second.uploaded, 1);
  assert.equal(first.reused + second.reused, 1);
});

test("eine Mediendatei wird erst nach bestätigtem Objekt-Upload geschrieben", async () => {
  const client = createClient();
  client.bucket.upload = async () => { assert.equal(client.rows.length, 0); return { data: null, error: { message: "network failed" } }; };
  await assert.rejects(() => upload(client, [file()]), (error: any) => error.kind === "network" && error.message === "Das Medium konnte nicht hochgeladen werden.");
  assert.equal(client.rows.length, 0);
});

test("Größenkonflikte werden als Integritätsfehler blockiert", async () => {
  const client = createClient();
  await upload(client, [file()]);
  await assert.rejects(
    () => upload(client, [{ ...file(), size: 5, blob: new Blob([new Uint8Array(5)]) }]),
    (error: any) => error.kind === "integrity" && error.message === "Dieselbe SHA-1-Prüfsumme verweist auf unterschiedliche Dateigrößen.",
  );
});

test("ein vorhandenes Objekt ohne Mediendatei wird nur bei passender Größe wiederverwendet", async () => {
  const client = createClient();
  client.objects.set(`user-a/${HASH}`, 4);
  const reused = await upload(client, [file()]);
  assert.equal(reused.reused, 1);
  assert.equal(client.rows.length, 1);

  client.objects.set(`user-a/${OTHER_HASH}`, 9);
  await assert.rejects(() => upload(client, [file(OTHER_HASH)]), (error: any) => error.kind === "integrity" && error.message === "Die Cloud-Datei hat nicht die erwartete Größe.");
  assert.equal(client.rows.some((row) => row.sha1 === OTHER_HASH), false);
});

test("abgebrochene Uploads schreiben weder Objekt noch Mediendatei", async () => {
  const client = createClient();
  await assert.rejects(() => upload(client, [file()], { control: control(true) }), (error: any) => error.kind === "cancelled");
  assert.equal(client.uploads.length, 0);
  assert.equal(client.rows.length, 0);
});

test("Signed-URL-Teilfehler bleiben sichtbar und ungültige Prüfsummen werden ignoriert", async () => {
  const client = createClient();
  client.objects.set(`user-a/${HASH}`, 4);
  const requested: string[][] = [];
  const signingClient = { storage: { from: () => ({ async createSignedUrls(paths: string[], expiresIn: number) { requested.push(paths); assert.equal(expiresIn, 60); return client.bucket.createSignedUrls(paths); } }) } };
  const result = await signMediaUrls(signingClient, "user-a", [HASH, OTHER_HASH.toUpperCase(), HASH, "kaputt"], 60);
  assert.deepEqual(requested, [[`user-a/${HASH}`, `user-a/${OTHER_HASH}`]]);
  assert.deepEqual(result.urls, { [HASH]: `https://signed.test/core-media/user-a/${HASH}` });
  assert.deepEqual(result.missing, [OTHER_HASH]);
  assert.ok(Date.parse(result.expiresAt) > Date.now());
});

test("Signed-URL-Fehler melden alle angefragten Medien als fehlend", async () => {
  const failing = { storage: { from: () => ({ async createSignedUrls() { return { data: null, error: { message: "storage down" } }; } }) } };
  const result = await signMediaUrls(failing, "user-a", [HASH, OTHER_HASH]);
  assert.deepEqual(result.urls, {});
  assert.deepEqual(result.missing, [HASH, OTHER_HASH]);
  assert.deepEqual((await signMediaUrls(failing, "user-a", [])).missing, []);
});

test("Freigabe entfernt nur eigene unreferenzierte Objekte und danach ihre Mediendateien", async () => {
  const client = createClient();
  await upload(client, [file(), file(OTHER_HASH, "behalten.png")]);
  client.setReleasable([
    { sha1: HASH, storagePath: `user-a/${HASH}` },
    { sha1: OTHER_HASH, storagePath: `user-b/${OTHER_HASH}` },
  ]);
  const released = await releaseUnreferencedMedia(client, "user-a");
  assert.equal(released, 1);
  assert.deepEqual(client.removals, [[`user-a/${HASH}`]]);
  assert.deepEqual(client.deletedSha1s, [[HASH]]);
  assert.deepEqual(client.rows.map((row) => row.sha1), [OTHER_HASH]);
  assert.equal(client.objects.has(`user-a/${OTHER_HASH}`), true);
});

test("Freigabe ohne eigene Kandidaten berührt den Speicher nicht", async () => {
  const client = createClient();
  client.setReleasable([{ sha1: HASH, storagePath: `user-b/${HASH}` }]);
  assert.equal(await releaseUnreferencedMedia(client, "user-a"), 0);
  assert.deepEqual(client.removals, []);
  assert.deepEqual(client.deletedSha1s, []);
});

test("Freigabe behält Mediendateien, wenn das Speicherobjekt nicht entfernt werden konnte", async () => {
  const client = createClient();
  await upload(client, [file()]);
  client.setReleasable([{ sha1: HASH, storagePath: `user-a/${HASH}` }]);
  client.bucket.remove = async () => ({ data: null, error: { message: "storage down" } }) as any;
  await assert.rejects(
    () => releaseUnreferencedMedia(client, "user-a"),
    (error: any) => error.message === "Freigegebene Medien konnten nicht entfernt werden.",
  );
  assert.equal(client.rows.length, 1);
});

test("Cloud-Fehler werden ohne rohe Antwort in stabile Klassen übersetzt", () => {
  assert.equal(classifyMediaError({ status: 401 }), "auth");
  assert.equal(classifyMediaError({ status: 410 }), "expired-resume");
  assert.equal(classifyMediaError({ status: 409 }), "conflict");
  assert.equal(classifyMediaError({ status: 413 }), "too-large");
  assert.equal(classifyMediaError({ status: 429 }), "rate-limited");
  assert.equal(classifyMediaError(new Error("network fetch failed")), "network");
  assert.equal(classifyMediaError(new Error("Asset already exists")), "duplicate");
  assert.equal(classifyMediaError(new Error("unknown")), "storage");
  assert.equal(classifyMediaError(Object.assign(new Error("x"), { kind: "integrity" })), "integrity");
});
