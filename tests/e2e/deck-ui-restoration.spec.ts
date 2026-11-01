import { expect, test } from "@playwright/test";

test("Unterstapelbaum klappt mehrere Ebenen vor dem direkten Öffnen auf", async ({ page }) => {
  await page.goto("/docs/ui-elements.html#screens");
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  await page.getByRole("button", { name: "Stapelinhalte öffnen", exact: true }).click();
  const product = page.locator(".catalog-product-preview");
  const tree = product.getByTestId("deck-content-substacks");
  const heading = product.getByTestId("deck-content-heading");
  const europe = tree.getByTestId("content-substack-catalog-europe");
  const south = tree.getByTestId("content-substack-catalog-substack-0");
  const portugal = tree.getByTestId("content-substack-catalog-substack-1");
  const lisbon = tree.getByTestId("content-substack-catalog-substack-2");
  await expect(south).toHaveCount(0);
  await europe.getByRole("button", { name: /^Stapel .* aufklappen$/ }).click();
  await expect(heading).toContainText("Welt-Hauptstädte");
  await expect(south).toBeVisible();
  await expect(portugal).toHaveCount(0);
  await south.getByRole("button", { name: /^Unterstapel von .* anzeigen$/ }).press("Enter");
  await portugal.getByRole("button", { name: /^Stapel .* aufklappen$/ }).press("Space");
  await expect(lisbon).toBeVisible();
  await europe.getByRole("button", { name: /^Unterstapel von .* ausblenden$/ }).click();
  await expect(lisbon).toHaveCount(0);
  await expect(south).toHaveCount(0);
  await europe.getByRole("button", { name: /^Stapel .* aufklappen$/ }).click();
  await expect(lisbon).toBeVisible();
  await expect(heading).toContainText("Welt-Hauptstädte");
  await portugal.getByRole("button", { name: /^Karten von .* öffnen$/ }).click();
  await expect(heading.getByRole("heading", { name: "Portugal", exact: true })).toBeVisible();
  const tabs = product.getByRole("group", { name: "Stapelinhalte", exact: true });
  await expect(tabs.getByRole("button", { name: "Karten", exact: true })).toHaveAttribute("aria-pressed", "true");
  await tabs.getByRole("button", { name: "Unterstapel", exact: true }).click();
  await expect(europe).toHaveCount(0);
  await lisbon.getByRole("button", { name: /^Stapel .* öffnen$/ }).click();
  await expect(heading.getByRole("heading", { name: "Lissabon", exact: true })).toBeVisible();
  await tabs.getByRole("button", { name: "Unterstapel", exact: true }).click();
  await expect(product).toContainText("Keine weiteren Unterstapel");
});

