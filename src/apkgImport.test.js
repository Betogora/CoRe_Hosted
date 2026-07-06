import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  commitImport,
  findReadableCollectionDatabase,
  mapAnkiToCoreDeck,
  parseAnkiMedia,
  parseMediaEntriesBytes,
  parsePackageMetadataBytes,
  validateApkgFile,
} from "./apkgImport.js";
import { createBasicLearningItem, createCoreDeck } from "./coreModel.js";

function archiveFromEntries(entries) {
  return {
    listEntries() {
      return Object.keys(entries).map((name) => ({ name }));
    },
    getEntry(name) {
      const bytes = entries[name];
      if (!bytes) return null;

      return {
        name,
        readBytes: async () => bytes,
      };
    },
  };
}

function encodeVarint(value) {
  const bytes = [];
  let next = value;

  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next = Math.floor(next / 128);
  }

  bytes.push(next);
  return bytes;
}

function fieldVarint(fieldNumber, value) {
  return [...encodeVarint((fieldNumber << 3) | 0), ...encodeVarint(value)];
}

function fieldBytes(fieldNumber, bytes) {
  return [...encodeVarint((fieldNumber << 3) | 2), ...encodeVarint(bytes.length), ...bytes];
}

function mediaEntriesBytes(entries) {
  return new Uint8Array(
    entries.flatMap((entry) => {
      const nameBytes = [...new TextEncoder().encode(entry.name)];
      const sha1Bytes = [...Buffer.from(entry.sha1, "hex")];
      const message = [...fieldBytes(1, nameBytes), ...fieldVarint(2, entry.size), ...fieldBytes(3, sha1Bytes)];
      return fieldBytes(1, message);
    }),
  );
}

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

test("parses latest package metadata and MediaEntries bytes", () => {
  const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const sha1 = createHash("sha1").update(imageBytes).digest("hex");
  const metadata = parsePackageMetadataBytes(new Uint8Array([0x08, 0x03]));
  const entries = parseMediaEntriesBytes(mediaEntriesBytes([{ name: "card_001.jpg", size: imageBytes.length, sha1 }]));

  assert.equal(metadata.version, "latest");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "card_001.jpg");
  assert.equal(entries[0].size, imageBytes.length);
  assert.equal(entries[0].sha1, sha1);
});

test("reads legacy JSON media maps and stores file metadata", async () => {
  const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const archive = archiveFromEntries({
    media: new TextEncoder().encode(JSON.stringify({ 0: "image.png" })),
    0: imageBytes,
  });

  const bundle = await parseAnkiMedia(archive);

  assert.equal(bundle.format, "legacy-json");
  assert.deepEqual(bundle.mediaMap, { 0: "image.png" });
  assert.equal(bundle.mediaFiles.length, 1);
  assert.equal(bundle.manifest.assets[0].name, "image.png");
  assert.equal(bundle.manifest.assets[0].mimeType, "image/png");
});

test("maps modern numeric media entries to filenames by sha1 and size", async () => {
  const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const sha1 = createHash("sha1").update(imageBytes).digest("hex");
  const archive = archiveFromEntries({
    meta: new Uint8Array([0x08, 0x03]),
    media: mediaEntriesBytes([{ name: "card_001.jpg", size: imageBytes.length, sha1 }]),
    0: imageBytes,
  });

  const bundle = await parseAnkiMedia(archive);

  assert.equal(bundle.format, "media-entries");
  assert.deepEqual(bundle.mediaMap, { 0: "card_001.jpg" });
  assert.equal(bundle.mediaFiles.length, 1);
  assert.equal(bundle.mediaFiles[0].zipEntryName, "0");
  assert.equal(bundle.manifest.assets[0].sha1, sha1);
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

test("commitImport merges reimports and preserves local content edits", async () => {
  const existingCard = {
    ...createBasicLearningItem("", "Lokale Frage", "Lokale Antwort", {
      id: "card_existing",
      sourceType: "anki_import",
      sourceRefId: "note_10",
    }),
    versionLog: [{ id: "version_local", changeType: "content_updated" }],
  };
  const incomingCard = createBasicLearningItem("", "Importierte Frage", "Importierte Antwort", {
    id: "card_incoming",
    sourceType: "anki_import",
    sourceRefId: "note_10",
    mediaRefs: ["cell.png"],
  });
  const existingDeck = createCoreDeck({
    id: "deck_existing",
    name: "Biology",
    source: "anki-apkg",
    originalDeckId: "1",
    importMeta: { fileName: "biology.apkg", detectedNotes: 1, detectedCards: 1 },
    cards: [existingCard],
  });
  const incomingDeck = createCoreDeck({
    name: "Biology Imported",
    source: "anki-apkg",
    originalDeckId: "1",
    importMeta: { fileName: "biology.apkg", detectedNotes: 1, detectedCards: 1 },
    cards: [incomingCard],
  });

  const merged = await commitImport({ deck: incomingDeck }, { existingDecks: [existingDeck] });

  assert.equal(merged.id, "deck_existing");
  assert.equal(merged.cards[0].id, "card_existing");
  assert.equal(merged.cards[0].originalFront, "Lokale Frage");
  assert.deepEqual(merged.cards[0].mediaRefs, ["cell.png"]);
  assert.equal(merged.importMeta.replacedDeckId, "deck_existing");
});
