// The restore of messages_touch_conversation (2026-10-09-restore-messages-touch-conversation.sql).
//
// 2026-05-02-conversations-messages.sql declares the trigger function and its AFTER INSERT trigger
// on public.messages; production had neither (read 2026-10-08), so a sent message never wrote its
// conversation's last_message / last_message_at, which the coach inbox, the member DM list, the
// coach "last contact" leg and the app's thread list all read. The replica run in the migration's
// own header is the behavioural test (a member's and a coach's messages, a backdated one, the
// backfill, the re-run). What this file pins is the SHAPE the replica run was run against: the
// definer model's reading of the function (a pinned SECURITY DEFINER trigger function with no
// EXECUTE for anon or authenticated), the trigger, the two deliberate changes from the 2026-05-02
// body, the backfill's definition of "latest", and the guard's checks. A mutation spec
// (tests/mutations/messages-touch-restore-2026-10-09.mutations.mjs) breaks each clause.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from './helpers/definer-model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'supabase-migrations');
const FILE = '2026-10-09-restore-messages-touch-conversation.sql';
const SQL = fs.readFileSync(join(DIR, FILE), 'utf8');
const ORIGINAL = fs.readFileSync(join(DIR, '2026-05-02-conversations-messages.sql'), 'utf8');

const TOUCH = /update public\.conversations\n\s+set last_message = new\.body,\n\s+last_message_at = new\.created_at,\n\s+updated_at = now\(\)\n\s+where id = new\.conversation_id/;

let realModel;
const real = () => (realModel ??= M.replayDir(DIR));

test('the model reads the restored function as a pinned SECURITY DEFINER trigger function that no client role can execute', () => {
  const fns = [...real().fns.values()].filter((f) => f.schema === 'public' && f.name === 'messages_touch_conversation');
  assert.equal(fns.length, 1, 'one signature');
  const fn = fns[0];
  assert.equal(fn.trigger, true, 'returns trigger');
  assert.equal(fn.definer, true, 'SECURITY DEFINER: it writes a conversation row the sender need not hold an UPDATE policy on');
  assert.equal(M.pgTempPinned(fn), true, 'pg_temp is the last search_path entry');
  const d = M.describeFunction(fn);
  assert.equal(d.anon, false, 'anon holds no EXECUTE');
  assert.equal(d.authenticated, false, 'authenticated holds no EXECUTE');
  // The restore is the LAST word on this function in the replay: nothing after it redefines it.
  const files = M.orderedMigrationFiles(DIR);
  const later = files.slice(files.indexOf(FILE) + 1).filter((f) => /messages_touch_conversation/.test(fs.readFileSync(join(DIR, f), 'utf8')));
  assert.deepEqual(later, [], 'a later migration names the function: re-read this test against it');
});

test('the function body is the 2026-05-02 touch with its two deliberate changes', () => {
  assert.match(ORIGINAL, TOUCH, 'the premise moved: the 2026-05-02 body no longer writes these three columns');
  assert.match(SQL, TOUCH, 'the restore writes the same three columns from the new row');
  assert.match(SQL, /set search_path = public, pg_temp\nas \$\$/, 'the pin is in the definition, not left to a later sweep');
  assert.match(SQL, /where id = new\.conversation_id\n\s+and \(last_message_at is null or last_message_at <= new\.created_at\);/,
    'a message older than the previewed one does not overwrite the preview');
  assert.doesNotMatch(ORIGINAL, /last_message_at <= new\.created_at/, 'the premise moved: the original now carries the guard too, so it is no longer a change to note');
});

test('the trigger is recreated as an AFTER INSERT row trigger on public.messages, and the default grants are revoked', () => {
  assert.match(SQL, /drop trigger if exists messages_touch_conversation on public\.messages;\ncreate trigger messages_touch_conversation\n\s+after insert on public\.messages\n\s+for each row execute function public\.messages_touch_conversation\(\);/);
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.messages_touch_conversation\\(\\) from ${role};`), `revoked from ${role}`);
  }
  assert.doesNotMatch(SQL, /grant execute on function public\.messages_touch_conversation/, 'nothing is granted back: a trigger function is never called directly');
});

test('the backfill writes each conversation its latest message and nothing to a row that already shows it', () => {
  const backfill = SQL.slice(SQL.indexOf('-- ===== Backfill ====='), SQL.indexOf('-- ===== Guard ====='));
  assert.match(backfill, /select distinct on \(conversation_id\) conversation_id, body, created_at\n\s+from public\.messages\n\s+order by conversation_id, created_at desc, id desc/,
    '"latest" is the greatest created_at, ties broken by id, the same reading the trigger\'s guard uses');
  assert.match(backfill, /where m\.conversation_id = c\.id\n\s+and \(c\.last_message_at is distinct from m\.created_at\n\s+or c\.last_message is distinct from m\.body\);/,
    'a row already previewing its latest message is not rewritten, so a re-run moves no updated_at');
  assert.match(backfill, /updated_at = greatest\(c\.updated_at, m\.created_at\)/, 'updated_at never moves backwards');
  assert.doesNotMatch(backfill, /delete|insert into/, 'the backfill only updates');
});

test('the guard asserts the function, its pin, its body, the trigger and the backfill, and is one transaction', () => {
  assert.match(SQL, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(SQL, /\$guard\$;\n\ncommit;\n$/);
  const guard = SQL.slice(SQL.indexOf('do $guard$'), SQL.lastIndexOf('$guard$;'));
  assert.match(guard, /if position\('pg_temp' in v_path\) = 0 then/);
  assert.match(guard, /if position\('set last_message = new\.body' in v_src\) = 0 then/, 'the shape, not just the metadata');
  assert.match(guard, /if v_anon or v_auth then/);
  assert.match(guard, /t\.tgname = 'messages_touch_conversation'/);
  assert.match(guard, /if v_enabled = 'D' then/, 'a disabled trigger is not a restored one');
  assert.match(guard, /where c\.last_message_at is distinct from m\.created_at\n\s+or c\.last_message is distinct from m\.body;\n\s+if v_stale > 0 then/, 'the backfill\'s claim is measured');
  assert.doesNotMatch(guard, /\bexecute\b/, 'no dynamic SQL: the definer model reads the block as inert');
  // Every RAISE takes exactly the arguments its format names (a bare % aborts the file at compile time).
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((s) => s.trim()).length : 0;
    assert.equal(pct, args, `RAISE "${m[1].slice(0, 50)}": ${pct} placeholder(s), ${args} argument(s)`);
  }
});

test('the records that name the defect name this file, so a re-capture removes them together', () => {
  const agreement = fs.readFileSync(join(ROOT, 'tests/definer-live-agreement.test.mjs'), 'utf8');
  const entry = agreement.slice(agreement.indexOf("name: 'messages_touch_conversation'"), agreement.indexOf('},', agreement.indexOf("name: 'messages_touch_conversation'")));
  assert.match(entry, new RegExp(FILE.replace(/[.]/g, '\\.')), 'KNOWN_MODEL_DRIFT\'s entry names the restore migration');
  const route = fs.readFileSync(join(ROOT, 'src/app/api/conversations/[id]/messages/route.ts'), 'utf8');
  assert.match(route, /messages_touch_conversation trigger/, 'the premise moved: the route no longer says the trigger maintains the preview');
});
