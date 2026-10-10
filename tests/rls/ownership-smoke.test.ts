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
  "note_type_sources",
  "notes",
  "note_sources",
  "cards",
  "card_variants",
  "review_events",
  "media_files",
  "sync_devices",
  "sync_conflicts",
];

/** Row key of a table; media files are identified per account by their SHA-1. */
const keyOf = (table: string) => table === "media_files" ? "sha1" : "id";

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
  const noteTypeSourceId = `${prefix}_note_type_${marker}`;
  const noteId = `${prefix}_note_${marker}`;
  const cardId = `${prefix}_card_${marker}`;
  const sha1 = (marker === "a" ? "a" : "b").repeat(40);

  return {
    profiles: {
      id: userId,
      email: `${marker}@rls.local`,
      display_name: `RLS ${marker}`,
      timezone: "Europe/Berlin",
      scheduler_preferences: {},
    },
    decks: {
      id: deckId,
      user_id: userId,
      name: `RLS Deck ${marker}`,
      source: "manual",
    },
    note_type_sources: {
      id: noteTypeSourceId,
      user_id: userId,
      anki_notetype_id: `rls-${marker}`,
      name: `RLS Notiztyp ${marker}`,
      definition: { kind: 0, fields: [{ name: "Vorderseite", ordinal: 0 }] },
    },
    notes: {
      id: noteId,
      user_id: userId,
      content: {
        schemaVersion: 1,
        fields: [
          { id: "front", name: "Vorderseite", role: "prompt", html: `Frage ${marker}<img src="${marker}.png">` },
          { id: "back", name: "Rückseite", role: "answer", html: `Antwort ${marker}` },
        ],
        interaction: { kind: "reveal", prompts: [{ key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null }] },
        speech: [],
        tags: [],
      },
      media: { [`${marker}.png`]: sha1 },
      search_text: `frage ${marker} antwort ${marker}`,
      sort_text: `Frage ${marker}`,
      source: "anki-apkg",
      anki_guid: `guid-${prefix}-${marker}`,
      note_type_source_id: noteTypeSourceId,
      translator_id: "anki-basic",
      translator_version: 1,
      imported_content_revision: 1,
    },
    note_sources: {
      id: noteId,
      user_id: userId,
      note_type_source_id: noteTypeSourceId,
      fields: [`Frage ${marker}`, `Antwort ${marker}`],
    },
    cards: {
      id: cardId,
      user_id: userId,
      note_id: noteId,
      deck_id: deckId,
      prompt_key: "forward",
      due_at: "2026-07-11T08:00:00.000Z",
    },
    card_variants: {
      id: `${prefix}_variant_${marker}`,
      user_id: userId,
      card_id: cardId,
      front: `Variante ${marker}`,
      back: `Antwort ${marker}`,
    },
    review_events: {
      id: `${prefix}_review_${marker}`,
      user_id: userId,
      card_id: cardId,
      deck_id: deckId,
      rating: "good",
      answered_at: new Date().toISOString(),
      scheduler_before: { card: { state: "new" } },
    },
    media_files: {
      user_id: userId,
      sha1,
      size: 4,
      mime_type: "image/png",
      original_name: `${marker}.png`,
      storage_path: `${userId}/${sha1}`,
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
      entity_table: "notes",
      entity_id: noteId,
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
  profiles: { column: "display_name", value: "Aktualisiertes RLS-Profil" },
  decks: { column: "description", value: "aktualisiert" },
  note_type_sources: { column: "definition", value: { kind: 0, verified: true } },
  notes: { column: "marked", value: true },
  note_sources: { column: "fields", value: ["aktualisiert"] },
  cards: { column: "anki_flag", value: 1 },
  card_variants: { column: "front", value: "aktualisiert" },
  review_events: { column: "flags", value: { verified: true } },
  media_files: { column: "original_name", value: "aktualisiert.png" },
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
    const id = fixture[table]?.[keyOf(table)];
    if (!id) continue;
    await client.from(table).delete().eq(keyOf(table), id);
  }
}

