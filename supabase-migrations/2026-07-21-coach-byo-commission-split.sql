-- Coach BYO commission split — client-origin attribution + differential fees.
--
-- Shape's 15% commission applies only to clients Shape delivered. Clients a
-- coach brings (via an in-app invite DM or a ref-tagged share link) pay the
-- coach's price with 0% Shape commission. Every client is still a $5/mo Shape
-- member either way — this migration concerns ONLY the coach commission
-- (subscriptions + one_time_purchases), never platform_subscriptions.
--
-- Spec: docs/superpowers/specs/2026-07-21-coach-byo-commission-split-design.md
-- Idempotent, safe to re-run.

-- ── 1) coach_referrals — the origin ledger ───────────────────────────────────
-- Two ENFORCED row shapes (referral_row_shape): a DURABLE link-token row (one
-- per provider, never expires) and CLIENT-BOUND rows (one per coach↔client pair,
-- carrying the 30-day window from the client's last touch). No column defaults on
-- token/expires_at — the RPCs set every field explicitly, so a client-bound row
-- can't silently receive a bindable share token and the durable row can't expire.
create table if not exists public.coach_referrals (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id uuid references auth.users(id) on delete cascade,  -- null ONLY on the durable link-token row
  token uuid unique,             -- the ?ref= value — set ONLY on the durable link-token row
  channel text not null check (channel in ('dm','link')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint referral_row_shape check (
    (client_id is null     and token is not null and expires_at is null and channel = 'link') or
    (client_id is not null and token is null     and expires_at is not null)
  ),
  consumed_at timestamptz,
  consumed_kind text check (consumed_kind in ('subscription','purchase')),
  -- Consumption is all-or-nothing and only ever on a CLIENT-BOUND row: both
  -- fields move together, and a durable link-token row can never be consumed.
  constraint consumption_consistent check (
    (consumed_at is null and consumed_kind is null)
    or (consumed_at is not null and consumed_kind is not null and client_id is not null)
  )
);

-- ONE durable link-token row per provider…
create unique index if not exists coach_referrals_link_token_uq
  on public.coach_referrals (provider_role, provider_id) where client_id is null;
-- …and ONE client-bound row per coach↔client pair — the LAST touch wins (both
-- RPCs upsert this same row, atomically refreshing channel + expires_at).
create unique index if not exists coach_referrals_bound_uq
  on public.coach_referrals (coach_user_id, provider_role, provider_id, client_id)
  where client_id is not null;
-- Checkout-hot-path lookup: resolveCoachCheckoutOrigin reads the bound row by
-- (client_id, provider_role, provider_id) on EVERY coach-sale checkout —
-- bound_uq leads with coach_user_id so it can't serve that query.
create index if not exists coach_referrals_client_lookup_idx
  on public.coach_referrals (client_id, provider_role, provider_id)
  where client_id is not null;

alter table public.coach_referrals enable row level security;

-- Coaches read their own referral rows (backs the Business-page origin labels).
-- No client read (a client never needs to see the ledger); no INSERT/UPDATE/DELETE
-- policies — writes are RPC-only (SECURITY DEFINER), and the webhook consumes via
-- the service role (which bypasses RLS). Rows expire; they don't mutate.
drop policy if exists "coach reads own referrals" on public.coach_referrals;
create policy "coach reads own referrals" on public.coach_referrals
  for select
  to authenticated
  using (coach_user_id = auth.uid());

-- ── 2) origin + fee_bps on the coach money rows ──────────────────────────────
-- origin says WHY; fee_bps says WHAT (the RESOLVED rate in basis points, stamped
-- at checkout). The BYO rate may change for NEW links, so origin alone can't
-- reconstruct what an older row actually pays — roster labels, analytics, refunds
-- and support read the stored fee_bps, never re-derive it. Pre-feature rows
-- default marketplace / 1500, which is correct (every pre-feature row charged 15%).
alter table public.subscriptions
  add column if not exists origin text not null default 'marketplace'
    check (origin in ('marketplace','coach_invite','coach_link')),
  add column if not exists fee_bps integer not null default 1500
    check (fee_bps between 0 and 10000);

alter table public.one_time_purchases
  add column if not exists origin text not null default 'marketplace'
    check (origin in ('marketplace','coach_invite','coach_link')),
  add column if not exists fee_bps integer not null default 1500
    check (fee_bps between 0 and 10000);

-- Write-once enforcement (belt-and-braces): "immutable" must be enforced, not
-- declared. A BEFORE UPDATE trigger preserves OLD.origin / OLD.fee_bps on EVERY
-- update — so a replayed/late Stripe delivery, or any other writer (status/period
-- syncs, refunds, disputes), can never rewrite historical attribution or the rate.
-- The first write (the webhook INSERT) sets them; nothing after can change them.
create or replace function public.freeze_origin_fee_bps()
returns trigger
language plpgsql
as $$
begin
  new.origin := old.origin;
  new.fee_bps := old.fee_bps;
  return new;
end;
$$;

drop trigger if exists subscriptions_freeze_origin_fee_bps on public.subscriptions;
create trigger subscriptions_freeze_origin_fee_bps
  before update on public.subscriptions
  for each row execute function public.freeze_origin_fee_bps();

drop trigger if exists one_time_purchases_freeze_origin_fee_bps on public.one_time_purchases;
create trigger one_time_purchases_freeze_origin_fee_bps
  before update on public.one_time_purchases
  for each row execute function public.freeze_origin_fee_bps();

-- ── 3) RPCs — writes are RPC-only, house DEFINER hardening ───────────────────
-- The #1459 grant lesson: revoke from public + anon, grant only to authenticated.
-- Every function sets search_path and validates auth.uid() ownership in-body.

