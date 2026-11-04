-- =============================================================================
-- Hearth — family task management
-- Initial schema: families, members, tasks, recurrence, completions,
-- activity log, notifications, gamification (rewards + challenges).
--
-- Security model
--   * Every family-scoped row carries family_id.
--   * Row Level Security is enabled on every table; access is granted through
--     is_family_member() / is_family_admin() helpers (SECURITY DEFINER so they
--     can read family_members without recursive RLS evaluation).
--   * Multi-step / privileged writes (create family, join, complete task,
--     redeem reward ...) go through SECURITY DEFINER RPC functions that check
--     permissions explicitly. Column-level grants stop clients from writing
--     derived columns (status, completed_by, ...) directly.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.member_role     as enum ('admin', 'member');
create type public.task_priority   as enum ('low', 'medium', 'high');
create type public.task_status     as enum ('pending', 'completed');
create type public.recurrence_freq as enum ('daily', 'weekly', 'monthly');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 60),
  avatar_color  text not null default 'indigo',
  avatar_emoji  text,
  notification_prefs jsonb not null default
    '{"assigned": true, "due_soon": true, "overdue": true, "completed": true, "browser": false}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.families (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 80),
  invite_code          text not null unique,
  timezone             text not null default 'UTC',
  gamification_enabled boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);

create table public.family_members (
  family_id  uuid not null references public.families (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);
-- MVP: one family per user. Drop this index to allow multiple families later;
-- every policy is already written per-family.
create unique index family_members_one_family_per_user on public.family_members (user_id);
create index family_members_user_idx on public.family_members (user_id);

create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 140),
  description         text not null default '' check (char_length(description) <= 4000),
  category            text not null default 'other' check (char_length(category) <= 40),
  priority            public.task_priority not null default 'medium',
  points              integer not null default 10 check (points between 0 and 1000),
  assigned_to         uuid references public.profiles (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  due_at              timestamptz,
  -- recurrence (null freq = one-off task)
  recurrence_freq     public.recurrence_freq,
  recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 365),
  recurrence_weekdays smallint[] not null default '{}',   -- 0=Sun..6=Sat, weekly only
  series_id           uuid,          -- shared by all occurrences of a recurring task
  -- completion state (written only by RPCs)
  status              public.task_status not null default 'pending',
  completed_at        timestamptz,
  completed_by        uuid references public.profiles (id) on delete set null,
  next_task_id        uuid references public.tasks (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint recurring_needs_due check (recurrence_freq is null or due_at is not null),
  constraint weekdays_valid check (recurrence_weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);
create index tasks_family_status_idx on public.tasks (family_id, status);
create index tasks_assigned_idx on public.tasks (assigned_to, status);
create index tasks_due_idx on public.tasks (due_at) where status = 'pending';

create table public.task_completions (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete set null,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  task_title   text not null,
  category     text not null,
  points       integer not null default 0,
  completed_at timestamptz not null default now()
);
create unique index task_completions_task_uniq on public.task_completions (task_id);
create index task_completions_family_idx on public.task_completions (family_id, completed_at desc);

create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  type       text not null,   -- task_created | task_assigned | task_completed | task_reopened | task_deleted | member_joined | member_left | reward_redeemed | challenge_created
  task_id    uuid references public.tasks (id) on delete set null,
  subject_id uuid references public.profiles (id) on delete set null,  -- e.g. assignee
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_family_idx on public.activity (family_id, created_at desc);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,   -- assigned | due_soon | overdue | completed | reward
  title      text not null,
  body       text not null default '',
  task_id    uuid references public.tasks (id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
-- one deadline reminder of each kind per task per person
create unique index notifications_deadline_uniq on public.notifications (user_id, task_id, type)
  where type in ('due_soon', 'overdue');

create table public.rewards (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  cost        integer not null check (cost between 1 and 100000),
  emoji       text not null default '🎁',
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.reward_redemptions (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  reward_id   uuid references public.rewards (id) on delete set null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  cost        integer not null,
  created_at  timestamptz not null default now()
);
create index reward_redemptions_family_idx on public.reward_redemptions (family_id, user_id);

create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  metric      text not null default 'tasks' check (metric in ('tasks', 'points')),
  target      integer not null check (target between 1 and 100000),
  starts_on   date not null,
  ends_on     date not null,
  reward_text text not null default '',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint challenge_dates check (ends_on >= starts_on)
);
create index challenges_family_idx on public.challenges (family_id, ends_on desc);

-- -----------------------------------------------------------------------------
-- Permission helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_family_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

create or replace function public.is_family_admin(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members
                 where family_id = fid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.shares_family_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members a join family_members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

create or replace function public.display_name_of(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), 'Someone') from profiles where id = uid;
$$;

-- Transaction-local flag set by RPCs doing internal bookkeeping (spawning a
-- recurring occurrence, removing a family) so triggers don't log/notify.
create or replace function public.is_internal_op()
returns boolean language sql stable as $$
  select coalesce(current_setting('hearth.internal', true), '') = 'on';
$$;

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  colors text[] := array['indigo','violet','rose','amber','emerald','sky','teal','orange'];
begin
  insert into profiles (id, display_name, avatar_color)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), ''),
    colors[1 + floor(random() * array_length(colors, 1))::int]
  )
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Task triggers: validation, activity + notifications
-- -----------------------------------------------------------------------------

