import { expect, test } from "@playwright/test";
import { addService, createShop, nextTuesday, signUp, uniqueEmail } from "./helpers";

test("a customer books online on a phone, then moves and cancels the booking", async ({ page, browser }) => {
  await signUp(page, "Bea Owner", uniqueEmail("public"));
  await createShop(page, `Public Shop ${Date.now().toString(36)}`);
  await addService(page, "Haircut", "30", "15");

  // Closed until the owner opens it.
  await page.goto("/app/settings/booking");
  const bookingUrl = (await page.getByTestId("booking-url").textContent())!.trim();
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const c = await customer.newPage();
  await c.goto(bookingUrl);
  await expect(c.getByRole("heading", { name: "Online booking isn't open yet" })).toBeVisible();

  await page.getByLabel("Accept online bookings").check();
  await page.getByLabel("Minimum notice").selectOption("0");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Online booking settings saved.")).toBeVisible();

  // Step 1–4 on the phone.
  await c.reload();
  await c.getByRole("link", { name: /Haircut/ }).click();
  await c.getByRole("link", { name: /Bea Owner/ }).click();
  await expect(c.getByRole("heading", { name: "Pick a time" })).toBeVisible();
  await c.getByRole("link", { name: /^\d{2}:\d{2}$/ }).first().click();
  await expect(c.getByRole("heading", { name: "Your details" })).toBeVisible();
  await c.getByLabel("Your name").fill("Carlos Mendes");
  await c.getByLabel("Mobile number").fill("912 345 678");
  await c.getByLabel(/Email/).fill("carlos@example.test");
  await c.getByRole("button", { name: "Confirm booking" }).click();
  await expect(c.getByRole("heading", { name: "You're booked!" })).toBeVisible();
  await expect(c.getByText("with Bea Owner")).toBeVisible();

  // Calendar file.
  const ics = await c.request.get(c.url().split("?")[0] + "/calendar.ics");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:Haircut at");

  // It's on the shop's calendar as an online booking.
  await page.goto("/app/customers");
  await expect(page.getByRole("link", { name: /Carlos Mendes/ })).toBeVisible();

  // Move it.
  await c.getByRole("button", { name: "Change date or time" }).click();
  await c.getByRole("option").nth(1).click();
  await c.getByRole("button", { name: "Move booking" }).click();
  await expect(c.getByRole("heading", { name: "Booking moved" })).toBeVisible();

  // Cancel it.
  await c.getByRole("button", { name: "Cancel booking" }).click();
  await c.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(c.getByRole("heading", { name: "Booking cancelled" })).toBeVisible();
  await expect(c.getByRole("link", { name: "Book again" })).toBeVisible();
  await customer.close();
});

test("customer profile: haircut notes, GDPR export and deletion", async ({ page }) => {
  await signUp(page, "Dora Owner", uniqueEmail("crm"));
  await createShop(page, `CRM Shop ${Date.now().toString(36)}`);
  await addService(page, "Haircut", "30", "15");

  // Book a walk-in for a new customer from the calendar.
  await page.goto("/app/appointments?new=1");
  const drawer = page.getByRole("dialog", { name: "New appointment" });
  await drawer.getByLabel("Date").fill(nextTuesday()); // a fixed open weekday, so the test doesn't depend on today's date
  await drawer.getByRole("listbox", { name: "Free times" }).getByRole("option").first().click();
  await drawer.getByRole("button", { name: "New customer" }).click();
  await drawer.getByLabel("Name").fill("Hugo Ribeiro");
  await drawer.getByLabel("Phone").fill("913000555");
  await drawer.getByRole("button", { name: "Book appointment" }).click();
  const appt = page.getByRole("dialog", { name: "Appointment" });
  await expect(appt.getByRole("heading", { name: "Hugo Ribeiro" })).toBeVisible();

  // Haircut note from the appointment panel.
  await appt.getByLabel("New note").fill("Low fade, #2 on top");
  await appt.getByRole("button", { name: "Add note" }).click();
  await expect(appt.getByText("Low fade, #2 on top")).toBeVisible();

  // Customer profile.
  await page.goto("/app/customers");
  await page.getByRole("link", { name: /Hugo Ribeiro/ }).click();
  await expect(page.getByText("Low fade, #2 on top")).toBeVisible();
  await page.getByLabel("Hair preferences").fill("Always skin fade");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Customer saved.")).toBeVisible();

  // GDPR export.
  const exportRes = await page.request.get(page.url() + "/export");
  expect(exportRes.status()).toBe(200);
  const json = await exportRes.json();
  expect(json.customer.name).toBe("Hugo Ribeiro");
  expect(json.notes[0].body).toBe("Low fade, #2 on top");

  // GDPR erasure.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete data" }).click();
  await expect(page.getByText("The customer's personal data was deleted.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Hugo Ribeiro/ })).toHaveCount(0);
});
