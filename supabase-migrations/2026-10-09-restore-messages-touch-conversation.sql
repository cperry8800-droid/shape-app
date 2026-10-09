-- Restore public.messages_touch_conversation and its AFTER INSERT trigger on public.messages.
--
-- WHY THIS EXISTS
-- 2026-05-02-conversations-messages.sql:138-157 declares a trigger function and a trigger of the
-- same name on public.messages: every new message copies its body and time into its
-- conversation's last_message / last_message_at and stamps updated_at. Production has NEITHER.
-- Read live on 2026-10-08, after the owner ran the 2026-10-08 access-layer migration: pg_proc has
-- no function of that name, and public.messages carries one trigger, messages_notify. No
-- migration drops either. The function is one of the four trigger functions the 2026-09-10 War
-- Room sweep found absent (src/lib/warroom.ts, "four TRIGGER functions are absent"), and
-- 2026-08-08-restore-direct-conversation.sql already put back the OTHER function the 2026-05-02
-- file declares after its policies, get_or_create_direct_conversation. Everything the file
-- declares before line 138 exists live; what follows that line does not. The likeliest reading
-- is that the file never ran to its end; whatever the cause, the database lacks what the code
-- is written against.
--
-- ⚠ THIS IS A DEFECT IN THE PRODUCT, NOT HYGIENE. The War Room sweep filed it as nil impact
-- because "nothing reads updated_at" and threads "order by conversations.last_message_at". The
-- second half is the problem: last_message_at is a column only this trigger writes, so without
-- it every conversation's preview and ordering are empty. What reads the two columns:
--   · src/app/api/trainer/messages/route.ts:36-44 and src/app/api/nutritionist/messages/route.ts
--     (the coach inbox): threads ordered by last_message_at, previewed with last_message, and a
--     `latestKnown` flag that is false while last_message_at is null.
--   · list_member_dm_threads (2026-06-03-member-direct-conversations.sql; live body read
--     2026-10-08): returns c.last_message / c.last_message_at and orders by the latter. These
--     are the member-to-member threads.
--   · src/lib/coach-client-legs.mjs:170-182 and src/lib/shared-overview.ts:296: a coach's "last
--     contact" with a client is the max last_message_at over their direct threads, so with the
--     trigger absent every client reads as never contacted.
--   · mobile-app/src/services/shapeBackend.js:2051-2109: the app's thread list shows
--     last_message as the preview and sorts by last_message_at.
--   · src/app/api/conversations/[id]/messages/route.ts:4-6 states that the trigger updates the
--     preview, and tests/chat-message-history.test.mjs asserts that the 2026-05-02 FILE
--     maintains last_message. Both were right about the repository and wrong about production.
--
-- ⚠ NOBODY HAS BEEN AFFECTED YET. Verified against production before this was written
-- (2026-10-08): public.conversations and public.messages both hold 0 rows, so no preview is
-- stale. The backfill below exists for a database that has rows by the time this runs; on
-- today's it changes nothing.
--
-- The function is the 2026-05-02 original with two deliberate changes, both noted at their
-- sites: pg_temp is pinned, and the touch is skipped for a message older than the one already
-- previewed, so the trigger and the backfill define the preview the same way (the message with
-- the latest created_at).
--
-- Tested before it was written down here: applied to a local PostgreSQL 16 replica built from
-- this catalog (the conversation tables, every function body, the triggers, policies and
-- grants), first over the production path (replica + 2026-10-08 access layer, which is what
-- production is today) and again on a fresh replica; probes ran as a member and a coach before
-- and after. Before: a sent message left its conversation's preview null. After: the member's
-- message, the coach's reply and the message-notification trigger beside it all worked, a
-- backdated message did not overwrite the preview, and the backfill rewrote only the stale
-- rows. A second run changed nothing (same catalog, same rows, same updated_at).
--
-- Idempotent, safe to re-run. One transaction: a failure leaves the database exactly as it was.
-- If a table is busy, the lock wait gives up after 10 seconds and the whole file rolls back
-- rather than queueing in front of the app's own queries; run it again a minute later.

begin;
set local lock_timeout = '10s';

