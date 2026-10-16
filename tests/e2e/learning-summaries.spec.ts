import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

async function openSummaries(page: Page) {
  await page.goto("./docs/ui-elements.html#screens");
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  const panel = page.getByTestId("deck-summaries-panel");
  await expect(panel.getByTestId("summary-list")).toBeVisible();
  return panel;
}

test("Eine neue Fassung übernimmt die Wünsche; Text und Darstellung bleiben nach Reload", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
  await panel.getByRole("textbox", { name: "Titel", exact: true }).fill("Meine kurze und detaillierte Fassung");
  await panel.getByRole("group", { name: "Länge", exact: true }).getByRole("button", { name: "Kurz", exact: true }).click();
  await panel.getByRole("combobox", { name: "Detailgrad", exact: true }).click();
  await page.getByRole("option", { name: "Detailliert", exact: true }).click();
  await panel.getByRole("textbox", { name: /Thematischer Fokus/ }).fill("Begriffe vergleichen");
  await expect(panel.getByRole("button", { name: "Karten und Quelle", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Weitere Einstellungen", exact: true }).click();
  await panel.getByRole("checkbox", { name: "Karten verlinken und Quellenstellen anzeigen" }).uncheck();
  await panel.getByRole("button", { name: "Fassung anlegen", exact: true }).click();
  await expect(panel).toContainText("Kurz · Detailliert");
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).pressSequentially("Portugal & Spanien: Lissabon und Madrid. ");
  await panel.getByRole("combobox", { name: "Schrift", exact: true }).click();
  await page.getByRole("option", { name: "Serif", exact: true }).click();
  await panel.getByRole("combobox", { name: "Schriftgröße", exact: true }).click();
  await page.getByRole("option", { name: "22", exact: true }).click();
  await panel.getByRole("button", { name: "Alle Zusammenfassungen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Zusammenfassung „Meine kurze und detaillierte Fassung“ öffnen", exact: true })).toBeVisible();
  await expect(panel.getByTestId("summary-list").getByRole("button")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "Zusammenfassungen öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Zusammenfassung „Meine kurze und detaillierte Fassung“ öffnen", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).toHaveText("Portugal & Spanien: Lissabon und Madrid.");
  await expect(panel.getByRole("combobox", { name: "Schrift", exact: true })).toContainText("Serif");
  await expect(panel.getByRole("combobox", { name: "Schriftgröße", exact: true })).toContainText("22");
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
  await panel.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
  await panel.getByRole("textbox", { name: "Titel", exact: true }).fill("KI aus einer Textquelle");
  await panel.getByLabel("Quelle anfügen (optional)").setInputFiles({ name: "skript.txt", mimeType: "text/plain", buffer: Buffer.from("ATP ist ein Energieträger. ADP besitzt zwei Phosphatgruppen.") });
  await expect(panel.getByRole("button", { name: "Nur Quelle", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Nur Quelle", exact: true }).click();
  await panel.getByRole("group", { name: "Länge", exact: true }).getByRole("button", { name: "Kurz", exact: true }).click();
  await panel.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
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
  await panel.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
  const title = panel.getByRole("textbox", { name: "Titel", exact: true });
  await title.fill("Erhaltene Auswahl");
  await panel.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  await expect(panel).toContainText("Der KI-Dienst ist momentan nicht erreichbar");
  await expect(title).toHaveValue("Erhaltene Auswahl");
  await panel.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(panel.getByTestId("summary-list").getByRole("button")).toHaveCount(2);
});

test("Bei Speicherfehlern bleiben KI-Ergebnis und eigene Änderungen als bearbeitbarer Entwurf erhalten", async ({ page }) => {
  const panel = await openSummaries(page);
  await panel.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
  await panel.getByRole("textbox", { name: "Titel", exact: true }).fill("KI mit Speicherfehler");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === "readwrite") throw new Error("Der lokale Speicher ist nicht verfügbar.");
      return original.apply(this, args);
    };
  });
  await panel.getByRole("button", { name: "Mit KI erstellen", exact: true }).click();
  await expect(panel).toContainText("Der lokale Speicher ist nicht verfügbar.");
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).not.toBeEmpty();
  await expect(panel).toContainText("Ungespeicherte Änderungen");
  await panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true }).fill("Mein eigener Text");
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true })).toHaveText("Mein eigener Text");
  await expect(panel).toContainText("Der lokale Speicher ist nicht verfügbar.");
});
