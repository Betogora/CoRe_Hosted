import { expect, test, type Page } from "@playwright/test";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

const EUROPE_DECK_ID = "deck_world_capitals_europa";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü|Mobile Hauptnavigation/ }).filter({ visible: true });
}

async function planExam(page: Page, name: string) {
  await mainMenu(page).getByRole("button", { name: "Prüfungen" }).click();
  await expect(page.getByRole("heading", { name: "Prüfungen", exact: true })).toBeVisible();
  await page.getByTestId("exam-planning-screen").getByRole("button", { name: "Prüfung planen" }).first().click();
  const inspector = page.getByTestId("exam-plan-inspector");
  await inspector.getByRole("textbox", { name: "Name" }).fill(name);
  await inspector.getByRole("button", { name: "Weiter zum Lernstoff" }).click();
  await inspector.getByRole("checkbox", { name: /^Europa/ }).check();
  await inspector.getByRole("button", { name: "Weiter zu Ziel und Zeit" }).click();
  await inspector.getByRole("button", { name: "Lernplan ansehen" }).click();
  const feasibility = page.getByTestId("exam-feasibility");
  await expect(feasibility.getByText("Karten", { exact: true })).toBeVisible({ timeout: 20_000 });
  const acceptRisk = feasibility.getByRole("checkbox", { name: "Trotz Gefährdung aktivieren" });
  if (await acceptRisk.isVisible()) await acceptRisk.check();
  await inspector.getByRole("button", { name: "Plan aktivieren" }).click();
}

test("Prüfungsplanung: globaler Bereich, Plan im Profil, heutige Einheit als Lernsitzung", async ({ page }) => {
  await resetToFreshLocalState(page);
  await planExam(page, "Geografie");

  const card = page.locator('[data-testid^="exam-card-"]');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("heading", { name: "Geografie" })).toBeVisible();
  const today = page.getByTestId("exam-today");
  await expect(today.getByRole("button", { name: "Heutige Einheit lernen" })).toBeEnabled({ timeout: 20_000 });
  await expect(today.locator("[data-exam-block]").first()).toBeVisible();
  await expect(page.getByTestId("exam-calendar")).toBeVisible();

  const stored = await readActiveAccountState(page);
  const exams = stored.profile.schedulerPreferences.examPlanning.exams;
  expect(exams).toHaveLength(1);
  expect(exams[0]).toMatchObject({ name: "Geografie", status: "active", deckIds: [EUROPE_DECK_ID] });
  const europeSettings = stored.decks.find((deck: { id: string }) => deck.id === EUROPE_DECK_ID).deckSettings;

  await today.getByRole("button", { name: "Heutige Einheit lernen" }).click();
  await page.getByRole("button", { name: "Antwort anzeigen" }).click();
  await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  await expect.poll(async () => (await readActiveAccountState(page)).decks.find((deck: { id: string }) => deck.id === EUROPE_DECK_ID).reviewEvents.length).toBe(1);
  const afterReview = await readActiveAccountState(page);
  expect(afterReview.decks.find((deck: { id: string }) => deck.id === EUROPE_DECK_ID).deckSettings, "die Prüfungssitzung ändert keine Stapeleinstellungen").toEqual(europeSettings);
  expect(afterReview.decks.some((deck: { id: string }) => deck.id === "exam-session"), "der Sitzungsstapel wird nicht gespeichert").toBe(false);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Prüfungen", exact: true })).toBeVisible();
  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await expect(page.getByTestId("dashboard-exam-unit").getByRole("button", { name: "Heutige Einheit lernen" })).toBeVisible();

  await page.reload();
  await mainMenu(page).getByRole("button", { name: "Prüfungen" }).click();
  await card.getByRole("button", { name: "Pausieren" }).click();
  await expect(card).toHaveAttribute("data-status", "paused");
  await expect(page.getByTestId("exam-today")).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await expect(page.getByTestId("dashboard-exam-unit")).toHaveCount(0);
});

test("Prüfungen bleiben auf dem Handy über die untere Navigation erreichbar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await resetToFreshLocalState(page);
  const bottomNavigation = page.getByRole("navigation", { name: "Mobile Hauptnavigation" });
  await expect(bottomNavigation.getByRole("button")).toHaveText(["Heute", "Lernen", "Prüfungen", "Erstellen", "Statistik"]);
  await bottomNavigation.getByRole("button", { name: "Prüfungen" }).click();
  await expect(page).toHaveURL(/\/pruefungen$/);
  await expect(page.getByRole("heading", { name: "Noch keine Prüfung geplant" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
