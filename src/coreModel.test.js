import assert from "node:assert/strict";
import test from "node:test";
import { acceptAiDraftDeck, createAiDraftDeck, createManualCoreDeck, normalizeCoreDeck, updateCardContent } from "./coreModel.js";

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
