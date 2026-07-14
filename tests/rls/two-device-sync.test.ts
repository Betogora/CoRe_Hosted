import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAccountStorage } from "../../src/accountStorage.ts";
import { listAccountSyncConflicts, replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import { createCoreWorkspace, type CoreWorkspace, type WorkspaceState } from "../../src/coreWorkspace.ts";
import { createAccountSyncEngine, SYNC_MUTATION_TYPES, type AccountSyncEngine } from "../../src/syncEngine.ts";
import type { ReviewEvent } from "../../src/coreTypes.ts";
import { isLocalSupabaseUrl } from "../../scripts/localE2EEnvironment.ts";

interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface DeviceHarness {
  client: SupabaseClient;
  workspace: CoreWorkspace;
  engine: AccountSyncEngine;
}

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt für den lokalen Zwei-Geräte-Test.`);
  return value;
}

async function createAuthenticatedClient(
  url: string,
  key: string,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) throw error ?? new Error(`Testaccount ${email} konnte nicht angemeldet werden.`);
  return client;
}

function createDeviceHarness(client: SupabaseClient, userId: string, deviceId: string): DeviceHarness {
  const storage = createAccountStorage(userId, createMemoryStorage());
  const workspace = createCoreWorkspace(createCoreRepository(storage, { seedDefaultDecks: false }));
  const engine = createAccountSyncEngine(client, {
    userId,
    storage,
    device: { id: deviceId, label: deviceId, userAgent: "CoRe Zwei-Geräte-Test" },
    persistSnapshot: (state: WorkspaceState) => workspace.saveState(state),
  });
  return { client, workspace, engine };
}

test("zwei Geräte schützen neueren Content, Offline-Reviews und Soft-Deletes", async () => {
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
  const deviceA = createDeviceHarness(clientA, userId, "device_two_a");
  const deviceB = createDeviceHarness(clientB, userId, "device_two_b");
  const { error: staleConflictError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(staleConflictError);

  const deck = deviceA.workspace.createDeck({ name: "Zwei-Geräte-Ausgang" });
  const deckWithCard = deviceA.workspace.addManualCardToDeck(deck.id, {
    deckName: deck.name,
    card: {
      cardType: "free-text",
      front: "Welche Änderung muss genau einmal synchronisiert werden?",
      back: "Das offline beantwortete Review.",
    },
  });
  assert.ok(deckWithCard);
  const learningItem = deckWithCard.cards.at(-1);
  assert.ok(learningItem);
  const originalVariant = learningItem.variants.find((variant) => variant.isOriginal);
  assert.ok(originalVariant);
  const initialState = deviceA.workspace.getState();
  const seededResult = await replaceAccountCloudState(clientA, initialState, { deviceId: "device_two_a" });
  deviceA.workspace.saveState(seededResult.state);
  deviceB.workspace.saveState(await deviceB.engine.loadSnapshot(deviceB.workspace.getState()));
  const staleSnapshotA = structuredClone(deviceA.workspace.getState());

  const bDeck = deviceB.workspace.updateDeck(deck.id, (current) => ({ ...current, name: "Neuer Inhalt von Gerät B" }));
  assert.ok(bDeck);
  deviceB.engine.enqueueMutation({ id: `two-device-content-b-${deck.id}`, type: SYNC_MUTATION_TYPES.statePatch, payload: { state: deviceB.workspace.getState() } });
  const contentFlush = await deviceB.engine.flush(deviceB.workspace.getState(), { force: true });
  assert.ok(contentFlush.saved);
  assert.equal(deviceB.engine.pendingCount(), 0);

  deviceA.engine.enqueueMutation({ id: `two-device-stale-a-${deck.id}`, type: SYNC_MUTATION_TYPES.statePatch, payload: { state: staleSnapshotA } });
  const staleFlush = await deviceA.engine.flush(staleSnapshotA, { force: true });
  assert.ok(staleFlush.conflicts.length > 0, "Der alte Snapshot muss einen Konflikt erzeugen.");
  const remoteAfterConflict = await deviceB.engine.loadSnapshot(deviceB.workspace.getState());
  assert.equal(remoteAfterConflict.decks.find((item: { id: string }) => item.id === deck.id)?.name, "Neuer Inhalt von Gerät B");
  const conflicts = await listAccountSyncConflicts(clientA);
  const deckConflict = conflicts.find((conflict: { entityId?: string }) => conflict.entityId === deck.id);
  assert.ok(deckConflict);
  const resolvedConflict = await deviceA.engine.resolveConflict(
    deckConflict.id,
    { action: "keep-remote" },
    staleSnapshotA,
  );
  assert.equal(resolvedConflict.conflict.status, "resolved");

  let online = false;
  const offlineStorage = createAccountStorage(userId, createMemoryStorage());
  const offlineWorkspace = createCoreWorkspace(createCoreRepository(offlineStorage, { seedDefaultDecks: false }));
  const offlineEngine = createAccountSyncEngine(clientA, {
    userId,
    storage: offlineStorage,
    device: { id: "device_two_offline", label: "Offline-Gerät", userAgent: "CoRe Zwei-Geräte-Test" },
    isOnline: () => online,
    persistSnapshot: (state: WorkspaceState) => offlineWorkspace.saveState(state),
  });
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
  offlineEngine.enqueueMutation({ id: `mutation-review-two-device-${learningItem.id}`, type: SYNC_MUTATION_TYPES.reviewEventAppend, payload: { event: reviewEvent } });
  await offlineEngine.flush(offlineWorkspace.getState());
  assert.equal(offlineEngine.pendingCount(), 1);
  online = true;
  await offlineEngine.flush(offlineWorkspace.getState(), { force: true });
  await offlineEngine.flush(offlineWorkspace.getState(), { force: true });
  assert.equal(offlineEngine.pendingCount(), 0);
  const { count: reviewCount, error: reviewError } = await clientA.from("review_events").select("id", { count: "exact", head: true }).eq("id", reviewEvent.id);
  assert.ifError(reviewError);
  assert.equal(reviewCount, 1, "Ein wiederholter Flush darf das Review nicht duplizieren.");

  const currentB = await deviceB.engine.loadSnapshot(deviceB.workspace.getState());
  deviceB.workspace.saveState(currentB);
  const deletion = deviceB.workspace.deleteDeckTree(deck.id);
  assert.ok(deletion);
  deviceB.engine.enqueueMutation({ id: `two-device-delete-b-${deck.id}`, type: SYNC_MUTATION_TYPES.statePatch, payload: { state: deviceB.workspace.getState() } });
  await deviceB.engine.flush(deviceB.workspace.getState(), { force: true });
  deviceA.engine.enqueueMutation({ id: `two-device-reactivate-a-${deck.id}`, type: SYNC_MUTATION_TYPES.statePatch, payload: { state: staleSnapshotA } });
  await deviceA.engine.flush(staleSnapshotA, { force: true });
  const remoteAfterDelete = await deviceB.engine.loadSnapshot(deviceB.workspace.getState());
  assert.equal(remoteAfterDelete.decks.some((item: { id: string; deletedAt?: string | null }) => item.id === deck.id && !item.deletedAt), false);
  const { error: cleanupConflictError } = await clientA.from("sync_conflicts").delete().eq("user_id", userId);
  assert.ifError(cleanupConflictError);
});
