import { expect, test, type Page } from "@playwright/test";
import { resetToFreshLocalState } from "./support/appState.ts";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: "Hauptmenü" });
}

test("core navigation exposes only the reliable product areas", async ({ page }) => {
  await resetToFreshLocalState(page);

  const menu = mainMenu(page);
  await expect(menu.getByRole("button")).toHaveText(["Heute", "Erstellen", "Lernen", "Statistik"]);
  await expect(menu.getByRole("button", { name: "Graph" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: /Community/ })).toHaveCount(0);
  await menu.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: /Karten manuell erstellen/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /APKG, Text, Tabellen/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /KI-gestützte Erstellung/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einstellungen öffnen" })).toBeVisible();
});

test("explicit labs entry keeps experimental routes stable across browser history", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.locator("summary").filter({ hasText: "Labs" }).click();
  const labs = page.getByRole("navigation", { name: "Labs" });
  await expect(labs.getByRole("button", { name: "Graph" })).toBeVisible();
  await labs.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("heading", { name: "Deck Graph" })).toBeVisible();
  await expect(page.getByLabel("Labs-Hinweis")).toContainText("Experimentelle Labs-Funktion");
  await expect(page).toHaveURL(/\/graph$/);

  await labs.getByRole("button", { name: "Community-Demo" }).click();
  await expect(page.getByRole("heading", { name: "Community", exact: true })).toBeVisible();
  await expect(page.getByLabel("Labs-Hinweis")).toContainText("ohne echte Mitgliedschaften");
  await expect(page).toHaveURL(/\/community$/);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Deck Graph" })).toBeVisible();
  await expect(page).toHaveURL(/\/graph$/);
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Community", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/community$/);
});
