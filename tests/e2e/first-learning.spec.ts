import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import { readActiveAccountState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const SMALL_APKG_FIXTURE = fileURLToPath(new URL("../../fixtures/apkg/import-quality-legacy.apkg", import.meta.url));

async function resetAccountToEmpty() {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw new Error(`Der leere E2E-Account konnte nicht vorbereitet werden: ${error?.message ?? "Nutzer fehlt"}`);

  try {
    const emptyState = createCoreRepository(null, { seedDefaultDecks: false }).getState();
    await replaceAccountCloudState(client, {
      ...emptyState,
      profile: { ...emptyState.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, { deviceId: "e2e-first-learning-reset" });
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

async function openEmptyDashboard(page: any) {
  await resetAccountToEmpty();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Willkommen bei CoRe" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Erste Karte erstellen/ })).toBeVisible();
  const state = await readActiveAccountState(page);
  expect(state.decks).toEqual([]);
}

async function completeOneReview(page: any) {
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state.decks.reduce((count: number, deck: any) => count + (deck.reviewEvents?.length ?? 0), 0);
  }).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await openEmptyDashboard(page);
});

test("leerer Account erstellt die erste manuelle Karte und erreicht den Review", async ({ page }) => {
  await page.getByRole("button", { name: /Erste Karte erstellen/ }).click();
  await expect(page).toHaveURL(/\/neue-karten\?method=manual$/);
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Welche Farbe hat der Himmel bei klarem Wetter?");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Blau");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();

  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jetzt lernen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Karten prüfen" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt lernen" }).click();
  await completeOneReview(page);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
});

test("[Vertrag: APKG-Vorschau bis Review] @golden-e2e leerer Account importiert eine kleine APKG und erreicht den Review", async ({ page }) => {
  await page.getByRole("button", { name: /Anki-Stapel importieren/ }).click();
  await expect(page).toHaveURL(/\/neue-karten\?method=import$/);
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(SMALL_APKG_FIXTURE);
  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();

  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt lernen" }).click();
  await completeOneReview(page);
});

test("Demo-Daten werden erst nach dem ausdrücklichen Klick angelegt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Willkommen bei CoRe" })).toBeVisible({ timeout: 30_000 });
  expect((await readActiveAccountState(page)).decks).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole("button", { name: /Anki-Stapel importieren/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Erste Karte erstellen/ })).toBeVisible();
  await page.getByRole("button", { name: /Demo ausprobieren/ }).click();

  await expect(page).toHaveURL(/\/lernen$/, { timeout: 30_000 });
  await expect(page.getByTestId("learn-deck-row-deck_world_capitals")).toContainText("Welt-Hauptstädte");
  expect((await readActiveAccountState(page)).decks).toHaveLength(8);
});
