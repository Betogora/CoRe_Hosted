import { expect, test, type Page } from "@playwright/test";
import { clearAuthMailbox, extractAuthConfirmationUrl, waitForAuthEmail } from "./support/authMailbox.ts";
import { loadLocalAuthLifecycleEnvironment } from "./support/e2eEnvironment.ts";

const environment = loadLocalAuthLifecycleEnvironment();

test.describe("lokaler Auth-Lifecycle", () => {
  test.skip(!environment, "Benötigt die vom lokalen Supabase-Runner provisionierte Auth-/Mailpit-Umgebung.");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await clearAuthMailbox(environment!.mailpitUrl);
  });

  test("[Vertrag: erster Account bis erster Review] @golden-e2e Registrierung führt über E-Mail-Bestätigung zur ersten Karte", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Account erstellen", exact: true }).click();
    await page.getByLabel("Anzeigename").fill("Auth Lifecycle");
    await page.getByLabel("E-Mail").fill(environment!.signupEmail);
    await page.getByLabel("Passwort", { exact: true }).fill(environment!.signupPassword);
    await page.locator("form").getByRole("button", { name: "Account erstellen", exact: true }).click();

    await expect(page.getByRole("status")).toContainText("Bitte bestätige deine E-Mail-Adresse");
    const message = await waitForAuthEmail(environment!.mailpitUrl, {
      recipient: environment!.signupEmail,
      subject: /E-Mail bestätigen/,
    });
    await page.goto(extractAuthConfirmationUrl(message));
    await expectAuthenticated(page);
    await expect(page.getByRole("heading", { name: "Willkommen bei CoRe" })).toBeVisible();
    await page.getByRole("button", { name: /Erste Karte erstellen/ }).click();
    await page.getByRole("textbox", { name: "Vorderseite" }).fill("Was schützt dieses Golden-E2E?");
    await page.getByRole("textbox", { name: "Rückseite" }).fill("Den ersten Lernerfolg eines neuen Accounts.");
    await page.getByRole("button", { name: "Originalkarte speichern" }).click();
    await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
    await page.getByRole("button", { name: "Jetzt lernen" }).click();
    await page.getByRole("button", { name: "Antwort anzeigen" }).click();
    await page.getByRole("button", { name: /Bewertung Gut/ }).click();
    await expect(page.getByRole("heading", { name: "Sitzung abgeschlossen" })).toBeVisible();
  });

  test("Magic Link meldet an und ein verbrauchter Link zeigt eine Ablaufmeldung", async ({ page }) => {
    await requestEmailLink(page, "Magic Link", environment!.magicEmail, "Magic Link senden");
    const message = await waitForAuthEmail(environment!.mailpitUrl, {
      recipient: environment!.magicEmail,
      subject: /Magic Link/,
    });
    const link = extractAuthConfirmationUrl(message);

    await page.goto(link);
    await expectAuthenticated(page);
    await signOut(page);
    await page.goto(link);

    await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("abgelaufen oder wurde bereits verwendet");
  });

  test("Recovery ersetzt das Passwort und nur das neue Passwort meldet danach an", async ({ page }) => {
    await requestEmailLink(page, "Passwort vergessen", environment!.recoveryEmail, "Reset-Link senden");
    const message = await waitForAuthEmail(environment!.mailpitUrl, {
      recipient: environment!.recoveryEmail,
      subject: /Passwort zurücksetzen/,
    });
    await page.goto(extractAuthConfirmationUrl(message));

    await expect(page.getByRole("heading", { name: "Neues Passwort setzen" })).toBeVisible();
    await page.getByLabel("Neues Passwort").fill(environment!.recoveryNextPassword);
    await page.getByLabel("Passwort wiederholen").fill(environment!.recoveryNextPassword);
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await expectAuthenticated(page);
    await signOut(page);

    await signIn(page, environment!.recoveryEmail, environment!.recoveryPassword);
    await expect(page.getByRole("alert")).toHaveText("E-Mail oder Passwort stimmt nicht.");
    await signIn(page, environment!.recoveryEmail, environment!.recoveryNextPassword);
    await expectAuthenticated(page);
  });

  test("unmittelbar wiederholte E-Mail-Anforderung zeigt das lokale Cooldown-Limit", async ({ page }) => {
    await requestEmailLink(page, "Magic Link", environment!.rateEmail, "Magic Link senden");
    await expect(page.getByRole("status")).toContainText("wurde ein Magic Link verschickt");
    await page.locator("form").getByRole("button", { name: "Magic Link senden" }).click();
    await expect(page.getByRole("alert")).toContainText("Bitte warte kurz");
  });

  test("Google-Start übergibt Provider und exakte App-Rücksprungadresse an die Drittanbieter-Seam", async ({ page }) => {
    let authorizeUrl: URL | undefined;
    await page.route(/\/auth\/v1\/authorize(?:\?.*)?$/, async (route) => {
      authorizeUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>Google OAuth seam</h1>",
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Mit Google anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Google OAuth seam" })).toBeVisible();

    expect(authorizeUrl?.searchParams.get("provider")).toBe("google");
    expect(authorizeUrl?.searchParams.get("redirect_to")).toBe("http://127.0.0.1:5190/");
    await expect(page).toHaveURL(/\/auth\/v1\/authorize/);
  });
});

async function requestEmailLink(page: Page, mode: "Magic Link" | "Passwort vergessen", email: string, submitLabel: string) {
  await page.goto("/");
  await page.getByRole("button", { name: mode, exact: true }).click();
  await page.getByLabel("E-Mail").fill(email);
  await page.locator("form").getByRole("button", { name: submitLabel, exact: true }).click();
}

async function expectAuthenticated(page: Page) {
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toBeVisible({ timeout: 30_000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Anmelden", exact: true }).click();
}
