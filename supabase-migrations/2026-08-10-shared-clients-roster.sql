-- Make the shared-clients roster and the Care Team actually return their counterpart.
--
-- THE DEFECT (verified against production 2026-08-14, by RLS impersonation with a control)
-- /api/me/shared-clients reads the COUNTERPART coach's subscription row on the CALLER's own
-- client (anon key + the caller's session, i.e. role `authenticated`). The only two SELECT
-- policies on `subscriptions` are "clients read own" (auth.uid() = client_id) and "providers
-- read own" (the caller owns that provider row). There is no cross-provider clause, so the read
-- returns NOTHING and the route answers HTTP 200 with `{shared: []}`. Silent, by construction.
--   impersonating the real provider owner -> 1 subscription row visible
--   impersonating a different coach       -> 0 rows      (control: trainers visible = 21 in BOTH,
--                                                         so the zero is real, not a dead probe)
-- The same read backs `careTeam` on /api/clients/[id]/shared-overview, whose comment claims
-- "RLS lets shared coaches read their counterpart's row by design". That comment is false.
--
-- ⚠ THERE WERE TWO INDEPENDENT BUGS, EITHER OF WHICH ALONE EMPTIES THE LIST. Fixing only the
-- permission one would have changed nothing observable. Both routes also select `avatar_url`
-- from `trainers` / `nutritionists` -- a column that DOES NOT EXIST on either table (verified:
-- avatar_url lives on `profiles` only). PostgREST 400s an unknown column, the routes discard the
-- error with `?? []`, so every row then fails the `if (!cp) return null` filter. That is why this
-- function returns no avatar: there is no provider avatar column to return, and the UI already
-- renders initials when it is absent.
--
-- WHY A DEFINER AND NOT A NEW RLS POLICY
-- A `using (public.is_coach_on_client(client_id))` policy on `subscriptions` would work
-- mechanically, but it hands the counterpart the WHOLE row -- fee_bps, amounts, Stripe ids,
-- current_period_end. Column privileges are role-wide, not row-aware, so they cannot claw that
-- back afterwards (the exact trap the 2026-07-30 profiles audit hit). A projecting definer
-- returns only what the surface renders: who the other coach is. Same shape as get_client_stats
-- / get_client_lifts / get_client_meal_prep.
--
-- Nobody is affected today: production holds 1 subscription row, 0 shared_client_acks and 0
-- conversations, and the only two claimed listings share one owner. This fires on the first real
-- shared client -- as an honest-looking empty state that will never be reported as a bug.

create or replace function public.get_my_shared_clients(p_client_id uuid default null)
returns table (
  client_id               uuid,
  counterpart_user_id     uuid,
  counterpart_role        text,
  counterpart_provider_id bigint,
  counterpart_name        text
)
language sql
stable
security definer
-- pg_temp LAST and as a BARE IDENTIFIER LIST. Quoting it (to 'public, pg_temp') stores one
-- schema named "public, pg_temp", which does not exist -- the body would then resolve nothing at
-- call time with no error at apply. See 2026-08-09-definer-pg-temp-sweep.sql.
set search_path = public, pg_temp
as $$
  with me as (
    select 'trainer'::text as role, t.id from public.trainers t      where t.owner_id = auth.uid()
    union all
    select 'nutritionist',          n.id from public.nutritionists n where n.owner_id = auth.uid()
  ),
  my_roles as (
    -- The clients I actively coach, AND the role I coach each of them under. A dual-role coach
    -- who coaches one client through both a trainer row and a nutritionist row appears twice for
    -- that client, which is exactly what the counterpart exclusion at the bottom needs.
    select distinct s.client_id, s.provider_role
    from public.subscriptions s
    join me on me.role = s.provider_role and me.id = s.provider_id
    where s.status in ('active', 'trialing')
  ),
  mine as (
    select distinct client_id from my_roles
  )
  select s.client_id,
         coalesce(t.owner_id, n.owner_id) as counterpart_user_id,
         s.provider_role                  as counterpart_role,
         s.provider_id                    as counterpart_provider_id,
         coalesce(t.name, n.name)         as counterpart_name
  from public.subscriptions s
  join mine on mine.client_id = s.client_id
  left join public.trainers      t on s.provider_role = 'trainer'      and t.id = s.provider_id
  left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
  where auth.uid() is not null
    and s.status in ('active', 'trialing')
    and (p_client_id is null or s.client_id = p_client_id)
    -- an unclaimed listing has no owner, so there is nobody to message
    and coalesce(t.owner_id, n.owner_id) is not null
    -- ⚠ A DUAL-ROLE COACH IS NOT THEIR OWN COUNTERPART. Someone who owns both a trainer and a
    -- nutritionist row and coaches one client through both would otherwise be listed as their
    -- own care team. The ack route rejects that (400) and the thread RPC raises
    -- 'Invalid counterpart.', so it renders as a dead row rather than erroring visibly.
    and coalesce(t.owner_id, n.owner_id) <> auth.uid()
    -- ⚠ EXCLUDE EVERY ROLE I ALREADY COVER FOR THIS CLIENT -- not merely my own provider row.
    -- The earlier version excluded my row by identity, which left a SAME-ROLE coach standing as a
    -- "counterpart": `subscriptions` carries no uniqueness on (client_id, provider_role) (verified
    -- live -- only the PK and a unique stripe_subscription_id), so a client with two active trainers
    -- is representable, and the second trainer came back as the counterpart under a column the UI
    -- heads NUTRITIONIST. This roster is defined as trainer <-> nutritionist by both
    -- /api/me/shared-clients and SharedClientsTab, so that row was simply wrong.
    --
    -- Keyed on the ROLE I coach THIS client under rather than on "the opposite role", because a
    -- dual-role coach has no opposite -- the trap that made the role-flip approach wrong the first
    -- time. It also subsumes the old identity check: my own row's role is by definition a role I
    -- coach that client under. A coach covering one client through BOTH disciplines therefore has
    -- no counterparts at all, which is correct -- they are the entire care team.
    and not exists (
      select 1 from my_roles mr
      where mr.client_id = s.client_id and mr.provider_role = s.provider_role
    );
$$;

-- ⚠ `revoke from public` alone does NOT remove Supabase's EXPLICIT anon/authenticated default
-- grants -- the bug class that shipped league_assign_cohort's self-promote hole. Name anon.
revoke all on function public.get_my_shared_clients(uuid) from public, anon;
grant execute on function public.get_my_shared_clients(uuid) to authenticated;

-- ===== Guard =====
-- RAISE arity checked: every format string below takes exactly the arguments it names. A bare %
-- in a never-executed branch aborts the whole migration at COMPILE time.
do $guard$
declare
  v_secdef  boolean;
  v_path    text;
  v_anon    boolean;
  v_authed  boolean;
begin
  select p.prosecdef,
         (select right(cfg, -length('search_path='))
            from unnest(coalesce(p.proconfig, '{}')) cfg
            where cfg like 'search\_path=%' limit 1)
    into v_secdef, v_path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_my_shared_clients';

  if v_secdef is null then
    raise exception 'get_my_shared_clients was not created';
  end if;
  if not v_secdef then
    raise exception 'get_my_shared_clients is not SECURITY DEFINER — it would read nothing under the caller''s own RLS, which is the bug it exists to fix';
  end if;
  if v_path is null or v_path !~ '(^|,)[[:space:]]*pg_temp[[:space:]]*$' then
    raise exception 'get_my_shared_clients must pin pg_temp LAST in search_path; found: %', coalesce(v_path, '(none)');
  end if;

  v_anon   := has_function_privilege('anon',          'public.get_my_shared_clients(uuid)', 'execute');
  v_authed := has_function_privilege('authenticated', 'public.get_my_shared_clients(uuid)', 'execute');
  if v_anon then
    raise exception 'anon can execute get_my_shared_clients — a signed-out caller has no auth.uid() and must not reach it';
  end if;
  if not v_authed then
    raise exception 'authenticated cannot execute get_my_shared_clients — the roster would stay empty';
  end if;
end
$guard$;
