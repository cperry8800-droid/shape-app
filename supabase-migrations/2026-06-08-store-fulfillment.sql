-- Fulfillment layer for Shape Store redemptions — makes a redeemed item DO
-- something:
--   • merch   → ships: we capture a shipping address on the redemption, ops is
--               emailed, an admin marks it fulfilled.
--   • credit  → a dollar wallet (store_credits) that AUTO-APPLIES at coach
--               checkout (session credit → trainer booking, nutrition credit →
--               meal plan), debited only on a completed purchase.
--   • service → recorded; the member + coach follow up (email).
-- Emails are sent from the API route (Resend); this migration is the data layer.

-- 1. Carry fulfillment metadata on each redemption.
alter table public.store_redemptions
  add column if not exists kind text,
  add column if not exists ship_to jsonb,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfillment_note text;

-- 2. Store-credit wallet (dollar value in cents; + issued, − consumed).
create table if not exists public.store_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('session','nutrition')),
  cents integer not null,
  source text,                 -- 'redemption' | 'checkout'
  ref text,                    -- redemption id or checkout session id
  note text,
  created_at timestamptz not null default now()
);
create index if not exists store_credits_user_kind_idx
  on public.store_credits (user_id, kind, created_at desc);
-- One consumption per checkout session (idempotent webhook).
create unique index if not exists store_credits_checkout_dedupe_idx
  on public.store_credits (ref) where source = 'checkout';

alter table public.store_credits enable row level security;
drop policy if exists "store_credits readable by owner" on public.store_credits;
create policy "store_credits readable by owner" on public.store_credits
  for select using (auth.uid() = user_id);

-- 3. Wallet balance readers (per kind).
create or replace function public.get_store_credit_for(p_user_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'session',   coalesce(sum(cents) filter (where kind = 'session'),   0)::int,
    'nutrition', coalesce(sum(cents) filter (where kind = 'nutrition'), 0)::int
  )
  from public.store_credits
  where user_id = p_user_id;
$$;
grant execute on function public.get_store_credit_for(uuid) to authenticated, service_role;

create or replace function public.get_my_store_credit()
returns jsonb language sql security definer set search_path = public as $$
  select public.get_store_credit_for(auth.uid());
$$;
grant execute on function public.get_my_store_credit() to authenticated;

-- 4. Redeem with fulfillment metadata (replaces the prior 3-arg version).
--    Atomically: balance check → negative score-ledger row → redemption row,
--    plus (credit) a positive store_credits row and (merch) the ship-to address.
drop function if exists public.redeem_store_item(text, text, integer);
create or replace function public.redeem_store_item(
  p_item_id text,
  p_item_name text,
  p_cost integer,
  p_kind text default null,
  p_credit_cents integer default 0,
  p_credit_kind text default null,
  p_ship_to jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_code text;
  v_redemption_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'invalid_cost' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('shape_store_redeem:' || v_uid::text));

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.score_ledger
  where user_id = v_uid;

  if v_balance < p_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  v_redemption_id := gen_random_uuid();
  v_code := upper(
    regexp_replace(coalesce(nullif(split_part(p_item_id, '_', 1), ''), 'SHAPE'), '[^a-zA-Z0-9]', '', 'g')
  );
  v_code := left(v_code, 6) || '-' || upper(substr(replace(v_redemption_id::text, '-', ''), 1, 8));

  insert into public.store_redemptions
    (id, user_id, item_id, item_name, cost_points, code, kind, ship_to)
  values
    (v_redemption_id, v_uid, p_item_id, p_item_name, p_cost, v_code, p_kind, p_ship_to);

  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
  values (v_uid, 'other', 'store_redeem', v_redemption_id, -p_cost, 'Shape Store · ' || p_item_name);

  if p_credit_cents is not null and p_credit_cents > 0
     and p_credit_kind in ('session', 'nutrition') then
    insert into public.store_credits (user_id, kind, cents, source, ref, note)
    values (v_uid, p_credit_kind, p_credit_cents, 'redemption', v_redemption_id::text, p_item_name);
  end if;

  return jsonb_build_object(
    'code', v_code,
    'redemption_id', v_redemption_id,
    'item_name', p_item_name,
    'cost', p_cost,
    'kind', p_kind,
    'credit_cents', coalesce(p_credit_cents, 0),
    'balance', v_balance - p_cost
  );
end;
$$;
grant execute on function public.redeem_store_item(text, text, integer, text, integer, text, jsonb) to authenticated;

-- 5. Consume wallet credit at checkout (service-role; idempotent per session).
create or replace function public.consume_store_credit(
  p_user_id uuid,
  p_kind text,
  p_session_id text,
  p_amount_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avail integer;
  v_take integer;
  v_prior integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then return 0; end if;
  if p_kind not in ('session', 'nutrition') then return 0; end if;

  -- Already consumed for this checkout? Return the prior amount (idempotent).
  select coalesce(-sum(cents), 0) into v_prior
  from public.store_credits
  where ref = p_session_id and source = 'checkout';
  if v_prior > 0 then return v_prior; end if;

  perform pg_advisory_xact_lock(hashtext('shape_store_credit:' || p_user_id::text));

  select coalesce(sum(cents), 0) into v_avail
  from public.store_credits
  where user_id = p_user_id and kind = p_kind;

  v_take := least(v_avail, p_amount_cents);
  if v_take <= 0 then return 0; end if;

  insert into public.store_credits (user_id, kind, cents, source, ref, note)
  values (p_user_id, p_kind, -v_take, 'checkout', p_session_id, 'Applied at checkout');

  return v_take;
end;
$$;
grant execute on function public.consume_store_credit(uuid, text, text, integer) to service_role;

-- 6. Admin fulfillment: list pending merch shipments + mark one fulfilled.
create or replace function public.admin_list_store_fulfillment()
returns table (
  id uuid, user_id uuid, item_id text, item_name text, code text,
  kind text, status text, ship_to jsonb, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select id, user_id, item_id, item_name, code, kind, status, ship_to, created_at
  from public.store_redemptions
  where kind = 'merch'
  order by (status <> 'issued'), created_at desc
  limit 200;
$$;
revoke all on function public.admin_list_store_fulfillment() from public;
grant execute on function public.admin_list_store_fulfillment() to service_role;

create or replace function public.admin_mark_store_fulfilled(p_id uuid, p_note text default null)
returns void
language sql security definer set search_path = public as $$
  update public.store_redemptions
  set status = 'fulfilled', fulfilled_at = now(), fulfillment_note = coalesce(p_note, fulfillment_note)
  where id = p_id;
$$;
revoke all on function public.admin_mark_store_fulfilled(uuid, text) from public;
grant execute on function public.admin_mark_store_fulfilled(uuid, text) to service_role;
