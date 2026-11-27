import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { matrixThemes, matrixViewports, visualOutput } from "./support/visualMatrix.ts";
import { switchColorScheme } from "./support/navigationMenu.ts";

const sizes = matrixViewports([[320, 720], [360, 800], [390, 844], [430, 932], [639, 900], [640, 900], [999, 900], [1000, 900], [1280, 720], [1440, 900]].map(([width, height]) => ({ width, height })));
const defaults = ["learning", "motivation", "timer", "decks", "todos", "heatmap"];

async function order(page: Page) {
  return page.locator("[data-dashboard-widget]").evaluateAll((widgets) => widgets.map((widget) => widget.getAttribute("data-dashboard-widget")));
}

async function previewOrder(page: Page) {
  return page.locator("[data-dashboard-widget]").evaluateAll((widgets) => [...widgets].sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order)).map((widget) => widget.getAttribute("data-dashboard-widget")));
}

async function openEditor(page: Page, dark = false) {
  await page.goto("/docs/ui-elements.html?preview=dashboard");
  if (dark) {
    await page.getByRole("button", { name: "Produktansicht schließen", exact: true }).click();
    await switchColorScheme(page, "dark");
    await page.getByRole("button", { name: "Tagesübersicht öffnen", exact: true }).click();
  }
  await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
}

async function positions(page: Page) {
  // Chromium can leave a finished CSS transition's `finished` promise unresolved, so poll the play state instead.
  await expect.poll(() => page.locator(".dashboard-widget-grid").evaluate((grid) => grid.getAnimations({ subtree: true }).some((animation) => animation.playState === "running"))).toBe(false);
  const grip = page.getByRole("button", { name: "Lerntimer verschieben", exact: true });
  await grip.scrollIntoViewIfNeeded();
  await grip.hover();
  const source = await grip.boundingBox();
  const target = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
  if (!source || !target) throw new Error("Widget-Titelleiste oder Ablageziel fehlt.");
  return { source: { x: source.x + source.width / 2, y: source.y + source.height / 2 }, target: { x: target.x + target.width / 2, y: target.y + 70 } };
}

async function beginDrag(page: Page) {
  const { source, target: initialTarget } = await positions(page);
  let target = initialTarget;
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  if (target.y < 90) {
    // With six modules the timer can start below the viewport containing the target.
    await page.mouse.move(target.x, 20, { steps: 8 });
    // At the top of the board the target cannot move further down; its drop point then lies below the 64 px edge zone anyway.
    await expect.poll(async () => (await page.locator('[data-dashboard-widget="learning"]').boundingBox())!.y >= 90 || await page.locator(".catalog-product-preview").evaluate((element) => element.scrollTop === 0)).toBe(true);
    const rect = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
    target = { x: rect!.x + rect!.width / 2, y: rect!.y + 70 };
  }
  await page.mouse.move(target.x, target.y, { steps: 10 });
  // Edge autoscroll can still shift the board while the pointer travels; re-aim at the settled target.
  await expect.poll(async () => {
    const rect = (await page.locator('[data-dashboard-widget="learning"]').boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 70, { steps: 2 });
    return page.locator('[data-dashboard-widget="learning"]').getAttribute("data-drop-target");
  }).toBe("true");
  await expect(page.getByTestId("dashboard-widget-drag-preview")).toBeVisible();
  const preview = await page.getByTestId("dashboard-widget-drag-preview").boundingBox();
  expect(preview).not.toBeNull();
  expect(preview!.x).toBeGreaterThanOrEqual(0);
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator('[data-dashboard-widget="learning"]')).toHaveAttribute("data-drop-target", "true");
}

