-- Protect your time: time off, booking rules, and a busy read members can use.
-- Coach Schedule upgrade, step 3 (owner, 2026-10-07: "I like everything that is proposed …
-- Apply all the fixes first then proceed with upgrades/improvements"). Idempotent, safe to re-run.
--
-- Called by:
--   src/app/api/my-time-off/route.ts       (coach lists / adds / removes time off)
--   src/app/api/my-booking-rules/route.ts  (coach reads / saves buffer, daily limit, notice)
--   public/newdesign/bookingRules.mjs      (the one rule set every booking surface checks)
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
-- Nothing stood between a member and any minute of a coach's week:
--
--   · The consultation route resolves the member's wall clock in the coach's zone and inserts.
--     It never asks whether that time is inside the coach's open hours, so a crafted request
--     lands at 3 AM.
--   · The only conflict guard in the schema is sessions_no_conflict_idx, a unique index on the
--     exact START instant. A 9:00 booking and a 9:15 one are different instants, so they sit on
--     top of each other; so do a 60-minute session and the 15-minute consult inside it.
--   · A coach had no way to close a week for a vacation short of deleting their hours, which
--     closes every week after it too.
--
-- ⚠ AND THE "BOOKED" LIST MEMBERS FILTER ON CANNOT CONTAIN ANYONE ELSE'S BOOKING.
-- /api/availability reads `sessions` through the VISITOR's own anon-key client, and the only
-- select policies these migrations install are read_own_sessions (2026-04-18: the row's client
-- and its coach) and shared_coach_reads_sessions (2026-05-26: a coach the client is shared
-- with). So for a signed-out visitor, and for any member reading a coach they have not booked,
-- the read comes back EMPTY and every taken slot is offered as open. Read from the policies,
-- not measured live; production held zero sessions on 2026-09-11, so nobody has met it yet.
-- Only the start-instant index stops a double booking, and only when both members picked the
-- same minute. provider_busy_blocks below is the fix: a definer read that says WHEN a coach is
-- busy without saying who, why, or with whom.
--
-- ── 1. provider_time_off ─────────────────────────────────────────────────────
-- ⚠ INSTANTS, NOT DATES. A whole day off is resolved to [first moment of the day, first moment
-- of the next) in the coach's zone AT WRITE TIME, by the route, with the same arithmetic the
-- rules read it with (bookingRules.mjs, localDayRange). Storing a bare date would hand every
-- reader the question "whose midnight?" — the exact defect provider_availability.start_minute
-- carried until 2026-09-11, when three readers gave three answers. An afternoon off is an
-- instant range by nature, so one shape covers both.
--
-- ⚠ THE NOTE IS PRIVATE, so the table is OWNER-ONLY in both directions — there is no public
-- read policy here, unlike provider_availability. "Surgery", "kid's recital", "Mexico" are the
-- coach's business; that the coach is away is everyone's. The second half reaches members only
-- through provider_busy_blocks, which returns the interval and never the note or the row id.
--
-- ── 2. provider_booking_rules ────────────────────────────────────────────────
-- One row per coach; no row means no rules (no buffer, no limit, no notice: today's behaviour).
-- ⚠ PUBLIC READ, DELIBERATELY. A member's slot list has to apply the buffer, the notice and the
-- daily limit to show only times the route will accept, and the consultation page renders open
-- times for signed-out visitors. Three integers about how a coach takes bookings disclose
-- nothing a visitor does not learn by trying to book; provider_availability is public-read for
-- the same reason.
-- ⚠ THE CHECK RANGES ARE THE PRODUCT'S, and bookingRules.mjs RULE_LIMITS states the same ones
-- (tests/booking-rules.test.mjs reads both and requires agreement): a buffer of 0–120 minutes, a
-- daily limit of 1–24 sessions or NULL for none, notice of 0–336 hours (two weeks). A limit of 0
-- is refused rather than meaning "closed": a coach who wants no bookings closes their hours.
--
-- ── 3. provider_busy_blocks(role, provider, from, to) ────────────────────────
-- ⚠ SECURITY DEFINER BECAUSE THE QUESTION CROSSES RLS ON PURPOSE: a member must not read the
-- coach's other bookings, and must still not be offered a time the coach is booked. It returns
-- (starts_at, ends_at, kind) and NOTHING ELSE:
--   · kind is 'time_off' or 'session' — a requested and a confirmed session are both 'session';
--   · no session id, client, type, topic or status; no time-off note or id;
--   · active sessions only (requested / confirmed), which is what holds a coach's time.
-- ⚠ BOUNDED THREE WAYS, because anon can call it: a window of at most 62 days (a longer one is
-- REFUSED, not cut short — a silently shortened answer reads as free time past the cut, which
-- is the one error a busy read must never make); nothing that ended more than two days before
-- now (a member needs today's sessions for the daily limit and has no business with the
-- coach's history); and MORE THAN 2000 ROWS IS AN ERROR, NOT A SHORTER LIST (Codex, the review of
-- #2225: a cut list hands a member busy time as free time, the one error a busy read must never
-- make; nothing caps a coach's sessions or time-off rows per day, so the cap is reachable in
-- principle even though 62 days at 24 sessions a day is 1,488).
-- ⚠ GRANTED TO anon BY NAME, and registered as public-by-design in
-- tests/fixtures/definer-anon-allowlist.json — the consultation page's open times are shown to
-- signed-out visitors, and the definer audit (tests/definer-grants.test.mjs) requires every
-- anon-executable definer to say why it is one.
-- ⚠ search_path IS PINNED TO public, pg_temp, so a planted pg_temp relation cannot stand in for
-- sessions or provider_time_off inside a function that runs with its owner's rights.
--
-- ── BEFORE THIS RUNS ─────────────────────────────────────────────────────────
-- Both coach routes answer a read with the defaults / an empty list and refuse a write with a
-- 503 that says the feature is not set up yet — never a crash, never a save that went nowhere.
-- The bookings themselves are unaffected: nothing enforces the rules until the surfaces that
-- book are wired to bookingRules.mjs, and those reads degrade to "no rules" the same way.

-- ===== 1. provider_time_off =====

create table if not exists public.provider_time_off (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  constraint provider_time_off_order check (ends_at > starts_at),
  constraint provider_time_off_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists provider_time_off_lookup_idx
  on public.provider_time_off (provider_role, provider_id, starts_at);

alter table public.provider_time_off enable row level security;

-- Owner-only, every command: the same ownership test provider_availability's write policy uses.
drop policy if exists "provider_own_time_off" on public.provider_time_off;
create policy "provider_own_time_off"
  on public.provider_time_off for all
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_time_off.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_time_off.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_time_off.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_time_off.provider_id and n.owner_id = auth.uid()
    ))
  );