-- Validate that assignees belong to the task's family and enforce who may
-- assign to whom (admins: anyone; members: themselves or nobody).
create or replace function public.tasks_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and not exists (
       select 1 from family_members where family_id = new.family_id and user_id = new.assigned_to) then
    raise exception 'Assignee is not a member of this family' using errcode = '23514';
  end if;

  -- auth.uid() is null for internal/service calls (e.g. recurrence spawning)
  if auth.uid() is not null and not is_internal_op() and not is_family_admin(new.family_id) then
    if (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
       and new.assigned_to is not null and new.assigned_to <> auth.uid() then
      raise exception 'Only family admins can assign tasks to other members' using errcode = '42501';
    end if;
    -- point values are set by admins; self-made tasks earn a flat 5 points
    if tg_op = 'INSERT' then
      new.points := least(new.points, 5);
    else
      new.points := old.points;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.series_id := coalesce(new.series_id, case when new.recurrence_freq is not null then new.id end);
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif new.recurrence_freq is not null and new.series_id is null then
    new.series_id := new.id;
  end if;
  return new;
end; $$;

create trigger tasks_validate before insert or update on public.tasks
  for each row execute function public.tasks_validate();

create or replace function public.tasks_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  prefs jsonb;
begin
  if is_internal_op() then return new; end if;
  if tg_op = 'INSERT' then
    if actor is not null then
      insert into activity (family_id, actor_id, type, task_id, subject_id, meta)
      values (new.family_id, actor, 'task_created', new.id, new.assigned_to,
              jsonb_build_object('title', new.title));
    end if;
  end if;

  if new.assigned_to is not null and actor is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if tg_op = 'UPDATE' then
      insert into activity (family_id, actor_id, type, task_id, subject_id, meta)
      values (new.family_id, actor, 'task_assigned', new.id, new.assigned_to,
              jsonb_build_object('title', new.title));
    end if;
    if new.assigned_to <> actor then
      select notification_prefs into prefs from profiles where id = new.assigned_to;
      if coalesce((prefs ->> 'assigned')::boolean, true) then
        insert into notifications (family_id, user_id, type, title, body, task_id)
        values (new.family_id, new.assigned_to, 'assigned',
                display_name_of(actor) || ' assigned you a task', new.title, new.id);
      end if;
    end if;
  end if;
  return new;
end; $$;

create trigger tasks_after_write after insert or update of assigned_to on public.tasks
  for each row execute function public.tasks_after_write();

create or replace function public.tasks_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_internal_op() then
    insert into activity (family_id, actor_id, type, task_id, meta)
    values (old.family_id, auth.uid(), 'task_deleted', null, jsonb_build_object('title', old.title));
  end if;
  return old;
end; $$;

create trigger tasks_after_delete after delete on public.tasks
  for each row execute function public.tasks_after_delete();

-- -----------------------------------------------------------------------------
-- Recurrence
-- -----------------------------------------------------------------------------

-- Next occurrence strictly after `from_ts`, evaluated in the family's timezone
-- so "every Tuesday at 7pm" stays at 7pm local time across DST changes.
create or replace function public.next_occurrence(
  from_ts timestamptz, freq public.recurrence_freq, step integer, weekdays smallint[], tz text)
returns timestamptz language plpgsql stable as $$
declare
  local_ts  timestamp := from_ts at time zone tz;
  candidate timestamp;
  anchor_week timestamp := date_trunc('week', local_ts);
  weeks_apart integer;
  i integer;
begin
  step := greatest(coalesce(step, 1), 1);
  if freq = 'daily' then
    return (local_ts + make_interval(days => step)) at time zone tz;
  elsif freq = 'monthly' then
    return (local_ts + make_interval(months => step)) at time zone tz;
  elsif freq = 'weekly' then
    if weekdays is null or cardinality(weekdays) = 0 then
      return (local_ts + make_interval(weeks => step)) at time zone tz;
    end if;
    for i in 1 .. (7 * step + 7) loop
      candidate := local_ts + make_interval(days => i);
      weeks_apart := (extract(epoch from date_trunc('week', candidate) - anchor_week) / 604800)::int;
      if extract(dow from candidate)::smallint = any (weekdays) and weeks_apart % step = 0 then
        return candidate at time zone tz;
      end if;
    end loop;
  end if;
  return null;
end; $$;

-- First occurrence that is still in the future (skips missed occurrences).
create or replace function public.next_future_occurrence(
  from_ts timestamptz, freq public.recurrence_freq, step integer, weekdays smallint[], tz text)
returns timestamptz language plpgsql stable as $$
declare
  ts timestamptz := from_ts;
  guard integer := 0;
begin
  loop
    ts := next_occurrence(ts, freq, step, weekdays, tz);
    guard := guard + 1;
    exit when ts is null or ts > now() or guard > 2000;
  end loop;
  return ts;
end; $$;

-- -----------------------------------------------------------------------------
-- RPC: families
-- -----------------------------------------------------------------------------
create or replace function public.generate_invite_code()
returns text language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from families where invite_code = code);
  end loop;
  return code;
