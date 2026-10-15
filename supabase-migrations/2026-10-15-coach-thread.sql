-- The coach thread, opened when a client hires a coach (client-onboarding review, fix 3a: H7, M9).
--
-- ⚠ HIRING A COACH OPENED NO CONVERSATION, AND THE COACH COULD OPEN THE WRONG ONE (review H7).
-- - The payment step wrote the subscription and nothing else: no thread, no welcome. Only the
--   client could open the proper coach thread (get_or_create_direct_conversation always makes the
--   caller the client).
-- - A coach messaging first from the app opened a member-to-member chat
--   (get_or_create_member_conversation) with no coach attached. It does not appear on the coach's
--   Messages page, and the client sees it under DMs, so the two could end up in two threads.
--
-- This migration:
-- - open_coach_thread(client, role, provider, welcome, client name): the Stripe webhook's call
--   (service role only). It gets or creates the client's direct thread with that listing and posts
--   Shape's welcome into it once (sender_id null, metadata.shape = 'welcome'). It answers the
--   thread and whether this call posted the welcome, which is what lets the caller email the member
--   exactly once.
-- - messages_shape_welcome_uidx: one welcome per thread, enforced by the database.
-- - get_or_create_client_conversation(client, role): the coach's way into that same thread, for
--   their own client only. "Their client" means, for the caller's listing of that role: an active
--   subscription, a session that is not cancelled or declined and is upcoming or in the last 90
--   days, a paid session purchase in the last 90 days, or a thread that already exists.
--
-- Nothing is written to existing rows. Re-runnable: "create or replace", "if not exists", and a
-- guard that checks the result.

begin;

-- One welcome per thread. Only Shape's own messages carry sender_id null (the insert policy is
-- sender_id = auth.uid(), so only the service role can write one).
create unique index if not exists messages_shape_welcome_uidx
  on public.messages (conversation_id)
  where sender_id is null and (metadata->>'shape') = 'welcome';

create or replace function public.open_coach_thread(
  p_client_id uuid,
  p_provider_role text,
  p_provider_id bigint,
  p_welcome text,
  p_client_name text default null
)
returns table (thread_id uuid, welcomed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_conv uuid;
  v_msg uuid;
begin
  if p_client_id is null or p_provider_id is null
     or p_provider_role is null or p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'open_coach_thread: a client, a provider role and a provider id are required' using errcode = '22023';
  end if;

  if p_provider_role = 'trainer' then
    select t.name into v_name from public.trainers t where t.id = p_provider_id;
  else
    select n.name into v_name from public.nutritionists n where n.id = p_provider_id;
  end if;
  if v_name is null then
    raise exception 'open_coach_thread: provider not found' using errcode = 'P0002';
  end if;

  select c.id into v_conv
  from public.conversations c
  where c.kind = 'direct' and c.provider_role = p_provider_role
    and c.provider_id = p_provider_id and c.client_id = p_client_id
  limit 1;

  if v_conv is null then
    -- A concurrent call (the client opening the same thread) can win the insert; the unique
    -- index conversations_direct_unique_idx turns that into a 23505, and the winner's row is read.
    begin
      insert into public.conversations (kind, title, provider_role, provider_id, client_id)
      values ('direct', v_name, p_provider_role, p_provider_id, p_client_id)
      returning id into v_conv;
    exception when unique_violation then
      select c.id into v_conv
      from public.conversations c
      where c.kind = 'direct' and c.provider_role = p_provider_role
        and c.provider_id = p_provider_id and c.client_id = p_client_id
      limit 1;
    end;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conv, p_client_id, 'client')
  on conflict (conversation_id, user_id) do nothing;

  if nullif(btrim(coalesce(p_welcome, '')), '') is not null then
    insert into public.messages (conversation_id, sender_id, body, metadata)
    values (
      v_conv, null, btrim(p_welcome),
      jsonb_build_object('shape', 'welcome', 'coach', v_name, 'role', p_provider_role)
        || case when nullif(btrim(coalesce(p_client_name, '')), '') is not null
                then jsonb_build_object('client', btrim(p_client_name)) else '{}'::jsonb end
    )
    on conflict (conversation_id) where sender_id is null and (metadata->>'shape') = 'welcome'
    do nothing
    returning id into v_msg;
  end if;

  return query select v_conv, v_msg is not null;
