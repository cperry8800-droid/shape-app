-- The marketplace Verified badge comes off in the same write that unreviews the credential.
--
-- The badge (trainers.verified / nutritionists.verified) mirrors an approved credential review
-- (provider_credentials.review_status = 'approved'). Until now the code took it off after the fact:
-- the coach's credential routes made a second, service-role write once the coach's own write had
-- landed, and that write updated the two listing tables one after the other. CodeRabbit raised
-- both halves on #2315:
--   · a user's own action was finished by a service-role write, outside RLS;
--   · the two tables were cleared separately, so a failure between them left one listing Verified.
-- A third gap followed from the first: a coach's direct write to their own credential row (the
-- prov_cred_own policy allows it) sent the row back to 'pending' and left the badge up, because
-- only the routes took it off.
--
-- Now:
--   · clear_listing_verified(owner) clears both tables in one statement and returns how many
--     listings changed. Service role only; the expiry cron calls it.
--   · provider_credentials_zz_unverify_listings, an AFTER trigger, calls it whenever a credential
--     row is written and is not 'approved', or is deleted. A coach's edit (which the review guard
--     sends back to 'pending'), an admin's rejection or request for changes, and the cron's move
--     all take the badge off in the same transaction as the credential write: both happen or
--     neither does. Approval (review_status 'approved') leaves the badge for the admin action to
--     set.
--
-- The trigger function is SECURITY DEFINER because the coach's own write has to clear columns
-- the listing guard (guard_provider_admin_columns) keeps out of a coach's reach. It takes no
-- argument from the caller: the owner is the credential row's own, which RLS has already held to
-- auth.uid() for a coach's write. It only ever sets verified = false. Pinned, and executable by
-- nobody but its owner (a trigger function cannot be called as an RPC anyway).
--
-- Safe to re-run. Run it BEFORE the code that stops clearing the badge itself is deployed;
-- production held 0 credential rows and 0 Verified coach listings when this was written.

begin;

-- ── 1 · one statement over both listing tables ───────────────────────────────────────────
create or replace function public.clear_listing_verified(p_owner uuid)
returns integer
language sql
set search_path to 'public', 'pg_temp'
as $$
  with t as (
    update public.trainers set verified = false, verified_at = null
    where owner_id = p_owner and verified
    returning 1
  ), n as (
    update public.nutritionists set verified = false, verified_at = null
    where owner_id = p_owner and verified
    returning 1
  )
  select ((select count(*) from t) + (select count(*) from n))::integer;
$$;

comment on function public.clear_listing_verified(uuid) is
  'Takes the Verified badge off every listing p_owner holds, both tables in one statement; returns how many changed. Service role only.';

revoke all on function public.clear_listing_verified(uuid) from public, anon, authenticated;
grant execute on function public.clear_listing_verified(uuid) to service_role;

-- ── 2 · a credential that is not approved takes the badge with it ─────────────────────────
create or replace function public.provider_credentials_unverify_listings()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.clear_listing_verified(old.owner_id);
  elsif new.review_status is distinct from 'approved' then
    perform public.clear_listing_verified(new.owner_id);
  end if;
  return null;
end;
$$;

revoke all on function public.provider_credentials_unverify_listings() from public, anon, authenticated;

drop trigger if exists provider_credentials_zz_unverify_listings on public.provider_credentials;
create trigger provider_credentials_zz_unverify_listings
  after insert or update or delete on public.provider_credentials
  for each row execute function public.provider_credentials_unverify_listings();

-- ── 3 · guard ──────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.provider_credentials'::regclass
      and t.tgname = 'provider_credentials_zz_unverify_listings'
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception 'provider_credentials_zz_unverify_listings is missing or disabled';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'public.provider_credentials_unverify_listings()'::regprocedure and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
  ) then
    raise exception 'provider_credentials_unverify_listings is not a pinned SECURITY DEFINER';
  end if;
  if exists (
    select 1 from pg_proc
    where oid = 'public.clear_listing_verified(uuid)'::regprocedure
      and (prosecdef or not coalesce(proconfig, '{}') @> array['search_path=public, pg_temp'])
  ) then
    raise exception 'clear_listing_verified must run as its caller, pinned';
  end if;

  if has_function_privilege('anon', 'public.clear_listing_verified(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.clear_listing_verified(uuid)', 'execute')
     or has_function_privilege('anon', 'public.provider_credentials_unverify_listings()', 'execute')
     or has_function_privilege('authenticated', 'public.provider_credentials_unverify_listings()', 'execute') then
    raise exception 'a badge function is executable by anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.clear_listing_verified(uuid)', 'execute') then
    raise exception 'the service role cannot call clear_listing_verified, so the expiry cron would fail';
  end if;
end;
$$;

commit;
