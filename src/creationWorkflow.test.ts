import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ANKI_PACKAGE_MAX_BYTES, type ImportCommitGraph, type ImportGraphChunk } from "./apkgImport.ts";
import { createCoreDeck } from "./coreModel.ts";
import { createCreationWorkflow, createImportCloudSyncTask, type CommitImport, type ImportedDeckPersistence } from "./creationWorkflow.ts";
import type { MediaSyncProgress, MediaSyncTask } from "./mediaStore.ts";

type WorkflowMediaStore = NonNullable<Parameters<typeof createCreationWorkflow>[0]>["mediaStore"];

async function fixtureFile(path: string): Promise<File> {
  const bytes = await readFile(new URL(`../fixtures/apkg/${path}`, import.meta.url));
  return new File([bytes], path.split("/").at(-1)!);
}

const MANUAL_MEDIA_HASH = "0123456789abcdef0123456789abcdef01234567";

function manualAttachment(originalName: string, size = 1, sha1 = MANUAL_MEDIA_HASH) {
  return {
    sha1,
    name: sha1,
    originalName,
    size,
    mimeType: "image/png",
    blob: new Blob([new Uint8Array(size)], { type: "image/png" }),
  };
}

const EMPTY_PROGRESS: MediaSyncProgress = { completed: 0, total: 0, uploaded: 0, reused: 0, currentName: "", processedBytes: 0, totalBytes: 0 };

function mediaTask(overrides: Partial<MediaSyncTask> = {}): MediaSyncTask {
  return {
    queued: Promise.resolve(),
    result: Promise.resolve({ status: "cloud-ready", message: "Synchronisiert.", progress: EMPTY_PROGRESS }),
    progress: EMPTY_PROGRESS,
    async pause() {},
    resume() {},
    async cancel() {},
    subscribe() { return () => undefined; },
    ...overrides,
  };
}

function fakeMediaStore(store: Record<string, unknown>): WorkflowMediaStore {
  return store as unknown as WorkflowMediaStore;
}

function readyCloudTask() {
  const task = createImportCloudSyncTask(async () => ({ status: "cloud-ready", message: "Synchronisiert." }));
  void task.retry();
  return task;
}

function persistence(overrides: Partial<ImportedDeckPersistence> = {}): ImportedDeckPersistence {
  return { decks: [], rootDeck: null, createdCount: 0, keptLocalEdits: 0, missingInPackage: 0, cloudTask: readyCloudTask(), ...overrides };
}

function fakeCommitGraph(chunks: ImportGraphChunk[], cardCount: number): ImportCommitGraph {
  return {
    deckCount: 1,
    noteCount: 0,
    cardCount,
    reviewEventCount: 0,
    mediaCount: 0,
    ankiGuids: [],
    async streamChunks(visit) {
      for (const chunk of chunks) await visit(chunk);
    },
    dispose() {},
  };
}

test("Quelltext wird nur flüchtig in das aktive Feld übernommen", () => {
  const workflow = createCreationWorkflow();
  const selection = workflow.captureManualSelection({ activeField: "back", front: "Was ist ATP?", back: "", selectedText: "  ATP ist ein Energieträger.  " });

  assert.equal(selection.changed, true);
  assert.equal(selection.selection, "ATP ist ein Energieträger.");
  assert.equal(selection.front, "Was ist ATP?");
  assert.match(selection.back, /ATP ist ein Energieträger/);
  const validation = workflow.validateManualCard({ front: selection.front, back: selection.back });
  assert.equal(validation.ok, true);
  assert.match(validation.content!.fields.find((field) => field.id === "back")!.html, /ATP ist ein Energieträger/);
  assert.equal(JSON.stringify(validation.content).includes("sourceDocument"), false);

  const unchanged = workflow.captureManualSelection({ front: "Frage", back: "Antwort", selectedText: "   " });
  assert.deepEqual(unchanged, { changed: false, front: "Frage", back: "Antwort", selection: "" });
  assert.match(workflow.captureManualSelection({ front: "Frage", selectedText: "Zitat" }).front, /Frage[\s\S]*Zitat/);
});

test("eine Quelldatei wird als flüchtiges Textdokument gelesen", async () => {
  const workflow = createCreationWorkflow();
  const document = await workflow.readSourceDocument(new File(["ATP ist ein Energieträger."], "quelle.txt", { type: "text/plain" }));

  assert.equal(document.fileName, "quelle.txt");
  assert.equal(document.text, "ATP ist ein Energieträger.");
  assert.equal(document.textExtractionStatus, "success");
  assert.equal(workflow.readableSourceDocumentLabel, "PDF, Text, Markdown, CSV oder TSV");
});

