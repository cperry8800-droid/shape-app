// A client never reads, or is told about, their coaches' care-team thread (the notification audit,
// 2026-10-15; owner: "fix the privacy one first").
//
// A care-team thread (get_or_create_coach_coach_conversation) is direct, has no provider, carries
// client_id = the client it is ABOUT, and has the two coaches as its only participants. The access
// function granted it to that client, and the message trigger sent each coach's words to them.
// The migration was run on a PostgreSQL 16 copy with production's policies, before and after (the
// PR says what each run showed); this file holds the shipped text and the website's routing to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const SQL = read('supabase-migrations/2026-10-15-keep-care-team-private.sql');
// The code, without its line comments (no string in this file carries a `--`).
const CODE = SQL.replace(/--[^\n]*/g, '');

test('access: a thread\'s client reads it only when it has a provider; the other ways in are unchanged', () => {
  const fn = CODE.slice(CODE.indexOf('create or replace function public.can_access_conversation('), CODE.indexOf('$$;', CODE.indexOf('can_access_conversation(')));
  assert.match(fn, /security definer\s+set search_path = public, pg_temp/);
  assert.match(fn, /\(c\.client_id = auth\.uid\(\) and c\.provider_role is not null\)/, 'the client branch needs a provider');
  assert.doesNotMatch(fn.replace(/\(c\.client_id = auth\.uid\(\) and c\.provider_role is not null\)/, ''), /c\.client_id = auth\.uid\(\)/, 'no bare client branch is left');
  // A participant (the coaches of a care team), and the owner of the thread's listing, as before.
  assert.match(fn, /select 1\s+from public\.conversation_participants cp\s+where cp\.conversation_id = c\.id and cp\.user_id = auth\.uid\(\)/);
  // …and on a care-team thread only while the participant still coaches its client (Codex on #2367):
  // an active or trialing subscription to a listing they own.
  const part = fn.slice(fn.indexOf('from public.conversation_participants cp'), fn.indexOf("c.provider_role = 'trainer'"));
  assert.match(part, /and \(\s+c\.provider_role is not null or c\.dm_key is not null or c\.client_id is null\s+or exists \(\s+select 1 from public\.subscriptions s\s+where s\.client_id = c\.client_id\s+and s\.status in \('active', 'trialing'\)/);
  assert.match(part, /s\.provider_role = 'trainer' and exists \(\s+select 1 from public\.trainers t where t\.id = s\.provider_id and t\.owner_id = auth\.uid\(\)/);
  assert.match(part, /s\.provider_role = 'nutritionist' and exists \(\s+select 1 from public\.nutritionists n where n\.id = s\.provider_id and n\.owner_id = auth\.uid\(\)/);
  assert.match(CODE, /raise exception 'can_access_conversation still lets a former coach read a care-team thread';/);
  assert.match(fn, /c\.provider_role = 'trainer'\s+and exists \(\s+select 1 from public\.trainers t\s+where t\.id = c\.provider_id and t\.owner_id = auth\.uid\(\)/);
  assert.match(fn, /c\.provider_role = 'nutritionist'\s+and exists \(\s+select 1 from public\.nutritionists n\s+where n\.id = c\.provider_id and n\.owner_id = auth\.uid\(\)/);
  // A client who had joined a care-team thread is taken out, and the guard holds it.
  assert.match(CODE, /delete from public\.conversation_participants cp\s+using public\.conversations c\s+where cp\.conversation_id = c\.id\s+and c\.kind = 'direct' and c\.provider_role is null and c\.dm_key is null\s+and c\.client_id is not null and cp\.user_id = c\.client_id;/);
  assert.match(CODE, /raise exception 'can_access_conversation still grants a care-team thread to its client';/);
  assert.match(CODE, /raise exception 'a client is still a participant of a care-team thread';/);
});

test('the migration sorts after the coach-thread file whose trigger it restates (Codex on #2367)', () => {
  const files = readdirSync(join(ROOT, 'supabase-migrations')).filter((f) => f.startsWith('2026-10-15-')).sort();
  assert.ok(files.indexOf('2026-10-15-coach-thread.sql') >= 0);
  assert.ok(files.indexOf('2026-10-15-keep-care-team-private.sql') > files.indexOf('2026-10-15-coach-thread.sql'), files.join(', '));
  assert.match(SQL, /The body is 2026-10-15-coach-thread\.sql's, with the care-team branch first\./);
});

test('notifications: a care-team message goes to the other coaches, never to the client it is about', () => {
  const fn = CODE.slice(CODE.indexOf('create or replace function public.notify_on_new_message()'), CODE.indexOf('$$;', CODE.indexOf('notify_on_new_message()')));
  const care = fn.slice(fn.indexOf('if conv.provider_role is null and conv.dm_key is null and conv.client_id is not null then'), fn.indexOf('return new;', fn.indexOf('conv.dm_key is null')) + 'return new;'.length);
  assert.ok(care.length > 100, 'the care-team branch moved');
  assert.match(care, /from public\.conversation_participants cp\s+where cp\.conversation_id = new\.conversation_id\s+and cp\.user_id is distinct from new\.sender_id\s+and cp\.user_id <> conv\.client_id\s+and exists \(\s+select 1 from public\.subscriptions s\s+where s\.client_id = conv\.client_id\s+and s\.status in \('active', 'trialing'\)/);
  // Only coaches who still coach the client: the recipient owns a listing with that subscription.
  assert.match(care, /s\.provider_role = 'trainer' and exists \(\s+select 1 from public\.trainers t where t\.id = s\.provider_id and t\.owner_id = cp\.user_id/);
  assert.match(care, /s\.provider_role = 'nutritionist' and exists \(\s+select 1 from public\.nutritionists n where n\.id = s\.provider_id and n\.owner_id = cp\.user_id/);
  assert.match(CODE, /raise exception 'notify_on_new_message still tells a former coach about a care-team message';/);
  assert.match(care, /jsonb_build_object\('conversationId', new\.conversation_id, 'careTeam', true\)/);
  // It runs before the client/coach branches, so a care-team message never reaches `recipient := conv.client_id`.
  assert.ok(fn.indexOf('conv.dm_key is null and conv.client_id is not null then') < fn.indexOf('recipient := conv.client_id;'));
  // The rest is #2360's: a client thread notifies the other side, with the thread's role.
  assert.match(fn, /select client_id, provider_role, provider_id, dm_key\s+into conv/);
  assert.match(fn, /jsonb_build_object\('conversationId', new\.conversation_id\)\s+\|\| case when conv\.provider_role is not null then jsonb_build_object\('providerRole', conv\.provider_role\) else '\{\}'::jsonb end/);
  assert.match(CODE, /if position\('''careTeam''' in v_notify\) = 0 or position\('providerRole' in v_notify\) = 0 then/);
});

test('the website opens a coach\'s care-team notification in the bubble, where coaches read that thread', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const lib = new Function('window', `${fn}; return { dashInboxHref, dashInboxThreadFor, dashInboxChatRequest };`)({});
  // As 2026-10-15-notification-routes.sql writes it (side: 'coach', its recipients are coaches), and
  // as a row from before `side`.
  for (const care of [{ route: 'messages', data: { conversationId: 'c-9', careTeam: true, side: 'coach' } }, { route: 'messages', data: { conversationId: 'c-9', careTeam: true } }]) {
    for (const role of ['trainer', 'nutritionist']) {
      assert.equal(lib.dashInboxThreadFor(care, role), 'c-9', `${role}: the bubble`);
      assert.equal(lib.dashInboxHref(care, role), null, `${role}: never a Messages page, which would call it missing`);
    }
  }
  const care = { route: 'messages', data: { conversationId: 'c-9', careTeam: true, side: 'coach' } };
  assert.deepEqual(lib.dashInboxChatRequest(care, 'c-9'), { conversationId: 'c-9', who: 'Care team', role: 'Care team' });
  // A coach's ordinary client message still goes to their Messages page.
  const plain = { route: 'messages', data: { conversationId: 'c-1', providerRole: 'trainer' } };
  assert.equal(lib.dashInboxThreadFor(plain, 'trainer'), null);
  assert.equal(lib.dashInboxHref(plain, 'trainer'), '/newdesign/TrainerMessages.html?conversation=c-1');
  // Where coaches open a care-team thread on the website: the bubble, by id.
  assert.match(read('public/newdesign/coachClientDetail.jsx'), /window\.__openChat\(\{\s+who: counterpart\.name,[\s\S]{0,200}conversationId: j\.conversationId,/);
  // The chat widget's note says the read is closed, and its filter stays.
  const widget = read('public/newdesign/chatWidget.jsx');
  assert.match(widget, /AND THE MEMBER CAN NO LONGER READ IT: 2026-10-15-keep-care-team-private\.sql/);
  assert.match(widget, /\.not\("provider_role", "is", null\)/);
});

test('the app opens a care-team notification as a thread, from the list and from a push', async () => {
  const ROUTER = await import('../mobile-app/src/broadsheet/bsNotificationRoute.mjs');
  const events = [];
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const saved = [globalThis.window, globalThis.CustomEvent];
  globalThis.window = { dispatchEvent: (e) => events.push([e.type, e.detail]) };
  globalThis.CustomEvent = CustomEvent;
  try {
    assert.equal(ROUTER.bsRouteNotification('messages', { conversationId: 'c-9', careTeam: true, side: 'coach' }), true);
  } finally { [globalThis.window, globalThis.CustomEvent] = saved; }
  // The care team is the coach side, with no listing named: any coach app holds it, and the member
  // app hands it to the account's coach app (bsChatOwner).
  assert.deepEqual(events, [['shape:openConversation', { conversationId: 'c-9', side: 'coach', role: null, fromNotification: true }]]);
  assert.equal(ROUTER.bsChatOwner(events[0][1], 'trainer'), null);
  assert.equal(ROUTER.bsChatOwner(events[0][1], 'nutritionist'), null);
  // A push carries the thread and its side in its route: the dispatch writes it with the shared
  // table's canonicalRoute (messages + conversationId + side → chat:coach:<id>).
  const R = await import('../public/newdesign/notificationRoutes.mjs');
  assert.equal(R.canonicalRoute('messages', { conversationId: 'c-9', careTeam: true, side: 'coach' }), 'chat:coach:c-9');
  assert.match(read('src/app/api/push/dispatch/route.ts'), /return canonicalRoute\(record\.route \?\? '', record\.data \?\? null\);/);
});
