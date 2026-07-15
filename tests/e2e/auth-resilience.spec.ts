import { expect, test, type Page } from "@playwright/test";
import { loadEnv } from "vite";

const UNCONFIGURED_APP_URL = "http://127.0.0.1:5191/";
const E2E_USER_ID = "00000000-0000-4000-8000-000000000099";

function getConfiguredSupabaseUrl() {
  const environment = { ...loadEnv("e2e", process.cwd(), ""), ...process.env };
  const value = String(environment.VITE_SUPABASE_URL ?? "").trim();
  if (!value) throw new Error("Auth-Resilience-Smokes benötigen für den konfigurierten App-Server eine Supabase-URL.");
  return value.replace(/\/$/, "");
}

function toBase64Url(value: { alg?: string; typ?: string; sub?: string; iat?: number; exp?: number; id?: string; aud?: string; role?: string; email?: string; }) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createCachedSession() {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: E2E_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "session-test@core.invalid",
  };
  const accessToken = [
    toBase64Url({ alg: "HS256", typ: "JWT" }),
    toBase64Url({ ...user, sub: user.id, iat: now, exp: now + 3_600 }),
    "e2e-signature",
  ].join(".");

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3_600,
    expires_at: now + 3_600,
    refresh_token: "e2e-refresh-token",
    user,
  };
}

async function installCachedSession(page: Page, supabaseUrl: string|URL) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await page.addInitScript(
    ({ storageKey, session }: any) => localStorage.setItem(storageKey, JSON.stringify(session)),
    {
      storageKey: `sb-${projectRef}-auth-token`,
      session: createCachedSession(),
    },
  );
}

test("missing Supabase configuration stays behind a disabled login gate", async ({ page }: any) => {
  await page.goto(UNCONFIGURED_APP_URL);

  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Supabase ist für diese Umgebung noch nicht konfiguriert.");
  await expect(page.locator("form").getByRole("button", { name: "Anmelden", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mit Google anmelden" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Magic Link", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toHaveCount(0);
});

test("offline Supabase start returns to login with a German network error", async ({ page }: any) => {
  const supabaseUrl = getConfiguredSupabaseUrl();
  await installCachedSession(page, supabaseUrl);
  await page.route(`${supabaseUrl}/**`, (route: any) => route.abort("internetdisconnected"));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Supabase ist momentan nicht erreichbar. Prüfe deine Internetverbindung und versuche es erneut.",
  );
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toHaveCount(0);
});

test("expired Supabase session returns to login with reauthentication guidance", async ({ page }: any) => {
  const supabaseUrl = getConfiguredSupabaseUrl();
  await installCachedSession(page, supabaseUrl);
  await page.route(`${supabaseUrl}/auth/v1/user`, async (route: any) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        code: "session_expired",
        message: "Session expired",
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Bei CoRe anmelden" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
  await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toHaveCount(0);
});