test("Liste und Kacheln bleiben ohne Explorer und speichern die Auswahl", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/ui-elements.html#screens");
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  await page.getByRole("button", { name: "Lernen öffnen", exact: true }).click();
  const product = page.locator(".catalog-product-preview");
  await expect(product.getByTestId("learn-deck-list")).toHaveAttribute("data-deck-view", "list");
  await expect(product.locator("[data-donut-segment], [data-donut-empty], .core-deck-tree-root-count, .core-deck-group-description")).toHaveCount(0);
  await product.getByRole("button", { name: "Als Kacheln anzeigen", exact: true }).click();
  await expect(product.getByTestId("learn-deck-tiles")).toBeVisible();
  await expect(product.getByTestId("deck-explorer")).toHaveCount(0);
  await expect(product.getByRole("button", { name: "Stapel wechseln", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  await page.getByRole("button", { name: "Lernen öffnen", exact: true }).click();
  await expect(product.getByTestId("learn-deck-tiles")).toBeVisible();
  await product.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte öffnen", exact: true }).click();
  await expect(product.getByTestId("learn-deck-folder-panel")).toBeVisible();
  await product.getByRole("button", { name: "Als Liste anzeigen", exact: true }).click();
  await expect(product.getByRole("button", { name: "Inhalte von Biologie öffnen", exact: true })).toBeVisible();
  await expect(product.getByRole("button", { name: /^Inhalte von Welt-Hauptstädte \/ Europa.*öffnen$/ })).toBeVisible();
  await page.reload();
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  await page.getByRole("button", { name: "Lernen öffnen", exact: true }).click();
  await expect(product.getByTestId("learn-deck-list")).toHaveAttribute("data-deck-view", "list");
});

test("Stapelinhalte behalten aktuelle Reiter und Lernaktion ohne zusätzliche Köpfe oder Anzahltexte", async ({ page }) => {
  await page.goto("/docs/ui-elements.html#screens");
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  await page.getByRole("button", { name: "Stapelinhalte öffnen", exact: true }).click();
  const product = page.locator(".catalog-product-preview");
  await expect(product.getByRole("group", { name: "Bereich in Lernen", exact: true })).toHaveCount(0);
  await expect(product).not.toContainText("Einschließlich");
  await expect(product).not.toContainText("direkter Unterstapel");
  await expect(product.locator("[data-donut-segment], [data-donut-empty], .core-deck-group-description")).toHaveCount(0);
  const tabs = product.getByRole("group", { name: "Stapelinhalte", exact: true });
  await expect(tabs.getByRole("button")).toHaveCount(6);
  await expect(product.getByTestId("deck-content-study")).toBeVisible();
  await tabs.getByRole("button", { name: "Zusammenfassungen", exact: true }).click();
  await expect(product.getByTestId("deck-summaries-panel")).toBeVisible();
  await expect(product.getByTestId("deck-content-study")).toBeVisible();
  await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  await expect(product.getByTestId("deck-mindmaps-panel")).toBeVisible();
  await expect(product.getByTestId("deck-content-study")).toBeVisible();
  await page.getByRole("button", { name: "Produktansicht schließen", exact: true }).click();
  await page.getByRole("button", { name: "Kartenverwaltung öffnen", exact: true }).click();
  const icons = product.locator("[data-deck-icon]");
  await expect(icons.first()).toBeVisible();
  expect(await icons.evaluateAll((elements) => elements.every((element) => {
    const style = getComputedStyle(element);
    return Number.parseFloat(style.borderRadius) < Number.parseFloat(style.width) / 2;
  }))).toBe(true);
});

test("Escape schließt einen Dialog auch nach einem Klick auf seinen Titel", async ({ page }) => {
  await page.goto("/docs/ui-elements.html#dialogs");
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Dialog-Familie");
  await page.getByRole("button", { name: "Löschdialog öffnen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Stapel löschen?", exact: true });
  await dialog.getByRole("heading", { name: "Stapel löschen?", exact: true }).click();
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') == null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 720 },
    { width: 1279, height: 900 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    test(`Stapelansichten: ${theme} bei ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/docs/ui-elements.html#screens");
      await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
      if (theme === "dark") await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
      const product = page.locator(".catalog-product-preview");
      const close = page.getByRole("button", { name: "Produktansicht schließen", exact: true });
      const capture = async (name: string) => {
        await expect(product).toBeVisible();
        expect(await product.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
      };
      await page.getByRole("button", { name: "Lernen öffnen", exact: true }).click();
      await capture("learn-list");
      await product.getByRole("button", { name: "Als Kacheln anzeigen", exact: true }).click();
      await capture("learn-tiles");
      await product.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte öffnen", exact: true }).click();
      await expect(product.getByTestId("learn-deck-folder-panel")).toBeVisible();
      await capture("learn-branch");
      await product.getByRole("button", { name: "Alle Inhalte von Welt-Hauptstädte öffnen", exact: true }).click();
      const tabs = product.getByRole("group", { name: "Stapelinhalte", exact: true });
      for (const [label, name] of [
        ["Unterstapel", "children"], ["Zusammenfassungen", "summary"], ["Quiz", "quiz"],
        ["Mind Map", "mind-map"], ["Karten", "cards"], ["Quelle", "source"],
      ]) {
        await tabs.getByRole("button", { name: label, exact: true }).click();
        await expect(product.getByTestId("deck-content-study")).toBeVisible();
        await close.press("Control+Home");
        await capture(`content-${name}`);
      }
      await close.click();
      await page.getByRole("button", { name: "Kartenverwaltung öffnen", exact: true }).click();
      await capture("cards");
      await product.getByRole("button", { name: "Stapeloptionen für Welt-Hauptstädte", exact: true }).click();
      await expect(page.getByTestId("deck-move-button-catalog-world")).toBeVisible();
      await capture("menu");
      await page.keyboard.press("Escape");
      await close.click();
      await page.getByRole("button", { name: "Tagesübersicht öffnen", exact: true }).click();
      await capture("dashboard");
    });
  }
}

test("Sammlungsende, Schnellanlage und 200 Prozent Vergrößerung bleiben erreichbar", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/docs/ui-elements.html#screens");
  await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
  const product = page.locator(".catalog-product-preview");
  const close = page.getByRole("button", { name: "Produktansicht schließen", exact: true });
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
    for (const viewport of [
      { width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 },
      { width: 430, height: 932 }, { width: 1280, height: 720 }, { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Tagesübersicht öffnen", exact: true }).click();
      await close.press("Control+End");
      await expect(product.getByRole("heading", { name: "Aktive Stapel", exact: true })).toBeVisible();
      const lastDeckRow = product.locator("[data-testid^=\"dashboard-deck-row-\"]").last();
      await lastDeckRow.scrollIntoViewIfNeeded();
      await expect(lastDeckRow).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.width}-dashboard-decks.png`) });
      await close.click();
      await page.getByRole("button", { name: "Lernen öffnen", exact: true }).click();
      await close.press("Control+End");
      await expect(product.getByRole("button", { name: "Anlegen", exact: true })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.width}-learn-create.png`) });
      await close.click();
    }
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.getByRole("button", { name: "Lernen öffnen", exact: true }).click();
    await expect(product.getByRole("button", { name: "Als Kacheln anzeigen", exact: true })).toBeVisible();
    expect(await product.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-zoom-200-list.png`) });
    await product.getByRole("button", { name: "Als Kacheln anzeigen", exact: true }).click();
    await product.getByRole("button", { name: "Unterstapel von Welt-Hauptstädte öffnen", exact: true }).click();
    await expect(product.getByTestId("learn-deck-folder-panel")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-zoom-200-branch.png`) });
    await product.getByRole("button", { name: "Als Liste anzeigen", exact: true }).click();
    await close.click();
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  }
});
