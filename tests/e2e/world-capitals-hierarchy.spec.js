import { expect, test } from "@playwright/test";

const DECK_IDS = {
  root: "deck_world_capitals",
  europe: "deck_world_capitals_europa",
  southAmerica: "deck_world_capitals_suedamerika",
};

async function resetToFreshLocalState(page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function dragDeckToDeck(page, sourceDeckId, targetDeckId) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.getByTestId(`deck-drag-handle-${sourceDeckId}`).dispatchEvent("dragstart", { dataTransfer });
  await expect.poll(() => dataTransfer.evaluate((transfer) => transfer.getData("text/plain"))).toBe(sourceDeckId);
  await page.getByTestId(`deck-row-${targetDeckId}`).dispatchEvent("dragover", { dataTransfer });
  await page.getByTestId(`deck-row-${targetDeckId}`).dispatchEvent("drop", { dataTransfer });
  await page.getByTestId(`deck-drag-handle-${sourceDeckId}`).dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

test("world capitals seed supports visible subdecks, rename and drag-and-drop reparenting", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("Welt-Hauptstädte");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("245");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("Europa");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("53");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`)).toContainText("Südamerika");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`)).toContainText("14");

  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-rename-button-${DECK_IDS.europe}`).click();
  await page.getByTestId(`deck-rename-input-${DECK_IDS.europe}`).fill("Europa Test");
  await page.getByTestId(`deck-rename-save-${DECK_IDS.europe}`).click();

  await expect(page.getByTestId(`deck-row-${DECK_IDS.europe}`)).toContainText("Europa Test");
  await dragDeckToDeck(page, DECK_IDS.southAmerica, DECK_IDS.europe);

  await expect(page.getByTestId(`deck-row-${DECK_IDS.southAmerica}`)).toContainText("Welt-Hauptstädte / Europa Test / Südamerika");
  await expect(page.getByTestId(`deck-row-${DECK_IDS.europe}`)).toContainText("67");
  await expect(page.getByTestId(`deck-row-${DECK_IDS.root}`)).toContainText("245");
});
