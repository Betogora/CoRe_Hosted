import { expect, test, type Locator, type Page } from "@playwright/test";
import { CORE_THEME_STORAGE_KEY } from "../../src/coreTheme.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü|Mobile Hauptnavigation/ }).filter({ visible: true });
}

test("core navigation exposes only the reliable product areas", async ({ page }) => {
  await resetToFreshLocalState(page);

  const menu = mainMenu(page);
  await expect(menu.getByRole("button")).toHaveText(["Heute", "Lernen", "Erstellen", "Karten", "Statistik"]);
  for (const retired of ["Graph", "Community", "Assistent", "KI-Jobs", "Lernplan"]) {
    await expect(page.getByRole("button", { name: new RegExp(retired, "i") })).toHaveCount(0);
  }

  await menu.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: /Karten selbst erstellen/ })).toBeVisible();
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
  const mobileHelpButton = mobileUtilities.locator('[data-navigation-utility="help"]');
  const mobileThemeButton = mobileUtilities.locator('[data-navigation-utility="theme"]');
  await expect(mobileSettingsButton).toBeVisible();
  await expect(mobileHelpButton).toBeVisible();
  await expect(mobileThemeButton).toBeVisible();
  const mobileSettingsBox = await mobileSettingsButton.boundingBox();
  const mobileHelpBox = await mobileHelpButton.boundingBox();
  const mobileThemeBox = await mobileThemeButton.boundingBox();
  expect(mobileSettingsBox).not.toBeNull();
  expect(mobileHelpBox).not.toBeNull();
  expect(mobileThemeBox).not.toBeNull();
  expect(mobileHelpBox!.x).toBeGreaterThan(mobileThemeBox!.x);
  expect(mobileSettingsBox!.x).toBeGreaterThan(mobileHelpBox!.x);
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
  const desktopSyncButton = desktopUtilities.locator('[data-navigation-utility="sync"]');
  const desktopSettingsButton = desktopUtilities.locator('[data-navigation-utility="settings"]');
  const desktopHelpButton = desktopUtilities.locator('[data-navigation-utility="help"]');
  const desktopThemeButton = desktopUtilities.locator('[data-navigation-utility="theme"]');
  await expect(desktopSyncButton).toBeVisible();
  await expect(desktopSettingsButton).toBeVisible();
  await expect(desktopHelpButton).toBeVisible();
  await expect(desktopThemeButton).toBeVisible();
  await expect(desktopSettingsButton).toHaveAttribute("aria-current", "page");
  await expect(desktopThemeButton).toHaveClass(/core-action-secondary/);
  await expect(page.locator('[aria-label="Seiteninhalt"]')).toHaveCSS("padding-left", "24px");
  await expect(page.locator('[aria-label="Seiteninhalt"]')).toHaveCSS("padding-right", "24px");
  const desktopSyncBox = await desktopSyncButton.boundingBox();
  const desktopSettingsBox = await desktopSettingsButton.boundingBox();
  const desktopHelpBox = await desktopHelpButton.boundingBox();
  const desktopThemeBox = await desktopThemeButton.boundingBox();
  expect(desktopSyncBox).not.toBeNull();
  expect(desktopSettingsBox).not.toBeNull();
  expect(desktopHelpBox).not.toBeNull();
  expect(desktopThemeBox).not.toBeNull();
  expect(desktopSyncBox!.x).toBeCloseTo(desktopSettingsBox!.x, 0);
  expect(desktopHelpBox!.x).toBeCloseTo(desktopThemeBox!.x, 0);
  expect(desktopSyncBox!.y).toBeCloseTo(desktopHelpBox!.y, 0);
  expect(desktopSettingsBox!.y).toBeCloseTo(desktopThemeBox!.y, 0);
  expect(desktopSettingsBox!.y).toBeGreaterThan(desktopSyncBox!.y);
  expect(desktopSyncBox!.x).toBeLessThan(desktopHelpBox!.x);
  expect(desktopSettingsBox!.x).toBeLessThan(desktopThemeBox!.x);
  const horizontalUtilityGap = desktopHelpBox!.x - (desktopSyncBox!.x + desktopSyncBox!.width);
  const verticalUtilityGap = desktopSettingsBox!.y - (desktopSyncBox!.y + desktopSyncBox!.height);
  expect(horizontalUtilityGap).toBeCloseTo(verticalUtilityGap, 0);
  const desktopLayout = await sidebar.evaluate((element) => {
    const frame = element.parentElement;
    const sidebarRect = element.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const menuLabels = Array.from(element.querySelectorAll<HTMLElement>('nav button > span'));
    const targets = Array.from(element.querySelectorAll<HTMLElement>('nav button, [data-navigation-utility]'));
    const utilities = element.querySelector<HTMLElement>('[data-navigation-utilities="true"]');
    return {
      frame: frameRect && frameStyle ? {
        x: frameRect.x,
        y: frameRect.y,
        width: frameRect.width,
        height: frameRect.height,
        borderWidth: frameStyle.borderWidth,
        borderRadius: frameStyle.borderRadius,
      } : null,
      sidebar: {
        x: sidebarRect.x,
        y: sidebarRect.y,
        width: sidebarRect.width,
        height: sidebarRect.height,
        overflowX: getComputedStyle(element).overflowX,
        fits: element.scrollWidth <= element.clientWidth,
      },
      utilitiesFit: Boolean(utilities && utilities.scrollWidth <= utilities.clientWidth),
      labelsFit: menuLabels.every((label) => label.scrollWidth <= label.clientWidth),
      targetsAreLargeEnough: targets.every((target) => {
        const rect = target.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }),
    };
  });
  expect(desktopLayout.frame).toEqual({ x: 0, y: 0, width: 1280, height: 900, borderWidth: "0px", borderRadius: "0px" });
  expect(desktopLayout.sidebar).toEqual({ x: 0, y: 0, width: 152, height: 900, overflowX: "hidden", fits: true });
  expect(desktopLayout.utilitiesFit).toBe(true);
  expect(desktopLayout.labelsFit).toBe(true);
  expect(desktopLayout.targetsAreLargeEnough).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("dark mode can be toggled from both responsive navigation layouts and persists across reloads", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  const sidebar = page.locator('[data-navigation-layout="sidebar"]');
  const desktopThemeButton = sidebar.getByRole("button", { name: "Dark Mode einschalten" });
  await expect(desktopThemeButton).toBeVisible();
  await expect(desktopThemeButton).toHaveClass(/core-action-secondary/);
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
  await expect(mobileThemeButton).toHaveClass(/core-action-secondary/);
  await expect(mobileThemeButton.locator("svg")).toHaveClass(/lucide-moon/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await mobileThemeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "light");
  await expect(mobileHeader.getByRole("button", { name: "Dark Mode einschalten" }).locator("svg")).toHaveClass(/lucide-sun/);
});

