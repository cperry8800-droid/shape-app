-- Shape Store redemptions — points become real, spendable purchasing power.
--
-- A redemption atomically (1) checks the member's live Shape-point balance
-- (sum of score_ledger.delta), (2) writes a NEGATIVE ledger row so the spend
-- shows on the score page and lowers the balance, and (3) records the
-- redemption with a one-time code. All three happen inside one SECURITY
-- DEFINER function, serialized per-user with an advisory lock so two
-- concurrent redeems can't both pass the balance check (no double-spend).
--
-- The catalogue + authoritative cost live server-side in the /api/store/redeem
-- route; this RPC trusts the cost the route passes (the route validates the
-- item id → cost against its own catalogue before calling).

create table if not exists public.store_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_name text not null,
  cost_points integer not null check (cost_points > 0),
  code text not null,
  status text not null default 'issued' check (status in ('issued','fulfilled','void')),
  created_at timestamptz not null default now()
);

create index if not exists store_redemptions_user_idx
  on public.store_redemptions (user_id, created_at desc);

alter table public.store_redemptions enable row level security;

-- Owner can read their own redemptions (codes/locker). Writes only happen
-- through the SECURITY DEFINER RPC below (no direct insert policy).
drop policy if exists "store_redemptions readable by owner" on public.store_redemptions;
create policy "store_redemptions readable by owner" on public.store_redemptions
  for select using (auth.uid() = user_id);

-- Live balance = lifetime sum of ledger deltas (earns positive, spends
-- negative). Used by the store hero + the redeem affordability check.
create or replace function public.get_my_points_balance()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::integer
  from public.score_ledger
  where user_id = auth.uid();
$$;

grant execute on function public.get_my_points_balance() to authenticated;

-- The member's redemption locker (most recent first).
create or replace function public.get_my_redemptions()
returns table (
  id uuid,
  item_id text,
  item_name text,
  cost_points integer,
  code text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, item_id, item_name, cost_points, code, status, created_at
  from public.store_redemptions
  where user_id = auth.uid()
  order by created_at desc
  limit 50;
$$;

grant execute on function public.get_my_redemptions() to authenticated;

-- Atomically redeem an item: lock the user, verify balance, deduct, issue code.
-- Raises 'insufficient_points' when the balance won't cover the cost.
create or replace function public.redeem_store_item(
  p_item_id text,
  p_item_name text,
  p_cost integer
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

  -- Serialize redemptions for this user so concurrent calls can't both pass
  -- the balance check below (advisory lock auto-releases at txn end).
  perform pg_advisory_xact_lock(hashtext('shape_store_redeem:' || v_uid::text));

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.score_ledger
  where user_id = v_uid;

  if v_balance < p_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  -- Human-friendly one-time code: <PREFIX>-<8 hex>.
  v_redemption_id := gen_random_uuid();
  v_code := upper(
    regexp_replace(coalesce(nullif(split_part(p_item_id, '_', 1), ''), 'SHAPE'), '[^a-zA-Z0-9]', '', 'g')
  );
  v_code := left(v_code, 6) || '-' || upper(substr(replace(v_redemption_id::text, '-', ''), 1, 8));

  insert into public.store_redemptions (id, user_id, item_id, item_name, cost_points, code)
  values (v_redemption_id, v_uid, p_item_id, p_item_name, p_cost, v_code);

  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
  values (v_uid, 'other', 'store_redeem', v_redemption_id, -p_cost, 'Shape Store · ' || p_item_name);

  return jsonb_build_object(
    'code', v_code,
    'redemption_id', v_redemption_id,
    'item_name', p_item_name,
    'cost', p_cost,
    'balance', v_balance - p_cost
  );
end;
$$;

grant execute on function public.redeem_store_item(text, text, integer) to authenticated;
