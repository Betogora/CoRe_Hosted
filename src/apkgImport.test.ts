import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  commitApkgImport,
  createApkgReportDetails,
  createApkgImportPreview,
  findReadableCollectionDatabase,
  LOCAL_APKG_MAX_BYTES,
  mapAnkiApkgToNormalizedDeck,
  mergeImportedDeck,
  parseAnkiMedia,
  parseApkgToNormalizedImport,
  parseMediaEntriesBytes,
  parsePackageMetadataBytes,
  prepareApkgWorkerResult,
  validateApkgFile,
} from "./apkgImportInternal.ts";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, createLearningItemFromEditorValue, getActiveVariants, getAnswerSideAnchorMiniCard, getCardEditorValue, getOriginalVariant, saveCardEditorValue, saveLearningItemDocumentValues, updateLearningItemStudyState, type CoreCardInput } from "./coreModel.ts";
import { getLearningItemMaturity, getVariantGenerationRecommendation } from "./coreVariantService.ts";
import { importNormalizedDeck } from "./importService.ts";
import { answerVariant, getNextReviewItem } from "./reviewService.ts";
import { readSqliteDatabase } from "./sqliteReader.ts";
import { readZipArchive } from "./zipReader.ts";
import type { WithImplicitCoercion } from "buffer";

const APKG_QUALITY_FIXTURE_ROOT = new URL("../fixtures/apkg/", import.meta.url);

async function qualityFixtureFile(name: "legacy" | "latest") {
  const fileName = `import-quality-${name}.apkg`;
  const bytes = await readFile(new URL(fileName, APKG_QUALITY_FIXTURE_ROOT));
  return {
    name: fileName,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    bytes,
  };
}

function archiveFromEntries(entries: { [x: string]: any; media?: Uint8Array<any>|Uint8Array<ArrayBuffer>; 0?: Uint8Array<ArrayBuffer>; meta?: Uint8Array<ArrayBuffer>; }) {
  return {
    listEntries() {
      return Object.keys(entries).map((name) => ({ name }));
    },
    getEntry(name: string|number) {
      const bytes = entries[name];
      if (!bytes) return null;

      return {
        name,
        readBytes: async () => bytes,
      };
    },
  };
}

async function commitParsed(input: any, options: any = {}) {
  const prepared = prepareApkgWorkerResult(await parseApkgToNormalizedImport(input));
  return commitApkgImport(prepared, options);
}

function encodeVarint(value: number) {
  const bytes = [];
  let next = value;

  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next = Math.floor(next / 128);
  }

  bytes.push(next);
  return bytes;
}

function fieldVarint(fieldNumber: number, value: any) {
  return [...encodeVarint((fieldNumber << 3) | 0), ...encodeVarint(value)];
}

function fieldBytes(fieldNumber: number, bytes: string|any[]) {
  return [...encodeVarint((fieldNumber << 3) | 2), ...encodeVarint(bytes.length), ...bytes];
}

function mediaEntriesBytes(entries: any[]) {
  return new Uint8Array(
    entries.flatMap((entry: { name: string|undefined; sha1: WithImplicitCoercion<string>; size: any; }) => {
      const nameBytes = [...new TextEncoder().encode(entry.name)];
      const sha1Bytes = [...Buffer.from(entry.sha1, "hex")];
      const message = [...fieldBytes(1, nameBytes), ...fieldVarint(2, entry.size), ...fieldBytes(3, sha1Bytes)];
      return fieldBytes(1, message);
    }),
  );
}

