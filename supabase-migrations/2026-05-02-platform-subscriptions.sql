-- Platform subscriptions for the Shape-wide membership checkout.
--
-- Provider subscriptions live in public.subscriptions and require
-- provider_id/provider_role. The platform $5/mo plan has no provider, so it
-- needs its own table for Stripe webhook sync.
--
-- Idempotent, safe to re-run.

create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'pending'
    check (status in ('pending','active','past_due','canceled','incomplete','trialing','unpaid')),
  price_cents int,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_subscriptions_client_idx
  on public.platform_subscriptions (client_id, status);

create or replace function public.platform_subscriptions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists platform_subscriptions_touch_updated_at on public.platform_subscriptions;
create trigger platform_subscriptions_touch_updated_at
  before update on public.platform_subscriptions
  for each row execute function public.platform_subscriptions_set_updated_at();

alter table public.platform_subscriptions enable row level security;

drop policy if exists "clients read own platform subscriptions" on public.platform_subscriptions;
create policy "clients read own platform subscriptions"
  on public.platform_subscriptions for select
  to authenticated
  using (auth.uid() = client_id);
