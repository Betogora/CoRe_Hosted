import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { addCardVariant, createBasicNote, createCoreDeck } from "./coreModel.ts";
import { answerVariant } from "./reviewService.ts";
import {
  createCloudStateRows,
  deckToCloudRow,
  hydrateAccountCards,
  listAccountCardStudyStates,
  loadReimportTargets,
  recordAtomicReview,
  reviewEventToCloudRow,
  streamAccountCatalogChanges,
} from "./cloudRepository.ts";
import type { CloudClient } from "./cloudRepository.ts";
import type { ReviewEvent } from "./coreTypes.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import {
  noteFromRow,
  validateAccountRows,
  validateOfflineManifestRows,
  validateRevisionAcknowledgements,
  validateSyncConflictRows,
} from "./cloudRepositoryValidation.ts";
import { createIndexedDbCoreRepository } from "./indexedDbCoreRepository.ts";
import { createAccountSyncEngine } from "./syncEngine.ts";

Object.assign(globalThis, { IDBKeyRange });

/** A fake implements only what the tested function calls. */
function fakeCloudClient(fake: object) {
  return fake as CloudClient;
}

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
  const client = fakeCloudClient({
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
  });

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

test("Konfliktzeilen werden geprüft; erlaubte null-Werte bleiben gültig, fremde JSON-Werte zählen als leere Zeile", () => {
  const row = {
    id: "konflikt", user_id: "user", entity_table: "cards", entity_id: "card", base_revision: 1, local_revision: 2, remote_revision: 3,
    local_value: { id: "card", deck_id: "a" }, remote_value: { id: "card", deck_id: "b" }, status: "open", resolution: {},
    updated_by_device_id: "device", created_at: now, resolved_at: null,
  };
  assert.deepEqual(validateSyncConflictRows([row]), [row]);
  const nullable = { ...row, base_revision: null, local_revision: null, remote_revision: null, updated_by_device_id: null, resolved_at: null };
  assert.deepEqual(validateSyncConflictRows([nullable]), [nullable]);
  assert.deepEqual(validateSyncConflictRows([{ ...row, local_value: null, remote_value: [1] }])[0].local_value, {});
  const { entity_id: _missing, ...withoutEntity } = row;
  for (const invalid of [withoutEntity, { ...row, status: "gelöscht" }, { ...row, base_revision: "1" }, { ...row, created_at: null }]) {
    assert.throws(() => validateSyncConflictRows([invalid]), /Synchronisierungskonflikte aus der Cloud hatten ein ungültiges Format/, JSON.stringify(invalid));
  }
});

test("Quittierungen prüfen Revision, Zeitpunkte und Gerät und lassen die übrige Zeile durch", () => {
  const acknowledgement = { id: "deck", revision: 2, updated_at: now, deleted_at: null, updated_by_device_id: null, name: "Stapel" };
  assert.deepEqual(validateRevisionAcknowledgements([acknowledgement]), [acknowledgement]);
  assert.deepEqual(validateRevisionAcknowledgements([{ ...acknowledgement, deleted_at: now, updated_by_device_id: "device" }])[0].deleted_at, now);
  const { revision: _missing, ...withoutRevision } = acknowledgement;
  for (const invalid of [withoutRevision, { ...acknowledgement, revision: "2" }, { ...acknowledgement, revision: 0 }, { ...acknowledgement, updated_at: null }, { ...acknowledgement, deleted_at: 5 }]) {
    assert.throws(() => validateRevisionAcknowledgements([invalid]), /Die Cloud-Bestätigung einer Änderung hatte ein ungültiges Format/, JSON.stringify(invalid));
  }
});

/** Answers every table query from `answer`; the operation is the write the query started with, else `select`. */
function fakeTableClient(userId: string, answer: (table: string, operation: "select" | "insert" | "update" | "upsert") => unknown[]) {
  return fakeCloudClient({
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      let operation: "select" | "insert" | "update" | "upsert" = "select";
      const query = {
        select: () => query, eq: () => query, in: () => query, gt: () => query, order: () => query, limit: () => query,
        insert: () => { operation = "insert"; return query; },
        update: () => { operation = "update"; return query; },
        upsert: () => { operation = "upsert"; return query; },
        maybeSingle: async () => ({ data: answer(table, operation)[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data: answer(table, operation), error: null }).then(resolve, reject),
      };
      return query;
    },
  });
}

