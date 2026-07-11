const CORE_STORAGE_PREFIX = "core.";
const ACCOUNT_STATE_PREFIX = "core.accountState.v1.";
const ACCOUNT_STATE_SUFFIX = ".core.appState.v2";
const SYNC_DEVICE_STORAGE_KEY = "core.syncDevice.v1";

function isSupabaseAuthStorageKey(key) {
  return key.startsWith("sb-") && key.endsWith("-auth-token");
}

export async function resetToFreshLocalState(page) {
  await page.goto("/");

  const authKeyBefore = await page.evaluate(() =>
    Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token")) ?? null,
  );
  if (!authKeyBefore) throw new Error("Die authentifizierte Playwright-Session fehlt vor dem App-State-Reset.");

  await page.waitForFunction((key) => Boolean(localStorage.getItem(key)), SYNC_DEVICE_STORAGE_KEY);
  const syncDeviceIdBefore = await page.evaluate((key) => localStorage.getItem(key), SYNC_DEVICE_STORAGE_KEY);
  if (!syncDeviceIdBefore) throw new Error("Die stabile Geräte-ID fehlt vor dem App-State-Reset.");

  await page.evaluate(({ prefix, syncDeviceKey }) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix) && key !== syncDeviceKey) localStorage.removeItem(key);
    }
  }, { prefix: CORE_STORAGE_PREFIX, syncDeviceKey: SYNC_DEVICE_STORAGE_KEY });

  const preservedCoreStorage = await page.evaluate(({ prefix, syncDeviceKey }) => ({
    keys: Object.keys(localStorage).filter((key) => key.startsWith(prefix)).sort(),
    syncDeviceId: localStorage.getItem(syncDeviceKey),
  }), { prefix: CORE_STORAGE_PREFIX, syncDeviceKey: SYNC_DEVICE_STORAGE_KEY });
  if (preservedCoreStorage.keys.length !== 1 || preservedCoreStorage.keys[0] !== SYNC_DEVICE_STORAGE_KEY) {
    throw new Error(`Der App-State-Reset hat unerwartete CoRe-Schlüssel bewahrt: ${preservedCoreStorage.keys.join(", ")}.`);
  }
  if (preservedCoreStorage.syncDeviceId !== syncDeviceIdBefore) {
    throw new Error("Der App-State-Reset hat die stabile Geräte-ID verändert.");
  }

  const authKeyAfter = await page.evaluate(() =>
    Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token")) ?? null,
  );
  if (authKeyAfter !== authKeyBefore) throw new Error("Der App-State-Reset hat die Supabase-Session verändert.");

  await page.reload();
  await page.getByRole("navigation", { name: /Hauptmen/ }).waitFor({ state: "visible" });

  return { authStorageKey: authKeyAfter, syncDeviceId: syncDeviceIdBefore };
}

export async function readSyncDeviceId(page) {
  const syncDeviceId = await page.evaluate((key) => localStorage.getItem(key), SYNC_DEVICE_STORAGE_KEY);
  if (!syncDeviceId) throw new Error("Die stabile Geräte-ID fehlt im Browser-Storage.");
  return syncDeviceId;
}

export async function readActiveAccountState(page) {
  return page.evaluate(
    ({ prefix, suffix }) => {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix) && key.endsWith(suffix));
      if (keys.length !== 1) {
        throw new Error(`Erwartete genau einen accountgebundenen CoRe-State, gefunden: ${keys.length}.`);
      }

      const value = localStorage.getItem(keys[0]);
      if (!value) throw new Error("Der accountgebundene CoRe-State ist leer.");
      return JSON.parse(value);
    },
    { prefix: ACCOUNT_STATE_PREFIX, suffix: ACCOUNT_STATE_SUFFIX },
  );
}

export function sanitizeStorageState(storageState) {
  return {
    ...storageState,
    origins: (storageState.origins ?? []).map((origin) => ({
      ...origin,
      localStorage: (origin.localStorage ?? []).filter(({ name }) => !name.startsWith(CORE_STORAGE_PREFIX)),
    })),
  };
}

export function hasSupabaseAuthStorage(storageState) {
  return (storageState.origins ?? []).some((origin) => (origin.localStorage ?? []).some(({ name }) => isSupabaseAuthStorageKey(name)));
}