function parsedApkgFixture({
  decks = [{ id: "1", name: "Fixture Deck" }],
  modelName = "Basic",
  modelType = 0,
  originalStockKind = 0,
  fields = [{ name: "Front" }, { name: "Back" }],
  templates = [{ name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr>{{Back}}" }],
  noteFields = "Front?\u001fBack.",
  noteTags = "tag",
  notes = null,
  cards = [{ id: 20, nid: 10, did: 1, ord: 0 }],
  reviewHistory = [],
  mediaManifest = null,
}: any = {}) {
  return {
    file: { name: "fixture.apkg", size: 4096 },
    decks,
    colRows: [
      {
        decks: JSON.stringify(Object.fromEntries(decks.map((deck: any) => [deck.id, { id: deck.id, name: deck.name }]))),
        models: JSON.stringify({
          99: {
            name: modelName,
            type: modelType,
            originalStockKind,
            flds: fields,
            tmpls: templates,
          },
        }),
      },
    ],
    notes: notes ?? [
      {
        id: 10,
        mid: 99,
        tags: noteTags,
        flds: noteFields,
      },
    ],
    cards,
    reviewHistory,
    mediaBundle: {
      mediaMap: {},
      mediaFiles: [],
      manifest: mediaManifest ?? {
        format: "none",
        assets: [],
        missingAssets: [],
      },
    },
  };
}

async function worldCapitalsApkgFile() {
  const bytes = await readFile(new URL("../fixtures/apkg/world-capitals.apkg", import.meta.url));
  return {
    name: "world-capitals.apkg",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function createReimportDeck(card: CoreCardInput, { existing = false, withImportMeta = false }: any = {}) {
  return createCoreDeck({
    ...(existing ? { id: "deck_existing", name: "Biology" } : { name: "Biology Imported" }),
    source: "anki-apkg",
    originalDeckId: "1",
    ...(withImportMeta ? { importMeta: { fileName: "biology.apkg", detectedNotes: 1, detectedCards: 1 } } : {}),
    cards: [card],
  });
}

test("validates APKG extension and browser import size", () => {
  assert.equal(validateApkgFile({ name: "deck.apkg", size: 1024 }).valid, true);
  assert.equal(validateApkgFile({ name: "deck.apkg", size: LOCAL_APKG_MAX_BYTES }).valid, true);
  assert.deepEqual(validateApkgFile({ name: "deck.apkg", size: LOCAL_APKG_MAX_BYTES + 1 }).errors, [
    "Die Datei ist größer als 250 MB und wird im MVP nicht direkt im Browser importiert.",
  ]);

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
    getEntry(name: string|number) {
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

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      return entries[name];
    },
  };

  const result = await findReadableCollectionDatabase(archive);

  assert.equal(result.entry.name, "collection.anki2");
  assert.equal(result.bytes, sqliteBytes);
});

test("parses latest package metadata and MediaEntries bytes", async () => {
  const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const sha1 = createHash("sha1").update(imageBytes).digest("hex");
  const metadata = await parsePackageMetadataBytes(new Uint8Array([0x08, 0x03]));
  const entries = await parseMediaEntriesBytes(mediaEntriesBytes([{ name: "card_001.jpg", size: imageBytes.length, sha1 }]));

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

test("maps Anki notes and cards to immutable CoRe originals", async () => {
  const deck = (await commitParsed({
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
  })).deck;

  assert.equal(deck.name, "Biology");
  assert.equal(deck.source, "anki-apkg");
  assert.equal(deck.cardCount, 1);
  assert.deepStrictEqual(deck.tags, ["cell", "exam"]);
  assert.match(deck.cards[0].originalFront, /<h3>Front<\/h3>What is ATP\?/);
  assert.match(deck.cards[0].originalFront, /<h3>Back<\/h3>Energy carrier/);
  assert.equal(deck.cards[0].originalBack, deck.cards[0].originalFront);
  assert.doesNotMatch(deck.cards[0].originalFront, /script|alert/);
  assert.equal(deck.cards[0].coreState.isCoreReady, false);
  assert.equal(deck.cards[0].coreState.variantCount, 0);
  assert.equal(deck.cards[0].coreState.repetitionLevel, 0);
});

test("maps Basic APKG parser output and preserves card flags as opaque metadata", async () => {
  const parsed = parsedApkgFixture({
    noteFields: "What is ATP?\u001fEnergy carrier",
    noteTags: "cell exam",
    cards: [{ id: 20, nid: 10, did: 1, ord: 0, flags: 5 }],
  });
  const mapped = mapAnkiApkgToNormalizedDeck(parsed);
  const item = mapped.normalizedDeck.items[0];
  const variant = item.variants[0];
  const committed = await commitParsed(parsed, { existingDecks: [] });

  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.normalizedDeck.title, "Fixture Deck");
  assert.equal(mapped.normalizedDeck.sourceType, "anki_import");
  assert.equal(mapped.normalizedDeck.sourceExternalId, "anki-deck-1");
  assert.equal(item.sourceType, "anki_import");
  assert.equal(item.sourceExternalId, "anki-note-10");
  assert.deepEqual(item.tags, ["cell", "exam"]);
  assert.equal(item.canonicalQuestion, "What is ATP?");
  assert.equal(item.canonicalAnswer, "What is ATP?<hr />Energy carrier");
  assert.equal(variant.sourceExternalId, "anki-card-20");
  assert.equal(variant.isOriginal, true);
  assert.equal(variant.anchorToOriginal, false);
  assert.equal(variant.metadataJson.ankiNoteId, undefined);
  assert.equal(variant.metadataJson.ankiCardFlagsRaw, 5);
  assert.equal(committed.deck.cards[0].variants[0].meta.ankiCardFlagsRaw, 5);
  assert.equal(item.metadataJson.ankiNoteId, "10");
});

test("maps Basic Reverse notes to one LearningItem with anchored imported variants", async () => {
  const parsed = parsedApkgFixture({
    modelName: "Basic (and reversed card)",
    templates: [
      { name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr>{{Back}}" },
      { name: "Card 2", ord: 1, qfmt: "{{Back}}", afmt: "{{FrontSide}}<hr>{{Front}}" },
    ],
    noteFields: "ATP\u001fEnergy carrier",
    cards: [
      { id: 20, nid: 10, did: 1, ord: 0 },
      { id: 21, nid: 10, did: 1, ord: 1 },
    ],
  });
  const mapped = mapAnkiApkgToNormalizedDeck(parsed);
  const item = mapped.normalizedDeck.items[0];
  const reverseVariant = item.variants[1];
  const committed = await commitParsed(parsed, { existingDecks: [] });
  const imported = committed.deck.cards[0];
  const original = getOriginalVariant(imported);
  const importedReverse = getActiveVariants(imported)[0];
  assert.ok(importedReverse);
  const reviewed = answerVariant(committed.deck, imported.id, importedReverse.id, "good", {
    now: "2026-07-07T10:00:00.000Z",
  });

  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.normalizedDeck.items.length, 1);
  assert.equal(item.variants.filter((variant: { isOriginal: any; }) => variant.isOriginal).length, 1);
  assert.ok(reverseVariant);
  assert.equal(reverseVariant.front, "Energy carrier");
  assert.equal(reverseVariant.back, "Energy carrier<hr />ATP");
  assert.equal(reverseVariant.isOriginal, false);
  assert.equal(reverseVariant.anchorToOriginal, true);
  assert.equal(committed.deck.source, "anki-apkg");
  assert.equal(committed.deck.cards.length, 1);
  assert.equal(imported.reviewState.schedulerVersion, "fsrs_6_v1");
  assert.equal(imported.reviewState.state, "new");
  assert.equal(getLearningItemMaturity(imported).stage, "new");
  assert.equal(getVariantGenerationRecommendation(imported).shouldSuggest, false);
  assert.equal(imported.variants.filter((variant: { isOriginal: any; }) => variant.isOriginal).length, 1);
  assert.ok(original);
  assert.ok(importedReverse);
  assert.equal(importedReverse.anchorVariantId, original.id);
  assert.ok(original);
  assert.ok(importedReverse);
  assert.equal(importedReverse.parentVariantId, original.id);
  assert.equal(getAnswerSideAnchorMiniCard(imported, importedReverse).shouldShow, true);
  assert.ok(getNextReviewItem);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getNextReviewItem(committed.deck).learningItemId, imported.id);
  assert.ok(getNextReviewItem);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getNextReviewItem(committed.deck).ratingButtonOptions.good.intervalLabel, "15 Min.");
  assert.equal(reviewed.deck.cards[0].reviewState.reps, 1);
  assert.equal(reviewed.deck.reviewEvents.length, 1);
  assert.ok(importedReverse);
  assert.ok(getActiveVariants);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getActiveVariants(reviewed.deck.cards[0]).find((variant) => variant.id === importedReverse.id).performance.correctCount, 1);
});

test("committed APKG import creates visible parent and child decks from Anki hierarchy", async () => {
  const parsed = parsedApkgFixture({
    decks: [
      { id: "1", name: "Medizin" },
      { id: "2", name: "Medizin::Anatomie" },
      { id: "3", name: "Medizin::Physio" },
    ],
    notes: [
      { id: 10, mid: 99, tags: "ana", flds: "Was ist der Nervus vagus?\u001fHirnnerv X." },
      { id: 11, mid: 99, tags: "physio", flds: "Was ist ATP?\u001fEnergietraeger." },
    ],
    cards: [
      { id: 20, nid: 10, did: 2, ord: 0 },
      { id: 21, nid: 11, did: 3, ord: 0 },
    ],
    mediaManifest: {
      format: "legacy-json",
      assets: [{ name: "cell.png", sha1: "abc123", size: 4, mimeType: "image/png", zipEntryName: "0" }],
      missingAssets: [],
    },
  });
  const committed = await commitParsed(parsed, { existingDecks: [] });
  const root = committed.decks.find((deck: { name: string; }) => deck.name === "Medizin");
  const anatomy = committed.decks.find((deck: { name: string; }) => deck.name === "Anatomie");
  const physio = committed.decks.find((deck: { name: string; }) => deck.name === "Physio");

  assert.equal(committed.decks.length, 3);
  assert.ok(root);
  assert.ok(anatomy);
  assert.ok(physio);
  assert.equal(root.parentDeckId, null);
  assert.equal(root.cards.length, 0);
  assert.equal(anatomy.parentDeckId, root.id);
  assert.equal(physio.parentDeckId, root.id);
  assert.deepEqual(anatomy.hierarchyPath, ["Medizin", "Anatomie"]);
  assert.deepEqual(physio.hierarchyPath, ["Medizin", "Physio"]);
  assert.equal(anatomy.cards.length, 1);
  assert.equal(physio.cards.length, 1);
  assert.equal(committed.decks.every((deck: { importMeta: { mediaManifest: { assets: string|any[]; }; }; }) => deck.importMeta.mediaManifest.assets.length === 1), true);
});

test("binary readers reject truncated ZIP, invalid MediaEntries and SQLite page sizes", async () => {
  const complete = await worldCapitalsApkgFile();
  const completeBytes = new Uint8Array(await complete.arrayBuffer());
  const truncated = completeBytes.slice(0, 64);
  const parsed = await parseApkgToNormalizedImport({
    name: "truncated.apkg",
    size: truncated.length,
    arrayBuffer: async () => truncated.buffer,
  });

  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /ZIP|abgeschnitten/);
  await assert.rejects(() => parseMediaEntriesBytes(Uint8Array.of(0x0a, 0x80)), /Varint/);

  const invalidSqlite = new Uint8Array(512);
  invalidSqlite.set(new TextEncoder().encode("SQLite format 3\0"));
  invalidSqlite[16] = 0x01;
  invalidSqlite[17] = 0x2c;
  assert.throws(() => readSqliteDatabase(invalidSqlite), /Seitengröße/);
});

