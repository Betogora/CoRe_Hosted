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
      run: async ({ page }) => page.locator("#frage-antwort").scrollIntoViewIfNeeded(),
    },
  },
};
