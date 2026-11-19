-- =====================================================================
--  Teamsheet database
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  It is safe to run again later (it only creates what is missing and
--  replaces the functions with the latest version).
--
--  How security works (read this once):
--  * Players have no accounts. Anyone with the share link can read the
--    squad's game and tap In / Maybe / Out.
--  * The tables below are LOCKED (row level security on, no policies),
--    so the public "anon" key in the website cannot read or change them
--    directly.
--  * Instead the website calls the functions at the bottom of this file
--    (Supabase calls them "RPC"). Each function checks the share code
--    or the organiser's secret token before doing anything.
--  * The organiser token is never stored, only a SHA-256 hash of it.
-- =====================================================================

create schema if not exists teamsheet_private;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------

create table if not exists public.squads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  share_code  text not null unique,
  admin_hash  bytea not null unique,
  currency    text not null default 'GBP' check (currency in ('GBP','EUR','USD')),
  created_at  timestamptz not null default now()
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  squad_id    uuid not null references public.squads(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  skill       smallint not null default 3 check (skill between 1 and 5),
  is_keeper   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists players_squad_name_key
  on public.players (squad_id, lower(name));

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  squad_id    uuid not null references public.squads(id) on delete cascade,
  kickoff     timestamptz not null,
  venue       text check (char_length(venue) <= 80),
  capacity    smallint not null default 10 check (capacity between 2 and 30),
  price       numeric(7,2) check (price >= 0 and price <= 1000),
  note        text check (char_length(note) <= 200),
  teams       jsonb,
  closed      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists games_squad_idx on public.games (squad_id, kickoff);

create table if not exists public.responses (
  game_id     uuid not null references public.games(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  status      text check (status in ('in','maybe','out')),  -- null = no reply
  in_since    timestamptz,       -- when they said "In": decides who is a reserve
  updated_at  timestamptz not null default now(),
  paid        boolean not null default false,
  attended    boolean,
  primary key (game_id, player_id)
);

-- Lock the tables: the website can only use the functions below.
alter table public.squads    enable row level security;
alter table public.players   enable row level security;
alter table public.games     enable row level security;
alter table public.responses enable row level security;
revoke all on public.squads, public.players, public.games, public.responses
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  Private helpers (not reachable from the website)
-- ---------------------------------------------------------------------

create or replace function teamsheet_private.token_hash(p_token text)
returns bytea language sql immutable as $$
  select sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
$$;

create or replace function teamsheet_private.random_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function teamsheet_private.random_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  b bytea := uuid_send(gen_random_uuid());
  out text := '';
begin
  for i in 0..7 loop
    out := out || substr(alphabet, get_byte(b, i) % 31 + 1, 1);
  end loop;
  return out;
end $$;

create or replace function teamsheet_private.squad_by_code(p_code text)
returns public.squads language plpgsql stable set search_path = public, pg_temp as $$
declare s public.squads;
begin
  select * into s from public.squads where share_code = lower(trim(p_code));
  if not found then
    raise exception 'Squad not found. Check the link you were sent.';
  end if;
  return s;
end $$;

create or replace function teamsheet_private.squad_by_token(p_token text)
returns public.squads language plpgsql stable set search_path = public, pg_temp as $$
declare s public.squads;
begin
  select * into s from public.squads
   where admin_hash = teamsheet_private.token_hash(p_token);
  if not found then
    raise exception 'This organiser link is not valid.';
  end if;
  return s;
end $$;

-- The "current" game: the next open game that has not long finished,
-- otherwise the most recent open game. Closed games are history.
create or replace function teamsheet_private.current_game_id(p_squad uuid)
returns uuid language sql stable set search_path = public, pg_temp as $$
  select g.id from public.games g
   where g.squad_id = p_squad and not g.closed
   order by (g.kickoff > now() - interval '12 hours') desc,
            case when g.kickoff > now() - interval '12 hours' then g.kickoff end asc,
            g.kickoff desc
   limit 1
$$;

create or replace function teamsheet_private.game_in_squad(p_game uuid, p_squad uuid)
returns public.games language plpgsql stable set search_path = public, pg_temp as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game and squad_id = p_squad;
  if not found then raise exception 'Game not found.'; end if;
  return g;
end $$;

create or replace function teamsheet_private.check_player(p_player uuid, p_squad uuid)
returns void language plpgsql stable set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.players where id = p_player and squad_id = p_squad) then
    raise exception 'Player not found.';
  end if;
end $$;

create or replace function teamsheet_private.players_json(p_squad uuid, p_private boolean)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('id', p.id, 'name', p.name,
                              'is_keeper', p.is_keeper, 'active', p.active)
           || case when p_private then jsonb_build_object('skill', p.skill)
                   else '{}'::jsonb end
           order by lower(p.name)), '[]'::jsonb)
    from public.players p where p.squad_id = p_squad