test("committed APKG fixture imports the world capitals hierarchy", async () => {
  const committed = await commitParsed(await worldCapitalsApkgFile(), { existingDecks: [] });
  const root = committed.decks.find((deck: { name: string; }) => deck.name === "Welt-Hauptstädte");
  const byName = new Map(committed.decks.map((deck: { name: any; }) => [deck.name, deck]));
  const expectedCounts = {
    Afrika: 59,
    Antarktis: 2,
    Asien: 49,
    Europa: 53,
    Nordamerika: 41,
    Ozeanien: 27,
    Südamerika: 14,
  };

  assert.equal(committed.decks.length, 8);
  assert.equal(committed.report.apkg.detectedCards, 245);
  assert.equal(committed.decks.reduce((sum: any, deck: { cards: string|any[]; }) => sum + deck.cards.length, 0), 245);
  assert.ok(root);
  assert.equal(root.parentDeckId, null);
  assert.equal(root.cards.length, 0);
  for (const [name, count] of Object.entries(expectedCounts)) {
    const deck = byName.get(name);
    assert.ok(deck, name);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.equal(deck.parentDeckId, root.id);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.deepEqual(deck.hierarchyPath, ["Welt-Hauptstädte", name]);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.equal(deck.cards.length, count);
  }
});

test("APKG preview uses the normalized Learning Item path", async () => {
  const result = await createApkgImportPreview(await worldCapitalsApkgFile());
  const preview = result.preview;

  assert.equal(result.job.status, "preview");
  assert.ok(preview);
  assert.equal(preview.summary.cards.length, 0);
  assert.equal(preview.summary.cardCount, 245);
  assert.ok(preview);
  assert.equal(preview.sampleCards.length, 5);
  assert.ok(preview);
  assert.equal(preview.report.apkg.detectedCards, 245);
  assert.ok(preview);
  assert.equal((preview.summary.importMeta.deckHierarchy as unknown[]).length, 8);
  assert.ok(preview);
  assert.equal(preview.sampleCards.every((item) => item.variants.filter((variant) => variant.isOriginal).length === 1), true);
  assert.ok(preview);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(preview.sampleCards[0]).front, preview.sampleCards[0].canonicalQuestion);
});

