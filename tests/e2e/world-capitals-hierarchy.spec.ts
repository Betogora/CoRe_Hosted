import { expect, test, type Locator, type Page } from "@playwright/test";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

const DECK_IDS = {
  root: "deck_world_capitals",
  africa: "deck_world_capitals_afrika",
  antarctica: "deck_world_capitals_antarktis",
  europe: "deck_world_capitals_europa",
  southAmerica: "deck_world_capitals_suedamerika",
};

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü/ });
}

async function storedParentDeckId(page: Page, deckId: string) {
  const state = await readActiveAccountState(page);
  return state.decks?.find((deck: { id: string }) => deck.id === deckId)?.parentDeckId ?? null;
}

async function storedDeckPresentation(page: Page, deckId: string) {
  const state = await readActiveAccountState(page);
  const deck = state.decks?.find((candidate: { id: string }) => candidate.id === deckId) as {
    name?: string;
    deckSettings?: { appearance?: { iconKey?: string; iconColor?: string } };
  } | undefined;
  return {
    name: deck?.name ?? null,
    iconKey: deck?.deckSettings?.appearance?.iconKey ?? null,
    iconColor: deck?.deckSettings?.appearance?.iconColor ?? null,
  };
}

async function dispatchDeckDrop(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourcePosition = await source.boundingBox();
  const targetPosition = await target.boundingBox();
  expect(sourcePosition).not.toBeNull();
  expect(targetPosition).not.toBeNull();
  await page.mouse.move(sourcePosition!.x + sourcePosition!.width / 2, sourcePosition!.y + sourcePosition!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetPosition!.x + targetPosition!.width / 2, targetPosition!.y + targetPosition!.height / 2, { steps: 8 });
  await expect(source).toHaveAttribute("data-drag-state", "active");
  await page.mouse.up();
}

async function dispatchTopLevelDrop(page: Page, source: Locator, dropZoneTestId: string) {
  await source.scrollIntoViewIfNeeded();
  const sourcePosition = await source.boundingBox();
  expect(sourcePosition).not.toBeNull();
  const sourceX = sourcePosition!.x + sourcePosition!.width / 2;
  const sourceY = sourcePosition!.y + sourcePosition!.height / 2;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX, sourceY + 12, { steps: 3 });
  await expect(source).toHaveAttribute("data-drag-state", "active");
  const dropZone = page.getByTestId(dropZoneTestId);
  await expect(dropZone).toBeVisible();
  const targetPosition = await dropZone.boundingBox();
  expect(targetPosition).not.toBeNull();
  await page.mouse.move(targetPosition!.x + targetPosition!.width / 2, targetPosition!.y + targetPosition!.height / 2, { steps: 8 });
  await page.mouse.up();
}

function metric(row: Locator, name: "new" | "in-progress" | "due") {
  return row.locator(`[data-deck-count="${name}"]`);
}

async function metricValue(row: Locator, name: "new" | "in-progress" | "due") {
  return Number(await metric(row, name).locator("dd").innerText());
}

async function expectDeckOptionUsesFullWidth(option: Locator) {
  expect(await option.evaluate((element) => {
    const viewport = element.parentElement;
    return viewport != null
      && viewport.scrollHeight <= viewport.clientHeight
      && Math.abs(viewport.getBoundingClientRect().right - element.getBoundingClientRect().right) < 0.5;
  })).toBe(true);
}

