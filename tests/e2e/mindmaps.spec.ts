import { expect, test, type Page, type Locator } from "@playwright/test";

test.setTimeout(90_000);
async function openMindMaps(page: Page) {
  await page.goto("./docs/ui-elements.html#screens");
  await page.getByRole("button", { name: "Mindmaps öffnen", exact: true }).click();
  const panel = page.getByTestId("deck-mindmaps-panel");
  await expect(panel.getByTestId("mindmap-canvas")).toBeVisible();
  return panel;
}
async function mode(panel: Locator, name: string) { await panel.getByRole("group", { name: "Mindmap-Werkzeug", exact: true }).getByRole("button", { name, exact: true }).click(); }
async function finish(panel: Locator) { await panel.getByRole("button", { name: "Bearbeitung abschließen", exact: true }).click(); await panel.getByTestId("mindmap-canvas").evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })); }
async function topic(panel: Locator, title: string) { await panel.getByRole("textbox", { name: "Kartentitel bearbeiten", exact: true }).fill(title); await finish(panel); }
function node(panel: Locator, label: string) { return panel.getByRole("button", { name: new RegExp(`^(Stichwort|Textkarte) „${label}“ auswählen$`) }); }
async function fit(panel: Locator) {
  await panel.getByRole("button", { name: "Alles anzeigen", exact: true }).click();
  await panel.getByTestId("mindmap-canvas").evaluate(async (el) => {
    await new Promise(requestAnimationFrame); el.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  });
}
async function root(panel: Locator, title = "Main") { await panel.getByRole("button", { name: "Erstes Thema", exact: true }).click(); await topic(panel, title); }
async function children(panel: Locator) {
  await root(panel); await node(panel, "Main").getByRole("button", { name: "Unterknoten hinzufügen", exact: true }).click(); await topic(panel, "Ast A");
  await node(panel, "Ast A").getByRole("button", { name: "Stichwort auf gleicher Ebene hinzufügen", exact: true }).click(); await topic(panel, "Ast B");
  await fit(panel);
}
async function selectPair(panel: Locator) { await fit(panel); await node(panel, "Ast A").click(); await node(panel, "Ast B").click({ modifiers: ["Shift"] }); }
async function save(panel: Locator) { await expect(panel.getByRole("status").filter({ hasText: /^Gespeichert$/ })).toBeAttached(); }
async function reload(page: Page, panel: Locator) { await page.reload(); await page.getByRole("button", { name: "Mindmaps öffnen", exact: true }).click(); await expect(panel.getByTestId("mindmap-canvas")).toBeVisible(); await fit(panel); }
const image = { name: "energie.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN6cAAAAASUVORK5CYII=", "base64") };

