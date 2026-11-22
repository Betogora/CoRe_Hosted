import { expect, test, type Locator, type Page } from "@playwright/test";
import { CORE_THEME_STORAGE_KEY } from "../../src/coreTheme.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { openSettingsArea, settingsDialog } from "./support/settingsDialog.ts";
import { openNavigationMenuItem, switchColorScheme } from "./support/navigationMenu.ts";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü|Mobile Hauptnavigation/ }).filter({ visible: true });
}

test("core navigation exposes only the reliable product areas", async ({ page }) => {
  await resetToFreshLocalState(page);

  const menu = mainMenu(page);
  await expect(menu.getByRole("button")).toHaveText(["Heute", "Lernen", "Erstellen", "Karten", "Prüfung"]);

  await menu.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: /Karten selbst erstellen/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import\b/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Karten automatisch erstellen lassen/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Erstellungsart" }).getByRole("button")).toHaveCount(3);
  await expect(page.locator("header[data-navigation-layout]:visible").getByRole("button", { name: "Menü", exact: true })).toBeVisible();
});

test("app chrome switches exactly at the 1280 pixel top bar breakpoint", async ({ page }) => {
  await resetToFreshLocalState(page);

  const topBar = page.locator('[data-navigation-layout="top-bar"]');
  const mobileHeader = page.locator('[data-navigation-layout="mobile-header"]');
  const bottomNavigation = page.locator('[data-navigation-layout="bottom-bar"]');

  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(topBar).toBeHidden();
  await expect(mobileHeader).toBeVisible();
  await expect(bottomNavigation).toBeVisible();
  const mobileMenuButton = mobileHeader.locator('[data-navigation-utilities="true"] [data-navigation-utility="menu"]');
  await expect(mobileMenuButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await openNavigationMenuItem(page, "Einstellungen");
  await expect(page).toHaveURL(/\?settings=start$/);
  await expect(settingsDialog(page)).toBeVisible();
  await expect(mobileMenuButton).toHaveClass(/!text-core-action/);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(topBar).toBeVisible();
  await expect(mobileHeader).toBeHidden();
  await expect(bottomNavigation).toBeHidden();
  const desktopUtilities = topBar.locator('[data-navigation-utilities="true"]');
  const desktopMenuButton = desktopUtilities.locator('[data-navigation-utility="menu"]');
  await expect(desktopUtilities.locator('[data-navigation-utility="sync"]')).toHaveCount(0);
  await expect(desktopMenuButton).toBeVisible();
  await expect(desktopMenuButton).toHaveClass(/core-action-ghost/);
  await expect(desktopMenuButton).toHaveClass(/!text-core-action/);
  await expect(page.locator('[aria-label="Seiteninhalt"]')).toHaveCSS("padding-left", "24px");
  await expect(page.locator('[aria-label="Seiteninhalt"]')).toHaveCSS("padding-right", "24px");
  const desktopLayout = await topBar.evaluate((element) => {
    const panel = element.querySelector<HTMLElement>("[data-shell-bar]")!;
    const region = document.querySelector<HTMLElement>('[aria-label="Seiteninhalt"]')!;
    const panelRect = panel.getBoundingClientRect();
    const navigationRect = element.querySelector<HTMLElement>("nav")!.getBoundingClientRect();
    const menuLabels = Array.from(element.querySelectorAll<HTMLElement>("nav button > span"));
    const targets = Array.from(element.querySelectorAll<HTMLElement>("nav button, [data-navigation-utility]"));
    const utilities = Array.from(element.querySelectorAll<HTMLElement>("[data-navigation-utility]")).map((target) => target.getBoundingClientRect());
    return {
      scrollbar: region.offsetWidth - region.clientWidth,
      panel: { x: panelRect.x, y: panelRect.y, width: panelRect.width, height: panelRect.height },
      navigationCenterOffset: Math.abs(navigationRect.x + navigationRect.width / 2 - (panelRect.x + panelRect.width / 2)),
      utilitiesRightOfNavigation: utilities.every((rect) => rect.x >= navigationRect.right),
      utilitiesInOneRow: utilities.every((rect) => Math.abs(rect.y - utilities[0].y) < 1),
      labelsFit: menuLabels.every((label) => label.scrollWidth <= label.clientWidth),
      targetsAreLargeEnough: targets.every((target) => {
        const rect = target.getBoundingClientRect();
        return rect.width >= 36 && rect.height >= 36;
      }),
    };
  });
  expect(desktopLayout.panel).toEqual({ x: 16, y: 16, width: 1248 - desktopLayout.scrollbar, height: 48 });
  expect(desktopLayout.navigationCenterOffset).toBeLessThan(1);
  expect(desktopLayout.utilitiesRightOfNavigation).toBe(true);
  expect(desktopLayout.utilitiesInOneRow).toBe(true);
  expect(desktopLayout.labelsFit).toBe(true);
  expect(desktopLayout.targetsAreLargeEnough).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("dark mode is switched in the appearance settings and persists across reloads", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await switchColorScheme(page, "dark");
  expect(await page.evaluate((key) => localStorage.getItem(key), CORE_THEME_STORAGE_KEY)).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "dark");

  await page.setViewportSize({ width: 390, height: 844 });
  await openNavigationMenuItem(page, "Einstellungen");
  const dialog = settingsDialog(page);
  await openSettingsArea(dialog, "darstellung");
  const darkSwitch = dialog.getByRole("switch", { name: "Dark Mode" });
  await expect(darkSwitch).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await darkSwitch.uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", "light");
  expect(await page.evaluate((key) => localStorage.getItem(key), CORE_THEME_STORAGE_KEY)).toBe("light");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-navigation-layout="mobile-header"] [data-navigation-utility="menu"]')).toBeFocused();
});