end;
$$;

create or replace function public.get_or_create_client_conversation(p_client_id uuid, p_provider_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pid bigint;
  v_name text;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_client_id is null or p_provider_role is null or p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'A client and a provider role are required.' using errcode = '22023';
  end if;

  if p_provider_role = 'trainer' then
    select t.id, t.name into v_pid, v_name from public.trainers t where t.owner_id = v_uid order by t.id limit 1;
  else
    select n.id, n.name into v_pid, v_name from public.nutritionists n where n.owner_id = v_uid order by n.id limit 1;
  end if;
  if v_pid is null then
    raise exception 'No % listing belongs to this account.', p_provider_role using errcode = '42501';
  end if;

  select c.id into v_conv
  from public.conversations c
  where c.kind = 'direct' and c.provider_role = p_provider_role
    and c.provider_id = v_pid and c.client_id = p_client_id
  limit 1;
  if v_conv is not null then
    return v_conv;
  end if;

  -- Their client, with THIS listing: the same relationship is_coach_with_client counts, held to
  -- the one listing so a coach with both roles cannot open a thread under the role they do not
  -- coach this client in.
  if not (
    exists (
      select 1 from public.subscriptions s
      where s.client_id = p_client_id and s.provider_role = p_provider_role and s.provider_id = v_pid
        and s.status in ('active', 'trialing')
    )
    or exists (
      select 1 from public.sessions s
      where s.client_id = p_client_id and s.provider_role = p_provider_role and s.provider_id = v_pid
        and coalesce(s.status, '') not in ('cancelled', 'canceled', 'declined')
        and s.scheduled_at >= now() - interval '90 days'
    )
    or exists (
      select 1 from public.one_time_purchases p
      where p.client_id = p_client_id and p.provider_role = p_provider_role and p.provider_id = v_pid
        and p.kind = 'booking' and p.status = 'paid'
        and p.created_at >= now() - interval '90 days'
    )
  ) then
    raise exception 'This member is not your client.' using errcode = '42501';
  end if;

  begin
    insert into public.conversations (kind, title, provider_role, provider_id, client_id)
    values ('direct', v_name, p_provider_role, v_pid, p_client_id)
    returning id into v_conv;
  exception when unique_violation then
    select c.id into v_conv
    from public.conversations c
    where c.kind = 'direct' and c.provider_role = p_provider_role
      and c.provider_id = v_pid and c.client_id = p_client_id
    limit 1;
  end;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conv, p_client_id, 'client')
  on conflict (conversation_id, user_id) do nothing;

  return v_conv;
end;
$$;

revoke all on function public.open_coach_thread(uuid, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.open_coach_thread(uuid, text, bigint, text, text) to service_role;
revoke all on function public.get_or_create_client_conversation(uuid, text) from public, anon;
grant execute on function public.get_or_create_client_conversation(uuid, text) to authenticated, service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if to_regclass('public.messages_shape_welcome_uidx') is null then
    raise exception 'messages_shape_welcome_uidx is missing';
  end if;
  if has_function_privilege('anon', 'public.open_coach_thread(uuid, text, bigint, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.open_coach_thread(uuid, text, bigint, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.open_coach_thread(uuid, text, bigint, text, text)', 'execute') then
    raise exception 'open_coach_thread must be executable by the service role only';
  end if;
  if has_function_privilege('anon', 'public.get_or_create_client_conversation(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_or_create_client_conversation(uuid, text)', 'execute') then
    raise exception 'get_or_create_client_conversation must be executable by signed-in callers only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('open_coach_thread', 'get_or_create_client_conversation')
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%pg_temp'))
  ) then
    raise exception 'the coach-thread functions must be definer functions with a search_path ending in pg_temp';
  end if;
end
$guard$;

commit;
