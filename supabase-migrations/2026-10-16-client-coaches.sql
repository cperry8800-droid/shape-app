-- Every coach a member pays, readable by that member and by each of those coaches (owner, 2026-10-16:
-- "members can have multiple coaches if they choose to").
--
-- Nothing ever refused a second coach of one role: checkout refuses only a second subscription to the
-- SAME coach, and subscriptions carry no uniqueness on (client_id, provider_role). What assumed one
-- coach per role were the reads. Two trainers on one member share the training section of
-- client_programs (owner, same day: "shared section is fine"), and either of them may set the
-- week-one target there, so each needs to know the other is there:
-- - RLS on subscriptions lets a coach read only their OWN rows, so a coach cannot see a co-coach's.
-- - get_my_shared_clients (2026-08-10-shared-clients-roster.sql) deliberately leaves out every coach
--   of a role the caller covers, because that roster is trainer <-> nutritionist; so trainer A never
--   saw trainer B in the care team.
--
-- get_client_coaches(client): one row per listing with an active or trialing subscription from this
-- member: its role, listing id, name, owner, and when that subscription began (its earliest live
-- row). The member reads their own; a coach reads it for a member they coach now
-- (is_coach_on_client). Anyone else gets no rows. Names and owners are already public on the
-- listing tables; the start day is the one thing it adds, and only to the people in that care team.
--
-- Called by: src/lib/shared-overview.ts (the care team, and whose week-one target the coach board
-- reads).
--
-- Re-runnable: "create or replace", and a guard that checks the result.

begin;

create or replace function public.get_client_coaches(p_client_id uuid)
returns table (provider_role text, provider_id bigint, name text, owner_id uuid, since timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.provider_role,
         s.provider_id,
         coalesce(t.name, n.name)         as name,
         coalesce(t.owner_id, n.owner_id) as owner_id,
         min(s.created_at)                as since
  from public.subscriptions s
  left join public.trainers      t on s.provider_role = 'trainer'      and t.id = s.provider_id
  left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
  where auth.uid() is not null
    and p_client_id is not null
    and s.client_id = p_client_id
    and s.status in ('active', 'trialing')
    and (auth.uid() = p_client_id or public.is_coach_on_client(p_client_id))
  group by s.provider_role, s.provider_id, coalesce(t.name, n.name), coalesce(t.owner_id, n.owner_id)
  order by min(s.created_at), s.provider_id;
$$;

revoke all on function public.get_client_coaches(uuid) from public, anon;
grant execute on function public.get_client_coaches(uuid) to authenticated, service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if has_function_privilege('anon', 'public.get_client_coaches(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_client_coaches(uuid)', 'execute') then
    raise exception 'get_client_coaches must be executable by signed-in callers only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_client_coaches'
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
  ) then
    raise exception 'get_client_coaches must be a definer with a pinned search_path';
  end if;
  -- Signed out (no auth.uid() here), it answers nothing.
  if exists (select 1 from public.get_client_coaches((select client_id from public.subscriptions limit 1))) then
    raise exception 'get_client_coaches answered with no caller';
  end if;
end
$guard$;

commit;
