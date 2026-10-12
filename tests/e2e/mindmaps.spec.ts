import { expect, test, type Page } from "@playwright/test";

async function openMindMaps(page: Page) {
  await page.goto("/docs/ui-elements.html#screens");
  await page.getByRole("button", { name: "Mindmaps öffnen", exact: true }).click();
  const panel = page.getByTestId("deck-mindmaps-panel");
  await expect(panel.getByRole("button", { name: "Leere Mindmap", exact: true })).toBeVisible({ timeout: 15_000 });
  return panel;
}

test("freie Mindmap: Ziehen, Text, Verknüpfen, Zeichnen, Undo und Reload", async ({ page }) => {
  let aiRequests = 0;
  await page.route("**/api/ai/**", (route) => { aiRequests++; return route.abort(); });
  const panel = await openMindMaps(page);
  await panel.getByRole("button", { name: "Leere Mindmap", exact: true }).click();
  await panel.getByRole("textbox", { name: "Mindmap-Titel" }).fill("Meine freie Fläche");
  await panel.getByRole("button", { name: "Stichwort", exact: true }).click();
  await panel.getByRole("textbox", { name: "Stichwort bearbeiten", exact: true }).fill("Energie");
  await panel.getByRole("textbox", { name: "Eigener Text zum Stichwort" }).fill("ATP transportiert Energie.");
  await panel.getByRole("button", { name: "Textdetails schließen" }).click();
  const node = panel.getByTestId("mindmap-node").first();
  const before = await node.evaluate((element) => ({ x: (element as HTMLElement).style.left, y: (element as HTMLElement).style.top }));
  await node.scrollIntoViewIfNeeded();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 170, box.y + box.height / 2 - 80, { steps: 8 }); await page.mouse.up();
  expect(await node.evaluate((element) => (element as HTMLElement).style.left)).not.toBe(before.x);
  await expect(panel.getByTestId("mindmap-details")).not.toBeVisible();
  await panel.getByRole("button", { name: "Textfeld", exact: true }).click();
  await panel.getByRole("textbox", { name: "Stichwort bearbeiten" }).fill("Freie Notiz");
  await panel.getByRole("textbox", { name: "Eigener Text zum Stichwort" }).fill("Auch außerhalb der Mindmap kann ich schreiben.");
  await panel.getByRole("button", { name: "Textdetails schließen" }).click();
  await panel.getByRole("group", { name: "Werkzeug", exact: true }).getByRole("button", { name: "Verknüpfen", exact: true }).click();
  await panel.getByRole("button", { name: "Stichwort „Energie“ öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Textfeld „Freie Notiz“ öffnen", exact: true }).click();
  await expect(panel.locator(".core-mindmap-edges path")).toHaveCount(1);
  await panel.getByRole("button", { name: "Textdetails schließen" }).click();
  await panel.getByRole("group", { name: "Werkzeug", exact: true }).getByRole("button", { name: "Stift", exact: true }).click();
  const canvas = panel.getByTestId("mindmap-canvas"); await canvas.scrollIntoViewIfNeeded();
  const area = (await canvas.boundingBox())!;
  await page.mouse.move(area.x + 60, area.y + 60); await page.mouse.down(); await page.mouse.move(area.x + 180, area.y + 90, { steps: 12 }); await page.mouse.up();
  await expect(panel.locator(".core-mindmap-ink")).toHaveCount(1);
  await panel.getByRole("group", { name: "Werkzeug", exact: true }).getByRole("button", { name: "Radierer", exact: true }).click();
  await panel.locator(".core-mindmap-eraser-hit").click();
  await expect(panel.locator(".core-mindmap-ink")).toHaveCount(0);
  await panel.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(panel.locator(".core-mindmap-ink")).toHaveCount(1);
  await panel.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(panel.locator(".core-mindmap-ink")).toHaveCount(0);
  await panel.getByRole("button", { name: "Wiederholen", exact: true }).click();
  await expect(panel.locator(".core-mindmap-ink")).toHaveCount(1);
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).toContainText("Mindmap lokal gespeichert");
  await page.reload();
  await page.getByRole("button", { name: "Mindmaps öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Mindmap „Meine freie Fläche“ öffnen", exact: true }).click();
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(2);
  await expect(panel.locator(".core-mindmap-edges path")).toHaveCount(1);
  await expect(panel.locator(".core-mindmap-ink")).toHaveCount(1);
  await panel.getByRole("button", { name: "Stichwort „Energie“ öffnen", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Eigener Text zum Stichwort" })).toHaveValue("ATP transportiert Energie.");
  await panel.getByRole("button", { name: "Verbindung zu „Freie Notiz“ lösen", exact: true }).click();
  await expect(panel.locator(".core-mindmap-edges path")).toHaveCount(0);
  await panel.getByRole("button", { name: "Element entfernen", exact: true }).click();
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(1);
  await panel.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(2);
  expect(aiRequests).toBe(0);
});