test("APKG preview worker transfers input, reports progress and always terminates", async () => {
  const file = await worldCapitalsApkgFile();
  const direct = await parseApkgToNormalizedImport(file);
  const originalWorker = globalThis.Worker;
  const steps: unknown = [];

  class PreviewWorker {
    static instance = null;
    constructor() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      PreviewWorker.instance = this;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.terminated = false;
    }
    postMessage(request: { type: string; requestId: any; }, transfer: any) {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.request = request;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.transfer = transfer;
      queueMicrotask(() => {
        if (request.type === "commit") {
// @ts-expect-error -- Vereinfachter Worker-Stub.
          this.onmessage({ data: { type: "commit-chunk", requestId: request.requestId, chunk: { kind: "outbox" } } });
          return;
        }
        if (request.type === "commit-next") {
// @ts-expect-error -- Vereinfachter Worker-Stub.
          this.onmessage({ data: { type: "commit-done", requestId: request.requestId } });
          return;
        }
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        this.onmessage({ data: { type: "progress", requestId: request.requestId, step: "collection" } });
        const prepared = prepareApkgWorkerResult(direct);
        const compactResult = {
          ...prepared,
          commitGraph: {
            kind: "worker-import",
            deckCount: prepared.commitGraph.decks.length,
            cardCount: prepared.commitGraph.decks.reduce((sum: number, deck: any) => sum + deck.cards.length, 0),
            noteTypeDefinitions: prepared.commitGraph.noteTypeDefinitions.slice(0, 1),
          },
        };
// @ts-expect-error -- Test-Worker zeichnet die übertragene Laufzeitform auf.
        this.result = compactResult;
// @ts-expect-error -- Vereinfachter Worker-Stub.
        this.onmessage({
          data: {
            type: "result",
            requestId: request.requestId,
            result: compactResult,
          },
        });
      });
    }
    terminate() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.terminated = true;
    }
  }

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  globalThis.Worker = PreviewWorker;
  try {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    const workerPreview = await createApkgImportPreview(file, (step: any) => steps.push(step));
    assert.ok(workerPreview);
    assert.ok(workerPreview.preview);
    assert.equal(workerPreview.preview.summary.cards.length, 0);
    assert.equal(workerPreview.preview.summary.cardCount, direct.normalizedDeck.items.length);
    assert.deepEqual(steps, ["collection"]);
    assert.ok(PreviewWorker);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.equal(PreviewWorker.instance.request.buffer instanceof ArrayBuffer, true);
    assert.ok(PreviewWorker);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.deepEqual(PreviewWorker.instance.transfer, [PreviewWorker.instance.request.buffer]);
    assert.ok(PreviewWorker);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.equal(PreviewWorker.instance.terminated, false);
    const commitChunks: unknown[] = [];
    await workerPreview.preview.commitGraph.streamChunks(async (chunk: unknown) => { commitChunks.push(chunk); });
    assert.deepEqual(commitChunks, [{ kind: "outbox" }]);
    assert.equal((PreviewWorker.instance as any).terminated, true);
    const instance = PreviewWorker.instance as any;
    assert.equal("parsedPackage" in instance.result, false);
    assert.equal("reviewHistory" in instance.result, false);
    const compactBytes = JSON.stringify(instance.result).length;
    const previousFullPreview = importNormalizedDeck(direct.normalizedDeck, { dryRun: false }).deck;
    const previousTransferBytes = JSON.stringify({
      worker: direct,
      previewDeck: previousFullPreview,
    }).length;
    const previousRetainedBytes = JSON.stringify({
      worker: {
        normalizedDeck: direct.normalizedDeck,
        warnings: direct.warnings,
        errors: direct.errors,
        mediaFiles: direct.mediaFiles,
        reviewHistory: direct.reviewHistory,
        parsedPackage: direct.parsedPackage,
      },
      preview: {
        deck: previousFullPreview,
        sampleCards: previousFullPreview?.cards.slice(0, 5),
        normalizedDeck: direct.normalizedDeck,
        reviewHistory: direct.reviewHistory,
      },
    }).length;
    assert.ok(compactBytes < previousTransferBytes, "Worker-Payload wurde nicht verkleinert");
    assert.ok(compactBytes <= previousRetainedBytes * 0.6, `Previewzustand nur um ${Math.round((1 - compactBytes / previousRetainedBytes) * 100)} % reduziert`);
  } finally {
    globalThis.Worker = originalWorker;
  }
});

test("APKG preview rejects invalid worker messages and aborts with cleanup", async () => {
  const file = await worldCapitalsApkgFile();
  const originalWorker = globalThis.Worker;

  class InvalidWorker {
    static instance = null;
    constructor() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      InvalidWorker.instance = this;
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.terminated = false;
    }
    postMessage() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      queueMicrotask(() => this.onmessage({ data: { type: "unknown" } }));
    }
    terminate() {
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
      this.terminated = true;
    }
  }

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  globalThis.Worker = InvalidWorker;
  try {
    await assert.rejects(() => createApkgImportPreview(file), /ungültige Nachricht/);
    assert.ok(InvalidWorker);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.equal(InvalidWorker.instance.terminated, true);

    class WaitingWorker extends InvalidWorker {
      postMessage() {}
    }
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    globalThis.Worker = WaitingWorker;
    const controller = new AbortController();
    const pending = createApkgImportPreview(file, () => {}, { signal: controller.signal });
    controller.abort();
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    await assert.rejects(() => pending, (error) => error?.name === "AbortError");
    assert.ok(WaitingWorker);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
    assert.equal(WaitingWorker.instance.terminated, true);
  } finally {
    globalThis.Worker = originalWorker;
  }
});

test("imports Cloze parser output as cloze content with a warning instead of crashing", async () => {
  const parsed = parsedApkgFixture({
    modelName: "Cloze",
    modelType: 1,
    fields: [{ name: "Text" }, { name: "Extra" }],
    templates: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>{{Extra}}" }],
    noteFields: "{{c1::ATP}} liefert Energie.\u001fExtra: Zellstoffwechsel",
  });
  const mapped = mapAnkiApkgToNormalizedDeck(parsed);
  const committed = await commitParsed(parsed, { existingDecks: [] });
  const imported = committed.deck.cards[0];

  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.normalizedDeck.items[0].variants[0].variantType, "cloze");
  assert.equal(mapped.normalizedDeck.items[0].noteTypeDefinition.kind, "cloze");
  assert.equal(imported.kind, "cloze");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(imported).variantType, "cloze");
});

