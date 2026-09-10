-- 2026-09-10 · PR Wall: prev_value must come from the row being replaced
--
-- ⚠ A FOLLOW-UP FILE, NOT AN EDIT TO `2026-09-10-pr-wall-units.sql`, WHICH IS
-- ALREADY APPLIED. Silently changing an applied migration leaves the repo
-- claiming something the database does not do, and makes the outstanding apply
-- invisible. Generated from that file by targeted replacement of four hunks.
--
-- FOUND BY: Codex on `6cc2ebf` (P2). The defect is a three-way race the earlier
-- `RETURNING` witness did not cover: the witness proved the WRITE happened, and
-- said nothing about whether the value carried INTO it was still current.
--
-- ⚠ AND THE APPLIED FILE'S OWN COMMENT ASSERTED THE FIX IT DID NOT MAKE — it
-- read "`prev_value` is taken from the row being replaced, not from `v_prev`"
-- directly above `prev_value = excluded.prev_value`, which IS `v_prev`. A
-- comment asserting an invariant is not the invariant.
-- lower a best under concurrency (2026-09-10, the units wave — CodeRabbit round).
--
-- Two defects, both in the ledger's own idea of what a personal record IS:
--
--   1. THE COMPARISON WAS UNIT-BLIND. `pr_wall_posts` stores a unit PER ROW,
--      and the gate read `p_value <= v_prev` with the two sides in whatever
--      units they carried. A member whose last record was 200 lb and who then
--      pulls 100 kg — 220.5 lb, a real PR — was told "not a PR"; a 210 lb lift
--      after a 100 kg record was accepted as a best it does not beat. And
--      `prev_value` was stored verbatim from the old row while `unit` became
--      the new post's, so every downstream delta subtracted across units.
--
--   2. THE UPSERT COULD LOWER A BEST. The "is this an improvement" check runs
--      before the statement, so two concurrent posts could both pass it and the
--      later writer won regardless of size. The guard is inside the statement
--      now, which also makes it unit-safe.
--
-- POUNDS IS THE CANONICAL UNIT FOR A LIFT, matching get_my_lifts and
-- get_client_lifts of the same date. The row still STORES the unit the member
-- posted in — only the comparison is normalised — because a record is a claim
-- about what they actually lifted.
--
-- This restates the whole function from 2026-09-10-pr-wall-surface.sql; only
-- the marked hunks differ. Idempotent: the drops are guarded and the grants are
-- re-issued.

drop function if exists public.post_my_pr_to_wall(text, numeric, text, int);
drop function if exists public.post_my_pr_to_wall(text, numeric, text, int, uuid);

