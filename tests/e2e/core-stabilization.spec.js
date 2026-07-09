import { expect, test } from "@playwright/test";

const DECK_IDS = {
  africa: "deck_world_capitals_afrika",
  europe: "deck_world_capitals_europa",
};

async function resetToFreshLocalState(page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function readAppState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("core.appState.v2") ?? "{}"));
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

async function skipWhenAppShellIsBehindLogin(page) {
  const loginGateVisible = await page.getByRole("heading", { name: "Bei CoRe anmelden" }).isVisible({ timeout: 1000 }).catch(() => false);
  test.skip(loginGateVisible, "Screen-history smoke needs an authenticated E2E session; resetToFreshLocalState clears the current Supabase session.");
}

function mainMenu(page) {
  return page.getByRole("navigation", { name: /Hauptmen/ });
}

test("browser back returns from deck management to learning without reload", async ({ page }) => {
  await resetToFreshLocalState(page);
  await skipWhenAppShellIsBehindLogin(page);

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
  await skipWhenAppShellIsBehindLogin(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("browser back returns from settings to the previous screen", async ({ page }) => {
  await resetToFreshLocalState(page);
  await skipWhenAppShellIsBehindLogin(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByLabel(/Einstellungen/).click();
  await expect(page.getByRole("button", { name: "Export vorbereiten" })).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("review flow records a rating through accessible controls", async ({ page }) => {
  await resetToFreshLocalState(page);
  const before = await deckReviewEventCount(page, DECK_IDS.europe);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Good/ }).click();

  await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("variant review flow can be prepared from the deck editor", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-select-${DECK_IDS.africa}`).click();
  await page.getByText("Was ist die Hauptstadt von Côte d'Ivoire?").click();
  await page.getByLabel("Variantenfrage").fill("Welche Hauptstadt hat Côte d'Ivoire?");
  await page.getByLabel("Variantenantwort").fill("Yamoussoukro");
  await page.getByRole("button", { name: "Umformulierung hinzufügen" }).click();
  await expect(page.getByRole("status")).toContainText("Umformulierung gespeichert.");

  await page.getByTestId(`deck-row-${DECK_IDS.africa}`).getByRole("button", { name: "Varianten" }).click();
  await expect(page.getByText(/Variante Level 2/)).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Good/ }).click();

  await expect.poll(() => hasVariantReviewEvent(page, DECK_IDS.africa)).toBe(true);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("ai draft creation and assistant smoke through hidden dashboard entry", async ({ page }) => {
  await resetToFreshLocalState(page);
  const aiDecksBefore = await storedDeckCountBySource(page, "ai-assisted");

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /KI-gestützte Erstellung/ }).click();
  await page.getByLabel("Quellentext für KI-Drafts").fill("ATP speichert Energie in der Zelle. Mitochondrien stellen ATP durch Zellatmung bereit.");
  await page.getByLabel("Fach").fill("Biologie");
  await page.getByRole("button", { name: "Generieren" }).click();
  await expect(page.getByRole("status")).toContainText(/Entwurf|Entwürfe|Karten/);
  await page.getByRole("button", { name: /Übernehmen/ }).click();
  await expect.poll(() => storedDeckCountBySource(page, "ai-assisted")).toBeGreaterThan(aiDecksBefore);

  await page.getByLabel("Hauptmenue").getByRole("button", { name: "Heute" }).click();
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
  await expect(page.getByRole("status")).toContainText("KI-Antwort erstellt.");
  await expect(page.getByText("Gemma: Algier ist die Hauptstadt von Algerien.")).toBeVisible();
});

test("local portability export and import expose status and validation errors", async ({ page }) => {
  await resetToFreshLocalState(page);

  await page.getByLabel(/Einstellungen/).click();
  await page.getByRole("button", { name: "Export vorbereiten" }).click();
  await expect(page.getByRole("status")).toContainText("Export vorbereitet:");
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
  await expect(page.getByRole("status")).toContainText("Export validiert");
});
