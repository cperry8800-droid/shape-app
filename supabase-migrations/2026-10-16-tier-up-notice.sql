-- A tier-up notice (owner, 2026-10-16: "for email include welcome email and when you tier up").
--
-- award_tier_bonuses() is where a member first reaches a Shape Score tier: it writes that tier's
-- bonus row once (score_ledger, deduped per tier). This is the 2026-10-12-shape-score-fixes.sql
-- definition, unchanged, plus one notification ('tier_up', opening the Score page) for the
-- highest tier the call newly reached. The push webhook (/api/push/dispatch) pushes it and emails
-- it: a tier-up is one of the few types email is offered for, and its email starts on
-- (public/newdesign/notificationSurfaces.mjs).
--
-- A member whose bonuses were granted before this runs gets no notice for them: their bonus rows
-- already exist. Idempotent, safe to re-run.
begin;

create or replace function public.award_tier_bonuses()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_base   bigint;
  v_award  integer := 0;
  v_names  text[] := array['Tempo','Form','Peak','Legend'];
  v_thresh integer[] := array[750, 2000, 5000, 15000];
  v_bonus  integer[] := array[500, 1000, 2000, 4000];
  i        integer;
  v_sid    uuid;
  v_ins    integer;
  v_unlocked integer := 0;
  v_new    text;
begin
  if v_uid is null then return jsonb_build_object('awarded', 0, 'unlocked', 0); end if;

  -- The SAME basis the Score page shows the tier on (shape_rank_points): the tier a
  -- member sees is the tier whose rewards they can claim.
  v_base := public.shape_rank_points(v_uid);

  for i in 1 .. array_length(v_thresh, 1) loop
    if v_base >= v_thresh[i] then
      v_sid := md5('tier_bonus:' || v_names[i])::uuid;  -- stable per-tier id → dedupe
      insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (v_uid, 'other', 'tier_bonus', v_sid, v_bonus[i], 'Tier bonus · ' || v_names[i])
      on conflict (user_id, source_kind, source_id) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_award := v_award + v_bonus[i]; v_new := v_names[i]; end if;

      insert into public.tier_rewards (user_id, tier, reward_key)
      select v_uid, d.tier, d.reward_key from public.tier_reward_defs() d
      where d.tier = v_names[i]
      on conflict (user_id, reward_key) do nothing;
      get diagnostics v_ins = row_count;
      v_unlocked := v_unlocked + v_ins;
    end if;
  end loop;

  -- The tier-up notice. The tier bonus row is the record that a tier was reached, so each tier is
  -- announced once; tiers crossed together are one notice for the highest, not one email each.
  -- The push webhook pushes and emails it (a tier-up's email starts on). A notice that cannot be
  -- written never costs the member the bonus above.
  if v_new is not null then
    begin
      insert into public.notifications (user_id, type, title, body, route, data)
      values (v_uid, 'tier_up', 'You reached ' || v_new,
              'Your ' || v_new || ' rewards are waiting in the Shape Store.', 'score',
              jsonb_build_object('tier', v_new, 'dedupe', 'tier:' || v_new))
      on conflict do nothing;
    exception when others then
      raise warning 'award_tier_bonuses: tier-up notice not written: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('awarded', v_award, 'unlocked', v_unlocked);
end;
$$;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'award_tier_bonuses'
      and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%')
      and p.prosrc like '%''tier_up''%'
  ) then
    raise exception 'award_tier_bonuses is not the pinned definer that writes the tier-up notice';
  end if;
  if not has_function_privilege('authenticated', 'public.award_tier_bonuses()', 'execute') then
    raise exception 'members can no longer run award_tier_bonuses';
  end if;
end
$guard$;

commit;
