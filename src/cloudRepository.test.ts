import assert from "node:assert/strict";
import test from "node:test";
import { createBasicLearningItem, createCoreDeck } from "./coreModel.ts";
import { createCloudStateRows, deckToCloudRow, recordAtomicReview, reviewEventToCloudRow } from "./cloudRepository.ts";
import type { ReviewEvent } from "./coreTypes.ts";
import { validateAccountRows, validateOfflineManifestRows } from "./cloudRepositoryValidation.ts";

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

test("Cloudzeilen weisen ungültige Revisionen und JSONB-Strukturen vor der Übernahme zurück", () => {
  const card = { ...fixture().rows.cards[0], sync_change_id: 1 };
  assert.equal(validateAccountRows("cards", [card]).length, 1);
  assert.throws(() => validateAccountRows("cards", { card }), /Zeilenformat/);
  for (const change of [
    { sync_change_id: 0 }, { sync_change_id: Number.MAX_SAFE_INTEGER + 1 },
    { content_revision: 0 }, { content_revision: 1.5 },
    { content_document: null }, { projection: [] }, { media_refs: [7] },
  ]) assert.throws(() => validateAccountRows("cards", [{ ...card, ...change }]), /ungültiges Format/, JSON.stringify(change));
});

test("Offline-Manifeste akzeptieren leere Medien, aber keine beschädigten Revisionen oder Hashes", () => {
  const card = { id: "card", bodyRevision: 1, dependencyRevision: 1, bodyBytes: 0, updatedAt: now };
  const media = { id: "media", sha1: "a".repeat(40), size: 0, mimeType: "image/png", originalName: "bild.png", storageBucket: "media", storagePath: "user/bild.png", cardId: card.id, updatedAt: now };
  assert.deepEqual(validateOfflineManifestRows({ cards: [card], media: [media] }), { cards: [card], media: [media] });
  assert.deepEqual(validateOfflineManifestRows({ cards: [], media: [] }), { cards: [], media: [] });
  for (const change of [{ bodyRevision: 0 }, { dependencyRevision: 1.5 }, { bodyBytes: -1 }]) {
    assert.throws(() => validateOfflineManifestRows({ cards: [{ ...card, ...change }], media: [] }), /ungültiges Format/);
  }
  for (const change of [{ sha1: "kein-hash" }, { size: -1 }]) {
    assert.throws(() => validateOfflineManifestRows({ cards: [], media: [{ ...media, ...change }] }), /ungültiges Format/);
  }
});