test("Werkzeugzeile ohne Namen, Speichern und Bewegungsmodus; alle Textoptionen direkt sichtbar", async ({ page }) => {
  const panel = await openMindMaps(page), top = panel.locator(".core-mindmap-primary-tools");
  await expect(panel.getByRole("textbox", { name: "Mindmap-Titel", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Speichern", exact: true })).toHaveCount(0);
  await expect(top.getByRole("button", { name: "Bewegen", exact: true })).toHaveCount(0);
  await expect(top.getByRole("button", { name: "Aus Zusammenfassung", exact: true })).toBeVisible();
  await root(panel, "Zentriertes Stichwort");
  await expect(node(panel, "Zentriertes Stichwort").locator(".core-mindmap-node-label")).toHaveCSS("text-align", "center");
  await node(panel, "Zentriertes Stichwort").dblclick();
  await expect(panel.getByRole("button", { name: "Weitere Textwerkzeuge", exact: true })).toHaveCount(0);
  for (const name of ["Unterstrichen", "Stichpunkte", "Nummerierte Liste", "Formatierung löschen"]) await expect(panel.getByRole("button", { name, exact: true })).toBeVisible();
  await panel.getByRole("group", { name: "Kastenart", exact: true }).getByRole("button", { name: "Textkarte", exact: true }).click(); await finish(panel);
  const card = node(panel, "Zentriertes Stichwort"), label = card.locator(".core-mindmap-node-label");
  expect(await label.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(await card.evaluate((el) => getComputedStyle(el).backgroundColor));
  await mode(panel, "Hinzufügen"); await expect(panel.getByRole("button", { name: "Unterknoten", exact: true })).toHaveCount(0);
});

test("Oben erzeugte Karten werden beim Verknüpfen gleichartige Äste und lassen sich direkt ziehen", async ({ page }) => {
  const panel = await openMindMaps(page); await children(panel);
  await panel.locator(".core-mindmap-primary-tools").getByRole("button", { name: "Textfeld", exact: true }).click(); await topic(panel, "Angehängte Notiz");
  await mode(panel, "Verknüpfen"); await fit(panel); await node(panel, "Angehängte Notiz").click(); await node(panel, "Ast A").click();
  await expect(panel.locator(".core-mindmap-hierarchy path")).toHaveCount(3); await expect(panel.locator(".core-mindmap-edges path")).toHaveCount(0); await fit(panel);
  const card = node(panel, "Angehängte Notiz"); await expect(card).toHaveAttribute("data-color", (await node(panel, "Ast A").getAttribute("data-color"))!);
  await mode(panel, "Verknüpfen"); await card.click();
  const before = await card.evaluate((el) => (el as HTMLElement).style.left), r = await card.boundingBox();
  await page.mouse.move(r!.x + r!.width / 2, r!.y + r!.height / 2); await page.mouse.down(); await page.mouse.move(r!.x + r!.width / 2 + 35, r!.y + r!.height / 2 + 20, { steps: 6 }); await page.mouse.up();
  expect(await card.evaluate((el) => (el as HTMLElement).style.left)).not.toBe(before);
  await save(panel); await reload(page, panel); await expect(panel.locator(".core-mindmap-hierarchy path")).toHaveCount(3);
});

test("Schreiben bearbeitet ausgewählte Karten oder freies Flächentext-HTML mit Bewegung und Löschung", async ({ page }) => {
  const panel = await openMindMaps(page); await root(panel, "Karte");
  await mode(panel, "Gestalten"); await panel.getByRole("group", { name: "Gestalten", exact: true }).getByRole("button", { name: "Schreiben", exact: true }).click();
  await panel.getByRole("textbox", { name: "Kartentext bearbeiten" }).fill("Direkt in der ausgewählten Karte"); await finish(panel);
  await panel.getByTestId("mindmap-canvas").press("Escape"); await mode(panel, "Gestalten");
  const canvas = panel.getByTestId("mindmap-canvas"); await canvas.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })); await canvas.click({ position: { x: 80, y: 150 } });
  const editor = panel.getByRole("textbox", { name: "Text auf der Fläche bearbeiten" }); await editor.fill("Freie Worte"); await editor.press("Control+A"); await panel.getByRole("button", { name: "Fett", exact: true }).click(); await finish(panel);
  const text = panel.getByTestId("mindmap-free-text"); await expect(text.locator("b,strong")).toHaveText("Freie Worte"); await expect(text.locator(".core-mindmap-node-label")).toHaveCount(0); await expect(text.getByRole("button", { name: "Unterknoten hinzufügen" })).toHaveCount(0);
  await text.press("ArrowRight"); const position = await text.evaluate((el) => (el as HTMLElement).style.left); await save(panel); await reload(page, panel); expect(await text.evaluate((el) => (el as HTMLElement).style.left)).toBe(position);
  await text.dblclick(); await panel.getByRole("button", { name: "Text entfernen", exact: true }).click(); await expect(text).toHaveCount(0); await panel.getByRole("button", { name: "Rückgängig", exact: true }).click(); await expect(text).toHaveCount(1);
});

test("Automatisches Speichern erhält Änderungen während einer laufenden Transaktion", async ({ page }) => {
  const panel = await openMindMaps(page); await root(panel, "Persistenznotiz"); await save(panel); await node(panel, "Persistenznotiz").dblclick();
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
      const tx = transaction.apply(this, args);
      if (args[1] === "readwrite") {
        IDBDatabase.prototype.transaction = transaction;
        Object.defineProperty(tx, "oncomplete", { set(handler: (event: Event) => void) { tx.addEventListener("complete", (event) => { setTimeout(() => handler.call(tx, event), 1200); }); } });
      }
      return tx;
    };
  });
  const editor = panel.getByRole("textbox", { name: "Kartentext bearbeiten" }); await editor.fill("Erster Stand");
  await expect(panel).toHaveAttribute("aria-busy", "true"); await editor.fill("Letzter Stand während der Speicherung"); await finish(panel); await expect(panel).toHaveAttribute("aria-busy", "false"); await save(panel); await reload(page, panel);
  await node(panel, "Persistenznotiz").dblclick(); await expect(panel.getByRole("textbox", { name: "Kartentext bearbeiten" })).toHaveText("Letzter Stand während der Speicherung");
});

