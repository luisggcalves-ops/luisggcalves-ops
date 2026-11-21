import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function createShop(page: Page, name: string) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Shop name").fill(name);
  await page.getByRole("button", { name: "Create shop" }).click();
  await expect(page).toHaveURL(/\/app$/);
}
