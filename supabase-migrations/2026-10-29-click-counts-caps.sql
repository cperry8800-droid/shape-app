-- record_ui_clicks, after Codex's review of #2493 (2026-10-28-click-counts.sql has run):
--
--   1. A batch carries at most 60 taps in all, and one over that is refused whole. A caller could
--      claim 40 rows of 50 taps, 30 times a minute (60,000 made-up taps a minute from one
--      address); now it is at most 60 taps a batch and 20 batches a minute. The website and the
--      app send one batch every 15 seconds at most, or sooner when the page is left, and the
--      route trims every batch to 60 first (cleanBatch, src/lib/click-capture.mjs), so a real
--      batch is never refused.
--   2. A dietitian's taps are a coach's, as src/lib/roles.mjs's COACH_ROLES has it.
--
-- Only the function changes. One transaction. Idempotent, safe to re-run.

begin;

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
    'fn:ui_clicks:' || coalesce(p_user::text, 'ip:' || coalesce(nullif(btrim(p_ip), ''), 'unknown')), 20, 60
  ) b;
  if not coalesce(v_allowed, false) then
    return 0;
  end if;

  if p_user is not null then
    select case
             when coalesce(p.roles, '{}') && array['trainer', 'nutritionist', 'dietitian']
                  or p.role in ('trainer', 'nutritionist', 'dietitian') then 'coach'
             else 'member'
           end
      into v_audience
    from public.profiles p
    where p.id = p_user;
    v_audience := coalesce(v_audience, 'member');
  end if;

  with r as (
    select left(btrim(e ->> 'page'), 80) as page,
           left(btrim(e ->> 'target'), 60) as target,
           case when (e ->> 'n') ~ '^[0-9]{1,6}$' then least((e ->> 'n')::integer, 50) else 0 end as n
    from (select value as e from jsonb_array_elements(p_rows) limit 40) x
    where jsonb_typeof(e) = 'object'
  ),
  kept as (
    select * from r where r.page <> '' and r.target <> '' and r.n > 0
  ),
  total as (
    select coalesce(sum(kept.n), 0) as taps from kept
  )
  insert into public.ui_click_counts as c (day, surface, audience, page, target, clicks)
  select public.ui_click_day(p_tz), p_surface, v_audience, kept.page, kept.target, sum(kept.n)
  from kept cross join total
  where total.taps <= 60
  group by kept.page, kept.target
  on conflict (day, surface, audience, page, target)
  do update set clicks = c.clicks + excluded.clicks;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.record_ui_clicks(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_ui_clicks(uuid, text, text, jsonb, text) to service_role;

-- Guard: raise on anything that did not land.
do $guard$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_ui_clicks'
    and pg_get_function_identity_arguments(p.oid) = 'p_user uuid, p_ip text, p_surface text, p_rows jsonb, p_tz text';
  if v_src is null or v_src not like '%total.taps <= 60%' or v_src not like '%''dietitian''%' then
    raise exception 'record_ui_clicks does not cap a batch at 60 taps or count dietitians as coaches';
  end if;
  if has_function_privilege('anon', 'public.record_ui_clicks(uuid, text, text, jsonb, text)', 'execute')
     or has_function_privilege('authenticated', 'public.record_ui_clicks(uuid, text, text, jsonb, text)', 'execute')
     or not has_function_privilege('service_role', 'public.record_ui_clicks(uuid, text, text, jsonb, text)', 'execute') then
    raise exception 'record_ui_clicks must be the service role''s alone';
  end if;
end
$guard$;

commit;
