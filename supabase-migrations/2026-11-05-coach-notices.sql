-- A coach hears about a check-in and a co-coach's plan change (owner, 2026-11-05: "Build package P5").
-- Idempotent: safe to re-run. The code works before it runs: no check-in notice is sent, and a hand-off
-- line reaches the other coach as an ordinary care-team "New message".
--
-- 1. notify_on_new_message: a care-team message the server posted as a plan hand-off
--    (messages.metadata.kind = 'handoff', src/lib/care-team.ts postHandoff) notifies the other coaches
--    as `care_team_handoff`, its own switch ("Care-team hand-offs"), titled with metadata.noticeTitle and
--    carrying metadata.copy as data.copy (noticeCopy.mjs says it in the reader's language). Every other
--    message is notified exactly as before. Restates 2026-10-26-push-notice-fixes.sql's body with that
--    one branch; nothing else changes. A coach can only post a hand-off into a care-team thread they
--    are on (the messages RLS), and it can say nothing they could not say in a message.
-- 2. notify_coaches_on_checkin: a weekly check-in tells every coach the member pays now (an open
--    subscription: active, trialing, past_due) as `checkin_submitted`, the switch both settings screens
--    show ("Check-ins received"). One notice per coach per week (data.dedupe, notifications_dedupe_uidx):
--    the member editing their check-in that week sends nothing new. It opens the client's page.
--    Quiet hours and the switch apply at delivery (/api/push/dispatch, /api/cron/push-held).

-- ── 1. notify_on_new_message ──
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
  -- A care-team hand-off line (src/lib/care-team.ts postHandoff): a plan change the other coaches hear
  -- as a `care_team_handoff` notice, under its own switch, with the copy the server composed.
  v_handoff boolean := coalesce(new.metadata->>'kind', '') = 'handoff';
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
    select cp.user_id,
           case when v_handoff then 'care_team_handoff' else 'message' end,
           case when v_handoff then coalesce(nullif(left(btrim(coalesce(new.metadata->>'noticeTitle', '')), 120), ''), 'Care-team hand-off') else 'New message' end,
           left(coalesce(new.body, ''), case when v_handoff then 240 else 80 end),
           'messages',
           jsonb_build_object('conversationId', new.conversation_id, 'careTeam', true, 'side', 'coach')
             || case when v_handoff
                  then jsonb_build_object('clientId', conv.client_id)
                       || case when jsonb_typeof(new.metadata->'copy') = 'object' then jsonb_build_object('copy', new.metadata->'copy') else '{}'::jsonb end
                  else '{}'::jsonb end
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

-- ── 2. notify_coaches_on_checkin ──
create or replace function public.notify_coaches_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_shown text;
  v_client jsonb;
  v_question boolean;
  r record;
begin
  if new.user_id is null or new.week_of is null then
    return new;
  end if;
  select nullif(btrim(coalesce(p.full_name, '')), '') into v_name from public.profiles p where p.id = new.user_id;
  v_shown := coalesce(v_name, 'A client');
  v_client := case when v_name is null then jsonb_build_object('$key', 'word.aClient') else to_jsonb(v_name) end;
  v_question := nullif(btrim(coalesce(new.question, '')), '') is not null;
  for r in
    select distinct coalesce(t.owner_id, n.owner_id) as coach_id, s.provider_role as role
      from public.subscriptions s
      left join public.trainers t on s.provider_role = 'trainer' and t.id = s.provider_id
      left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
     where s.client_id = new.user_id
       and s.status in ('active', 'trialing', 'past_due')
  loop
    if r.coach_id is null or r.coach_id = new.user_id then
      continue;
    end if;
    begin
      insert into public.notifications (user_id, type, title, body, route, data)
      values (
        r.coach_id,
        'checkin_submitted',
        'Check-in from ' || v_shown,
        v_shown || case when v_question then ' sent this week''s check-in, with a question for you.' else ' sent this week''s check-in.' end,
        'client',
        jsonb_build_object(
          'dedupe', 'checkin:' || new.user_id::text || ':' || new.week_of::text,
          'clientId', new.user_id,
          'providerRole', r.role,
          'weekOf', new.week_of,
          'question', v_question,
          'copy', jsonb_build_object(
            'title', jsonb_build_array('checkin.received.title', jsonb_build_object('client', v_client)),
            'body', jsonb_build_array(case when v_question then 'checkin.received.bodyQuestion' else 'checkin.received.body' end, jsonb_build_object('client', v_client))
          )
        )
      );
    exception when unique_violation then
      -- This coach was told about this week's check-in already (one person with both listings, or an
      -- edit of the same week).
      null;
    end;
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_coaches_on_checkin() from public, anon, authenticated;

drop trigger if exists client_checkins_notify_coaches on public.client_checkins;
create trigger client_checkins_notify_coaches
  after insert or update on public.client_checkins
  for each row execute function public.notify_coaches_on_checkin();

-- ── Checks: the run fails rather than leaving a half-applied state ──
do $$
declare v_src text;
begin
  v_src := pg_get_functiondef('public.notify_on_new_message()'::regprocedure);
  if position('''care_team_handoff''' in v_src) = 0 then
    raise exception 'notify_on_new_message has no hand-off branch';
  end if;
  if position('''member''' in v_src) = 0 or position('''careTeam''' in v_src) = 0 or position('past_due' in v_src) = 0 then
    raise exception 'notify_on_new_message lost its direct-message or care-team branch';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'client_checkins_notify_coaches' and not tgisinternal) then
    raise exception 'the check-in trigger is missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'notifications_dedupe_uidx') then
    raise exception 'notifications_dedupe_uidx is missing: run 2026-10-05-notifications-dedupe.sql first';
  end if;
end $$;
