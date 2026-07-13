import assert from "node:assert/strict";
import test from "node:test";
import { createDeckMediaUrlMap, resolveCardHtmlMedia } from "./mediaStore.ts";

test("resolves only known media refs in sanitized card html", () => {
  const resolved = resolveCardHtmlMedia(
    '<script>alert(1)</script><img src="card_001.jpg" onerror="alert(2)"><img src="missing.jpg"><a href=card_001.jpg>open</a><a href="javascript:alert(3)">bad</a>',
    { "card_001.jpg": "blob:http://local/card_001" },
  );

  assert.equal(resolved.includes("<script"), false);
  assert.equal(resolved.includes("onerror"), false);
  assert.equal(resolved.includes("javascript:"), false);
  assert.equal(resolved.includes('src="blob:http://local/card_001"'), true);
  assert.equal(resolved.includes('href="blob:http://local/card_001"'), true);
  assert.equal(resolved.includes('src="missing.jpg"'), true);
});

test("invalid IndexedDB media records become missing media without object URLs", async () => {
  const originalIndexedDb = globalThis.indexedDB;
  const recordRequest = { result: { sha1: "abc123", name: "card.png", size: 4, mimeType: "image/png", updatedAt: "invalid", blob: "not-a-blob" } };
  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      return { objectStore: () => ({ get: () => {
        queueMicrotask(() => recordRequest.onsuccess?.());
        return recordRequest;
      } }) };
    },
    close() {},
  };
  globalThis.indexedDB = {
    open() {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };

  try {
    const result = await createDeckMediaUrlMap({
      importMeta: { mediaManifest: { assets: [{ sha1: "abc123", name: "card.png", size: 4, mimeType: "image/png" }] } },
    });
    assert.deepEqual(result.urls, {});
    assert.equal(result.missing.length, 1);
  } finally {
    globalThis.indexedDB = originalIndexedDb;
  }
});
