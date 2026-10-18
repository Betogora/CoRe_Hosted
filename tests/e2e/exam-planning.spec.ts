import { expect, test, type Page } from "@playwright/test";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

const EUROPE_DECK_ID = "deck_world_capitals_europa";

function mainMenu(page: Page) {
  return page.getByRole("navigation", { name: /Hauptmenü|Mobile Hauptnavigation/ }).filter({ visible: true });
}

async function planExam(page: Page, name: string) {
  await mainMenu(page).getByRole("button", { name: "Prüfungen" }).click();
  await expect(page.getByRole("heading", { name: "Prüfungen", exact: true })).toBeVisible();
  await page.getByTestId("exam-planning-screen").getByRole("button", { name: "Prüfung hinzufügen" }).first().click();
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
  await expect(page.getByTestId("exam-month-calendar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nächster Monat", exact: true })).toBeVisible();
  expect(await page.getByTestId("exam-calendar").evaluate((calendar) => Boolean(calendar.compareDocumentPosition(document.querySelector("#exam-list-title")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

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
  await card.getByRole("button", { name: "Geografie: Details öffnen" }).click();
  await card.getByRole("button", { name: "Pausieren" }).click();
  await page.getByRole("dialog", { name: "Prüfung pausieren?" }).getByRole("button", { name: "Pausieren", exact: true }).click();
  await expect(card).toHaveAttribute("data-status", "paused");
  await expect(page.getByTestId("exam-today")).toHaveCount(0);
  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await expect(page.getByTestId("dashboard-exam-unit")).toHaveCount(0);
});

test("Prüfungskarte bearbeitet inline, schützt Entwürfe und stellt gelöschte Pläne wieder her", async ({ page }) => {
  await resetToFreshLocalState(page);
  await planExam(page, "Geografie");
  const card = page.locator('[data-testid^="exam-card-"]').first();
  await expect(card.getByRole("button", { name: "Bearbeiten", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Geografie: Details öffnen" }).click();
  await expect(card.getByRole("progressbar")).toHaveCount(1);
  await expect(card.getByRole("progressbar", { name: "Geografie: Lernfortschritt", exact: true })).toHaveAttribute("aria-valuetext", /gesehen, davon .* gefestigt/);
  await expect(card.getByRole("list", { name: "Legende zum Lernfortschritt" }).locator("li")).toContainText(["Gesehen", "Gefestigt"]);
  await expect(card.getByText(/Geschätzte Abrufsicherheit|keine Aussage über sichere Beherrschung/)).toHaveCount(0);
  await card.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const editor = card.getByTestId("exam-plan-editor");
  await expect(editor).toHaveAttribute("data-embedded", "true");
  await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Europa");
  await editor.getByRole("button", { name: "Prüfungsfarbe auswählen", exact: true }).click();
  const wheel = page.getByRole("slider", { name: "Farbkreis: Pfeiltasten ändern Farbe und Intensität" });
  await wheel.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("dialog", { name: "Änderungen verwerfen?" }).getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Europa");
  await expect(editor.getByTestId("exam-feasibility").getByText("Karten", { exact: true })).toBeVisible({ timeout: 20_000 });
  const acceptRisk = editor.getByRole("checkbox", { name: "Trotz Gefährdung aktivieren" });
  if (await acceptRisk.isVisible()) await acceptRisk.check();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(card.getByRole("button", { name: "Europa: Details schließen" })).toBeVisible();
  const beforeDelete = (await readActiveAccountState(page)).profile.schedulerPreferences.examPlanning;
  expect(beforeDelete.exams[0].color).toMatch(/^#[0-9a-f]{6}$/);
  await card.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.getByRole("dialog", { name: "Prüfung löschen?" }).getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(card).toHaveCount(1);
  const restored = (await readActiveAccountState(page)).profile.schedulerPreferences.examPlanning;
  expect(restored.exams).toEqual(beforeDelete.exams);
  expect(restored.capacity).toEqual(beforeDelete.capacity);
  expect(restored.dailyTasks ?? []).toEqual(beforeDelete.dailyTasks ?? []);
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
