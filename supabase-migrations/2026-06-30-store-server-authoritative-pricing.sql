-- Store redemption: server-authoritative pricing — AUTHZ-P1-store-credit + AUTHZ-P2-redeem-order
-- (docs/SECURITY-AUDIT-2026-06-30.md §2b).
--
-- redeem_store_item / redeem_store_order are SECURITY DEFINER, EXECUTE-able by
-- authenticated (the /api/store/* routes call them with the user session), and
-- TRUSTED the client-supplied p_cost / p_credit_cents / p_credit_kind. The
-- /api/store/redeem route validates cost against src/lib/store-catalogue.ts, but
-- a user can POST straight to /rest/v1/rpc/redeem_store_item with arbitrary args,
-- bypassing the route:
--   redeem_store_item{p_cost:1, p_credit_cents:500000, p_credit_kind:'session'}
--   -> debits 1 point, MINTS a $5,000 session credit (spendable at Stripe checkout).
--
-- Fix: a server-authoritative store_catalogue table (the SAME values as
-- src/lib/store-catalogue.ts: cost = retail x 20 pts; credit = retail x 100 cents
-- for Training/Nutrition credit items). Both functions now look up cost / credit /
-- kind / locked by item_id from the table and IGNORE the client-supplied money
-- args (the display name is left client-supplied — cosmetic only). Unknown or
-- tier-locked items are rejected. Routes are unchanged (they still pass the args;
-- the functions ignore the sensitive ones). Idempotent.
--
-- KEEP IN SYNC with src/lib/store-catalogue.ts (+ the website/mobile UI copies).

-- ===== authoritative catalogue (internal: RLS on, no policy => definer-only) =====
create table if not exists public.store_catalogue (
  id           text primary key,
  cost_points  integer not null check (cost_points > 0),
  credit_cents integer not null default 0 check (credit_cents >= 0),
  credit_kind  text check (credit_kind in ('session', 'nutrition')),
  kind         text,
  locked       boolean not null default false
);
alter table public.store_catalogue enable row level security;

-- ⚠ FIVE ITEMS WERE REMOVED FROM THE SEED BELOW, AND THE REASON IS REPLAY.
-- This file is idempotent by design, so re-running it re-seeds whatever it
-- lists. merch_duffel left the store 2026-07-20; merch_training_tee,
-- merch_crewneck, merch_bottle and merch_towel left 2026-08-31 (owner calls) —
-- so listing them here would resurrect deleted items into the CHARGING
-- authority on any replay, at these pre-reprice 20x costs. They are dropped
-- from the seed rather than left with a warning, because a warning is not a
-- thing anything checks. tests/store-migration-replay.test.mjs scans EVERY
-- migration against src/lib/store-catalogue.ts and fails if one comes back.
--
-- The 2026-07-20 reprice restates every surviving row's cost, so the values
-- below are the original 20x figures and are superseded by that file.

insert into public.store_catalogue (id, cost_points, credit_cents, credit_kind, kind, locked) values
  ('merch_cap_black',       700,  0,    null,        'merch',      false),
  ('merch_cap_white',       700,  0,    null,        'merch',      false),
  ('train_credit_25',       500,  2500, 'session',   'credit',     false),
  ('train_credit_50',       1000, 5000, 'session',   'credit',     false),
  ('train_second_opinion',  1900, 0,    null,        'service',    false),
  ('train_program_review',  1700, 0,    null,        'service',    false),
  ('nutri_meal_plan_refresh', 2800, 0,  null,        'service',    false),
  ('nutri_credit_25',       500,  2500, 'nutrition', 'credit',     false),
  ('nutri_grocery_buildout', 900, 0,    null,        'service',    false),
  ('nutri_recipe_pack',     700,  0,    null,        'service',    false),
  ('perk_annual_credit',    1200, 0,    null,        'credit',     true),
  ('lead_boost_7',          1580, 0,    null,        'lead_boost', false),
  ('lead_boost_14',         2780, 0,    null,        'lead_boost', false),
  ('lead_boost_30',         4980, 0,    null,        'lead_boost', false)
on conflict (id) do update set
  cost_points  = excluded.cost_points,
  credit_cents = excluded.credit_cents,
  credit_kind  = excluded.credit_kind,
  kind         = excluded.kind,
  locked       = excluded.locked;

-- ===== redeem_store_item: price/credit/kind/locked from the catalogue =====
CREATE OR REPLACE FUNCTION public.redeem_store_item(p_item_id text, p_item_name text, p_cost integer, p_kind text DEFAULT NULL::text, p_credit_cents integer DEFAULT 0, p_credit_kind text DEFAULT NULL::text, p_ship_to jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_code text;
  v_redemption_id uuid;
  v_cost integer;
  v_credit_cents integer;
  v_credit_kind text;
  v_kind text;
  v_locked boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Server-authoritative: ignore client-supplied p_cost / p_credit_* / p_kind.
  select cost_points, credit_cents, credit_kind, kind, locked
    into v_cost, v_credit_cents, v_credit_kind, v_kind, v_locked
  from public.store_catalogue where id = p_item_id;
  if not found then
    raise exception 'unknown_item' using errcode = '22023';
  end if;
  if v_locked then
    raise exception 'item_locked' using errcode = '22023';
  end if;
  if v_cost is null or v_cost <= 0 then
    raise exception 'invalid_cost' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('shape_store_redeem:' || v_uid::text));

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.score_ledger
  where user_id = v_uid;

  if v_balance < v_cost then
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
    (v_redemption_id, v_uid, p_item_id, p_item_name, v_cost, v_code, v_kind, p_ship_to);

  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
  values (v_uid, 'other', 'store_redeem', v_redemption_id, -v_cost, 'Shape Store · ' || p_item_name);

  if v_credit_cents is not null and v_credit_cents > 0
     and v_credit_kind in ('session', 'nutrition') then
    insert into public.store_credits (user_id, kind, cents, source, ref, note)
    values (v_uid, v_credit_kind, v_credit_cents, 'redemption', v_redemption_id::text, p_item_name);
  end if;

  return jsonb_build_object(
    'code', v_code,
    'redemption_id', v_redemption_id,
    'item_name', p_item_name,
    'cost', v_cost,
    'kind', v_kind,
    'credit_cents', coalesce(v_credit_cents, 0),
    'balance', v_balance - v_cost
  );
end;
$function$;

-- ===== redeem_store_order: per-line cost/kind/locked from the catalogue =====
CREATE OR REPLACE FUNCTION public.redeem_store_order(p_items jsonb, p_ship_to jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_locked boolean;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = '22023';
  end if;

  -- Server-authoritative: look up each line's real cost (ignore client 'cost');
  -- reject unknown / tier-locked items.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select cost_points, locked into v_cost, v_locked
    from public.store_catalogue where id = v_item->>'item_id';
    if not found then
      raise exception 'unknown_item' using errcode = '22023';
    end if;
    if v_locked then
      raise exception 'item_locked' using errcode = '22023';
    end if;
    if v_cost is null or v_cost <= 0 then
      raise exception 'invalid_cost' using errcode = '22023';
    end if;
    v_total := v_total + v_cost;
  end loop;

  perform pg_advisory_xact_lock(hashtext('shape_store_redeem:' || v_uid::text));

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.score_ledger where user_id = v_uid;

  if v_balance < v_total then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_iid  := v_item->>'item_id';
    v_name := v_item->>'item_name';
    select cost_points, kind into v_cost, v_kind
    from public.store_catalogue where id = v_iid;
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
$function$;

-- Verify after apply:
--   select count(*) from public.store_catalogue;  -- expect 19
--   -- A redeem_store_item call with a bogus p_cost/p_credit_cents now charges the
--   -- catalogue cost and mints only the catalogue credit (the args are ignored).
