import assert from "node:assert/strict";
import test from "node:test";
import {
  choiceKindPatch,
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

test("discarding empties the whole draft, pinned fields included, and keeps count, deck and pins", () => {
  let state = createManualBatchSession("deck-a");
  state = reduceManualBatchSession(state, { type: "draft", patch: { kind: "single-choice", front: "Frage", back: "Antwort", answerOptions: ["A", "B", "C"], correctOptionIndices: [2], tags: ["bio"] } });
  state = reduceManualBatchSession(state, { type: "toggle-pin", field: "back" });
  const discarded = reduceManualBatchSession(state, { type: "discard" });

  assert.deepEqual(discarded.currentDraft, { kind: "single-choice", front: "", back: "", answerOptions: ["", "", ""], correctOptionIndices: [1], tags: [] });
  assert.equal(discarded.createdCount, 0);
  assert.equal(discarded.targetDeckId, "deck-a");
  assert.deepEqual(discarded.pinnedFields, { front: false, back: true });
});

test("choice drafts start with three options and preset correct answers", () => {
  const draft = createManualBatchSession().currentDraft;
  assert.deepEqual(choiceKindPatch(draft, "single-choice"), { kind: "single-choice", answerOptions: ["", "", ""], correctOptionIndices: [1] });
  assert.deepEqual(choiceKindPatch(draft, "multiple-choice"), { kind: "multiple-choice", answerOptions: ["", "", ""], correctOptionIndices: [0, 1] });

  const filled = { ...draft, kind: "multiple-choice" as const, answerOptions: ["A", "B", "C"], correctOptionIndices: [1, 2] };
  assert.deepEqual(choiceKindPatch(filled, "single-choice"), { kind: "single-choice", correctOptionIndices: [1] }, "filled options keep their first correct answer");

  let state = reduceManualBatchSession(createManualBatchSession("deck-a"), { type: "draft", patch: filled });
  state = reduceManualBatchSession(state, { type: "saved", targetDeckId: "deck-a" });
  assert.deepEqual(state.currentDraft.answerOptions, ["", "", ""]);
  assert.deepEqual(state.currentDraft.correctOptionIndices, [0, 1], "the next card starts from the presets of its kind");

  const clean = createManualBatchSession().currentDraft;
  const switchedBack = { ...clean, ...choiceKindPatch(clean, "multiple-choice"), kind: "basic" as const };
  assert.equal(manualDraftsEqual(switchedBack, clean), true, "an empty draft stays clean after trying a choice type");
  assert.equal(manualDraftsEqual({ ...clean, answerOptions: ["", ""] }, clean), true, "older drafts with two options count as clean");
});
