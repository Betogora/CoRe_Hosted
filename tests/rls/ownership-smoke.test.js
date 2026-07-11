import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.mjs";
import { markConflict } from "../../src/cloudRepository.js";

const TABLES = [
  "profiles",
  "core_portable_exports",
  "decks",
  "cards",
  "card_variants",
  "review_events",
  "source_documents",
  "ai_jobs",
  "media_assets",
  "sync_devices",
  "sync_conflicts",
];

function requireEnvironment(name) {
  const value = String(process.env[name] ?? "").trim();
  assert.ok(value, `${name} fehlt für den lokalen RLS-Smoke.`);
  return value;
}

function createTestClient(supabaseUrl, publishableKey) {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function ensureSignedIn(client, email, password) {
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

function assertNoError(result, context) {
  assert.equal(result.error, null, `${context}: ${result.error?.code ?? "Fehler"} ${result.error?.message ?? ""}`);
  return result.data;
}

function assertPostgresError(result, expectedCode, context) {
  assert.ok(result.error, `${context}: Anfrage wurde unerwartet erlaubt.`);
  assert.equal(result.error.code, expectedCode, `${context}: ${result.error.message}`);
}

function createFixture(userId, prefix, marker) {
  const deckId = `${prefix}_deck_${marker}`;
  const cardId = `${prefix}_card_${marker}`;

  return {
    profiles: {
      id: userId,
      email: `${marker}@rls.local`,
      display_name: `RLS ${marker}`,
      preferred_language: "de",
      timezone: "Europe/Berlin",
      privacy: {},
      scheduler_preferences: {},
    },
    core_portable_exports: {
      id: randomUUID(),
      user_id: userId,
      owner_label: marker,
      source_label: "rls-smoke",
      payload: { marker },
    },
    decks: {
      id: deckId,
      user_id: userId,
      name: `RLS Deck ${marker}`,
      source: "manual",
    },
    cards: {
      id: cardId,
      user_id: userId,
      deck_id: deckId,
      source: "manual",
      kind: "basic",
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
    ai_jobs: {
      id: `${prefix}_job_${marker}`,
      user_id: userId,
      deck_id: deckId,
      job_type: "rls-smoke",
      status: "queued",
    },
    media_assets: {
      id: `${prefix}_media_${marker}`,
      user_id: userId,
      deck_id: deckId,
      card_id: cardId,
      sha1: `${prefix}${marker}`,
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
  core_portable_exports: { column: "owner_label", value: "aktualisiert" },
  decks: { column: "description", value: "aktualisiert" },
  cards: { column: "original_back", value: "aktualisiert" },
  card_variants: { column: "explanation", value: "aktualisiert" },
  review_events: { column: "flags", value: { verified: true } },
  source_documents: { column: "metadata", value: { verified: true } },
  ai_jobs: { column: "policy", value: { verified: true } },
  media_assets: { column: "metadata", value: { verified: true } },
  sync_devices: { column: "label", value: "Aktualisierter Browser" },
  sync_conflicts: { column: "resolution", value: { verified: true } },
};

async function insertFixture(client, fixture) {
  for (const table of INSERT_ORDER) {
    const request = table === "profiles"
      ? client.from(table).upsert(fixture[table], { onConflict: "id" }).select("*").single()
      : client.from(table).insert(fixture[table]).select("*").single();
    assertNoError(await request, `${table}: eigene Fixture anlegen`);
  }
}

async function cleanupFixture(client, fixture) {
  for (const table of DELETE_ORDER) {
    const id = fixture[table]?.id;
    if (!id) continue;
    await client.from(table).delete().eq("id", id);
  }
}

function forgedRow(row, table, ownerId, prefix) {
  if (table === "profiles") return { ...row, id: ownerId, email: `forged-${prefix}@rls.local` };
  return {
    ...row,
    id: table === "core_portable_exports" ? randomUUID() : `${prefix}_forged_${table}`,
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
  let fixtureA;
  let fixtureB;

  try {
    const userA = await ensureSignedIn(clientA, credentialsA.email, credentialsA.password);
    const userB = await ensureSignedIn(clientB, credentialsB.email, credentialsB.password);
    assert.notEqual(userA.id, userB.id);
    fixtureA = createFixture(userA.id, prefix, "a");
    fixtureB = createFixture(userB.id, prefix, "b");
    await insertFixture(clientA, fixtureA);
    await insertFixture(clientB, fixtureB);

    await t.test("eigene Rows sind lesbar und aktualisierbar", async () => {
      for (const table of TABLES) {
        const ownRead = await clientA.from(table).select("*").eq("id", fixtureA[table].id);
        assertNoError(ownRead, `${table}: eigene Row lesen`);
        assert.equal(ownRead.data.length, 1, `${table}: eigene Row fehlt`);

        const updateCase = UPDATE_CASES[table];
        const ownUpdate = await clientA
          .from(table)
          .update({ [updateCase.column]: updateCase.value })
          .eq("id", fixtureA[table].id)
          .select("*");
        assertNoError(ownUpdate, `${table}: eigene Row aktualisieren`);
        assert.equal(ownUpdate.data.length, 1, `${table}: eigenes UPDATE wurde nicht bestätigt`);
      }
    });

    await t.test("fremde Rows bleiben unsichtbar und unveränderbar", async () => {
      for (const table of TABLES) {
        const foreignRead = await clientB.from(table).select("*").eq("id", fixtureA[table].id);
        assertNoError(foreignRead, `${table}: fremde Row lesen`);
        assert.deepEqual(foreignRead.data, [], `${table}: Nutzer B sieht Nutzer-A-Daten`);

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
        const forged = forgedRow(fixtureA[table], table, userA.id, prefix);
        const forgedInsert = await clientB.from(table).insert(forged);
        assertPostgresError(forgedInsert, "42501", `${table}: Insert mit fremder Ownership`);

        const anonRead = await anonClient.from(table).select("*").limit(1);
        assertPostgresError(anonRead, "42501", `${table}: anon SELECT`);
        const anonInsert = await anonClient.from(table).insert(forged);
        assertPostgresError(anonInsert, "42501", `${table}: anon INSERT`);
      }
    });

    await t.test("accountgebundene Foreign Keys verweigern fremde Decks und Cards", async () => {
      const cases = [
        ["cards", { ...fixtureA.cards, id: `${prefix}_foreign_fk_card`, deck_id: fixtureB.decks.id }],
        ["card_variants", { ...fixtureA.card_variants, id: `${prefix}_foreign_fk_variant`, card_id: fixtureB.cards.id }],
        ["review_events", { ...fixtureA.review_events, id: `${prefix}_foreign_fk_review`, deck_id: fixtureB.decks.id }],
        ["ai_jobs", { ...fixtureA.ai_jobs, id: `${prefix}_foreign_fk_job`, deck_id: fixtureB.decks.id }],
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

    await t.test("Geräte-Upsert aktualisiert den Heartbeat und dieselbe Geräte-ID bleibt accountgebunden", async () => {
      const sharedId = `${prefix}_shared_device`;
      const firstSeenAt = "2026-07-11T08:00:00.000Z";
      const heartbeatAt = "2026-07-11T09:00:00.000Z";

      try {
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
        assert.deepEqual(visibleToA, [{ user_id: userA.id, label: "Firefox auf Linux aktualisiert" }]);
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
