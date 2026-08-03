import { expect, test, type Page } from "@playwright/test";
import { CORE_THEME_STORAGE_KEY } from "../../src/coreTheme.ts";
import { resetToFreshLocalState } from "./support/appState.ts";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: "Hauptmenü" });
}

test("core navigation exposes only the reliable product areas", async ({ page }) => {
  await resetToFreshLocalState(page);

  const menu = mainMenu(page);
  await expect(menu.getByRole("button")).toHaveText(["Heute", "Lernen", "Erstellen", "Statistik"]);
  for (const retired of ["Graph", "Community", "Assistent", "KI-Jobs", "Lernplan"]) {
    await expect(page.getByRole("button", { name: new RegExp(retired, "i") })).toHaveCount(0);
  }

  await menu.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: /Karten manuell erstellen/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /APKG, Text, Tabellen/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Erstellungsart" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Einstellungen öffnen" })).toBeVisible();
});

test("dark mode can be toggled from the sidebar and persists across reloads", async ({ page }) => {
  await resetToFreshLocalState(page);

  const toggle = page.getByRole("switch", { name: "Dark Mode einschalten" });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.click();

  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
  await expect(page.getByRole("switch", { name: "Dark Mode ausschalten" })).toBeChecked();
  expect(await page.evaluate((key) => localStorage.getItem(key), CORE_THEME_STORAGE_KEY)).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
  await expect(page.getByRole("switch", { name: "Dark Mode ausschalten" })).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("switch", { name: "Dark Mode ausschalten" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByRole("switch", { name: "Dark Mode ausschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "light");
});

test("help explains FSRS and CoRe with an accessible interactive learning curve", async ({ page }) => {
  await resetToFreshLocalState(page);

  const helpButton = page.getByRole("button", { name: "Hilfe öffnen" });
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  await expect(page).toHaveURL("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe und FSRS funktionieren" })).toBeFocused();
  await expect(page.getByText("CoRe verwendet aktuell einen eigenen FSRS-ähnlichen Scheduler.", { exact: false })).toBeVisible();

  await page.getByTestId("memory-curve-segment-2").hover();
  await expect(page.getByRole("heading", { name: "Review 2 · Stabilität wächst" })).toBeVisible();

  const fourthReview = page.getByTestId("memory-review-point-4");
  await fourthReview.focus();
  await expect(page.getByRole("heading", { name: "Review 4 · CoRe-Variante" })).toBeVisible();
  await fourthReview.click();
  await expect(fourthReview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Nahe Kartenvariante", { exact: true })).toBeVisible();
  await expect(page.getByText(/keine garantierte Produktionsschwelle/i)).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe und FSRS funktionieren" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("memory-curve")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByRole("switch", { name: "Dark Mode einschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
});

test("@beta-core @hosted-core Beta-Artefakt enthält weder Labs noch Großdatei-APKG", async ({ page }) => {
  await resetToFreshLocalState(page);

  await expect(page.locator("summary").filter({ hasText: "Labs" })).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /APKG, Text, Tabellen/ }).click();
  await expect(page.getByText("Freigegebene Dateigröße: bis 250 MiB.")).toBeVisible();
  await expect(page.getByText(/1 GiB|Server-Import|Upload fortsetzen/)).toHaveCount(0);
});

test("creation choices stay compact in both desktop target viewports", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const cards = page.getByRole("region", { name: "Erstellungsart" }).getByRole("button");
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(360);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("retired Labs URLs always fall back to Today", async ({ page }) => {
  for (const path of ["/graph", "/community", "/assistent", "/ki-jobs", "/lernplan"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Willkommen bei CoRe" })).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`${path}$`));
  }
});
