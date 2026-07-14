import assert from "node:assert/strict";
import test from "node:test";
import { classifyMediaError, resolveReferences, syncReferences } from "./cloudMediaStore.ts";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const OTHER_HASH = "89abcdef0123456789abcdef0123456789abcdef";
const now = "2026-07-14T08:00:00.000Z";

function createClient() {
  const rows: any[] = [];
  const objects = new Map<string, number>();
  const uploads: string[] = [], removals: string[] = [];
  class Query {
    table: string; filters: Array<(row: any) => boolean> = []; operation = "select"; payload: any;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(field: string, value: unknown) { this.filters.push((row) => row[field] === value); return this; }
    is(field: string, value: unknown) { this.filters.push((row) => row[field] === value); return this; }
    upsert(payload: any) { this.operation = "upsert"; this.payload = payload; return this; }
    update(payload: any) { this.operation = "update"; this.payload = payload; return this; }
    async execute() {
      if (this.operation === "upsert") { const index = rows.findIndex((row) => row.user_id === this.payload.user_id && row.id === this.payload.id); if (index >= 0) rows[index] = structuredClone(this.payload); else rows.push(structuredClone(this.payload)); return { data: [structuredClone(this.payload)], error: null }; }
      const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === "update") matching.forEach((row) => Object.assign(row, this.payload));
      return { data: structuredClone(matching), error: null };
    }
    async single() { const result = await this.execute(); return { ...result, data: result.data[0] ?? null }; }
    then(resolve: any, reject: any) { return this.execute().then(resolve, reject); }
  }
  return {
    rows, objects, uploads, removals,
    auth: { async getSession() { return { data: { session: { access_token: "token-not-persisted" } }, error: null }; } },
    from(table: string) { return new Query(table); },
    storage: { from(bucket: string) { return {
      async upload(path: string, blob: Blob) { if (objects.has(path)) return { data: null, error: { message: "Asset Already Exists" } }; objects.set(path, blob.size); uploads.push(path); return { data: { path }, error: null }; },
      async info(path: string) { return objects.has(path) ? { data: { size: objects.get(path) }, error: null } : { data: null, error: { message: "missing" } }; },
      async remove(paths: string[]) { paths.forEach((path) => { objects.delete(path); removals.push(path); }); return { data: paths, error: null }; },
      async createSignedUrls(paths: string[]) { return { data: paths.map((path) => objects.has(path) ? { path, signedUrl: `https://signed.test/${bucket}/${path}` } : { path, error: "missing" }), error: null }; },
    }; } },
  };
}

function file(sha1 = HASH, name = "bild.png"): any { return { sha1, name, size: 4, mimeType: "image/png", blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }; }
function control() { return { isCancelled: () => false, waitUntilResumed: async () => {}, setActiveUpload() {}, setCancelHandler() {} }; }

test("accountweite SHA-1-Wiederverwendung erzeugt ein Objekt und zwei Referenzen", async () => {
  const client = createClient();
  const first = await syncReferences({ client, supabaseUrl: "http://127.0.0.1:54321", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file()], previousReferences: [] }] });
  const second = await syncReferences({ client, supabaseUrl: "http://127.0.0.1:54321", userId: "user-a", control: control(), decks: [{ deckId: "deck-2", files: [file()], previousReferences: [] }] });
  assert.equal(client.uploads.length, 1);
  assert.equal(client.rows.length, 2);
  assert.equal(first.uploaded, 1);
  assert.equal(second.reused, 1);
  assert.equal(client.rows[0].storage_path, `user-a/objects/${HASH}`);
  assert.equal(client.rows[1].storage_path, client.rows[0].storage_path);
});

test("serverseitiger Uploadadapter nutzt dieselben Referenz- und Deduplizierungsregeln", async () => {
  const client = createClient();
  const metadataOnly = { ...file(), blob: undefined };
  let adapterCalls = 0;
  const result = await syncReferences({
    client,
    supabaseUrl: "http://127.0.0.1:54321",
    userId: "user-a",
    control: control(),
    decks: [{ deckId: "deck-1", files: [metadataOnly], previousReferences: [] }],
    async uploadFile(item, path) {
      adapterCalls += 1;
      client.objects.set(path, item.size);
      return "uploaded";
    },
  });
  assert.equal(adapterCalls, 1);
  assert.equal(result.uploaded, 1);
  assert.equal(client.rows[0].storage_path, `user-a/objects/${HASH}`);
});

