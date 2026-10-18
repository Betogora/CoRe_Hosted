import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

async function openSummaries(page: Page) {
  await page.goto("./docs/ui-elements.html#screens");
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  const panel = page.getByTestId("deck-summaries-panel");
  await expect(panel.getByTestId("summary-list")).toBeVisible();
  return panel;
}

test("Zwei vollständige Aktionsflächen stehen nach Suche und Fassungen; Schreiben startet direkt im Editor", async ({ page }) => {
  const panel = await openSummaries(page);
  await expect(panel.getByRole("button", { name: "Neue Zusammenfassung", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Mit KI erstellen", exact: true })).toHaveCount(0);
  await panel.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true }).fill("Meine eigene Fassung");
  await editor.fill("Mein selbst geschriebener Überblick.");
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByTestId("summary-list").getByRole("button")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Meine eigene Fassung“ öffnen", exact: true }).click();
  await expect(editor).toHaveText("Mein selbst geschriebener Überblick.");
});

test("Auch ohne Fassungen bleiben beide Aktionen erreichbar und die KI-Erstellung funktioniert", async ({ page }) => {
  const panel = await openSummaries(page);
  for (const title of ["Europa im Überblick", "Vor der nächsten Wiederholung"]) {
    await panel.getByRole("button", { name: `Zusammenfassung „${title}“ öffnen`, exact: true }).click();
    await panel.getByRole("button", { name: "Löschen", exact: true }).click();
    await page.getByRole("dialog", { name: "Zusammenfassung löschen?", exact: true }).getByRole("button", { name: "Löschen", exact: true }).click();
  }
  await expect(panel.getByTestId("summary-list")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true }).click();
  await page.getByRole("group", { name: "Umfang", exact: true }).getByRole("button", { name: "Nur dieser Stapel", exact: true }).click();
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).not.toBeEmpty();
  await expect(panel).toContainText("Mit KI erstellt");
  await expect(panel).toContainText("Grundlage: Dieser Stapel");
});

