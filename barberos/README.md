# BarberOS

**Everything your barbershop needs, in one place.**

BarberOS is a management platform for independent barbershops with 2–5 barbers. It has three surfaces on one backend:

| Surface | Path | Who |
|---|---|---|
| Owner dashboard | `/app` | Owners and managers (desktop/tablet) |
| Barber app | `/barber` | Barbers (mobile-first) |
| Public booking | `/book/{shop}` | Customers (no account) |

The full architecture, schema and roadmap are in [`docs/PROPOSAL.md`](docs/PROPOSAL.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Project setup, database, auth, shop creation, roles | ✅ Done |
| 2 | Staff profiles & hours, services, availability, appointment calendar | ✅ Done |
| 3 | Public booking, customer profiles, haircut notes, GDPR | ✅ Done |
| 4 | Payments, revenue, commissions, expenses, inventory, reports | ✅ Done |
| 5 | Hardening, mobile polish, security review | Next |

### What works today

#### Phase 4: money

- **Take payment from the appointment panel** (dashboard and barber app):
  - The service price is pre-filled and can be edited for discounts.
  - Add products, a tip, and the method (card, cash, transfer or other), with a live total.
  - Recording a payment marks the appointment completed.
  - Double taps can't create two payments (idempotency key), and an appointment can only have one active payment (database constraint, race-tested).
  - Barbers can take payment for their own appointments if the shop allows it.
- **Void, never delete:**
  - Voiding needs a reason.
  - Each commission it created gets a matching negative reversal record, and sold products go back into stock.
  - The appointment can then be paid again correctly.
- **Commission rules** (owner only):
  - A percentage or a fixed amount per item.
  - Scopes: shop default, per barber, per service, or per barber + service. The most specific rule wins.
  - Product-sale commission is set separately.
  - Rules are never edited in place. Each commission line stores the rule it used, so changing a rule never rewrites history.
- **Finance**, with periods for today, this week, this month, last month, or custom dates:
  - Revenue, commissions, expenses (recorded expenses + product cost) and **estimated profit = revenue − product cost − commissions − expenses**. Integration tests check that these reconcile.
  - A daily revenue chart with tooltips and a table view.
  - Breakdowns by barber (revenue, commission, tips), by service and by payment method.
  - A payments ledger with voided entries kept, and a counter sale for walk-in product purchases.
  - Commissions "to pay out" per barber, each line with its rule and base.
  - Expenses by category (removable, never deleted).
  - Tips are tracked separately and aren't counted as shop revenue.
- **Inventory:**
  - Products with cost and selling price.
  - Deliveries (which update the cost), in-shop usage, and stock-count corrections.
  - An append-only stock history, plus low-stock badges and an alert on the Overview.
- **Reports:** CSV downloads of payments, commissions and appointments for any period. Excel-safe, with protection against formula injection.
- **Barber Earnings tab:** today, this week or this month: commission, tips, services done, sales made, and recent paid items.
- **Overview:** revenue today and this month, estimated profit, and low stock.
- **Access:**
  - Owners see everything.
  - Managers see finance only if the shop setting allows it, and can never change commission rules.
  - Barbers see only their own earnings.
- **Data integrity:** payments, payment lines, commission records, inventory movements and expenses can't be deleted by the app. Payment lines, commission records and stock movements can't be edited either.

#### Phase 3: online booking and customers

- **Public booking page** at `/book/{shop}`. It's mobile-first and customers don't need an account.
  - Steps: service, then barber (or **any barber**), then a 14-day date strip with only real free times, then the customer's details, then confirmation.
  - "Any barber" bookings go to whoever has the fewest appointments that day.
  - The shop's address, phone and opening hours are shown. The shop can pick an accent colour.
  - Spam protection: a hidden honeypot field plus per-IP rate limits on booking and managing.
- **Online booking settings** (Settings → Online booking):
  - An on/off switch (closed by default).
  - Minimum notice, how far ahead customers can book, cancellation window, and slot interval.
  - Auto-confirm, or hold bookings as *pending* for review.
  - Whether email is required. Phone is always required.
- **Manage my booking:** after booking, the customer gets a private link (also emailed). From there they can:
  - see the booking;
  - add it to their calendar (`.ics`);
  - change the date or time, or cancel, until the cancellation window, after which they're asked to call.
  - Bookings made and changed online land in the shop's calendar immediately, and the history shows "customer" as the actor.
- **Emails through an outbox:**
  - Confirmation, rescheduled and cancelled emails are written in the same transaction as the change, then sent right after the response.
  - Failed sends are retried with backoff by `/api/cron/outbox`.
  - Customers are also emailed when staff cancel or move their booking.
  - Reminders and re-engagement will be new templates on the same queue.
- **Customers (CRM):**
  - Searchable list with visits, last visit and next booking.
  - Profile with contact details, standing hair preferences, preferred barber, marketing consent, stats (visits, upcoming, no-shows, average days between visits) and full appointment history.
- **Haircut notes:**
  - A timeline on the customer profile, also shown inside every appointment panel, so the barber sees how the customer had it last time.
  - Barbers can add notes and delete their own. Owners and managers can delete any.
- **Barber Customers tab:** barbers see only the customers they've served or are booked with.
- **GDPR:**
  - **Export** a customer's data as JSON (owners and managers).
  - **Delete** a customer's personal data (owner only). This anonymises them: name, contact details and notes are wiped, future bookings are cancelled, and past visit counts are kept without identifying anyone.
  - Both actions are audited.
  - The booking page has a privacy page.
- **Deleting a shop removes all of its data.** Every tenant table has a direct `shop_id` foreign key with cascade.

#### Phase 2: scheduling

- **Services & prices** (Settings → Services):
  - Each service has a duration, a clean-up buffer, a price, a staff-only option and a list of the barbers who offer it.
  - Services are deactivated rather than deleted.
  - Each booking keeps a copy of the price and duration, so later edits never rewrite history.
- **Barber profiles** (Staff → a barber):
  - Calendar colour, bio and whether customers can book them online.
  - Weekly working hours, with split shifts.
  - Which services they offer, with an optional per-barber price or duration.
  - Time off: all day or by the hour, entered in the shop's time zone.
  - Barbers who don't use the app can still have a profile and be booked.
- **New barbers start ready:** profiles get the shop's opening hours and all active services automatically.
- **Shop closures** (Settings → Opening hours): holidays and vacations block every barber.
- **Availability engine** (`src/server/domain/scheduling/availability.ts`):
  - A time is free only if the shop is open, the barber is working, they have no time off that day, and the barber has no other booking in that slot (including that booking's buffer).
  - It works on real instants, so daylight-saving changes are handled.
  - Slots follow the shop's grid (15-minute steps by default).
- **Shared calendar** (Appointments):
  - Day view has a column per barber. Week view shows 7 days for one barber or everyone. Month view shows each day's count and a preview.
  - Barber filter, a "now" line, hatched off-hours, and labelled time off and closures.
  - Clicking an empty half-hour opens the booking form at that time.
- **Booking form:**
  - Choose barber, service and date, then pick one of the real free times or type any time.
  - Search for an existing customer, or add a new one inline. Returning customers are matched by their phone number, whatever the format.
  - Optional walk-in flag and internal note.
  - Owners and managers can book outside working hours on purpose. Barbers can't.
- **Appointment panel:**
  - Status actions: Confirm, Complete, No-show, Cancel with a reason. Completed and No-show only unlock once the appointment has started.
  - Reschedule, including moving to another barber.
  - Internal note and full change history.
- **No double bookings:** a Postgres exclusion constraint makes overlaps impossible even when two people book the same slot at the same instant. If someone else edits an appointment first, your edit is rejected rather than overwriting theirs.
- **Barber app:**
  - Today shows the day's appointments and counts.
  - Calendar shows the next 14 days.
  - Barbers can open an appointment to update its status, reschedule it or add a note, and can book walk-ins for themselves.
  - Barbers only ever see their own appointments.
- **Overview:** today's and this week's appointment counts, cancellations and no-shows, the next appointments, and a setup checklist.

#### Phase 1: foundation

- Sign up, sign in, sign out, forgot/reset password, change password, edit name.
- Onboarding wizard: shop name, booking link, time zone, currency, opening hours (with split shifts), and an "I cut hair too" option that creates the owner's barber profile.
- Owner/manager dashboard: Overview (open/closed status in the shop's time zone, today's hours, team, setup checklist), Staff, and Settings (shop profile, opening hours, account).
- Team management: email invitations with copyable one-time links (7-day expiry), roles (owner / manager / barber), role changes, deactivate/reactivate, and pending-invite cancellation.
- Barber mobile app: Today and Profile tabs, plus shop switching for people in several shops.
- Role-based routing: barbers are sent to `/barber` and can't open the owner dashboard.
- Every section in the navigation is now live. There are no dead buttons.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · PostgreSQL 16 · Drizzle ORM · Better Auth · Zod · Tailwind CSS 4 · Vitest · Playwright.

## Security model

- **Tenant isolation in three layers:**
  - Every query runs through `withTenantTx`, which sets a transaction-local `app.shop_id`.
  - Postgres **row-level security** policies filter every tenant table by that setting.
  - Composite `(shop_id, id)` foreign keys make cross-shop references impossible.
- The app connects as a **restricted role** (`barberos_app`) that owns no tables, so RLS always applies to it. Migrations run as a separate owner role.
- **Fail closed:** without a tenant context, tenant tables return zero rows.
- **Append-only audit log** of sensitive actions. The app role has no `UPDATE`/`DELETE` on it.
- **Invitation tokens:** 256-bit random, stored only as SHA-256 hashes, one-time use, and the accepting account's email must match the invitation.
- **Auth:** Better Auth over HTTP endpoints with origin/CSRF checks, scrypt password hashing, DB-backed rate limiting (sign-in 10/min, sign-up 5/min, reset 3/min), and sessions revoked on password reset.
- **Authorization:** the server checks a role permission map (`src/server/authz/permissions.ts`) on every action. The UI only uses it to hide things.

## Try it in your browser

No installation needed: [open BarberOS in GitHub Codespaces](https://codespaces.new/luisggcalves-ops/luisggcalves-ops?ref=claude/nifty-ramanujan-peplt0). See [CODESPACES.md](CODESPACES.md).

## Getting started

Requirements: Node 22+ and PostgreSQL 16 (local, or via Docker).

1. Start Postgres. The init script creates the roles and databases.

   With Docker:

   ```bash
   docker compose up -d
   ```

   Or, with a local PostgreSQL 16, run as a superuser:

   ```bash
   psql -U postgres -f scripts/db/init-local.sql
   ```

2. Configure the environment. The example values work for local use. For anything shared, set `BETTER_AUTH_SECRET` in `.env` to a random 32+ character value (for example from `openssl rand -base64 32`):

   ```bash
   cp .env.example .env
   ```

3. Install, migrate, load the demo shop and run:

   ```bash
   npm install
   npm run db:migrate
   npm run seed:demo
   npm run dev
   ```

Open http://localhost:3000 and sign in with a demo account (password `barberos-demo`):

| Account | What you'll see |
|---|---|
| `owner@demo.barberos.test` | Owner dashboard with 3 barbers, 5 services, a week of bookings, payments, commissions, products and expenses |
| `barber@demo.barberos.test` | The barber phone app (open it in your browser's phone view) |

The demo shop's public booking page is open too. The link is under Settings → Online booking. The demo shop is flagged as demo data and shows a banner on every screen. You can also create your own shop with **Get started**. Without `RESEND_API_KEY`, emails (password resets, invites) are printed in the server console.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | Generate a migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (uses `MIGRATION_DATABASE_URL`) |
| `npm run seed:demo` | Create the demo shop and accounts (safe to run twice, refuses in production) |
| `npm test` | Unit and integration tests (integration uses the `barberos_test` database) |
| `npm run test:e2e` | Playwright end-to-end tests (desktop and phone) against a production build. Run `npm run build` first. |

## Project layout

```
src/
  app/                 routes: (auth), onboarding, app (owner), barber, invite, api/auth
  components/          ui primitives, app shells, shared feature components
  lib/                 framework-free helpers: validation schemas, time, ids
  server/
    db/                schema, migrations (incl. RLS), client, withTenantTx
    auth/              Better Auth config and session helpers
    authz/             roles and permissions
    domain/            business logic, framework-free and tested:
                         shops, team, services, staff, customers,
                         appointments (status machine, booking rules),
                         scheduling/availability (pure slot engine)
    tenancy.ts         resolves user and active shop for pages and actions
tests/
  unit/ integration/ e2e/
```

## Deployment (when ready)

Recommended: **Vercel + Neon**, both in an EU region.

1. In Neon, create the database with its owner role (used for `MIGRATION_DATABASE_URL`).
2. Create a login role for the app and add it to `barberos_app`, which the first migration creates:

   ```sql
   CREATE ROLE barberos_web LOGIN PASSWORD '…';
   GRANT barberos_app TO barberos_web;
   ```

3. Use that login role in `DATABASE_URL`.
4. Set `BETTER_AUTH_URL` to the public URL. Set `RESEND_API_KEY` and `MAIL_FROM` for real email, and set `CRON_SECRET`.
5. Schedule `GET /api/cron/outbox` every few minutes with `Authorization: Bearer $CRON_SECRET` to retry failed emails. Vercel Cron or any external scheduler works.
6. Run `npm run db:migrate` before each deploy.
