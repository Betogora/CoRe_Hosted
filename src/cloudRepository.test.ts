import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import { createCloudStateRows, deckToCloudRow, recordAtomicReview, reviewEventToCloudRow } from "./cloudRepository.ts";
import type { ReviewEvent } from "./coreTypes.ts";

const now = "2026-08-21T10:00:00.000Z";

function fixture() {
  const card = createBasicLearningItem("deck", "Frage", "Antwort", { id: "card", updatedAt: now, createdAt: now });
  const event: ReviewEvent = {
    id: "review",
    userId: "user",
    deckId: "deck",
    learningItemId: card.id,
    variantId: null,
    reviewableType: "card",
    reviewableId: card.id,
    sourceCardId: card.id,
    rating: "good",
    answeredAt: now,
    responseTimeMs: 500,
    schedulerBefore: { card: card.reviewState },
    schedulerAfter: { card: card.reviewState },
    flags: {},
    createdAt: now,
  };
  const deck = createCoreDeck({ id: "deck", ownerId: "user", cards: [card], reviewEvents: [event], createdAt: now, updatedAt: now });
  const rows = createCloudStateRows({ decks: [deck], noteTypeDefinitions: [] }, "user");
  return { card, deck, event, rows };
}

test("Cloudzeilen enthalten weder Verlauf noch Notiz- oder Quelldokumentfelder", () => {
  const { rows } = fixture();
  assert.deepEqual(Object.keys(rows).sort(), ["card_variants", "cards", "decks", "note_type_definitions", "review_events"]);
  assert.equal("version_log" in rows.decks[0], false);
  assert.equal("note_id" in rows.cards[0], false);
  assert.equal("source_note_id" in rows.cards[0], false);
  assert.equal("latest_source_snapshot_id" in rows.cards[0], false);
  assert.equal("version_log" in rows.cards[0], false);
});

test("manuelle Neuplanung wird als normales Review-Ereignis serialisiert", () => {
  const { deck, card } = fixture();
  const event: ReviewEvent = {
    id: "manual",
    userId: "user",
    deckId: deck.id,
    learningItemId: card.id,
    variantId: null,
    reviewableType: "card",
    reviewableId: card.id,
    sourceCardId: card.id,
    rating: "manual",
    answeredAt: now,
    responseTimeMs: null,
    schedulerBefore: { dueAt: "2026-08-20T04:00:00.000Z" },
    schedulerAfter: { dueAt: "2026-08-24T04:00:00.000Z" },
    flags: { kind: "manual_reschedule" },
    createdAt: now,
  };
  const row = reviewEventToCloudRow(event, deck, "user");
  assert.equal(row.rating, "manual");
  assert.deepEqual(row.scheduler_before, event.schedulerBefore);
  assert.deepEqual(row.scheduler_after, event.schedulerAfter);
});

test("atomare Reviews senden keinen Varianten-Lernstatus", async () => {
  const { rows, deck, card, event } = fixture();
  let parameters: Record<string, unknown> | null = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    from: () => ({}),
    rpc: async (name: string, input: Record<string, unknown>) => {
      assert.equal(name, "record_review_atomic");
      parameters = input;
      return { data: {
        deck: { ...rows.decks[0], sync_change_id: 1 },
        card: { ...rows.cards[0], sync_change_id: 1 },
        variant: null,
        event: { ...rows.review_events[0], sync_change_id: 1 },
      }, error: null };
    },
  };
  const result = await recordAtomicReview(client, { deck, card, variant: null, event }, { deviceId: "device", mutationId: "mutation" });
  assert.equal(parameters && "p_variant_review_state" in parameters, false);
  assert.equal(result.acknowledgedMutationId, "mutation");
});

test("Deckserialisierung bleibt eine schlanke Statuszeile", () => {
  const { deck } = fixture();
  const row = deckToCloudRow(deck, "user");
  assert.equal(row.card_count, 1);
  assert.equal("cards" in row, false);
  assert.equal("version_log" in row, false);
});
