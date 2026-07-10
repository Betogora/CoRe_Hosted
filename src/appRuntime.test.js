import assert from "node:assert/strict";
import test from "node:test";
import { resolveReleaseInfo } from "../vite.config.js";
import { formatAppRuntimeInfo, normalizeAppRuntimeInfo } from "./appRuntime.js";

test("release info prefers Vercel metadata and exposes only the allowlisted fields", () => {
  const info = resolveReleaseInfo({
    mode: "development",
    version: "0.1.0",
    env: {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "ABCDEF1234567890",
      GITHUB_SHA: "9999999999999999",
      GOOGLE_API_KEY: "must-not-appear",
      VERCEL_URL: "must-not-appear.example",
    },
  });

  assert.deepEqual(info, {
    version: "0.1.0",
    commit: "abcdef1",
    environment: "preview",
  });
  assert.equal(JSON.stringify(info).includes("must-not-appear"), false);
});

test("release info falls back to GitHub and maps all e2e modes to test", () => {
  assert.deepEqual(
    resolveReleaseInfo({
      mode: "e2e-unconfigured",
      version: "0.1.0",
      env: { GITHUB_SHA: "1234567890abcdef" },
    }),
    {
      version: "0.1.0",
      commit: "1234567",
      environment: "e2e",
    },
  );
});

test("runtime info normalizes invalid values to safe local development fallbacks", () => {
  assert.deepEqual(
    normalizeAppRuntimeInfo({
      version: "<script>",
      commit: "secret-token",
      environment: "private-production-name",
      providerSecret: "must-not-appear",
    }),
    {
      version: "0.0.0",
      commit: "local",
      environment: "development",
      environmentLabel: "Entwicklung",
    },
  );
});

test("runtime info formats German environment labels and never includes extra input fields", () => {
  const formatted = formatAppRuntimeInfo({
    version: "0.1.0",
    commit: "abcdef123456",
    environment: "production",
    rawPrompt: "must-not-appear",
  });

  assert.equal(formatted, "CoRe 0.1.0 · Produktion · Commit abcdef1");
  assert.equal(formatted.includes("must-not-appear"), false);
});