test("imports every native image-occlusion Anki card as a stable reviewable region", async () => {
  const committed = await commitParsed(parsedApkgFixture({
    modelName: "Image Occlusion",
    modelType: 1,
    originalStockKind: 6,
    fields: [{ name: "A" }],
    templates: [{ name: "Maske", ord: 0, qfmt: "{{cloze:A}}", afmt: "{{cloze:A}}" }],
    noteFields: '<img src="diagram.png">',
    cards: [
      { id: 201, nid: 10, did: 1, ord: 0 },
      { id: 202, nid: 10, did: 1, ord: 1 },
    ],
  }), { existingDecks: [] });
  const imported = committed.deck.cards[0];
  const active = imported.variants.filter((variant: { isActive: boolean }) => variant.isActive);

  assert.equal(imported.noteTypeDefinitionId.includes("anki-99"), true);
  assert.equal(imported.kind, "image-occlusion");
  assert.equal(active.length, 2);
  assert.deepEqual(active.map((variant: any) => variant.projection.regionKey), ["201", "202"]);
  assert.deepEqual(active.map((variant: any) => variant.meta.ankiImportIdentityV1.cardId), ["201", "202"]);
});

test("APKG dry run remains read-only and commit migrates Anki progress", async () => {
  const parsed = parsedApkgFixture({
    noteFields: "Cell image?<br><img src=\"cell.png\">\u001fA cell.",
    cards: [{ id: 20, nid: 10, did: 1, ord: 0, reps: 4, lapses: 1, ivl: 12, type: 2, queue: 2 }],
    mediaManifest: {
      format: "legacy-json",
      assets: [{ name: "cell.png", sha1: "abc123", size: 4, mimeType: "image/png", zipEntryName: "0" }],
      missingAssets: [{ name: "missing.png" }],
    },
  });
  const prepared = prepareApkgWorkerResult(await parseApkgToNormalizedImport(parsed));
  const committed = commitApkgImport(prepared, { existingDecks: [] });
  const imported = committed.deck.cards[0];

  assert.equal(prepared.report.dryRun, true);
  assert.equal(prepared.report.apkg.detectedNotes, 1);
  assert.equal(prepared.report.apkg.detectedCards, 1);
  assert.equal(prepared.report.apkg.detectedVariants, 1);
  assert.equal(prepared.report.hasAnkiScheduling, true);
  assert.equal(prepared.report.mediaCount, 1);
  assert.equal(prepared.report.missingMediaCount, 1);
  assert.equal(committed.deck.importMeta.mediaManifest.assets.length, 1);
  assert.deepEqual(imported.mediaRefs, ["cell.png"]);
  assert.equal(imported.reviewState.schedulerVersion, "fsrs_6_v1");
  assert.equal(imported.reviewState.state, "review");
  assert.equal(imported.reviewState.reps, 4);
  assert.equal(imported.reviewState.lapses, 1);
  assert.equal((imported.reviewState.sourceSchedulerData as Record<string, unknown>).migrationMethod, "sm2-card-state");
  assert.equal(committed.report.schedulingImported, true);
  assert.equal(committed.report.apkg.reviewHistory.heuristicCards, 1);
  assert.equal(committed.deck.reviewEvents.length, 0);
});

test("APKG import prefers a valid modern Anki FSRS memory state", async () => {
  const data = JSON.stringify({ s: 42.125, d: 3.75, dr: 0.92, lrt: 1_700_000_000, cd: "{\"x\":1}" });
  const committed = await commitParsed(parsedApkgFixture({
    cards: [{ id: 20, nid: 10, did: 1, ord: 0, reps: 9, lapses: 2, ivl: 30, type: 2, queue: 2, data }],
    reviewHistory: [{ id: 1_700_000_001_000, cid: 20, ease: 3, type: 1, lastIvl: 10, ivl: 30, factor: 2400, time: 1_000 }],
  }), { existingDecks: [] });
  const imported = committed.deck.cards[0];
  const source = imported.reviewState.sourceSchedulerData as Record<string, unknown>;

  assert.equal(imported.reviewState.stability, 42.125);
  assert.equal(imported.reviewState.difficulty, 3.75);
  assert.equal(imported.reviewState.desiredRetention, 0.92);
  assert.equal(imported.reviewState.lastReviewedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(source.migrationMethod, "fsrs-memory-state");
  assert.equal((source.rawCardState as Record<string, unknown>).data, data);
  assert.equal(committed.report.apkg.reviewHistory.directCards, 1);
  assert.equal(committed.report.apkg.reviewHistory.replayedCards, 0);
});

test("commitImport merges reimports and preserves local content edits", async () => {
  const existingCard = {
    ...createBasicLearningItem("", "Alte Importfrage", "Alte Importantwort", {
      id: "card_existing",
      sourceType: "anki_import",
      sourceRefId: "note_10",
    }),
    originalFront: "Lokale Frage",
    originalBack: "Lokale Antwort",
    versionLog: [{ id: "version_local", changeType: "content_updated" }],
  };
  const incomingCard = createBasicLearningItem("", "Importierte Frage", "Importierte Antwort", {
    id: "card_incoming",
    sourceType: "anki_import",
    sourceRefId: "note_10",
    mediaRefs: ["cell.png"],
  });
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const existingDeck = createReimportDeck(existingCard, { existing: true, withImportMeta: true });
  const incomingDeck = createReimportDeck(incomingCard, { withImportMeta: true });

  const merged = mergeImportedDeck(incomingDeck, [existingDeck]);

  assert.equal(merged.id, "deck_existing");
  assert.equal(merged.cards[0].id, "card_existing");
  assert.equal(merged.cards[0].originalFront, "Lokale Frage");
  assert.equal(merged.cards[0].canonicalQuestion, "Lokale Frage");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(merged.cards[0]).front, "Lokale Frage");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(merged.cards[0]).back, "Lokale Antwort");
  assert.deepEqual(merged.cards[0].mediaRefs, ["cell.png"]);
  assert.equal(merged.importMeta.replacedDeckId, "deck_existing");
});

