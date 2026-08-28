import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOCAL_APKG_MAX_BYTES } from "./apkgImport.ts";
import { createCoreDeck } from "./coreModel.ts";
import type { TransientSourceDocument } from "./documentModel.ts";
import { createCreationWorkflow, createImportCloudSyncTask } from "./creationWorkflow.ts";

async function worldCapitalsApkgFile() {
  const bytes = await readFile(new URL("../fixtures/apkg/world-capitals.apkg", import.meta.url));
  return {
    name: "world-capitals.apkg",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

const MANUAL_MEDIA_HASH = "0123456789abcdef0123456789abcdef01234567";

function manualAttachment(originalName: string, size = 1) {
  return {
    sha1: MANUAL_MEDIA_HASH,
    name: MANUAL_MEDIA_HASH,
    originalName,
    size,
    mimeType: "image/png",
    blob: new Blob([new Uint8Array(size)], { type: "image/png" }),
  };
}

function manualMediaStore(deck: ReturnType<typeof createCoreDeck>, attachment: ReturnType<typeof manualAttachment>, events?: string[]) {
  const progress = { completed: 1, total: 1, uploaded: 1, reused: 0, currentName: attachment.name, processedBytes: attachment.size, totalBytes: attachment.size };
  return {
    async cachePreviewMedia() { events?.push("cache"); return { persisted: true, count: 1, errors: [] }; },
    syncImportMedia(_decks: unknown[], options: any) {
      events?.push("upload");
      options.onProgress?.({ ...progress, completed: 0, processedBytes: Math.floor(attachment.size / 2) });
      return { result: Promise.resolve({ status: "cloud-ready", message: "Synchronisiert.", progress, referencesByDeck: new Map([[deck.id, [{ id: "media-ref" }]]]) }) };
    },
  } as any;
}

function referenceCloudTask(status: "cloud-ready" | "local-pending", onRetry: () => void) {
  return {
    status: "local-pending",
    ready: new Promise<void>(() => undefined),
    async retry() { onRetry(); return { status, message: status === "cloud-ready" ? "Synchronisiert." : "Lokal gespeichert." }; },
    subscribe() { return () => undefined; },
  } as any;
}

test("creation workflow uses source text only transiently", () => {
  const workflow = createCreationWorkflow();
  const document: TransientSourceDocument = { id: "transient", fileName: "quelle.txt", mimeType: "text/plain", text: "ATP ist ein Energieträger.", textExtractionStatus: "success", metadata: {} };
  const selection = workflow.captureManualSelection({ activeField: "back", front: "Was ist ATP?", document, documentText: document.text, selectedText: document.text });
  const deck = workflow.createManualDeck({ deckName: "Manuell", front: selection.front, back: selection.back, document, documentText: document.text, selection: selection.selection, activeField: "back" });

  assert.equal("sourceDocuments" in deck, false);
  assert.equal("sourceAnchors" in deck.cards[0], false);
  assert.match(deck.cards[0].originalBack, /ATP ist ein Energieträger/);
});

test("creation workflow keeps inline images at their field positions and derives referenced media", async () => {
  const workflow = createCreationWorkflow();
  const frontFile = Object.assign(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { name: "vorne.png" });
  const backFile = Object.assign(new Blob([new Uint8Array([4, 5, 6])], { type: "image/jpeg" }), { name: "hinten.jpg" });
  const unusedFile = Object.assign(new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" }), { name: "entfernt.png" });
  const frontImage = await workflow.prepareManualImage(frontFile);
  const backImage = await workflow.prepareManualImage(backFile);
  const unusedImage = await workflow.prepareManualImage(unusedFile);
  const deck = workflow.createManualDeck({
    deckName: "Bilder",
    cardType: "basic-with-images",
    front: `<p>Vor dem Bild <img src="${frontImage.sha1}" alt="vorne.png"> danach</p>`,
    back: `<p><img src="${backImage.sha1}" alt="hinten.jpg"> Rückseitentext</p>`,
    mediaAttachments: [frontImage, backImage, unusedImage, frontImage],
    additionalFields: [{ id: "hint", name: "Hinweis", value: `<p>Noch einmal <img src="${frontImage.sha1}" alt="vorne.png"></p>`, placement: "both" }],
  });
  const card = deck.cards[0];

  assert.equal(card.cardType, "basic");
  assert.deepEqual(card.mediaRefs, [frontImage.sha1, backImage.sha1]);
  assert.match(card.originalFront, new RegExp(`Vor dem Bild <img src="${frontImage.sha1}" alt="vorne.png" ?/?> danach`));
  assert.match(card.originalBack, new RegExp(`<img src="${backImage.sha1}" alt="hinten.jpg" ?/?> Rückseitentext`));
  assert.deepEqual(workflow.getReferencedManualImages({
    front: card.originalFront,
    back: card.originalBack,
    mediaAttachments: [frontImage, backImage, unusedImage],
  }).map((image) => image.sha1), [frontImage.sha1, backImage.sha1]);
  assert.equal(card.mediaRefs.includes(unusedImage.sha1), false);
});

test("creation workflow rejects an inline image whose prepared bytes are missing", async () => {
  const workflow = createCreationWorkflow();
  const missingReference = "a".repeat(40);

  assert.throws(
    () => workflow.getReferencedManualImages({ front: `<p><img src="${missingReference}"></p>`, mediaAttachments: [] }),
    /nicht mehr verfügbar/,
  );
});

test("creation workflow rejects non-image clipboard content", async () => {
  const workflow = createCreationWorkflow();
  const textFile = Object.assign(new Blob(["kein Bild"], { type: "text/plain" }), { name: "notiz.txt" });

  await assert.rejects(() => workflow.prepareManualImage(textFile), /Bilddatei/);
});

test("manuelle Rasterbilder werden orientierungsabhängig auf Full HD verkleinert", async () => {
  const createBitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  let dimensions = { width: 4_032, height: 3_024 };
  let bitmapCalls = 0;
  let closedBitmaps = 0;
  const draws: Array<{ width: number; height: number }> = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage(_bitmap: unknown, _x: number, _y: number, width: number, height: number) { draws.push({ width, height }); },
      };
    },
    toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number) {
      assert.equal(quality, 0.9);
      callback(new Blob([new Uint8Array(128)], { type: type || "image/png" }));
    },
  };
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => {
      bitmapCalls += 1;
      return { ...dimensions, close() { closedBitmaps += 1; } };
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });

  try {
    const workflow = createCreationWorkflow();
    const landscape = Object.assign(new Blob([new Uint8Array(2_048)], { type: "image/jpeg" }), { name: "landschaft.jpg" });
    const scaledLandscape = await workflow.prepareManualImage(landscape);
    assert.deepEqual(draws.at(-1), { width: 1_440, height: 1_080 });
    assert.equal(scaledLandscape.size, 128);
    assert.equal(scaledLandscape.mimeType, "image/jpeg");
    assert.equal(scaledLandscape.originalName, "landschaft.jpg");

    dimensions = { width: 3_024, height: 4_032 };
    await workflow.prepareManualImage(Object.assign(new Blob([new Uint8Array(2_048)], { type: "image/png" }), { name: "hochformat.png" }));
    assert.deepEqual(draws.at(-1), { width: 1_080, height: 1_440 });

    dimensions = { width: 800, height: 600 };
    const small = Object.assign(new Blob([new Uint8Array(64)], { type: "image/png" }), { name: "klein.png" });
    assert.equal((await workflow.prepareManualImage(small)).blob, small);
    const bitmapCallsBeforeGif = bitmapCalls;
    const gif = Object.assign(new Blob([new Uint8Array(64)], { type: "image/gif" }), { name: "animiert.gif" });
    assert.equal((await workflow.prepareManualImage(gif)).blob, gif);
    assert.equal(bitmapCalls, bitmapCallsBeforeGif);
    assert.equal(closedBitmaps, 3);
  } finally {
    if (createBitmapDescriptor) Object.defineProperty(globalThis, "createImageBitmap", createBitmapDescriptor);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("manuelle Medien folgen Cache, lokaler Karte, Upload und Referenzpersistenz", async () => {
  const attachment = manualAttachment("großes-bild.png", 4);
  const deck = createCoreDeck({ id: "manual-deck", name: "Manuell", source: "manual", cards: [] });
  const events: string[] = [];
  const visibleNames: string[] = [];
  const workflow = createCreationWorkflow({
    mediaStore: manualMediaStore(deck, attachment, events),
    async persistImportedDecks(decks) {
      events.push("references");
      return { decks, cloudTask: referenceCloudTask("cloud-ready", () => events.push("reference-cloud")) };
    },
  });

  const prepared = await workflow.prepareManualMedia(deck, [attachment]);
  events.push("local-card");
  const result = await workflow.syncManualMedia(deck, prepared, { onProgress: (progress) => visibleNames.push(progress.currentName) });

  assert.deepEqual(events, ["cache", "local-card", "upload", "references", "reference-cloud"]);
  assert.equal(visibleNames[0], "großes-bild.png");
  assert.equal(result.status, "cloud-ready");
});

test("manuelle Medien lösen bei local-pending über den aktuellen Retry-Versuch auf", { timeout: 1_000 }, async () => {
  const attachment = manualAttachment("offline.png");
  const deck = createCoreDeck({ id: "pending-deck", name: "Pending", source: "manual", cards: [] });
  let retryCalls = 0;
  const workflow = createCreationWorkflow({
    mediaStore: manualMediaStore(deck, attachment),
    async persistImportedDecks(decks) { return { decks, cloudTask: referenceCloudTask("local-pending", () => { retryCalls += 1; }) }; },
  });

  const prepared = await workflow.prepareManualMedia(deck, [attachment]);
  const result = await workflow.syncManualMedia(deck, prepared);

  assert.equal(retryCalls, 1);
  assert.equal(result.status, "local-pending");
  assert.equal(result.message, "Lokal gespeichert.");
});

test("manuelle Medienvorbereitung meldet Quota-Fehler vor jedem Upload", async () => {
  let uploadCalls = 0;
  const deck = createCoreDeck({ id: "quota-deck", name: "Quota", source: "manual", cards: [] });
  const workflow = createCreationWorkflow({
    mediaStore: {
      async cachePreviewMedia() { throw new Error("Browser-Speicher ist voll."); },
      syncImportMedia() { uploadCalls += 1; throw new Error("Upload darf nicht starten."); },
    } as any,
  });

  await assert.rejects(() => workflow.prepareManualMedia(deck, [manualAttachment("quota.png")]), /Browser-Speicher ist voll/);
  assert.equal(uploadCalls, 0);
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
          progress: { completed: 3, total: 3, uploaded: 3, reused: 0, currentName: "", processedBytes: 3, totalBytes: 3 },
          result: Promise.resolve({
            status: "cloud-ready",
            message: "Synchronisiert.",
            failureKind: null,
            progress: { completed: 3, total: 3, uploaded: 3, reused: 0, currentName: "", processedBytes: 3, totalBytes: 3 },
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