test("Zusammenfassung liefert nur ihre zugehörigen Textstellen; eigene Notizen bleiben separat", async ({ page }) => {
  let aiRequests = 0;
  await page.route("**/api/ai/**", (route) => { aiRequests++; return route.abort(); });
  const panel = await openMindMaps(page);
  await panel.getByRole("button", { name: "Aus Zusammenfassung", exact: true }).click();
  await panel.getByRole("button", { name: "Mindmap erstellen", exact: true }).click();
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(7);
  await expect(panel.locator(".core-mindmap-edges path")).toHaveCount(6);
  await panel.getByRole("button", { name: "Stichwort „Portugal“ öffnen", exact: true }).click();
  await expect(panel.getByTestId("mindmap-source-passage")).toContainText("Lissabon ist die Hauptstadt von Portugal.");
  await expect(panel.getByTestId("mindmap-source-passage")).not.toContainText("Madrid");
  await panel.getByRole("textbox", { name: "Eigener Text zum Stichwort" }).fill("Mein ergänzter Merksatz.");
  await panel.getByRole("button", { name: "Quelle: Europa und ihre Hauptstädte", exact: true }).click();
  await expect(panel.getByTestId("mindmap-details")).toContainText("Gespeicherte Fassung vom");
  await expect(panel.getByTestId("mindmap-details")).toContainText("Madrid");
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await panel.getByRole("button", { name: "Alle Mindmaps", exact: true }).click();
  await panel.getByRole("button", { name: "Mindmap „Europa und ihre Hauptstädte“ öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Stichwort „Portugal“ öffnen", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Eigener Text zum Stichwort" })).toHaveValue("Mein ergänzter Merksatz.");
  expect(aiRequests).toBe(0);
});

test("Entwurfsschutz und Speicherfehler erhalten den Inhalt", async ({ page }) => {
  const panel = await openMindMaps(page);
  await panel.getByRole("button", { name: "Leere Mindmap", exact: true }).click();
  await panel.getByRole("textbox", { name: "Mindmap-Titel" }).fill("");
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).toContainText("Bitte gib deiner Mindmap einen Titel");
  await panel.getByRole("textbox", { name: "Mindmap-Titel" }).fill("Geschützter Entwurf");
  await panel.getByRole("button", { name: "Alle Mindmaps", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Mindmap-Titel" })).toHaveValue("Geschützter Entwurf");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (this.name.startsWith("core.learningMindMaps") && args[1] === "readwrite") throw new Error("Mindmap-Test: Speicher nicht verfügbar.");
      return original.apply(this, args);
    };
  });
  await panel.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).toContainText("Mindmap-Test: Speicher nicht verfügbar.");
  await expect(panel.getByRole("textbox", { name: "Mindmap-Titel" })).toHaveValue("Geschützter Entwurf");
  await panel.getByRole("button", { name: "Alle Mindmaps", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(panel).toContainText("Platz für deine Gedanken");
});

test("Mindmap-Entwurf wird beim Wechsel des Inhaltstabs geschützt", async ({ page }) => {
  await page.goto("/docs/ui-elements.html?screen=deck-content#screens");
  const tabs = page.getByRole("group", { name: "Stapelinhalte", exact: true });
  await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  const panel = page.getByTestId("deck-mindmaps-panel");
  await panel.getByRole("button", { name: "Leere Mindmap", exact: true }).click();
  await panel.getByRole("textbox", { name: "Mindmap-Titel" }).fill("Mein Tab-Entwurf");
  await tabs.getByRole("button", { name: "Karten", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true });
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(panel).not.toBeVisible();
  await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Mindmap „Mein Tab-Entwurf“ öffnen", exact: true })).toBeVisible();
});