test("Freie Text- und Markerfarben erhalten die Auswahl trotz Fokuswechsel und Reload", async ({ page }) => {
  const panel = await openMindMaps(page); await root(panel, "Formatierte Notiz"); await node(panel, "Formatierte Notiz").dblclick();
  const editor = panel.getByRole("textbox", { name: "Kartentext bearbeiten", exact: true }); await editor.fill("Farbe bleibt gespeichert.");
  for (const [label, color, property, expected] of [["Stiftfarbe", "#123abc", "color", "rgb(18, 58, 188)"], ["Markerfarbe", "#e8cd64", "backgroundColor", "rgb(232, 205, 100)"]] as const) {
    await editor.press("Control+A"); await panel.getByRole("button", { name: label, exact: true }).click(); await panel.getByRole("dialog", { name: label, exact: true }).getByRole("textbox").fill(color);
    await expect.poll(() => editor.evaluate((el, args) => Array.from(el.querySelectorAll("*")).some((n) => getComputedStyle(n)[args.property] === args.expected), { property, expected })).toBe(true);
    await panel.getByRole("button", { name: label, exact: true }).click();
  }
  await finish(panel); await save(panel); await reload(page, panel); await node(panel, "Formatierte Notiz").dblclick();
  expect(await editor.evaluate((el) => Array.from(el.querySelectorAll("*")).some((n) => getComputedStyle(n).color === "rgb(18, 58, 188)"))).toBe(true);
  expect(await editor.evaluate((el) => Array.from(el.querySelectorAll("*")).some((n) => getComputedStyle(n).backgroundColor === "rgb(232, 205, 100)"))).toBe(true);
});

