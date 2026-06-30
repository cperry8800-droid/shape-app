-- Shape Store: multi-item ORDERS (cart checkout) — bundle several merch items
-- into ONE order with ONE shipping address + ONE ops/member email, redeemed
-- atomically against the member's live point balance (all-or-nothing).
--
-- Reuses store_redemptions as the per-line ledger; the lines of one cart share
-- an order_id. Mirrors redeem_store_item (advisory-locked per user, a negative
-- score_ledger row + a one-time code per line) but checks the COMBINED total
-- ONCE, so a cart can never half-redeem (no partial spend on a failure). The
-- /api/store/checkout route validates each item's cost + kind against the
-- server catalogue before calling this — the RPC never trusts a client cost.

alter table public.store_redemptions
  add column if not exists order_id uuid;
create index if not exists store_redemptions_order_idx
  on public.store_redemptions (order_id);

create or replace function public.redeem_store_order(
  p_items jsonb,
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
  v_total integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_cost integer;
  v_kind text;
  v_name text;
  v_iid text;
  v_rid uuid;
  v_code text;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = '22023';
  end if;

  -- Sum the (server-validated) line costs first.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cost := coalesce((v_item->>'cost')::integer, 0);
    if v_cost <= 0 then
      raise exception 'invalid_cost' using errcode = '22023';
    end if;
    v_total := v_total + v_cost;
  end loop;

  -- Serialize this user's redemptions so concurrent carts can't both pass the
  -- one balance check (advisory lock auto-releases at txn end).
  perform pg_advisory_xact_lock(hashtext('shape_store_redeem:' || v_uid::text));

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.score_ledger where user_id = v_uid;

  if v_balance < v_total then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  -- One redemption row + one negative ledger row + one code per line, all
  -- sharing the order_id (and the single ship-to).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_iid  := v_item->>'item_id';
    v_name := v_item->>'item_name';
    v_cost := (v_item->>'cost')::integer;
    v_kind := nullif(v_item->>'kind', '');
    v_rid  := gen_random_uuid();
    v_code := upper(regexp_replace(coalesce(nullif(split_part(v_iid, '_', 1), ''), 'SHAPE'), '[^a-zA-Z0-9]', '', 'g'));
    v_code := left(v_code, 6) || '-' || upper(substr(replace(v_rid::text, '-', ''), 1, 8));

    insert into public.store_redemptions
      (id, user_id, item_id, item_name, cost_points, code, kind, ship_to, order_id)
    values
      (v_rid, v_uid, v_iid, v_name, v_cost, v_code, v_kind, p_ship_to, v_order_id);

    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'other', 'store_redeem', v_rid, -v_cost, 'Shape Store · ' || v_name);

    v_lines := v_lines || jsonb_build_object(
      'item_id', v_iid, 'item_name', v_name, 'cost', v_cost, 'kind', v_kind, 'code', v_code
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'items', v_lines,
    'total', v_total,
    'balance', v_balance - v_total
  );
end;
$$;
grant execute on function public.redeem_store_order(jsonb, jsonb) to authenticated;