test("APKG reimport merges fields independently and marks two-sided conflicts", async () => {
  const fixtureOptions = {
    fields: [{ name: "Frage" }, { name: "Antwort" }, { name: "Quelle" }],
    templates: [{ name: "Karte", ord: 0, qfmt: "{{Frage}}", afmt: "{{FrontSide}}<hr>{{Antwort}}<small>{{Quelle}}</small>" }],
  };
  const first = await commitParsed(parsedApkgFixture({ ...fixtureOptions, noteFields: "Importfrage\u001fImportantwort\u001fQuelle 1" }), { existingDecks: [] });
  const imported = first.deck.cards[0];
  const definition = first.commitGraph.noteTypeDefinitions.find((candidate: any) => candidate.id === imported.noteTypeDefinitionId);
  const locallyEdited = saveLearningItemDocumentValues({
    previous: imported,
    definition,
    fields: imported.contentDocument.fields.map((field: { id: string; name: string; value: string }) => ({
      id: field.id,
      value: field.name === "Frage" ? "Lokale Frage" : field.value,
    })),
  }).item;
  const localDeck = { ...first.deck, cards: [locallyEdited] };

  const externallyChanged = await commitParsed(
    parsedApkgFixture({ ...fixtureOptions, noteFields: "Importfrage\u001fNeue Importantwort\u001fQuelle 1" }),
    { existingDecks: [localDeck] },
  );
  const mergedFields = Object.fromEntries(externallyChanged.deck.cards[0].contentDocument.fields.map((field: any) => [field.name, field.value]));
  assert.equal(mergedFields.Frage, "Lokale Frage");
  assert.equal(mergedFields.Antwort, "Neue Importantwort");
  assert.deepEqual(externallyChanged.deck.cards[0].meta.reimportConflicts, []);

  const conflicting = await commitParsed(
    parsedApkgFixture({ ...fixtureOptions, noteFields: "Externe Frage\u001fImportantwort\u001fQuelle 1" }),
    { existingDecks: [localDeck] },
  );
  const conflictFields = Object.fromEntries(conflicting.deck.cards[0].contentDocument.fields.map((field: any) => [field.name, field.value]));
  assert.equal(conflictFields.Frage, "Lokale Frage");
  assert.equal(conflicting.deck.cards[0].meta.reimportConflicts[0].fieldName, "Frage");
  assert.equal(conflicting.deck.cards[0].meta.reimportConflictDefault, "local");
});

test("commitImport preserves structured multiple-choice edits across reimport", async () => {
  const importedBeforeEdit = createLearningItemFromEditorValue("", {
    cardType: "multiple-choice",
    question: "Importfrage",
    options: ["A", "B"],
    correctOptionIndex: 0,
    explanation: "Import-Erklärung",
    tags: ["import"],
  }, {
    id: "card_existing_mc",
    sourceType: "anki_import",
    sourceRefId: "note_mc",
  });
  const locallyEdited = saveCardEditorValue(importedBeforeEdit, {
    cardType: "multiple-choice",
    question: "Lokale Frage",
    options: ["Lokal A", "Lokal B", "Lokal C"],
    correctOptionIndex: 2,
    explanation: "Lokale Erklärung",
    tags: ["lokal"],
  });
  const incomingCard = createLearningItemFromEditorValue("", {
    cardType: "multiple-choice",
    question: "Neue Importfrage",
    options: ["Neu A", "Neu B"],
    correctOptionIndex: 1,
    explanation: "Neue Import-Erklärung",
    tags: ["neu-importiert"],
  }, {
    id: "card_incoming_mc",
    sourceType: "anki_import",
    sourceRefId: "note_mc",
    mediaRefs: ["neu.png"],
  });
  const existingDeck = createReimportDeck(locallyEdited, { existing: true, withImportMeta: true });
  const incomingDeck = createReimportDeck(incomingCard, { withImportMeta: true });

  const merged = mergeImportedDeck(incomingDeck, [existingDeck]);

  assert.deepEqual(getCardEditorValue(merged.cards[0]), {
    cardType: "multiple-choice",
    question: "Lokale Frage",
    options: ["Lokal A", "Lokal B", "Lokal C"],
    correctOptionIndex: 2,
    explanation: "Lokale Erklärung",
    tags: ["lokal"],
  });
  assert.deepEqual(merged.cards[0].mediaRefs, ["neu.png"]);
  assert.equal(merged.cards[0].meta.preservedLocalContent, true);
});

test("commitImport preserves local marked and suspended state across reimport", async () => {
  const existingBase = createBasicLearningItem("", "Alte Frage", "Alte Antwort", {
      id: "card_existing_state",
      sourceType: "anki_import",
      sourceRefId: "note_state",
    });
  const existingCard = updateLearningItemStudyState(
    { ...existingBase, variants: existingBase.variants.map((variant) => ({ ...variant, meta: { ...variant.meta, ankiCardFlagsRaw: 3 } })) },
    { marked: true, suspended: true },
  );
  const incomingBase = createBasicLearningItem("", "Neue Frage", "Neue Antwort", {
    id: "card_incoming_state",
    sourceType: "anki_import",
    sourceRefId: "note_state",
  });
  const incomingCard = { ...incomingBase, variants: incomingBase.variants.map((variant) => ({ ...variant, meta: { ...variant.meta, ankiCardFlagsRaw: 5 } })) };
  const existingDeck = createReimportDeck(existingCard, { existing: true, withImportMeta: true });
  const incomingDeck = createReimportDeck(incomingCard, { withImportMeta: true });

  const merged = mergeImportedDeck(incomingDeck, [existingDeck]);

  assert.equal(merged.cards[0].status, "suspended");
  assert.equal(merged.cards[0].meta.marked, true);
  assert.equal(merged.cards[0].canonicalQuestion, "Neue Frage");
  assert.equal(merged.cards[0].variants[0].meta.ankiCardFlagsRaw, 5);
});

