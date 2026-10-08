import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApkgImportPreview, type ApkgImportPreview, type ImportGraphChunk } from "./apkgImport.ts";
import { createImportGraphChunks, type ApkgImportGraph } from "./apkgNoteTranslation.ts";

async function fixtureFile(path: string): Promise<File> {
  const bytes = await readFile(new URL(`../fixtures/apkg/${path}`, import.meta.url));
  return new File([bytes], path.split("/").at(-1)!);
}

async function collectChunks(preview: ApkgImportPreview): Promise<ImportGraphChunk[]> {
  const chunks: ImportGraphChunk[] = [];
  await preview.commitGraph.streamChunks(async (chunk) => { chunks.push(chunk); });
  return chunks;
}

function chunksOf<K extends ImportGraphChunk["kind"]>(chunks: ImportGraphChunk[], kind: K) {
  return chunks.filter((chunk): chunk is Extract<ImportGraphChunk, { kind: K }> => chunk.kind === kind);
}

const VALID_DESCRIPTOR = {
  rootDeckName: "Worker",
  report: { errors: [], warnings: [] },
  samples: [],
  sampleMedia: [],
  counts: { deckCount: 1, noteCount: 1, cardCount: 1, reviewEventCount: 0, mediaCount: 0, ankiGuids: ["guid-1"] },
};

type WorkerRequest = { type: string; requestId: string };
type WorkerScript = (worker: FakeWorker, request: WorkerRequest) => void;

class FakeWorker {
  static script: WorkerScript = () => undefined;
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  requests: WorkerRequest[] = [];
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: WorkerRequest) {
    this.requests.push(request);
    queueMicrotask(() => FakeWorker.script(this, request));
  }
  reply(data: unknown) { this.onmessage?.({ data }); }
  terminate() { this.terminated = true; }
}

