import { expect, test, type Page } from "@playwright/test";
import { loadEnv } from "vite";

async function openCatalogFlow(page: Page) {
  await page.goto("/docs/ui-elements.html#screens");
  await page.locator("#screens").getByRole("button", { name: "Automatische Erstellung öffnen", exact: true }).click();
  return page.getByTestId("ai-source-creation");
}

const sourceFile = { name: "Zellatmung_Teil-1.PPTX", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("Lokale Testquelle, wird nicht ausgelesen.") };

test("Quelle, Lernwünsche und Ziel bleiben bis zur Auftragsprüfung lokal erhalten", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/ai\/|\/storage\/v1\//.test(request.url()) || request.method() !== "GET") remoteRequests.push(request.url());
  });
  const panel = await openCatalogFlow(page);
  await panel.locator('input[type="file"]').setInputFiles(sourceFile);
  await expect(panel.getByLabel("Name des neuen Stapels")).toHaveValue("Zellatmung Teil 1");
  await panel.getByLabel("Name des neuen Stapels").fill("Eigener Lernstapel");
  await panel.getByRole("combobox", { name: "Stoffabdeckung", exact: true }).press("Enter");
  await page.getByRole("option", { name: "Sehr genau", exact: true }).click();
  await panel.getByRole("checkbox", { name: "Single Choice", exact: true }).uncheck();
  await panel.getByRole("checkbox", { name: "Multiple Choice", exact: true }).uncheck();
  await panel.getByText("Weitere Einstellungen", { exact: true }).click();
  await panel.getByRole("textbox", { name: /Lernkontext und Wünsche/ }).fill("Abitur; Schwerpunkt Zellatmung");
  await panel.getByRole("checkbox", { name: "Zusätzliche Erklärungen erlauben", exact: true }).uncheck();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  const summary = page.getByTestId("ai-source-summary");
  await expect(panel.getByRole("heading", { name: "Auftrag prüfen", exact: true })).toBeFocused();
  await expect(summary).toContainText("Eigener Lernstapel (neuer Stapel)");
  await expect(summary).toContainText(sourceFile.name);
  await expect(summary).toContainText("Sehr genaue Abdeckung mit gemischten Fragen und kurzen Erklärungen.");
  await expect(summary).toContainText("Nur Erklärungen aus der Quelle");
  await expect(summary).not.toContainText("Single Choice");
  await expect(summary.getByRole("button", { name: "Karten erstellen", exact: true })).toBeDisabled();
  await summary.getByRole("button", { name: "Einstellungen bearbeiten", exact: true }).click();
  await expect(panel.getByLabel("Name des neuen Stapels")).toHaveValue("Eigener Lernstapel");
  await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Andere_Quelle.docx" });
  await expect(panel.getByLabel("Name des neuen Stapels")).toHaveValue("Eigener Lernstapel");
  await panel.getByRole("button", { name: "Vorhandener Stapel", exact: true }).click();
  await panel.getByRole("combobox", { name: "Kartenstapel", exact: true }).click();
  await page.getByRole("option").filter({ hasNotText: "Stapel auswählen" }).first().click();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(summary).not.toContainText("(neuer Stapel)");
  expect(remoteRequests).toEqual([]);
});

test("ungültige Quellen ersetzen nichts; fehlende Kartenformen und Dateiauswahl blockieren die Prüfung", async ({ page }) => {
  const panel = await openCatalogFlow(page);
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(panel.getByRole("alert").filter({ hasText: "Wähle eine Quelldatei" })).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles(sourceFile);
  await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Nicht_unterstützt.png" });
  await expect(panel.getByTestId("ai-source-file-name")).toHaveText(sourceFile.name);
  await expect(panel.getByRole("alert")).toContainText("Wähle eine Datei im Format");
  await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Leer.pdf", buffer: Buffer.alloc(0) });
  await expect(panel.getByRole("alert")).toContainText("Die Datei ist leer");
  await expect(panel.getByTestId("ai-source-file-name")).toHaveText(sourceFile.name);
  for (const name of ["Frage–Antwort", "Lückentext", "Single Choice", "Multiple Choice"]) await panel.getByRole("checkbox", { name, exact: true }).uncheck();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(panel.getByText("Wähle mindestens eine Kartenform aus.")).toBeVisible();
  await expect(page.getByTestId("ai-source-summary")).toHaveCount(0);
  await panel.getByRole("button", { name: "Datei entfernen", exact: true }).click();
  await expect(panel.getByTestId("ai-source-file-name")).toHaveCount(0);
  await expect(panel.getByLabel("Name des neuen Stapels")).toHaveValue("");
});

/** An isolated fake account exercises the real shell without accessing a user's cloud data. */
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
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["Nur lokal"], "Quelle.PDF", { type: "application/pdf" }));
    return data;
  });
  await panel.getByRole("group", { name: "Quelle für automatische Karten auswählen oder ablegen" }).dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(panel.getByTestId("ai-source-file-name")).toHaveText("Quelle.PDF");
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(panel.getByText("Wähle einen verfügbaren Zielstapel aus.")).toBeVisible();
  await expect(page.getByTestId("ai-source-summary")).toHaveCount(0);
  await panel.getByRole("button", { name: "Neuer Stapel", exact: true }).click();
  await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await expect(page.getByTestId("ai-source-summary")).toContainText("Quelle (neuer Stapel)");
});

for (const theme of ["light", "dark"] as const) {
  test(`Layoutwechsel ${theme}`, async ({ page }, testInfo) => {
    test.skip(!process.env.CORE_VISUAL_OUTPUT, "Die vollständige Sichtmatrix wird gezielt ausgeführt.");
    await installEmptyAccount(page);
    await page.goto("/neue-karten");
    if (theme === "dark") await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
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
      if (theme === "dark") await page.getByRole("button", { name: "Dark Mode einschalten", exact: true }).click();
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
      await panel.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
      await capture("form-errors");
      await panel.locator('input[type="file"]').setInputFiles({ ...sourceFile, name: "Lange_Quelldatei_Zellatmung_Bedingungen_und_Ausnahmen_des_Energiestoffwechsels.PPTX" });
      await panel.getByText("Weitere Einstellungen", { exact: true }).click();
      await panel.getByRole("textbox", { name: /Lernkontext und Wünsche/ }).fill("Biologie-Abitur; Schwerpunkt Zellatmung; historische Entdeckungen weglassen.");
      await capture("form-expanded");
      await panel.getByRole("combobox", { name: "Lernziel", exact: true }).click();
      await expect(page.getByRole("option", { name: "Zusammenhänge verstehen", exact: true })).toBeVisible();
      await capture("select-open");
      await page.getByRole("option", { name: "Zusammenhänge verstehen", exact: true }).click();
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
      await page.goto("/docs/ui-elements.html#screens");
      if (theme === "dark") await page.locator("#docs-theme").click();
      await page.locator("#screens").getByRole("button", { name: "Automatische Erstellung öffnen", exact: true }).click();
      await capture("catalog-form");
      await page.getByTestId("ai-source-creation").locator('input[type="file"]').setInputFiles(sourceFile);
      await page.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
      await capture("catalog-summary");
    });
  }
}
