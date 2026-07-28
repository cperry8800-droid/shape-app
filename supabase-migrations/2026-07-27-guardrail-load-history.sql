-- Progression guardrails, Deploy 2b — the load-history read + the kill switch.
-- SPEC-guardrails.md §9.2 (as amended by §9.4), §7.4, §4.1.
--
-- ⚠ THIS FUNCTION RETURNS RAW SESSION ROWS AND MAKES NO JUDGEMENT OF ANY KIND.
-- No weeks, no sums, no load, no qualifying flag, no credibility verdict. It
-- selects, filters to a trailing window, and hands over exactly the six fields
-- §4.1 names.
--
-- This is the §4.1 STANDING RULE, and it is the whole reason this function is
-- shaped the way it is: the core reads raw session rows only, never precomputed
-- summary aggregates. Every derivation — week membership in the client's own
-- zone, RPE 0 as absent, an unconfirmed overrun as excluded, duration
-- credibility judged against the CURRENT ceiling (§13.8) — happens in
-- public/newdesign/progressionGuardrail.mjs, where §12's fixtures can reach it.
-- Pre-aggregating any of it here would put load derivation in the one place it
-- is not fixture-testable, and would freeze a verdict that §13.4 promises will
-- be retuned.
--
-- ⚠ An earlier draft of §9.2 described this as returning "per-week load
-- buckets". That wording was STALE — the bucketing ruling was reversed in
-- SPEC-guardrails-2a-fixtures.md §0 and §4.1 was amended to match, but §9.2 and
-- §11 were not. Both were corrected 2026-07-28. Do not reintroduce bucketing
-- here.
--
-- SECURITY DEFINER because workout_sessions is owner-scoped under RLS, gated on
-- the caller actually coaching this client. Follows get_roster_weekly_adherence
-- exactly: search_path pinned with pg_temp, every reference schema-qualified, an
-- unauthorized or nonexistent id ABSENT from the result rather than erroring
-- (fail-closed and indistinguishable), revoke before grant.
--
-- Idempotent, safe to re-run.

-- ─── The kill switch's home (§7.4) ──────────────────────────────────────────
-- Must be a DATABASE ROW, not an env var: on Vercel an env change needs a
-- redeploy to propagate, which fails the stated requirement of flipping this
-- WITHOUT a deploy. No app-config table existed, so this adds a minimal one.
create table if not exists public.app_config (
  key         text primary key,
  bool_value  boolean,
  updated_at  timestamptz not null default now()
);

comment on table public.app_config is
  'Minimal server-read config flags. Added for guardrail_red_enabled (SPEC-guardrails.md §7.4) — a switch that must be flippable without a deploy.';

alter table public.app_config enable row level security;

-- Read path is the SECURITY DEFINER function below, never a direct client
-- select. No policy is created deliberately: with RLS on and no policy, every
-- non-service role is denied, so the flag cannot be probed or forged from a
-- browser. Flipping it is an ops act (service role / SQL editor).
revoke all on public.app_config from public, anon, authenticated;

-- ⚠ SEEDED FALSE — ADVISORY AT SHIP (owner ruling 2026-07-28, §9.4).
-- Red computes, is recorded, and surfaces to the coach with the acknowledgment
-- path live, but does NOT block publish. Enforcement flips on by updating this
-- row once real flag rates land in the target band (10-15% amber, 1-2% red).
--
-- ⚠ DO NOT CONFUSE THIS WITH §7.4's "fails enforced" RULE. They are different
-- states and both are deliberate:
--   * the flag READS FALSE      -> advisory, by design, this seed.
--   * the flag CANNOT BE READ   -> treat as TRUE and enforce, logging the
--                                  failure. That is the CALLER's rule and lives
--                                  in the route; failing the other way would
--                                  silently remove the gate at exactly the
--                                  moment something is already wrong.
insert into public.app_config (key, bool_value)
values ('guardrail_red_enabled', false)
on conflict (key) do nothing;   -- never clobber a live ops flip on re-run

