import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_MEDIA_BUCKET,
  createCloudMediaPath,
  createMediaAssetRow,
  persistDeckMedia,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  resolveDeckMediaUrls,
} from "./cloudMediaStore.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFakeClient({ initialRows = [], initialStoragePaths = [] } = {}) {
  const uploads = [];
  const signedUrls = [];
  const upserts = [];
  const mediaRows = clone(initialRows);
  const storagePaths = new Set(initialStoragePaths);

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = "select";
      this.filters = [];
      this.payload = null;
      this.options = null;
    }

    select() {
      return this;
    }

    eq(column, value) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    is(column, value) {
      this.filters.push((row) => row[column] == null === (value == null));
      return this;
    }

    in(column, values) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }

    upsert(rows, options) {
      this.operation = "upsert";
      this.payload = Array.isArray(rows) ? rows : [rows];
      this.options = options;
      return this;
    }

    update(patch) {
      this.operation = "update";
      this.payload = patch;
      return this;
    }

    async execute() {
      if (this.table !== "media_assets") return { data: [], error: null };
      if (this.operation === "upsert") {
        upserts.push({ table: this.table, rows: clone(this.payload), options: this.options });
        const persisted = [];
        for (const row of this.payload) {
          const index = mediaRows.findIndex((current) => current.user_id === row.user_id && current.id === row.id);
          const next = clone(row);
          if (index >= 0) mediaRows[index] = next;
          else mediaRows.push(next);
          persisted.push(next);
        }
        return { data: persisted, error: null };
      }
      if (this.operation === "update") {
        const matching = mediaRows.filter((row) => this.filters.every((filter) => filter(row)));
        for (const row of matching) Object.assign(row, clone(this.payload));
        return { data: matching, error: null };
      }
      return { data: clone(mediaRows.filter((row) => this.filters.every((filter) => filter(row)))), error: null };
    }

    async maybeSingle() {
      const result = await this.execute();
      return { ...result, data: result.data?.[0] ?? null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    uploads,
    signedUrls,
    upserts,
    mediaRows,
    storagePaths,
    auth: {
      async getUser() {
        return { data: { user: { id: "user-a" } }, error: null };
      },
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, blob, options) {
            uploads.push({ bucket, path, blob, options });
            if (storagePaths.has(`${bucket}:${path}`)) return { data: null, error: { message: "Asset Already Exists" } };
            storagePaths.add(`${bucket}:${path}`);
            return { data: { path }, error: null };
          },
          async createSignedUrl(path, expiresIn) {
            signedUrls.push({ bucket, path, expiresIn });
            return { data: { signedUrl: `https://storage.test/${path}` }, error: null };
          },
          async remove(paths) {
            for (const path of paths) storagePaths.delete(`${bucket}:${path}`);
            return { data: paths, error: null };
          },
        };
      },
    },
    from(table) {
      return new Query(table);
    },
  };
}

function mediaFile(overrides = {}) {
  return {
    sha1: "abc123",
    name: "card.png",
    size: 4,
    mimeType: "image/png",
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  };
}

test("cloud media paths and row ids are scoped by deck and content hash, not filename", () => {
  const firstPath = createCloudMediaPath("user-a", mediaFile({ name: "Bild 01.png" }), { deckId: "deck-main" });
  const secondPath = createCloudMediaPath("user-a", mediaFile({ name: "Umbenannt.png" }), { deckId: "deck-main" });
  const firstRow = createMediaAssetRow(mediaFile({ name: "Bild 01.png" }), "user-a", { deckId: "deck-main" });
  const secondRow = createMediaAssetRow(mediaFile({ name: "Umbenannt.png" }), "user-a", { deckId: "deck-main" });

  assert.equal(firstPath, "user-a/decks/deck-main/abc123");
  assert.equal(secondPath, firstPath);
  assert.equal(secondRow.id, firstRow.id);
  assert.notEqual(createCloudMediaPath("user-a", mediaFile(), { deckId: "deck-other" }), firstPath);
});

test("persistDeckMedia uploads and confirms one canonical row per hash", async () => {
  const client = createFakeClient();
  const result = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile()]);

  assert.equal(result.uploaded.length, 1);
  assert.equal(result.reused.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(client.uploads.length, 1);
  assert.equal(client.uploads[0].bucket, CORE_MEDIA_BUCKET);
  assert.equal(client.uploads[0].options.upsert, false);
  assert.equal(client.upserts.length, 1);
  assert.equal(client.upserts[0].options.onConflict, "user_id,id");
  assert.equal(result.rows[0].user_id, "user-a");
  assert.equal(result.rows[0].deck_id, "deck-1");
});