test("Kacheln stehen ab 640 px nebeneinander: zwei Spalten bis 999, drei ab 1000", async ({ page }) => {
  for (const [width, row] of [[640, ["learning", "motivation"]], [999, ["learning", "motivation"]], [1000, ["learning", "motivation", "timer"]]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await openEditor(page);
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    const boxes = await Promise.all(row.map((id) => page.locator(`[data-dashboard-widget="${id}"]`).boundingBox()));
    for (const box of boxes) {
      expect(Math.abs(box!.y - boxes[0]!.y), `${width} px`).toBeLessThan(2);
      expect(Math.abs(box!.height - boxes[0]!.height), `${width} px`).toBeLessThan(2);
    }
  }
});

for (const { width, height } of sizes) for (const theme of matrixThemes) {
  test(`Widget-Drag ${width}×${height} ${theme}: Vorschau, Drop, Persistenz und Escape`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, theme === "dark");
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    if (visualOutput) await page.screenshot({ path: info.outputPath("00-uebersicht.png") });
    await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
    if (visualOutput) await page.screenshot({ path: info.outputPath("01-bearbeiten.png") });
    await beginDrag(page);
    await expect.poll(() => order(page)).toEqual(defaults);
    await expect.poll(async () => (await previewOrder(page))[0]).toBe("timer");
    if (visualOutput) await page.screenshot({ path: info.outputPath("02-ziehen.png") });
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
    await expect.poll(() => order(page)).toEqual(["timer", "learning", "motivation", "decks", "todos", "heatmap"]);
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    if (visualOutput) await page.screenshot({ path: info.outputPath("03-verschoben.png") });
    await page.reload();
    await expect.poll(() => order(page)).toEqual(["timer", "learning", "motivation", "decks", "todos", "heatmap"]);
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
    const { source, target: initialTarget } = await positions(page);
    let target = initialTarget;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [source] });
    if (target.y < 90) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: target.x, y: 20 }] });
      await expect.poll(async () => (await page.locator('[data-dashboard-widget="learning"]').boundingBox())!.y).toBeGreaterThanOrEqual(90);
      const rect = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
      target = { x: rect!.x + rect!.width / 2, y: rect!.y + 70 };
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [target] });
    await expect(page.getByTestId("dashboard-widget-drag-preview")).toBeVisible();
    await expect.poll(() => order(page)).toEqual(defaults);
    await expect.poll(async () => (await previewOrder(page))[0]).toBe("timer");
    await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
    await expect.poll(() => order(page)).toEqual(cancel ? defaults : ["timer", "learning", "motivation", "decks", "todos", "heatmap"]);
    await expect(page.getByTestId("dashboard-widget-drag-preview")).toHaveCount(0);
  }
  await session.detach();
});

test("Feste Formate: Kacheln gleich hoch, Stapel in einer Spalte, To-dos scrollen statt zu wachsen", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  const bounds = () => page.locator("[data-dashboard-widget]").evaluateAll((widgets) => widgets.map((widget) => {
    const rect = widget.getBoundingClientRect();
    return { id: widget.getAttribute("data-dashboard-widget"), top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  }));
  const decks = (await page.locator('[data-dashboard-widget="decks"]').boundingBox())!;
  const todos = page.locator('[data-dashboard-widget="todos"]');
  const todosBox = (await todos.boundingBox())!;
  expect(Math.abs(decks.width - todosBox.width)).toBeLessThan(2);
  expect(Math.abs(decks.height - todosBox.height)).toBeLessThan(2);
  const todosHeight = todosBox.height;
  expect(Math.abs(todosHeight - (await page.locator('[data-dashboard-widget="heatmap"]').boundingBox())!.height)).toBeLessThan(2);
  await page.getByRole("spinbutton", { name: "Minuten", exact: true }).fill("45");
  await expect(page.getByRole("spinbutton", { name: "Minuten", exact: true })).toHaveValue("45");
  await page.getByRole("button", { name: "Neue Aufgabe", exact: true }).click();
  await page.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill("Eigener Test mit langem Aufgabentext ohne Verlust der Tagesaufgaben");
  await page.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Eigener Test mit langem Aufgabentext ohne Verlust der Tagesaufgaben", exact: true })).toBeVisible();
  for (const text of ["Weitere Aufgabe zwei", "Weitere Aufgabe drei", "Weitere Aufgabe vier"]) {
    await page.getByRole("button", { name: "Neue Aufgabe", exact: true }).click();
    await page.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill(text);
    await page.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
  }
  expect(Math.abs((await todos.boundingBox())!.height - todosHeight)).toBeLessThan(2);
  expect(await page.locator(".dashboard-todos-list").evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
  await page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true })).not.toBeChecked();
  await expect.poll(async () => {
    const rects = await bounds();
    return rects.every((a, index) => rects.slice(index + 1).every((b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
  }).toBe(true);
  await page.screenshot({ path: info.outputPath("04-aufgeklappt.png") });
});

test("Gespeicherte Reihenfolge ist sichtbare Reihenfolge: keine Kachel rückt vor den Stapel-Baustein", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await page.getByRole("button", { name: "Lerntimer nach hinten", exact: true }).click();
  await expect.poll(() => order(page)).toEqual(["learning", "motivation", "decks", "timer", "todos", "heatmap"]);
  // Poll past the 180 ms FLIP transform, which bounding boxes include.
  await expect.poll(async () => {
    const decks = (await page.locator('[data-dashboard-widget="decks"]').boundingBox())!;
    const timer = (await page.locator('[data-dashboard-widget="timer"]').boundingBox())!;
    return timer.y > decks.y + decks.height;
  }).toBe(true);
});

