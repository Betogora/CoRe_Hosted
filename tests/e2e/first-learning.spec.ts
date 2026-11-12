import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { createCoreRepository } from "../../src/coreRepository.ts";
import { readActiveAccountState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";
import { seedAccountState } from "../support/seedAccountState.ts";

const SMALL_APKG_FIXTURE = fileURLToPath(new URL("../../fixtures/apkg/matrix/standard-legacy2.apkg", import.meta.url));

async function resetAccountToEmpty() {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw new Error(`Der leere E2E-Account konnte nicht vorbereitet werden: ${error?.message ?? "Nutzer fehlt"}`);

  try {
    const emptyState = createCoreRepository().getState();
    await seedAccountState(client, {
      ...emptyState,
      profile: { ...emptyState.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, "e2e-first-learning-reset");
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

async function openEmptyDashboard(page: any) {
  await resetAccountToEmpty();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Willkommen (?:bei CoRe|zurück,)/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Erste Karte erstellen/ })).toBeVisible();
  const state = await readActiveAccountState(page);
  expect(state.decks).toEqual([]);
}

async function completeOneReview(page: any, rating = "Gut") {
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: new RegExp(`Bewertung ${rating}`) }).click();
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state.decks.reduce((count: number, deck: any) => count + (deck.reviewEvents?.length ?? 0), 0);
  }).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await openEmptyDashboard(page);
});

test("leerer Account erstellt die erste manuelle Karte und erreicht den Review", async ({ page }) => {
  await page.getByRole("button", { name: /Erste Karte erstellen/ }).click();
  await expect(page).toHaveURL(/\/neue-karten\?method=manual$/);
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Welche Farbe hat der Himmel bei klarem Wetter?");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Blau");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await page.getByRole("button", { name: "Fertig" }).click();

  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jetzt lernen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Karten prüfen" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  const completionUrl = page.url();
  await page.getByRole("button", { name: "Jetzt lernen" }).click();
  await completeOneReview(page, "Leicht");
  await page.goto(completionUrl);
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt lernen" }).click();
  const emptyDialog = page.getByRole("dialog", { name: "Keine fälligen Karten" });
  await expect(emptyDialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
  await expect(emptyDialog.getByRole("button", { name: "Schließen" })).toBeVisible();
  await expect(emptyDialog.locator("button")).toHaveCount(1);
});

test("KI hilft beantwortet Fragen zur aufgedeckten Karte, zeigt Fehler und bricht beim Kartenwechsel ab", async ({ page }) => {
  await page.getByRole("button", { name: /Erste Karte erstellen/ }).click();
  for (const [front, back] of [["Was ist ATP?", "Ein Energieträger"], ["Was bildet ATP?", "Mitochondrien"]]) {
    await page.getByRole("textbox", { name: "Vorderseite" }).fill(front);
    await page.getByRole("textbox", { name: "Rückseite" }).fill(back);
    await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  }
  await page.getByRole("button", { name: "Fertig" }).click();
  await page.getByRole("button", { name: "Jetzt lernen" }).click();

  const bodies: any[] = [];
  let hold: (() => void) | null = null;
  await page.route("**/api/ai/card-help", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.fulfill({ json: { answer: "ATP speichert Energie.\n\n- Es entsteht in der Zellatmung.", model: "test", privacyMode: "zdr", usage: null } });
    if (bodies.length === 2) return route.fulfill({ status: 429, json: { error: { code: "rate_limited", message: "Die KI-Hilfe ist gerade ausgelastet. Bitte versuche es in einer Minute erneut." } } });
    await new Promise<void>((resolve) => { hold = resolve; });
    await route.abort().catch(() => undefined);
  });

  await expect(page.getByRole("button", { name: "KI hilft" })).toHaveCount(0);
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: "KI hilft" }).click();
  const help = page.getByRole("dialog", { name: "KI hilft" });
  await help.getByRole("button", { name: "Erklären" }).click();
  await expect(help.getByText("ATP speichert Energie.")).toBeVisible();
  const firstCard = bodies[0].card.prompt;
  expect(bodies[0]).toEqual({ card: { prompt: firstCard, answer: firstCard === "Was ist ATP?" ? "Ein Energieträger" : "Mitochondrien" }, mode: "explain" });

  await help.getByRole("textbox", { name: "Frage zu dieser Karte" }).fill("Warum Phosphat?");
  await help.getByRole("button", { name: "Frage senden" }).click();
  await expect(help.getByText("Die KI-Hilfe ist gerade ausgelastet.", { exact: false })).toBeVisible();
  expect(bodies[1]).toMatchObject({ mode: "question", question: "Warum Phosphat?", history: [{ question: "Erkläre mir diese Karte.", answer: "ATP speichert Energie.\n\n- Es entsteht in der Zellatmung." }] });

  await help.getByRole("button", { name: "Beispiel" }).click();
  await expect(help.getByText("Ich denke nach …")).toBeVisible();
  await expect(help.getByRole("button", { name: "Erklären" })).toBeDisabled();
  await help.getByRole("textbox", { name: "Frage zu dieser Karte" }).fill("Noch eine Frage");
  await expect(help.getByRole("button", { name: "Frage senden" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
  const aborted = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/api/ai/card-help"));
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await aborted;
  (hold as (() => void) | null)?.();

  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: "KI hilft" }).click();
  await expect(help.getByText("Erkläre mir diese Karte.")).toHaveCount(0);
  await expect(help.getByText("Ich denke nach …")).toHaveCount(0);
});

