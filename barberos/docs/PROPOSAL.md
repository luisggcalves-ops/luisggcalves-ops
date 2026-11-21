# BarberOS: Technical Proposal

> **Everything your barbershop needs, in one place.**
>
> Status: **proposal for review**. Nothing gets built until this is approved.
> Scope: architecture, database schema, screen structure, business rules, and the delivery plan for the MVP (Phases 1–5).

---

## 1. Summary of recommendations

| Decision | Recommendation | Why |
|---|---|---|
| Application shape | **One full-stack TypeScript app** (modular monolith) serving all three surfaces | A 1–2 person team can run it. One deploy, one database, shared business logic. Modules are split cleanly enough to break out later. |
| Framework | **Next.js (App Router) + React + TypeScript (strict)** | Server-rendered pages, server actions for mutations, one language end to end. Mobile-web booking pages load fast. |
| Database | **PostgreSQL 16+** | Relational integrity, row-level security, and **exclusion constraints** that make double-booking impossible at the database level (§5.2). |
| ORM / migrations | **Drizzle ORM + drizzle-kit** (raw SQL for constraints and RLS) | Typed, close to SQL, works well with transaction-scoped tenant settings. |
| Auth | **Better Auth** (email + password, DB-backed sessions, HTTP-only cookies) | Self-hosted, no per-user fees, data stays in our database. Magic links and Google sign-in can be added later. |
| Validation | **Zod** schemas shared by forms and server | Every server entry point validates its input. Client validation is only for convenience. |
| UI | **Tailwind CSS + Radix primitives** (shadcn/ui-style components, restyled in monochrome) | Accessible primitives and full control of the look, so it doesn't feel like a template. |
| Charts | **Recharts** with a custom monochrome theme | Covers simple, readable charts without extra weight. |
| Email | **Resend**, behind a `Mailer` interface that logs to the console in dev | Booking confirmations now. The same outbox will drive reminders later. |
| Testing | **Vitest** (domain logic, DB integration against a real Postgres) + **Playwright** (end-to-end flows) | The financial and booking rules get exhaustive unit tests. Critical user journeys get e2e tests. |
| Hosting | **Vercel + Neon Postgres, both in an EU region** | Near-zero ops, preview deploys per branch, data stays in the EU (GDPR). |
| Local dev | `docker compose` Postgres + `npm run dev` + seed script | Anyone can run it in five minutes. |

### Alternatives considered

- **Supabase** (Postgres + Auth + RLS as a service). Viable and fast to start. I recommend against it as the *primary* pattern because putting business logic in client-side queries plus RLS makes commission and payment rules harder to keep transactional and testable. We could still use Supabase purely as a Postgres host instead of Neon.
- **Separate API (NestJS/Fastify) + SPA.** Gives cleaner separation for future native apps, but means twice the deploys and plumbing for an MVP. Mitigation: all logic lives in `server/domain/*` services with no Next.js dependencies, so a REST/JSON API for native apps is a thin adapter later.
- **Prisma instead of Drizzle.** Also fine. Drizzle wins slightly on raw-SQL ergonomics (exclusion constraints, RLS, `SET LOCAL`) and cold-start size on serverless.

---

## 2. System architecture

```
                         ┌──────────────────────────── Next.js app ────────────────────────────┐
 Owner / Manager  ──────►│  /app/*      Owner dashboard (desktop/tablet, sidebar layout)        │
 (browser)               │                                                                      │
 Barber           ──────►│  /barber/*   Barber app (mobile-first, bottom tab bar, PWA-ready)    │
 (phone)                 │                                                                      │
 Customer         ──────►│  /book/[shop-slug]/*  Public booking + manage-booking (no account)   │
 (phone)                 │                                                                      │
                         │   Route handlers / Server actions  (thin: parse → authorize → call)  │
                         │                     │                                                │
                         │   server/domain/*   Business logic (pure TS, framework-free)         │
                         │     appointments · availability · customers · staff · services       │
                         │     payments · commissions · finance · inventory · gdpr · audit      │
                         │                     │                                                │
                         │   server/db         Drizzle + tenant-scoped transactions (RLS)       │
                         └─────────────────────┼────────────────────────────────────────────────┘
                                               ▼
                                     PostgreSQL (EU region)
                                     + notification_outbox ──► Mailer worker (cron) ──► Resend
```

