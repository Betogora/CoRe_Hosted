import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listAccountSyncConflicts, replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreRepository, normalizeWorkspaceState } from "../../src/coreRepository.ts";
import { createManualCoreDeck } from "../../src/coreModel.ts";
import type { WorkspaceState } from "../../src/coreWorkspace.ts";
import { createAccountSyncEngine, SYNC_MUTATION_TYPES } from "../../src/syncEngine.ts";
import type { ReviewEvent } from "../../src/coreTypes.ts";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.ts";

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

  const repository = createCoreRepository({ seedDefaultDecks: false });
  const deckWithCard = createManualCoreDeck({
    deckName: "Zwei-Geräte-Ausgang",
    card: { cardType: "free-text", front: "Welche Änderung wird synchronisiert?", back: "Das Review." },
  });
  const deck = deckWithCard;
  const learningItem = deckWithCard.cards.at(-1);
  const originalVariant = learningItem?.variants.find((variant) => variant.isOriginal);
  assert.ok(learningItem && originalVariant);
  const initialState = normalizeWorkspaceState({ ...repository.getState(), decks: [deckWithCard] }) as WorkspaceState;
  const seeded = await replaceAccountCloudState(clientA, initialState, { deviceId: "device_two_a" });
  const seededDeck = seeded.state.decks.find((item: { id: string }) => item.id === deck.id);
  assert.ok(seededDeck);

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
  const reviewEvent: ReviewEvent = {
    id: `review_two_device_once_${learningItem.id}`,
    userId,
    deckId: deck.id,
    learningItemId: learningItem.id,
    variantId: originalVariant.id,
    reviewableType: "card",
    reviewableId: learningItem.id,
    sourceCardId: learningItem.id,
    rating: "good",
    answeredAt: "2026-07-14T12:00:00.000Z",
    responseTimeMs: 1200,
    schedulerBefore: {},
    schedulerAfter: {},
    flags: { fixture: "two-device" },
    createdAt: "2026-07-14T12:00:00.000Z",
  };
  offlineEngine.enqueueMutation({
    id: `review-${learningItem.id}`,
    type: SYNC_MUTATION_TYPES.reviewAtomic,
    payload: {
      event: reviewEvent,
      deck: { id: deck.id },
      card: {
        id: learningItem.id,
        learningItemState: learningItem.learningItemState,
        reviewState: learningItem.reviewState,
        coreState: learningItem.coreState,
        updatedAt: reviewEvent.answeredAt,
      },
      variant: {
        id: originalVariant.id,
        reviewState: originalVariant.reviewState,
        performance: originalVariant.performance,
        updatedAt: reviewEvent.answeredAt,
      },
    },
  });
  await offlineEngine.flush();
  assert.equal(offlineEngine.pendingCount(), 1);
  online = true;
  await offlineEngine.flush({ force: true });
  await offlineEngine.flush({ force: true });
  const { count: reviewCount, error: reviewError } = await clientA.from("review_events").select("id", { count: "exact", head: true }).eq("id", reviewEvent.id);
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
