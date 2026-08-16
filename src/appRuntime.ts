export interface AppRuntimeInfo {
  version: string;
}

interface AppRuntimeInput {
  version?: unknown;
  [key: string]: unknown;
}

declare const __CORE_RELEASE_INFO__: unknown;

function normalizeVersion(value: unknown): string {
  const version = String(value ?? "").trim();
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version) ? version : "0.0.0";
}

export function normalizeAppRuntimeInfo(input: AppRuntimeInput | AppRuntimeInfo = {}): AppRuntimeInfo {
  return {
    version: normalizeVersion(input.version),
  };
}

const injectedReleaseInfo: AppRuntimeInput = typeof __CORE_RELEASE_INFO__ === "undefined" || !__CORE_RELEASE_INFO__ || typeof __CORE_RELEASE_INFO__ !== "object"
  ? {}
  : __CORE_RELEASE_INFO__ as AppRuntimeInput;

export const APP_RUNTIME_INFO = Object.freeze(normalizeAppRuntimeInfo(injectedReleaseInfo));
