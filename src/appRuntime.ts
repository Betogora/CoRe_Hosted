const environmentLabels = {
  production: "Produktion",
  preview: "Vorschau",
  development: "Entwicklung",
  e2e: "Test",
  test: "Test",
} as const;

export type AppRuntimeEnvironment = keyof typeof environmentLabels;

export interface AppRuntimeInfo {
  version: string;
  commit: string;
  environment: AppRuntimeEnvironment;
  environmentLabel: (typeof environmentLabels)[AppRuntimeEnvironment];
}

interface AppRuntimeInput {
  version?: unknown;
  commit?: unknown;
  environment?: unknown;
  [key: string]: unknown;
}

declare const __CORE_RELEASE_INFO__: unknown;

function normalizeVersion(value: unknown): string {
  const version = String(value ?? "").trim();
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version) ? version : "0.0.0";
}

function normalizeCommit(value: unknown): string {
  const commit = String(value ?? "").trim();
  if (commit === "local") return commit;
  return /^[a-f0-9]{7,40}$/i.test(commit) ? commit.slice(0, 7).toLowerCase() : "local";
}

function normalizeEnvironment(value: unknown): AppRuntimeEnvironment {
  const environment = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(environmentLabels, environment) ? environment as AppRuntimeEnvironment : "development";
}

export function normalizeAppRuntimeInfo(input: AppRuntimeInput | AppRuntimeInfo = {}): AppRuntimeInfo {
  const environment = normalizeEnvironment(input.environment);
  return {
    version: normalizeVersion(input.version),
    commit: normalizeCommit(input.commit),
    environment,
    environmentLabel: environmentLabels[environment],
  };
}

export function formatAppRuntimeInfo(info: AppRuntimeInput | AppRuntimeInfo = APP_RUNTIME_INFO): string {
  const normalized = normalizeAppRuntimeInfo(info);
  const commitLabel = normalized.commit === "local" ? "lokal" : normalized.commit;
  return `CoRe ${normalized.version} · ${normalized.environmentLabel} · Commit ${commitLabel}`;
}

const injectedReleaseInfo: AppRuntimeInput = typeof __CORE_RELEASE_INFO__ === "undefined" || !__CORE_RELEASE_INFO__ || typeof __CORE_RELEASE_INFO__ !== "object"
  ? {}
  : __CORE_RELEASE_INFO__ as AppRuntimeInput;

export const APP_RUNTIME_INFO = Object.freeze(normalizeAppRuntimeInfo(injectedReleaseInfo));
