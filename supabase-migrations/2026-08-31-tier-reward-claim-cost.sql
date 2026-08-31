-- TIER REWARD CLAIMS ARE UNCLAIMABLE — a free reward costs 0, and the table
-- refuses 0.
--
-- `claim_tier_reward` (2026-07-20-tier-rewards.sql) writes the member's free
-- unlock as a redemption at zero cost:
--
--   insert into public.store_redemptions
--     (user_id, item_id, item_name, cost_points, code, kind, ship_to)
--   values (v_uid, v_item, v_def.item_name, 0, v_code, v_def.fulfil_kind, ...)
--
-- but store_redemptions has carried `check (cost_points > 0)` since
-- 2026-06-08-store-redemptions.sql. So EVERY tier reward — merch and voucher
-- alike — raises 23514, which falls past every named branch in
-- /api/store/tier-rewards and surfaces as a generic 500 "Claim failed."
-- A member who earned a free cap taps claim, types their address, and is told
-- nothing at all about why it failed.
--
-- ⚠ PROVEN BEHAVIOURALLY against production, not read off the source. Impersonating
-- a real member with a seeded `legend_merch` unlock, inside a transaction ended by
-- a deliberate raise so nothing persisted:
--
--   removed tee   -> refused, 22023 bad_choice          (the 08-31 merch removal, correct)
--   surviving cap -> 23514 store_redemptions_cost_points_check   (THIS bug)
--
-- Latent until now, not dormant by design: score_ledger is EMPTY (0 rows), so no
-- member has points, so `award_tier_bonuses` has never minted an unlock and
-- `not_unlocked` fires first. It goes live the moment the first member crosses
-- Tempo (750) — at which point the whole ladder-unlocks-real-things feature is
-- dead on arrival for every rung.
--
-- THE FIX: a free claim genuinely costs zero, so the redemption table should say
-- `>= 0`. The catalogue keeps `> 0` — that is the constraint doing the real work.
--
-- ⚠ This does NOT open a free-item hole on the PAID path, and the paid path is
-- guarded twice, independently of this table:
--   1. store_catalogue keeps its own `check (cost_points > 0)` — untouched here.
--   2. redeem_store_item reads the cost FROM the catalogue (never the client arg)
--      and rejects it in-function: `if v_cost is null or v_cost <= 0 then ...`.
-- Both were read out of the live catalog/prosrc, not assumed. So the only writer
-- that can produce a 0-cost redemption is claim_tier_reward, which is what a
-- free reward is.

alter table public.store_redemptions
  drop constraint if exists store_redemptions_cost_points_check;

alter table public.store_redemptions
  add constraint store_redemptions_cost_points_check check (cost_points >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Guard. The zero-cost half is proven by DOING it (a text assertion on the
-- constraint would pass on a definition that still rejects); the paid half is
-- pinned so a later "tidy-up" can't relax the catalogue too and make a free
-- item purchasable for nothing.
-- ─────────────────────────────────────────────────────────────────────────────
do $guard$
declare
  v_uid uuid;
  v_id  uuid;
  v_def text;
begin
  -- (a) the paid path's own floor must still be > 0
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'store_catalogue'
    and con.conname = 'store_catalogue_cost_points_check';
  if v_def is null or v_def not like '%> 0%' then
    raise exception 'guard: store_catalogue must keep check (cost_points > 0), found: %',
      coalesce(v_def, '<missing>');
  end if;

  -- (b) a zero-cost redemption must now be writable — proven, then cleaned up.
  select id into v_uid from auth.users limit 1;
  if v_uid is null then
    raise notice 'guard: no auth.users row — zero-cost write not exercised (empty project)';
  else
    insert into public.store_redemptions
      (user_id, item_id, item_name, cost_points, code, kind)
    values (v_uid, '__guard_probe__', 'guard probe', 0, '__GUARD_PROBE__', 'merch')
    returning id into v_id;
    delete from public.store_redemptions where id = v_id;
    if exists (select 1 from public.store_redemptions where id = v_id) then
      raise exception 'guard: probe row not cleaned up';
    end if;
  end if;
end
$guard$;
