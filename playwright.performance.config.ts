import { defineConfig, devices } from "@playwright/test";
import { e2eAuthStatePath } from "./tests/e2e/support/e2eEnvironment.ts";

export default defineConfig({
  testDir: "./tests",
  timeout: 10 * 60_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/performance-playwright",
  use: {
    baseURL: "http://127.0.0.1:5190/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5190",
    url: "http://127.0.0.1:5190/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /e2e\/auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    {
      name: "startup-performance",
      testMatch: /performance\/startup\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: { ...devices["Desktop Chrome"], storageState: e2eAuthStatePath },
    },
  ],
});
