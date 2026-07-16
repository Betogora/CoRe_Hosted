import assert from "node:assert/strict";
import test from "node:test";
import {
  createManualBatchSession,
  manualDraftsEqual,
  nextManualFocusTarget,
  reduceManualBatchSession,
} from "./creationBatch.ts";

test("manual batch session resets only unpinned fields and keeps the target deck", () => {
  let state = createManualBatchSession("deck-a");
  state = reduceManualBatchSession(state, {
    type: "draft",
    patch: {
      front: "<p>Gemeinsame Vorderseite</p>",
      back: "<p>Einmalige Rückseite</p>",
      tags: "prüfung",
      selection: "Quelle",
      sourceAnchor: {
        id: "anchor-1",
        documentId: "document-1",
        documentName: "Quelle.pdf",
        cardId: null,
        variantId: null,
        pageNumber: 1,
        textQuote: "Quelle",
        charStart: null,
        charEnd: null,
        targetField: "front",
        bbox: null,
        confidence: null,
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    },
  });
  state = reduceManualBatchSession(state, { type: "toggle-pin", field: "front" });
  const saved = reduceManualBatchSession(state, { type: "saved", cardId: "card-1", targetDeckId: "deck-a" });

  assert.equal(saved.createdCount, 1);
  assert.equal(saved.targetDeckId, "deck-a");
  assert.equal(saved.lastSavedCardId, "card-1");
  assert.equal(saved.currentDraft.front, "<p>Gemeinsame Vorderseite</p>");
  assert.equal(saved.currentDraft.back, "");
  assert.equal(saved.currentDraft.tags, "");
  assert.equal(saved.currentDraft.sourceAnchor?.id, "anchor-1");
  assert.equal(nextManualFocusTarget(saved), "back");
});

test("manual batch session supports the inverse pin matrix and deterministic focus", () => {
  let state = createManualBatchSession("deck-a");
  state = reduceManualBatchSession(state, { type: "draft", patch: { front: "Frage", back: "Gemeinsame Antwort" } });
  state = reduceManualBatchSession(state, { type: "toggle-pin", field: "back" });
  const saved = reduceManualBatchSession(state, { type: "saved", cardId: "card-2", targetDeckId: "deck-a" });

  assert.equal(saved.currentDraft.front, "");
  assert.equal(saved.currentDraft.back, "Gemeinsame Antwort");
  assert.equal(nextManualFocusTarget(saved), "front");
  assert.equal(manualDraftsEqual(saved.currentDraft, { ...saved.currentDraft }), true);
});