test("Eine neue Fassung übernimmt die Wünsche; Text und Darstellung bleiben nach Reload", async ({ page }) => {
  const panel = await openSummaries(page);
  await openAiSettings(page, panel);
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Meine kurze und detaillierte Fassung");
  await page.getByRole("group", { name: "Länge", exact: true }).getByRole("button", { name: "Kurz", exact: true }).click();
  await page.getByRole("combobox", { name: "Detailgrad", exact: true }).click();
  await page.getByRole("option", { name: "Detailliert", exact: true }).click();
  await page.getByRole("textbox", { name: /Thematischer Fokus/ }).fill("Begriffe vergleichen");
  await expect(page.getByRole("button", { name: "Karten und Quelle", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Karten verlinken und Quellenstellen anzeigen" }).uncheck();
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  await expect(panel).toContainText("Kurz · Detailliert");
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).fill("Portugal & Spanien: Lissabon und Madrid.");
  await settings(page);
  await page.getByRole("combobox", { name: "Schrift", exact: true }).click();
  await page.getByRole("option", { name: "Serif", exact: true }).click();
  await page.getByRole("combobox", { name: "Schriftgröße", exact: true }).click();
  await page.getByRole("option", { name: "22", exact: true }).click();
  await page.getByRole("button", { name: "Seiteneinstellungen schließen", exact: true }).click();
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Zusammenfassung „Meine kurze und detaillierte Fassung“ öffnen", exact: true })).toBeVisible();
  await expect(panel.getByTestId("summary-list").getByRole("button")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Meine kurze und detaillierte Fassung“ öffnen", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).toHaveText("Portugal & Spanien: Lissabon und Madrid.");
  await settings(page);
  await expect(page.getByRole("combobox", { name: "Schrift", exact: true })).toContainText("Serif");
  await expect(page.getByRole("combobox", { name: "Schriftgröße", exact: true })).toContainText("22");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Duplizieren speichert vorher offene Änderungen und öffnet die Kopie; Löschen fragt nach und bleibt nach Reload", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Vor der nächsten Wiederholung“ öffnen", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await editor.click(); await editor.press("End"); await editor.pressSequentially(" Ergänzt.");
  await panel.getByRole("button", { name: "Duplizieren", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true })).toHaveValue("Kopie von Vor der nächsten Wiederholung");
  await expect(editor).toContainText("Ergänzt.");
  await panel.getByRole("button", { name: "Löschen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Zusammenfassung löschen?", exact: true });
  await expect(dialog).toContainText("„Kopie von Vor der nächsten Wiederholung“ wird endgültig gelöscht.");
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await panel.getByRole("button", { name: "Löschen", exact: true }).click();
  await dialog.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(panel.getByTestId("summary-list")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Zusammenfassung „Kopie von Vor der nächsten Wiederholung“ öffnen", exact: true })).toHaveCount(0);
  await page.reload(); await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Zusammenfassung „Kopie von Vor der nächsten Wiederholung“ öffnen", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Zusammenfassung „Vor der nächsten Wiederholung“ öffnen", exact: true }).click();
  await expect(editor).toContainText("Ergänzt.");
});

test("KI-Zusammenfassung übernimmt Quellenwahl und bleibt nach Bearbeiten und Reload erhalten", async ({ page }) => {
  const panel = await openSummaries(page);
  await openAiSettings(page, panel);
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("KI aus einer Textquelle");
  await page.getByLabel("Quelle anfügen (optional)").setInputFiles({ name: "skript.txt", mimeType: "text/plain", buffer: Buffer.from("ATP ist ein Energieträger. ADP besitzt zwei Phosphatgruppen.") });
  await expect(page.getByRole("button", { name: "Nur Quelle", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Nur Quelle", exact: true }).click();
  await page.getByRole("group", { name: "Länge", exact: true }).getByRole("button", { name: "Kurz", exact: true }).click();
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await expect(editor).toContainText("ATP ist ein Energieträger");
  await expect(editor).toContainText("skript.txt");
  await expect(panel).toContainText("Mit KI erstellt · 1 Materialeinheit");
  await editor.fill("Mein bearbeitetes KI-Ergebnis.");
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „KI aus einer Textquelle“ öffnen", exact: true }).click();
  await expect(editor).toHaveText("Mein bearbeitetes KI-Ergebnis.");
});

test("KI-Fehler erhalten Formular und bestehende Fassungen", async ({ page }) => {
  const panel = await openSummaries(page);
  await page.getByRole("combobox", { name: "KI-Demoantwort", exact: true }).click();
  await page.getByRole("option", { name: "Fehler", exact: true }).click();
  await openAiSettings(page, panel);
  const title = page.getByRole("textbox", { name: "Titel", exact: true });
  await title.fill("Erhaltene Auswahl");
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true })).toContainText("Der KI-Dienst ist momentan nicht erreichbar");
  await expect(title).toHaveValue("Erhaltene Auswahl");
  await page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true }).getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(panel.getByTestId("summary-list").getByRole("button")).toHaveCount(2);
});

test("Bei Speicherfehlern bleiben KI-Ergebnis und eigene Änderungen als bearbeitbarer Entwurf erhalten", async ({ page }) => {
  const panel = await openSummaries(page);
  await openAiSettings(page, panel);
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("KI mit Speicherfehler");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === "readwrite") throw new Error("Der lokale Speicher ist nicht verfügbar.");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  await expect(panel).toContainText("Der lokale Speicher ist nicht verfügbar.");
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).not.toBeEmpty();
  await expect(panel).toContainText("Ungespeicherte Änderungen");
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).fill("Mein eigener Text");
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).toHaveText("Mein eigener Text");
  await expect(panel).toContainText("Der lokale Speicher ist nicht verfügbar.");
});