test("Direkte Bearbeitung, automatische Werkzeugwahl und fette Titel mit normalem Text", async ({ page }) => {
  const panel = await openMindMaps(page); await root(panel, "Energie");
  await node(panel, "Energie").dblclick();
  await expect(panel.getByRole("group", { name: "Mindmap-Werkzeug", exact: true }).getByRole("button", { name: "Karte bearbeiten", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("textbox", { name: "Kartentitel bearbeiten" })).toBeFocused();
  await panel.getByRole("textbox", { name: "Kartentext bearbeiten" }).fill("ATP transportiert Energie.");
  const editor = panel.getByRole("textbox", { name: "Kartentext bearbeiten" });
  await editor.press("Control+A");
  const toolbar = panel.locator(".core-mindmap-text-toolbar").getByRole("toolbar", { name: "Werkzeuge zur Textformatierung" });
  await toolbar.getByRole("button", { name: "Fett", exact: true }).click();
  await expect(editor.locator("b,strong")).toHaveText("ATP transportiert Energie.");
  await toolbar.getByRole("button", { name: "Fett", exact: true }).click();
  await expect(editor.locator("b,strong")).toHaveCount(0);
  await panel.getByRole("group", { name: "Kastenart", exact: true }).getByRole("button", { name: "Textkarte", exact: true }).click();
  await finish(panel);
  await expect(node(panel, "Energie").locator(".core-mindmap-node-label")).toHaveCSS("font-weight", "700");
  await expect(node(panel, "Energie").locator(".core-mindmap-note-text")).toHaveCSS("font-weight", "400");
  await expect(node(panel, "Energie")).toContainText("ATP transportiert Energie.");
  await expect(panel.getByTestId("mindmap-details")).toHaveCount(0);
  await save(panel); await reload(page, panel);
  await expect(node(panel, "Energie")).toContainText("ATP transportiert Energie.");
});

test("Plus-Aktionen erstellen Geschwister und Kinder mit Astfarben und bleiben erhalten", async ({ page }) => {
  const panel = await openMindMaps(page); await children(panel);
  const a = node(panel, "Ast A"), b = node(panel, "Ast B");
  expect(await a.getAttribute("data-color")).not.toBe(await b.getAttribute("data-color"));
  await a.click(); await a.getByRole("button", { name: "Unterknoten hinzufügen", exact: true }).click(); await topic(panel, "Detail A");
  await expect(node(panel, "Detail A")).toHaveAttribute("data-color", (await a.getAttribute("data-color"))!);
  await expect(panel.locator(".core-mindmap-hierarchy path")).toHaveCount(3);
  const beforeGrowth = await b.evaluate((el) => (el as HTMLElement).style.top);
  await a.dblclick(); await panel.getByRole("group", { name: "Kastenart", exact: true }).getByRole("button", { name: "Textkarte", exact: true }).click();
  await panel.getByLabel("Bild hinzufügen", { exact: true }).setInputFiles(image); await expect(a.locator("img")).toHaveCount(1); await finish(panel);
  await expect.poll(() => b.evaluate((el) => (el as HTMLElement).style.top)).not.toBe(beforeGrowth);
  await save(panel); await reload(page, panel);
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(4);
  await expect(panel.locator(".core-mindmap-hierarchy path")).toHaveCount(3);
});

test("Bilder in Stichwortdetails und Textkarten sowie freie Kastenfarben überstehen Reload", async ({ page }) => {
  const panel = await openMindMaps(page); await root(panel, "Energie"); await node(panel, "Energie").dblclick();
  await panel.getByRole("textbox", { name: "Kartentext bearbeiten" }).fill("Mein Text.");
  await panel.getByLabel("Bild hinzufügen", { exact: true }).setInputFiles(image);
  await panel.getByRole("button", { name: "Kastenfarbe frei wählen", exact: true }).click();
  await panel.getByRole("dialog", { name: "Kastenfarbe frei wählen", exact: true }).getByRole("textbox").fill("#123abc");
  await panel.getByRole("button", { name: "Kastenfarbe frei wählen", exact: true }).press("Escape");
  await finish(panel);
  await expect(node(panel, "Energie").locator("img")).toHaveCount(0);
  await expect(node(panel, "Energie").getByRole("button", { name: "Bilder anzeigen", exact: true })).toBeVisible();
  await node(panel, "Energie").dblclick();
  await panel.getByRole("group", { name: "Kastenart", exact: true }).getByRole("button", { name: "Textkarte", exact: true }).click();
  await finish(panel); await expect(node(panel, "Energie").locator("img")).toBeVisible();
  await save(panel); await reload(page, panel);
  await expect(node(panel, "Energie")).toHaveAttribute("data-color", "#123abc");
  await expect(node(panel, "Energie").locator("img")).toBeVisible();
  await node(panel, "Energie").dblclick(); await panel.getByRole("button", { name: "Bild „energie.png“ entfernen", exact: true }).click();
  await expect(node(panel, "Energie").locator("img")).toHaveCount(0); await panel.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(node(panel, "Energie").locator("img")).toBeVisible();
});

test("Zusammenfassungsklammer ist anpassbar, bearbeitbar und entfernt keine ursprünglichen Karten", async ({ page }) => {
  const panel = await openMindMaps(page); await children(panel);
  await node(panel, "Ast B").click(); await node(panel, "Ast B").getByRole("button", { name: "Stichwort auf gleicher Ebene hinzufügen", exact: true }).click(); await topic(panel, "Ast C");
  await selectPair(panel); await mode(panel, "Hinzufügen"); await panel.getByRole("button", { name: "Zusammenfassung", exact: true }).click(); await fit(panel);
  await expect(panel.getByTestId("mindmap-summary")).toHaveCount(1);
  await expect(node(panel, "Zusammenfassung")).toHaveAttribute("data-color", "default");
  expect(await panel.locator(".core-mindmap-summary-line").getAttribute("d")).toContain(" C ");
  const handle = panel.getByRole("button", { name: "Zusammenfassung unten erweitern", exact: true }), before = await handle.boundingBox(), target = await node(panel, "Ast C").boundingBox();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2); await page.mouse.down(); await page.mouse.move(before!.x + before!.width / 2, target!.y + target!.height / 2, { steps: 8 }); await page.mouse.up();
  await panel.getByRole("button", { name: "Zusammenfassung bearbeiten", exact: true }).click(); await panel.getByRole("textbox", { name: "Kartentext bearbeiten" }).fill("Meine Zusammenfassung."); await finish(panel);
  await save(panel); await reload(page, panel);
  await expect(node(panel, "Zusammenfassung")).toContainText("Meine Zusammenfassung.");
  await panel.getByRole("button", { name: "Zusammenfassung auswählen", exact: true }).click(); await panel.getByRole("button", { name: "Zusammenfassung entfernen", exact: true }).click();
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(4); await expect(panel.getByTestId("mindmap-summary")).toHaveCount(0);
});

test("Umrandung passt sich beim Verschieben an und lässt sich unabhängig löschen", async ({ page }) => {
  const panel = await openMindMaps(page); await children(panel); await selectPair(panel); await mode(panel, "Hinzufügen"); await panel.getByRole("button", { name: "Umrandung", exact: true }).click();
  await panel.getByRole("textbox", { name: "Umrandung beschriften" }).fill("Mein Bereich"); await save(panel); await reload(page, panel);
  const boundary = panel.getByTestId("mindmap-boundary"), before = await boundary.evaluate((el) => (el as HTMLElement).style.height);
  await node(panel, "Ast B").press("ArrowDown");
  expect(await boundary.evaluate((el) => (el as HTMLElement).style.height)).not.toBe(before);
  await boundary.click({ position: { x: 8, y: 8 } }); await panel.getByRole("button", { name: "Umrandung entfernen", exact: true }).click();
  await expect(panel.getByTestId("mindmap-node")).toHaveCount(3);
});

test("Gestalten enthält Zeichnen, Radieren und Schreiben mit Farben und Strichstärken", async ({ page }) => {
  const panel = await openMindMaps(page); await mode(panel, "Gestalten"); await panel.getByRole("button", { name: "Stiftfarbe Koralle", exact: true }).click(); await panel.getByRole("group", { name: "Strichstärke", exact: true }).getByRole("button", { name: "Dick", exact: true }).click();
  const canvas = panel.getByTestId("mindmap-canvas"); await fit(panel); const r = await canvas.boundingBox();
  await page.mouse.move(r!.x + 70, r!.y + 60); await page.mouse.down(); await page.mouse.move(r!.x + 210, r!.y + 100, { steps: 8 }); await page.mouse.up();
  await expect(panel.locator(".core-mindmap-ink > polyline")).toHaveCSS("stroke-width", "8px");
  await panel.getByRole("group", { name: "Gestalten", exact: true }).getByRole("button", { name: "Radieren", exact: true }).click(); await fit(panel);
  const inkPoint = await panel.locator(".core-mindmap-eraser-hit").evaluate((el) => {
    const line = el as SVGPolylineElement, p = line.points.getItem(Math.floor(line.points.length / 2)), m = line.getScreenCTM()!;
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  await page.mouse.click(inkPoint.x, inkPoint.y); await expect(panel.locator(".core-mindmap-ink")).toHaveCount(0);
  await panel.getByRole("button", { name: "Rückgängig", exact: true }).click(); await expect(panel.locator(".core-mindmap-ink")).toHaveCount(1);
  await panel.getByRole("group", { name: "Gestalten", exact: true }).getByRole("button", { name: "Schreiben", exact: true }).click(); await canvas.click({ position: { x: 150, y: 180 } });
  await panel.getByRole("textbox", { name: "Text auf der Fläche bearbeiten" }).fill("Freier Text auf der Fläche."); await finish(panel); await save(panel); await reload(page, panel);
  await expect(panel.getByTestId("mindmap-free-text")).toContainText("Freier Text auf der Fläche."); await expect(panel.getByTestId("mindmap-node")).toHaveCount(0); await expect(panel.locator(".core-mindmap-ink")).toHaveCount(1);
});

test("Zusammenfassungsquellen und Entwurfsschutz bleiben im neuen Editor erhalten", async ({ page }) => {
  await page.goto("./docs/ui-elements.html#screens"); await page.getByRole("button", { name: "Stapelinhalte öffnen", exact: true }).click();
  const tabs = page.getByRole("group", { name: "Stapelinhalte", exact: true }); await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  const panel = page.getByTestId("deck-mindmaps-panel"); await root(panel, "Mein Entwurf"); await save(panel); await node(panel, "Mein Entwurf").dblclick();
  await page.evaluate(() => { const put = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) { const tx = put.apply(this, args); if (args[1] === "readwrite") Object.defineProperty(tx, "oncomplete", { set(handler: (event: Event) => void) { tx.addEventListener("complete", (event) => setTimeout(() => handler.call(tx, event), 1500)); } }); return tx; }; });
  await panel.getByRole("textbox", { name: "Kartentext bearbeiten" }).fill("Noch nicht fertig gespeichert"); await tabs.getByRole("button", { name: "Karten", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }); await dialog.getByRole("button", { name: "Speichern", exact: true }).click(); await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  await expect(node(panel, "Mein Entwurf")).toBeVisible();
  await page.getByRole("button", { name: "Produktansicht schließen", exact: true }).click();
  await page.getByRole("button", { name: "Mindmaps öffnen", exact: true }).click();
  await mode(panel, "Hinzufügen"); await panel.getByRole("button", { name: "Aus Zusammenfassung", exact: true }).click(); await panel.getByRole("button", { name: "Mindmap hinzufügen", exact: true }).click(); await fit(panel);
  await expect(panel.locator(".core-mindmap-hierarchy path")).toHaveCount(6);
  await node(panel, "Portugal").dblclick(); await node(panel, "Portugal").locator("summary").click();
  await expect(panel.getByTestId("mindmap-source-passage")).toContainText("Lissabon"); await expect(panel.getByTestId("mindmap-source-passage")).not.toContainText("Madrid");
});


test("Speicherfehler erhalten den bearbeiteten Entwurf und erlauben einen neuen Versuch", async ({ page }) => {
  const panel = await openMindMaps(page); await root(panel, "Mein sicherer Entwurf");
  await save(panel);
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) { IDBObjectStore.prototype.put = put; throw new DOMException("Lokaler Speicher voll", "QuotaExceededError"); }; });
  await node(panel, "Mein sicherer Entwurf").dblclick(); await panel.getByRole("textbox", { name: "Kartentext bearbeiten" }).fill("Neue ungespeicherte Notiz"); await finish(panel);
  await expect(panel).toContainText("Lokaler Speicher voll"); await expect(node(panel, "Mein sicherer Entwurf")).toBeVisible();
  await panel.getByRole("button", { name: "Erneut speichern", exact: true }).click();
  await save(panel); await reload(page, panel); await expect(node(panel, "Mein sicherer Entwurf")).toBeVisible();
});