test("Widgetoptionen erhalten Pfeile und Entfernen ohne Größenwahl; abgebrochener Drag bleibt ungespeichert", async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 844 });
  await openEditor(page);
  await beginDrag(page);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(defaults);
  await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
  await page.screenshot({ path: info.outputPath("05-widgetmenue.png") });
  await page.getByRole("button", { name: "Lerntimer nach vorne", exact: true }).click();
  await expect.poll(() => order(page)).toEqual(["learning", "timer", "motivation", "decks", "todos", "heatmap"]);
  await expect(page.getByRole("button", { name: /Größe ändern/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Lerntimer entfernen", exact: true }).click();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveCount(0);
  await expect(page.locator(".dashboard-widget-miniature")).not.toHaveCount(6);
  await page.getByRole("button", { name: "Weitere Widgets", exact: true }).click();
  await expect(page.locator(".dashboard-widget-miniature")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Weniger Widgets", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: info.outputPath("05b-widgetmenue-ausgeklappt.png") });
  const tile = page.getByRole("button", { name: "Lerntimer", exact: true });
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await tile.click();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveCount(1);
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await tile.click();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Standardlayout", exact: true }).click();
  await expect.poll(() => order(page)).toEqual(defaults);
});

test("Timer: Minuten, Dauern, Mausrad, Pause und Fortsetzen", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  const timer = page.locator('[data-dashboard-widget="timer"]');
  const minutes = timer.getByRole("spinbutton", { name: "Minuten", exact: true });
  await expect(timer.getByRole("button", { name: "25 Minuten", exact: true })).toHaveAttribute("aria-pressed", "true");
  await timer.getByRole("button", { name: "50 Minuten", exact: true }).click();
  await expect(minutes).toHaveValue("50");
  await timer.getByRole("button", { name: "Dauer eintippen", exact: true }).click();
  await expect(minutes).toBeFocused();
  await page.keyboard.type("1");
  await expect(minutes).toHaveValue("01");
  await minutes.press("ArrowUp");
  await expect(minutes).toHaveValue("02");
  await minutes.hover(); await page.mouse.wheel(0, -100);
  await expect(minutes).toHaveValue("04");
  await timer.getByRole("button", { name: "Lerntimer starten", exact: true }).press("Enter");
  await expect(minutes).toHaveCount(0);
  await expect(timer.getByRole("button", { name: "Lerntimer pausieren", exact: true })).toBeFocused();
  const clock = timer.getByRole("timer");
  await expect(clock).toContainText(/0[34]:\d\d/);
  await expect(timer.getByRole("button", { name: "Lerntimer zurücksetzen", exact: true })).toBeDisabled();
  await timer.getByRole("button", { name: "Lerntimer pausieren", exact: true }).click();
  const frozen = await clock.textContent();
  await page.waitForTimeout(1200);
  await expect(clock).toHaveText(frozen!);
  await timer.getByRole("button", { name: "Lerntimer fortsetzen", exact: true }).click();
  await expect.poll(() => clock.textContent()).not.toBe(frozen);
  await timer.getByRole("button", { name: "Lerntimer pausieren", exact: true }).click();
  await timer.getByRole("button", { name: "Lerntimer zurücksetzen", exact: true }).press("Enter");
  await expect(minutes).toHaveValue("04");
  await expect(timer.getByRole("button", { name: "Lerntimer starten", exact: true })).toBeFocused();
  await expect(timer.getByText(/Bereit|Endet um|Dauer ändern/)).toHaveCount(0);
});

for (const width of [390, 1440]) test(`Widget aus Menüband ziehen ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await openEditor(page);
  await page.getByRole("button", { name: "Lerntimer entfernen", exact: true }).click();
  const more = page.getByRole("button", { name: "Weitere Widgets", exact: true });
  if (await more.isVisible()) await more.click();
  const source = page.getByRole("button", { name: "Lerntimer", exact: true });
  await source.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("06-menueband.png") });
  const a = await source.boundingBox();
  const b = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
  await page.mouse.move(a!.x + 20, a!.y + 30); await page.mouse.down();
  await page.mouse.move(b!.x + 30, Math.min(800, b!.y + 60), { steps: 12 });
  await expect(page.locator(".dashboard-widget-placeholder")).toBeVisible();
  await page.screenshot({ path: info.outputPath("07-hinzufuegen.png") });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveCount(0);
  await source.scrollIntoViewIfNeeded();
  const again = await source.boundingBox();
  const target = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
  await page.mouse.move(again!.x + 20, again!.y + 30); await page.mouse.down();
  await page.mouse.move(target!.x + 30, Math.min(800, target!.y + 60), { steps: 12 });
  await expect(page.locator(".dashboard-widget-placeholder")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".dashboard-widget-placeholder")).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(["timer", "learning", "motivation", "decks", "todos", "heatmap"]);
  await expect.poll(() => page.locator('[data-dashboard-widget="timer"]').evaluate((widget) => widget.getBoundingClientRect().height >= widget.querySelector('.dashboard-widget-body')!.getBoundingClientRect().height)).toBe(true);
  await page.reload();
  await expect.poll(() => order(page)).toEqual(["timer", "learning", "motivation", "decks", "todos", "heatmap"]);
});

for (const { width, height } of sizes) for (const theme of matrixThemes) test(`Widget-Kacheln und Menüband ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await openEditor(page, theme === "dark");
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  await page.locator('[data-dashboard-widget="decks"]').scrollIntoViewIfNeeded();
  if (visualOutput) await page.screenshot({ path: info.outputPath("08-angepinnte-stapel.png") });
  expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
  const more = page.getByRole("button", { name: "Weitere Widgets", exact: true });
  if (await more.isVisible()) await more.click();
  await page.locator(".dashboard-widget-library").scrollIntoViewIfNeeded();
  await expect(page.locator(".dashboard-mini-cells i")).toHaveCount(35);
  expect(await page.locator(".dashboard-mini-cells i").first().evaluate((cell) => cell.getBoundingClientRect().width)).toBeGreaterThan(6);
  if (visualOutput) await page.screenshot({ path: info.outputPath("09-menueband.png") });
  expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
});

