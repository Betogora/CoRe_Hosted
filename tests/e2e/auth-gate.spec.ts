import { expect, test, type Page } from "@playwright/test";

function authForm(page: Page) {
  return page.locator("form");
}

test("login gate exposes the supported authentication paths without an app session", async ({ page }: any) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
  await expect(authForm(page).getByRole("button", { name: "Anmelden", exact: true })).toBeEnabled();
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toHaveCount(0);
  await expect(page.getByLabel("E-Mail")).toBeVisible();
  await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mit Google anmelden" })).toBeVisible();
  await expect(page.getByLabel("Release-Information")).toHaveText(/^CoRe 0\.1\.0 · Test · Commit (?:lokal|[a-f0-9]{7})$/);

  await page.getByRole("button", { name: "Magic Link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Magic Link senden" })).toBeVisible();
  await expect(page.getByLabel("Passwort", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Account erstellen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account erstellen" })).toBeVisible();
  await expect(page.getByLabel("Anzeigename")).toBeVisible();
  await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Passwort vergessen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Passwort zurücksetzen" })).toBeVisible();
  await expect(page.getByLabel("Passwort", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
});

test("login modes keep a predictable keyboard focus", async ({ page }: any) => {
  await page.goto("/");
  await expect(page.getByLabel("E-Mail")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Passwort", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(authForm(page).getByRole("button", { name: "Anmelden", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Magic Link", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("E-Mail")).toBeFocused();
  await expect(page.getByRole("heading", { name: "Magic Link senden" })).toBeVisible();
});

test("invalid credentials stay behind the login gate and show the German auth error", async ({ page }: any) => {
  await page.route(/\/auth\/v1\/token\?grant_type=password(?:&.*)?$/, async (route: any) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_credentials",
        message: "Invalid login credentials",
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("E-Mail").fill("ungueltig@core.invalid");
  await page.getByLabel("Passwort", { exact: true }).fill("falsches-passwort");
  await authForm(page).getByRole("button", { name: "Anmelden", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText("E-Mail oder Passwort stimmt nicht.");
  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toHaveCount(0);
});

test("render errors show a safe recovery page with release context", async ({ page }: any) => {
  await page.goto("/?core_e2e_render_error=1");

  await expect(page.getByRole("heading", { name: "CoRe konnte nicht geladen werden" })).toBeVisible();
  await expect(page.getByText("Nicht synchronisierte Änderungen seit dem letzten erfolgreichen Speichern können verloren gehen.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Seite neu laden" })).toBeVisible();
  await expect(page.getByLabel("Release-Information")).toHaveText(/^CoRe 0\.1\.0 · Test · Commit (?:lokal|[a-f0-9]{7})$/);
  await expect(page.getByText("core_e2e_render_error")).toHaveCount(0);

  await page.getByRole("button", { name: "Startseite öffnen" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
});
