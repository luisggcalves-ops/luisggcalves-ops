import { expect, test } from "@playwright/test";
import { PASSWORD, createShop, signUp, uniqueEmail } from "./helpers";

const OWNER_PAGES = [
  "/app",
  "/app/appointments",
  "/app/customers",
  "/app/staff",
  "/app/finance",
  "/app/finance/payments",
  "/app/finance/commissions",
  "/app/finance/expenses",
  "/app/inventory",
  "/app/reports",
  "/app/settings",
  "/app/settings/services",
  "/app/settings/hours",
  "/app/settings/booking",
];
const PRIVATE_DOWNLOADS = ["/app/reports/payments", "/app/reports/commissions", "/app/reports/appointments", "/api/cron/outbox"];

test("signed-out visitors and barbers can't reach owner pages or private data", async ({ page, browser }) => {
  // Signed out: every private page sends you to sign in; downloads are refused.
  for (const path of [...OWNER_PAGES, "/barber", "/barber/earnings", "/onboarding"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in/);
  }
  for (const path of PRIVATE_DOWNLOADS) {
    const res = await page.request.get(path);
    expect([401, 403], path).toContain(res.status());
  }

  // A barber.
  await signUp(page, "Owner Access", uniqueEmail("acc-owner"));
  await createShop(page, `Access Shop ${Date.now().toString(36)}`);
  await page.goto("/app/staff");
  const barberEmail = uniqueEmail("acc-barber");
  await page.getByLabel("Email").fill(barberEmail);
  await page.getByRole("button", { name: "Send invite" }).click();
  const invite = (await page.getByTestId("invite-link").textContent())!.trim();

  const ctx = await browser.newContext();
  const barber = await ctx.newPage();
  await barber.goto(invite);
  await barber.getByRole("link", { name: "Create account and join" }).click();
  await barber.getByLabel("Your name").fill("Barber Access");
  await barber.getByLabel("Password").fill(PASSWORD);
  await barber.getByRole("button", { name: "Create account" }).click();
  await barber.getByRole("button", { name: /^Join/ }).click();
  await expect(barber).toHaveURL(/\/barber$/);

  for (const path of OWNER_PAGES) {
    await barber.goto(path);
    await expect(barber, path).toHaveURL(/\/barber$/);
  }
  for (const path of PRIVATE_DOWNLOADS) {
    const res = await barber.request.get(path);
    expect([401, 403], path).toContain(res.status());
  }
  // The barber's own pages work.
  for (const path of ["/barber", "/barber/calendar", "/barber/customers", "/barber/earnings", "/barber/profile"]) {
    const res = await barber.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(barber).toHaveURL(new RegExp(path.replace("/", "\\/") + "$"));
  }
  await ctx.close();
});
