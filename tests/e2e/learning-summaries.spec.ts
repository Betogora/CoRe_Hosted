import { expect, test, type Page, type Locator } from "@playwright/test";
import type { LearningSummary } from "../../src/learningSummaries.ts";

test.setTimeout(90_000);
async function openSummaries(page: Page) {
  await page.goto("./docs/ui-elements.html#screens");
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  const panel = page.getByTestId("deck-summaries-panel");
  await expect(panel.getByTestId("summary-list")).toBeVisible();
  return panel;
}
async function saveOnLeave(page: Page, panel: Locator) {
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByTestId("summary-list")).toBeVisible();
}
async function openAiSettings(page: Page, panel: Locator) {
  await panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true }).click();
  await page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true }).getByRole("button", { name: "Einstellungen", exact: true }).click();
}

test("Schreiben öffnet einen Entwurf; Speichern erfolgt beim Verlassen und bleibt nach Reload erhalten", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await expect(editor).toBeEmpty();
  await panel.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true }).fill("Meine eigene Fassung");
  await editor.fill("Mein selbst geschriebener Überblick.");
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true });
  await guard.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(editor).toHaveText("Mein selbst geschriebener Überblick.");
  await saveOnLeave(page, panel);
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Meine eigene Fassung“ öffnen", exact: true }).click();
  await expect(editor).toHaveText("Mein selbst geschriebener Überblick.");
  await editor.fill("Nicht übernehmen");
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  await guard.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Meine eigene Fassung“ öffnen", exact: true }).click();
  await expect(editor).toHaveText("Mein selbst geschriebener Überblick.");
});

test("KI-Einstellungen und Quellen liefern einen Entwurf; erst Verlassen speichert das bearbeitete Ergebnis", async ({ page }) => {
  const panel = await openSummaries(page);
  await openAiSettings(page, panel);
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("KI aus einer Textquelle");
  await page.getByLabel("Quelle anfügen (optional)").setInputFiles({ name: "skript.txt", mimeType: "text/plain", buffer: Buffer.from("ATP ist ein Energieträger. ADP besitzt zwei Phosphatgruppen.") });
  await page.getByRole("button", { name: "Nur Quelle", exact: true }).click();
  await page.getByRole("group", { name: "Länge", exact: true }).getByRole("button", { name: "Kurz", exact: true }).click();
  await page.getByRole("combobox", { name: "Detailgrad", exact: true }).click();
  await page.getByRole("option", { name: "Detailliert", exact: true }).click();
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await expect(editor).toContainText("ATP ist ein Energieträger");
  await expect(panel).toContainText("Ungespeicherte Änderungen");
  await expect(panel).toContainText("Kurz · Detailliert");
  await editor.fill("Mein bearbeitetes KI-Ergebnis.");
  await saveOnLeave(page, panel);
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „KI aus einer Textquelle“ öffnen", exact: true }).click();
  await expect(editor).toHaveText("Mein bearbeitetes KI-Ergebnis.");
});

test("KI-Fehler erhalten Formular und vorhandene Fassungen", async ({ page }) => {
  const panel = await openSummaries(page);
  await page.getByRole("combobox", { name: "KI-Demoantwort", exact: true }).click();
  await page.getByRole("option", { name: "Fehler", exact: true }).click();
  await openAiSettings(page, panel);
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Erhaltene Auswahl");
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true });
  await expect(popup).toContainText("Der KI-Dienst ist momentan nicht erreichbar");
  await expect(popup.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue("Erhaltene Auswahl");
  await popup.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(panel.getByTestId("summary-list").getByRole("button")).toHaveCount(2);
});

test("Speicherfehler bleiben im Verlassen-Dialog sichtbar und der Entwurf geht nicht verloren", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await editor.fill("Mein eigener Text");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === "readwrite") throw new Error("Der lokale Speicher ist nicht verfügbar.");
      return original.apply(this, args);
    };
  });
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true });
  await guard.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(guard).toContainText("Der lokale Speicher ist nicht verfügbar.");
  await guard.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(editor).toHaveText("Mein eigener Text");
});

