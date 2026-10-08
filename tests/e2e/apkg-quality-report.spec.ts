import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

const MEDIA_APKG_FIXTURE = fileURLToPath(new URL("../../fixtures/apkg/matrix/media-latest.apkg", import.meta.url));

test.describe.configure({ timeout: 60_000 });

test("latest APKG preview shows the complete quality report without mutating account data", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await resetToFreshLocalState(page);
  const before = await readActiveAccountState(page);
  const beforeDeckCount = before.decks?.length ?? 0;

  await page.getByRole("navigation", { name: /Hauptmenü/ }).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await expect(page.getByRole("heading", { name: "Anki-Dateien importieren" })).toBeVisible();
  await expect(page.getByText("APKG- oder COLPKG-Datei hier ablegen (Max. 2 GiB)")).toBeVisible();
  await expect(page.getByText("Importbericht erscheint nach dem Upload")).toHaveCount(0);
  await page.locator('input[type="file"][accept=".apkg,.colpkg"]').setInputFiles(MEDIA_APKG_FIXTURE);

  await expect(page.getByText("Importvorschau", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Matrix Medien" })).toBeVisible();
  const statTiles = page.getByTestId("apkg-stat-tile");
  await expect(statTiles).toHaveCount(4);
  await expect(statTiles.filter({ hasText: "Erkannte Stapel" })).toContainText("1");
  await expect(statTiles.filter({ hasText: "Karten" })).toContainText("6");
  await expect(statTiles.filter({ hasText: "Medien vorhanden" })).toContainText("3");
  await expect(statTiles.filter({ hasText: "Medien fehlen" })).toContainText("1");
  for (const tile of await statTiles.all()) {
    await expect(tile).toHaveAttribute("data-size", "compact");
    await expect(tile).toHaveCSS("border-width", "0px");
    await expect(tile).toHaveCSS("box-shadow", "none");
  }
  const notetypes = page.getByRole("region", { name: "Notiztypen" });
  await expect(notetypes.getByTestId("apkg-notetype-report")).toHaveCount(2);
  await expect(notetypes.getByTestId("apkg-notetype-report").filter({ hasText: "Basic" })).toContainText("5 Inhalte · 5 Karten · kein Lernstand");
  await expect(notetypes.getByTestId("apkg-notetype-report").filter({ hasText: "CoRe-Matrix Schrift" })).toContainText("1 Inhalt · 1 Karte · kein Lernstand");
  await expect(notetypes.getByTestId("apkg-notetype-report").filter({ hasText: "Basic" })).toContainText("1 Medium fehlt im Paket.");
  await expect(page.getByText("1 referenziertes Medium fehlt im Paket. Betroffene Karten können ohne Bild oder Ton erscheinen.", { exact: true })).toBeVisible();
  const warnings = page.getByRole("region", { name: "1 Warnung", exact: true });
  await expect(warnings.getByRole("listitem")).toHaveText(["1 referenziertes Medium fehlt im Paket."]);
  await expect(page.getByText(/SHA-1|Importidentität/i)).toHaveCount(0);
  const examples = page.getByRole("region", { name: "Kartenbeispiele" });
  const sampleCards = examples.locator("article");
  await expect(sampleCards).toHaveCount(3);
  await expect(sampleCards.locator('iframe[title="Aufgedeckte Karte"]')).toHaveCount(3);
  await expect(examples.getByText("Originalgetreu und sicher dargestellt.", { exact: true })).toHaveCount(0);
  await expect(examples.getByText("Originalkarte", { exact: true })).toHaveCount(3);
  await expect(sampleCards.first().frameLocator('iframe[title="Aufgedeckte Karte"]').locator("body")).toContainText("Umlaut");
  await expect(sampleCards.first().frameLocator('iframe[title="Aufgedeckte Karte"]').locator("img").first()).toHaveAttribute("src", /^blob:/);
  await expect(page.getByTestId("apkg-file-progress")).toContainText("Vorschau bereit");

  const after = await readActiveAccountState(page);
  expect(after.decks?.length ?? 0).toBe(beforeDeckCount);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("Importvorschau", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Notiztypen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const unexpectedBrowserErrors = browserErrors.filter((message) => ![
    /TypeError: Failed to fetch/,
    /violates the following Content Security Policy directive/,
    /Not allowed to load local resource: blob:/,
  ].some((knownMessage) => knownMessage.test(message)));
  expect(unexpectedBrowserErrors).toEqual([]);
});

test("APKG commit exposes an accessible progressbar before completion", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("navigation", { name: /Hauptmenü/ }).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  const reducedMotionObserved = page.evaluate(() => new Promise<string>((resolve) => {
    const readTransition = () => {
      const fill = document.querySelector('[data-testid="apkg-progress-fill"]');
      return fill ? getComputedStyle(fill).transitionDuration : null;
    };
    const current = readTransition();
    if (current !== null) return resolve(current);
    const observer = new MutationObserver(() => {
      const transition = readTransition();
      if (transition === null) return;
      observer.disconnect();
      resolve(transition);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve("nicht beobachtet");
    }, 5_000);
  }));
  await page.locator('input[type="file"][accept=".apkg,.colpkg"]').setInputFiles(MEDIA_APKG_FIXTURE);
  expect(Number.parseFloat(await reducedMotionObserved)).toBeLessThanOrEqual(0.00001);
  await expect(page.getByRole("button", { name: "Import übernehmen" })).toBeEnabled({ timeout: 30_000 });

  const progressObserved = page.evaluate(() => new Promise<boolean>((resolve) => {
    const target = document.querySelector('[data-testid="apkg-file-progress"]');
    if (!target) return resolve(false);
    if (target.getAttribute("role") === "progressbar") return resolve(true);
    const observer = new MutationObserver(() => {
      if (target.getAttribute("role") !== "progressbar") return;
      observer.disconnect();
      resolve(true);
    });
    observer.observe(target, { attributes: true, attributeFilter: ["role"] });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 5_000);
  }));

  await page.getByRole("button", { name: "Import übernehmen" }).click();
  expect(await progressObserved).toBe(true);
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 30_000 });
});

test("defective APKG offers exactly one recommended recovery action", async ({ page }) => {
  await resetToFreshLocalState(page);
  await page.getByRole("navigation", { name: /Hauptmenü/ }).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await page.locator('input[type="file"][accept=".apkg,.colpkg"]').setInputFiles({
    name: "defekt.apkg",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("keine gueltige APKG-Datei"),
  });

  const error = page.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Andere Datei auswählen" })).toBeVisible();
});