test("eine ungültige Cloud-Bestätigung lässt lokale Revision und Outbox unverändert", async () => {
  const userId = randomUUID();
  const deck = createCoreDeck({ id: "deck-quittung", ownerId: userId, name: "Quittung", createdAt: now, updatedAt: now });
  const initialState = { version: 6, profile: { userId, uiPreferences: {} }, decks: [deck], notes: [], updatedAt: now } as unknown as WorkspaceState;
  const open = () => createIndexedDbCoreRepository({ userId, initialState, indexedDb: indexedDB as unknown as IDBFactory });
  const localRevision = async () => {
    const reopened = await open();
    const revision = reopened.getShellState().decks.find((candidate) => candidate.id === deck.id)?.revision;
    reopened.close();
    return revision;
  };
  const repository = await open();
  repository.updateDeckSettings(deck.id, {});
  await repository.flush();
  const remote = { ...deckToCloudRow(deck, userId), name: "Vorher", revision: 1, sync_change_id: 1 };
  let acknowledgedRevision: unknown = "zwei";
  const client = fakeTableClient(userId, (table, operation) => table !== "decks" ? []
    : operation === "update" ? [{ ...remote, revision: acknowledgedRevision, updated_at: now, updated_by_device_id: "device-quittung" }]
      : [remote]);
  const engine = createAccountSyncEngine(client, {
    userId, device: { id: "device-quittung", label: "Test", userAgent: "Test" }, outbox: repository.outbox,
    persistMutationAcknowledgements: repository.persistMutationAcknowledgements, documentTarget: null,
  });
  const before = await localRevision();

  await assert.rejects(engine.flush({ force: true }), /Die Cloud-Bestätigung einer Änderung hatte ein ungültiges Format/);
  await repository.flush();
  assert.equal(await localRevision(), before, "die ungültige Quittierung wird nicht übernommen");
  assert.equal(repository.outbox.count(), 1, "die Änderung wartet weiter auf eine gültige Bestätigung");

  acknowledgedRevision = 2;
  await engine.flush({ force: true });
  await repository.flush();
  assert.equal(await localRevision(), 2, "eine gültige Quittierung übernimmt die Revision");
  assert.equal(repository.outbox.count(), 0);
  repository.close();
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
  const client = fakeCloudClient({
    async rpc(name: string, input: { p_card_ids: string[]; p_note_ids: string[] }) {
      assert.equal(name, "hydrate_account_cards");
      requests.push(input);
      return { data: { cards: rows.cards, variants: rows.card_variants, notes: rows.notes }, error: null };
    },
  });

  const result = await hydrateAccountCards(client, [card.id, card.id], [note.id]);

  assert.deepEqual(requests, [{ p_card_ids: [card.id], p_note_ids: [note.id] }]);
  assert.deepEqual(result.cards.map((entry) => [entry.id, entry.deckId, entry.variants.length]), [[card.id, deck.id, 1], ["card-sibling", "deck-other", 0]]);
  assert.deepEqual(result.notes.map((entry) => entry.id), [note.id]);
  await assert.rejects(() => hydrateAccountCards(client, Array.from({ length: 51 }, (_, index) => `card-${index}`)), /Höchstens 50/);
});

