import assert from "node:assert/strict";
import test from "node:test";
import { addCardVariant, createBasicNote, createCoreDeck } from "./coreModel.ts";
import { answerVariant } from "./reviewService.ts";
import {
  createCloudStateRows,
  deckToCloudRow,
  hydrateAccountCards,
  loadReimportTargets,
  recordAtomicReview,
  reviewEventToCloudRow,
} from "./cloudRepository.ts";
import type { ReviewEvent } from "./coreTypes.ts";
import { noteFromRow, validateAccountRows, validateOfflineManifestRows } from "./cloudRepositoryValidation.ts";

const now = "2026-08-21T10:00:00.000Z";

function fixture() {
  const created = createBasicNote("deck", "Frage", "Antwort", { createdAt: now });
  const note = { ...created.note, id: "note" };
  const card = { ...created.cards[0], id: "card", noteId: note.id };
  const event: ReviewEvent = {
    id: "review",
    userId: "user",
    deckId: "deck",
    cardId: card.id,
    variantId: null,
    rating: "good",
    answeredAt: now,
    responseTimeMs: 500,
    schedulerBefore: { card: card.study },
    schedulerAfter: { card: card.study },
    flags: {},
    createdAt: now,
  };
  const deck = createCoreDeck({ id: "deck", ownerId: "user", cards: [card], reviewEvents: [event], createdAt: now, updatedAt: now });
  const rows = createCloudStateRows({ decks: [deck], notes: [note] }, "user");
  return { note, card, deck, event, rows };
}

test("Karten tragen nur Identität und Lernstand; der Inhalt liegt einmal in notes", () => {
  const { rows, note } = fixture();
  assert.deepEqual(Object.keys(rows).sort(), ["card_variants", "cards", "decks", "note_sources", "note_type_sources", "notes", "review_events"]);
  assert.equal(rows.cards[0].note_id, note.id);
  assert.equal(rows.cards[0].study_revision, 0);
  for (const field of ["content", "media", "original_front", "version_log"]) assert.equal(field in rows.cards[0], false, field);
  assert.deepEqual(rows.notes[0].content, note.content);
  assert.equal(rows.notes[0].sort_text, "Frage");
  assert.equal("version_log" in rows.decks[0], false);
});

test("manuelle Neuplanung wird als normales Review-Ereignis serialisiert", () => {
  const { deck, card } = fixture();
  const event: ReviewEvent = {
    id: "manual",
    userId: "user",
    deckId: deck.id,
    cardId: card.id,
    variantId: null,
    rating: "manual",
    answeredAt: now,
    responseTimeMs: null,
    schedulerBefore: { dueAt: "2026-08-20T04:00:00.000Z" },
    schedulerAfter: { dueAt: "2026-08-24T04:00:00.000Z" },
    flags: { kind: "manual_reschedule" },
    createdAt: now,
  };
  const row = reviewEventToCloudRow(event, "user");
  assert.equal(row.rating, "manual");
  assert.equal(row.card_id, card.id);
  assert.equal(row.deck_id, deck.id);
  assert.deepEqual(row.scheduler_before, event.schedulerBefore);
  assert.deepEqual(row.scheduler_after, event.schedulerAfter);
});

test("atomare Reviews senden nur den Lernstand und übernehmen studyRevision statt revision", async () => {
  const { rows, deck, card } = fixture();
  const result = answerVariant(deck, card.id, null, "good", { now });
  let parameters: Record<string, any> | null = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    from: () => ({}),
    rpc: async (name: string, input: Record<string, any>) => {
      assert.equal(name, "record_review_atomic");
      parameters = input;
      return { data: {
        card: { ...rows.cards[0], ...input.p_study, study_revision: rows.cards[0].study_revision + 1 },
        variant: null,
        event: { ...input.p_event },
      }, error: null };
    },
  };

  const acknowledgement = await recordAtomicReview(client, { card: result.updatedCard, variant: null, event: result.event }, { deviceId: "device", mutationId: "mutation" });

  const sent = parameters as Record<string, any> | null;
  assert.ok(sent);
  assert.equal(sent.p_card_id, card.id);
  assert.equal(sent.p_study.state, result.updatedCard.study.state);
  assert.equal(sent.p_study.due_at, result.updatedCard.study.dueAt);
  assert.equal("revision" in sent.p_study, false);
  assert.equal("study_revision" in sent.p_study, false);
  assert.equal("p_variant_review_state" in sent, false);
  assert.equal(sent.p_event.card_id, card.id);
  assert.equal(acknowledgement.acknowledgedMutationId, "mutation");
  assert.equal(acknowledgement.entities.card.studyRevision, card.studyRevision + 1);
  assert.equal(acknowledgement.entities.card.revision, card.revision);
  assert.equal(acknowledgement.entities.card.study.dueAt, result.updatedCard.study.dueAt);
});

test("Deckserialisierung bleibt eine schlanke Statuszeile", () => {
  const { deck } = fixture();
  const row = deckToCloudRow(deck, "user");
  assert.equal(row.id, deck.id);
  assert.equal("cards" in row, false);
  assert.equal("reviewEvents" in row, false);
  assert.equal("version_log" in row, false);
});

