import assert from "node:assert/strict";
import test from "node:test";
import { CORE_MEDIA_BUCKET, createCloudMediaPath, persistDeckMedia, RESUMABLE_UPLOAD_THRESHOLD_BYTES, resolveDeckMediaUrls } from "./cloudMediaStore.js";

function createFakeClient() {
  const uploads = [];
  const signedUrls = [];
  const upserts = [];
  const mediaRows = [];
  return {
    uploads,
    signedUrls,
    upserts,
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
            return { data: { path }, error: null };
          },
          async createSignedUrl(path, expiresIn) {
            signedUrls.push({ bucket, path, expiresIn });
            return { data: { signedUrl: `https://storage.test/${path}` }, error: null };
          },
        };
      },
    },
    from(table) {
      return {
        upsert(rows, options) {
          upserts.push({ table, rows, options });
          mediaRows.push(...rows);
          return Promise.resolve({ data: rows, error: null });
        },
        select() {
          return {
            eq() {
              return {
                in() {
                  return Promise.resolve({ data: mediaRows, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

test("cloud media paths are scoped by user, deck and content hash", () => {
  const path = createCloudMediaPath("user-a", { sha1: "abc123", name: "Bild 01.png" }, { deckId: "deck-main" });

  assert.equal(path, "user-a/decks/deck-main/abc123/Bild-01.png");
});

test("persistDeckMedia uploads small files without storage upsert and records rows", async () => {
  const client = createFakeClient();
  const result = await persistDeckMedia(client, { id: "deck-1" }, [{ sha1: "abc123", name: "card.png", size: 4, mimeType: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) }]);

  assert.equal(result.uploaded.length, 1);
  assert.equal(client.uploads.length, 1);
  assert.equal(client.uploads[0].bucket, CORE_MEDIA_BUCKET);
  assert.equal(client.uploads[0].options.upsert, false);
  assert.equal(client.upserts[0].table, "media_assets");
  assert.equal(client.upserts[0].options.onConflict, "user_id,id");
  assert.equal(result.rows[0].user_id, "user-a");
  assert.equal(result.rows[0].deck_id, "deck-1");
});

test("persistDeckMedia marks large files for resumable upload instead of direct upload", async () => {
  const client = createFakeClient();
  const result = await persistDeckMedia(client, { id: "deck-1" }, [{ sha1: "largehash", name: "deck.apkg", size: RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1, mimeType: "application/octet-stream" }]);

  assert.equal(client.uploads.length, 0);
  assert.equal(result.skippedLarge.length, 1);
  assert.equal(result.skippedLarge[0].uploadStrategy, "resumable-required");
  assert.match(result.warnings[0], /resumable Upload/);
});

test("resolveDeckMediaUrls creates signed urls for private media assets", async () => {
  const client = createFakeClient();
  const persisted = await persistDeckMedia(client, { id: "deck-1" }, [{ sha1: "abc123", name: "card.png", size: 4, mimeType: "image/png", bytes: new Uint8Array([1]) }]);
  const resolved = await resolveDeckMediaUrls(client, persisted.rows);

  assert.equal(client.signedUrls.length, 1);
  assert.equal(resolved.urls["card.png"], `https://storage.test/${persisted.rows[0].storage_path}`);
  assert.equal(resolved.urls.abc123, `https://storage.test/${persisted.rows[0].storage_path}`);
});