-- create_coach_referral: the add-client sheet calls this alongside the invite DM.
-- Validates the caller OWNS the provider row and isn't self-referring, then upserts
-- the client-bound row (channel 'dm', token NULL, fresh 30-day expiry) — re-inviting
-- REFRESHES the window instead of stacking rows.
create or replace function public.create_coach_referral(
  p_provider_role text,
  p_provider_id bigint,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owns boolean := false;
  v_id uuid;
begin
  if p_provider_role not in ('trainer','nutritionist') then
    raise exception 'invalid provider role' using errcode = '22023';
  end if;
  if p_client_id is null or p_client_id = auth.uid() then
    raise exception 'invalid referral target' using errcode = '22023';  -- no self-referral
  end if;

  if p_provider_role = 'trainer' then
    select exists(select 1 from public.trainers t where t.id = p_provider_id and t.owner_id = auth.uid()) into v_owns;
  else
    select exists(select 1 from public.nutritionists n where n.id = p_provider_id and n.owner_id = auth.uid()) into v_owns;
  end if;
  if not v_owns then
    raise exception 'not your provider row' using errcode = '42501';
  end if;

  insert into public.coach_referrals (coach_user_id, provider_role, provider_id, client_id, channel, token, expires_at)
  values (auth.uid(), p_provider_role, p_provider_id, p_client_id, 'dm', null, now() + interval '30 days')
  on conflict (coach_user_id, provider_role, provider_id, client_id) where client_id is not null
  do update set channel = 'dm', token = null, expires_at = excluded.expires_at
  returning id into v_id;

  return v_id;
end;
$$;

-- create_coach_referral_link: returns the coach's DURABLE link token (one per
-- provider row, reused, never expires). The share link in a bio/text/email never
-- goes stale; only client windows do.
create or replace function public.create_coach_referral_link(
  p_provider_role text,
  p_provider_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owns boolean := false;
  v_token uuid;
begin
  if p_provider_role not in ('trainer','nutritionist') then
    raise exception 'invalid provider role' using errcode = '22023';
  end if;

  if p_provider_role = 'trainer' then
    select exists(select 1 from public.trainers t where t.id = p_provider_id and t.owner_id = auth.uid()) into v_owns;
  else
    select exists(select 1 from public.nutritionists n where n.id = p_provider_id and n.owner_id = auth.uid()) into v_owns;
  end if;
  if not v_owns then
    raise exception 'not your provider row' using errcode = '42501';
  end if;

  insert into public.coach_referrals (coach_user_id, provider_role, provider_id, client_id, channel, token, expires_at)
  values (auth.uid(), p_provider_role, p_provider_id, null, 'link', gen_random_uuid(), null)
  on conflict (provider_role, provider_id) where client_id is null
  do update set coach_user_id = excluded.coach_user_id  -- no-op keeper so RETURNING yields the existing token
  returning token into v_token;

  return v_token;
end;
$$;

-- bind_coach_referral: called by a SIGNED-IN member. Validates the token, then
-- upserts the SAME client-bound row (channel 'link', fresh 30-day expiry) for
-- auth.uid(). This is the touch that starts (or refreshes) the clock. Returns the
-- provider it bound to (empty on an invalid token or a coach binding their own link).
create or replace function public.bind_coach_referral(p_token uuid)
returns table (provider_role text, provider_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coach uuid;
  v_role text;
  v_pid bigint;
begin
  if p_token is null or auth.uid() is null then
    return;
  end if;

  select r.coach_user_id, r.provider_role, r.provider_id
    into v_coach, v_role, v_pid
  from public.coach_referrals r
  where r.token = p_token and r.client_id is null;
  if not found then
    return;  -- invalid / unknown token — silently ignored
  end if;
  if v_coach = auth.uid() then
    return;  -- a coach opening their own link is not a referral
  end if;

  insert into public.coach_referrals (coach_user_id, provider_role, provider_id, client_id, channel, token, expires_at)
  values (v_coach, v_role, v_pid, auth.uid(), 'link', null, now() + interval '30 days')
  on conflict (coach_user_id, provider_role, provider_id, client_id) where client_id is not null
  do update set channel = 'link', token = null, expires_at = excluded.expires_at;

  return query select v_role, v_pid;
end;
$$;

revoke all on function public.create_coach_referral(text, bigint, uuid) from public, anon;
revoke all on function public.create_coach_referral_link(text, bigint) from public, anon;
revoke all on function public.bind_coach_referral(uuid) from public, anon;
grant execute on function public.create_coach_referral(text, bigint, uuid) to authenticated;
grant execute on function public.create_coach_referral_link(text, bigint) to authenticated;
grant execute on function public.bind_coach_referral(uuid) to authenticated;
