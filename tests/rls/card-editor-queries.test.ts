import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listAccountCardCatalog, listAccountTags, listCardReviewEvents, listSimilarNotes, recordAtomicReview, searchAccountCardCatalog } from "../../src/cloudRepository.ts";
import { createBasicNote, createCoreDeck, setCardLeech } from "../../src/coreModel.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Card, Deck, Note, ReviewEvent } from "../../src/coreTypes.ts";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.ts";
import { seedAccountState } from "../support/seedAccountState.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt für den lokalen Editor-Abfragetest.`);
  return value;
}

async function signedInClient(url: string, key: string, email: string, password: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let result = await client.auth.signInWithPassword({ email, password });
  if (result.error) {
    await client.auth.signUp({ email, password });
    result = await client.auth.signInWithPassword({ email, password });
  }
  if (result.error || !result.data.user) throw result.error ?? new Error(`Testaccount ${email} konnte nicht angemeldet werden.`);
  return { client, userId: result.data.user.id };
}

/** One deck whose contents carry the given tags; the first card of each content gets the given flag. */
async function seedNotes(client: SupabaseClient, deviceId: string, contents: Array<{ front: string; tags: string[]; flag?: number; importedTags?: string[] }>) {
  const deck = createCoreDeck({ name: "Editor-Abfragen", source: "manual" });
  const graphs = contents.map(({ front, tags, flag = 0, importedTags }, index) => {
    const createdAt = new Date(Date.parse("2026-10-30T10:00:00.000Z") + index * 60_000).toISOString();
    const { note, cards } = createBasicNote(deck.id, front, "Die Antwort steht hier ausführlich genug für Trigramme.", { tags, createdAt });
    return { note: { ...note, importedTags: importedTags ?? null } as Note, card: { ...cards[0], deckId: deck.id, ankiFlag: flag } as Card };
  });
  const seeded = await seedAccountState(client, {
    ...createCoreRepository().getState(),
    decks: [{ ...deck, cards: graphs.map((graph) => graph.card) }],
    notes: graphs.map((graph) => graph.note),
  }, deviceId);
  return { deck: seeded.decks[0] as Deck, notes: seeded.notes as Note[], cards: seeded.decks[0].cards as Card[] };
}

test("Tag-Verzeichnis, ähnliche Inhalte, Suchbegriffe und Lernbremse bleiben je Konto getrennt", async () => {
  const url = requiredEnvironment("VITE_SUPABASE_URL");
  const key = requiredEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY");
  assert.equal(isLocalSupabaseUrl(url), true, "Der Test darf nur gegen lokales Supabase laufen.");
  const a = await signedInClient(url, key, requiredEnvironment("CORE_E2E_EMAIL"), requiredEnvironment("CORE_E2E_PASSWORD"));
  const b = await signedInClient(url, key, requiredEnvironment("CORE_RLS_USER_B_EMAIL"), requiredEnvironment("CORE_RLS_USER_B_PASSWORD"));

  const seededA = await seedNotes(a.client, "device_editor_a", [
    { front: "Welche Klappe schließt zu Beginn der Systole am Herzen?", tags: ["#AK::Herz::Klappen", "Eigen"], flag: 3, importedTags: ["#AK::Herz::Klappen"] },
    { front: "Welche Klappe schließt zu Beginn der Systole im Herzen?", tags: ["#ak::herz::klappen"] },
    { front: "Wie heißt das größte Organ des Menschen?", tags: [] },
  ]);
  await seedNotes(b.client, "device_editor_b", [
    { front: "Welche Klappe schließt zu Beginn der Systole am Herzen?", tags: ["Fremd"] },
  ]);

  assert.deepEqual(await listAccountTags(a.client), [
    { tag: "#AK::Herz::Klappen", noteCount: 2, importedCount: 1 },
    { tag: "Eigen", noteCount: 1, importedCount: 0 },
  ]);
  assert.deepEqual(await listAccountTags(b.client), [{ tag: "Fremd", noteCount: 1, importedCount: 0 }]);

  const similar = await listSimilarNotes(a.client, seededA.notes[0].id);
  assert.deepEqual(similar.map((entry) => [entry.noteId, entry.cardId, entry.deckId]), [[seededA.notes[1].id, seededA.cards[1].id, seededA.deck.id]]);
  assert.ok(similar[0].similarity >= 0.5);
  assert.deepEqual(await listSimilarNotes(b.client, seededA.notes[0].id), [], "fremde Inhalte bleiben unsichtbar");

  const deckId = seededA.deck.id;
  const ids = async (query: string) => (await listAccountCardCatalog(a.client, { deckId, query })).items.map((entry) => entry.id).sort();
  assert.deepEqual(await ids("tag:#ak::herz"), [seededA.cards[0].id, seededA.cards[1].id].sort(), "Kinder und Schreibweisen zählen mit");
  assert.deepEqual(await ids("tag:#ak::herz flag:3"), [seededA.cards[0].id]);
  assert.deepEqual(await ids("-flag:3 tag:#ak"), [seededA.cards[1].id]);
  assert.deepEqual(await ids("tag:none"), [seededA.cards[2].id]);
  assert.deepEqual(await ids("organ tag:none"), [seededA.cards[2].id]);
  const searched = await searchAccountCardCatalog(a.client, { deckIds: [deckId], query: "flag:3" });
  assert.deepEqual(searched.get(deckId)?.items.map((entry) => [entry.id, entry.ankiFlag, entry.tagKeys]), [[seededA.cards[0].id, 3, ["#ak", "#ak::herz", "#ak::herz::klappen", "eigen"]]]);

  const leeched = setCardLeech(seededA.cards[2], "2026-10-30T12:00:00.000Z", "2026-10-30T12:00:00.000Z");
  const event: ReviewEvent = {
    id: `manual_leech_${Date.now()}`, userId: a.userId, deckId, cardId: leeched.id, variantId: null, rating: "manual",
    answeredAt: "2026-10-30T12:00:00.000Z", responseTimeMs: null, schedulerBefore: null, schedulerAfter: null, flags: { kind: "manual_leech" }, createdAt: "2026-10-30T12:00:00.000Z",
  };
  const persisted = await recordAtomicReview(a.client, { event, card: { id: leeched.id, study: leeched.study, updatedAt: leeched.updatedAt }, variant: null }, { deviceId: "device_editor_a", mutationId: "editor-leech" });
  assert.equal(Date.parse(persisted.entities.card.study.leechedAt ?? ""), Date.parse("2026-10-30T12:00:00.000Z"));
  assert.deepEqual(await ids("tag:leech"), [leeched.id]);
  assert.deepEqual((await listCardReviewEvents(a.client, leeched.id)).map((entry) => entry.flags.kind), ["manual_leech"]);
  assert.deepEqual(await listCardReviewEvents(b.client, leeched.id), []);
});
