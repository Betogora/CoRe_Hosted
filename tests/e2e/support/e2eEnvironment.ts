import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { isLocalSupabaseUrl } from "../../../scripts/localE2EEnvironment.ts";

export const e2eAuthStatePath = path.join(process.cwd(), "playwright", ".auth", "user.json");
const e2eEnvironmentFilePath = path.join(process.cwd(), ".env.e2e.local");

const REQUIRED_E2E_VARIABLES = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "CORE_E2E_EMAIL",
  "CORE_E2E_PASSWORD",
  "CORE_E2E_ALLOW_ACCOUNT_RESET",
];

function hasExplicitEnvironmentValue(name: string, fileContent: string) {
  if (Object.prototype.hasOwnProperty.call(process.env, name) && String(process.env[name] ?? "").trim()) return true;
  return fileContent.split(/\r?\n/).some((line: string) => line.trimStart().startsWith(`${name}=`) && line.slice(line.indexOf("=") + 1).trim());
}

export function loadE2EEnvironment() {
  const fileEnvironment = loadEnv("e2e", process.cwd(), "");
  const environment = { ...fileEnvironment, ...process.env };
  const e2eFileContent = existsSync(e2eEnvironmentFilePath) ? readFileSync(e2eEnvironmentFilePath, "utf8") : "";
  const missing = REQUIRED_E2E_VARIABLES.filter(
    (name) => !String(environment[name] ?? "").trim() || !hasExplicitEnvironmentValue(name, e2eFileContent),
  );

  if (missing.length > 0) {
    throw new Error(
      `Playwright-E2E ist nicht isoliert konfiguriert. Lege diese Variablen ausdrücklich in .env.e2e.local oder als CI-Secrets an: ${missing.join(", ")}. Werte aus .env.local werden aus Sicherheitsgründen nicht als E2E-Konfiguration akzeptiert.`,
    );
  }

  if (String(environment.CORE_E2E_ALLOW_ACCOUNT_RESET ?? "").trim().toLowerCase() !== "true") {
    throw new Error(
      "Playwright-E2E darf den Testaccount nicht zurücksetzen. Setze CORE_E2E_ALLOW_ACCOUNT_RESET=true nur für einen dedizierten Supabase-Testaccount.",
    );
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(String(environment.VITE_SUPABASE_URL).trim());
  } catch {
    throw new Error("VITE_SUPABASE_URL in der E2E-Konfiguration ist keine gültige URL.");
  }

  if (!["http:", "https:"].includes(supabaseUrl.protocol)) {
    throw new Error("VITE_SUPABASE_URL in der E2E-Konfiguration muss http oder https verwenden.");
  }

  return {
    supabaseUrl: supabaseUrl.toString().replace(/\/$/, ""),
    publishableKey: String(environment.VITE_SUPABASE_PUBLISHABLE_KEY).trim(),
    email: String(environment.CORE_E2E_EMAIL).trim().toLowerCase(),
    password: String(environment.CORE_E2E_PASSWORD),
  };
}

const REQUIRED_LOCAL_AUTH_LIFECYCLE_VARIABLES = [
  "MAILPIT_URL",
  "CORE_AUTH_MAGIC_EMAIL",
  "CORE_AUTH_RECOVERY_EMAIL",
  "CORE_AUTH_RECOVERY_PASSWORD",
  "CORE_AUTH_RECOVERY_NEXT_PASSWORD",
  "CORE_AUTH_RATE_EMAIL",
  "CORE_AUTH_SIGNUP_EMAIL",
  "CORE_AUTH_SIGNUP_PASSWORD",
] as const;

export function loadLocalAuthLifecycleEnvironment() {
  const environment = { ...loadEnv("e2e", process.cwd(), ""), ...process.env };
  if (REQUIRED_LOCAL_AUTH_LIFECYCLE_VARIABLES.some((name) => !String(environment[name] ?? "").trim())) return null;

  const supabaseUrl = String(environment.VITE_SUPABASE_URL ?? "").trim();
  const mailpitUrl = String(environment.MAILPIT_URL).trim();
  if (!isLocalSupabaseUrl(supabaseUrl) || !isLocalSupabaseUrl(mailpitUrl)) {
    throw new Error("Auth-Lifecycle-E2E darf ausschließlich gegen lokale Supabase- und Mailpit-Instanzen laufen.");
  }

  return {
    mailpitUrl: mailpitUrl.replace(/\/$/, ""),
    magicEmail: String(environment.CORE_AUTH_MAGIC_EMAIL).trim().toLowerCase(),
    recoveryEmail: String(environment.CORE_AUTH_RECOVERY_EMAIL).trim().toLowerCase(),
    recoveryPassword: String(environment.CORE_AUTH_RECOVERY_PASSWORD),
    recoveryNextPassword: String(environment.CORE_AUTH_RECOVERY_NEXT_PASSWORD),
    rateEmail: String(environment.CORE_AUTH_RATE_EMAIL).trim().toLowerCase(),
    signupEmail: String(environment.CORE_AUTH_SIGNUP_EMAIL).trim().toLowerCase(),
    signupPassword: String(environment.CORE_AUTH_SIGNUP_PASSWORD),
  };
}

export async function ensureLocalE2EAccount(environment: { supabaseUrl: any; publishableKey: any; email: any; password: any; }, clientFactory = createClient) {
  if (!isLocalSupabaseUrl(environment.supabaseUrl)) return false;

  const client = clientFactory(environment.supabaseUrl, environment.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const existingLogin = await client.auth.signInWithPassword({
      email: environment.email,
      password: environment.password,
    });
    if (!existingLogin.error) {
      await client.auth.signOut({ scope: "local" });
      return false;
    }

    const signup = await client.auth.signUp({
      email: environment.email,
      password: environment.password,
    });
    if (signup.error) throw new Error(`Der lokale E2E-Testaccount konnte nicht angelegt werden: ${signup.error.message}`);
    await client.auth.signOut({ scope: "local" });

    const verification = await client.auth.signInWithPassword({
      email: environment.email,
      password: environment.password,
    });
    if (verification.error) {
      throw new Error(`Der lokale E2E-Testaccount konnte nach der Anlage nicht angemeldet werden: ${verification.error.message}`);
    }
    await client.auth.signOut({ scope: "local" });
    return true;
  } finally {
    client.auth.dispose?.();
  }
}
