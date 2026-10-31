import { expect, test, type Page } from "@playwright/test";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";
import { e2eAuthStatePath } from "./support/e2eEnvironment.ts";

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
  await inspector.getByRole("button", { name: "Weiter zur Lernzeit" }).click();
  await inspector.getByRole("button", { name: "Lernplan ansehen" }).click();
  const feasibility = page.getByTestId("exam-plan-preview");
  await expect(feasibility.getByText("Karten", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("exam-plan-editor").getByRole("button", { name: "Plan aktivieren" }).click();
}

test("Prüfungsplanung: globaler Bereich, Plan im Profil, heutige Einheit als Lernsitzung", async ({ page }) => {
  await resetToFreshLocalState(page);
  await planExam(page, "Geografie");

  const card = page.locator('[data-testid^="exam-card-exam"]');
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
  const card = page.locator('[data-testid^="exam-card-exam"]').first();
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
  await expect(editor.getByTestId("exam-plan-preview").getByText("Karten", { exact: true })).toBeVisible({ timeout: 20_000 });
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

test("Wochenkalender ändert und löscht ausgewählte Lernzeit direkt am Block", async ({ page }) => {
  await resetToFreshLocalState(page);
  await planExam(page, "Geografie");
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  const calendar = page.getByTestId("exam-week-calendar");
  const day = calendar.locator('[data-week-day][aria-disabled="false"]').first();
  await day.focus();
  await page.keyboard.press("Enter");
  const block = calendar.locator("[data-week-block]").first();
  await expect(block).toHaveAttribute("aria-pressed", "true");
  await expect(block).toHaveAccessibleName(/08:00 bis 08:30/);
  const handle = calendar.getByRole("slider", { name: "Ende der Lernzeit ändern" });
  await expect(handle).toBeEnabled();
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(block).toHaveAccessibleName(/08:00 bis 09:00/);
  await expect(handle).toBeEnabled();
  await page.keyboard.press("ArrowUp");
  await expect(block).toHaveAccessibleName(/08:00 bis 08:30/);
  await expect(handle).toBeEnabled();
  const grip = await handle.boundingBox();
  if (!grip) throw new Error("Ziehlasche ist nicht sichtbar");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 32, { steps: 4 });
  await expect(block).toHaveAccessibleName(/08:00 bis 09:30/);
  await page.mouse.up();
  await expect(block).toHaveAccessibleName(/08:00 bis 09:30/);
  await calendar.getByRole("slider", { name: "Lernzeit verschieben" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(block).toHaveAccessibleName(/08:30 bis 10:00/);
  await expect(calendar.getByRole("button", { name: "Lernzeit im Kalender löschen" })).toBeEnabled();
  await calendar.getByRole("button", { name: "Lernzeit im Kalender löschen" }).click();
  await expect(block).toHaveCount(0);
  await expect(calendar.getByRole("slider", { name: "Ende der Lernzeit ändern" })).toHaveCount(0);
  await expect(page.getByText("Ungespeicherte Kalenderänderungen", { exact: true })).toBeVisible();
});

async function synchronized(page: Page) {
  await page.locator('[data-navigation-utilities="true"][data-sync-status="saved"]:visible').waitFor({ state: "visible", timeout: 20_000 });
}

test("Zwei Geräte teilen Plan und Häkchen; offline startet die Einheit aus lokalen Karten; die Hauptnavigation schützt Entwürfe", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await resetToFreshLocalState(page);
  await planExam(page, "Geografie");
  const today = page.getByTestId("exam-today");
  await expect(today.getByRole("button", { name: "Heutige Einheit lernen" })).toBeEnabled({ timeout: 20_000 });
  const firstTask = today.locator('[data-exam-block="study"]').first().getByRole("checkbox");
  await firstTask.check();
  await expect(firstTask).toBeChecked();
  await synchronized(page);

  const second = await browser.newContext({ storageState: e2eAuthStatePath }), other = await second.newPage();
  try {
    await other.goto("/pruefungen");
    const otherCard = other.locator('[data-testid^="exam-card-exam"]');
    await expect(otherCard.getByRole("heading", { name: "Geografie" })).toBeVisible({ timeout: 20_000 });
    await expect(other.getByTestId("exam-today").locator('[data-exam-block="study"]').first().getByRole("checkbox")).toBeChecked({ timeout: 20_000 });
  } finally { await second.close(); }

  // Studying once online keeps the target cards on this device.
  await today.getByRole("button", { name: "Heutige Einheit lernen" }).click();
  await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Prüfungen", exact: true })).toBeVisible();

  await page.context().setOffline(true);
  try {
    await page.getByRole("button", { name: "Plan neu berechnen" }).click();
    await expect(today.getByText("Offline: zuletzt geplante Aufgaben", { exact: true })).toBeVisible();
    await expect(today.locator('[data-exam-block="study"]').first().getByRole("checkbox")).toBeEnabled();
    await today.getByRole("button", { name: "Heutige Einheit lernen" }).click();
    await expect(page.getByRole("button", { name: "Antwort anzeigen" })).toBeVisible();
    await page.goBack();
  } finally { await page.context().setOffline(false); }
  await expect(today.getByText("Offline: zuletzt geplante Aufgaben", { exact: true })).toHaveCount(0, { timeout: 20_000 });

  const card = page.locator('[data-testid^="exam-card-exam"]').first();
  await card.getByRole("button", { name: "Geografie: Details öffnen" }).click();
  await card.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await card.getByRole("textbox", { name: "Name", exact: true }).fill("Europa");
  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  const leave = page.getByRole("dialog", { name: "Änderungen verwerfen?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(page).toHaveURL(/\/pruefungen$/);
  await expect(card.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Europa");
  await mainMenu(page).getByRole("button", { name: "Heute" }).click();
  await leave.getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await expect(page).toHaveURL(/\/$|\/heute$/);
});