create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
-- ⚠ pg_temp is pinned, which the 2026-05-02 original did not do (its search_path was `public`
-- alone). An omitted pg_temp is not merely absent from the search path, it is searched FIRST,
-- ahead of pg_catalog (CWE-426). Every live definer carries this pin since the 2026-08-09 sweep.
set search_path = public, pg_temp
as $$
begin
  -- ⚠ The `last_message_at <= new.created_at` arm is the second deliberate change. messages.created_at
  -- is a plain column with a default, so an insert can carry an older time (an import, a
  -- client clock); the 2026-05-02 original let any such row overwrite a newer preview. The
  -- preview is the message with the latest created_at, which is also what the backfill below
  -- computes, so the two can never disagree.
  update public.conversations
  set last_message = new.body,
      last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id
    and (last_message_at is null or last_message_at <= new.created_at);
  return new;
end;
$$;

-- A trigger function cannot be called directly (a `returns trigger` function is refused outside
-- a trigger, and PostgREST never exposes one), and EXECUTE is checked when the trigger is
-- CREATED, by its creator, not when it FIRES. So the Supabase default grant to anon and
-- authenticated is dead weight; it is revoked, as every RPC definer in this repo revokes it.
-- The replica run proves the point: a member's insert fires the trigger with no EXECUTE held.
revoke all on function public.messages_touch_conversation() from public;
revoke all on function public.messages_touch_conversation() from anon;
revoke all on function public.messages_touch_conversation() from authenticated;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

-- ===== Backfill =====
-- Every conversation that has messages gets the preview the trigger would have written: the
-- body and time of its latest message. A row already showing that message is left alone, so a
-- re-run changes nothing and moves no updated_at. A conversation with no messages is untouched.
-- updated_at never moves backwards: it takes the later of its own value and the message time.
update public.conversations c
set last_message = m.body,
    last_message_at = m.created_at,
    updated_at = greatest(c.updated_at, m.created_at)
from (
  select distinct on (conversation_id) conversation_id, body, created_at
  from public.messages
  order by conversation_id, created_at desc, id desc
) m
where m.conversation_id = c.id
  and (c.last_message_at is distinct from m.created_at
       or c.last_message is distinct from m.body);

-- ===== Guard =====
-- Asserts the end state rather than trusting the statements above. Compile-tested as a whole:
-- every RAISE takes exactly the arguments its format string names (a bare % in a never-executed
-- branch aborts the whole migration at compile time).
do $guard$
declare
  v_secdef boolean;
  v_path text;
  v_src text;
  v_anon boolean;
  v_auth boolean;
  v_enabled "char";
  v_stale bigint;
begin
  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), p.prosrc,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    into v_secdef, v_path, v_src, v_anon, v_auth
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'messages_touch_conversation'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_secdef is null then
    raise exception 'messages_touch_conversation() is missing after this migration';
  end if;
  if not v_secdef then
    raise exception 'messages_touch_conversation must be SECURITY DEFINER: it writes a conversation row the sender may not hold an UPDATE policy on';
  end if;
  if position('pg_temp' in v_path) = 0 then
    raise exception 'messages_touch_conversation must pin pg_temp; search_path is %', v_path;
  end if;
  -- The shape, not just the metadata: every check above passes on a function with an empty body.
  if position('set last_message = new.body' in v_src) = 0 then
    raise exception 'messages_touch_conversation must write last_message from the new row';
  end if;
  if v_anon or v_auth then
    raise exception 'anon and authenticated must not hold EXECUTE on messages_touch_conversation (anon=%, authenticated=%)', v_anon, v_auth;
  end if;

  select t.tgenabled into v_enabled
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'messages' and t.tgname = 'messages_touch_conversation';
  if v_enabled is null then
    raise exception 'the messages_touch_conversation trigger is missing from public.messages after this migration';
  end if;
  if v_enabled = 'D' then
    raise exception 'the messages_touch_conversation trigger exists but is disabled';
  end if;

  -- The backfill's claim, measured: no conversation with messages previews anything but its
  -- latest one. On a database with no messages this counts zero rows and says nothing more.
  select count(*) into v_stale
  from public.conversations c
  join (
    select distinct on (conversation_id) conversation_id, body, created_at
    from public.messages
    order by conversation_id, created_at desc, id desc
  ) m on m.conversation_id = c.id
  where c.last_message_at is distinct from m.created_at
     or c.last_message is distinct from m.body;
  if v_stale > 0 then
    raise exception '% conversation(s) still preview something other than their latest message after the backfill', v_stale;
  end if;
end
$guard$;

commit;