$$;

create or replace function teamsheet_private.game_json(p_game uuid, p_private boolean)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', g.id, 'kickoff', g.kickoff, 'venue', g.venue,
    'capacity', g.capacity, 'price', g.price, 'note', g.note, 'closed', g.closed,
    -- players only see teams once the organiser publishes them
    'teams', case when p_private or coalesce((g.teams->>'published')::boolean, false)
                  then g.teams end,
    'responses', coalesce((
       select jsonb_agg(
                jsonb_build_object('player_id', r.player_id, 'status', r.status,
                                   'in_since', r.in_since, 'updated_at', r.updated_at)
                || case when p_private
                        then jsonb_build_object('paid', r.paid, 'attended', r.attended)
                        else '{}'::jsonb end
                order by r.in_since nulls last, r.updated_at)
         from public.responses r where r.game_id = g.id), '[]'::jsonb))
  from public.games g where g.id = p_game
$$;

create or replace function teamsheet_private.apply_response(p_game uuid, p_player uuid, p_status text)
returns void language plpgsql volatile set search_path = public, pg_temp as $$
begin
  if p_status is not null and p_status not in ('in','maybe','out') then
    raise exception 'Status must be in, maybe or out.';
  end if;
  insert into public.responses (game_id, player_id, status, in_since, updated_at)
  values (p_game, p_player, p_status, case when p_status = 'in' then clock_timestamp() end, clock_timestamp())
  on conflict (game_id, player_id) do update set
    -- keep your place in the queue if you were already "in"
    in_since = case when excluded.status = 'in'
                    then coalesce(case when responses.status = 'in' then responses.in_since end, clock_timestamp())
               end,
    status = excluded.status,
    updated_at = clock_timestamp();
end $$;

-- ---------------------------------------------------------------------
--  Public functions: used by players (share code, no account)
-- ---------------------------------------------------------------------

create or replace function public.create_squad(p_name text, p_players text[] default '{}', p_currency text default 'GBP')
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_token text := teamsheet_private.random_token();
  v_code  text;
  v_id    uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Give your squad a name.'; end if;
  if coalesce(array_length(p_players, 1), 0) > 60 then raise exception 'Max 60 players.'; end if;
  loop
    v_code := teamsheet_private.random_code();
    exit when not exists (select 1 from public.squads where share_code = v_code);
  end loop;
  insert into public.squads (name, share_code, admin_hash, currency)
  values (trim(p_name), v_code, teamsheet_private.token_hash(v_token), coalesce(p_currency, 'GBP'))
  returning id into v_id;

  insert into public.players (squad_id, name)
  select v_id, min(trim(n)) from unnest(p_players) n
   where trim(n) <> '' group by lower(trim(n));

  return jsonb_build_object('share_code', v_code, 'admin_token', v_token);
end $$;

