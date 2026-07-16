import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { loadAccountCloudState, replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Deck } from "../../src/coreTypes.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const REIMPORT_FIXTURE = fileURLToPath(new URL("../../fixtures/apkg/import-quality-legacy.apkg", import.meta.url));

test.setTimeout(120_000);

async function resetLifecycleAccount() {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw error ?? new Error("Der E2E-Lebenszyklusaccount fehlt.");

  try {
    const { data: mediaRows, error: mediaReadError } = await client.from("media_assets").select("storage_bucket, storage_path").eq("user_id", data.user.id);
    if (mediaReadError) throw mediaReadError;
    const { error: mediaDeleteError } = await client.from("media_assets").delete().eq("user_id", data.user.id);
    if (mediaDeleteError) throw mediaDeleteError;
    const pathsByBucket = new Map<string, Set<string>>();
    for (const row of mediaRows ?? []) pathsByBucket.set(row.storage_bucket, new Set([...(pathsByBucket.get(row.storage_bucket) ?? []), row.storage_path]));
    for (const [bucket, paths] of pathsByBucket) {
      const { error: objectDeleteError } = await client.storage.from(bucket).remove([...paths]);
      if (objectDeleteError) throw objectDeleteError;
    }
    const { error: conflictError } = await client.from("sync_conflicts").delete().eq("user_id", data.user.id);
    if (conflictError) throw conflictError;
    const seedState = createCoreRepository(null, { seedDefaultDecks: true }).getState();
    await replaceAccountCloudState(client, {
      ...seedState,
      decks: seedState.decks.map((deck: Deck) => ({ ...deck, reviewEvents: [] })),
      profile: { ...seedState.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, { deviceId: "e2e-card-lifecycle-reset" });
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

test.beforeEach(async () => {
  await resetLifecycleAccount();
});

test.afterEach(async ({ page }) => {
  await page.close();
  await resetLifecycleAccount();
});

async function waitForCloudCard(deckId: string, cardId: string, predicate: (card: any) => boolean) {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw error ?? new Error("Der E2E-Lebenszyklusaccount fehlt.");

  try {
    const fallbackState = createCoreRepository(null, { seedDefaultDecks: false }).getState();
    await expect.poll(async () => {
      const cloudState = await loadAccountCloudState(client, fallbackState);
      const card = cloudState.decks.find((deck: Deck) => deck.id === deckId)?.cards.find((candidate: { id: string }) => candidate.id === cardId);
      return Boolean(card && predicate(card));
    }, { timeout: 30_000 }).toBe(true);
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
}

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmen/ });
}

async function openManualCreation(page: Page, deckName: string, cardType: string) {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Karten manuell erstellen/ }).click();
  await page.getByRole("button", { name: "Neuen Stapel erstellen" }).click();
  await page.getByRole("textbox", { name: "Neuer Kartenstapel" }).fill(deckName);
  await page.getByLabel("Kartentyp").selectOption(cardType);
}

async function finishManualCreation(page: Page, deckName: string) {
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible({ timeout: 30_000 });
  const state = await readActiveAccountState(page);
  const deck = state.decks.find((candidate: { name: string }) => candidate.name === deckName);
  expect(deck).toBeTruthy();
  expect(deck.cards).toHaveLength(1);
  return deck;
}

async function openCreatedCardEditor(page: Page) {
  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Kartenstapel", exact: true })).toBeVisible();
}

