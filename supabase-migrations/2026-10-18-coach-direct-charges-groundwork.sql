-- Coach payments move onto the coaches' own Stripe accounts (owner, 2026-10-18: "shape is not
-- paying processing fee"). Coach charges are destination charges today: they are made on Shape's
-- platform account, and Stripe bills its processing fee to Shape. They move to DIRECT charges on
-- each coach's Standard connected account, where Stripe takes its fee and Shape takes only its
-- application fee (15% on a client who found the coach on Shape, 0% on one the coach brought).
--
-- This is the groundwork, with NO change to how anything is charged: it is safe to run while every
-- checkout still makes a destination charge.
--
--   1. subscriptions.stripe_account_id and one_time_purchases.stripe_account_id: the connected
--      account a money row lives on. null is Shape's platform account: every row made before this,
--      and every destination charge still being made. The webhook stamps it from a Connect event's
--      account, and from then on every refund, cancel and read of that row is made on that
--      account. ⚠ FROZEN ONCE WRITTEN, as origin/fee_bps are: a row moved to another account (or
--      off it) would send its cancel to an account that has never heard of it, which answers "no
--      such subscription", which reads as cancelled.
--   2. stripe_connected_customers: the member's Stripe customer on each coach's account (a
--      direct charge needs a customer on the account it is made on). The service role only.
--   3. stripe_account_portal: the billing-portal configuration made on each coach's account. The
--      service role only.
--   4. 'disconnected' in trainers/nutritionists.stripe_account_status: the webhook sets it when a
--      coach disconnects their account from Shape (account.application.deauthorized).
--
-- Re-runnable: "if not exists", "create or replace", a dropped-and-recreated check, and a guard
-- that checks the result.

begin;

-- ── 1) Which account a money row lives on ─────────────────────────────────────────────────────
alter table public.subscriptions add column if not exists stripe_account_id text;
alter table public.one_time_purchases add column if not exists stripe_account_id text;

-- The rows on one coach's account (a disconnection, the renewals list). Legacy rows are null and
-- are never looked up this way, so they stay out of the index.
create index if not exists subscriptions_stripe_account_id_idx
  on public.subscriptions (stripe_account_id) where stripe_account_id is not null;
create index if not exists one_time_purchases_stripe_account_id_idx
  on public.one_time_purchases (stripe_account_id) where stripe_account_id is not null;

-- Write-once, as freeze_origin_fee_bps keeps origin/fee_bps: the first write (the webhook's
-- INSERT) sets it, and every UPDATE after, a replayed delivery's upsert included, keeps it.
create or replace function public.freeze_stripe_account_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.stripe_account_id := old.stripe_account_id;
  return new;
end;
$$;

drop trigger if exists subscriptions_freeze_stripe_account_id on public.subscriptions;
create trigger subscriptions_freeze_stripe_account_id
  before update on public.subscriptions
  for each row execute function public.freeze_stripe_account_id();

drop trigger if exists one_time_purchases_freeze_stripe_account_id on public.one_time_purchases;
create trigger one_time_purchases_freeze_stripe_account_id
  before update on public.one_time_purchases
  for each row execute function public.freeze_stripe_account_id();

-- ── 2) A member's customer on each coach's account ────────────────────────────────────────────
-- Never the member's platform customer (profiles.stripe_customer_id): a customer is an object on
-- one Stripe account, and the two are never mixed. Goes with the account (auth user) it names.
create table if not exists public.stripe_connected_customers (
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_account_id text not null,
  customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, stripe_account_id)
);

alter table public.stripe_connected_customers enable row level security;
revoke all on public.stripe_connected_customers from anon, authenticated;

-- ── 3) The billing-portal configuration on each coach's account ───────────────────────────────
create table if not exists public.stripe_account_portal (
  stripe_account_id text primary key,
  configuration_id text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_account_portal enable row level security;
revoke all on public.stripe_account_portal from anon, authenticated;

-- ── 4) A disconnected account ─────────────────────────────────────────────────────────────────
-- The check was written inline in 2026-04-17-stripe-connect-and-purchases.sql, so Postgres named
-- it <table>_stripe_account_status_check (read live, 2026-10-18).
alter table public.trainers drop constraint if exists trainers_stripe_account_status_check;
alter table public.trainers add constraint trainers_stripe_account_status_check
  check (stripe_account_status in ('pending', 'active', 'restricted', 'rejected', 'disconnected'));

alter table public.nutritionists drop constraint if exists nutritionists_stripe_account_status_check;
alter table public.nutritionists add constraint nutritionists_stripe_account_status_check
  check (stripe_account_status in ('pending', 'active', 'restricted', 'rejected', 'disconnected'));

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
declare
  t text;
begin
  foreach t in array array['subscriptions', 'one_time_purchases'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'stripe_account_id' and data_type = 'text'
    ) then
      raise exception '%.stripe_account_id (text) is missing', t;
    end if;
    if not exists (
      select 1 from pg_trigger g
      join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = ('public.' || t)::regclass and not g.tgisinternal
        and g.tgname = t || '_freeze_stripe_account_id' and p.proname = 'freeze_stripe_account_id'
        and g.tgenabled <> 'D'
    ) then
      raise exception '% does not freeze stripe_account_id', t;
    end if;
    if not exists (
      select 1 from pg_indexes where schemaname = 'public' and tablename = t and indexname = t || '_stripe_account_id_idx'
    ) then
      raise exception '%.stripe_account_id is not indexed', t;
    end if;
  end loop;

  foreach t in array array['stripe_connected_customers', 'stripe_account_portal'] loop
    if not exists (select 1 from pg_class where oid = ('public.' || t)::regclass and relrowsecurity) then
      raise exception '% must have row level security on', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception '% takes no policies: the service role only', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'update')
       or has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception '% is open to the API', t;
    end if;
  end loop;

  foreach t in array array['trainers', 'nutritionists'] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || t)::regclass and conname = t || '_stripe_account_status_check'
        and pg_get_constraintdef(oid) like '%''disconnected''%'
        and pg_get_constraintdef(oid) like '%''active''%'
    ) then
      raise exception '%.stripe_account_status does not allow disconnected', t;
    end if;
  end loop;
end
$guard$;

commit;
