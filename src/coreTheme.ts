export type CoreTheme = "light" | "dark";

export const CORE_THEME_STORAGE_KEY = "core.theme.v1";

export function resolveCoreTheme(value: unknown): CoreTheme {
  return value === "dark" ? "dark" : "light";
}

export function readCoreTheme(): CoreTheme {
  if (typeof window === "undefined") return "light";
  try {
    return resolveCoreTheme(window.localStorage.getItem(CORE_THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

function applyThemeAttribute(theme: CoreTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-core-theme", theme);
}

export function initializeCoreTheme() {
  applyThemeAttribute(readCoreTheme());
}

export function toggleCoreTheme(theme: CoreTheme): CoreTheme {
  const nextTheme = theme === "dark" ? "light" : "dark";
  applyThemeAttribute(nextTheme);
  if (typeof window === "undefined") return nextTheme;
  try {
    window.localStorage.setItem(CORE_THEME_STORAGE_KEY, nextTheme);
  } catch {
    // The visual choice still applies when browser storage is unavailable.
  }
  return nextTheme;
}
