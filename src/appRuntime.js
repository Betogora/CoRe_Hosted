const environmentLabels = {
  production: "Produktion",
  preview: "Vorschau",
  development: "Entwicklung",
  e2e: "Test",
  test: "Test",
};

function normalizeVersion(value) {
  const version = String(value ?? "").trim();
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version) ? version : "0.0.0";
}

function normalizeCommit(value) {
  const commit = String(value ?? "").trim();
  if (commit === "local") return commit;
  return /^[a-f0-9]{7,40}$/i.test(commit) ? commit.slice(0, 7).toLowerCase() : "local";
}

function normalizeEnvironment(value) {
  const environment = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(environmentLabels, environment) ? environment : "development";
}

export function normalizeAppRuntimeInfo(input = {}) {
  const environment = normalizeEnvironment(input?.environment);
  return {
    version: normalizeVersion(input?.version),
    commit: normalizeCommit(input?.commit),
    environment,
    environmentLabel: environmentLabels[environment],
  };
}

export function formatAppRuntimeInfo(info = APP_RUNTIME_INFO) {
  const normalized = normalizeAppRuntimeInfo(info);
  const commitLabel = normalized.commit === "local" ? "lokal" : normalized.commit;
  return `CoRe ${normalized.version} · ${normalized.environmentLabel} · Commit ${commitLabel}`;
}

const injectedReleaseInfo = typeof __CORE_RELEASE_INFO__ === "undefined" ? {} : __CORE_RELEASE_INFO__;

export const APP_RUNTIME_INFO = Object.freeze(normalizeAppRuntimeInfo(injectedReleaseInfo));