create or replace function public.get_squad(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_code(p_code);
begin
  return jsonb_build_object(
    'squad',   jsonb_build_object('name', s.name, 'code', s.share_code, 'currency', s.currency),
    'players', teamsheet_private.players_json(s.id, false),
    'game',    teamsheet_private.game_json(teamsheet_private.current_game_id(s.id), false));
end $$;

create or replace function public.set_response(p_code text, p_game uuid, p_player uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s public.squads := teamsheet_private.squad_by_code(p_code);
  g public.games  := teamsheet_private.game_in_squad(p_game, s.id);
begin
  if g.closed then raise exception 'This game is finished.'; end if;
  if not exists (select 1 from public.players where id = p_player and squad_id = s.id and active) then
    raise exception 'Player not found.';
  end if;
  perform teamsheet_private.apply_response(p_game, p_player, p_status);
  return public.get_squad(p_code);
end $$;

-- "Not on the list? Add me" for new players in the WhatsApp group.
create or replace function public.join_squad(p_code text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s public.squads := teamsheet_private.squad_by_code(p_code);
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Enter a name (max 40 letters).'; end if;
  select id into v_id from public.players where squad_id = s.id and lower(name) = lower(v_name);
  if v_id is null then
    if (select count(*) from public.players where squad_id = s.id and active) >= 60 then
      raise exception 'This squad is full.';
    end if;
    insert into public.players (squad_id, name) values (s.id, v_name) returning id into v_id;
  else
    update public.players set active = true where id = v_id;
  end if;
  return jsonb_build_object('player_id', v_id, 'data', public.get_squad(p_code));
end $$;

-- ---------------------------------------------------------------------
--  Organiser functions: need the secret organiser token
-- ---------------------------------------------------------------------

create or replace function public.admin_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  return jsonb_build_object(
    'squad',   jsonb_build_object('name', s.name, 'code', s.share_code, 'currency', s.currency),
    'players', teamsheet_private.players_json(s.id, true),
    'game',    teamsheet_private.game_json(teamsheet_private.current_game_id(s.id), true),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'kickoff', g.kickoff, 'venue', g.venue, 'price', g.price,
               'capacity', g.capacity, 'note', g.note, 'closed', g.closed,
               'attended', (select count(*) from public.responses r where r.game_id = g.id and r.attended),
               'paid',     (select count(*) from public.responses r where r.game_id = g.id and r.attended and r.paid))
             order by g.kickoff desc)
        from (select * from public.games where squad_id = s.id and closed
              order by kickoff desc limit 30) g), '[]'::jsonb),
    'stats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'player_id', p.id,
               'played',      (select count(*) from public.responses r join public.games g on g.id = r.game_id
                                where r.player_id = p.id and g.closed and r.attended),
               'owed_games',  (select count(*) from public.responses r join public.games g on g.id = r.game_id
                                where r.player_id = p.id and g.closed and r.attended and not r.paid
                                  and coalesce(g.price, 0) > 0),
               'owed_amount', (select coalesce(sum(g.price), 0) from public.responses r join public.games g on g.id = r.game_id
                                where r.player_id = p.id and g.closed and r.attended and not r.paid),
               'last_played', (select max(g.kickoff) from public.responses r join public.games g on g.id = r.game_id
                                where r.player_id = p.id and g.closed and r.attended)))
        from public.players p where p.squad_id = s.id), '[]'::jsonb),
    'closed_games', (select count(*) from public.games where squad_id = s.id and closed));
end $$;

