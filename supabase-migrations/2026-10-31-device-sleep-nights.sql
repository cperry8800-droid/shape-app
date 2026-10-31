-- Sleep points pay only nights the server wrote (the War Room's known gap: "Sleep points
-- (award_sleep_points) trust sources.sleep_hours on a row the member can write: with a provider
-- connected, a direct write could earn +5 a night for the last 14 days").
--
-- THE HOLE. award_sleep_points (2026-10-18-sleep-points.sql) paid a night whose
-- daily_health_snapshot.sources->>'sleep_hours' named a provider the member has connected. That row
-- is the member's to write (user_rw_own_snapshots; the Oura, WHOOP and Apple Health syncs write it
-- with the member's own session, and so can anyone holding it), so a member with a ring connected
-- could write 8 hours stamped 'oura' on each of the last 14 days and claim +70.
--
-- THE FIX. device_sleep_nights: a night as a provider reported it, one row per night and provider,
-- written by the server alone: the Oura and WHOOP syncs after they fetch the nights from the
-- provider, the Garmin webhook as Garmin pushes them, and the Apple Health sync from what the app
-- posts, each with the service key (src/lib/device-sleep.ts). RLS is on with no policy, and every
-- privilege is revoked from anon and authenticated, so a member can neither write a row nor read
-- one. award_sleep_points now pays from it and reads nothing a member writes.
--
-- WHAT STAYS. +5 (habits, 'sleep_night') for a night of 7 to 12 hours, once per night, on the same
-- dedupe key (a night the old award paid is never paid again); the last 14 nights by the same
-- window; the caller only; a provider the member still has connected (user_integrations is
-- written by the server alone).
-- WHAT CHANGES. Any connected provider's night counts, once: the old award read only the provider
-- whose hours held the snapshot's column.
-- ⚠ APPLE HEALTH is still whatever the app posts to /api/integrations/apple-health/sync, its
-- connection too, as for Shape Steps (a known gap the War Room keeps). What closes here is the
-- write that needed no sync at all.
-- ⚠ NO BACKFILL. The snapshot's nights are the rows a member could forge, so none are copied.
-- Nights are paid as a sync records them: Oura fetches its last 14 days and WHOOP its last 5
-- sleeps on every sync, Garmin pushes each night once, Apple Health posts what the app sends.
-- The app claims the award on sign-in, so most nights before this ran are already paid.
-- ⚠ DEPLOY ORDER. The code that records nights ships first and logs and carries on while this
-- table is missing; until this runs, the old award stands.
--
-- SECURITY DEFINER, scoped to auth.uid() (no user_id parameter), a fixed amount, revoked from
-- public and anon by name (Supabase grants EXECUTE on every new function to anon and authenticated
-- by name). One transaction, re-runnable, a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

create table if not exists public.device_sleep_nights (
  user_id     uuid not null references auth.users(id) on delete cascade,
  night       date not null,
  provider    text not null check (provider in ('apple_health', 'garmin', 'oura', 'whoop')),
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  recorded_at timestamptz not null default now(),
  primary key (user_id, night, provider)
);

-- The server's alone: RLS with no policy, and no privilege for anon or authenticated (Supabase's
-- default privileges grant them every table by name).
alter table public.device_sleep_nights enable row level security;
revoke all on table public.device_sleep_nights from public, anon, authenticated;
grant select, insert, update, delete on table public.device_sleep_nights to service_role;

create or replace function public.award_sleep_points()
returns table(day date, points integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tz  text := public.shape_user_tz(auth.uid());
  v_today date := case when v_tz is not null then (now() at time zone v_tz)::date end;
  v_hi date := coalesce(v_today, (now() at time zone 'utc')::date + 1);
  v_lo date := coalesce(v_today, (now() at time zone 'utc')::date - 1) - 13;
  r record;
begin
  if v_uid is null then return; end if;

  for r in
    select distinct n.night as d
    from public.device_sleep_nights n
    where n.user_id = v_uid
      and n.hours >= 7 and n.hours <= 12
      and n.night <= v_hi
      and n.night >= v_lo
      and exists (
        select 1 from public.user_integrations i
        where i.user_id = v_uid and i.provider = n.provider
      )
    order by 1
  loop
    -- Bare ON CONFLICT DO NOTHING, as award_step_points: one row per night on the
    -- score_ledger_dedupe_idx (user_id, source_kind, source_id).
    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (
      v_uid, 'habits', 'sleep_night',
      md5('sleep_night:' || v_uid::text || ':' || r.d::text)::uuid,
      5,
      'A good night''s sleep'
    )
    on conflict do nothing;

    if found then
      day := r.d; points := 5; return next;
    end if;
  end loop;
  return;
end;
$$;

revoke all on function public.award_sleep_points() from public, anon;
grant execute on function public.award_sleep_points() to authenticated, service_role;

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $guard$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'device_sleep_nights' and c.relrowsecurity
  ) then
    raise exception 'device_sleep_nights is missing or has no row level security';
  end if;
  if has_table_privilege('authenticated', 'public.device_sleep_nights', 'INSERT')
     or has_table_privilege('authenticated', 'public.device_sleep_nights', 'UPDATE')
     or has_table_privilege('authenticated', 'public.device_sleep_nights', 'DELETE')
     or has_table_privilege('authenticated', 'public.device_sleep_nights', 'SELECT')
     or has_table_privilege('anon', 'public.device_sleep_nights', 'SELECT')
     or has_table_privilege('anon', 'public.device_sleep_nights', 'INSERT') then
    raise exception 'members can reach device_sleep_nights';
  end if;
  if not has_table_privilege('service_role', 'public.device_sleep_nights', 'INSERT') then
    raise exception 'the server cannot record a night';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'award_sleep_points' and p.prosecdef
      and pg_get_functiondef(p.oid) like '%from public.device_sleep_nights n%'
      and pg_get_functiondef(p.oid) not like '%daily_health_snapshot%'
  ) then
    raise exception 'award_sleep_points is missing, not security definer, or still reads the snapshot';
  end if;
  if has_function_privilege('anon', 'public.award_sleep_points()', 'EXECUTE') then
    raise exception 'award_sleep_points is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.award_sleep_points()', 'EXECUTE') then
    raise exception 'members cannot claim their sleep points';
  end if;
end;
$guard$;

commit;
