import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

async function openQuizzes(page: Page) {
  await page.goto("/docs/ui-elements.html?preview=quiz");
  const panel = page.getByTestId("deck-quiz-panel");
  await expect(panel.getByTestId("quiz-list")).toBeVisible();
  return panel;
}

test("Ein Durchgang fragt vor dem Verlassen nach, wertet offene Fragen als falsch und wiederholt nur die falschen", async ({ page }) => {
  const panel = await openQuizzes(page);
  await panel.getByRole("button", { name: "Auswertung von „Hauptstädte Europas“ öffnen", exact: true }).click();
  await expect(panel.getByText("6 von 8 richtig", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Quiz wiederholen", exact: true }).click();

  await panel.getByRole("button", { name: "Antwortoption B: Lissabon", exact: true }).click();
  await expect(panel.getByText("1 von 8 beantwortet", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Unterstapel", exact: true }).click();
  const leave = page.getByRole("dialog", { name: "Quiz verlassen?", exact: true });
  await expect(leave).toContainText("Deine Antwort wird verworfen.");
  await leave.getByRole("button", { name: "Weitermachen", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Antwortoption B: Lissabon", exact: true })).toHaveAttribute("aria-pressed", "true");

  await panel.getByRole("button", { name: "Abgeben", exact: true }).click();
  await page.getByRole("dialog", { name: "7 Fragen sind noch offen", exact: true }).getByRole("button", { name: "Abgeben", exact: true }).click();
  await expect(panel.getByText("1 von 8 richtig", { exact: true })).toBeVisible();
  await expect(panel.getByRole("img", { name: "13 Prozent richtig", exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Nur falsche wiederholen", exact: true }).click();
  await expect(panel.getByText("0 von 7 beantwortet", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Alle Quizze", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Quiz „Hauptstädte Europas · nur falsche“ starten", exact: true })).toBeVisible();
});

test("Ein neues Quiz startet sofort; seine Fragen werden ohne Quelle als Karten übernommen", async ({ page }) => {
  const panel = await openQuizzes(page);
  await panel.getByRole("button", { name: "Quiz mit KI erstellen", exact: true }).click();
  await page.getByRole("group", { name: "Quiz mit KI erstellen", exact: true }).getByRole("button", { name: "Quiz erstellen", exact: true }).click();
  await expect(panel.getByText("0 von 8 beantwortet", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Alle Quizze", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Quiz „Welt-Hauptstädte“ starten", exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Auswertung von „Hauptstädte Europas“ öffnen", exact: true }).click();
  await panel.getByRole("button", { name: "Als Karten speichern", exact: true }).click();
  const proposals = panel.getByTestId("ai-source-proposals");
  await expect(proposals.getByTestId("ai-source-proposal")).toHaveCount(2);
  await expect(proposals).not.toContainText("Quelle");
  await expect(proposals).not.toContainText("Kartenvorschläge");
  await proposals.getByRole("button", { name: "2 Vorschläge übernehmen", exact: true }).click();
  await expect(page.getByText(/2 Karten in „.+“ gespeichert\./)).toBeVisible();
  await expect(panel.getByText("6 von 8 richtig", { exact: true })).toBeVisible();
});
