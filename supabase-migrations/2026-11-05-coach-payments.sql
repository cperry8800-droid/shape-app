-- Coach payments: what members actually paid each coach, one row a payment (2026-11-05).
--
-- Until now nothing recorded money that was collected. invoice.paid only sent notices and
-- checkout.session.completed only announced the first month, so "This month so far", "Lifetime on
-- Shape" and "earned Nov 1–4" had no source and the demo prorated a run rate. This is that
-- source, written by the Stripe webhook (src/app/api/stripe/webhook/route.ts, through
-- src/lib/coach-payments.mjs) and filled for the past by scripts/backfill-coach-payments.mjs.
--
-- One row per Stripe object, unique on its id:
--   · a coach plan's paid invoice (in_…): its first month (billing 'first'), a renewal ('renewal'),
--     or a mid-period change ('adjustment');
--   · a one-off purchase's checkout session (cs_…): a booking, a meal plan or a program ('one_off');
--   · a refund (re_…) of either, as a NEGATIVE row ('refund'), dated when it was refunded, with
--     refund_of naming the payment it reverses.
-- gross_cents is what the member paid; shape_fee_cents is Shape's application fee (a plan: the
-- subscription's stored fee_bps; a one-off: the PaymentIntent's application_fee_amount);
-- coach_net_cents is the rest. ⚠ coach_net_cents is BEFORE Stripe's own card fees on a direct
-- charge (the coach's own account pays those), and a coach's payout is not the sum of these rows:
-- it can carry their other business on the same Stripe account.
--
-- ⚠ THE $5 MEMBERSHIP IS NOT COACH MONEY and never has a row here: the webhook skips every
-- membership invoice and checkout (platform_subscriptions), and provider_role/provider_id are
-- required.
--
-- Read by the coach whose money it is (the same rule as "providers read own subscriptions"); written
-- only by the service role. A deleted member's rows stay, with client_id cleared, so a coach's
-- lifetime figure doesn't shrink when a former client erases their account.
--
-- Re-runnable: "if not exists" throughout, constraints dropped and re-added, and a guard that
-- checks the result.

begin;

create table if not exists public.coach_payments (
  id uuid primary key default gen_random_uuid(),
  stripe_object_id text not null,
  stripe_object_type text not null,
  stripe_account_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  refund_of text,
  client_id uuid references auth.users (id) on delete set null,
  provider_role text not null,
  provider_id bigint not null,
  kind text not null,
  billing text not null,
  gross_cents integer not null,
  shape_fee_cents integer not null,
  coach_net_cents integer not null,
  fee_bps integer,
  currency text not null default 'usd',
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_payments drop constraint if exists coach_payments_object_type_check;
alter table public.coach_payments add constraint coach_payments_object_type_check
  check (stripe_object_type in ('invoice', 'checkout_session', 'refund'));
alter table public.coach_payments drop constraint if exists coach_payments_provider_role_check;
alter table public.coach_payments add constraint coach_payments_provider_role_check
  check (provider_role in ('trainer', 'nutritionist'));
alter table public.coach_payments drop constraint if exists coach_payments_kind_check;
alter table public.coach_payments add constraint coach_payments_kind_check
  check (kind in ('plan', 'booking', 'meal_plan', 'program'));
alter table public.coach_payments drop constraint if exists coach_payments_billing_check;
alter table public.coach_payments add constraint coach_payments_billing_check
  check (billing in ('first', 'renewal', 'adjustment', 'one_off', 'refund'));
alter table public.coach_payments drop constraint if exists coach_payments_fee_bps_check;
alter table public.coach_payments add constraint coach_payments_fee_bps_check
  check (fee_bps is null or fee_bps between 0 and 10000);
-- The net is always the gross less Shape's fee, so the three can never disagree.
alter table public.coach_payments drop constraint if exists coach_payments_net_check;
alter table public.coach_payments add constraint coach_payments_net_check
  check (coach_net_cents = gross_cents - shape_fee_cents);
-- A payment is positive with a fee no larger than itself; a refund is its negative mirror and names
-- what it reverses.
alter table public.coach_payments drop constraint if exists coach_payments_sign_check;
alter table public.coach_payments add constraint coach_payments_sign_check
  check (
    (billing = 'refund' and stripe_object_type = 'refund' and refund_of is not null
       and gross_cents <= 0 and shape_fee_cents <= 0 and shape_fee_cents >= gross_cents)
    or (billing <> 'refund' and stripe_object_type <> 'refund' and refund_of is null
       and gross_cents >= 0 and shape_fee_cents >= 0 and shape_fee_cents <= gross_cents)
  );

-- One row per Stripe object: the webhook and the backfill both upsert on it.
create unique index if not exists coach_payments_stripe_object_key
  on public.coach_payments (stripe_object_id);
-- A coach's own rows by date (this month, lifetime).
create index if not exists coach_payments_provider_paid_idx
  on public.coach_payments (provider_role, provider_id, paid_at);
-- A refund finds its payment by the PaymentIntent.
create index if not exists coach_payments_payment_intent_idx
  on public.coach_payments (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists coach_payments_client_idx
  on public.coach_payments (client_id) where client_id is not null;

create or replace function public.coach_payments_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coach_payments_touch on public.coach_payments;
create trigger coach_payments_touch
  before update on public.coach_payments
  for each row execute function public.coach_payments_touch();

alter table public.coach_payments enable row level security;
revoke all on public.coach_payments from anon, authenticated;
grant select on public.coach_payments to authenticated;

drop policy if exists "providers read own payments" on public.coach_payments;
create policy "providers read own payments"
  on public.coach_payments for select
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = coach_payments.provider_id
        and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = coach_payments.provider_id
        and n.owner_id = auth.uid()
    ))
  );

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if not exists (select 1 from pg_class where oid = 'public.coach_payments'::regclass and relrowsecurity) then
    raise exception 'coach_payments must have row level security on';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_payments'
      and policyname = 'providers read own payments' and cmd = 'SELECT'
  ) then
    raise exception 'coach_payments is missing its coach read policy';
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_payments' and cmd <> 'SELECT'
  ) then
    raise exception 'coach_payments takes no write policy: the service role writes it';
  end if;
  if has_table_privilege('anon', 'public.coach_payments', 'select')
     or has_table_privilege('authenticated', 'public.coach_payments', 'insert')
     or has_table_privilege('authenticated', 'public.coach_payments', 'update')
     or has_table_privilege('authenticated', 'public.coach_payments', 'delete') then
    raise exception 'coach_payments is open to the API beyond the coach read';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and tablename = 'coach_payments'
      and indexname = 'coach_payments_stripe_object_key' and indexdef ilike '%unique%'
  ) then
    raise exception 'coach_payments.stripe_object_id is not unique';
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.coach_payments'::regclass
      and conname = 'coach_payments_net_check'
  ) then
    raise exception 'coach_payments_net_check is missing';
  end if;
end
$guard$;

commit;
