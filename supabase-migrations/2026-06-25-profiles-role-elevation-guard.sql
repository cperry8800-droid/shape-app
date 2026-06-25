-- Lock public.profiles.role / .roles against client-side self-elevation.
--
-- THE HOLE: the only self-write policies on public.profiles check auth.uid()=id
-- with NO restriction on the `role` / `roles` columns, so any authenticated user
-- could `update profiles set role = 'trainer' where id = auth.uid();` and
-- self-grant a coach role. computeMembership() (src/lib/membership-core.ts) trusts
-- profiles.role/roles for `isCoach`, so that self-elevation grants coach-surface
-- access AND bypasses the $5/mo membership paywall. (admin is email-based, not
-- role-based, so 'admin' here is not exploitable.)
--
-- THE FIX: a BEFORE INSERT/UPDATE trigger that, for non-service-role callers,
-- neutralizes any attempt to GAIN a coach role the user doesn't already hold.
-- Coach roles may ONLY be granted by the server-side approval flow
-- (createAdminClient -> service_role, in dashboard/applications/actions.ts).
-- Existing coaches are PRESERVED — the coach entries in roles[] are never dropped
-- by a self-write (even one that omits them), and the active singular role may be
-- switched among roles the user ALREADY holds (mirrors /api/me/role) — only NEW
-- elevation to an un-held coach role is blocked. Idempotent / safe to re-run.

create or replace function public.guard_profile_role_elevation()
returns trigger
language plpgsql
-- SECURITY INVOKER (default): the trigger only mutates NEW; it reads the request
-- JWT/role GUCs, which are session-scoped and unaffected by the security context.
set search_path = public
as $$
declare
  coach_roles constant text[] := array['trainer','nutritionist','dietitian','admin'];
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  -- PostgREST SET ROLEs to the JWT role; the service key -> 'service_role'.
  -- Also treat raw DB/admin connections (migrations, dashboard) as privileged.
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
begin
  -- Trusted writers (approval flow / admin client / migrations) may set any role.
  if is_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A self-created profile can only be a client. Drop any privileged role/roles.
    if new.role = any(coach_roles) then
      new.role := 'client';
    end if;
    new.roles := array(
      select r from unnest(coalesce(new.roles, array[]::text[])) r
      where r <> all(coach_roles)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Block ELEVATION to a coach role the user does not already hold; allow
    -- switching the active role to any role already in roles[] (or to a non-coach
    -- role). Mirrors /api/me/role, which only permits switching to an owned role.
    if new.role is distinct from old.role
       and new.role = any(coach_roles)
       and not (new.role = any(coalesce(old.roles, array[]::text[]))) then
      new.role := old.role;
    end if;
    -- Keep the non-coach roles the update wants + ALWAYS retain old coach grants:
    -- new coach roles can't be self-added; existing ones can't be self-removed.
    new.roles := (
      select coalesce(array_agg(distinct r), array[]::text[])
      from (
        select r from unnest(coalesce(new.roles, array[]::text[])) r where r <> all(coach_roles)
        union
        select r from unnest(coalesce(old.roles, array[]::text[])) r where r = any(coach_roles)
      ) u
    );
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role_elevation on public.profiles;
create trigger profiles_guard_role_elevation
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role_elevation();
