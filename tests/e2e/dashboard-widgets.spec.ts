import { expect, test, type Page } from "@playwright/test";

const sizes = [[320, 720], [360, 800], [390, 844], [430, 932], [1280, 720], [1440, 900]];
const defaults = ["learning", "timer", "decks", "todos", "heatmap"];

async function order(page: Page) {
  return page.locator("[data-dashboard-widget]").evaluateAll((widgets) => widgets.map((widget) => widget.getAttribute("data-dashboard-widget")));
}

async function openEditor(page: Page, dark = false) {
  await page.goto("/docs/ui-elements.html?preview=dashboard#screens");
  if (dark) {
    await page.getByRole("button", { name: "Produktansicht schließen", exact: true }).click();
    await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
    await page.getByRole("button", { name: "Tagesübersicht öffnen", exact: true }).click();
  }
  await page.getByRole("button", { name: "Seite anpassen", exact: true }).click();
}

async function positions(page: Page) {
  await page.locator(".catalog-product-preview").evaluate((product) => {
    const widget = product.querySelector("[data-dashboard-widget]")!;
    product.scrollTop += widget.getBoundingClientRect().top - 120;
  });
  const source = await page.getByRole("button", { name: "Lerntimer verschieben", exact: true }).boundingBox();
  const target = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
  if (!source || !target) throw new Error("Widget-Titelleiste oder Ablageziel fehlt.");
  return { source: { x: source.x + Math.min(40, source.width / 2), y: source.y + source.height / 2 }, target: { x: target.x + target.width / 2, y: target.y + 70 } };
}

async function beginDrag(page: Page) {
  const { source, target } = await positions(page);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await expect(page.getByTestId("dashboard-widget-drag-preview")).toBeVisible();
  const preview = await page.getByTestId("dashboard-widget-drag-preview").boundingBox();
  expect(preview).not.toBeNull();
  expect(preview!.x).toBeGreaterThanOrEqual(0);
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator('[data-dashboard-widget="learning"]')).toHaveAttribute("data-drop-target", "true");
}

for (const [width, height] of sizes) for (const theme of ["light", "dark"]) {
  test(`Widget-Drag ${width}×${height} ${theme}: Vorschau, Drop, Persistenz und Escape`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, theme === "dark");
    await page.screenshot({ path: info.outputPath("01-bearbeiten.png") });
    await beginDrag(page);
    await expect.poll(() => order(page)).toEqual(defaults);
    await page.screenshot({ path: info.outputPath("02-ziehen.png") });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("dashboard-widget-drag-preview")).toHaveCount(0);
    await expect.poll(() => order(page)).toEqual(defaults);
    await expect(page.getByRole("button", { name: "Fertig", exact: true })).toBeVisible();
    await beginDrag(page);
    await page.mouse.move(width - 10, 15);
    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual(defaults);
    await beginDrag(page);
    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual(["timer", "learning", "decks", "todos", "heatmap"]);
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    await page.screenshot({ path: info.outputPath("03-verschoben.png") });
    await page.reload();
    await expect.poll(() => order(page)).toEqual(["timer", "learning", "decks", "todos", "heatmap"]);
    expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  });
}

test("Widget-Drag scrollt den tatsächlichen Inhaltsbereich und Escape verwirft die Geste", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await beginDrag(page);
  const product = page.locator(".catalog-product-preview");
  const before = await product.evaluate((element) => element.scrollTop);
  await page.mouse.move(180, 825);
  await expect.poll(() => product.evaluate((element) => element.scrollTop)).toBeGreaterThan(before + 100);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(defaults);
  await expect(page.getByTestId("dashboard-widget-drag-preview")).toHaveCount(0);
});

test("Touch-Drag übernimmt erst beim Loslassen; touchCancel verwirft die Vorschau", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  const session = await page.context().newCDPSession(page);
  for (const cancel of [true, false]) {
    const { source, target } = await positions(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [source] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [target] });
    await expect(page.getByTestId("dashboard-widget-drag-preview")).toBeVisible();
    await expect.poll(() => order(page)).toEqual(defaults);
    await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
    await expect.poll(() => order(page)).toEqual(cancel ? defaults : ["timer", "learning", "decks", "todos", "heatmap"]);
    await expect(page.getByTestId("dashboard-widget-drag-preview")).toHaveCount(0);
  }
  await session.detach();
});
