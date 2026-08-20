import assert from "node:assert/strict";
import test from "node:test";
import {
  addRephrasedVariant,
  createBasicLearningItem,
  createDefaultDeckSettings,
  createManualCoreDeck,
  createReviewState,
  normalizeCoreDeck,
  rescheduleLearningItem,
  saveCardEditorValue,
} from "./coreModel.ts";
import type { ReviewSchedulerState } from "./coreTypes.ts";

test("deck settings normalize appearance defaults and fallbacks", () => {
  const defaults = createDefaultDeckSettings();
  const custom = createDefaultDeckSettings({ appearance: { iconKey: "brain", iconColor: "#ABCDEF" } });
  assert.deepEqual(defaults.appearance, { iconKey: "book-open", iconColor: "#6f7e9e" });
  assert.deepEqual(custom.appearance, { iconKey: "brain", iconColor: "#abcdef" });
});

test("manuelles Basic mit Rückseite erzeugt zwei volle Karten", () => {
  const deck = createManualCoreDeck({ deckName: "Biologie", card: { cardType: "basic-reversed", front: "ATP", back: "Energieträger" } });
  assert.equal(deck.cards.length, 2);
  assert.equal(deck.cards[0].variants.length, 0);
  assert.equal(deck.cards[1].originalFront, "Energieträger");
});

test("Multiple Choice bleibt strukturierter Karteninhalt", () => {
  const deck = createManualCoreDeck({
    deckName: "MC",
    card: { cardType: "multiple-choice", front: "Welche?", back: "A und B", answerOptions: ["A", "B", "C"], correctAnswers: ["A", "B"] },
  });
  assert.deepEqual(deck.cards[0].meta.answerOptions, ["A", "B", "C"]);
  assert.deepEqual(deck.cards[0].meta.correctAnswers, ["A", "B"]);
});

test("Kartenänderungen erzeugen keinen wiederherstellbaren Verlauf", () => {
  const card = saveCardEditorValue(createBasicLearningItem("deck", "Alt", "Antwort"), { cardType: "basic", front: "Neu", back: "Antwort", tags: [] });
  assert.equal(card.originalFront, "Neu");
  assert.equal("versionLog" in card, false);
  assert.equal("immutableOriginal" in card, false);
});

test("Neuplanung ändert in allen Phasen nur dueAt und updatedAt", () => {
  for (const phase of ["new", "learning", "relearning", "review"] as ReviewSchedulerState[]) {
    const card = createBasicLearningItem("deck", phase, "A", {
      reviewState: createReviewState({ state: phase, dueAt: "2026-08-20T04:00:00.000Z", repetitions: 4, stability: 12, difficulty: 5 }),
    });
    const before = structuredClone(card.reviewState);
    const updated = rescheduleLearningItem(card, "2026-08-24T04:00:00.000Z", "2026-08-21T10:00:00.000Z");
    assert.deepEqual({ ...updated.reviewState, dueAt: before.dueAt }, before);
    assert.equal(updated.reviewState.dueAt, "2026-08-24T04:00:00.000Z");
    assert.equal(updated.updatedAt, "2026-08-21T10:00:00.000Z");
    assert.deepEqual(updated.variants, card.variants);
  }
});

test("identischer Termin ist ein No-op", () => {
  const card = createBasicLearningItem("deck", "Q", "A", { reviewState: createReviewState({ dueAt: "2026-08-24T04:00:00.000Z" }) });
  assert.equal(rescheduleLearningItem(card, card.reviewState.dueAt, "2026-08-21T10:00:00.000Z"), card);
});

test("Normalisierung erhält Sync-Metadaten und KI-Varianten", () => {
  const card = addRephrasedVariant(createBasicLearningItem("deck", "Q", "A"), "Q2", "A2", { id: "variant" });
  const deck = normalizeCoreDeck({ id: "deck", revision: 8, updatedByDeviceId: "device-a", cards: [{ ...card, revision: 5 }] });
  assert.equal(deck.revision, 8);
  assert.equal(deck.cards[0].revision, 5);
  assert.equal(deck.cards[0].variants[0].cardId, deck.cards[0].id);
});
