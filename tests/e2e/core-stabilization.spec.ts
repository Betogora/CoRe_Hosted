import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { chooseCoreSelectOption } from "./support/coreSelect.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const PDF_SELECTION_FIXTURE = fileURLToPath(new URL("../fixtures/pdf-selection.pdf", import.meta.url));

const DECK_IDS = {
  root: "deck_world_capitals",
  africa: "deck_world_capitals_afrika",
  europe: "deck_world_capitals_europa",
};

async function readAppState(page: any) {
  return readActiveAccountState(page);
}

async function deckReviewEventCount(page: Page, deckId: string) {
  const state = await readAppState(page);
  return state.decks?.find((deck: { id: any; }) => deck.id === deckId)?.reviewEvents?.length ?? 0;
}

async function variantReviewEventCount(page: Page, deckId: string) {
  const state = await readAppState(page);
  return state.decks?.find((deck: { id: any; }) => deck.id === deckId)?.reviewEvents?.filter((event: { reviewableType: string; }) => event.reviewableType === "variant").length ?? 0;
}

async function storedCard(page: Page, deckId: string, cardId: string) {
  const state = await readAppState(page);
  return state.decks?.find((deck: { id: string }) => deck.id === deckId)?.cards?.find((card: { id: string }) => card.id === cardId) ?? null;
}

async function findPdfCreatedCard(page: Page) {
  const state = await readAppState(page);
  return state.decks?.flatMap((deck: { cards: any; }) => deck.cards ?? []).find((card: { originalFront: any; canonicalQuestion: any; }) => String(card.originalFront ?? card.canonicalQuestion ?? "").includes("Mitochondrien erzeugen ATP")) ?? null;
}

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü|Mobile Hauptnavigation/ }).filter({ visible: true });
}

async function hasVisibleOutline(locator: Locator) {
  return locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const color = style.outlineColor.replace(/\s/g, "");
    return style.outlineStyle !== "none"
      && Number.parseFloat(style.outlineWidth) > 0
      && color !== "transparent"
      && !color.endsWith(",0)");
  });
}

async function findOriginLeakBeforeReveal(page: Page) {
  return page.locator("body").evaluate((body: HTMLElement) => {
    const originTerms = /\b(?:Original(?:karte)?|Variante|Level|fsrs|Reifegrad)\b/i;
    const accessibleValues = [...body.querySelectorAll("*")].flatMap((element) => [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
    ]).filter(Boolean);
    return [body.innerText, ...accessibleValues].find((value) => originTerms.test(value ?? "")) ?? null;
  });
}

test("dashboard deck rows start learning across their full surface and keep the learning overview separate", async ({ page }: any) => {
  await resetToFreshLocalState(page, { waitForCloud: false });

  const openLearn = page.getByRole("button", { name: "Alle ansehen", exact: true });
  await expect(openLearn).toHaveAccessibleName("Alle ansehen");
  await openLearn.click();
  await expect(page).toHaveURL(/\/lernen$/);
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeVisible();

  await page.goBack();
  const deckRow = page.getByRole("button", { name: "Welt-Hauptstädte lernen", exact: true });
  await deckRow.click({ position: { x: 120, y: 20 } });
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();

  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(deckRow).toBeVisible();
  await deckRow.press("Enter");
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
});

test("dashboard heatmap changes its header layout only once across responsive widths", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  const viewports = [1440, 1280, 1279, 1152, 1024, 900, 768, 700, 640, 639, 390, 320];
  for (const period of [
    { label: "Woche", value: "week" },
    { label: "Monat", value: "month" },
    { label: "Jahr", value: "year" },
  ]) {
    await page.getByRole("button", { name: period.label, exact: true }).click();
    let stackedHeaderSeen = false;

    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      const grid = page.getByTestId("study-heatmap-grid");
      await expect(grid).toBeVisible();
      await expect(grid).toHaveAttribute("data-heatmap-period", period.value);
      await expect.poll(() => grid.locator("span[aria-label]").count()).toBeGreaterThan(0);

      const layout = await page.getByTestId("study-heatmap-header").evaluate((header: HTMLElement) => {
        const centerY = (rect: DOMRect) => rect.top + rect.height / 2;
        const titleGroup = header.firstElementChild as HTMLElement;
        const controls = header.lastElementChild as HTMLElement;
        const title = titleGroup.querySelector<HTMLElement>("h3")!;
        const titleRect = titleGroup.getBoundingClientRect();
        const controlsRect = controls.getBoundingClientRect();
        const controlRects = [...controls.children].map((control) => control.getBoundingClientRect());
        const panel = header.closest<HTMLElement>(".core-study-heatmap-container")!;
        const yearScroller = panel.querySelector<HTMLElement>("[aria-label^='Horizontal scrollbare Lern-Heatmap']");

        return {
          sameRow: Math.abs(centerY(titleRect) - centerY(controlsRect)) <= 1,
          controlsSingleRow: controlRects.every((rect) => Math.abs(rect.top - controlRects[0].top) <= 1),
          controlsRightAligned: Math.abs(controlsRect.right - header.getBoundingClientRect().right) <= 1,
          titleSingleLine: title.scrollHeight <= title.clientHeight + 1,
          pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
          yearScrollIsLocal: !yearScroller || (getComputedStyle(yearScroller).overflowX === "auto" && yearScroller.scrollWidth >= yearScroller.clientWidth),
        };
      });

      if (!layout.sameRow) stackedHeaderSeen = true;
      else expect(stackedHeaderSeen).toBe(false);
      expect(layout.controlsSingleRow).toBe(true);
      expect(layout.controlsRightAligned).toBe(true);
      expect(layout.titleSingleLine).toBe(true);
      expect(layout.pageFitsViewport).toBe(true);
      expect(layout.yearScrollIsLocal).toBe(true);
    }
  }
});

