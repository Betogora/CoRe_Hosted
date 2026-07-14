import { createClient } from "@supabase/supabase-js";

const LOCAL_E2E_EMAIL = "core-e2e-local@example.com";
const LOCAL_E2E_PASSWORD = "CoRe-E2E-local-2026!";
const LOCAL_RLS_USER_B_EMAIL = "core-rls-user-b-local@example.com";
const LOCAL_RLS_USER_B_PASSWORD = "CoRe-RLS-user-b-local-2026!";
const LOCAL_TWO_DEVICE_EMAIL = "core-two-device-local@example.com";
const LOCAL_TWO_DEVICE_PASSWORD = "CoRe-Two-device-local-2026!";
const LOCAL_AUTH_MAGIC_EMAIL = "core-auth-magic-local@example.com";
const LOCAL_AUTH_MAGIC_PASSWORD = "CoRe-Auth-magic-local-2026!";
const LOCAL_AUTH_RECOVERY_EMAIL = "core-auth-recovery-local@example.com";
const LOCAL_AUTH_RECOVERY_PASSWORD = "CoRe-Auth-recovery-local-2026!";
const LOCAL_AUTH_RECOVERY_NEXT_PASSWORD = "CoRe-Auth-recovery-next-2026!";
const LOCAL_AUTH_RATE_EMAIL = "core-auth-rate-local@example.com";
const LOCAL_AUTH_RATE_PASSWORD = "CoRe-Auth-rate-local-2026!";
const LOCAL_AUTH_SIGNUP_EMAIL = "core-auth-signup-local@example.com";
const LOCAL_AUTH_SIGNUP_PASSWORD = "CoRe-Auth-signup-local-2026!";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const PRIVILEGED_ENVIRONMENT_KEYS = new Set([
  "SERVICE_ROLE_KEY",
  "SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_REFRESH_TOKEN",
  "SUPABASE_DB_PASSWORD",
]);

function stripOptionalQuotes(value: string) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2 && trimmed[0] === trimmed.at(-1) && ["\"", "'"].includes(trimmed[0])) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSupabaseStatusEnvironment(output: string) {
  const rawOutput = String(output ?? "").trim();
  if (!rawOutput) return {};

  try {
    const parsed = JSON.parse(rawOutput);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Ältere Supabase-CLI-Versionen liefern weiterhin KEY=VALUE-Zeilen.
  }

  return Object.fromEntries(
    rawOutput
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], stripOptionalQuotes(match[2])]),
  );
}

export function isLocalSupabaseUrl(value: string) {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol) && LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

interface SupabaseStatusEnvironment {
  API_URL?: unknown;
  ANON_KEY?: unknown;
  PUBLISHABLE_KEY?: unknown;
  SECRET_KEY?: unknown;
  SERVICE_ROLE_KEY?: unknown;
  SUPABASE_URL?: unknown;
  INBUCKET_URL?: unknown;
  MAILPIT_URL?: unknown;
  [key: string]: unknown;
}

export function createLocalPrivilegedTestEnvironment(
  statusEnvironment: SupabaseStatusEnvironment,
  baseEnvironment: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const safeEnvironment = createLocalE2ERuntimeEnvironment(statusEnvironment, baseEnvironment);
  const secret = statusEnvironment.SECRET_KEY ?? statusEnvironment.SERVICE_ROLE_KEY ?? "";
  if (!String(secret).trim()) {
    throw new Error("Der lokale Supabase-Status enthält weder SECRET_KEY noch SERVICE_ROLE_KEY.");
  }
  return {
    ...safeEnvironment,
    SUPABASE_URL: safeEnvironment.VITE_SUPABASE_URL,
    SUPABASE_SECRET_KEY: String(secret).trim(),
  };
}

