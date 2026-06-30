-- supabase-migrations/2026-06-23-analytics-events.sql
-- Funnel analytics (retention idea #6). A thin, admin-only event table + a
-- whitelisted writer, and get_funnel() which computes the 7-step funnel from
-- EXISTING tables (signup/onboarding/workout/nutrition/paid/retention). The
-- event whitelist here MUST match ANALYTICS_EVENTS in src/lib/funnel.mjs.
-- Idempotent. Code no-ops until applied (RPC-missing is caught by callers).

create table if not exists public.analytics_events (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event   text not null,
  props   jsonb not null default '{}'::jsonb,
  ts      timestamptz not null default now()
);
create index if not exists analytics_events_event_ts_idx on public.analytics_events (event, ts);
create index if not exists analytics_events_user_ts_idx   on public.analytics_events (user_id, ts);

alter table public.analytics_events enable row level security;

-- Direct SELECT is deny-all by default: the app.admin_emails GUC below is not
-- set in practice (admins live in the ADMIN_EMAILS env var, used by Node, not a
-- Postgres GUC), so this matches no one and fails closed. The funnel is read
-- ONLY via the service-role get_funnel RPC (which bypasses RLS) — this policy is
-- defense-in-depth, not the gate. Set the GUC here only if you ever need direct
-- admin table reads via PostgREST.
drop policy if exists "analytics_events_admin_read" on public.analytics_events;
create policy "analytics_events_admin_read" on public.analytics_events
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and lower(pr.email) = any (string_to_array(lower(coalesce(current_setting('app.admin_emails', true), '')), ','))
    )
  );
-- (No INSERT/UPDATE/DELETE policy: writes go only through track_event below,
--  and service-role/cron bypass RLS for purge.)

-- Whitelisted writer. Rejects unknown event names; binds the caller's uid.
create or replace function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in ('onboarding_started','app_opened','workout_started','paywall_viewed','checkout_started') then
    return; -- silently ignore non-whitelisted names (defensive)
  end if;
  insert into public.analytics_events (user_id, event, props)
  values (auth.uid(), p_event, coalesce(p_props, '{}'::jsonb));
end;
$$;
revoke all on function public.track_event(text, jsonb) from public;
grant execute on function public.track_event(text, jsonb) to anon, authenticated;

-- The funnel. Returns one row per step with the count for client accounts that
-- signed up in [p_from, p_to). Retention steps only count members old enough to
-- have reached that day.
create or replace function public.get_funnel(p_from timestamptz, p_to timestamptz)
returns table (step text, count bigint)
language sql
security definer
set search_path = public
as $$
  with cohort as (
    select pr.id as uid, pr.created_at
    from public.profiles pr
    where pr.role = 'client'
      and pr.created_at >= p_from and pr.created_at < p_to
  )
  select 'signup'::text, count(*)::bigint from cohort
  union all
  select 'onboarding', count(*)::bigint from cohort c
    where exists (select 1 from public.user_goals g
                  where g.user_id = c.uid and g.kind = 'client_onboarding'
                    and coalesce((g.data->>'intentSeen')::boolean, false))
  union all
  select 'first_workout', count(*)::bigint from cohort c
    where exists (select 1 from public.workout_sessions w where w.client_id = c.uid)
  union all
  select 'first_nutrition', count(*)::bigint from cohort c
    where exists (select 1 from public.daily_health_snapshot d
                  where d.user_id = c.uid and (d.calories is not null or d.protein_g is not null))
  union all
  select 'paid', count(*)::bigint from cohort c
    where exists (select 1 from public.platform_subscriptions s
                  where s.client_id = c.uid and s.status in ('active','trialing','past_due'))
  union all
  select 'day30', count(*)::bigint from cohort c
    where c.created_at < now() - interval '30 days'
      and (
        exists (select 1 from public.workout_sessions w
                where w.client_id = c.uid and w.created_at >= c.created_at + interval '30 days')
        or exists (select 1 from public.daily_health_snapshot d
                where d.user_id = c.uid and d.snapshot_date >= (c.created_at + interval '30 days')::date)
      )
  union all
  select 'day90', count(*)::bigint from cohort c
    where c.created_at < now() - interval '90 days'
      and (
        exists (select 1 from public.workout_sessions w
                where w.client_id = c.uid and w.created_at >= c.created_at + interval '90 days')
        or exists (select 1 from public.daily_health_snapshot d
                where d.user_id = c.uid and d.snapshot_date >= (c.created_at + interval '90 days')::date)
      );
$$;
-- Supabase's default privileges grant EXECUTE on new public functions to anon +
-- authenticated, and `revoke ... from public` does NOT remove those role grants,
-- so revoke them explicitly — get_funnel exposes aggregate funnel metrics and
-- must be service-role-only (the War Room reads it via the service-role client).
revoke all on function public.get_funnel(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_funnel(timestamptz, timestamptz) to service_role;
