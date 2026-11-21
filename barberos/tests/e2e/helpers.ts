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

/** The next Tuesday at least 2 days ahead (default shop hours are Tue–Sat). */
export function nextTuesday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function addService(page: Page, name: string, duration: string, price: string) {
  await page.goto("/app/settings/services");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Duration (min)").fill(duration);
  await page.getByLabel(/Price/).fill(price);
  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
}
