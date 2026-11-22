import { expect, test } from "@playwright/test";
import { addService, createShop, signUp, uniqueEmail } from "./helpers";

/** The most recent Tuesday at least 1 day ago (default shop hours: Tue–Sat). */
function lastTuesday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

test("take payment with tip, see it in finance, void and re-take it, barber earnings", async ({ page }) => {
  await signUp(page, "Fred Owner", uniqueEmail("money"));
  await createShop(page, `Money Shop ${Date.now().toString(36)}`);
  await addService(page, "Haircut", "30", "15");

  // Commission rule: 40% for everyone.
  await page.goto("/app/finance/commissions");
  await expect(page.getByText("No default rule yet.")).toBeVisible();
  await page.getByLabel("Percentage").fill("40");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Commission rule saved.")).toBeVisible();

  // A visit that already happened (logged afterwards by staff).
  await page.goto(`/app/appointments?view=day&date=${lastTuesday()}&new=1`);
  const drawer = page.getByRole("dialog", { name: "New appointment" });
  await drawer.getByLabel("Start time").fill("10:00");
  await drawer.getByRole("button", { name: "New customer" }).click();
  await drawer.getByLabel("Name").fill("Paulo Pays");
  await drawer.getByLabel("Phone").fill("913111222");
  await drawer.getByRole("button", { name: "Book appointment" }).click();
  const appt = page.getByRole("dialog", { name: "Appointment" });
  await expect(appt.getByRole("heading", { name: "Paulo Pays" })).toBeVisible();

  // Take payment: card is the default. Choose cash and add a €2 tip.
  const payBox = appt.getByRole("region", { name: "Take payment" });
  await payBox.getByRole("radio", { name: "Cash" }).click();
  await payBox.getByLabel("Tip (optional)").fill("2");
  await expect(payBox.getByTestId("payment-total")).toHaveText("€17");
  await payBox.getByRole("button", { name: "Record payment" }).click();
  await expect(appt.getByText("Paid · Cash")).toBeVisible();
  await expect(appt.getByText("Completed", { exact: true })).toBeVisible();

  // Finance shows it (tips aren't revenue).
  await page.goto("/app/finance?p=today");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("€15");
  await expect(page.getByTestId("kpi-commissions")).toHaveText("€6");
  await expect(page.getByTestId("kpi-estimated-profit")).toHaveText("€9");

  // Void it: everything goes back to zero.
  await page.goto("/app/finance/payments?p=today");
  await page.getByRole("button", { name: "Void payment" }).click();
  await page.getByLabel("Why is it being voided?").fill("Wrong amount");
  await page.getByRole("button", { name: "Void payment" }).last().click();
  await expect(page.getByText("Voided: Wrong amount")).toBeVisible();
  await page.goto("/app/finance?p=today");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("€0");

  // Take it again from the appointment (card this time).
  await page.goto(`/app/appointments?view=day&date=${lastTuesday()}`);
  await page.getByRole("link", { name: /Paulo Pays/ }).click();
  const again = page.getByRole("dialog", { name: "Appointment" }).getByRole("region", { name: "Take payment" });
  await again.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Paid · Card")).toBeVisible();

  // The owner cuts hair too, so their barber app shows the commission.
  await page.goto("/barber/earnings?p=today");
  await expect(page.getByTestId("my-commission")).toHaveText("€6");

  // CSV export.
  const csv = await page.request.get("/app/reports/payments?p=today");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Paulo Pays");
});

test("inventory: add a product, sell it at the counter, stock goes down", async ({ page }) => {
  await signUp(page, "Gina Owner", uniqueEmail("stock"));
  await createShop(page, `Stock Shop ${Date.now().toString(36)}`);
  await page.goto("/app/inventory");
  await page.getByLabel("Name").fill("Matte clay");
  await page.getByLabel("Cost price").fill("6");
  await page.getByLabel("Selling price").fill("15");
  await page.getByLabel("Opening stock").fill("4");
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("link", { name: /Matte clay/ })).toContainText("4");

  await page.goto("/app/finance/payments?p=today");
  await page.getByLabel("Add a product").selectOption({ label: "Matte clay · €15 (4 in stock)" });
  await page.getByLabel("Quantity of Matte clay").selectOption("2");
  await expect(page.getByTestId("payment-total")).toHaveText("€30");
  await page.getByRole("button", { name: "Record sale" }).click();
  await expect(page.getByText("Walk-in sale")).toBeVisible();

  await page.goto("/app/inventory");
  await expect(page.getByRole("link", { name: /Matte clay/ })).toContainText("Low stock");
  await page.getByRole("link", { name: /Matte clay/ }).click();
  await expect(page.getByText("Sold", { exact: true })).toBeVisible();
  await expect(page.getByText("In stock:")).toContainText("2");
});