test.describe("Auswahl per Antippen", () => {
  test.use({ hasTouch: true });
test("Mehrfachauswahl per Antippen erstellt Gruppen ohne Tastaturmodifikator", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await openMindMaps(page); await children(panel); await mode(panel, "Hinzufügen");
  const toggle = panel.getByRole("button", { name: "Mehrfachauswahl", exact: true }); await toggle.click(); await expect(toggle).toHaveAttribute("aria-pressed", "true"); await fit(panel);
  await node(panel, "Ast A").tap(); await node(panel, "Ast B").tap();
  await expect(node(panel, "Ast A")).toHaveAttribute("aria-pressed", "true"); await expect(node(panel, "Ast B")).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Zusammenfassung", exact: true }).click(); await expect(panel.getByTestId("mindmap-summary")).toHaveCount(1);
  await save(panel); await reload(page, panel); await expect(panel.getByTestId("mindmap-summary")).toHaveCount(1);
});

});


test("Ein laufender Bildimport wird vor dem Speichern beim Tabwechsel vollständig übernommen", async ({ page }) => {
  await page.goto("./docs/ui-elements.html#screens"); await page.getByRole("button", { name: "Stapelinhalte öffnen", exact: true }).click();
  const tabs = page.getByRole("group", { name: "Stapelinhalte", exact: true }); await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  const panel = page.getByTestId("deck-mindmaps-panel"); await root(panel, "Bildnotiz"); await node(panel, "Bildnotiz").dblclick();
  await panel.getByRole("group", { name: "Kastenart", exact: true }).getByRole("button", { name: "Textkarte", exact: true }).click(); await finish(panel); await save(panel);
  await node(panel, "Bildnotiz").dblclick();
  await page.evaluate(() => { const read = FileReader.prototype.readAsDataURL; FileReader.prototype.readAsDataURL = function (blob: Blob) { setTimeout(() => read.call(this, blob), 1500); }; });
  await panel.getByLabel("Bild hinzufügen", { exact: true }).setInputFiles(image);
  await expect(panel).toContainText("Bilder werden geladen"); await expect(panel.getByRole("button", { name: "Speichern", exact: true })).toHaveCount(0);
  await tabs.getByRole("button", { name: "Karten", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true }).getByRole("button", { name: "Speichern", exact: true }).click();
  await tabs.getByRole("button", { name: "Mind Map", exact: true }).click(); await expect(node(panel, "Bildnotiz").locator("img")).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Stapelinhalte öffnen", exact: true }).click(); await tabs.getByRole("button", { name: "Mind Map", exact: true }).click();
  await expect(node(panel, "Bildnotiz").locator("img")).toBeVisible();
});


