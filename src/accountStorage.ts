const APP_STATE_KEY = "core.appState.v2";
const LEGACY_DECKS_KEY = "core.importedDecks.v1";
const ACCOUNT_STORAGE_PREFIX = "core.accountState.v1";
const ACCOUNT_MIGRATION_PREFIX = "core.accountMigration.v1";
const SYNC_DEVICE_KEY = "core.syncDevice.v1";

function getStorage(storage: any = null) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;

  const memory = new Map();
  return {
    getItem(key: any) {
      return memory.get(key) ?? null;
    },
    setItem(key: any, value: any) {
      memory.set(key, String(value));
    },
    removeItem(key: any) {
      memory.delete(key);
    },
  };
}

const storedDeckSchema = v.looseObject({ id: v.string() });
const legacyStateSchema = v.looseObject({
  version: v.optional(v.number()),
  profile: v.optional(v.nullable(v.unknown())),
  decks: v.array(storedDeckSchema),
  communities: v.optional(v.array(v.unknown())),
  aiJobs: v.optional(v.array(v.unknown())),
  documents: v.optional(v.array(v.unknown())),
  chatTranscript: v.optional(v.array(v.unknown())),
  learningPlans: v.optional(v.array(v.unknown())),
});
const migrationMarkerSchema = v.looseObject({ decision: v.string(), handledAt: v.string() });
const deviceIdSchema = v.pipe(v.string(), v.regex(/^device_[A-Za-z0-9_-]+$/));

function parseJson(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string" || !value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeUserKey(userId: any) {
  return encodeURIComponent(String(userId ?? "anonymous"));
}

function accountKey(userId: any, key: any) {
  return `${ACCOUNT_STORAGE_PREFIX}.${safeUserKey(userId)}.${key}`;
}

function migrationKey(userId: any) {
  return `${ACCOUNT_MIGRATION_PREFIX}.${safeUserKey(userId)}`;
}

export function createAccountStorage(userId: any, storage: any = null) {
  const resolvedStorage = getStorage(storage);

  return {
    getItem(key: any) {
      return resolvedStorage.getItem(accountKey(userId, key));
    },
    setItem(key: any, value: any) {
      resolvedStorage.setItem(accountKey(userId, key), value);
    },
    removeItem(key: any) {
      resolvedStorage.removeItem(accountKey(userId, key));
    },
    accountKey(key: any) {
      return accountKey(userId, key);
    },
  };
}

export function getOrCreateSyncDeviceId(storage: any = null) {
  const resolvedStorage = getStorage(storage);
  const existing = resolvedStorage.getItem(SYNC_DEVICE_KEY);
  if (v.safeParse(deviceIdSchema, existing).success) return existing;
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? `device_${crypto.randomUUID()}`
    : `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  resolvedStorage.setItem(SYNC_DEVICE_KEY, id);
  return id;
}

export function readLegacyLocalState(storage: any = null) {
  const resolvedStorage = getStorage(storage);
  const currentState = parseJson(resolvedStorage.getItem(APP_STATE_KEY), null);
  const currentResult = v.safeParse(legacyStateSchema, currentState);
  if (currentResult.success) return currentResult.output;

  const legacyDecks = parseJson(resolvedStorage.getItem(LEGACY_DECKS_KEY), []);
  const legacyDeckResult = v.safeParse(v.array(storedDeckSchema), legacyDecks);
  if (!legacyDeckResult.success || legacyDeckResult.output.length === 0) return null;

  return {
    version: 2,
    profile: null,
    decks: legacyDeckResult.output,
    communities: [],
    aiJobs: [],
    documents: [],
    chatTranscript: [],
    learningPlans: [],
    updatedAt: new Date().toISOString(),
  };
}

export function hasMeaningfulLocalState(state: any) {
  return Boolean(
    state &&
      ((Array.isArray(state.decks) && state.decks.length > 0) ||
        (Array.isArray(state.documents) && state.documents.length > 0) ||
        (Array.isArray(state.aiJobs) && state.aiJobs.length > 0) ||
        (Array.isArray(state.communities) && state.communities.length > 0)),
  );
}

export function hasPendingLocalMigration(userId: any, storage: any = null) {
  const resolvedStorage = getStorage(storage);
  const marker = parseJson(resolvedStorage.getItem(migrationKey(userId)), null);
  if (v.safeParse(migrationMarkerSchema, marker).success) return false;

  return hasMeaningfulLocalState(readLegacyLocalState(resolvedStorage));
}

export function markLocalMigrationHandled(userId: any, decision: any, storage: any = null) {
  const resolvedStorage = getStorage(storage);
  resolvedStorage.setItem(
    migrationKey(userId),
    JSON.stringify({
      decision,
      handledAt: new Date().toISOString(),
    }),
  );
}

export const accountStorageKeys = {
  APP_STATE_KEY,
  LEGACY_DECKS_KEY,
  ACCOUNT_STORAGE_PREFIX,
  ACCOUNT_MIGRATION_PREFIX,
  SYNC_DEVICE_KEY,
};
import * as v from "valibot";