async function openAiSettings(page: Page, panel: ReturnType<Page["getByTestId"]>) {
  await panel.getByRole("button", { name: "Zusammenfassung mit KI erstellen", exact: true }).click();
  await page.getByRole("dialog", { name: "Zusammenfassung mit KI erstellen", exact: true }).getByRole("button", { name: "Einstellungen", exact: true }).click();
}

async function settings(page: Page) {
  await page.getByRole("button", { name: "Seiteneinstellungen", exact: true }).click();
  return page.getByRole("dialog", { name: "Seiteneinstellungen", exact: true });
}
async function chooseFormat(page: Page, label: string) {
  const menu = await settings(page);
  await menu.getByRole("combobox", { name: "Seitenformat", exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await menu.getByRole("button", { name: "Seiteneinstellungen schließen", exact: true }).click();
}
async function drawingHistory(page: Page, label: string) {
  const menu = await settings(page);
  await menu.getByRole("button", { name: label, exact: true }).click();
  await menu.getByRole("button", { name: "Seiteneinstellungen schließen", exact: true }).click();
}

test("A4-Seiten speichern Text, Zeichenstriche, Radierer und Wiederherstellung", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung schreiben", exact: true }).click();
  await panel.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true }).fill("Meine Seiten mit Zeichnungen");
  const first = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await first.fill("Mein eigener Text mit Zeichnung.");
  await first.press("ControlOrMeta+a");
  await panel.getByRole("button", { name: "Fett", exact: true }).click();
  await expect(first.locator("b, strong")).toHaveText("Mein eigener Text mit Zeichnung.");
  await panel.getByRole("button", { name: "Stift", exact: true }).click();
  const drawing = panel.getByRole("img", { name: "Zeichenfläche Seite 1", exact: true });
  await drawing.scrollIntoViewIfNeeded();
  const box = (await drawing.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 180, { steps: 10 });
  await page.mouse.up();
  await expect(drawing.locator("path")).toHaveCount(1);
  await drawingHistory(page, "Zeichnung rückgängig");
  await expect(drawing.locator("path")).toHaveCount(0);
  await drawingHistory(page, "Zeichnung wiederholen");
  await expect(drawing.locator("path")).toHaveCount(1);
  await panel.getByRole("button", { name: "Radierer", exact: true }).click();
  await drawing.locator("path").last().click();
  await expect(drawing.locator("path")).toHaveCount(0);
  await drawingHistory(page, "Zeichnung rückgängig");
  await panel.getByRole("button", { name: "Seite hinzufügen", exact: true }).click();
  await panel.getByRole("button", { name: "Schreiben", exact: true }).click();
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten · Seite 2", exact: true }).fill("Meine zweite Seite.");
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).toContainText("Gespeichert");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Meine Seiten mit Zeichnungen“ öffnen", exact: true }).click();
  await expect(first).toHaveText("Mein eigener Text mit Zeichnung.");
  await expect(first.locator("b, strong")).toHaveText("Mein eigener Text mit Zeichnung.");
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten · Seite 2", exact: true })).toHaveText("Meine zweite Seite.");
  await expect(drawing.locator("path")).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Leere Seite 2 entfernen", exact: true })).toBeDisabled();
});

test("Langer Text bricht mit Formatierung vollständig auf neue A4-Seiten um", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  const paragraphs = Array.from({ length: 90 }, (_, index) => `<p><strong>Absatz ${index + 1}</strong> erklärt einen Zusammenhang mit Beispielen und erhält alle Inhalte.</p>`).join("");
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).evaluate((element, html) => {
    element.innerHTML = html;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
  }, paragraphs);
  await expect.poll(() => panel.locator("[data-summary-page]").count()).toBeGreaterThan(1);
  await expect(panel.locator(".rich-text-field").last()).toContainText("Absatz 90");
  const content = (await panel.locator(".rich-text-field").allTextContents()).join("");
  for (let index = 1; index <= 90; index += 1) expect(content).toContain(`Absatz ${index} erklärt`);
  await expect(panel.locator(".rich-text-field strong").first()).toContainText("Absatz 1");
  const overflow = await panel.locator(".rich-text-field").evaluateAll((fields) => fields.some((field) => field.scrollHeight > field.clientHeight + 1));
  expect(overflow).toBe(false);
});

