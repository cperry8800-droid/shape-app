-- Read receipts (owner, 2026-11-02: "build read receipts and typing indicator next").
--
-- Under your last message in a conversation, the app now says Sent, then Seen once the other person
-- has read it. The read time is conversation_participants.last_read_at, which mark_conversation_read()
-- already sets (to now()) whenever a thread is open, for the unread counts. Two things change here:
--
-- 1. The read time is read only through conversation_seen(). Participants could select each other's
--    last_read_at directly; that was harmless while nothing showed it, but with a "Read receipts"
--    switch in Settings it would let anyone read past a member's Off. So authenticated keeps SELECT on
--    the table's other columns and loses it on last_read_at (anon loses SELECT, which no policy gave it
--    any rows of). Nothing selects the table from a client: every function that reads it is security
--    definer, and no policy on another table reads it. A column added to this table later is not
--    selectable by clients until it is granted.
--
-- 2. conversation_seen(conversation) answers the caller, if they may open the conversation:
--      { "on": false, "seen": [] }  when the caller's own read receipts are off (reciprocal, as on
--                                   other messengers: Off hides your reads and theirs);
--      { "on": true,  "seen": [{ "user_id", "last_read_at" }, …] }  the other participants who have
--                                   read it and whose read receipts are on.
--    The switch is the member's Settings document (user_goals kind 'client_settings', key
--    'readReceipts', 'On' or 'Off'), which the Settings screen already writes; anything but 'Off'
--    (no document, no key) is on, the default.
--
-- Typing needs nothing here: it rides a Realtime broadcast channel. One transaction, re-runnable, a
-- guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

revoke select on public.conversation_participants from anon, authenticated;
grant select (conversation_id, user_id, role, created_at) on public.conversation_participants to authenticated;

create or replace function public.conversation_seen(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_conversation_id is null or not public.can_access_conversation(p_conversation_id) then
    return jsonb_build_object('on', false, 'seen', '[]'::jsonb);
  end if;
  if coalesce((select g.data ->> 'readReceipts' from public.user_goals g
               where g.user_id = v_me and g.kind = 'client_settings'), 'On') = 'Off' then
    return jsonb_build_object('on', false, 'seen', '[]'::jsonb);
  end if;
  return jsonb_build_object('on', true, 'seen', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'last_read_at', cp.last_read_at) order by cp.user_id)
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id <> v_me
      and cp.last_read_at is not null
      and coalesce((select g.data ->> 'readReceipts' from public.user_goals g
                    where g.user_id = cp.user_id and g.kind = 'client_settings'), 'On') <> 'Off'
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.conversation_seen(uuid) from public, anon;
grant execute on function public.conversation_seen(uuid) to authenticated;

-- Guard: the read time is closed to clients, the rest of the row is not, and the one door is there.
do $$
begin
  if has_column_privilege('authenticated', 'public.conversation_participants', 'last_read_at', 'select')
     or has_column_privilege('anon', 'public.conversation_participants', 'last_read_at', 'select') then
    raise exception 'conversation_participants.last_read_at is still selectable by clients';
  end if;
  if not (has_column_privilege('authenticated', 'public.conversation_participants', 'conversation_id', 'select')
          and has_column_privilege('authenticated', 'public.conversation_participants', 'user_id', 'select')) then
    raise exception 'conversation_participants lost its readable columns';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'conversation_seen' and p.prosecdef
      and pg_get_function_identity_arguments(p.oid) = 'p_conversation_id uuid'
      and p.prorettype = 'jsonb'::regtype
  ) then
    raise exception 'conversation_seen(uuid) is missing or not security definer';
  end if;
  if not has_function_privilege('authenticated', 'public.conversation_seen(uuid)', 'execute')
     or has_function_privilege('anon', 'public.conversation_seen(uuid)', 'execute') then
    raise exception 'conversation_seen(uuid) has the wrong grants';
  end if;
end $$;

commit;
