import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const sizes = [[320, 720], [360, 800], [390, 844], [430, 932], [639, 900], [640, 900], [999, 900], [1000, 900], [1280, 720], [1440, 900]];
const defaults = ["learning", "motivation", "timer", "decks", "todos", "heatmap"];

async function order(page: Page) {
  return page.locator("[data-dashboard-widget]").evaluateAll((widgets) => widgets.map((widget) => widget.getAttribute("data-dashboard-widget")));
}

async function previewOrder(page: Page) {
  return page.locator("[data-dashboard-widget]").evaluateAll((widgets) => [...widgets].sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order)).map((widget) => widget.getAttribute("data-dashboard-widget")));
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
  await page.locator(".dashboard-widget-grid").evaluate(async (grid) => {
    await Promise.all(grid.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
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
    await expect.poll(async () => (await page.locator('[data-dashboard-widget="learning"]').boundingBox())!.y).toBeGreaterThanOrEqual(90);
    const rect = await page.locator('[data-dashboard-widget="learning"]').boundingBox();
    target = { x: rect!.x + rect!.width / 2, y: rect!.y + 70 };
  }
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
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    if (width === 640 || width === 999) {
      const timer = await page.locator('[data-dashboard-widget="timer"]').boundingBox();
      const motivation = await page.locator('[data-dashboard-widget="motivation"]').boundingBox();
      expect(Math.abs(timer!.y - motivation!.y)).toBeLessThan(2);
    }
    await page.screenshot({ path: info.outputPath("00-uebersicht.png") });
    await page.getByRole("button", { name: "Seite anpassen", exact: true }).click();
    await page.screenshot({ path: info.outputPath("01-bearbeiten.png") });
    await beginDrag(page);
    await expect.poll(() => order(page)).toEqual(defaults);
    await expect.poll(async () => (await previewOrder(page))[0]).toBe("timer");
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
    await expect.poll(() => order(page)).toEqual(["timer", "learning", "motivation", "decks", "todos", "heatmap"]);
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    await page.screenshot({ path: info.outputPath("03-verschoben.png") });
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

test("Widget-Höhen schließen Lücken und passen sich aufgeklappten Inhalten an", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  const bounds = () => page.locator("[data-dashboard-widget]").evaluateAll((widgets) => widgets.map((widget) => {
    const rect = widget.getBoundingClientRect();
    return { id: widget.getAttribute("data-dashboard-widget"), top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  }));
  await expect.poll(async () => {
    const rects = await bounds();
    return rects.find((rect) => rect.id === "decks")!.top < rects.find((rect) => rect.id === "timer")!.bottom;
  }).toBe(true);
  await page.getByRole("spinbutton", { name: "Minuten", exact: true }).fill("45");
  await expect(page.getByRole("spinbutton", { name: "Minuten", exact: true })).toHaveValue("45");
  await page.getByRole("button", { name: "Eigene Aufgabe hinzufügen", exact: true }).click();
  await page.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill("Eigener Test mit langem Aufgabentext ohne Verlust der Tagesaufgaben");
  await page.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Eigener Test mit langem Aufgabentext ohne Verlust der Tagesaufgaben", exact: true })).toBeVisible();
  for (const text of ["Weitere Aufgabe zwei", "Weitere Aufgabe drei", "Weitere Aufgabe vier"]) {
    await page.getByRole("button", { name: "Eigene Aufgabe hinzufügen", exact: true }).click();
    await page.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill(text);
    await page.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
  }
  await expect(page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Alle \d+ Aufgaben anzeigen$/ }).and(page.locator(".dashboard-todos > button")).click();
  await page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true }).click();
  await page.getByText("Erledigt (1)", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Weitere Aufgabe vier", exact: true })).not.toBeChecked();
  await expect.poll(async () => {
    const rects = await bounds();
    return rects.every((a, index) => rects.slice(index + 1).every((b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
  }).toBe(true);
  await page.screenshot({ path: info.outputPath("04-aufgeklappt.png") });
});

test("Widgetoptionen erhalten Größen, Pfeile und Entfernen; abgebrochener Drag bleibt ungespeichert", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await beginDrag(page);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(defaults);
  await page.getByRole("button", { name: "Seite anpassen", exact: true }).click();
  await page.screenshot({ path: info.outputPath("05-widgetmenue.png") });
  await page.getByRole("button", { name: "Lerntimer nach vorne", exact: true }).click();
  await expect.poll(() => order(page)).toEqual(["learning", "timer", "motivation", "decks", "todos", "heatmap"]);
  await page.getByRole("button", { name: "Lerntimer: Größe ändern (kompakt)", exact: true }).click();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveAttribute("data-width", "wide");
  await page.getByRole("button", { name: "Lerntimer entfernen", exact: true }).click();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Widget hinzufügen", exact: true }).click();
  await page.getByRole("button", { name: "Lerntimer hinzufügen", exact: true }).click();
  await expect(page.locator('[data-dashboard-widget="timer"]')).toHaveCount(1);
});

test("Timer: Ziffern, Mausrad, Pause und Fortsetzen ohne Voreinstellungen", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  const minutes = page.getByRole("spinbutton", { name: "Minuten", exact: true });
  const seconds = page.getByRole("spinbutton", { name: "Sekunden", exact: true });
  await minutes.fill("01"); await seconds.fill("30");
  await seconds.press("ArrowUp"); await expect(seconds).toHaveValue("31");
  await seconds.hover(); await page.mouse.wheel(0, -100);
  await expect(seconds).toHaveValue("33");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(minutes).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const frozen = await seconds.inputValue();
  await page.waitForTimeout(1200);
  await expect(seconds).toHaveValue(frozen);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(() => seconds.inputValue()).not.toBe(frozen);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await seconds.fill("05");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(seconds).toHaveValue("05");
  await expect(page.getByText(/Dauer ändern|25 Min. Fokus/)).toHaveCount(0);
});

for (const width of [390, 1440]) test(`Widget aus Menüband ziehen ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await openEditor(page);
  await page.getByRole("button", { name: "Lerntimer entfernen", exact: true }).click();
  await page.getByRole("button", { name: "Widget hinzufügen", exact: true }).click();
  const source = page.getByRole("button", { name: "Lerntimer hinzufügen", exact: true });
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

for (const [width, height] of sizes) for (const theme of ["light", "dark"]) test(`Widget-Kacheln und Menüband ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await openEditor(page, theme === "dark");
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  await page.getByRole("button", { name: "Als Kacheln anzeigen", exact: true }).click();
  await page.locator(".dashboard-deck-teaser").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("08-stapelkacheln.png") });
  expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await page.getByRole("button", { name: "Seite anpassen", exact: true }).click();
  await page.getByRole("button", { name: "Widget hinzufügen", exact: true }).click();
  await page.locator(".dashboard-widget-library").scrollIntoViewIfNeeded();
  await expect(page.locator(".dashboard-mini-cells i")).toHaveCount(35);
  expect(await page.locator(".dashboard-mini-cells i").first().evaluate((cell) => cell.getBoundingClientRect().width)).toBeGreaterThan(6);
  await page.screenshot({ path: info.outputPath("09-menueband.png") });
  expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
});

