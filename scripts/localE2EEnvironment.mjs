const LOCAL_E2E_EMAIL = "core-e2e-local@example.com";
const LOCAL_E2E_PASSWORD = "CoRe-E2E-local-2026!";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

function stripOptionalQuotes(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2 && trimmed[0] === trimmed.at(-1) && ["\"", "'"].includes(trimmed[0])) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSupabaseStatusEnvironment(output) {
  return Object.fromEntries(
    String(output ?? "")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], stripOptionalQuotes(match[2])]),
  );
}

export function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol) && LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

export function createLocalE2ERuntimeEnvironment(statusEnvironment, baseEnvironment = {}) {
  const supabaseUrl = statusEnvironment.API_URL ?? statusEnvironment.SUPABASE_URL ?? "";
  const publishableKey = statusEnvironment.PUBLISHABLE_KEY ?? statusEnvironment.ANON_KEY ?? "";

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error("Der lokale E2E-Lauf akzeptiert ausschließlich eine Supabase-URL auf localhost oder 127.0.0.1.");
  }
  if (!String(publishableKey).trim()) {
    throw new Error("Der lokale Supabase-Status enthält weder PUBLISHABLE_KEY noch ANON_KEY.");
  }

  return {
    ...baseEnvironment,
    VITE_SUPABASE_URL: String(supabaseUrl).replace(/\/$/, ""),
    VITE_SUPABASE_PUBLISHABLE_KEY: String(publishableKey).trim(),
    CORE_E2E_EMAIL: LOCAL_E2E_EMAIL,
    CORE_E2E_PASSWORD: LOCAL_E2E_PASSWORD,
    CORE_E2E_ALLOW_ACCOUNT_RESET: "true",
  };
}
