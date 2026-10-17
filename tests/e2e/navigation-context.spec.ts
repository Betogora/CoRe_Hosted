import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { addCardVariant, cardStudyFromReviewState, createBasicNote, createCoreDeck, createReviewState, setNoteMarked } from "../../src/coreModel.ts";
import { createCoreRepository } from "../../src/coreRepository.ts";
import type { Deck, Note } from "../../src/coreTypes.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { e2eAuthStatePath, loadE2EEnvironment } from "./support/e2eEnvironment.ts";
import { seedAccountState } from "../support/seedAccountState.ts";

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
type CardDetailObserverWindow = typeof window & {
  __coreCardDetailRemoved?: boolean;
  __coreCardDetailObserver?: MutationObserver;
};

const SEEDED_NOTES = new Map<string, Note>();

function card(id: string, deckId: string, front: string, back: string, options: { dueAt?: string; hasActiveVariant?: boolean; marked?: boolean } = {}) {
  const { note, cards: [created] } = createBasicNote(deckId, `<p>${front}</p>`, `<p>${back}</p>`);
  SEEDED_NOTES.set(note.id, options.marked ? setNoteMarked(note, true) : note);
  const seeded = {
    ...created,
    id,
    study: options.dueAt ? cardStudyFromReviewState(createReviewState({ state: "review", dueAt: options.dueAt, reps: 1 })) : created.study,
  };
  return options.hasActiveVariant
    ? addCardVariant(seeded, { id: `${id}-variant`, front: `${front} Variante`, back, qualityStatus: "active" })
    : seeded;
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

async function seedAccount(decks: Deck[] = seedDecks(), account?: { email: string; password: string }) {
  const environment = { ...loadE2EEnvironment(), ...account };
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: environment.email, password: environment.password });
  if (error || !data.user) throw error ?? new Error("Der Navigations-E2E-Account fehlt.");
  try {
    const state = createCoreRepository().getState();
    const noteIds = new Set(decks.flatMap((deck) => deck.cards.map((seededCard) => seededCard.noteId)));
    await seedAccountState(client, {
      ...state,
      decks,
      notes: [...SEEDED_NOTES.values()].filter((note) => noteIds.has(note.id)),
      profile: { ...state.profile, email: environment.email, displayName: "CoRe E2E", onboardingComplete: true },
    }, "e2e-navigation-context-reset");
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

async function startDeckFromCards(page: Page, deckId: string) {
  const returnCard = new URL(page.url()).searchParams.get("card");
  const query = new URLSearchParams({ returnView: "decks", returnDeck: deckId });
  if (returnCard) query.set("returnCard", returnCard);
  await page.goto(`/decks/${encodeURIComponent(deckId)}/review?${query}`);
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

test("[Vertrag: Stapelinhalte] Flächeneinstieg, Vorschautabs und gemeinsamer Editor behalten den Stapel", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/lernen");
  await waitForApp(page);
  const row = page.getByTestId(`learn-deck-row-${DECK_IDS.childB}`);
  await row.getByRole("button", { name: "Inhalte von Bereich B / Gemeinsam öffnen", exact: true }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}&content=1`);
  await expect(page.getByRole("navigation", { name: "Stapelpfad" })).toContainText("Gemeinsam");
  await expect(page.getByTestId("deck-content-substacks")).toBeVisible();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);
  const tabs = page.getByRole("group", { name: "Stapelinhalte", exact: true });
  for (const width of [320, 390, 430, 640, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ["Zusammenfassungen", "Quiz", "Mind Map", "Quelle", "Unterstapel", "Karten"]) {
      const tab = tabs.getByRole("button", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-pressed", "true");
      if (label === "Karten") {
        await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
        await expect(page.getByTestId(`deck-card-${CARD_IDS.a}`)).toHaveCount(0);
        await expect(page.getByTestId(`deck-header-${DECK_IDS.childB}`)).toHaveCount(0);
      } else if (label === "Unterstapel") {
        await expect(page.getByTestId("deck-content-substacks")).toBeVisible();
      } else if (label === "Zusammenfassungen" || label === "Mind Map") {
        await expect(page.getByTestId(label === "Mind Map" ? "deck-mindmaps-panel" : "deck-summaries-panel")).toBeVisible();
        await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);
      } else {
        await expect(page.getByRole("region", { name: label, exact: true })).toContainText("Demnächst verfügbar");
        await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);
      }
    }
    await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}&content=1&tab=cards`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("textbox", { name: "Karten durchsuchen", exact: true }).fill("Antwort B1");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b2}`)).toHaveCount(0);
  await page.getByTestId(`deck-card-${CARD_IDS.b1}`).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b1}&content=1&tab=cards`);
  await page.reload();
  await page.getByRole("textbox", { name: "Feld Vorderseite", exact: true }).fill("Geändert im Stapel");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Karte wurde erfolgreich gespeichert.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Detailansicht schließen", exact: true }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}&content=1&tab=cards`);
  await page.goto(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b1}`);
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite", exact: true })).toContainText("Geändert im Stapel");
  await page.getByRole("textbox", { name: "Feld Rückseite", exact: true }).fill("Geändert in Gesamtverwaltung");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Karte wurde erfolgreich gespeichert.", { exact: true })).toBeVisible();
  await page.goto(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b1}&content=1`);
  await expect(page.getByRole("textbox", { name: "Feld Rückseite", exact: true })).toContainText("Geändert in Gesamtverwaltung");
  await page.goto("/lernen");
  await row.getByRole("button", { name: "Bereich B / Gemeinsam lernen", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/decks/${DECK_IDS.childB}/review`));
});

test("[Vertrag: Stapelinhalte] Elternstapel zeigt Unterkarten und erhält den Inhaltskontext beim Bearbeiten", async ({ page }) => {
  await page.goto(`/kartenstapel?deck=${DECK_IDS.rootB}&content=1&tab=cards`);
  await waitForApp(page);
  await expect(page.getByTestId(`deck-header-${DECK_IDS.rootB}`)).toBeVisible();
  await expect(page.getByTestId(`deck-header-${DECK_IDS.childB}`)).toBeVisible();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b2}`)).toBeVisible();
  await expect(page.getByTestId(`deck-header-${DECK_IDS.rootA}`)).toHaveCount(0);
  await expect(page.getByTestId(`deck-card-${CARD_IDS.a}`)).toHaveCount(0);
  const toggle = page.getByTestId(`deck-toggle-${DECK_IDS.childB}`);
  await toggle.click();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toHaveCount(0);
  await toggle.click();
  await page.getByRole("textbox", { name: "Karten durchsuchen", exact: true }).fill("Antwort B1");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toBeVisible();
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b2}`)).toHaveCount(0);
  await page.getByTestId(`deck-card-${CARD_IDS.b1}`).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.rootB}&card=${CARD_IDS.b1}&content=1&tab=cards`);
  await page.reload();
  await page.getByRole("textbox", { name: "Feld Vorderseite", exact: true }).fill("Unterkarte im Hauptstapel geändert");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Karte wurde erfolgreich gespeichert.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Detailansicht schließen", exact: true }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.rootB}&content=1&tab=cards`);
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b1}`)).toContainText("Unterkarte im Hauptstapel geändert");
  await page.goto(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b1}`);
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite", exact: true })).toContainText("Unterkarte im Hauptstapel geändert");
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
  await expect(page.getByTestId(`deck-toggle-${scrollDeckAId}`)).toHaveAttribute("aria-expanded", "true");
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
        headerAccessibleNames: headers.map((header) => header.querySelector("button")?.getAttribute("aria-label")),
        headersFit: headers.every((header) => header.scrollWidth <= header.clientWidth + 1),
        dueLabels: dueCells.map((cell) => cell?.textContent?.trim()),
        dueLabelsFit: dueCells.every((cell) => fitsWithin(cell)),
        variantLabels: variantTags.map((tag) => tag?.getAttribute("aria-label")),
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
    expect(geometry.headerAccessibleNames).toEqual(["Sortierfeld aufsteigend sortieren", "Datum aufsteigend sortieren", "Variante aufsteigend sortieren"]);
    expect(geometry.headersFit).toBe(true);
    expect(geometry.dueLabels).toEqual(["23.08.2026", "Neu"]);
    expect(geometry.dueLabelsFit).toBe(true);
    expect(geometry.variantLabels).toEqual(["Keine Variante", "1 aktive Variante"]);
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
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kartenverwaltung", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  const front = page.getByRole("textbox", { name: "Feld Vorderseite" });
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
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");
  await expect.poll(async () => {
    const state = await readActiveAccountState(page);
    return state?.decks?.find((deck: Deck) => deck.id === DECK_IDS.childB)?.cards
      ?.find((candidate: { id: string }) => candidate.id === CARD_IDS.b1)?.note?.content.fields.find((field: { id: string }) => field.id === "front")?.html;
  }).toContain("Ungespeicherte Karte B1");

  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);

  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await page.getByRole("textbox", { name: "Feld Vorderseite" }).fill("Diese Änderung wird verworfen");
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await changesDialog.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
  const finalState = await readActiveAccountState(page);
  expect(finalState.decks.find((deck: Deck) => deck.id === DECK_IDS.childB)?.cards
    .find((candidate: { id: string }) => candidate.id === CARD_IDS.b2)?.note?.content.fields.find((field: { id: string }) => field.id === "front")?.html).toContain("Karte B2");

  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  await page.getByRole("textbox", { name: "Feld Vorderseite" }).fill("Navigation bleibt geschützt");
  const overviewSegment = page.getByRole("button", { name: "Stapelübersicht", exact: true });
  await page.getByTestId("card-detail-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page.getByTestId("card-detail-aside")).toBeVisible();
  await page.getByRole("button", { name: "Detailansicht schließen" }).click();
  await expect(changesDialog).toBeVisible();
  await changesDialog.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page.getByTestId("card-detail-aside")).toHaveCount(0);
  await overviewSegment.click();
  await expect(page).toHaveURL(`/lernen?deck=${DECK_IDS.childB}`);
  await expect(page.getByRole("heading", { name: "Lernen", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stapelübersicht", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("[Vertrag: Kartenverwaltung] Aussetzen aktualisiert die Kartenzeile ohne Editor-Flackern", async ({ page }) => {
  await page.goto(`/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b2}`);
  await waitForApp(page);
  const detail = page.getByTestId("card-detail-aside");
  await expect(detail).toBeVisible();
  const suspendControl = detail.getByRole("group", { name: "Aussetzstatus der Karte" });

  await page.evaluate(() => {
    const runtimeWindow = window as CardDetailObserverWindow;
    runtimeWindow.__coreCardDetailRemoved = false;
    runtimeWindow.__coreCardDetailObserver = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="card-detail-aside"]')) runtimeWindow.__coreCardDetailRemoved = true;
    });
    runtimeWindow.__coreCardDetailObserver.observe(document.body, { childList: true, subtree: true });
  });

  await suspendControl.getByRole("button", { name: "Aussetzen", exact: true })
    .click();
  await expect(suspendControl.getByRole("button", { name: "Aussetzen", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`deck-card-${CARD_IDS.b2}`)).toBeVisible();
  const cardRow = page.getByTestId(`deck-card-${CARD_IDS.b2}`).locator("xpath=ancestor::tr");
  await expect(cardRow).toHaveAttribute("data-suspended", "true");

  await suspendControl.getByRole("button", { name: "Nicht aussetzen", exact: true })
    .click();
  await expect(suspendControl.getByRole("button", { name: "Nicht aussetzen", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cardRow).not.toHaveAttribute("data-suspended");

  const detailWasRemoved = await page.evaluate(() => {
    const runtimeWindow = window as CardDetailObserverWindow;
    runtimeWindow.__coreCardDetailObserver?.disconnect();
    delete runtimeWindow.__coreCardDetailObserver;
    const removed = runtimeWindow.__coreCardDetailRemoved;
    delete runtimeWindow.__coreCardDetailRemoved;
    return removed;
  });
  expect(detailWasRemoved).toBe(false);
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

  await page.getByRole("button", { name: "Kartenverwaltung", exact: true }).click();
  await expect(page).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}`);
  await expect(page.getByTestId(`deck-toggle-${DECK_IDS.childB}`)).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId(`deck-card-${CARD_IDS.b2}`).click();
  const cardUrl = `/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b2}`;
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");

  const directLinkPage = await context.newPage();
  await directLinkPage.goto(cardUrl);
  await waitForApp(directLinkPage);
  await expect(directLinkPage.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");
  await directLinkPage.getByRole("button", { name: "Detailansicht schließen" }).click();
  await expect(directLinkPage).toHaveURL(`/kartenstapel?deck=${DECK_IDS.childB}`);
  await directLinkPage.goBack();
  await expect(directLinkPage.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");
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
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");

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

  const front = page.getByRole("textbox", { name: "Feld Vorderseite" });
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
  await page.getByRole("button", { name: "Kartenverwaltung", exact: true }).click();
  const deckUrl = `/kartenstapel?deck=${DECK_IDS.childB}`;
  const firstCardUrl = `/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b1}`;
  const secondCardUrl = `/kartenstapel?deck=${DECK_IDS.childB}&card=${CARD_IDS.b2}`;
  await expect(page.getByTestId(`deck-toggle-${DECK_IDS.childB}`)).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId(`deck-card-${CARD_IDS.b1}`).click();
  await page.goto(secondCardUrl);
  await waitForApp(page);
  await startDeckFromCards(page, DECK_IDS.childB);

  await page.goBack();
  await expect(page).toHaveURL(secondCardUrl);
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B2");
  await page.goBack();
  await expect(page).toHaveURL(firstCardUrl);
  await expect(page.getByRole("textbox", { name: "Feld Vorderseite" })).toContainText("Karte B1");
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

const CONTENT_URL = `/kartenstapel?deck=${DECK_IDS.childB}&content=1&tab=`;
const SUMMARY_RESULT = { summary: { sections: [{ heading: "Bereich B", paragraphs: ["Karte B1 führt zu Antwort B1."], points: [], references: ["m1"], subsections: [] }], warnings: [], relations: [] }, model: "openai/gpt-6-luna", privacyMode: "zdr", promptVersion: "learning-summary-v3", usage: null };

test("[Vertrag: Lerninhalte] Tabs öffnen per URL; Entwürfe sind bei Tab-, Bereichswechsel und Reload geschützt, Verwerfen lässt Fassungen unverändert", async ({ page }) => {
  const summaries = page.getByTestId("deck-summaries-panel"), guard = page.getByRole("dialog", { name: "Änderungen übernehmen?", exact: true });
  const tab = (name: string) => page.getByRole("group", { name: "Stapelinhalte", exact: true }).getByRole("button", { name, exact: true });
  const editor = summaries.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await page.goto(`${CONTENT_URL}summary`);
  await summaries.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
  await summaries.getByRole("button", { name: "Fassung anlegen", exact: true }).click(); await expect(summaries).toContainText("Bitte gib einen Titel");
  await summaries.getByRole("textbox", { name: "Titel", exact: true }).fill("Geschützter Entwurf");
  await tab("Mind Map").click();
  await guard.getByRole("button", { name: "Weiter bearbeiten", exact: true }).click();
  await expect(summaries.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue("Geschützter Entwurf");
  await mainMenu(page).getByRole("button", { name: "Lernen" }).click();
  await guard.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/lernen/);
  await page.goto(`${CONTENT_URL}summary`);
  await summaries.getByRole("button", { name: "Zusammenfassung „Geschützter Entwurf“ öffnen", exact: true }).click();
  await editor.fill("Ungespeichert");
  expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(true);
  await tab("Mind Map").click(); await guard.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(page).toHaveURL(`${CONTENT_URL}mind-map`);
  await page.reload(); await expect(page.getByTestId("mindmap-canvas")).toBeVisible();
  await tab("Zusammenfassungen").click(); await summaries.getByRole("button", { name: "Zusammenfassung „Geschützter Entwurf“ öffnen", exact: true }).click();
  await expect(editor).not.toContainText("Ungespeichert");
});

test("[Vertrag: Lerninhalte] KI-Fassung aus geladenem Material, Bearbeiten, Neu erzeugen nach Rückfrage und Abbruch", async ({ page }) => {
  const requests: Array<{ units: unknown[] }> = [];
  let hold = false;
  await page.route("**/api/ai/summary", async (route) => {
    requests.push(route.request().postDataJSON());
    if (hold) return;
    await route.fulfill({ json: SUMMARY_RESULT });
  });
  const summaries = page.getByTestId("deck-summaries-panel"), editor = summaries.getByRole("textbox", { name: "Zusammenfassung bearbeiten", exact: true });
  await page.goto(`${CONTENT_URL}summary`);
  await summaries.getByRole("button", { name: "Zusammenfassung erzeugen", exact: true }).click();
  await expect(editor).toContainText("Karte B1 führt zu Antwort B1."); await expect(summaries).toContainText("· Gespeichert");
  expect(requests[0].units).toHaveLength(2);
  await editor.fill("Eigene Fassung.");
  await summaries.getByRole("button", { name: "Speichern", exact: true }).click();
  await summaries.getByRole("button", { name: "Neu erzeugen", exact: true }).click();
  hold = true;
  await page.getByRole("dialog", { name: "Fassung neu erzeugen?", exact: true }).getByRole("button", { name: "Neu erzeugen", exact: true }).click();
  await summaries.getByRole("button", { name: "KI-Erstellung abbrechen", exact: true }).click();
  await expect(summaries.getByRole("button", { name: "Neu erzeugen", exact: true })).toBeEnabled();
  await expect(editor).toHaveText("Eigene Fassung.");
  expect(requests).toHaveLength(2);
});

test("[Vertrag: Lerninhalte] Zusammenfassungen und Mind Map gehören zum angemeldeten Konto", async ({ browser }) => {
  const other = { email: process.env.CORE_RLS_USER_B_EMAIL ?? "", password: process.env.CORE_RLS_USER_B_PASSWORD ?? "" };
  test.skip(!other.email || !other.password, "Nur gegen lokales Supabase mit zweitem Testkonto.");
  await seedAccount(seedDecks(), other);
  // Eigener Browser: Abmelden beendet hier nur die Sitzung von Konto B, die gemeinsame Sitzung von Konto A bleibt gültig.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } }), page = await context.newPage();
  try {
    const summaries = page.getByTestId("deck-summaries-panel"), mindMaps = page.getByTestId("deck-mindmaps-panel");
    const signIn = async (account: { email: string; password: string }) => {
      await page.getByLabel("E-Mail").fill(account.email); await page.getByLabel("Passwort", { exact: true }).fill(account.password);
      await page.locator("form").getByRole("button", { name: "Anmelden", exact: true }).click(); await waitForApp(page);
    };
    await page.goto("/"); await signIn(other);
    await page.goto(`${CONTENT_URL}summary`);
    await summaries.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
    await summaries.getByRole("textbox", { name: "Titel", exact: true }).fill("Nur für Konto B");
    await summaries.getByRole("button", { name: "Fassung anlegen", exact: true }).click(); await expect(summaries).toContainText("· Gespeichert");
    await page.goto(`${CONTENT_URL}mind-map`);
    await mindMaps.getByRole("button", { name: "Erstes Thema", exact: true }).click();
    await mindMaps.getByRole("textbox", { name: "Kartentitel bearbeiten", exact: true }).fill("Thema B");
    await mindMaps.getByRole("button", { name: "Bearbeitung abschließen", exact: true }).click();
    await expect(mindMaps.getByRole("status").filter({ hasText: /^Gespeichert$/ })).toBeAttached();
    await page.goto("/"); await page.getByRole("button", { name: "Einstellungen öffnen" }).first().click();
    await page.getByRole("button", { name: "Abmelden" }).click(); await signIn(loadE2EEnvironment());
    await page.goto(`${CONTENT_URL}summary`);
    await expect(summaries).toContainText("Hier entsteht dein Überblick");
    await page.goto(`${CONTENT_URL}mind-map`);
    await expect(mindMaps.getByRole("button", { name: "Erstes Thema", exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("[Vertrag: Lerninhalte] Zusammenfassungen liegen online: ein zweites Gerät sieht neue Fassungen und Löschungen", async ({ page, browser }) => {
  const second = await browser.newContext({ storageState: e2eAuthStatePath }), other = await second.newPage();
  try {
    const open = async (target: Page) => { await target.goto(`${CONTENT_URL}summary`); return target.getByTestId("deck-summaries-panel"); };
    const first = await open(page);
    await first.getByRole("button", { name: "Neue Zusammenfassung", exact: true }).click();
    await first.getByRole("textbox", { name: "Titel", exact: true }).fill("Auf allen Geräten");
    await first.getByRole("button", { name: "Fassung anlegen", exact: true }).click(); await expect(first).toContainText("· Gespeichert");
    const remote = await open(other), entry = { name: "Zusammenfassung „Auf allen Geräten“ öffnen", exact: true };
    await remote.getByRole("button", entry).click();
    await remote.getByRole("button", { name: "Löschen", exact: true }).click();
    await other.getByRole("dialog", { name: "Zusammenfassung löschen?", exact: true }).getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(remote.getByRole("button", entry)).toHaveCount(0);
    await open(page);
    await expect(first).toContainText("Hier entsteht dein Überblick"); await expect(first.getByRole("button", entry)).toHaveCount(0);
  } finally { await second.close(); }
});
