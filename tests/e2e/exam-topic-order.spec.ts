import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [[320, 720], [360, 800], [390, 844], [430, 932], [639, 900], [640, 900], [1280, 720], [1440, 900], [720, 450]];
async function topicIds(list: Locator) { return list.locator(":scope > li").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.topicId)); }
async function openDemo(page: Page, dark = false) {
  await page.goto("/docs/ui-elements.html#screens");
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  if (dark) await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
  return page.locator(".catalog-demo").filter({ has: page.getByRole("heading", { name: "Prüfungen · Themenreihenfolge", exact: true }) });
}
async function positionList(page: Page, list: Locator) {
  const search = await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).boundingBox();
  await list.evaluate((element, clearance) => { element.scrollTop = 0; element.scrollIntoView({ block: "start", behavior: "instant" }); window.scrollBy({ top: -clearance, behavior: "instant" }); }, (search ? search.y + search.height : 180) + 24);
}
async function beginDrag(page: Page, list: Locator) {
  await positionList(page, list);
  const handle = await list.locator(":scope > li").first().getByRole("button", { name: /verschieben$/ }).boundingBox();
  const target = await list.locator(":scope > li").nth(1).boundingBox();
  if (!handle || !target) throw new Error("Sortiergriff oder Zielthema fehlt.");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, target.y + target.height - 4, { steps: 8 });
}

for (const [width, height] of viewports) for (const theme of ["light", "dark"]) {
  test(`Themen sortieren ${width}×${height} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const demo = await openDemo(page, theme === "dark"), list = demo.getByRole("list", { name: "Themenreihenfolge", exact: true });
    await expect(list).toBeHidden();
    await demo.screenshot({ path: info.outputPath("01-geschlossen.png") });
    await demo.getByText("Themenreihenfolge ändern", { exact: true }).click();
    await expect(list).toBeVisible();
    const initial = await topicIds(list), swapped = [initial[1], initial[0], ...initial.slice(2)];
    await list.locator(":scope > li").first().getByRole("button", { name: /nach unten$/ }).click();
    await expect.poll(() => topicIds(list)).toEqual(swapped);
    const handle = list.locator(`[data-topic-id="${initial[0]}"]`).getByRole("button", { name: /verschieben$/ });
    await handle.focus(); await handle.press("ArrowUp");
    await expect.poll(() => topicIds(list)).toEqual(initial); await expect(handle).toBeFocused();
    await beginDrag(page, list);
    await expect.poll(() => topicIds(list)).toEqual(swapped);
    await page.screenshot({ path: info.outputPath("02-ziehen.png") });
    await page.mouse.up();
    await expect.poll(() => topicIds(list)).toEqual(swapped);
    await beginDrag(page, list);
    await expect.poll(() => topicIds(list)).toEqual(initial);
    await page.keyboard.press("Escape"); await page.mouse.up();
    await expect.poll(() => topicIds(list)).toEqual(swapped);
    await beginDrag(page, list);
    const bounds = await list.boundingBox(); if (!bounds) throw new Error("Themenliste fehlt.");
    await page.mouse.move(bounds.x + bounds.width + 30, bounds.y + 20); await page.mouse.up();
    await expect.poll(() => topicIds(list)).toEqual(swapped);
    await list.evaluate((element) => { element.scrollTop = 0; });
    await demo.screenshot({ path: info.outputPath("03-geöffnet.png") });
    await demo.getByText("Themenreihenfolge ändern", { exact: true }).click();
    await expect(list).toBeHidden();
    await demo.getByText("Themenreihenfolge ändern", { exact: true }).click();
    await expect.poll(() => topicIds(list)).toEqual(swapped);
    expect(await page.locator("body").evaluate((element) => element.scrollWidth > innerWidth + 1)).toBe(false);
  });
}

test("lange Themenlisten scrollen beim Ziehen bis zum letzten Thema", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const demo = await openDemo(page), list = demo.getByRole("list", { name: "Themenreihenfolge", exact: true });
  await demo.getByText("Themenreihenfolge ändern", { exact: true }).click();
  const initial = await topicIds(list);
  await beginDrag(page, list);
  const rect = await list.boundingBox(); if (!rect) throw new Error("Themenliste fehlt.");
  await page.mouse.move(rect.x + 30, Math.min(rect.y + rect.height - 8, 844 - 50), { steps: 8 });
  await expect.poll(() => list.evaluate((element) => element.scrollTop >= element.scrollHeight - element.clientHeight - 1), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => (await topicIds(list)).at(-1)).toBe(initial[0]);
  await page.mouse.up();
  await expect.poll(() => topicIds(list)).toEqual([...initial.slice(1), initial[0]]);
});

test("Touch verschiebt Themen ebenfalls über den Sortiergriff", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const demo = await openDemo(page), list = demo.getByRole("list", { name: "Themenreihenfolge", exact: true });
  await demo.getByText("Themenreihenfolge ändern", { exact: true }).click();
  await positionList(page, list);
  const initial = await topicIds(list), handle = await list.locator(":scope > li").first().getByRole("button", { name: /verschieben$/ }).boundingBox(), target = await list.locator(":scope > li").nth(1).boundingBox();
  if (!handle || !target) throw new Error("Sortiergriff oder Zielthema fehlt.");
  const session = await page.context().newCDPSession(page), x = handle.x + handle.width / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: handle.y + handle.height / 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: target.y + target.height - 4 }] });
  await expect.poll(() => topicIds(list)).toEqual([initial[1], initial[0], ...initial.slice(2)]);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => topicIds(list)).toEqual([initial[1], initial[0], ...initial.slice(2)]);
  await positionList(page, list);
  const nextHandle = await list.locator(":scope > li").first().getByRole("button", { name: /verschieben$/ }).boundingBox(), nextTarget = await list.locator(":scope > li").nth(1).boundingBox();
  if (!nextHandle || !nextTarget) throw new Error("Sortiergriff oder Zielthema fehlt.");
  const nextX = nextHandle.x + nextHandle.width / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: nextX, y: nextHandle.y + nextHandle.height / 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: nextX, y: nextTarget.y + nextTarget.height - 4 }] });
  await expect.poll(() => topicIds(list)).toEqual(initial);
  await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(() => topicIds(list)).toEqual([initial[1], initial[0], ...initial.slice(2)]);
});
