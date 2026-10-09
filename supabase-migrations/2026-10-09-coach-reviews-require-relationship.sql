-- A coach review needs a relationship: a subscription with that coach, or a session that
-- happened. M4 of the 2026-10-08 security review (the app-code half).
--
-- WHAT WAS WRONG. coach_reviews' INSERT policy is `user_id = auth.uid()` and the owner trigger
-- only stamps the coach's user id from the slug; POST /api/coaches/reviews required a session
-- and nothing else. So any signed-in account could publish a 1-to-10 rating of any coach, and
-- the public averages and the marketplace summaries are built from exactly these rows: a
-- handful of accounts shifts every coach's score. 0 reviews live when this was written.
--
-- WHAT THIS ADDS.
--   coach_review_allowed(p_slug, p_kind)   true when the CALLER (auth.uid(); never an argument)
--     has a subscription with a provider whose slugified name is p_slug (any status but
--     `pending` and `incomplete`, which never paid), or a session with that provider that is
--     confirmed or completed and already in the past. The slug rule is the owner trigger's
--     (coach_review_owner_id), so the two always name the same coach. SECURITY DEFINER because
--     subscriptions and sessions are the member's own rows: a member's RLS reads them anyway, so
--     nothing new is exposed, and the trigger below needs the same answer under the policy's
--     evaluation. Executable by authenticated (the route asks it first, for a clean 403).
--   coach_reviews_require_relationship   BEFORE INSERT OR UPDATE: refuses a row the function
--     does not allow (errcode 42501, message `review_requires_relationship`). An UPDATE that
--     keeps the coach (slug and kind) is a body or rating edit and is not re-checked; one that
--     re-points the row at another coach is. The service role and the Postgres owner pass (the
--     webhook and admin paths), as in every freeze trigger in this repo.
--
-- Tested on a local PostgreSQL 16 replica of production (coach_reviews rebuilt from the live
-- catalog): a subscriber's review is written, a past confirmed session's is written, a member
-- with neither is refused by the function and by a direct insert, a pending subscription does
-- not count, a future session does not count, anon cannot execute the function, and a second
-- run of the file changed nothing.
--
-- Idempotent, one transaction, lock_timeout 10 s (as 2026-10-08-security-review-access-layer.sql).

begin;
set local lock_timeout = '10s';

create or replace function public.coach_review_allowed(p_slug text, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with providers as (
    select t.id as provider_id, 'trainer'::text as provider_role
    from public.trainers t
    where p_kind = 'trainer'
      and regexp_replace(regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') = p_slug
    union all
    select n.id, 'nutritionist'::text
    from public.nutritionists n
    where p_kind = 'nutritionist'
      and regexp_replace(regexp_replace(lower(n.name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') = p_slug
  )
  select auth.uid() is not null
     and p_slug is not null and p_kind in ('trainer', 'nutritionist')
     and (
       exists (
         select 1
         from public.subscriptions s
         join providers p on p.provider_id = s.provider_id and p.provider_role = s.provider_role
         where s.client_id = auth.uid()
           and s.status not in ('pending', 'incomplete')
       )
       or exists (
         select 1
         from public.sessions x
         join providers p on p.provider_id = x.provider_id and p.provider_role = x.provider_role
         where x.client_id = auth.uid()
           and x.status in ('confirmed', 'completed')
           and x.scheduled_at < now()
       )
     );
$$;

revoke all on function public.coach_review_allowed(text, text) from public;
revoke all on function public.coach_review_allowed(text, text) from anon;
revoke all on function public.coach_review_allowed(text, text) from authenticated;
grant execute on function public.coach_review_allowed(text, text) to authenticated;

create or replace function public.coach_reviews_require_relationship()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role', 'supabase_admin', 'supabase_auth_admin', 'postgres')
                           or jwt_role = 'service_role';
begin
  if is_privileged then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.coach_slug is not distinct from old.coach_slug
     and new.coach_kind is not distinct from old.coach_kind then
    return new;
  end if;
  if not public.coach_review_allowed(new.coach_slug, new.coach_kind) then
    raise exception 'review_requires_relationship' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.coach_reviews_require_relationship() from public;
revoke all on function public.coach_reviews_require_relationship() from anon;
revoke all on function public.coach_reviews_require_relationship() from authenticated;

drop trigger if exists coach_reviews_require_relationship on public.coach_reviews;
create trigger coach_reviews_require_relationship
  before insert or update on public.coach_reviews
  for each row execute function public.coach_reviews_require_relationship();

-- ===== Guard =====
do $guard$
declare
  v_oid oid;
  v_secdef boolean;
  v_cfg text;
  v_enabled "char";
begin
  select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_oid, v_secdef, v_cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'coach_review_allowed'
    and pg_get_function_identity_arguments(p.oid) = 'p_slug text, p_kind text';
  if v_oid is null then raise exception 'coach_review_allowed(text, text) is missing after this migration'; end if;
  if not v_secdef then raise exception 'coach_review_allowed must be SECURITY DEFINER'; end if;
  if position('pg_temp' in v_cfg) = 0 then raise exception 'coach_review_allowed must pin pg_temp; search_path is %', v_cfg; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then raise exception 'anon must not hold EXECUTE on coach_review_allowed'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then raise exception 'authenticated must hold EXECUTE on coach_review_allowed'; end if;

  select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_oid, v_secdef, v_cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'coach_reviews_require_relationship'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_oid is null then raise exception 'coach_reviews_require_relationship() is missing after this migration'; end if;
  if position('pg_temp' in v_cfg) = 0 then raise exception 'coach_reviews_require_relationship must pin pg_temp; search_path is %', v_cfg; end if;

  select t.tgenabled into v_enabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'coach_reviews' and t.tgname = 'coach_reviews_require_relationship';
  if v_enabled is null then raise exception 'the coach_reviews_require_relationship trigger is missing from public.coach_reviews'; end if;
  if v_enabled = 'D' then raise exception 'the coach_reviews_require_relationship trigger exists but is disabled'; end if;
end
$guard$;

commit;
