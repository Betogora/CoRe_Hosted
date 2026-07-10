import assert from "node:assert/strict";
import test from "node:test";
import { acceptAiDraftDeck, createAiDraftDeck, createDefaultDeckSettings, createManualCoreDeck, getOriginalVariant, normalizeCoreDeck, updateCardContent } from "./coreModel.js";

test("deck settings normalize appearance defaults and fallbacks", () => {
  const defaults = createDefaultDeckSettings();
  const custom = createDefaultDeckSettings({
    appearance: {
      iconKey: "brain",
      iconColor: "#ABCDEF",
    },
  });
  const fallback = createDefaultDeckSettings({
    appearance: {
      iconKey: "unknown",
      iconColor: "blue",
    },
  });

  assert.deepEqual(defaults.appearance, { iconKey: "book-open", iconColor: "#4f5eb1" });
  assert.deepEqual(custom.appearance, { iconKey: "brain", iconColor: "#abcdef" });
  assert.deepEqual(fallback.appearance, defaults.appearance);
});

test("creates manual cards as immutable accepted originals", () => {
  const deck = createManualCoreDeck({
    deckName: "Manual Biology",
    card: {
      cardType: "basic-reversed",
      front: "ATP",
      back: "Energy carrier",
      tags: "biology cell",
    },
    documentContext: {
      fileName: "chapter.txt",
      selection: "ATP is the energy carrier.",
    },
  });

  assert.equal(deck.source, "manual");
  assert.equal(deck.cardCount, 1);
  assert.equal(deck.cards[0].kind, "basic-reversed");
  assert.equal(deck.cards[0].draftStatus, "accepted");
  assert.equal(deck.cards[0].immutableOriginal.front, "ATP");
  assert.equal(deck.cards[0].coreState.variantCount, 0);
});

test("manual multiple-choice cards keep structured metadata and free-text falls back to basic", () => {
  const mcDeck = createManualCoreDeck({
    deckName: "Manual MC",
    card: {
      cardType: "multiple-choice",
      front: "Welche Antwort ist korrekt?",
      back: "Antwort B ist korrekt.",
      answerOptions: ["Antwort A", "Antwort B", "Antwort C"],
      correctAnswer: "Antwort B",
    },
  });
  const freeTextDeck = createManualCoreDeck({
    deckName: "Manual Free Text",
    card: {
      cardType: "free-text",
      front: "Definiere Osmose.",
      back: "Osmose ist die gerichtete Diffusion von Wasser durch eine semipermeable Membran.",
    },
  });

  const mcCard = mcDeck.cards[0];
  const freeTextCard = freeTextDeck.cards[0];
  assert.equal(mcCard.kind, "multiple-choice");
  assert.deepEqual(mcCard.meta.answerOptions, ["Antwort A", "Antwort B", "Antwort C"]);
  assert.equal(mcCard.meta.correctAnswer, "Antwort B");
  assert.deepEqual(getOriginalVariant(mcCard).answerOptionsJson, ["Antwort A", "Antwort B", "Antwort C"]);
  assert.equal(freeTextCard.kind, "basic");
  assert.equal(freeTextCard.meta.selfCheck, undefined);
  assert.equal(getOriginalVariant(freeTextCard).expectedAnswerJson, freeTextCard.originalBack);
});

test("keeps AI generated cards as drafts until accepted", () => {
  const draftDeck = createAiDraftDeck({
    deckName: "AI Drafts",
    config: {
      language: "Deutsch",
      cardCount: 1,
      cardTypes: ["cloze"],
    },
    drafts: [
      {
        cardType: "cloze",
        front: "{{c1::ATP}} stores energy.",
        back: "ATP stores energy.",
        tags: ["biology"],
      },
    ],
  });

  assert.equal(draftDeck.source, "ai-assisted");
  assert.equal(draftDeck.importMeta.draftOnly, true);
  assert.equal(draftDeck.cards[0].draftStatus, "draft");

  const accepted = acceptAiDraftDeck(draftDeck);
  assert.equal(accepted.importMeta.draftOnly, false);
  assert.equal(accepted.cards[0].draftStatus, "accepted");
  assert.equal(accepted.cards[0].immutableOriginal.front, "{{c1::ATP}} stores energy.");
});

test("normalizing edited decks preserves immutable originals and version history", () => {
  const deck = createManualCoreDeck({
    deckName: "Manual Biology",
    card: {
      cardType: "basic",
      front: "ATP",
      back: "Energy carrier",
      tags: "biology",
    },
  });
  const editedCard = updateCardContent(
    deck.cards[0],
    {
      originalFront: "What is ATP?",
      originalBack: "A short-term cellular energy carrier.",
      originalTags: "biology metabolism",
      kind: "basic",
    },
    "Clarify wording",
  );
  const normalized = normalizeCoreDeck({ ...deck, cards: [editedCard] });
  const card = normalized.cards[0];

  assert.equal(card.originalFront, "What is ATP?");
  assert.equal(card.immutableOriginal.front, "ATP");
  assert.equal(card.versionLog.some((entry) => entry.changeType === "content_updated"), true);
  assert.equal(normalized.versionLog.length, deck.versionLog.length);
});

test("core normalization preserves cloud sync metadata", () => {
  const deck = createManualCoreDeck({
    deckName: "Cloud Metadata",
    card: { cardType: "basic", front: "ATP", back: "Energieträger" },
  });
  const card = deck.cards[0];
  const normalized = normalizeCoreDeck({
    ...deck,
    revision: 8,
    deletedAt: null,
    updatedByDeviceId: "device-a",
    cards: [
      {
        ...card,
        revision: 5,
        updatedByDeviceId: "device-b",
        variants: card.variants.map((variant) => ({ ...variant, revision: 4, updatedByDeviceId: "device-c" })),
      },
    ],
  });

  assert.equal(normalized.revision, 8);
  assert.equal(normalized.updatedByDeviceId, "device-a");
  assert.equal(normalized.cards[0].revision, 5);
  assert.equal(normalized.cards[0].updatedByDeviceId, "device-b");
  assert.equal(normalized.cards[0].variants[0].revision, 4);
  assert.equal(normalized.cards[0].variants[0].updatedByDeviceId, "device-c");
});
