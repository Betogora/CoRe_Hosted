import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listAccountSyncConflicts } from "../../src/cloudRepository.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import { createBasicNote, createCoreDeck, planNoteContentChange } from "../../src/coreModel.ts";
import { answerVariant } from "../../src/reviewService.ts";
import { createAccountSyncEngine } from "../../src/syncEngine.ts";
import { SYNC_MUTATION_TYPES } from "../../src/syncMutationPlanner.ts";
import type { Card, Deck, Note, ReviewEvent } from "../../src/coreTypes.ts";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.ts";
import { seedAccountState } from "../support/seedAccountState.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt für den lokalen Zwei-Geräte-Test.`);
  return value;
}

async function createAuthenticatedClient(url: string, key: string, email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) throw error ?? new Error(`Testaccount ${email} konnte nicht angemeldet werden.`);
  return client;
}

function createDevice(client: SupabaseClient, userId: string, id: string, isOnline?: () => boolean) {
  const rows = new Map<string, any>();
  const outbox = {
    enqueue(input: any) { const mutation = { userId, deviceId: id, table: null, entityId: null, baseRevision: null, payload: {}, createdAt: new Date().toISOString(), flushedAt: null, retryCount: 0, ...input }; rows.set(mutation.id, mutation); return mutation; },
    listPending: () => [...rows.values()].filter((row) => !row.flushedAt),
    markFlushed(ids: string[], flushedAt: string) { ids.forEach((key) => { const row = rows.get(key); if (row) rows.set(key, { ...row, flushedAt }); }); },
    markFailed(ids: string[], error: unknown) { ids.forEach((key) => { const row = rows.get(key); if (row) rows.set(key, { ...row, retryCount: row.retryCount + 1, lastError: String((error as Error)?.message ?? error) }); }); },
    remove(ids: string[]) { ids.forEach((key) => rows.delete(key)); },
    count: () => [...rows.values()].filter((row) => !row.flushedAt).length,
  };
  return createAccountSyncEngine(client, {
    userId,
    outbox,
    device: { id, label: id, userAgent: "CoRe Zwei-Geräte-Test" },
    isOnline,
  });
}

/** One deck with one basic content; seeded through the cloud rows like a synchronized account. */
async function seedDeckWithNote(client: SupabaseClient, deviceId: string, name: string, front: string, back: string) {
  const { note, cards } = createBasicNote("pending", front, back);
  const deck = createCoreDeck({ name, source: "manual" });
  const card = { ...cards[0], deckId: deck.id };
  const seeded = await seedAccountState(client, { ...createCoreRepository().getState(), decks: [{ ...deck, cards: [card] }], notes: [note] }, deviceId);
  return {
    deck: seeded.decks[0] as Deck,
    note: seeded.notes[0] as Note,
    card: seeded.decks[0].cards[0] as Card,
  };
}

function reviewMutation(userId: string, deck: Deck, card: Card, answeredAt: string, id: string) {
  const result = answerVariant({ ...deck, cards: [card], reviewEvents: [] }, card.id, null, "good", { now: answeredAt, responseTimeMs: 1200 });
  const event: ReviewEvent = { ...result.event, id, userId, flags: { fixture: "two-device" } };
  return {
    id: `review-${id}`,
    type: SYNC_MUTATION_TYPES.reviewAtomic,
    payload: {
      event,
      card: { id: card.id, study: result.updatedCard.study, updatedAt: answeredAt },
      variant: null,
    },
  };
}

async function readDeckRow(client: SupabaseClient, userId: string, deckId: string) {
  const { data, error } = await client.from("decks").select("id,name,revision,deleted_at").eq("user_id", userId).eq("id", deckId).single();
  if (error) throw error;
  return data;
}

