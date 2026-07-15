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
  await expect(page.getByRole("button", { name: /Lokaler Entwurfsassistent/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einstellungen öffnen" })).toBeVisible();
});

test("@beta-core @hosted-core Beta-Artefakt hält Labs und Großdatei-APKG deaktiviert", async ({ page }) => {
  await resetToFreshLocalState(page);

  await expect(page.locator("summary").filter({ hasText: "Labs" })).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: /Lokaler Entwurfsassistent/ })).toHaveCount(0);
  await page.getByRole("button", { name: /APKG, Text, Tabellen/ }).click();
  await expect(page.getByText("Freigegebene Dateigröße: bis 250 MiB.")).toBeVisible();
  await expect(page.getByText("Explizit freigegeben bis 1 GiB.")).toHaveCount(0);
});

test("creation choices stay compact in both desktop target viewports", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const cards = page.getByRole("region", { name: "Erstellungsart" }).getByRole("button");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(360);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
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
