import { defineConfig, devices } from "@playwright/test";
import { e2eAuthStatePath } from "./tests/e2e/support/e2eEnvironment.js";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5190/",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --mode e2e",
    url: "http://127.0.0.1:5190/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated-chromium",
      testIgnore: /auth\.setup\.js/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: e2eAuthStatePath,
      },
    },
  ],
});
