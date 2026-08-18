import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { replaceAccountCloudState } from "../../src/cloudRepository.ts";
import { createCoreCard, createCoreDeck, updateLearningItemStudyState } from "../../src/coreModel.ts";
import { createCoreRepository, normalizeContentEntities } from "../../src/coreRepository.ts";
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

interface DeckScrollProbe {
  maxHeaderShift: number;
  maxScrollShift: number;
  preservedCardRemoved: boolean;
  observer: MutationObserver;
}

type DeckScrollProbeWindow = typeof window & { __coreDeckScrollProbe?: DeckScrollProbe };

function card(id: string, deckId: string, front: string, back: string, options: { dueAt?: string; hasActiveVariant?: boolean; marked?: boolean } = {}) {
  const learningItem = createCoreCard({
    id,
    deckId,
    source: "manual",
    originalFront: `<p>${front}</p>`,
    originalBack: `<p>${back}</p>`,
    reviewState: options.dueAt ? { state: "review", dueAt: options.dueAt, repetitions: 1 } : null,
    variants: options.hasActiveVariant ? [{
      id: `${id}-variant`,
      sourceCardId: id,
      front: `${front} Variante`,
      back,
      qualityStatus: "active",
    }] : [],
  });
  return options.marked ? updateLearningItemStudyState(learningItem, { marked: true }) : learningItem;
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
        card(CARD_IDS.b1, DECK_IDS.childB, "Karte B1", "Antwort B1", { dueAt: "2026-08-23T12:00:00.000Z", marked: true }),
        card(CARD_IDS.b2, DECK_IDS.childB, "Karte B2", "Antwort B2", { hasActiveVariant: true }),
      ],
    }),
  ];
}

