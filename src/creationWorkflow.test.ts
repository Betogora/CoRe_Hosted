import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOCAL_APKG_MAX_BYTES } from "./apkgImport.ts";
import { createCoreDeck, createSourceDocument, getOriginalVariant } from "./coreModel.ts";
import { createCreationWorkflow, createImportCloudSyncTask } from "./creationWorkflow.ts";

async function worldCapitalsApkgFile() {
  const bytes = await readFile(new URL("../fixtures/apkg/world-capitals.apkg", import.meta.url));
  return {
    name: "world-capitals.apkg",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test("creation workflow imports pasted text and tables", () => {
  const workflow = createCreationWorkflow();
  const text = workflow.importPastedDeck({ mode: "text", deckName: "Text", content: "Was ist ATP?\n---\nEin Energieträger.", dryRun: true });
  const table = workflow.importPastedDeck({ mode: "spreadsheet", deckName: "Tabelle", content: "front\tback\nATP\tEnergieträger" });

  assert.equal(text.report.createdLearningItems, 1);
  assert.equal(table.deck.cards.length, 1);
  assert.equal(getOriginalVariant(table.deck.cards[0])?.isOriginal, true);
});

test("creation workflow preserves manual document anchors", () => {
  const workflow = createCreationWorkflow();
  const document = createSourceDocument({ fileName: "quelle.txt", text: "ATP ist ein Energieträger.", textExtractionStatus: "success" });
  const selection = workflow.captureManualSelection({ activeField: "back", front: "Was ist ATP?", document, documentText: document.text, selectedText: document.text });
  const deck = workflow.createManualDeck({ deckName: "Manuell", front: selection.front, back: selection.back, document, documentText: document.text, selection: selection.selection, activeField: "back" });

  assert.equal(deck.sourceDocuments[0].fileName, "quelle.txt");
  assert.equal(deck.cards[0].sourceAnchors[0].targetField, "back");
});

test("creation workflow imports mapped CSV columns into one dynamic field schema", () => {
  const workflow = createCreationWorkflow();
  const result = workflow.importMappedCsvDeck({
    deckName: "Dynamisch",
    records: [{
      sourceLine: 2,
      front: "Was ist ATP?",
      back: "Ein Energieträger.",
      tags: ["biologie"],
      deck: "Biologie::Zelle",
      guid: "note-atp",
      fields: [{ name: "Quelle", value: "Lehrbuch S. 12" }],
    }],
  });

  assert.equal(result.report.errors.length, 0);
  assert.equal(result.deck.cards.length, 1);
  assert.deepEqual(result.deck.cards[0].contentDocument.fields.map((field: { name: string }) => field.name), ["Vorderseite", "Rückseite", "Quelle"]);
  assert.equal(result.deck.cards[0].noteTypeDefinitionId, result.deck.cards[0].contentDocument.definitionVersionId);
  assert.equal(result.deck.cards[0].meta.requestedDeck, "Biologie::Zelle");
});

test("creation workflow treats images as optional media on an ordinary dynamic card", async () => {
  const workflow = createCreationWorkflow();
  const frontFile = Object.assign(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { name: "vorne.png" });
  const backFile = Object.assign(new Blob([new Uint8Array([4, 5, 6])], { type: "image/jpeg" }), { name: "hinten.jpg" });
  const frontImage = await workflow.prepareManualImage(frontFile);
  const backImage = await workflow.prepareManualImage(backFile);
  const deck = workflow.createManualDeck({
    deckName: "Bilder",
    cardType: "basic-with-images",
    front: "Vorderseitentext",
    back: "Rückseitentext",
    frontImage,
    backImage,
  });
  const card = deck.cards[0];

  assert.equal(card.cardType, "basic");
  assert.deepEqual(card.mediaRefs, [frontImage.sha1, backImage.sha1]);
  assert.match(card.originalFront, new RegExp(`<img src="${frontImage.sha1}" alt="Bild zur Vorderseite" ?/?>`));
  assert.match(card.originalBack, new RegExp(`<img src="${backImage.sha1}" alt="Bild zur Rückseite" ?/?>`));
});

test("creation workflow rejects non-image clipboard content", async () => {
  const workflow = createCreationWorkflow();
  const textFile = Object.assign(new Blob(["kein Bild"], { type: "text/plain" }), { name: "notiz.txt" });

  await assert.rejects(() => workflow.prepareManualImage(textFile), /Bilddatei/);
});

test("creation workflow rejects broken APKG files with a file-selection error", async () => {
  const result = await createCreationWorkflow().parseApkgFile({ name: "broken.apkg", size: 12 });

  assert.equal(result.preview, null);
  assert.equal(result.job.status, "error");
  assert.equal(result.job.fileName, "broken.apkg");
});

test("creation workflow rejects APKG files above 250 MB without a network job", async () => {
  assert.equal(LOCAL_APKG_MAX_BYTES, 250_000_000);
  const boundaryResult = await createCreationWorkflow().parseApkgFile({ name: "boundary.apkg", size: LOCAL_APKG_MAX_BYTES });
  assert.doesNotMatch(boundaryResult.job.errors[0], /größer als 250 MB/);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("Netzwerkzugriff ist für große APKGs nicht erlaubt.");
  };
  const result = await createCreationWorkflow().parseApkgFile({ name: "large.apkg", size: LOCAL_APKG_MAX_BYTES + 1 });
  globalThis.fetch = originalFetch;

  assert.equal(result.preview, null);
  assert.equal(result.job.status, "error");
  assert.equal(requests, 0);
  assert.match(result.job.errors[0], /größer als 250 MB/);
});

test("creation workflow previews and commits a local APKG", async () => {
  const workflow = createCreationWorkflow();
  const parsed = await workflow.parseApkgFile(await worldCapitalsApkgFile());
  const committed = await workflow.commitApkgPreview(parsed.preview);

  assert.equal(parsed.job.status, "preview");
  assert.equal(parsed.preview?.summary.cards.length, 0);
  assert.equal(parsed.preview?.summary.cardCount, 245);
  assert.equal(committed.decks.length, 8);
  assert.equal(committed.report.errors.length, 0);
});

test("creation workflow reports monotonic worker commit progress and completes only after persistence", async () => {
  const parsed = await createCreationWorkflow().parseApkgFile(await worldCapitalsApkgFile());
  assert.ok(parsed.preview);
  const progress: number[] = [];
  let completedBeforePersistence = false;
  const workflow = createCreationWorkflow({
    persistImportedDecks: async (decks, options) => {
      const graph = options?.commitGraph;
      assert.equal(graph?.kind, "worker-import");
      if (!graph || graph.kind !== "worker-import") throw new Error("Worker-Commitgraph erwartet.");
      await graph.streamChunks(async () => {
        completedBeforePersistence ||= progress.includes(100);
      });
      assert.notEqual(progress.at(-1), 100);
      const cloudTask = createImportCloudSyncTask(async () => ({ status: "cloud-ready", message: "Synchronisiert." }));
      void cloudTask.retry();
      return { decks, cloudTask };
    },
  });
  const preview = {
    ...parsed.preview,
    commitGraph: {
      kind: "worker-import" as const,
      deckCount: 1,
      cardCount: 3,
      noteTypeDefinitions: parsed.preview.commitGraph.noteTypeDefinitions,
      deckIdentities: [{ id: parsed.preview.summary.id, originalDeckId: parsed.preview.summary.originalDeckId ?? null }],
      mediaTargets: [],
      async streamChunks(visit: (chunk: unknown) => Promise<void>) {
        await visit({ kind: "cards", values: [{}, {}] });
        await visit({ kind: "cards", values: [{}] });
        await visit({ kind: "outbox" });
      },
      dispose() {},
    },
  };

  await workflow.commitApkgPreview(preview, { onProgress: (percent) => progress.push(percent) });

  assert.equal(completedBeforePersistence, false);
  assert.deepEqual(progress, [...progress].sort((left, right) => left - right));
  assert.ok(progress.includes(80));
  assert.equal(progress.at(-1), 100);
});

test("worker media planning separates used references from object-only manifest files", async () => {
  const hashA = "0123456789abcdef0123456789abcdef01234567";
  const hashB = "123456789abcdef0123456789abcdef012345678";
  const hashC = "23456789abcdef0123456789abcdef0123456789";
  const assets = [
    { sha1: hashA, name: "a.png", size: 1, mimeType: "image/png" },
    { sha1: hashB, name: "b.png", size: 1, mimeType: "image/png" },
    { sha1: hashC, name: "unused.png", size: 1, mimeType: "image/png" },
  ];
  const persistedRoot = createCoreDeck({ id: "persisted-root", name: "Root", source: "anki-apkg", originalDeckId: "anki-root", cards: [] });
  const persistedChild = createCoreDeck({ id: "persisted-child", parentDeckId: persistedRoot.id, name: "Child", source: "anki-apkg", originalDeckId: "anki-child", cards: [] });
  const persistedUnused = createCoreDeck({ id: "persisted-unused", parentDeckId: persistedRoot.id, name: "Unused", source: "anki-apkg", originalDeckId: "anki-unused", cards: [] });
  let mediaInput: any = null;
  const readyTask = () => {
    const task = createImportCloudSyncTask(async () => ({ status: "cloud-ready", message: "Synchronisiert." }));
    void task.retry();
    return task;
  };
  const workflow = createCreationWorkflow({
    mediaStore: {
      syncImportMedia(decks: any[], options: any) {
        mediaInput = { decks, options };
        return {
          queued: Promise.resolve(),
          progress: { completed: 3, total: 3, uploaded: 3, reused: 0, currentName: "" },
          result: Promise.resolve({
            status: "cloud-ready",
            message: "Synchronisiert.",
            failureKind: null,
            progress: { completed: 3, total: 3, uploaded: 3, reused: 0, currentName: "" },
            referencesByDeck: new Map([
              [persistedRoot.id, [{ id: "ref-a", deletedAt: null }]],
              [persistedChild.id, [{ id: "ref-b", deletedAt: null }]],
              [persistedUnused.id, []],
            ]),
          }),
          async pause() {},
          resume() {},
          async cancel() {},
          subscribe() { return () => undefined; },
        };
      },
    } as any,
    async persistImportedDecks(_decks, options) {
      return { decks: [persistedRoot, persistedChild, persistedUnused], cloudTask: readyTask(), mediaOnly: options?.mediaOnly === true } as any;
    },
  });
  const preview: any = {
    summary: { ...persistedRoot, id: "incoming-root", importMeta: { mediaManifest: { assets } } },
    report: { warnings: [], errors: [] },
    mediaFiles: [],
    commitGraph: {
      kind: "worker-import",
      deckCount: 3,
      cardCount: 2,
      noteTypeDefinitions: [],
      deckIdentities: [
        { id: "incoming-root", originalDeckId: "anki-root" },
        { id: "incoming-child", originalDeckId: "anki-child" },
        { id: "incoming-unused", originalDeckId: "anki-unused" },
      ],
      mediaTargets: [
        { deckId: "incoming-root", name: "a.png" },
        { deckId: "incoming-child", name: "b.png" },
      ],
      async streamChunks() {},
      dispose() {},
    },
  };

  const committed = await workflow.commitApkgPreview(preview);
  const mediaResult = await committed.mediaTask!.result;

  assert.equal(mediaResult.status, "cloud-ready");
  assert.deepEqual(mediaInput.decks.map((deck: any) => ({ id: deck.id, names: deck.importMeta.mediaManifest.assets.map((asset: any) => asset.name) })), [
    { id: persistedRoot.id, names: ["a.png"] },
    { id: persistedChild.id, names: ["b.png"] },
    { id: persistedUnused.id, names: [] },
  ]);
  assert.deepEqual(mediaInput.options.objectUploads, { deckId: persistedRoot.id, assets: [assets[2]] });
});

test("import cloud task keeps completion pending across retryable sync results", async () => {
  let attempt = 0;
  const statuses: string[] = [];
  const task = createImportCloudSyncTask(async () => {
    attempt += 1;
    return attempt === 1
      ? { status: "local-pending", message: "Lokal gespeichert." }
      : { status: "cloud-ready", message: "Synchronisiert." };
  });
  task.subscribe((result) => statuses.push(result.status));

  assert.equal((await task.retry()).status, "local-pending");
  let ready = false;
  void task.ready.then(() => { ready = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready, false);

  assert.equal((await task.retry()).status, "cloud-ready");
  await task.ready;
  assert.equal(ready, true);
  assert.deepEqual(statuses, ["syncing", "syncing", "local-pending", "syncing", "cloud-ready"]);
});
