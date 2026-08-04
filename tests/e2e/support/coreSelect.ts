import { expect, type Locator, type Page } from "@playwright/test";

export async function chooseCoreSelectOption(page: Page, trigger: Locator, optionName: string | RegExp) {
  await trigger.click();
  const option = page.getByRole("option", { name: optionName, exact: typeof optionName === "string" });
  await expect(option).toBeVisible();
  await option.click();
}
