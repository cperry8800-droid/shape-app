-- Source reconciliation (INT2) — see every provider's value for a metric, and
-- let the user (or their coach) pick the authoritative source per metric.
--
--   • health_metric_observations — one row per (user, day, metric, source): the
--     RAW value each provider reported, so conflicts are recoverable (the
--     snapshot only keeps the winner). Written alongside every sync.
--   • metric_source_overrides — the user/coach's chosen authoritative source per
--     metric (this IS the per-metric ranking). The ingestion honors it; the
--     reconcile view computes the authoritative reading from it.
--
-- Owner-RLS on the tables; the SECURITY DEFINER RPCs do the role-scoped reads /
-- writes (self, or a coach on the client via is_coach_on_client). Idempotent.

-- ===== observations =====
create table if not exists public.health_metric_observations (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  metric text not null,
  source text not null,
  value numeric not null,
  observed_at timestamptz not null default now(),
  primary key (user_id, snapshot_date, metric, source)
);
create index if not exists hmo_user_date_idx on public.health_metric_observations (user_id, snapshot_date desc);
alter table public.health_metric_observations enable row level security;
drop policy if exists "hmo_own" on public.health_metric_observations;
create policy "hmo_own" on public.health_metric_observations for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== per-metric authoritative-source override (INT1's ranking) =====
create table if not exists public.metric_source_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null,
  source text not null,
  set_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric)
);
alter table public.metric_source_overrides enable row level security;
drop policy if exists "mso_own" on public.metric_source_overrides;
create policy "mso_own" on public.metric_source_overrides for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reconcilable metrics (snapshot columns that come from providers). Guards the
-- dynamic column update below — only these names are ever interpolated.
create or replace function public._reconcilable_metric(p_metric text)
returns boolean language sql immutable as $$
  select p_metric in (
    'sleep_hours','recovery_score','hrv_ms','resting_hr','strain',
    'sleep_performance_pct','sleep_efficiency_pct','workout_minutes','avg_heart_rate','calories'
  );
$$;

-- ===== read: recent observations + current overrides (self or coach) =====
create or replace function public.get_health_sources(p_user_id uuid, p_days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
begin
  if v_uid <> auth.uid() and not public.is_coach_on_client(v_uid) then
    return null; -- not your data and not your client
  end if;
  return jsonb_build_object(
    'observations', coalesce((
      select jsonb_agg(jsonb_build_object('snapshot_date', o.snapshot_date, 'metric', o.metric, 'source', o.source, 'value', o.value, 'observed_at', o.observed_at))
      from public.health_metric_observations o
      where o.user_id = v_uid and o.snapshot_date >= (current_date - greatest(coalesce(p_days, 7), 1))
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_object_agg(m.metric, m.source) from public.metric_source_overrides m where m.user_id = v_uid
    ), '{}'::jsonb)
  );
end;
$$;
grant execute on function public.get_health_sources(uuid, int) to authenticated;

-- ===== write: set the authoritative source for a metric (self or coach) =====
-- Upserts the override AND re-points the most recent snapshot value for that
-- metric to the chosen source's latest observation, so the change takes effect
-- immediately. The column name is allow-listed (_reconcilable_metric) before any
-- interpolation.
create or replace function public.set_metric_source(p_user_id uuid, p_metric text, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_obs record;
begin
  if v_uid <> auth.uid() and not public.is_coach_on_client(v_uid) then
    raise exception 'Not authorized for this user.' using errcode = '42501';
  end if;
  if not public._reconcilable_metric(p_metric) then
    raise exception 'Unknown metric %', p_metric using errcode = '22023';
  end if;

  insert into public.metric_source_overrides (user_id, metric, source, set_by, updated_at)
  values (v_uid, p_metric, p_source, auth.uid(), now())
  on conflict (user_id, metric) do update set source = excluded.source, set_by = excluded.set_by, updated_at = now();

  -- re-point the snapshot to the chosen source's latest reading (if any).
  select o.snapshot_date, o.value into v_obs
  from public.health_metric_observations o
  where o.user_id = v_uid and o.metric = p_metric and o.source = p_source
  order by o.snapshot_date desc limit 1;

  if found then
    execute format(
      'update public.daily_health_snapshot set %I = $1, sources = jsonb_set(coalesce(sources, ''{}''::jsonb), array[$2], to_jsonb($3::text), true), updated_at = now() where user_id = $4 and snapshot_date = $5',
      p_metric
    ) using v_obs.value, p_metric, p_source, v_uid, v_obs.snapshot_date;
  end if;

  return jsonb_build_object('ok', true, 'metric', p_metric, 'source', p_source);
end;
$$;
grant execute on function public.set_metric_source(uuid, text, text) to authenticated;
