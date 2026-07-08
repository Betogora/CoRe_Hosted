import { expect, test } from "@playwright/test";

const DECK_IDS = {
  root: "deck_world_capitals",
  africa: "deck_world_capitals_afrika",
  antarctica: "deck_world_capitals_antarktis",
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

async function hasStoredAppState(page) {
  return page.evaluate(() => localStorage.getItem("core.appState.v2") !== null);
}

async function groupBackgroundColor(group) {
  return group.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function rgbLuminance(color) {
  const [red = 0, green = 0, blue = 0] = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function firstDirectChildGroupGap(rootGroup) {
  return rootGroup.evaluate((root) => {
    const childrenRoot = root.querySelector(':scope > [data-learn-deck-children="true"]');
    const groups = [...(childrenRoot?.querySelectorAll(':scope > [data-learn-deck-group="true"]') ?? [])];
    if (groups.length < 2) return 0;

    const firstRect = groups[0].getBoundingClientRect();
    const secondRect = groups[1].getBoundingClientRect();
    return secondRect.top - firstRect.bottom;
  });
}

async function firstGroupHeaderGap(page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-testid="learn-deck-list-header"]');
    const firstGroup = document.querySelector('[data-testid="learn-deck-tree"] > [data-learn-deck-group="true"]');
    if (!header || !firstGroup) return 0;

    return firstGroup.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
  });
}

async function visibleRowText(row) {
  return row.evaluate((element) => element.innerText.replace(/\s+/g, " ").trim());
}

async function countCellRightEdges(row) {
  return row.evaluate((element) => {
    const edges = {};
    for (const metric of ["new", "due", "total"]) {
      const cell = element.querySelector(`[data-learn-count-cell="${metric}"]`);
      edges[metric] = cell?.getBoundingClientRect().right ?? 0;
    }
    return edges;
  });
}

async function rowPoint(page, deckId, placement = "content") {
  const row = page.getByTestId(`learn-deck-row-${deckId}`);
  const box = await row.boundingBox();
  if (!box) throw new Error(`Missing deck row ${deckId}`);
  return {
    x: placement === "outdent" ? 4 : Math.min(260, box.width - 12),
    y: box.height / 2,
  };
}

async function dragLearnDeckToDeck(page, sourceDeckId, targetDeckId) {
  const targetPoint = await rowPoint(page, targetDeckId, "content");
  await page.getByTestId(`learn-deck-row-${sourceDeckId}`).dragTo(page.getByTestId(`learn-deck-row-${targetDeckId}`), {
    targetPosition: targetPoint,
  });
}

async function dragLearnDeckToRowOutdent(page, sourceDeckId, targetDeckId) {
  const targetPoint = await rowPoint(page, targetDeckId, "outdent");
  await page.getByTestId(`learn-deck-row-${sourceDeckId}`).dragTo(page.getByTestId(`learn-deck-row-${targetDeckId}`), {
    targetPosition: targetPoint,
  });
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

  const rootGroup = page.getByTestId(`learn-deck-group-${DECK_IDS.root}`);
  const africaGroup = rootGroup.getByTestId(`learn-deck-group-${DECK_IDS.africa}`);
  await expect(rootGroup).toBeVisible();
  await expect(africaGroup).toBeVisible();
  await expect(rootGroup.getByTestId(`learn-deck-group-${DECK_IDS.antarctica}`)).toBeVisible();
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
    expect(Math.abs(rootCountEdges[metric] - europeCountEdges[metric])).toBeLessThanOrEqual(2);
  }
  await expect(europeRow.getByRole("button", { name: /^Lernen$/ })).toHaveCount(0);
  await expectControlDoesNotStartDrag(page, rootRow.getByRole("button", { name: "Unterstapel ausblenden" }));
  await expectControlDoesNotStartDrag(page, europeRow.getByRole("button", { name: "Stapel verwalten" }));
  await europeRow.getByRole("button", { name: "Stapel verwalten" }).click();
  await expect(page.getByTestId(`deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page.getByTestId(`deck-row-${DECK_IDS.europe}`)).toHaveClass(/ring-2/);
  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();

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

test("world capitals learn rows start study mode directly", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();
  const europeRow = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`);

  await europeRow.click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(europeRow).toBeVisible();
});

test("deck management does not expose the old drag handle or drop target", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();

  await expect(page.getByTestId(`deck-row-${DECK_IDS.root}`)).toBeVisible();
  await expect(page.getByTestId("deck-top-drop-zone")).toHaveCount(0);
  await expect(page.getByTestId(`deck-drag-handle-${DECK_IDS.root}`)).toHaveCount(0);

  const dataTransfer = await page.evaluateHandle((sourceDeckId) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", sourceDeckId);
    return transfer;
  }, DECK_IDS.southAmerica);

  await page.getByTestId(`deck-row-${DECK_IDS.europe}`).dispatchEvent("dragover", { dataTransfer });
  await page.getByTestId(`deck-row-${DECK_IDS.europe}`).dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();

  await expect.poll(() => hasStoredAppState(page)).toBe(false);
});
