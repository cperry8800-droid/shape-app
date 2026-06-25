-- Lock public.profiles.role / .roles against client-side self-elevation.
--
-- THE HOLE: the only self-write policies on public.profiles are
--   "users insert own profile"  WITH CHECK (auth.uid() = id)
--   "users update own profile"  USING/CHECK (auth.uid() = id)
-- Neither restricts the `role` / `roles` columns, so ANY authenticated user can
--   update profiles set role = 'trainer' where id = auth.uid();
-- and self-grant a coach role. computeMembership() (src/lib/membership-core.ts)
-- trusts profiles.role/roles for `isCoach`, so that self-elevation grants
-- coach-surface access AND bypasses the $5/mo membership paywall.
-- (admin is email-based, not role-based, so 'admin' here is not exploitable.)
--
-- THE FIX: a BEFORE INSERT/UPDATE trigger that, for non-service-role callers,
-- neutralizes any attempt to set/add a coach role. Coach roles may ONLY come
-- from the server-side approval flow (createAdminClient -> service_role, in
-- src/app/dashboard/applications/actions.ts updateProfileRole/publishProviderRow).
-- Existing coaches are preserved (the role they already hold is never downgraded);
-- only NEW self-elevation is blocked. Idempotent / safe to re-run.

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
    -- Never downgrade an existing coach (preserve what approval already granted),
    -- but block ADDING any coach role the row didn't already hold.
    if new.role is distinct from old.role
       and new.role = any(coach_roles)
       and not (new.role = old.role) then
      new.role := old.role;  -- revert a self-elevation of the singular role
    end if;
    -- roles[]: keep non-coach entries, plus any coach role the row already held;
    -- strip coach roles that would be newly added by this self-write.
    new.roles := array(
      select r from unnest(coalesce(new.roles, array[]::text[])) r
      where r <> all(coach_roles)
         or r = any(coalesce(old.roles, array[]::text[]))
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
