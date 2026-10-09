// Öffentlich erreichbare Demos ohne Account oder Supabase-Einrichtung.
// Betroffene App-Zustände bei Produktänderungen als weitere Szenen ergänzen.
const sizes = {
  narrow: { width: 320, height: 720 },
  small: { width: 360, height: 800 },
  mobile: { width: 390, height: 844 },
  wide: { width: 430, height: 932 },
  desktopMin: { width: 1280, height: 720 },
  desktop: { width: 1440, height: 900 },
};

async function centerFirst(page, selectors) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.count()) {
      await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      return;
    }
  }
}

export default {
  defaultView: "mobile",
  views: Object.fromEntries(Object.entries(sizes).flatMap(([name, size]) => [
    [name, { ...size, colorScheme: "light" }],
    [`${name}-dark`, { ...size, colorScheme: "dark" }],
  ])),
  settle: 300,
  beforeEach: async (page) => {
    await page.locator(".catalog-section").first().waitFor();
    await page.evaluate(async () => {
      document.documentElement.dataset.coreTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      await document.fonts.ready;
    });
  },
  scenes: {
    "design-tokens": {
      path: "/docs/ui-elements.html",
      run: async ({ page }) => page.locator("#tokens").scrollIntoViewIfNeeded(),
    },
    "basic-card": {
      path: "/docs/card-types.html",
      run: async ({ page }) => page.locator("#basic").scrollIntoViewIfNeeded(),
    },
    // K6.1: building blocks of manual creation and of the card editor in the real product views.
    "erstellen-bausteine": {
      path: "/docs/ui-elements.html",
      run: async ({ page, click }) => {
        await click("Manuelle Erstellung öffnen");
        await centerFirst(page, ['[data-testid="note-blocks"]']);
      },
    },
    "editor-bausteine": {
      path: "/docs/ui-elements.html",
      run: async ({ page, click }) => {
        await click("Kartenverwaltung öffnen");
        await page.locator('[data-testid^="deck-card-"]').first().click();
        await page.waitForTimeout(500);
        await centerFirst(page, ['[data-testid="card-detail-editor"] [data-testid="note-blocks"]']);
      },
    },
  },
};