test("general and learning settings each save their sections together through one save bar", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNavigationMenuItem(page, "Einstellungen");
  const dialog = settingsDialog(page);

  await expect(dialog.getByRole("heading", { name: "Konto", exact: true })).toBeVisible();
  await page.getByLabel("Anzeigename").fill("CoRe Save-Bar E2E");
  await openSettingsArea(dialog, "daten");
  await page.getByRole("group", { name: "Intervall der automatischen Synchronisierung" }).getByRole("button", { name: "15", exact: true }).click();
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar).toHaveCount(1);
  await expect(saveBar.getByRole("button", { name: "Speichern", exact: true })).toHaveCount(1);
  await expect(saveBar.getByRole("button", { name: "Änderungen verwerfen", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^(Profil|Lerntag|Automatik) speichern$/ })).toHaveCount(0);
  await saveBar.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(saveBar).toHaveCount(0);
  await expect(page.getByText("Allgemeine Einstellungen wurden gespeichert.", { exact: true })).toBeVisible();

  await openSettingsArea(dialog, "lerntag");
  await expect(dialog.getByRole("heading", { name: "Lerntag & Planung", exact: true })).toBeVisible();
  await page.getByTestId("card-settings-day-start-hour").fill("3");
  await page.getByTestId("card-settings-learn-ahead").fill("45");
  await saveBar.getByRole("button", { name: "Auf alle neuen Stapel anwenden", exact: true }).click();
  await expect(saveBar).toHaveCount(0);
  await expect(page.getByText("Lerneinstellungen wurden als Standard für neue Stapel gespeichert.", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return {
      displayName: state.profile.displayName,
      syncIntervalMinutes: state.profile.uiPreferences.syncIntervalMinutes,
      dayStartHour: state.profile.schedulerPreferences.dayStartHour,
      learnAheadMinutes: state.profile.schedulerPreferences.learnAheadMinutes,
    };
  }).toEqual({ displayName: "CoRe Save-Bar E2E", syncIntervalMinutes: 15, dayStartHour: 3, learnAheadMinutes: 45 });

  await page.reload();
  await expect(page).toHaveURL(/\?settings=lerntag$/);
  await expect(page.getByTestId("card-settings-day-start-hour")).toHaveValue("3");
  await expect(page.getByTestId("card-settings-learn-ahead")).toHaveValue("45");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("heading", { name: "Lerntag & Planung", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("settings save bar keeps its depth and responsive position in both themes", async ({ page }) => {
  await resetToFreshLocalState(page);
  await openNavigationMenuItem(page, "Einstellungen");
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
        const button = [...bar.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent?.trim() === "Speichern")!;
        const dialogRect = bar.closest<HTMLElement>('[data-testid="settings-dialog"]')!.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const statusRect = status.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        return {
          barBottom: barRect.bottom,
          barLeft: barRect.left,
          barRight: barRect.right,
          dialogBottom: dialogRect.bottom,
          buttonHeight: buttonRect.height,
          boxShadow: getComputedStyle(bar).boxShadow,
          inline: Math.abs((statusRect.top + statusRect.height / 2) - (buttonRect.top + buttonRect.height / 2)) < 2,
          pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      expect(layout.buttonHeight).toBeGreaterThanOrEqual(40);
      expect(layout.boxShadow).not.toBe("none");
      expect(layout.pageFitsViewport).toBe(true);
      expect(layout.barLeft).toBeGreaterThanOrEqual(0);
      expect(layout.barRight).toBeLessThanOrEqual(viewport.width);
      expect(layout.inline).toBe(viewport.width >= 640);
      expect(layout.barBottom).toBeLessThanOrEqual(layout.dialogBottom + 1);
      expect(layout.barBottom).toBeLessThanOrEqual(viewport.height);
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
  const syncUtilities = page.locator('[data-navigation-utilities="true"]:visible');
  await expect(syncUtilities).toHaveAttribute("data-sync-status", "pending");
  await expect(syncUtilities).toHaveAttribute("data-sync-status", "saved", { timeout: 20_000 });

  const expected = {
    displayName: before.displayName,
    email: before.email,
    timezone: before.timezone,
    dayStartHour: String(before.schedulerPreferences.dayStartHour),
    learnAheadMinutes: String(before.schedulerPreferences.learnAheadMinutes),
  };
  const expectProfileSettings = async (target: Page) => {
    if (!(await settingsDialog(target).isVisible())) await openNavigationMenuItem(target, "Einstellungen");
    await openSettingsArea(settingsDialog(target), "konto");
    await expect(target.getByLabel("Anzeigename")).toHaveValue(expected.displayName);
    await expect(target.getByLabel("Login-E-Mail")).toHaveValue(expected.email);
    await openSettingsArea(settingsDialog(target), "lerntag");
    await expect(target.getByText(expected.timezone, { exact: true })).toBeVisible();
    await expect(target.getByTestId("card-settings-day-start-hour")).toHaveValue(expected.dayStartHour);
    await expect(target.getByTestId("card-settings-learn-ahead")).toHaveValue(expected.learnAheadMinutes);
  };

  await expectProfileSettings(page);
  await page.reload();
  await expect(settingsDialog(page).getByRole("heading", { name: "Lerntag & Planung", exact: true })).toBeVisible();
  await expectProfileSettings(page);

  const isolatedContext = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const isolatedPage = await isolatedContext.newPage();
    await isolatedPage.goto(new URL("/", page.url()).toString());
    await isolatedPage.locator('[data-app-navigation="true"]:visible').first().waitFor({ state: "visible" });
    await isolatedPage.locator('[data-navigation-utilities="true"][data-sync-status="saved"]:visible')
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

test("settings drafts block closing and group switches until saving", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await openNavigationMenuItem(page, "Einstellungen");
  const dialog = settingsDialog(page);
  await page.getByLabel("Anzeigename").fill("Schließen blockiert");
  const saveBar = page.getByTestId("settings-save-bar");

  await openSettingsArea(dialog, "daten");
  await expect(page).toHaveURL(/\/lernen\?settings=daten$/);
  await expect(saveBar.getByRole("status")).toHaveText("Änderungen speichern?");

  await openSettingsArea(dialog, "ueber");
  await dialog.locator('[data-settings-section="lerntag"]').click();
  await expect(page).toHaveURL(/\/lernen\?settings=ueber$/);
  await expect(saveBar.getByRole("status")).toHaveText("Zum Verlassen zuerst speichern.");

  await dialog.getByRole("button", { name: "Einstellungen schließen" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(saveBar).toHaveCount(0);
  expect((await readActiveAccountState(page)).profile.displayName).toBe("Schließen blockiert");

  await dialog.getByRole("button", { name: "Einstellungen schließen" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/lernen$/);
});

test("browser back is cancelled until saving and must be repeated", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await openNavigationMenuItem(page, "Einstellungen");
  await page.getByLabel("Anzeigename").fill("Browser-Zurück Entwurf");

  await page.goBack();
  await expect(page).toHaveURL(/\/lernen\?settings=start$/);
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar.getByRole("status")).toHaveText("Zum Verlassen zuerst speichern.");
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/lernen\?settings=start$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/lernen$/);
  await expect(settingsDialog(page)).toHaveCount(0);
});

test("browser forward is cancelled until saving and must be repeated", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.goto("/lernen?settings=fokus");
  const dialog = settingsDialog(page);
  await dialog.getByRole("button", { name: "Simulator öffnen" }).click();
  await expect(page).toHaveURL(/\/simulator$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/lernen\?settings=fokus$/);
  await openSettingsArea(dialog, "konto");
  await page.getByLabel("Anzeigename").fill("Browser-Vorwärts Entwurf");

  await page.goForward();
  await expect(page).toHaveURL(/\/lernen\?settings=konto$/);
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar.getByRole("status")).toHaveText("Zum Verlassen zuerst speichern.");
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/lernen\?settings=konto$/);

  await page.goForward();
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(dialog).toHaveCount(0);
});

test("settings dialog switches between side list and area list at 768 px", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openNavigationMenuItem(page, "Einstellungen");
  const dialog = settingsDialog(page);
  const areas = dialog.getByRole("navigation", { name: "Bereiche der Einstellungen" });
  await expect(areas).toBeVisible();
  await expect(areas.locator("[data-settings-section]")).toHaveCount(9);
  await expect(dialog.getByRole("heading", { name: "Konto", exact: true })).toBeVisible();

  await openSettingsArea(dialog, "ueber");
  await page.reload();
  await expect(page).toHaveURL(/\?settings=ueber$/);
  await expect(dialog.locator('[data-settings-section="ueber"]')).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(areas).toBeHidden();
  await expect(dialog.getByRole("heading", { name: "Über uns", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Zurück zu den Bereichen" }).click();
  await expect(page).toHaveURL(/\?settings=start$/);
  await expect(areas).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Konto", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await openSettingsArea(dialog, "daten");
  await expect(dialog.getByRole("heading", { name: "Daten & Synchronisierung", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Pomodoro timer starts globally, persists and stays synchronized between tabs", async ({ page, context }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openNavigationMenuItem(page, "Einstellungen");
  await openSettingsArea(settingsDialog(page), "fokus");

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
  await expect(page.locator('[data-navigation-layout="top-bar"] [data-pomodoro-progress="header"]')).toContainText("Noch 25 Min.");
  await expect(secondPage.locator('[data-navigation-layout="top-bar"] [data-pomodoro-progress="header"]')).toContainText("Noch 25 Min.");

  await page.reload();
  await expect(page.locator('[data-navigation-layout="top-bar"] [data-pomodoro-progress="header"]')).toContainText("Noch 25 Min.");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-navigation-layout="mobile-header"] [data-pomodoro-progress="header"]')).toContainText("Noch 25 Min.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await secondPage.close();
});

test("Pomodoro timer expiration clears the global indicator and shows the canonical toast", async ({ page, context }) => {
  await resetToFreshLocalState(page);
  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await secondPage.getByRole("navigation", { name: /Hauptmen/ }).waitFor({ state: "visible" });

  const timerKey = await page.evaluate(async () => {
    const database = (await indexedDB.databases()).find(({ name }) => name?.startsWith("core.workspace.entities.v5."));
    const userId = database?.name?.slice("core.workspace.entities.v5.".length);
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

  await expect(page.locator('[data-navigation-layout="top-bar"] [data-pomodoro-progress="header"]')).toBeVisible();
  await expect(page.getByText("Timer abgelaufen.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-pomodoro-progress]')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), timerKey)).toBeNull();
  await secondPage.close();
});

test("long desktop views use one content scrollbar that starts below the overlaid top bar", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const view of [
    { path: "/hilfe?topic=spaced-repetition", heading: "Spaced Repetition wird Content Repetition" },
    { path: "/statistik", heading: "Statistik" },
  ]) {
    await page.goto(view.path);
    await expect(page.getByRole("heading", { name: view.heading })).toBeVisible();
    const contentRegion = page.getByRole("region", { name: "Seiteninhalt" });
    await expect.poll(() => contentRegion.evaluate((screen) => screen.scrollHeight > screen.clientHeight)).toBe(true);

    const layout = await contentRegion.evaluate((screen) => {
      const topBar = document.querySelector<HTMLElement>('[data-navigation-layout="top-bar"]');
      const shell = screen.closest("main");
      return {
        pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
        contentScrolls: screen.scrollHeight > screen.clientHeight,
        contentOverflow: getComputedStyle(screen).overflowY,
        contentPosition: getComputedStyle(screen).position,
        shellHeight: shell?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
        shellOverflow: shell ? getComputedStyle(shell).overflowY : "visible",
        topBarTop: topBar?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        topBarBottom: topBar?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        contentTop: screen.getBoundingClientRect().top,
        contentPaddingTop: parseFloat(getComputedStyle(screen).paddingTop),
      };
    });

    expect(layout.pageScrolls).toBe(false);
    expect(layout.contentScrolls).toBe(true);
    expect(layout.contentOverflow).toBe("auto");
    expect(layout.contentPosition).toBe("relative");
    expect(layout.shellHeight).toBe(720);
    expect(layout.shellOverflow).toBe("hidden");
    expect(layout.topBarTop).toBe(0);
    expect(layout.contentTop).toBe(0);
    expect(layout.contentPaddingTop).toBeGreaterThanOrEqual(layout.topBarBottom);
  }
});

test("the navigation head gives way while scrolling down and returns on scrolling up or Shift+Tab", async ({ page }) => {
  await resetToFreshLocalState(page);
  for (const [layout, viewport] of [["mobile-header", { width: 390, height: 640 }], ["top-bar", { width: 1280, height: 720 }]] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/hilfe?topic=spaced-repetition");
    const header = page.locator(`[data-navigation-layout="${layout}"]`);
    await expect(header).toBeVisible();
    // Phones scroll the window, the desktop scrolls the content region.
    const scrollTo = (top: number) => page.evaluate((target) => {
      const region = document.querySelector<HTMLElement>('[aria-label="Seiteninhalt"]')!;
      (getComputedStyle(region).overflowY === "auto" ? region : document.scrollingElement!).scrollTo({ top: target });
    }, top);
    await scrollTo(400);
    await expect(header).toBeHidden();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--shell-offset"))).toBe("0px");
    await scrollTo(340);
    await expect(header).toBeVisible();

    await scrollTo(900);
    await expect(header).toBeHidden();
    await page.evaluate(() => {
      const target = [...document.querySelectorAll<HTMLElement>('[aria-label="Seiteninhalt"] a, [aria-label="Seiteninhalt"] button')].find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top > window.innerHeight / 2 && rect.bottom < window.innerHeight;
      });
      target?.focus({ preventScroll: true });
    });
    await page.keyboard.press("Shift+Tab");
    await expect(header).toBeVisible();
  }
});

test("mobile bottom navigation stays viewport-fixed and keeps its width on short and long pages", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hilfe?topic=spaced-repetition");
  await expect(page.getByRole("heading", { name: "Spaced Repetition wird Content Repetition" })).toBeVisible();

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

test("help opens with a short entry and links its stories and reference topics as pages", async ({ page }) => {
  await resetToFreshLocalState(page);

  await openNavigationMenuItem(page, "Hilfe");
  await expect(page).toHaveURL("/hilfe");
  await expect(page.getByRole("heading", { name: "Hilfe", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "So lernst du mit CoRe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "So bewertest du" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Nachschlagen" }).getByRole("link")).toHaveCount(4);
  await expect(page.getByText(/Welche Grundsätze nutzt CoRe, um das Lernen möglichst nachhaltig zu gestalten/)).toBeVisible();
  const readExampleStack = (stack: Locator) => stack.evaluate((stackElement) => {
    const front = stackElement.querySelector<HTMLElement>('[data-help-example-stack-front="true"]')!;
    const readLayer = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        width: element.offsetWidth,
        height: element.offsetHeight,
        background: style.backgroundColor,
        border: style.borderColor,
        radius: style.borderRadius,
        z: Number(style.zIndex),
        rotation: new DOMMatrixReadOnly(style.transform).b,
      };
    };
    return {
      front: readLayer(front),
      layers: Array.from(stackElement.querySelectorAll<HTMLElement>('[data-help-example-stack-layer]'))
        .map((layer) => ({ id: layer.dataset.helpExampleStackLayer, ...readLayer(layer) })),
    };
  });
  const introStackLayout = await readExampleStack(page.getByTestId("help-intro-card-stack"));
  expect(introStackLayout.layers).toHaveLength(2);
  expect(introStackLayout.layers.every(({ width, height }) => (
    width === introStackLayout.front.width && height === introStackLayout.front.height
  ))).toBe(true);
  const backLayer = introStackLayout.layers.find(({ id }) => id === "back")!;
  const middleLayer = introStackLayout.layers.find(({ id }) => id === "middle")!;
  expect(backLayer.rotation).toBeGreaterThan(0);
  expect(middleLayer.rotation).toBeLessThan(0);
  expect(backLayer.z).toBeLessThan(middleLayer.z);
  expect(middleLayer.z).toBeLessThan(introStackLayout.front.z);
  expect(new Set([introStackLayout.front.background, ...introStackLayout.layers.map((layer) => layer.background)]).size).toBe(3);
  await switchColorScheme(page, "dark");
  const darkStack = await readExampleStack(page.getByTestId("help-intro-card-stack"));
  expect(darkStack.front.background).not.toBe(introStackLayout.front.background);
  expect(darkStack.front.border).not.toBe(introStackLayout.front.border);
  for (const layer of darkStack.layers) {
    const lightLayer = introStackLayout.layers.find(({ id }) => id === layer.id)!;
    expect(layer.background).not.toBe(lightLayer.background);
    expect(layer.border).toBe(darkStack.front.border);
    expect(layer.rotation).toBe(lightLayer.rotation);
    expect(layer.z).toBe(lightLayer.z);
  }
  await switchColorScheme(page, "light");

  const activeRecallMethodLink = page.locator('a[data-help-topic-link="active-recall"]');
  await expect(activeRecallMethodLink).toHaveAttribute("href", "/hilfe?topic=active-recall");
  await expect(activeRecallMethodLink).toHaveText("Active Recall wird Smarter Recall");
  await activeRecallMethodLink.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(activeRecallMethodLink).toBeFocused();
  await activeRecallMethodLink.click();
  await expect(page).toHaveURL("/hilfe?topic=active-recall");
  await expect(page.getByRole("heading", { name: "Active Recall wird Smarter Recall" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Hilfe", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "So lernst du mit CoRe" })).toHaveCount(0);

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
  for (const key of ["background", "border", "radius", "z", "rotation"] as const) {
    expect(activeRecallStackLayout.front[key]).toBe(introStackLayout.front[key]);
  }
  expect(activeRecallStackLayout.layers.map(({ width, height, ...appearance }) => appearance))
    .toEqual(introStackLayout.layers.map(({ width, height, ...appearance }) => appearance));
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
  await expect(activeRecallVisual.locator(".lucide-sparkles")).toHaveCount(2);
  await expect(activeRecallVisual.locator(".lucide-sparkle")).toHaveCount(2);

  await page.goBack();
  await expect(page).toHaveURL("/hilfe");
  await expect(activeRecallMethodLink).toBeFocused();

  const spacedRepetitionMethodLink = page.locator('a[data-help-topic-link="spaced-repetition"]');
  await expect(spacedRepetitionMethodLink).toHaveText("Spaced Repetition wird Content Repetition");
  await spacedRepetitionMethodLink.click();
  await expect(page).toHaveURL("/hilfe?topic=spaced-repetition");
  const spacedRepetitionHeading = page.getByRole("heading", { name: "Spaced Repetition wird Content Repetition" });
  await expect(spacedRepetitionHeading).toBeFocused();
  await expect(spacedRepetitionHeading).toBeInViewport();
  expect(await page.evaluate(() => document.querySelector<HTMLElement>(".core-screen-region")?.scrollTop)).toBe(0);
  const spacedDiagramColumnBox = await page.getByTestId("spaced-repetition-diagram-column").boundingBox();
  const spacedStepsColumnBox = await page.getByTestId("spaced-repetition-steps-column").boundingBox();
  expect(spacedDiagramColumnBox).not.toBeNull();
  expect(spacedStepsColumnBox).not.toBeNull();
  expect(spacedDiagramColumnBox!.x).toBeGreaterThan(spacedStepsColumnBox!.x);

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
  await expect(variantReview).toHaveText("…");
  const [memoryCurveBox, variantReviewBox] = await Promise.all([memoryCurve.boundingBox(), variantReview.boundingBox()]);
  expect(memoryCurveBox).not.toBeNull();
  expect(variantReviewBox).not.toBeNull();
  expect(variantReviewBox!.x + variantReviewBox!.width).toBeLessThanOrEqual(memoryCurveBox!.x + memoryCurveBox!.width);
  await variantReview.focus();
  await expect(variantReview).toBeFocused();
  await variantReview.click();
  await expect(variantReview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("spaced-repetition-visual")).toHaveAttribute("data-active-selection", "review-variant");
  await expect(page.getByText(/keine garantierte Reviewnummer/i)).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/hilfe?topic=spaced-repetition");
  await expect(spacedRepetitionHeading).toBeVisible();

  await page.getByRole("button", { name: "Hilfe", exact: true }).click();
  await expect(page).toHaveURL("/hilfe");
  const referenceTopics = page.getByRole("navigation", { name: "Nachschlagen" });
  await referenceTopics.getByRole("link", { name: "So plant CoRe deine Wiederholungen" }).click();
  await expect(page).toHaveURL("/hilfe?topic=planung");
  await expect(page.getByRole("heading", { name: "So plant CoRe deine Wiederholungen" })).toBeFocused();
  await expect(page.getByText(/CoRe verwendet FSRS-7 mit den offiziellen Standardparametern/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "So arbeitet ein Spaced-Repetition-Scheduler" })).toBeVisible();
  await expect(page.getByText(/höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag/i)).toBeVisible();
  await page.goBack();
  await referenceTopics.getByRole("link", { name: "Was bei Varianten geschützt bleibt" }).click();
  await expect(page).toHaveURL("/hilfe?topic=varianten");
  await expect(page.getByText(/Varianten erscheinen nur in der Wiederholungsphase und erst ab der Haltbarkeit des Stapels/)).toBeVisible();
  await expect(page.getByText(/keine garantierte Produktionsschwelle/i)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hilfe?topic=spaced-repetition");
  await expect(page.getByTestId("memory-curve")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.goto("/hilfe");
  await expect(page.getByTestId("help-intro-card-stack")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await spacedRepetitionMethodLink.click();
  await expect(spacedRepetitionHeading).toBeFocused();
  await expect(spacedRepetitionHeading).toBeInViewport();

  await switchColorScheme(page, "dark");
  await page.goBack();
  await expect(spacedRepetitionMethodLink).toBeFocused();
  await expect(spacedRepetitionMethodLink).toBeInViewport();
});

test("@beta-core @hosted-core Beta-Artefakt enthält weder Labs noch Großdatei-APKG", async ({ page }) => {
  await resetToFreshLocalState(page);

  await expect(page.locator("summary").filter({ hasText: "Labs" })).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await expect(page.getByText("APKG-, COLPKG-, TXT-, CSV- oder TSV-Datei hier ablegen")).toBeVisible();
  await expect(page.getByText(/1 GiB|Server-Import|Upload fortsetzen/)).toHaveCount(0);
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

test("retired Labs URLs always fall back to Today", async ({ page }) => {
  for (const path of ["/graph", "/community", "/assistent", "/ki-jobs", "/lernplan"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /^Willkommen (?:bei CoRe|zurück,)/ })).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`${path}$`));
  }
});
