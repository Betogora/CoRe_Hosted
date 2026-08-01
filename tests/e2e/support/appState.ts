import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { replaceAccountCloudState } from "../../../src/cloudRepository.ts";
import { createCoreRepository } from "../../../src/coreRepository.ts";
import type { Deck } from "../../../src/coreTypes.ts";
import { loadE2EEnvironment } from "./e2eEnvironment.ts";

const CORE_STORAGE_PREFIX = "core.";
const ACCOUNT_STATE_PREFIX = "core.accountState.v1.";
const ACCOUNT_STATE_SUFFIX = ".core.appState.v3";
const SYNC_DEVICE_STORAGE_KEY = "core.syncDevice.v1";

function isSupabaseAuthStorageKey(key: string) {
  return key.startsWith("sb-") && key.endsWith("-auth-token");
}

function createE2ESeedState(email: string) {
  const seedState = createCoreRepository(null, { seedDefaultDecks: true }).getState();
  return {
    ...seedState,
    decks: seedState.decks.map((deck: Deck) => ({ ...deck, reviewEvents: [] })),
    profile: { ...seedState.profile, email, displayName: "CoRe E2E", onboardingComplete: true },
    updatedAt: new Date().toISOString(),
  };
}

export async function resetTestAccount(environment = loadE2EEnvironment()) {
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw new Error(`Der dedizierte E2E-Testaccount konnte nicht angemeldet werden: ${error?.message ?? "kein Nutzer"}`);

  try {
    const { data: mediaRows, error: mediaReadError } = await client.from("media_assets").select("storage_bucket, storage_path").eq("user_id", data.user.id);
    if (mediaReadError) throw new Error(`E2E-Medienreferenzen konnten nicht gelesen werden: ${mediaReadError.message}`);
    const { error: mediaDeleteError } = await client.from("media_assets").delete().eq("user_id", data.user.id);
    if (mediaDeleteError) throw new Error(`E2E-Medienreferenzen konnten nicht zurückgesetzt werden: ${mediaDeleteError.message}`);
    const pathsByBucket = new Map<string, Set<string>>();
    for (const row of mediaRows ?? []) pathsByBucket.set(row.storage_bucket, new Set([...(pathsByBucket.get(row.storage_bucket) ?? []), row.storage_path]));
    for (const [bucket, paths] of pathsByBucket) {
      const { error: mediaObjectError } = await client.storage.from(bucket).remove([...paths]);
      if (mediaObjectError) throw new Error(`E2E-Medienobjekte konnten nicht zurückgesetzt werden: ${mediaObjectError.message}`);
    }
    const { error: conflictCleanupError } = await client.from("sync_conflicts").delete().eq("user_id", data.user.id);
    if (conflictCleanupError) throw new Error(`E2E-Synchronisierungskonflikte konnten nicht zurückgesetzt werden: ${conflictCleanupError.message}`);
    const { error: deviceCleanupError } = await client.from("sync_devices").delete().eq("user_id", data.user.id);
    if (deviceCleanupError) throw new Error(`Registrierte E2E-Geräte konnten nicht zurückgesetzt werden: ${deviceCleanupError.message}`);
    await replaceAccountCloudState(client, createE2ESeedState(environment.email), { deviceId: "e2e-test-reset" });
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

export async function resetToFreshLocalState(page: Page, options: { resetCloud?: boolean } = {}) {
  if (options.resetCloud !== false) await resetTestAccount();
  await page.goto("/");

  const authKeyBefore = await page.evaluate(() =>
    Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token")) ?? null,
  );
  if (!authKeyBefore) throw new Error("Die authentifizierte Playwright-Session fehlt vor dem App-State-Reset.");

  await page.waitForFunction((key: string) => Boolean(localStorage.getItem(key)), SYNC_DEVICE_STORAGE_KEY);
  const syncDeviceIdBefore = await page.evaluate((key: string) => localStorage.getItem(key), SYNC_DEVICE_STORAGE_KEY);
  if (!syncDeviceIdBefore) throw new Error("Die stabile Geräte-ID fehlt vor dem App-State-Reset.");

  await page.evaluate(({ prefix, syncDeviceKey }: any) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix) && key !== syncDeviceKey) localStorage.removeItem(key);
    }
  }, { prefix: CORE_STORAGE_PREFIX, syncDeviceKey: SYNC_DEVICE_STORAGE_KEY });

  const preservedCoreStorage = await page.evaluate(({ prefix, syncDeviceKey }: any) => ({
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

export async function readSyncDeviceId(page: Page) {
  const syncDeviceId = await page.evaluate((key: string) => localStorage.getItem(key), SYNC_DEVICE_STORAGE_KEY);
  if (!syncDeviceId) throw new Error("Die stabile Geräte-ID fehlt im Browser-Storage.");
  return syncDeviceId;
}

export async function readActiveAccountState(page: Page) {
  return page.evaluate(
    ({ prefix, suffix }: any) => {
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

export function sanitizeStorageState(storageState: { cookies?: { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: "Strict"|"Lax"|"None"; }[]; origins: any; }) {
  return {
    ...storageState,
    origins: (storageState.origins ?? []).map((origin: { localStorage: any; }) => ({
      ...origin,
      localStorage: (origin.localStorage ?? []).filter(({ name }: any) => !name.startsWith(CORE_STORAGE_PREFIX)),
    })),
  };
}

export function hasSupabaseAuthStorage(storageState: { origins: any; }) {
  return (storageState.origins ?? []).some((origin: { localStorage: any; }) => (origin.localStorage ?? []).some(({ name }: any) => isSupabaseAuthStorageKey(name)));
}