test("zwei Geräte schützen Entity-Revisionen, Offline-Reviews und Soft-Deletes", async () => {
  const url = requiredEnvironment("VITE_SUPABASE_URL");
  const key = requiredEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY");
  const email = requiredEnvironment("CORE_TWO_DEVICE_EMAIL");
  const password = requiredEnvironment("CORE_TWO_DEVICE_PASSWORD");
  assert.equal(isLocalSupabaseUrl(url), true, "Der Zwei-Geräte-Test darf nur gegen lokales Supabase laufen.");

  const clientA = await createAuthenticatedClient(url, key, email, password);
  const clientB = await createAuthenticatedClient(url, key, email, password);
  const { data: userData } = await clientA.auth.getUser();
  assert.ok(userData.user);
  const userId = userData.user.id;
  const engineA = createDevice(clientA, userId, "device_two_a");
  const engineB = createDevice(clientB, userId, "device_two_b");
  const { error: staleConflictError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(staleConflictError);

  const { deck: seededDeck, card } = await seedDeckWithNote(clientA, "device_two_a", "Zwei-Geräte-Ausgang", "Welche Änderung wird synchronisiert?", "Das Review.");
  const deck = seededDeck;

  engineB.enqueueMutation({
    id: `content-b-${deck.id}`,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: deck.id,
    payload: { table: "decks", entity: { ...seededDeck, name: "Neuer Inhalt von Gerät B" }, baseRevision: seededDeck.revision },
  });
  await engineB.flush({ force: true });
  assert.equal(engineB.pendingCount(), 0);

  engineA.enqueueMutation({
    id: `stale-a-${deck.id}`,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: deck.id,
    payload: { table: "decks", entity: { ...seededDeck, name: "Veralteter Inhalt von Gerät A" }, baseRevision: seededDeck.revision },
  });
  const staleFlush = await engineA.flush({ force: true });
  assert.ok(staleFlush.conflicts.length > 0);
  assert.equal((await readDeckRow(clientA, userId, deck.id)).name, "Neuer Inhalt von Gerät B");
  const deckConflict = (await listAccountSyncConflicts(clientA)).find((conflict: { entityId?: string }) => conflict.entityId === deck.id);
  assert.ok(deckConflict);
  const resolved = await engineA.resolveConflict(deckConflict.id, { action: "keep-remote" });
  assert.equal(resolved.conflict.status, "resolved");

  let online = false;
  const offlineEngine = createDevice(clientA, userId, "device_two_offline", () => online);
  const review = reviewMutation(userId, deck, card, "2026-07-14T12:00:00.000Z", `review_two_device_once_${card.id}`);
  offlineEngine.enqueueMutation(review);
  await offlineEngine.flush();
  assert.equal(offlineEngine.pendingCount(), 1);
  online = true;
  await offlineEngine.flush({ force: true });
  await offlineEngine.flush({ force: true });
  const { count: reviewCount, error: reviewError } = await clientA.from("review_events").select("id", { count: "exact", head: true }).eq("id", review.payload.event.id);
  assert.ifError(reviewError);
  assert.equal(reviewCount, 1);

  const remoteDeck = await readDeckRow(clientA, userId, deck.id);
  assert.ok(remoteDeck);
  engineB.enqueueMutation({
    id: `delete-b-${deck.id}`,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: deck.id,
    payload: { table: "decks", entityId: deck.id, baseRevision: remoteDeck.revision, tombstone: true, deletedAt: "2026-07-14T13:00:00.000Z" },
  });
  await engineB.flush({ force: true });
  engineA.enqueueMutation({
    id: `reactivate-a-${deck.id}`,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: deck.id,
    payload: { table: "decks", entity: seededDeck, baseRevision: seededDeck.revision },
  });
  await engineA.flush({ force: true });
  assert.ok((await readDeckRow(clientA, userId, deck.id)).deleted_at);
  const { error: cleanupError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(cleanupError);
});

test("eine Folgeänderung nach verlorener Insert-Antwort wird nur auf dem eigenen Gerät übernommen", async () => {
  const url = requiredEnvironment("VITE_SUPABASE_URL");
  const key = requiredEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY");
  const email = requiredEnvironment("CORE_TWO_DEVICE_EMAIL");
  const password = requiredEnvironment("CORE_TWO_DEVICE_PASSWORD");
  assert.equal(isLocalSupabaseUrl(url), true, "Der Zwei-Geräte-Test darf nur gegen lokales Supabase laufen.");

  const clientA = await createAuthenticatedClient(url, key, email, password);
  const clientB = await createAuthenticatedClient(url, key, email, password);
  const { data: userData } = await clientA.auth.getUser();
  assert.ok(userData.user);
  const userId = userData.user.id;
  const engineA = createDevice(clientA, userId, "device_lost_insert_a");
  const engineB = createDevice(clientB, userId, "device_lost_insert_b");
  const { error: staleConflictError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(staleConflictError);

  const { cards: _cards, reviewEvents: _reviewEvents, ...deck } = createCoreDeck({ name: "Verlorene Insert-Antwort", source: "manual" });
  const insertAndChange = (engine: ReturnType<typeof createDevice>, id: string, name: string) => engine.enqueueMutation({
    id,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: deck.id,
    payload: { table: "decks", entity: { ...deck, name }, baseRevision: null },
  });

  insertAndChange(engineA, `insert-a-${deck.id}`, "Angelegt auf Gerät A");
  await engineA.flush({ force: true });
  assert.equal((await readDeckRow(clientA, userId, deck.id)).revision, 1);

  insertAndChange(engineA, `follow-up-a-${deck.id}`, "Folgeänderung auf Gerät A");
  const ownFlush = await engineA.flush({ force: true });
  assert.equal(ownFlush.conflicts.length, 0);
  assert.deepEqual(await readDeckRow(clientA, userId, deck.id), { id: deck.id, name: "Folgeänderung auf Gerät A", revision: 2, deleted_at: null });

  insertAndChange(engineB, `foreign-b-${deck.id}`, "Fremde Anlage auf Gerät B");
  const foreignFlush = await engineB.flush({ force: true });
  assert.ok(foreignFlush.conflicts.some((conflict: { entityId?: string }) => conflict.entityId === deck.id));
  assert.equal((await readDeckRow(clientA, userId, deck.id)).name, "Folgeänderung auf Gerät A");

  const { error: cleanupError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(cleanupError);
});


test("Review auf Gerät A und Inhaltskorrektur auf Gerät B laufen ohne Konflikt zusammen", async () => {
  const url = requiredEnvironment("VITE_SUPABASE_URL");
  const key = requiredEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY");
  const email = requiredEnvironment("CORE_TWO_DEVICE_EMAIL");
  const password = requiredEnvironment("CORE_TWO_DEVICE_PASSWORD");
  assert.equal(isLocalSupabaseUrl(url), true, "Der Zwei-Geräte-Test darf nur gegen lokales Supabase laufen.");

  const clientA = await createAuthenticatedClient(url, key, email, password);
  const clientB = await createAuthenticatedClient(url, key, email, password);
  const { data: userData } = await clientA.auth.getUser();
  assert.ok(userData.user);
  const userId = userData.user.id;
  const engineA = createDevice(clientA, userId, "device_review_a");
  const engineB = createDevice(clientB, userId, "device_content_b");
  const { error: staleConflictError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(staleConflictError);

  const { deck, note, card } = await seedDeckWithNote(clientA, "device_review_a", "Review und Korrektur", "Hauptstadt von Australien?", "Sydney");
  const corrected = planNoteContentChange({ note, cards: [card] }, {
    ...note.content,
    fields: note.content.fields.map((field) => field.id === "back" ? { ...field, html: "Canberra" } : field),
  });
  assert.equal(corrected.changed, true);

  // Gerät A lernt die Karte mit dem alten Text, Gerät B korrigiert gleichzeitig den Inhalt.
  engineA.enqueueMutation(reviewMutation(userId, deck, card, "2026-07-15T08:00:00.000Z", `review_parallel_${card.id}`));
  engineB.enqueueMutation({
    id: `content-b-${note.id}`,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: note.id,
    payload: { table: "notes", entity: corrected.note, baseRevision: note.revision },
  });
  const [flushA, flushB] = await Promise.all([engineA.flush({ force: true }), engineB.flush({ force: true })]);
  assert.equal(flushA.conflicts.length, 0);
  assert.equal(flushB.conflicts.length, 0);

  const { data: noteRow, error: noteError } = await clientA.from("notes").select("content,content_revision,revision").eq("user_id", userId).eq("id", note.id).single();
  assert.ifError(noteError);
  assert.equal(noteRow.content_revision, note.contentRevision + 1);
  assert.match(JSON.stringify(noteRow.content), /Canberra/);
  const { data: cardRow, error: cardError } = await clientA.from("cards").select("reps,state,study_revision,revision").eq("user_id", userId).eq("id", card.id).single();
  assert.ifError(cardError);
  assert.equal(cardRow.reps, card.study.reps + 1);
  assert.equal(cardRow.study_revision, card.studyRevision + 1);
  assert.equal(cardRow.revision, card.revision, "Ein Review darf die Kartenrevision für Inhaltsänderungen nicht verbrauchen.");

  // Eine zweite, veraltete Korrektur von Gerät A bleibt dagegen ein sichtbarer Konflikt.
  engineA.enqueueMutation({
    id: `stale-content-a-${note.id}`,
    type: SYNC_MUTATION_TYPES.entityMutation,
    entityId: note.id,
    payload: { table: "notes", entity: { ...corrected.note, content: note.content }, baseRevision: note.revision },
  });
  const staleFlush = await engineA.flush({ force: true });
  assert.ok(staleFlush.conflicts.some((conflict: { entityId?: string }) => conflict.entityId === note.id));

  const { error: cleanupError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(cleanupError);
});
