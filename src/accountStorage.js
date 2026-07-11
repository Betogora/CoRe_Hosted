const APP_STATE_KEY = "core.appState.v2";
const LEGACY_DECKS_KEY = "core.importedDecks.v1";
const ACCOUNT_STORAGE_PREFIX = "core.accountState.v1";
const ACCOUNT_MIGRATION_PREFIX = "core.accountMigration.v1";
const SYNC_DEVICE_KEY = "core.syncDevice.v1";

function getStorage(storage = null) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;

  const memory = new Map();
  return {
    getItem(key) {
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
  };
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeUserKey(userId) {
  return encodeURIComponent(String(userId ?? "anonymous"));
}

function accountKey(userId, key) {
  return `${ACCOUNT_STORAGE_PREFIX}.${safeUserKey(userId)}.${key}`;
}

function migrationKey(userId) {
  return `${ACCOUNT_MIGRATION_PREFIX}.${safeUserKey(userId)}`;
}

export function createAccountStorage(userId, storage = null) {
  const resolvedStorage = getStorage(storage);

  return {
    getItem(key) {
      return resolvedStorage.getItem(accountKey(userId, key));
    },
    setItem(key, value) {
      resolvedStorage.setItem(accountKey(userId, key), value);
    },
    removeItem(key) {
      resolvedStorage.removeItem(accountKey(userId, key));
    },
    accountKey(key) {
      return accountKey(userId, key);
    },
  };
}

export function getOrCreateSyncDeviceId(storage = null) {
  const resolvedStorage = getStorage(storage);
  const existing = resolvedStorage.getItem(SYNC_DEVICE_KEY);
  if (existing) return existing;
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? `device_${crypto.randomUUID()}`
    : `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  resolvedStorage.setItem(SYNC_DEVICE_KEY, id);
  return id;
}

export function readLegacyLocalState(storage = null) {
  const resolvedStorage = getStorage(storage);
  const currentState = parseJson(resolvedStorage.getItem(APP_STATE_KEY), null);
  if (currentState) return currentState;

  const legacyDecks = parseJson(resolvedStorage.getItem(LEGACY_DECKS_KEY), []);
  if (!Array.isArray(legacyDecks) || legacyDecks.length === 0) return null;

  return {
    version: 2,
    profile: null,
    decks: legacyDecks,
    communities: [],
    aiJobs: [],
    documents: [],
    chatTranscript: [],
    learningPlans: [],
    updatedAt: new Date().toISOString(),
  };
}

export function hasMeaningfulLocalState(state) {
  return Boolean(
    state &&
      ((Array.isArray(state.decks) && state.decks.length > 0) ||
        (Array.isArray(state.documents) && state.documents.length > 0) ||
        (Array.isArray(state.aiJobs) && state.aiJobs.length > 0) ||
        (Array.isArray(state.communities) && state.communities.length > 0)),
  );
}

export function hasPendingLocalMigration(userId, storage = null) {
  const resolvedStorage = getStorage(storage);
  if (resolvedStorage.getItem(migrationKey(userId))) return false;

  return hasMeaningfulLocalState(readLegacyLocalState(resolvedStorage));
}

export function markLocalMigrationHandled(userId, decision, storage = null) {
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
