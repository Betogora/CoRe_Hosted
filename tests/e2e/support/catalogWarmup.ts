import { chromium, type FullConfig } from "@playwright/test";

/** Loads the app once so Vite finishes dependency optimization before parallel workers request it. */
export default async function warmUpCatalogServer(config: FullConfig) {
  const baseURL = String(config.projects[0].use.baseURL);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(new URL("neue-karten", baseURL).href, { waitUntil: "networkidle", timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
