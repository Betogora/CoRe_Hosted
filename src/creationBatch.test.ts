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
      tags: ["prüfung"],
    },
  });
  state = reduceManualBatchSession(state, { type: "toggle-pin", field: "front" });
  const saved = reduceManualBatchSession(state, { type: "saved", targetDeckId: "deck-a" });

  assert.equal(saved.createdCount, 1);
  assert.equal(saved.targetDeckId, "deck-a");
  assert.equal(saved.currentDraft.front, pinnedFront);
  assert.equal(saved.currentDraft.back, "");
  assert.deepEqual(saved.currentDraft.tags, []);
  assert.equal(nextManualFocusTarget(saved), "back");
});

test("manual batch session supports the inverse pin matrix and deterministic focus", () => {
  let state = createManualBatchSession("deck-a");
  state = reduceManualBatchSession(state, { type: "draft", patch: { front: "Frage", back: "Gemeinsame Antwort" } });
  state = reduceManualBatchSession(state, { type: "toggle-pin", field: "back" });
  const saved = reduceManualBatchSession(state, { type: "saved", targetDeckId: "deck-a" });

  assert.equal(saved.currentDraft.front, "");
  assert.equal(saved.currentDraft.back, "Gemeinsame Antwort");
  assert.equal(nextManualFocusTarget(saved), "front");
  assert.equal(manualDraftsEqual(saved.currentDraft, { ...saved.currentDraft }), true);
});

test("a cleared cloze front starts a standard draft; a pinned cloze front stays cloze", () => {
  let state = createManualBatchSession("deck-a");
  state = reduceManualBatchSession(state, {
    type: "draft",
    patch: { kind: "cloze", front: "<p>{{c1::ATP}} entsteht in {{c2::Mitochondrien}}.</p>", back: "<p>Zellatmung</p>" },
  });
  const saved = reduceManualBatchSession(state, { type: "saved", targetDeckId: "deck-a" });

  assert.equal(saved.currentDraft.kind, "basic");

  const pinned = reduceManualBatchSession(reduceManualBatchSession(state, { type: "toggle-pin", field: "front" }), { type: "saved", targetDeckId: "deck-a" });
  assert.equal(pinned.currentDraft.kind, "cloze");
  assert.equal(pinned.currentDraft.front, state.currentDraft.front);
});
