import { expect, test } from "@playwright/test";

const viewports = [[320, 720, 1], [360, 800, 1], [390, 844, 1], [430, 932, 1], [639, 900, 1], [640, 900, 1], [1280, 720, 1], [1440, 900, 1], [720, 450, 2]];

for (const [width, height, scale] of viewports) test.describe(`${width}×${height} · ${scale === 2 ? "200%-Layout" : "Standard"}`, () => {
  test.use({ viewport: { width, height }, deviceScaleFactor: scale });
  for (const theme of ["light", "dark"]) {
  test(`FSRS-Kontaktplanung ${width}×${height} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/docs/ui-elements.html#screens");
    await page.getByRole("searchbox", { name: "Katalog durchsuchen", exact: true }).fill("Produktansichten");
    if (theme === "dark") await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
    await page.getByRole("button", { name: "Prüfungen öffnen", exact: true }).click();
    const product = page.locator(".catalog-product-preview");
    await expect(product.getByTestId("exam-month-calendar")).toBeVisible();
    await product.screenshot({ path: info.outputPath("01-monat.png") });
    await product.getByRole("button", { name: "Woche", exact: true }).click();
    await expect(product.getByTestId("exam-week-calendar")).toBeVisible();
    await product.screenshot({ path: info.outputPath("02-woche.png") });
    await product.getByRole("button", { name: "Prüfung hinzufügen", exact: true }).click();
    const editor = product.getByTestId("exam-plan-editor");
    await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Klausur mit sehr langem Namen: Herz und Lunge");
    await editor.getByRole("button", { name: "Weiter zum Lernstoff", exact: true }).click();
    await editor.getByRole("checkbox").first().check();
    await expect(editor.getByRole("spinbutton", { name: "Wie viele Tage vor der Klausur möchtest du die letzte neue Karte lernen?", exact: true })).toHaveValue("4");
    await product.screenshot({ path: info.outputPath("03-lernstoff.png") });
    await editor.getByText("Themenreihenfolge ändern", { exact: true }).click();
    const topicList = editor.getByRole("list", { name: "Themenreihenfolge", exact: true });
    await topicList.scrollIntoViewIfNeeded();
    let changedOrder: Array<string | undefined> | null = null;
    if (width === 1440 && theme === "light") {
      const before = await topicList.locator(":scope > li").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.topicId));
      await topicList.locator(":scope > li").first().getByRole("button", { name: /nach unten$/ }).click();
      changedOrder = await topicList.locator(":scope > li").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.topicId));
      expect(changedOrder[0]).toBe(before[1]);
    }
    await product.screenshot({ path: info.outputPath("03b-themenfolge.png") });
    await editor.getByRole("button", { name: "Weiter zur Lernzeit", exact: true }).click();
    await editor.getByRole("spinbutton", { name: "Durchschnittliche Stunden pro Lerntag", exact: true }).fill("0.25");
    await editor.getByRole("checkbox", { name: "Vor neuen Themen Zusammenfassung lesen", exact: true }).check();
    await editor.getByText("Konkrete Lernblöcke im Kalender setzen", { exact: true }).click();
    await expect(editor.getByTestId("exam-calendar")).toBeVisible();
    await product.screenshot({ path: info.outputPath("04-lernzeit.png") });
    await editor.getByRole("button", { name: "Lernplan ansehen", exact: true }).click();
    await expect(editor.getByTestId("exam-plan-preview").getByText("Noch neu", { exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Plan aktivieren", exact: true })).toBeEnabled();
    await product.screenshot({ path: info.outputPath("05-vorschau.png") });
    await editor.getByRole("button", { name: "Plan aktivieren", exact: true }).click();
    await expect(product.getByRole("heading", { name: "Klausur mit sehr langem Namen: Herz und Lunge: Details öffnen", exact: true })).toBeVisible();
    await product.screenshot({ path: info.outputPath("06-gespeichert.png") });
    const overflow = await product.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(overflow).toBe(false);
    if (changedOrder) {
      await product.getByRole("button", { name: "Klausur mit sehr langem Namen: Herz und Lunge: Details öffnen", exact: true }).click();
      await product.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      await editor.locator("summary").filter({ hasText: /^Stapel · \d+ ausgewählt$/ }).click();
      await editor.getByText("Themenreihenfolge ändern", { exact: true }).click();
      await expect.poll(() => editor.getByRole("list", { name: "Themenreihenfolge", exact: true }).locator(":scope > li").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.topicId))).toEqual(changedOrder);
    }
  });
}
});
