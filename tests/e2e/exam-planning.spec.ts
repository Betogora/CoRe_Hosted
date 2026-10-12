import { expect, test, type Page } from "@playwright/test";
import { createBasicLearningItem, createCoreDeck } from "../../src/coreModel.ts";
import { readActiveAccountState, resetToFreshLocalState } from "./support/appState.ts";

const decks = ["Anatomie Prüfungsfixture", "Biochemie Prüfungsfixture"].map((name, i) => {
  const id = `exam-fixture-${i}`;
  return createCoreDeck({ id, name, source: "manual", cards: Array.from({ length: 20 }, (_, n) =>
    createBasicLearningItem(id, `Frage ${n + 1} zu ${name}`, "Antwort", { id: `${id}-card-${n}` })) });
});
async function finishWizard(page: Page) {
  const panel = page.getByTestId("exam-planning-panel");
  for (let step = 0; step < 3; step++) await panel.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByTestId("exam-feasibility").waitFor();
  const risk = panel.getByRole("checkbox", { name: "Trotz Zielgefährdung aktivieren", exact: true });
  if (await risk.count()) await risk.check();
  await panel.getByRole("button", { name: "Plan aktivieren", exact: true }).click();
  await page.getByTestId("exam-planning-overview").waitFor();
}
test("Wochenatelier: Tagesbudget zurücksetzen, freien Tag speichern und Grundeinstellung erhalten", async ({ page }) => {
  test.setTimeout(90_000);
  await resetToFreshLocalState(page, { additionalDecks: decks });
  const before = await readActiveAccountState(page);
  await page.getByTestId("exam-planning-card").getByRole("button", { name: "Prüfung planen", exact: true }).click();
  const panel = page.getByTestId("exam-planning-panel");
  await page.getByTestId("exam-feasibility").waitFor();
  const day = panel.locator(".core-exam-day:not([disabled])").nth(1);
  const date = await day.getAttribute("data-date");
  const initialLabel = await day.getAttribute("aria-label");
  await day.click();
  await panel.getByRole("button", { name: "50 Min.", exact: true }).click();
  await expect(day).toHaveAttribute("aria-label", /50 Minuten, angepasst/);
  await panel.getByRole("button", { name: "Wochenrhythmus verwenden", exact: true }).click();
  await expect(day).toHaveAttribute("aria-label", initialLabel!);
  await panel.getByRole("combobox", { name: "Art des Lerntags", exact: true }).click();
  await page.getByRole("option", { name: "Freier Tag", exact: true }).click();
  await expect(day).toHaveAttribute("aria-label", /frei/);
  await expect(panel.getByTestId("exam-day-preview")).toContainText("Dieser Tag bleibt frei.");
  await panel.getByRole("button", { name: "Plan prüfen & aktivieren", exact: true }).click();
  await page.getByTestId("exam-feasibility").waitFor();
  const risk = panel.getByRole("checkbox", { name: "Trotz Zielgefährdung aktivieren", exact: true });
  if (await risk.count()) await risk.check();
  await panel.getByRole("button", { name: "Plan aktivieren", exact: true }).click();
  await page.getByTestId("exam-planning-overview").waitFor();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Prüfungen verwalten", exact: true }).waitFor();
  const after = await readActiveAccountState(page);
  const settings = after.profile.schedulerPreferences.examPlanning;
  expect(settings.preparationCapacity.dateOverrides).toContainEqual({ date, minutes: 0 });
  expect(settings.capacity).toEqual(before.profile.schedulerPreferences.examPlanning?.capacity ?? {
    weekdayMinutes: 45, weekendMinutes: 60, weekdays: [true, true, true, true, true, false, false], reserveFraction: 0.12, minimumMinutes: 0, dateOverrides: [],
  });
  const states = (data: typeof before) => data.decks.flatMap((deck: any) => deck.cards.map((card: any) => [card.id, card.reviewState]))
    .sort((a: any[], b: any[]) => a[0].localeCompare(b[0]));
  expect(states(after)).toEqual(states(before));
});