test("manuelle Validierung meldet die deutschen Feldfehler und erzeugt sonst geprüften Inhalt", () => {
  const workflow = createCreationWorkflow();

  assert.deepEqual(workflow.validateManualCard({ front: "", back: "<p></p>" }), {
    ok: false,
    content: null,
    media: null,
    errors: { front: "Bitte eine Vorderseite eingeben.", back: "Bitte eine Rückseite eingeben." },
  });
  assert.deepEqual(workflow.validateManualCard({ kind: "cloze", front: "Kein Lückentext" }).errors, { front: "Bitte gültige Lücken wie {{c1::Begriff}} verwenden." });
  assert.deepEqual(workflow.validateManualCard({ kind: "single-choice", front: "Welche?", answerOptions: ["A", "B"], correctOptionIndices: [] }).errors, {
    correctOptions: "Bitte genau eine gültige richtige Antwort auswählen.",
  });

  const valid = workflow.validateManualCard({ kind: "basic-reversed", front: "Hund", back: "dog", tags: ["Englisch", "englisch", " Tiere "] });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, {});
  assert.deepEqual(valid.media, {});
  assert.equal(valid.content!.interaction.kind, "reveal");
  assert.deepEqual(valid.content!.interaction.kind === "reveal" && valid.content!.interaction.prompts.map((prompt) => prompt.key), ["forward", "reverse"]);
});

