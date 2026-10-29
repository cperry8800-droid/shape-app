-- Where people tap on the website and in the app, for the admin Overview's Clicks tab
-- (owner, 2026-10-28: "add to admin page where user/members click on website/app").
--
--   1. ui_click_counts: one row per day, surface (web or app), audience (visitor, member or
--      coach), page and control label, holding how many taps it had. Daily totals only: no
--      account, device or address is kept with a count.
--   2. record_ui_clicks(): adds a batch of taps (POST /api/analytics/clicks, with the service
--      role). It works out the audience from the account the route checked, and caps each caller
--      at 30 batches a minute.
--   3. admin_click_stats(): what the Clicks tab shows, for a period and a filter.
--
-- What a label is, and why a row's text never becomes one, is in src/lib/click-capture.mjs. The
-- cron at /api/cron/analytics-purge drops counts older than 12 months.
--
-- ===== WHO CAN READ IT =====
-- Nobody through the API: RLS is on with no policies, and the three are the service role's alone.
-- The console checks the staff level (the Overview's: analyst and up) and then reads with the
-- service role.
--
-- Until this runs, taps are dropped (the route answers 204 either way) and the Clicks tab says
-- the migration is missing. One transaction. Idempotent, safe to re-run.

begin;

create table if not exists public.ui_click_counts (
  day      date   not null,
  surface  text   not null check (surface in ('web', 'app')),
  audience text   not null check (audience in ('visitor', 'member', 'coach')),
  page     text   not null check (char_length(page) between 1 and 80),
  target   text   not null check (char_length(target) between 1 and 60),
  clicks   bigint not null default 0 check (clicks >= 0),
  primary key (day, surface, audience, page, target)
);

alter table public.ui_click_counts enable row level security;
revoke all on table public.ui_click_counts from public, anon, authenticated;
grant select, insert, update, delete on table public.ui_click_counts to service_role;

-- The day a tap counts on, in the owner's zone (ADMIN_TIMEZONE); an unknown zone is UTC.
create or replace function public.ui_click_day(p_tz text)
returns date
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  return (now() at time zone coalesce(nullif(p_tz, ''), 'UTC'))::date;
exception when others then
  return (now() at time zone 'UTC')::date;
end;
$$;

revoke all on function public.ui_click_day(text) from public, anon, authenticated;
grant execute on function public.ui_click_day(text) to service_role;

-- A batch: p_rows is [{ page, target, n }], already cleaned by the route (cleanBatch); this
-- cleans it again. p_user is the account the route read from the request's own session, or null
-- for a visitor; p_ip is the caller's address, used only for the rate bucket and never stored
-- with a count. Returns how many (page, label) rows it wrote.
create or replace function public.record_ui_clicks(
  p_user uuid,
  p_ip text,
  p_surface text,
  p_rows jsonb,
  p_tz text default 'UTC'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
  v_audience text := 'visitor';
  v_written integer := 0;
begin
  if p_surface is null or p_surface not in ('web', 'app') or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  select b.allowed into v_allowed
  from public._rate_limit_bump(
    'fn:ui_clicks:' || coalesce(p_user::text, 'ip:' || coalesce(nullif(btrim(p_ip), ''), 'unknown')), 30, 60
  ) b;
  if not coalesce(v_allowed, false) then
    return 0;
  end if;

  if p_user is not null then
    select case
             when 'trainer' = any(coalesce(p.roles, '{}')) or 'nutritionist' = any(coalesce(p.roles, '{}'))
                  or p.role in ('trainer', 'nutritionist') then 'coach'
             else 'member'
           end
      into v_audience
    from public.profiles p
    where p.id = p_user;
    v_audience := coalesce(v_audience, 'member');
  end if;

  insert into public.ui_click_counts as c (day, surface, audience, page, target, clicks)
  select public.ui_click_day(p_tz), p_surface, v_audience, r.page, r.target, least(sum(r.n), 50 * 40)
  from (
    select left(btrim(e ->> 'page'), 80) as page,
           left(btrim(e ->> 'target'), 60) as target,
           case when (e ->> 'n') ~ '^[0-9]{1,6}$' then least((e ->> 'n')::integer, 50) else 0 end as n
    from (select value as e from jsonb_array_elements(p_rows) limit 40) x
    where jsonb_typeof(e) = 'object'
  ) r
  where r.page <> '' and r.target <> '' and r.n > 0
  group by r.page, r.target
  on conflict (day, surface, audience, page, target)
  do update set clicks = c.clicks + excluded.clicks;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.record_ui_clicks(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_ui_clicks(uuid, text, text, jsonb, text) to service_role;

-- The Clicks tab: the last p_days days (1 to 365) up to today in p_tz, for one surface and one
-- audience or all (null). Totals by surface and audience, every day's count, the 25 pages and the
-- 100 controls tapped most.
create or replace function public.admin_click_stats(
  p_days integer default 30,
  p_surface text default null,
  p_audience text default null,
  p_tz text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_to date := public.ui_click_day(p_tz);
  v_from date := v_to - (v_days - 1);
  v_surface text := case when p_surface in ('web', 'app') then p_surface end;
  v_audience text := case when p_audience in ('visitor', 'member', 'coach') then p_audience end;
  v_out jsonb;
begin
  with f as (
    select c.day, c.surface, c.audience, c.page, c.target, c.clicks
    from public.ui_click_counts c
    where c.day between v_from and v_to
      and (v_surface is null or c.surface = v_surface)
      and (v_audience is null or c.audience = v_audience)
  )
  select jsonb_build_object(
    'generated_at', now(),
    'from', v_from,
    'to', v_to,
    'days', v_days,
    'total', coalesce((select sum(f.clicks) from f), 0),
    'by_surface', coalesce((select jsonb_object_agg(s.surface, s.n) from (select f.surface, sum(f.clicks) as n from f group by f.surface) s), '{}'::jsonb),
    'by_audience', coalesce((select jsonb_object_agg(s.audience, s.n) from (select f.audience, sum(f.clicks) as n from f group by f.audience) s), '{}'::jsonb),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'clicks', coalesce(t.n, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g) d
      left join (select f.day, sum(f.clicks) as n from f group by f.day) t on t.day = d.day
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('surface', p.surface, 'page', p.page, 'clicks', p.n) order by p.n desc, p.surface, p.page), '[]'::jsonb)
      from (
        select f.surface, f.page, sum(f.clicks) as n from f group by f.surface, f.page
        order by n desc, f.surface, f.page limit 25
      ) p
    ),
    'targets', (
      select coalesce(jsonb_agg(jsonb_build_object('surface', t.surface, 'page', t.page, 'target', t.target, 'clicks', t.n) order by t.n desc, t.surface, t.page, t.target), '[]'::jsonb)
      from (
        select f.surface, f.page, f.target, sum(f.clicks) as n from f group by f.surface, f.page, f.target
        order by n desc, f.surface, f.page, f.target limit 100
      ) t
    )
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.admin_click_stats(integer, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_click_stats(integer, text, text, text) to service_role;

-- Guard: raise on anything that did not land.
do $guard$
declare
  f record;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ui_click_counts' and c.relrowsecurity
  ) then
    raise exception 'ui_click_counts is missing or has no row level security';
  end if;
  if has_table_privilege('anon', 'public.ui_click_counts', 'select')
     or has_table_privilege('authenticated', 'public.ui_click_counts', 'select') then
    raise exception 'ui_click_counts must be the service role''s alone';
  end if;
  for f in
    select * from (values
      ('public.ui_click_day(text)'),
      ('public.record_ui_clicks(uuid, text, text, jsonb, text)'),
      ('public.admin_click_stats(integer, text, text, text)')
    ) as t(sig)
  loop
    if has_function_privilege('anon', f.sig, 'execute') or has_function_privilege('authenticated', f.sig, 'execute') then
      raise exception '% must be the service role''s alone', f.sig;
    end if;
    if not has_function_privilege('service_role', f.sig, 'execute') then
      raise exception '% must be open to the service role', f.sig;
    end if;
  end loop;
end
$guard$;

commit;
