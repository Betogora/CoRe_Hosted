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
  return page.getByRole("navigation", { name: /Hauptmen/ });
}

async function storedParentDeckId(page: Page, deckId: string) {
  const state = await readActiveAccountState(page);
  return state.decks?.find((deck: { id: any; }) => deck.id === deckId)?.parentDeckId ?? null;
}

async function groupBackgroundColor(group: Locator) {
  return group.evaluate((element: Element) => getComputedStyle(element).backgroundColor);
}

function rgbLuminance(color: { match: (arg0: RegExp) => { (): any; new(): any; map: { (arg0: NumberConstructor): never[]; new(): any; }; }; }) {
  const [red = 0, green = 0, blue = 0] = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function firstDirectChildGroupGap(rootGroup: Locator) {
  return rootGroup.evaluate((root: { querySelector: (arg0: string) => any; }) => {
    const childrenRoot = root.querySelector(':scope > [data-learn-deck-children="true"]');
    const groups = [...(childrenRoot?.querySelectorAll(':scope > [data-learn-deck-group="true"]') ?? [])];
    if (groups.length < 2) return 0;

    const firstRect = groups[0].getBoundingClientRect();
    const secondRect = groups[1].getBoundingClientRect();
    return secondRect.top - firstRect.bottom;
  });
}

async function firstGroupHeaderGap(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-testid="learn-deck-list-header"]');
    const firstGroup = document.querySelector('[data-testid="learn-deck-tree"] > [data-learn-deck-group="true"]');
    if (!header || !firstGroup) return 0;

    return firstGroup.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
  });
}

async function visibleRowText(row: Locator) {
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
  return row.evaluate((element: { innerText: string; }) => element.innerText.replace(/\s+/g, " ").trim());
}

async function countCellRightEdges(row: Locator) {
  return row.evaluate((element: { querySelector: (arg0: string) => any; }) => {
    const edges = {};
    for (const metric of ["new", "due", "total"]) {
      const cell = element.querySelector(`[data-learn-count-cell="${metric}"]`);
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
      edges[metric] = cell?.getBoundingClientRect().right ?? 0;
    }
    return edges;
  });
}

