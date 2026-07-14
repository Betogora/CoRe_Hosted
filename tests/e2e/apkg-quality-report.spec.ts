import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

const LATEST_APKG_FIXTURE = fileURLToPath(new URL("../../fixtures/apkg/import-quality-latest.apkg", import.meta.url));

test("latest APKG preview shows the complete quality report without mutating account data", async ({ page }) => {
  await resetToFreshLocalState(page);
  const before = await readActiveAccountState(page);
  const beforeDeckCount = before.decks?.length ?? 0;

  await page.getByRole("navigation", { name: /Hauptmenü/ }).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button").filter({ hasText: "APKG, Text, Tabellen" }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(LATEST_APKG_FIXTURE);

  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kartentypen und Felder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Medien" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reimport" })).toBeVisible();
  await expect(page.getByText("CoRe APKG Qualität::Sonderformat")).toBeVisible();
  await expect(page.getByText("Nicht zugeordnet: Kontext")).toBeVisible();
  await expect(page.getByText("Fehlend: missing.png")).toBeVisible();
  await expect(page.getByText(/Mehrere Anki-Decks wurden erkannt/)).toBeVisible();

  const after = await readActiveAccountState(page);
  expect(after.decks?.length ?? 0).toBe(beforeDeckCount);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reimport" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
