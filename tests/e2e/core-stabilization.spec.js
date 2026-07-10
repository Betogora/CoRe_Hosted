import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.js";

const PDF_SELECTION_FIXTURE = fileURLToPath(new URL("../fixtures/pdf-selection.pdf", import.meta.url));

const DECK_IDS = {
  africa: "deck_world_capitals_afrika",
  europe: "deck_world_capitals_europa",
};

async function readAppState(page) {
  return readActiveAccountState(page);
}

async function deckReviewEventCount(page, deckId) {
  const state = await readAppState(page);
  return state.decks?.find((deck) => deck.id === deckId)?.reviewEvents?.length ?? 0;
}

async function hasVariantReviewEvent(page, deckId) {
  const state = await readAppState(page);
  return Boolean(state.decks?.find((deck) => deck.id === deckId)?.reviewEvents?.some((event) => event.reviewableType === "variant"));
}

async function storedDeckCountBySource(page, source) {
  const state = await readAppState(page);
  return state.decks?.filter((deck) => deck.source === source).length ?? 0;
}

async function findPdfAnchoredCard(page) {
  const state = await readAppState(page);
  return state.decks?.flatMap((deck) => deck.cards ?? []).find((card) => String(card.originalFront ?? card.canonicalQuestion ?? "").includes("Mitochondrien erzeugen ATP")) ?? null;
}

function mainMenu(page) {
  return page.getByRole("navigation", { name: /Hauptmen/ });
}

test("browser back returns from deck management to learning without reload", async ({ page }) => {
  const { authStorageKey } = await resetToFreshLocalState(page);
  expect(authStorageKey).toMatch(/^sb-.+-auth-token$/);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await expect(page.getByTestId(`deck-row-${DECK_IDS.europe}`)).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("browser back exits study mode to the previous learning screen", async ({ page }) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("browser back returns from settings to the previous screen", async ({ page }) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("button", { name: "Export vorbereiten" })).toBeVisible();
  await expect(page.getByLabel("Release-Information")).toHaveText(/^CoRe 0\.1\.0 · Test · Commit (?:lokal|[a-f0-9]{7})$/);

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("review flow records a rating through accessible controls", async ({ page }) => {
  await resetToFreshLocalState(page);
  const before = await deckReviewEventCount(page, DECK_IDS.europe);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Good/ }).click();

  await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("variant review flow can be prepared from the deck editor", async ({ page }) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-select-${DECK_IDS.africa}`).click();
  await page.getByText("Was ist die Hauptstadt von Côte d'Ivoire?").click();
  await page.getByLabel("Variantenfrage").fill("Welche Hauptstadt hat Côte d'Ivoire?");
  await page.getByLabel("Variantenantwort").fill("Yamoussoukro");
  await page.getByRole("button", { name: "Umformulierung hinzufügen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Umformulierung gespeichert." })).toBeVisible();

  await page.getByTestId(`deck-row-${DECK_IDS.africa}`).getByRole("button", { name: "Varianten" }).click();
  await expect(page.getByText(/Variante Level 2/)).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Good/ }).click();

  await expect.poll(() => hasVariantReviewEvent(page, DECK_IDS.africa)).toBe(true);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("ai draft creation stores an accepted draft deck", async ({ page }) => {
  await resetToFreshLocalState(page);
  const aiDecksBefore = await storedDeckCountBySource(page, "ai-assisted");

  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /KI-gestützte Erstellung/ }).click();
  await page.getByLabel("Quellentext für KI-Drafts").fill("ATP speichert Energie in der Zelle. Mitochondrien stellen ATP durch Zellatmung bereit.");
  await page.getByLabel("Fach").fill("Biologie");
  await page.getByRole("button", { name: "Generieren" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Entwurf|Entwürfe|Karten/ })).toBeVisible();
  await page.getByRole("button", { name: /Übernehmen/ }).click();
  await expect.poll(() => storedDeckCountBySource(page, "ai-assisted")).toBeGreaterThan(aiDecksBefore);
});

test("lazy creation screen renders a selectable PDF and stores its source anchor", async ({ page }) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Karten manuell erstellen/ }).click();
  await page.getByRole("button", { name: "Neuen Stapel erstellen" }).click();
  await page.getByRole("textbox", { name: "Neuer Kartenstapel" }).fill("PDF-Quellenauswahl-Smoke");
  await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles(PDF_SELECTION_FIXTURE);

  const viewer = page.getByTestId("pdf-document-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("status")).toContainText("Seite 1 von 1");
  const textLayer = viewer.locator('[data-pdf-page-number="1"] .core-pdf-text-layer');
  await expect.poll(() => textLayer.locator("span").count()).toBeGreaterThan(0);

  await textLayer.evaluate((layer) => {
    const textSpan = [...layer.querySelectorAll("span")].find((span) => span.textContent?.includes("Mitochondrien erzeugen ATP"));
    if (!textSpan) throw new Error("PDF-Testtext wurde nicht im Textlayer gefunden.");
    const range = document.createRange();
    range.selectNodeContents(textSpan);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    layer.closest("[aria-label='PDF-Dokument']").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });

  await expect(page.getByRole("status").filter({ hasText: "Vorderseite ergänzt." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toContainText("Mitochondrien erzeugen ATP durch Zellatmung.");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Zellatmung erzeugt ATP.");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();

  await expect.poll(async () => {
    const card = await findPdfAnchoredCard(page);
    return card?.sourceAnchors?.[0]?.pageNumber ?? null;
  }).toBe(1);
  const storedCard = await findPdfAnchoredCard(page);
  expect(storedCard.sourceAnchors[0].bbox).toEqual(expect.objectContaining({ left: expect.any(Number), right: expect.any(Number) }));
});

test("assistant smoke returns a server answer through the hidden dashboard entry", async ({ page }) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "Gemma: Algier ist die Hauptstadt von Algerien.",
        model: "gemma-4-31b-it",
        provider: "google",
      }),
    });
  }, { times: 1 });
  await page.getByRole("button", { name: "Assistent öffnen" }).click();
  await page.getByLabel("Frage an deine Karten").fill("Was ist die Hauptstadt von Algerien?");
  await expect(page.getByLabel("Nur mit Kartenquellen antworten")).not.toBeChecked();
  await page.getByRole("button", { name: "Antwort erstellen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "KI-Antwort erstellt." })).toBeVisible();
  await expect(page.getByText("Gemma: Algier ist die Hauptstadt von Algerien.")).toBeVisible();
});

test("local portability export and import expose status and validation errors", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByRole("button", { name: "Export vorbereiten" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Export vorbereitet:" })).toBeVisible();
  const exportJson = await page.getByTestId("portable-export-json").inputValue();
  expect(exportJson).toContain('"schema": "core-portable-export"');
  expect(exportJson).not.toContain("passwordVerifier");

  await page.getByTestId("portable-import-json").fill("{not-json");
  await page.getByRole("button", { name: "JSON importieren" }).click();
  await expect(page.getByRole("alert")).toContainText("Export-JSON konnte nicht gelesen werden.");

  const smallValidExport = JSON.stringify({
    schema: "core-portable-export",
    schemaVersion: 1,
    exportedAt: "2026-07-08T10:00:00.000Z",
    profile: null,
    decks: [],
    communities: [],
    aiJobs: [],
    documents: [],
  });
  await page.getByTestId("portable-import-json").fill(smallValidExport);
  await page.getByRole("button", { name: "JSON importieren" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Export validiert" })).toBeVisible();
});
