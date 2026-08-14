import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.ts";
import { markConflict } from "../../src/cloudRepository.ts";
import type { PostgrestResponseFailure, PostgrestResponseSuccess } from "@supabase/postgrest-js";
import { Upload } from "tus-js-client";

const TABLES = [
  "profiles",
  "decks",
  "note_type_definitions",
  "cards",
  "card_variants",
  "learning_item_source_snapshots",
  "review_events",
  "source_documents",
  "media_assets",
  "sync_devices",
  "sync_conflicts",
];

function requireEnvironment(name: string) {
  const value = String(process.env[name] ?? "").trim();
  assert.ok(value, `${name} fehlt für den lokalen RLS-Smoke.`);
  return value;
}

function createTestClient(supabaseUrl: string, publishableKey: string) {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function ensureSignedIn(client: SupabaseClient<any,"public","public",any,any>, email: string, password: string) {
  let result = await client.auth.signInWithPassword({ email, password });
  if (result.error) {
    const signup = await client.auth.signUp({ email, password });
    if (signup.error) throw new Error(`Lokaler RLS-Testaccount ${email} konnte nicht angelegt werden: ${signup.error.message}`);
    if (signup.data.session) return signup.data.user;
    result = await client.auth.signInWithPassword({ email, password });
  }

  if (result.error || !result.data.user) {
    throw new Error(`Lokaler RLS-Testaccount ${email} konnte nicht angemeldet werden: ${result.error?.message ?? "kein Nutzer"}`);
  }
  return result.data.user;
}

function assertNoError(result: PostgrestResponseFailure|PostgrestResponseSuccess<any>, context: string) {
  assert.equal(result.error, null, `${context}: ${result.error?.code ?? "Fehler"} ${result.error?.message ?? ""}`);
  return result.data;
}

function assertPostgresError(result: PostgrestResponseFailure|PostgrestResponseSuccess<any[]>|PostgrestResponseSuccess<null>, expectedCode: string, context: string) {
  assert.ok(result.error, `${context}: Anfrage wurde unerwartet erlaubt.`);
  assert.equal(result.error.code, expectedCode, `${context}: ${result.error.message}`);
}

function createFixture(userId: any, prefix: string, marker: string) {
  const deckId = `${prefix}_deck_${marker}`;
  const cardId = `${prefix}_card_${marker}`;

  return {
    profiles: {
      id: userId,
      email: `${marker}@rls.local`,
      display_name: `RLS ${marker}`,
      preferred_language: "de",
      timezone: "Europe/Berlin",
      scheduler_preferences: {},
    },
    decks: {
      id: deckId,
      user_id: userId,
      name: `RLS Deck ${marker}`,
      source: "manual",
    },
    note_type_definitions: {
      id: `${prefix}_note_type_${marker}`,
      user_id: userId,
      name: `RLS Notiztyp ${marker}`,
      definition: { version: 1, fields: [{ id: "front", name: "Vorderseite" }] },
    },
    cards: {
      id: cardId,
      user_id: userId,
      deck_id: deckId,
      source: "manual",
      kind: "basic-with-images",
      note_type_definition_id: `${prefix}_note_type_${marker}`,
      content_document: { version: 1, fields: [{ fieldId: "front", value: `Frage ${marker}` }] },
      content_revision: 1,
      original_front: `Frage ${marker}`,
      original_back: `Antwort ${marker}`,
    },
    card_variants: {
      id: `${prefix}_variant_${marker}`,
      user_id: userId,
      card_id: cardId,
      source_card_id: cardId,
      front: `Variante ${marker}`,
      back: `Antwort ${marker}`,
      generation_source: "original",
      is_original: true,
      transform_type: "original",
      projection: { version: 1, recipeId: "front-back", instanceKey: "front-back" },
      scheduling_mode: "independent-card",
      study_deck_id: deckId,
      render_revision: 1,
    },
    learning_item_source_snapshots: {
      id: `${prefix}_source_snapshot_${marker}`,
      user_id: userId,
      card_id: cardId,
      schema_version: 1,
      source_kind: "legacy-projection",
      import_fingerprint: `fingerprint-${marker}`,
      previous_snapshot_id: null,
      note_type_definition_id: `${prefix}_note_type_${marker}`,
      source_payload: { fields: [{ name: "Vorderseite", value: `Frage ${marker}` }] },
    },
    review_events: {
      id: `${prefix}_review_${marker}`,
      user_id: userId,
      deck_id: deckId,
      reviewable_type: "card",
      reviewable_id: cardId,
      source_card_id: cardId,
      rating: "good",
    },
    source_documents: {
      id: `${prefix}_document_${marker}`,
      user_id: userId,
      file_name: `${marker}.txt`,
      mime_type: "text/plain",
      text: marker,
    },
    media_assets: {
      id: `${prefix}_media_${marker}`,
      user_id: userId,
      deck_id: deckId,
      card_id: cardId,
      sha1: `${marker === "a" ? "a" : "b"}`.repeat(40),
      original_name: `${marker}.png`,
      storage_path: `${userId}/${prefix}/${marker}.png`,
    },
    sync_devices: {
      id: `${prefix}_device_${marker}`,
      user_id: userId,
      label: `Browser ${marker}`,
      user_agent: "CoRe RLS Smoke",
    },
    sync_conflicts: {
      id: `${prefix}_conflict_${marker}`,
      user_id: userId,
      entity_table: "cards",
      entity_id: cardId,
      base_revision: 1,
      local_revision: 2,
      remote_revision: 2,
      local_value: { marker },
      remote_value: { marker },
    },
  };
}

const INSERT_ORDER = TABLES;
const DELETE_ORDER = [...TABLES].reverse();

const UPDATE_CASES = {
  profiles: { column: "university", value: "RLS Universität" },
  decks: { column: "description", value: "aktualisiert" },
  note_type_definitions: { column: "definition", value: { version: 1, verified: true } },
  cards: { column: "original_back", value: "aktualisiert" },
  card_variants: { column: "explanation", value: "aktualisiert" },
  learning_item_source_snapshots: { column: "source_payload", value: { verified: true } },
  review_events: { column: "flags", value: { verified: true } },
  source_documents: { column: "metadata", value: { verified: true } },
  media_assets: { column: "metadata", value: { verified: true } },
  sync_devices: { column: "label", value: "Aktualisierter Browser" },
  sync_conflicts: { column: "resolution", value: { verified: true } },
};

async function insertFixture(client: SupabaseClient<any,"public","public",any,any>, fixture: Record<string, any>) {
  for (const table of INSERT_ORDER) {
    const request = table === "profiles"
      ? client.from(table).upsert(fixture[table], { onConflict: "id" }).select("*").single()
      : client.from(table).insert(fixture[table]).select("*").single();
    assertNoError(await request, `${table}: eigene Fixture anlegen`);
  }
}

async function cleanupFixture(client: SupabaseClient<any,"public","public",any,any>, fixture: Record<string, any>) {
  for (const table of DELETE_ORDER) {
    const id = fixture[table]?.id;
    if (!id) continue;
    await client.from(table).delete().eq("id", id);
  }
}

function forgedRow(row: any, table: string, ownerId: any, prefix: string) {
  if (table === "profiles") return { ...row, id: ownerId, email: `forged-${prefix}@rls.local` };
  return {
    ...row,
    id: `${prefix}_forged_${table}`,
    user_id: ownerId,
    ...(table === "media_assets" ? { storage_path: `${ownerId}/${prefix}/forged.png` } : {}),
  };
}

test("lokales Supabase isoliert Nutzer A, Nutzer B und anon über alle accountgebundenen Tabellen", async (t) => {
  const supabaseUrl = requireEnvironment("VITE_SUPABASE_URL");
  const publishableKey = requireEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY");
  assert.ok(isLocalSupabaseUrl(supabaseUrl), "Der RLS-Smoke darf ausschließlich gegen Loopback-Supabase laufen.");

  const credentialsA = {
    email: requireEnvironment("CORE_E2E_EMAIL"),
    password: requireEnvironment("CORE_E2E_PASSWORD"),
  };
  const credentialsB = {
    email: requireEnvironment("CORE_RLS_USER_B_EMAIL"),
    password: requireEnvironment("CORE_RLS_USER_B_PASSWORD"),
  };
  const clientA = createTestClient(supabaseUrl, publishableKey);
  const clientB = createTestClient(supabaseUrl, publishableKey);
  const anonClient = createTestClient(supabaseUrl, publishableKey);
  const prefix = `rls_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  let fixtureA: Record<string, any> = {};
  let fixtureB: Record<string, any> = {};

  try {
    const userA = await ensureSignedIn(clientA, credentialsA.email, credentialsA.password);
    const userB = await ensureSignedIn(clientB, credentialsB.email, credentialsB.password);
    assert.ok(userB);
    assert.ok(userA);
    assert.notEqual(userA.id, userB.id);
    assert.ok(userA);
    fixtureA = createFixture(userA.id, prefix, "a");
    assert.ok(userB);
    fixtureB = createFixture(userB.id, prefix, "b");
    await insertFixture(clientA, fixtureA);
    await insertFixture(clientB, fixtureB);

    await t.test("eigene Rows sind lesbar und aktualisierbar", async () => {
      for (const table of TABLES) {
        const ownRead = await clientA.from(table).select("*").eq("id", fixtureA[table].id);
        assertNoError(ownRead, `${table}: eigene Row lesen`);
        assert.ok(ownRead);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        assert.equal(ownRead.data.length, 1, `${table}: eigene Row fehlt`);

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        const updateCase = UPDATE_CASES[table];
        const ownUpdate = await clientA
          .from(table)
          .update({ [updateCase.column]: updateCase.value })
          .eq("id", fixtureA[table].id)
          .select("*");
        assertNoError(ownUpdate, `${table}: eigene Row aktualisieren`);
        assert.ok(ownUpdate);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        assert.equal(ownUpdate.data.length, 1, `${table}: eigenes UPDATE wurde nicht bestätigt`);
      }
    });

    await t.test("fremde Rows bleiben unsichtbar und unveränderbar", async () => {
      for (const table of TABLES) {
        const foreignRead = await clientB.from(table).select("*").eq("id", fixtureA[table].id);
        assertNoError(foreignRead, `${table}: fremde Row lesen`);
        assert.deepEqual(foreignRead.data, [], `${table}: Nutzer B sieht Nutzer-A-Daten`);

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        const updateCase = UPDATE_CASES[table];
        const foreignUpdate = await clientB
          .from(table)
          .update({ [updateCase.column]: updateCase.value })
          .eq("id", fixtureA[table].id)
          .select("*");
        assertNoError(foreignUpdate, `${table}: fremde Row aktualisieren`);
        assert.deepEqual(foreignUpdate.data, [], `${table}: Nutzer B konnte Nutzer-A-Daten aktualisieren`);

        const foreignDelete = await clientB.from(table).delete().eq("id", fixtureA[table].id).select("*");
        assertNoError(foreignDelete, `${table}: fremde Row löschen`);
        assert.deepEqual(foreignDelete.data, [], `${table}: Nutzer B konnte Nutzer-A-Daten löschen`);
      }
    });

    await t.test("gefälschte Ownership und anon-Zugriffe werden abgelehnt", async () => {
      for (const table of TABLES) {
        assert.ok(userA);
        const forged = forgedRow(fixtureA[table], table, userA.id, prefix);
        const forgedInsert = await clientB.from(table).insert(forged);
        assertPostgresError(forgedInsert, "42501", `${table}: Insert mit fremder Ownership`);

        const anonRead = await anonClient.from(table).select("*").limit(1);
        assertPostgresError(anonRead, "42501", `${table}: anon SELECT`);
        const anonInsert = await anonClient.from(table).insert(forged);
        assertPostgresError(anonInsert, "42501", `${table}: anon INSERT`);
      }
    });

    await t.test("accountgebundene Foreign Keys verweigern fremde Decks, Notiztypen, Karten und Snapshots", async () => {
      assert.ok(userA);
      const cases = [
        ["cards", { ...fixtureA.cards, id: `${prefix}_foreign_fk_card`, deck_id: fixtureB.decks.id }],
        ["cards", { ...fixtureA.cards, id: `${prefix}_foreign_fk_card_note_type`, note_type_definition_id: fixtureB.note_type_definitions.id }],
        ["cards", { ...fixtureA.cards, id: `${prefix}_foreign_fk_card_snapshot`, latest_source_snapshot_id: fixtureB.learning_item_source_snapshots.id }],
        ["card_variants", { ...fixtureA.card_variants, id: `${prefix}_foreign_fk_variant`, card_id: fixtureB.cards.id }],
        ["card_variants", { ...fixtureA.card_variants, id: `${prefix}_foreign_fk_variant_deck`, study_deck_id: fixtureB.decks.id }],
        ["learning_item_source_snapshots", {
          ...fixtureA.learning_item_source_snapshots,
          id: `${prefix}_foreign_fk_source_snapshot_card`,
          card_id: fixtureB.cards.id,
        }],
        ["learning_item_source_snapshots", {
          ...fixtureA.learning_item_source_snapshots,
          id: `${prefix}_foreign_fk_source_snapshot_note_type`,
          note_type_definition_id: fixtureB.note_type_definitions.id,
        }],
        ["learning_item_source_snapshots", {
          ...fixtureA.learning_item_source_snapshots,
          id: `${prefix}_foreign_fk_source_snapshot_previous`,
          previous_snapshot_id: fixtureB.learning_item_source_snapshots.id,
        }],
        ["review_events", { ...fixtureA.review_events, id: `${prefix}_foreign_fk_review`, deck_id: fixtureB.decks.id }],
        ["media_assets", {
          ...fixtureA.media_assets,
          id: `${prefix}_foreign_fk_media_deck`,
          deck_id: fixtureB.decks.id,
          card_id: null,
          storage_path: `${userA.id}/${prefix}/foreign-deck.png`,
        }],
        ["media_assets", {
          ...fixtureA.media_assets,
          id: `${prefix}_foreign_fk_media_card`,
          deck_id: fixtureA.decks.id,
          card_id: fixtureB.cards.id,
          storage_path: `${userA.id}/${prefix}/foreign-card.png`,
        }],
      ];

      for (const [table, row] of cases) {
        const result = await clientA.from(table).insert(row);
        assertPostgresError(result, "23503", `${table}: fremde Deck-/Card-Referenz`);
      }
    });

    await t.test("[Vertrag: private Medien-Ownership] Standarduploads bleiben accountgebunden und ein Objekt darf mehrere Referenzen haben", async () => {
      assert.ok(userA);
      const hash = "c".repeat(40);
      const path = `${userA.id}/objects/${hash}`;
      const secondDeckId = `${prefix}_media_second_deck`;
      const secondReferenceId = `${prefix}_media_second_reference`;
      try {
        assertNoError(await clientA.from("decks").insert({ ...fixtureA.decks, id: secondDeckId, name: "Geteiltes Medienobjekt" }), "zweiten Medien-Stapel anlegen");
        const smallUpload = await clientA.storage.from("core-media").upload(path, new Blob([new Uint8Array([1, 2, 3, 4])]), { contentType: "image/png", upsert: false });
        assert.equal(smallUpload.error, null, `Standard-Upload: ${smallUpload.error?.message ?? "Fehler"}`);
        assertNoError(await clientA.from("media_assets").insert({ ...fixtureA.media_assets, id: secondReferenceId, deck_id: secondDeckId, card_id: null, sha1: hash, size: 4, storage_path: path }), "zweite Referenz auf dasselbe Objekt anlegen");

        const ownSigned = await clientA.storage.from("core-media").createSignedUrl(path, 60);
        assert.equal(ownSigned.error, null);
        assert.ok(ownSigned.data?.signedUrl);
        assert.ok((await clientA.storage.from("core-media").download(path)).data);
        assert.ok((await clientB.storage.from("core-media").download(path)).error);
        assert.ok((await anonClient.storage.from("core-media").download(path)).error);
      } finally {
        await clientA.storage.from("core-media").remove([path]);
        await clientA.from("media_assets").delete().eq("id", secondReferenceId);
        await clientA.from("decks").delete().eq("id", secondDeckId);
      }
    });

    await t.test("[Vertrag: TUS über 6 MB] resumierbare Uploads bleiben accountgebunden", {
      skip: process.env.CORE_RLS_GATE === "core" ? "Heavy-Release-Vertrag; im PR-Gate bewusst ausgelassen." : false,
    }, async () => {
      assert.ok(userA);
      const largeHash = "d".repeat(40);
      const largePath = `${userA.id}/objects/${largeHash}`;
      try {
        const session = await clientA.auth.getSession();
        const token = session.data.session?.access_token;
        assert.ok(token);
        const largeBlob = Buffer.alloc(6 * 1024 * 1024 + 1);
        await new Promise<void>((resolve, reject) => {
          const upload = new Upload(largeBlob, {
            endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
            chunkSize: 6 * 1024 * 1024,
            retryDelays: [0, 300, 500],
            uploadDataDuringCreation: true,
            headers: { Authorization: `Bearer ${token}` },
            metadata: { bucketName: "core-media", objectName: largePath, contentType: "application/octet-stream", cacheControl: "3600" },
            onSuccess: () => resolve(),
            onError: reject,
          });
          upload.start();
        });
        const largeDownload = await clientA.storage.from("core-media").download(largePath);
        assert.equal(largeDownload.error, null, `TUS-Download: ${largeDownload.error?.message ?? "Fehler"}`);
        assert.equal(largeDownload.data?.size, largeBlob.length);
        assert.ok((await clientB.storage.from("core-media").download(largePath)).error);
        assert.ok((await anonClient.storage.from("core-media").download(largePath)).error);
      } finally {
        await clientA.storage.from("core-media").remove([largePath]);
      }
    });

    await t.test("serverseitige Basisrevision bestätigt genau einen konkurrierenden Deck-Write", async () => {
      const current = assertNoError(
        await clientA.from("decks").select("*").eq("id", fixtureA.decks.id).single(),
        "Deck vor konkurrierenden Writes lesen",
      );
      const baseRevision = current.revision;
      const first = assertNoError(
        await clientA
          .from("decks")
          .update({ description: "CAS Gewinner", revision: baseRevision + 1, updated_by_device_id: "rls-device-a" })
          .eq("id", fixtureA.decks.id)
          .eq("revision", baseRevision)
          .select("*"),
        "Ersten revisionsbedingten Deck-Write ausführen",
      );
      const second = assertNoError(
        await clientA
          .from("decks")
          .update({ description: "CAS Verlierer", revision: baseRevision + 1, updated_by_device_id: "rls-device-b" })
          .eq("id", fixtureA.decks.id)
          .eq("revision", baseRevision)
          .select("*"),
        "Zweiten revisionsbedingten Deck-Write ausführen",
      );

      assert.equal(first.length, 1);
      assert.deepEqual(second, []);
      const conflict = await markConflict(clientA, {
        entityTable: "decks",
        entityId: fixtureA.decks.id,
        baseRevision,
        localRevision: baseRevision,
        remoteRevision: first[0].revision,
        localValue: { ...current, description: "CAS Verlierer" },
        remoteValue: first[0],
      }, {
        deviceId: "rls-device-b",
        createdAt: "2026-07-11T10:00:00.000Z",
      });

      try {
        assert.equal(conflict.status, "open");
        assert.equal(conflict.baseRevision, baseRevision);
        assert.equal(conflict.remoteRevision, baseRevision + 1);
        const persisted = assertNoError(
          await clientA.from("sync_conflicts").select("*").eq("id", conflict.id).single(),
          "CAS-Konflikt lesen",
        );
        assert.equal(persisted.entity_id, fixtureA.decks.id);
        assert.equal(persisted.remote_value.description, "CAS Gewinner");
      } finally {
        assertNoError(await clientA.from("sync_conflicts").delete().eq("id", conflict.id), "CAS-Konflikt löschen");
      }
    });

    await t.test("atomarer Review-Write erhält Inhaltsrevisionen, markiert Projektionen und ist idempotent", async () => {
      const eventId = `${prefix}_atomic_review`;
      const answeredAt = "2099-07-11T09:00:00.000Z";
      const [deck, card, variant] = await Promise.all([
        clientA.from("decks").select("*").eq("id", fixtureA.decks.id).single(),
        clientA.from("cards").select("*").eq("id", fixtureA.cards.id).single(),
        clientA.from("card_variants").select("*").eq("id", fixtureA.card_variants.id).single(),
      ]);
      const currentDeck = assertNoError(deck, "Deck vor atomarem Review lesen");
      const currentCard = assertNoError(card, "Karte vor atomarem Review lesen");
      const currentVariant = assertNoError(variant, "Variante vor atomarem Review lesen");
      const parameters = {
        p_deck_id: fixtureA.decks.id,
        p_deck_base_revision: currentDeck.revision,
        p_card_id: fixtureA.cards.id,
        p_card_base_revision: currentCard.revision,
        p_card_review_state: { state: "review", repetitions: 1, dueAt: "2026-07-12T09:00:00.000Z" },
        p_card_core_state: { lastReviewedAt: answeredAt },
        p_card_updated_at: answeredAt,
        p_variant_id: fixtureA.card_variants.id,
        p_variant_base_revision: currentVariant.revision,
        p_variant_review_state: { state: "review", repetitions: 1 },
        p_variant_performance: { reviewCount: 1 },
        p_variant_updated_at: answeredAt,
        p_event: {
          id: eventId,
          reviewable_type: "variant",
          reviewable_id: fixtureA.card_variants.id,
          source_card_id: fixtureA.cards.id,
          rating: "good",
          answered_at: answeredAt,
          response_time_ms: 750,
          scheduler_before: {},
          scheduler_after: { state: "review" },
          flags: {},
          created_at: answeredAt,
        },
        p_device_id: fixtureA.sync_devices.id,
      };

      try {
        const first = assertNoError(await clientA.rpc("record_review_atomic", parameters), "atomaren Review schreiben");
        assert.equal(first.idempotent, false);
        assert.equal(first.deck.revision, currentDeck.revision);
        assert.equal(first.card.revision, currentCard.revision);
        assert.equal(first.variant.revision, currentVariant.revision);
        assert.equal(first.event.id, eventId);
        assert.equal(first.deck.sync_change_id, currentDeck.sync_change_id);
        assert.ok(first.card.sync_change_id > currentCard.sync_change_id);
        assert.ok(first.variant.sync_change_id > currentVariant.sync_change_id);
        assert.ok(first.event.sync_change_id > 0);

        const replay = assertNoError(await clientA.rpc("record_review_atomic", parameters), "atomaren Review idempotent wiederholen");
        assert.equal(replay.idempotent, true);
        assert.equal(replay.deck.revision, first.deck.revision);
        assert.equal(replay.card.revision, first.card.revision);
        assert.equal(replay.variant.revision, first.variant.revision);
        assert.equal(replay.card.sync_change_id, first.card.sync_change_id);
        assert.equal(replay.variant.sync_change_id, first.variant.sync_change_id);
        assert.equal(replay.event.sync_change_id, first.event.sync_change_id);
        const persistedEvents = assertNoError(await clientA.from("review_events").select("id").eq("id", eventId), "atomare Reviewevents lesen");
        assert.equal(persistedEvents.length, 1);

        const olderEventId = `${eventId}_older`;
        const olderAnsweredAt = "2099-07-11T07:00:00.000Z";
        const older = assertNoError(await clientA.rpc("record_review_atomic", {
          ...parameters,
          p_card_review_state: { state: "learning", repetitions: 0, dueAt: olderAnsweredAt },
          p_variant_review_state: { state: "learning", repetitions: 0 },
          p_variant_performance: { reviewCount: 0 },
          p_card_updated_at: olderAnsweredAt,
          p_variant_updated_at: olderAnsweredAt,
          p_event: { ...parameters.p_event, id: olderEventId, answered_at: olderAnsweredAt, created_at: olderAnsweredAt },
        }), "älteren Offline-Review schreiben");
        assert.equal(older.card.review_state.repetitions, 1);
        assert.equal(older.variant.review_state.repetitions, 1);
        const bothEvents = assertNoError(await clientA.from("review_events").select("id").in("id", [eventId, olderEventId]), "beide Offline-Reviews lesen");
        assert.equal(bothEvents.length, 2);

        const deleted = assertNoError(await clientA.from("decks")
          .update({ deleted_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:00:00.000Z", sync_change_id: 1 })
          .eq("id", fixtureA.decks.id)
          .select("sync_change_id")
          .single(), "Deck mit zurückdatiertem Tombstone schreiben");
        const restored = assertNoError(await clientA.from("decks")
          .update({ deleted_at: null, updated_at: "2020-01-01T00:00:00.000Z", sync_change_id: 1 })
          .eq("id", fixtureA.decks.id)
          .select("sync_change_id")
          .single(), "Deck mit zurückdatierter Fachzeit wiederherstellen");
        assert.ok(deleted.sync_change_id > first.event.sync_change_id, "Trigger muss den Client-Cursor beim Tombstone überschreiben");
        assert.ok(restored.sync_change_id > deleted.sync_change_id, "Restore muss eine neue serverseitige Cursorposition erhalten");

        const foreign = await clientB.rpc("record_review_atomic", { ...parameters, p_event: { ...parameters.p_event, id: `${eventId}_foreign` } });
        assert.ok(foreign.error, "Ein fremder atomarer Review-Write wurde unerwartet erlaubt.");
        const anonymous = await anonClient.rpc("record_review_atomic", { ...parameters, p_event: { ...parameters.p_event, id: `${eventId}_anon` } });
        assert.ok(anonymous.error, "Ein anonymer atomarer Review-Write wurde unerwartet erlaubt.");
      } finally {
        await clientA.from("review_events").delete().eq("id", eventId);
        await clientA.from("review_events").delete().eq("id", `${eventId}_older`);
      }
    });

    await t.test("Geräte-Upsert aktualisiert den Heartbeat und dieselbe Geräte-ID bleibt accountgebunden", async () => {
      const sharedId = `${prefix}_shared_device`;
      const firstSeenAt = "2026-07-11T08:00:00.000Z";
      const heartbeatAt = "2026-07-11T09:00:00.000Z";

      try {
        assert.ok(userA);
        const initialA = assertNoError(await clientA
          .from("sync_devices")
          .upsert({
            id: sharedId,
            user_id: userA.id,
            label: "Firefox auf Linux",
            user_agent: "CoRe RLS Smoke A/1",
            last_seen_at: firstSeenAt,
            created_at: firstSeenAt,
          }, { onConflict: "user_id,id" })
          .select("id, label, user_agent, last_seen_at, created_at")
          .single(), "Gerät für Nutzer A registrieren");
        assert.equal(initialA.id, sharedId);
        assert.equal(new Date(initialA.last_seen_at).toISOString(), firstSeenAt);
        assert.equal(new Date(initialA.created_at).toISOString(), firstSeenAt);

        assert.ok(userA);
        const heartbeatA = assertNoError(await clientA
          .from("sync_devices")
          .upsert({
            id: sharedId,
            user_id: userA.id,
            label: "Firefox auf Linux aktualisiert",
            user_agent: "CoRe RLS Smoke A/2",
            last_seen_at: heartbeatAt,
          }, { onConflict: "user_id,id" })
          .select("id, label, user_agent, last_seen_at, created_at")
          .single(), "Geräte-Heartbeat für Nutzer A aktualisieren");
        assert.equal(heartbeatA.label, "Firefox auf Linux aktualisiert");
        assert.equal(heartbeatA.user_agent, "CoRe RLS Smoke A/2");
        assert.equal(new Date(heartbeatA.last_seen_at).toISOString(), heartbeatAt);
        assert.equal(new Date(heartbeatA.created_at).toISOString(), firstSeenAt, "Heartbeat darf created_at nicht ersetzen");

        assert.ok(userB);
        const ownB = assertNoError(await clientB
          .from("sync_devices")
          .upsert({
            id: sharedId,
            user_id: userB.id,
            label: "Chrome auf Windows",
            user_agent: "CoRe RLS Smoke B/1",
            last_seen_at: heartbeatAt,
          }, { onConflict: "user_id,id" })
          .select("id, label")
          .single(), "Dieselbe Geräte-ID für Nutzer B registrieren");
        assert.equal(ownB.id, sharedId);
        assert.equal(ownB.label, "Chrome auf Windows");

        const visibleToA = assertNoError(await clientA.from("sync_devices").select("user_id, label").eq("id", sharedId), "Shared-Geräte-ID als Nutzer A lesen");
        const visibleToB = assertNoError(await clientB.from("sync_devices").select("user_id, label").eq("id", sharedId), "Shared-Geräte-ID als Nutzer B lesen");
        assert.ok(userA);
        assert.deepEqual(visibleToA, [{ user_id: userA.id, label: "Firefox auf Linux aktualisiert" }]);
        assert.ok(userB);
        assert.deepEqual(visibleToB, [{ user_id: userB.id, label: "Chrome auf Windows" }]);
      } finally {
        assertNoError(await clientA.from("sync_devices").delete().eq("id", sharedId), "Shared-Geräte-ID für Nutzer A löschen");
        assertNoError(await clientB.from("sync_devices").delete().eq("id", sharedId), "Shared-Geräte-ID für Nutzer B löschen");
      }
    });

    await t.test("dieselbe lokale Deck-ID darf in zwei Accounts existieren", async () => {
      const sharedId = `${prefix}_shared_deck`;
      assertNoError(await clientA.from("decks").insert({ ...fixtureA.decks, id: sharedId, name: "Shared A" }), "Shared-ID für Nutzer A");
      assertNoError(await clientB.from("decks").insert({ ...fixtureB.decks, id: sharedId, name: "Shared B" }), "Shared-ID für Nutzer B");

      const ownA = assertNoError(await clientA.from("decks").select("name").eq("id", sharedId).single(), "Shared-ID A lesen");
      const ownB = assertNoError(await clientB.from("decks").select("name").eq("id", sharedId).single(), "Shared-ID B lesen");
      assert.equal(ownA.name, "Shared A");
      assert.equal(ownB.name, "Shared B");

      assertNoError(await clientA.from("decks").delete().eq("id", sharedId), "Shared-ID A löschen");
      assertNoError(await clientB.from("decks").delete().eq("id", sharedId), "Shared-ID B löschen");
    });
  } finally {
    if (fixtureA) await cleanupFixture(clientA, fixtureA);
    if (fixtureB) await cleanupFixture(clientB, fixtureB);
    await clientA.auth.signOut({ scope: "local" }).catch(() => undefined);
    await clientB.auth.signOut({ scope: "local" }).catch(() => undefined);
    clientA.auth.dispose?.();
    clientB.auth.dispose?.();
    anonClient.auth.dispose?.();
  }
});
