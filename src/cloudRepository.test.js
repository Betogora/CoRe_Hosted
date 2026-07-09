import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck, getOriginalVariant } from "./coreModel.js";
import { ACCOUNT_UPSERT_CONFLICT, cardToCloudRow, createCloudStateRows, deckToCloudRow, reviewEventToCloudRow, variantToCloudRow } from "./cloudRepository.js";

test("cloud repository maps deck and card rows to production table fields", () => {
  const card = createBasicLearningItem("deck_cloud", "Was ist ATP?", "Ein Energieträger.", {
    tags: ["biochemie"],
    reviewState: {
      state: "review",
      repetitions: 2,
      dueAt: "2026-07-10T08:00:00.000Z",
    },
  });
  const deck = createCoreDeck({
    id: "deck_cloud",
    name: "Cloud Deck",
    source: "json-import",
    cards: [card],
    deckSettings: { coreMode: "manual", appearance: { iconKey: "brain", iconColor: "#047857" } },
  });

  const deckRow = deckToCloudRow(deck, "user-1");
  const cardRow = cardToCloudRow(deck.cards[0], deck, "user-1");

  assert.equal(deckRow.source, "json-import");
  assert.equal(deckRow.user_id, "user-1");
  assert.equal(deckRow.card_count, 1);
  assert.deepEqual(deckRow.deck_settings.appearance, { iconKey: "brain", iconColor: "#047857" });
  assert.equal(cardRow.deck_id, "deck_cloud");
  assert.equal(cardRow.kind, "basic");
  assert.equal(cardRow.review_state.repetitions, 2);
});

test("cloud repository stores original variants explicitly", () => {
  const card = createBasicLearningItem("deck_cloud", "Front", "Back");
  const original = getOriginalVariant(card);
  const row = variantToCloudRow(original, card, "user-1");

  assert.equal(row.card_id, card.id);
  assert.equal(row.transform_type, "original");
  assert.equal(row.generation_source, "original");
  assert.equal(row.is_original, true);
  assert.equal(row.is_active, true);
  assert.equal(row.variant_level, 1);
});

test("cloud repository maps review events without leaking local owner ids", () => {
  const deck = createCoreDeck({ id: "deck_cloud", name: "Cloud Deck", source: "manual", cards: [] });
  const row = reviewEventToCloudRow(
    {
      id: "review_1",
      userId: "local-user",
      deckId: deck.id,
      reviewableType: "card",
      reviewableId: "card_1",
      rating: "good",
      answeredAt: "2026-07-09T08:00:00.000Z",
    },
    deck,
    "user-1",
  );

  assert.equal(row.user_id, "user-1");
  assert.equal(row.deck_id, deck.id);
  assert.equal(row.reviewable_id, "card_1");
  assert.equal(row.rating, "good");
});

test("cloud repository scopes identical local ids by account", () => {
  const deck = createCoreDeck({
    id: "same_local_deck_id",
    name: "Account Deck",
    source: "manual",
    cards: [createBasicLearningItem("same_local_deck_id", "Front", "Back", { id: "same_local_card_id" })],
  });

  const rowsA = createCloudStateRows({ decks: [deck], documents: [], aiJobs: [] }, "user-a");
  const rowsB = createCloudStateRows({ decks: [deck], documents: [], aiJobs: [] }, "user-b");

  assert.equal(ACCOUNT_UPSERT_CONFLICT, "user_id,id");
  assert.equal(rowsA.decks[0].id, rowsB.decks[0].id);
  assert.equal(rowsA.decks[0].user_id, "user-a");
  assert.equal(rowsB.decks[0].user_id, "user-b");
  assert.equal(rowsA.cards[0].id, rowsB.cards[0].id);
  assert.equal(rowsA.cards[0].user_id, "user-a");
  assert.equal(rowsB.cards[0].user_id, "user-b");
});
