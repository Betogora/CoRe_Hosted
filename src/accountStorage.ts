import * as v from "valibot";

const ACCOUNT_STORAGE_PREFIX = "core.accountState.v2";
const SYNC_DEVICE_KEY = "core.syncDevice.v2";
const deviceIdSchema = v.pipe(v.string(), v.regex(/^device_[A-Za-z0-9_-]+$/));

function getStorage(storage: any = null) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;

  const memory = new Map();
  return {
    getItem: (key: any) => memory.get(key) ?? null,
    setItem: (key: any, value: any) => memory.set(key, String(value)),
    removeItem: (key: any) => memory.delete(key),
  };
}

function accountKey(userId: any, key: any) {
  return `${ACCOUNT_STORAGE_PREFIX}.${encodeURIComponent(String(userId ?? "anonymous"))}.${key}`;
}

export function createAccountStorage(userId: any, storage: any = null) {
  const resolvedStorage = getStorage(storage);
  return {
    getItem: (key: any) => resolvedStorage.getItem(accountKey(userId, key)),
    setItem: (key: any, value: any) => resolvedStorage.setItem(accountKey(userId, key), value),
    removeItem: (key: any) => resolvedStorage.removeItem(accountKey(userId, key)),
    accountKey: (key: any) => accountKey(userId, key),
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

export const accountStorageKeys = { ACCOUNT_STORAGE_PREFIX, SYNC_DEVICE_KEY };
