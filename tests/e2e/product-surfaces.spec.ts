import { expect, test, type Page } from "@playwright/test";
import { CORE_THEME_STORAGE_KEY } from "../../src/coreTheme.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

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
  await expect(page.getByRole("button", { name: /^Import\b/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Erstellungsart" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Einstellungen öffnen" })).toBeVisible();
});

test("app chrome switches exactly at the 1280 pixel sidebar breakpoint", async ({ page }) => {
  await resetToFreshLocalState(page);

  const sidebar = page.locator('[data-navigation-layout="sidebar"]');
  const mobileHeader = page.locator('[data-navigation-layout="mobile-header"]');
  const bottomNavigation = page.locator('[data-navigation-layout="bottom-bar"]');

  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(sidebar).toBeHidden();
  await expect(mobileHeader).toBeVisible();
  await expect(bottomNavigation).toBeVisible();
  const mobileUtilities = mobileHeader.locator('[data-navigation-utilities="true"]');
  const mobileSettingsButton = mobileUtilities.locator('[data-navigation-utility="settings"]');
  const mobileThemeButton = mobileUtilities.locator('[data-navigation-utility="theme"]');
  await expect(mobileSettingsButton).toBeVisible();
  await expect(mobileThemeButton).toBeVisible();
  const mobileSettingsBox = await mobileSettingsButton.boundingBox();
  const mobileThemeBox = await mobileThemeButton.boundingBox();
  expect(mobileSettingsBox).not.toBeNull();
  expect(mobileThemeBox).not.toBeNull();
  expect(mobileSettingsBox!.x).toBeGreaterThan(mobileThemeBox!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await mobileSettingsButton.click();
  await expect(page).toHaveURL(/\/einstellungen$/);
  await expect(mobileSettingsButton).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Darstellung", { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sidebar).toBeVisible();
  await expect(mobileHeader).toBeHidden();
  await expect(bottomNavigation).toBeHidden();
  const desktopUtilities = sidebar.locator('[data-navigation-utilities="true"]');
  const desktopSettingsButton = desktopUtilities.locator('[data-navigation-utility="settings"]');
  const desktopThemeButton = desktopUtilities.locator('[data-navigation-utility="theme"]');
  await expect(desktopSettingsButton).toBeVisible();
  await expect(desktopThemeButton).toBeVisible();
  await expect(desktopSettingsButton).toHaveAttribute("aria-current", "page");
  const desktopSettingsBox = await desktopSettingsButton.boundingBox();
  const desktopThemeBox = await desktopThemeButton.boundingBox();
  expect(desktopSettingsBox).not.toBeNull();
  expect(desktopThemeBox).not.toBeNull();
  expect(desktopSettingsBox!.x).toBeLessThan(desktopThemeBox!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("dark mode can be toggled from both responsive navigation layouts and persists across reloads", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  const sidebar = page.locator('[data-navigation-layout="sidebar"]');
  const desktopThemeButton = sidebar.getByRole("button", { name: "Dark Mode einschalten" });
  await expect(desktopThemeButton).toBeVisible();
  await expect(desktopThemeButton.locator("svg")).toHaveClass(/lucide-sun/);
  await desktopThemeButton.click();

  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
  await expect(sidebar.getByRole("button", { name: "Light Mode einschalten" }).locator("svg")).toHaveClass(/lucide-moon/);
  expect(await page.evaluate((key) => localStorage.getItem(key), CORE_THEME_STORAGE_KEY)).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
  await expect(sidebar.getByRole("button", { name: "Light Mode einschalten" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = page.locator('[data-navigation-layout="mobile-header"]');
  const mobileThemeButton = mobileHeader.getByRole("button", { name: "Light Mode einschalten" });
  await expect(mobileThemeButton).toBeVisible();
  await expect(mobileThemeButton.locator("svg")).toHaveClass(/lucide-moon/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await mobileThemeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "light");
  await expect(mobileHeader.getByRole("button", { name: "Dark Mode einschalten" }).locator("svg")).toHaveClass(/lucide-sun/);
});

test("global learning-day settings save explicitly and persist across reloads", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();

  await expect(page.getByRole("heading", { name: "Globale Einstellungen" })).toBeVisible();
  await page.getByRole("button", { name: /Lerntag & Fokus/ }).click();
  await page.getByTestId("settings-day-start-hour").fill("3");
  await page.getByTestId("settings-learn-ahead").fill("45");
  await page.getByRole("button", { name: "Lerntag speichern" }).click();
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return {
      dayStartHour: state.profile.schedulerPreferences.dayStartHour,
      learnAheadMinutes: state.profile.schedulerPreferences.learnAheadMinutes,
    };
  }).toEqual({ dayStartHour: 3, learnAheadMinutes: 45 });

  await page.reload();
  await expect(page.getByTestId("settings-day-start-hour")).toHaveValue("3");
  await expect(page.getByTestId("settings-learn-ahead")).toHaveValue("45");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Globale Einstellungen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Pomodoro timer starts globally, persists and stays synchronized between tabs", async ({ page, context }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();

  const control = page.locator('[data-pomodoro-control="settings"]');
  await control.locator("button").first().click();
  const minutes = control.getByLabel("Dauer in Minuten");
  await minutes.fill("1.5");
  await control.getByRole("button", { name: "Start", exact: true }).click();
  await expect(control.getByText("Bitte gib eine positive ganze Minutenzahl ein.")).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await secondPage.getByRole("navigation", { name: /Hauptmen/ }).waitFor({ state: "visible" });

  await minutes.fill("25");
  await control.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toContainText("Noch 25 Min.");
  await expect(secondPage.locator('[data-pomodoro-progress="sidebar"]')).toContainText("Noch 25 Min.");

  await page.reload();
  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toContainText("Noch 25 Min.");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-pomodoro-progress="header"]')).toContainText("Noch 25 Min.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await secondPage.close();
});

test("Pomodoro timer expiration clears the global indicator and shows the canonical toast", async ({ page, context }) => {
  await resetToFreshLocalState(page);
  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await secondPage.getByRole("navigation", { name: /Hauptmen/ }).waitFor({ state: "visible" });

  const timerKey = await page.evaluate(async () => {
    const database = (await indexedDB.databases()).find(({ name }) => name?.startsWith("core.workspace.entities.v1."));
    const userId = database?.name?.slice("core.workspace.entities.v1.".length);
    if (!userId) throw new Error("Accountgebundene E2E-Datenbank fehlt.");
    return `core.accountState.v1.${encodeURIComponent(userId)}.core.pomodoroTimer.v1`;
  });
  await secondPage.evaluate((key) => {
    const endsAt = Date.now() + 1_500;
    localStorage.setItem(key, JSON.stringify({
      id: "pomodoro_e2e_expiry",
      durationMinutes: 1,
      startedAt: endsAt - 60_000,
      endsAt,
    }));
  }, timerKey);

  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toBeVisible();
  await expect(page.getByText("Timer abgelaufen.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), timerKey)).toBeNull();
  await secondPage.close();
});

test("long desktop views scroll without moving the sidebar utilities below the viewport", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe und FSRS funktionieren" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  const shortPage = await bottomNavigation.boundingBox();
  expect(shortPage).not.toBeNull();
  expect(Math.abs(shortPage!.x - longPageTop!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(shortPage!.width - longPageTop!.width)).toBeLessThanOrEqual(1);
  expect(shortPage!.y + shortPage!.height).toBeLessThanOrEqual(844);
});

test("help explains FSRS and CoRe with an accessible interactive learning curve", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const helpButton = page.getByRole("button", { name: /^Hilfe Wie CoRe/ });
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  await expect(page).toHaveURL("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe und FSRS funktionieren" })).toBeFocused();
  await expect(page.getByText(/CoRe verwendet echtes FSRS-6 mit den offiziellen 21 Standardparametern/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "So arbeitet ein Spaced-Repetition-Scheduler" })).toBeVisible();
  await expect(page.getByText(/höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag/i)).toBeVisible();
  await expect(page.getByText(/bestimmen gemeinsam, ob die Originalkarte als „bereit für Varianten“ gilt/i)).toBeVisible();

  await page.getByTestId("memory-curve-area-2").hover({ position: { x: 20, y: 120 } });
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

  await page.locator('[data-navigation-layout="mobile-header"]').getByRole("button", { name: "Dark Mode einschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
});

test("@beta-core @hosted-core Beta-Artefakt enthält weder Labs noch Großdatei-APKG", async ({ page }) => {
  await resetToFreshLocalState(page);

  await expect(page.locator("summary").filter({ hasText: "Labs" })).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
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
    await expect(page.getByRole("heading", { name: /^Willkommen (?:bei CoRe|zurück,)/ })).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`${path}$`));
  }
});
