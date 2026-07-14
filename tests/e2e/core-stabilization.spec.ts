import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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

async function hasVariantReviewEvent(page: Page, deckId: string) {
  const state = await readAppState(page);
  return Boolean(state.decks?.find((deck: { id: any; }) => deck.id === deckId)?.reviewEvents?.some((event: { reviewableType: string; }) => event.reviewableType === "variant"));
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

test("browser back returns from settings to the previous screen", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(page.getByRole("button", { name: "Export vorbereiten" })).toBeVisible();
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

test("review flow records a rating through accessible controls", async ({ page }: any) => {
  await resetToFreshLocalState(page);
  const before = await deckReviewEventCount(page, DECK_IDS.europe);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByTestId(`learn-deck-row-${DECK_IDS.europe}`).click();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Good/ }).click();

  await expect.poll(() => deckReviewEventCount(page, DECK_IDS.europe)).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
});

test("variant review flow can be prepared from the deck editor", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await page.getByRole("button", { name: "Kartenstapel" }).click();
  await page.getByTestId(`deck-select-${DECK_IDS.africa}`).click();
  await page.getByRole("button", { name: "Was ist die Hauptstadt von Côte d'Ivoire?" }).click();
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

test("ai draft creation stores an accepted draft deck", async ({ page }: any) => {
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

test("lazy creation screen renders a selectable PDF and stores its source anchor", async ({ page }: any) => {
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
  const storedCard = await findPdfAnchoredCard(page);
  expect(storedCard.sourceAnchors[0].bbox).toEqual(expect.objectContaining({ left: expect.any(Number), right: expect.any(Number) }));
});

test("assistant smoke returns a server answer through the hidden dashboard entry", async ({ page }: any) => {
  await resetToFreshLocalState(page);

  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await page.route("**/api/ai/chat", async (route: any) => {
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

test("local portability export and import expose status and validation errors", async ({ page }: any) => {
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
    await expect(panel.getByRole("button", { name: "Remote-Version behalten" })).toBeVisible();

    await panel.getByRole("button", { name: "Später entscheiden" }).click();
    await expect(panel.getByText("Für später zurückgestellt (1)")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
    await page.getByText("Für später zurückgestellt (1)").click();
    await page.getByRole("button", { name: "Wieder aufnehmen" }).click();
    await expect(panel.getByRole("button", { name: "Remote-Version behalten" })).toBeVisible();
    await panel.getByRole("button", { name: "Remote-Version behalten" }).click();
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
