import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const knownVercelEnvironments = new Set(["production", "preview", "development"]);

function normalizeBuildCommit(value) {
  const commit = String(value ?? "").trim();
  return /^[a-f0-9]{7,40}$/i.test(commit) ? commit.slice(0, 7).toLowerCase() : "local";
}

function normalizeBuildEnvironment(value, mode) {
  const environment = String(value ?? "").trim().toLowerCase();
  if (knownVercelEnvironments.has(environment)) return environment;
  if (String(mode ?? "").toLowerCase().startsWith("e2e")) return "e2e";
  if (mode === "test") return "test";
  return mode === "production" ? "production" : "development";
}

export function resolveReleaseInfo({ mode = "development", env = process.env, version = packageJson.version } = {}) {
  return {
    version,
    commit: normalizeBuildCommit(env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA),
    environment: normalizeBuildEnvironment(env.VERCEL_ENV, mode),
  };
}

export default defineConfig(({ mode }) => ({
  define: {
    __CORE_RELEASE_INFO__: JSON.stringify(resolveReleaseInfo({ mode })),
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
  },
}));
