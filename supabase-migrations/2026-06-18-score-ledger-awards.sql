-- Shape Score awards — wire the previously-unwired earning categories so the
-- catalogue the score page advertises actually pays out. Idempotent / re-runnable.
--
-- Categories wired here (all already permitted by the score_ledger CHECK in
-- 2026-05-28-shape-score-ledger.sql — no CHECK change needed):
--   prs       — posting a NEW PR to the PR Wall                      (+12)
--   adherence — submitting the weekly check-in (once / week)         (+15)
--   community — sharing a feed-visible community post                 (+5)
--
-- Abuse resistance (hardened after security review):
--   • Each award function hard-codes its amount + category — callers can NEVER
--     supply a delta or category (no "insert any points" helper exists).
--   • user_id is ALWAYS auth.uid() — a caller can only ever award THEMSELVES.
--   • The award is only written when the ORIGINATING ROW actually exists and is
--     owned by the caller (verified inside the SECURITY DEFINER function), so a
--     user can't mint points by passing a fabricated UUID.
--   • Every insert dedupes on the unique (user_id, source_kind, source_id) index
--     via ON CONFLICT DO NOTHING — replays / re-submits / re-posts never double-
--     credit. PR awards bucket per-lift-per-month so ratcheting can't farm.
--
-- NOTE: an earlier draft shipped a generic insert_score(...) helper granted to
-- `authenticated`; that is a score-inflation vector (caller-supplied delta), so
-- it is dropped here.

drop function if exists public.insert_score(text, text, uuid, integer, text);

-- ── Community post → +5 'community' (feed-visible, caller-owned) ─────────────
create or replace function public.award_community_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_post_id is null then return; end if;
  -- Only a real, caller-owned, feed-visible post earns. Private/profile-only
  -- posts and other users' posts award nothing.
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id and author_id = v_uid and privacy in ('public', 'community')
  ) then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'community', 'community_post', p_post_id, 5, 'Community post')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;
grant execute on function public.award_community_post(uuid) to authenticated;

-- ── Weekly check-in → +15 'adherence' (once per ISO week, real check-in only) ─
create or replace function public.award_checkin_points(p_week_of date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_week_of is null then return; end if;
  -- Require a genuine check-in for this week — a bare RPC call earns nothing.
  if not exists (
    select 1 from public.client_checkins where user_id = v_uid and week_of = p_week_of
  ) then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'adherence', 'checkin',
            md5('checkin:' || v_uid::text || ':' || p_week_of::text)::uuid,
            15, 'Weekly check-in')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;
grant execute on function public.award_checkin_points(date) to authenticated;

-- ── PR Wall → +12 prs (re-defines post_my_pr_to_wall to add the award) ──────
-- Identical to 2026-06-14-pr-wall.sql plus a score_ledger insert, so the points
-- and the wall post commit (or roll back) together inside the one DEFINER
-- transaction. The award is bucketed per-lift-per-CALENDAR-MONTH (source_id keyed
-- on YYYY-MM, not the value), so a user can't ratchet +1 lb repeatedly to farm
-- points; a genuine new PR in a later month earns again. The wall post itself is
-- unthrottled (still requires a real new best + a public profile, as before).
create or replace function public.post_my_pr_to_wall(
  p_lift  text,
  p_value numeric,
  p_unit  text default 'lb',
  p_reps  int  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_lift text := nullif(trim(p_lift), '');
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'lb');
  v_vis  text;
  v_ch   uuid;
  v_name text;
  v_prev numeric;
  v_body text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if v_lift is null or p_value is null or p_value <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Public profiles only.
  select public.shape_profile_visibility(v_uid) into v_vis;
  if coalesce(v_vis, 'private') <> 'public' then
    return jsonb_build_object('ok', false, 'reason', 'not_public');
  end if;

  -- Only a genuine improvement over the last value we posted for this lift.
  select best_value into v_prev
    from public.pr_wall_posts
    where user_id = v_uid and lift_key = lower(v_lift);
  if v_prev is not null and p_value <= v_prev then
    return jsonb_build_object('ok', false, 'reason', 'not_a_pr');
  end if;

  select id into v_ch from public.channels
    where name = 'PR Wall' and created_by is null limit 1;
  if v_ch is null then return jsonb_build_object('ok', false, 'reason', 'no_channel'); end if;

  select coalesce(nullif(trim(full_name), ''), 'A member') into v_name
    from public.profiles where id = v_uid;

  -- Record/advance the ledger first (so concurrent calls can't double-post).
  insert into public.pr_wall_posts (user_id, lift_key, lift_label, best_value, unit, posted_at)
    values (v_uid, lower(v_lift), v_lift, p_value, v_unit, now())
    on conflict (user_id, lift_key)
      do update set best_value = excluded.best_value, lift_label = excluded.lift_label,
                    unit = excluded.unit, posted_at = now();

  v_body := round(p_value)::text || ' ' || v_unit || ' ' || v_lift
            || case when p_reps is not null and p_reps > 1 then ' × ' || p_reps::text else '' end
            || ' — new PR';

  insert into public.channel_messages (channel_id, sender_id, author_name, body)
    values (v_ch, v_uid, v_name, v_body);
  update public.channels set last_message = v_body, last_message_at = now() where id = v_ch;

  -- Keep them as a member so it shows in their joined list + counts.
  insert into public.channel_members (channel_id, user_id, role)
    values (v_ch, v_uid, 'member') on conflict do nothing;

  -- Shape Score: +12 for a new PR, at most once per lift per calendar month.
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'prs', 'pr_wall_post',
            md5('pr_wall:' || v_uid::text || ':' || lower(v_lift) || ':' || to_char(now(), 'YYYY-MM'))::uuid,
            12, 'PR: ' || v_body)
    on conflict (user_id, source_kind, source_id) do nothing;

  return jsonb_build_object('ok', true, 'posted', true, 'body', v_body);
end;
$$;
grant execute on function public.post_my_pr_to_wall(text, numeric, text, int) to authenticated;