### 2.1 Code layout

```
barberos/
  src/
    app/
      (marketing)/             landing, pricing (later)
      (auth)/                  sign-in, sign-up, accept-invite, reset-password
      onboarding/              create shop wizard
      app/[...]                owner/manager dashboard
      barber/[...]             barber mobile app
      book/[slug]/[...]        public booking
      api/                     cron endpoints, webhooks (later)
    server/
      db/                      schema.ts, migrations/, client.ts, tenant.ts (withShopTx)
      auth/                    Better Auth config, session helpers
      authz/                   roles, permission matrix, requirePermission()
      domain/<module>/         service.ts, rules.ts, *.test.ts
      notifications/           outbox, templates, mailer adapters
    lib/                       money.ts, time.ts (shop timezone), phone.ts, ids.ts
    components/ui/             design-system primitives
    components/<feature>/      feature components
  tests/e2e/                   Playwright
  scripts/seed-demo.ts
  docker-compose.yml
```

### 2.2 Request lifecycle (every mutation)

1. **Authenticate.** Resolve the session and get the user.
2. **Resolve tenant.** The active shop comes from a session-bound selection and is verified against `shop_memberships`. Shop IDs sent by the client are never trusted.
3. **Authorize.** `requirePermission(membership, 'appointments.update', resource)` checks role and ownership (for example, a barber may only update *their own* appointments).
4. **Validate.** The Zod schema parses the input.
5. **Execute.** The domain service runs inside `withShopTx(shopId, fn)`, which opens a transaction and runs `SET LOCAL app.shop_id = …` so Postgres RLS applies.
6. **Record.** An audit log row is written in the same transaction for sensitive or financial actions.
7. **Respond.** The caller gets a typed result or a typed error (`SLOT_TAKEN`, `FORBIDDEN`, `VALIDATION`, …) that the UI turns into a readable message.

### 2.3 Tenant isolation, in three layers

1. **Application.** Every query goes through `withShopTx`, and domain services take `ShopContext`, never a raw `shopId` from input.
2. **Schema.** Every tenant table has `shop_id NOT NULL`. Cross-table references use **composite foreign keys `(shop_id, id)`**, so an appointment physically cannot point to another shop's customer or barber.
3. **Database.** **Row-Level Security** is enabled and forced on every tenant table, with policy `shop_id = current_setting('app.shop_id')::uuid`. The app connects as a non-owner role, so even a bug that skips layer 1 returns zero rows.

The public booking surface uses a narrow set of read endpoints that expose only public shop data (services, prices, barber display names, free slots). It never exposes customer data.

---

## 3. Roles and permissions

Roles are per shop (`shop_memberships.role`), so one user could be an owner in one shop and a barber in another.

| Capability | Owner | Manager | Barber |
|---|:-:|:-:|:-:|
| Shop settings, branding, opening hours, booking policy | ✅ | ✅ (except billing/deletion) | — |
| Delete shop, transfer ownership | ✅ | — | — |
| Invite/deactivate staff, assign roles | ✅ | ✅ (barbers only) | — |
| Set any barber's working hours / time off | ✅ | ✅ | Own only (request → approve: *later*) |
| Services & prices | ✅ | ✅ | — |
| View all appointments | ✅ | ✅ | ✅ read-only shared calendar (configurable) |
| Create/edit/cancel any appointment | ✅ | ✅ | Own only |
| Update appointment status | ✅ | ✅ | Own only |
| Customers: view, add notes | ✅ | ✅ | Customers they have served or are booked with |
| Customers: edit contact data, export, delete (GDPR) | ✅ | ✅ export / — delete | — |
| Record payments | ✅ | ✅ | Own appointments (configurable) |
| Void payments | ✅ | ✅ | — |
| Shop-wide revenue, expenses, profit | ✅ | Configurable | — |
| Own earnings & commission | ✅ | ✅ | ✅ |
| Commission rules | ✅ | — | — |
| Inventory | ✅ | ✅ | Record product sale/usage only |
| Audit log | ✅ | — | — |

