// In die Projektwurzel als visual-review.config.mjs kopieren.
// Pfade, Szenen und Ansichten anhand des geklärten Auftrags anpassen.
export default {
  defaultView: "mobile",
  views: {
    mobile: { width: 390, height: 844, colorScheme: "light" },
    desktop: { width: 1440, height: 900, colorScheme: "light" },
  },
  settle: 300,
  beforeEach: async (page) => {
    await page.evaluate(async () => { await document.fonts.ready; });
  },
  scenes: {
    "start": { path: "/" },
    // Weitere Schritte: eigene Szene mit path und run({ page }) ergänzen.
    // In run den Klickpfad bis zum gewünschten Schritt reproduzieren.
  },
};