test("ungenutzte neue Karten verlinken gezielt zum fokussierten Tageslimit", async ({ page }) => {
  await page.getByRole("button", { name: /Erste Karte erstellen/ }).click();
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Welche Farbe hat Schnee?");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Weiß");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await page.getByRole("button", { name: "Fertig" }).click();

  const state = await readActiveAccountState(page);
  const deckId = state.decks.find((deck: { cards?: unknown[] }) => deck.cards?.length)?.id;
  expect(deckId).toBeTruthy();
  await page.goto(`/lernen?settingsDeck=${encodeURIComponent(deckId)}&settings=tagesrunde`);
  await page.getByTestId("learning-settings-new-cards").fill("0");
  await page.getByTestId("settings-save-bar").getByRole("button", { name: "Speichern" }).click();

  await page.goto(`/lernen?deck=${encodeURIComponent(deckId)}`);
  await page.getByTestId(`learn-deck-row-${deckId}`).getByRole("button", { name: /lernen/ }).click();
  const emptyDialog = page.getByRole("dialog", { name: "Tageslimit erreicht" });
  await expect(emptyDialog).toBeVisible();
  await expect(emptyDialog).toContainText("1 neue Karte bleibt wegen deiner Tageslimits für später vorgemerkt.");
  await emptyDialog.getByRole("button", { name: "Neue Karten pro Tag anpassen" }).click();

  await expect(page).toHaveURL(new RegExp(`/lernen\\?.*settingsDeck=${deckId}&settings=neue-karten`));
  await expect(page.getByTestId("deck-settings-dialog")).toBeVisible();
  await expect(page.getByTestId("learning-settings-new-cards")).toBeFocused();
  await expect(page.getByTestId("learning-settings-new-cards")).toHaveValue("0");
});

test("[Vertrag: APKG-Vorschau bis Review] @golden-e2e @beta-core @hosted-core lokaler APKG-Commit wartet nicht auf den initialen Cloud-Sync", async ({ page }) => {
  let releaseCloudBootstrap!: () => void;
  const cloudBootstrapGate = new Promise<void>((resolve) => { releaseCloudBootstrap = resolve; });
  await page.route("**/rest/v1/rpc/get_account_bootstrap", async (route) => {
    await cloudBootstrapGate;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /Anki-Stapel importieren/ })).toBeVisible();
  await page.getByRole("button", { name: /Anki-Stapel importieren/ }).click();
  await expect(page).toHaveURL(/\/neue-karten\?method=import$/);
  await page.locator('input[type="file"][accept=".apkg,.colpkg"]').setInputFiles(SMALL_APKG_FIXTURE);
  await expect(page.getByRole("button", { name: "Import übernehmen" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Import übernehmen" }).click();

  await expect(page.getByText("Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus.")).toBeVisible();
  releaseCloudBootstrap();
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Übersicht" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Karten prüfen|Weitere Karten erstellen/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Zur Übersicht" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt lernen" }).click();
  await completeOneReview(page);
});

test("Demo-Daten werden erst nach dem ausdrücklichen Klick angelegt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: /Willkommen (?:bei CoRe|zurück,)/ })).toBeVisible({ timeout: 30_000 });
  expect((await readActiveAccountState(page)).decks).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole("button", { name: /Anki-Stapel importieren/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Erste Karte erstellen/ })).toBeVisible();
  await page.getByRole("button", { name: /Demo ausprobieren/ }).click();

  await expect(page).toHaveURL(/\/lernen$/, { timeout: 30_000 });
  await expect(page.getByTestId("learn-deck-row-deck_world_capitals")).toContainText("Welt-Hauptstädte");
  expect((await readActiveAccountState(page)).decks).toHaveLength(8);
});