-- ===== 2. provider_booking_rules =====

create table if not exists public.provider_booking_rules (
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  buffer_min integer not null default 0,
  max_per_day integer,
  min_notice_hours integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider_role, provider_id),
  constraint provider_booking_rules_buffer check (buffer_min between 0 and 120),
  constraint provider_booking_rules_max_per_day check (max_per_day is null or max_per_day between 1 and 24),
  constraint provider_booking_rules_notice check (min_notice_hours between 0 and 336)
);

alter table public.provider_booking_rules enable row level security;

drop policy if exists "public_read_booking_rules" on public.provider_booking_rules;
create policy "public_read_booking_rules"
  on public.provider_booking_rules for select
  to anon, authenticated
  using (true);

drop policy if exists "provider_write_booking_rules" on public.provider_booking_rules;
create policy "provider_write_booking_rules"
  on public.provider_booking_rules for all
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_booking_rules.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_booking_rules.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_booking_rules.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_booking_rules.provider_id and n.owner_id = auth.uid()
    ))
  );

-- ===== 3. provider_busy_blocks =====

create or replace function public.provider_busy_blocks(
  p_role text,
  p_provider_id bigint,
  p_from timestamptz,
  p_to timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_from timestamptz;
  v_rows integer;
begin
  if p_role is null or p_role not in ('trainer', 'nutritionist')
     or p_provider_id is null or p_from is null or p_to is null or p_to <= p_from then
    return;
  end if;
  if p_to - p_from > interval '62 days' then
    raise exception 'provider_busy_blocks: the window is longer than 62 days' using errcode = '22023';
  end if;
  -- Nothing that ended more than two days ago: see the header.
  v_from := greatest(p_from, now() - interval '2 days');
  if p_to <= v_from then
    return;
  end if;

  return query
    select b.starts_at, b.ends_at, b.kind
    from (
      select o.starts_at, o.ends_at, 'time_off'::text as kind
        from public.provider_time_off o
       where o.provider_role = p_role
         and o.provider_id = p_provider_id
         and o.starts_at < p_to
         and o.ends_at > v_from
      union all
      select s.scheduled_at as starts_at,
             s.scheduled_at + make_interval(mins => greatest(coalesce(s.duration_min, 15), 1)) as ends_at,
             'session'::text as kind
        from public.sessions s
       where s.provider_role = p_role
         and s.provider_id = p_provider_id
         and s.status in ('requested', 'confirmed')
         and s.scheduled_at < p_to
         -- The index walks scheduled_at; a session longer than a day does not exist.
         and s.scheduled_at > v_from - interval '1 day'
         and s.scheduled_at + make_interval(mins => greatest(coalesce(s.duration_min, 15), 1)) > v_from
    ) b
    order by b.starts_at, b.ends_at
    limit 2001;
  -- One row past the cap is read so the cap can be SEEN. Raising after RETURN QUERY aborts the
  -- call, so the caller gets this error and none of the rows: a slot list fails closed (no
  -- times offered) instead of offering the times past the cut.
  get diagnostics v_rows = row_count;
  if v_rows > 2000 then
    raise exception 'provider_busy_blocks: more than 2000 busy blocks in the window; ask for a shorter one' using errcode = '54000';
  end if;
end;
$$;

revoke all on function public.provider_busy_blocks(text, bigint, timestamptz, timestamptz) from public;
grant execute on function public.provider_busy_blocks(text, bigint, timestamptz, timestamptz) to anon, authenticated;
