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

async function storedIconColor(page: Page, deckId: string) {
  const state = await readActiveAccountState(page);
  return state.decks?.find((deck: { id: string; deckSettings?: { appearance?: { iconColor?: string } } }) => deck.id === deckId)?.deckSettings?.appearance?.iconColor ?? null;
}

async function dispatchDeckDrop(source: Locator, target: Locator) {
  await source.locator('[data-deck-drag-source="true"]').dragTo(target);
}

async function dispatchTopLevelDrop(page: Page, source: Locator, dropZoneTestId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const dragSource = source.locator('[data-deck-drag-source="true"]');
  await dragSource.dispatchEvent("dragstart", { dataTransfer });
  const dropZone = page.getByTestId(dropZoneTestId);
  await expect(dropZone).toBeVisible();
  await dropZone.dispatchEvent("dragover", { dataTransfer });
  await dropZone.dispatchEvent("drop", { dataTransfer });
  await dragSource.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
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
  await expect(southAmericaRow.locator('[data-deck-drag-source="true"]')).toHaveAttribute("draggable", "true");

  await rootRow.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte" }).click();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.root}&returnView=today$`));
  await page.getByRole("button", { name: "Zurück zur Übersicht" }).click();
  await expect(rootRow).toBeVisible();

  await dispatchDeckDrop(southAmericaRow, europeRow);
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
  await expect(page.getByTestId("learn-deck-list-header")).toHaveCount(0);
  await expect(metric(rootRow, "new")).toContainText("Neu");
  await expect(metric(rootRow, "due")).toContainText("Fällig");
  await expect(metric(rootRow, "total")).toContainText("Gesamt");
  await expect(rootRow.getByLabel(/Prozent/)).toBeVisible();
  await expect(europeRow.locator('[data-deck-drag-source="true"]')).toHaveAttribute("draggable", "true");
  await expect(europeRow.getByRole("button", { name: "Welt-Hauptstädte / Europa lernen" })).toBeVisible();
  await expect(europeRow.getByRole("button", { name: /^Lernen$/ })).toHaveCount(0);

  await rootRow.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte ausblenden" }).click();
  await expect(europeRow).toBeHidden();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
  await rootRow.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte anzeigen" }).click();

  await europeRow.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Europa" }).click();
  await expect(page.getByTestId(`deck-settings-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.europe}&returnView=learn$`));
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  await expect(europeRow).toBeVisible();

  await europeRow.getByRole("button", { name: "Welt-Hauptstädte / Europa lernen" }).press("Enter");
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(europeRow).toBeVisible();
});

test("deck color wheel previews locally and persists only through the appearance form", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte / Europa" }).click();

  const originalColor = await storedIconColor(page, DECK_IDS.europe);
  const colorTrigger = page.getByRole("button", { name: "Iconfarbe auswählen" });
  await expect(colorTrigger).toHaveCSS("width", "44px");
  await expect(colorTrigger).toHaveCSS("height", "44px");

  await colorTrigger.click();
  const wheel = page.getByRole("slider", { name: /Farbkreis/ });
  await expect(wheel).toBeVisible();
  await wheel.click({ position: { x: 185, y: 96 } });
  const pointerPreview = await colorTrigger.locator("span").evaluate((swatch) => getComputedStyle(swatch).backgroundColor);
  await wheel.press("ArrowRight");
  await expect.poll(() => colorTrigger.locator("span").evaluate((swatch) => getComputedStyle(swatch).backgroundColor)).not.toBe(pointerPreview);
  expect(await storedIconColor(page, DECK_IDS.europe)).toBe(originalColor);

  await page.keyboard.press("Escape");
  await expect(wheel).toBeHidden();
  await colorTrigger.click();
  await expect(wheel).toBeVisible();
  await page.getByText("Nur dieser Stapel").click();
  await expect(wheel).toBeHidden();

  await page.getByRole("button", { name: "Darstellung speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Stapeldarstellung gespeichert.");
  await expect.poll(() => storedIconColor(page, DECK_IDS.europe)).not.toBe(originalColor);
  const savedColor = await storedIconColor(page, DECK_IDS.europe);

  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  await expect(europeRow.locator("span[style*='border-color']").first()).toHaveAttribute("style", new RegExp(`border-color:${savedColor}`));
  await page.reload();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).locator("span[style*='border-color']").first()).toHaveAttribute("style", new RegExp(`border-color:${savedColor}`));
});