create or replace function public.admin_get_game(p_token text, p_game uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.squads := teamsheet_private.squad_by_token(p_token);
  g public.games  := teamsheet_private.game_in_squad(p_game, s.id);
begin
  return teamsheet_private.game_json(g.id, true);
end $$;

create or replace function public.admin_save_player(p_token text, p_player uuid, p_name text, p_skill int, p_is_keeper boolean)
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s public.squads := teamsheet_private.squad_by_token(p_token);
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 40 then raise exception 'Enter a name (max 40 letters).'; end if;
  if p_skill not between 1 and 5 then raise exception 'Skill must be 1 to 5.'; end if;
  if p_player is null then
    -- re-adding someone who was removed brings them back with their history
    select id into v_id from public.players where squad_id = s.id and lower(name) = lower(v_name);
    if v_id is null then
      insert into public.players (squad_id, name, skill, is_keeper)
      values (s.id, v_name, p_skill, coalesce(p_is_keeper, false)) returning id into v_id;
      return v_id;
    end if;
    p_player := v_id;
  else
    perform teamsheet_private.check_player(p_player, s.id);
  end if;
  begin
    update public.players
       set name = v_name, skill = p_skill, is_keeper = coalesce(p_is_keeper, false), active = true
     where id = p_player;
  exception when unique_violation then
    raise exception 'There is already a player called %.', v_name;
  end;
  return p_player;
end $$;

create or replace function public.admin_remove_player(p_token text, p_player uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  perform teamsheet_private.check_player(p_player, s.id);
  -- keep their history, just hide them and free their spot in open games
  update public.players set active = false where id = p_player;
  delete from public.responses r using public.games g
   where r.game_id = g.id and g.squad_id = s.id and not g.closed and r.player_id = p_player;
end $$;

create or replace function public.admin_save_game(
  p_token text, p_game uuid, p_kickoff timestamptz, p_venue text,
  p_capacity int, p_price numeric, p_note text)
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  if p_kickoff is null then raise exception 'Pick a date and time.'; end if;
  if p_game is null then
    insert into public.games (squad_id, kickoff, venue, capacity, price, note)
    values (s.id, p_kickoff, nullif(trim(p_venue), ''), coalesce(p_capacity, 10), p_price, nullif(trim(p_note), ''))
    returning id into p_game;
  else
    perform teamsheet_private.game_in_squad(p_game, s.id);
    update public.games set kickoff = p_kickoff, venue = nullif(trim(p_venue), ''),
           capacity = coalesce(p_capacity, 10), price = p_price, note = nullif(trim(p_note), '')
     where id = p_game;
  end if;
  return p_game;
end $$;

create or replace function public.admin_delete_game(p_token text, p_game uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  perform teamsheet_private.game_in_squad(p_game, s.id);
  delete from public.games where id = p_game;
end $$;

create or replace function public.admin_set_response(p_token text, p_game uuid, p_player uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  perform teamsheet_private.game_in_squad(p_game, s.id);
  perform teamsheet_private.check_player(p_player, s.id);
  perform teamsheet_private.apply_response(p_game, p_player, p_status);
end $$;

create or replace function public.admin_set_paid(p_token text, p_game uuid, p_player uuid, p_paid boolean)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  perform teamsheet_private.game_in_squad(p_game, s.id);
  perform teamsheet_private.check_player(p_player, s.id);
  insert into public.responses (game_id, player_id, paid) values (p_game, p_player, coalesce(p_paid, false))
  on conflict (game_id, player_id) do update set paid = excluded.paid;
end $$;

create or replace function public.admin_save_teams(p_token text, p_game uuid, p_teams jsonb)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  perform teamsheet_private.game_in_squad(p_game, s.id);
  if p_teams is not null and (jsonb_typeof(p_teams) <> 'object' or length(p_teams::text) > 5000) then
    raise exception 'Invalid teams.';
  end if;
  update public.games set teams = p_teams where id = p_game;
end $$;

-- Tick who actually turned up. p_close = true moves the game to history.
create or replace function public.admin_log_attendance(p_token text, p_game uuid, p_attended uuid[], p_close boolean)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.squads := teamsheet_private.squad_by_token(p_token);
begin
  perform teamsheet_private.game_in_squad(p_game, s.id);
  p_attended := coalesce(p_attended, '{}');
  insert into public.responses (game_id, player_id, attended)
  select p_game, p.id, true from public.players p
   where p.squad_id = s.id and p.id = any(p_attended)
  on conflict (game_id, player_id) do update set attended = true;
  update public.responses set attended = false
   where game_id = p_game and not (player_id = any(p_attended));
  update public.games set closed = coalesce(p_close, false) where id = p_game;
end $$;

-- ---------------------------------------------------------------------
--  Permissions: helpers private, public functions callable by the site
-- ---------------------------------------------------------------------

revoke all on schema teamsheet_private from public;
revoke execute on all functions in schema teamsheet_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema teamsheet_private from anon, authenticated';
    execute 'revoke execute on all functions in schema teamsheet_private from anon, authenticated';
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_squad(text, text[], text)',
    'get_squad(text)',
    'set_response(text, uuid, uuid, text)',
    'join_squad(text, text)',
    'admin_get(text)',
    'admin_get_game(text, uuid)',
    'admin_save_player(text, uuid, text, int, boolean)',
    'admin_remove_player(text, uuid)',
    'admin_save_game(text, uuid, timestamptz, text, int, numeric, text)',
    'admin_delete_game(text, uuid)',
    'admin_set_response(text, uuid, uuid, text)',
    'admin_set_paid(text, uuid, uuid, boolean)',
    'admin_save_teams(text, uuid, jsonb)',
    'admin_log_attendance(text, uuid, uuid[], boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon, authenticated', f);
    end if;
  end loop;
end $$;

-- Ask the Supabase API to notice the new functions straight away.
notify pgrst, 'reload schema';
