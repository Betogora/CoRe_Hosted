import assert from "node:assert/strict";
import test from "node:test";
import {
  createManualBatchSession,
  manualDraftsEqual,
  nextManualFocusTarget,
  reduceManualBatchSession,
} from "./creationBatch.ts";

test("manual batch session resets only unpinned fields and keeps the target deck", () => {
  const imageReference = "a".repeat(40);
  const pinnedFront = `<p>Gemeinsame Vorderseite <img src="${imageReference}" alt="schema.png"></p>`;
  let state = createManualBatchSession("deck-a");
  state = reduceManualBatchSession(state, {
    type: "draft",
    patch: {
      front: pinnedFront,
      back: "<p>Einmalige Rückseite</p>",
      tags: "prüfung",
      selection: "Quelle",
    },
  });
  state = reduceManualBatchSession(state, { type: "toggle-pin", field: "front" });
  const saved = reduceManualBatchSession(state, { type: "saved", cardId: "card-1", targetDeckId: "deck-a" });

  assert.equal(saved.createdCount, 1);
  assert.equal(saved.targetDeckId, "deck-a");
  assert.equal(saved.lastSavedCardId, "card-1");
  assert.equal(saved.currentDraft.front, pinnedFront);
  assert.equal(saved.currentDraft.back, "");
  assert.equal(saved.currentDraft.tags, "");
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
