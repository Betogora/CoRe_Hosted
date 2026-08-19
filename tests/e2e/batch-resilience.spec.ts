import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreDeck, createLearningItemFromEditorValue } from "../../src/coreModel.ts";
import { createCoreRepository, normalizeContentEntities } from "../../src/coreRepository.ts";
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
    ...Array.from({ length: 5 }, (_, index) => createCoreDeck({
      id: `batch-scroll-${index + 1}`,
      name: `Scroll-Stapel ${index + 1}`,
      hierarchyPath: [`Scroll-Stapel ${index + 1}`],
      source: "manual",
      cards: [],
    })),
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
    const { error: conflictCleanupError } = await client.from("sync_conflicts").delete().eq("user_id", data.user.id);
    if (conflictCleanupError) throw conflictCleanupError;
    const state = createCoreRepository({ seedDefaultDecks: false }).getState();
    const content = normalizeContentEntities(seedDecks(), [], []);
    await replaceAccountCloudState(client, {
      ...state,
      decks: content.decks,
      noteTypeDefinitions: content.definitions,
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
  await page.getByRole("button", { name: /Karte selbst erstellen/ }).click();
}

async function enterManualImageCard(page: Page, prefix: string, name: string, buffer: Buffer | null) {
  await openManualCreation(page);
  await chooseCoreSelectOption(page, page.getByRole("combobox", { name: "Kartenstapel" }), "Batch-Ziel");
  await page.getByRole("textbox", { name: "Vorderseite" }).fill(`${prefix} Bildfrage`);
  await page.getByRole("textbox", { name: "Rückseite" }).fill(`${prefix} Bildantwort`);
  const input = page.locator('input[type="file"][accept="image/*"]').first();
  if (buffer) {
    await input.setInputFiles({ name, mimeType: "image/png", buffer });
    return;
  }
  await input.evaluate(async (element, fileName) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1_920;
    canvas.height = 1_080;
    const pixels = new Uint32Array(canvas.width * canvas.height);
    let value = 0x12345678;
    for (let index = 0; index < pixels.length; index += 1) {
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      pixels[index] = value;
    }
    canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), canvas.width, canvas.height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Testbild fehlt.")), "image/png"));
    if (blob.size <= 6 * 1_024 * 1_024) throw new Error(`Testbild ist mit ${blob.size} Bytes zu klein.`);
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], fileName, { type: "image/png" }));
    (element as HTMLInputElement).files = transfer.files;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, name);
}

async function clickManualSaveTwice(page: Page) {
  const button = page.getByTestId("manual-save-button");
  await button.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  return button;
}

