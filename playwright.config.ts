import { defineConfig, devices } from "@playwright/test";
import { e2eAuthStatePath } from "./tests/e2e/support/e2eEnvironment.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5190/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      name: "configured-app",
      command: "npm run dev -- --mode e2e",
      url: "http://127.0.0.1:5190/",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "unconfigured-app",
      command: "npm run dev -- --mode e2e-unconfigured --port 5191",
      url: "http://127.0.0.1:5191/",
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
      },
    },
    {
      name: "auth-gate-chromium",
      testMatch: /auth-gate\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "auth-resilience-chromium",
      testMatch: /auth-resilience\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated-chromium",
      testMatch: [/core-stabilization\.spec\.ts/, /world-capitals-hierarchy\.spec\.ts/, /zz-media-import\.spec\.ts/],
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: e2eAuthStatePath,
        trace: "off",
      },
    },
  ],
});
