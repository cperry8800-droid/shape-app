-- A member's booking request keeps the coach's rules, checked inside the write itself.
-- Coach Schedule upgrade (owner, 2026-10-07: "yes do it", on enforcing the rules in the database).
-- Idempotent, safe to re-run. Needs 2026-10-07-booking-rules-time-off.sql (applied 2026-10-07).
--
-- Answered by:
--   src/lib/session-booking.ts   bookingRuleRefusal — reads `booking_rule:<reason>` into the
--                                member's sentence and a 409 with that reason as its code
--   src/app/api/sessions/request/route.ts, src/app/api/consultation/route.ts
--   mobile-app/src/services/shapeBackend.js  createSessionRequest — says why instead of
--                                "held locally"
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
-- 1. The routes check the coach's rules (bookingRules.checkSlot), then write. Two requests sent
--    at the same moment both pass the check before either is saved, so two requests that are each
--    fine alone, but together break the buffer or the daily limit, both land. (Overlaps are
--    already refused by sessions_no_overlap.) Codex, the review of #2229.
-- 2. The app does not book through the routes at all: submitConsultationBooking inserts a
--    `requested` row with the member's own client, so no rule was ever checked on that path.
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────
-- A BEFORE INSERT trigger on sessions, for rows written as `requested` (every member-made
-- request: the request route, the consult route and the app). A coach's own booking is written
-- `confirmed` and is not held to these rules, as on the Schedule page.
--   · it takes a transaction-scoped advisory lock per coach, so a second request for the same
--     coach waits for the first to commit, then sees it;
--   · then it checks, in bookingRules.mjs's order and with its meanings: notice, time off,
--     buffer (clear time either side of another active session; an overlap is left to
--     sessions_no_overlap), daily limit (active sessions on the coach's LOCAL date).
-- A refusal raises `booking_rule:<reason>` (SQLSTATE P0001; for notice, DETAIL is the hours).
--
-- ⚠ NOT THE OPEN HOURS. The routes check those against the exact starts the booking pages offer
-- (scheduleRules.isOfferedStart), which a trigger cannot see without restating the page's slot
-- expansion. The app's direct insert is still unchecked against open hours; routing the app's
-- booking through the server is the fix for that, and is registered.
--
-- ⚠ SECURITY DEFINER, BECAUSE A MEMBER CANNOT SEE WHAT IT HAS TO CHECK. RLS shows a member only
-- their own sessions and none of the coach's time off. The function reads only the coach's own
-- rows and returns nothing but the refusal; search_path is pinned, and EXECUTE is revoked (a
-- trigger fires without it).

create or replace function public.enforce_booking_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buf integer;
  v_max integer;
  v_notice integer;
  v_zone text;
  v_end timestamptz;
  v_gap interval;
  v_count integer;
begin
  if new.status is distinct from 'requested' then
    return new;
  end if;

  -- One request at a time per coach. Under READ COMMITTED each statement below takes a fresh
  -- snapshot, so a request that waited here sees the one it waited for.
  perform pg_advisory_xact_lock(hashtextextended('shape.booking:' || new.provider_role || ':' || new.provider_id::text, 0));

  -- ⚠ NO ROW LEAVES ALL THREE NULL (SELECT INTO with no match), read as the defaults below.
  select r.buffer_min, r.max_per_day, r.min_notice_hours
    into v_buf, v_max, v_notice
    from public.provider_booking_rules r
   where r.provider_role = new.provider_role
     and r.provider_id = new.provider_id;
  v_buf := coalesce(v_buf, 0);
  v_notice := coalesce(v_notice, 0);

  v_end := new.scheduled_at + make_interval(mins => greatest(coalesce(new.duration_min, 15), 1));

  if v_notice > 0 and new.scheduled_at > now() and new.scheduled_at < now() + make_interval(hours => v_notice) then
    raise exception 'booking_rule:notice' using errcode = 'P0001', detail = v_notice::text;
  end if;

  if exists (
    select 1 from public.provider_time_off o
     where o.provider_role = new.provider_role
       and o.provider_id = new.provider_id
       and o.starts_at < v_end
       and o.ends_at > new.scheduled_at
  ) then
    raise exception 'booking_rule:time_off' using errcode = 'P0001';
  end if;

  if v_buf > 0 then
    v_gap := make_interval(mins => v_buf);
    if exists (
      select 1 from (
        select s.scheduled_at as s_start,
               s.scheduled_at + make_interval(mins => greatest(coalesce(s.duration_min, 15), 1)) as s_end
          from public.sessions s
         where s.provider_role = new.provider_role
           and s.provider_id = new.provider_id
           and s.status in ('requested', 'confirmed')
           and s.id is distinct from new.id
           and s.scheduled_at < v_end + v_gap
           and s.scheduled_at > new.scheduled_at - v_gap - interval '1 day'
      ) x
      where (x.s_end <= new.scheduled_at and x.s_end > new.scheduled_at - v_gap)
         or (x.s_start >= v_end and x.s_start < v_end + v_gap)
    ) then
      raise exception 'booking_rule:buffer' using errcode = 'P0001';
    end if;
  end if;

  if v_max is not null then
    if new.provider_role = 'trainer' then
      select t.timezone into v_zone from public.trainers t where t.id = new.provider_id;
    else
      select n.timezone into v_zone from public.nutritionists n where n.id = new.provider_id;
    end if;
    -- A coach with no usable zone has no local day to count; the routes refuse such a coach's
    -- bookings outright, and this does not invent a day for the app's path.
    if v_zone is not null and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone) then
      select count(*) into v_count
        from public.sessions s
       where s.provider_role = new.provider_role
         and s.provider_id = new.provider_id
         and s.status in ('requested', 'confirmed')
         and s.id is distinct from new.id
         and s.scheduled_at > new.scheduled_at - interval '2 days'
         and s.scheduled_at < new.scheduled_at + interval '2 days'
         and (s.scheduled_at at time zone v_zone)::date = (new.scheduled_at at time zone v_zone)::date;
      if v_count >= v_max then
        raise exception 'booking_rule:daily_limit' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_booking_rules() from public, anon, authenticated;

drop trigger if exists sessions_enforce_booking_rules on public.sessions;
create trigger sessions_enforce_booking_rules
  before insert on public.sessions
  for each row execute function public.enforce_booking_rules();