test.beforeEach(async ({ page }) => {
  await seedAccount();
  await resetToFreshLocalState(page, { resetCloud: false });
});
test("[Vertrag: Batch, Pins, Deckpfade und Draftschutz] @beta-core fünf Karten bleiben in einer sicheren Session", async ({ page }) => {
  await openManualCreation(page);
  const targetSelect = page.getByRole("combobox", { name: "Kartenstapel" });
  await targetSelect.click();
  const rootAOption = page.getByRole("option", { name: "Bereich A", exact: true });
  const childAOption = page.getByRole("option", { name: "Bereich A / Gemeinsam", exact: true });
  const rootBOption = page.getByRole("option", { name: "Bereich B", exact: true });
  const childBOption = page.getByRole("option", { name: "Bereich B / Gemeinsam", exact: true });
  await expect(childAOption).toHaveCount(1);
  await expect(childBOption).toHaveCount(1);
  await expect(childAOption.locator('[data-deck-icon="true"]')).toHaveCount(1);
  const optionDeckIds = await page.locator("[data-deck-select-option]").evaluateAll((options) => options.map((option) => option.getAttribute("data-deck-select-option")));
  expect(optionDeckIds.slice(0, 5)).toEqual([DECK_IDS.target, DECK_IDS.rootA, DECK_IDS.childA, DECK_IDS.rootB, DECK_IDS.childB]);
  const [rootPadding, childPadding] = await Promise.all([
    rootAOption.evaluate((option) => Number.parseFloat(getComputedStyle(option).paddingInlineStart)),
    childAOption.evaluate((option) => Number.parseFloat(getComputedStyle(option).paddingInlineStart)),
  ]);
  expect(childPadding - rootPadding).toBe(16);
  const [rootBackground, childBackground] = await Promise.all([
    rootBOption.evaluate((option) => getComputedStyle(option).backgroundColor),
    childBOption.evaluate((option) => getComputedStyle(option).backgroundColor),
  ]);
  expect(childBackground).toBe(rootBackground);
  const selectContent = page.locator('[data-deck-select-content="true"]');
  const selectViewport = page.locator('[data-deck-select-viewport="true"]');
  expect((await selectContent.boundingBox())?.height).toBeLessThanOrEqual(400);
  expect(await selectViewport.evaluate((viewport) => viewport.scrollHeight > viewport.clientHeight)).toBe(true);
  await page.getByRole("option", { name: "Batch-Ziel", exact: true }).click();

  for (let index = 1; index <= 5; index += 1) {
    await page.getByRole("textbox", { name: "Vorderseite" }).fill(`Batch-Frage ${index}`);
    await page.getByRole("textbox", { name: "Rückseite" }).fill(`Batch-Antwort ${index}`);
    await page.getByRole("button", { name: "Originalkarte speichern" }).click();
    await expect(page.getByRole("status")).toContainText("Karte wurde erfolgreich gespeichert.");
    await expect(page.getByRole("heading", { name: "Karte selbst erstellen" })).toBeVisible();
    await expect(page.getByText(`${index} ${index === 1 ? "Karte" : "Karten"} in dieser Sitzung erstellt.`)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Vorderseite" })).toBeFocused();
  }

  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("heading", { name: "Deine Karten sind bereit" })).toBeVisible();
  await expect(page.getByText(/5 Karten wurden in „Batch-Ziel“ gespeichert/)).toBeVisible();
  const state = await readActiveAccountState(page);
  expect(state.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards).toHaveLength(6);

  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
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
  await expect(page.getByRole("status")).toContainText("Karte wurde erfolgreich gespeichert.");
  await expect(page.getByRole("textbox", { name: "Vorderseite" })).toContainText("Angeheftete Frage");
  await expect(page.getByRole("textbox", { name: "Rückseite" })).toHaveText("");
  await expect(page.getByRole("textbox", { name: "Rückseite" })).toBeFocused();
  await expect(page.getByRole("button", { name: /Vorderseite: Nach Speichern behalten/ })).toBeVisible();

  await page.getByRole("button", { name: /Vorderseite: Nach Speichern behalten/ }).click();
  await page.getByRole("button", { name: /Rückseite: Nach Speichern leeren/ }).click();
  await page.getByRole("textbox", { name: "Vorderseite" }).fill("Einmalige Frage");
  await page.getByRole("textbox", { name: "Rückseite" }).fill("Angeheftete Antwort");
  await page.getByRole("button", { name: "Originalkarte speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Karte wurde erfolgreich gespeichert.");
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

test("[Vertrag: große manuelle Bilder] Speichern bleibt exklusiv und zeigt Byte-Fortschritt", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterManualImageCard(page, "Große", "großes-bild.png", null);

  let releaseUpload!: () => void;
  const uploadReleased = new Promise<void>((resolve) => { releaseUpload = resolve; });
  let heldUploadResponse = false;
  await page.route("**/storage/v1/upload/resumable**", async (route) => {
    const response = await route.fetch();
    if (!heldUploadResponse) {
      heldUploadResponse = true;
      await uploadReleased;
    }
    await route.fulfill({ response });
  });

  try {
    const saveButton = await clickManualSaveTwice(page);
    const progress = page.getByTestId("manual-save-progress");
    await expect(progress).toBeVisible();
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("manual-draft-controls")).toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "Fertig" })).toBeDisabled();
    await expect.poll(() => heldUploadResponse).toBe(true);
    await expect(progress).toContainText(/großes-bild\.png wird hochgeladen/);
    await expect(progress).toContainText(/MB von .*MB/);
    await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(20);
    expect(await page.getByTestId("manual-save-progress-fill").evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");

    await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
    await expect(progress).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Ungespeicherten Entwurf verlassen?" })).toHaveCount(0);

    releaseUpload();
    await expect(progress).toHaveAttribute("aria-valuenow", "100", { timeout: 30_000 });
    await expect(page.locator('[data-success-toast-region="true"]')).toContainText("Karte wurde erfolgreich gespeichert.");
    await expect(page.getByText("1 Karte in dieser Sitzung erstellt.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Vorderseite" })).toBeFocused();
    const state = await readActiveAccountState(page);
    expect(state.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards).toHaveLength(2);
  } finally {
    releaseUpload();
  }
});