test("[Vertrag: typgerechter Basic-Lebenszyklus] @beta-core Basic erstellen, bearbeiten, speichern und reviewen", async ({ page }) => {
  const deckName = "Lebenszyklus Basic";
  await openManualCreation(page, deckName, "basic");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Basic Frage alt");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Basic Antwort alt");
  const deck = await finishManualCreation(page, deckName);
  const immutableOriginal = deck.cards[0].immutableOriginal;

  await openCreatedCardEditor(page);
  await page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true }).fill("Basic Frage neu");
  await page.getByRole("textbox", { name: "Karten-Rückseite", exact: true }).fill("Basic Antwort neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");

  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state.decks.find((candidate: { id: string }) => candidate.id === deck.id)?.cards[0]?.originalFront;
  }).toBe("<p>Basic Frage neu</p>");
  const savedState = await readActiveAccountState(page);
  const savedCard = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0];
  expect(savedCard.originalBack).toBe("<p>Basic Antwort neu</p>");
  expect(savedCard.immutableOriginal).toEqual(immutableOriginal);
  expect(savedCard.versionLog.at(-1)?.changeType).toBe("content_updated");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kartenstapel", exact: true })).toBeVisible();
  await page.getByTestId(`deck-select-${deck.id}`).click();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true })).toContainText("Basic Frage neu");

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${deck.id}`).click();
  await expect(page.getByText("Basic Frage neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByText("Basic Antwort neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
});

test("[Vertrag: typgerechter Reverse-Lebenszyklus] @beta-core Reverse hält beide Richtungen synchron und reviewbar", async ({ page }) => {
  const deckName = "Lebenszyklus Reverse";
  await openManualCreation(page, deckName, "basic-reversed");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Reverse vorne alt");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Reverse hinten alt");
  const deck = await finishManualCreation(page, deckName);
  const initialReverse = deck.cards[0].variants.find((variant: { variantType: string; isOriginal: boolean }) => variant.variantType === "reverse" && !variant.isOriginal);
  expect(initialReverse).toBeTruthy();

  await openCreatedCardEditor(page);
  await page.getByRole("button", { name: `${deckName} lernen` }).click();
  await expect(page.getByText("Reverse vorne alt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByText("Reverse hinten alt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await page.getByRole("button", { name: `${deckName} mit Varianten lernen` }).click();
  await expect(page.getByText("Reverse hinten alt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByText("Reverse vorne alt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();

  await page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true }).fill("Reverse vorne neu");
  await page.getByRole("textbox", { name: "Karten-Rückseite", exact: true }).fill("Reverse hinten neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");

  const savedState = await readActiveAccountState(page);
  const savedCard = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0];
  const activeReverse = savedCard.variants.filter((variant: { variantType: string; isOriginal: boolean; isActive: boolean }) => variant.variantType === "reverse" && !variant.isOriginal && variant.isActive);
  expect(activeReverse).toHaveLength(1);
  expect(activeReverse[0]).toMatchObject({ id: initialReverse.id, front: "<p>Reverse hinten neu</p>", back: "<p>Reverse vorne neu</p>" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kartenstapel", exact: true })).toBeVisible();
  await page.getByTestId(`deck-select-${deck.id}`).click();
  await page.getByRole("button", { name: `${deckName} lernen` }).click();
  await expect(page.getByText("Reverse vorne neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByText("Reverse hinten neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();

  await page.getByRole("button", { name: `${deckName} mit Varianten lernen` }).click();
  await expect(page.getByText("Reverse hinten neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByText("Reverse vorne neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await expect(page.getByRole("heading", { name: "Sitzung abgeschlossen" })).toBeVisible();
});

test("[Vertrag: typgerechter Cloze-Lebenszyklus] @beta-core Cloze ergänzt eine aktive Lückengruppe ohne bestehende Identität zu verlieren", async ({ page }) => {
  const deckName = "Lebenszyklus Cloze";
  await openManualCreation(page, deckName, "cloze");
  await page.getByRole("textbox", { name: "Cloze-Text" }).fill("{{c1::ATP}} entsteht in {{c2::Mitochondrien}}.");
  await page.getByRole("textbox", { name: "Zusatzinfo" }).fill("Zellatmung");
  const deck = await finishManualCreation(page, deckName);
  const initialGroups = new Map(deck.cards[0].variants.filter((variant: { isOriginal: boolean }) => !variant.isOriginal).map((variant: { meta: { clozeGroup: number }; id: string }) => [variant.meta.clozeGroup, variant.id]));

  await openCreatedCardEditor(page);
  await page.getByRole("textbox", { name: "Cloze-Text", exact: true }).fill("{{c1::ATP} entsteht in Mitochondrien.");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Bitte gültige Lücken wie {{c1::Begriff}} verwenden.", { exact: true })).toBeVisible();
  expect((await readActiveAccountState(page)).decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0].originalFront).toBe("<p>{{c1::ATP}} entsteht in {{c2::Mitochondrien}}.</p>");

  await page.getByRole("textbox", { name: "Cloze-Text", exact: true }).fill("{{c1::ATP}} entsteht in Mitochondrien aus {{c3::ADP}}.");
  await page.getByRole("textbox", { name: "Cloze-Zusatzinfo", exact: true }).fill("Zellatmung und Phosphorylierung");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");

  const savedState = await readActiveAccountState(page);
  const savedCard = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0];
  const activeGroups = savedCard.variants.filter((variant: { isOriginal: boolean; isActive: boolean }) => !variant.isOriginal && variant.isActive);
  expect(activeGroups.map((variant: { meta: { clozeGroup: number } }) => variant.meta.clozeGroup).sort()).toEqual([1, 3]);
  expect(activeGroups.find((variant: { meta: { clozeGroup: number } }) => variant.meta.clozeGroup === 1)?.id).toBe(initialGroups.get(1));
  expect(savedCard.variants.find((variant: { meta: { clozeGroup: number } }) => variant.meta.clozeGroup === 2)?.isActive).toBe(false);
  expect(activeGroups.find((variant: { meta: { clozeGroup: number } }) => variant.meta.clozeGroup === 3).expectedAnswerJson).toEqual(["ADP"]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kartenstapel", exact: true })).toBeVisible();
  await page.getByTestId(`deck-select-${deck.id}`).click();
  await page.getByRole("button", { name: `${deckName} mit Varianten lernen` }).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
});

test("[Vertrag: typgerechter Multiple-Choice-Lebenszyklus] @beta-core Optionen, Lösung und Erklärung bleiben synchron", async ({ page }) => {
  const deckName = "Lebenszyklus Multiple Choice";
  await openManualCreation(page, deckName, "multiple-choice");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await expect(page.getByText("Bitte eine Frage eingeben.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Multiple-Choice-Frage" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("textbox", { name: "Antwortoption 1", exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("textbox", { name: "Multiple-Choice-Frage" }).fill("Welche Option ist richtig?");
  await page.getByRole("textbox", { name: "Antwortoption 1", exact: true }).fill("Alpha");
  await page.getByRole("textbox", { name: "Antwortoption 2", exact: true }).fill("Beta");
  await page.getByRole("button", { name: "Option hinzufügen" }).click();
  await page.getByRole("textbox", { name: "Antwortoption 3", exact: true }).fill("Gamma");
  await page.getByLabel("Option 2 als richtig markieren").check();
  await page.getByRole("textbox", { name: "Erklärung (optional)" }).fill("Beta war zunächst richtig.");
  const deck = await finishManualCreation(page, deckName);

  await openCreatedCardEditor(page);
  await page.getByRole("textbox", { name: "Multiple-Choice-Frage", exact: true }).fill("Welche Option ist jetzt richtig?");
  await page.getByRole("textbox", { name: "Antwortoption 3", exact: true }).fill("Gamma neu");
  await page.getByLabel("Option 3 als richtig markieren").check();
  await page.getByRole("textbox", { name: "Erklärung zur richtigen Antwort", exact: true }).fill("Gamma neu ist nach der Bearbeitung richtig.");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Karte gespeichert");

  const savedState = await readActiveAccountState(page);
  const savedCard = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0];
  const original = savedCard.variants.find((variant: { isOriginal: boolean }) => variant.isOriginal);
  expect(original.answerOptionsJson).toEqual(["Alpha", "Beta", "Gamma neu"]);
  expect(original.expectedAnswerJson).toBe("Gamma neu");
  expect(original.explanation).toContain("Gamma neu ist nach der Bearbeitung richtig.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kartenstapel", exact: true })).toBeVisible();
  await page.getByTestId(`deck-select-${deck.id}`).click();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${deck.id}`).click();
  await page.getByRole("button", { name: "Antwortoption A: Alpha" }).click();
  await expect(page.locator(".core-mcq-option-correct")).toContainText("Gamma neu");
  await expect(page.getByText("Nicht ganz.", { exact: true })).toBeVisible();
  await expect(page.getByText("Gamma neu ist nach der Bearbeitung richtig.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
});

