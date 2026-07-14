import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Deck } from "../../src/coreTypes.ts";
import { hasSupabaseAuthStorage, readSyncDeviceId, sanitizeStorageState } from "./support/appState.ts";
import { e2eAuthStatePath, ensureLocalE2EAccount, loadE2EEnvironment } from "./support/e2eEnvironment.ts";

function createE2ESeedState(email: string) {
  const seedState = createCoreRepository(null, { seedDefaultDecks: true }).getState();
  return {
    ...seedState,
    decks: seedState.decks.map((deck: Deck) => ({ ...deck, reviewEvents: [] })),
    profile: {
      ...seedState.profile,
      email,
      displayName: "CoRe E2E",
      onboardingComplete: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function resetTestAccount(environment: { supabaseUrl: any; publishableKey: any; email: any; password: any; }) {
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error) throw new Error(`Der dedizierte E2E-Testaccount konnte nicht angemeldet werden: ${error.message}`);
  if (!data.user) throw new Error("Der dedizierte E2E-Testaccount hat nach der Anmeldung keinen Nutzer.");

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

async function readRegisteredDevices(environment: { supabaseUrl: any; publishableKey: any; email: any; password: any; }) {
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (signInError) throw new Error(`Die Geräte-Registrierung konnte nicht geprüft werden: ${signInError.message}`);

  try {
    const { data, error } = await client
      .from("sync_devices")
      .select("id, label, user_agent, last_seen_at, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Registrierte E2E-Geräte konnten nicht gelesen werden: ${error.message}`);
    return data ?? [];
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

setup("dedizierten Testaccount zurücksetzen und Auth-Session speichern", async ({ page }: any) => {
  const environment = loadE2EEnvironment();
  await ensureLocalE2EAccount(environment);
  await resetTestAccount(environment);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
  await page.getByLabel("E-Mail").fill(environment.email);
  await page.getByLabel("Passwort", { exact: true }).fill(environment.password);
  await page.locator("form").getByRole("button", { name: "Anmelden", exact: true }).click();

  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("navigation", { name: /Hauptmen/ }).getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId("learn-deck-row-deck_world_capitals")).toContainText("Welt-Hauptstädte");

  const syncDeviceId = await readSyncDeviceId(page);
  const devicesAfterLogin = await readRegisteredDevices(environment);
  expect(devicesAfterLogin).toHaveLength(1);
  expect(devicesAfterLogin[0]).toMatchObject({ id: syncDeviceId });
  expect(devicesAfterLogin[0].label).not.toBe("");
  expect(devicesAfterLogin[0].user_agent).not.toBe("");
  expect(Date.parse(devicesAfterLogin[0].last_seen_at)).not.toBeNaN();
  expect(Date.parse(devicesAfterLogin[0].created_at)).not.toBeNaN();

  await page.reload();
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toBeVisible({ timeout: 30_000 });
  expect(await readSyncDeviceId(page)).toBe(syncDeviceId);
  const devicesAfterReload = await readRegisteredDevices(environment);
  expect(devicesAfterReload).toHaveLength(1);
  expect(devicesAfterReload[0].id).toBe(syncDeviceId);
  expect(devicesAfterReload[0].created_at).toBe(devicesAfterLogin[0].created_at);
  expect(Date.parse(devicesAfterReload[0].last_seen_at)).toBeGreaterThanOrEqual(Date.parse(devicesAfterLogin[0].last_seen_at));

  const storageState = sanitizeStorageState(await page.context().storageState());
  expect(hasSupabaseAuthStorage(storageState)).toBe(true);
  expect(storageState.origins.flatMap((origin: { localStorage: any; }) => origin.localStorage ?? []).some(({ name }: any) => name.startsWith("core."))).toBe(false);

  await mkdir(path.dirname(e2eAuthStatePath), { recursive: true });
  await writeFile(e2eAuthStatePath, `${JSON.stringify(storageState, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
});