test("adaptiver Prüfungsplan: mehrere Stapel, echte Reviews, geänderter Termin und überschneidende zweite Prüfung", async ({ page }) => {
  test.setTimeout(120_000);
  await resetToFreshLocalState(page, { additionalDecks: decks });
  await page.getByTestId("exam-planning-card").getByRole("button", { name: "Prüfung planen", exact: true }).click();
  const panel = page.getByTestId("exam-planning-panel");
  await panel.getByRole("textbox", { name: "Name der Prüfung" }).fill("Anatomie Klausur");
  for (const name of ["Anatomie Prüfungsfixture", "Biochemie Prüfungsfixture"]) await panel.getByRole("checkbox", { name: new RegExp(name) }).check();
  await finishWizard(page);
  await expect(page.getByRole("heading", { name: "Anatomie Klausur", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Prüfungen verwalten", exact: true }).waitFor();
  const before = await readActiveAccountState(page);
  expect(before.profile.schedulerPreferences.examPlanning.exams).toHaveLength(1);
  const plan = before.profile.schedulerPreferences.examPlanning.exams[0];
  const states = new Map(before.decks.flatMap((deck: any) => deck.cards.map((card: any) => [card.id, card.reviewState])));
  await page.getByTestId("exam-planning-card").getByRole("button", { name: "Lernblock starten", exact: true }).first().click();
  await expect(page).toHaveURL(/examPlan=.*examBlock=/);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Antwort anzeigen", exact: true }).click();
    await page.getByRole("button", { name: /Bewertung Gut/ }).click();
  }
  await page.getByRole("button", { name: "Lernmodus verlassen", exact: true }).click();
  await expect.poll(async () => (await readActiveAccountState(page)).decks.flatMap((deck: any) => deck.reviewEvents).filter((event: any) => event.flags?.examPlanId === plan.id).length).toBe(3);
  await page.getByRole("button", { name: "Prüfungen verwalten", exact: true }).click();
  await page.getByRole("button", { name: "Details & nächste Aktion", exact: true }).click();
  await expect(page.getByText("Stoffabdeckung · aktuell → Prüfung", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ziele, Datum oder Zeit anpassen", exact: true }).click();
  await panel.getByRole("button", { name: "Prüfungsdatum auswählen", exact: true }).click();
  await page.getByRole("button", { name: "Nächsten Monat anzeigen", exact: true }).click();
  await page.getByRole("group", { name: /Kalendertage für/ }).locator("button:not([disabled])").first().click();
  await finishWizard(page);
  const changed = await readActiveAccountState(page);
  expect(changed.profile.schedulerPreferences.examPlanning.exams[0].examDate).not.toBe(plan.examDate);
  const reviews = changed.decks.flatMap((deck: any) => deck.reviewEvents);
  expect(reviews.filter((event: any) => event.flags?.examPlanId === plan.id)).toHaveLength(3);
  await page.getByRole("button", { name: "Prüfung planen", exact: true }).click();
  await panel.getByRole("textbox", { name: "Name der Prüfung" }).fill("Biochemie Klausur");
  await panel.getByRole("checkbox", { name: /Anatomie Prüfungsfixture/ }).check();
  await panel.getByRole("checkbox", { name: /Biochemie Prüfungsfixture/ }).check();
  await finishWizard(page);
  const combined = await readActiveAccountState(page);
  expect(combined.profile.schedulerPreferences.examPlanning.exams).toHaveLength(2);
  expect(combined.decks.flatMap((deck: any) => deck.reviewEvents)).toHaveLength(reviews.length);
  const studied = new Set(reviews.map((event: any) => event.learningItemId));
  for (const deck of combined.decks) for (const card of deck.cards) {
    if (states.has(card.id) && !studied.has(card.id)) expect(card.reviewState).toEqual(states.get(card.id));
  }
  await page.getByRole("button", { name: "Plan neu ausrichten", exact: true }).click();
  await expect(page.getByText(/Heute neu ausgerichtet:/)).toBeVisible();
  await page.getByRole("button", { name: "Abschließen", exact: true }).first().click();
  await expect(page.getByText(/Abgeschlossen/).first()).toBeVisible();
  await page.getByRole("button", { name: "Löschen", exact: true }).last().click();
  await page.getByRole("button", { name: "Prüfung löschen", exact: true }).click();
  await expect.poll(async () => (await readActiveAccountState(page)).profile.schedulerPreferences.examPlanning.exams.length).toBe(1);
  const final = await readActiveAccountState(page);
  expect(final.decks.flatMap((deck: any) => deck.reviewEvents)).toHaveLength(reviews.length);
});
