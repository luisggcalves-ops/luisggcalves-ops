# Hearth: family task management

Hearth is a shared family workspace for household responsibilities. Parents and guardians create a family, invite everyone, assign tasks (one-off or recurring) and watch progress update live as each person ticks things off.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase (Postgres, Auth, Realtime) · TypeScript

## Features

| Area | What you get |
| --- | --- |
| Accounts & families | Email/password accounts, create a family (creator becomes admin), join with an 8-character code or `/join/CODE` link, admin/member roles, remove members / leave a family |
| Family dashboard | Weekly completion ring, completed / pending / overdue counts, a card per member (progress, streak, points), up-next list, recently completed, live activity |
| Member dashboard | Profile + avatar, personal to-do list, recurring responsibilities, completion history by day, streak and points |
| Tasks | Create / edit / delete, description, assignee, 10 categories, priority, due date + time, points, checkbox completion with undo, filters + search |
| Recurring tasks | Daily, weekly (pick a weekday), monthly, or custom (every N days/weeks/months, multiple weekdays). Calculated in the family's timezone, DST-safe |
| Real-time | Every change (tasks, completions, members, notifications, rewards) syncs live to every open device |
| Notifications | New assignment, due within 24h, overdue (assignee + admins), completed (admins + creator), reward redeemed. In-app bell + toasts, optional browser notifications, per-person preferences |
| Gamification (optional) | Points per task, weekly leaderboard, family challenges with progress, a reward store with redemptions. One toggle turns it all off |
| Design | Calm neutral palette, rounded cards, spring animations, light/dark mode, sidebar on desktop and bottom tabs + floating action button on mobile |

## Architecture

```
Browser (Next.js client components)
  └─ FamilyProvider ── loads the family workspace once, subscribes to
     Supabase Realtime (postgres_changes filtered by family_id) and
     exposes optimistic actions. All screens read from this one store.
        │  supabase-js (user's JWT)
        ▼
Supabase
  ├─ Auth           – one account per family member
  ├─ PostgREST      – direct table reads/writes, guarded by RLS
  ├─ RPC functions  – privileged multi-step operations
  ├─ Realtime       – row changes broadcast to subscribers (RLS-checked)
  └─ pg_cron        – deadline reminders every 10 minutes
Next.js server
  └─ proxy.ts (auth cookie refresh + login redirect) and the (app) layout
     (requires a session and a family membership)
```

**Key decisions**

- **Security lives in the database, not the UI.** Every table has Row Level Security. Policies use `is_family_member()` / `is_family_admin()`, so even a modified client can only read or change its own family's rows. Notifications are visible only to their recipient.
- **Privileged operations are RPCs.** Creating or joining a family, completing or undoing a task, redeeming rewards and managing roles all run as `SECURITY DEFINER` functions that check permissions explicitly. Each one also does its side effects atomically: completion history, points, activity log, the next recurring occurrence, notifications. Column-level grants stop clients writing `status`, `completed_by` and similar fields directly.
- **Recurrence spawns the next occurrence on completion.** Nothing is pre-generated, so there is no cron dependency, history stays clean and undo is simple: it removes the untouched next occurrence. Missed occurrences are skipped rather than piling up.
- **Points are a ledger.** `task_completions` and `reward_redemptions` are the source of truth, so undo, weekly leaderboards and challenges stay consistent.
- **Permissions:** admins can do everything. Members see the whole family board, complete their own (or unassigned) tasks, and create tasks for themselves, which earn a fixed 5 points so nobody can award themselves 1000.
- **Built to grow.** Policies are written per family. Dropping one unique index (`family_members_one_family_per_user`) would allow multiple families per user.

**Code map**

```
supabase/migrations/…_init.sql   schema, RLS, RPCs, triggers, realtime, cron
src/proxy.ts                      session refresh + auth redirects
src/lib/                          types, stats, recurrence labels, dates, Supabase clients
src/components/family-provider.tsx  data store, realtime sync, actions
src/components/                   app shell, task row/form/groups, activity feed, UI kit
src/app/login, onboarding, join   auth + create/join family
src/app/(app)/…                   dashboard, me, members, tasks, activity, rewards, settings
tests/unit                        pure logic (stats, recurrence)
tests/integration                 real Supabase: RLS isolation, permissions, RPCs, realtime
tests/e2e/family-flow.cjs         two-browser Playwright flow (parent desktop + child mobile)
```

## Running locally

Requirements: Node 20+, Docker (for the local Supabase stack).

```bash
cd family-tasks
npm install
npx supabase start          # Postgres + Auth + Realtime in Docker; applies the migration
npx supabase status         # copy the API URL + publishable key
cp .env.example .env.local  # paste them in
npm run dev                 # http://localhost:3000
```

Email confirmation is off locally, so sign-up logs you straight in. To try the multi-person flow, open a second browser or a private window and join with the invite code from **Family**.

## Tests

```bash
npm run test:unit           # no services needed
npm run test:integration    # needs `supabase start`
npm run build && npm start  # then, in another terminal:
npm run test:e2e
```

The integration suite signs up real users and checks:
- cross-family isolation on every table, for both reads and writes
- member vs admin restrictions
- completion, points and undo
- recurring spawn and undo
- deadline reminders, generated exactly once
- reward balance checks
- realtime delivery to family members, but not to outsiders

## Deploying

1. Create a Supabase project and run `npx supabase link` then `npx supabase db push`. This applies the migration, including pg_cron reminders where available.
2. Under Auth → URL configuration, set the Site URL and add `https://your-domain/auth/callback` as a redirect.
3. Deploy the `family-tasks` folder to Vercel (or any Node host) with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set.

## Ideas for later

Parent-managed child accounts without email, photo proof of completion, push notifications (web push or a native wrapper), calendar sync, task comments, allowance tracking, and multiple families per user (e.g. separated parents).