test("dashboard heatmap preserves its cells, today marker and label alignment", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Jahr", exact: true }).click();
    const grid = page.getByTestId("study-heatmap-grid");
    await expect(grid).toBeVisible();
    await expect.poll(() => grid.locator("span[aria-label]").count()).toBeGreaterThan(0);

    const layout = await grid.evaluate((element: HTMLElement) => {
      const dayCells = [...element.querySelectorAll<HTMLElement>("span[aria-label]")];
      const firstDayStyle = window.getComputedStyle(dayCells[0]);
      const firstDayRect = dayCells[0].getBoundingClientRect();
      const today = element.querySelector<HTMLElement>('[class*="ring-[3px]"]');
      const todayStyle = today ? window.getComputedStyle(today) : null;
      const header = document.querySelector<HTMLElement>("[data-testid='study-heatmap-header']")!;
      const controls = header.lastElementChild as HTMLElement;
      const [periodSelector, navigation] = [...controls.children] as HTMLElement[];
      const headerRect = header.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const periodSelectorRect = periodSelector.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      return {
        cellWidth: firstDayRect.width,
        cellHeight: firstDayRect.height,
        cellRadius: firstDayStyle.borderRadius,
        todayShadow: todayStyle?.boxShadow ?? "none",
        selectorBeforeNavigation: periodSelectorRect.right <= navigationRect.left,
        controlsRightAligned: Math.abs(controlsRect.right - headerRect.right),
        pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });

    expect(layout.cellWidth).toBe(19);
    expect(layout.cellHeight).toBe(19);
    expect(layout.cellRadius).toBe("4px");
    expect(layout.todayShadow).not.toBe("none");
    expect(layout.selectorBeforeNavigation).toBe(true);
    expect(layout.controlsRightAligned).toBeLessThanOrEqual(1);
    expect(layout.pageFitsViewport).toBe(true);
  }
});

