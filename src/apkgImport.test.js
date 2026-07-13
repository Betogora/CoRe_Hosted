import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  commitApkgImport,
  commitImport,
  createApkgImportPreview,
  dryRunApkgImport,
  findReadableCollectionDatabase,
  mapAnkiApkgToNormalizedDeck,
  mapAnkiToCoreDeck,
  parseAnkiMedia,
  parseMediaEntriesBytes,
  parsePackageMetadataBytes,
  validateApkgFile,
} from "./apkgImport.js";
import { addRephrasedVariant, createBasicLearningItem, createCoreDeck, getActiveVariants, getAnswerSideAnchorMiniCard, getOriginalVariant } from "./coreModel.ts";
import { getLearningItemMaturity, getVariantGenerationRecommendation } from "./coreVariantService.ts";
import { answerVariant, getNextReviewItem } from "./reviewService.ts";

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

function parsedApkgFixture({
  decks = [{ id: "1", name: "Fixture Deck" }],
  modelName = "Basic",
  fields = [{ name: "Front" }, { name: "Back" }],
  templates = [{ name: "Card 1", ord: 0 }],
  noteFields = "Front?\u001fBack.",
  noteTags = "tag",
  notes = null,
  cards = [{ id: 20, nid: 10, did: 1, ord: 0 }],
  mediaManifest = null,
} = {}) {
  return {
    file: { name: "fixture.apkg", size: 4096 },
    decks,
    colRows: [
      {
        decks: JSON.stringify(Object.fromEntries(decks.map((deck) => [deck.id, { id: deck.id, name: deck.name }]))),
        models: JSON.stringify({
          99: {
            name: modelName,
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

function createReimportDeck(card, { existing = false, withImportMeta = false } = {}) {
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

test("maps Basic APKG parser output to a normalized import deck", () => {
  const mapped = mapAnkiApkgToNormalizedDeck(parsedApkgFixture({
    noteFields: "What is ATP?\u001fEnergy carrier",
    noteTags: "cell exam",
  }));
  const item = mapped.normalizedDeck.items[0];
  const variant = item.variants[0];

  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.normalizedDeck.title, "Fixture Deck");
  assert.equal(mapped.normalizedDeck.sourceType, "anki_import");
  assert.equal(mapped.normalizedDeck.sourceExternalId, "anki-deck-1");
  assert.equal(item.sourceType, "anki_import");
  assert.equal(item.sourceExternalId, "anki-note-10");
  assert.deepEqual(item.tags, ["cell", "exam"]);
  assert.equal(item.canonicalQuestion, "What is ATP?");
  assert.equal(item.canonicalAnswer, "Energy carrier");
  assert.equal(variant.sourceExternalId, "anki-card-20");
  assert.equal(variant.isOriginal, true);
  assert.equal(variant.anchorToOriginal, false);
  assert.equal(variant.metadataJson.ankiNoteId, undefined);
  assert.equal(item.metadataJson.ankiNoteId, "10");
});

test("maps Basic Reverse notes to one LearningItem with anchored imported variants", async () => {
  const parsed = parsedApkgFixture({
    modelName: "Basic (and reversed card)",
    templates: [
      { name: "Card 1", ord: 0 },
      { name: "Card 2", ord: 1 },
    ],
    noteFields: "ATP\u001fEnergy carrier",
    cards: [
      { id: 20, nid: 10, did: 1, ord: 0 },
      { id: 21, nid: 10, did: 1, ord: 1 },
    ],
  });
  const mapped = mapAnkiApkgToNormalizedDeck(parsed);
  const item = mapped.normalizedDeck.items[0];
  const reverseVariant = item.variants.find((variant) => variant.variantType === "reverse");
  const committed = await commitApkgImport(parsed, { existingDecks: [] });
  const imported = committed.deck.cards[0];
  const original = getOriginalVariant(imported);
  const importedReverse = getActiveVariants(imported).find((variant) => variant.variantType === "reverse");
  const reviewed = answerVariant(committed.deck, imported.id, importedReverse.id, "good", {
    now: "2026-07-07T10:00:00.000Z",
  });

  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.normalizedDeck.items.length, 1);
  assert.equal(item.variants.filter((variant) => variant.isOriginal).length, 1);
  assert.ok(reverseVariant);
  assert.equal(reverseVariant.front, "Energy carrier");
  assert.equal(reverseVariant.back, "ATP");
  assert.equal(reverseVariant.isOriginal, false);
  assert.equal(reverseVariant.anchorToOriginal, true);
  assert.equal(committed.deck.source, "anki-apkg");
  assert.equal(committed.deck.cards.length, 1);
  assert.equal(imported.reviewState.schedulerVersion, "fsrs_v1");
  assert.equal(imported.reviewState.state, "new");
  assert.equal(getLearningItemMaturity(imported).stage, "new");
  assert.equal(getVariantGenerationRecommendation(imported).shouldSuggest, false);
  assert.equal(imported.variants.filter((variant) => variant.isOriginal).length, 1);
  assert.equal(importedReverse.anchorVariantId, original.id);
  assert.equal(importedReverse.parentVariantId, original.id);
  assert.equal(getAnswerSideAnchorMiniCard(imported, importedReverse).shouldShow, true);
  assert.equal(getNextReviewItem(committed.deck).learningItemId, imported.id);
  assert.equal(getNextReviewItem(committed.deck).ratingButtonOptions.good.intervalLabel, "15 Min.");
  assert.equal(reviewed.deck.cards[0].reviewState.reps, 1);
  assert.equal(reviewed.deck.reviewEvents.length, 1);
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
  const committed = await commitApkgImport(parsed, { existingDecks: [] });
  const root = committed.decks.find((deck) => deck.name === "Medizin");
  const anatomy = committed.decks.find((deck) => deck.name === "Anatomie");
  const physio = committed.decks.find((deck) => deck.name === "Physio");

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
  assert.equal(committed.rootDeckIds[0], root.id);
  assert.equal(committed.importGroupId.startsWith("apkg_import_"), true);
  assert.equal(committed.decks.every((deck) => deck.importMeta.mediaManifest.assets.length === 1), true);
});

test("committed APKG fixture imports the world capitals hierarchy", async () => {
  const committed = await commitApkgImport(await worldCapitalsApkgFile(), { existingDecks: [] });
  const root = committed.decks.find((deck) => deck.name === "Welt-Hauptstädte");
  const byName = new Map(committed.decks.map((deck) => [deck.name, deck]));
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
  assert.equal(committed.decks.reduce((sum, deck) => sum + deck.cards.length, 0), 245);
  assert.ok(root);
  assert.equal(root.parentDeckId, null);
  assert.equal(root.cards.length, 0);
  for (const [name, count] of Object.entries(expectedCounts)) {
    const deck = byName.get(name);
    assert.ok(deck, name);
    assert.equal(deck.parentDeckId, root.id);
    assert.deepEqual(deck.hierarchyPath, ["Welt-Hauptstädte", name]);
    assert.equal(deck.cards.length, count);
  }
});

test("APKG preview uses the normalized Learning Item path", async () => {
  const result = await createApkgImportPreview(await worldCapitalsApkgFile());
  const preview = result.preview;

  assert.equal(result.job.status, "preview");
  assert.equal(preview.deck.cards.length, 245);
  assert.equal(preview.sampleCards.length, 5);
  assert.equal(preview.importReport.apkg.detectedCards, 245);
  assert.equal(preview.deck.importMeta.deckHierarchy.length, 8);
  assert.equal(preview.deck.cards.every((item) => item.variants.filter((variant) => variant.isOriginal).length === 1), true);
  assert.equal(getOriginalVariant(preview.deck.cards[0]).front, preview.deck.cards[0].canonicalQuestion);
});

test("imports Cloze parser output as cloze content with a warning instead of crashing", async () => {
  const parsed = parsedApkgFixture({
    modelName: "Cloze",
    fields: [{ name: "Text" }, { name: "Extra" }],
    noteFields: "{{c1::ATP}} liefert Energie.\u001fExtra: Zellstoffwechsel",
  });
  const mapped = mapAnkiApkgToNormalizedDeck(parsed);
  const committed = await commitApkgImport(parsed, { existingDecks: [] });
  const imported = committed.deck.cards[0];

  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.normalizedDeck.items[0].variants[0].variantType, "cloze");
  assert.equal(mapped.warnings.some((warning) => warning.includes("Cloze")), true);
  assert.equal(imported.kind, "cloze");
  assert.equal(getOriginalVariant(imported).variantType, "cloze");
});

test("APKG dry run reports scheduling and media without mutating or importing Anki progress", async () => {
  const parsed = parsedApkgFixture({
    noteFields: "Cell image?<br><img src=\"cell.png\">\u001fA cell.",
    cards: [{ id: 20, nid: 10, did: 1, ord: 0, reps: 4, lapses: 1, ivl: 12, type: 2, queue: 2 }],
    mediaManifest: {
      format: "legacy-json",
      assets: [{ name: "cell.png", sha1: "abc123", size: 4, mimeType: "image/png", zipEntryName: "0" }],
      missingAssets: [{ name: "missing.png" }],
    },
  });
  const dryRun = await dryRunApkgImport(parsed, { existingDecks: [] });
  const committed = await commitApkgImport(parsed, { existingDecks: [] });
  const imported = committed.deck.cards[0];

  assert.equal(dryRun.deck, null);
  assert.equal(dryRun.report.dryRun, true);
  assert.equal(dryRun.report.apkg.detectedNotes, 1);
  assert.equal(dryRun.report.apkg.detectedCards, 1);
  assert.equal(dryRun.report.apkg.detectedVariants, 1);
  assert.equal(dryRun.report.hasAnkiScheduling, true);
  assert.equal(dryRun.report.schedulingImported, false);
  assert.equal(dryRun.report.mediaCount, 1);
  assert.equal(dryRun.report.missingMediaCount, 1);
  assert.equal(dryRun.report.warnings.some((warning) => warning.includes("Anki-Lernfortschritt")), true);
  assert.equal(committed.deck.importMeta.mediaManifest.assets.length, 1);
  assert.deepEqual(imported.mediaRefs, ["cell.png"]);
  assert.equal(imported.reviewState.schedulerVersion, "fsrs_v1");
  assert.equal(imported.reviewState.state, "new");
  assert.equal(imported.reviewState.reps, 0);
  assert.equal(imported.reviewState.lapses, 0);
  assert.equal(imported.reviewState.sourceSchedulerData, null);
  assert.equal(committed.deck.reviewEvents.length, 0);
});

test("APKG duplicate detection uses Anki note source ids and merge strategies", async () => {
  const parsed = parsedApkgFixture({
    noteFields: "Duplicate?\u001fSame note.",
  });
  const committed = await commitApkgImport(parsed, { existingDecks: [] });
  const skipped = await commitApkgImport(parsed, {
    existingDecks: [committed.deck],
    mergeStrategy: "skip_duplicates",
  });
  const createNew = await commitApkgImport(parsed, {
    existingDecks: [committed.deck],
    mergeStrategy: "create_new",
  });
  const updateExisting = await commitApkgImport(parsed, {
    existingDecks: [committed.deck],
    mergeStrategy: "update_existing",
  });

  assert.equal(skipped.report.duplicates.length, 1);
  assert.equal(skipped.report.skipped.length, 1);
  assert.equal(skipped.deck.cards.length, 0);
  assert.equal(createNew.report.warnings.some((warning) => warning.includes("mögliche Dublette")), true);
  assert.equal(createNew.deck.cards.length, 1);
  assert.equal(updateExisting.deck.cards.length, 0);
  assert.equal(updateExisting.report.warnings.some((warning) => warning.includes("update_existing")), true);
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
  const existingDeck = createReimportDeck(existingCard, { existing: true, withImportMeta: true });
  const incomingDeck = createReimportDeck(incomingCard, { withImportMeta: true });

  const merged = await commitImport({ deck: incomingDeck }, { existingDecks: [existingDeck] });

  assert.equal(merged.id, "deck_existing");
  assert.equal(merged.cards[0].id, "card_existing");
  assert.equal(merged.cards[0].originalFront, "Lokale Frage");
  assert.equal(merged.cards[0].canonicalQuestion, "Lokale Frage");
  assert.equal(getOriginalVariant(merged.cards[0]).front, "Lokale Frage");
  assert.equal(getOriginalVariant(merged.cards[0]).back, "Lokale Antwort");
  assert.deepEqual(merged.cards[0].mediaRefs, ["cell.png"]);
  assert.equal(merged.importMeta.replacedDeckId, "deck_existing");
});

test("commitImport matches imported variants by stable source id across repeated reimports", async () => {
  const existingBase = createBasicLearningItem("", "Alte Frage", "Alte Antwort", {
    id: "card_existing",
    sourceType: "anki_import",
    sourceRefId: "note_10",
  });
  const existingOriginal = getOriginalVariant(existingBase);
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
  const existingDeck = createReimportDeck(existingCard, { existing: true });
  const incomingDeck = createReimportDeck(incomingCard);

  const firstMerge = await commitImport({ deck: incomingDeck }, { existingDecks: [existingDeck] });
  const secondMerge = await commitImport({ deck: incomingDeck }, { existingDecks: [firstMerge] });
  const importedVariants = secondMerge.cards[0].variants.filter((variant) => !variant.isOriginal);

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

  const merged = await commitImport({ deck: incomingDeck }, { existingDecks: [existingDeck] });
  const mergedCard = merged.cards[0];
  const localVariant = mergedCard.variants.find((variant) => variant.id === "variant_local");

  assert.equal(mergedCard.id, "card_existing");
  assert.equal(mergedCard.canonicalQuestion, "Neue Importfrage");
  assert.equal(getOriginalVariant(mergedCard).front, "Neue Importfrage");
  assert.equal(getOriginalVariant(mergedCard).back, "Neue Importantwort");
  assert.equal(localVariant.isActive, false);
  assert.equal(localVariant.qualityStatus, "flagged");
  assert.equal(localVariant.anchorVariantId, getOriginalVariant(mergedCard).id);
});