test("[Vertrag: Offline-Medien] genau eine lokale Karte erhält eine eindeutige Sync-Warnung", async ({ page, context }) => {
  await enterManualImageCard(page, "Offline", "offline-bild.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

  try {
    await context.setOffline(true);
    await clickManualSaveTwice(page);
    const warning = "Karte und Bilder sind lokal gespeichert. Die Cloud-Synchronisierung wird automatisch fortgesetzt.";
    await expect(page.getByRole("status").filter({ hasText: warning }).last()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Karte wurde erfolgreich gespeichert.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("1 Karte in dieser Sitzung erstellt.")).toBeVisible();
    const state = await readActiveAccountState(page);
    expect(state.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards).toHaveLength(2);
  } finally {
    await context.setOffline(false);
  }
});

test("[Vertrag: Karten- und Stapellöschung] @beta-core Bestätigung, Undo und Auswirkungen bleiben sichtbar", async ({ page }) => {
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await mainMenu(page).getByRole("button", { name: "Karten" }).click();
  const targetState = await readActiveAccountState(page);
  const existingCardId = targetState.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards[0].id;
  await page.getByTestId(`deck-toggle-${DECK_IDS.target}`).click();
  await page.getByTestId(`deck-card-${existingCardId}`).click();
  const deleteCardButton = page.getByRole("button", { name: "Löschen", exact: true });
  await deleteCardButton.click();
  const cardDialog = page.getByRole("dialog", { name: "Karte löschen" });
  await expect(cardDialog).not.toContainText("Bestehende Karte");
  await expect(cardDialog.getByRole("button", { name: "Nein" }).locator("svg.lucide-x")).toBeVisible();
  await expect(cardDialog.getByRole("button", { name: "Ja" }).locator("svg.lucide-check")).toBeVisible();
  await page.getByTestId("action-dialog-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(cardDialog).toBeHidden();
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
  await expect(page.getByTestId(`deck-card-${existingCardId}`)).toContainText("Bestehende Karte");
  await expect(page.getByTestId(`deck-card-${existingCardId}`)).toBeFocused();

  await page.getByTestId(`deck-card-${existingCardId}`).click();
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await cardDialog.getByRole("button", { name: "Nein" }).click();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Bestehende Karte");
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  const contentRegion = page.locator('section[aria-label="Seiteninhalt"]');
  const scrollAnchor = page.getByTestId("deck-header-batch-scroll-3");
  await scrollAnchor.evaluate((element) => element.scrollIntoView({ block: "center" }));
  expect(await contentRegion.evaluate((region) => region.scrollTop)).toBeGreaterThan(0);
  const anchorTopBeforeDelete = await scrollAnchor.evaluate((element) => element.getBoundingClientRect().top);
  await cardDialog.getByRole("button", { name: "Ja" }).click();
  await expect.poll(async () => !(await readActiveAccountState(page)).decks.some((deck: Deck) => deck.cards.some((card) => card.id === existingCardId))).toBe(true);
  const deletionToast = page.locator('[data-success-toast-region="true"]');
  await expect(deletionToast).toContainText("Karte wurde erfolgreich gelöscht.");
  await expect(page.getByTestId(`deck-card-${existingCardId}`)).toHaveCount(0);
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
  await expect.poll(() => contentRegion.evaluate((region) => region.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => scrollAnchor.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(anchorTopBeforeDelete, 0);
  await expect(page.getByRole("button", { name: "Rückgängig" })).toBeVisible();
  await deletionToast.getByRole("button", { name: "Erfolgsmeldung schließen" }).click();
  await expect(deletionToast).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Bestehende Karte");
  await expect.poll(async () => (await readActiveAccountState(page)).decks.some((deck: Deck) => deck.cards.some((card) => card.id === existingCardId))).toBe(true);
  await page.reload();
  if (await page.getByTestId(`deck-toggle-${DECK_IDS.target}`).getAttribute("aria-expanded") !== "true") {
    await page.getByTestId(`deck-toggle-${DECK_IDS.target}`).click();
  }
  if (await page.getByTestId("card-detail-aside").count() === 0) {
    await page.getByTestId(`deck-card-${existingCardId}`).click();
  }
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Bestehende Karte");
  await page.getByTestId("card-detail-backdrop").click({ position: { x: 5, y: 5 } });

  await page.getByTestId(`deck-options-${DECK_IDS.rootA}`).click();
  await page.getByTestId(`deck-options-menu-${DECK_IDS.rootA}`).getByRole("button", { name: "Einstellungen", exact: true }).click();
  const deckSettings = page.getByRole("region", { name: "Stapel", exact: true });
  await deckSettings.getByRole("button", { name: "Löschen", exact: true }).click();
  const deckDialog = page.getByRole("dialog", { name: "Stapelbaum löschen?" });
  await expect(deckDialog).toContainText("Bereich A");
  await expect(deckDialog).toContainText("1 Unterstapel");
  await expect(deckDialog).toContainText("1 aktive Karte");
  await deckDialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByTestId(`deck-settings-${DECK_IDS.rootA}`)).toBeVisible();
  await deckSettings.getByRole("button", { name: "Löschen", exact: true }).click();
  await deckDialog.getByRole("button", { name: "Stapelbaum löschen" }).click();
  await expect(page.getByTestId(`card-group-${DECK_IDS.rootA}`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(`card-group-${DECK_IDS.rootA}`)).toHaveCount(0);
});

test("[Vertrag: Offline-Kartenlöschung] lokal gelöschte Karten werden nach Reconnect nicht reaktiviert", async ({ page, context }) => {
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await mainMenu(page).getByRole("button", { name: "Karten" }).click();
  const targetState = await readActiveAccountState(page);
  const existingCardId = targetState.decks.find((deck: Deck) => deck.id === DECK_IDS.target).cards[0].id;
  await page.getByTestId(`deck-toggle-${DECK_IDS.target}`).click();
  await page.getByTestId(`deck-card-${existingCardId}`).click();
  await expect(page.getByRole("button", { name: "Löschen", exact: true })).toBeVisible();

  try {
    await context.setOffline(true);
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await page.getByRole("dialog", { name: "Karte löschen" }).getByRole("button", { name: "Ja" }).click();

    await expect.poll(async () => !(await readActiveAccountState(page)).decks.some((deck: Deck) => deck.cards.some((card) => card.id === existingCardId))).toBe(true);
    await expect(page.locator('[data-success-toast-region="true"]')).toContainText("Karte wurde erfolgreich gelöscht.");
    await expect(page.getByTestId(`deck-card-${existingCardId}`)).toHaveCount(0);
    await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
    await expect(page.getByText(/„Bestehende Karte“ gelöscht/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  expect(login.data.user).toBeTruthy();
  await expect.poll(async () => {
    const { data } = await client.from("cards").select("deleted_at").eq("id", existingCardId).maybeSingle();
    return Boolean(data?.deleted_at);
  }, { timeout: 15_000 }).toBe(true);
  await client.auth.signOut({ scope: "local" });
  client.auth.dispose?.();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  await expect(page.getByTestId(`deck-card-${existingCardId}`)).toHaveCount(0);
});

test("[Vertrag: ausschließlicher APKG-Import und Terminalzustände] @beta-core nur APKG bleibt verfügbar", async ({ page }) => {
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  const importCreation = page.getByRole("region", { name: "Import" });
  await expect(importCreation.getByRole("heading", { name: "APKG-Dateien importieren" })).toBeVisible();
  await expect(importCreation.getByRole("button", { name: "Erstellen", exact: true })).toBeVisible();
  await expect(importCreation.getByRole("button", { name: /^(APKG|Text|CSV|Excel\/Tabelle)$/ })).toHaveCount(0);
  await expect(importCreation.getByRole("textbox", { name: "Importinhalt" })).toHaveCount(0);
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles({
    name: "kaputt.apkg",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("kein gueltiges apkg"),
  });
  await expect(page.getByLabel("Importstatus").getByText("Fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Andere Datei auswählen" })).toBeVisible();
});

test("[Vertrag: partieller Importabschluss] @beta-core Karten bleiben nach Medienfehler nutzbar", async ({ page }) => {
  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /^Import\b/ }).click();
  await page.locator('input[type="file"][accept=".apkg"]').setInputFiles(QUALITY_APKG_FIXTURE);
  await expect(page.getByText("Importvorschau", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.route("**/storage/v1/object/core-media/**", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Import übernehmen" }).click();
  await expect(page.getByText(/Import teilweise abgeschlossen/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Medien sind lokal gespeichert; die Cloud-Synchronisierung steht noch aus.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Karten jetzt verwenden" })).toBeVisible();
});