function forgedRow(row: any, table: string, ownerId: any, prefix: string) {
  if (table === "profiles") return { ...row, id: ownerId, email: `forged-${prefix}@rls.local` };
  if (table === "media_files") return { ...row, user_id: ownerId, sha1: "f".repeat(40), storage_path: `${ownerId}/${"f".repeat(40)}` };
  return {
    ...row,
    id: `${prefix}_forged_${table}`,
    user_id: ownerId,
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
        const ownRead = await clientA.from(table).select("*").eq(keyOf(table), fixtureA[table][keyOf(table)]);
        assertNoError(ownRead, `${table}: eigene Row lesen`);
        assert.ok(ownRead);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        assert.equal(ownRead.data.length, 1, `${table}: eigene Row fehlt`);

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        const updateCase = UPDATE_CASES[table];
        const ownUpdate = await clientA
          .from(table)
          .update({ [updateCase.column]: updateCase.value })
          .eq(keyOf(table), fixtureA[table][keyOf(table)])
          .select("*");
        assertNoError(ownUpdate, `${table}: eigene Row aktualisieren`);
        assert.ok(ownUpdate);
// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        assert.equal(ownUpdate.data.length, 1, `${table}: eigenes UPDATE wurde nicht bestätigt`);
      }
    });

    await t.test("fremde Rows bleiben unsichtbar und unveränderbar", async () => {
      for (const table of TABLES) {
        const foreignRead = await clientB.from(table).select("*").eq(keyOf(table), fixtureA[table][keyOf(table)]);
        assertNoError(foreignRead, `${table}: fremde Row lesen`);
        assert.deepEqual(foreignRead.data, [], `${table}: Nutzer B sieht Nutzer-A-Daten`);

// @ts-expect-error -- Die Fixture pr?ft bewusst eine unvollst?ndige, ung?ltige oder konfliktbehaftete Laufzeitform.
        const updateCase = UPDATE_CASES[table];
        const foreignUpdate = await clientB
          .from(table)
          .update({ [updateCase.column]: updateCase.value })
          .eq(keyOf(table), fixtureA[table][keyOf(table)])
          .select("*");
        assertNoError(foreignUpdate, `${table}: fremde Row aktualisieren`);
        assert.deepEqual(foreignUpdate.data, [], `${table}: Nutzer B konnte Nutzer-A-Daten aktualisieren`);

        const foreignDelete = await clientB.from(table).delete().eq(keyOf(table), fixtureA[table][keyOf(table)]).select("*");
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

    await t.test("abgeleitete Projektionen sind accountgebunden und nur lesbar", async () => {
      assert.ok(userA);
      const ownLinks = assertNoError(await clientA.from("note_media").select("note_id,sha1").eq("note_id", fixtureA.notes.id), "eigene Medienverknüpfung lesen");
      assert.deepEqual(ownLinks, [{ note_id: fixtureA.notes.id, sha1: fixtureA.media_files.sha1 }], "notes.media pflegt note_media per Trigger");
      assert.deepEqual(assertNoError(await clientB.from("note_media").select("note_id").eq("note_id", fixtureA.notes.id), "fremde Medienverknüpfung lesen"), []);
      const projectionRows: Record<string, Record<string, unknown>> = {
        note_media: { user_id: userA.id, note_id: fixtureA.notes.id, sha1: "e".repeat(40) },
        card_catalog: { user_id: userA.id, id: `${prefix}_forged_catalog`, deck_id: fixtureA.decks.id, note_id: fixtureA.notes.id },
        deck_study_summaries: { user_id: userA.id, deck_id: fixtureA.decks.id },
      };
      for (const [table, row] of Object.entries(projectionRows)) {
        assertPostgresError(await clientA.from(table).insert(row), "42501", `${table}: direkter Write auf Projektion`);
      }
      const ownCatalog = assertNoError(await clientA.from("card_catalog").select("id,note_id").eq("id", fixtureA.cards.id), "eigenen Katalogeintrag lesen");
      assert.deepEqual(ownCatalog, [{ id: fixtureA.cards.id, note_id: fixtureA.notes.id }]);
      assert.deepEqual(assertNoError(await clientB.from("card_catalog").select("id").eq("id", fixtureA.cards.id), "fremden Katalogeintrag lesen"), []);
    });

    await t.test("Replica-RPCs liefern ausschließlich Daten des angemeldeten Accounts", async () => {
      assert.ok(userA);
      assert.ok(userB);
      assertNoError(await clientA.from("card_variants").insert([1, 2].map((number) => ({
        ...fixtureA.card_variants,
        id: `${prefix}_active_variant_${number}`,
      }))), "zwei aktive Varianten für Nutzer A anlegen");
      assertNoError(await clientA.from("review_events").insert({
        ...fixtureA.review_events,
        id: `${prefix}_same_card_second_review`,
      }), "zweites Tagesereignis derselben Karte anlegen");
      const bootstrapA = assertNoError(await clientA.rpc("get_account_bootstrap", { p_cursor: "", p_limit: 50, p_max_bytes: 204800 }), "Bootstrap für Nutzer A");
      assert.equal(bootstrapA.confirmedEmpty, false);
      assert.ok(bootstrapA.decks.every((entry: any) => entry.deck.user_id === userA.id));
      assert.equal(bootstrapA.decks.some((entry: any) => entry.deck.id === fixtureB.decks.id), false);
      assert.equal(bootstrapA.decks.find((entry: any) => entry.deck.id === fixtureA.decks.id)?.summary.activeVariantCount, 3);
      assert.equal(bootstrapA.studyOverview.introducedTodayByDeck[fixtureA.decks.id], 1, "Tagesfortschritt zählt eindeutige Karten statt Ereignisse");

      // K7.4: a new sibling of the card answered today leaves the day counts once its deck buries new siblings.
      const siblingId = `${prefix}_sibling_reverse`;
      assertNoError(await clientA.from("cards").insert({ ...fixtureA.cards, id: siblingId, prompt_key: "reverse" }), "neues Geschwister anlegen");
      const newCount = async () => assertNoError(await clientA.rpc("get_account_bootstrap", { p_cursor: "", p_limit: 50, p_max_bytes: 204800 }), "Bootstrap mit Geschwister").studyOverview.availableNewByDeck[fixtureA.decks.id] ?? 0;
      const withoutBurying = await newCount();
      assertNoError(await clientA.from("decks").update({ deck_settings: { buryNewSiblings: true } }).eq("id", fixtureA.decks.id), "Begraben neuer Geschwister einschalten");
      assert.equal(await newCount(), withoutBurying - 1, "Das neue Geschwister wartet bis zum nächsten Lerntag");
      // Same rule as src/siblingBurying.ts: each option buries only its own kind.
      assertNoError(await clientA.from("cards").update({ state: "review" }).eq("id", siblingId), "Geschwister fällig machen");
      const dueCount = async () => assertNoError(await clientA.rpc("get_account_bootstrap", { p_cursor: "", p_limit: 50, p_max_bytes: 204800 }), "Bootstrap mit fälligem Geschwister").studyOverview.dueByDeck[fixtureA.decks.id] ?? 0;
      const dueWithNewOnly = await dueCount();
      assertNoError(await clientA.from("decks").update({ deck_settings: { buryReviewSiblings: true } }).eq("id", fixtureA.decks.id), "Begraben fälliger Geschwister einschalten");
      assert.equal(await dueCount(), dueWithNewOnly - 1, "Nur die Option für fällige Geschwister begräbt ein fälliges Geschwister");
      assertNoError(await clientA.from("decks").update({ deck_settings: {} }).eq("id", fixtureA.decks.id), "Begraben wieder ausschalten");
      assertNoError(await clientA.from("cards").update({ deleted_at: new Date().toISOString() }).eq("id", siblingId), "Geschwister entfernen");

      const deltaA = assertNoError(await clientA.rpc("pull_account_catalog_delta", { p_cursor: 0, p_limit: 500, p_max_bytes: 1048576 }), "Katalog-Delta für Nutzer A");
      assert.ok(deltaA.changes.length > 0);
      assert.ok(deltaA.changes.every((entry: any) => entry.row.user_id === userA.id));

      const catalogRequest = { p_deck_id: fixtureA.decks.id, p_query: "", p_sort_field: "sortField", p_sort_direction: "asc", p_cursor: null, p_limit: 50 };
      const catalogA = assertNoError(await clientA.rpc("list_account_card_catalog", catalogRequest), "Kartenkatalog für Nutzer A");
      assert.ok(catalogA.items.some((entry: any) => entry.id === fixtureA.cards.id));
      assert.equal(catalogA.items.find((entry: any) => entry.id === fixtureA.cards.id)?.active_variant_count, 3);
      const searchA = assertNoError(await clientA.rpc("list_account_card_catalog", { ...catalogRequest, p_query: "antwort a" }), "Volltextsuche für Nutzer A");
      assert.ok(searchA.items.some((entry: any) => entry.id === fixtureA.cards.id), "Die Suche findet auch Text der Antwort");
      assert.deepEqual(assertNoError(await clientB.rpc("list_account_card_catalog", catalogRequest), "fremden Kartenkatalog für Nutzer B").items, []);
      const searchRequest = { p_deck_ids: [fixtureA.decks.id], p_query: "antwort a", p_sort_field: "sortField", p_sort_direction: "asc", p_limit: 50 };
      const groupedA = assertNoError(await clientA.rpc("search_account_card_catalog", searchRequest), "Stapelübergreifende Suche für Nutzer A");
      assert.ok(groupedA.groups[fixtureA.decks.id].items.some((entry: any) => entry.id === fixtureA.cards.id), "Die gebündelte Suche findet die Karte im Stapel");
      assert.deepEqual(assertNoError(await clientB.rpc("search_account_card_catalog", searchRequest), "fremde Stapelsuche für Nutzer B").groups, {});

      const hydratedA = assertNoError(await clientA.rpc("hydrate_account_cards", { p_card_ids: [fixtureA.cards.id, fixtureB.cards.id], p_note_ids: [fixtureB.notes.id] }), "Kartenkörper für Nutzer A");
      assert.deepEqual(hydratedA.cards.map((entry: any) => entry.id), [fixtureA.cards.id]);
      assert.deepEqual(hydratedA.notes.map((entry: any) => entry.id), [fixtureA.notes.id]);
      assert.ok(hydratedA.variants.every((entry: any) => entry.user_id === userA.id));
      const hydratedB = assertNoError(await clientB.rpc("hydrate_account_cards", { p_card_ids: [fixtureA.cards.id], p_note_ids: [fixtureA.notes.id] }), "fremden Kartenkörper für Nutzer B");
      assert.deepEqual(hydratedB.cards, []);
      assert.deepEqual(hydratedB.notes, []);
      assert.deepEqual(hydratedB.variants, []);

      const manifestA = assertNoError(await clientA.rpc("get_deck_offline_manifest", { p_deck_id: fixtureA.decks.id, p_cursor: "", p_limit: 50 }), "Offline-Manifest für Nutzer A");
      assert.ok(manifestA.cards.some((entry: any) => entry.id === fixtureA.cards.id));
      assert.ok(manifestA.media.some((entry: any) => entry.sha1 === fixtureA.media_files.sha1));
      const manifestB = assertNoError(await clientB.rpc("get_deck_offline_manifest", { p_deck_id: fixtureA.decks.id, p_cursor: "", p_limit: 50 }), "fremdes Offline-Manifest für Nutzer B");
      assert.deepEqual(manifestB.cards, []);
      assert.deepEqual(manifestB.media, []);

      const reimportA = assertNoError(await clientA.rpc("load_reimport_targets", { p_guids: [fixtureA.notes.anki_guid, fixtureB.notes.anki_guid] }), "Reimport-Ziele für Nutzer A");
      assert.deepEqual(reimportA.notes.map((entry: any) => entry.id), [fixtureA.notes.id]);
      assert.deepEqual(reimportA.cards.map((entry: any) => entry.id), [fixtureA.cards.id]);
      assert.deepEqual(assertNoError(await clientB.rpc("load_reimport_targets", { p_guids: [fixtureA.notes.anki_guid] }), "fremde Reimport-Ziele für Nutzer B").notes, []);

      const candidatesA = assertNoError(await clientA.rpc("list_retranslation_candidates", { p_current_versions: { "anki-basic": 2 }, p_cursor: "", p_limit: 100 }), "Neuübersetzungskandidaten für Nutzer A");
      assert.ok(candidatesA.notes.some((entry: any) => entry.id === fixtureA.notes.id));
      assert.ok(candidatesA.notes.every((entry: any) => entry.user_id === userA.id));
      assert.ok(candidatesA.noteSources.every((entry: any) => entry.user_id === userA.id));

      const statisticsA = assertNoError(await clientA.rpc("get_account_statistics", { p_deck_ids: [fixtureA.decks.id], p_from: null, p_to: null }), "Statistik für Nutzer A");
      assert.equal(statisticsA.cards.total, 1);
      const foreignTreeDelete = assertNoError(await clientB.rpc("delete_account_deck_tree", {
        p_deck_id: fixtureA.decks.id,
        p_deleted_at: new Date().toISOString(),
        p_device_id: `${prefix}_device_b`,
      }), "fremden Deckbaum für Nutzer B löschen");
      assert.deepEqual(foreignTreeDelete.deletedDeckIds, []);
      const untouchedDeckA = assertNoError(await clientA.from("decks").select("id,deleted_at").eq("id", fixtureA.decks.id), "Deck von Nutzer A nach Fremdlöschung lesen");
      assert.equal(untouchedDeckA[0]?.deleted_at, null);
      const anonymousBootstrap = await anonClient.rpc("get_account_bootstrap", { p_cursor: "", p_limit: 50, p_max_bytes: 204800 });
      assert.ok(anonymousBootstrap.error, "anon darf den Bootstrap nicht ausführen");
      const anonymousDelete = await anonClient.rpc("delete_account_deck_tree", { p_deck_id: fixtureA.decks.id });
      assert.ok(anonymousDelete.error, "anon darf keine Deckbäume löschen");
      const anonymousReleasable = await anonClient.rpc("list_releasable_media", { p_limit: 10 });
      assert.ok(anonymousReleasable.error, "anon darf keine freigebbaren Medien abfragen");
    });

    await t.test("accountgebundene Foreign Keys verweigern fremde Decks, Inhalte, Vorlagen und Karten", async () => {
      assert.ok(userA);
      const cases = [
        ["cards", { ...fixtureA.cards, id: `${prefix}_foreign_fk_card`, prompt_key: "reverse", deck_id: fixtureB.decks.id }],
        ["cards", { ...fixtureA.cards, id: `${prefix}_foreign_fk_card_note`, prompt_key: "reverse", note_id: fixtureB.notes.id }],
        ["notes", { ...fixtureA.notes, id: `${prefix}_foreign_fk_note`, anki_guid: null, note_type_source_id: fixtureB.note_type_sources.id }],
        ["note_sources", { ...fixtureA.note_sources, id: fixtureB.notes.id }],
        ["card_variants", { ...fixtureA.card_variants, id: `${prefix}_foreign_fk_variant`, card_id: fixtureB.cards.id }],
        ["review_events", { ...fixtureA.review_events, id: `${prefix}_foreign_fk_review`, card_id: fixtureB.cards.id }],
      ];

      for (const [table, row] of cases) {
        const result = await clientA.from(table).insert(row);
        assertPostgresError(result, "23503", `${table}: fremde Deck-/Card-Referenz`);
      }
    });

    await t.test("[Vertrag: private Medien-Ownership] Standarduploads bleiben accountgebunden und eine Datei darf von mehreren Inhalten genutzt werden", async () => {
      assert.ok(userA);
      const hash = "c".repeat(40);
      const path = `${userA.id}/${hash}`;
      const secondNoteId = `${prefix}_media_second_note`;
      try {
        const smallUpload = await clientA.storage.from("core-media").upload(path, new Blob([new Uint8Array([1, 2, 3, 4])]), { contentType: "image/png", upsert: false });
        assert.equal(smallUpload.error, null, `Standard-Upload: ${smallUpload.error?.message ?? "Fehler"}`);
        assertNoError(await clientA.from("media_files").insert({ ...fixtureA.media_files, sha1: hash, storage_path: path }), "Mediendatei registrieren");
        assertNoError(await clientA.from("notes").update({ media: { "c.png": hash } }).eq("id", fixtureA.notes.id), "ersten Inhalt mit Datei verknüpfen");
        assertNoError(await clientA.from("notes").insert({ ...fixtureA.notes, id: secondNoteId, anki_guid: null, media: { "anders.png": hash } }), "zweiten Inhalt mit derselben Datei anlegen");
        const links = assertNoError(await clientA.from("note_media").select("note_id").eq("sha1", hash), "Verknüpfungen derselben Datei lesen");
        assert.deepEqual(links.map((entry: any) => entry.note_id).sort(), [fixtureA.notes.id, secondNoteId].sort());

        const ownSigned = await clientA.storage.from("core-media").createSignedUrl(path, 60);
        assert.equal(ownSigned.error, null);
        assert.ok(ownSigned.data?.signedUrl);
        assert.ok((await clientA.storage.from("core-media").download(path)).data);
        assert.ok((await clientB.storage.from("core-media").download(path)).error);
        assert.ok((await anonClient.storage.from("core-media").download(path)).error);
        const releasable = assertNoError(await clientA.rpc("list_releasable_media", { p_limit: 100 }), "freigebbare Medien lesen");
        assert.equal(releasable.some((entry: any) => entry.sha1 === hash), false, "Eine verwendete Datei ist nicht freigebbar");
      } finally {
        await clientA.storage.from("core-media").remove([path]);
        await clientA.from("notes").delete().eq("id", secondNoteId);
        await clientA.from("notes").update({ media: fixtureA.notes.media }).eq("id", fixtureA.notes.id);
        await clientA.from("media_files").delete().eq("sha1", hash);
      }
    });

    await t.test("[Vertrag: TUS über 6 MB] resumierbare Uploads bleiben accountgebunden", {
      skip: process.env.CORE_RLS_GATE === "core" ? "Heavy-Release-Vertrag; im PR-Gate bewusst ausgelassen." : false,
    }, async () => {
      assert.ok(userA);
      const largeHash = "d".repeat(40);
      const largePath = `${userA.id}/${largeHash}`;
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

    await t.test("atomarer Review-Write erhält Inhaltsrevisionen, erhöht nur die Lernstandsrevision und ist idempotent", async () => {
      const eventId = `${prefix}_atomic_review`;
      const answeredAt = "2099-07-11T09:00:00.000Z";
      const [deck, note, card, variant] = await Promise.all([
        clientA.from("decks").select("*").eq("id", fixtureA.decks.id).single(),
        clientA.from("notes").select("*").eq("id", fixtureA.notes.id).single(),
        clientA.from("cards").select("*").eq("id", fixtureA.cards.id).single(),
        clientA.from("card_variants").select("*").eq("id", fixtureA.card_variants.id).single(),
      ]);
      const currentDeck = assertNoError(deck, "Deck vor atomarem Review lesen");
      const currentNote = assertNoError(note, "Inhalt vor atomarem Review lesen");
      const currentCard = assertNoError(card, "Karte vor atomarem Review lesen");
      const currentVariant = assertNoError(variant, "Variante vor atomarem Review lesen");
      const study = (overrides: Record<string, unknown> = {}) => ({
        state: "review", due_at: "2099-07-12T09:00:00.000Z", stability: 3, difficulty: 5, reps: 1, lapses: 0, interval_days: 1,
        learning_step_index: 0, last_reviewed_at: answeredAt, last_rating: "good", study_extra: {}, ...overrides,
      });
      const parameters = {
        p_card_id: fixtureA.cards.id,
        p_study: study(),
        p_card_updated_at: answeredAt,
        p_variant_id: fixtureA.card_variants.id,
        p_variant_performance: { reviewCount: 1 },
        p_variant_updated_at: answeredAt,
        p_event: {
          id: eventId,
          card_id: fixtureA.cards.id,
          deck_id: fixtureA.decks.id,
          variant_id: fixtureA.card_variants.id,
          rating: "good",
          answered_at: answeredAt,
          response_time_ms: 750,
          scheduler_before: { card: { state: "review", intervalDays: 12 } },
          scheduler_after: { card: { state: "review" } },
          flags: {},
          created_at: answeredAt,
        },
        p_device_id: fixtureA.sync_devices.id,
      };

      try {
        const first = assertNoError(await clientA.rpc("record_review_atomic", parameters), "atomaren Review schreiben");
        assert.equal(first.idempotent, false);
        assert.equal(first.card.revision, currentCard.revision);
        assert.equal(first.card.study_revision, currentCard.study_revision + 1);
        assert.equal(first.variant.revision, currentVariant.revision);
        assert.equal(first.event.id, eventId);
        const [deckAfter, noteAfter] = await Promise.all([
          clientA.from("decks").select("revision,sync_change_id").eq("id", fixtureA.decks.id).single(),
          clientA.from("notes").select("revision,content_revision").eq("id", fixtureA.notes.id).single(),
        ]);
        assert.deepEqual(assertNoError(deckAfter, "Deck nach Review lesen"), { revision: currentDeck.revision, sync_change_id: currentDeck.sync_change_id });
        assert.deepEqual(assertNoError(noteAfter, "Inhalt nach Review lesen"), { revision: currentNote.revision, content_revision: currentNote.content_revision });

        const replay = assertNoError(await clientA.rpc("record_review_atomic", parameters), "atomaren Review idempotent wiederholen");
        assert.equal(replay.idempotent, true);
        assert.equal(replay.card.study_revision, first.card.study_revision);
        assert.equal(replay.event.id, first.event.id);
        const persistedEvents = assertNoError(await clientA.from("review_events").select("id").eq("id", eventId), "atomare Reviewevents lesen");
        assert.equal(persistedEvents.length, 1);

        const olderEventId = `${eventId}_older`;
        const olderAnsweredAt = "2099-07-11T07:00:00.000Z";
        const older = assertNoError(await clientA.rpc("record_review_atomic", {
          ...parameters,
          p_study: study({ state: "learning", reps: 0, due_at: olderAnsweredAt, last_rating: "again" }),
          p_variant_performance: { reviewCount: 0 },
          p_card_updated_at: olderAnsweredAt,
          p_variant_updated_at: olderAnsweredAt,
          p_event: { ...parameters.p_event, id: olderEventId, rating: "again", answered_at: olderAnsweredAt, created_at: olderAnsweredAt },
        }), "älteren Offline-Review schreiben");
        assert.equal(older.card.reps, 1, "Ein älterer Offline-Review überschreibt den neueren Lernstand nicht.");
        assert.equal(older.variant.performance.reviewCount, 1);
        const bothEvents = assertNoError(await clientA.from("review_events").select("id").in("id", [eventId, olderEventId]), "beide Offline-Reviews lesen");
        assert.equal(bothEvents.length, 2);
        const dailyStatistics = assertNoError(await clientA.from("review_statistics_daily")
          .select("review_count,young_count,retention_young_count,retention_young_remembered,rating_counts")
          .eq("deck_id", fixtureA.decks.id)
          .eq("day_key", "2099-07-11")
          .single(), "tägliche Reviewprojektion lesen");
        assert.equal(dailyStatistics.review_count, 2);
        assert.equal(dailyStatistics.young_count, 2);
        assert.equal(dailyStatistics.retention_young_count, 1);
        assert.equal(dailyStatistics.retention_young_remembered, 0, "Der frühere Again-Review bestimmt die Tages-Retention.");
        assert.deepEqual(dailyStatistics.rating_counts, { "young:again": 1, "young:good": 1 });

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
        assert.ok(deleted.sync_change_id > currentDeck.sync_change_id, "Trigger muss den Client-Cursor beim Tombstone überschreiben");
        assert.ok(restored.sync_change_id > deleted.sync_change_id, "Restore muss eine neue serverseitige Cursorposition erhalten");

        const foreign = await clientB.rpc("record_review_atomic", { ...parameters, p_event: { ...parameters.p_event, id: `${eventId}_foreign` } });
        assert.ok(foreign.error, "Ein fremder atomarer Review-Write wurde unerwartet erlaubt.");
        const anonymous = await anonClient.rpc("record_review_atomic", { ...parameters, p_event: { ...parameters.p_event, id: `${eventId}_anon` } });
        assert.ok(anonymous.error, "Ein anonymer atomarer Review-Write wurde unerwartet erlaubt.");
      } finally {
        await clientA.from("review_events").delete().in("id", [eventId, `${eventId}_older`]);
      }
    });

    await t.test("manuelle Neuplanung nutzt den Review-Pfad, ist idempotent und zählt nicht als Lernen", async () => {
      const before = assertNoError(await clientA.from("cards").select("*").eq("id", fixtureA.cards.id).single(), "Karte vor Neuplanung lesen");
      const eventId = `${prefix}_manual_schedule`;
      const occurredAt = "2099-07-20T09:00:00.000Z";
      const dueAt = "2099-08-01T09:00:00.000Z";
      const beforeStudy = {
        state: before.state, due_at: before.due_at, stability: before.stability, difficulty: before.difficulty, reps: before.reps, lapses: before.lapses,
        interval_days: before.interval_days, learning_step_index: before.learning_step_index, last_reviewed_at: before.last_reviewed_at,
        last_rating: before.last_rating, study_extra: before.study_extra,
      };
      const parameters = {
        p_card_id: fixtureA.cards.id,
        p_study: { ...beforeStudy, due_at: dueAt },
        p_card_updated_at: occurredAt,
        p_variant_id: null,
        p_variant_performance: null,
        p_variant_updated_at: null,
        p_event: {
          id: eventId,
          card_id: fixtureA.cards.id,
          deck_id: fixtureA.decks.id,
          rating: "manual",
          answered_at: occurredAt,
          scheduler_before: { card: { dueAt: before.due_at } },
          scheduler_after: { card: { dueAt } },
          flags: { kind: "manual_reschedule" },
          created_at: occurredAt,
        },
        p_device_id: fixtureA.sync_devices.id,
      };

      try {
        const first = assertNoError(await clientA.rpc("record_review_atomic", parameters), "Karte über Review-Pfad neu planen");
        assert.equal(first.idempotent, false);
        assert.equal(new Date(first.card.due_at).toISOString(), dueAt);
        assert.equal(first.card.reps, before.reps);
        assert.equal(first.card.revision, before.revision);

        const replay = assertNoError(await clientA.rpc("record_review_atomic", parameters), "Neuplanung idempotent wiederholen");
        assert.equal(replay.idempotent, true);
        assert.equal(replay.event.id, first.event.id);
        const persisted = assertNoError(await clientA.from("review_events").select("id,rating").eq("id", eventId), "manuelles Ereignis lesen");
        assert.deepEqual(persisted, [{ id: eventId, rating: "manual" }]);
        const statistics = assertNoError(await clientA.from("review_statistics_daily").select("review_count").eq("deck_id", fixtureA.decks.id).eq("day_key", "2099-07-20"), "Statistik nach Neuplanung lesen");
        assert.deepEqual(statistics, [], "Manuelle Neuplanung darf keinen Lernfortschritt erzeugen.");

        const laterEventId = `${eventId}_later`;
        const laterAt = "2099-07-21T09:00:00.000Z";
        const laterDueAt = "2099-08-05T09:00:00.000Z";
        const later = assertNoError(await clientA.rpc("record_review_atomic", {
          ...parameters,
          p_study: { ...beforeStudy, due_at: laterDueAt, reps: 2, last_reviewed_at: laterAt },
          p_card_updated_at: laterAt,
          p_event: { ...parameters.p_event, id: laterEventId, rating: "good", answered_at: laterAt, created_at: laterAt, scheduler_after: { card: { dueAt: laterDueAt } } },
        }), "späteren Review schreiben");
        assert.equal(new Date(later.card.due_at).toISOString(), laterDueAt);

        const stale = assertNoError(await clientA.rpc("record_review_atomic", {
          ...parameters,
          p_study: { ...beforeStudy, due_at: "2099-08-03T09:00:00.000Z" },
          p_event: { ...parameters.p_event, id: `${eventId}_stale`, answered_at: "2099-07-20T12:00:00.000Z", created_at: "2099-07-20T12:00:00.000Z" },
        }), "ältere Neuplanung nach Review schreiben");
        assert.equal(new Date(stale.card.due_at).toISOString(), laterDueAt, "Die zeitlich spätere Bewertung muss gewinnen.");

        const foreign = await clientB.rpc("record_review_atomic", { ...parameters, p_event: { ...parameters.p_event, id: `${eventId}_foreign` } });
        assert.ok(foreign.error, "Eine fremde Neuplanung wurde unerwartet erlaubt.");
      } finally {
        await clientA.from("review_events").delete().in("id", [eventId, `${eventId}_later`, `${eventId}_stale`]);
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
