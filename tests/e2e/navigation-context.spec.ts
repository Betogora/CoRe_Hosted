import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreCard, createCoreDeck } from "../../src/coreModel.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Deck } from "../../src/coreTypes.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const DECK_IDS = {
  rootA: "navigation-root-a",
  childA: "navigation-child-a",
  rootB: "navigation-root-b",
  childB: "navigation-child-b",
};

const CARD_IDS = {
  a: "navigation-card-a",
  b1: "navigation-card-b-1",
  b2: "navigation-card-b-2",
};

function card(id: string, deckId: string, front: string, back: string) {
  return createCoreCard({
    id,
    deckId,
    source: "manual",
    originalFront: `<p>${front}</p>`,
    originalBack: `<p>${back}</p>`,
  });
}

function seedDecks(): Deck[] {
  return [
    createCoreDeck({ id: DECK_IDS.rootA, name: "Bereich A", hierarchyPath: ["Bereich A"], source: "manual", cards: [] }),
    createCoreDeck({
      id: DECK_IDS.childA,
      parentDeckId: DECK_IDS.rootA,
      name: "Gemeinsam",
      hierarchyPath: ["Bereich A", "Gemeinsam"],
      source: "manual",
      cards: [card(CARD_IDS.a, DECK_IDS.childA, "Karte A", "Antwort A")],
    }),
    createCoreDeck({ id: DECK_IDS.rootB, name: "Bereich B", hierarchyPath: ["Bereich B"], source: "manual", cards: [] }),
    createCoreDeck({
      id: DECK_IDS.childB,
      parentDeckId: DECK_IDS.rootB,
      name: "Gemeinsam",
      hierarchyPath: ["Bereich B", "Gemeinsam"],
      source: "manual",
      cards: [
        card(CARD_IDS.b1, DECK_IDS.childB, "Karte B1", "Antwort B1"),
        card(CARD_IDS.b2, DECK_IDS.childB, "Karte B2", "Antwort B2"),
      ],
    }),
  ];
}