test("Inline-Bilder bleiben an ihrer Feldposition und nur referenzierte Medien werden übernommen", async () => {
  const workflow = createCreationWorkflow();
  const frontFile = Object.assign(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { name: "vorne.png" });
  const backFile = Object.assign(new Blob([new Uint8Array([4, 5, 6])], { type: "image/jpeg" }), { name: "hinten.jpg" });
  const unusedFile = Object.assign(new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" }), { name: "entfernt.png" });
  const frontImage = await workflow.prepareManualImage(frontFile);
  const backImage = await workflow.prepareManualImage(backFile);
  const unusedImage = await workflow.prepareManualImage(unusedFile);

  assert.equal(frontImage.sha1, createHash("sha1").update(new Uint8Array([1, 2, 3])).digest("hex"));
  assert.equal(frontImage.name, frontImage.sha1);
  assert.equal(frontImage.originalName, "vorne.png");
  assert.equal(backImage.mimeType, "image/jpeg");

  const input = {
    front: `<p>Vor dem Bild <img src="${frontImage.sha1}" alt="vorne.png"> danach</p>`,
    back: `<p><img src="${backImage.sha1}" alt="hinten.jpg"> Rückseitentext</p>`,
    mediaAttachments: [frontImage, backImage, unusedImage, frontImage],
    additionalFields: [{ id: "hint", name: "Hinweis", value: `<p>Noch einmal <img src="${frontImage.sha1.toUpperCase()}" alt="vorne.png"></p>`, placement: "both" as const }],
  };
  const validation = workflow.validateManualCard(input);
  assert.equal(validation.ok, true);
  const fields = validation.content!.fields;

  assert.match(fields.find((field) => field.id === "front")!.html, new RegExp(`Vor dem Bild <img src="${frontImage.sha1}" alt="vorne.png" ?/?> danach`));
  assert.match(fields.find((field) => field.id === "back")!.html, new RegExp(`<img src="${backImage.sha1}" alt="hinten.jpg" ?/?> Rückseitentext`));
  assert.deepEqual(validation.media, { [frontImage.sha1]: frontImage.sha1, [backImage.sha1]: backImage.sha1 });
  assert.deepEqual(workflow.getManualImageReferences(input), [frontImage.sha1, backImage.sha1]);
  assert.deepEqual(workflow.getReferencedManualImages(input).map((image) => image.sha1), [frontImage.sha1, backImage.sha1]);
});

test("ein Inline-Bild ohne vorbereitete Bytes wird abgelehnt", () => {
  const workflow = createCreationWorkflow();
  const missingReference = "a".repeat(40);

  assert.throws(
    () => workflow.getReferencedManualImages({ front: `<p><img src="${missingReference}"></p>`, mediaAttachments: [] }),
    { message: "Mindestens ein eingefügtes Bild ist nicht mehr verfügbar. Bitte füge es erneut ein." },
  );
  assert.deepEqual(workflow.getManualImageReferences({ front: '<img src="bild.png"><img src="data:image/png;base64,AA==">' }), []);
});

test("Inhalte aus der Zwischenablage ohne Bild werden abgelehnt", async () => {
  const workflow = createCreationWorkflow();
  const textFile = Object.assign(new Blob(["kein Bild"], { type: "text/plain" }), { name: "notiz.txt" });

  await assert.rejects(() => workflow.prepareManualImage(textFile), { message: "Bitte füge eine Bilddatei ein." });
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

test("manuelle Medien folgen Cache, lokalem Inhalt und Upload der vorbereiteten Bilder", async () => {
  const attachment = manualAttachment("großes-bild.png", 4);
  const events: string[] = [];
  const cached: unknown[] = [];
  const uploads: Array<readonly string[] | undefined> = [];
  const visible: string[] = [];
  const workflow = createCreationWorkflow({
    mediaStore: fakeMediaStore({
      async cacheMedia(files: unknown[]) {
        events.push("cache");
        cached.push(...files);
        return { persisted: true, count: files.length, errors: [] };
      },
      syncQueuedMedia({ sha1s, onProgress }: { sha1s?: readonly string[]; onProgress?: (progress: MediaSyncProgress) => void }) {
        events.push("upload");
        uploads.push(sha1s);
        onProgress?.({ ...EMPTY_PROGRESS, total: 1, currentName: attachment.originalName, totalBytes: attachment.size });
        return mediaTask();
      },
    }),
  });

  const prepared = await workflow.prepareManualMedia([attachment, null, undefined, attachment]);
  events.push("local-note");
  const result = await workflow.syncManualMedia(prepared, { onProgress: (progress) => visible.push(progress.currentName) });

  assert.deepEqual(events, ["cache", "local-note", "upload"]);
  assert.equal(prepared.length, 1);
  assert.deepEqual(cached, [{ sha1: attachment.sha1, name: "großes-bild.png", size: 4, mimeType: "image/png", blob: attachment.blob }]);
  assert.deepEqual(uploads, [[attachment.sha1]]);
  assert.deepEqual(visible, ["großes-bild.png"]);
  assert.deepEqual(result, { status: "cloud-ready", message: "Synchronisiert." });
});

test("manuelle Medien melden einen ausstehenden oder gescheiterten Upload ohne Ausnahme", async () => {
  const attachment = manualAttachment("offline.png");
  const pending = createCreationWorkflow({
    mediaStore: fakeMediaStore({
      syncQueuedMedia: () => mediaTask({ result: Promise.resolve({ status: "local-pending", message: "Lokal gespeichert.", progress: EMPTY_PROGRESS }) }),
    }),
  });
  assert.deepEqual(await pending.syncManualMedia([attachment]), { status: "local-pending", message: "Lokal gespeichert." });

  const failing = createCreationWorkflow({
    mediaStore: fakeMediaStore({ syncQueuedMedia: () => mediaTask({ result: Promise.reject(new Error("Upload abgelehnt.")) }) }),
  });
  assert.deepEqual(await failing.syncManualMedia([attachment]), { status: "blocked", message: "Upload abgelehnt." });

  let uploadCalls = 0;
  const empty = createCreationWorkflow({ mediaStore: fakeMediaStore({ syncQueuedMedia: () => { uploadCalls += 1; return mediaTask(); } }) });
  assert.deepEqual(await empty.syncManualMedia([]), { status: "cloud-ready", message: "" });
  assert.equal(uploadCalls, 0);
});

test("manuelle Medienvorbereitung meldet Speicher- und Datenfehler vor jedem Upload", async () => {
  let uploadCalls = 0;
  const syncQueuedMedia = () => { uploadCalls += 1; throw new Error("Upload darf nicht starten."); };
  const quota = createCreationWorkflow({
    mediaStore: fakeMediaStore({ async cacheMedia() { throw new Error("Browser-Speicher ist voll."); }, syncQueuedMedia }),
  });
  await assert.rejects(() => quota.prepareManualMedia([manualAttachment("quota.png")]), /Browser-Speicher ist voll/);

  const partial = createCreationWorkflow({
    mediaStore: fakeMediaStore({ async cacheMedia() { return { persisted: true, count: 0, errors: [] }; }, syncQueuedMedia }),
  });
  await assert.rejects(() => partial.prepareManualMedia([manualAttachment("teilweise.png")]), { message: "Mindestens ein Bild konnte nicht lokal gespeichert werden." });

  const invalid = createCreationWorkflow({ mediaStore: fakeMediaStore({ syncQueuedMedia }) });
  await assert.rejects(
    () => invalid.prepareManualMedia([{ ...manualAttachment("kaputt.png"), size: 99 }]),
    { message: "Mindestens ein Bild enthält ungültige Dateidaten." },
  );
  assert.deepEqual(await invalid.prepareManualMedia([null, undefined]), []);
  assert.equal(uploadCalls, 0);
});

test("eine beschädigte APKG-Datei endet als sichtbarer Dateifehler", async () => {
  const result = await createCreationWorkflow().parseApkgFile(new File([new Uint8Array(12)], "broken.apkg"));

  assert.equal(result.preview, null);
  assert.equal(result.job.status, "error");
  assert.equal(result.job.fileName, "broken.apkg");
  assert.equal(result.job.fileSize, 12);
  assert.deepEqual(result.job.errors, ["Die APKG-Datei ist als ZIP-Datei abgeschnitten."]);
});

test("APKG-Dateien über 2 GiB werden vor jedem Lesen abgelehnt", async () => {
  assert.equal(ANKI_PACKAGE_MAX_BYTES, 2 * 1024 ** 3);
  let reads = 0;
  const oversized = { name: "gross.apkg", size: ANKI_PACKAGE_MAX_BYTES + 1, arrayBuffer: async () => { reads += 1; return new ArrayBuffer(1); } } as unknown as File;
  const result = await createCreationWorkflow().parseApkgFile(oversized);

  assert.equal(result.preview, null);
  assert.equal(result.job.status, "error");
  assert.deepEqual(result.job.errors, ["Die Anki-Datei ist größer als 2 GiB. Bitte wähle eine kleinere Datei aus."]);
  assert.equal(reads, 0);

  const boundary = { name: "grenze.apkg", size: ANKI_PACKAGE_MAX_BYTES, arrayBuffer: async () => new ArrayBuffer(1) } as unknown as File;
  const boundaryResult = await createCreationWorkflow().parseApkgFile(boundary);
  assert.equal(boundaryResult.job.status, "error");
  assert.doesNotMatch(boundaryResult.job.errors[0], /größer als 2 GiB/);
});

test("eine lokale APKG wird mit Analyse-Schritten in der Vorschau angezeigt und gestreamt übernommen", async () => {
  const steps: string[] = [];
  const chunkKinds: string[] = [];
  let streamedCards = 0;
  const rootDeck = createCoreDeck({ id: "deck-root", name: "Welt-Hauptstädte", source: "anki-apkg" });
  const workflow = createCreationWorkflow({
    async commitImport(graph, { onMedia }) {
      await graph.streamChunks(async (chunk) => {
        chunkKinds.push(chunk.kind);
        if (chunk.kind === "notes") streamedCards += chunk.cards.length;
        if (chunk.kind === "media") await onMedia(chunk.file);
      });
      return persistence({ decks: [rootDeck], rootDeck, createdCount: streamedCards });
    },
  });
  const parsed = await workflow.parseApkgFile(await fixtureFile("world-capitals.apkg"), { onStep: (step) => steps.push(step) });

  assert.equal(parsed.job.status, "preview");
  assert.deepEqual(parsed.job.warnings, []);
  assert.deepEqual(steps, ["validate", "collection", "cards", "translate"]);
  assert.equal(parsed.preview?.rootDeckName, "Welt-Hauptstädte");
  assert.equal(parsed.preview?.commitGraph.cardCount, 245);

  const committed = await workflow.commitApkgPreview(parsed.preview);
  assert.deepEqual(chunkKinds, ["decks", "note-type-sources", "notes"]);
  assert.equal(committed.createdCount, 245);
  assert.equal(committed.rootDeck, rootDeck);
  assert.equal(committed.mediaTask, null);
});

test("der Commit meldet monotonen Fortschritt und endet erst nach der Persistenz", async () => {
  const progress: number[] = [];
  let completedBeforePersistence = false;
  const workflow = createCreationWorkflow({
    async commitImport(graph) {
      await graph.streamChunks(async () => {
        completedBeforePersistence ||= progress.includes(100);
      });
      assert.equal(progress.at(-1), 80);
      return persistence();
    },
  });
  const preview = (await workflow.parseApkgFile(await fixtureFile("world-capitals.apkg"))).preview!;
  const chunks: ImportGraphChunk[] = [
    { kind: "decks", decks: [] },
    { kind: "notes", notes: [], noteSources: [], cards: Array.from({ length: 2 }, () => preview.samples[0].card) },
    { kind: "notes", notes: [], noteSources: [], cards: [preview.samples[1].card] },
    { kind: "reviews", values: [] },
  ];
  preview.commitGraph.dispose();

  await workflow.commitApkgPreview({ ...preview, commitGraph: fakeCommitGraph(chunks, 3) }, { onProgress: (percent) => progress.push(percent) });

  assert.equal(completedBeforePersistence, false);
  assert.deepEqual(progress, [0, 10, 57, 80, 100]);
});

test("ohne Vorschau wird kein Import übernommen", async () => {
  let commits = 0;
  const progress: number[] = [];
  const workflow = createCreationWorkflow({ commitImport: async () => { commits += 1; return persistence(); } });

  await assert.rejects(() => workflow.commitApkgPreview(null, { onProgress: (percent) => progress.push(percent) }), { message: "Keine Anki-Vorschau zum Importieren vorhanden." });
  assert.equal(commits, 0);
  assert.deepEqual(progress, [0]);
});

test("Paketmedien werden lokal gespeichert und erst nach den Cloud-Daten hochgeladen", async () => {
  const cachedNames: string[] = [];
  const cachedBytesMatch: boolean[] = [];
  let syncInput: { sha1s?: readonly string[]; waitUntilReady?: Promise<unknown> } | null = null;
  let queuedAwaited = false;
  const cloudTask = readyCloudTask();
  const task = mediaTask({ queued: Promise.resolve().then(() => { queuedAwaited = true; }) });
  const workflow = createCreationWorkflow({
    mediaStore: fakeMediaStore({
      async cacheMedia(files: Array<{ sha1: string; name: string; bytes: Uint8Array }>) {
        for (const file of files) {
          cachedNames.push(file.name);
          cachedBytesMatch.push(createHash("sha1").update(file.bytes).digest("hex") === file.sha1);
        }
        return { persisted: true, count: files.length, errors: [] };
      },
      syncQueuedMedia(input: { sha1s?: readonly string[]; waitUntilReady?: Promise<unknown> }) {
        syncInput = input;
        return task;
      },
    }),
    async commitImport(graph, { onMedia }) {
      await graph.streamChunks(async (chunk) => {
        if (chunk.kind === "media") await onMedia(chunk.file);
      });
      return persistence({ cloudTask });
    },
  });
  const parsed = await workflow.parseApkgFile(await fixtureFile("matrix/media-latest.apkg"));

  assert.deepEqual(parsed.job.warnings, ["1 referenziertes Medium fehlt im Paket."]);
  const committed = await workflow.commitApkgPreview(parsed.preview);

  assert.deepEqual(cachedNames.sort(), ["a&b.png", "mit leerzeichen.png", "Ä-Bild.png"].sort());
  assert.deepEqual(cachedBytesMatch, [true, true, true]);
  assert.equal(syncInput!.sha1s?.length, 3);
  assert.equal(syncInput!.waitUntilReady, cloudTask.ready);
  assert.equal(queuedAwaited, true);
  assert.equal(committed.mediaTask, task);
});

test("ein nicht lokal speicherbares Paketmedium bricht den Commit sichtbar ab", async () => {
  let uploads = 0;
  const workflow = createCreationWorkflow({
    mediaStore: fakeMediaStore({
      async cacheMedia() { return { persisted: false, count: 0, errors: [] }; },
      syncQueuedMedia() { uploads += 1; return mediaTask(); },
    }),
    async commitImport(graph, { onMedia }) {
      await graph.streamChunks(async (chunk) => {
        if (chunk.kind === "media") await onMedia(chunk.file);
      });
      return persistence();
    },
  });
  const media = { name: "bild.png", sha1: MANUAL_MEDIA_HASH, size: 1, mimeType: "image/png", bytes: new Uint8Array([1]) };
  const preview = (await workflow.parseApkgFile(await fixtureFile("world-capitals.apkg"))).preview!;
  preview.commitGraph.dispose();

  await assert.rejects(
    () => workflow.commitApkgPreview({ ...preview, commitGraph: fakeCommitGraph([{ kind: "media", file: media }], 0) }),
    { message: "Die Mediendatei „bild.png“ konnte nicht lokal gespeichert werden." },
  );
  assert.equal(uploads, 0);
});

test("der Standard-Commit ohne Persistenz liefert eine bereits synchronisierte Cloud-Aufgabe", async () => {
  const commitImport: CommitImport | undefined = undefined;
  const workflow = createCreationWorkflow({ commitImport });
  const preview = (await workflow.parseApkgFile(await fixtureFile("world-capitals.apkg"))).preview!;
  const committed = await workflow.commitApkgPreview(preview);

  assert.equal(committed.rootDeck, null);
  assert.equal(committed.createdCount, 0);
  await committed.cloudTask.ready;
  assert.equal(committed.cloudTask.status, "cloud-ready");
});

test("die Import-Cloud-Aufgabe bleibt bei wiederholbaren Ergebnissen ausstehend", async () => {
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