-- ─── The read ───────────────────────────────────────────────────────────────
create or replace function public.get_client_load_history(
  p_client_id uuid,
  p_days      int default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days     int;
  v_zone     text;
  v_sessions jsonb;
  v_enabled  boolean;
begin
  -- Bound the window defensively; the core reaches at most
  -- BS_WINDOW_REACH_DAYS (84) back, so 180 is generous headroom and 365 is the
  -- hard ceiling on what a caller may ask for.
  v_days := least(greatest(coalesce(p_days, 180), 1), 365);

  -- THE GATE. An unauthorized or nonexistent client is absent, not an error —
  -- a coach cannot distinguish "not my client" from "no such client".
  if p_client_id is null or not public.is_coach_on_client(p_client_id) then
    return null;
  end if;

  -- The client's CURRENT zone, resolved ONCE and stamped on every row. §4.1 is
  -- explicit that this is the same value on every session: the field is carried
  -- per row only because rows are classified one at a time, NOT so each session
  -- can report the zone it was recorded in. Mixed zones shift week membership
  -- row by row and yield a baseline no client ever lived.
  --
  -- shape_user_tz is the canonical helper (validated against pg_timezone_names,
  -- so it can only ever return a name Postgres accepts). NULL when unknown —
  -- and it is passed through as NULL rather than defaulted to UTC, because the
  -- core must report an unknown zone as MALFORMED BY NAME (Rule E, F125).
  -- Silently bucketing in UTC would fabricate a week boundary the client never
  -- experienced.
  v_zone := public.shape_user_tz(p_client_id);

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.started_at_iso desc), '[]'::jsonb)
    into v_sessions
  from (
    select
      -- The INSTANT, with offset. Never a pre-localized date: the core resolves
      -- the client's own calendar week itself (§4.1, Rule E).
      to_char(ws.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as started_at_iso,
      v_zone                                                                  as timezone,
      ws.duration_seconds                                                     as duration_sec,
      -- NULL stays NULL. A skipped rating is absent, never 0 — imputing a 0
      -- would compute 0 x minutes = 0 AU, enter a real week at zero, deflate
      -- the baseline and tighten every future ceiling (§13.4).
      ws.session_rpe                                                          as session_rpe,
      -- The two FACTS, read straight out of the summary jsonb the completion
      -- step writes. NOT a verdict: credibility is derived at READ time against
      -- the CURRENT ceiling (§13.8). Absent BOTH reads as not_prompted at the
      -- core, which is F22's ruling — a missing flag is not a caller bug and
      -- excludes rather than admits. Passed through as-is (including a
      -- half-filled pair, which the core reports as malformed) so this function
      -- keeps making no judgement.
      (ws.summary -> 'durationPrompted')                                      as duration_prompted,
      (ws.summary ->> 'durationAnswer')                                       as duration_answer
    from public.workout_sessions ws
    where ws.client_id = p_client_id
      and ws.started_at is not null
      and ws.started_at >= now() - make_interval(days => v_days)
    -- Newest first, bounded. 500 sessions inside the window is beyond any human
    -- schedule (the core reaches 84 days), so this can only ever trim ancient
    -- tail rows that could not have entered a baseline — it cannot silently
    -- drop a session the guardrail would have scored.
    order by ws.started_at desc
    limit 500
  ) s;

  -- §7.4: the flag rides on THIS response so the builder receives it with the
  -- history it already fetches and the route reads it in the query it already
  -- makes. Builder and route therefore cannot disagree — a coach is never shown
  -- a red the server will not enforce, or an amber the server will block.
  select ac.bool_value into v_enabled
  from public.app_config ac
  where ac.key = 'guardrail_red_enabled';

  return jsonb_build_object(
    -- NULL (row missing) is reported honestly as null and the CALLER applies
    -- §7.4's fails-enforced rule. Deciding it here would hide an absent row
    -- behind a plausible boolean.
    'redEnabled', to_jsonb(v_enabled),
    'sessions',   coalesce(v_sessions, '[]'::jsonb)
  );
end;
$$;

comment on function public.get_client_load_history(uuid, int) is
  'Raw trailing workout_sessions rows for ONE client, for the progression guardrail core, plus the guardrail_red_enabled kill switch. Makes NO judgement: no weeks, no sums, no load, no credibility. Gated on is_coach_on_client; unauthorized ids return NULL. SPEC-guardrails.md §9.2/§9.4, §7.4, §4.1.';

revoke all on function public.get_client_load_history(uuid, int) from public, anon;
grant execute on function public.get_client_load_history(uuid, int) to authenticated, service_role;
