import { expect, type Locator, type Page } from "@playwright/test";

export const settingsDialog = (page: Page) => page.getByTestId("settings-dialog");
export const deckSettingsDialog = (page: Page) => page.getByTestId("deck-settings-dialog");

/** Opens an area in a settings dialog; below 768 px it first returns to the area list. */
export async function openSettingsArea(dialog: Locator, section: string) {
  const area = dialog.locator(`[data-settings-section="${section}"]`);
  if (!(await area.isVisible())) await dialog.getByRole("button", { name: "Zurück zu den Bereichen" }).click();
  await area.click();
  await expect(area).toHaveAttribute("aria-current", "page");
}
