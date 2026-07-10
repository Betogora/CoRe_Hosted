const CORE_STORAGE_PREFIX = "core.";
const ACCOUNT_STATE_PREFIX = "core.accountState.v1.";
const ACCOUNT_STATE_SUFFIX = ".core.appState.v2";

function isSupabaseAuthStorageKey(key) {
  return key.startsWith("sb-") && key.endsWith("-auth-token");
}

export async function resetToFreshLocalState(page) {
  await page.goto("/");

  const authKeyBefore = await page.evaluate(() =>
    Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token")) ?? null,
  );
  if (!authKeyBefore) throw new Error("Die authentifizierte Playwright-Session fehlt vor dem App-State-Reset.");

  await page.evaluate((prefix) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
  }, CORE_STORAGE_PREFIX);

  const authKeyAfter = await page.evaluate(() =>
    Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token")) ?? null,
  );
  if (authKeyAfter !== authKeyBefore) throw new Error("Der App-State-Reset hat die Supabase-Session verändert.");

  await page.reload();
  await page.getByRole("navigation", { name: /Hauptmen/ }).waitFor({ state: "visible" });

  return { authStorageKey: authKeyAfter };
}

export async function readActiveAccountState(page) {
  return page.evaluate(
    ({ prefix, suffix }) => {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix) && key.endsWith(suffix));
      if (keys.length !== 1) {
        throw new Error(`Erwartete genau einen accountgebundenen CoRe-State, gefunden: ${keys.length}.`);
      }

      const value = localStorage.getItem(keys[0]);
      if (!value) throw new Error("Der accountgebundene CoRe-State ist leer.");
      return JSON.parse(value);
    },
    { prefix: ACCOUNT_STATE_PREFIX, suffix: ACCOUNT_STATE_SUFFIX },
  );
}

export function sanitizeStorageState(storageState) {
  return {
    ...storageState,
    origins: (storageState.origins ?? []).map((origin) => ({
      ...origin,
      localStorage: (origin.localStorage ?? []).filter(({ name }) => !name.startsWith(CORE_STORAGE_PREFIX)),
    })),
  };
}

export function hasSupabaseAuthStorage(storageState) {
  return (storageState.origins ?? []).some((origin) => (origin.localStorage ?? []).some(({ name }) => isSupabaseAuthStorageKey(name)));
}
