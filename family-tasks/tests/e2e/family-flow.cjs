/**
 * End-to-end: two family members in separate browsers.
 *   node tests/e2e/family-flow.cjs [baseUrl] [screenshotDir]
 * Requires the app (`npm run build && npm start`) and local Supabase running.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const BASE = process.argv[2] || "http://localhost:3000";
const SHOTS = process.argv[3] || null;
const run = Date.now().toString(36);

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function signUp(page, name) {
  await page.goto(`${BASE}/login?mode=signup`);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(`${name.toLowerCase()}-${run}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
}

(async () => {
  const browser = await chromium.launch();
  const parentCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const childCtx = await browser.newContext({ ...require("playwright").devices["iPhone 14"] });
  const parent = await parentCtx.newPage();
  const child = await childCtx.newPage();
  const errors = [];
  for (const p of [parent, child]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  }
  const step = (s) => console.log("✓", s);

  // --- Parent signs up and creates a family
  await parent.goto(`${BASE}/login`);
  await shot(parent, "01-login");
  await signUp(parent, "Ana");
  await parent.waitForURL("**/onboarding");
  await shot(parent, "02-onboarding");
  await parent.getByRole("button", { name: /create a family/i }).click();
  await parent.getByPlaceholder("e.g. The Silva Family").fill("The Silvas");
  await parent.getByRole("button", { name: /create family/i }).click();
  await parent.waitForURL("**/dashboard");
  await parent.getByText("Good", { exact: false }).first().waitFor();
  step("parent created family and landed on dashboard");

  // --- Invite code
  await parent.goto(`${BASE}/members`);
  const code = (await parent.getByTestId("invite-code").textContent()).trim();
  assert.match(code, /^[A-Z2-9]{8}$/);
  step(`invite code ${code}`);

  // --- Child signs up via invite link
  await child.goto(`${BASE}/join/${code}`);
  await child.waitForURL("**/login**");
  await child.getByRole("radio", { name: "Sign up" }).click();
  await child.getByLabel("Your name").fill("Leo");
  await child.getByLabel("Email").fill(`leo-${run}@example.com`);
  await child.getByLabel("Password").fill("password123");
  await child.getByRole("button", { name: /create account/i }).click();
  await child.waitForURL("**/onboarding?code=*");
  assert.equal(await child.locator("input").first().inputValue(), code);
  await child.getByRole("button", { name: /join family/i }).click();
  await child.waitForURL("**/dashboard");
  step("child joined via invite link");

  // parent sees the new member appear live
  await parent.goto(`${BASE}/dashboard`);
  await parent.getByTestId("member-card").nth(1).waitFor({ timeout: 10000 });
  step("parent dashboard shows both members");

  // --- Parent creates a recurring task for Leo
  await parent.goto(`${BASE}/tasks/new`);
  await parent.getByLabel("Title").fill("Take out the rubbish");
  await parent.getByLabel("Description").fill("Bins go out by 7pm. Recycling every other week.");
  await parent.getByRole("button", { name: "Leo" }).click();
  await parent.getByRole("button", { name: "Errands" }).click();
  await parent.getByRole("radio", { name: /high/i }).click();
  await parent.getByRole("button", { name: "Today" }).click();
  await parent.getByLabel("Due time").fill("19:00");
  await parent.getByRole("radio", { name: "Weekly" }).click();
  await shot(parent, "03-task-create");
  await parent.getByRole("button", { name: /create task/i }).click();
  await parent.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  await parent.getByTestId("task-title").waitFor();
  await shot(parent, "04-task-detail");
  step("parent created weekly task for Leo");

  // second, one-off task for the parent's own list
  await parent.goto(`${BASE}/tasks/new`);
  await parent.getByLabel("Title").fill("Weekly food shop");
  await parent.getByRole("button", { name: "Me" }).click();
  await parent.getByRole("button", { name: "Shopping" }).click();
  await parent.getByRole("button", { name: "Tomorrow" }).click();
  await parent.getByRole("button", { name: /create task/i }).click();
  await parent.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);

  // --- Child gets a live notification
  const bell = child.getByTestId("bell");
  await child.waitForFunction(() => /unread/.test(document.querySelector('[data-testid="bell"]')?.getAttribute("aria-label") || ""), null, { timeout: 10000 });
  step("child received assignment notification in real time");
  await bell.click();
  await child.getByRole("link", { name: /Ana assigned you a task/ }).waitFor();
  await shot(child, "05-mobile-notifications");
  await bell.click();

  // --- Parent watches the dashboard while the child completes the task
  await parent.goto(`${BASE}/dashboard`);
  await parent.getByTestId("stat-completed").waitFor();
  assert.equal(await parent.getByTestId("stat-completed").textContent(), "0");
  await shot(parent, "06-dashboard-before");

  await child.goto(`${BASE}/me`);
  const checkbox = child.getByRole("checkbox", { name: /mark "take out the rubbish" as done/i });
  await checkbox.waitFor();
  await shot(child, "07-mobile-my-tasks");
  await checkbox.click();
  await child.getByText("Nice work!").waitFor();
  step("child ticked off the task");

  await parent.waitForFunction(
    () => document.querySelector('[data-testid="stat-completed"]')?.textContent === "1",
    null,
    { timeout: 10000 },
  );
  const pct = await parent.getByTestId("family-completion").textContent();
  assert.equal(pct, "50%");
  step(`parent dashboard updated live without reload (completion ${pct})`);
  await parent.getByText("Leo completed a task").first().waitFor({ timeout: 10000 });
  step("parent got a completion notification");
  await parent.waitForTimeout(600);
  await shot(parent, "08-dashboard-after");

  // next weekly occurrence exists
  await child.waitForTimeout(500);
  const pending = await child.locator('[data-testid="task-item"][data-status="pending"]').count();
  assert.equal(pending, 1, "next weekly occurrence should be on Leo's list");
  step("next weekly occurrence was created");

  // --- Undo
  await child.getByRole("checkbox", { name: /as not done/i }).first().scrollIntoViewIfNeeded().catch(() => {});
  await child.goto(`${BASE}/tasks`);
  await child.getByRole("radio", { name: "Completed" }).click();
  await child.getByRole("checkbox", { name: /mark "take out the rubbish" as not done/i }).click();
  await parent.waitForFunction(
    () => document.querySelector('[data-testid="stat-completed"]')?.textContent === "0",
    null,
    { timeout: 10000 },
  );
  step("undo propagated to parent dashboard");

  // --- Members can't tick off someone else's task
  await child.goto(`${BASE}/tasks`);
  const other = child.getByRole("checkbox", { name: /weekly food shop/i });
  assert.equal(await other.isDisabled(), true);
  step("child can't complete the parent's task");

  // --- Rewards & activity & other screens
  await parent.goto(`${BASE}/rewards`);
  await parent.getByRole("button", { name: /new reward/i }).click();
  await parent.getByLabel("Reward", { exact: true }).fill("Pick the Friday movie");
  await parent.getByLabel("Cost (points)").fill("50");
  await parent.getByRole("button", { name: /save reward/i }).click();
  await parent.getByRole("button", { name: /new challenge/i }).click();
  await parent.getByLabel("Challenge", { exact: true }).fill("20 tasks this week");
  await parent.getByLabel("Family reward").fill("Pizza night");
  await parent.getByRole("button", { name: /save challenge/i }).click();
  await parent.getByText("Pizza night", { exact: false }).first().waitFor();
  await shot(parent, "09-rewards");
  step("rewards + challenge created");

  await child.goto(`${BASE}/rewards`);
  await child.getByText("Pick the Friday movie").waitFor();
  step("child sees new reward");

  for (const [path, name] of [["/activity", "10-activity"], ["/members", "11-members"], ["/settings", "12-settings"], ["/me", "13-me"], ["/tasks", "14-tasks"]]) {
    await parent.goto(`${BASE}${path}`);
    await parent.waitForTimeout(700);
    await shot(parent, name);
  }
  await child.goto(`${BASE}/dashboard`);
  await child.waitForTimeout(700);
  await shot(child, "15-mobile-dashboard");
  await child.goto(`${BASE}/tasks/new`);
  await child.waitForTimeout(500);
  await shot(child, "16-mobile-new-task");

  // dark mode
  await parent.goto(`${BASE}/settings`);
  await parent.getByRole("radio", { name: "Dark" }).click();
  await parent.goto(`${BASE}/dashboard`);
  await parent.waitForTimeout(700);
  await shot(parent, "17-dashboard-dark");

  // --- Isolation: a third user sees none of it
  const outsiderCtx = await browser.newContext();
  const outsider = await outsiderCtx.newPage();
  await signUp(outsider, "Eve");
  await outsider.waitForURL("**/onboarding");
  await outsider.goto(`${BASE}/dashboard`);
  await outsider.waitForURL("**/onboarding");
  step("user without a family is kept on onboarding");

  const real = errors.filter((e) => !/Failed to load resource|favicon|WebSocket/i.test(e));
  assert.deepEqual(real, [], "no page errors");
  step("no console/page errors");
  await browser.close();
  console.log("\nE2E passed");
})().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
