import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { loadE2EEnvironment } from "./support/e2eEnvironment.ts";

const PDF_SELECTION_FIXTURE = fileURLToPath(new URL("../fixtures/pdf-selection.pdf", import.meta.url));

const DECK_IDS = {
  root: "deck_world_capitals",
  africa: "deck_world_capitals_afrika",
  europe: "deck_world_capitals_europa",
};

async function readAppState(page: any) {
  return readActiveAccountState(page);
}

async function deckReviewEventCount(page: Page, deckId: string) {
  const state = await readAppState(page);
  return state.decks?.find((deck: { id: any; }) => deck.id === deckId)?.reviewEvents?.length ?? 0;
}

async function variantReviewEventCount(page: Page, deckId: string) {
  const state = await readAppState(page);
  return state.decks?.find((deck: { id: any; }) => deck.id === deckId)?.reviewEvents?.filter((event: { reviewableType: string; }) => event.reviewableType === "variant").length ?? 0;
}

async function storedCard(page: Page, deckId: string, cardId: string) {
  const state = await readAppState(page);
  return state.decks?.find((deck: { id: string }) => deck.id === deckId)?.cards?.find((card: { id: string }) => card.id === cardId) ?? null;
}

async function storedDeckCountBySource(page: Page, source: string) {
  const state = await readAppState(page);
  return state.decks?.filter((deck: { source: any; }) => deck.source === source).length ?? 0;
}

async function findPdfAnchoredCard(page: Page) {
  const state = await readAppState(page);
  return state.decks?.flatMap((deck: { cards: any; }) => deck.cards ?? []).find((card: { originalFront: any; canonicalQuestion: any; }) => String(card.originalFront ?? card.canonicalQuestion ?? "").includes("Mitochondrien erzeugen ATP")) ?? null;
}

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmen/ });
}

async function findOriginLeakBeforeReveal(page: Page) {
  return page.locator("body").evaluate((body: HTMLElement) => {
    const originTerms = /\b(?:Original(?:karte)?|Variante|Level|fsrs|Reifegrad)\b/i;
    const accessibleValues = [...body.querySelectorAll("*")].flatMap((element) => [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
    ]).filter(Boolean);
    return [body.innerText, ...accessibleValues].find((value) => originTerms.test(value ?? "")) ?? null;
  });
}

test("browser back returns from deck management to learning without reload", async ({ page }: any) => {
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

test("browser back exits study mode to the previous learning screen", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("[Vertrag: Tastaturfokus bei Navigation und Overlays] Fokus folgt Seiten- und Overlaywechseln", async ({ page }: any) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await resetToFreshLocalState(page);
  await expect(page.getByRole("heading", { name: "Willkommen bei CoRe" })).toBeFocused();

  const learnNavigation = mainMenu(page).getByRole("button", { name: "Lernen" });
  await learnNavigation.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeFocused();

  const createToggle = page.getByTestId("learn-deck-create-toggle");
  await createToggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("learn-deck-name-input")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(createToggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(createToggle).toBeFocused();

  const studyButton = page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ });
  await studyButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Frage", { exact: true })).toBeFocused();

  const settings = page.getByRole("button", { name: "Lerneinstellungen" });
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Neue Karten heute")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();

  await page.getByText("Frage", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Antwort", { exact: true })).toBeFocused();
  await page.keyboard.press("3");
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim().startsWith("Frage") || document.activeElement?.textContent?.includes("Sitzung abgeschlossen"))).toBe(true);
});

