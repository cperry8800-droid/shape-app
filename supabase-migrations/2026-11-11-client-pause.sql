-- A client's pause: "away until <date>" (owner, 2026-11-11, with the coach-alerts review: a pause
-- with a return date, set by the member or any of their coaches; billing continues).
--
-- While a client is paused, the alerts that read their absence (no food logs, no check-in, gone quiet,
-- missed sessions) stay quiet for every coach on them, their own reminders pause, and the Shape Score
-- takes no penalty for the days. When it ends, each coach sees "Back from a break" for three days, and
-- the gaps count from the day they came back. The engine reads it from the client's overview
-- (src/lib/shared-overview.ts → public/newdesign/dashSignals.js pauseOf).
--
-- ⚠ ITS OWN TABLE, NOT THE MEMBER'S SETTINGS DOCUMENT. user_goals('client_settings') already carries a
-- `paused_until` the Score penalty reads, but the member's app saves that document whole (read →
-- spread → save), so a coach's write into it would be lost to the member's next save of any setting.
-- Written only through set_client_pause; read only through get_client_pause and the service role.
--
-- ⚠ ONE ROW A BREAK, FROM ITS FIRST DAY AWAY TO ITS LAST, AND IT OUTLIVES ITS END (Codex on #2705).
-- The Score cron looks back over the past days, so a break ended early must still say which days it
-- covered, and a break begun today covers none before it. Ending early sets the last day to yesterday
-- (a break begun today is removed: no day of it has passed); a new break after one has ended is a new
-- row. Its days are the member's own (profiles.timezone, else UTC's).
--
-- set_client_pause(client, until): the member, or a coach on the client (is_coach_on_client: an
-- active, trialing or past-due subscription from them), sets the last day away, from today to 90 days
-- on in the member's calendar (a day either side is accepted, for a device on another calendar, and
-- never before today), or ends the break (null). Anyone else is refused.
-- get_client_pause(client): the same people read the latest break, and who set it (the role, and
-- whether it was the caller), while it holds and for 15 days after it ends (the engine's three days of
-- "Back" and its count from the return day), with the instant the member's return day begins (back_at).
-- Never the setter's id, nor the member's zone.
--
-- Called by: src/lib/shared-overview.ts (each client's `pause`), mobile-app/src/services/clientPause.mjs
-- (the member's Settings and a coach's case file in the app), public/supabase.js (the website's client
-- panel), and the live push as the member (notify-core loadMemberPaused). The service role reads the
-- table itself (src/lib/client-pause.mjs): the hourly push, the Shape Score's penalties and the
-- night-before prep reminder.
--
-- Re-runnable: "if not exists", "create or replace", the read function dropped first, and the first
-- run's one-row-a-client table turned into this one in place; a guard checks the result.

begin;

create table if not exists public.client_pauses (
  id          bigint generated always as identity primary key,
  client_id   uuid not null references auth.users (id) on delete cascade,
  from_on     date not null default current_date,
  until_on    date not null,
  set_by      uuid references auth.users (id) on delete set null,
  set_by_role text not null check (set_by_role in ('member', 'trainer', 'nutritionist')),
  set_at      timestamptz not null default now(),
  constraint client_pauses_days check (from_on <= until_on)
);

-- The first run of this file (2026-11-11) made one row a client, keyed on it, with no first day.
do $shape$
declare
  r     record;
  v_day date;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'client_pauses' and column_name = 'from_on') then
    alter table public.client_pauses add column from_on date;
    -- Its first day is the day it was set in the member's calendar, as the functions below count their
    -- days (Codex on #2705), not the database's: UTC's when their zone is empty or one Postgres does not know.
    for r in select c.client_id, c.set_at, c.until_on, pr.timezone
             from public.client_pauses c left join public.profiles pr on pr.id = c.client_id loop
      begin
        v_day := (r.set_at at time zone coalesce(nullif(r.timezone, ''), 'UTC'))::date;
      exception when others then
        v_day := (r.set_at at time zone 'UTC')::date;
      end;
      update public.client_pauses set from_on = least(v_day, r.until_on) where client_id = r.client_id;
    end loop;
    alter table public.client_pauses alter column from_on set not null, alter column from_on set default current_date;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'client_pauses' and column_name = 'id') then
    alter table public.client_pauses drop constraint if exists client_pauses_pkey;
    alter table public.client_pauses alter column client_id set not null;
    alter table public.client_pauses add column id bigint generated always as identity primary key;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.client_pauses'::regclass and conname = 'client_pauses_days') then
    alter table public.client_pauses add constraint client_pauses_days check (from_on <= until_on);
  end if;
end
$shape$;
create index if not exists client_pauses_client_until on public.client_pauses (client_id, until_on desc);

alter table public.client_pauses enable row level security;
-- No policy: nobody reads or writes the table directly. The two functions below are the only way in,
-- and the service role (the crons) reads it as it reads every table.
revoke all on table public.client_pauses from public, anon, authenticated;
grant select on table public.client_pauses to service_role;

