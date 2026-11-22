import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addService, createShop, nextTuesday, signUp, uniqueEmail } from "./helpers";

/** Fails on serious or critical WCAG 2.1 AA problems, and on sideways scrolling at the current width. */
async function audit(page: Page, label: string) {
  // Let entry animations finish, so axe measures final colours rather than a half-faded page.
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, `${label} accessibility`).toEqual([]);
  const overflow = await page.evaluate(() => {
    const extra = document.documentElement.scrollWidth - window.innerWidth;
    if (extra <= 0) return { extra, culprits: [] as string[] };
    // Name the widest elements sticking out, to make failures actionable.
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .filter((el) => !el.closest("[data-scroll-x]"))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")} (${Math.round(el.getBoundingClientRect().right)}px)`);
    return { extra, culprits };
  });
  expect(overflow, `${label} horizontal overflow`).toEqual({ extra: expect.any(Number), culprits: [] });
  expect(overflow.extra, `${label} horizontal overflow`).toBeLessThanOrEqual(0);
}

for (const device of [
  { name: "desktop", viewport: { width: 1280, height: 800 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, colorScheme: "dark" as const },
]) {
  test(`accessibility and layout on ${device.name}`, async ({ browser }) => {
    test.setTimeout(240_000); // audits ~30 screens
    const ctx = await browser.newContext({ viewport: device.viewport, colorScheme: "colorScheme" in device ? device.colorScheme : "light" });
    const page = await ctx.newPage();
    for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
      await page.goto(path);
      await audit(page, path);
    }
    await signUp(page, "Ana Access", uniqueEmail(`a11y-${device.name}`));
    await audit(page, "/onboarding");
    await createShop(page, `A11y Shop ${device.name} ${Date.now().toString(36)}`);
    await addService(page, "Haircut", "30", "15");
    await page.goto("/app/settings/booking");
    const bookingUrl = (await page.getByTestId("booking-url").textContent())!.trim();
    await page.getByLabel("Accept online bookings").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Online booking settings saved.")).toBeVisible();

    const pages = [
      "/app",
      `/app/appointments?view=day&date=${nextTuesday()}`,
      `/app/appointments?view=week&date=${nextTuesday()}`,
      `/app/appointments?view=month&date=${nextTuesday()}`,
      `/app/appointments?view=day&date=${nextTuesday()}&new=1`,
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
      "/app/settings/account",
      "/barber",
      "/barber/calendar",
      "/barber/customers",
      "/barber/earnings",
      "/barber/profile",
      "/barber/new",
    ];
    for (const path of pages) {
      await page.goto(path);
      await audit(page, path);
    }
    // Public booking flow.
    await page.goto(bookingUrl);
    await audit(page, "booking: services");
    await page.getByRole("link", { name: /Haircut/ }).click();
    await audit(page, "booking: barber");
    await page.getByRole("link", { name: /Ana Access/ }).click();
    await audit(page, "booking: times");
    await page.getByRole("link", { name: /^\d{2}:\d{2}$/ }).first().click();
    await audit(page, "booking: details");
    await ctx.close();
  });
}
