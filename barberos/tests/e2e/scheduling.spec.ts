import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, addService, createShop, nextTuesday, signUp, uniqueEmail } from "./helpers";

const TUE = nextTuesday();

async function bookNew(page: Page, opts: { time: string; customer: string; phone: string; barber?: string }) {
  await page.goto(`/app/appointments?view=day&date=${TUE}&new=1`);
  const drawer = page.getByRole("dialog", { name: "New appointment" });
  if (opts.barber) await drawer.getByLabel("Barber").selectOption({ label: opts.barber });
  await drawer.getByRole("option", { name: opts.time, exact: true }).click();
  await drawer.getByRole("button", { name: "New customer" }).click();
  await drawer.getByLabel("Name").fill(opts.customer);
  await drawer.getByLabel("Phone").fill(opts.phone);
  await drawer.getByRole("button", { name: "Book appointment" }).click();
  const details = page.getByRole("dialog", { name: "Appointment" });
  await expect(details.getByRole("heading", { name: opts.customer })).toBeVisible();
  return details;
}

test("owner sets up services, books, reschedules and cancels on the calendar", async ({ page }) => {
  await signUp(page, "Marta Owner", uniqueEmail("sched"));
  await createShop(page, `Sched Shop ${Date.now().toString(36)}`);
  await addService(page, "Haircut", "30", "15");

  // Book through the drawer. The new appointment opens straight away.
  const details = await bookNew(page, { time: "10:00", customer: "João Pereira", phone: "912000001" });
  await expect(details).toContainText("Haircut · 30 min · €15");
  await expect(details).toContainText("10:00–10:30");

  // It's on the day view.
  await page.goto(`/app/appointments?view=day&date=${TUE}`);
  await expect(page.getByRole("link", { name: /João Pereira/ })).toBeVisible();

  // The taken slot isn't offered, and typing it anyway is refused.
  await page.goto(`/app/appointments?view=day&date=${TUE}&new=1`);
  const drawer = page.getByRole("dialog", { name: "New appointment" });
  await expect(drawer.getByRole("option", { name: "10:30", exact: true })).toBeVisible();
  await expect(drawer.getByRole("option", { name: "10:00", exact: true })).toHaveCount(0);
  await drawer.getByLabel("Start time").fill("10:15");
  await drawer.getByRole("button", { name: "New customer" }).click();
  await drawer.getByLabel("Name").fill("Someone Else");
  await drawer.getByRole("button", { name: "Book appointment" }).click();
  await expect(drawer.getByText("That barber is already booked at this time.")).toBeVisible();

  // Returning customers are found by name.
  await page.goto(`/app/appointments?view=day&date=${TUE}&new=1`);
  await page.getByRole("dialog").getByLabel("Customer", { exact: true }).fill("joão");
  await expect(page.getByRole("option", { name: /João Pereira/ })).toBeVisible();

  // Clicking an empty slot on the grid opens the form at that time.
  await page.goto(`/app/appointments?view=day&date=${TUE}`);
  await page.getByRole("link", { name: /^Book Marta Owner at 14:00$/ }).click();
  await expect(page.getByRole("dialog", { name: "New appointment" }).getByLabel("Start time")).toHaveValue("14:00");

  // Reschedule from the appointment drawer.
  await page.goto(`/app/appointments?view=day&date=${TUE}`);
  await page.getByRole("link", { name: /João Pereira/ }).click();
  const appt = page.getByRole("dialog", { name: "Appointment" });
  await appt.getByRole("button", { name: "Reschedule" }).click();
  await appt.getByRole("option", { name: "11:00", exact: true }).click();
  await appt.getByRole("button", { name: "Move appointment" }).click();
  await expect(appt.getByText("Appointment moved.")).toBeVisible();
  await expect(appt).toContainText("11:00–11:30");
  await expect(appt).toContainText(/Moved from .* 10:00 to .* 11:00/);

  // Completing is only possible once it has started.
  await expect(appt.getByRole("button", { name: "Mark completed" })).toBeDisabled();

  // Cancel with a reason. The slot frees up.
  await appt.getByRole("button", { name: "Cancel" }).click();
  await appt.getByLabel("Reason (optional)").fill("Customer called");
  await appt.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(appt.getByText("Cancellation reason: Customer called")).toBeVisible();
  await page.goto(`/app/appointments?view=day&date=${TUE}&new=1`);
  await expect(page.getByRole("dialog").getByRole("option", { name: "11:00", exact: true })).toBeVisible();
});

test("barber profiles, hours and the barber's own phone view", async ({ page, browser }) => {
  const barberEmail = uniqueEmail("rui");
  await signUp(page, "Ana Owner", uniqueEmail("staff"));
  await createShop(page, `Staff Shop ${Date.now().toString(36)}`);
  await addService(page, "Skin fade", "45", "20");

  // Invite a barber, who accepts.
  await page.goto("/app/staff");
  await page.getByLabel("Email").fill(barberEmail);
  await page.getByRole("button", { name: "Send invite" }).click();
  const inviteUrl = (await page.getByTestId("invite-link").textContent())!.trim();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const barber = await ctx.newPage();
  await barber.goto(inviteUrl);
  await barber.getByRole("link", { name: "Create account and join" }).click();
  await barber.getByLabel("Your name").fill("Rui Barber");
  await barber.getByLabel("Password").fill(PASSWORD);
  await barber.getByRole("button", { name: "Create account" }).click();
  await barber.getByRole("button", { name: /^Join/ }).click();
  await expect(barber).toHaveURL(/\/barber$/);

  // The barber got the shop's hours and services automatically. The owner gives them Tuesday off from 13:00.
  await page.goto("/app/staff");
  await page.getByRole("link", { name: /Rui Barber/ }).click();
  await expect(page.getByText("Skin fade")).toBeVisible();
  await page.getByLabel("Tuesday closes at").fill("13:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByText("Working hours saved.")).toBeVisible();

  // Rui's afternoon isn't bookable.
  await page.goto(`/app/appointments?view=day&date=${TUE}&new=1`);
  const drawer = page.getByRole("dialog", { name: "New appointment" });
  await drawer.getByLabel("Barber").selectOption({ label: "Rui Barber" });
  await expect(drawer.getByRole("option", { name: "12:15", exact: true })).toBeVisible();
  await expect(drawer.getByRole("option", { name: "12:30", exact: true })).toHaveCount(0);
  await bookNew(page, { barber: "Rui Barber", time: "09:00", customer: "Carlos Mendes", phone: "913000001" });
  await bookNew(page, { time: "09:00", customer: "Owner Client", phone: "913000002" });

  // On the phone, Rui sees only his own appointment.
  await barber.goto("/barber/calendar");
  await expect(barber.getByText("Carlos Mendes")).toBeVisible();
  await expect(barber.getByText("Owner Client")).toHaveCount(0);
  await barber.getByRole("link", { name: /Carlos Mendes/ }).click();
  await expect(barber.getByRole("heading", { name: "Carlos Mendes" })).toBeVisible();
  await barber.getByLabel("Internal note").fill("Likes a low fade");
  await barber.getByRole("button", { name: "Save note" }).click();
  await expect(barber.getByText("Note saved.")).toBeVisible();

  // And he can't open the shared calendar.
  await barber.goto("/app/appointments");
  await expect(barber).toHaveURL(/\/barber$/);
  await ctx.close();
});
