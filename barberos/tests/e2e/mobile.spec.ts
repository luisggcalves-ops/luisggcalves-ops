import { expect, test } from "@playwright/test";
import { createShop, signUp, uniqueEmail } from "./helpers";

test("owner dashboard and barber app work on a phone", async ({ page }) => {
  await signUp(page, "Phone Owner", uniqueEmail("mobile"));
  await createShop(page, `Mobile Shop ${Date.now().toString(36)}`);

  // The sidebar collapses into a menu.
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Staff" }).click();
  await expect(page).toHaveURL(/\/app\/staff$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();

  // The owner cuts hair too, so the barber app works for them as well.
  await page.goto("/barber");
  await expect(page.getByRole("heading", { name: "Hi, Phone" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/barber\/profile$/);

  // No horizontal scrolling at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