test("Cloudzeilen weisen ungültige Revisionen und JSONB-Strukturen vor der Übernahme zurück", () => {
  const { rows } = fixture();
  const card = rows.cards[0];
  const note = rows.notes[0];
  assert.equal(validateAccountRows("cards", [card]).length, 1);
  assert.equal(validateAccountRows("notes", [note]).length, 1);
  assert.throws(() => validateAccountRows("cards", { card }), /ungültiges Format/);
  for (const change of [
    { revision: 0 }, { revision: 1.5 }, { study_revision: -1 }, { study_revision: 1.5 },
    { study_extra: null }, { status: "deleted" }, { anki_flag: 8 }, { note_id: null },
  ]) assert.throws(() => validateAccountRows("cards", [{ ...card, ...change }]), /ungültiges Format/, JSON.stringify(change));
  for (const change of [
    { content_revision: 0 }, { imported_content_revision: 1.5 }, { content: [] }, { media: { "bild.png": "kein-hash" } }, { marked: "ja" },
  ]) assert.throws(() => validateAccountRows("notes", [{ ...note, ...change }]), /ungültiges Format/, JSON.stringify(change));
  assert.throws(() => noteFromRow({ ...note, content: { schemaVersion: 1, fields: [] } }), /ungültig/);
});

test("Offline-Manifeste akzeptieren leere Medien, aber keine beschädigten Revisionen oder Hashes", () => {
  const card = { id: "card", bodyRevision: 1, studyRevision: 0, dependencyRevision: 1, bodyBytes: 0, updatedAt: now };
  const media = { sha1: "a".repeat(40), size: 0, mimeType: "image/png", originalName: "bild.png", storagePath: "user/bild.png", createdAt: now };
  assert.deepEqual(validateOfflineManifestRows({ cards: [card], media: [media] }), { cards: [card], media: [media] });
  assert.deepEqual(validateOfflineManifestRows({ cards: [], media: [] }), { cards: [], media: [] });
  for (const change of [{ bodyRevision: 0 }, { studyRevision: -1 }, { dependencyRevision: 1.5 }, { bodyBytes: -1 }]) {
    assert.throws(() => validateOfflineManifestRows({ cards: [{ ...card, ...change }], media: [] }), /ungültiges Format/);
  }
  for (const change of [{ sha1: "kein-hash" }, { size: -1 }]) {
    assert.throws(() => validateOfflineManifestRows({ cards: [], media: [{ ...media, ...change }] }), /ungültiges Format/);
  }
});

test("Kartenkörper kommen mit Inhalten und Varianten; Inhalt-IDs laden alle Geschwister", async () => {
  const { note, card, deck } = fixture();
  const withVariant = addCardVariant(card, { front: "Umformuliert", back: "Antwort" }, now);
  const sibling = { ...card, id: "card-sibling", promptKey: "reverse", deckId: "deck-other" };
  const rows = createCloudStateRows({ decks: [{ ...deck, cards: [withVariant] }, createCoreDeck({ id: "deck-other", cards: [sibling] })], notes: [note] }, "user");
  const requests: unknown[] = [];
  const client = {
    async rpc(name: string, input: { p_card_ids: string[]; p_note_ids: string[] }) {
      assert.equal(name, "hydrate_account_cards");
      requests.push(input);
      return { data: { cards: rows.cards, variants: rows.card_variants, notes: rows.notes }, error: null };
    },
  };

  const result = await hydrateAccountCards(client, [card.id, card.id], [note.id]);

  assert.deepEqual(requests, [{ p_card_ids: [card.id], p_note_ids: [note.id] }]);
  assert.deepEqual(result.cards.map((entry) => [entry.id, entry.deckId, entry.variants.length]), [[card.id, deck.id, 1], ["card-sibling", "deck-other", 0]]);
  assert.deepEqual(result.notes.map((entry) => entry.id), [note.id]);
  await assert.rejects(() => hydrateAccountCards(client, Array.from({ length: 51 }, (_, index) => `card-${index}`)), /Höchstens 50/);
});

test("Reimport-Ziele liefern Inhalte, Karten mit Anki-Karten-ID und Vorlagen", async () => {
  const { rows } = fixture();
  const importedNote = { ...rows.notes[0], source: "anki-apkg", anki_guid: "guid-1", imported_content_revision: 1 };
  const guidsRequested: string[][] = [];
  const client = {
    async rpc(name: string, input: { p_guids: string[] }) {
      assert.equal(name, "load_reimport_targets");
      guidsRequested.push(input.p_guids);
      return { data: {
        notes: [importedNote],
        cards: [
          { id: "card", noteId: "note", deckId: "deck", promptKey: "forward", ankiCardId: "1700000000001" },
          { id: "card-2", noteId: "note", deckId: "deck", promptKey: "reverse", ankiCardId: null },
        ],
        noteTypeSources: [{ id: "source", ankiNotetypeId: "1600000000000" }],
      }, error: null };
    },
  };

  const targets = await loadReimportTargets(client, ["guid-1", "guid-1", ""]);

  assert.deepEqual(guidsRequested, [["guid-1"]]);
  assert.equal(targets.notes[0].ankiGuid, "guid-1");
  assert.equal(targets.notes[0].importedContentRevision, 1);
  assert.deepEqual(targets.cards.map((card) => card.ankiCardId), ["1700000000001", null]);
  assert.deepEqual(targets.noteTypeSources, [{ id: "source", ankiNotetypeId: "1600000000000" }]);
  const invalid = { async rpc() { return { data: { notes: [], cards: [{ id: "card" }], noteTypeSources: [] }, error: null }; } };
  await assert.rejects(() => loadReimportTargets(invalid, ["guid-1"]), /ungültige Karte/);
});
