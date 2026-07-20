-- Store reprice: 20 -> 150 points per dollar (owner call 2026-07-20).
--
-- public.store_catalogue is the CHARGING AUTHORITY — redeem_store_item /
-- redeem_store_order read cost/credit/kind/locked from it and ignore the
-- client-supplied money args (the 2026-06-30 AUTHZ-P1 fix). The TS/UI reprice
-- alone therefore changes only what members SEE: production would keep
-- charging the old 20x costs (review: Codex P1 on #1778 — e.g. the $25 credit
-- would debit 500 points against a displayed 3,750). This upserts every row at cost = retail x 150,
-- EXCEPT dollar-credits at retail x 300 (owner call 2026-07-20, option 2A:
-- credits cost Shape real cash, so they price at 2x the base rate). credit_cents (the real dollar value minted) is
-- UNCHANGED — only the points price of buying it moved. Idempotent; KEEP IN
-- SYNC with src/lib/store-catalogue.ts.

insert into public.store_catalogue (id, cost_points, credit_cents, credit_kind, kind, locked) values
  ('merch_training_tee', 7200, 0, null, 'merch', false),
  ('merch_crewneck', 10800, 0, null, 'merch', false),
  ('merch_cap_black', 5250, 0, null, 'merch', false),
  ('merch_cap_white', 5250, 0, null, 'merch', false),
  ('merch_bottle', 4200, 0, null, 'merch', false),
  ('merch_towel', 3300, 0, null, 'merch', false),
  ('merch_duffel', 24750, 0, null, 'merch', true),
  ('train_credit_25', 7500, 2500, 'session', 'credit', false),
  ('train_credit_50', 15000, 5000, 'session', 'credit', false),
  ('train_second_opinion', 14250, 0, null, 'service', false),
  ('train_program_review', 12750, 0, null, 'service', false),
  ('nutri_meal_plan_refresh', 21000, 0, null, 'service', false),
  ('nutri_credit_25', 7500, 2500, 'nutrition', 'credit', false),
  ('nutri_grocery_buildout', 6750, 0, null, 'service', false),
  ('nutri_recipe_pack', 5250, 0, null, 'service', false),
  ('perk_annual_credit', 18000, 0, null, 'credit', true),
  ('lead_boost_7', 11850, 0, null, 'lead_boost', false),
  ('lead_boost_14', 20850, 0, null, 'lead_boost', false),
  ('lead_boost_30', 37350, 0, null, 'lead_boost', false)
on conflict (id) do update set
  cost_points  = excluded.cost_points,
  credit_cents = excluded.credit_cents,
  credit_kind  = excluded.credit_kind,
  kind         = excluded.kind,
  locked       = excluded.locked;
