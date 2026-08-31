-- TIER REWARDS — the ladder finally unlocks real things (owner call 2026-07-20).
--
-- Until now every named tier perk was advertising: no tier-gating code existed
-- anywhere, and `store_catalogue.locked` was a blanket boolean that blocked an
-- item for EVERYONE (so the "Peak tier" duffel was unredeemable by Peak members
-- too). The perks are replaced by things a member CLAIMS FOR FREE in the Shape
-- Store — added to the cart at 0 points, shipped (merch) or issued as a voucher
-- (coaching / membership):
--
--   Tempo  (750)    · a Shape Cap (black or white)  AND
--                     a Shape Training Bottle or Canteen        [two claims]
--   Form   (2,000)  · one free workout or meal plan from any Shape coach
--   Peak   (5,000)  · one free MONTH with a trainer or nutritionist
--                     (Shape pays the coach their full rate)
--   Legend (15,000) · a free year of Shape  AND  a premium merch pick
--
-- Writes are RPC-ONLY by construction: tier_rewards carries a SELECT policy and
-- nothing else, so a member can read their unlocks but can neither mint one nor
-- mark it claimed (the #1775 cycle-settings pattern). Run on Supabase.
--
-- ⚠ ORDER: run `2026-07-20-store-reprice-150.sql` FIRST. `merch_canteen` is new
-- there, and a claim validates its choice against store_catalogue — verified
-- read-only against prod, where the canteen is currently absent. Out of order,
-- a Tempo member picking the canteen gets a clean `bad_choice` rejection rather
-- than a silent no-ship, but the option should exist before anyone can reach it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Re-apply the CORRECTED award_tier_bonuses.
--
-- ⚠ The live function drifted from the repo: production still runs the original
-- (613f917a) five-rung version, which grants +500 at a threshold of ZERO — i.e.
-- a free 500-point welcome bonus every member gets for existing, two-thirds of
-- the way to Tempo — and shifts every other amount up a rung. `dc35bbfb`
-- ("start at Tempo, drop the free Base welcome bonus") was never re-run here.
-- Verified harmless so far: score_ledger is EMPTY (0 rows, 0 members), so no
-- member has been credited under either version. Corrected below.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tier_rewards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tier          text not null check (tier in ('Tempo','Form','Peak','Legend')),
  reward_key    text not null check (reward_key in (
                   'tempo_cap','tempo_drinkware','form_coach_plan',
                   'peak_coach_month','legend_year','legend_merch')),
  unlocked_at   timestamptz not null default now(),
  claimed_at    timestamptz,
  choice        text,
  redemption_id uuid references public.store_redemptions(id),
  -- One unlock per member per reward, forever. This is also what makes the
  -- granting insert idempotent, so award_tier_bonuses() can run on every app
  -- open without ever minting a second cap.
  unique (user_id, reward_key)
);
create index if not exists tier_rewards_user_idx on public.tier_rewards (user_id, unlocked_at desc);

alter table public.tier_rewards enable row level security;
-- SELECT only, deliberately. There is no insert/update/delete policy, so the
-- ONLY way a row appears or flips to claimed is through the definer RPCs below
-- — a member cannot grant themselves a free month by writing a row directly.
drop policy if exists "tier_rewards readable by owner" on public.tier_rewards;
create policy "tier_rewards readable by owner" on public.tier_rewards
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The reward definition — ONE source of truth, read by both the granter and
--    the claim validator so they can never disagree about what a tier unlocks.
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ THIS DEFINITION IS PRUNED TO MATCH 2026-08-31-store-merch-removal.sql, AND
-- THE REASON IS REPLAY. `create or replace` means re-running this file
-- overwrites the live function — proven against production (rolled back,
-- 2026-08-31): the original body restored `tempo_drinkware`, whose BOTH options
-- were deleted, and put the tee and crewneck back in `legend_merch` — 4 dead
-- choices. claim_tier_reward() double-gates a pick on store_catalogue, so a
-- member would choose a tee, enter a shipping address, and only then get
-- `bad_choice`. `tempo_drinkware` is dropped, `legend_merch` keeps the caps.
-- The reward_key CHECK above still ALLOWS 'tempo_drinkware' on purpose: a
-- historical row (there are none) stays valid, it simply stops being granted.
-- Guarded forward by tests/store-migration-replay.test.mjs.
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
-- 2. Grant bonuses AND unlocks in one call (the client already calls this on
--    session resolve, so nothing new has to fire).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.award_tier_bonuses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_base   integer;
  v_award  integer := 0;
  v_names  text[] := array['Tempo','Form','Peak','Legend'];
  v_thresh integer[] := array[750, 2000, 5000, 15000];
  v_bonus  integer[] := array[500, 1000, 2000, 4000];
  i        integer;
  v_sid    uuid;
  v_ins    integer;
  v_unlocked integer := 0;
