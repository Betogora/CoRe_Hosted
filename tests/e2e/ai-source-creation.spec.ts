import { expect, test, type Locator, type Page } from "@playwright/test";
import { loadEnv } from "vite";
import { switchColorScheme } from "./support/navigationMenu.ts";

async function openCatalogFlow(page: Page) {
  await page.goto("/docs/ui-elements.html?preview=screens");
  await page.locator("#screens").getByRole("button", { name: "Automatische Erstellung öffnen", exact: true }).click();
  return page.getByTestId("ai-source-creation");
}

const sourceText = "# Zellatmung\nDie Atmungskette liegt in der inneren Mitochondrienmembran.\n\n# Glykolyse\nDie Glykolyse findet im Cytosol der Zelle statt.";
const sourceFile = { name: "Zellatmung_Teil-1.md", mimeType: "text/markdown", buffer: Buffer.from(sourceText) };
const next = (panel: Locator) => panel.getByRole("button", { name: /^Weiter zu den / }).click();
const stepButton = (panel: Locator, name: string) => panel.getByRole("list", { name: "Schritte der automatischen Erstellung" }).getByRole("button", { name: new RegExp(`^${name}`) });

test("Schritte erhalten Text, Lernwünsche und ein einziges Stapelziel bis zur Prüfung", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await openCatalogFlow(page);
  await expect(panel.getByRole("heading", { name: "Quelle und Stapel", exact: true })).toBeVisible();
  await next(panel);
  await expect(panel.getByRole("alert").filter({ hasText: "Wähle eine Quelldatei" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Datei auswählen", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Text einfügen", exact: true }).click();
  await panel.getByLabel("Dein Quelltext").fill("   ");
  await next(panel);
  await expect(panel.getByRole("alert").filter({ hasText: "Füge einen Text" })).toBeVisible();
  await expect(panel.getByLabel("Dein Quelltext")).toBeFocused();
  const text = "ATP ist ein Energieträger. <script>window.untrustedSource = true</script>";
  await panel.getByLabel("Dein Quelltext").fill(text);
  await panel.getByLabel("Stapelname").fill("Textstapel");
  await next(panel);
  await expect(panel.getByTestId("ai-source-step")).toBeFocused();
  await expect(panel.getByRole("heading", { name: "Kartenformen", exact: true })).toBeAttached();
  await expect(panel.getByRole("checkbox", { name: "Frage–Antwort", exact: true })).toBeChecked();
  await next(panel);
  await expect(panel.getByTestId("ai-source-estimate-normal")).toHaveText("Etwa 1 Karte");
  await panel.getByRole("combobox", { name: "Formulierung", exact: true }).click();
  await page.getByRole("option", { name: "Einfach verständlich", exact: true }).click();
  await panel.getByRole("textbox", { name: /Weitere Hinweise/ }).fill("Bitte Abkürzungen erklären.");
  await stepButton(panel, "Quelle und Stapel").click();
  await expect(panel.getByLabel("Dein Quelltext")).toHaveValue(text);
  await panel.getByRole("button", { name: "Datei", exact: true }).click();
  await panel.locator('input[type="file"]').setInputFiles(sourceFile);
  await panel.getByRole("button", { name: "Text einfügen", exact: true }).click();
  await expect(panel.getByLabel("Dein Quelltext")).toHaveValue(text);
  await panel.getByLabel("Stapelname").fill("Geänderter Textstapel");
  await page.setViewportSize({ width: 1440, height: 900 });
  await stepButton(panel, "Vorgaben").click();
  await expect(panel.getByRole("combobox", { name: "Formulierung", exact: true })).toContainText("Einfach verständlich");
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  const summary = page.getByTestId("ai-source-summary");
  await expect(summary).toContainText("Geänderter Textstapel (neuer Stapel)");
  await expect(summary).toContainText("Eingefügter Text");
  await expect(summary).not.toContainText(sourceFile.name);
  await expect(summary).toContainText("Normal · Etwa 1 Karte");
  await expect(summary).toContainText("Einfach verständlich");
  await expect(summary).toContainText("Bitte Abkürzungen erklären.");
  await summary.getByText("Quelltext ansehen", { exact: true }).click();
  await expect(summary).toContainText(text);
  expect(await page.evaluate(() => "untrustedSource" in window)).toBe(false);
  await stepButton(panel, "Quelle und Stapel").click();
  await expect(panel.getByLabel("Dein Quelltext")).toHaveValue(text);
});

