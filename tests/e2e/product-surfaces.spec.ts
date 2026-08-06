import { expect, test, type Page } from "@playwright/test";
import { CORE_THEME_STORAGE_KEY } from "../../src/coreTheme.ts";
import { resetToFreshLocalState } from "./support/appState.ts";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: "Hauptmenü" });
}

test("core navigation exposes only the reliable product areas", async ({ page }) => {
  await resetToFreshLocalState(page);

  const menu = mainMenu(page);
  await expect(menu.getByRole("button")).toHaveText(["Heute", "Lernen", "Erstellen", "Statistik", "Karten"]);
  for (const retired of ["Graph", "Community", "Assistent", "KI-Jobs", "Lernplan"]) {
    await expect(page.getByRole("button", { name: new RegExp(retired, "i") })).toHaveCount(0);
  }

  await menu.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: /Karte selbst erstellen/ })).toBeVisible();
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

test("long desktop views scroll without moving the sidebar utilities below the viewport", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Hilfe öffnen" }).click();

  const layout = await page.getByRole("region", { name: "Seiteninhalt" }).evaluate((screen) => {
    const aside = screen.previousElementSibling as HTMLElement | null;
    return {
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      contentScrolls: screen.scrollHeight > screen.clientHeight,
      contentOverflow: getComputedStyle(screen).overflowY,
      asideBottom: aside?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(layout.pageScrolls).toBe(false);
  expect(layout.contentScrolls).toBe(true);
  expect(layout.contentOverflow).toBe("auto");
  expect(layout.asideBottom).toBeLessThanOrEqual(720);
});

test("mobile bottom navigation stays viewport-fixed and keeps its width on short and long pages", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe und FSRS funktionieren" })).toBeVisible();

  const bottomNavigation = page.getByRole("navigation", { name: "Mobile Hauptnavigation" });
  await expect(bottomNavigation).toBeVisible();
  const longPageTop = await bottomNavigation.boundingBox();
  expect(longPageTop).not.toBeNull();
  expect(longPageTop!.y + longPageTop!.height).toBeLessThanOrEqual(844);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const longPageBottom = await bottomNavigation.boundingBox();
  expect(longPageBottom).not.toBeNull();
  expect(Math.abs(longPageBottom!.x - longPageTop!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(longPageBottom!.y - longPageTop!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(longPageBottom!.width - longPageTop!.width)).toBeLessThanOrEqual(1);

  await page.goto("/kartenstapel");
  await expect(page.getByRole("heading", { name: "Kartenverwaltung", exact: true })).toBeVisible();
  const shortPage = await bottomNavigation.boundingBox();
  expect(shortPage).not.toBeNull();
  expect(Math.abs(shortPage!.x - longPageTop!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(shortPage!.width - longPageTop!.width)).toBeLessThanOrEqual(1);
  expect(shortPage!.y + shortPage!.height).toBeLessThanOrEqual(844);
});

test("help explains FSRS and CoRe with an accessible interactive learning curve", async ({ page }) => {
  await resetToFreshLocalState(page);

  const helpButton = page.getByRole("button", { name: "Hilfe öffnen" });
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  await expect(page).toHaveURL("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe und FSRS funktionieren" })).toBeFocused();
  await expect(page.getByText("CoRe verwendet aktuell einen eigenen FSRS-ähnlichen Scheduler.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "So arbeitet ein Spaced-Repetition-Scheduler" })).toBeVisible();
  await expect(page.getByText(/höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag/i)).toBeVisible();
  await expect(page.getByText(/bestimmen gemeinsam, ob die Originalkarte als „bereit für Varianten“ gilt/i)).toBeVisible();

  await page.getByTestId("memory-curve-segment-2").hover();
  await expect(page.getByRole("heading", { name: "Review 2 · Stabilität wächst" })).toBeVisible();

  await page.getByTestId("memory-curve-area-3").hover({ position: { x: 20, y: 200 } });
  await expect(page.getByRole("heading", { name: "Review 3 · Robuster Abruf" })).toBeVisible();

  const secondReviewSummary = page.getByTestId("memory-review-summary-2");
  await secondReviewSummary.focus();
  await expect(page.getByRole("heading", { name: "Review 2 · Stabilität wächst" })).toBeVisible();
  await secondReviewSummary.click();
  await expect(secondReviewSummary).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("memory-parameter-r").hover();
  await expect(page.getByRole("heading", { name: "R · Abrufwahrscheinlichkeit" })).toBeVisible();
  await expect(page.getByTestId("memory-visual-r")).toHaveAttribute("data-active", "true");

  const stabilityParameter = page.getByTestId("memory-parameter-s");
  await stabilityParameter.focus();
  await expect(page.getByRole("heading", { name: "S · Stabilität" })).toBeVisible();
  await stabilityParameter.click();
  await expect(stabilityParameter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("memory-visual-s")).toHaveAttribute("data-active", "true");

  const difficultyTerm = page.getByTestId("memory-term-d");
  await difficultyTerm.focus();
  await expect(page.getByRole("heading", { name: "D · Schwierigkeit" })).toBeVisible();
  await difficultyTerm.click();
  await expect(difficultyTerm).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("memory-visual-d")).toHaveAttribute("data-active", "true");

  await expect(page.getByTestId("memory-y-axis-break")).toBeVisible();
  await expect(page.getByText("Ausschnitt 90–100 %", { exact: true })).toBeVisible();

  const fourthReview = page.getByTestId("memory-review-point-4");
  await fourthReview.focus();
  await expect(page.getByRole("heading", { name: "Review 4 · CoRe-Variante" })).toBeVisible();
  await fourthReview.click();
  await expect(fourthReview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Nahe Kartenvariante", { exact: true })).toBeVisible();
  await expect(page.getByText(/keine garantierte Produktionsschwelle/i)).toBeVisible();
  await expect(page.getByText(/keine garantierte Reviewnummer/i)).toBeVisible();

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
