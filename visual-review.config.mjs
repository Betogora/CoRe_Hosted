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
      run: async ({ page }) => page.locator("#frage-antwort").scrollIntoViewIfNeeded(),
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
    // K6.5: occlusion editor in the catalog and in the real manual creation.
    "bildverdeckung-editor": {
      path: "/docs/ui-elements.html",
      run: async ({ page }) => {
        const card = page.locator("#bildverdeckung-editor");
        await card.scrollIntoViewIfNeeded();
        await card.getByRole("button", { name: /^Auswählen/ }).click();
        await card.locator('[data-mask-id="mask-2"]').click();
        await card.locator('[data-mask-id="mask-3"]').click({ modifiers: ["Shift"] });
        await card.locator('[data-testid="occlusion-editor"]').evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
      },
    },
    "erstellen-bildverdeckung": {
      path: "/docs/ui-elements.html",
      run: async ({ page, click }) => {
        await click("Manuelle Erstellung öffnen");
        await page.locator(".catalog-product-preview").getByRole("button", { name: "Bildverdeckung" }).click();
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><rect width="800" height="480" fill="#edf1f6"/><path d="M250 330C70 200 170 40 290 150C410 40 510 200 330 330Z" fill="#e28b68"/><rect x="520" y="150" width="140" height="110" rx="10" fill="#6f7e9e"/></svg>';
        await page.locator('.catalog-product-preview [data-manual-focus="occlusion"] input[type="file"]').setInputFiles({ name: "herz.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
        const canvas = page.locator('.catalog-product-preview [data-testid="occlusion-canvas"] svg');
        await canvas.waitFor();
        await canvas.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        const box = await canvas.boundingBox();
        for (const [x1, y1, x2, y2] of [[0.25, 0.3, 0.45, 0.55], [0.64, 0.3, 0.84, 0.56]]) {
          await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
          await page.mouse.up();
        }
        await page.locator('.catalog-product-preview [data-testid="occlusion-editor"]').evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
      },
    },
  },
};