test("dashboard shows the full shared tree, donut and direct drag-and-drop", async ({ page }) => {
  await resetToFreshLocalState(page);

  const rootRow = page.getByTestId(`dashboard-deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`dashboard-deck-row-${DECK_IDS.europe}`);
  const southAmericaRow = page.getByTestId(`dashboard-deck-row-${DECK_IDS.southAmerica}`);
  await expect(rootRow).toBeVisible();
  await expect(europeRow).toBeVisible();
  await expect(metric(rootRow, "new")).toContainText("Neu");
  await expect(metric(rootRow, "in-progress")).toContainText("In Arbeit");
  await expect(metric(rootRow, "due")).toContainText("Fällig");
  await expect(rootRow.getByLabel(/Prozent/)).toBeVisible();
  await expect(rootRow.getByRole("button", { name: /Stapeloptionen/ })).toBeVisible();
  await expect(southAmericaRow.locator('[data-deck-drag-source="true"]')).toHaveCount(1);

  await rootRow.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte" }).click();
  const dashboardMenu = page.getByTestId(`deck-options-menu-${DECK_IDS.root}`);
  await expect(dashboardMenu.locator('[data-deck-icon="true"]')).toBeVisible();
  await expect(dashboardMenu.getByRole("button", { name: "Einstellungen" })).toBeVisible();
  await expect(dashboardMenu.getByRole("button", { name: "Verschieben" })).toBeVisible();
  await expect(dashboardMenu.getByRole("button", { name: /Umbenennen|Unterstapel|Lernen|Löschen/ })).toHaveCount(0);
  await dashboardMenu.getByRole("button", { name: "Einstellungen" }).click();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.root}&returnView=today$`));
  await page.getByRole("button", { name: "Zurück zur Übersicht" }).click();
  await expect(rootRow).toBeVisible();

  await dispatchDeckDrop(page, southAmericaRow, europeRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);

  await europeRow.getByRole("button", { name: "Welt-Hauptstädte / Europa lernen" }).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
});

test("statistics deck filter uses full-width selection rows while keeping multiple selection", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Statistik" }).click();

  const trigger = page.getByRole("combobox", { name: /Stapel filtern/ });
  await trigger.click();
  const search = page.getByRole("textbox", { name: "Stapel suchen" });
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  const viewport = page.locator('[data-deck-select-viewport="true"]');
  await expect.poll(() => viewport.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  await expect(viewport.locator(':scope > div[aria-hidden="true"]')).toHaveCount(2);
  await expect(viewport.locator('input[type="checkbox"], [role="checkbox"]')).toHaveCount(0);
  const allOption = page.getByRole("option", { name: "Gesamte Sammlung", exact: true });
  await expect(allOption).toHaveAttribute("aria-selected", "true");
  await expect(allOption.locator(".lucide-check")).toHaveCount(1);
  const selectedBackground = await allOption.evaluate((option) => getComputedStyle(option).backgroundColor);

  await search.fill("Europa");
  const europeOption = page.getByRole("option", { name: "Welt-Hauptstädte / Europa", exact: true });
  await expect(europeOption).toBeVisible();
  await expect(page.getByRole("option", { name: "Welt-Hauptstädte", exact: true })).toHaveCount(0);
  await expectDeckOptionUsesFullWidth(europeOption);
  await page.getByRole("button", { name: "Suche leeren" }).click();

  const rootOption = page.getByRole("option", { name: "Welt-Hauptstädte", exact: true });
  await rootOption.click();
  await expect(allOption).toHaveAttribute("aria-selected", "false");
  await expect(rootOption.locator(".lucide-check")).toHaveCount(1);
  await expect(europeOption).toHaveAttribute("aria-selected", "true");
  await expect(europeOption).toBeDisabled();
  await expect(europeOption.locator(".lucide-check")).toHaveCount(1);
  expect(await rootOption.evaluate((option) => getComputedStyle(option).backgroundColor)).toBe(selectedBackground);
  expect(await europeOption.evaluate((option) => getComputedStyle(option).backgroundColor)).toBe(selectedBackground);
  expect(await europeOption.evaluate((option) => getComputedStyle(option).opacity)).toBe("1");
  await expect(viewport).not.toContainText("Durch Oberstapel eingeschlossen");

  await rootOption.click();
  await expect(allOption).toHaveAttribute("aria-selected", "true");
  await europeOption.click();
  const southAmericaOption = page.getByRole("option", { name: "Welt-Hauptstädte / Südamerika", exact: true });
  await southAmericaOption.click();
  await expect(europeOption).toHaveAttribute("aria-selected", "true");
  await expect(southAmericaOption).toHaveAttribute("aria-selected", "true");
  await expect(trigger).toContainText("2 Stapel ausgewählt");
  await allOption.click();
  await expect(allOption).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Escape");
  await trigger.click();
  await expect(page.getByRole("textbox", { name: "Stapel suchen" })).toHaveValue("");
});