for (const { width, height } of matrixViewports()) for (const theme of matrixThemes) {
  test(`Motivation ${width}×${height} ${theme}: Kachel und dauerhafte Entfernung`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, theme === "dark");
    const widget = page.locator('[data-dashboard-widget="motivation"]');
    await expect(widget).toHaveAttribute("data-width", "small");
    await widget.scrollIntoViewIfNeeded();
    await expect(widget.getByRole("heading", { name: "Dein Impuls" })).toBeVisible();
    await expect(widget.getByRole("button", { name: "Gehirn begrüßen" })).toBeVisible();
    if (visualOutput) await page.screenshot({ path: info.outputPath("motivation.png") });
    expect(await widget.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
    await widget.getByRole("button", { name: "Dein Impuls entfernen", exact: true }).click();
    await page.reload();
    await expect(widget).toHaveCount(0);
    await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
    await page.getByRole("button", { name: "Dein Impuls", exact: true }).click();
    await expect(widget).toHaveCount(1);
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    await widget.getByRole("button", { name: "Gehirn begrüßen" }).click();
    await expect(widget.getByRole("status")).toHaveText("Schön, dass du da bist!");
  });
}

test("Motivation wechselt ohne Neuladen auch nach einem inaktiven Tab", async ({ page }) => {
  await page.clock.install();
  await page.goto("/docs/ui-elements.html?preview=dashboard");
  const widget = page.locator('[data-dashboard-widget="motivation"]');
  const day = await widget.locator("[data-motivation-day]").getAttribute("data-motivation-day");
  const quote = await widget.locator(".motivation-widget-quote").textContent();
  await page.clock.fastForward(26 * 60 * 60 * 1000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(widget.locator("[data-motivation-day]")).not.toHaveAttribute("data-motivation-day", day!);
  await expect(widget.locator(".motivation-widget-quote")).not.toHaveText(quote!);
});

test.describe("Maskottchen-Vorrat", () => {
  // The stock is a local design aid outside the deployment; build it once for these checks.
  const stock = (file: string) => pathToFileURL(path.resolve("output/mascots", file)).href;
  test.beforeAll(() => { execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "scripts/generateMascots.tsx"]); });

  test("Maskottchen folgen begrenzt dem Zeiger und begrüßen Tastatur; reduzierte Bewegung bleibt ruhig", async ({ page }) => {
    await page.goto(stock("pastell-lernen.html"));
    const host = page.locator("[data-brain-mascot]");
    const pupil = page.locator("[data-brain-pupil]").first();
    const bounds = await host.boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width - 5, bounds!.y + 10);
    await expect(pupil).toHaveAttribute("transform", /translate\((?!0 0)/);
    expect(await pupil.evaluate((element) => { const [x, y] = element.getAttribute("transform")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number); return Math.hypot(x, y); })).toBeLessThanOrEqual(5.01);
    await page.mouse.move(0, 0);
    await expect(pupil).toHaveAttribute("transform", "translate(0 0)");
    const button = page.getByRole("button", { name: "Gehirn begrüßen" });
    await button.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Schön, dass du da bist!");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await button.focus(); await page.keyboard.press("Space");
    await page.mouse.move(bounds!.x + bounds!.width - 5, bounds!.y + 10);
    await expect(pupil).toHaveAttribute("transform", "translate(0 0)");
    expect(await page.locator(".brain-mascot-drawing").evaluate((element) => element.getAnimations().length)).toBe(0);
  });

  test("Maskottchen reagieren auf echtes Touch-Tippen", async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto(stock("pastell-lernen.html"));
      await page.getByRole("button", { name: "Gehirn begrüßen" }).tap();
      await expect(page.getByRole("status")).toHaveText("Schön, dass du da bist!");
      await expect(page.locator("[data-brain-pupil]").first()).toHaveAttribute("transform", "translate(0 0)");
    } finally { await context.close(); }
  });

  test("Maskottchen-Vorrat: alle 37 Einzel-HTMLs funktionieren offline und ohne SVG-ID-Kollisionen", async ({ page, context }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(stock("index.html"));
    const files = await page.locator(".stock-card .links a:first-child").evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
    expect(files).toHaveLength(37);
    const ids = await page.locator("[id]").evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    if (visualOutput) await page.screenshot({ path: info.outputPath("maskottchen-vorrat.png"), fullPage: true });
    await context.setOffline(true);
    for (const file of files) {
      await page.goto(stock(file));
      await expect(page.getByRole("button", { name: "Gehirn begrüßen" })).toBeVisible();
      await page.getByRole("button", { name: "Gehirn begrüßen" }).click();
      await expect(page.getByRole("status")).toHaveText("Schön, dass du da bist!");
      if (visualOutput) await page.screenshot({ path: info.outputPath(file.replace(".html", ".png")), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
});


test("Timer: Füllstand, Pause und Zurücksetzen auf die Startdauer", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/docs/ui-elements.html?preview=dashboard");
  const timer = page.locator('[data-dashboard-widget="timer"]');
  const minutes = timer.getByRole("spinbutton", { name: "Minuten", exact: true });
  const level = timer.locator(".core-study-timer-level");
  const height = () => level.evaluate((element) => parseFloat((element as HTMLElement).style.height));
  await minutes.fill("02");
  await minutes.dispatchEvent("wheel", { deltaY: -40, ctrlKey: true });
  await expect(minutes).toHaveValue("02");
  await timer.getByRole("button", { name: "Lerntimer starten", exact: true }).click();
  await page.clock.fastForward(30000);
  await expect(timer.getByRole("timer")).toContainText(/01:[23]\d/);
  await expect.poll(height).toBeGreaterThan(20);
  await timer.getByRole("button", { name: "Lerntimer pausieren", exact: true }).click();
  const frozen = await height();
  await page.clock.fastForward(60000);
  expect(await height()).toBe(frozen);
  await expect(timer.locator(".core-study-timer-tile")).toHaveAttribute("data-state", "paused");
  await page.screenshot({ path: info.outputPath("timer-pausiert.png") });
  await timer.getByRole("button", { name: "Lerntimer zurücksetzen", exact: true }).click();
  await expect(minutes).toHaveValue("02");
  await expect(level).toHaveCount(0);
  await timer.getByRole("button", { name: "Lerntimer starten", exact: true }).click();
  await page.clock.fastForward(12000);
  await expect(timer.getByRole("button", { name: "Lerntimer zurücksetzen", exact: true })).toBeDisabled();
});

test("Aufgaben: alle offenen Aufgaben in scrollender Liste, Inline-Plus und ausklappbare lange Texte", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/ui-elements.html?preview=dashboard");
  const box = page.locator(".dashboard-todos");
  const planned = box.locator('[data-exam-todo]').filter({ visible: true });
  await expect.poll(() => planned.count()).toBeGreaterThan(3);
  const plannedCount = await planned.count();
  await expect(box.getByText("Keine eigenen Aufgaben offen.")).toHaveCount(0);
  const add = box.getByRole("button", { name: "Neue Aufgabe", exact: true });
  const text = "Langer eigener Lernauftrag: " + "Anatomie, Physiologie und klinische Zusammenhänge gründlich wiederholen. ".repeat(5);
  for (const title of [text, "Zweite eigene Aufgabe", "Dritte eigene Aufgabe", "Vierte eigene Aufgabe"]) {
    await add.click(); await box.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill(title);
    await box.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
  }
  await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(4);
  await expect(add).toBeFocused();
  await add.click(); await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await expect(planned).toHaveCount(plannedCount);
  expect(await box.locator(".dashboard-todos-list").evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
  const own = box.locator('[data-own-todo]').first();
  const disclosure = own.getByRole("button", { name: "Vollständigen Aufgabentext anzeigen" });
  await expect(disclosure).toBeVisible();
  const collapsedHeight = (await own.boundingBox())!.height;
  await disclosure.click();
  expect((await own.boundingBox())!.height).toBeGreaterThan(collapsedHeight * 2);
  await expect(own.getByRole("checkbox")).not.toBeChecked();
  await own.getByRole("button", { name: "Aufgabentext einklappen" }).click();
  await page.screenshot({ path: info.outputPath("aufgaben-vorschau.png") });
  await box.getByRole("checkbox", { name: text, exact: true }).click();
  await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(4);
  await expect(box.getByRole("checkbox", { name: text, exact: true })).toBeChecked();
  await expect(box.locator('[data-own-todo]').last()).toHaveAttribute("data-done", "true");
  await expect(planned).toHaveCount(plannedCount);
});


for (const { width, height } of sizes) for (const theme of matrixThemes) {
  test(`Kompakte Widgets ${width}×${height} ${theme}: Timer und Aufgaben`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, theme === "dark");
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    const timer = page.locator('[data-dashboard-widget="timer"]');
    const box = page.locator(".dashboard-todos");
    await timer.scrollIntoViewIfNeeded();
    if (visualOutput) await page.screenshot({ path: info.outputPath("timer-idle.png") });
    await box.scrollIntoViewIfNeeded();
    if (visualOutput) await page.screenshot({ path: info.outputPath("todos-empty-own.png") });
    const text = "Prüfungsstoff und Zusammenhänge wiederholen: " + "Pathologie, Anatomie und Physiologie. ".repeat(10);
    await box.getByRole("button", { name: "Neue Aufgabe", exact: true }).click();
    if (visualOutput) await page.screenshot({ path: info.outputPath("todos-add.png") });
    await box.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill(text);
    await box.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
    await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(1);
    expect(await box.locator('[data-exam-todo]').filter({ visible: true }).count()).toBeGreaterThan(2);
    await box.scrollIntoViewIfNeeded();
    if (visualOutput) await page.screenshot({ path: info.outputPath("todos-compact.png") });
    await box.locator('[data-own-todo]').getByRole("button", { name: "Vollständigen Aufgabentext anzeigen" }).click();
    if (visualOutput) await page.screenshot({ path: info.outputPath("todos-expanded.png") });
    await box.locator('[data-own-todo]').getByRole("button", { name: "Aufgabentext einklappen" }).click();
    expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
    for (const widget of [timer, box]) {
      expect(await widget.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll('button, input')].filter((control) => control.getClientRects().length).every((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        });
      })).toBe(true);
    }
  });
}


