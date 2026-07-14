import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const run = promisify(execFile);
const fixturePath = path.join(process.cwd(), "test-results", "e2e-media.apkg");

test.beforeAll(async () => {
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await run("python", [
    path.join(process.cwd(), "scripts", "create_world_capitals_apkg.py"),
    "--benchmark-output", fixturePath,
    "--benchmark-repeat", "1",
    "--benchmark-media-count", "1",
    "--benchmark-item-count", "1",
  ]);
});

test("APKG-Medium wird nach dem Deck-Commit cloudbestätigt und als Signed URL gerendert", async ({ page }) => {
  test.setTimeout(180_000);
  await resetToFreshLocalState(page);

  const mainMenu = page.getByRole("navigation", { name: /Hauptmen/ });
  await mainMenu.getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Import/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(fixturePath);
  await expect(page.getByText("Importvorschau", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Medien: 1 erkannt/)).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await expect(page.getByText(/Status: cloud-ready/)).toBeVisible({ timeout: 60_000 });

  const state = await readActiveAccountState(page);
  const importedDeck = state.decks.find((deck: any) =>
    deck.cards?.length > 0 && deck.importMeta?.sourceMetadata?.fileName === path.basename(fixturePath),
  );
  expect(importedDeck).toBeTruthy();
  expect(importedDeck.mediaAssets?.length).toBeGreaterThan(0);

  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (login.error || !login.data.user) throw login.error ?? new Error("E2E-Medienaccount fehlt.");
  try {
    const { data, error } = await client.from("media_assets").select("deck_id, storage_path, sha1").eq("user_id", login.data.user.id).eq("deck_id", importedDeck.id).is("deleted_at", null);
    if (error) throw error;
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((row) => row.storage_path === `${login.data.user.id}/objects/${row.sha1}`)).toBe(true);
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }

  await mainMenu.getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-select-${importedDeck.id}`).click();
  await expect(page.locator(`img[src*="/storage/v1/object/sign/core-media/${login.data.user.id}/objects/"]`).first()).toBeVisible({ timeout: 20_000 });
});
