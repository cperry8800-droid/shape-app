-- How many people open a coach's public page, for the Growth funnel's top bar (owner, 2026-11-05:
-- "Profile-view counting: 4 = yes", aggregate counts only). Until this, funnel.views was always null
-- (src/lib/coach-growth.ts).
--
--   1. coach_profile_views: one row per listing per UTC day, holding how many views it had. A count
--      only: no account, device, address or cookie is kept with it.
--   2. record_coach_profile_view(): adds one view (POST /api/analytics/profile-view, with the service
--      role). It counts nothing when the viewer owns the listing (a coach looking at their own page),
--      nothing for a listing that does not exist or has no coach, and at most one view per address
--      and listing every 30 minutes, 60 views an address an hour. The address arrives only as a
--      keyed hash the route makes (src/lib/profile-views.mjs viewBucket), and lives only in the
--      rate limiter's short-lived bucket name, never beside a count.
--   3. A coach reads their own listings' rows (RLS), which is how the dashboards sum 90 days.
--
-- Counts older than 400 days are dropped as new ones arrive. Until this runs, views are dropped (the
-- route answers 204 either way) and the funnel keeps saying view tracking connects soon.
-- One transaction. Idempotent, safe to re-run.

begin;

create table if not exists public.coach_profile_views (
  provider_role text    not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id   bigint  not null,
  day           date    not null,
  views         integer not null default 0 check (views >= 0),
  primary key (provider_role, provider_id, day)
);

alter table public.coach_profile_views enable row level security;
revoke all on table public.coach_profile_views from public, anon, authenticated;
grant select on table public.coach_profile_views to authenticated;
grant select, insert, update, delete on table public.coach_profile_views to service_role;

-- The coach who owns the listing reads its days; nobody else does, and nobody writes through the API.
drop policy if exists coach_profile_views_owner_read on public.coach_profile_views;
create policy coach_profile_views_owner_read on public.coach_profile_views
  for select to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t where t.id = provider_id and t.owner_id = (select auth.uid())))
    or (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n where n.id = provider_id and n.owner_id = (select auth.uid())))
  );

-- One view. p_viewer is the account the route read from the request's own session (null for a
-- visitor), used only to leave out the listing's own coach and never stored. p_bucket is the route's
-- keyed hash of the caller's address and this listing; p_addr its keyed hash of the address alone.
-- Returns whether the view was counted.
create or replace function public.record_coach_profile_view(
  p_role text,
  p_provider_id bigint,
  p_viewer uuid,
  p_bucket text,
  p_addr text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_allowed boolean;
begin
  if p_role is null or p_role not in ('trainer', 'nutritionist') or p_provider_id is null or p_provider_id <= 0 then
    return false;
  end if;
  if p_bucket is null or p_bucket !~ '^[0-9a-f]{16,128}$' or p_addr is null or p_addr !~ '^[0-9a-f]{16,128}$' then
    return false;
  end if;

  -- Only a listing a coach owns: Shape's own seeded listings have no one to read the count, and an
  -- id that names nothing must not make a row.
  if p_role = 'trainer' then
    select t.owner_id into v_owner from public.trainers t where t.id = p_provider_id;
  else
    select n.owner_id into v_owner from public.nutritionists n where n.id = p_provider_id;
  end if;
  if v_owner is null then
    return false;
  end if;
  -- The coach looking at their own page is not a view.
  if p_viewer is not null and p_viewer = v_owner then
    return false;
  end if;

  -- A reload, a back and forth, or a second tab is the same view: one per address and listing every
  -- 30 minutes. And one address counts at most 60 views an hour across every listing.
  select b.allowed into v_allowed from public._rate_limit_bump('fn:pview:' || p_bucket, 1, 1800) b;
  if not coalesce(v_allowed, false) then
    return false;
  end if;
  select b.allowed into v_allowed from public._rate_limit_bump('fn:pview-addr:' || p_addr, 60, 3600) b;
  if not coalesce(v_allowed, false) then
    return false;
  end if;

  if random() < 0.01 then
    delete from public.coach_profile_views where day < (now() at time zone 'UTC')::date - 400;
  end if;

  insert into public.coach_profile_views as v (provider_role, provider_id, day, views)
  values (p_role, p_provider_id, (now() at time zone 'UTC')::date, 1)
  on conflict (provider_role, provider_id, day)
  do update set views = v.views + 1;
  return true;
end;
$$;

revoke all on function public.record_coach_profile_view(text, bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_coach_profile_view(text, bigint, uuid, text, text) to service_role;

-- Guard: raise on anything that did not land.
do $guard$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'coach_profile_views' and c.relrowsecurity
  ) then
    raise exception 'coach_profile_views is missing or has no row level security';
  end if;
  if has_table_privilege('anon', 'public.coach_profile_views', 'select')
     or has_table_privilege('authenticated', 'public.coach_profile_views', 'insert')
     or has_table_privilege('authenticated', 'public.coach_profile_views', 'update') then
    raise exception 'coach_profile_views: only its coach reads it, and only the service role writes it';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_profile_views' and policyname = 'coach_profile_views_owner_read') then
    raise exception 'coach_profile_views has no owner read policy';
  end if;
  if has_function_privilege('anon', 'public.record_coach_profile_view(text, bigint, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.record_coach_profile_view(text, bigint, uuid, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.record_coach_profile_view(text, bigint, uuid, text, text)', 'execute') then
    raise exception 'record_coach_profile_view must be the service role''s alone';
  end if;
end
$guard$;

commit;
