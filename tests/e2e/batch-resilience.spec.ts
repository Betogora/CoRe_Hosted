import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreDeck, createLearningItemFromEditorValue } from "../../src/coreModel.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Deck } from "../../src/coreTypes.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { chooseCoreSelectOption } from "./support/coreSelect.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const DECK_IDS = {
  rootA: "batch-root-a",
  childA: "batch-child-a",
  rootB: "batch-root-b",
  childB: "batch-child-b",
  target: "batch-target",
};
const QUALITY_APKG_FIXTURE = path.join(process.cwd(), "fixtures", "apkg", "import-quality-latest.apkg");

function card(deckId: string, front: string, back: string) {
  return createLearningItemFromEditorValue(deckId, { cardType: "basic", front, back, tags: [] });
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
      cards: [card(DECK_IDS.childA, "Karte A", "Antwort A")],
    }),
    createCoreDeck({ id: DECK_IDS.rootB, name: "Bereich B", hierarchyPath: ["Bereich B"], source: "manual", cards: [] }),
    createCoreDeck({
      id: DECK_IDS.childB,
      parentDeckId: DECK_IDS.rootB,
      name: "Gemeinsam",
      hierarchyPath: ["Bereich B", "Gemeinsam"],
      source: "manual",
      cards: [card(DECK_IDS.childB, "Karte B", "Antwort B")],
    }),
    createCoreDeck({
      id: DECK_IDS.target,
      name: "Batch-Ziel",
      hierarchyPath: ["Batch-Ziel"],
      source: "manual",
      cards: [card(DECK_IDS.target, "Bestehende Karte", "Bestehende Antwort")],
    }),
  ];
}

async function seedAccount() {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw error ?? new Error("Der Batch-E2E-Account fehlt.");
  try {
    const state = createCoreRepository(null, { seedDefaultDecks: false }).getState();
    await replaceAccountCloudState(client, {
      ...state,
      decks: seedDecks(),
      profile: { ...state.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, { deviceId: "e2e-batch-resilience-reset" });
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmen/ });
}

async function openManualCreation(page: Page) {
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Karten manuell erstellen/ }).click();
}

test.beforeEach(async ({ page }) => {
  await seedAccount();
  await resetToFreshLocalState(page, { resetCloud: false });
});
test("[Vertrag: Batch, Pins, Deckpfade und Draftschutz] @beta-core fünf Karten bleiben in einer sicheren Session", async ({ page }) => {
  await openManualCreation(page);
  const targetSelect = page.getByRole("combobox", { name: "Kartenstapel" });
  await targetSelect.click();
  await expect(page.getByRole("option", { name: "Bereich A / Gemeinsam", exact: true })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Bereich B / Gemeinsam", exact: true })).toHaveCount(1);
  await page.getByRole("option", { name: "Batch-Ziel", exact: true }).click();

  for (let index = 1; index <= 5; index += 1) {
    await page.getByRole("textbox", { name: "Vorderseite" }).fill(`Batch-Frage ${index}`);
    await page.getByRole("textbox", { name: "Rückseite" }).fill(`Batch-Antwort ${index}`);
    await page.getByRole("button", { name: "Originalkarte speichern" }).click();
    await expect(page.getByRole("status")).toContainText("Karte gespeichert");
    await expect(page.getByRole("heading", { name: "Karten manuell erstellen" })).toBeVisible();
    await expect(page.getByText(`${index} ${index === 1 ? "Karte" : "Karten"} in dieser Sitzung erstellt.`)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Vorderseite" })).toBeFocused();
  }

  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await expect(page.getByText(/5 Karten wurden in „Batch-Ziel“ gespeichert/)).toBeVisible();
  const state = await readActiveAccountState(page);
  expect(state.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards).toHaveLength(6);

  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Kartenverwaltung", exact: true })).toBeVisible();
  for (let index = 1; index <= 5; index += 1) {
    await expect(page.getByText(`Batch-Frage ${index}`, { exact: true })).toBeVisible();
  }

  await resetToFreshLocalState(page, { resetCloud: false });
  await openManualCreation(page);
  await chooseCoreSelectOption(page, targetSelect, "Batch-Ziel");
  await page.getByRole("button", { name: /Vorderseite: Nach Speichern leeren/ }).click();
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Angeheftete Frage");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Einmalige Antwort");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toContainText("Angeheftete Frage");
  await expect(page.getByRole("textbox", { name: "Rückseite" })).toHaveText("");
  await expect(page.getByRole("textbox", { name: "Rückseite" })).toBeFocused();
  await expect(page.getByRole("button", { name: /Vorderseite: Nach Speichern behalten/ })).toBeVisible();

  await page.getByRole("button", { name: /Vorderseite: Nach Speichern behalten/ }).click();
  await page.getByRole("button", { name: /Rückseite: Nach Speichern leeren/ }).click();
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Einmalige Frage");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Angeheftete Antwort");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toHaveText("");
  await expect(page.getByRole("textbox", { name: "Rückseite" })).toContainText("Angeheftete Antwort");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toBeFocused();

  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Ungespeicherter Entwurf");
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Ungespeicherten Entwurf verlassen?" });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toContainText("Ungespeicherter Entwurf");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toBeFocused();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(leaveDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toContainText("Ungespeicherter Entwurf");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toBeFocused();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await leaveDialog.getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeFocused();
});