begin
  if v_uid is null then return jsonb_build_object('awarded', 0, 'unlocked', 0); end if;

  -- Base points exclude prior tier bonuses so a bonus can't push you up a tier
  -- and trigger the next one.
  select coalesce(sum(delta), 0) into v_base
  from public.score_ledger
  where user_id = v_uid and coalesce(source_kind, '') <> 'tier_bonus';

  for i in 1 .. array_length(v_thresh, 1) loop
    if v_base >= v_thresh[i] then
      v_sid := md5('tier_bonus:' || v_names[i])::uuid;  -- stable per-tier id → dedupe
      insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (v_uid, 'other', 'tier_bonus', v_sid, v_bonus[i], 'Tier bonus · ' || v_names[i])
      on conflict (user_id, source_kind, source_id) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_award := v_award + v_bonus[i]; end if;

      -- The tier's free unlocks. `unique (user_id, reward_key)` makes this a
      -- no-op on every subsequent call, so the ladder never re-mints.
      insert into public.tier_rewards (user_id, tier, reward_key)
      select v_uid, d.tier, d.reward_key from public.tier_reward_defs() d
      where d.tier = v_names[i]
      on conflict (user_id, reward_key) do nothing;
      get diagnostics v_ins = row_count;
      v_unlocked := v_unlocked + v_ins;
    end if;
  end loop;

  return jsonb_build_object('awarded', v_award, 'unlocked', v_unlocked);
end;
$$;
grant execute on function public.award_tier_bonuses() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Read my unlocks (claimed + unclaimed) for the store's free-rewards shelf.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_tier_rewards()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'rewardKey',  r.reward_key,
    'tier',       r.tier,
    'kind',       d.fulfil_kind,
    'name',       d.item_name,
    'choices',    to_jsonb(d.choices),
    'unlockedAt', r.unlocked_at,
    'claimedAt',  r.claimed_at,
    'choice',     r.choice,
    'code',       s.code
  ) order by r.unlocked_at), '[]'::jsonb)
  from public.tier_rewards r
  join public.tier_reward_defs() d on d.reward_key = r.reward_key
  left join public.store_redemptions s on s.id = r.redemption_id
  where r.user_id = auth.uid();
$$;
grant execute on function public.get_my_tier_rewards() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Claim one — atomic, one-shot, server-validated.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_tier_reward(
  p_reward_key text,
  p_choice text default null,
  p_ship_to jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_def  record;
  v_row  record;
  v_code text;
  v_item text;
  v_name text;
  v_rid  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  -- Serialize this member's claims so a double-tap (or two devices) can't turn
  -- one unlock into two shipments.
  perform pg_advisory_xact_lock(hashtext('tier_rewards'), hashtext(v_uid::text));

  select * into v_def from public.tier_reward_defs() d where d.reward_key = p_reward_key;
  if not found then raise exception 'unknown_reward' using errcode = 'P0002'; end if;

  select * into v_row from public.tier_rewards
  where user_id = v_uid and reward_key = p_reward_key;
  if not found then raise exception 'not_unlocked' using errcode = 'P0002'; end if;
  if v_row.claimed_at is not null then raise exception 'already_claimed' using errcode = 'P0001'; end if;

  if cardinality(v_def.choices) > 0 then
    -- A pick-one reward: the choice must be one WE offer, never caller-supplied
    -- free text (it becomes the shipped item).
    if p_choice is null or not (p_choice = any(v_def.choices)) then
      raise exception 'bad_choice' using errcode = '22023';
    end if;
    v_item := p_choice;
    select c.id into v_name from public.store_catalogue c where c.id = p_choice;
    if v_name is null then raise exception 'bad_choice' using errcode = '22023'; end if;
  else
    if p_choice is not null then raise exception 'bad_choice' using errcode = '22023'; end if;
    v_item := p_reward_key;
  end if;

  -- Merch ships, so it needs somewhere to go; a voucher must NOT carry an address.
  if v_def.fulfil_kind = 'merch' then
    if p_ship_to is null or coalesce(trim(p_ship_to->>'name'), '') = ''
       or coalesce(trim(p_ship_to->>'line1'), '') = '' then
      raise exception 'needs_shipping' using errcode = '22023';
    end if;
  elsif p_ship_to is not null then
    raise exception 'unexpected_shipping' using errcode = '22023';
  end if;

  v_code := 'SHAPE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.store_redemptions
    (user_id, item_id, item_name, cost_points, code, kind, ship_to)
  values
    (v_uid, v_item, v_def.item_name, 0, v_code, v_def.fulfil_kind,
     case when v_def.fulfil_kind = 'merch' then p_ship_to else null end)
  returning id into v_rid;

  update public.tier_rewards
     set claimed_at = now(), choice = p_choice, redemption_id = v_rid
   where user_id = v_uid and reward_key = p_reward_key and claimed_at is null;
  -- Belt and braces: the advisory lock already serializes, but if the row moved
  -- under us we must not leave a shipment order behind an unclaimed reward.
  if not found then raise exception 'already_claimed' using errcode = 'P0001'; end if;

  return jsonb_build_object(
    'ok', true, 'code', v_code, 'rewardKey', p_reward_key,
    'kind', v_def.fulfil_kind, 'itemId', v_item, 'name', v_def.item_name
  );
end;
$$;
revoke execute on function public.claim_tier_reward(text, text, jsonb) from public, anon;
grant execute on function public.claim_tier_reward(text, text, jsonb) to authenticated;
