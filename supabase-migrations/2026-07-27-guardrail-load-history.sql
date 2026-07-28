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

-- ⚠ `updated_at` has to be MAINTAINED, not just defaulted. Without this trigger
-- it reports the SEED time forever, so after an ops flip the one column that
-- says "when did this change" would be actively misleading — on a switch whose
-- entire purpose is being flipped without a deploy.
create or replace function public.app_config_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_config_touch on public.app_config;
create trigger app_config_touch
  before update on public.app_config
  for each row execute function public.app_config_touch();

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

  -- ⚠ THE ROW IS BUILT KEY-BY-KEY, IN THE CORE'S OWN camelCase VOCABULARY, AND
  -- THE DURATION PAIR IS OMITTED RATHER THAN NULLED. Both of those are
  -- load-bearing, and the obvious `row_to_json` version was WRONG on both:
  --
  -- 1. JSON CANNOT EXPRESS `undefined`. `row_to_json` emits every selected
  --    column, so a summary with no duration keys arrived as
  --    `"durationPrompted": null, "durationAnswer": null` — keys PRESENT.
  --    The core's absence test is `=== undefined` (progressionGuardrail.mjs),
  --    so null is not absent: it fails the boolean check and the row is
  --    reported MALFORMED. Every session written before Deploy 1 — i.e. the
  --    entire trailing baseline — would have been malformed, one malformed row
  --    turns the whole evaluation `unknown` (§13.8), and `unknown` never blocks
  --    publish (§7.5). The guardrail would have been silently OFF for every
  --    client who had any history. That is precisely the failure the
  --    malformed-vs-excluded rule exists to prevent, arriving through the wire
  --    format instead of through a classification mistake.
  --    Verified empirically against the shipped core, both shapes.
  --
  -- 2. `row_to_json` names the columns, so the payload was snake_case while the
  --    core destructures camelCase — only `timezone` matched, by accident. A
  --    mapper would have been mandatory, and the mapper is exactly where (1)
  --    gets missed. Building the object by hand makes the file's claim to hand
  --    over "exactly the six fields §4.1 names" TRUE rather than aspirational.
  --
  -- A HALF-FILLED pair is still passed through intact (one key present, the
  -- other null) so the core reports it malformed BY NAME — a row that
  -- contradicts itself IS a caller bug, and that distinction is the ruling.
  select coalesce(jsonb_agg(s.session order by s.at desc), '[]'::jsonb)
    into v_sessions
  from (
    select
      coalesce(ws.started_at, ws.created_at) as at,
      jsonb_build_object(
        -- The INSTANT, with offset. Never a pre-localized date: the core
        -- resolves the client's own calendar week itself (§4.1, Rule E).
        -- §4.1 ("started_at when present, else created_at") is why this
        -- coalesces rather than dropping the row: started_at is nullable, and
        -- a dropped session shrinks the baseline silently — no malformed
        -- signal, just a tighter ceiling or a fall back to cold start.
        'startedAtISO', to_char(coalesce(ws.started_at, ws.created_at) at time zone 'UTC',
                                'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone',     to_jsonb(v_zone),
        'durationSec',  to_jsonb(ws.duration_seconds),
        -- NULL stays NULL. A skipped rating is absent, never 0 — imputing a 0
        -- would compute 0 x minutes = 0 AU, enter a real week at zero, deflate
        -- the baseline and tighten every future ceiling (§13.4). Verified: the
        -- core reads a null sessionRpe and an absent one identically.
        'sessionRpe',   to_jsonb(ws.session_rpe),
        -- ⚠ THE SCOPE DISCRIMINATORS (§9.5, owner ruling 2026-07-28). Both are
        -- `not null default` columns, so these can never be JSON null.
        --
        -- `source` is carried but NOT filtered on here, deliberately. WHICH
        -- sources count as the client's training is the RULING — the
        -- contestable part, with `manual` explicitly registered for revisit —
        -- and under the §4.1 standing rule a judgement belongs in
        -- progressionGuardrail.mjs where §12's fixtures can reach it. Filtering
        -- it here would move the one decision most likely to change into the
        -- one place it cannot be fixture-tested.
        --
        -- `status` IS filtered below, because it is not a judgement about whose
        -- training counts: a `planned` row is not a past session under any
        -- reading, so it belongs with the ownership and date-window bounds.
        'source',       to_jsonb(ws.source),
        'status',       to_jsonb(ws.status)
      )
      -- The two FACTS, read straight out of the summary jsonb the completion
      -- step writes. NOT a verdict: credibility is derived at READ time against
      -- the CURRENT ceiling (§13.8). Included only when the writer actually
      -- wrote one of them, so "absent" reaches the core as absent.
      || case
           when ws.summary ? 'durationPrompted' or ws.summary ? 'durationAnswer'
             then jsonb_build_object(
                    'durationPrompted', ws.summary -> 'durationPrompted',
                    'durationAnswer',   ws.summary -> 'durationAnswer')
           else '{}'::jsonb
         end as session
    from public.workout_sessions ws
    where ws.client_id = p_client_id
      and coalesce(ws.started_at, ws.created_at) >= now() - make_interval(days => v_days)
      -- ⚠ WORK THAT HAPPENED, not work that was written down (§9.5).
      -- `planned` and `active` are prescribed or in-flight; admitting them
      -- would inflate demonstrated capacity and loosen every future ceiling,
      -- which is the expensive direction. `abandoned` is started-not-finished.
      --
      -- ⚠ `reviewed` IS INCLUDED — a deliberate widening of the ruling's word
      -- "completed", serving that ruling's own reason (a baseline is a record
      -- of what happened). `reviewed` is a COMPLETED session a coach has since
      -- opened. Reading `= 'completed'` literally would mean a coach reviewing
      -- a session REMOVES it from that client's baseline: a silent
      -- baseline-shrink, and worse than a direction error because it makes the
      -- verdict depend on an unrelated act by a different person.
      --
      -- ⚠ FILTERED HERE RATHER THAN AFTER THE CAP, on purpose: the `limit 500`
      -- below is applied by the same query, so a client with many non-performed
      -- rows could otherwise have real history evicted by rows that were never
      -- going to count.
      and ws.status in ('completed', 'reviewed')
    -- Newest first, bounded. At the default 180-day window 500 sessions is
    -- beyond any human schedule and the core only reaches 84 days back, so the
    -- cap can only trim ancient tail rows that could not have entered a
    -- baseline. ⚠ That is a property of the DEFAULT window, not of the cap: a
    -- caller passing p_days => 365 against a very dense history could have rows
    -- trimmed invisibly. Callers use the default.
    order by coalesce(ws.started_at, ws.created_at) desc
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
