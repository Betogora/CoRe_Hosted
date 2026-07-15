import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.ts";

const rawBaseUrl = String(process.env.CORE_HOSTED_BASE_URL ?? "").trim();
let baseURL: string;

try {
  const parsed = new URL(rawBaseUrl);
  if (parsed.protocol !== "https:") throw new Error("Hosted-Beta-Smokes benötigen HTTPS.");
  baseURL = parsed.toString();
} catch (error) {
  throw new Error(`CORE_HOSTED_BASE_URL muss eine gültige HTTPS-URL sein. ${error instanceof Error ? error.message : ""}`.trim());
}

export default defineConfig({
  ...baseConfig,
  webServer: undefined,
  use: {
    ...baseConfig.use,
    baseURL,
  },
});