for (const [width, height] of [[320, 720], [360, 800], [390, 844], [430, 932], [1280, 720], [1440, 900]]) for (const theme of ["light", "dark"]) {
  test(`Motivation ${width}×${height} ${theme}: Größen und dauerhafte Entfernung`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, theme === "dark");
    const widget = page.locator('[data-dashboard-widget="motivation"]');
    for (const size of ["small", "wide", "full"]) {
      await expect(widget).toHaveAttribute("data-width", size);
      await widget.scrollIntoViewIfNeeded();
      await expect(widget.getByRole("heading", { name: "Dein Motivationsimpuls" })).toBeVisible();
      await expect(widget.getByRole("button", { name: "Gehirn begrüßen" })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`motivation-${size}.png`) });
      expect(await widget.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
      await widget.getByRole("button", { name: /Größe ändern/ }).click();
    }
    await widget.getByRole("button", { name: "Dein Motivationsimpuls entfernen", exact: true }).click();
    await page.reload();
    await expect(widget).toHaveCount(0);
    await page.getByRole("button", { name: "Seite anpassen", exact: true }).click();
    await page.getByRole("button", { name: "Widget hinzufügen", exact: true }).click();
    await page.getByRole("button", { name: "Dein Motivationsimpuls hinzufügen", exact: true }).click();
    await expect(widget).toHaveCount(1);
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    await widget.getByRole("button", { name: "Gehirn begrüßen" }).click();
    await expect(widget.getByRole("status")).toHaveText("Schön, dass du da bist!");
  });
}

