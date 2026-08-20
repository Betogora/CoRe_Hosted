import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Deck } from "../../src/coreTypes.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";
import { seedAccountState } from "../support/seedAccountState.ts";

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
    const seedState = createCoreRepository({ seedDefaultDecks: true }).getState();
    await seedAccountState(client, {
      ...seedState,
      decks: seedState.decks.map((deck: Deck) => ({ ...deck, reviewEvents: [] })),
      profile: { ...seedState.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, "e2e-card-lifecycle-reset");
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
    await expect.poll(async () => {
      const [{ data: cards, error: cardError }, { data: variants, error: variantError }] = await Promise.all([
        client.from("cards").select("original_front, original_back").eq("user_id", data.user.id).eq("deck_id", deckId).eq("id", cardId).is("deleted_at", null),
        client.from("card_variants").select("front, back, meta").eq("user_id", data.user.id).eq("card_id", cardId).is("deleted_at", null),
      ]);
      if (cardError || variantError) throw cardError ?? variantError;
      const row = cards?.[0];
      return Boolean(row && predicate({
        originalFront: row.original_front,
        originalBack: row.original_back,
        variants: variants ?? [],
      }));
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
  await page.getByRole("button", { name: /Karten selbst erstellen/ }).click();
  await page.getByRole("button", { name: "Neuen Stapel erstellen" }).click();
  await page.getByRole("textbox", { name: "Neuer Kartenstapel" }).fill(deckName);
  if (cardType === "basic-reversed") {
    await page.getByRole("button", { name: "Beide Richtungen", exact: true }).click();
    await expect(page.getByRole("button", { name: "Beide Richtungen", exact: true })).toHaveAttribute("aria-pressed", "true");
  } else if (cardType === "multiple-choice") {
    await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
    await expect(page.getByRole("button", { name: "Multiple Choice", exact: true })).toHaveAttribute("aria-pressed", "true");
  } else if (cardType !== "basic" && cardType !== "cloze") {
    throw new Error(`Unbekanntes Antwortformat im Test: ${cardType}`);
  }
}

async function finishManualCreation(page: Page, deckName: string, expectedCardCount = 1): Promise<Deck> {
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await expect(page.getByTestId("manual-save-progress")).toHaveAttribute("aria-valuenow", "100");
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible({ timeout: 30_000 });
  const state = await readActiveAccountState(page);
  const deck = state.decks.find((candidate: { name: string }) => candidate.name === deckName);
  expect(deck).toBeTruthy();
  expect(deck.cards).toHaveLength(expectedCardCount);
  return deck;
}

async function openCreatedCardEditor(page: Page, deck: Deck) {
  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  await page.getByTestId(`deck-card-${deck.cards[0].id}`).click();
}

async function finishApkgImport(page: Page) {
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 30_000 });
}

test("[Vertrag: typgerechter Basic-Lebenszyklus] @beta-core Basic erstellen, bearbeiten, speichern und reviewen", async ({ page }) => {
  const deckName = "Lebenszyklus Basic";
  await openManualCreation(page, deckName, "basic");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Basic Frage alt");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Basic Antwort alt");
  const deck = await finishManualCreation(page, deckName);
  await openCreatedCardEditor(page, deck);
  const frontEditor = page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true });
  const backEditor = page.getByRole("textbox", { name: "Karten-Rückseite", exact: true });
  await frontEditor.fill("Basic Frage neu");
  await expect(frontEditor).toContainText("Basic Frage neu");
  await backEditor.fill("Basic Antwort neu");
  await expect(backEditor).toContainText("Basic Antwort neu");
  await expect(frontEditor).toContainText("Basic Frage neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Karte wurde erfolgreich gespeichert." }).last()).toBeVisible();

  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state.decks.find((candidate: { id: string }) => candidate.id === deck.id)?.cards[0]?.originalFront;
  }).toBe("<p>Basic Frage neu</p>");
  const savedState = await readActiveAccountState(page);
  const savedCard = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0];
  expect(savedCard.originalBack).toBe("<p>Basic Antwort neu</p>");
  expect("immutableOriginal" in savedCard).toBe(false);
  expect("versionLog" in savedCard).toBe(false);
  const sourceUrl = page.url();
  await page.getByRole("button", { name: "Kopieren", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kopie wurde erfolgreich direkt unter der Ausgangskarte erstellt." })).toBeVisible();
  await expect(page).toHaveURL(sourceUrl);
  const copiedState = await readActiveAccountState(page);
  const copiedDeck = copiedState.decks.find((candidate: { id: string }) => candidate.id === deck.id);
  expect(copiedDeck.cards).toHaveLength(2);
  const copiedCard = copiedDeck.cards.find((candidate: { id: string }) => candidate.id !== savedCard.id);
  expect(copiedCard).toBeTruthy();
  expect(copiedCard.reviewState.id).not.toBe(savedCard.reviewState.id);
  expect(copiedCard.originalFront).toContain("Basic Frage neu");
  expect(copiedCard.originalFront.match(/\(Kopie\)/g)).toHaveLength(1);
  expect(copiedCard.originalBack).toBe(savedCard.originalBack);
  await expect(page.getByTestId(`deck-card-${copiedCard.id}`)).toBeAttached();
  await waitForCloudCard(deck.id, copiedCard.id, (card) => card.originalFront.includes("(Kopie)"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  await expect(page.getByTestId(`deck-card-${copiedCard.id}`)).toBeAttached();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true })).toContainText("Basic Frage neu");
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${deck.id}`).click();
  await expect(page.frameLocator('iframe[title="Frage"]').getByText("Basic Frage neu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.frameLocator('iframe[title="Antwort"]').getByText("Basic Antwort neu", { exact: true })).toBeVisible();
  await expect(page.getByTestId("review-answer-tools")).toHaveCount(0);
  const ratingButtons = page.getByRole("button", { name: /Bewertung (Nochmal|Schwer|Gut|Leicht)/ });
  await expect(ratingButtons).toHaveCount(4);
  await expect(ratingButtons.nth(0).locator("span").first()).toHaveText("Nochmal");
  await expect(ratingButtons.nth(0)).toHaveAttribute("data-core-tooltip", "Taste 1");
  await expect(ratingButtons.nth(0)).toContainText("5 min");
  await ratingButtons.nth(0).hover();
  await expect(page.getByRole("tooltip")).toHaveText("Taste 1");
  await page.keyboard.press("3");
});

test("[Vertrag: modale Kartenvorschau] @beta-core Erstellung und Editor zeigen den ungespeicherten Entwurf zugänglich und responsiv", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const deckName = "Vorschau-Dialog";
  await openManualCreation(page, deckName, "basic");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Ungespeicherte Erstellungsfrage");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Ungespeicherte Erstellungsantwort");
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const imageInputs = page.locator('input[type="file"][accept="image/*"]');
  await imageInputs.nth(0).setInputFiles({ name: "vorderseite.png", mimeType: "image/png", buffer: pixel });
  await imageInputs.nth(1).setInputFiles({ name: "rueckseite.png", mimeType: "image/png", buffer: pixel });
  await expect(page.getByText("Live-Vorschau", { exact: true })).toHaveCount(0);

  const creationPreviewButton = page.getByRole("button", { name: "Vorschau", exact: true });
  await creationPreviewButton.click();
  const dialog = page.getByRole("dialog", { name: "Kartenvorschau" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Kartenvorschau schließen" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Vorderseite" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Antwort anzeigen" })).toHaveCount(0);
  const creationQuestion = dialog.frameLocator('iframe[title="Frage"]');
  await expect(creationQuestion.locator("body")).toContainText("Ungespeicherte Erstellungsfrage");
  await expect(creationQuestion.locator("body")).not.toContainText("Ungespeicherte Erstellungsantwort");
  await expect(creationQuestion.locator('img[alt="Bild zur Vorderseite"]')).toHaveAttribute("src", /^blob:/);

  await dialog.getByRole("button", { name: "Rückseite" }).click();
  const creationAnswer = dialog.frameLocator('iframe[title="Antwort"]');
  await expect(dialog.getByTestId("study-card-answer-separator")).toHaveCount(1);
  await expect(creationQuestion.locator("body")).toContainText("Ungespeicherte Erstellungsfrage");
  await expect(creationAnswer.locator("body")).toContainText("Ungespeicherte Erstellungsantwort");
  await expect(creationAnswer.locator('img[alt="Bild zur Rückseite"]')).toHaveAttribute("src", /^blob:/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(creationPreviewButton).toBeFocused();

  await creationPreviewButton.click();
  await expect(dialog.getByRole("button", { name: "Vorderseite" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("card-preview-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);

  const deck = await finishManualCreation(page, deckName);
  await openCreatedCardEditor(page, deck);
  await expect(page.getByText("Sichere Karten-Vorschau", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true }).fill("Ungespeicherte Editorfrage");
  await page.getByRole("textbox", { name: "Karten-Rückseite", exact: true }).fill("Ungespeicherte Editorantwort");

  const editorPreviewButton = page.getByTestId("card-detail-aside").getByRole("button", { name: "Vorschau", exact: true });
  await editorPreviewButton.click();
  const editorFrontBody = dialog.frameLocator('iframe[title="Frage"]').locator("body");
  await expect(editorFrontBody).toContainText("Ungespeicherte Editorfrage");
  await expect(editorFrontBody).not.toContainText("Ungespeicherte Editorantwort");
  await dialog.getByRole("button", { name: "Rückseite" }).click();
  const editorAnswerBody = dialog.frameLocator('iframe[title="Antwort"]').locator("body");
  await expect(editorFrontBody).toContainText("Ungespeicherte Editorfrage");
  await expect(editorAnswerBody).toContainText("Ungespeicherte Editorantwort");
  expect((await editorFrontBody.innerText()).match(/Ungespeicherte Editorfrage/g)).toHaveLength(1);
  expect((await editorAnswerBody.innerText()).match(/Ungespeicherte Editorfrage/g)).toBeNull();
  expect((await editorAnswerBody.innerText()).match(/Ungespeicherte Editorantwort/g)).toHaveLength(1);
  await page.getByRole("button", { name: "Kartenvorschau schließen" }).click();
  await expect(editorPreviewButton).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await editorPreviewButton.click();
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const mobileBox = await dialog.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeLessThanOrEqual(3);
  expect(mobileBox!.y).toBeLessThanOrEqual(3);
  expect(Math.abs(mobileBox!.width - 390)).toBeLessThanOrEqual(5);
  expect(Math.abs(mobileBox!.height - 844)).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  expect(consoleErrors.filter((message) => !/status of (?:400|409)/.test(message))).toEqual([]);
});

test("[Vertrag: KI-Basic-Variante] @golden-e2e abgefangene Modellantwort wird sofort und reloadfest gespeichert", async ({ page }) => {
  const deckName = "KI-Variante Basic";
  await openManualCreation(page, deckName, "basic");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Welche Aufgabe hat ATP?");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("ATP überträgt chemische Energie.");
  const deck = await finishManualCreation(page, deckName);
  await openCreatedCardEditor(page, deck);

  let releaseProvider!: () => void;
  const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  await page.route("**/api/ai/card-variant", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      source: { front: "Welche Aufgabe hat ATP?", back: "ATP überträgt chemische Energie." },
    });
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await providerGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        variant: { front: "Wofür nutzt die Zelle ATP?", back: "ATP überträgt chemische Energie." },
        model: "provider/model:free",
        privacyMode: "zdr",
        usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
      }),
    });
  });

  await expect(page.getByTestId("card-variant-tools")).toBeVisible();
  const generateButton = page.getByRole("button", { name: "KI-Variante erzeugen" });
  await generateButton.click();
  await expect(generateButton).toBeDisabled();
  await expect(page.getByText("KI-Variante wird erzeugt …", { exact: true })).toBeVisible();
  releaseProvider();
  await expect(page.getByRole("status").filter({ hasText: "KI-Variante wurde erfolgreich erstellt." }).last()).toBeVisible();

  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    const card = state.decks.find((candidate: { id: string }) => candidate.id === deck.id)?.cards[0];
    return card?.variants.find((variant: { meta?: { generationSource?: string } }) => variant.meta?.generationSource === "ai_generated")?.front;
  }).toBe("Wofür nutzt die Zelle ATP?");
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  const syncButton = page.locator('[data-navigation-utility="sync"]:visible');
  await expect(syncButton).toBeEnabled();
  await syncButton.click();
  await waitForCloudCard(deck.id, deck.cards[0].id, (card) => card.variants.some((variant: { meta?: { generationSource?: string } }) => variant.meta?.generationSource === "ai_generated"));

  await page.reload();
  const reloadedState = await readActiveAccountState(page);
  const reloadedCard = reloadedState.decks.find((candidate: { id: string }) => candidate.id === deck.id)?.cards[0];
  const generated = reloadedCard?.variants.find((variant: { meta?: { generationSource?: string } }) => variant.meta?.generationSource === "ai_generated");
  expect(generated).toMatchObject({ variantLevel: 2, isActive: true });
  expect("reviewState" in generated).toBe(false);
  expect("dueAt" in generated).toBe(false);
});

test("[Vertrag: typgerechter Reverse-Lebenszyklus] @beta-core Reverse erzeugt zwei unabhängige reviewbare Karten", async ({ page }) => {
  const deckName = "Lebenszyklus Reverse";
  await openManualCreation(page, deckName, "basic-reversed");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Reverse vorne alt");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Reverse hinten alt");
  const deck = await finishManualCreation(page, deckName, 2);
  const forward = deck.cards.find((card) => card.originalFront.includes("Reverse vorne alt"));
  const reverse = deck.cards.find((card) => card.originalFront.includes("Reverse hinten alt"));
  expect(forward).toBeTruthy();
  expect(reverse).toBeTruthy();
  expect(forward!.id).not.toBe(reverse!.id);
  expect(forward!.reviewState.id).not.toBe(reverse!.reviewState.id);
  expect(forward!.variants).toHaveLength(0);
  expect(reverse!.variants).toHaveLength(0);

  await openCreatedCardEditor(page, deck);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true })).toContainText("Reverse vorne alt");
  await page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true }).fill("Reverse vorne neu");
  await page.getByRole("textbox", { name: "Karten-Rückseite", exact: true }).fill("Reverse hinten neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Karte wurde erfolgreich gespeichert." }).last()).toBeVisible();

  const savedState = await readActiveAccountState(page);
  const savedDeck = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id);
  const changedCard = savedDeck.cards.find((card: { originalFront: string }) => card.originalFront === "<p>Reverse vorne neu</p>");
  expect(changedCard).toMatchObject({ id: deck.cards[0].id, originalBack: "<p>Reverse hinten neu</p>", reviewState: deck.cards[0].reviewState });
  const untouchedCard = deck.cards.find((card) => card.id !== deck.cards[0].id)!;
  expect(savedDeck.cards.find((card: { id: string }) => card.id !== changedCard!.id)).toMatchObject({
    id: untouchedCard.id,
    originalFront: untouchedCard.originalFront,
    originalBack: untouchedCard.originalBack,
    reviewState: untouchedCard.reviewState,
  });
});

test("[Vertrag: typgerechter Cloze-Lebenszyklus] @beta-core jede Lückengruppe bleibt eine unabhängige Karte", async ({ page }) => {
  const deckName = "Lebenszyklus Cloze";
  await openManualCreation(page, deckName, "cloze");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("{{c1::ATP}} entsteht in {{c2::Mitochondrien}}.");
  await expect(page.getByRole("textbox", { name: "Cloze-Text" })).toBeVisible();
  await page.getByRole("textbox", { name: "Zusatzinfo" }).fill("Zellatmung");
  const deck = await finishManualCreation(page, deckName, 2);
  expect(deck.cards.map((card) => card.projection.kind === "cloze" ? card.projection.clozeOrdinal : null).sort()).toEqual([1, 2]);
  expect(deck.cards.every((card) => card.variants.length === 0)).toBe(true);
  expect(new Set(deck.cards.map((card) => card.reviewState.id)).size).toBe(2);

  await openCreatedCardEditor(page, deck);
  await page.getByRole("textbox", { name: "Cloze-Text", exact: true }).fill("{{c1::ATP} entsteht in Mitochondrien.");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Bitte gültige Lücken wie {{c1::Begriff}} verwenden.", { exact: true })).toBeVisible();
  expect((await readActiveAccountState(page)).decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0].originalFront).toBe(deck.cards[0].originalFront);

  await page.getByRole("textbox", { name: "Cloze-Text", exact: true }).fill("{{c1::ATP}} entsteht in Mitochondrien.");
  await page.getByRole("textbox", { name: "Cloze-Zusatzinfo", exact: true }).fill("Zellatmung und Phosphorylierung");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Karte wurde erfolgreich gespeichert." }).last()).toBeVisible();

  const savedState = await readActiveAccountState(page);
  const savedDeck = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id);
  expect(savedDeck.cards).toHaveLength(2);
  expect(savedDeck.cards[0].id).toBe(deck.cards[0].id);
  expect(savedDeck.cards[1]).toMatchObject({ id: deck.cards[1].id, originalFront: deck.cards[1].originalFront, reviewState: deck.cards[1].reviewState });
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
  await page.getByLabel("Option 1 als richtig markieren").uncheck();
  await page.getByRole("textbox", { name: "Erklärung (optional)" }).fill("Beta war zunächst richtig.");

  await page.getByRole("button", { name: "Vorschau", exact: true }).click();
  const previewDialog = page.getByRole("dialog", { name: "Kartenvorschau" });
  await previewDialog.getByRole("button", { name: "Rückseite" }).click();
  await expect(previewDialog.getByText("Lösung aufgedeckt.", { exact: true })).toBeVisible();
  await previewDialog.getByRole("button", { name: "Vorderseite" }).click();
  await previewDialog.getByRole("button", { name: "Antwortoption A: Alpha" }).click();
  await previewDialog.getByRole("button", { name: "Antwort prüfen" }).click();
  await expect(previewDialog.getByRole("button", { name: "Rückseite" })).toHaveAttribute("aria-pressed", "true");
  await expect(previewDialog.getByText("Nicht ganz.", { exact: true })).toBeVisible();
  await expect(previewDialog.locator(".core-mcq-option-correct")).toContainText("Beta");
  await expect(previewDialog.getByRole("button", { name: /Bewertung/ })).toHaveCount(0);
  await previewDialog.getByRole("button", { name: "Vorderseite" }).click();
  await expect(previewDialog.getByRole("button", { name: "Antwortoption A: Alpha" })).toHaveAttribute("aria-pressed", "false");
  await previewDialog.getByRole("button", { name: "Kartenvorschau schließen" }).click();

  const deck = await finishManualCreation(page, deckName);

  await openCreatedCardEditor(page, deck);
  await page.getByRole("textbox", { name: "Multiple-Choice-Frage", exact: true }).fill("Welche Option ist jetzt richtig?");
  await page.getByRole("textbox", { name: "Antwortoption 3", exact: true }).fill("Gamma neu");
  await page.getByLabel("Option 3 als richtig markieren").check();
  await page.getByLabel("Option 2 als richtig markieren").uncheck();
  await page.getByRole("textbox", { name: "Erklärung zur richtigen Antwort", exact: true }).fill("Gamma neu ist nach der Bearbeitung richtig.");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Karte wurde erfolgreich gespeichert." }).last()).toBeVisible();

  const savedState = await readActiveAccountState(page);
  const savedCard = savedState.decks.find((candidate: { id: string }) => candidate.id === deck.id).cards[0];
  expect(savedCard.contentDocument.interaction.choice.options).toEqual(["Alpha", "Beta", "Gamma neu"]);
  expect(savedCard.contentDocument.interaction.choice.correctAnswers).toEqual(["Gamma neu"]);
  expect(savedCard.contentDocument.interaction.choice.explanation).toContain("Gamma neu ist nach der Bearbeitung richtig.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  const detail = page.getByTestId("card-detail-aside");
  if (!await detail.isVisible().catch(() => false)) await page.getByTestId(`deck-card-${deck.cards[0].id}`).click();
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${deck.id}`).click();
  await page.getByRole("button", { name: "Antwortoption A: Alpha" }).click();
  await page.getByRole("button", { name: "Antwort prüfen" }).click();
  await expect(page.locator(".core-mcq-option-correct")).toContainText("Gamma neu");
  await expect(page.getByText("Nicht ganz.", { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Antwort"]').getByText("Gamma neu ist nach der Bearbeitung richtig.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
});

test("[Vertrag: APKG-Reimport nach lokaler Bearbeitung] @beta-core Reimport übernimmt keinen gleich alten Karteninhalt", async ({ page }) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(REIMPORT_FIXTURE);
  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await finishApkgImport(page);
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 30_000 });

  let state = await readActiveAccountState(page);
  const importedDeck = state.decks.find((deck: { cards?: Array<{ originalFront: string }> }) => deck.cards?.some((card) => card.originalFront.includes("Welches Organell erzeugt ATP?")));
  const importedCard = importedDeck.cards.find((card: { originalFront: string }) => card.originalFront.includes("Welches Organell erzeugt ATP?"));
  const reviewStateBeforeReimport = importedCard.reviewState;
  const learningItemStateBeforeReimport = importedCard.learningItemState;
  await page.getByRole("button", { name: "Zur Übersicht" }).click();
  await mainMenu(page).getByRole("button", { name: "Karten" }).click();
  await page.getByTestId(`deck-toggle-${importedDeck.id}`).click();
  await page.getByTestId(`deck-card-${importedCard.id}`).click();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true })).toContainText("Welches Organell erzeugt ATP");
  await page.getByRole("textbox", { name: "Karten-Vorderseite", exact: true }).fill("Welche Zellstruktur erzeugt lokal ATP?");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(async () => {
    const current = await readActiveAccountState(page);
    return current.decks.find((deck: { id: string }) => deck.id === importedDeck.id)?.cards.find((card: { id: string }) => card.id === importedCard.id)?.originalFront;
  }).toBe("<p>Welche Zellstruktur erzeugt lokal ATP?</p>");
  await waitForCloudCard(importedDeck.id, importedCard.id, (card) => card.originalFront === "<p>Welche Zellstruktur erzeugt lokal ATP?</p>");

  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(REIMPORT_FIXTURE);
  await expect(page.getByRole("heading", { name: "Erkannte Stapel" })).toBeVisible();
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await finishApkgImport(page);
  await expect(page.getByRole("heading", { name: "Import erfolgreich" })).toBeVisible({ timeout: 30_000 });

  state = await readActiveAccountState(page);
  const reimportedCard = state.decks.find((deck: { id: string }) => deck.id === importedDeck.id).cards.find((card: { id: string }) => card.id === importedCard.id);
  expect(reimportedCard.originalFront).toBe("<p>Welche Zellstruktur erzeugt lokal ATP?</p>");
  expect("versionLog" in reimportedCard).toBe(false);
  expect(reimportedCard.reviewState).toEqual(reviewStateBeforeReimport);
  expect(reimportedCard.learningItemState).toEqual(learningItemStateBeforeReimport);
});