test("Quelle, Lernwünsche und Ziel bleiben bis zur Auftragsprüfung lokal erhalten", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/ai\/|\/storage\/v1\//.test(request.url()) || request.method() !== "GET") remoteRequests.push(request.url());
  });
  const panel = await openCatalogFlow(page);
  await panel.locator('input[type="file"]').setInputFiles(sourceFile);
  await expect(panel.getByLabel("Stapelname")).toHaveValue("Zellatmung Teil 1");
  await panel.getByLabel("Stapelname").fill("Eigener Lernstapel");
  await next(panel);
  await panel.getByRole("checkbox", { name: "Lückentext", exact: true }).check();
  await next(panel);
  await panel.getByRole("radio", { name: /^Mehr/ }).check();
  await panel.getByRole("textbox", { name: /Weitere Hinweise/ }).fill("Abitur; Schwerpunkt Zellatmung");
  await panel.getByRole("combobox", { name: "Sprache", exact: true }).click();
  await page.getByRole("option", { name: "Englisch", exact: true }).click();
  await panel.getByRole("combobox", { name: "Formulierung", exact: true }).click();
  await page.getByRole("option", { name: "Fachsprache verwenden", exact: true }).click();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  const summary = page.getByTestId("ai-source-summary");
  await expect(panel.getByRole("heading", { name: "Auftrag prüfen", exact: true })).toBeFocused();
  await expect(summary).toContainText("Eigener Lernstapel (neuer Stapel)");
  await expect(summary).toContainText(sourceFile.name);
  await expect(summary).toContainText("Mehr Karten mit kurzen Erklärungen.");
  await expect(summary).toContainText("Frage–Antwort, Lückentext");
  await expect(summary).toContainText("Englisch");
  await expect(summary).toContainText("Fachsprache verwenden");
  await expect(summary.getByRole("button", { name: "Karten erstellen", exact: true })).toBeEnabled();
  await summary.getByRole("button", { name: "Einstellungen bearbeiten", exact: true }).click();
  await expect(panel.getByRole("radio", { name: /^Mehr/ })).toBeChecked();
  await stepButton(panel, "Quelle und Stapel").click();
  await expect(panel.getByLabel("Stapelname")).toHaveValue("Eigener Lernstapel");
  await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Andere_Quelle.md" });
  await expect(panel.getByLabel("Stapelname")).toHaveValue("Eigener Lernstapel");
  await panel.getByRole("switch", { name: "Neuen Stapel anlegen", exact: true }).uncheck();
  await panel.getByRole("combobox", { name: "Stapel", exact: true }).click();
  await page.getByRole("option").filter({ hasNotText: "Stapel auswählen" }).first().click();
  await stepButton(panel, "Vorgaben").click();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(summary).toContainText("Andere_Quelle.md");
  await expect(summary).not.toContainText("(neuer Stapel)");
  expect(remoteRequests).toEqual([]);
});