test("[Vertrag: APKG-Reimport nach lokaler Bearbeitung] @beta-core Reimport schützt lokalen Karteninhalt", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Core · APKG, Text, Tabellen/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(REIMPORT_FIXTURE);
  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await page.getByRole("button", { name: "Import abschließen" }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible({ timeout: 30_000 });

  let state = await readActiveAccountState(page);
  const importedDeck = state.decks.find((deck: { cards?: Array<{ originalFront: string }> }) => deck.cards?.some((card) => card.originalFront.includes("Welches Organell erzeugt ATP?")));
  const importedCard = importedDeck.cards.find((card: { originalFront: string }) => card.originalFront.includes("Welches Organell erzeugt ATP?"));
  const reviewStateBeforeReimport = importedCard.reviewState;
  const learningItemStateBeforeReimport = importedCard.learningItemState;
  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await page.getByTestId(`deck-select-${importedDeck.id}`).click();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true })).toContainText("Welches Organell erzeugt ATP");
  await page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true }).fill("Welche Zellstruktur erzeugt lokal ATP?");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(async () => {
    const current = await readActiveAccountState(page);
    return current.decks.find((deck: { id: string }) => deck.id === importedDeck.id)?.cards.find((card: { id: string }) => card.id === importedCard.id)?.originalFront;
  }).toBe("<p>Welche Zellstruktur erzeugt lokal ATP?</p>");
  await waitForCloudCard(importedDeck.id, importedCard.id, (card) => card.originalFront === "<p>Welche Zellstruktur erzeugt lokal ATP?</p>");

  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Core · APKG, Text, Tabellen/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(REIMPORT_FIXTURE);
  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await page.getByRole("button", { name: "Import abschließen" }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible({ timeout: 30_000 });

  state = await readActiveAccountState(page);
  const reimportedCard = state.decks.find((deck: { id: string }) => deck.id === importedDeck.id).cards.find((card: { id: string }) => card.id === importedCard.id);
  expect(reimportedCard.originalFront).toBe("<p>Welche Zellstruktur erzeugt lokal ATP?</p>");
  expect(reimportedCard.meta.preservedLocalContent).toBe(true);
  expect(reimportedCard.versionLog.some((entry: { changeType: string }) => entry.changeType === "content_updated")).toBe(true);
  expect(reimportedCard.reviewState).toEqual(reviewStateBeforeReimport);
  expect(reimportedCard.learningItemState).toEqual(learningItemStateBeforeReimport);
});