async function seedAccount(decks: Deck[] = seedDecks()) {
  const environment = loadE2EEnvironment();
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw error ?? new Error("Der Navigations-E2E-Account fehlt.");
  try {
    const state = createCoreRepository({ seedDefaultDecks: false }).getState();
    const content = normalizeContentEntities(decks, [], []);
    await replaceAccountCloudState(client, {
      ...state,
      decks: content.decks,
      noteTypeDefinitions: content.definitions,
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
  const returnCard = new URL(page.url()).searchParams.get("card");
  const query = new URLSearchParams({ deck: deckId, returnView: "decks" });
  if (returnCard) query.set("returnCard", returnCard);
  await page.goto(`/stapel-einstellungen?${query}`);
  await waitForApp(page);
  await page.getByRole("region", { name: "Stapel" }).getByRole("button", { name: variants ? "Varianten lernen" : "Lernen", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/decks/${deckId}/review\\?`));
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
}

async function expectStableDeckToggle(page: Page, deckId: string, preservedCardId: string, expanded: boolean) {
  const toggle = page.getByTestId(`deck-toggle-${deckId}`);
  await toggle.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(page.getByTestId(`deck-card-${preservedCardId}`)).toBeVisible();
  await page.evaluate(({ deckId: targetDeckId, preservedCardId: stableCardId }) => {
    const runtimeWindow = window as DeckScrollProbeWindow;
    const header = document.querySelector<HTMLElement>(`[data-testid="deck-header-${targetDeckId}"]`);
    const region = document.querySelector<HTMLElement>('section[aria-label="Seiteninhalt"]');
    if (!header || !region) throw new Error("Scrollprobe konnte nicht vorbereitet werden.");
    const readScrollOffset = () => window.innerWidth >= 1280 ? region.scrollTop : window.scrollY;
    const baselineHeaderTop = header.getBoundingClientRect().top;
    const baselineScrollOffset = readScrollOffset();
    const probe = {
      maxHeaderShift: 0,
      maxScrollShift: 0,
      preservedCardRemoved: false,
      observer: null as unknown as MutationObserver,
    };
    const sample = () => {
      probe.maxHeaderShift = Math.max(probe.maxHeaderShift, Math.abs(header.getBoundingClientRect().top - baselineHeaderTop));
      probe.maxScrollShift = Math.max(probe.maxScrollShift, Math.abs(readScrollOffset() - baselineScrollOffset));
      if (!document.querySelector(`[data-testid="deck-card-${stableCardId}"]`)) probe.preservedCardRemoved = true;
    };
    probe.observer = new MutationObserver(sample);
    probe.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    runtimeWindow.__coreDeckScrollProbe = probe;
  }, { deckId, preservedCardId });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
  await page.waitForTimeout(250);
  const probe = await page.evaluate(() => {
    const runtimeWindow = window as DeckScrollProbeWindow;
    const current = runtimeWindow.__coreDeckScrollProbe;
    if (!current) throw new Error("Scrollprobe fehlt.");
    current.observer.disconnect();
    delete runtimeWindow.__coreDeckScrollProbe;
    return {
      maxHeaderShift: current.maxHeaderShift,
      maxScrollShift: current.maxScrollShift,
      preservedCardRemoved: current.preservedCardRemoved,
    };
  });

  expect(probe.preservedCardRemoved).toBe(false);
  expect(probe.maxHeaderShift).toBeLessThanOrEqual(1);
  expect(probe.maxScrollShift).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await seedAccount();
  await resetToFreshLocalState(page, { resetCloud: false });
});

test("[Vertrag: Kartenverwaltung] große Stapel bleiben beim Auf- und Zuklappen scrollstabil", async ({ page }) => {
  const scrollDeckAId = "navigation-scroll-a";
  const scrollDeckBId = "navigation-scroll-b";
  const scrollDeckACardIds = Array.from({ length: 24 }, (_, index) => `navigation-scroll-a-${index}`);
  const scrollDeckBCardIds = Array.from({ length: 24 }, (_, index) => `navigation-scroll-b-${index}`);
  const createScrollDeck = (id: string, name: string, cardIds: string[]) => createCoreDeck({
    id,
    name,
    hierarchyPath: [name],
    source: "manual",
    cards: cardIds.map((cardId, index) => card(cardId, id, `${name} Karte ${index + 1}`, `${name} Antwort ${index + 1}`)),
  });

  await seedAccount([
    ...seedDecks(),
    createScrollDeck(scrollDeckAId, "Scroll A", scrollDeckACardIds),
    createScrollDeck(scrollDeckBId, "Scroll B", scrollDeckBCardIds),
  ]);
  await resetToFreshLocalState(page, { resetCloud: false });
  await page.goto("/kartenstapel");
  await waitForApp(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const deckId of [scrollDeckAId, scrollDeckBId]) {
      const toggle = page.getByTestId(`deck-toggle-${deckId}`);
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    }
    await expect(page.getByTestId(`deck-card-${scrollDeckACardIds[0]}`)).toBeVisible();
    await expect(page.getByTestId(`deck-card-${scrollDeckBCardIds[0]}`)).toBeVisible();

    await expectStableDeckToggle(page, scrollDeckAId, scrollDeckBCardIds[0], false);
    await expect(page.getByTestId(`deck-card-${scrollDeckACardIds[0]}`)).toHaveCount(0);
    await expectStableDeckToggle(page, scrollDeckAId, scrollDeckBCardIds[0], true);
    await expect(page.getByTestId(`deck-card-${scrollDeckACardIds[0]}`)).toBeVisible();
  }

  await page.goto(`/kartenstapel?deck=${scrollDeckAId}`);
  await waitForApp(page);
  await expect(page.getByTestId(`deck-card-${scrollDeckACardIds[0]}`)).toBeVisible();
  await expectStableDeckToggle(page, scrollDeckAId, scrollDeckBCardIds[0], false);
  await expect(page.getByTestId(`deck-toggle-${scrollDeckAId}`)).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId(`deck-toggle-${scrollDeckBId}`).click();
  await expect(page.getByTestId(`deck-toggle-${scrollDeckBId}`)).toHaveAttribute("aria-expanded", "false");

  await page.goto(`/kartenstapel?deck=${scrollDeckBId}`);
  await waitForApp(page);
  await expect(page.getByTestId(`deck-toggle-${scrollDeckBId}`)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId(`deck-card-${scrollDeckBCardIds[0]}`)).toBeVisible();
});

test("[Vertrag: Kartenverwaltung] Karten- und Stapelzeilen bleiben auch in schmalen Viewports kompakt", async ({ page }) => {
  await page.goto("/kartenstapel");
  await waitForApp(page);

  await page.getByTestId(`deck-header-${DECK_IDS.childB}`).click();
  const cardButton = page.getByTestId(`deck-card-${CARD_IDS.b1}`);
  await expect(cardButton).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 844 },
    { width: 768, height: 844 },
    { width: 767, height: 844 },
    { width: 484, height: 844 },
    { width: 420, height: 844 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);

    const geometry = await page.evaluate(({ cardId, deckId }) => {
      const cardSortField = document.querySelector<HTMLElement>(`[data-testid="deck-card-${cardId}"]`);
      const cardRow = cardSortField?.closest<HTMLElement>("tr");
      const deckHeader = document.querySelector<HTMLElement>(`[data-testid="deck-header-${deckId}"]`);
      const tableScroll = document.querySelector<HTMLElement>('[data-testid="card-library-table"]')?.parentElement;
      const table = document.querySelector<HTMLElement>('[data-testid="card-library-table"]');
      const tableHeader = table?.querySelector<HTMLElement>("thead tr");
      const headers = [...document.querySelectorAll<HTMLElement>('[data-testid="card-library-table"] thead th')];
      const headerRects = headers.map((header) => header.getBoundingClientRect());
      const headerLabels = headers.map((header) => header.querySelector<HTMLElement>("span"));
      const cardRows = [...document.querySelectorAll<HTMLElement>('[data-card-row="true"]')];
      const dueCells = cardRows.map((row) => row.querySelectorAll<HTMLElement>("td")[1]);
      const variantCells = cardRows.map((row) => row.querySelectorAll<HTMLElement>("td")[2]);
      const variantLayouts = variantCells.map((cell) => cell?.firstElementChild as HTMLElement | null);
      const variantTags = variantLayouts.map((layout) => layout?.firstElementChild as HTMLElement | null);
      const markSlots = variantLayouts.map((layout) => layout?.lastElementChild as HTMLElement | null);
      const variantTagRightEdges = variantTags.map((tag) => tag?.getBoundingClientRect().right ?? Number.NaN);
      const sortFieldStyle = cardSortField ? window.getComputedStyle(cardSortField) : null;
      const fitsWithin = (element: HTMLElement | null | undefined, container = element) => {
        if (!element || !container) return false;
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth + 1
          && elementRect.left >= containerRect.left - 1
          && elementRect.right <= containerRect.right + 1;
      };

      return {
        cardRowHeight: cardRow?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
        tableHeaderHeight: tableHeader?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
        deckHeaderHeight: deckHeader?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
        documentFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
        tableScrollsHorizontally: Boolean(tableScroll && tableScroll.scrollWidth > tableScroll.clientWidth),
        tableFitsContainer: Boolean(table && tableScroll && table.scrollWidth <= tableScroll.clientWidth + 1),
        headersDoNotOverlap: headerRects.every((rect, index) => index === 0 || rect.left >= headerRects[index - 1].right - 1),
        headerLabels: headerLabels.map((label) => label?.textContent?.trim()),
        headerLabelsFit: headerLabels.every((label, index) => fitsWithin(label, headers[index]))
          && headers.every((header) => header.scrollWidth <= header.clientWidth + 1),
        dueLabels: dueCells.map((cell) => cell?.textContent?.trim()),
        dueLabelsFit: dueCells.every((cell) => fitsWithin(cell)),
        variantLabels: variantTags.map((tag) => tag?.textContent?.trim()),
        variantTagsFit: variantTags.every((tag, index) => fitsWithin(tag, variantCells[index])),
        variantTagsAligned: variantTagRightEdges.every((right) => Math.abs(right - variantTagRightEdges[0]) <= 1),
        markSlotWidths: markSlots.map((slot) => slot?.getBoundingClientRect().width ?? 0),
        dueAlignment: headers[1] ? window.getComputedStyle(headers[1]).textAlign : null,
        variantsAlignment: headers[2] ? window.getComputedStyle(headers[2]).textAlign : null,
        sortFieldOverflow: sortFieldStyle?.textOverflow,
        sortFieldWhiteSpace: sortFieldStyle?.whiteSpace,
      };
    }, { cardId: CARD_IDS.b1, deckId: DECK_IDS.childB });

    expect(geometry.cardRowHeight).toBeLessThanOrEqual(30);
    expect(geometry.tableHeaderHeight).toBeLessThanOrEqual(30);
    expect(geometry.deckHeaderHeight).toBeLessThanOrEqual(48);
    expect(geometry.documentFitsViewport).toBe(true);
    expect(geometry.sortFieldOverflow).toBe("ellipsis");
    expect(geometry.sortFieldWhiteSpace).toBe("nowrap");
    expect(geometry.headerLabels).toEqual(["Sortierfeld", "Datum", "Variante"]);
    expect(geometry.headerLabelsFit).toBe(true);
    expect(geometry.dueLabels).toEqual(["23.08.2026", "Neu"]);
    expect(geometry.dueLabelsFit).toBe(true);
    expect(geometry.variantLabels).toEqual(["Nein", "Ja"]);
    expect(geometry.variantTagsFit).toBe(true);
    expect(geometry.variantTagsAligned).toBe(true);
    expect(geometry.markSlotWidths).toEqual([18, 18]);
    expect(geometry.dueAlignment).toBe("right");
    expect(geometry.variantsAlignment).toBe("right");
    expect(geometry.headersDoNotOverlap).toBe(true);
    expect(geometry.tableFitsContainer).toBe(true);
    expect(geometry.tableScrollsHorizontally).toBe(false);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDeckToggle = page.getByTestId(`deck-toggle-${DECK_IDS.childB}`);
  await mobileDeckToggle.click();
  await expect(mobileDeckToggle).toHaveAttribute("aria-expanded", "false");
  await expect(cardButton).toHaveCount(0);
  await mobileDeckToggle.click();
  await expect(mobileDeckToggle).toHaveAttribute("aria-expanded", "true");
  await expect(cardButton).toBeVisible();
});

test("[Vertrag: Kartenverwaltung] Stapel, Sortierung und ungespeicherte Änderungen bleiben kontrollierbar", async ({ page }) => {
  await page.goto("/kartenstapel");
  await waitForApp(page);
  await expect(page.getByRole("heading", { name: "Karten", exact: true })).toBeVisible();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);

  const search = page.getByRole("textbox", { name: "Karten durchsuchen" });
  await search.focus();
  await expect(search).toBeFocused();
  await search.fill("Karte B1");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
  await search.fill("");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);

  const dueHeader = page.getByRole("columnheader", { name: /Datum/ });
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
  await page.keyboard.press("Escape");
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(front).toContainText("Ungespeicherte Karte B1");

  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await changesDialog.getByRole("button", { name: "Speichern" }).click();
  await expect(changesDialog).toBeHidden();
  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b2}`);
  await expect(page.getByRole("textbox", { name: "Karten-Vorderseite" })).toContainText("Karte B2");
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state?.decks?.find((deck: Deck) => deck.id === DECK_IDS.childB)?.cards
      ?.find((candidate: { id: string }) => candidate.id === CARD_IDS.b1)?.originalFront;
  }).toContain("Ungespeicherte Karte B1");

  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
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
  await page.getByTestId("card-detail-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByTestId("card-detail-aside")).toBeVisible();
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await changesDialog.getByRole("button", { name: "Verwerfen" }).click();
  await learnNavigation.click();
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeVisible();
});

test("[Vertrag: URL-Kontext] @beta-core Reload, Direktlink und Review-Rückweg erhalten Stapel und Karte", async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto(`/lernen?deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  const linkedDeckRow = page.getByTestId(`learn-deck-row-${DECK_IDS.childB}`);
  await expect(linkedDeckRow).toBeVisible();
  await expect(linkedDeckRow).not.toHaveAttribute("data-selected");
  await page.reload();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);
  await expect(linkedDeckRow).toBeVisible();
  await expect(linkedDeckRow).not.toHaveAttribute("data-selected");

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
  await expect(page.getByRole("heading", { name: "Karte selbst erstellen" })).toBeVisible();
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

  await page.goto("about:blank");
  await seedAccount();
  await resetToFreshLocalState(page, { resetCloud: false });
  await page.goto(`/lernen?deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);
  await page.getByRole("button", { name: "Bereich B / Gemeinsam lernen" }).press("Enter");
  await expect(page).toHaveURL(new RegExp(
    `/decks/${DECK_IDS.childB}/review\\?returnView=learn&returnDeck=${DECK_IDS.childB}$`,
  ));
  await page.reload();
  await page.getByRole("button", { name: "Lernmodus verlassen" }).click();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);
});

