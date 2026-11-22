# Deploying BarberOS

Recommended: **Vercel** (app) + **Neon** (Postgres), both in an **EU region**.

## 1. Database (Neon)

1. Create a project in an EU region (e.g. Frankfurt). The default owner role runs migrations.
2. Create a login role for the app and give it the restricted group role, which the first migration creates. Run this in the SQL editor after step 4, or create the group first:

   ```sql
   CREATE ROLE barberos_app NOLOGIN;   -- skip if it already exists
   CREATE ROLE barberos_web LOGIN PASSWORD '<long random password>';
   GRANT barberos_app TO barberos_web;
   ```

3. Two connection strings:
   - `MIGRATION_DATABASE_URL` uses the owner role, for migrations only.
   - `DATABASE_URL` uses `barberos_web`, for the app. Use Neon's **pooled** connection string here.
4. Run migrations from your machine or CI:

   ```bash
   MIGRATION_DATABASE_URL=… npm run db:migrate
   ```

## 2. App (Vercel)

- Import the GitHub repo and set **Root Directory** to `barberos`.
- Environment variables:

  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | pooled `barberos_web` connection string |
  | `MIGRATION_DATABASE_URL` | owner connection string (only if migrations run in the build) |
  | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
  | `BETTER_AUTH_URL` | your public URL, e.g. `https://app.barberos.example` |
  | `RESEND_API_KEY`, `MAIL_FROM` | for real emails (verify your sending domain in Resend) |
  | `CRON_SECRET` | long random string |

- Never set `SHOW_DEMO_LOGINS`, `DISABLE_RATE_LIMIT` or `CODESPACES` in production.

## 3. Scheduled jobs

Every 5 minutes, call `GET /api/cron/outbox` with `Authorization: Bearer $CRON_SECRET` to retry failed emails. Vercel Cron (Pro) or any external scheduler works.

## 4. Monitoring

- **Uptime:** point a monitor (UptimeRobot or Better Stack) at `GET /api/health`. It returns 200, or 503 if the database is unreachable.
- **Errors:** all server errors are logged as one JSON line (`event: "request_error"`, `"action_error"`), with tokens redacted and no personal data. Set an alert on `level=error` in Vercel's log drains. To add Sentry later, wire it into `src/instrumentation.ts` (`onRequestError`).

## 5. Backups and recovery

- Neon keeps **point-in-time restore** history (the length depends on your plan). Check that it's enabled, and test a restore into a branch once before the pilot.
- For an extra off-site copy, run a nightly `pg_dump` with the owner role to encrypted storage.
- Restoring: restore to a Neon branch, point `DATABASE_URL` at it, verify, then promote.

## 6. Go-live checklist

- [ ] Migrations applied, and the `barberos_web` role is in `barberos_app`. `npm test` against a staging database passes `schema-security.test.ts`.
- [ ] `BETTER_AUTH_URL` is the exact https URL. You can sign in from that domain.
- [ ] Test email received (password reset and booking confirmation).
- [ ] Cron job calling `/api/cron/outbox` with the secret.
- [ ] Uptime monitor on `/api/health` and an error alert configured.
- [ ] Point-in-time restore tested once.
- [ ] Demo data **not** seeded in production (the seed refuses when `NODE_ENV=production`).
- [ ] Privacy page reviewed for your shops.
