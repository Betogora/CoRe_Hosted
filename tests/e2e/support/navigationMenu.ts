import { expect, type Page } from "@playwright/test";
import { SHELL_REVEAL_EVENT } from "../../../src/ui/shellBack.ts";
import { openSettingsArea, settingsDialog } from "./settingsDialog.ts";

export async function openNavigationMenuItem(page: Page, item: "Einstellungen" | "Statistik" | "Hilfe") {
  // Clicking further down the page may have scrolled the head away.
  await page.evaluate((event) => window.dispatchEvent(new Event(event)), SHELL_REVEAL_EVENT);
  await page.locator("header[data-navigation-layout]:visible").getByRole("button", { name: "Menü", exact: true }).click();
  await page.locator("[data-navigation-menu]").getByRole("button", { name: item, exact: true }).click();
}

export async function switchColorScheme(page: Page, scheme: "dark" | "light") {
  await openNavigationMenuItem(page, "Einstellungen");
  const dialog = settingsDialog(page);
  await openSettingsArea(dialog, "darstellung");
  await dialog.getByRole("switch", { name: "Dark Mode" }).setChecked(scheme === "dark");
  await expect(page.locator("html")).toHaveAttribute("data-core-theme", scheme);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}