test("Motivation wechselt ohne Neuladen auch nach einem inaktiven Tab", async ({ page }) => {
  await page.clock.install();
  await page.goto("/docs/ui-elements.html?preview=dashboard#screens");
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
    await page.screenshot({ path: info.outputPath("maskottchen-vorrat.png"), fullPage: true });
    await context.setOffline(true);
    for (const file of files) {
      await page.goto(stock(file));
      await expect(page.getByRole("button", { name: "Gehirn begrüßen" })).toBeVisible();
      await page.getByRole("button", { name: "Gehirn begrüßen" }).click();
      await expect(page.getByRole("status")).toHaveText("Schön, dass du da bist!");
      await page.screenshot({ path: info.outputPath(file.replace(".html", ".png")), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
});


test("Timer: Scrollen ohne Fokus, Ring, Pause und Reset auf die Startdauer", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/docs/ui-elements.html?preview=dashboard#screens");
  const timer = page.locator('[data-dashboard-widget="timer"]');
  const minutes = timer.getByRole("spinbutton", { name: "Minuten", exact: true });
  const seconds = timer.getByRole("spinbutton", { name: "Sekunden", exact: true });
  const ring = timer.getByTestId("timer-countdown-ring");
  const reset = timer.getByRole("button", { name: "Timer zurücksetzen" });
  await expect(reset).toBeDisabled();
  expect(await ring.evaluate((element) => getComputedStyle(element).stroke)).not.toBe("none");
  await minutes.fill("01"); await seconds.fill("30");
  await timer.getByRole("button", { name: "Start", exact: true }).focus();
  await seconds.hover();
  for (let i = 0; i < 5; i++) await seconds.dispatchEvent("wheel", { deltaY: -8, deltaMode: 0 });
  await expect(seconds).toHaveValue("31");
  await expect(seconds).not.toBeFocused();
  await minutes.hover(); await page.mouse.wheel(0, -40);
  await expect(minutes).toHaveValue("02");
  await seconds.dispatchEvent("wheel", { deltaY: -40, ctrlKey: true });
  await expect(seconds).toHaveValue("31");
  await timer.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(seconds).toHaveValue("00");
  await expect.poll(async () => Number(await ring.getAttribute("stroke-dashoffset"))).toBeGreaterThan(.20);
  await timer.getByRole("button", { name: "Pause", exact: true }).click();
  const frozen = await ring.getAttribute("stroke-dashoffset");
  await page.clock.fastForward(60000);
  await expect(ring).toHaveAttribute("stroke-dashoffset", frozen!);
  await page.screenshot({ path: info.outputPath("timer-pausiert.png") });
  await seconds.fill("07");
  await reset.click();
  await expect(minutes).toHaveValue("02"); await expect(seconds).toHaveValue("31");
  await expect(ring).toHaveAttribute("stroke-dashoffset", "0");
  await expect(reset).toBeDisabled();
  await timer.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.fastForward(12000);
  await reset.click();
  await expect(seconds).toHaveValue("31");
  await expect(timer.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
  await page.clock.fastForward(180000);
  await expect(seconds).toHaveValue("31");
});

test("Aufgaben: gemischte Dreier-Vorschau, Inline-Plus und ausklappbare lange Texte", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/ui-elements.html?preview=dashboard#screens");
  const box = page.locator(".dashboard-todos");
  const planned = box.locator('[data-exam-todo]').filter({ visible: true });
  await expect(planned).toHaveCount(3);
  await expect(box.getByText("Keine eigenen Aufgaben offen.")).toHaveCount(0);
  const add = box.getByRole("button", { name: "Eigene Aufgabe hinzufügen", exact: true });
  const text = "Langer eigener Lernauftrag: " + "Anatomie, Physiologie und klinische Zusammenhänge gründlich wiederholen. ".repeat(5);
  for (const title of [text, "Zweite eigene Aufgabe", "Dritte eigene Aufgabe", "Vierte eigene Aufgabe"]) {
    await add.click(); await box.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill(title);
    await box.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
  }
  await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(1);
  await expect(planned).toHaveCount(2);
  const own = box.locator('[data-own-todo]').first();
  const disclosure = own.getByRole("button", { name: "Vollständigen Aufgabentext anzeigen" });
  await expect(disclosure).toBeVisible();
  const collapsedHeight = (await own.boundingBox())!.height;
  await disclosure.click();
  expect((await own.boundingBox())!.height).toBeGreaterThan(collapsedHeight * 2);
  await expect(own.getByRole("checkbox")).not.toBeChecked();
  await own.getByRole("button", { name: "Aufgabentext einklappen" }).click();
  await page.screenshot({ path: info.outputPath("aufgaben-vorschau.png") });
  await box.getByRole("button", { name: /^Alle \d+ Aufgaben anzeigen$/ }).click();
  await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(4);
  expect(await planned.count()).toBeGreaterThan(2);
  await box.getByRole("button", { name: "Weniger anzeigen", exact: true }).click();
  await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(1);
  await box.getByRole("checkbox", { name: text, exact: true }).click();
  await expect(box.getByRole("checkbox", { name: "Zweite eigene Aufgabe", exact: true })).toBeVisible();
  await expect(planned).toHaveCount(2);
});


for (const [width, height] of sizes) for (const theme of ["light", "dark"]) {
  test(`Kompakte Widgets ${width}×${height} ${theme}: Timer und Aufgaben`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openEditor(page, theme === "dark");
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    const timer = page.locator('[data-dashboard-widget="timer"]');
    const box = page.locator(".dashboard-todos");
    await timer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("timer-idle.png") });
    await box.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("todos-empty-own.png") });
    const text = "Prüfungsstoff und Zusammenhänge wiederholen: " + "Pathologie, Anatomie und Physiologie. ".repeat(10);
    await box.getByRole("button", { name: "Eigene Aufgabe hinzufügen", exact: true }).click();
    await page.screenshot({ path: info.outputPath("todos-add.png") });
    await box.getByRole("textbox", { name: "Eigene Aufgabe", exact: true }).fill(text);
    await box.getByRole("button", { name: "Aufgabe hinzufügen", exact: true }).click();
    await expect(box.locator('[data-own-todo]').filter({ visible: true })).toHaveCount(1);
    await expect(box.locator('[data-exam-todo]').filter({ visible: true })).toHaveCount(2);
    await box.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("todos-compact.png") });
    await box.locator('[data-own-todo]').getByRole("button", { name: "Vollständigen Aufgabentext anzeigen" }).click();
    await page.screenshot({ path: info.outputPath("todos-expanded.png") });
    await box.locator('[data-own-todo]').getByRole("button", { name: "Aufgabentext einklappen" }).click();
    await box.getByRole("button", { name: /^Alle \d+ Aufgaben anzeigen$/ }).click();
    await page.screenshot({ path: info.outputPath("todos-all.png") });
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


for (const [width, height] of sizes) for (const theme of ["light", "dark"]) {
  test(`Prüfungs-Checkliste ${width}×${height} ${theme}: vollständige Ansicht`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/docs/ui-elements.html?preview=exams#screens");
    if (theme === "dark") {
      await page.getByRole("button", { name: "Produktansicht schließen", exact: true }).click();
      await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
      await page.getByRole("button", { name: "Prüfungen öffnen", exact: true }).click();
    }
    const checklist = page.getByTestId("dashboard-exam-unit");
    await checklist.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("pruefungen-checkliste.png") });
    await expect(checklist.locator('[data-exam-todo]').first()).toBeVisible();
    await expect(checklist.getByRole("button", { name: "Vollständigen Aufgabentext anzeigen" })).toHaveCount(0);
    expect(await page.locator(".catalog-product-preview").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  });
}