test("parallele Duplicate-Uploads bestätigen beide Referenzen über dasselbe Objekt", async () => {
  const client = createClient();
  const [first, second] = await Promise.all([
    syncReferences({ client, supabaseUrl: "http://127.0.0.1:54321", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file()], previousReferences: [] }] }),
    syncReferences({ client, supabaseUrl: "http://127.0.0.1:54321", userId: "user-a", control: control(), decks: [{ deckId: "deck-2", files: [file()], previousReferences: [] }] }),
  ]);
  assert.equal(client.objects.size, 1);
  assert.equal(client.rows.length, 2);
  assert.equal(first.uploaded + second.uploaded, 1);
  assert.equal(first.reused + second.reused, 1);
});

test("eine Referenz wird erst nach bestätigtem Objekt-Upload geschrieben", async () => {
  const client = createClient();
  const originalUpload = client.storage.from("core-media").upload;
  client.storage.from = () => ({
    ...client.storage.from,
    async upload() { assert.equal(client.rows.length, 0); return { data: null, error: { message: "network failed" } }; },
    async info() { return { data: null, error: { message: "missing" } }; }, async remove() { return { data: [], error: null }; },
    async createSignedUrls() { return { data: [], error: null }; },
  });
  await assert.rejects(() => syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file()], previousReferences: [] }] }));
  assert.equal(client.rows.length, 0);
  void originalUpload;
});

test("Größenkonflikte werden als Integritätsfehler blockiert", async () => {
  const client = createClient();
  await syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file()], previousReferences: [] }] });
  await assert.rejects(
    () => syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-2", files: [{ ...file(), size: 5, blob: new Blob([new Uint8Array(5)]) }], previousReferences: [] }] }),
    (error: any) => error.kind === "integrity",
  );
});

test("Reimport löscht keine geteilten Objekte", async () => {
  const client = createClient();
  const first = await syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file()], previousReferences: [] }, { deckId: "deck-2", files: [file()], previousReferences: [] }] });
  const previous = first.referencesByDeck.get("deck-1")!;
  await syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file(OTHER_HASH, "neu.png")], previousReferences: previous }] });
  assert.equal(client.objects.has(`user-a/objects/${HASH}`), true);
  assert.equal(client.removals.includes(`user-a/objects/${HASH}`), false);
});

test("Reimport erhält weiterhin verwendete Alt-Referenzen ohne erneuten Upload", async () => {
  const client = createClient();
  const first = await syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [file()], previousReferences: [] }] });
  const previous = first.referencesByDeck.get("deck-1")!;
  const second = await syncReferences({ client, supabaseUrl: "http://127.0.0.1", userId: "user-a", control: control(), decks: [{ deckId: "deck-1", files: [], previousReferences: previous, retainedReferences: previous }] });
  assert.deepEqual(second.referencesByDeck.get("deck-1"), previous);
  assert.equal(client.rows[0].deleted_at, null);
  assert.equal(client.removals.length, 0);
});

test("Signed-URL-Teilfehler bleiben sichtbar", async () => {
  const client = createClient();
  client.objects.set(`user-a/objects/${HASH}`, 4);
  const references: any[] = [HASH, OTHER_HASH].map((sha1) => ({ id: sha1, userId: "user-a", deckId: "deck-1", cardId: null, sha1, size: 4, mimeType: "image/png", originalName: `${sha1}.png`, storageBucket: "core-media", storagePath: `user-a/objects/${sha1}`, source: "apkg-media", metadata: {}, createdAt: now, updatedAt: now, deletedAt: null }));
  const result = await resolveReferences(client, references, 60);
  assert.ok(result.urls[HASH]);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].sha1, OTHER_HASH);
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
});
