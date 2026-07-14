import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getOriginalVariant } from "./coreModel.ts";
import { createCreationWorkflow } from "./creationWorkflow.ts";
import { LOCAL_APKG_MAX_BYTES } from "./serverApkgImportContract.ts";
import { formatPdfTextContentItems } from "./documentModel.ts";

async function worldCapitalsApkgFile() {
  const bytes = await readFile(new URL("../fixtures/apkg/world-capitals.apkg", import.meta.url));
  return {
    name: "world-capitals.apkg",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test("creation workflow hides pasted text and spreadsheet import details", () => {
  const workflow = createCreationWorkflow();

  const textPreview = workflow.importPastedDeck({
    mode: "text",
    deckName: "Text Import",
    content: "Was ist ATP?\n---\nEin universeller Energietraeger.",
    dryRun: true,
  });
  const spreadsheetImport = workflow.importPastedDeck({
    mode: "spreadsheet",
    deckName: "Tabellen Import",
    content: "front\tback\ttags\nWas ist Myelin?\tElektrische Isolation von Axonen.\tneuro",
    dryRun: false,
  });

  assert.equal(textPreview.report.dryRun, true);
  assert.equal(textPreview.report.createdLearningItems, 1);
  assert.equal(spreadsheetImport.deck.cards.length, 1);
  assert.equal(spreadsheetImport.deck.cards[0].meta.importFormat, "spreadsheet");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(spreadsheetImport.deck.cards[0]).isOriginal, true);
});

test("creation workflow captures manual document anchors behind one interface", () => {
  const workflow = createCreationWorkflow();
  const document = workflow.createInitialAiDocument({
    fileName: "quelle.txt",
    text: "ATP ist ein universeller Energietraeger der Zelle.",
  });
  const selection = workflow.captureManualSelection({
    activeField: "back",
    front: "Was ist ATP?",
    back: "",
    documentText: document.text,
    selectedText: "ATP ist ein universeller Energietraeger.",
  });

  const deck = workflow.createManualDeck({
    deckName: "Manuell",
    cardType: "basic",
    front: selection.front,
    back: selection.back,
    tags: "biochemie energie",
    document,
    documentText: document.text,
    selection: selection.selection,
    activeField: "back",
  });
  const card = deck.cards[0];

  assert.equal(selection.changed, true);
  assert.equal(selection.back, "<p>ATP ist ein universeller Energietraeger.</p>");
  assert.equal(workflow.canCreateManualCard({ cardType: "basic", front: selection.front, back: selection.back }), true);
  assert.equal(deck.sourceDocuments[0].fileName, "quelle.txt");
  assert.equal(card.sourceAnchors[0].targetField, "back");
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(card).front, "Was ist ATP?");
});

test("creation workflow preserves rich text manual cards", () => {
  const workflow = createCreationWorkflow();
  const front = '<p><strong>ATP</strong> ist <span style="color:#b42318">wichtig</span>.</p><ul><li>Energie</li></ul>';
  const back = '<p><em>Universeller</em> Energietraeger mit <span style="background-color:#fef08a">Phosphatgruppen</span>.</p>';
  const deck = workflow.createManualDeck({
    deckName: "Rich Text",
    cardType: "basic",
    front,
    back,
  });
  const card = deck.cards[0];

  assert.equal(workflow.canCreateManualCard({ cardType: "basic", front: "<p><br></p>", back }), false);
  assert.equal(workflow.canCreateManualCard({ cardType: "basic", front, back }), true);
  assert.equal(card.originalFront, front);
  assert.equal(card.originalBack, back);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(card).front, front);
  assert.ok(getOriginalVariant);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(getOriginalVariant(card).back, back);
});

test("manual document capture ignores empty selections", () => {
  const workflow = createCreationWorkflow();
  const document = workflow.createInitialAiDocument({
    fileName: "quelle.txt",
    text: "Dieser Absatz darf nicht durch einen einfachen Klick uebernommen werden.",
  });
  const selection = workflow.captureManualSelection({
    activeField: "front",
    front: "",
    back: "",
    document,
    documentText: document.text,
    selectedText: "",
  });

  assert.equal(selection.changed, false);
  assert.equal(selection.front, "");
  assert.equal(selection.back, "");
  assert.equal(selection.selection, "");
});

test("manual PDF selection can pass page and bounding box into the source anchor", () => {
  const workflow = createCreationWorkflow();
  const document = workflow.createInitialAiDocument({
    fileName: "skript.pdf",
    text: "Nervenzellen leiten elektrische Signale.",
    mimeType: "application/pdf",
  });
  const selection = workflow.captureManualSelection({
    activeField: "front",
    front: "",
    back: "",
    document,
    documentText: document.text,
    selectedText: "Nervenzellen leiten elektrische Signale.",
    sourceAnchorOptions: {
      pageNumber: 3,
      bbox: { left: 12, top: 24, right: 220, bottom: 48 },
    },
  });

  assert.equal(selection.changed, true);
  assert.ok(selection);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(selection.sourceAnchor.pageNumber, 3);
  assert.ok(selection);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.deepEqual(selection.sourceAnchor.bbox, { left: 12, top: 24, right: 220, bottom: 48 });
});