Permissions are defined as a static map `role → permission[]` in code, plus a few per-shop toggles (marked "configurable"). That is simple to reason about and can be upgraded to custom roles later without a schema rewrite.

---

## 4. Database schema

Conventions:
- IDs are UUID v7 (time-ordered).
- Money is stored as **integer minor units** (`*_cents`) with one `currency` per shop. Floats are never used for money.
- Timestamps are `timestamptz` stored in UTC. Wall-clock fields (opening hours) are `time` plus the shop's IANA `timezone`.
- Soft states (`active`, `status`) are used instead of hard deletes for anything referenced by financial records.
- ✱ means the table is tenant-scoped (`shop_id`, RLS, composite FKs).

### 4.1 Identity and tenancy

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email (citext, unique), name, email_verified_at, created_at | Global identity. No shop data here. |
| `auth_sessions`, `auth_accounts`, `auth_verifications` | Better Auth managed | Password hashes (scrypt/argon2) live in `auth_accounts`. |
| `shops` | id, slug (unique), name, timezone, currency, locale, logo_url, brand_color, phone, email, address, **is_demo**, created_at | Root tenant. |
| `shop_settings` ✱ | shop_id (PK), slot_interval_min (15), booking_lead_time_min (60), booking_horizon_days (60), cancellation_window_hours (24), auto_confirm_online (bool), barbers_see_shared_calendar (bool), barbers_record_payments (bool), managers_see_finance (bool) | Kept separate so settings can grow without touching `shops`. |
| `shop_opening_hours` ✱ | shop_id, weekday (0–6), opens_at, closes_at | Several rows per day allow split shifts (e.g. lunch break). |
| `shop_closures` ✱ | shop_id, starts_on, ends_on, reason | Public holidays, shop vacation. |
| `shop_memberships` ✱ | id, shop_id, user_id, role (`owner`/`manager`/`barber`), status (`active`/`deactivated`), created_at | `UNIQUE(shop_id, user_id)`. Exactly one owner is enforced in the domain layer. |
| `invitations` ✱ | id, shop_id, email, role, staff_member_id, token_hash, expires_at, accepted_at, invited_by | Owner invites barbers by email. |

### 4.2 Staff, services, schedules

| Table | Key columns | Notes |
|---|---|---|
| `staff_members` ✱ | id, shop_id, membership_id (nullable, unique), display_name, bio, avatar_url, calendar_color, is_bookable, active, sort_order | The *barber profile*. It exists before the invite is accepted, and owners who also cut hair get one too. |
| `services` ✱ | id, shop_id, name, description, duration_min, buffer_after_min, price_cents, active, sort_order, is_public | Combos ("Cut + Beard") are their own service in the MVP. |
| `staff_services` ✱ | shop_id, staff_member_id, service_id, price_cents_override, duration_min_override | Which barber offers what, with optional per-barber price or duration. |
| `working_hours` ✱ | shop_id, staff_member_id, weekday, starts_at, ends_at | Recurring weekly template. Several rows per day allowed. |
| `time_off` ✱ | shop_id, staff_member_id, starts_at, ends_at (timestamptz), type (`holiday`/`sick`/`other`), note | Blocks availability. |

### 4.3 Customers and CRM

| Table | Key columns | Notes |
|---|---|---|
| `customers` ✱ | id, shop_id, full_name, phone_e164, email, preferred_staff_member_id, hair_preferences (text), tags (text[]), marketing_consent_at, source (`online`/`staff`/`walk_in`), first_visit_at, last_visit_at, visit_count, created_at, **anonymized_at** | `UNIQUE(shop_id, phone_e164)` recognizes returning customers on online booking. Visit stats are denormalized and updated when an appointment is completed. |
| `customer_notes` ✱ | id, shop_id, customer_id, appointment_id (nullable), author_staff_member_id, kind (`haircut`/`general`), body, created_at, updated_at | Haircut notes ("#2 sides, scissor top, low fade") linked to the visit. |