test("core actions stay usable in a 200 percent effective viewport", async ({ page }: any) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await resetToFreshLocalState(page);

  await expect(mainMenu(page).getByRole("button", { name: "Lernen" })).toBeVisible();
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).getByRole("button", { name: /lernen/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("browser back returns from settings to the previous screen", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("button", { name: "Export herunterladen" })).toBeVisible();
  for (const section of ["Account", "Lernen", "Daten und Sync", "Erweitert"]) {
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("Login-E-Mail")).not.toBeEditable();
  await expect(page.getByText("Eine Änderung der Login-E-Mail wird derzeit nicht in CoRe angeboten.")).toBeVisible();
  await expect(page.getByLabel("Lernstand teilen")).toHaveCount(0);
  await expect(page.getByLabel("Online-Status zeigen")).toHaveCount(0);
  await expect(page.getByLabel("Streaks für andere")).toHaveCount(0);
  await expect(page.getByText("Dein Lernstand, dein Online-Status und deine Streaks werden derzeit nicht mit anderen Nutzern geteilt.")).toBeVisible();
  await expect(page.getByLabel("Release-Information")).toHaveText(/^CoRe 0\.1\.0 · Test · Commit (?:lokal|[a-f0-9]{7})$/);

  await page.goBack();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`)).toBeVisible();
  await expect(page).toHaveURL(/\/lernen$/);
});

test("offline changes stay pending and flush when the browser reconnects", async ({ page, context }: any) => {
  await resetToFreshLocalState(page);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const displayName = page.getByLabel("Anzeigename");
  const originalDisplayName = await displayName.inputValue();
  const syncNow = page.getByRole("button", { name: "Jetzt synchronisieren" });

  try {
    await context.setOffline(true);
    await expect(page.getByText("Offline. Die Verbindung wird automatisch erneut geprüft.")).toBeVisible();
    await expect(syncNow).toBeEnabled();

    await displayName.fill(`${originalDisplayName} Offline`);
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.getByText("Offline. Eine Änderung bleibt vorgemerkt und wird automatisch synchronisiert.")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/Zuletzt synchronisiert:/)).toBeVisible();

    await displayName.fill(originalDisplayName);
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(/Zuletzt synchronisiert:/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("[Vertrag: Review über Offline, Reconnect und Reload] @golden-e2e ein offline beantwortetes Review wird genau einmal cloudbestätigt", async ({ page, context }: any) => {
  await resetToFreshLocalState(page);
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (login.error || !login.data.user) throw login.error ?? new Error("Golden-E2E-Account fehlt.");

  try {
    const before = await deckReviewEventCount(page, DECK_IDS.europe);
    await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
    await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
    await page.getByRole("button", { name: "Antwort anzeigen" }).click();

    await context.setOffline(true);
    await page.getByRole("button", { name: /Bewertung Gut/ }).click();
    await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBe(before + 1);
    const offlineState = await readAppState(page);
    const reviewEvent = offlineState.decks.find((deck: { id: string }) => deck.id === DECK_IDS.europe)?.reviewEvents?.at(-1);
    expect(reviewEvent?.id).toBeTruthy();

    await context.setOffline(false);
    await expect.poll(async () => {
      const result = await client.from("review_events").select("id").eq("id", reviewEvent.id).maybeSingle();
      if (result.error) throw result.error;
      return result.data?.id ?? null;
    }, { timeout: 15_000 }).toBe(reviewEvent.id);

    await page.reload();
    await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
    const reloadedState = await readAppState(page);
    const matchingEvents = reloadedState.decks
      .flatMap((deck: { reviewEvents?: { id: string }[] }) => deck.reviewEvents ?? [])
      .filter((event: { id: string }) => event.id === reviewEvent.id);
    expect(matchingEvents).toHaveLength(1);
  } finally {
    await context.setOffline(false);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
});

test("review flow records a rating through accessible controls", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const before = await deckReviewEventCount(page, DECK_IDS.europe);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  expect(await findOriginLeakBeforeReveal(page)).toBeNull();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByRole("button", { name: "Original anzeigen" })).toHaveCount(1);
  await page.getByRole("button", { name: "Original anzeigen" }).click();
  await expect(page.getByTestId("original-anchor")).toHaveCount(1);
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();

  await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("[Vertrag: Variante, Reveal, Originalanker und Feedback] @golden-e2e Variantenfeedback bleibt kontrolliert und reviewbar", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const variantEventsBefore = await variantReviewEventCount(page, DECK_IDS.africa);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Stapeloptionen für Afrika" }).click();
  await page.getByLabel("Neue Karten pro Tag als Zahl").fill("0");
  await page.getByLabel("Reviews pro Tag als Zahl").fill("1");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Stapel-Einstellungen gespeichert.");
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-select-${DECK_IDS.africa}`).click();
  await page.getByRole("button", { name: "Was ist die Hauptstadt von Côte d'Ivoire?" }).click();
  await page.getByTestId("card-labs-tools").getByText("Labs / Erweitert").click();
  const variantsBefore = (await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ"))?.variants?.length ?? 0;
  await page.getByLabel("Variantenfrage").fill("Welche Stadt ist der Regierungssitz von Côte d'Ivoire?");
  await page.getByLabel("Variantenantwort").fill("Yamoussoukro");
  await page.getByRole("button", { name: "Umformulierung hinzufügen" }).click();
  await expect.poll(async () => (await storedCard(page, DECK_IDS.africa, "card_world_capitals_civ"))?.variants?.length ?? 0).toBe(variantsBefore + 1);

  await page.getByTestId(`deck-row-${DECK_IDS.africa}`).getByRole("button", { name: "Varianten" }).click();
  expect(await findOriginLeakBeforeReveal(page)).toBeNull();
  await expect(page.getByRole("button", { name: "Original anzeigen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await expect(page.getByText("Welche Stadt ist der Regierungssitz von Côte d'Ivoire?", { exact: true })).toBeVisible();
  await expect(page.getByText("Yamoussoukro", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Original anzeigen" })).toHaveCount(1);
  await page.getByRole("button", { name: "Original anzeigen" }).click();
  await expect(page.getByTestId("original-anchor")).toHaveCount(1);
  await expect(page.getByTestId("original-anchor")).toContainText("Was ist die Hauptstadt von Côte d'Ivoire?");
  await page.getByRole("button", { name: "Unklar formuliert" }).click();
  await expect(page.getByRole("status")).toContainText("Der ausgewählte Grund wurde gespeichert.");
  const flaggedState = await readAppState(page);
  const flaggedVariant = flaggedState.decks
    .find((deck: { id: string }) => deck.id === DECK_IDS.africa)
    ?.cards.flatMap((card: { variants?: any[] }) => card.variants ?? [])
    .find((variant: { front: string }) => variant.front === "Welche Stadt ist der Regierungssitz von Côte d'Ivoire?");
  expect(flaggedVariant).toMatchObject({ qualityStatus: "flagged" });
  expect(flaggedVariant.feedback.at(-1)?.type).toBe("unklar_formuliert");
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();

  await expect.poll(() => variantReviewEventCount(page, DECK_IDS.africa)).toBe(variantEventsBefore + 1);
  await expect(page.getByRole("heading", { name: "Sitzung abgeschlossen" })).toBeVisible();
  await expect(page.getByText("1 Karte beantwortet.")).toBeVisible();
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  await expect(page.getByTestId(`learn-deck-row-${DECK_IDS.africa}`)).toBeVisible();
});

test("card version restore shows a comparison, requires confirmation and appends an audit entry", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-select-${DECK_IDS.africa}`).click();
  await page.getByRole("button", { name: "Was ist die Hauptstadt von Côte d'Ivoire?" }).click();

  const state = await readAppState(page);
  const originalCard = state.decks.find((deck: { id: string }) => deck.id === DECK_IDS.africa).cards.find((card: { originalFront: string }) => card.originalFront === "Was ist die Hauptstadt von Côte d'Ivoire?");
  const originalVersionCount = originalCard.versionLog.length;
  const resolvedCardId = originalCard.id;

  await page.getByLabel("Karten-Vorderseite").fill("Welche Stadt ist die Hauptstadt der Côte d'Ivoire?");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect.poll(async () => (await storedCard(page, DECK_IDS.africa, resolvedCardId))?.originalFront).toBe("Welche Stadt ist die Hauptstadt der Côte d'Ivoire?");

  const versionSelect = page.getByLabel("Version zum Wiederherstellen");
  const versionId = await versionSelect.locator("option").nth(1).getAttribute("value");
  await versionSelect.selectOption(versionId ?? "");
  await expect(page.getByTestId("version-restore-summary")).toContainText("Aktuell: Welche Stadt ist die Hauptstadt der Côte d'Ivoire?");
  await expect(page.getByTestId("version-restore-summary")).toContainText("Nach Restore: Was ist die Hauptstadt von Côte d'Ivoire?");
  await page.getByRole("button", { name: "Restore bestätigen" }).click();
  await expect(page.getByRole("group", { name: "Restore endgültig bestätigen" })).toBeVisible();
  await page.getByRole("button", { name: "Wiederherstellen", exact: true }).click();

  await expect.poll(async () => (await storedCard(page, DECK_IDS.africa, resolvedCardId))?.originalFront).toBe("Was ist die Hauptstadt von Côte d'Ivoire?");
  const restoredCard = await storedCard(page, DECK_IDS.africa, resolvedCardId);
  expect(restoredCard.versionLog).toHaveLength(originalVersionCount + 2);
  expect(restoredCard.versionLog.at(-1)?.changeType).toBe("version_restored");
});

test("ai draft creation stores an accepted draft deck", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const aiDecksBefore = await storedDeckCountBySource(page, "ai-assisted");

  await mainMenu(page).getByRole("button", { name: "Erstellen" }).click();
  await page.getByRole("button", { name: /Lokaler Entwurfsassistent/ }).click();
  await expect(page.getByLabel("Labs-Hinweis")).toContainText("kein externes Modell");
  await page.getByLabel("Quellentext für lokale Entwürfe").fill("ATP speichert Energie in der Zelle. Mitochondrien stellen ATP durch Zellatmung bereit.");
  await page.getByLabel("Fach").fill("Biologie");
  await page.getByRole("button", { name: "Entwürfe erstellen" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Entwurf|Entwürfe|Karten/ })).toBeVisible();
  await page.getByRole("button", { name: /Übernehmen/ }).click();
  await expect.poll(() => storedDeckCountBySource(page, "ai-assisted")).toBeGreaterThan(aiDecksBefore);
});

test("[Vertrag: manuell mit PDF bis Bearbeiten und Review] @golden-e2e Quellenanker und Kartenänderung bleiben im Review erhalten", async ({ page }: any) => {
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

  await textLayer.evaluate((layer: any) => {
    const textSpan = [...layer.querySelectorAll("span")].find((span) => span.textContent?.includes("Mitochondrien erzeugen ATP"));
    if (!textSpan) throw new Error("PDF-Testtext wurde nicht im Textlayer gefunden.");
    const range = document.createRange();
    range.selectNodeContents(textSpan);
    const selection = window.getSelection();
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
    selection.removeAllRanges();
// @ts-expect-error -- Das bestehende dynamische View-/Fixture-Modell wird an dieser lokalen Grenze bewusst eingeengt.
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
  const createdCard = await findPdfAnchoredCard(page);
  expect(createdCard.sourceAnchors[0].bbox).toEqual(expect.objectContaining({ left: expect.any(Number), right: expect.any(Number) }));

  const stateAfterCreation = await readAppState(page);
  const createdDeck = stateAfterCreation.decks.find((deck: { cards?: { id: string }[] }) => deck.cards?.some((card) => card.id === createdCard.id));
  expect(createdDeck?.id).toBeTruthy();
  await page.getByRole("button", { name: "Karten prüfen" }).click();
  await page.getByRole("button", { name: /Mitochondrien erzeugen ATP/ }).click();
  await page.getByLabel("Karten-Vorderseite").fill("Warum erzeugen Mitochondrien ATP?");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect.poll(async () => (await storedCard(page, createdDeck.id, createdCard.id))?.originalFront).toBe("Warum erzeugen Mitochondrien ATP?");

  const reviewsBefore = await deckReviewEventCount(page, createdDeck.id);
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${createdDeck.id}`).click();
  await expect(page.getByText("Warum erzeugen Mitochondrien ATP?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await expect.poll(() => deckReviewEventCount(page, createdDeck.id)).toBe(reviewsBefore + 1);
});

test("assistant smoke returns a server answer through the hidden dashboard entry", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await page.route("**/api/ai/chat", async (route: any) => {
    const headers = route.request().headers();
    expect(headers.authorization).toMatch(/^Bearer\s+\S+$/);
    expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i);
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      question: "Was ist die Hauptstadt von Algerien?",
      evidence: [],
      sourceBound: false,
    });
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
  await expect(page.getByRole("heading", { name: "Externe KI-Nutzung bestätigen" })).toBeVisible();
  await page.getByLabel(/Ich bin mindestens 18 Jahre alt/).check();
  await page.getByRole("button", { name: "KI-Nutzung bestätigen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "KI-Nutzung bestätigt." })).toBeVisible();
  await page.getByLabel("Frage an deine Karten").fill("Was ist die Hauptstadt von Algerien?");
  await expect(page.getByLabel("Nur mit Kartenquellen antworten")).not.toBeChecked();
  await page.getByRole("button", { name: "Antwort erstellen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "KI-Antwort erstellt." })).toBeVisible();
  await expect(page.getByText("Gemma: Algier ist die Hauptstadt von Algerien.")).toBeVisible();
});

test("local portability export and import expose status and validation errors", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByText("Medienbytes", { exact: true })).toBeVisible();
  await expect(page.getByText("Authdaten", { exact: true })).toBeVisible();
  await expect(page.getByText("Community- oder Serverrechte", { exact: true })).toBeVisible();
  await expect(page.getByText("vollständiges DSGVO-Auskunftspaket nach Art. 15", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export herunterladen" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("core-portable-export.json");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exportJson = await readFile(downloadPath!, "utf8");
  await expect(page.getByRole("status").filter({ hasText: "core-portable-export.json" })).toBeVisible();
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

test("settings resolve and persist an account-bound sync conflict", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const conflictId = "e2e-settings-conflict";
  const login = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (login.error || !login.data.user) throw login.error ?? new Error("E2E-Nutzer fehlt.");

  try {
    await client.from("sync_conflicts").delete().eq("id", conflictId);
    const { data: remoteDeck, error: deckError } = await client.from("decks").select("*").eq("id", DECK_IDS.root).single();
    if (deckError) throw deckError;
    const localValue = { ...remoteDeck, name: "Lokaler E2E-Stapel" };
    const remoteValue = { ...remoteDeck };
    delete localValue.user_id;
    delete remoteValue.user_id;
    const { error: insertError } = await client.from("sync_conflicts").insert({
      id: conflictId,
      user_id: login.data.user.id,
      entity_table: "decks",
      entity_id: remoteDeck.id,
      base_revision: remoteDeck.revision,
      local_revision: remoteDeck.revision,
      remote_revision: remoteDeck.revision,
      local_value: localValue,
      remote_value: remoteValue,
      status: "open",
      resolution: {},
      updated_by_device_id: "e2e-conflict-device",
      created_at: "2026-07-12T12:00:00.000Z",
    });
    if (insertError) throw insertError;

    await page.reload();
    await expect(page.getByRole("navigation", { name: /Hauptmen/ })).toBeVisible();
    await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
    const panel = page.getByTestId("sync-conflict-panel");
    await expect(panel.getByRole("heading", { name: "Lokaler E2E-Stapel" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Andere Fassung behalten" })).toBeVisible();

    await panel.getByRole("button", { name: "Später entscheiden" }).click();
    await expect(panel.getByText("Für später zurückgestellt (1)")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
    await page.getByText("Für später zurückgestellt (1)").click();
    await page.getByRole("button", { name: "Wieder aufnehmen" }).click();
    await expect(panel.getByRole("button", { name: "Andere Fassung behalten" })).toBeVisible();
    await panel.getByRole("button", { name: "Andere Fassung behalten" }).click();
    await expect(panel.getByText("Keine offenen Synchronisierungskonflikte.")).toBeVisible();

    const { data: persisted, error: readError } = await client.from("sync_conflicts").select("status, resolution").eq("id", conflictId).single();
    if (readError) throw readError;
    expect(persisted).toMatchObject({ status: "resolved", resolution: { action: "keep-remote" } });
  } finally {
    await client.from("sync_conflicts").delete().eq("id", conflictId);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    client.auth.dispose?.();
  }
});