test("Lernstände ganzer Stapel kommen ohne Kartenkörper und seitenweise nach Karten-ID", async () => {
  const row = (index: number) => ({
    card_id: `card-${String(index).padStart(5, "0")}`, deck_id: "deck-a", note_id: `note-${index}`, status: "active", state: "review",
    due_at: "2026-10-20T08:00:00+00:00", stability: 12.5, difficulty: 4.2, reps: 3, lapses: 1, interval_days: 9, learning_step_index: 0,
    last_reviewed_at: "2026-10-11T08:00:00+00:00", last_rating: "good", study_revision: 4, active_variant_count: 2,
    created_at: "2026-10-01T08:00:00+00:00", stability_fast: 9.5,
  });
  const requests: Array<Record<string, unknown>> = [];
  const client = fakeCloudClient({
    async rpc(name: string, input: Record<string, unknown>) {
      assert.equal(name, "list_account_card_study_states");
      requests.push(input);
      const start = input.p_after_card_id ? 2000 : 0;
      return { data: Array.from({ length: start ? 3 : 2000 }, (_, index) => row(start + index)), error: null };
    },
  });

  const snapshots = await listAccountCardStudyStates(client, ["deck-a", "deck-a", ""]);

  assert.equal(snapshots.length, 2003);
  assert.deepEqual(requests, [
    { p_deck_ids: ["deck-a"], p_after_card_id: null, p_limit: 2000 },
    { p_deck_ids: ["deck-a"], p_after_card_id: "card-01999", p_limit: 2000 },
  ]);
  assert.deepEqual(snapshots[0], {
    cardId: "card-00000", deckId: "deck-a", noteId: "note-0", status: "active",
    study: { state: "review", dueAt: "2026-10-20T08:00:00+00:00", stability: 12.5, difficulty: 4.2, reps: 3, lapses: 1, intervalDays: 9, learningStepIndex: 0, lastReviewedAt: "2026-10-11T08:00:00+00:00", lastRating: "good" },
    studyRevision: 4,
    activeVariantCount: 2,
    createdAt: "2026-10-01T08:00:00+00:00",
    stabilityFast: 9.5,
  });
  assert.deepEqual(await listAccountCardStudyStates(client, []), []);
  assert.equal(requests.length, 2, "ohne Stapel entsteht keine Anfrage");
  const invalid = fakeCloudClient({ async rpc() { return { data: [{ ...row(0), stability: -1 }], error: null }; } });
  await assert.rejects(() => listAccountCardStudyStates(invalid, ["deck-a"]), /Lernstände/);
});

test("Reimport-Ziele liefern Inhalte, Karten mit Anki-Karten-ID und Vorlagen", async () => {
  const { rows } = fixture();
  const importedNote = { ...rows.notes[0], source: "anki-apkg", anki_guid: "guid-1", imported_content_revision: 1 };
  const guidsRequested: string[][] = [];
  const client = fakeCloudClient({
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
  });

  const targets = await loadReimportTargets(client, ["guid-1", "guid-1", ""]);

  assert.deepEqual(guidsRequested, [["guid-1"]]);
  assert.equal(targets.notes[0].ankiGuid, "guid-1");
  assert.equal(targets.notes[0].importedContentRevision, 1);
  assert.deepEqual(targets.cards.map((card) => card.ankiCardId), ["1700000000001", null]);
  assert.deepEqual(targets.noteTypeSources, [{ id: "source", ankiNotetypeId: "1600000000000" }]);
  const invalid = fakeCloudClient({ async rpc() { return { data: { notes: [], cards: [{ id: "card" }], noteTypeSources: [] }, error: null }; } });
  await assert.rejects(() => loadReimportTargets(invalid, ["guid-1"]), /ungültige Karte/);
});

test("jede Delta-Seite kommt mit allen Tabellen in einem Aufruf, Suchtexte zuletzt", async () => {
  const delta = (rows: unknown[]) => fakeCloudClient({
    async rpc() {
      return { data: { changes: rows.map((row) => ({ table: "note_search", row })), nextCursor: 9, hasMore: false }, error: null };
    },
  });
  const calls: Array<Array<{ table: string; entities: unknown[] }>> = [];
  const cursor = await streamAccountCatalogChanges(delta([{ note_id: "note-1", search_text: "Herz MUSKEL", search_fields: [{ n: "vorderseite", t: "Herz" }], deleted_at: null, sync_change_id: 9 }]), 0, async (pages) => {
    calls.push(pages);
  });

  assert.equal(cursor, 9);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map((page) => page.table), ["decks", "card_catalog", "deck_study_summaries", "note_type_sources", "note_search"]);
  assert.deepEqual(calls[0].at(-1), { table: "note_search", entities: [{ noteId: "note-1", searchText: "herz muskel", searchFields: [{ name: "vorderseite", text: "herz" }], deletedAt: null }], reset: false, cursor: 9 });
  await assert.rejects(streamAccountCatalogChanges(delta([{ note_id: "note-1" }]), 0, async () => undefined), /Suchtexte/);
});