test("commitImport matches imported variants by stable source id across repeated reimports", async () => {
  const existingBase = createBasicLearningItem("", "Alte Frage", "Alte Antwort", {
    id: "card_existing",
    sourceType: "anki_import",
    sourceRefId: "note_10",
  });
  const existingOriginal = getOriginalVariant(existingBase);
  assert.ok(existingOriginal);
  const existingCard = {
    ...existingBase,
    variants: [
      existingOriginal,
      {
        ...existingOriginal,
        id: "variant_existing_reverse",
        isOriginal: false,
        type: "reverse",
        front: "Alte Antwort",
        back: "Alte Frage",
        anchorVariantId: existingOriginal.id,
        isActive: false,
        qualityStatus: "flagged",
        meta: { ...existingOriginal.meta, sourceVariantExternalId: "anki-card-reverse" },
      },
    ],
  };
  const incomingBase = createBasicLearningItem("", "Neue Frage", "Neue Antwort", {
    id: "card_incoming",
    sourceType: "anki_import",
    sourceRefId: "note_10",
  });
  const incomingOriginal = getOriginalVariant(incomingBase);
  assert.ok(incomingOriginal);
  const incomingCard = {
    ...incomingBase,
    variants: [
      incomingOriginal,
      {
        ...incomingOriginal,
        id: "variant_new_runtime_id",
        isOriginal: false,
        type: "reverse",
        front: "Neue Antwort",
        back: "Neue Frage",
        anchorVariantId: incomingOriginal.id,
        meta: { ...incomingOriginal.meta, sourceVariantExternalId: "anki-card-reverse" },
      },
    ],
  };
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const existingDeck = createReimportDeck(existingCard, { existing: true });
  const incomingDeck = createReimportDeck(incomingCard);

  const firstMerge = mergeImportedDeck(incomingDeck, [existingDeck]);
  const secondMerge = mergeImportedDeck(incomingDeck, [firstMerge]);
  const importedVariants = secondMerge.cards[0].variants.filter((variant: { isOriginal: any; }) => !variant.isOriginal);

  assert.equal(importedVariants.length, 1);
  assert.equal(importedVariants[0].id, "variant_existing_reverse");
  assert.equal(importedVariants[0].front, "Neue Antwort");
  assert.equal(importedVariants[0].isActive, false);
  assert.equal(importedVariants[0].qualityStatus, "flagged");
});

test("commitImport updates untouched originals and preserves local variant state", async () => {
  const existingCard = addRephrasedVariant(
    createBasicLearningItem("", "Alte Importfrage", "Alte Importantwort", {
      id: "card_existing",
      sourceType: "anki_import",
      sourceRefId: "note_10",
    }),
    "Lokale Zusatzfrage",
    "Lokale Zusatzantwort",
    {
      id: "variant_local",
      isActive: false,
      qualityStatus: "flagged",
    },
  );
  const incomingCard = createBasicLearningItem("", "Neue Importfrage", "Neue Importantwort", {
    id: "card_incoming",
    sourceType: "anki_import",
    sourceRefId: "note_10",
  });
  const existingDeck = createReimportDeck(existingCard, { existing: true });
  const incomingDeck = createReimportDeck(incomingCard);

  const merged = mergeImportedDeck(incomingDeck, [existingDeck]);
  const mergedCard = merged.cards[0];
  const localVariant = mergedCard.variants.find((variant: { id: string; }) => variant.id === "variant_local");

  assert.equal(mergedCard.id, "card_existing");
  assert.equal(mergedCard.canonicalQuestion, "Neue Importfrage");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(mergedCard).front, "Neue Importfrage");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(mergedCard).back, "Neue Importantwort");
  assert.equal(localVariant.isActive, false);
  assert.equal(localVariant.qualityStatus, "flagged");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(localVariant.anchorVariantId, getOriginalVariant(mergedCard).id);
});

