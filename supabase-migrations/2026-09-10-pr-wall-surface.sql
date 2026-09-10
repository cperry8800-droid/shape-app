-- The Wall — a readable surface over the PR ledger (review 2026-09-10 §7,
-- build brief BUILD-2026-09-10-wall-in-app.md). Idempotent / safe to re-run.
--
-- WHAT ALREADY EXISTED. 2026-06-14-pr-wall.sql gave the app a system "PR Wall"
-- CHANNEL plus `pr_wall_posts`, a per-user/per-lift ledger of the best value
-- already announced, written only by the definer `post_my_pr_to_wall`. So a
-- record was a CHAT MESSAGE, and the structured ledger behind it was readable
-- by nobody but its owner ("own pr ledger read", select, user_id = auth.uid()).
--
-- WHAT THIS ADDS, and why each piece is here:
--
--   1. `prev_value` — the record the new best REPLACED. Without it a plate can
--      say "245 lb" but not "↑ +10 lb over last best", and the delta is the
--      whole point of a record board. It is captured in the RPC at the moment
--      of the upsert, because after the write the old value is gone.
--
--   2. `reps` — already accepted by the RPC and used in the channel message,
--      never stored. A plate that says "245 lb × 3" needs it on the row.
--
--   3. `post_id` — the community post that IS the record. The owner asked that
--      a Wall plate carry "all of the information that is currently displayed"
--      (the stats grid, zones, trace, breakdown, the coach's co-sign, the
--      reactions and comments). All of that lives on `community_posts`, so the
--      ledger row has to point at it. `on delete set null`: deleting the post
--      does not delete the record — the member still holds that best.
--
--   4. `shape_pr_wall(...)` — a SECURITY DEFINER read of the ledger across
--      members, modelled on `shape_leaderboard`: PUBLIC profiles only, and the
--      leaderboard opt-out is honoured. The ledger's own RLS stays owner-only;
--      this projection is the only cross-user view of it, and it returns
--      display fields, never the row.
--
-- ⚠ THE 4-ARG `post_my_pr_to_wall` IS DROPPED, NOT LEFT BESIDE THE NEW ONE.
-- The new signature adds `p_post_id` with a default, so keeping the old
-- overload would make every four-argument PostgREST call ambiguous
-- ("function is not unique") — the client's existing call would start failing
-- the moment this migration ran. One signature only.
--
-- ⚠ AND `p_post_id` IS ACCEPTED ONLY WHEN THE CALLER OWNS THAT POST. The
-- function runs as its owner, so an unchecked id would let any member link
-- their record to somebody else's post — the Wall would then render a
-- stranger's activity, stats, photo and comments under the caller's name. The
-- id is resolved against `community_posts.author_id = auth.uid()` and silently
-- dropped when it does not match, so a bad link degrades to a bare record
-- rather than to a leak.

-- ── 1. Ledger columns ───────────────────────────────────────────────────────
alter table public.pr_wall_posts
  add column if not exists prev_value numeric,
  add column if not exists reps int,
  add column if not exists post_id uuid references public.community_posts(id) on delete set null;

create index if not exists pr_wall_posts_posted_idx
  on public.pr_wall_posts (posted_at desc);

-- ── 2. Post-a-PR RPC, re-cut to carry the post and the previous best ────────
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
  v_post uuid;
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
    values (v_uid, lower(v_lift), v_lift, p_value, null, v_unit, p_reps, v_post, now())
    on conflict (user_id, lift_key)
      do update set best_value = excluded.best_value,
                    prev_value = pr_wall_posts.best_value,
                    lift_label = excluded.lift_label,
                    unit       = excluded.unit,
                    reps       = excluded.reps,
                    -- A new best replaces the link: the old post was the OLD
                    -- record, and a record board that points at a superseded
                    -- activity is showing the wrong number's evidence.
                    post_id    = excluded.post_id,
                    posted_at  = now();

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
                            'prev', v_prev, 'postId', v_post);
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
