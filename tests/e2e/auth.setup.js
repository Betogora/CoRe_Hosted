import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { replaceAccountCloudState } from "../../src/cloudRepository.js";
import { createCoreRepository } from "../../src/coreRepository.js";
import { hasSupabaseAuthStorage, sanitizeStorageState } from "./support/appState.js";
import { e2eAuthStatePath, ensureLocalE2EAccount, loadE2EEnvironment } from "./support/e2eEnvironment.js";

function createE2ESeedState(email) {
  const seedState = createCoreRepository(null, { seedDefaultDecks: true }).getState();
  return {
    ...seedState,
    profile: {
      ...seedState.profile,
      email,
      displayName: "CoRe E2E",
      onboardingComplete: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function resetTestAccount(environment) {
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error) throw new Error(`Der dedizierte E2E-Testaccount konnte nicht angemeldet werden: ${error.message}`);

  try {
    await replaceAccountCloudState(client, createE2ESeedState(environment.email));
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

setup("dedizierten Testaccount zurücksetzen und Auth-Session speichern", async ({ page }) => {
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

  const storageState = sanitizeStorageState(await page.context().storageState());
  expect(hasSupabaseAuthStorage(storageState)).toBe(true);
  expect(storageState.origins.flatMap((origin) => origin.localStorage ?? []).some(({ name }) => name.startsWith("core."))).toBe(false);

  await mkdir(path.dirname(e2eAuthStatePath), { recursive: true });
  await writeFile(e2eAuthStatePath, `${JSON.stringify(storageState, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
});