### 4.4 Appointments

| Table | Key columns | Notes |
|---|---|---|
| `appointments` ✱ | id, shop_id, staff_member_id, customer_id, service_id, **starts_at, ends_at**, status (`pending`/`confirmed`/`completed`/`cancelled`/`no_show`), source (`online`/`staff`/`walk_in`), **snapshots**: service_name, price_cents, duration_min · customer_note, internal_note, manage_token_hash, cancelled_at, cancelled_by (`customer`/`staff`), cancel_reason, created_by_membership_id, created_at, updated_at, version | Snapshots keep history correct after prices change. `version` provides optimistic locking for concurrent edits. |
| `appointment_events` ✱ | id, shop_id, appointment_id, type (`created`/`status_changed`/`rescheduled`/`edited`), from_value, to_value, actor (membership or `customer`), at | Full traceability of every change. |

**Double-booking guard (DB-enforced):**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    staff_member_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));
```

Two customers grabbing the same slot at the same millisecond cannot both succeed. The loser gets a friendly "that time was just taken" message with fresh slots.

### 4.5 Payments, commissions, finance

| Table | Key columns | Notes |
|---|---|---|
| `payments` ✱ | id, shop_id, appointment_id (nullable, for walk-in product sales), customer_id, method (`cash`/`card`/`transfer`/`other`), subtotal_cents, discount_cents, tip_cents, total_cents, tip_staff_member_id, status (`recorded`/`voided`), recorded_by, recorded_at, voided_by, voided_at, void_reason, **idempotency_key** | `UNIQUE(shop_id, idempotency_key)` blocks double submits. Partial unique index: **one non-voided payment per appointment**. |
| `payment_items` ✱ | id, shop_id, payment_id, kind (`service`/`product`), service_id / product_id, staff_member_id, description, quantity, unit_price_cents, discount_cents, total_cents, unit_cost_cents (products) | Line items are where commissions attach. |
| `commission_rules` ✱ | id, shop_id, staff_member_id (nullable), service_id (nullable), applies_to (`services`/`products`), type (`percent`/`fixed`), percent_bps / amount_cents, effective_from, effective_to, created_by | Percent is stored in basis points (40% = 4000). |
| `commission_records` ✱ | id, shop_id, staff_member_id, payment_item_id, rule_id, rule_snapshot (jsonb), base_cents, amount_cents, kind (`earned`/`reversal`), reverses_id, created_at | Append-only. Partial unique index allows one `earned` row per payment item. A void writes a `reversal` row and nothing is deleted. |
| `expenses` ✱ | id, shop_id, category (`rent`/`utilities`/`supplies`/`marketing`/`salaries`/`other`), amount_cents, incurred_on, vendor, description, recorded_by, voided_at | |
| `payouts` ✱ *(Phase 4b / later)* | id, shop_id, staff_member_id, period_start, period_end, amount_cents, paid_at | Marks commissions as settled. |

**Commission rule resolution** (most specific wins, rule effective at payment time):
1. barber + service
2. service (any barber)
3. barber (any service)
4. shop default

The rule used is **snapshotted** onto the commission record, so editing a rule never rewrites history. Tips are tracked separately and go 100% to the barber by default. They are not commissionable and not counted as shop revenue.

**Financial definitions** (shown with tooltips in the UI):
- **Revenue** = Σ non-voided `payment_items.total_cents` (services + products, excluding tips)
- **Commissions** = Σ `earned` − Σ `reversal` commission records
- **Product cost (COGS)** = Σ quantity × unit_cost of products sold
- **Expenses** = Σ non-voided expenses
- **Estimated profit** = Revenue − COGS − Commissions − Expenses

Only **paid** completed appointments produce revenue and commission. Booked, cancelled and no-show appointments never do.

### 4.6 Inventory (basic in MVP, schema ready now)

| Table | Key columns | Notes |
|---|---|---|
| `products` ✱ | id, shop_id, name, sku, category, kind (`retail`/`consumable`/`both`), cost_cents, price_cents, stock_qty (cached), low_stock_threshold, active | |
| `inventory_movements` ✱ | id, shop_id, product_id, qty_delta, type (`purchase`/`sale`/`usage`/`adjustment`/`sale_reversal`), unit_cost_cents, payment_item_id, note, actor, at | Append-only ledger. `stock_qty` is updated in the same transaction and can be rebuilt from the ledger. |

### 4.7 Platform tables

| Table | Purpose |
|---|---|
| `audit_log` ✱ | actor, action, entity, entity_id, changes (jsonb), ip, at. Records all financial, permission and GDPR actions. |
| `notification_outbox` ✱ | channel (`email`; `sms` later), recipient, template, payload, scheduled_for, status, attempts, sent_at. Booking confirmations now. **Reminders, re-engagement and review requests later just insert rows here.** |
| `idempotency_keys` | Optional generic store if needed beyond payments. |

### 4.8 Built-in extension points for later features

- **Loyalty / retention:** `customers.visit_count/last_visit_at` already exist, plus a future `loyalty_programs` and `loyalty_ledger`.
- **Online payments:** add `payments.provider`, `provider_ref`, plus a webhook route. Payments are already line-item based.
- **Multi-service appointments:** add an `appointment_services` table. `appointments.service_id` stays as the "primary" service for back-compat.
- **SMS/WhatsApp:** add a new outbox channel adapter.
- **Native apps:** expose `server/domain/*` through a versioned `/api/v1` with token auth.

---

## 5. Core business logic

### 5.1 Availability (free-slot computation)

For a given barber, service and date in the **shop's timezone**:

1. Start from the intersection of the shop's opening hours and the barber's working hours for that weekday.
2. Subtract shop closures, barber time off, and existing `pending`/`confirmed` appointments (each including its service buffer).
3. Slot length = service duration (per-barber override if set) + buffer.
4. Walk the free intervals at `slot_interval_min` steps and keep starts where the whole slot fits.
5. Drop slots earlier than now + `booking_lead_time_min` or beyond `booking_horizon_days`.
6. "Any barber" = union of every bookable barber who offers the service. On booking, assign the one with the fewest appointments that day.

This is a pure function with exhaustive unit tests, including DST transitions, split shifts, and back-to-back bookings. The DB exclusion constraint is the final authority. The availability function only proposes.

### 5.2 Booking (public)

All in one transaction:
1. Re-validate the slot.
2. Upsert the customer by `(shop_id, phone_e164)`: an existing customer is recognized, otherwise one is created. Contact details are not overwritten without staff review.
3. Insert the appointment (`confirmed` if `auto_confirm_online`, else `pending`).
4. Write an `appointment_events` row.
5. Enqueue a confirmation email in the outbox.

The response shows the confirmation screen plus a **manage link** (random 256-bit token, stored hashed) for cancel/reschedule within the shop's cancellation window. Abuse protection: rate limiting per IP and phone, a honeypot field, and optional Cloudflare Turnstile.

### 5.3 Appointment state machine

```
pending ──► confirmed ──► completed ──(payment)──► revenue + commission
   │            │   └──► no_show
   └──► cancelled ◄──┘
```

- Allowed transitions are enforced server-side.
- `completed` is only allowed once the start time has passed. Owners can override, and the override is audited.
- Rescheduling changes the time and re-checks the overlap constraint. The prior time is kept in `appointment_events`.
- Cancelling a paid appointment requires voiding the payment first, which reverses its commission records.

### 5.4 Recording a payment

All in one transaction:
1. Lock the appointment row.
2. Ensure there's no active payment for it.
3. Insert the payment and its items.
4. Resolve and insert commission records.
5. Write inventory movements for products.
6. Set the appointment to `completed` if not already.
7. Update customer visit stats.
8. Write the audit log.

Retrying with the same idempotency key returns the original payment.

---

## 6. GDPR and data protection

- **Lawful basis:** booking data is held under contract. Marketing requires separate opt-in (`marketing_consent_at`), which is off by default.
- **Right of access / portability:** "Export customer" produces a JSON (and CSV) bundle with profile, appointments, notes and payments.
- **Right to erasure:** "Delete customer" **anonymizes** the record (name → "Deleted customer", phone/email/preferences/notes wiped, `anonymized_at` set). Financial records keep their amounts for legally required bookkeeping but no longer identify the person. This is audited.
- **Shop-level:** full shop data export, and a shop deletion request with a grace period.
- **Security:** TLS everywhere, HTTP-only SameSite cookies, CSRF protection via server actions/origin checks, strict CSP, hashed tokens, rate-limited auth, least-privilege DB role, EU data residency, encrypted backups (provider-managed), no customer PII in logs.
- Privacy policy and cookie notice (only essential cookies at MVP) on the booking page.

---

## 7. Screen structure

### 7.1 Auth and onboarding
- **Sign up / Sign in / Forgot password / Accept invite**
- **Create your shop** wizard: (1) name, slug, timezone, currency → (2) opening hours → (3) services (with suggested templates you can edit) → (4) add barbers (yourself + invites) → (5) your booking link is ready.

### 7.2 Owner / Manager dashboard (`/app`, sidebar)

| # | Section | Screens & key components |
|---|---|---|
| 1 | **Overview** | KPI row (today's appointments, week appointments, today's revenue, month revenue) · revenue-per-barber bar chart · up-next list · recent customers · pending/cancelled requests · low-stock alerts |
| 2 | **Appointments** | Calendar with **Day** (resource columns per barber), **Week** and **Month** views · barber filter · drag to reschedule (with overlap check) · click empty slot → *New appointment* drawer · appointment drawer: details, status actions, record payment, add note, history |
| 3 | **Customers** | Searchable table (name, phone, last visit, visits, preferred barber) · **Customer profile**: contact, preferences, haircut notes timeline, appointment history, spend, GDPR export/delete |
| 4 | **Staff** | Staff list · **Barber profile**: details, services offered, weekly hours editor, time off, permissions/role, performance (appointments, revenue, commission, no-show rate) · Invite barber |
| 5 | **Finance** | Period picker · Revenue / Commissions / Expenses / Estimated profit cards · revenue by barber and by service · **Payments** ledger (void with reason) · **Commissions** per barber with drill-down · **Expenses** list + add · **Commission rules** editor |
| 6 | **Inventory** | Products table with stock and low-stock badges · product form · stock movement log · receive stock / adjust |
| 7 | **Reports** | MVP: CSV export of appointments, payments, commissions. Later: retention, visit frequency, utilization |
| 8 | **Settings** | Shop profile & branding (logo, colour, preview of booking page) · opening hours & closures · booking policy (lead time, horizon, cancellation window, auto-confirm) · services & prices · roles & toggles · data & privacy · account |

### 7.3 Barber app (`/barber`, mobile bottom tabs)

| Tab | Content |
|---|---|
| **Today** | Timeline of today's appointments. Next customer is highlighted with a **"last time" haircut note**. One-tap actions: Confirm, Start/Complete, No-show, Record payment, Add note |
| **Calendar** | Own day/week agenda, own working hours, time off |
| **Customers** | Search customers they have served. Profile with preferences and notes timeline |
| **Earnings** | Today / week / month: services done, revenue generated, commission earned, tips |
| **Profile** | Own details, working hours (read-only in MVP), sign out |

### 7.4 Customer booking (`/book/{shop}`)

1. **Shop landing**: logo, name, address, hours, *Book now*
2. **Service**: list with duration and price
3. **Barber**: photos/names + "Any available"
4. **Date & time**: horizontal date strip + slot grid (only real free slots)
5. **Your details**: name, phone, email (optional/required per settings), note, consent checkboxes
6. **Review & confirm**
7. **Confirmation**: summary, add-to-calendar (.ics), manage link
8. **Manage booking** (`/book/{shop}/manage/{token}`): view, cancel, reschedule within policy

### 7.5 Design system

- **Palette:** near-black `#0A0A0A`, white, a 9-step neutral grey scale, and *one* semantic accent each for success, warning and danger (muted). Shops can set a brand colour that is used only on their public booking page.
- **Type:** Inter (or Geist) with a tight type scale and tabular numerals for money.
- **Shapes:** 12px radius cards, 1px hairline borders, very soft shadows.
- **Motion:** 150–200ms ease-out on drawers, popovers and state changes. Reduced-motion is respected.
- **Icons:** Lucide only, 1.5px stroke.
- Light mode first, dark mode included (it suits the barber app in dim shops).
- Every interactive element has a real handler. Empty states explain the next action ("No services yet → Add your first service").

---

## 8. Demo data policy

- `npm run seed:demo` creates a shop flagged `is_demo = true` with clearly fake barbers, customers and history.
- Demo shops show a persistent **"Demo data"** banner and are excluded from any production metrics.
- Production shops start empty. Nothing fake is ever written to them.

---

## 9. Delivery plan

| Phase | Deliverables | Done when |
|---|---|---|
| **1. Foundation** | Repo, tooling (lint, typecheck, CI), Postgres + migrations + RLS, auth (sign-up/in/out, reset), shop creation wizard, memberships & roles, permission layer, app shells (sidebar / bottom tabs) | A new owner can sign up, create a shop, and land in an empty but real dashboard. RLS isolation is proven by tests. |
| **2. Operations core** | Staff & invites, services, per-barber services, shop hours & closures, working hours & time off, availability engine, appointment CRUD + status machine, calendar day/week/month views | The owner can configure the shop and manage a real calendar. Overlaps are impossible (tested under concurrency). |
| **3. Customers & booking** | Public booking flow, manage/cancel/reschedule links, confirmation emails via outbox, customer list/profile, haircut notes, GDPR export/anonymize | A customer books on a phone, it appears instantly in the calendar, and the barber sees the customer's history. |
| **4. Money** | Record/void payments, commission rules + engine, expenses, finance dashboard, barber earnings, basic product sales + stock ledger, overview KPIs | All numbers reconcile in tests: revenue − COGS − commissions − expenses = profit, voids fully reverse. |
| **5. Hardening** | Mobile polish, accessibility pass, e2e suite, security review (authz matrix tests, RLS tests, rate limits, headers), error monitoring (Sentry), backups check, demo seed | Green e2e suite on CI, security checklist closed. Ready for a pilot. |
| **6. Pilot** | Deploy, onboard 1–3 real shops, feedback loop | You decide what comes next from real usage. |

Each phase ends with a working, deployable increment and a short changelog. I would start Phase 1 immediately on approval.

---

## 10. Decisions needed from you

1. **Where the code lives.** This repository is your GitHub profile repo (with LiftLog deployed via GitHub Pages). BarberOS needs a server and a database, so it can't run on GitHub Pages.
   - **Recommended:** create a dedicated repo (e.g. `barberos`) and attach it to the session.
   - Alternative: build in `barberos/` inside this repo for now and move it later.
2. **Hosting.** Recommended: Vercel + Neon (EU). Alternatives: Supabase (as Postgres host), Railway/Render, or a self-managed VPS. Development works locally regardless. Accounts are only needed when we deploy.
3. **Market defaults.** Currency, timezone and UI language for the first pilot shops (e.g. EUR / Europe/Lisbon / Portuguese vs English). The app is built i18n-ready either way. The question is which language ships first.
4. **Booking details.** Is email required at booking, or phone only? Should online bookings auto-confirm (recommended) or require approval?
5. **Multi-service appointments** (e.g. cut + beard as two items) in the MVP, or combo services for now (recommended)?