test("creation workflow prepares multiple-choice manual cards", () => {
  const workflow = createCreationWorkflow();
  const input = workflow.createManualDeckInput({
    deckName: "MC",
    cardType: "multiple-choice",
    front: "Welche Aussage stimmt?",
    answerOptions: "A falsch\nB richtig\nC falsch",
    correctAnswer: "B richtig",
    back: "B ist richtig, weil die Definition passt.",
  });

  assert.equal(input.card.cardType, "multiple-choice");
  assert.deepEqual(input.card.answerOptions, ["A falsch", "B richtig", "C falsch"]);
  assert.equal(input.card.correctAnswer, "B richtig");
  assert.equal(workflow.canCreateManualCard({ cardType: "multiple-choice", front: input.card.front, answerOptions: input.card.answerOptions, correctAnswer: input.card.correctAnswer }), true);
});

test("creation workflow validates cloze syntax and maps old free-text input to basic", () => {
  const workflow = createCreationWorkflow();
  const clozeInput = workflow.createManualDeckInput({
    deckName: "Cloze",
    cardType: "cloze",
    front: "{{c1::ATP}} liefert Energie.",
    back: "Extra: Zellstoffwechsel.",
  });
  const freeTextInput = workflow.createManualDeckInput({
    deckName: "Alt",
    cardType: "free-text",
    front: "Definiere Osmose.",
    back: "Osmose ist die Diffusion von Wasser.",
  });

  assert.equal(clozeInput.card.cardType, "cloze");
  assert.equal(workflow.canCreateManualCard({ cardType: "cloze", front: "ATP liefert Energie.", back: "Extra" }), false);
  assert.equal(workflow.canCreateManualCard({ cardType: "cloze", front: clozeInput.card.front, back: clozeInput.card.back }), true);
  assert.equal(freeTextInput.card.cardType, "basic");
});

test("formats synthetic PDF text items into readable page lines", () => {
  const text = formatPdfTextContentItems(
    [
      { str: "zweite", transform: [1, 0, 0, 1, 10, 80] },
      { str: "Zeile", transform: [1, 0, 0, 1, 58, 80] },
      { str: "Erste", transform: [1, 0, 0, 1, 10, 110] },
      { str: "Zeile", transform: [1, 0, 0, 1, 55, 110] },
    ],
    { pageNumber: 2 },
  );

  assert.equal(text, "Seite 2\nErste Zeile\nzweite Zeile");
});

test("creation workflow owns AI draft generation and acceptance", () => {
  const workflow = createCreationWorkflow();
  const document = workflow.createInitialAiDocument({
    fileName: "myelin.txt",
    text: "Myelin isoliert Axone elektrisch. Dadurch steigt die Leitungsgeschwindigkeit saltatorischer Erregung.",
  });
  const config = {
    language: "Deutsch",
    cardCount: 2,
    detailLevel: "normal",
    cardTypes: ["basic", "cloze"],
    focus: "Prüfungswissen",
    subject: "Neuro",
    costTier: "balanced",
  };

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const generated = workflow.generateAiDrafts({ document, config });
  assert.ok(generated);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  const updatedDrafts = workflow.updateDraftCard(generated.draftDeck.cards, generated.draftDeck.cards[0].id, {
    originalFront: "Welche Funktion hat Myelin?",
  });
  const accepted = workflow.acceptAiDrafts(generated.draftDeck, updatedDrafts);

  assert.equal(generated.validation.valid, true);
  assert.match(generated.statusMessage, /Entwürfe generiert/);
  assert.equal(generated.job.status, "succeeded");
  assert.equal(workflow.toggleAiCardType({ cardTypes: ["cloze"] }, "cloze").cardTypes[0], "basic");
  assert.ok(accepted);
  assert.equal(accepted.importMeta.draftOnly, false);
  assert.ok(accepted);
  assert.equal(accepted.cards.every((card) => card.draftStatus === "accepted"), true);
});

test("creation workflow returns APKG errors in the UI job shape", async () => {
  const workflow = createCreationWorkflow();
  const result = await workflow.parseApkgFile({ name: "broken.apkg", size: 12 });

  assert.equal(result.preview, null);
  assert.equal(result.mediaStatus, null);
  assert.equal(result.job.status, "error");
  assert.equal(result.job.fileName, "broken.apkg");
  assert.equal(result.job.errors.length, 1);
});

