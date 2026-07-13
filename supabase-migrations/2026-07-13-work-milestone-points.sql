-- The Work domain PR B — career milestone points (spec
-- docs/superpowers/specs/2026-07-13-work-domain-design.md).
-- Logging a work milestone (THE APPOINTMENTS post) earns +25, capped at ONE
-- award per calendar month in the member's own timezone. Idempotent / re-runnable.
--
-- Abuse resistance (the house award guarantees):
--   • Amount (+25) + category are hard-coded — callers can never supply a delta.
--   • user_id is ALWAYS auth.uid() — a caller can only award themselves.
--   • The FULL milestone shape is validated server-side (caller-owned post,
--     metrics kind, canonical stamp, non-empty bounded title). Stated honestly:
--     milestones are self-reported by nature — a forged milestone-shaped post
--     can never mint MORE than the composer's own ceiling of one +25/month;
--     the monthly cap is the economic defense, the shape check keeps garbage
--     rows from qualifying.
--   • Deduped on the unique (user_id, source_kind, source_id) index with a
--     per-month deterministic source_id → a same-month duplicate is a
--     SUCCESSFUL NO-OP returning granted=false, never an error.
--   • The award attaches to LOGGING, not visibility — public / profile /
--     private milestones all earn identically (points never coerce sharing).

-- 1) Allow the 'career' earn category on the ledger (adds to the existing CHECK).
alter table public.score_ledger drop constraint if exists score_ledger_category_check;
alter table public.score_ledger add constraint score_ledger_category_check
  check (category in (
    'workouts','adherence','habits','prs','community',
    'endorsements','radio','referrals','nutrition','career','other'
  ));

-- 2) award_work_milestone — +25, once per calendar month (member tz).
create or replace function public.award_work_milestone(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_month text;
  v_source uuid;
  v_ins integer := 0;
begin
  if v_uid is null or p_post_id is null then
    return jsonb_build_object('granted', false, 'reason', 'unauthenticated');
  end if;
  -- Validate the FULL milestone shape: the caller's own post, stamped
  -- kind 'milestone', a canonical stamp token, and a real bounded headline.
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id
      and author_id = v_uid
      and coalesce(metrics->>'kind', '') = 'milestone'
      and coalesce(metrics->>'stamp', '') in ('promoted','shipped','certified','new_role','launched','milestone')
      and length(btrim(coalesce(title, ''))) between 1 and 120
  ) then
    return jsonb_build_object('granted', false, 'reason', 'not_a_milestone');
  end if;
  -- One award per calendar month, bucketed in the member's OWN timezone
  -- (shape_user_tz returns a validated IANA name or null → UTC fallback).
  v_tz := public.shape_user_tz(v_uid);
  v_month := to_char(case when v_tz is null then now() else (now() at time zone v_tz) end, 'YYYY-MM');
  v_source := md5('work_milestone:' || v_uid::text || ':' || v_month)::uuid;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'career', 'work_milestone', v_source, 25, 'Career milestone')
    on conflict (user_id, source_kind, source_id) do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('granted', v_ins > 0);
end $$;

revoke execute on function public.award_work_milestone(uuid) from public, anon;
grant execute on function public.award_work_milestone(uuid) to authenticated;

-- 3) award_community_post — milestone posts never double-dip the +5 (they
-- earn through award_work_milestone instead). Identical to the 2026-07-12
-- definition plus the milestone exemption in the eligibility gate.
create or replace function public.award_community_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_post_id is null then return; end if;
  -- Only a real, caller-owned, feed-visible, NON-MEAL, NON-MILESTONE post
  -- earns. Private/profile-only posts, other users' posts, meal shares, and
  -- work milestones award nothing here.
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id and author_id = v_uid and privacy in ('public', 'community')
      and coalesce(activity_type, '') not in ('meal', 'milestone')
      and coalesce(metrics->>'kind', '') not in ('meal', 'milestone')
  ) then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'community', 'community_post', p_post_id, 5, 'Community post')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;

grant execute on function public.award_community_post(uuid) to authenticated;