test("Zusammenfassungseditor: visuelle Pflichtmatrix", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  const menu = await settings(page);
  await menu.getByRole("button", { name: "Arbeitsfläche vergrößern", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Zusammenfassung bearbeiten – Arbeitsfläche", exact: true });
  for (const size of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((mode) => { document.documentElement.dataset.coreTheme = mode; }, theme);
      for (const [label, format] of [["Hochformat", "portrait"], ["Querformat", "landscape"], ["Infinity", "infinity"]]) {
        await chooseFormat(page, label);
        await expect(workspace).toHaveAttribute("data-format", format);
        await page.screenshot({ path: testInfo.outputPath(size.width + "-" + theme + "-" + format + ".png"), animations: "disabled" });
        expect(await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        const toolbar = await workspace.locator(".core-summary-tools").boundingBox();
        expect(toolbar!.height).toBeLessThanOrEqual(size.width < 700 ? 112 : 60);
        if (format !== "infinity") {
          const sheet = await workspace.locator(".core-summary-page-scaled").first().boundingBox();
          expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(size.height);
          expect(sheet!.x).toBeGreaterThanOrEqual(0);
          expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(size.width);
        }
      }
      await workspace.getByRole("button", { name: "Stift", exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(size.width + "-" + theme + "-drawing.png"), animations: "disabled" });
      await workspace.getByRole("button", { name: "Schreiben", exact: true }).click();
      const popup = await settings(page);
      expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(size.width + "-" + theme + "-settings.png"), animations: "disabled" });
      await popup.getByRole("button", { name: "Seiteneinstellungen schließen", exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseFormat(page, "Hochformat");
  await workspace.getByRole("button", { name: "Weitere Textwerkzeuge", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("390-extra-tools.png"), animations: "disabled" });
  await workspace.getByRole("button", { name: "Stiftfarbe", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("390-text-color.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  if (await workspace.isVisible()) await workspace.getByRole("button", { name: "Arbeitsfläche verkleinern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Seiteneinstellungen", exact: true })).toBeFocused();
  for (const size of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((mode) => { document.documentElement.dataset.coreTheme = mode; }, theme);
      await panel.locator(".core-summary-tools").scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(size.width + "-" + theme + "-inline.png"), animations: "disabled" });
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
  }
  const expandedMenu = await settings(page);
  await expandedMenu.getByRole("button", { name: "Arbeitsfläche vergrößern", exact: true }).click();
  for (const width of [655, 656, 657, 847, 848, 849]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: testInfo.outputPath(width + "-boundary.png"), animations: "disabled" });
    expect(await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});

test("Vergrößerte Arbeitsfläche hält Fehler sichtbar und gibt den Fokus zurück", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  const menu = await settings(page);
  await menu.getByRole("button", { name: "Arbeitsfläche vergrößern", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Zusammenfassung bearbeiten – Arbeitsfläche", exact: true });
  await workspace.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true }).fill("");
  await workspace.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(workspace).toContainText("Bitte gib einen Titel");
  await expect(workspace.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true })).toBeFocused();
  await workspace.getByRole("textbox", { name: "Titel der Zusammenfassung", exact: true }).fill("Europa im Überblick");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === "readwrite") throw new Error("Der lokale Speicher ist nicht verfügbar.");
      return original.apply(this, args);
    };
  });
  await workspace.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(workspace).toContainText("Der lokale Speicher ist nicht verfügbar.");
  await page.keyboard.press("Escape");
  await expect(workspace).not.toBeVisible();
  await expect(panel.getByRole("button", { name: "Seiteneinstellungen", exact: true })).toBeFocused();
});

