-- Shape Score points for a good night (owner, 2026-10-18: "also lets give shape score points
-- for good sleep", then: watch nights only, +5 for 7h or more).
--
--   +5 (habits, 'sleep_night') for a night of 7 to 12 hours that a connected watch or ring
--   wrote, once per night. The app and the website claim it on load, as they claim Shape Steps
--   (award_step_points).
--
-- ⚠ WATCH NIGHTS ONLY. Typed hours never earn: the daily check-in earns no points (ruling in
-- docs/REVIEW-2026-10-18-daily-checkin.md: Same as yesterday would mint them in one tap), and
-- typed hours could be inflated for them. A watch's night is one whose sources.sleep_hours names
-- the provider that wrote it (upsertSnapshot stamps it; a typed night has none, or 'manual').
-- That stamp sits on a row the member can write, so the provider must also be one the member
-- has connected: user_integrations is written by the server alone. Oura, WHOOP and Garmin
-- nights are fetched by the server. Apple Health's nights, and its connection, come from what
-- the app posts to /api/integrations/apple-health/sync, so a member who posts made-up Health
-- days can earn +5 a night, as made-up steps already earn Shape Steps.
-- ⚠ OVER 12 HOURS IS NO NIGHT: a watch left on the nightstand.
-- ⚠ THE NIGHT BELONGS TO THE MORNING IT ENDS. snapshot_date is the member's local day, so
-- today's row holds last night, and it counts as soon as a watch has written it. The window
-- reaches back 14 days for a watch that syncs late. Zone unknown: a UTC day ahead, which no
-- zone on earth is past.
--
-- SECURITY DEFINER, scoped to auth.uid() (no user_id parameter, so it only ever credits the
-- caller), with a fixed amount. Revoked from public and anon by name (Supabase grants EXECUTE on
-- every new function to anon and authenticated by name). One transaction, re-runnable, a guard
-- at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

create or replace function public.award_sleep_points()
returns table(day date, points integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tz  text := public.shape_user_tz(auth.uid());
  v_today date;
  r record;
begin
  if v_uid is null then return; end if;

  v_today := case when v_tz is not null then (now() at time zone v_tz)::date
                  else (now() at time zone 'utc')::date + 1 end;

  for r in
    select s.snapshot_date as d
    from public.daily_health_snapshot s
    where s.user_id = v_uid
      and s.sleep_hours >= 7 and s.sleep_hours <= 12
      and s.snapshot_date <= v_today
      and s.snapshot_date >= v_today - 14
      and s.sources->>'sleep_hours' in ('apple_health', 'garmin', 'oura', 'whoop')
      and exists (
        select 1 from public.user_integrations i
        where i.user_id = v_uid and i.provider = s.sources->>'sleep_hours'
      )
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
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'award_sleep_points' and p.prosecdef
  ) then
    raise exception 'award_sleep_points is missing or not security definer';
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