test("Ein Dokument wächst ohne Seitenumbruch; Text, Schrift und Zeichnungen bleiben beim Speichern erhalten", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  const paragraphs = Array.from({ length: 90 }, (_, index) => `<p><strong>Absatz ${index + 1}</strong> erklärt einen Zusammenhang mit Beispielen und erhält alle Inhalte.</p>`).join("");
  await editor.evaluate((element, html) => { element.innerHTML = html; element.dispatchEvent(new InputEvent("input", { bubbles: true })); }, paragraphs);
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten" })).toHaveCount(1);
  await expect(editor).toContainText("Absatz 90");
  expect((await editor.boundingBox())!.height).toBeGreaterThan(2000);
  await panel.getByRole("combobox", { name: "Schrift", exact: true }).click();
  await page.getByRole("option", { name: "Serif", exact: true }).click();
  await panel.getByRole("combobox", { name: "Schriftgröße", exact: true }).click();
  await page.getByRole("option", { name: "22", exact: true }).click();
  await editor.evaluate((element) => { element.innerHTML = "<p>Text mit Zeichnung.</p>"; element.dispatchEvent(new InputEvent("input", { bubbles: true })); });
  await expect(editor.locator("b,strong")).toHaveCount(0);
  await editor.press("ControlOrMeta+a");
  await panel.getByRole("button", { name: "Fett", exact: true }).click();
  await expect(editor.locator("b,strong")).toHaveText("Text mit Zeichnung.");
  await panel.getByRole("button", { name: "Stift", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Schrift", exact: true })).toHaveCount(0);
  await panel.getByLabel("Zeichenfarbe", { exact: true }).fill("#cc3344");
  await panel.getByRole("combobox", { name: "Stiftstärke", exact: true }).click();
  await page.getByRole("option", { name: "Kräftig", exact: true }).click();
  const drawing = panel.getByRole("img", { name: "Zeichenfläche Zusammenfassung", exact: true });
  await drawing.scrollIntoViewIfNeeded();
  const box = (await drawing.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 180); await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 220, { steps: 8 }); await page.mouse.up();
  await expect(drawing.locator("path")).toHaveCount(1);
  await expect(drawing.locator("path")).toHaveAttribute("stroke", "#cc3344");
  await expect(drawing.locator("path")).toHaveAttribute("stroke-width", "5");
  await panel.getByRole("button", { name: "Zeichenmarker", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Markerfarbe", exact: true })).toHaveValue("#e4bf63");
  await expect(panel.getByRole("combobox", { name: "Markerbreite", exact: true })).toContainText("Mittel");
  await panel.getByRole("button", { name: "Radierer", exact: true }).click();
  await drawing.locator("path").last().click();
  await expect(drawing.locator("path")).toHaveCount(0);
  await panel.getByRole("button", { name: "Zeichnung rückgängig", exact: true }).click();
  await panel.getByRole("button", { name: "Stift", exact: true }).click();
  await expect(panel.getByLabel("Zeichenfarbe", { exact: true })).toHaveValue("#cc3344");
  await saveOnLeave(page, panel);
  await page.reload(); await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await expect(editor.locator("b,strong")).toHaveText("Text mit Zeichnung.");
  await expect(panel.getByRole("combobox", { name: "Schrift", exact: true })).toContainText("Serif");
  await expect(drawing.locator("path")).toHaveCount(1);
});

test("Alte Seiten öffnen als ein Text; Zeichnungen überstehen Bearbeiten, Radieren und Speichern", async ({ page }) => {
  const panel = await openSummaries(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("core.learningSummaries.v2.catalog-summaries", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, transaction = db.transaction("summaries", "readwrite"), store = transaction.objectStore("summaries"), request = store.getAll();
        request.onsuccess = () => {
          const record = (request.result as { id: string; deckId: string; summary: LearningSummary; revision: number | null; pending: boolean }[]).find((item) => item.summary.title === "Europa im Überblick")!;
          record.summary.pageFormat = "landscape";
          record.summary.pages = [
            { id: "old-one", html: "<p>Erste alte Seite.</p>", strokes: [{ id: "same", tool: "pen", space: "landscape", color: "#657494", width: 3, points: [[80, 160], [200, 200]] }] },
            { id: "old-two", html: "<p>Zweite alte Seite.</p>", strokes: [{ id: "same", tool: "marker", space: "portrait", color: "#e4bf63", width: 12, points: [[80, 160], [200, 200]] }] },
          ];
          store.put(record);
        };
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    });
  });
  await page.reload(); await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await expect(editor).toContainText("Erste alte Seite."); await expect(editor).toContainText("Zweite alte Seite.");
  const drawing = panel.getByRole("img", { name: "Zeichenfläche Zusammenfassung", exact: true });
  await expect(drawing.locator("path")).toHaveCount(2);
  await panel.getByRole("button", { name: "Radierer", exact: true }).click();
  await drawing.locator("g").first().locator("path").last().click();
  await expect(drawing.locator("g")).toHaveCount(1);
  await panel.getByRole("button", { name: "Zeichnung rückgängig", exact: true }).click();
  await panel.getByRole("button", { name: "Schreiben", exact: true }).click();
  await editor.fill("Erste alte Seite. Zweite alte Seite. Neuer Zusatz.");
  await saveOnLeave(page, panel);
  await page.reload(); await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await expect(editor).toHaveText("Erste alte Seite. Zweite alte Seite. Neuer Zusatz.");
  await expect(drawing.locator("path")).toHaveCount(2);
});

