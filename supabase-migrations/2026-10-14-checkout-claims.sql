-- One checkout being created per account and product at a time (client-onboarding review, fix 1;
-- Codex on #2353).
--
-- Two Join or Subscribe presses arriving together each passed the "already paying?" check and
-- each opened a checkout the buyer could pay, so a member could be charged twice. A Stripe
-- idempotency key per 10-minute window covered most of it, but two requests straddling a window
-- boundary got different keys. This is the atomic part: before a checkout is looked for or
-- created, the request claims (account, product). A second request finds the claim held, waits
-- for the first to finish, and then finds its checkout open and is handed it
-- (src/lib/checkout-barrier.ts).
--
-- A claim is held only while a checkout is being created: released when the request ends, and
-- taken over after 60 seconds if a request died holding it. ⚠ A request that ran past 60 seconds
-- may have lost its claim to another while it was still working (Codex on #2353), so right
-- before it creates the checkout it renews the claim, and creates nothing unless the claim is
-- still its own (renew_checkout_claim). The create is then bounded well inside the 60 seconds.
-- Re-run 2026-10-14 to add renew_checkout_claim; everything else is unchanged.
--
-- ⚠ THE SERVICE ROLE ONLY. The table has RLS on and no policies; the three functions are
-- invoker functions revoked from anon and authenticated by name (Supabase grants them directly).
--
-- Re-runnable: "if not exists", "create or replace", and a guard that checks the result.

begin;

create table if not exists public.checkout_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  token uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, product)
);

alter table public.checkout_claims enable row level security;
revoke all on public.checkout_claims from anon, authenticated;

-- True when this request now holds the claim; null when another request holds a live one.
-- Two concurrent inserts on one key serialise on the primary key, so exactly one wins.
create or replace function public.claim_checkout(p_user_id uuid, p_product text, p_token uuid)
returns boolean
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  insert into public.checkout_claims as c (user_id, product, token, claimed_at)
  values (p_user_id, p_product, p_token, now())
  on conflict (user_id, product) do update
    set token = excluded.token, claimed_at = excluded.claimed_at
    where c.claimed_at < now() - interval '60 seconds'
  returning true;
$$;

-- Releases only the caller's own claim, so a request that outlived its 60 seconds never
-- releases the claim another request has since taken.
create or replace function public.release_checkout(p_user_id uuid, p_product text, p_token uuid)
returns void
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  delete from public.checkout_claims
  where user_id = p_user_id and product = p_product and token = p_token;
$$;

-- True when the claim is still the caller's, and renewed; null when another request has taken
-- it over (the caller then creates nothing).
create or replace function public.renew_checkout_claim(p_user_id uuid, p_product text, p_token uuid)
returns boolean
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  update public.checkout_claims
  set claimed_at = now()
  where user_id = p_user_id and product = p_product and token = p_token
  returning true;
$$;

revoke all on function public.claim_checkout(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_checkout(uuid, text, uuid) to service_role;
revoke all on function public.release_checkout(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.release_checkout(uuid, text, uuid) to service_role;
revoke all on function public.renew_checkout_claim(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.renew_checkout_claim(uuid, text, uuid) to service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if not exists (select 1 from pg_class where oid = 'public.checkout_claims'::regclass and relrowsecurity) then
    raise exception 'checkout_claims must have row level security on';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'checkout_claims') then
    raise exception 'checkout_claims takes no policies: the service role only';
  end if;
  if has_table_privilege('anon', 'public.checkout_claims', 'select')
     or has_table_privilege('authenticated', 'public.checkout_claims', 'select')
     or has_table_privilege('authenticated', 'public.checkout_claims', 'insert')
     or has_table_privilege('authenticated', 'public.checkout_claims', 'delete') then
    raise exception 'checkout_claims is open to the API';
  end if;
  if exists (
    select 1 from unnest(array[
      'public.claim_checkout(uuid, text, uuid)',
      'public.release_checkout(uuid, text, uuid)',
      'public.renew_checkout_claim(uuid, text, uuid)'
    ]) f(sig)
    where has_function_privilege('anon', f.sig, 'execute') or has_function_privilege('authenticated', f.sig, 'execute')
       or not has_function_privilege('service_role', f.sig, 'execute')
  ) then
    raise exception 'claim_checkout, release_checkout and renew_checkout_claim must be executable by the service role only';
  end if;
end
$guard$;

commit;