async function dispatchDeckDrop(page: { getByTestId: (arg0: string) => any; evaluateHandle: (arg0: (deckId: any) => DataTransfer,arg1: any) => any; }, sourceDeckId: any, targetDeckId: any, placement = "content") {
  const source = page.getByTestId(`learn-deck-row-${sourceDeckId}`);
  const target = page.getByTestId(`learn-deck-row-${targetDeckId}`);
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error(`Missing deck row ${targetDeckId}`);

  const pointerX = placement === "outdent" ? 4 : Math.min(260, targetBox.width - 12);
  const clientX = targetBox.x + pointerX;
  const clientY = targetBox.y + targetBox.height / 2;
  const dataTransfer = await page.evaluateHandle((deckId: string) => {
    const transfer = new DataTransfer();
    transfer.effectAllowed = "move";
    transfer.setData("text/plain", deckId);
    return transfer;
  }, sourceDeckId);

  try {
    await source.dispatchEvent("dragstart", { dataTransfer });
    await target.dispatchEvent("dragover", { dataTransfer, clientX, clientY });
    await target.dispatchEvent("drop", { dataTransfer, clientX, clientY });
    await source.dispatchEvent("dragend", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
}

async function dragLearnDeckToDeck(page: Page, sourceDeckId: string, targetDeckId: string) {
  await dispatchDeckDrop(page, sourceDeckId, targetDeckId);
}

async function dragLearnDeckToRowOutdent(page: Page, sourceDeckId: string, targetDeckId: string) {
  await dispatchDeckDrop(page, sourceDeckId, targetDeckId, "outdent");
}

async function expectControlDoesNotStartDrag(page: Page, control: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await control.dispatchEvent("dragstart", { dataTransfer });
  await expect.poll(() => dataTransfer.evaluate((transfer: { getData: (arg0: string) => any; }) => transfer.getData("text/plain"))).toBe("");
  await dataTransfer.dispose();
}

test("world capitals learn list supports Anki-like direct drag-and-drop reparenting", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("Welt-Hauptstädte");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.root}`)).toContainText("245");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("Europa");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toContainText("53");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`)).toContainText("Südamerika");
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.southAmerica}`)).toContainText("14");

  const rootGroup = page.getByTestId(`learn-deck-group-${DECK_IDS.root}`);
  const africaGroup = rootGroup.getByTestId(`learn-deck-group-${DECK_IDS.africa}`);
  await expect(rootGroup).toBeVisible();
  await expect(africaGroup).toBeVisible();
  await expect(rootGroup.getByTestId(`learn-deck-group-${DECK_IDS.antarctica}`)).toBeVisible();
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
  expect(rgbLuminance(await groupBackgroundColor(rootGroup))).toBeGreaterThan(rgbLuminance(await groupBackgroundColor(africaGroup)));
  await expect.poll(() => firstDirectChildGroupGap(rootGroup)).toBeGreaterThan(0);

  const rootRow = page.getByTestId(`learn-deck-row-${DECK_IDS.root}`);
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);
  await expect(page.getByText("Originale und variantenfokussierte Sessions.")).toHaveCount(0);
  await expect(page.getByTestId("learn-deck-list-header")).toContainText("Neu");
  await expect(page.getByTestId("learn-deck-list-header")).toContainText("Fällig");
  await expect(page.getByTestId("learn-deck-list-header")).toContainText("Gesamt");
  await expect.poll(() => firstGroupHeaderGap(page)).toBeGreaterThanOrEqual(8);
  expect(await visibleRowText(rootRow)).not.toMatch(/\b(Neu|Fällig|Gesamt)\b/);
  expect(await visibleRowText(europeRow)).not.toMatch(/\b(Neu|Fällig|Gesamt)\b/);
  const rootCountEdges = await countCellRightEdges(rootRow);
  const europeCountEdges = await countCellRightEdges(europeRow);
  for (const metric of ["new", "due", "total"]) {
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
    expect(Math.abs(rootCountEdges[metric] - europeCountEdges[metric])).toBeLessThanOrEqual(2);
  }
  await expect(europeRow.getByRole("button", { name: /^Lernen$/ })).toHaveCount(0);
  await expectControlDoesNotStartDrag(page, rootRow.getByRole("button", { name: "Unterstapel ausblenden" }));
  const europeSettingsButton = europeRow.getByRole("button", { name: "Einstellungen für Europa" });
  await expectControlDoesNotStartDrag(page, europeSettingsButton);
  await europeSettingsButton.click();
  await expect(page.getByTestId(`deck-settings-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/stapel-einstellungen\\?deck=${DECK_IDS.europe}$`));
  await expect(page.getByText("Nur dieser Stapel")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Europa", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welt-Hauptstädte", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();

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

test("world capitals learn rows start study mode directly", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);

  await europeRow.click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(europeRow).toBeVisible();
});

test("deck management does not expose the old drag handle or drop target", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();

  await expect(page.getByTestId(`deck-row-${DECK_IDS.root}`)).toBeVisible();
  await expect(page.getByTestId("deck-top-drop-zone")).toHaveCount(0);
  await expect(page.getByTestId(`deck-drag-handle-${DECK_IDS.root}`)).toHaveCount(0);
  const parentDeckIdBefore = await storedParentDeckId(page, DECK_IDS.southAmerica);

  const dataTransfer = await page.evaluateHandle((sourceDeckId: any) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", sourceDeckId);
    return transfer;
  }, DECK_IDS.southAmerica);

  await page.getByTestId(`deck-row-${DECK_IDS.europe}`).dispatchEvent("dragover", { dataTransfer });
  await page.getByTestId(`deck-row-${DECK_IDS.europe}`).dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();

  await expect.poll(() => storedParentDeckId(page, DECK_IDS.southAmerica)).toBe(parentDeckIdBefore);
});
