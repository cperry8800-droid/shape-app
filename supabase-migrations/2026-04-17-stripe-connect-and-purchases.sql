-- Stripe Connect (Standard) for trainer/nutritionist payouts, one-time
-- purchases (bookings / meal plans), and refund requests.
--
-- Shape takes a 15% application fee on every charge. Funds settle directly
-- into the provider's connected Stripe account; Shape's cut is withheld
-- automatically via Stripe's application_fee_amount / application_fee_percent.
--
-- Idempotent, safe to re-run.

-- 1) Connect account + per-item price columns on trainers / nutritionists -
alter table public.trainers
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text
    check (stripe_account_status in ('pending','active','restricted','rejected'))
    default 'pending',
  add column if not exists session_price numeric(10,2);

alter table public.nutritionists
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text
    check (stripe_account_status in ('pending','active','restricted','rejected'))
    default 'pending',
  add column if not exists meal_plan_price numeric(10,2);

create unique index if not exists trainers_stripe_account_id_idx
  on public.trainers(stripe_account_id) where stripe_account_id is not null;
create unique index if not exists nutritionists_stripe_account_id_idx
  on public.nutritionists(stripe_account_id) where stripe_account_id is not null;

-- 2) One-time purchases ----------------------------------------------------
-- Bookings (single session with a trainer) and meal plans (one-off plan from
-- a nutritionist). Trainers / nutritionists set the price; Shape takes 15%.
create table if not exists public.one_time_purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references auth.users on delete cascade,
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  kind text not null check (kind in ('booking','meal_plan')),
  price_cents integer not null check (price_cents > 0),
  application_fee_cents integer,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  status text not null default 'pending'
    check (status in ('pending','paid','refunded','failed','disputed'))
);

create index if not exists one_time_purchases_client_id_idx
  on public.one_time_purchases(client_id);
create index if not exists one_time_purchases_provider_idx
  on public.one_time_purchases(provider_role, provider_id);

alter table public.one_time_purchases enable row level security;

drop policy if exists "clients read own purchases" on public.one_time_purchases;
create policy "clients read own purchases" on public.one_time_purchases
  for select using (auth.uid() = client_id);

-- 3) Refund requests -------------------------------------------------------
-- A user-facing "Request refund" button on the subscriptions / purchases
-- page inserts a row here. Admin approves via the Stripe dashboard; the
-- charge.refunded webhook flips status to 'refunded'.
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references auth.users on delete cascade,
  subscription_id uuid references public.subscriptions on delete set null,
  one_time_purchase_id uuid references public.one_time_purchases on delete set null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','denied','refunded')),
  processed_at timestamptz,
  admin_notes text,
  constraint refund_requests_target_check
    check ((subscription_id is not null) <> (one_time_purchase_id is not null))
);

create index if not exists refund_requests_client_id_idx
  on public.refund_requests(client_id);
create index if not exists refund_requests_status_idx
  on public.refund_requests(status);

alter table public.refund_requests enable row level security;

drop policy if exists "clients read own refund requests" on public.refund_requests;
create policy "clients read own refund requests" on public.refund_requests
  for select using (auth.uid() = client_id);

drop policy if exists "clients create own refund requests" on public.refund_requests;
create policy "clients create own refund requests" on public.refund_requests
  for insert with check (auth.uid() = client_id);