test("Karten aus einer Quelle: Lauf mit Fortschritt, belegte Vorschläge, Abbrechen und Verwerfen behalten den Auftrag", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => { if (/\/api\/ai\//.test(request.url())) remoteRequests.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  const panel = await openCatalogFlow(page);
  await panel.getByRole("button", { name: "Text einfügen", exact: true }).click();
  await panel.getByLabel("Dein Quelltext").fill(sourceText);
  await panel.getByLabel("Stapelname").fill("Zellatmung");
  await next(panel);
  for (const name of ["Lückentext", "Single Choice", "Multiple Choice"]) await panel.getByRole("checkbox", { name, exact: true }).check();
  await next(panel);
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  const summary = page.getByTestId("ai-source-summary");
  await summary.getByRole("button", { name: "Karten erstellen", exact: true }).click();
  const progress = page.getByTestId("ai-source-progress");
  await expect(progress.getByRole("heading", { name: "Karten werden erstellt", exact: true })).toBeFocused();
  await progress.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Auftrag prüfen", exact: true })).toBeVisible();
  await expect(page.getByTestId("ai-source-proposals")).toHaveCount(0);

  await summary.getByRole("button", { name: "Karten erstellen", exact: true }).click();
  const proposals = page.getByTestId("ai-source-proposals");
  await expect(proposals.getByRole("heading", { name: "4 Vorschläge", exact: true })).toBeFocused();
  await expect(proposals.getByTestId("ai-source-proposal")).toHaveCount(4);
  await expect(proposals.getByTestId("ai-source-proposal").first()).toContainText("Frage und Antwort · Eingefügter Text · Zellatmung · Zeilen 1–2");
  await expect(proposals.getByTestId("ai-source-proposal").nth(1)).not.toContainText("{{c1::");
  await expect(proposals.getByLabel("Richtig")).toHaveCount(3);
  await expect(proposals).toContainText("Hinweise der KI");
  await proposals.getByRole("button", { name: "Alle verwerfen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Vorschläge verwerfen?" });
  await dialog.getByRole("button", { name: "Behalten", exact: true }).click();
  await expect(proposals.getByTestId("ai-source-proposal")).toHaveCount(4);
  await proposals.getByRole("button", { name: "Alle verwerfen", exact: true }).click();
  await dialog.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Auftrag prüfen", exact: true })).toBeVisible();
  await expect(summary).toContainText("Zellatmung (neuer Stapel)");

  await summary.getByRole("button", { name: "Karten erstellen", exact: true }).click();
  await proposals.getByTestId("ai-source-proposal").first().getByRole("button", { name: "Vorschlag bearbeiten", exact: true }).click();
  const editor = page.getByTestId("ai-source-proposal-editor");
  const front = editor.getByRole("textbox").first();
  await front.click();
  await front.press("ControlOrMeta+a");
  await front.pressSequentially("Wo liegt die Atmungskette?");
  await editor.getByRole("button", { name: "Schließen", exact: true }).click();
  const closeGuard = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await closeGuard.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await editor.getByRole("button", { name: "Änderungen übernehmen", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(proposals.getByTestId("ai-source-proposal").first()).toContainText("Wo liegt die Atmungskette?");
  await proposals.getByTestId("ai-source-proposal").nth(1).getByRole("button", { name: "Vorschlag verwerfen", exact: true }).click();
  await expect(proposals.getByRole("heading", { name: "3 Vorschläge", exact: true })).toBeVisible();
  await proposals.getByRole("button", { name: "3 Vorschläge übernehmen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit", exact: true })).toBeVisible();
  await expect(page.getByText(/3 Karten wurden in/)).toBeVisible();
  expect(remoteRequests).toEqual([]);
});

const sourceCardsResponse = (cards: unknown[], extra: Record<string, unknown> = {}) => ({ cards, warnings: [], discarded: 0, model: "openai/gpt-6-luna", privacyMode: "zdr", promptVersion: "source-cards-v2", usage: null, ...extra });
const basicProposal = { form: "basic", front: "Wo liegt die Atmungskette?", back: "In der inneren Mitochondrienmembran.", options: [], explanation: "", sources: ["s1"] };
const choiceProposal = { form: "single-choice", front: "Wo findet die Glykolyse statt?", back: "", options: [{ text: "Im Cytosol", correct: true }, { text: "Im Zellkern", correct: false }], explanation: "", sources: ["s2"] };

async function openAppOrder(page: Page) {
  await installEmptyAccount(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/neue-karten?method=ai-source");
  const panel = page.getByTestId("ai-source-creation");
  await panel.getByRole("button", { name: "Text einfügen", exact: true }).click();
  await panel.getByLabel("Dein Quelltext").fill(sourceText);
  await panel.getByLabel("Stapelname").fill("Zellatmung aus Quelle");
  await next(panel);
  await panel.getByRole("checkbox", { name: "Single Choice", exact: true }).check();
  await next(panel);
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  return page.getByTestId("ai-source-summary");
}

test("echte App: Vorschläge der Route belegen ihre Stelle und werden erst bei der Übernahme gespeichert", async ({ page }) => {
  let requested = 0;
  await page.route("**/api/ai/source-cards", async (route) => {
    requested += 1;
    const body = route.request().postDataJSON();
    expect(body.units.map((unit: { id: string; label: string }) => [unit.id, unit.label])).toEqual([["s1", "Zellatmung · Zeilen 1–2"], ["s2", "Glykolyse · Zeilen 4–5"]]);
    await route.fulfill({ json: sourceCardsResponse([basicProposal, choiceProposal], { warnings: ["Die Quelle ist sehr kurz."], discarded: 1 }) });
  });
  const summary = await openAppOrder(page);
  await expect(page.getByText("Die automatische Erstellung ist noch nicht verfügbar.")).toHaveCount(0);
  await summary.getByRole("button", { name: "Karten erstellen", exact: true }).click();
  const proposals = page.getByTestId("ai-source-proposals");
  await expect(proposals.getByRole("heading", { name: "2 Vorschläge", exact: true })).toBeVisible();
  await expect(proposals).toContainText("Die Quelle ist sehr kurz.");
  await expect(proposals).toContainText("1 Vorschlag wurde verworfen");
  await expect(proposals.getByTestId("ai-source-proposal").nth(1)).toContainText("Single Choice · Eingefügter Text · Glykolyse · Zeilen 4–5");

  await proposals.getByRole("button", { name: "Alle verwerfen", exact: true }).click();
  await page.getByRole("dialog", { name: "Vorschläge verwerfen?" }).getByRole("button", { name: "Verwerfen", exact: true }).click();
  await page.getByRole("button", { name: "Lernen", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Ungespeicherten Entwurf verlassen?" }).getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await expect(page.getByTestId("learn-deck-create-form")).toBeVisible();
  await expect(page.getByText("Zellatmung aus Quelle")).toHaveCount(0);

  const again = await openAppOrder(page);
  await again.getByRole("button", { name: "Karten erstellen", exact: true }).click();
  await proposals.getByTestId("ai-source-proposal").nth(1).getByRole("button", { name: "Vorschlag verwerfen", exact: true }).click();
  await proposals.getByRole("button", { name: "1 Vorschlag übernehmen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit", exact: true })).toBeVisible();
  await expect(page.getByText("1 Karte wurde in „Zellatmung aus Quelle“ gespeichert.")).toBeVisible();
  await expect(page).toHaveURL(/doneKind=ai-source/);
  expect(requested).toBe(2);
});

test("echte App: Fehler für alle Abschnitte führen mit Grund zum Auftrag zurück, ohne Verbindung bleibt die Erstellung gesperrt", async ({ page, context }) => {
  await page.route("**/api/ai/source-cards", (route) => route.fulfill({ status: 429, json: { error: { code: "rate_limited", message: "Gerade wurden zu viele Karten angefordert." } } }));
  const summary = await openAppOrder(page);
  await summary.getByRole("button", { name: "Karten erstellen", exact: true }).click();
  await expect(summary.getByRole("alert")).toContainText("Gestoppt: Gerade wurden zu viele Karten angefordert. Ab Zellatmung · Zeilen 1–2 wurde die Quelle nicht ausgewertet.");
  await expect(page.getByTestId("ai-source-proposals")).toHaveCount(0);
  await context.setOffline(true);
  await expect(summary).toContainText("Ohne Verbindung kann die KI keine Karten erstellen.");
  await expect(summary.getByRole("button", { name: "Karten erstellen", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(summary.getByRole("button", { name: "Karten erstellen", exact: true })).toBeEnabled();
});

test("ungültige und unlesbare Quellen bleiben im ersten Schritt; fehlende Kartenformen blockieren den nächsten", async ({ page }) => {
  const panel = await openCatalogFlow(page);
  await next(panel);
  await expect(panel.getByRole("alert").filter({ hasText: "Wähle eine Quelldatei" })).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles(sourceFile);
  await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Nicht_unterstützt.png" });
  await expect(panel.getByTestId("ai-source-file-name")).toHaveText(sourceFile.name);
  await expect(panel.getByRole("alert")).toContainText("Wähle eine Datei im Format");
  await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Leer.md", buffer: Buffer.alloc(0) });
  await expect(panel.getByRole("alert")).toContainText("Die Datei ist leer");
  await expect(panel.getByTestId("ai-source-file-name")).toHaveText(sourceFile.name);
  await panel.locator('input[type="file"]').setInputFiles({ name: "Kaputt.PDF", mimeType: "application/pdf", buffer: Buffer.from("Kein PDF") });
  await next(panel);
  await expect(panel.getByRole("alert")).toContainText("Die Datei konnte nicht gelesen werden.");
  await expect(panel.getByRole("heading", { name: "Quelle und Stapel", exact: true })).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles(sourceFile);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await next(panel);
  for (const name of ["Frage–Antwort", "Lückentext", "Single Choice", "Multiple Choice"]) await panel.getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(panel.getByText("Wähle mindestens eine Kartenform aus.")).toBeVisible();
  await next(panel);
  await stepButton(panel, "Vorgaben").click();
  await expect(panel.getByRole("heading", { name: "Kartenformen", exact: true })).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: "Frage–Antwort", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Vorheriger Schritt", exact: true }).click();
  await panel.getByRole("button", { name: "Datei entfernen", exact: true }).click();
  await expect(panel.getByTestId("ai-source-file-name")).toHaveCount(0);
  await expect(panel.getByLabel("Stapelname")).toHaveValue("");
});

async function installEmptyAccount(page: Page) {
  const environment = loadEnv(process.env.CORE_UI_TEST_MODE ?? "e2e", process.cwd(), "");
  const supabaseUrl = environment.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Der UI-Test benötigt eine konfigurierte Supabase-URL; alle Anfragen werden abgefangen.");
  const user = { id: "00000000-0000-4000-8000-000000000098", aud: "authenticated", role: "authenticated", email: "source-ui-test@core.invalid" };
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...user, sub: user.id, iat: now, exp: now + 3600 })}.test-signature`,
    token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "test-refresh", user,
  };
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`, session,
  });
  await page.route(`${supabaseUrl.replace(/\/$/, "")}/**`, async (route) => {
    const url = route.request().url();
    const body = url.includes("/auth/v1/user") ? user : url.includes("/get_account_bootstrap")
      ? { profile: null, decks: [], nextCursor: "", hasMore: false, confirmedEmpty: true, conflictCount: 0, serverCatalogCursor: 0 }
      : [];
    await route.fulfill({ json: body });
  });
}

test("echte App schützt den Quellenentwurf bei Navigation und Browser-Zurück", async ({ page }) => {
  await installEmptyAccount(page);
  await page.goto("/neue-karten");
  await page.getByRole("button", { name: "Karten automatisch erstellen lassen", exact: true }).click();
  await expect(page).toHaveURL(/method=ai-source/);
  await page.locator('input[type="file"]').setInputFiles(sourceFile);
  await page.getByRole("button", { name: "Erstellen", exact: true }).last().click();
  const guard = page.getByRole("dialog", { name: "Ungespeicherten Entwurf verlassen?" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByTestId("ai-source-file-name")).toHaveText(sourceFile.name);
  await page.goBack();
  await expect(guard).toBeVisible();
  await expect(page).toHaveURL(/method=ai-source/);
  await guard.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await page.goBack();
  await expect(guard).toBeVisible();
  await expect(page).toHaveURL(/method=ai-source/);
  await guard.getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await expect(page.getByRole("button", { name: "Karten automatisch erstellen lassen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Karten automatisch erstellen lassen", exact: true }).click();
  await expect(page.getByTestId("ai-source-file-name")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles(sourceFile);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByTestId("ai-source-creation")).toBeVisible();
  await expect(page.getByTestId("ai-source-file-name")).toHaveCount(0);
});

test("fehlendes Stapelziel bleibt sichtbar und lässt sich durch einen neuen Stapel ersetzen", async ({ page }) => {
  await installEmptyAccount(page);
  await page.goto("/neue-karten?method=ai-source&deck=missing");
  const panel = page.getByTestId("ai-source-creation");
  const transfer = await page.evaluateHandle((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], "Quelle.MD", { type: "text/markdown" }));
    return data;
  }, sourceText);
  await panel.getByRole("group", { name: "Quelle für automatische Karten auswählen oder ablegen" }).dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(panel.getByTestId("ai-source-file-name")).toHaveText("Quelle.MD");
  await next(panel);
  await expect(panel.getByText("Wähle einen verfügbaren Zielstapel aus.")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Quelle und Stapel", exact: true })).toBeVisible();
  await panel.getByRole("switch", { name: "Neuen Stapel anlegen", exact: true }).check();
  await stepButton(panel, "Vorgaben").click();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(page.getByTestId("ai-source-summary")).toContainText("Quelle (neuer Stapel)");
});

for (const theme of ["light", "dark"] as const) {
  test(`Formular-Breakpoints ${theme}`, async ({ page }, testInfo) => {
    test.skip(!process.env.CORE_VISUAL_OUTPUT, "Die vollständige Sichtmatrix wird gezielt ausgeführt.");
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installEmptyAccount(page);
    await page.goto("/neue-karten?method=ai-source");
    if (theme === "dark") await switchColorScheme(page, "dark");
    const panel = page.getByTestId("ai-source-creation");
    await panel.locator('input[type="file"]').setInputFiles(sourceFile);
    await panel.getByLabel("Stapelname").fill("Biologie – Zellatmung");
    for (const width of [639, 640, 767, 768, 1279, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [index, name] of ["Quelle und Stapel", "Kartenformen", "Vorgaben"].entries()) {
        await stepButton(panel, name).click();
        await expect(panel.getByRole("heading", { name, exact: true })).toBeAttached();
        await page.screenshot({ path: testInfo.outputPath(`form-${width}-${index + 1}.png`), animations: "disabled", fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await stepButton(panel, "Quelle und Stapel").click();
    await panel.getByRole("button", { name: "Text einfügen", exact: true }).click();
    await panel.getByLabel("Dein Quelltext").fill("Bei der Zellatmung wird die Energie aus Glucose für die Bildung von ATP genutzt.");
    await page.screenshot({ path: testInfo.outputPath("mobile-text.png"), animations: "disabled", fullPage: true });
  });
  test(`Layoutwechsel ${theme}`, async ({ page }, testInfo) => {
    test.skip(!process.env.CORE_VISUAL_OUTPUT, "Die vollständige Sichtmatrix wird gezielt ausgeführt.");
    await installEmptyAccount(page);
    await page.goto("/neue-karten");
    if (theme === "dark") await switchColorScheme(page, "dark");
    for (const width of [767, 768, 1279, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("button", { name: "Karten automatisch erstellen lassen", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`entry-${width}.png`), animations: "disabled", fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
  for (const [width, height] of [[320, 720], [360, 800], [390, 844], [430, 932], [1280, 720], [1440, 900]]) {
    test(`Sichtprüfung ${theme} ${width}×${height}`, async ({ page }, testInfo) => {
      test.skip(!process.env.CORE_VISUAL_OUTPUT, "Die vollständige Sichtmatrix wird gezielt ausgeführt.");
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await installEmptyAccount(page);
      await page.goto("/neue-karten");
      await expect(page.getByRole("button", { name: "Karten automatisch erstellen lassen", exact: true })).toBeVisible();
      if (theme === "dark") await switchColorScheme(page, "dark");
      async function capture(state: string) {
        await page.screenshot({ path: testInfo.outputPath(`${state}.png`), animations: "disabled", fullPage: state !== "select-open" && state !== "draft-dialog" && !state.startsWith("catalog-") });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? [] : [...document.querySelectorAll("main *")]
          .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 12).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent?.slice(0, 100), right: element.getBoundingClientRect().right }))), state).toEqual([]);
      }
      await capture("entry");
      await page.getByRole("button", { name: "Karten automatisch erstellen lassen", exact: true }).click();
      const panel = page.getByTestId("ai-source-creation");
      await capture("form-empty");
      await next(panel);
      await capture("form-errors");
      await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Lange_Quelldatei_Zellatmung_Bedingungen_und_Ausnahmen_des_Energiestoffwechsels.md", buffer: Buffer.from(sourceText.repeat(40)) });
      await next(panel);
      await capture("form-formats");
      await next(panel);
      await panel.getByRole("textbox", { name: /Weitere Hinweise/ }).fill("Biologie-Abitur; Schwerpunkt Zellatmung; historische Entdeckungen weglassen.");
      await capture("form-settings");
      await panel.getByRole("combobox", { name: "Formulierung", exact: true }).click();
      await expect(page.getByRole("option", { name: "Fachsprache verwenden", exact: true })).toBeVisible();
      await capture("select-open");
      await page.getByRole("option", { name: "Fachsprache verwenden", exact: true }).click();
      await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
      await capture("summary");
      await page.getByRole("button", { name: "Erstellen", exact: true }).last().click();
      await expect(page.getByRole("dialog", { name: "Ungespeicherten Entwurf verlassen?" })).toBeVisible();
      await capture("draft-dialog");
      await page.getByRole("dialog").getByRole("button", { name: "Verwerfen und verlassen", exact: true }).click();
      await page.getByRole("button", { name: "Import", exact: true }).click();
      await capture("existing-apkg");
      await page.getByRole("button", { name: "Erstellen", exact: true }).last().click();
      await page.getByRole("button", { name: "Karten selbst erstellen", exact: true }).click();
      await page.getByRole("button", { name: "PDF/Text anfügen", exact: true }).click();
      await capture("existing-manual-source");
      await page.getByRole("button", { name: "Bildverdeckung", exact: true }).click();
      await capture("existing-manual-image");
      await page.goto("/docs/ui-elements.html?preview=screens");
      if (theme === "dark") await page.locator("#docs-theme").click();
      await page.locator("#screens").getByRole("button", { name: "Automatische Erstellung öffnen", exact: true }).click();
      await capture("catalog-form");
      const catalogPanel = page.getByTestId("ai-source-creation");
      await catalogPanel.locator('input[type="file"]').setInputFiles({ name: "Zellatmung.md", mimeType: "text/markdown", buffer: Buffer.from(sourceText) });
      await next(catalogPanel);
      await next(catalogPanel);
      await catalogPanel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
      await capture("catalog-summary");
      await page.getByRole("button", { name: "Karten erstellen", exact: true }).click();
      await expect(page.getByTestId("ai-source-progress")).toBeVisible();
      await capture("catalog-progress");
      await expect(page.getByTestId("ai-source-proposals")).toBeVisible();
      await capture("catalog-proposals");
      await page.getByRole("button", { name: "Vorschlag bearbeiten", exact: true }).first().click();
      await expect(page.getByTestId("ai-source-proposal-editor")).toBeVisible();
      await capture("catalog-editor");
    });
  }
}