async function withFakeWorker(script: WorkerScript, run: () => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  FakeWorker.script = script;
  FakeWorker.instances = [];
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
  try {
    await run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
}

const workerFile = () => new File([new Uint8Array(1)], "worker.apkg");

test("die World-Capitals-APKG ergibt eine Vorschau mit Bericht, Beispielen und Commitgraph", async () => {
  const file = await fixtureFile("world-capitals.apkg");
  const steps: string[] = [];
  const preview = await createApkgImportPreview(file, { onStep: (step) => steps.push(step) });

  assert.deepEqual(steps, ["validate", "collection", "cards", "translate"]);
  assert.equal(preview.fileName, "world-capitals.apkg");
  assert.equal(preview.fileSize, file.size);
  assert.equal(preview.rootDeckName, "Welt-Hauptstädte");
  assert.deepEqual(preview.report.detected, { decks: 8, notes: 245, cards: 245, reviewEvents: 0 });
  assert.deepEqual(preview.report.imported, { decks: 8, notes: 245, cards: 245, mediaFiles: 0, reviewEvents: 0 });
  assert.deepEqual(preview.report.notetypes.map((report) => [report.name, report.notes, report.cards]), [["Basic", 245, 245]]);
  assert.deepEqual(preview.report.errors, []);
  assert.equal(preview.samples.length, 5);
  assert.equal(new Set(preview.samples.map((sample) => sample.note.id)).size, 5);
  for (const { note, card, notetypeName } of preview.samples) {
    assert.equal(card.noteId, note.id);
    assert.equal(note.source, "anki-apkg");
    assert.equal(notetypeName, "Basic");
  }
  assert.deepEqual(preview.sampleMedia, []);
  const { deckCount, noteCount, cardCount, reviewEventCount, mediaCount, ankiGuids } = preview.commitGraph;
  assert.deepEqual({ deckCount, noteCount, cardCount, reviewEventCount, mediaCount }, { deckCount: 8, noteCount: 245, cardCount: 245, reviewEventCount: 0, mediaCount: 0 });
  assert.equal(new Set(ankiGuids).size, 245);
});

test("der Commitgraph streamt Stapel, Notiztypen und Inhalte mit ihren Quellen und Karten", async () => {
  const preview = await createApkgImportPreview(await fixtureFile("world-capitals.apkg"));
  const chunks = await collectChunks(preview);

  assert.deepEqual(chunks.map((chunk) => chunk.kind), ["decks", "note-type-sources", "notes"]);
  const [{ decks }] = chunksOf(chunks, "decks");
  const [{ values: sources }] = chunksOf(chunks, "note-type-sources");
  const notes = chunksOf(chunks, "notes").flatMap((chunk) => chunk.notes);
  const noteSources = chunksOf(chunks, "notes").flatMap((chunk) => chunk.noteSources);
  const cards = chunksOf(chunks, "notes").flatMap((chunk) => chunk.cards);
  const deckIds = new Set(decks.map((deck) => deck.id));
  const noteIds = new Set(notes.map((note) => note.id));

  assert.equal(decks.length, 8);
  assert.equal(decks.filter((deck) => deck.parentDeckId === null).length, 1);
  assert.deepEqual(sources.map((source) => source.name), ["Basic"]);
  assert.equal(notes.length, 245);
  assert.deepEqual(noteSources.map((source) => source.noteId), notes.map((note) => note.id));
  assert.ok(noteSources.every((source) => source.noteTypeSourceId === sources[0].id && source.fields.length > 0));
  assert.ok(notes.every((note) => note.noteTypeSourceId === sources[0].id && note.importedContentRevision === note.contentRevision));
  assert.equal(cards.length, 245);
  assert.ok(cards.every((card) => noteIds.has(card.noteId) && deckIds.has(card.deckId) && card.ankiCardId !== null && card.variants.length === 0));
  assert.equal(new Set(cards.map((card) => card.ankiCardId)).size, 245);
});

test("Stapelhierarchien bleiben mit direkten Eltern und vollständigen Pfaden erhalten", async () => {
  const preview = await createApkgImportPreview(await fixtureFile("matrix/standard-latest.apkg"));
  const chunks = await collectChunks(preview);
  const [{ decks }] = chunksOf(chunks, "decks");
  const byId = new Map(decks.map((deck) => [deck.id, deck]));

  assert.equal(decks.length, preview.commitGraph.deckCount);
  assert.ok(decks.some((deck) => deck.hierarchyPath.length > 2));
  for (const deck of decks) {
    assert.equal(deck.name, deck.hierarchyPath.at(-1));
    if (deck.parentDeckId === null) {
      assert.equal(deck.hierarchyPath.length, 1);
      continue;
    }
    assert.deepEqual(byId.get(deck.parentDeckId)?.hierarchyPath, deck.hierarchyPath.slice(0, -1));
  }
});

test("jede echte Anki-Karte bleibt eine eigene Karte desselben Inhalts", async () => {
  const preview = await createApkgImportPreview(await fixtureFile("matrix/standard-latest.apkg"));
  const chunks = await collectChunks(preview);
  const notes = chunksOf(chunks, "notes").flatMap((chunk) => chunk.notes);
  const cards = chunksOf(chunks, "notes").flatMap((chunk) => chunk.cards);
  const reversedSource = chunksOf(chunks, "note-type-sources")[0].values.find((source) => source.name === "Basic (and reversed card)")!;
  const reversedNote = notes.find((note) => note.noteTypeSourceId === reversedSource.id)!;
  const reversedCards = cards.filter((card) => card.noteId === reversedNote.id);

  assert.deepEqual(reversedCards.map((card) => card.promptKey), ["forward", "reverse"]);
  assert.notEqual(reversedCards[0].ankiCardId, reversedCards[1].ankiCardId);
  assert.notEqual(reversedCards[0].study, reversedCards[1].study);
  assert.ok(cards.some((card) => card.promptKey === "cloze:2"));
  assert.equal(cards.length, 16);
});

test("Lernstände und Wiederholungen werden übernommen und als eigener Abschnitt gestreamt", async () => {
  const preview = await createApkgImportPreview(await fixtureFile("matrix/learning-latest.apkg"));
  const chunks = await collectChunks(preview);
  const cards = chunksOf(chunks, "notes").flatMap((chunk) => chunk.cards);
  const reviews = chunksOf(chunks, "reviews").flatMap((chunk) => chunk.values);
  const cardIds = new Set(cards.map((card) => card.id));

  assert.deepEqual(chunks.map((chunk) => chunk.kind), ["decks", "note-type-sources", "notes", "reviews"]);
  assert.deepEqual(preview.report.notetypes[0].study, { "fsrs-memory-state": 1, "revlog-replay": 5, "classic-state": 0, new: 2 });
  assert.equal(preview.commitGraph.reviewEventCount, 12);
  assert.equal(reviews.length, 12);
  assert.ok(reviews.every((review) => cardIds.has(review.cardId)));
  assert.equal(cards.filter((card) => card.study.state !== "new").length, 6);
});

test("Medien werden nach den Inhalten mit geprüfter SHA-1 gestreamt; fehlende Medien stehen im Bericht", async () => {
  const preview = await createApkgImportPreview(await fixtureFile("matrix/media-latest.apkg"));
  const chunks = await collectChunks(preview);
  const media = chunksOf(chunks, "media").map((chunk) => chunk.file);
  const notes = chunksOf(chunks, "notes").flatMap((chunk) => chunk.notes);

  assert.deepEqual(chunks.map((chunk) => chunk.kind), ["decks", "note-type-sources", "notes", "media", "media", "media"]);
  assert.deepEqual(media.map((file) => file.name).sort(), ["a&b.png", "mit leerzeichen.png", "Ä-Bild.png"].sort());
  for (const file of media) {
    assert.equal(createHash("sha1").update(file.bytes).digest("hex"), file.sha1, file.name);
    assert.equal(file.size, file.bytes.length);
    assert.equal(file.mimeType, "image/png");
  }
  const referenced = new Set(notes.flatMap((note) => Object.values(note.media)));
  assert.ok(media.every((file) => referenced.has(file.sha1)));
  assert.deepEqual(preview.report.missingMedia, ["fehlt.png"]);
  assert.deepEqual(preview.report.warnings, ["1 referenziertes Medium fehlt im Paket."]);
  assert.equal(preview.commitGraph.mediaCount, 3);
  assert.ok(preview.sampleMedia.length > 0);
  for (const file of preview.sampleMedia) assert.equal(createHash("sha1").update(file.bytes).digest("hex"), file.sha1);
});

test("eine beschädigte Mediendatei bricht den Commit mit ihrem Namen ab", async () => {
  const graph = {
    decks: [], notes: [], cards: [], reviewEvents: [], noteTypeSources: [], noteSources: [],
    mediaFiles: [{ name: "bild.png", sha1: "0".repeat(40), size: 1, mimeType: "image/png", readBytes: async () => new Uint8Array([1]) }],
  } as unknown as ApkgImportGraph;
  const kinds: string[] = [];

  await assert.rejects(async () => {
    for await (const chunk of createImportGraphChunks(graph)) kinds.push(chunk.kind);
  }, { message: "Die Mediendatei „bild.png“ ist beschädigt." });
  assert.deepEqual(kinds, ["decks", "note-type-sources"]);
});

test("Pakete ohne importierbare Inhalte und kaputte Archive werden sichtbar abgelehnt", async () => {
  await assert.rejects(createApkgImportPreview(await fixtureFile("matrix/empty-latest.apkg")), { message: "Keine importierbaren Anki-Inhalte mit Karten erkannt." });
  await assert.rejects(createApkgImportPreview(await fixtureFile("matrix/broken.apkg")), { message: "Die APKG-Datei enthält kein gültiges ZIP-Verzeichnis." });
  await assert.rejects(createApkgImportPreview(new File([], "stapel.zip")), /\.apkg oder \.colpkg/);
});

test("ohne Worker verweigert ein Browser den APKG-Import", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    await assert.rejects(createApkgImportPreview(await fixtureFile("world-capitals.apkg")), { message: "APKG-Import benötigt einen unterstützten Web Worker." });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("APKG-Workerfehler beenden Vorschau und Commit sichtbar statt den Import hängen zu lassen", async () => {
  let phase: "parse" | "commit" = "parse";
  await withFakeWorker((worker, request) => {
    if (request.type === "commit" || phase === "parse") {
      worker.onerror?.();
      return;
    }
    worker.reply({ type: "result", requestId: request.requestId, result: VALID_DESCRIPTOR });
  }, async () => {
    await assert.rejects(createApkgImportPreview(workerFile()), { message: "APKG-Import-Worker ist unerwartet abgebrochen." });
    assert.equal(FakeWorker.instances[0].terminated, true);

    phase = "commit";
    const preview = await createApkgImportPreview(workerFile());
    const worker = FakeWorker.instances[1];
    assert.equal(worker.terminated, false);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await assert.rejects(Promise.race([
        preview.commitGraph.streamChunks(async () => undefined),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Worker-Commit hängt.")), 2_000); }),
      ]), { message: "APKG-Import-Worker ist unerwartet abgebrochen." });
      assert.equal(worker.terminated, true);
    } finally {
      clearTimeout(timeout);
      preview.commitGraph.dispose();
    }
  });
});

test("Parserfehler und Berichtsfehler des Workers bleiben sichtbar", async () => {
  await withFakeWorker((worker, request) => {
    worker.reply({ type: "progress", requestId: request.requestId, step: "validate" });
    worker.reply({ type: "error", requestId: request.requestId, message: "Die APKG-Datei enthält kein gültiges ZIP-Verzeichnis." });
  }, async () => {
    const steps: string[] = [];
    await assert.rejects(createApkgImportPreview(workerFile(), { onStep: (step) => steps.push(step) }), { message: "Die APKG-Datei enthält kein gültiges ZIP-Verzeichnis." });
    assert.deepEqual(steps, ["validate"]);
    assert.equal(FakeWorker.instances[0].terminated, true);
  });

  await withFakeWorker((worker, request) => {
    worker.reply({ type: "result", requestId: request.requestId, result: { ...VALID_DESCRIPTOR, report: { errors: ["Keine importierbaren Anki-Inhalte mit Karten erkannt."], warnings: [] } } });
  }, async () => {
    await assert.rejects(createApkgImportPreview(workerFile()), { message: "Keine importierbaren Anki-Inhalte mit Karten erkannt." });
    assert.equal(FakeWorker.instances[0].terminated, true);
  });

  await withFakeWorker((worker) => {
    worker.reply({ type: "result", requestId: "fremd", result: VALID_DESCRIPTOR });
  }, async () => {
    await assert.rejects(createApkgImportPreview(workerFile()), { message: "APKG-Worker hat eine ungültige Nachricht geliefert." });
  });
});

test("der Worker-Commit liefert Abschnitte einzeln nach Bestätigung und endet mit commit-done", async () => {
  const chunks: ImportGraphChunk[] = [
    { kind: "decks", decks: [] },
    { kind: "reviews", values: [] },
  ];
  await withFakeWorker((worker, request) => {
    if (request.type === "parse") {
      worker.reply({ type: "result", requestId: request.requestId, result: VALID_DESCRIPTOR });
      return;
    }
    const sent = worker.requests.filter((item) => item.type !== "parse").length - 1;
    if (sent < chunks.length) worker.reply({ type: "commit-chunk", requestId: request.requestId, chunk: chunks[sent] });
    else worker.reply({ type: "commit-done", requestId: request.requestId });
  }, async () => {
    const preview = await createApkgImportPreview(workerFile());
    const worker = FakeWorker.instances[0];
    assert.equal(preview.rootDeckName, "Worker");
    assert.equal(preview.fileName, "worker.apkg");
    assert.deepEqual(preview.commitGraph.ankiGuids, ["guid-1"]);
    assert.equal(preview.commitGraph.cardCount, 1);

    const visited: string[] = [];
    await preview.commitGraph.streamChunks(async (chunk) => { visited.push(chunk.kind); });

    assert.deepEqual(visited, ["decks", "reviews"]);
    assert.deepEqual(worker.requests.map((item) => item.type), ["parse", "commit", "commit-next", "commit-next"]);
    assert.equal(worker.terminated, true);
  });
});

test("ein fehlgeschlagener Commit-Abschnitt beendet den Worker mit der Fehlermeldung", async () => {
  await withFakeWorker((worker, request) => {
    if (request.type === "parse") worker.reply({ type: "result", requestId: request.requestId, result: VALID_DESCRIPTOR });
    else worker.reply({ type: "commit-chunk", requestId: request.requestId, chunk: { kind: "decks", decks: [] } });
  }, async () => {
    const preview = await createApkgImportPreview(workerFile());
    await assert.rejects(
      preview.commitGraph.streamChunks(async () => { throw new Error("Speicher voll."); }),
      { message: "Speicher voll." },
    );
    assert.equal(FakeWorker.instances[0].terminated, true);
    assert.deepEqual(FakeWorker.instances[0].requests.map((item) => item.type), ["parse", "commit"]);
  });
});

test("ein Abbruch beendet die Worker-Analyse als AbortError", async () => {
  await withFakeWorker(() => undefined, async () => {
    const controller = new AbortController();
    const pending = createApkgImportPreview(workerFile(), { signal: controller.signal });
    controller.abort();

    await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError" && error.message === "APKG-Import wurde abgebrochen.");
    assert.equal(FakeWorker.instances[0].terminated, true);
  });
});