for (const { width, height } of sizes) for (const theme of matrixThemes) {
  test(`Prüfungs-Checkliste ${width}×${height} ${theme}: vollständige Ansicht`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/docs/ui-elements.html?preview=exams");
    if (theme === "dark") {
      await page.getByRole("button", { name: "Produktansicht schließen", exact: true }).click();
      await switchColorScheme(page, "dark");
      await page.getByRole("button", { name: "Prüfungen öffnen", exact: true }).click();
    }
    const checklist = page.getByTestId("dashboard-exam-unit");
    await checklist.scrollIntoViewIfNeeded();
    if (visualOutput) await page.screenshot({ path: info.outputPath("pruefungen-checkliste.png") });
    await expect(checklist.locator('[data-exam-todo]').first()).toBeVisible();
    await expect(checklist.getByRole("button", { name: "Vollständigen Aufgabentext anzeigen" })).toHaveCount(0);
    expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  });
}

test("die Heatmap-Farbe lässt sich im Bearbeitungsmodus am Widget wählen", async ({ page }) => {
  await page.goto("/docs/ui-elements.html?preview=dashboard");
  const picker = page.getByRole("button", { name: "Heatmap-Farbe ändern", exact: true });
  await expect(picker).toHaveCount(0);
  await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
  await expect(picker).toHaveCount(1);
  await expect(page.locator('[data-dashboard-widget="heatmap"]').getByRole("button", { name: "Heatmap-Farbe ändern", exact: true })).toBeVisible();
  await picker.click();
  await page.getByRole("radio", { name: "Farbe #3FA66B", exact: true }).click();
  await expect(page.locator('[data-dashboard-widget="heatmap"] [data-heatmap-history-color]')).toHaveAttribute("data-heatmap-history-color", "#3fa66b");
});

test("die Lerntimer-Farbe lässt sich getrennt von der Heatmap am Widget wählen", async ({ page }) => {
  await page.goto("/docs/ui-elements.html?preview=dashboard");
  const tile = page.locator('[data-dashboard-widget="timer"] .core-study-timer-tile');
  await expect(tile).toHaveCSS("background-color", "rgb(185, 94, 0)");
  await page.getByRole("button", { name: "Seite bearbeiten", exact: true }).click();
  await page.locator('[data-dashboard-widget="timer"]').getByRole("button", { name: "Lerntimer-Farbe ändern", exact: true }).click();
  await page.getByRole("radio", { name: "Farbe #3FA66B", exact: true }).click();
  await expect(tile).toHaveCSS("background-color", "rgb(63, 166, 107)");
  await expect(page.locator('[data-dashboard-widget="heatmap"] [data-heatmap-history-color]')).toHaveAttribute("data-heatmap-history-color", "#b95e00");
  expect(await page.evaluate(() => localStorage.getItem("core.studyTimer.color.v1"))).toBe("#3fa66b");
});