export function createLocalE2ERuntimeEnvironment(
  statusEnvironment: SupabaseStatusEnvironment,
  baseEnvironment: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const supabaseUrl = statusEnvironment.API_URL ?? statusEnvironment.SUPABASE_URL ?? "";
  const publishableKey = statusEnvironment.PUBLISHABLE_KEY ?? statusEnvironment.ANON_KEY ?? "";
  const mailpitUrl = statusEnvironment.MAILPIT_URL ?? statusEnvironment.INBUCKET_URL ?? "";

  if (!isLocalSupabaseUrl(String(supabaseUrl))) {
    throw new Error("Der lokale E2E-Lauf akzeptiert ausschließlich eine Supabase-URL auf localhost oder 127.0.0.1.");
  }
  if (!String(publishableKey).trim()) {
    throw new Error("Der lokale Supabase-Status enthält weder PUBLISHABLE_KEY noch ANON_KEY.");
  }
  if (String(mailpitUrl).trim() && !isLocalSupabaseUrl(String(mailpitUrl))) {
    throw new Error("Der lokale E2E-Lauf akzeptiert ausschließlich eine Mailpit-URL auf localhost oder 127.0.0.1.");
  }

  const safeBaseEnvironment = Object.fromEntries(
    Object.entries(baseEnvironment).filter(([name]) => !PRIVILEGED_ENVIRONMENT_KEYS.has(name)),
  );

  return {
    ...safeBaseEnvironment,
    VITE_SUPABASE_URL: String(supabaseUrl).replace(/\/$/, ""),
    VITE_SUPABASE_PUBLISHABLE_KEY: String(publishableKey).trim(),
    CORE_E2E_EMAIL: LOCAL_E2E_EMAIL,
    CORE_E2E_PASSWORD: LOCAL_E2E_PASSWORD,
    CORE_E2E_ALLOW_ACCOUNT_RESET: "true",
    CORE_RLS_USER_B_EMAIL: LOCAL_RLS_USER_B_EMAIL,
    CORE_RLS_USER_B_PASSWORD: LOCAL_RLS_USER_B_PASSWORD,
    CORE_TWO_DEVICE_EMAIL: LOCAL_TWO_DEVICE_EMAIL,
    CORE_TWO_DEVICE_PASSWORD: LOCAL_TWO_DEVICE_PASSWORD,
    CORE_AUTH_MAGIC_EMAIL: LOCAL_AUTH_MAGIC_EMAIL,
    CORE_AUTH_MAGIC_PASSWORD: LOCAL_AUTH_MAGIC_PASSWORD,
    CORE_AUTH_RECOVERY_EMAIL: LOCAL_AUTH_RECOVERY_EMAIL,
    CORE_AUTH_RECOVERY_PASSWORD: LOCAL_AUTH_RECOVERY_PASSWORD,
    CORE_AUTH_RECOVERY_NEXT_PASSWORD: LOCAL_AUTH_RECOVERY_NEXT_PASSWORD,
    CORE_AUTH_RATE_EMAIL: LOCAL_AUTH_RATE_EMAIL,
    CORE_AUTH_RATE_PASSWORD: LOCAL_AUTH_RATE_PASSWORD,
    CORE_AUTH_SIGNUP_EMAIL: LOCAL_AUTH_SIGNUP_EMAIL,
    CORE_AUTH_SIGNUP_PASSWORD: LOCAL_AUTH_SIGNUP_PASSWORD,
    ...(String(mailpitUrl).trim() ? { MAILPIT_URL: String(mailpitUrl).replace(/\/$/, "") } : {}),
  };
}

interface LocalE2EAccount {
  email: string;
  password: string;
}

export async function provisionLocalE2EAccounts(
  environment: NodeJS.ProcessEnv,
  clientFactory = createClient,
) {
  const url = String(environment.SUPABASE_URL ?? "").trim();
  const secret = String(environment.SUPABASE_SECRET_KEY ?? "").trim();
  if (!isLocalSupabaseUrl(url) || !secret) throw new Error("Lokale E2E-Accounts dürfen nur privilegiert gegen Loopback-Supabase provisioniert werden.");

  const accounts: LocalE2EAccount[] = [
    { email: LOCAL_E2E_EMAIL, password: LOCAL_E2E_PASSWORD },
    { email: LOCAL_RLS_USER_B_EMAIL, password: LOCAL_RLS_USER_B_PASSWORD },
    { email: LOCAL_TWO_DEVICE_EMAIL, password: LOCAL_TWO_DEVICE_PASSWORD },
    { email: LOCAL_AUTH_MAGIC_EMAIL, password: LOCAL_AUTH_MAGIC_PASSWORD },
    { email: LOCAL_AUTH_RECOVERY_EMAIL, password: LOCAL_AUTH_RECOVERY_PASSWORD },
    { email: LOCAL_AUTH_RATE_EMAIL, password: LOCAL_AUTH_RATE_PASSWORD },
  ];
  const client = clientFactory(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

  try {
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1_000 });
    if (error) throw new Error(`Lokale E2E-Accounts konnten nicht gelesen werden: ${error.message}`);
    const usersByEmail = new Map((data?.users ?? []).map((user: { email?: string; id: string }) => [String(user.email ?? "").toLowerCase(), user]));

    const staleSignup = usersByEmail.get(LOCAL_AUTH_SIGNUP_EMAIL);
    if (staleSignup) {
      const { error: deleteError } = await client.auth.admin.deleteUser(staleSignup.id);
      if (deleteError) throw new Error(`Der lokale Signup-Testaccount konnte nicht zurückgesetzt werden: ${deleteError.message}`);
    }

    for (const account of accounts) {
      const existing = usersByEmail.get(account.email);
      const result = existing
        ? await client.auth.admin.updateUserById(existing.id, { password: account.password, email_confirm: true })
        : await client.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (result.error) throw new Error(`Lokaler E2E-Testaccount ${account.email} konnte nicht provisioniert werden: ${result.error.message}`);
    }
  } finally {
    client.auth.dispose?.();
  }
}