test("quality APKG fixtures match their manifest and exercise legacy plus latest containers", async () => {
  const manifest = JSON.parse(await readFile(new URL("import-quality.expected.json", APKG_QUALITY_FIXTURE_ROOT), "utf8"));

  for (const name of ["legacy", "latest"] as const) {
    const fixture = await qualityFixtureFile(name);
    const expected = manifest.fixtures[name];
    assert.equal(createHash("sha256").update(fixture.bytes).digest("hex"), expected.sha256);

    const archive = await readZipArchive(fixture);
    assert.ok(archive.getEntry(expected.collectionEntry));
    if (name === "latest") assert.ok(archive.getEntry("meta"));
    if (name === "legacy") {
      const collectionBytes = await archive.getEntry(expected.collectionEntry)!.readBytes();
      assert.match(new TextDecoder().decode(collectionBytes), /nid integer not null, \/\* 1 \*\//);
    }

    const parsed = await parseApkgToNormalizedImport(fixture);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(
      parsed.normalizedDeck.items.map((item: any) => item.metadataJson.ankiImportIdentityV1.guid),
      expected.notes.map((note: any) => note.guid),
    );
    assert.deepEqual(
      parsed.normalizedDeck.metadataJson.mediaManifest.assets.map((asset: any) => ({ name: asset.name, size: asset.size, sha1: asset.sha1 })),
      expected.media,
    );
  }
});

test("quality fixtures expose one lossless notetype config shape for legacy JSON and V18 protobuf", async () => {
  const legacy = await parseApkgToNormalizedImport(await qualityFixtureFile("legacy"));
  const latest = await parseApkgToNormalizedImport(await qualityFixtureFile("latest"));
  const legacyModels = Object.values(legacy.parsedPackage.models) as any[];
  const latestModels = Object.values(latest.parsedPackage.models) as any[];
  const legacyReverse = legacyModels.find((model) => model.name === "CoRe Basic und umgekehrt");
  const latestReverse = latestModels.find((model) => model.name === "CoRe Basic und umgekehrt");
  const latestCloze = latestModels.find((model) => model.name === "CoRe Cloze");

  assert.equal(legacyReverse.config.format, "legacy-json");
  assert.equal(legacyReverse.config.rawBase64, null);
  assert.equal(legacyReverse.tmpls[1].config.questionFormat, "{{Rückseite}}");
  assert.equal(legacyReverse.tmpls[1].config.answerFormat, "{{FrontSide}}<hr>{{Vorderseite}}");

  assert.equal(latestReverse.config.format, "protobuf-v18");
  assert.equal(typeof latestReverse.config.rawBase64, "string");
  assert.ok(latestReverse.config.rawBase64.length > 0);
  assert.match(latestReverse.config.css, /\.card/);
  assert.equal(latestReverse.tmpls[1].qfmt, "{{Rückseite}}");
  assert.equal(latestReverse.tmpls[1].afmt, "{{FrontSide}}<hr>{{Vorderseite}}");
  assert.equal(latestReverse.tmpls[1].config.questionFormat, latestReverse.tmpls[1].qfmt);
  assert.ok(latestReverse.tmpls[1].config.rawBase64.length > 0);
  assert.ok(latestReverse.flds[0].config.rawBase64.length > 0);

  assert.equal(latestCloze.type, 1);
  assert.equal(latestCloze.config.kind, 1);
  assert.equal(latestCloze.tmpls[0].qfmt, "{{cloze:Text}}");
  assert.equal(latestCloze.tmpls[0].afmt, "{{cloze:Text}}<br>{{Extra}}");
});

test("quality fixtures preserve card semantics, custom fields, media and imported original identities", async () => {
  for (const name of ["legacy", "latest"] as const) {
    const previewResult = await createApkgImportPreview(await qualityFixtureFile(name));
    assert.ok(previewResult.preview);
    const preview = previewResult.preview;
    const report = preview.report.apkg;

    assert.equal(report.contractVersion, 1);
    assert.equal(report.packageFormat, name === "latest" ? "latest" : "legacy-2");
    assert.ok(report.decks.some((deck: any) => deck.path === "CoRe APKG Qualität::Sonderformat"));
    assert.deepEqual(report.media.missing, ["missing.png"]);
    assert.equal(report.media.assets[0].sha1, "a2f01b42072ec20f06a59a12f6c692c474768e6e");
    assert.deepEqual(report.notetypes.find((notetype: any) => notetype.classification === "custom")?.unmappedFields, []);

    const byGuid = new Map<string, any>(preview.sampleCards.map((card: any) => [String((card.meta.ankiImportIdentityV1 as any).guid), card]));
    assert.equal(byGuid.get("core-quality-basic-reverse")?.variants.length, 2);
    assert.equal(byGuid.get("core-quality-optional-yes")?.variants.length, 2);
    assert.equal(byGuid.get("core-quality-optional-no")?.variants.length, 1);
    assert.deepEqual(
      byGuid.get("core-quality-cloze")?.variants.map((variant: any) => variant.meta.ankiImportIdentityV1.templateOrdinal),
      [0, 1],
    );
    assert.equal(byGuid.get("core-quality-custom")?.originalFields.length, 3);
    const original = getOriginalVariant(byGuid.get("core-quality-basic-reverse"));
    assert.equal((original?.meta.ankiImportIdentityV1 as any).cardId != null, true);
  }
});

test("GUID and template ordinal keep reimports stable when Anki note and card ids change", async () => {
  const fixture = await qualityFixtureFile("latest");
  const parsed = await parseApkgToNormalizedImport(fixture);
  const first = await commitParsed(parsed.parsedPackage);
  const reverseDeck = first.decks.find((deck: any) => deck.hierarchyPath?.at(-1) === "Reverse");
  assert.ok(reverseDeck);
  const existingCard = reverseDeck.cards[0];
  const existingReverse = existingCard.variants.find((variant: any) => !variant.isOriginal);
  const locallyEditedDeck = {
    ...reverseDeck,
    cards: [{
      ...existingCard,
      canonicalQuestion: "Lokale Frage",
      originalFront: "Lokale Frage",
      versionLog: [...existingCard.versionLog, { id: "local-edit", changeType: "content_updated" }],
      variants: existingCard.variants.map((variant: any) => variant.id === existingReverse.id ? { ...variant, isActive: false, qualityStatus: "flagged" } : variant),
    }],
  };
  const noteIdMap = new Map(parsed.parsedPackage.notes.map((note: any) => [String(note.id), String(Number(note.id) + 100_000)]));
  const shifted = {
    ...parsed.parsedPackage,
    notes: parsed.parsedPackage.notes.map((note: any) => ({ ...note, id: noteIdMap.get(String(note.id)) })),
    cards: parsed.parsedPackage.cards.map((card: any) => ({
    ...card,
    id: String(Number(card.id) + 200_000),
    nid: noteIdMap.get(String(card.nid)),
    })),
  };

  const reimport = await commitParsed(shifted, { existingDecks: first.decks.map((deck: any) => deck.id === reverseDeck.id ? locallyEditedDeck : deck) });
  const mergedReverseDeck = reimport.decks.find((deck: any) => deck.id === reverseDeck.id);
  const mergedCard = mergedReverseDeck.cards[0];
  const mergedReverse = mergedCard.variants.find((variant: any) => variant.meta.ankiImportIdentityV1.templateOrdinal === 1);

  assert.equal(mergedReverseDeck.cards.length, 1);
  assert.equal(mergedCard.id, existingCard.id);
  assert.equal(mergedCard.originalFront, "Lokale Frage");
  assert.equal(mergedReverse.id, existingReverse.id);
  assert.equal(mergedReverse.isActive, false);
  assert.equal(mergedReverse.qualityStatus, "flagged");
  assert.notEqual(mergedReverse.meta.ankiImportIdentityV1.cardId, existingReverse.meta.ankiImportIdentityV1.cardId);
});
