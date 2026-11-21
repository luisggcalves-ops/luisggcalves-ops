# BarberOS

**Everything your barbershop needs, in one place.**

BarberOS is a management platform for independent barbershops with 2–5 barbers. It has three surfaces on one backend:

| Surface | Path | Who |
|---|---|---|
| Owner dashboard | `/app` | Owners and managers (desktop/tablet) |
| Barber app | `/barber` | Barbers (mobile-first) |
| Public booking | `/book/{shop}` | Customers (no account) *(Phase 3)* |

The full architecture, schema and roadmap are in [`docs/PROPOSAL.md`](docs/PROPOSAL.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Project setup, database, auth, shop creation, roles | ✅ Done |
| 2 | Staff profiles & hours, services, availability, appointment calendar | Next |
| 3 | Public booking, customers, haircut notes | Planned |
| 4 | Payments, revenue, commissions | Planned |
| 5 | Hardening, mobile polish, security review | Planned |

### What works today (Phase 1)

- Sign up, sign in, sign out, forgot/reset password, change password, edit name.
- Onboarding wizard: shop name, booking link, time zone, currency, opening hours (with split shifts), and an "I cut hair too" option that creates the owner's barber profile.
- Owner/manager dashboard: Overview (open/closed status in the shop's time zone, today's hours, team, setup checklist), Staff, and Settings (shop profile, opening hours, account).
- Team management: email invitations with copyable one-time links (7-day expiry), roles (owner / manager / barber), role changes, deactivate/reactivate, and pending-invite cancellation.
- Barber mobile app: Today and Profile tabs, plus shop switching for people in several shops.
- Role-based routing: barbers are sent to `/barber` and can't open the owner dashboard.
- Unbuilt sections are shown as **"Soon"** and are not clickable. There are no dead buttons.

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

2. Configure the environment, then set `BETTER_AUTH_SECRET` in `.env` to a random 32+ character value (for example from `openssl rand -base64 32`):

   ```bash
   cp .env.example .env
   ```

3. Install, migrate and run:

   ```bash
   npm install
   npm run db:migrate
   npm run dev
   ```

Open http://localhost:3000. Without `RESEND_API_KEY`, emails (password resets, invites) are printed in the server console.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | Generate a migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (uses `MIGRATION_DATABASE_URL`) |
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
    domain/            business logic (shops, team), framework-free and tested
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
4. Set `BETTER_AUTH_URL` to the public URL. Set `RESEND_API_KEY` and `MAIL_FROM` for real email.
5. Run `npm run db:migrate` before each deploy.