test("statistics uses the shared filtered heatmap without clipped shadows or retired subtitles", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Statistik" }).click();

  await expect(page.getByTestId("study-heatmap-header").getByRole("heading", { name: /Tage? Streak/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lernkalender" })).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="statistics-overview-title"] dl')).toHaveCount(7);
  for (const removedText of [
    "Alle historischen Diagramme",
    "pro aktivem Tag",
    "Schwer, Gut oder Einfach",
    "geeignete Reviews",
    "Messung beginnt mit der nächsten Wiederholung",
    "gemessene Antworten",
    "Längste:",
    "FSRS-Kennzahlen und aktuelle Bestandsverteilungen",
  ]) await expect(page.getByText(removedText, { exact: false })).toHaveCount(0);

  for (const theme of ["light", "dark"]) {
    await page.evaluate((value: string) => { document.documentElement.dataset.coreTheme = value; }, theme);
    const cellBackground = await page.getByTestId("study-heatmap-grid").locator("span[aria-label]").first().evaluate((cell: HTMLElement) => getComputedStyle(cell).backgroundColor);
    expect(cellBackground).not.toBe("rgba(0, 0, 0, 0)");
  }
  await page.evaluate(() => { document.documentElement.dataset.coreTheme = "light"; });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const grid = page.getByTestId("study-heatmap-grid");
    await expect(grid).toBeVisible();
    const layout = await page.getByRole("heading", { name: "Statistik" }).evaluate((heading: HTMLElement) => {
      const screenRoot = heading.closest("header")?.parentElement?.parentElement as HTMLElement;
      return {
        overflowX: getComputedStyle(screenRoot).overflowX,
        pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });
    expect(layout.overflowX).toBe("visible");
    expect(layout.pageFitsViewport).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const rangeLabel = page.getByTestId("study-heatmap-range-label");
  const initialRange = await rangeLabel.textContent();
  const previousRange = page.getByRole("button", { name: "Frühere sieben Tage anzeigen" });
  if (await previousRange.isEnabled()) {
    await previousRange.click();
    await expect(rangeLabel).not.toHaveText(initialRange!);
  } else {
    await expect(previousRange).toBeDisabled();
  }

  await page.getByRole("button", { name: "30 Tage" }).click();
  await expect(page.getByRole("button", { name: "30 Tage" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("study-heatmap-grid")).toBeVisible();
});

test("CoRe tooltips replace native hints for heatmap and icon actions", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const grid = page.getByTestId("study-heatmap-grid");
  const dayCells = grid.locator("span[aria-label]");
  await expect.poll(() => dayCells.count()).toBeGreaterThan(1);
  await expect(grid.locator("[title]")).toHaveCount(0);

  const firstDay = dayCells.first();
  const firstLabel = await firstDay.getAttribute("aria-label");
  expect(firstLabel).toBeTruthy();
  await firstDay.hover();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(firstLabel!);
  await expect(tooltip).toHaveCount(1);

  const bounds = await tooltip.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(8);
  expect(bounds.right).toBeLessThanOrEqual(382);
  expect(bounds.top).toBeGreaterThanOrEqual(8);
  expect(bounds.bottom).toBeLessThanOrEqual(836);

  const secondDay = dayCells.nth(1);
  const secondLabel = await secondDay.getAttribute("aria-label");
  await secondDay.hover();
  await expect(tooltip).toHaveText(secondLabel!);
  await tooltip.hover();
  await page.waitForTimeout(150);
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);

  await page.getByRole("navigation", { name: "Mobile Hauptnavigation" }).getByRole("button", { name: "Lernen" }).click();
  const deckOptions = page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" });
  await expect(deckOptions).not.toHaveAttribute("title");
  await deckOptions.focus();
  await expect(tooltip).toHaveText("Stapeloptionen für Afrika");
  const deckTooltipIcon = tooltip.locator('[data-core-tooltip-deck-appearance="true"]');
  await expect(deckTooltipIcon).toBeVisible();
  const [deckTooltipLayout, rowIconColor] = await Promise.all([
    tooltip.evaluate((element: HTMLElement) => {
      const icon = element.querySelector<HTMLElement>('[data-core-tooltip-deck-appearance="true"]')!;
      const iconRect = icon.getBoundingClientRect();
      return {
        height: element.getBoundingClientRect().height,
        iconColor: getComputedStyle(icon).color,
        iconHeight: iconRect.height,
        iconWidth: iconRect.width,
      };
    }),
    page.getByTestId(`learn-deck-row-${DECK_IDS.africa}`).locator('[data-deck-icon="true"]').evaluate((icon: HTMLElement) => getComputedStyle(icon).color),
  ]);
  expect(deckTooltipLayout).toEqual({ height: 34, iconColor: rowIconColor, iconHeight: 16, iconWidth: 16 });
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});

test("browser back returns from deck management to learning without reload", async ({ page }: any) => {
  const { authStorageKey } = await resetToFreshLocalState(page);
  expect(authStorageKey).toMatch(/^sb-.+-auth-token$/);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await mainMenu(page).getByRole("button", { name: "Karten" }).click();
  await expect(page.getByTestId(`deck-header-${DECK_IDS.europe}`)).toBeVisible();

  await page.evaluate(() => window.history.back());
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("leaving study mode returns to the previous learning screen", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();

  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.europe}`);
});

test("[Vertrag: Tastaturfokus bei Navigation und Overlays] Fokus folgt Seiten- und Overlaywechseln", async ({ page }: any) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await resetToFreshLocalState(page);
  await expect(page.getByRole("heading", { name: /^Willkommen (?:bei CoRe|zurück,)/ })).toBeFocused();

  const learnNavigation = mainMenu(page).getByRole("button", { name: "Lernen" });
  await learnNavigation.focus();
  await expect.poll(() => hasVisibleOutline(learnNavigation)).toBe(false);
  await page.keyboard.press("Enter");
  const learnHeading = page.getByRole("heading", { name: "Lernen", exact: true });
  await expect(learnHeading).toBeFocused();
  await expect.poll(() => hasVisibleOutline(learnHeading)).toBe(false);

  const deckNameInput = page.getByTestId("learn-deck-name-input");
  await deckNameInput.focus();
  await expect(deckNameInput).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("learn-deck-parent-select")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(deckNameInput).toBeFocused();

  const studyButton = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ });
  await studyButton.focus();
  await page.keyboard.press("Enter");
  const questionContent = page.getByRole("group", { name: "Frage" });
  await expect(questionContent).toBeFocused();
  await expect.poll(() => hasVisibleOutline(questionContent)).toBe(false);

  const settings = page.getByRole("button", { name: "Lerneinstellungen" });
  await settings.focus();
  await page.keyboard.press("Enter");
  const settingsDialog = page.getByRole("dialog", { name: "Lerneinstellungen" });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Lerneinstellungen schließen" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    settingsDialog.getByRole("combobox", { name: "Kartenreihenfolge" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(settingsDialog.getByRole("button", { name: "Lerneinstellungen schließen" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();

  await questionContent.focus();
  await page.keyboard.press("Space");
  const answerContent = page.getByRole("group", { name: "Antwort" });
  await expect(answerContent).toBeFocused();
  await expect.poll(() => hasVisibleOutline(answerContent)).toBe(false);
  await page.keyboard.press("3");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Frage" || document.activeElement?.textContent?.includes("Sitzung abgeschlossen"))).toBe(true);
});

test("Lerneinstellungen wechseln bei 768 px zwischen Bottom Sheet und zentriertem Overlay", async ({ page }: any) => {
  const browserErrors: string[] = [];
  page.on("console", (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error: Error) => browserErrors.push(error.message));
  await page.setViewportSize({ width: 767, height: 640 });
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ }).click();

  const settings = page.getByRole("button", { name: "Lerneinstellungen" });
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Lerneinstellungen" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(250);
  await expect(dialog.getByText("Karte", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Sitzung", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stapel bearbeiten" })).toBeVisible();
  await expect(dialog.getByText("Stapel", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Neue Karten pro Tag", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Max. Wiederholungen", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Reset", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Mischen", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Nur normale Karten", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "Aussetzstatus der Karte" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Kartenreihenfolge" })).toHaveText(/Fällige Karten zuerst/);

  const mobileGeometry = await dialog.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height, viewportHeight: window.innerHeight };
  });
  expect(mobileGeometry.left).toBeLessThanOrEqual(1);
  expect(Math.abs(mobileGeometry.right - 767)).toBeLessThanOrEqual(1);
  expect(mobileGeometry.bottom).toBeLessThanOrEqual(mobileGeometry.viewportHeight);
  expect(mobileGeometry.height).toBeLessThanOrEqual(mobileGeometry.viewportHeight * 0.88 + 1);
  const contentBorders = await dialog.locator("section, section > div > *").evaluateAll((elements: Element[]) => elements.map((element: Element) => {
    const style = window.getComputedStyle(element);
    return { top: style.borderTopWidth, bottom: style.borderBottomWidth };
  }));
  expect(contentBorders.every((border: { top: string; bottom: string }) => border.top === "0px" && border.bottom === "0px")).toBe(true);

  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(250);
  const desktopGeometry = await dialog.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  });
  expect(desktopGeometry.left).toBeGreaterThan(1);
  expect(desktopGeometry.right).toBeLessThan(desktopGeometry.viewportWidth - 1);
  expect(Math.abs((desktopGeometry.left + desktopGeometry.right) / 2 - desktopGeometry.viewportWidth / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((desktopGeometry.top + desktopGeometry.bottom) / 2 - desktopGeometry.viewportHeight / 2)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  expect(browserErrors).toEqual([]);
});

test("Pomodoro timer started in the learning settings remains global after leaving review", async ({ page }: any) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ }).click();

  await page.getByRole("button", { name: "Lerneinstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Lerneinstellungen" });
  const control = dialog.locator('[data-pomodoro-control="study"]');
  await control.locator("button").first().click();
  await control.getByRole("button", { name: "15", exact: true }).click();
  await expect(control.getByLabel("Dauer in Minuten")).toHaveValue("15");
  await expect(page.getByTestId("study-pomodoro-progress")).toHaveCount(0);
  const timerRowGeometry = await control.evaluate((element: HTMLElement) => {
    const input = element.querySelector<HTMLInputElement>("input");
    const presets = element.querySelector<HTMLElement>('[role="group"][aria-label="Pomodoro-Dauer"]');
    const start = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Start");
    if (!input || !presets || !start) return null;
    const inputRect = input.getBoundingClientRect();
    const presetRect = presets.getBoundingClientRect();
    const startRect = start.getBoundingClientRect();
    return {
      inputHeight: inputRect.height,
      presetHeight: presetRect.height,
      startHeight: startRect.height,
      presetRight: presetRect.right,
      startLeft: startRect.left,
    };
  });
  expect(timerRowGeometry).not.toBeNull();
  expect(Math.abs(timerRowGeometry!.inputHeight - timerRowGeometry!.presetHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(timerRowGeometry!.inputHeight - timerRowGeometry!.startHeight)).toBeLessThanOrEqual(1);
  expect(timerRowGeometry!.startLeft).toBeGreaterThan(timerRowGeometry!.presetRight);
  await control.getByLabel("Dauer in Minuten").fill("10");
  await control.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("study-pomodoro-progress")).toHaveAttribute("aria-valuetext", "Noch 10 Min.");

  await page.getByRole("button", { name: "Lerneinstellungen" }).click();
  const reopenedControl = page.getByRole("dialog", { name: "Lerneinstellungen" }).locator('[data-pomodoro-control="study"]');
  await expect(reopenedControl.locator("button").first()).toHaveAttribute("aria-expanded", "false");
  await expect(reopenedControl).toContainText("10 Min.");
  await page.getByRole("dialog", { name: "Lerneinstellungen" }).getByRole("button", { name: "Lerneinstellungen schließen" }).click();

  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(page.locator('[data-pomodoro-progress="sidebar"]')).toContainText("10 min.");
});

test("Lerneinstellungen speichern Markierung, Aussetzung und Kartenreihenfolge sofort", async ({ page }: any) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ }).click();

  await page.getByRole("button", { name: "Lerneinstellungen" }).click();
  let dialog = page.getByRole("dialog", { name: "Lerneinstellungen" });
  const markButton = dialog.getByRole("button", { name: "Karte markieren" });
  await expect.poll(() => markButton.evaluate((element: HTMLElement) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--core-warning)";
    document.body.append(probe);
    const usesWarningColor = getComputedStyle(element).color === getComputedStyle(probe).color;
    probe.remove();
    return usesWarningColor;
  })).toBe(true);
  await markButton.click();
  await expect(dialog.getByRole("button", { name: "Markierung entfernen" })).toBeVisible();
  await chooseCoreSelectOption(page, dialog.getByRole("combobox", { name: "Kartenreihenfolge" }), "Neue Karten zuerst");
  await expect.poll(async () => {
    const state = await readAppState(page);
    const currentDeck = state.decks.find((deck: { id: string }) => deck.id === DECK_IDS.europe);
    return {
      marked: currentDeck.cards.filter((card: { meta?: { marked?: boolean } }) => card.meta?.marked).length,
      order: currentDeck.deckSettings.newReviewOrder,
    };
  }).toEqual({ marked: 1, order: "new-first" });

  await page.reload();
  await page.getByRole("button", { name: "Lerneinstellungen" }).click();
  dialog = page.getByRole("dialog", { name: "Lerneinstellungen" });
  await expect(dialog.getByRole("button", { name: "Markierung entfernen" })).toBeVisible();
  await dialog.getByRole("group", { name: "Aussetzstatus der Karte" }).getByRole("button", { name: "Aussetzen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const state = await readAppState(page);
    return state.decks
      .find((deck: { id: string }) => deck.id === DECK_IDS.europe)
      .cards.filter((card: { status?: string }) => card.status === "suspended").length;
  }).toBe(1);
});

test("core actions stay usable in a 200 percent effective viewport", async ({ page }: any) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await resetToFreshLocalState(page);

  const learnNavigation = mainMenu(page).getByRole("button", { name: "Lernen" });
  await expect(learnNavigation).toBeVisible();
  await learnNavigation.click();
  const learnHeading = page.getByRole("heading", { name: "Lernen", exact: true });
  await expect(learnHeading).toBeFocused();
  await expect.poll(() => hasVisibleOutline(learnHeading)).toBe(false);
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("browser back returns from settings to the previous screen", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("button", { name: "Export herunterladen" })).toHaveCount(0);
  for (const section of ["Konto", "Lerntag & Fokus", "Daten & Synchronisierung", "Über uns"]) {
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("Login-E-Mail")).not.toBeEditable();
  await expect(page.getByText("Die Login-E-Mail kann derzeit nicht in CoRe geändert werden.")).toBeVisible();
  await expect(page.getByText("Impressum", { exact: true })).toBeVisible();
  await expect(page.getByText("Datenschutzerklärung", { exact: true })).toBeVisible();
  await expect(page.getByText("In Vorbereitung", { exact: true })).toHaveCount(2);
  await expect(page.getByLabel("Aktuelle Version")).toHaveText("v0.2.0");
  await expect(page.getByLabel("Release-Information")).toHaveCount(0);

  await page.getByRole("button", { name: "Info-Seite öffnen" }).click();
  await expect(page).toHaveURL(/\/hilfe$/);
  await expect(page.getByRole("heading", { name: "Wie CoRe dein Lernen stärkt" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/einstellungen(?:#.*)?$/);

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("offline changes stay pending and flush when the browser reconnects", async ({ page, context }: any) => {
  await resetToFreshLocalState(page);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const displayName = page.getByLabel("Anzeigename");
  const originalDisplayName = await displayName.inputValue();
  const syncNow = page.getByRole("button", { name: "Jetzt synchronisieren" });

  try {
    await context.setOffline(true);
    await expect(page.getByLabel("Daten & Synchronisierung").getByText("Offline. Die Verbindung wird automatisch erneut geprüft.")).toBeVisible();
    await expect(syncNow).toBeEnabled();

    await displayName.fill(`${originalDisplayName} Offline`);
    await page.getByTestId("settings-save-bar").getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByLabel("Daten & Synchronisierung").getByText("Offline. Eine Änderung bleibt vorgemerkt und wird automatisch synchronisiert.")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByLabel("Daten & Synchronisierung").getByText(/Zuletzt synchronisiert:/)).toBeVisible();

    await displayName.fill(originalDisplayName);
    await page.getByTestId("settings-save-bar").getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(800);
    await expect(page.getByLabel("Daten & Synchronisierung").getByText(/Zuletzt synchronisiert:/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("[Vertrag: Review über Offline, Reconnect und Reload] @golden-e2e @beta-core @hosted-core ein offline beantwortetes Review wird genau einmal cloudbestätigt", async ({ page, context }: any) => {
  await resetToFreshLocalState(page);
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (login.error || !login.data.user) throw login.error ?? new Error("Golden-E2E-Account fehlt.");

  try {
    const before = await deckReviewEventCount(page, DECK_IDS.europe);
    await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
    await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
    await page.getByRole("button", { name: "Antwort anzeigen" }).click();

    await context.setOffline(true);
    await page.getByRole("button", { name: /Bewertung Gut/ }).click();
    await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBe(before + 1);
    const offlineState = await readAppState(page);
    const reviewEvent = offlineState.decks.find((deck: { id: string }) => deck.id === DECK_IDS.europe)?.reviewEvents?.at(-1);
    expect(reviewEvent?.id).toBeTruthy();

    await context.setOffline(false);
    await expect.poll(async () => {
      const result = await client.from("review_events").select("id").eq("id", reviewEvent.id).maybeSingle();
      if (result.error) throw result.error;
      return result.data?.id ?? null;
    }, { timeout: 15_000 }).toBe(reviewEvent.id);

    await page.reload();
    await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
    const reloadedState = await readAppState(page);
    const matchingEvents = reloadedState.decks
      .flatMap((deck: { reviewEvents?: { id: string }[] }) => deck.reviewEvents ?? [])
      .filter((event: { id: string }) => event.id === reviewEvent.id);
    expect(matchingEvents).toHaveLength(1);
  } finally {
    await context.setOffline(false);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
});

test("review flow records a rating through accessible controls", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const before = await deckReviewEventCount(page, DECK_IDS.europe);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  expect(await findOriginLeakBeforeReveal(page)).toBeNull();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByRole("button", { name: "Grundkarte anzeigen" })).toHaveCount(0);
  await expect(page.getByTestId("base-card-reference")).toHaveCount(0);
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();

  await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("deck settings save appearance, learning, scheduler and CoRe values together", async ({ page }: any) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error: Error) => runtimeErrors.push(error.message));
  page.on("console", (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await resetToFreshLocalState(page);
  const initialState = await readAppState(page);
  const initialDeck = initialState.decks.find((deck: { id: string }) => deck.id === DECK_IDS.africa);
  const initialNewCards = initialDeck.deckSettings.newCardsPerDay;
  const initialMaximumReviews = initialDeck.deckSettings.maximumReviewsPerDay;
  const initialMaximumInterval = initialDeck.deckSettings.schedulerProfile.maximumIntervalDays;
  const initialRetentionPercent = Math.round(initialDeck.deckSettings.schedulerProfile.desiredRetention * 100);
  const nextNewCards = initialNewCards === 17 ? 18 : 17;
  const nextMaximumReviews = initialMaximumReviews === 240 ? 250 : 240;
  const nextMaximumInterval = initialMaximumInterval === 777 ? 778 : 777;
  const nextRetentionPercent = initialRetentionPercent === 96 ? 95 : 96;

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" }).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.africa}`).getByRole("button", { name: "Einstellungen" }).click();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const settingsNavigation = page.locator(viewport.width >= 1280 ? '[data-in-page-navigation="desktop"]' : '[data-in-page-navigation="compact"]');
    await expect(settingsNavigation).toBeVisible();
    if (viewport.width < 1280 && await settingsNavigation.locator("details").getAttribute("open") === null) {
      await settingsNavigation.locator("summary").click();
    }
    await expect(settingsNavigation.getByRole("link")).toHaveCount(3);
    await expect(page.getByLabel("Stapelname")).toBeVisible();
    await expect(page.getByRole("button", { name: "Icon auswählen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Farbe auswählen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Name und Darstellung speichern" })).toHaveCount(0);
    await expect(page.getByTestId("learning-settings-new-cards")).toBeVisible();
    await expect(page.getByTestId("learning-settings-max-reviews")).toBeVisible();
    await expect(page.getByTestId("learning-settings-maximum-interval")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const targetSizes = await page.getByRole("button", { name: /^(Icon auswählen|Farbe auswählen)$/ }).evaluateAll(
      (buttons: HTMLElement[]) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
    );
    expect(targetSizes.every(({ width, height }: { width: number; height: number }) => width >= 44 && height >= 44)).toBe(true);
  }

  const iconButton = page.getByRole("button", { name: "Icon auswählen" });
  await iconButton.click();
  await expect(page.getByTestId("deck-icon-grid")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(iconButton).toBeFocused();

  const colorButton = page.getByRole("button", { name: "Farbe auswählen" });
  await colorButton.click();
  await expect(page.getByRole("slider", { name: /Farbkreis/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(colorButton).toBeFocused();

  await expect(page.getByRole("switch", { name: "Kurze Abstände verdoppeln" })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [testId, nextValue] of [
    ["learning-settings-new-cards", nextNewCards],
    ["learning-settings-max-reviews", nextMaximumReviews],
    ["learning-settings-maximum-interval", nextMaximumInterval],
  ] as const) {
    const field = page.getByTestId(testId);
    await field.fill("");
    await expect(field).toHaveValue("");
    await field.pressSequentially(String(nextValue));
    await expect(field).toHaveValue(String(nextValue));
  }
  await page.getByTestId("learning-settings-retention").fill(String(nextRetentionPercent));
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar).toHaveCount(1);
  expect((await readAppState(page)).decks.find((deck: { id: string }) => deck.id === DECK_IDS.africa).deckSettings.newCardsPerDay).toBe(initialNewCards);
  expect((await readAppState(page)).decks.find((deck: { id: string }) => deck.id === DECK_IDS.africa).deckSettings.maximumReviewsPerDay).toBe(initialMaximumReviews);
  expect((await readAppState(page)).decks.find((deck: { id: string }) => deck.id === DECK_IDS.africa).deckSettings.schedulerProfile.maximumIntervalDays).toBe(initialMaximumInterval);

  await page.getByLabel("Varianten einsetzen ab Lernstufe").click();
  await page.getByRole("option", { name: "Sicher · später" }).click();
  await page.getByLabel("Aktive Varianten pro Karte").click();
  await page.getByRole("option", { name: "3 Varianten" }).click();
  await expect(saveBar).toHaveCount(1);
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  await expect(saveBar).toHaveCount(0);
  await expect(page.getByText("Stapeleinstellungen wurden gespeichert.", { exact: true })).toBeVisible();

  await expect.poll(async () => {
    const deck = (await readAppState(page)).decks.find((candidate: { id: string }) => candidate.id === DECK_IDS.africa);
    return {
      newCardsPerDay: deck.deckSettings.newCardsPerDay,
      maximumReviewsPerDay: deck.deckSettings.maximumReviewsPerDay,
      maximumIntervalDays: deck.deckSettings.schedulerProfile.maximumIntervalDays,
      desiredRetention: deck.deckSettings.schedulerProfile.desiredRetention,
      variantThresholdXp: deck.deckSettings.variantThresholdXp,
      maxActiveVariantsPerCard: deck.deckSettings.maxActiveVariantsPerCard,
    };
  }).toEqual({
    newCardsPerDay: nextNewCards,
    maximumReviewsPerDay: nextMaximumReviews,
    maximumIntervalDays: nextMaximumInterval,
    desiredRetention: nextRetentionPercent / 100,
    variantThresholdXp: 181,
    maxActiveVariantsPerCard: 3,
  });

  await page.reload();
  await expect(page.getByTestId("learning-settings-new-cards")).toHaveValue(String(nextNewCards));
  await expect(page.getByTestId("learning-settings-max-reviews")).toHaveValue(String(nextMaximumReviews));
  await expect(page.getByTestId("learning-settings-maximum-interval")).toHaveValue(String(nextMaximumInterval));
  await expect(page.getByTestId("learning-settings-retention")).toHaveValue(String(nextRetentionPercent));
  await expect(page.getByLabel("Varianten einsetzen ab Lernstufe")).toContainText("Sicher · später");
  await expect(page.getByLabel("Aktive Varianten pro Karte")).toContainText("3 Varianten");

  await page.goto(`/decks/${DECK_IDS.africa}/review?returnView=learn&returnDeck=${DECK_IDS.africa}`);
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await expect.poll(async () => (await readAppState(page)).decks
    .find((candidate: { id: string }) => candidate.id === DECK_IDS.africa)
    .deckSettings.schedulerProfile.desiredRetention).toBe(nextRetentionPercent / 100);
  await page.goto(`/stapel-einstellungen?deck=${DECK_IDS.africa}&returnView=learn`);
  await expect(page.getByTestId("learning-settings-retention")).toHaveValue(String(nextRetentionPercent));
  const unexpectedRuntimeErrors = runtimeErrors.filter((error) => !(
    error.includes("Failed to fetch") && error.includes("@supabase_supabase-js")
  ));
  expect(unexpectedRuntimeErrors).toEqual([]);
});

test("[Vertrag: KI-Variante, Reveal, Grundkarte und Feedback] @golden-e2e @beta-core @hosted-core Variantenfeedback bleibt kontrolliert und reviewbar", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const variantEventsBefore = await variantReviewEventCount(page, DECK_IDS.africa);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" }).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.africa}`).getByRole("button", { name: "Einstellungen" }).click();
  await page.getByTestId("learning-settings-new-cards").fill("0");
  await page.getByTestId("learning-settings-max-reviews").fill("1");
  await page.getByTestId("settings-save-bar").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stapeleinstellungen wurden gespeichert." })).toBeVisible();
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  await mainMenu(page).getByRole("button", { name: "Karten" }).click();
  await page.getByTestId(`deck-toggle-${DECK_IDS.africa}`).click();
  await page.getByRole("button", { name: "Was ist die Hauptstadt von Côte d'Ivoire?" }).click();
  const variantTools = page.getByTestId("card-variant-tools");
  await expect(variantTools).toBeVisible();
  const variantsBefore = (await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ"))?.variants?.length ?? 0;
  await page.route("**/api/ai/card-variant", (route: any) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      variant: { front: "Welche Stadt ist der Regierungssitz von Côte d'Ivoire?", back: "Yamoussoukro" },
      model: "provider/model:free",
      privacyMode: "zdr",
      usage: null,
    }),
  }));
  await page.getByRole("button", { name: "KI-Variante erzeugen" }).click();
  await expect.poll(async () => (await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ"))?.variants?.length ?? 0).toBe(variantsBefore + 1);
  await expect.poll(async () => (await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ"))?.variants
    ?.find((variant: { front: string }) => variant.front === "Welche Stadt ist der Regierungssitz von Côte d'Ivoire?")?.back).toBe("Yamoussoukro");

  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await page.goto(`/decks/${DECK_IDS.africa}/review?variant=1&returnView=decks&returnDeck=${DECK_IDS.africa}`);
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  expect(await findOriginLeakBeforeReveal(page)).toBeNull();
  await expect(page.getByRole("button", { name: "Grundkarte anzeigen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.frameLocator('iframe[title="Frage"]').getByText("Welche Stadt ist der Regierungssitz von Côte d'Ivoire?", { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Antwort"]').locator("body")).toContainText("Yamoussoukro");
  await expect(page.getByRole("button", { name: "Grundkarte anzeigen" })).toHaveCount(1);
  await page.getByRole("button", { name: "Grundkarte anzeigen" }).click();
  await expect(page.getByTestId("base-card-reference")).toHaveCount(1);
  await expect(page.frameLocator('iframe[title="Frage der Grundkarte"]').getByText("Was ist die Hauptstadt von Côte d'Ivoire?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unklar formuliert" }).click();
  await expect(page.getByRole("status")).toContainText("Der ausgewählte Grund wurde gespeichert.");
  await expect.poll(async () => {
    const flaggedState = await readAppState(page);
    const flaggedVariant = flaggedState.decks
      .find((deck: { id: string }) => deck.id === DECK_IDS.africa)
      ?.cards.flatMap((card: { variants?: any[] }) => card.variants ?? [])
      .find((variant: { front: string }) => variant.front === "Welche Stadt ist der Regierungssitz von Côte d'Ivoire?");
    return {
      qualityStatus: flaggedVariant?.qualityStatus,
      feedbackType: flaggedVariant?.feedback.at(-1)?.type,
    };
  }).toEqual({ qualityStatus: "flagged", feedbackType: "unklar_formuliert" });
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();

  await expect.poll(() => variantReviewEventCount(page, DECK_IDS.africa)).toBe(variantEventsBefore + 1);
  await expect(page.getByRole("heading", { name: "Sitzung abgeschlossen" })).toBeVisible();
  await expect(page.getByText("1 Karte · 0 Wiederholungen")).toBeVisible();
  await page.getByRole("button", { name: "Zurück zum Ausgangspunkt" }).click();
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  await page.getByPlaceholder("Stapel, Vorderseite, Rückseite oder Tags suchen").fill("Côte d'Ivoire");
  await expect(page.getByRole("button", { name: "Was ist die Hauptstadt von Côte d'Ivoire?" })).toBeVisible();
});

test("card rescheduling preserves scheduler state and keeps version history out of the editor", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await mainMenu(page).getByRole("button", { name: "Karten" }).click();
  await page.getByTestId(`deck-toggle-${DECK_IDS.africa}`).click();
  await page.getByRole("button", { name: "Was ist die Hauptstadt von Côte d'Ivoire?" }).click();
  await expect(page.getByLabel("Karten-Vorderseite")).toContainText("Was ist die Hauptstadt von Côte d'Ivoire?");
  await expect(page.getByRole("heading", { name: "Details und Herkunft" })).toHaveCount(0);
  await expect(page.getByText("Änderungslogeinträge")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Version zum Wiederherstellen" })).toHaveCount(0);

  const dueDate = page.getByRole("button", { name: "Nächste Fälligkeit" });
  await expect(dueDate).toContainText(/\d{2}\.\d{2}\.\d{4}/);
  await expect(page.getByRole("button", { name: "Neu planen" })).toBeDisabled();
  await page.getByRole("button", { name: "Aussetzen", exact: true }).click();
  await expect.poll(async () => (await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ"))?.status).toBe("suspended");
  const before = await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ");
  const reviewEventsBefore = (await readAppState(page)).decks
    .find((deck: { id: string }) => deck.id === DECK_IDS.africa).reviewEvents.length;

  await dueDate.click();
  const datePicker = page.getByRole("dialog", { name: "Nächste Fälligkeit: Datum auswählen" });
  await expect(datePicker).toBeVisible();
  const focusedDay = datePicker.locator('button[data-date-key]:focus');
  await expect(focusedDay).toHaveCount(1);
  const initialFocusKey = await focusedDay.getAttribute("data-date-key");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focusedDay.getAttribute("data-date-key")).not.toBe(initialFocusKey);
  const selectedDateKey = await focusedDay.getAttribute("data-date-key");
  await page.keyboard.press("Enter");
  await expect(datePicker).toBeHidden();
  const [selectedYear, selectedMonth, selectedDay] = selectedDateKey!.split("-");
  await expect(dueDate).toContainText(`${selectedDay}.${selectedMonth}.${selectedYear}`);
  await expect(page.getByRole("button", { name: "Neu planen" })).toBeEnabled();
  await page.getByRole("button", { name: "Neu planen" }).click();
  await expect(page.getByText("Die nächste Fälligkeit wurde erfolgreich neu geplant.")).toBeVisible();

  const scheduled = await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ");
  expect(scheduled.reviewState.dueAt).not.toBe(before.reviewState.dueAt);
  expect({ ...scheduled.reviewState, dueAt: before.reviewState.dueAt }).toEqual(before.reviewState);
  expect(scheduled.coreState).toEqual(before.coreState);
  expect(scheduled.revision).toBe(before.revision);
  expect(scheduled.contentRevision).toBe(before.contentRevision);
  expect(scheduled.status).toBe("suspended");
  expect("versionLog" in scheduled).toBe(false);
  const events = (await readAppState(page)).decks
    .find((deck: { id: string }) => deck.id === DECK_IDS.africa).reviewEvents;
  expect(events).toHaveLength(reviewEventsBefore + 1);
  expect(events.at(-1)).toMatchObject({ rating: "manual", sourceCardId: scheduled.id });
  expect(events.at(-1).schedulerBefore).toEqual({ dueAt: before.reviewState.dueAt });
  expect(events.at(-1).schedulerAfter).toEqual({ dueAt: scheduled.reviewState.dueAt });
  expect(events.at(-1).flags).toEqual({ kind: "manual_reschedule" });
});

test("shared CoRe date picker updates the simulator within its bounded range", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  await page.goto("/simulator");
  await expect(page.getByRole("heading", { name: "Simulator", exact: true })).toBeVisible();

  const dateTrigger = page.getByRole("button", { name: "Simuliertes Datum" });
  const initialLabel = await dateTrigger.innerText();
  await dateTrigger.click();
  const datePicker = page.getByRole("dialog", { name: "Simuliertes Datum: Datum auswählen" });
  await expect(datePicker).toBeVisible();
  await expect(datePicker.locator('button[data-date-key][aria-current="date"]')).toHaveCount(1);
  const nextDate = datePicker.locator('button[data-date-key]:not([disabled]):not([aria-pressed="true"])').first();
  const nextDateKey = await nextDate.getAttribute("data-date-key");
  await nextDate.click();

  const [year, month, day] = nextDateKey!.split("-");
  await expect(dateTrigger).toContainText(`${day}.${month}.${year}`);
  await expect(dateTrigger).not.toHaveText(initialLabel);
});

test("[Vertrag: manuell mit PDF bis Bearbeiten und Review] @golden-e2e @beta-core @hosted-core PDF-Auswahl erzeugt nur Karteninhalt", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Karten selbst erstellen/ }).click();
  await page.getByRole("button", { name: "Neuen Stapel erstellen" }).click();
  await page.getByRole("textbox", { name: "Neuer Kartenstapel" }).fill("PDF-Quellenauswahl-Smoke");
  await page.getByRole("button", { name: "PDF/Text anfügen" }).click();
  await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles(PDF_SELECTION_FIXTURE);

  const viewer = page.getByTestId("pdf-document-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("status")).toContainText("Seite 1 von 1");
  const textLayer = viewer.locator('[data-pdf-page-number="1"] .core-pdf-text-layer');
  await expect.poll(() => textLayer.locator("span").count()).toBeGreaterThan(0);

  await textLayer.evaluate((layer: any) => {
    const textSpan = [...layer.querySelectorAll("span")].find((span) => span.textContent?.includes("Mitochondrien erzeugen ATP"));
    if (!textSpan) throw new Error("PDF-Testtext wurde nicht im Textlayer gefunden.");
    const range = document.createRange();
    range.selectNodeContents(textSpan);
    const selection = window.getSelection();
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
    selection.removeAllRanges();
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
    selection.addRange(range);
    layer.closest("[aria-label='PDF-Dokument']").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });

  await expect(page.getByRole("status").filter({ hasText: "Vorderseite ergänzt." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toContainText("Mitochondrien erzeugen ATP durch Zellatmung.");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Zellatmung erzeugt ATP.");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await page.getByRole("button", { name: "Fertig" }).click();

  await expect.poll(async () => Boolean(await findPdfCreatedCard(page))).toBe(true);
  const createdCard = await findPdfCreatedCard(page);
  expect("sourceAnchors" in createdCard).toBe(false);

  const stateAfterCreation = await readAppState(page);
  const createdDeck = stateAfterCreation.decks.find((deck: { cards?: { id: string }[] }) => deck.cards?.some((card) => card.id === createdCard.id));
  expect(createdDeck?.id).toBeTruthy();
  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await page.getByRole("button", { name: /Mitochondrien erzeugen ATP/ }).click();
  await page.getByLabel("Karten-Vorderseite").fill("Warum erzeugen Mitochondrien ATP?");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect.poll(async () => (await storedCard(page, createdDeck.id, createdCard.id))?.originalFront).toBe("<p>Warum erzeugen Mitochondrien ATP?</p>");

  const reviewsBefore = await deckReviewEventCount(page, createdDeck.id);
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${createdDeck.id}`).click();
  await expect(page.frameLocator('iframe[title="Frage"]').getByText("Warum erzeugen Mitochondrien ATP?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await expect.poll(() => deckReviewEventCount(page, createdDeck.id)).toBe(reviewsBefore + 1);
});

test("@beta-core @hosted-core settings resolve and persist an account-bound sync conflict", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const conflictId = "e2e-settings-conflict";
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (login.error || !login.data.user) throw login.error ?? new Error("E2E-Nutzer fehlt.");

  try {
    await client.from("sync_conflicts").delete().eq("id", conflictId);
    const { data: remoteDeck, error: deckError } = await client.from("decks").select("*").eq("id", DECK_IDS.root).single();
    if (deckError) throw deckError;
    const localValue = { ...remoteDeck, name: "Lokaler E2E-Stapel" };
    const remoteValue = { ...remoteDeck };
    delete localValue.user_id;
    delete remoteValue.user_id;
    const { error: insertError } = await client.from("sync_conflicts").insert({
      id: conflictId,
      user_id: login.data.user.id,
      entity_table: "decks",
      entity_id: remoteDeck.id,
      base_revision: remoteDeck.revision,
      local_revision: remoteDeck.revision,
      remote_revision: remoteDeck.revision,
      local_value: localValue,
      remote_value: remoteValue,
      status: "open",
      resolution: {},
      updated_by_device_id: "e2e-conflict-device",
      created_at: "2026-07-12T12:00:00.000Z",
    });
    if (insertError) throw insertError;

    await page.reload();
    await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toBeVisible();
    await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
    const panel = page.getByTestId("sync-conflict-panel");
    const conflict = page.getByTestId(`sync-conflict-${conflictId}`);
    await expect(conflict.getByRole("heading", { name: "Lokaler E2E-Stapel" })).toBeVisible();
    await expect(conflict.getByRole("button", { name: "Lokaler E2E-Stapel: Cloud übernehmen" })).toBeVisible();

    await conflict.getByRole("button", { name: "Lokaler E2E-Stapel: Später entscheiden" }).click();
    await expect(panel.getByText("Für später zurückgestellt (1)")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
    await expect(page.getByRole("heading", { name: "Für später zurückgestellt (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Wieder aufnehmen" }).click();
    await expect(conflict.getByRole("button", { name: "Lokaler E2E-Stapel: Cloud übernehmen" })).toBeVisible();
    await conflict.getByRole("button", { name: "Lokaler E2E-Stapel: Cloud übernehmen" }).click();
    await expect(conflict).toHaveCount(0);

    const { data: persisted, error: readError } = await client.from("sync_conflicts").select("status, resolution").eq("id", conflictId).single();
    if (readError) throw readError;
    expect(persisted).toMatchObject({ status: "resolved", resolution: { action: "keep-remote" } });
  } finally {
    await client.from("sync_conflicts").delete().eq("id", conflictId);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
});
