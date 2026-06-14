-- Coach co-sign on community posts.
--
-- A reaction is a "co-sign" when the reactor is the post author's OWN coach. It
-- is the SAME unified like (one count), but weighted + badged distinctly so one
-- coach co-sign reads heavier than peer reactions, and it notifies the athlete.
--
-- post_coach_cosign(p_post_id, p_on) — SECURITY DEFINER:
--   * re-checks (server-side) the caller is the author's coach via
--     is_coach_on_client(author) — never trusts the client,
--   * records / removes the like (so the tally stays one number),
--   * stamps community_posts.metrics.cosign = {name, role, byId} so EVERY viewer
--     sees the badge (communityPostFromRow reads metrics.cosign),
--   * notifies the athlete on co-sign.
-- Idempotent; safe to re-run.

create or replace function public.post_coach_cosign(p_post_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
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

    -- Notify the athlete (eligible-to-notify; honest single event).
    insert into public.notifications (user_id, type, title, body, route, data)
    values (
      v_author,
      'cosign',
      v_coach_name || ' co-signed your ' || v_activity,
      '',
      'community',
      jsonb_build_object('postId', p_post_id::text, 'coachId', me::text, 'role', v_coach_role)
    );
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
