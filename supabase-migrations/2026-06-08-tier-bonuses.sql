-- Tier bonuses: a one-time bonus added to a member's Shape Score the first time
-- they reach each tier. Escalating rewards for climbing:
--   Base 500 · Tempo 1,000 · Form 2,000 · Peak 4,000 · Legend 5,000
-- (Same thresholds for the coach ladder — Certified/Pro/Elite/Master/Icon — so
--  coaches get the bonuses too.)
--
-- Idempotent + non-cascading: the bonus is based on "base" points (everything
-- EXCEPT prior tier bonuses), and each tier's bonus is deduped via a stable
-- source_id, so a bonus is awarded exactly once and bonuses never re-trigger
-- each other. Call award_tier_bonuses() after points change / on app load.
-- Run on Supabase.

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
  v_names  text[] := array['Base','Tempo','Form','Peak','Legend'];
  v_thresh integer[] := array[0, 750, 2000, 5000, 15000];
  v_bonus  integer[] := array[500, 1000, 2000, 4000, 5000];
  i        integer;
  v_sid    uuid;
  v_ins    integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', 0); end if;

  -- Base points exclude prior tier bonuses so a bonus can't push you up a tier
  -- and trigger the next one.
  select coalesce(sum(delta), 0) into v_base
  from public.score_ledger
  where user_id = v_uid and coalesce(source_kind, '') <> 'tier_bonus';

  for i in 1 .. array_length(v_thresh, 1) loop
    if v_base >= v_thresh[i] then
      v_sid := md5('tier_bonus:' || i)::uuid;  -- stable per-tier id → dedupe
      insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (v_uid, 'other', 'tier_bonus', v_sid, v_bonus[i], 'Tier bonus · ' || v_names[i])
      on conflict (user_id, source_kind, source_id)
        where source_kind is not null and source_id is not null
      do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_award := v_award + v_bonus[i]; end if;
    end if;
  end loop;

  return jsonb_build_object('awarded', v_award);
end;
$$;
grant execute on function public.award_tier_bonuses() to authenticated;