test("global settings save multiple sections together through one save bar", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();

  await expect(page.getByRole("heading", { name: "Globale Einstellungen" })).toBeVisible();
  await page.getByLabel("Anzeigename").fill("CoRe Save-Bar E2E");
  await page.locator('[data-in-page-navigation="desktop"]').getByRole("link", { name: "Lerntag & Fokus" }).click();
  await page.getByTestId("settings-day-start-hour").fill("3");
  await page.getByTestId("settings-learn-ahead").fill("45");
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar).toHaveCount(1);
  await expect(saveBar.getByRole("button", { name: "Speichern" })).toHaveCount(1);
  await expect(saveBar.getByRole("button", { name: "Verwerfen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Profil|Lerntag|Automatik) speichern$/ })).toHaveCount(0);
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(saveBar).toHaveCount(0);
  await expect(page.getByText("Globale Einstellungen wurden gespeichert.", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return {
      displayName: state.profile.displayName,
      dayStartHour: state.profile.schedulerPreferences.dayStartHour,
      learnAheadMinutes: state.profile.schedulerPreferences.learnAheadMinutes,
    };
  }).toEqual({ displayName: "CoRe Save-Bar E2E", dayStartHour: 3, learnAheadMinutes: 45 });

  await page.reload();
  await expect(page.getByTestId("settings-day-start-hour")).toHaveValue("3");
  await expect(page.getByTestId("settings-learn-ahead")).toHaveValue("45");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Globale Einstellungen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("settings save bar keeps its depth and responsive position in both themes", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Anzeigename").fill("Responsive Save-Bar");
  const saveBar = page.getByTestId("settings-save-bar");

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.coreTheme = value; }, theme);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(saveBar).toBeVisible();
      await expect(saveBar.getByRole("button", { name: "Speichern" })).toHaveCount(1);
      const layout = await saveBar.evaluate((bar) => {
        const status = bar.querySelector<HTMLElement>('[role="status"]')!;
        const button = bar.querySelector<HTMLButtonElement>("button")!;
        const bottomNavigation = document.querySelector<HTMLElement>('[data-navigation-layout="bottom-bar"]');
        const barRect = bar.getBoundingClientRect();
        const statusRect = status.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const bottomNavigationRect = bottomNavigation && getComputedStyle(bottomNavigation).display !== "none"
          ? bottomNavigation.getBoundingClientRect()
          : null;
        return {
          barBottom: barRect.bottom,
          barLeft: barRect.left,
          barRight: barRect.right,
          bottomNavigationTop: bottomNavigationRect?.top ?? null,
          buttonHeight: buttonRect.height,
          boxShadow: getComputedStyle(bar).boxShadow,
          inline: Math.abs((statusRect.top + statusRect.height / 2) - (buttonRect.top + buttonRect.height / 2)) < 2,
          pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(layout.boxShadow).not.toBe("none");
      expect(layout.pageFitsViewport).toBe(true);
      expect(layout.barLeft).toBeGreaterThanOrEqual(0);
      expect(layout.barRight).toBeLessThanOrEqual(viewport.width);
      expect(layout.inline).toBe(viewport.width >= 640);
      if (layout.bottomNavigationTop !== null) expect(layout.barBottom).toBeLessThan(layout.bottomNavigationTop);
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.coreTheme = "light"; });
});

test("deck expansion preserves the complete profile across reload and an isolated browser context", async ({ page, browser }) => {
  await resetToFreshLocalState(page);
  const before = (await readActiveAccountState(page)).profile;
  const rootRow = page.getByTestId("dashboard-deck-row-deck_world_capitals");
  const toggle = rootRow.getByRole("button", { name: /Unterstapel von Welt-Hauptstädte (?:anzeigen|ausblenden)/ });

  await toggle.click();
  await expect(page.locator('[data-navigation-utility="sync"]:visible')).toHaveAttribute("aria-label", "Ausstehende Änderungen synchronisieren");
  await expect(page.locator('[data-navigation-utility="sync"]:visible')).toHaveAttribute(
    "aria-label",
    "Synchronisiert – jetzt erneut synchronisieren",
    { timeout: 20_000 },
  );

  const expected = {
    displayName: before.displayName,
    email: before.email,
    timezone: before.timezone,
    dayStartHour: String(before.schedulerPreferences.dayStartHour),
    learnAheadMinutes: String(before.schedulerPreferences.learnAheadMinutes),
  };
  const expectProfileSettings = async (target: Page) => {
    await target.getByRole("button", { name: "Einstellungen öffnen" }).click();
    await expect(target.getByLabel("Anzeigename")).toHaveValue(expected.displayName);
    await expect(target.getByLabel("Login-E-Mail")).toHaveValue(expected.email);
    await expect(target.getByText(expected.timezone, { exact: true })).toBeVisible();
    await expect(target.getByTestId("settings-day-start-hour")).toHaveValue(expected.dayStartHour);
    await expect(target.getByTestId("settings-learn-ahead")).toHaveValue(expected.learnAheadMinutes);
  };

  await expectProfileSettings(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Globale Einstellungen" })).toBeVisible();
  await expect(page.getByLabel("Anzeigename")).toHaveValue(expected.displayName);
  await expect(page.getByLabel("Login-E-Mail")).toHaveValue(expected.email);

  const isolatedContext = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const isolatedPage = await isolatedContext.newPage();
    await isolatedPage.goto(new URL("/", page.url()).toString());
    await isolatedPage.locator('[data-app-navigation="true"]:visible').first().waitFor({ state: "visible" });
    await isolatedPage.locator('[data-navigation-utility="sync"][aria-label="Synchronisiert – jetzt erneut synchronisieren"]:visible')
      .waitFor({ state: "visible", timeout: 20_000 });
    await expectProfileSettings(isolatedPage);
  } finally {
    await isolatedContext.close();
  }
});

test("deck expansion responds immediately on dashboard and learning", async ({ page }) => {
  await resetToFreshLocalState(page);

  for (const surface of [
    { path: "/", mode: "dashboard" },
    { path: "/lernen", mode: "learn" },
  ]) {
    await page.goto(surface.path);
    await page.locator('[data-app-navigation="true"]:visible').first().waitFor({ state: "visible" });
    const root = page.getByTestId(`${surface.mode}-deck-row-deck_world_capitals`);
    const child = page.getByTestId(`${surface.mode}-deck-row-deck_world_capitals_afrika`);
    const toggle = root.getByRole("button", { name: /Unterstapel von Welt-Hauptstädte (?:anzeigen|ausblenden)/ });

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(child).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(child).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(child).toBeVisible();
  }
});

test("global settings block navigation until saving and require a second navigation", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Anzeigename").fill("Navigation blockiert");

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page).toHaveURL(/\/einstellungen$/);
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar.getByRole("status")).toHaveText("Zum Verlassen zuerst speichern.");
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/einstellungen$/);
  await expect(saveBar).toHaveCount(0);
  expect((await readActiveAccountState(page)).profile.displayName).toBe("Navigation blockiert");

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("browser back is cancelled until saving and must be repeated", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Anzeigename").fill("Browser-Zurück Entwurf");

  await page.goBack();
  await expect(page).toHaveURL(/\/einstellungen$/);
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar.getByRole("status")).toHaveText("Zum Verlassen zuerst speichern.");
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/einstellungen$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("browser forward is cancelled until saving and must be repeated", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/einstellungen$/);
  await page.getByLabel("Anzeigename").fill("Browser-Vorwärts Entwurf");

  await page.goForward();
  await expect(page).toHaveURL(/\/einstellungen$/);
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar.getByRole("status")).toHaveText("Zum Verlassen zuerst speichern.");
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/einstellungen$/);

  await page.goForward();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("settings in-page navigation keeps responsive layout, hashes and browser history", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();

  const desktopNavigation = page.locator('[data-in-page-navigation="desktop"]');
  const compactNavigation = page.locator('[data-in-page-navigation="compact"]');
  await expect(desktopNavigation).toBeVisible();
  await expect(compactNavigation).toBeHidden();
  await expect(desktopNavigation.getByRole("link")).toHaveCount(4);

  const focusLink = desktopNavigation.getByRole("link", { name: "Lerntag & Fokus" });
  await page.getByLabel("Anzeigename").fill("Hashnavigation bleibt frei");
  await focusLink.click();
  await expect(page).toHaveURL(/\/einstellungen#settings-learning-day$/);
  await expect(page.getByTestId("settings-save-bar")).toBeVisible();
  await expect(focusLink).toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("heading", { name: "Lerntag & Fokus" })).toBeVisible();
  await page.getByTestId("settings-save-bar").getByRole("button", { name: "Speichern" }).click();

  await page.reload();
  await expect(page).toHaveURL(/\/einstellungen#settings-learning-day$/);
  await expect(desktopNavigation.getByRole("link", { name: "Lerntag & Fokus" })).toHaveAttribute("aria-current", "location");
  await page.goBack();
  await expect(page).toHaveURL(/\/einstellungen$/);
  await expect(desktopNavigation.getByRole("link", { name: "Konto" })).toHaveAttribute("aria-current", "location");

  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(desktopNavigation).toBeHidden();
  await expect(compactNavigation).toBeVisible();
  const summary = compactNavigation.locator('[data-in-page-navigation-summary="true"]');
  await summary.click();
  await expect(compactNavigation.getByRole("link")).toHaveCount(4);
  await compactNavigation.getByRole("link", { name: "Daten & Synchronisierung" }).click();
  await expect(page).toHaveURL(/\/einstellungen#settings-data-sync$/);
  await expect(summary).toContainText("Daten & Synchronisierung");
  await expect(compactNavigation.locator("details")).not.toHaveAttribute("open", "");

  await summary.click();
  await page.keyboard.press("Escape");
  await expect(compactNavigation.locator("details")).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();

  await page.setViewportSize({ width: 820, height: 900 });
  await summary.click();
  const tabletColumns = await compactNavigation.locator("ul").evaluate((list) => getComputedStyle(list).gridTemplateColumns.split(" ").length);
  expect(tabletColumns).toBe(2);
  await summary.click();

  await page.setViewportSize({ width: 390, height: 844 });
  await summary.click();
  const mobileColumns = await compactNavigation.locator("ul").evaluate((list) => getComputedStyle(list).gridTemplateColumns.split(" ").length);
  expect(mobileColumns).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page).toHaveURL(/\/lernen$/);
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
  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toContainText("25 min.");
  await expect(secondPage.locator('[data-pomodoro-progress="sidebar"]')).toContainText("25 min.");

  await page.reload();
  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toContainText("25 min.");

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
    const database = (await indexedDB.databases()).find(({ name }) => name?.startsWith("core.workspace.entities.v3."));
    const userId = database?.name?.slice("core.workspace.entities.v3.".length);
    if (!userId) throw new Error("Accountgebundene E2E-Datenbank fehlt.");
    return `core.accountState.v2.${encodeURIComponent(userId)}.core.pomodoroTimer.v1`;
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
  await expect(page.getByRole("heading", { name: "Wie CoRe dein Lernen stärkt" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Wie CoRe dein Lernen stärkt" })).toBeVisible();

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

test("help explains Active Recall and FSRS with accessible scroll stories", async ({ page }) => {
  await resetToFreshLocalState(page);

  const helpButton = page.getByRole("button", { name: "Hilfe öffnen" });
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  await expect(page).toHaveURL("/hilfe");
  await expect(page.getByRole("heading", { name: "Wie CoRe dein Lernen stärkt" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Wir wollen Lernen verbessern." })).toBeVisible();
  await expect(page.getByText(/Welche Grundsätze nutzt CoRe, um das Lernen möglichst nachhaltig zu gestalten/)).toBeVisible();
  const readExampleStack = (stack: Locator) => stack.evaluate((stackElement) => {
    const frontElement = stackElement.querySelector<HTMLElement>('[data-help-example-stack-front="true"]')!;
    const frontRect = frontElement.getBoundingClientRect();
    const frontStyle = getComputedStyle(frontElement);
    const layers = Array.from(stackElement.querySelectorAll<HTMLElement>('[data-help-example-stack-layer]'))
      .map((layer) => ({ id: layer.dataset.helpExampleStackLayer, element: layer, rect: layer.getBoundingClientRect(), style: getComputedStyle(layer) }));
    return {
      front: {
        background: frontStyle.backgroundColor,
        borderColor: frontStyle.borderColor,
        borderRadius: frontStyle.borderRadius,
        height: frontElement.offsetHeight,
        width: frontElement.offsetWidth,
        zIndex: frontStyle.zIndex,
      },
      layers: layers.map(({ id, element, rect, style }) => ({
        id,
        background: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        height: element.offsetHeight,
        leftDelta: rect.left - frontRect.left,
        topDelta: rect.top - frontRect.top,
        transform: style.transform,
        width: element.offsetWidth,
        zIndex: style.zIndex,
      })),
    };
  });
  const exampleStackStyle = (stack: Awaited<ReturnType<typeof readExampleStack>>) => ({
    front: {
      background: stack.front.background,
      borderColor: stack.front.borderColor,
      borderRadius: stack.front.borderRadius,
      zIndex: stack.front.zIndex,
    },
    layers: stack.layers.map(({ id, background, borderColor, borderRadius, transform, zIndex }) => (
      { id, background, borderColor, borderRadius, transform, zIndex }
    )),
  });
  const introStackLayout = await readExampleStack(page.getByTestId("help-intro-card-stack"));
  const backLayer = introStackLayout.layers.find(({ id }) => id === "back")!;
  const middleLayer = introStackLayout.layers.find(({ id }) => id === "middle")!;
  expect(backLayer.width).toBe(introStackLayout.front.width);
  expect(backLayer.height).toBe(introStackLayout.front.height);
  expect(middleLayer.width).toBe(introStackLayout.front.width);
  expect(middleLayer.height).toBe(introStackLayout.front.height);
  expect(backLayer.leftDelta).toBeGreaterThan(0);
  expect(backLayer.topDelta).toBeLessThan(0);
  expect(middleLayer.leftDelta).toBeLessThan(0);
  expect(middleLayer.topDelta).toBeLessThan(0);
  expect(introStackLayout.front.background).toBe("rgb(255, 255, 255)");
  expect(middleLayer.background).toBe("rgb(231, 239, 249)");
  expect(backLayer.background).toBe("rgb(203, 220, 237)");
  expect(Number(backLayer.zIndex)).toBeLessThan(Number(middleLayer.zIndex));
  expect(Number(middleLayer.zIndex)).toBeLessThan(Number(introStackLayout.front.zIndex));
  await page.getByRole("button", { name: "Dark Mode einschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
  const darkIntroStackLayout = await readExampleStack(page.getByTestId("help-intro-card-stack"));
  const darkBackLayer = darkIntroStackLayout.layers.find(({ id }) => id === "back")!;
  const darkMiddleLayer = darkIntroStackLayout.layers.find(({ id }) => id === "middle")!;
  expect(darkIntroStackLayout.front.background).toBe("rgb(49, 57, 71)");
  expect(darkMiddleLayer.background).toBe("rgb(70, 84, 106)");
  expect(darkBackLayer.background).toBe("rgb(53, 64, 79)");
  expect(darkIntroStackLayout.front.borderColor).toBe("rgb(143, 160, 191)");
  expect(darkMiddleLayer.borderColor).toBe(darkIntroStackLayout.front.borderColor);
  expect(darkBackLayer.borderColor).toBe(darkIntroStackLayout.front.borderColor);
  expect(darkMiddleLayer.transform).toBe(middleLayer.transform);
  expect(darkBackLayer.transform).toBe(backLayer.transform);
  await page.getByRole("button", { name: "Light Mode einschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "light");
  const activeRecallHeading = page.getByRole("heading", { name: "Active Recall", exact: true });
  const spacedRepetitionHeading = page.getByRole("heading", { name: "Spaced Repetition findet den passenden Zeitpunkt" });
  await expect(activeRecallHeading).toBeVisible();
  await expect(spacedRepetitionHeading).toBeVisible();

  const activeRecallMethodLink = page.locator('a[href="#active-recall-heading"]');
  await expect(activeRecallMethodLink).toHaveCSS("border-top-width", "2px");
  await activeRecallMethodLink.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(activeRecallMethodLink).toBeFocused();
  await expect(activeRecallMethodLink).toHaveCSS("border-top-width", "4px");
  await activeRecallMethodLink.evaluate((element: HTMLAnchorElement) => element.blur());
  await expect(activeRecallMethodLink).toHaveCSS("border-top-width", "2px");
  await activeRecallMethodLink.hover();
  await expect(activeRecallMethodLink).toHaveCSS("border-top-width", "2px");
  await page.mouse.move(0, 0);
  await expect(activeRecallMethodLink).toHaveCSS("border-top-width", "2px");
  await activeRecallMethodLink.click();
  await expect(page).toHaveURL(/\/hilfe#active-recall-heading$/);
  await expect(activeRecallHeading).toBeInViewport();

  const spacedRepetitionMethodLink = page.locator('a[href="#spaced-repetition-heading"]');
  await expect(spacedRepetitionMethodLink).toHaveAttribute("data-help-method-navigation", "animated");
  await expect(spacedRepetitionMethodLink).not.toHaveAttribute("data-help-scroll-skip", /.+/);
  await spacedRepetitionMethodLink.hover();
  await expect(spacedRepetitionMethodLink).toHaveCSS("border-top-width", "4px");
  await spacedRepetitionMethodLink.scrollIntoViewIfNeeded();
  const spacedScrollProbe = await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>(".core-screen-region");
    const firstStep = document.querySelector<HTMLElement>('[data-testid="active-recall-step-stack"]');
    const lastStep = document.querySelector<HTMLElement>('[data-testid="active-recall-step-variants"]');
    if (!region || !firstStep || !lastStep) throw new Error("Scrollbereich der Active-Recall-Geschichte fehlt.");

    const samples: number[] = [region.scrollTop];
    const probeWindow = window as typeof window & { __helpMethodScrollSamples?: number[] };
    probeWindow.__helpMethodScrollSamples = samples;
    const startedAt = performance.now();
    const recordScroll = () => {
      samples.push(region.scrollTop);
      if (performance.now() - startedAt < 1_300) requestAnimationFrame(recordScroll);
    };
    requestAnimationFrame(recordScroll);

    const regionTop = region.getBoundingClientRect().top;
    const absoluteTop = (element: HTMLElement) => region.scrollTop + element.getBoundingClientRect().top - regionTop;
    return {
      startTop: region.scrollTop,
      activeRecallStart: absoluteTop(firstStep),
      activeRecallEnd: absoluteTop(lastStep) + lastStep.getBoundingClientRect().height,
    };
  });
  await spacedRepetitionMethodLink.click();
  await expect(page).toHaveURL(/\/hilfe#spaced-repetition-heading$/);
  await page.waitForTimeout(1_200);
  const spacedScrollSamples = await page.evaluate(() => (
    (window as typeof window & { __helpMethodScrollSamples?: number[] }).__helpMethodScrollSamples ?? []
  ));
  const spacedScrollDeltas = spacedScrollSamples.slice(1).map((value, index) => value - spacedScrollSamples[index]);
  expect(spacedScrollSamples.some((value) => value > spacedScrollProbe.startTop + 8 && value < spacedScrollProbe.activeRecallStart - 8)).toBe(true);
  expect(spacedScrollSamples.some((value) => value > spacedScrollProbe.activeRecallStart && value < spacedScrollProbe.activeRecallEnd)).toBe(true);
  expect(Math.min(...spacedScrollDeltas)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...spacedScrollDeltas)).toBeLessThan((spacedScrollProbe.activeRecallEnd - spacedScrollProbe.activeRecallStart) * 0.6);
  const spacedRepetitionReachedDirectly = await spacedRepetitionHeading.evaluate((heading) => {
    const rect = heading.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  expect(spacedRepetitionReachedDirectly).toBe(true);
  await expect(spacedRepetitionHeading).toBeInViewport();
  await expect(page.getByText(/CoRe verwendet echtes FSRS-6 mit den offiziellen 21 Standardparametern/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "So arbeitet ein Spaced-Repetition-Scheduler" })).toBeVisible();
  await expect(page.getByText(/höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag/i)).toBeVisible();
  await expect(page.getByText(/bestimmen gemeinsam, ob eine Karte „bereit für Varianten“ ist/i)).toBeVisible();
  const spacedDiagramColumnBox = await page.getByTestId("spaced-repetition-diagram-column").boundingBox();
  const spacedStepsColumnBox = await page.getByTestId("spaced-repetition-steps-column").boundingBox();
  expect(spacedDiagramColumnBox).not.toBeNull();
  expect(spacedStepsColumnBox).not.toBeNull();
  expect(spacedDiagramColumnBox!.x).toBeGreaterThan(spacedStepsColumnBox!.x);

  const activeRecallVisual = page.getByTestId("active-recall-visual");
  await page.getByTestId("active-recall-step-stack").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(activeRecallVisual).toHaveAttribute("data-active-step", "0");
  const readRecallLayout = (card: Locator) => card.evaluate((cardElement) => {
    const cardRect = cardElement.getBoundingClientRect();
    const relativeRect = (testId: string) => {
      const element = cardElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!element) throw new Error(`Element ${testId} fehlt.`);
      const rect = element.getBoundingClientRect();
      return { x: rect.x - cardRect.x, y: rect.y - cardRect.y, width: rect.width, height: rect.height };
    };
    return {
      question: relativeRect("active-recall-question"),
      suffix: relativeRect("active-recall-question-suffix"),
      divider: relativeRect("active-recall-divider"),
      answer: relativeRect("active-recall-answer"),
    };
  });
  await page.getByTestId("active-recall-step-stack").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(activeRecallVisual).toHaveAttribute("data-active-step", "0");
  const activeRecallStackCard = activeRecallVisual.locator('[data-active-recall-card="stack"]');
  await expect(activeRecallStackCard).toBeVisible();
  const activeRecallStackLayout = await readExampleStack(activeRecallStackCard);
  expect(exampleStackStyle(activeRecallStackLayout)).toEqual(exampleStackStyle(introStackLayout));
  expect(activeRecallStackLayout.layers.every(({ width, height }) => (
    width === activeRecallStackLayout.front.width && height === activeRecallStackLayout.front.height
  ))).toBe(true);
  const visibleRecallLayout = await readRecallLayout(activeRecallStackCard);

  await page.getByTestId("active-recall-step-blur").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(activeRecallVisual).toHaveAttribute("data-active-step", "1");
  const obscuredRecallCard = activeRecallVisual.locator('[data-active-recall-card="blur"]');
  await expect(obscuredRecallCard).toBeVisible();
  await expect(activeRecallVisual.getByTestId("active-recall-obscured-text")).toBeVisible();
  const obscuredRecallLayout = await readRecallLayout(obscuredRecallCard);
  expect(obscuredRecallLayout).toEqual(visibleRecallLayout);

  await page.getByTestId("active-recall-step-variants").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(activeRecallVisual).toHaveAttribute("data-active-step", "2");
  const activeRecallVariants = activeRecallVisual.locator('[data-active-recall-card="variants"]');
  await expect(activeRecallVariants).toBeVisible();
  const activeRecallVariantCards = activeRecallVisual.getByTestId("active-recall-variant-card");
  await expect(activeRecallVariantCards).toHaveCount(2);
  const variantStyles = await activeRecallVariantCards.evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card);
    return {
      background: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      tone: card.getAttribute("data-help-variant-tone"),
    };
  }));
  expect(variantStyles).toEqual([
    {
      background: middleLayer.background,
      borderColor: introStackLayout.front.borderColor,
      borderRadius: introStackLayout.front.borderRadius,
      tone: "middle",
    },
    {
      background: introStackLayout.front.background,
      borderColor: introStackLayout.front.borderColor,
      borderRadius: introStackLayout.front.borderRadius,
      tone: "front",
    },
  ]);
  const variantFontSizes = await activeRecallVariantCards.evaluateAll((cards) => cards.flatMap((card) => (
    Array.from(card.querySelectorAll<HTMLElement>(".core-help-card-question"), (element) => getComputedStyle(element).fontSize)
  )));
  expect(new Set(variantFontSizes)).toEqual(new Set([await activeRecallStackCard.getByTestId("active-recall-question").evaluate((element) => getComputedStyle(element).fontSize)]));
  await expect(activeRecallVisual.locator(".lucide-sparkles")).toHaveCount(2);
  await expect(activeRecallVisual.locator(".lucide-sparkle")).toHaveCount(2);

  await page.getByTestId("spaced-repetition-step-ratings").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(page.getByTestId("spaced-repetition-visual")).toHaveAttribute("data-active-selection", "ratings");

  await page.getByTestId("spaced-repetition-step-parameter-r").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(page.getByTestId("spaced-repetition-visual")).toHaveAttribute("data-active-selection", "parameter-r");
  await expect(page.getByTestId("memory-visual-r")).toHaveAttribute("data-active", "true");

  const stabilityParameter = page.getByTestId("memory-parameter-s");
  await stabilityParameter.focus();
  await expect(stabilityParameter).toBeFocused();
  await expect(page.getByTestId("memory-visual-s")).toHaveAttribute("data-active", "true");
  await stabilityParameter.click();
  await expect(stabilityParameter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spaced-repetition-visual")).toHaveAttribute("data-active-selection", "parameter-s");
  await expect(page.getByTestId("memory-visual-s")).toHaveAttribute("data-active", "true");

  const difficultyParameter = page.getByTestId("memory-parameter-d");
  await difficultyParameter.click();
  await expect(difficultyParameter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spaced-repetition-visual")).toHaveAttribute("data-active-selection", "parameter-d");
  await expect(page.getByTestId("memory-visual-d")).toHaveAttribute("data-active", "true");

  await expect(page.getByTestId("memory-y-axis-break")).toBeVisible();
  await expect(page.getByText("Ausschnitt 90–100 %", { exact: true })).toHaveCount(0);
  await expect(page.getByText("x. Wiederholung · Variante", { exact: true })).toBeVisible();

  const memoryCurve = page.getByTestId("memory-curve");
  const variantReview = page.getByTestId("memory-review-point-variant");
  const variantStar = page.getByTestId("memory-variant-star");
  await expect(variantReview).toHaveText("…");
  const [memoryCurveBox, variantReviewBox, variantStarBox] = await Promise.all([memoryCurve.boundingBox(), variantReview.boundingBox(), variantStar.boundingBox()]);
  expect(memoryCurveBox).not.toBeNull();
  expect(variantReviewBox).not.toBeNull();
  expect(variantStarBox).not.toBeNull();
  expect(Math.abs((variantReviewBox!.x + variantReviewBox!.width / 2) - (variantStarBox!.x + variantStarBox!.width / 2))).toBeLessThanOrEqual(2);
  expect(variantStarBox!.y + variantStarBox!.height).toBeLessThanOrEqual(memoryCurveBox!.y + (64 / 540) * memoryCurveBox!.height);
  expect(variantStarBox!.y + variantStarBox!.height).toBeLessThan(variantReviewBox!.y);
  await variantReview.focus();
  await expect(variantReview).toBeFocused();
  await variantReview.click();
  await expect(variantReview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spaced-repetition-visual")).toHaveAttribute("data-active-selection", "review-variant");
  await expect(page.getByText(/keine garantierte Produktionsschwelle/i)).toBeVisible();
  await expect(page.getByText(/keine garantierte Reviewnummer/i).last()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/hilfe#spaced-repetition-heading");
  await expect(page.getByRole("heading", { name: "Wie CoRe dein Lernen stärkt" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("memory-curve")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.goto("/hilfe");
  await page.locator('a[href="#spaced-repetition-heading"]').click();
  await expect(page.getByRole("heading", { name: "Spaced Repetition findet den passenden Zeitpunkt" })).toBeInViewport();
  const mobileScrollPosition = await page.evaluate(() => ({
    documentTop: window.scrollY,
    regionTop: document.querySelector<HTMLElement>(".core-screen-region")?.scrollTop ?? -1,
  }));
  expect(mobileScrollPosition.documentTop).toBeGreaterThan(0);
  expect(mobileScrollPosition.regionTop).toBe(0);

  await page.locator('[data-navigation-layout="mobile-header"]').getByRole("button", { name: "Dark Mode einschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");
});

test("@beta-core @hosted-core Beta-Artefakt enthält weder Labs noch Großdatei-APKG", async ({ page }) => {
  await resetToFreshLocalState(page);

  await expect(page.locator("summary").filter({ hasText: "Labs" })).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await expect(page.getByText("APKG-Datei hier ablegen (Max. 250 MB)")).toBeVisible();
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