create or replace function public.set_client_pause(p_client_id uuid, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_tz    text;
  v_today date;
  v_cur   public.client_pauses%rowtype;
  v_until date;
begin
  if v_uid is null or p_client_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_uid = p_client_id then
    v_role := 'member';
  elsif public.is_coach_on_client(p_client_id) then
    -- The coach's listing on this client: a trainer's when they hold one on it, else a nutritionist's.
    v_role := case when exists (
      select 1 from public.subscriptions s join public.trainers t on t.id = s.provider_id
      where s.client_id = p_client_id and s.provider_role = 'trainer'
        and s.status in ('active', 'trialing', 'past_due') and t.owner_id = v_uid
    ) then 'trainer' else 'nutritionist' end;
  else
    raise exception 'not this client''s member or coach' using errcode = '42501';
  end if;

  -- The member's own calendar day (Codex on #2705: a member ahead of UTC picks their today + 90).
  select p.timezone into v_tz from public.profiles p where p.id = p_client_id;
  begin
    v_today := (now() at time zone coalesce(nullif(v_tz, ''), 'UTC'))::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;
  -- One write at a time for a client, so two saves never start two breaks.
  perform pg_advisory_xact_lock(hashtextextended('client_pause:' || p_client_id::text, 0));
  select * into v_cur from public.client_pauses
  where client_id = p_client_id and until_on >= v_today
  order by from_on desc, id desc
  limit 1;

  if p_until is null then
    if v_cur.id is null then
      return jsonb_build_object('paused', false);
    end if;
    if v_cur.from_on >= v_today then
      delete from public.client_pauses where id = v_cur.id;
    else
      update public.client_pauses set until_on = v_today - 1 where id = v_cur.id;
    end if;
    return jsonb_build_object('paused', false);
  end if;
  if p_until < v_today - 1 or p_until > v_today + 91 then
    raise exception 'a pause ends between today and 90 days from now' using errcode = '22023';
  end if;
  v_until := greatest(p_until, v_today);

  if v_cur.id is not null then
    update public.client_pauses
    set until_on = v_until, set_by = v_uid, set_by_role = v_role, set_at = now()
    where id = v_cur.id;
  else
    insert into public.client_pauses (client_id, from_on, until_on, set_by, set_by_role, set_at)
    values (p_client_id, v_today, v_until, v_uid, v_role, now());
  end if;
  return jsonb_build_object('paused', true, 'until', v_until, 'by', v_role);
end;
$$;

-- ⚠ ITS COLUMNS ARE ITS SIGNATURE: "create or replace" cannot change a table function's columns, so a
-- run of an older draft of this file is dropped first (no caller exists before this migration).
-- ⚠ back_at IS THE INSTANT THE MEMBER'S RETURN DAY BEGINS (Codex on #2705). A coach reads the break on
-- their own calendar, so one a day ahead of the member saw "Back from a break" while the member was
-- still away, and one behind still saw them away after they came back. The instant is the same on every
-- calendar, and the member's zone is never handed to the coach.
drop function if exists public.get_client_pause(uuid);
create or replace function public.get_client_pause(p_client_id uuid)
returns table (until_on date, set_by_role text, set_at timestamptz, set_by_me boolean, back_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tz  text;
begin
  if v_uid is null or p_client_id is null
     or not (v_uid = p_client_id or public.is_coach_on_client(p_client_id)) then
    return;
  end if;
  -- The member's zone, as set_client_pause counts their days; UTC when it is empty or unknown.
  select pr.timezone into v_tz from public.profiles pr where pr.id = p_client_id;
  v_tz := coalesce(nullif(v_tz, ''), 'UTC');
  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
  end;
  return query
  select c.until_on, c.set_by_role, c.set_at, c.set_by is not distinct from v_uid,
         (c.until_on + 1)::timestamp at time zone v_tz
  from public.client_pauses c
  where c.client_id = p_client_id
    and c.until_on >= (now() at time zone v_tz)::date - 15
  order by c.from_on desc, c.id desc
  limit 1;
end;
$$;

revoke all on function public.set_client_pause(uuid, date) from public, anon;
grant execute on function public.set_client_pause(uuid, date) to authenticated;
revoke all on function public.get_client_pause(uuid) from public, anon;
grant execute on function public.get_client_pause(uuid) to authenticated, service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.client_pauses'::regclass) then
    raise exception 'client_pauses must have row level security on';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'client_pauses'
      and column_name in ('id', 'from_on', 'until_on')) <> 3
     or not exists (select 1 from pg_constraint where conrelid = 'public.client_pauses'::regclass and conname = 'client_pauses_days') then
    raise exception 'client_pauses must keep one row a break, from its first day to its last';
  end if;
  if position('back_at timestamp with time zone' in pg_get_function_result('public.get_client_pause(uuid)'::regprocedure)) = 0 then
    raise exception 'get_client_pause must say when the member is back (back_at)';
  end if;
  if has_table_privilege('authenticated', 'public.client_pauses', 'select')
     or has_table_privilege('anon', 'public.client_pauses', 'select')
     or has_table_privilege('authenticated', 'public.client_pauses', 'insert') then
    raise exception 'client_pauses must be reached only through its functions';
  end if;
  if has_function_privilege('anon', 'public.set_client_pause(uuid, date)', 'execute')
     or has_function_privilege('anon', 'public.get_client_pause(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_client_pause(uuid, date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_client_pause(uuid)', 'execute') then
    raise exception 'the pause functions must be executable by signed-in callers only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('set_client_pause', 'get_client_pause')
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
  ) then
    raise exception 'the pause functions must be definers with a pinned search_path';
  end if;
  -- Signed out (no auth.uid() here), it answers nothing.
  if exists (select 1 from public.get_client_pause((select client_id from public.client_pauses limit 1))) then
    raise exception 'get_client_pause answered with no caller';
  end if;
end
$guard$;

commit;
