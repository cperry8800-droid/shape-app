-- How Shape Radio is listened to, for the admin Overview's Radio tab (owner, 2026-10-30: "do we
-- have any tracking for shape radio?", then "Yes build it"): tune-ins a day, minutes listened, the
-- most listening at once, and who listened, on the website or in the app.
--
--   1. radio_listen_days: one row per day, surface (web or app) and audience (member or coach),
--      holding the day's tune-ins and seconds listened. Daily totals only: no account, device or
--      address is kept with a count.
--   2. radio_listen_peaks: one row per day, the most accounts listening at once and when.
--   3. radio_listen_live: the listens playing right now, one row each with its account, so a
--      listener is counted once and the seconds credited can't run ahead of the clock. An ended
--      listen is marked ended, so a beat that arrives after its end reopens nothing, and every row
--      goes 30 minutes after its last beat (at the next beat from anyone, or the nightly purge). It
--      is the "listening now" figure, not a history.
--   4. record_radio_listen(): a player's beat (POST /api/analytics/radio-listen, with the service
--      role). The player sends one as the stream starts, one a minute while it plays, and one as it
--      stops (public/newdesign/radioListening.mjs).
--   5. admin_radio_stats(): what the Radio tab shows, for a period.
--
-- The stream is members only (src/app/api/radio/station/route.ts), so every listener has an
-- account: a beat without one is not counted. The same consent rule as the tap counts decides
-- whether a player sends anything. The cron at /api/cron/analytics-purge drops the daily rows after
-- 12 months.
--
-- ===== WHO CAN READ IT =====
-- Nobody through the API: RLS is on with no policies, and the functions are the service role's
-- alone. The console checks the staff level (the Overview's: analyst and up) and then reads with
-- the service role.
--
-- Needs ui_click_day() from 2026-10-28-click-counts.sql (a day in the owner's zone). Until this
-- runs, beats are dropped (the route answers 204 either way) and the Radio tab says the migration
-- is missing. One transaction. Idempotent, safe to re-run.

begin;

do $need$
begin
  if to_regprocedure('public.ui_click_day(text)') is null then
    raise exception 'run 2026-10-28-click-counts.sql first: this needs public.ui_click_day(text)';
  end if;
end
$need$;

create table if not exists public.radio_listen_days (
  day      date    not null,
  surface  text    not null check (surface in ('web', 'app')),
  audience text    not null check (audience in ('member', 'coach')),
  tune_ins integer not null default 0 check (tune_ins >= 0),
  seconds  bigint  not null default 0 check (seconds >= 0),
  primary key (day, surface, audience)
);

create table if not exists public.radio_listen_peaks (
  day       date        primary key,
  listeners integer     not null default 0 check (listeners >= 0),
  at        timestamptz not null default now()
);

-- One row per listen: `listen` is the player's random id for it, so an end closes that listen and no
-- other (a resume's start can reach the server before the pause's end, and one of two devices can
-- stop while the other plays). `played` is how much of the listen has been credited; the player
-- sends its running total, so a beat that arrives late adds nothing, and `ended` keeps it from
-- reopening an ended listen (Codex P2 ×2 on #2527). `credited_to` is how far this account's
-- listening has been credited, the same on all its rows, so two listens at once never count a
-- second twice.
create table if not exists public.radio_listen_live (
  listen      uuid        primary key,
  listener    uuid        not null references auth.users (id) on delete cascade,
  surface     text        not null check (surface in ('web', 'app')),
  audience    text        not null check (audience in ('member', 'coach')),
  last_beat   timestamptz not null default now(),
  credited_to timestamptz,
  played      integer     not null default 0 check (played >= 0),
  ended       boolean     not null default false
);
create index if not exists radio_listen_live_listener on public.radio_listen_live (listener);
create index if not exists radio_listen_live_last_beat on public.radio_listen_live (last_beat);

alter table public.radio_listen_days enable row level security;
alter table public.radio_listen_peaks enable row level security;
alter table public.radio_listen_live enable row level security;
revoke all on table public.radio_listen_days from public, anon, authenticated;
revoke all on table public.radio_listen_peaks from public, anon, authenticated;
revoke all on table public.radio_listen_live from public, anon, authenticated;
grant select, insert, update, delete on table public.radio_listen_days to service_role;
grant select, insert, update, delete on table public.radio_listen_peaks to service_role;
grant select, insert, update, delete on table public.radio_listen_live to service_role;

-- A beat. p_user is the account the route read from the request's own session; p_listen is the
-- player's random id for this listen; p_played is how long it says the listen has played since it
-- began; p_end says the stream stopped. A listen's first beat is a tune-in. A later one is credited
-- what its total adds to what this listen already has, but never more than the time since this
-- account was last credited, or since this listen's last beat (plus 2 seconds for the network), or
-- 10 minutes, so a second device on the same account, or a player that claims too much, can't add
-- listening that didn't happen. A beat for an ended listen adds nothing. Each account gets 6 beats
-- a minute. Returns the seconds credited.
create or replace function public.record_radio_listen(
  p_user uuid,
  p_listen uuid,
  p_surface text,
  p_played integer,
  p_end boolean default false,
  p_tz text default 'UTC'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
  v_owner uuid;
  v_audience text;
  v_last timestamptz;
  v_credited timestamptz;
  v_played integer;
  v_ended boolean;
  v_day date;
  v_tune_in integer := 0;
  v_credit integer := 0;
  v_now integer;
begin
  if p_user is null or p_listen is null or p_surface is null or p_surface not in ('web', 'app') then
    return 0;
  end if;

  select b.allowed into v_allowed
  from public._rate_limit_bump('fn:radio_listen:' || p_user::text, 6, 60) b;
  if not coalesce(v_allowed, false) then
    return 0;
  end if;

  -- A listen that went quiet without an end (the app closed, the tab was killed) is forgotten.
  delete from public.radio_listen_live where last_beat < now() - interval '30 minutes';

  -- This account's listens, locked so its beats are credited one after another.
  perform 1 from public.radio_listen_live where listener = p_user for update;
  select max(l.credited_to) into v_credited from public.radio_listen_live l where l.listener = p_user;
  select l.listener, l.audience, l.last_beat, l.played, l.ended into v_owner, v_audience, v_last, v_played, v_ended
  from public.radio_listen_live l
  where l.listen = p_listen;

  if v_owner is not null and v_owner <> p_user then
    return 0; -- another account's listen
  end if;

  if v_owner is null then
    -- A trainer, a nutritionist or a dietitian is a coach (src/lib/roles.mjs's COACH_ROLES).
    select case
             when coalesce(p.roles, '{}') && array['trainer', 'nutritionist', 'dietitian']
                  or p.role in ('trainer', 'nutritionist', 'dietitian') then 'coach'
             else 'member'
           end
      into v_audience
    from public.profiles p
    where p.id = p_user;
    if v_audience is null then
      return 0;
    end if;
    -- A listen's first beat is its tune-in, credited nothing. It takes the account's credited mark,
    -- so a listen started while another plays (a second device, or a resume whose start overtook its
    -- pause's end) credits nothing twice. An end that arrives before its own start (a play paused at
    -- once) is the tune-in too, and leaves the listen ended, so the start that follows reopens
    -- nothing (Codex P2 on #2527).
    insert into public.radio_listen_live (listen, listener, surface, audience, last_beat, credited_to, ended)
    values (p_listen, p_user, p_surface, v_audience, now(), v_credited, coalesce(p_end, false))
    on conflict (listen) do nothing;
    get diagnostics v_tune_in = row_count;
    if v_tune_in = 0 then
      return 0;
    end if;
  elsif v_ended then
    return 0; -- a beat that arrived after its listen's end
  else
    v_credit := greatest(least(
      coalesce(p_played, 0) - v_played,
      floor(extract(epoch from (now() - greatest(v_credited, v_last))))::integer + 2,
      600
    ), 0);
    -- The account's mark moves only with time credited, so a beat that adds nothing (a late one,
    -- or a second device's) takes nothing from another listen's next beat.
    if v_credit > 0 then
      update public.radio_listen_live set credited_to = now() where listener = p_user;
    end if;
    update public.radio_listen_live
    set last_beat = now(), surface = p_surface, played = played + v_credit, ended = coalesce(p_end, false)
    where listen = p_listen;
  end if;

  v_day := public.ui_click_day(p_tz);
  if v_tune_in > 0 or v_credit > 0 then
    insert into public.radio_listen_days as d (day, surface, audience, tune_ins, seconds)
    values (v_day, p_surface, v_audience, v_tune_in, v_credit)
    on conflict (day, surface, audience)
    do update set tune_ins = d.tune_ins + excluded.tune_ins, seconds = d.seconds + excluded.seconds;
  end if;

  -- Listening now: every account with a beat in the last 150 seconds (a beat a minute, with room
  -- for a phone that runs its timers late), counted once however many listens it has.
  select count(distinct listener) into v_now
  from public.radio_listen_live where last_beat > now() - interval '150 seconds' and not ended;
  if v_now > 0 then
    insert into public.radio_listen_peaks as pk (day, listeners, at)
    values (v_day, v_now, now())
    on conflict (day)
    do update set listeners = excluded.listeners, at = excluded.at
    where excluded.listeners > pk.listeners;
  end if;

  return v_credit;
end;
$$;

revoke all on function public.record_radio_listen(uuid, uuid, text, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.record_radio_listen(uuid, uuid, text, integer, boolean, text) to service_role;

-- The Radio tab: the last p_days days (1 to 365) up to today in p_tz. Tune-ins and seconds in all,
-- by surface and by audience, every day's figures with its peak, the period's peak, and who is
-- listening now.
create or replace function public.admin_radio_stats(
  p_days integer default 30,
  p_tz text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_to date := public.ui_click_day(p_tz);
  v_from date := v_to - (v_days - 1);
  v_out jsonb;
begin
  with f as (
    select d.day, d.surface, d.audience, d.tune_ins, d.seconds
    from public.radio_listen_days d
    where d.day between v_from and v_to
  ),
  live as (
    -- One per account, on the surface of its latest beat.
    select distinct on (l.listener) l.surface
    from public.radio_listen_live l
    where l.last_beat > now() - interval '150 seconds' and not l.ended
    order by l.listener, l.last_beat desc
  )
  select jsonb_build_object(
    'generated_at', now(),
    'from', v_from,
    'to', v_to,
    'days', v_days,
    'tune_ins', coalesce((select sum(f.tune_ins) from f), 0),
    'seconds', coalesce((select sum(f.seconds) from f), 0),
    'by_surface', coalesce((
      select jsonb_object_agg(s.surface, jsonb_build_object('tune_ins', s.t, 'seconds', s.n))
      from (select f.surface, sum(f.tune_ins) as t, sum(f.seconds) as n from f group by f.surface) s
    ), '{}'::jsonb),
    'by_audience', coalesce((
      select jsonb_object_agg(s.audience, jsonb_build_object('tune_ins', s.t, 'seconds', s.n))
      from (select f.audience, sum(f.tune_ins) as t, sum(f.seconds) as n from f group by f.audience) s
    ), '{}'::jsonb),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', g.day, 'tune_ins', coalesce(t.t, 0), 'seconds', coalesce(t.n, 0), 'peak', coalesce(pk.listeners, 0)
             ) order by g.day), '[]'::jsonb)
      from (select x::date as day from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') x) g
      left join (select f.day, sum(f.tune_ins) as t, sum(f.seconds) as n from f group by f.day) t on t.day = g.day
      left join public.radio_listen_peaks pk on pk.day = g.day
    ),
    'peak', (
      select jsonb_build_object('listeners', pk.listeners, 'at', pk.at, 'day', pk.day)
      from public.radio_listen_peaks pk
      where pk.day between v_from and v_to and pk.listeners > 0
      order by pk.listeners desc, pk.day desc
      limit 1
    ),
    'now', jsonb_build_object(
      'listeners', (select count(*) from live),
      'web', (select count(*) from live where live.surface = 'web'),
      'app', (select count(*) from live where live.surface = 'app')
    )
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.admin_radio_stats(integer, text) from public, anon, authenticated;
grant execute on function public.admin_radio_stats(integer, text) to service_role;

-- Guard: raise on anything that did not land.
do $guard$
declare
  t text;
  f text;
begin
  foreach t in array array['radio_listen_days', 'radio_listen_peaks', 'radio_listen_live'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      raise exception '% is missing or has no row level security', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception '% must be the service role''s alone', t;
    end if;
  end loop;
  foreach f in array array[
    'public.record_radio_listen(uuid, uuid, text, integer, boolean, text)',
    'public.admin_radio_stats(integer, text)'
  ] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '% must be the service role''s alone', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception '% must be open to the service role', f;
    end if;
  end loop;
end
$guard$;

commit;
