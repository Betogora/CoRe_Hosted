import assert from "node:assert/strict";
import test from "node:test";
import { findReadableCollectionDatabase, mapAnkiToCoreDeck, validateApkgFile } from "./apkgImport.js";

test("validates APKG extension and browser import size", () => {
  assert.equal(validateApkgFile({ name: "deck.apkg", size: 1024 }).valid, true);

  assert.deepStrictEqual(validateApkgFile({ name: "deck.zip", size: 1024 }).errors, [
    "Es werden nur Anki-Decks im .apkg-Format akzeptiert.",
  ]);
});

test("skips non-SQLite anki21b collection when anki2 fallback is available", async () => {
  const sqliteBytes = new Uint8Array([
    ..."SQLite format 3\0".split("").map((character) => character.charCodeAt(0)),
    0x02,
    0x00,
  ]);
  const zstdLikeBytes = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]);
  const archive = {
    getEntry(name) {
      const entries = {
        "collection.anki21b": {
          name,
          readBytes: async () => zstdLikeBytes,
        },
        "collection.anki2": {
          name,
          readBytes: async () => sqliteBytes,
        },
      };

      return entries[name];
    },
  };

  const result = await findReadableCollectionDatabase(archive);

  assert.equal(result.entry.name, "collection.anki2");
  assert.equal(result.bytes, sqliteBytes);
});

test("maps Anki notes and cards to immutable CoRe originals", () => {
  const deck = mapAnkiToCoreDeck({
    file: { name: "biology.apkg", size: 2048 },
    decks: [{ id: "1", name: "Biology" }],
    colRows: [
      {
        decks: JSON.stringify({ 1: { id: 1, name: "Biology" } }),
        models: JSON.stringify({
          99: {
            flds: [{ name: "Front" }, { name: "Back" }],
          },
        }),
      },
    ],
    notes: [
      {
        id: 10,
        mid: 99,
        tags: "cell exam",
        flds: "What is ATP?\u001fEnergy carrier <script>alert(1)</script>",
      },
    ],
    cards: [{ id: 20, nid: 10, did: 1, ord: 0 }],
    mediaMap: {},
  });

  assert.equal(deck.name, "Biology");
  assert.equal(deck.source, "anki-apkg");
  assert.equal(deck.cardCount, 1);
  assert.deepStrictEqual(deck.tags, ["cell", "exam"]);
  assert.equal(deck.cards[0].originalFront, "What is ATP?");
  assert.equal(deck.cards[0].originalBack, "Energy carrier ");
  assert.equal(deck.cards[0].coreState.isCoreReady, false);
  assert.equal(deck.cards[0].coreState.variantCount, 0);
  assert.equal(deck.cards[0].coreState.repetitionLevel, 0);
});
