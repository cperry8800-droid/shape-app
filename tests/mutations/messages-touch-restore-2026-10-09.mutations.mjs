// Mutation spec for the restore of messages_touch_conversation. Each mutation breaks one clause of
// the migration (or of a record that names it); tests/messages-touch-restore.test.mjs and the
// definer audit must notice every one. The Postgres halves (the trigger firing, the backfill, the
// re-run) are not mutated here: the runner does not run Postgres, and the replica run recorded in
// the migration's header is their test.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/messages-touch-restore-2026-10-09.mutations.mjs --fail-on-skipped
const MIG = 'supabase-migrations/2026-10-09-restore-messages-touch-conversation.sql';
const AGREEMENT = 'tests/definer-live-agreement.test.mjs';
const FIXTURE = 'tests/fixtures/definer-live-2026-10-10.json';
const ROUTE = 'src/app/api/conversations/[id]/messages/route.ts';

export default {
  test: 'node --test tests/messages-touch-restore.test.mjs tests/definer-grants.test.mjs tests/chat-message-history.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the function ──
    { name: 'the pin is dropped: search_path is public alone, as in the 2026-05-02 original', file: MIG,
      find: 'set search_path = public, pg_temp\nas $$',
      replace: 'set search_path = public\nas $$' },
    { name: 'SECURITY DEFINER is dropped', file: MIG,
      find: 'language plpgsql\nsecurity definer\n',
      replace: 'language plpgsql\n' },
    { name: 'the backdated-message guard is dropped: any insert overwrites the preview', file: MIG,
      find: '  where id = new.conversation_id\n    and (last_message_at is null or last_message_at <= new.created_at);\n',
      replace: '  where id = new.conversation_id;\n' },
    { name: 'the body stops writing last_message_at', file: MIG,
      find: '  set last_message = new.body,\n      last_message_at = new.created_at,\n      updated_at = now()\n  where id = new.conversation_id\n',
      replace: '  set last_message = new.body,\n      updated_at = now()\n  where id = new.conversation_id\n' },
    // ── the grants ──
    { name: 'anon keeps the default EXECUTE', file: MIG,
      find: 'revoke all on function public.messages_touch_conversation() from anon;\n',
      replace: '' },
    { name: 'authenticated keeps the default EXECUTE', file: MIG,
      find: 'revoke all on function public.messages_touch_conversation() from authenticated;\n',
      replace: '' },
    // ── the trigger ──
    { name: 'the trigger fires BEFORE insert', file: MIG,
      find: '  after insert on public.messages\n  for each row execute function public.messages_touch_conversation();',
      replace: '  before insert on public.messages\n  for each row execute function public.messages_touch_conversation();' },
    { name: 'the trigger is dropped and never recreated', file: MIG,
      find: 'drop trigger if exists messages_touch_conversation on public.messages;\ncreate trigger messages_touch_conversation\n  after insert on public.messages\n  for each row execute function public.messages_touch_conversation();\n',
      replace: 'drop trigger if exists messages_touch_conversation on public.messages;\n' },
    // ── the backfill ──
    { name: 'the backfill takes the OLDEST message as the preview', file: MIG,
      find: '  order by conversation_id, created_at desc, id desc\n) m\nwhere m.conversation_id = c.id\n  and (c.last_message_at is distinct from m.created_at',
      replace: '  order by conversation_id, created_at asc, id asc\n) m\nwhere m.conversation_id = c.id\n  and (c.last_message_at is distinct from m.created_at' },
    { name: 'the backfill rewrites every conversation on every run', file: MIG,
      find: 'where m.conversation_id = c.id\n  and (c.last_message_at is distinct from m.created_at\n       or not exists (\n         select 1 from public.messages x\n         where x.conversation_id = c.id\n           and x.created_at = m.created_at\n           and x.body = c.last_message));\n',
      replace: 'where m.conversation_id = c.id;\n' },
    { name: 'the backfill reads a tie as one row: a preview showing the other tied message is rewritten on every run', file: MIG,
      find: '  and (c.last_message_at is distinct from m.created_at\n       or not exists (\n         select 1 from public.messages x\n         where x.conversation_id = c.id\n           and x.created_at = m.created_at\n           and x.body = c.last_message));\n',
      replace: '  and (c.last_message_at is distinct from m.created_at\n       or c.last_message is distinct from m.body);\n' },
    { name: 'the guard reads a tie as one row, so a correct preview of the other tied message fails the file', file: MIG,
      find: "  where c.last_message_at is distinct from m.created_at\n     or not exists (\n       select 1 from public.messages x\n       where x.conversation_id = c.id\n         and x.created_at = m.created_at\n         and x.body = c.last_message);\n  if v_stale > 0 then",
      replace: "  where c.last_message_at is distinct from m.created_at;\n  if v_stale > 0 then" },
    { name: 'updated_at can move backwards in the backfill', file: MIG,
      find: '    updated_at = greatest(c.updated_at, m.created_at)\n',
      replace: '    updated_at = m.created_at\n' },
    // ── the guard ──
    { name: 'the guard no longer checks the body shape', file: MIG,
      find: "  if position('set last_message = new.body' in v_src) = 0 then\n    raise exception 'messages_touch_conversation must write last_message from the new row';\n  end if;\n",
      replace: '' },
    { name: 'the guard accepts a disabled trigger', file: MIG,
      find: "  if v_enabled = 'D' then\n    raise exception 'the messages_touch_conversation trigger exists but is disabled';\n  end if;\n",
      replace: '' },
    { name: 'the guard stops measuring the backfill', file: MIG,
      find: "  if v_stale > 0 then\n    raise exception '% conversation(s) still preview something other than their latest message after the backfill', v_stale;\n  end if;\n",
      replace: '' },
    { name: 'a RAISE names a placeholder it gives no argument for (a compile-time abort of the whole file)', file: MIG,
      find: "    raise exception 'messages_touch_conversation must pin pg_temp; search_path is %', v_path;",
      replace: "    raise exception 'messages_touch_conversation must pin pg_temp; search_path is %';" },
    { name: 'the file is no longer one transaction', file: MIG,
      find: "\nbegin;\nset local lock_timeout = '10s';\n",
      replace: '\n' },
    // ── the records ──
    { name: 'the live capture forgets the restored trigger definer', file: FIXTURE,
      find: '    "messages_touch_conversation",\n',
      replace: '' },
    { name: 'the agreement test\'s history no longer names which migration restored the function', file: AGREEMENT,
      find: 'restored by\n// 2026-10-09-restore-messages-touch-conversation.sql and present on this capture',
      replace: 'restored and present on this capture' },
    { name: 'the route no longer says the trigger maintains the preview', file: ROUTE,
      find: '//        messages_touch_conversation trigger.\n',
      replace: '//        trigger.\n' },
  ],
};
