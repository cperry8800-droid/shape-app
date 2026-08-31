-- Five merch items leave the Shape Store (owner call 2026-08-31): the Training
-- Tee, the Crewneck, the Training Bottle, the Canteen and the Gym Towel. Shape
-- Merch is now the two caps.
--
-- public.store_catalogue is the CHARGING AUTHORITY and, separately, the thing
-- claim_tier_reward() validates a free tier pick against — so a UI/TS removal
-- alone is not the whole change. This file removes the live rows and repairs
-- the two tier rewards that pointed at them.
--
-- Measured read-only against prod before writing this (2026-08-31):
--   store_redemptions  0 rows   → no redemption references a removed item
--   tier_rewards       0 rows   → no member has unlocked a reward to orphan
--   score_ledger       0 rows   → no member holds points at all
--   foreign keys into store_catalogue: 0 → the delete is unblocked
-- So nothing below is destructive to existing member data; it is the removal
-- landing before anyone can hit it.
--
-- KEEP IN SYNC with src/lib/store-catalogue.ts (tests/store-catalogue-sync.test.mjs
-- pins the parity). Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The store rows.
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.store_catalogue
 where id in ('merch_training_tee','merch_crewneck','merch_bottle','merch_canteen','merch_towel');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The tier rewards that offered them.
--
-- claim_tier_reward() double-gates a pick: it must be in this function's
-- `choices` AND exist in store_catalogue. Deleting the rows without touching
-- the defs would leave a member choosing a tee, entering a shipping address,
-- and only then getting `bad_choice` — a dead choice, which is worse than a
-- missing one.
--
--   tempo_drinkware  — BOTH its options (bottle, canteen) are gone, so nothing
--                      can fulfil it. Removed rather than left unclaimable.
--                      `tier_rewards.reward_key`'s CHECK still allows the value,
--                      so any historical row (there are none) stays valid; it
--                      simply stops being granted.
--   legend_merch     — loses the tee and crewneck, keeps the caps. Renamed off
--                      "Premium Shape merch", which no longer describes what
--                      ships. A Legend member holds tempo_cap too, so this is
--                      genuinely a second cap.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tier_reward_defs()
returns table (tier text, reward_key text, fulfil_kind text, item_name text, choices text[])
language sql immutable set search_path = public as $$
  values
    ('Tempo',  'tempo_cap',        'merch',   'Shape Cap',                   array['merch_cap_black','merch_cap_white']),
    ('Form',   'form_coach_plan',  'service', 'Free coach workout or plan',  array[]::text[]),
    ('Peak',   'peak_coach_month', 'service', 'Free month with a coach',     array[]::text[]),
    ('Legend', 'legend_year',      'service', 'Free year of Shape',          array[]::text[]),
    ('Legend', 'legend_merch',     'merch',   'Shape Cap',                   array['merch_cap_black','merch_cap_white']);
$$;
grant execute on function public.tier_reward_defs() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Structural guard — the removal is only done if BOTH halves landed.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_left int;
  v_bad  int;
begin
  select count(*) into v_left from public.store_catalogue
   where id in ('merch_training_tee','merch_crewneck','merch_bottle','merch_canteen','merch_towel');
  if v_left <> 0 then
    raise exception 'store_catalogue still carries % removed merch row(s)', v_left;
  end if;

  -- No reward may offer a pick the store cannot fulfil.
  select count(*) into v_bad
    from public.tier_reward_defs() d, unnest(d.choices) c(id)
   where not exists (select 1 from public.store_catalogue s where s.id = c.id);
  if v_bad <> 0 then
    raise exception 'tier_reward_defs offers % choice(s) with no store_catalogue row', v_bad;
  end if;

  -- A pick-one reward with an empty choice list would ship a nonexistent item.
  select count(*) into v_bad from public.tier_reward_defs() d
   where d.fulfil_kind = 'merch' and coalesce(cardinality(d.choices), 0) = 0;
  if v_bad <> 0 then
    raise exception '% merch reward(s) have no choices left', v_bad;
  end if;
end $$;