test("Seitenformate erhalten Zeichnungen und Infinity nach Reload", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await chooseFormat(page, "Querformat");
  await panel.getByRole("button", { name: "Stift", exact: true }).click();
  const paper = panel.getByRole("img", { name: "Zeichenfläche Seite 1", exact: true });
  const box = (await paper.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 10 });
  await page.mouse.up();
  const stroke = await paper.locator("path").getAttribute("d");
  await chooseFormat(page, "Infinity");
  const canvas = panel.getByRole("region", { name: "Infinity-Arbeitsfläche", exact: true });
  const ink = panel.getByRole("img", { name: "Zeichenfläche Infinity", exact: true });
  await expect(ink.locator("path")).toHaveAttribute("d", stroke!);
  await panel.getByRole("button", { name: "Fläche verschieben", exact: true }).click();
  const area = (await canvas.boundingBox())!;
  await page.mouse.move(area.x + 100, area.y + 100);
  await page.mouse.down();
  await page.mouse.move(area.x + 220, area.y + 180, { steps: 8 });
  await page.mouse.up();
  await expect(ink.locator(":scope > g")).toHaveAttribute("transform", "translate(152 112) scale(1)");
  await panel.getByRole("button", { name: "Stift", exact: true }).click();
  await page.mouse.move(area.x + 20, area.y + 20);
  await page.mouse.down();
  await page.mouse.move(area.x + 70, area.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect(ink.locator("path")).toHaveCount(2);
  const zoomMenu = await settings(page);
  await zoomMenu.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect(ink.locator(":scope > g")).toHaveAttribute("transform", /scale\(1\.25\)/);
  await zoomMenu.getByRole("button", { name: "Seiteneinstellungen schließen", exact: true }).click();
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).toContainText("Gespeichert");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(ink.locator("path")).toHaveCount(2);
  await chooseFormat(page, "Hochformat");
  await expect(paper.locator("path")).toHaveCount(2);
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).toContainText("Lissabon");
  await chooseFormat(page, "Infinity");
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).fill("Langer Text ohne Seitenumbruch. ".repeat(200));
  await expect(panel.locator("[data-summary-page]")).toHaveCount(1);
});

test("Leere Zeilen belegen Seiten und schneiden folgenden Text nicht ab", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).evaluate((element) => {
    element.innerHTML = "<p><br></p>".repeat(75) + "<p>Text nach den Leerzeilen</p>";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await expect.poll(() => panel.locator("[data-summary-page]").count()).toBeGreaterThan(1);
  await expect(panel.locator(".rich-text-field").last()).toContainText("Text nach den Leerzeilen");
});



test("Neuerzeugen ersetzt Seitentext und erhält Zeichnungen und Format", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await chooseFormat(page, "Querformat");
  const editor = panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await editor.fill("Veralteter Seitentext");
  await panel.getByRole("button", { name: "Stift", exact: true }).click();
  const drawing = panel.getByRole("img", { name: "Zeichenfläche Seite 1", exact: true });
  const box = (await drawing.boundingBox())!;
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).toContainText("Gespeichert");
  await panel.getByRole("button", { name: "Neu erzeugen", exact: true }).click();
  await page.getByRole("dialog", { name: "Fassung neu erzeugen?", exact: true }).getByRole("button", { name: "Neu erzeugen", exact: true }).click();
  await expect(editor).not.toContainText("Veralteter Seitentext");
  await expect(editor).not.toBeEmpty();
  await expect(drawing.locator("path")).toHaveCount(1);
  await expect(panel.locator(".core-summary-document-editor")).toHaveAttribute("data-format", "landscape");
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Europa im Überblick“ öffnen", exact: true }).click();
  await expect(editor).not.toContainText("Veralteter Seitentext");
  await expect(drawing.locator("path")).toHaveCount(1);
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