test("die nächste Delta-Seite lädt, während die vorige geschrieben wird; ein Schreibfehler beendet den Abgleich", async () => {
  const requested: number[] = [];
  const client = fakeCloudClient({
    async rpc(_name: string, { p_cursor }: { p_cursor: number }) {
      requested.push(p_cursor);
      return { data: { changes: [], nextCursor: p_cursor + 1, hasMore: p_cursor < 2 }, error: null };
    },
  });
  const applied: number[] = [];
  const cursor = await streamAccountCatalogChanges(client, 0, async (pages) => {
    assert.ok(requested.includes(pages[0].cursor) || pages[0].cursor === 3, "die Folgeseite ist schon angefragt");
    applied.push(pages[0].cursor);
  });
  assert.equal(cursor, 3);
  assert.deepEqual(applied, [1, 2, 3]);
  assert.deepEqual(requested, [0, 1, 2]);

  applied.length = 0;
  await assert.rejects(streamAccountCatalogChanges(client, 0, async (pages) => {
    applied.push(pages[0].cursor);
    throw new Error("Schreiben fehlgeschlagen");
  }), /Schreiben fehlgeschlagen/);
  assert.deepEqual(applied, [1], "nach dem Fehler wird keine vorgeladene Seite mehr geschrieben");
});

test("Katalogzeilen bringen Lernverlauf und Werte mit, ein Server ohne sie bleibt lesbar", async () => {
  const row = {
    id: "card-1", deck_id: "deck-1", note_id: "note-1", front_preview: "Herz", sort_text: "herz", due_at: null,
    schedule_state: "review", maturity_band: "young", reviewable: true, marked: false, anki_flag: 0, leeched: false,
    tag_keys: [], has_active_variants: false, active_variant_count: 0, active_variant_id: null, body_revision: 1,
    study_revision: 2, dependency_revision: 1, sync_change_id: 4, deleted_at: null, updated_at: "2026-11-05T08:00:00+00:00",
  };
  const history = {
    created_at: "2026-11-01T08:00:00+00:00", edited_at: "2026-11-02T08:00:00+00:00", content_kind: "cloze",
    interval_days: 12, difficulty: 6.5, reps: 4, lapses: 1, first_reviewed_at: "2026-11-01T09:00:00+00:00",
    last_again_at: "2026-11-03T09:00:00+00:00", last_hard_at: null, last_good_at: "2026-11-04T09:00:00+00:00",
    last_easy_at: null, last_rescheduled_at: null, note_type_id: "nt-1", has_outdated_variants: true,
    prompt_ordinal: 2, last_buried_at: "2026-11-05T07:00:00+00:00", last_unburied_at: null,
  };
  const delta = fakeCloudClient({ async rpc() { return { data: { changes: [{ table: "card_catalog", row: { ...row, ...history } }, { table: "card_catalog", row: { ...row, id: "card-2" } }], nextCursor: 4, hasMore: false }, error: null }; } });
  const pages: Array<{ table: string; entities: any[] }> = [];
  await streamAccountCatalogChanges(delta, 0, async (delivered) => { pages.push(...delivered); });

  const [withHistory, withoutHistory] = pages.find((page) => page.table === "card_catalog")!.entities;
  assert.deepEqual(
    [withHistory.contentKind, withHistory.intervalDays, withHistory.difficulty, withHistory.reps, withHistory.lapses, withHistory.lastAgainAt, withHistory.lastHardAt, withHistory.noteTypeId, withHistory.hasOutdatedVariants, withHistory.promptOrdinal, withHistory.lastBuriedAt],
    ["cloze", 12, 6.5, 4, 1, "2026-11-03T09:00:00+00:00", null, "nt-1", true, 2, "2026-11-05T07:00:00+00:00"],
  );
  assert.equal(withoutHistory.firstReviewedAt, undefined, "ohne Migration fehlt der Verlauf, die Zeile bleibt gültig");
});
