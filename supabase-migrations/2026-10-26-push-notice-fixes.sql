-- Push and notification fixes (owner, 2026-10-26: "fix 1-7"). Idempotent: safe to re-run.
--
-- 1. A member's direct message notifies the other member. The message trigger had no branch for a
--    direct-message thread, so it returned on a null recipient and nobody heard.
-- 2. A follow, a follow request, an accepted request and a co-sign carry a dedupe key, so
--    unfollowing and following again, or taking a co-sign off and on, no longer sends a new
--    notification each time: one a day per follower, and one per post per coach for a co-sign
--    (notifications_dedupe_uidx, 2026-10-05-notifications-dedupe.sql, refuses the repeat).
-- 3. An index for the notices held back by quiet hours (data.held_at; /api/push/dispatch holds
--    them and /api/cron/push-held sends them once the night is over).

-- ── 1. notify_on_new_message ── restates 2026-10-18-coach-access-past-due.sql's body, with the
-- direct-message branch first.
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conv record;
  recipient uuid;
  v_side text;
begin
  select client_id, provider_role, provider_id, dm_key
    into conv
    from public.conversations
   where id = new.conversation_id;
  if not found then
    return new;
  end if;

  -- A member's direct message (dm_key, 2026-06-03-member-direct-conversations.sql): the other
  -- member hears. It has no client, so it reached the client branch below and stopped at a null
  -- recipient: no member ever heard of a direct message. side 'member' is the switch it answers to
  -- ("Messages", notificationSurfaces.mjs preferenceTypeFor).
  if conv.dm_key is not null then
    insert into public.notifications (user_id, type, title, body, route, data)
    select cp.user_id, 'message', 'New message', left(coalesce(new.body, ''), 80), 'messages',
           jsonb_build_object('conversationId', new.conversation_id, 'side', 'member')
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id is distinct from new.sender_id;
    return new;
  end if;

  -- A care-team thread: the other coaches on it hear, never the client it is about, and only
  -- those who still coach the client.
  if conv.provider_role is null and conv.dm_key is null and conv.client_id is not null then
    insert into public.notifications (user_id, type, title, body, route, data)
    select cp.user_id, 'message', 'New message', left(coalesce(new.body, ''), 80), 'messages',
           jsonb_build_object('conversationId', new.conversation_id, 'careTeam', true, 'side', 'coach')
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id is distinct from new.sender_id
       and cp.user_id <> conv.client_id
       and exists (
         select 1 from public.subscriptions s
         where s.client_id = conv.client_id
           and s.status in ('active', 'trialing', 'past_due')
           and (
             (s.provider_role = 'trainer' and exists (
               select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = cp.user_id
             ))
             or (s.provider_role = 'nutritionist' and exists (
               select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = cp.user_id
             ))
           )
       );
    return new;
  end if;

  if conv.client_id is not null and conv.client_id = new.sender_id then
    -- Client sent it → notify the coach (provider owner).
    if conv.provider_role = 'trainer' then
      select owner_id into recipient from public.trainers where id = conv.provider_id;
    elsif conv.provider_role = 'nutritionist' then
      select owner_id into recipient from public.nutritionists where id = conv.provider_id;
    end if;
    v_side := 'coach';
  else
    -- Coach (or other) sent it → notify the client.
    recipient := conv.client_id;
    v_side := 'client';
  end if;

  if recipient is null or recipient = new.sender_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    recipient,
    'message',
    'New message',
    left(coalesce(new.body, ''), 80),
    'messages',
    jsonb_build_object('conversationId', new.conversation_id)
      || case when conv.provider_role is not null then jsonb_build_object('providerRole', conv.provider_role, 'side', v_side) else '{}'::jsonb end
  );
  return new;
end;
$$;


