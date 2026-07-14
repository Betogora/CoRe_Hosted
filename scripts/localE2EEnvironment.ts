const LOCAL_E2E_EMAIL = "core-e2e-local@example.com";
const LOCAL_E2E_PASSWORD = "CoRe-E2E-local-2026!";
const LOCAL_RLS_USER_B_EMAIL = "core-rls-user-b-local@example.com";
const LOCAL_RLS_USER_B_PASSWORD = "CoRe-RLS-user-b-local-2026!";
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

  if (!isLocalSupabaseUrl(String(supabaseUrl))) {
    throw new Error("Der lokale E2E-Lauf akzeptiert ausschließlich eine Supabase-URL auf localhost oder 127.0.0.1.");
  }
  if (!String(publishableKey).trim()) {
    throw new Error("Der lokale Supabase-Status enthält weder PUBLISHABLE_KEY noch ANON_KEY.");
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
  };
}