end; $$;

create or replace function public.create_family(family_name text, tz text default 'UTC')
returns public.families language plpgsql security definer set search_path = public as $$
declare
  fam families;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from family_members where user_id = uid) then
    raise exception 'You already belong to a family' using errcode = '23505';
  end if;
  if tz is null or not exists (select 1 from pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  insert into families (name, invite_code, timezone, created_by)
  values (trim(family_name), generate_invite_code(), tz, uid)
  returning * into fam;

  insert into family_members (family_id, user_id, role) values (fam.id, uid, 'admin');
  insert into activity (family_id, actor_id, type, subject_id, meta)
  values (fam.id, uid, 'member_joined', uid, jsonb_build_object('role', 'admin'));
  return fam;
end; $$;

create or replace function public.join_family(code text)
returns public.families language plpgsql security definer set search_path = public as $$
declare
  fam families;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into fam from families where invite_code = upper(trim(code));
  if fam.id is null then
    raise exception 'Invite code not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from family_members where user_id = uid and family_id = fam.id) then
    return fam;
  end if;
  if exists (select 1 from family_members where user_id = uid) then
    raise exception 'You already belong to a family' using errcode = '23505';
  end if;

  insert into family_members (family_id, user_id, role) values (fam.id, uid, 'member');
  insert into activity (family_id, actor_id, type, subject_id, meta)
  values (fam.id, uid, 'member_joined', uid, jsonb_build_object('role', 'member'));
  return fam;
end; $$;

create or replace function public.regenerate_invite_code(fid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_family_admin(fid) then raise exception 'Admins only' using errcode = '42501'; end if;
  code := generate_invite_code();
  update families set invite_code = code where id = fid;
  return code;
end; $$;

create or replace function public.set_member_role(fid uuid, member uuid, new_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_family_admin(fid) then raise exception 'Admins only' using errcode = '42501'; end if;
  if new_role = 'member' and member = auth.uid()
     and (select count(*) from family_members where family_id = fid and role = 'admin') <= 1 then
    raise exception 'A family needs at least one admin' using errcode = '23514';
  end if;
  update family_members set role = new_role where family_id = fid and user_id = member;
  if not found then raise exception 'Not a member of this family' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.remove_member(fid uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if member <> uid and not is_family_admin(fid) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if exists (select 1 from family_members where family_id = fid and user_id = member and role = 'admin')
     and (select count(*) from family_members where family_id = fid and role = 'admin') <= 1
     and (select count(*) from family_members where family_id = fid) > 1 then
    raise exception 'Promote another admin before leaving' using errcode = '23514';
  end if;
  if not exists (select 1 from family_members where family_id = fid and user_id = member) then
    raise exception 'Not a member of this family' using errcode = 'P0002';
  end if;
  update tasks set assigned_to = null
    where family_id = fid and assigned_to = member and status = 'pending';
  delete from family_members where family_id = fid and user_id = member;
  insert into activity (family_id, actor_id, type, subject_id)
  values (fid, uid, 'member_left', member);
  -- last member leaving removes the family entirely
  if not exists (select 1 from family_members where family_id = fid) then
    perform set_config('hearth.internal', 'on', true);
    delete from families where id = fid;
    perform set_config('hearth.internal', '', true);
  end if;
end; $$;

-- -----------------------------------------------------------------------------
-- RPC: task completion
-- -----------------------------------------------------------------------------
create or replace function public.complete_task(task uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  t   tasks;
  fam families;
  uid uuid := auth.uid();
  next_due timestamptz;
  next_id  uuid;
  awarded  integer;
  prefs    jsonb;
  r        record;
begin
  select * into t from tasks where id = task for update;
  if t.id is null or not is_family_member(t.family_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if t.assigned_to is not null and t.assigned_to <> uid and not is_family_admin(t.family_id) then
    raise exception 'Only the assignee or an admin can complete this task' using errcode = '42501';
  end if;
  if t.status = 'completed' then return t; end if;

  select * into fam from families where id = t.family_id;
  -- points go to the assignee (an admin ticking it off on a child's behalf
  -- still credits the child); unassigned tasks credit whoever did it.
  awarded := case when fam.gamification_enabled then t.points else 0 end;

  insert into task_completions (family_id, task_id, user_id, task_title, category, points)
  values (t.family_id, t.id, coalesce(t.assigned_to, uid), t.title, t.category, awarded);

  -- spawn the next occurrence of a recurring task
  if t.recurrence_freq is not null then
    perform set_config('hearth.internal', 'on', true);
    next_due := next_future_occurrence(t.due_at, t.recurrence_freq, t.recurrence_interval,
                                       t.recurrence_weekdays, fam.timezone);
    if next_due is not null then
      insert into tasks (family_id, title, description, category, priority, points, assigned_to,
                         created_by, due_at, recurrence_freq, recurrence_interval,
                         recurrence_weekdays, series_id)
      values (t.family_id, t.title, t.description, t.category, t.priority, t.points, t.assigned_to,
              t.created_by, next_due, t.recurrence_freq, t.recurrence_interval,
              t.recurrence_weekdays, coalesce(t.series_id, t.id))
      returning id into next_id;
    end if;
    perform set_config('hearth.internal', '', true);
  end if;

  update tasks set status = 'completed', completed_at = now(),
                   completed_by = coalesce(t.assigned_to, uid), next_task_id = next_id
   where id = t.id returning * into t;

  insert into activity (family_id, actor_id, type, task_id, subject_id, meta)
  values (t.family_id, uid, 'task_completed', t.id, t.completed_by,
          jsonb_build_object('title', t.title, 'points', awarded));

  -- tell admins and the task creator (never the person who just did it)
  for r in
    select distinct p.id, p.notification_prefs from profiles p
    join family_members m on m.user_id = p.id and m.family_id = t.family_id
    where (m.role = 'admin' or p.id = t.created_by) and p.id <> uid
  loop
    if coalesce((r.notification_prefs ->> 'completed')::boolean, true) then
      insert into notifications (family_id, user_id, type, title, body, task_id)
      values (t.family_id, r.id, 'completed', display_name_of(uid) || ' completed a task', t.title, t.id);
    end if;
  end loop;

  -- clear outstanding deadline reminders for this task
  delete from notifications where task_id = t.id and type in ('due_soon', 'overdue') and read_at is null;
  return t;
end; $$;

create or replace function public.uncomplete_task(task uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  t   tasks;
  nxt tasks;
  uid uuid := auth.uid();
begin
  select * into t from tasks where id = task for update;
  if t.id is null or not is_family_member(t.family_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if t.completed_by is distinct from uid and t.assigned_to is distinct from uid
     and not is_family_admin(t.family_id) then
    raise exception 'Only the assignee or an admin can undo this task' using errcode = '42501';
  end if;
  if t.status = 'pending' then return t; end if;

  -- remove the auto-spawned next occurrence if nobody has touched it yet
  if t.next_task_id is not null then
    select * into nxt from tasks where id = t.next_task_id;
    if nxt.id is not null and nxt.status = 'pending' then
      perform set_config('hearth.internal', 'on', true);
      delete from tasks where id = nxt.id;
      perform set_config('hearth.internal', '', true);
    end if;
  end if;

  delete from task_completions where task_id = t.id;
  update tasks set status = 'pending', completed_at = null, completed_by = null, next_task_id = null
   where id = t.id returning * into t;

  insert into activity (family_id, actor_id, type, task_id, meta)
  values (t.family_id, uid, 'task_reopened', t.id, jsonb_build_object('title', t.title));
  return t;
end; $$;

-- -----------------------------------------------------------------------------
-- RPC: rewards
-- -----------------------------------------------------------------------------
create or replace function public.points_balance(fid uuid, member uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select sum(points) from task_completions where family_id = fid and user_id = member), 0)
       - coalesce((select sum(cost) from reward_redemptions where family_id = fid and user_id = member), 0);
$$;

create or replace function public.redeem_reward(reward uuid)
returns public.reward_redemptions language plpgsql security definer set search_path = public as $$
declare
  rw  rewards;
  red reward_redemptions;
  uid uuid := auth.uid();
  r   record;
begin
  select * into rw from rewards where id = reward;
  if rw.id is null or not is_family_member(rw.family_id) or not rw.active then
    raise exception 'Reward not available' using errcode = 'P0002';
  end if;
  -- serialise redemptions per user so two clicks can't overspend
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if points_balance(rw.family_id, uid) < rw.cost then
    raise exception 'Not enough points' using errcode = '23514';
  end if;
  insert into reward_redemptions (family_id, reward_id, user_id, title, cost)
  values (rw.family_id, rw.id, uid, rw.title, rw.cost) returning * into red;
  insert into activity (family_id, actor_id, type, meta)
  values (rw.family_id, uid, 'reward_redeemed', jsonb_build_object('title', rw.title, 'cost', rw.cost));
  for r in select user_id from family_members where family_id = rw.family_id and role = 'admin' and user_id <> uid loop
    insert into notifications (family_id, user_id, type, title, body)
    values (rw.family_id, r.user_id, 'reward', display_name_of(uid) || ' redeemed a reward',
            rw.emoji || ' ' || rw.title || ' · ' || rw.cost || ' pts');
  end loop;
  return red;
end; $$;

-- -----------------------------------------------------------------------------
-- Deadline notifications (upcoming + overdue)
-- Idempotent thanks to notifications_deadline_uniq. Runs from pg_cron when
-- available, and is also called by clients for their own family on load.
-- -----------------------------------------------------------------------------
create or replace function public.generate_deadline_notifications(only_family uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; c integer;
begin
  -- due within the next 24 hours -> assignee
  insert into notifications (family_id, user_id, type, title, body, task_id)
  select t.family_id, t.assigned_to, 'due_soon', 'Due soon', t.title, t.id
    from tasks t join profiles p on p.id = t.assigned_to
   where t.status = 'pending' and t.due_at > now() and t.due_at <= now() + interval '24 hours'
     and (only_family is null or t.family_id = only_family)
     and coalesce((p.notification_prefs ->> 'due_soon')::boolean, true)
  on conflict (user_id, task_id, type) where type in ('due_soon', 'overdue') do nothing;
  get diagnostics c = row_count; n := n + c;

  -- overdue -> assignee + admins
  insert into notifications (family_id, user_id, type, title, body, task_id)
  select distinct t.family_id, u.uid, 'overdue',
         case when u.uid = t.assigned_to then 'Overdue' else 'Overdue: ' || display_name_of(t.assigned_to) end,
         t.title, t.id
    from tasks t
    cross join lateral (
      select t.assigned_to as uid where t.assigned_to is not null
      union
      select m.user_id from family_members m where m.family_id = t.family_id and m.role = 'admin'
    ) u
    join profiles p on p.id = u.uid
   where t.status = 'pending' and t.due_at <= now()
     and (only_family is null or t.family_id = only_family)
     and coalesce((p.notification_prefs ->> 'overdue')::boolean, true)
  on conflict (user_id, task_id, type) where type in ('due_soon', 'overdue') do nothing;
  get diagnostics c = row_count; n := n + c;
  return n;
end; $$;

create or replace function public.check_my_deadlines()
returns integer language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from family_members where user_id = auth.uid() limit 1;
  if fid is null then return 0; end if;
  return generate_deadline_notifications(fid);
end; $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.families           enable row level security;
alter table public.family_members     enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_completions   enable row level security;
alter table public.activity           enable row level security;
alter table public.notifications      enable row level security;
alter table public.rewards            enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.challenges         enable row level security;

-- profiles: yourself + people in your family
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or shares_family_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- families: members read, admins update. Creation goes through create_family().
create policy families_select on public.families for select to authenticated
  using (is_family_member(id));
create policy families_update on public.families for update to authenticated
  using (is_family_admin(id)) with check (is_family_admin(id));

-- family_members: read within family. Writes via RPCs only.
create policy family_members_select on public.family_members for select to authenticated
  using (is_family_member(family_id));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (is_family_member(family_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (is_family_member(family_id) and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
  using (is_family_admin(family_id) or created_by = auth.uid())
  with check (is_family_member(family_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (is_family_admin(family_id) or created_by = auth.uid());

-- read-only, family-scoped tables (written by RPCs / triggers)
create policy task_completions_select on public.task_completions for select to authenticated
  using (is_family_member(family_id));
create policy activity_select on public.activity for select to authenticated
  using (is_family_member(family_id));
create policy reward_redemptions_select on public.reward_redemptions for select to authenticated
  using (is_family_member(family_id));

-- notifications: strictly personal
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- rewards + challenges: members read, admins manage
create policy rewards_select on public.rewards for select to authenticated
  using (is_family_member(family_id));
create policy rewards_write on public.rewards for all to authenticated
  using (is_family_admin(family_id)) with check (is_family_admin(family_id));
create policy challenges_select on public.challenges for select to authenticated
  using (is_family_member(family_id));
create policy challenges_write on public.challenges for all to authenticated
  using (is_family_admin(family_id)) with check (is_family_admin(family_id));

-- -----------------------------------------------------------------------------
-- Grants (defence in depth on top of RLS)
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

revoke insert, update, delete on public.families, public.family_members, public.task_completions,
  public.activity, public.reward_redemptions from authenticated;
grant select on all tables in schema public to authenticated;

revoke insert, update on public.profiles from authenticated;
grant update (display_name, avatar_color, avatar_emoji, notification_prefs) on public.profiles to authenticated;

grant update (name, timezone, gamification_enabled) on public.families to authenticated;

-- tasks: clients may write content columns; completion state is RPC-only
revoke insert, update on public.tasks from authenticated;
grant insert (family_id, title, description, category, priority, points, assigned_to, created_by,
              due_at, recurrence_freq, recurrence_interval, recurrence_weekdays)
  on public.tasks to authenticated;
grant update (title, description, category, priority, points, assigned_to, due_at,
              recurrence_freq, recurrence_interval, recurrence_weekdays)
  on public.tasks to authenticated;
grant delete on public.tasks to authenticated;

revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

grant insert, update, delete on public.rewards, public.challenges to authenticated;

grant execute on function
  public.is_family_member(uuid), public.is_family_admin(uuid), public.shares_family_with(uuid),
  public.create_family(text, text), public.join_family(text), public.regenerate_invite_code(uuid),
  public.set_member_role(uuid, uuid, public.member_role), public.remove_member(uuid, uuid),
  public.complete_task(uuid), public.uncomplete_task(uuid), public.redeem_reward(uuid),
  public.points_balance(uuid, uuid), public.check_my_deadlines(),
  public.next_occurrence(timestamptz, public.recurrence_freq, integer, smallint[], text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: broadcast row changes (RLS is applied per subscriber)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.tasks, public.task_completions, public.family_members, public.families,
      public.activity, public.notifications, public.rewards, public.reward_redemptions,
      public.challenges, public.profiles;
  end if;
end $$;
-- full row on delete so clients can tell which family a deleted row belonged to
alter table public.tasks replica identity full;
alter table public.family_members replica identity full;

-- -----------------------------------------------------------------------------
-- Scheduled deadline reminders (pg_cron is available on Supabase projects)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('hearth-deadline-notifications', '*/10 * * * *',
                          'select public.generate_deadline_notifications()');
  end if;
exception when others then
  raise notice 'pg_cron not configured (%); clients will trigger deadline checks instead', sqlerrm;
end $$;