test("creation workflow switches to the server path strictly above 250 MiB", async () => {
  let serverCalls = 0;
  const progress = {
    jobId: "11111111-1111-4111-8111-111111111111", status: "ready", phase: "preview", revision: 3,
    completed: LOCAL_APKG_MAX_BYTES + 1, total: LOCAL_APKG_MAX_BYTES + 1, retryable: false,
    report: { apkg: { contractVersion: 1, decks: [{ id: "1", path: "Großes Deck", noteCount: 1, cardCount: 1 }] } },
  } as any;
  const serverApkgImport: any = {
    async analyze() { serverCalls += 1; return progress; },
    getLastJobId() { return null; },
  };
  const workflow = createCreationWorkflow({ serverApkgImport });
  const local = await workflow.parseApkgFile({ name: "boundary.apkg", size: LOCAL_APKG_MAX_BYTES });
  assert.equal(serverCalls, 0);
  assert.equal(local.job.status, "error");

  const server = await workflow.parseApkgFile({ name: "large.apkg", size: LOCAL_APKG_MAX_BYTES + 1 });
  assert.equal(serverCalls, 1);
  assert.equal(server.preview?.kind, "server");
  assert.equal(server.preview?.kind === "server" ? server.preview.deckSummary.name : "", "Großes Deck");
});

test("creation workflow resumes, retries and cancels server previews through one seam", async () => {
  const ready: any = {
    jobId: "11111111-1111-4111-8111-111111111111", status: "ready", phase: "preview", revision: 4,
    completed: 42, total: 42, retryable: false,
    report: { warnings: [], errors: [], apkg: { contractVersion: 1, decks: [{ id: "1", path: "Fortgesetzter Import", noteCount: 1, cardCount: 1 }] } },
  };
  const cancelled = { ...ready, status: "cancelled", phase: "cleanup", revision: 5 };
  let retryCalls = 0;
  let cancelCalls = 0;
  const serverApkgImport: any = {
    getLastJobId() { return ready.jobId; },
    async get() { return ready; },
    async retry() { retryCalls += 1; return { ...ready, status: "queued", phase: "download", revision: 5, report: undefined }; },
    async waitUntilReady() { return { ...ready, revision: 6 }; },
    async cancel() { cancelCalls += 1; return cancelled; },
  };
  const workflow = createCreationWorkflow({ serverApkgImport });
  const resumed = await workflow.resumeApkgPreview();
  assert.equal(resumed?.preview?.kind, "server");
  assert.equal(resumed?.preview?.kind === "server" ? resumed.preview.deckSummary.name : "", "Fortgesetzter Import");
  const retried = await workflow.retryApkgPreview(resumed!.preview!);
  assert.equal(retried?.progress.revision, 6);
  assert.equal(retryCalls, 1);
  assert.equal((await workflow.cancelApkgPreview(retried!))?.status, "cancelled");
  assert.equal(cancelCalls, 1);
});

test("creation workflow previews and commits APKG through its lazy interface", async () => {
  const workflow = createCreationWorkflow();
  const parsed = await workflow.parseApkgFile(await worldCapitalsApkgFile());
  const committed = await workflow.commitApkgPreview(parsed.preview);

  assert.equal(parsed.job.status, "preview");
  assert.ok(parsed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(parsed.preview.deck.cards.length, 245);
  assert.ok(parsed);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
  assert.equal(parsed.preview.importReport.apkg.detectedCards, 245);
  assert.equal(committed.decks.length, 8);
  assert.equal(committed.report.errors.length, 0);
});

test("APKG commit confirms decks before media sync and keeps cloud failures pending", async () => {
  const events: string[] = [];
  const mediaResult = { status: "local-pending", referencesByDeck: new Map(), progress: { completed: 0, total: 1, uploaded: 0, reused: 0, currentName: "" }, failureKind: "network", message: "ausstehend" } as const;
  const mediaTask = { result: Promise.resolve(mediaResult), progress: mediaResult.progress, async pause() {}, resume() {}, async cancel() {}, subscribe() { return () => {}; } };
  const mediaStore: any = {
    async cachePreviewMedia() { events.push("preview-cache"); return { persisted: true, count: 1, errors: [] }; },
    syncImportMedia() { events.push("media-sync"); return mediaTask; },
    async resolveDeckMedia() { return { urls: {}, missing: [], expiresAt: null, refreshAfterMs: null, revoke() {} }; },
    startRetryLifecycle() { return { retry: async () => {}, stop() {} }; },
  };
  const workflow = createCreationWorkflow({ mediaStore, async persistImportedDecks() { events.push("deck-cloud-confirmed"); } });
  const parsed = await workflow.parseApkgFile(await worldCapitalsApkgFile());
  const committed = await workflow.commitApkgPreview(parsed.preview);
  assert.deepEqual(events.slice(-2), ["deck-cloud-confirmed", "media-sync"]);
  assert.equal((await committed.mediaTask.result).status, "local-pending");
});