test("[Vertrag: Review-Karteneditor] Bearbeiten und Schließen kehren reload-fähig zur Sitzung zurück", async ({ page }) => {
  await page.goto(`/lernen?deck=${DECK_IDS.childA}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Bereich A / Gemeinsam lernen" }).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();

  await page.getByRole("button", { name: "Lerneinstellungen" }).click();
  await page.getByRole("dialog", { name: "Lerneinstellungen" }).getByRole("button", { name: "Karte bearbeiten" }).click();
  await expect(page).toHaveURL(new RegExp(
    `/kartenstapel\\?deck=${DECK_IDS.childA}&card=${CARD_IDS.a}&reviewReturn=`,
  ));
  await page.reload();

  const front = page.getByRole("textbox", { name: "Karten-Vorderseite" });
  await expect(front).toContainText("Karte A");
  await front.fill("Karte A bearbeitet");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();

  await expect(page).toHaveURL(new RegExp(
    `/decks/${DECK_IDS.childA}/review\\?returnView=learn&returnDeck=${DECK_IDS.childA}$`,
  ));
  await expect(page.frameLocator('iframe[title="Frage"]').getByText("Karte A bearbeitet", { exact: true })).toBeVisible();

  const invalidReturn = encodeURIComponent(`/lernen?deck=${DECK_IDS.childA}`);
  await page.goto(`/kartenstapel?deck=${DECK_IDS.childA}&card=${CARD_IDS.a}&reviewReturn=${invalidReturn}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childA}`);
});

test("[Vertrag: Review-Stapeleinstellungen] Sitzungsstapel und Rückweg bleiben reload-fähig", async ({ page }) => {
  await page.goto(`/lernen?deck=${DECK_IDS.rootA}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Bereich A lernen" }).click();
  await expect(page.frameLocator('iframe[title="Frage"]').getByText("Karte A", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Lerneinstellungen" }).click();
  await page.getByRole("dialog", { name: "Lerneinstellungen" }).getByRole("button", { name: "Stapel bearbeiten" }).click();
  await expect(page).toHaveURL(new RegExp(
    `/stapel-einstellungen\\?deck=${DECK_IDS.rootA}&returnView=review&reviewReturn=`,
  ));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bereich A" })).toBeVisible();
  await page.getByRole("button", { name: "Zurück zur Sitzung" }).click();

  await expect(page).toHaveURL(new RegExp(
    `/decks/${DECK_IDS.rootA}/review\\?returnView=learn&returnDeck=${DECK_IDS.rootA}$`,
  ));
  await expect(page.frameLocator('iframe[title="Frage"]').getByText("Karte A", { exact: true })).toBeVisible();

  const invalidReturn = encodeURIComponent(`/lernen?deck=${DECK_IDS.rootA}`);
  await page.goto(`/stapel-einstellungen?deck=${DECK_IDS.rootA}&returnView=review&reviewReturn=${invalidReturn}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Zurück zu Lernen" }).click();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.rootA}`);
});

test("[Vertrag: Browser-History und sichere Fallbacks] @beta-core Zurück, Vorwärts und ungültige IDs bleiben deterministisch", async ({ page }) => {
  await page.goto(`/lernen?deck=${DECK_IDS.childB}`);
  await waitForApp(page);
  await page.getByRole("button", { name: "Karten verwalten" }).click();
  const deckUrl = `/kartenstapel?deck=${DECK_IDS.childB}`;
  const firstCardUrl = `${deckUrl}&card=${CARD_IDS.b1}`;
  const secondCardUrl = `${deckUrl}&card=${CARD_IDS.b2}`;
  await page.getByTestId(`deck-card-${CARD_IDS.b1}`).click();
  await page.goto(secondCardUrl);
  await waitForApp(page);
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