-- ── 2. Follows and co-signs: one notice, not one per toggle ──
-- toggle_follow restates 2026-06-08-follow-requests.sql; the notice now carries a dedupe key (the
-- follower and the UTC day) and steps aside when one already went today.
create or replace function public.toggle_follow(p_user_id uuid)
returns table (followers int, following int, is_following boolean, is_pending boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); vis text; new_status text; actor text; v_type text;
begin
  if me is null then raise exception 'Authentication required.'; end if;
  if me = p_user_id then raise exception 'You cannot follow yourself.'; end if;
  if exists (select 1 from user_follows where follower_id = me and following_id = p_user_id) then
    -- already following or already requested → undo (unfollow / cancel request)
    delete from user_follows where follower_id = me and following_id = p_user_id;
  else
    vis := public.shape_profile_visibility(p_user_id);
    new_status := case when vis = 'public' then 'accepted' else 'pending' end;
    insert into user_follows (follower_id, following_id, status)
    values (me, p_user_id, new_status)
    on conflict (follower_id, following_id) do nothing;
    select coalesce(full_name, 'A member') into actor from public.profiles where id = me;
    v_type := case when new_status = 'pending' then 'follow_request' else 'follow' end;
    insert into public.notifications (user_id, type, title, body, route, data)
    values (
      p_user_id,
      v_type,
      case when new_status = 'pending' then actor || ' requested to follow you' else actor || ' started following you' end,
      '', 'profile',
      jsonb_build_object('actorId', me, 'status', new_status,
        'dedupe', v_type || ':' || me::text || ':' || to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD'))
    )
    on conflict do nothing;
  end if;
  return query
    select
      (select count(*)::int from user_follows where following_id = p_user_id and status = 'accepted'),
      (select count(*)::int from user_follows where follower_id  = p_user_id and status = 'accepted'),
      (select exists (select 1 from user_follows where follower_id = me and following_id = p_user_id and status = 'accepted')),
      (select exists (select 1 from user_follows where follower_id = me and following_id = p_user_id and status = 'pending'));
end; $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- respond_follow_request restates 2026-06-08-follow-requests.sql, with the same day's key on the
-- accept notice.
create or replace function public.respond_follow_request(p_follower_id uuid, p_accept boolean)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); owner_name text;
begin
  if me is null then raise exception 'Authentication required.'; end if;
  if p_accept then
    update user_follows set status = 'accepted'
    where follower_id = p_follower_id and following_id = me and status = 'pending';
    if found then
      select coalesce(full_name, 'A member') into owner_name from public.profiles where id = me;
      insert into public.notifications (user_id, type, title, body, route, data)
      values (p_follower_id, 'follow_accept', owner_name || ' accepted your follow request', '', 'profile',
        jsonb_build_object('actorId', me,
          'dedupe', 'follow_accept:' || me::text || ':' || to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')))
      on conflict do nothing;
    end if;
  else
    delete from user_follows
    where follower_id = p_follower_id and following_id = me and status = 'pending';
  end if;
  return (select count(*)::int from user_follows where following_id = me and status = 'pending');
end; $$;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;

-- post_coach_cosign restates 2026-06-14-coach-cosign.sql: a co-sign notifies its athlete once per
-- post and coach, however often it is taken off and put back.
create or replace function public.post_coach_cosign(p_post_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me            uuid := auth.uid();
  v_author      uuid;
  v_activity    text;
  v_coach_name  text;
  v_coach_role  text;
  v_existing_by text;
begin
  if me is null then
    raise exception 'auth required';
  end if;

  select author_id, coalesce(activity_type, 'workout')
    into v_author, v_activity
    from public.community_posts
   where id = p_post_id;

  if v_author is null then
    raise exception 'post not found';
  end if;
  if v_author = me then
    raise exception 'cannot co-sign your own post';
  end if;

  -- Authority check: the caller must be one of this athlete's coaches.
  if not public.is_coach_on_client(v_author) then
    raise exception 'not this athlete''s coach';
  end if;

  select coalesce(full_name, 'Your coach'),
         case when role in ('trainer','nutritionist') then role else 'trainer' end
    into v_coach_name, v_coach_role
    from public.profiles
   where id = me;

  if p_on then
    -- One unified like (no separate counter for the verb / co-sign).
    insert into public.community_likes (post_id, user_id)
    values (p_post_id, me)
    on conflict (post_id, user_id) do nothing;

    -- Stamp the co-sign so every viewer's card badges it.
    update public.community_posts
       set metrics = jsonb_set(
             coalesce(metrics, '{}'::jsonb),
             '{cosign}',
             jsonb_build_object('name', v_coach_name, 'role', v_coach_role, 'byId', me::text),
             true)
     where id = p_post_id;

    -- Notify the athlete, once per post and coach (the dedupe key).
    insert into public.notifications (user_id, type, title, body, route, data)
    values (
      v_author,
      'cosign',
      v_coach_name || ' co-signed your ' || v_activity,
      '',
      'community',
      jsonb_build_object('postId', p_post_id::text, 'coachId', me::text, 'role', v_coach_role,
        'dedupe', 'cosign:' || p_post_id::text || ':' || me::text)
    )
    on conflict do nothing;
  else
    delete from public.community_likes
     where post_id = p_post_id and user_id = me;

    -- Only clear the stamp if it was MINE (don't wipe another coach's co-sign).
    select metrics->'cosign'->>'byId'
      into v_existing_by
      from public.community_posts
     where id = p_post_id;
    if v_existing_by = me::text then
      update public.community_posts
         set metrics = metrics - 'cosign'
       where id = p_post_id;
    end if;
  end if;
end;
$$;
grant execute on function public.post_coach_cosign(uuid, boolean) to authenticated;

-- ── 3. The notices held for the end of quiet hours ──
-- /api/cron/push-held reads the rows with data.held_at; nearly none carry it, so the index is small.
create index if not exists notifications_held_idx
  on public.notifications ((data->>'held_at'))
  where (data->>'held_at') is not null;

-- ── Checks: the run fails rather than leaving a half-applied state ──
do $$
declare v_src text;
begin
  v_src := pg_get_functiondef('public.notify_on_new_message()'::regprocedure);
  if position('''member''' in v_src) = 0 then
    raise exception 'notify_on_new_message has no direct-message branch';
  end if;
  if position('''careTeam''' in v_src) = 0 or position('past_due' in v_src) = 0 then
    raise exception 'notify_on_new_message lost the care-team branch or its past_due coaches';
  end if;
  if position('dedupe' in pg_get_functiondef('public.toggle_follow(uuid)'::regprocedure)) = 0
     or position('dedupe' in pg_get_functiondef('public.respond_follow_request(uuid, boolean)'::regprocedure)) = 0
     or position('dedupe' in pg_get_functiondef('public.post_coach_cosign(uuid, boolean)'::regprocedure)) = 0 then
    raise exception 'a follow or co-sign notice has no dedupe key';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'notifications_dedupe_uidx') then
    raise exception 'notifications_dedupe_uidx is missing: run 2026-10-05-notifications-dedupe.sql first';
  end if;
end $$;
