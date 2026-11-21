import { expect, test } from "@playwright/test";
import { PASSWORD, createShop, signUp, uniqueEmail } from "./helpers";

test("owner sets up a shop, invites a barber, and roles are enforced", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("owner");
  const barberEmail = uniqueEmail("barber");
  const shopName = `Northside Barbers ${Date.now().toString(36)}`;

  // Owner signs up and creates the shop.
  await signUp(page, "Marta Owner", ownerEmail);
  await createShop(page, shopName);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Marta");
  await expect(page.getByText("Get your shop ready")).toBeVisible();
  await expect(page.getByText("2 of 5 done")).toBeVisible();

  // Invite a barber.
  await page.getByRole("link", { name: "Staff" }).first().click();
  await page.getByLabel("Email").fill(barberEmail);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invitation sent to ${barberEmail}`)).toBeVisible();
  const inviteUrl = (await page.getByTestId("invite-link").textContent())!.trim();
  expect(inviteUrl).toMatch(/\/invite\//);
  await expect(page.getByText("Pending invitations")).toBeVisible();

  // The barber opens the link in their own browser, creates an account and joins.
  const barberContext = await browser.newContext();
  const barber = await barberContext.newPage();
  await barber.goto(inviteUrl);
  await expect(barber.getByRole("heading", { name: `Join ${shopName}` })).toBeVisible();
  await barber.getByRole("link", { name: "Create account and join" }).click();
  await expect(barber.getByLabel("Email")).toHaveValue(barberEmail);
  await barber.getByLabel("Your name").fill("Rui Barber");
  await barber.getByLabel("Password").fill(PASSWORD);
  await barber.getByRole("button", { name: "Create account" }).click();
  await expect(barber).toHaveURL(/\/invite\//);
  await barber.getByRole("button", { name: `Join ${shopName}` }).click();
  await expect(barber).toHaveURL(/\/barber$/);
  await expect(barber.getByRole("heading", { name: "Hi, Rui" })).toBeVisible();

  // Barbers can't open the owner dashboard. They are sent back to their app.
  await barber.goto("/app/staff");
  await expect(barber).toHaveURL(/\/barber$/);
  await barber.goto("/app/settings");
  await expect(barber).toHaveURL(/\/barber$/);

  // The invitation link can't be reused.
  await barber.goto(inviteUrl);
  await expect(barber.getByText("Invitation unavailable")).toBeVisible();

  // Owner sees the barber on the team and deactivates them.
  await page.reload();
  const row = page.getByRole("row", { name: /Rui Barber/ });
  await expect(row).toContainText("Barber");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row).toContainText("Deactivated");

  // The deactivated barber loses access to the shop immediately.
  await barber.goto("/barber");
  await expect(barber).toHaveURL(/\/onboarding/);
  await barberContext.close();
});

test("owner edits opening hours and shop profile", async ({ page }) => {
  await signUp(page, "Hugo Owner", uniqueEmail("hours"));
  await createShop(page, `Hours Shop ${Date.now().toString(36)}`);

  await page.goto("/app/settings/hours");
  await page.getByLabel("Open on Monday").check({ force: true });
  await page.getByLabel("Monday closes at").fill("13:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByText("Opening hours saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Monday closes at")).toHaveValue("13:00");

  await page.goto("/app/settings");
  await page.getByLabel("City").fill("Lisbon");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Shop profile saved.")).toBeVisible();

  // A taken booking link shows a field error and keeps the user's input.
  await page.getByLabel("Booking link").fill("api");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("This link is reserved")).toBeVisible();
  await expect(page.getByLabel("City")).toHaveValue("Lisbon");
});

test("sign-in, wrong password and sign-out", async ({ page }) => {
  const email = uniqueEmail("auth");
  await signUp(page, "Sara Owner", email);
  await createShop(page, `Auth Shop ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