test("Alte Werkzeugzeile, direktes Verknüpfen und ausgewählte Standardtitel kombinieren die Ansichten", async ({ page }) => {
  const panel = await openMindMaps(page), top = panel.locator(".core-mindmap-primary-tools");
  await expect(top.getByRole("button", { name: "Stichwort", exact: true })).toBeVisible();
  await top.getByRole("button", { name: "Textfeld", exact: true }).click();
  const title = panel.getByRole("textbox", { name: "Kartentitel bearbeiten", exact: true });
  await expect(title).toHaveValue("Neue Notiz"); await title.click();
  expect(await title.evaluate((el) => [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd])).toEqual([0, 10]);
  await title.press("N"); await expect(title).toHaveValue("N"); await title.fill("Neue Notiz"); await finish(panel);
  await node(panel, "Neue Notiz").dblclick(); await expect(panel.getByRole("textbox", { name: "Kartentext bearbeiten", exact: true })).toBeFocused(); await finish(panel);
  await node(panel, "Neue Notiz").locator(".core-mindmap-node-label").click(); await expect(title).toBeFocused();
  expect(await title.evaluate((el) => [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd])).toEqual([0, 10]);
  await expect(panel.getByRole("spinbutton")).toHaveCount(0);
  await expect(panel.getByRole("combobox", { name: "Übergeordnetes Thema", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Neu verknüpfen", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("group", { name: "Kastenart", exact: true })).toBeVisible();
  await mode(panel, "Hinzufügen"); await expect(panel.getByRole("button", { name: "Zone", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Verbindung", exact: true })).toHaveCount(0);
  await mode(panel, "Verknüpfen"); await expect(panel.getByRole("group", { name: "Verbindungslinien", exact: true })).toBeVisible();
});

test("Astfarben werden nach außen kräftiger und die Linienwahl übersteht Reload und Rückgängig", async ({ page }) => {
  const panel = await openMindMaps(page); await children(panel); await node(panel, "Ast A").click();
  await node(panel, "Ast A").getByRole("button", { name: "Unterknoten hinzufügen", exact: true }).click(); await topic(panel, "Detail");
  const strength = async (label: string) => Number((await node(panel, label).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--mindmap-surface"))).match(/ (\d+)%/)![1]);
  expect(await strength("Detail")).toBeGreaterThan(await strength("Ast A"));
  await mode(panel, "Verknüpfen"); await panel.getByRole("button", { name: "Graue Linien", exact: true }).click(); await fit(panel);
  await node(panel, "Ast A").click(); await node(panel, "Ast B").click();
  await expect(panel.locator(".core-mindmap-edges path")).toHaveCount(1);
  const neutral = await panel.evaluate((el) => getComputedStyle(el).getPropertyValue("--core-text-muted").trim());
  for (const line of await panel.locator(".core-mindmap-hierarchy path,.core-mindmap-edges path").all()) await expect(line).toHaveCSS("stroke", neutral.startsWith("#") ? "rgb(102, 116, 146)" : neutral);
  await save(panel); await reload(page, panel); await mode(panel, "Verknüpfen");
  await expect(panel.getByRole("button", { name: "Graue Linien", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Kastenfarben", exact: true }).click();
  await expect(panel.locator(".core-mindmap-edges path")).not.toHaveCSS("stroke", "rgb(102, 116, 146)");
  await panel.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Graue Linien", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test.describe("Standardtitel per Touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("Antippen markiert den vorgegebenen Titel zur direkten Ersetzung", async ({ page }) => {
    const panel = await openMindMaps(page);
    await panel.locator(".core-mindmap-primary-tools").getByRole("button", { name: "Textfeld", exact: true }).tap();
    await finish(panel); await node(panel, "Neue Notiz").locator(".core-mindmap-node-label").tap();
    const title = panel.getByRole("textbox", { name: "Kartentitel bearbeiten", exact: true });
    await expect(title).toBeFocused();
    expect(await title.evaluate((el) => [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd])).toEqual([0, 10]);
    await title.press("T"); await expect(title).toHaveValue("T");
  });
});
