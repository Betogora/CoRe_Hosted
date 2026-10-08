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

test("@beta-core @hosted-core APKG-Medium wird nach dem Deck-Commit cloudbestätigt und als Signed URL gerendert", async ({ page }) => {
  test.setTimeout(180_000);
  await resetToFreshLocalState(page);

  const mainMenu = page.getByRole("navigation", { name: /Hauptmen/ });
  await mainMenu.getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Import/ }).click();
  await page.locator('input[type="file"][accept=".apkg,.colpkg"]').setInputFiles(fixturePath);
  await expect(page.getByText("Importvorschau", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Medien vorhanden", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 60_000 });

  const state = await readActiveAccountState(page);
  const importedDeck = state.decks.find((deck: any) =>
    deck.source === "anki-apkg" && deck.cards?.some((card: any) => Object.keys(card.note?.media ?? {}).length > 0),
  );
  expect(importedDeck).toBeTruthy();
  const mediaCard = importedDeck.cards.find((card: any) => Object.keys(card.note?.media ?? {}).length > 0);
  const mediaSha1s = [...new Set(Object.values(mediaCard.note.media) as string[])];

  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (login.error || !login.data.user) throw login.error ?? new Error("E2E-Medienaccount fehlt.");
  try {
    const { data, error } = await client.from("media_files").select("storage_path, sha1").eq("user_id", login.data.user.id).in("sha1", mediaSha1s);
    if (error) throw error;
    expect(data?.map((row) => row.sha1).sort()).toEqual([...mediaSha1s].sort());
    expect(data?.every((row) => row.storage_path === `${login.data.user.id}/${row.sha1}`)).toBe(true);
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }

  await mainMenu.getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenverwaltung", exact: true }).click();
  await page.getByTestId(`deck-toggle-${importedDeck.id}`).click();
  await page.getByTestId(`deck-card-${mediaCard.id}`).click();
  await page.getByTestId("card-detail-aside").getByRole("button", { name: "Vorschau", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Kartenvorschau" });
  await expect(dialog.frameLocator('iframe[title="Frage"]').locator("img").first()).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
});