test("persistDeckMedia collapses duplicate inputs and reuses the confirmed row on reimport", async () => {
  const client = createFakeClient();
  const first = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile(), mediaFile({ name: "alias.png" })]);
  const second = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile({ name: "reimport.png" })]);

  assert.equal(first.rows.length, 1);
  assert.deepEqual(first.uploaded[0].requestedNames, ["card.png", "alias.png"]);
  assert.equal(second.rows.length, 1);
  assert.equal(second.reused[0].uploadStatus, "reused");
  assert.deepEqual(second.reused[0].requestedNames, ["reimport.png"]);
  assert.equal(client.uploads.length, 1);
  assert.equal(client.upserts.length, 1);
  assert.equal(client.mediaRows.length, 1);
});

test("the same hash stays separate across decks", async () => {
  const client = createFakeClient();
  const first = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile()]);
  const second = await persistDeckMedia(client, { id: "deck-2" }, [mediaFile()]);

  assert.equal(first.rows.length, 1);
  assert.equal(second.uploaded.length, 1);
  assert.equal(client.uploads.length, 2);
  assert.equal(client.mediaRows.length, 2);
  assert.notEqual(client.mediaRows[0].id, client.mediaRows[1].id);
  assert.notEqual(client.mediaRows[0].storage_path, client.mediaRows[1].storage_path);
});

test("missing hashes and conflicting sizes fail before writes", async () => {
  const client = createFakeClient();
  await assert.rejects(
    () => persistDeckMedia(client, { id: "deck-1" }, [mediaFile({ sha1: "" })]),
    (error) => error?.code === "cloud_media_sha1_missing",
  );

  const existing = createMediaAssetRow(mediaFile({ size: 8 }), "user-a", { deckId: "deck-1" });
  client.mediaRows.push(existing);
  await assert.rejects(
    () => persistDeckMedia(client, { id: "deck-1" }, [mediaFile({ size: 4 })]),
    (error) => error?.code === "cloud_media_hash_mismatch",
  );

  assert.equal(client.uploads.length, 0);
  assert.equal(client.upserts.length, 0);
});

test("an existing storage object is read back into a canonical reused row", async () => {
  const path = createCloudMediaPath("user-a", mediaFile(), { deckId: "deck-1" });
  const client = createFakeClient({ initialStoragePaths: [`${CORE_MEDIA_BUCKET}:${path}`] });
  const result = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile()]);

  assert.equal(result.uploaded.length, 0);
  assert.equal(result.reused.length, 1);
  assert.equal(result.reused[0].uploadStatus, "already-exists");
  assert.equal(result.rows.length, 1);
  assert.equal(client.mediaRows.length, 1);
});

test("a deleted row is reactivated only after its object upload succeeds", async () => {
  const deleted = {
    ...createMediaAssetRow(mediaFile(), "user-a", { deckId: "deck-1", deletedAt: "2026-07-11T08:00:00.000Z" }),
    created_at: "2026-07-10T08:00:00.000Z",
  };
  const client = createFakeClient({ initialRows: [deleted] });
  const result = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile()]);

  assert.equal(result.uploaded.length, 1);
  assert.equal(result.rows[0].deleted_at, null);
  assert.equal(result.rows[0].created_at, deleted.created_at);
  assert.equal(client.uploads.length, 1);
  assert.equal(client.upserts.length, 1);
});

test("large files without an existing object remain resumable-required without a row", async () => {
  const client = createFakeClient();
  const result = await persistDeckMedia(client, { id: "deck-1" }, [mediaFile({ sha1: "largehash", name: "deck.apkg", size: RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1 })]);

  assert.equal(client.uploads.length, 0);
  assert.equal(client.upserts.length, 0);
  assert.equal(result.rows.length, 0);
  assert.equal(result.skippedLarge.length, 1);
  assert.equal(result.skippedLarge[0].uploadStrategy, "resumable-required");
  assert.match(result.warnings[0], /resumable Upload/);
});

test("resolveDeckMediaUrls maps private urls to hash, stored name and requested aliases", async () => {
  const row = createMediaAssetRow(mediaFile({ name: "stored.png" }), "user-a", { deckId: "deck-1" });
  const client = createFakeClient({ initialRows: [row] });
  const deck = {
    id: "deck-1",
    importMeta: {
      mediaManifest: {
        assets: [{ sha1: "abc123", name: "requested.png" }],
      },
    },
  };
  const resolved = await resolveDeckMediaUrls(client, deck);
  const expectedUrl = `https://storage.test/${row.storage_path}`;

  assert.equal(client.signedUrls.length, 1);
  assert.equal(resolved.urls["stored.png"], expectedUrl);
  assert.equal(resolved.urls["requested.png"], expectedUrl);
  assert.equal(resolved.urls.abc123, expectedUrl);
  assert.deepEqual(resolved.missing, []);
});