test("[Vertrag: Karten- und Stapellöschung] @beta-core Bestätigung, Undo und Auswirkungen bleiben sichtbar", async ({ page }) => {
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Karten verwalten" }).click();
  const targetState = await readActiveAccountState(page);
  const existingCardId = targetState.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards[0].id;
  await page.getByTestId(`deck-card-${existingCardId}`).click();
  const deleteCardButton = page.getByRole("button", { name: "Löschen", exact: true });
  await deleteCardButton.click();
  const cardDialog = page.getByRole("dialog", { name: "Karte löschen?" });
  await expect(cardDialog).toContainText("Bestehende Karte");
  await cardDialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(deleteCardButton).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Bestehende Karte");

  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await cardDialog.getByRole("button", { name: "Karte löschen" }).click();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Bestehende Karte");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Bestehende Karte");

  await page.getByTestId(`deck-options-${DECK_IDS.rootA}`).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.rootA}`).getByRole("button", { name: "Löschen", exact: true }).click();
  const deckDialog = page.getByRole("dialog", { name: "Stapelbaum löschen?" });
  await expect(deckDialog).toContainText("Bereich A");
  await expect(deckDialog).toContainText("1 Unterstapel");
  await expect(deckDialog).toContainText("1 aktive Karte");
  await deckDialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByTestId(`card-group-${DECK_IDS.rootA}`)).toBeVisible();
  await page.getByTestId(`deck-options-${DECK_IDS.rootA}`).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.rootA}`).getByRole("button", { name: "Löschen", exact: true }).click();
  await deckDialog.getByRole("button", { name: "Stapelbaum löschen" }).click();
  await expect(page.getByTestId(`card-group-${DECK_IDS.rootA}`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(`card-group-${DECK_IDS.rootA}`)).toHaveCount(0);
});

test("[Vertrag: Importformatwechsel und Terminalzustände] @beta-core alte Vorschauen werden vollständig verworfen", async ({ page }) => {
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /APKG, Text, Tabellen/ }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("textbox", { name: "Importinhalt" }).fill("Frage\n---\nAntwort");
  await page.getByRole("button", { name: "Import prüfen" }).click();
  await expect(page.getByText(/1 Karten · 0 Varianten/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import übernehmen" })).toBeEnabled();

  await page.getByRole("button", { name: "CSV", exact: true }).click();
  await expect(page.getByText(/1 Karten · 0 Varianten/)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Importinhalt" })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Import übernehmen" })).toBeDisabled();

  await page.getByRole("button", { name: "APKG", exact: true }).click();
  await expect(page.getByRole("heading", { name: "APKG als Originalanker importieren" })).toBeVisible();
  await expect(page.getByText(/1 Karten · 0 Varianten/)).toHaveCount(0);
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles({
    name: "kaputt.apkg",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("kein gueltiges apkg"),
  });
  await expect(page.getByText("Fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Andere Datei auswählen" })).toBeVisible();
});

test("[Vertrag: partieller Importabschluss] @beta-core Karten bleiben nach Medienfehler nutzbar", async ({ page }) => {
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /APKG, Text, Tabellen/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(QUALITY_APKG_FIXTURE);
  await expect(page.getByText("Importvorschau", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.route("**/storage/v1/object/core-media/**", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await expect(page.getByText(/Import teilweise abgeschlossen/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Medien-Sync fortsetzen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Karten jetzt verwenden" })).toBeVisible();
});
