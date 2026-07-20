-- The Cycle — PR C follow-up (2026-07-20). RUN AFTER 2026-07-19-cycle-events.sql.
--
-- Codex P2 (coach surface): the coach Case File derives the member's cycle phase
-- CLIENT-SIDE, but was measuring her date-only, MEMBER-local period starts against
-- new Date() = the COACH device's local date. A coach a calendar day behind the
-- member (e.g. a US coach on Jul 20 viewing a Tokyo member already on Jul 21)
-- rendered an off-by-one day/window — or "day 0" right after she logged a start.
--
-- Fix: get_client_cycle also returns the member's OWN local calendar date `today`
-- (via shape_user_tz — the same helper the no-future-date trigger already uses),
-- so the coach view derives her cycle day against HER today. The phase math stays
-- client-side (SQL and JS still can't drift on it); only the reference `today`
-- moves to the authoritative, member-tz source. Idempotent (create or replace;
-- grants preserved, re-asserted for self-containment).

create or replace function public.get_client_cycle(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ok boolean; v_starts jsonb; v_tz text; v_today date;
begin
  if not public.is_coach_on_client(p_user_id) then return null; end if;
  select coalesce((data->>'optIn')::boolean, false)
     and coalesce((data->>'share')::boolean, false) into v_ok
    from public.user_goals where user_id = p_user_id and kind = 'cycle_settings';
  if not coalesce(v_ok, false) then return jsonb_build_object('share', false); end if;
  select coalesce(jsonb_agg(event_date order by event_date desc), '[]'::jsonb)
    into v_starts
    from (select event_date from public.cycle_events
          where user_id = p_user_id and kind = 'period_start'
          order by event_date desc limit 13) s;
  -- The member's OWN local calendar date, computed IDENTICALLY to the
  -- cycle_events_no_future trigger (same v_tz, same UTC+1d slack when the zone
  -- was never captured) — so a start the trigger accepted as "her today" is
  -- never returned with a `today` a day behind it, which would derive day 0
  -- (Codex P2). With a captured tz the date is her exact local today.
  v_tz := public.shape_user_tz(p_user_id);
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date
             + (case when v_tz is null then 1 else 0 end);
  return jsonb_build_object(
    'share', true,
    'starts', v_starts,
    'today', to_char(v_today, 'YYYY-MM-DD'));
end $$;

revoke execute on function public.get_client_cycle(uuid) from public, anon;
grant  execute on function public.get_client_cycle(uuid) to authenticated;
