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

async function storedParentDeckId(page, deckId) {
  return page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem("core.appState.v2") ?? "{}");
    return state.decks?.find((deck) => deck.id === id)?.parentDeckId ?? null;
  }, deckId);
}

async function rowPoint(page, deckId, placement = "content") {
  const row = page.getByTestId(`learn-deck-row-${deckId}`);
  const box = await row.boundingBox();
  if (!box) throw new Error(`Missing deck row ${deckId}`);
  return {
    x: placement === "outdent" ? box.x + 4 : box.x + Math.min(260, box.width - 12),
    y: box.y + box.height / 2,
  };
}

async function dragLearnDeckToDeck(page, sourceDeckId, targetDeckId) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const targetPoint = await rowPoint(page, targetDeckId, "content");
  await page.getByTestId(`learn-deck-row-${sourceDeckId}`).dispatchEvent("dragstart", { dataTransfer });
  await expect.poll(() => dataTransfer.evaluate((transfer) => transfer.getData("text/plain"))).toBe(sourceDeckId);
  await page.getByTestId(`learn-deck-row-${targetDeckId}`).dispatchEvent("dragover", { dataTransfer, clientX: targetPoint.x, clientY: targetPoint.y });
  await page.getByTestId(`learn-deck-row-${targetDeckId}`).dispatchEvent("drop", { dataTransfer, clientX: targetPoint.x, clientY: targetPoint.y });
  await page.getByTestId(`learn-deck-row-${sourceDeckId}`).dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function dragLearnDeckToRowOutdent(page, sourceDeckId, targetDeckId) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const targetPoint = await rowPoint(page, targetDeckId, "outdent");
  await page.getByTestId(`learn-deck-row-${sourceDeckId}`).dispatchEvent("dragstart", { dataTransfer });
  await expect.poll(() => dataTransfer.evaluate((transfer) => transfer.getData("text/plain"))).toBe(sourceDeckId);
  await page.getByTestId(`learn-deck-row-${targetDeckId}`).dispatchEvent("dragover", { dataTransfer, clientX: targetPoint.x, clientY: targetPoint.y });
  await page.getByTestId(`learn-deck-row-${targetDeckId}`).dispatchEvent("drop", { dataTransfer, clientX: targetPoint.x, clientY: targetPoint.y });
  await page.getByTestId(`learn-deck-row-${sourceDeckId}`).dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function expectControlDoesNotStartDrag(page, control) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await control.dispatchEvent("dragstart", { dataTransfer });
  await expect.poll(() => dataTransfer.evaluate((transfer) => transfer.getData("text/plain"))).toBe("");
  await dataTransfer.dispose();
}

test("world capitals learn list supports Anki-like direct drag-and-drop reparenting", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("Welt-Hauptstädte");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("245");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("Europa");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("53");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`)).toContainText("Südamerika");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`)).toContainText("14");

  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  await expectControlDoesNotStartDrag(page, europeRow.getByRole("button", { name: "Lernen" }));
  await expectControlDoesNotStartDrag(page, europeRow.getByRole("button", { name: "Stapeloptionen" }));
  await europeRow.getByRole("button", { name: "Stapeloptionen" }).click();
  await expect(page.getByRole("menuitem", { name: "Stapel verwalten" })).toBeVisible();
  await europeRow.getByRole("button", { name: "Stapeloptionen" }).click();

  await dragLearnDeckToDeck(page, DECK_IDS.southAmerica, DECK_IDS.europe);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.europe);
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("67");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("1 Unterstapel");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("245");

  await dragLearnDeckToRowOutdent(page, DECK_IDS.southAmerica, DECK_IDS.europe);
  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(DECK_IDS.root);
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("53");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("245");
});