test("Zusammenfassungseditor: visuelle Pflichtmatrix für Text und Zeichenwerkzeuge", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  for (const size of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((mode) => { document.documentElement.dataset.coreTheme = mode; }, theme);
      for (const mode of ["Schreiben", "Stift", "Zeichenmarker", "Radierer"]) {
        await panel.getByRole("button", { name: mode, exact: true }).click();
        await panel.locator(".core-summary-tools").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`${size.width}-${theme}-${mode}.png`), animations: "disabled" });
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("button", { name: "Schreiben", exact: true }).click();
  await panel.getByRole("button", { name: "Arbeitsfläche vergrößern", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Zusammenfassung bearbeiten – Arbeitsfläche", exact: true });
  await workspace.getByRole("button", { name: "Weitere Textwerkzeuge", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("390-extra-tools.png"), animations: "disabled" });
  await workspace.getByRole("button", { name: "Stiftfarbe", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("390-text-color.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  if (await workspace.isVisible()) await workspace.getByRole("button", { name: "Arbeitsfläche verkleinern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Arbeitsfläche vergrößern", exact: true })).toBeFocused();
});

test("Zusammenfassungsliste: Reihenfolge, Aktionsflächen und KI-Popover", async ({ page }) => {
  const panel = await openSummaries(page);
  const search = panel.getByRole("textbox", { name: "Zusammenfassungen durchsuchen", exact: true });
  const list = panel.getByTestId("summary-list");
  const ai = panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true });
  expect((await search.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);
  expect((await list.boundingBox())!.y).toBeLessThan((await ai.boundingBox())!.y);
  await expect(ai.locator("button")).toHaveCount(0);
  await expect(panel).not.toContainText("Auf diesem Gerät gespeichert");
  await search.fill("Lissabon");
  await expect(list.getByRole("button")).toHaveCount(1);
  await search.fill("nicht vorhanden");
  await expect(panel).toContainText("Keine passende Zusammenfassung gefunden.");
  await expect(ai).toBeVisible();
  await ai.click();
  const popup = page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true });
  await expect(popup.getByRole("textbox", { name: "Titel", exact: true })).toBeFocused();
  await popup.getByRole("button", { name: "Nur dieser Stapel", exact: true }).click();
  await expect(popup.getByRole("button", { name: "Nur dieser Stapel", exact: true })).toHaveAttribute("aria-pressed", "true");
  await popup.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await popup.getByRole("combobox", { name: "Detailgrad", exact: true }).click();
  await page.getByRole("option", { name: "Detailliert", exact: true }).click();
  await page.keyboard.press("Escape");
  const guard = page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true });
  await guard.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(popup.getByRole("combobox", { name: "Detailgrad", exact: true })).toContainText("Detailliert");
  await popup.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await guard.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(popup).not.toBeVisible();
  await expect(ai).toBeFocused();
  await panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).toBeEmpty();
  await expect(panel).toContainText("Ungespeicherte Änderungen");
});

test("Zusammenfassungsliste und KI-Popover: visuelle Pflichtmatrix", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const catalogPanel = await openSummaries(page);
  await catalogPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("catalog-list.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Stapelinhalte öffnen", exact: true }).click();
  const product = page.locator(".catalog-product-preview");
  await product.getByRole("group", { name: "Stapelinhalte", exact: true }).getByRole("button", { name: "Zusammenfassungen", exact: true }).click();
  const panel = product.getByTestId("deck-summaries-panel");
  await expect(panel.getByTestId("summary-list")).toBeVisible();
  for (const size of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1279, height: 900 }, { width: 1280, height: 900 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((mode) => { document.documentElement.dataset.coreTheme = mode; }, theme);
      await product.evaluate((element) => element.scrollTo({ top: 0 }));
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${theme}-list-top.png`), animations: "disabled" });
      await panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${theme}-list.png`), animations: "disabled" });
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true }).click();
      const popup = page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true });
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${theme}-popover.png`), animations: "disabled" });
      await expect(popup).toHaveAttribute("data-side", "bottom");
      const triggerBox = (await panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true }).boundingBox())!;
      const headerBox = (await product.locator(".catalog-product-bar").boundingBox())!;
      expect(triggerBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
      const box = (await popup.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
      await popup.getByRole("button", { name: "Einstellungen", exact: true }).click();
      await popup.getByRole("combobox", { name: "Detailgrad", exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${theme}-select.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await popup.getByRole("button", { name: "Mit KI erstellen", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${size.width}-${theme}-settings.png`), animations: "disabled" });
      expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(popup).not.toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await panel.scrollIntoViewIfNeeded();
  await panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("200-percent-popover.png"), animations: "disabled" });
});
