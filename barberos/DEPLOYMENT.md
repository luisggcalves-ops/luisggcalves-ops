# Deploying BarberOS

Recommended: **Vercel** (app) + **Neon** (Postgres), both in an **EU region**.

## The quick way (about 15 minutes, no commands)

**1. Database: Neon**
1. Sign up at neon.tech (use "Continue with GitHub").
2. Create a project named `barberos` in an **EU region** (e.g. Frankfurt).
3. On the dashboard, click **Connect** and copy the connection string. It starts with `postgresql://`.

**2. App: Vercel**
1. Sign up at vercel.com with GitHub, then **Add New → Project** and import this repository.
2. Set **Root Directory** to `barberos`. The framework is detected as Next.js.
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `MIGRATION_DATABASE_URL` | the Neon connection string |
   | `APP_DB_PASSWORD` | a new random password, 32+ characters (use a password generator) |
   | `BETTER_AUTH_SECRET` | another random string, 32+ characters |
   | `SEED_DEMO_ON_DEPLOY` + `SHOW_DEMO_LOGINS` | *optional:* set both to `1` for a **demo** deployment with the sample shop and one-click demo logins. Leave them out for real shops. |

4. Click **Deploy**.

Each deployment runs `npm run vercel-build` (`scripts/deploy-setup.ts`). It:

- applies migrations;
- creates the restricted app login `barberos_web` (with `APP_DB_PASSWORD`) in the `barberos_app` group, so the app **never** connects as the database owner;
- seeds the demo when asked;
- builds the app.

`DATABASE_URL` is derived automatically, and the public URL comes from Vercel. A custom domain is set later with `BETTER_AUTH_URL`.

**3. Emails (when you're ready for real customers):** create a Resend account, verify your domain, and add `RESEND_API_KEY` and `MAIL_FROM`. Until then, emails are only logged.

**4. Email retries:** `vercel.json` already schedules `/api/cron/outbox` daily (the Hobby plan allows one run a day). Add `CRON_SECRET` (any long random string), and Vercel sends it automatically. On Pro, change the schedule to every 5 minutes.

> Vercel's free Hobby plan is for non-commercial use. Move to Pro before charging shops.

## The manual way (other hosts)

1. Create two roles:
   - an owner role for migrations;
   - a login role for the app, which you add to `barberos_app` (`GRANT barberos_app TO <login>`). The first migration creates `barberos_app`.
2. Set `DATABASE_URL` (app login) and `MIGRATION_DATABASE_URL` (owner), then run `npm run db:migrate` before each deploy.
3. Set `BETTER_AUTH_URL` to the public https URL.

## Scheduled jobs (details)

Every 5 minutes, call `GET /api/cron/outbox` with `Authorization: Bearer $CRON_SECRET` to retry failed emails. Vercel Cron (Pro) or any external scheduler works.

## Monitoring

- **Uptime:** point a monitor (UptimeRobot or Better Stack) at `GET /api/health`. It returns 200, or 503 if the database is unreachable.
- **Errors:** all server errors are logged as one JSON line (`event: "request_error"`, `"action_error"`), with tokens redacted and no personal data. Set an alert on `level=error` in Vercel's log drains. To add Sentry later, wire it into `src/instrumentation.ts` (`onRequestError`).

## Backups and recovery

- Neon keeps **point-in-time restore** history (the length depends on your plan). Check that it's enabled, and test a restore into a branch once before the pilot.
- For an extra off-site copy, run a nightly `pg_dump` with the owner role to encrypted storage.
- Restoring: restore to a Neon branch, point `DATABASE_URL` at it, verify, then promote.

## Go-live checklist

- [ ] The deploy log shows `[deploy-setup] Done.` The app connects as `barberos_web`, never as the owner (Neon → Monitoring → active connections).
- [ ] You can sign up and sign in on the production URL. With a custom domain, set `BETTER_AUTH_URL` to it.
- [ ] Test email received (password reset and booking confirmation).
- [ ] Cron job calling `/api/cron/outbox` with the secret.
- [ ] Uptime monitor on `/api/health` and an error alert configured.
- [ ] Point-in-time restore tested once.
- [ ] `SEED_DEMO_ON_DEPLOY` and `SHOW_DEMO_LOGINS` are **not** set on the deployment real shops use.
- [ ] Privacy page reviewed for your shops.
