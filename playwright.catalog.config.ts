import { defineConfig, devices } from "@playwright/test";
import { CATALOG_SPECS } from "./tests/e2e/support/catalogSpecs.ts";

// Catalog flows and intercepted app flows never reach Supabase; the URL only has to be configured.
process.env.VITE_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= "catalog-e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: CATALOG_SPECS.map((name) => `${name}.spec.ts`),
  outputDir: "test-results/catalog",
  globalSetup: "./tests/e2e/support/catalogWarmup.ts",
  fullyParallel: true,
  timeout: 30_000,
  retries: 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  expect: {
    timeout: 8_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5195/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --mode e2e --port 5195",
    url: "http://127.0.0.1:5195/",
    env: { ...process.env, CORE_VITE_CACHE_DIR: "node_modules/.vite/e2e-catalog" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