create function public.post_my_pr_to_wall(
  p_lift    text,
  p_value   numeric,
  p_unit    text default 'lb',
  p_reps    int  default null,
  p_post_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_lift text := nullif(trim(p_lift), '');
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'lb');
  v_vis  text;
  v_ch   uuid;
  v_name text;
  v_prev numeric;
  v_prev_unit text;
  v_prev_conv numeric;   -- the stored best, expressed in THIS post's unit
  v_new_lb numeric;      -- both operands in pounds, for the comparison only
  v_prev_lb numeric;
  v_post uuid;
  v_body text;
  v_written numeric;   -- the best actually stored; null = the guard refused the write
  v_prev_written numeric;  -- the prev actually stored, read back from the same statement
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
  -- ⚠ BOTH OPERANDS ARE NORMALISED BEFORE THEY ARE COMPARED. This read used to
  -- test `p_value <= v_prev` with the two sides in whatever units they happened
  -- to carry, and the ledger stores a unit PER ROW — so a member whose last
  -- record was 200 lb and who then pulls 100 kg (220.5 lb, a genuine PR) was
  -- told "not a PR" because 100 <= 200, while a 210 lb lift after a 100 kg
  -- record was ACCEPTED as a best it does not beat. Pounds is the canonical
  -- unit for a lift here, matching both lift RPCs of the same date.
  select best_value, unit into v_prev, v_prev_unit
    from public.pr_wall_posts
    where user_id = v_uid and lift_key = lower(v_lift);
  v_new_lb  := case when lower(v_unit) like '%kg%' then p_value / 0.45359237 else p_value end;
  v_prev_lb := case when lower(coalesce(v_prev_unit, 'lb')) like '%kg%' then v_prev / 0.45359237 else v_prev end;
  if v_prev is not null and v_new_lb <= v_prev_lb then
    return jsonb_build_object('ok', false, 'reason', 'not_a_pr');
  end if;
  -- ⚠ AND `prev_value` MUST BE EXPRESSED IN THE UNIT THE ROW NOW CARRIES. The
  -- row keeps ONE `unit` column, so storing the old best verbatim while the
  -- unit becomes the new post's made every downstream delta a subtraction
  -- across units — "↑ +120 lb over last best" for a 100 kg lift after 200 lb.
  v_prev_conv := case
                   when v_prev is null then null
                   when lower(coalesce(v_prev_unit, 'lb')) = lower(v_unit) then v_prev
                   when lower(v_unit) like '%kg%' then v_prev_lb * 0.45359237
                   else v_prev_lb
                 end;

  -- ⚠ A post id is only honoured when the caller wrote that post. See the
  -- header: this function runs as its owner, so an unchecked id links a
  -- stranger's activity under the caller's record.
  if p_post_id is not null then
    select id into v_post from public.community_posts
      where id = p_post_id and author_id = v_uid;
  end if;

  select id into v_ch from public.channels
    where name = 'PR Wall' and created_by is null limit 1;
  if v_ch is null then return jsonb_build_object('ok', false, 'reason', 'no_channel'); end if;

  select coalesce(nullif(trim(full_name), ''), 'A member') into v_name
    from public.profiles where id = v_uid;

  -- Record/advance the ledger first (so concurrent calls can't double-post).
  -- ⚠ `prev_value` is taken from the row being replaced, not from `v_prev`:
  -- on conflict the excluded row carries the NEW value, and the old one is
  -- readable only as `pr_wall_posts.best_value` inside this statement.
  insert into public.pr_wall_posts
      (user_id, lift_key, lift_label, best_value, prev_value, unit, reps, post_id, posted_at)
    values (v_uid, lower(v_lift), v_lift, p_value, v_prev_conv, v_unit, p_reps, v_post, now())
    on conflict (user_id, lift_key)
      do update set best_value = excluded.best_value,
                    -- ⚠ FROM THE CONFLICT ROW, NOT `excluded`. `excluded.prev_value`
                    -- is `v_prev_conv`, computed from the read at the top of this
                    -- function — which is STALE the moment two improving posts
                    -- race. From 100 lb, concurrent 200 and 300 both read 100; the
                    -- 200 lands first; the 300 then passes the atomic guard (300 >
                    -- 200) and stored prev_value = 100, so the Wall skipped the
                    -- already-announced 200 and rendered "+200 over last best"
                    -- instead of "+100". The row being replaced is readable only
                    -- as `pr_wall_posts.*` inside this statement, which is the one
                    -- moment the value cannot go stale.
                    -- ⚠ AND IT IS EXPRESSED IN THE UNIT THE ROW NOW CARRIES
                    -- (`excluded.unit`), because the row keeps ONE unit column —
                    -- storing the old best verbatim makes every downstream delta a
                    -- subtraction across units.
                    prev_value = case
                      when lower(excluded.unit) like '%kg%' then
                        case when lower(coalesce(pr_wall_posts.unit, 'lb')) like '%kg%'
                             then pr_wall_posts.best_value
                             else pr_wall_posts.best_value * 0.45359237 end
                      else
                        case when lower(coalesce(pr_wall_posts.unit, 'lb')) like '%kg%'
                             then pr_wall_posts.best_value / 0.45359237
                             else pr_wall_posts.best_value end
                    end,
                    lift_label = excluded.lift_label,
                    unit       = excluded.unit,
                    reps       = excluded.reps,
                    -- A new best replaces the link: the old post was the OLD
                    -- record, and a record board that points at a superseded
                    -- activity is showing the wrong number's evidence.
                    post_id    = excluded.post_id,
                    posted_at  = now()
      -- ⚠ A LOSING CONCURRENT CALL MUST NOT LOWER THE BEST. The check above
      -- runs BEFORE this statement, so two simultaneous posts could both pass
      -- it and the later writer would win regardless of size. Comparing in
      -- pounds inside the statement makes the guard atomic and unit-safe.
      where (case when lower(excluded.unit) like '%kg%' then excluded.best_value / 0.45359237 else excluded.best_value end)
          > (case when lower(coalesce(pr_wall_posts.unit, 'lb')) like '%kg%' then pr_wall_posts.best_value / 0.45359237 else pr_wall_posts.best_value end)
    returning best_value, prev_value into v_written, v_prev_written;

  -- ⚠ AND EVERY SIDE EFFECT BELOW HANGS OFF THAT WRITE ACTUALLY HAPPENING.
  -- The guard above made the statement able to affect ZERO rows, and until this
  -- check the announcement did not know that: the losing side of a race had its
  -- ledger write correctly refused and then posted "new PR" to the channel and
  -- returned ok:true anyway — a record message for a value that is not the
  -- record. The guard was mine, so the inconsistency was mine to close: before
  -- it, the upsert always wrote and the message was always true.
  --
  -- `best_value` is NOT NULL, so a null witness can only mean "no row" — and in
  -- plpgsql a RETURNING that matches nothing leaves the target null rather than
  -- raising. It is the same answer the pre-statement gate gives, because it IS
  -- the same question asked at the only moment it cannot go stale.
  if v_written is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_pr');
  end if;

  v_body := round(p_value)::text || ' ' || v_unit || ' ' || v_lift
            || case when p_reps is not null and p_reps > 1 then ' × ' || p_reps::text else '' end
            || ' — new PR';

  insert into public.channel_messages (channel_id, sender_id, author_name, body)
    values (v_ch, v_uid, v_name, v_body);
  update public.channels set last_message = v_body, last_message_at = now() where id = v_ch;

  -- Keep them as a member so it shows in their joined list + counts.
  insert into public.channel_members (channel_id, user_id, role)
    values (v_ch, v_uid, 'member') on conflict do nothing;

  return jsonb_build_object('ok', true, 'posted', true, 'body', v_body,
                            -- ⚠ THE PREV ACTUALLY WRITTEN, not `v_prev`. The
                            -- pre-read goes stale under the same race as above,
                            -- so returning it would contradict the stored row.
                            'prev', v_prev_written, 'postId', v_post);
end;
$$;

revoke execute on function public.post_my_pr_to_wall(text, numeric, text, int, uuid) from public, anon;
grant execute on function public.post_my_pr_to_wall(text, numeric, text, int, uuid) to authenticated;

-- ── 3. The Wall read ────────────────────────────────────────────────────────
-- ⚠ SIGNED-OUT CALLERS GET NOTHING, ON PURPOSE. `anon` has no grant, so the
-- preview shows the app's demo records and never a real member's name. That
-- matches every other cross-member read in this repo (shape_leaderboard).
--
-- p_scope:
--   'everyone'  — every public, opted-in member.
--   'following' — accounts the caller follows, accepted follows only.
--   'coach'     — for a COACH caller: their own clients (`is_coach_on_client`).
--                 For a MEMBER caller: the other clients of the coaches they
--                 share, which is what "my coach's clients" means from the
--                 member's side. Both are computed from the caller's own
--                 links; neither takes an id from the client.
drop function if exists public.shape_pr_wall(int, text, text);

create function public.shape_pr_wall(
  p_limit int  default 40,
  p_lift  text default null,
  p_scope text default 'everyone'
)
returns table (
  user_id    uuid,
  full_name  text,
  avatar_url text,
  role       text,
  lift_key   text,
  lift_label text,
  best_value numeric,
  prev_value numeric,
  unit       text,
  reps       int,
  posted_at  timestamptz,
  post_id    uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    w.user_id,
    coalesce(p.full_name, 'Shape member') as full_name,
    p.avatar_url,
    p.role,
    w.lift_key,
    coalesce(w.lift_label, w.lift_key) as lift_label,
    w.best_value,
    w.prev_value,
    w.unit,
    w.reps,
    w.posted_at,
    w.post_id
  from public.pr_wall_posts w
  left join public.profiles p on p.id = w.user_id
  left join public.user_goals g
    on g.user_id = w.user_id and g.kind = 'client_privacy_prefs'
  where public.shape_profile_visibility(w.user_id) = 'public'
    and coalesce(g.data->>'leaderboard', 'on') <> 'off'
    and (p_lift is null or w.lift_key = lower(trim(p_lift)))
    and (
      coalesce(p_scope, 'everyone') = 'everyone'
      or (
        p_scope = 'following'
        and w.user_id in (
          select f.following_id from public.user_follows f
          where f.follower_id = auth.uid() and f.status = 'accepted'
        )
      )
      or (
        p_scope = 'coach'
        and (
          public.is_coach_on_client(w.user_id)
          or exists (
            select 1
            from public.subscriptions mine
            join public.subscriptions theirs
              on theirs.provider_id = mine.provider_id
             and theirs.provider_role = mine.provider_role
            where mine.client_id = auth.uid()
              and mine.status in ('active', 'trialing')
              and theirs.client_id = w.user_id
              and theirs.status in ('active', 'trialing')
          )
        )
      )
    )
  order by w.posted_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

-- ⚠ Revoke from anon BY NAME — `revoke ... from public` does NOT remove
-- Supabase's explicit anon grant (the 2026-06-30-rpc-authz-hardening bug
-- class), and this definer reads an owner-only ledger across members.
revoke execute on function public.shape_pr_wall(int, text, text) from public, anon;
grant execute on function public.shape_pr_wall(int, text, text) to authenticated;

-- ── 4. "Your best" needs no new SQL ─────────────────────────────────────────
-- The member reads their own ledger under the existing "own pr ledger read"
-- policy, which already exposes every column added above to its owner.
