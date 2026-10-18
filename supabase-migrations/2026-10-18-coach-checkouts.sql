-- Coach direct charges, part B: every checkout Shape opens on a coach's own Stripe account is
-- written down here before its address is handed out.
--
-- ⚠ WHY A RECORD AND NOT THE CHECKOUT'S METADATA. A direct charge lives on the coach's Standard
-- account, which is the coach's own Stripe account: they can make a checkout there with any
-- metadata, and edit the metadata of the ones Shape made. So on a coach's account the webhook
-- believes only this table for what a checkout is (who bought, from which coach, what, at which
-- Shape rate, against which store-credit reservation), and Stripe's own objects for what was paid.
--   · A checkout on a coach's account that is not here was not made by Shape: nothing is recorded
--     for it (the webhook's origin guard). It also proves the checkout is Shape's if a Checkout-made
--     PaymentIntent or Subscription turns out to carry no `application`.
--   · store_credit_ref binds a store-credit reservation to its one checkout. An expired checkout on
--     a coach's account releases only the reservation recorded against it, never one its metadata
--     names (Codex on #2401).
--
-- The service role only: the checkout routes write it and the webhook and return pages read it.
-- Re-runnable: "if not exists" throughout, and a guard that checks the result.

begin;

create table if not exists public.coach_checkouts (
  stripe_checkout_session_id text primary key,
  stripe_account_id text not null,
  client_id uuid not null references auth.users (id) on delete cascade,
  provider_role text not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id bigint not null,
  mode text not null check (mode in ('payment', 'subscription')),
  kind text not null check (kind in ('subscription', 'booking', 'meal_plan', 'program')),
  plan_id text,
  workout_id text,
  item_name text,
  origin text not null,
  fee_bps integer not null check (fee_bps between 0 and 10000),
  referral_id text,
  list_cents integer not null check (list_cents >= 0),
  charge_cents integer not null check (charge_cents >= 0),
  application_fee_cents integer check (application_fee_cents >= 0),
  store_credit_kind text check (store_credit_kind in ('session', 'nutrition')),
  store_credit_cents integer not null default 0 check (store_credit_cents >= 0),
  store_credit_ref text,
  code text,
  code_source text check (code_source in ('shape', 'coach')),
  created_at timestamptz not null default now()
);

-- An expired checkout's credit is found by its reservation, and one reservation backs one checkout.
create unique index if not exists coach_checkouts_store_credit_ref_key
  on public.coach_checkouts (store_credit_ref) where store_credit_ref is not null;

alter table public.coach_checkouts enable row level security;
revoke all on public.coach_checkouts from anon, authenticated;

do $guard$
begin
  if not exists (select 1 from pg_class where oid = 'public.coach_checkouts'::regclass and relrowsecurity) then
    raise exception 'coach_checkouts must have row level security on';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_checkouts') then
    raise exception 'coach_checkouts takes no policies: the service role only';
  end if;
  if has_table_privilege('anon', 'public.coach_checkouts', 'select')
     or has_table_privilege('authenticated', 'public.coach_checkouts', 'select')
     or has_table_privilege('authenticated', 'public.coach_checkouts', 'insert')
     or has_table_privilege('authenticated', 'public.coach_checkouts', 'update')
     or has_table_privilege('authenticated', 'public.coach_checkouts', 'delete') then
    raise exception 'coach_checkouts is open to the API';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and tablename = 'coach_checkouts'
      and indexname = 'coach_checkouts_store_credit_ref_key'
  ) then
    raise exception 'coach_checkouts.store_credit_ref is not unique';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coach_checkouts' and column_name = 'stripe_account_id' and is_nullable = 'NO'
  ) then
    raise exception 'coach_checkouts.stripe_account_id must be not null';
  end if;
end
$guard$;

commit;
