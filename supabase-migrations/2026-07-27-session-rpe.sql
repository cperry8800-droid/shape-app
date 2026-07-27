-- Session-level RPE capture (SPEC-guardrails.md §3.1) — Deploy 1 of 2.
--
-- WHY a column and not a derivation: session RPE is rated FOR THE SESSION,
-- post-session. Averaging workout_set_logs.rpe produces a different construct
-- with a systematic downward bias, and a perverse one — the same working sets
-- score lower when a client logs more warm-up sets. Sparse set-RPE logging is
-- not a random sample either (hard sets get rated more often), so the bias does
-- not wash out. A derived estimator was specified and CUT: it would have mixed
-- two constructs in one baseline and let unrated weeks qualify as "measured".
--
-- Nullable on purpose. A skipped rating stores NULL, never 0 — the same
-- honest-absence rule the 2026-06-26 backfill applied to workout_set_logs.rpe.
-- A session with no rating is EXCLUDED from load maths, never imputed.
--
-- Ships AHEAD of the guardrail that consumes it: capture before consumption, so
-- rated sessions accumulate toward the first measured baselines from day one.
-- Nothing here depends on the guardrail.
--
-- Idempotent, safe to re-run.

alter table public.workout_sessions
  add column if not exists session_rpe numeric(3,1)
    check (session_rpe is null or session_rpe between 0 and 10);

comment on column public.workout_sessions.session_rpe is
  'Post-session RPE rated by the member on completion (0-10). NULL = not rated; never defaulted to 0. Paired with duration_seconds to form session RPE load (AU). SPEC-guardrails.md §3.1.';

-- ===== Analytics whitelist =====
-- track_event SILENTLY RETURNS on an unknown event name, so a new event that is
-- added in only one of the two places writes nothing and reports no error. The
-- other place is ANALYTICS_EVENTS in src/lib/funnel.mjs — KEEP THE TWO IN SYNC.
--
-- Adding: session_rpe_prompted { rated: boolean }. Skip rate is a property of
-- the completion PROMPT, not of any downstream consumer, so it ships here with
-- the prompt rather than later — the number is only meaningful if it has been
-- collecting since the first rated session.
--
-- (guardrail_evaluated is deliberately NOT added here. It belongs to Deploy 2,
--  and this same two-place trap is set again there.)
create or replace function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in (
    'onboarding_started','app_opened','workout_started','paywall_viewed','checkout_started',
    'session_rpe_prompted'
  ) then
    return; -- silently ignore non-whitelisted names (defensive)
  end if;
  insert into public.analytics_events (user_id, event, props)
  values (auth.uid(), p_event, coalesce(p_props, '{}'::jsonb));
end;
$$;

-- Unchanged from 2026-06-23: this writer is DELIBERATELY callable by anon and
-- authenticated (it binds auth.uid() itself and rejects unknown names). Restated
-- because `create or replace` above rewrote the function body.
revoke all on function public.track_event(text, jsonb) from public;
grant execute on function public.track_event(text, jsonb) to anon, authenticated;