test("dashboard deck header keeps its labels intact while changing rows at most once", async ({ page }) => {
  await resetToFreshLocalState(page);

  const widths = [1440, 1280, 1279, 1152, 1024, 900, 768, 700, 640, 639, 390, 320];
  let stackedHeaderSeen = false;
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.getByTestId("dashboard-deck-list-header").evaluate((header: HTMLElement) => {
      const centerY = (rect: DOMRect) => rect.top + rect.height / 2;
      const title = header.querySelector<HTMLElement>("h3")!;
      const action = header.querySelector<HTMLElement>("button")!;
      const titleRect = title.getBoundingClientRect();
      const actionRect = action.getBoundingClientRect();
      return {
        sameRow: Math.abs(centerY(titleRect) - centerY(actionRect)) <= 1,
        titleSingleLine: title.scrollHeight <= title.clientHeight + 1,
        actionSingleLine: action.scrollHeight <= action.clientHeight + 1,
        pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });

    if (!layout.sameRow) stackedHeaderSeen = true;
    else expect(stackedHeaderSeen).toBe(false);
    expect(layout.titleSingleLine).toBe(true);
    expect(layout.actionSingleLine).toBe(true);
    expect(layout.pageFitsViewport).toBe(true);
  }
});

test("active deck header and rows fit every target width and toggle reliably on mobile", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();

  const rootRow = page.getByTestId(`learn-deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  const widths = [1440, 1280, 1279, 1152, 1024, 900, 820, 768, 700, 640, 639, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.getByTestId("learn-deck-list").evaluate((panel) => {
      const rowViewport = panel.querySelector<HTMLElement>(".overflow-hidden.rounded-2xl");
      const tableHeader = panel.querySelector<HTMLElement>('[data-testid="deck-summary-header"] > div')!;
      const headerLabels = [
        tableHeader.firstElementChild as HTMLElement,
        ...tableHeader.querySelectorAll<HTMLElement>(".core-deck-summary-count"),
      ];
      const name = panel.querySelector<HTMLElement>(".core-deck-summary-name")!;
      const icon = panel.querySelector<HTMLElement>(".core-deck-summary-icon")!;
      const rowMetricLabels = [...panel.querySelectorAll<HTMLElement>("[data-deck-count] dt")];
      return {
        fits: Boolean(rowViewport && rowViewport.scrollWidth <= rowViewport.clientWidth + 1)
          && document.documentElement.scrollWidth <= window.innerWidth + 1,
        headerHeight: tableHeader.getBoundingClientRect().height,
        headerLabels: headerLabels.map((label) => label.innerText.trim()),
        headerLabelsFit: headerLabels.every((label) => label.scrollWidth <= label.clientWidth + 1),
        rowLabelsHidden: rowMetricLabels.every((label) => getComputedStyle(label).position === "absolute"),
        nameWidth: name.getBoundingClientRect().width,
        iconWidth: icon.getBoundingClientRect().width,
      };
    });

    expect(layout.fits).toBe(true);
    expect(layout.headerHeight).toBeLessThanOrEqual(30);
    expect(layout.headerLabels).toEqual(width <= 390
      ? ["Stapel", "N", "IA", "F"]
      : ["Stapel", "Neu", "In Arbeit", "Fällig"]);
    expect(layout.headerLabelsFit).toBe(true);
    expect(layout.rowLabelsHidden).toBe(true);
    if (width >= 700) expect(layout.nameWidth).toBeGreaterThanOrEqual(layout.iconWidth);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await rootRow.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte ausblenden" }).click();
  await expect(europeRow).toBeHidden();
  await rootRow.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte anzeigen" }).click();
  await expect(europeRow).toBeVisible();
});

test("learning rows activate directly while expand and settings remain independent", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();

  const rootRow = page.getByTestId(`learn-deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  await expect(page.getByTestId("learn-deck-list-header")).toContainText("Aktive Stapel");
  await expect(page.getByRole("button", { name: "Lernen öffnen" })).toHaveCount(0);
  await expect(page.getByTestId("deck-summary-header")).toContainText("StapelNeuIn ArbeitFällig");
  await expect(metric(rootRow, "new").locator("dt")).toHaveClass(/sr-only/);
  await expect(metric(rootRow, "in-progress").locator("dt")).toHaveClass(/sr-only/);
  await expect(metric(rootRow, "due").locator("dt")).toHaveClass(/sr-only/);
  await expect(rootRow.getByLabel(/Prozent/)).toBeVisible();
  await expect(europeRow.locator('[data-deck-drag-source="true"]')).toHaveCount(1);
  await expect(europeRow.getByRole("button", { name: "Welt-Hauptstädte / Europa lernen" })).toBeVisible();
  await expect(europeRow.getByRole("button", { name: /^Lernen$/ })).toHaveCount(0);

  await page.getByTestId("learn-deck-create-toggle").click();
  const parentSelect = page.getByTestId("learn-deck-parent-select");
  await parentSelect.click();
  const parentSearch = page.getByRole("textbox", { name: "Stapel suchen" });
  await expect(parentSearch).toBeVisible();
  await expect(parentSearch).toBeFocused();
  await parentSearch.fill("Europa");
  await expectDeckOptionUsesFullWidth(page.getByRole("option", { name: "Als Hauptstapel", exact: true }));
  await expect(page.getByRole("option", { name: "Welt-Hauptstädte / Europa", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Welt-Hauptstädte", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Suche leeren" }).click();
  await expect(page.getByRole("option", { name: "Als Hauptstapel", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Welt-Hauptstädte", exact: true }).locator('[data-deck-icon="true"]')).toHaveCount(1);
  const europeParentOption = page.getByRole("option", { name: "Welt-Hauptstädte / Europa", exact: true });
  await expect(europeParentOption).toHaveAttribute("data-deck-depth", "1");
  await europeParentOption.click();
  await expect(parentSelect).toContainText("Welt-Hauptstädte / Europa");
  await page.getByTestId("learn-deck-create-toggle").click();

  await rootRow.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte ausblenden" }).click();
  await expect(europeRow).toBeHidden();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
  await rootRow.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte anzeigen" }).click();

  await europeRow.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Europa" }).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.europe}`).getByRole("button", { name: "Einstellungen" }).click();
  await expect(page.getByTestId(`deck-settings-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.europe}&returnView=learn$`));
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  await expect(europeRow).toBeVisible();

  await europeRow.getByRole("button", { name: "Welt-Hauptstädte / Europa lernen" }).press("Enter");
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(europeRow).toBeVisible();
});

test("deck presentation toolbar saves name, icon and color together", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Europa" }).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.europe}`).getByRole("button", { name: "Einstellungen" }).click();

  const original = await storedDeckPresentation(page, DECK_IDS.europe);
  const iconTrigger = page.getByRole("button", { name: "Icon auswählen" });
  const colorTrigger = page.getByRole("button", { name: "Farbe auswählen" });
  const titleIcon = page.getByTestId("deck-settings-title-icon");
  const renameButton = page.getByRole("button", { name: "Stapel umbenennen" });
  await expect(iconTrigger).toHaveCSS("width", "44px");
  await expect(iconTrigger).toHaveCSS("height", "44px");
  await expect(colorTrigger).toHaveCSS("width", "44px");
  await expect(colorTrigger).toHaveCSS("height", "44px");
  await expect(titleIcon).toBeVisible();
  await expect(renameButton).toHaveCSS("width", "44px");
  await expect(renameButton).toHaveCSS("height", "44px");
  await expect(renameButton).toHaveCSS("border-top-width", "0px");
  await renameButton.focus();
  const renameTooltip = page.getByRole("tooltip");
  await expect(renameTooltip).toHaveText("Stapel umbenennen");
  const renameTooltipIcon = renameTooltip.locator('[data-core-tooltip-deck-appearance="true"]');
  await expect(renameTooltipIcon).toHaveCSS("width", "16px");
  await expect(renameTooltipIcon).toHaveCSS("height", "16px");
  await expect.poll(async () => renameTooltipIcon.evaluate((icon) => getComputedStyle(icon).color))
    .toBe(await titleIcon.evaluate((icon) => getComputedStyle(icon).color));
  await page.keyboard.press("Escape");

  await iconTrigger.click();
  const iconGrid = page.getByTestId("deck-icon-grid");
  await expect(iconGrid.locator("button[data-icon-key]")).toHaveCount(25);
  await expect.poll(() => iconGrid.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length)).toBe(5);
  await iconGrid.getByRole("button", { name: "Gehirn" }).click();
  await expect(titleIcon.locator("svg")).toHaveClass(/lucide-brain/);
  expect((await storedDeckPresentation(page, DECK_IDS.europe)).iconKey).toBe(original.iconKey);

  await renameButton.click();
  const nameInput = page.getByRole("textbox", { name: "Stapelname" });
  await expect(nameInput).toHaveValue(original.name ?? "");
  await nameInput.fill("Nicht speichern");
  await nameInput.press("Escape");
  await expect(nameInput).toBeHidden();
  await expect(renameButton).toBeFocused();
  await renameButton.click();
  await nameInput.fill("   ");
  await nameInput.press("Enter");
  const validationFeedback = page.getByRole("alert");
  await expect(validationFeedback).toHaveText("Bitte gib einen Stapelnamen ein.");
  const validationToolbarBox = await page.getByTestId("deck-settings-appearance-toolbar").boundingBox();
  const validationFeedbackBox = await validationFeedback.boundingBox();
  expect(validationToolbarBox).not.toBeNull();
  expect(validationFeedbackBox).not.toBeNull();
  expect(validationFeedbackBox!.y).toBeGreaterThanOrEqual(validationToolbarBox!.y + validationToolbarBox!.height);
  await nameInput.fill("Europa kompakt");
  await expect(validationFeedback).toBeHidden();
  expect((await storedDeckPresentation(page, DECK_IDS.europe)).name).toBe(original.name);

  await colorTrigger.click();
  const wheel = page.getByRole("slider", { name: /Farbkreis/ });
  await expect(wheel).toBeVisible();
  await wheel.click({ position: { x: 185, y: 96 } });
  const pointerPreview = await colorTrigger.locator("span").evaluate((swatch) => getComputedStyle(swatch).backgroundColor);
  await wheel.press("ArrowRight");
  await expect.poll(() => colorTrigger.locator("span").evaluate((swatch) => getComputedStyle(swatch).backgroundColor)).not.toBe(pointerPreview);
  await expect.poll(async () => {
    const [titleBorderColor, swatchColor] = await Promise.all([
      titleIcon.evaluate((icon) => getComputedStyle(icon).borderColor),
      colorTrigger.locator("span").evaluate((swatch) => getComputedStyle(swatch).backgroundColor),
    ]);
    return titleBorderColor === swatchColor;
  }).toBe(true);
  expect((await storedDeckPresentation(page, DECK_IDS.europe)).iconColor).toBe(original.iconColor);

  await page.keyboard.press("Escape");
  await expect(wheel).toBeHidden();
  await nameInput.press("Enter");
  await expect(nameInput).toBeHidden();
  const successToast = page.getByRole("status").filter({ hasText: "Stapeleinstellungen wurden erfolgreich gespeichert." });
  await expect(successToast).toContainText("Stapeleinstellungen wurden erfolgreich gespeichert.");
  await expect(page.getByTestId("deck-settings-title-name")).toHaveText("Europa kompakt");
  await expect(page.getByTestId("deck-settings-title-name")).toHaveCount(1);
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 820, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("deck-settings-title-icon")).toBeVisible();
    await expect(page.getByTestId("deck-settings-title-name")).toBeVisible();
    await expect(renameButton).toBeVisible();
    await expect(page.getByTestId("deck-settings-appearance-toolbar")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect.poll(() => storedDeckPresentation(page, DECK_IDS.europe)).toMatchObject({
    name: "Europa kompakt",
    iconKey: "brain",
  });
  const saved = await storedDeckPresentation(page, DECK_IDS.europe);
  expect(saved.iconColor).not.toBe(original.iconColor);

  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  await expect(europeRow).toContainText("Europa kompakt");
  await expect(europeRow.locator("span[style*='border-color']").first()).toHaveAttribute("style", new RegExp(`border-color:${saved.iconColor}`));
  await page.reload();
  await expect.poll(() => storedDeckPresentation(page, DECK_IDS.europe)).toEqual(saved);
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("Europa kompakt");
});

test("learning drag-and-drop handles child, root, no-op and invalid targets without starting study", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();

  const rootRow = page.getByTestId(`learn-deck-row-${DECK_IDS.root}`);
  const africaRow = page.getByTestId(`learn-deck-row-${DECK_IDS.africa}`);
  const antarcticaRow = page.getByTestId(`learn-deck-row-${DECK_IDS.antarctica}`);
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  const southAmericaRow = page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`);
  const europeDueBefore = await metricValue(europeRow, "due");
  const southAmericaDueBefore = await metricValue(southAmericaRow, "due");

  await dispatchDeckDrop(page, southAmericaRow, europeRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);
  await expect.poll(() => metricValue(europeRow, "due")).toBe(europeDueBefore + southAmericaDueBefore);
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);

  await dispatchDeckDrop(page, africaRow, southAmericaRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.africa)).toBe(DECK_IDS.southAmerica);

  await dispatchDeckDrop(page, antarcticaRow, africaRow);
  await expect(page.getByRole("status")).toContainText("Maximal vier Stapel-Ebenen sind möglich.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.antarctica)).toBe(DECK_IDS.root);

  await dispatchTopLevelDrop(page, southAmericaRow, "learn-top-drop-zone");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(null);
  await expect.poll(() => metricValue(europeRow, "due")).toBe(europeDueBefore);

  await dispatchTopLevelDrop(page, southAmericaRow, "learn-top-drop-zone");
  await expect(page.getByRole("status")).toContainText("Stapel bleibt an dieser Stelle.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(null);

  await dispatchDeckDrop(page, rootRow, europeRow);
  await expect(page.getByRole("status")).toContainText("Ein Stapel kann nicht in sich selbst oder einen eigenen Unterstapel verschoben werden.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.root)).toBe(null);
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
});

test("deck management disables direct drag and shares the confirmed keyboard move", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Karten verwalten" }).click();

  const rootRow = page.getByTestId(`deck-header-${DECK_IDS.root}`);
  const southAmericaRow = page.getByTestId(`deck-header-${DECK_IDS.southAmerica}`);
  await expect(rootRow.getByLabel(/Prozent/)).toBeVisible();
  await expect(rootRow.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte" })).toBeVisible();
  await expect(page.locator('[data-deck-drag-source="true"]')).toHaveCount(0);
  await expect(page.getByTestId("manage-top-drop-zone")).toHaveCount(0);

  const originalParentDeckId = await storedParentDeckId(page, DECK_IDS.southAmerica);
  await page.setViewportSize({ width: 390, height: 600 });
  await page.getByTestId(`deck-options-${DECK_IDS.southAmerica}`).press("Enter");
  const moveButton = page.getByTestId(`deck-options-menu-${DECK_IDS.southAmerica}`).getByTestId(`deck-move-button-${DECK_IDS.southAmerica}`);
  await moveButton.press("Enter");
  const moveDialog = page.getByRole("dialog", { name: "Stapel verschieben" });
  await expect(moveDialog).not.toContainText("Neuer übergeordneter Stapel");
  await expect(moveDialog).not.toContainText("Maximal 4 Ebenen");
  const moveSelect = page.getByRole("combobox", { name: "Ziel für Südamerika" });
  await moveSelect.click();
  await expect(page.getByRole("option", { name: "Hauptebene", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /Südamerika$/ })).toHaveCount(0);
  const selectContent = page.locator('[data-deck-select-content="true"]');
  const selectViewport = page.locator('[data-deck-select-viewport="true"]');
  const selectBounds = await selectContent.boundingBox();
  expect(selectBounds).not.toBeNull();
  expect(selectBounds!.y).toBeGreaterThanOrEqual(0);
  expect(selectBounds!.y + selectBounds!.height).toBeLessThanOrEqual(601);
  expect(await selectViewport.evaluate((viewport) => viewport.scrollHeight > viewport.clientHeight)).toBe(true);
  await expect.poll(() => selectViewport.evaluate((viewport) => getComputedStyle(viewport).overflowY)).toBe("auto");
  await expect(page.getByRole("textbox", { name: "Stapel suchen" })).toHaveCount(0);
  const europeMoveOption = page.getByRole("option", { name: /Europa$/ });
  await europeMoveOption.click();
  await page.getByTestId("action-dialog-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(moveDialog).toBeHidden();
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(originalParentDeckId);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId(`deck-options-${DECK_IDS.southAmerica}`).press("Enter");
  await moveButton.press("Enter");
  await moveSelect.click();
  await europeMoveOption.scrollIntoViewIfNeeded();
  await expect(europeMoveOption.locator('[data-deck-icon="true"]')).toHaveCount(1);
  await expect.poll(() => europeMoveOption.evaluate((option) => {
    const bounds = option.getBoundingClientRect();
    const topElement = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return topElement != null && option.contains(topElement);
  })).toBe(true);
  await europeMoveOption.click();
  await page.getByRole("button", { name: "Verschieben bestätigen" }).press("Enter");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);

  await page.getByTestId(`deck-options-${DECK_IDS.southAmerica}`).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.southAmerica}`).getByRole("button", { name: "Einstellungen" }).click();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.southAmerica}&returnView=decks$`));
  await page.getByRole("button", { name: "Zurück zur Kartenverwaltung" }).press("Enter");
  await expect(page.getByTestId(`deck-options-${DECK_IDS.southAmerica}`)).toBeVisible();
});

test("three-dot actions share the local-name tooltip across dashboard, learning and deck management", async ({ page }) => {
  await resetToFreshLocalState(page);

  const tooltip = page.getByRole("tooltip");
  const dashboardOptions = page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" });
  await dashboardOptions.focus();
  await expect(tooltip).toHaveText("Stapeloptionen für Afrika");
  await expect(tooltip.locator('[data-core-tooltip-deck-appearance="true"]')).toBeVisible();
  await page.keyboard.press("Escape");

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  const learningOptions = page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" });
  await expect(learningOptions).not.toHaveAttribute("title");
  await learningOptions.focus();
  await expect(tooltip).toHaveText("Stapeloptionen für Afrika");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await learningOptions.click();
  const learningMenu = page.getByTestId(`deck-options-menu-${DECK_IDS.africa}`);
  await expect(learningMenu.getByText("Afrika", { exact: true })).toBeVisible();
  await expect(learningMenu).not.toContainText("Welt-Hauptstädte / Afrika");
  await page.keyboard.press("Escape");

  await mainMenu(page).getByRole("button", { name: "Kartenverwaltung" }).click();
  const managementOptions = page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" });
  await expect(managementOptions).not.toHaveAttribute("title");
  await managementOptions.focus();
  await expect(tooltip).toHaveText("Stapeloptionen für Afrika");
  await page.keyboard.press("Escape");
  await managementOptions.click();
  const managementMenu = page.getByTestId(`deck-options-menu-${DECK_IDS.africa}`);
  await expect(managementMenu.getByText("Afrika", { exact: true })).toBeVisible();
  await expect(managementMenu).not.toContainText("Welt-Hauptstädte / Afrika");
});