async function seedAccount() {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw error ?? new Error("Der Navigations-E2E-Account fehlt.");
  try {
    const state = createCoreRepository(null, { seedDefaultDecks: false }).getState();
    await replaceAccountCloudState(client, {
      ...state,
      decks: seedDecks(),
      profile: { ...state.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, { deviceId: "e2e-navigation-context-reset" });
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü/ });
}

async function waitForApp(page: Page) {
  await page.getByRole("navigation", { name: /Hauptmenü/ }).waitFor({ state: "visible" });
}

async function completeReview(page: Page) {
  for (let index = 0; index < 4; index += 1) {
    if (await page.getByRole("heading", { name: "Sitzung abgeschlossen" }).isVisible().catch(() => false)) return;
    await page.getByRole("button", { name: "Antwort anzeigen" }).click();
    await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Sitzung abgeschlossen" })).toBeVisible();
}

async function startDeckFromCards(page: Page, deckId: string, variants = false) {
  await page.getByTestId(`deck-options-${deckId}`).click();
  await page.getByTestId(`deck-options-menu-${deckId}`).getByRole("button", { name: variants ? "Varianten lernen" : "Lernen", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await seedAccount();
  await resetToFreshLocalState(page, { resetCloud: false });
});

test("[Vertrag: Kartenverwaltung] Stapel, Sortierung und ungespeicherte Änderungen bleiben kontrollierbar", async ({ page }) => {
  await page.goto("/kartenstapel");
  await waitForApp(page);
  await expect(page.getByRole("heading", { name: "Kartenverwaltung", exact: true })).toBeVisible();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);

  const search = page.getByRole("textbox", { name: "Karten durchsuchen" });
  await search.focus();
  await expect.poll(() => search.evaluate((input) => getComputedStyle(input).outlineColor)).toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => search.locator("..").evaluate((label) => getComputedStyle(label).boxShadow)).not.toBe("none");
  await search.fill("Karte B1");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
  await search.fill("");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);

  const dueHeader = page.getByRole("columnheader", { name: /Fällig/ });
  await dueHeader.getByRole("button").click();
  await expect(dueHeader).toHaveAttribute("aria-sort", "ascending");
  await dueHeader.getByRole("button").click();
  await expect(dueHeader).toHaveAttribute("aria-sort", "descending");

  const deckActivation = page.getByTestId(`deck-toggle-${DECK_IDS.childB}`);
  const deckHeader = page.getByTestId(`deck-header-${DECK_IDS.childB}`);
  await expect(deckActivation).toHaveAttribute("aria-expanded", "false");

  await page.getByTestId(`deck-options-${DECK_IDS.childB}`).click();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  await deckHeader.click();
  await expect(deckActivation).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
  await deckHeader.click();
  await expect(deckActivation).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);
  await deckHeader.click();
  await page.getByTestId(`deck-card-${CARD_IDS.b1}`).click();
  const front = page.getByRole("textbox", { name: "Karten-Vorderseite" });
  const changesDialog = page.getByRole("dialog", { name: "Änderungen übernehmen?" });
  await front.fill("");
  await page.keyboard.press("Escape");
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Speichern" }).click();
  await expect(changesDialog).toBeVisible();
  await expect(page.getByText("Bitte die markierten Felder prüfen.")).toBeVisible();
  await changesDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();

  await front.fill("Ungespeicherte Karte B1");
  await page.getByRole("heading", { name: "Kartenverwaltung", exact: true }).click();
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(front).toContainText("Ungespeicherte Karte B1");

  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await changesDialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b2}`);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state?.decks?.find((deck: Deck) => deck.id === DECK_IDS.childB)?.cards
      ?.find((candidate: { id: string }) => candidate.id === CARD_IDS.b1)?.originalFront;
  }).toContain("Ungespeicherte Karte B1");

  await page.getByRole("heading", { name: "Kartenverwaltung", exact: true }).click();
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);

  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await page.getByRole("textbox", { name: "Karten-Vorderseite" }).fill("Diese Änderung wird verworfen");
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await changesDialog.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
  const finalState = await readActiveAccountState(page);
  expect(finalState.decks.find((deck: Deck) => deck.id === DECK_IDS.childB)?.cards
    .find((candidate: { id: string }) => candidate.id === CARD_IDS.b2)?.originalFront).toContain("Karte B2");

  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await page.getByRole("textbox", { name: "Karten-Vorderseite" }).fill("Navigation bleibt geschützt");
  const learnNavigation = mainMenu(page).getByRole("button", { name: "Lernen" });
  await learnNavigation.click();
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByTestId("card-detail-aside")).toBeVisible();
  await learnNavigation.click();
  await changesDialog.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeVisible();
});

test("[Vertrag: URL-Kontext] @beta-core Reload, Direktlink und Review-Rückweg erhalten Stapel und Karte", async ({ page, context }) => {
  await page.goto(`/lernen?deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  const linkedDeckGroup = page.getByTestId(`learn-deck-group-${DECK_IDS.childB}`);
  await expect(linkedDeckGroup).toBeVisible();
  await expect(linkedDeckGroup).not.toHaveAttribute("data-selected");
  await page.reload();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);
  await expect(linkedDeckGroup).toBeVisible();
  await expect(linkedDeckGroup).not.toHaveAttribute("data-selected");

  await page.getByRole("button", { name: "Karten verwalten" }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}`);
  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  const cardUrl = `/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b2}`;
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");

  const directLinkPage = await context.newPage();
  await directLinkPage.goto(cardUrl);
  await waitForApp(directLinkPage);
  await expect(directLinkPage.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");
  await directLinkPage.getByRole("button", { name: "Detailansicht schließen" }).click();
  await expect(directLinkPage).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}`);
  await directLinkPage.goBack();
  await expect(directLinkPage.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");
  await directLinkPage.keyboard.press("Escape");
  await expect(directLinkPage).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}`);
  await expect(directLinkPage.getByTestId(`deck-card-${CARD_IDS.b2}`)).toBeFocused();
  await directLinkPage.close();

  await page.goto(`/neue-karten?method=manual&deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  await expect(page.getByRole("heading", { name: "Karten manuell erstellen" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Kartenstapel" })).toContainText("Bereich B / Gemeinsam");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Kartenstapel" })).toContainText("Bereich B / Gemeinsam");

  await page.goto(cardUrl);
  await waitForApp(page);
  await startDeckFromCards(page, DECK_IDS.childB);
  await expect(page).toHaveURL(new RegExp(
    `/decks/${DECK_IDS.childB}/review\\?returnView=decks&returnDeck=${DECK_IDS.childB}&returnCard=${CARD_IDS.b2}$`,
  ));
  await page.reload();
  await completeReview(page);
  await page.getByRole("button", { name: "Zurück zum Ausgangspunkt" }).click();
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");

  await page.goto(`/lernen?deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Bereich B / Gemeinsam lernen" }).press("Enter");
  await expect(page).toHaveURL(new RegExp(
    `/decks/${DECK_IDS.childB}/review\\?returnView=learn&returnDeck=${DECK_IDS.childB}$`,
  ));
  await page.reload();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);
});

test("[Vertrag: Browser-History und sichere Fallbacks] @beta-core Zurück, Vorwärts und ungültige IDs bleiben deterministisch", async ({ page }) => {
  await page.goto(`/lernen?deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Karten verwalten" }).click();
  const deckUrl = `/kartenstapel?deck=${DECK_IDS.childB}`;
  const firstCardUrl = `${deckUrl}&card=${CARD_IDS.b1}`;
  const secondCardUrl = `${deckUrl}&card=${CARD_IDS.b2}`;
  await page.getByTestId(`deck-card-${CARD_IDS.b1}`).click();
  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await startDeckFromCards(page, DECK_IDS.childB);

  await page.goBack();
  await expect(page).toHaveURL(secondCardUrl);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");
  await page.goBack();
  await expect(page).toHaveURL(firstCardUrl);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B1");
  await page.goBack();
  await expect(page).toHaveURL(deckUrl);
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);

  await page.goForward();
  await expect(page).toHaveURL(deckUrl);
  await page.goForward();
  await expect(page).toHaveURL(firstCardUrl);
  await page.goForward();
  await expect(page).toHaveURL(secondCardUrl);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/decks/${DECK_IDS.childB}/review\\?`));

  await page.goto("/lernen?deck=missing-deck");
  await waitForApp(page);
  await expect(page.getByText("Stapel nicht gefunden oder nicht verfügbar.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zu Lernen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Kartenverwaltung" })).toBeVisible();

  await page.goto(`/kartenstapel?deck=${DECK_IDS.childB}&card=missing-card`);
  await waitForApp(page);
  await expect(page.getByText("Die verlinkte Karte ist in diesem Stapel nicht mehr verfügbar.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Kartenliste" })).toBeVisible();

  await page.goto("/decks/missing-deck/review?returnView=decks&returnDeck=missing-deck&returnCard=missing-card");
  await waitForApp(page);
  await expect(page.getByText("Stapel nicht gefunden oder nicht verfügbar.", { exact: true })).toBeVisible();
});
