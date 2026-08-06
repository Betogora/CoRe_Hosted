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

function metric(row: Locator, name: "new" | "due" | "total") {
  return row.locator(`[data-deck-count="${name}"]`);
}

test("dashboard shows the full shared tree, donut and direct drag-and-drop", async ({ page }) => {
  await resetToFreshLocalState(page);

  const rootRow = page.getByTestId(`dashboard-deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`dashboard-deck-row-${DECK_IDS.europe}`);
  const southAmericaRow = page.getByTestId(`dashboard-deck-row-${DECK_IDS.southAmerica}`);
  await expect(rootRow).toBeVisible();
  await expect(europeRow).toBeVisible();
  await expect(metric(rootRow, "new")).toContainText("Neu");
  await expect(metric(rootRow, "due")).toContainText("Fällig");
  await expect(metric(rootRow, "total")).toContainText("Gesamt");
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

test("learning rows activate directly while expand and settings remain independent", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();

  const rootRow = page.getByTestId(`learn-deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  await expect(page.getByTestId("learn-deck-list-header")).toContainText("Aktive Stapel");
  await expect(page.getByRole("button", { name: "Lernen öffnen" })).toHaveCount(0);
  await expect(metric(rootRow, "new")).toContainText("Neu");
  await expect(metric(rootRow, "due")).toContainText("Fällig");
  await expect(metric(rootRow, "total")).toContainText("Gesamt");
  await expect(rootRow.getByLabel(/Prozent/)).toBeVisible();
  await expect(europeRow.locator('[data-deck-drag-source="true"]')).toHaveCount(1);
  await expect(europeRow.getByRole("button", { name: "Welt-Hauptstädte / Europa lernen" })).toBeVisible();
  await expect(europeRow.getByRole("button", { name: /^Lernen$/ })).toHaveCount(0);

  await page.getByTestId("learn-deck-create-toggle").click();
  const parentSelect = page.getByTestId("learn-deck-parent-select");
  await parentSelect.click();
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
  await expect(metric(europeRow, "total")).toContainText("53");

  await dispatchDeckDrop(page, southAmericaRow, europeRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);
  await expect(metric(europeRow, "total")).toContainText("67");
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);

  await dispatchDeckDrop(page, africaRow, southAmericaRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.africa)).toBe(DECK_IDS.southAmerica);

  await dispatchDeckDrop(page, antarcticaRow, africaRow);
  await expect(page.getByRole("status")).toContainText("Maximal vier Stapel-Ebenen sind möglich.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.antarctica)).toBe(DECK_IDS.root);

  await dispatchTopLevelDrop(page, southAmericaRow, "learn-top-drop-zone");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(null);
  await expect(metric(europeRow, "total")).toContainText("53");

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

  await page.getByTestId(`deck-options-${DECK_IDS.southAmerica}`).press("Enter");
  const moveButton = page.getByTestId(`deck-options-menu-${DECK_IDS.southAmerica}`).getByTestId(`deck-move-button-${DECK_IDS.southAmerica}`);
  await moveButton.press("Enter");
  const moveSelect = page.getByRole("combobox", { name: "Ziel für Südamerika" });
  await moveSelect.click();
  await expect(page.getByRole("option", { name: "Hauptebene", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /Südamerika$/ })).toHaveCount(0);
  const europeMoveOption = page.getByRole("option", { name: /Europa$/ });
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

test("three-dot actions share the path tooltip across learning and deck management", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();

  const tooltip = page.getByRole("tooltip");
  const learningOptions = page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" });
  await expect(learningOptions).not.toHaveAttribute("title");
  await learningOptions.focus();
  await expect(tooltip).toHaveText("Stapeloptionen für Welt-Hauptstädte / Afrika");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);

  await mainMenu(page).getByRole("button", { name: "Kartenverwaltung" }).click();
  const managementOptions = page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Afrika" });
  await expect(managementOptions).not.toHaveAttribute("title");
  await managementOptions.focus();
  await expect(tooltip).toHaveText("Stapeloptionen für Welt-Hauptstädte / Afrika");
});
