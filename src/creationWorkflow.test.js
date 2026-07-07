import assert from "node:assert/strict";
import test from "node:test";
import { getOriginalVariant } from "./coreModel.js";
import { createCreationWorkflow } from "./creationWorkflow.js";
import { formatPdfTextContentItems } from "./documentModel.js";

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
    selectedText: "",
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
  assert.equal(selection.back, document.text);
  assert.equal(workflow.canCreateManualCard({ cardType: "basic", front: selection.front, back: selection.back }), true);
  assert.equal(deck.sourceDocuments[0].fileName, "quelle.txt");
  assert.equal(card.sourceAnchors[0].targetField, "back");
  assert.equal(getOriginalVariant(card).front, "Was ist ATP?");
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

  const generated = workflow.generateAiDrafts({ document, config });
  const updatedDrafts = workflow.updateDraftCard(generated.draftDeck.cards, generated.draftDeck.cards[0].id, {
    originalFront: "Welche Funktion hat Myelin?",
  });
  const accepted = workflow.acceptAiDrafts(generated.draftDeck, updatedDrafts);

  assert.equal(generated.validation.valid, true);
  assert.match(generated.statusMessage, /Entwürfe generiert/);
  assert.equal(generated.job.status, "succeeded");
  assert.equal(workflow.toggleAiCardType({ cardTypes: ["cloze"] }, "cloze").cardTypes[0], "basic");
  assert.equal(accepted.importMeta.draftOnly, false);
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