test("learning drag-and-drop handles child, root, no-op and invalid targets without starting study", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();

  const rootRow = page.getByTestId(`learn-deck-row-${DECK_IDS.root}`);
  const africaRow = page.getByTestId(`learn-deck-row-${DECK_IDS.africa}`);
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  const southAmericaRow = page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`);
  await expect(metric(europeRow, "total")).toContainText("53");

  await dispatchDeckDrop(southAmericaRow, europeRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);
  await expect(metric(europeRow, "total")).toContainText("67");
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);

  await dispatchDeckDrop(africaRow, southAmericaRow);
  await expect(page.getByRole("status")).toContainText("Maximal drei Stapel-Ebenen sind möglich.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.africa)).toBe(DECK_IDS.root);

  await dispatchTopLevelDrop(page, southAmericaRow, "learn-top-drop-zone");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(null);
  await expect(metric(europeRow, "total")).toContainText("53");

  await dispatchTopLevelDrop(page, southAmericaRow, "learn-top-drop-zone");
  await expect(page.getByRole("status")).toContainText("Stapel bleibt an dieser Stelle.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(null);

  await dispatchDeckDrop(rootRow, europeRow);
  await expect(page.getByRole("status")).toContainText("Stapel bleibt an dieser Stelle.");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.root)).toBe(null);
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
});

test("deck management reparents directly and preserves explicit keyboard move as fallback", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Karten verwalten" }).click();

  const rootRow = page.getByTestId(`deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`deck-row-${DECK_IDS.europe}`);
  const southAmericaRow = page.getByTestId(`deck-row-${DECK_IDS.southAmerica}`);
  await expect(rootRow.getByLabel(/Prozent/)).toBeVisible();
  await expect(rootRow.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte" })).toBeVisible();
  await expect(southAmericaRow.locator('[data-deck-drag-source="true"]')).toHaveAttribute("draggable", "true");

  await dispatchDeckDrop(southAmericaRow, europeRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);

  await southAmericaRow.getByRole("button", { name: "Welt-Hauptstädte / Europa / Südamerika öffnen" }).press("Enter");
  await expect(page.getByTestId(`deck-actions-${DECK_IDS.southAmerica}`).getByRole("button", { name: "Unterstapel – maximale Stapeltiefe erreicht" })).toBeDisabled();

  await dispatchDeckDrop(southAmericaRow, rootRow);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.root);

  await dispatchTopLevelDrop(page, southAmericaRow, "manage-top-drop-zone");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(null);

  await southAmericaRow.getByRole("button", { name: "Südamerika öffnen" }).press("Enter");
  await expect(page.getByTestId(`deck-actions-${DECK_IDS.southAmerica}`)).toBeVisible();
  await expect(page.getByTestId(`deck-card-list-${DECK_IDS.southAmerica}`)).toBeVisible();
  await expect(page.getByTestId(`deck-card-list-${DECK_IDS.southAmerica}`)).toBeFocused();

  const moveButton = page.getByTestId(`deck-move-button-${DECK_IDS.southAmerica}`);
  await moveButton.press("Enter");
  await page.getByLabel("Ziel für Südamerika").selectOption(DECK_IDS.europe);
  await expect(page.getByTestId(`deck-move-summary-${DECK_IDS.southAmerica}`)).toContainText("unter „Europa“");
  await page.getByRole("button", { name: "Verschieben bestätigen" }).press("Enter");
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);

  await page.getByTestId(`deck-actions-${DECK_IDS.southAmerica}`).getByRole("button", { name: "Einstellungen" }).click();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.southAmerica}&returnView=decks$`));
  await page.getByRole("button", { name: "Zurück zur Kartenverwaltung" }).press("Enter");
  await expect(page.getByTestId(`deck-actions-${DECK_IDS.southAmerica}`)).toBeVisible();
});
