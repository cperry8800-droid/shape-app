// tests/chat-time.test.mjs
// A chat's message times. A channel's messages read SYNCED under every bubble, in English, because
// the data layer kept no time for them (and a coach or member thread with no messages loaded read
// SYNCED from its preview). Each message now keeps its stamp as `at`, and the bubble and the team
// list say it in the app's language: the clock today, the weekday this past week, else the date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsChatStamp, bsChatClock, bsChatDayLabel } from '../mobile-app/src/services/chatTime.mjs';
import { bsReplyFromMetadata } from '../mobile-app/src/services/chatReply.mjs';
import { bsGroceryFromMetadata } from '../mobile-app/src/services/groceryShare.mjs';
import { isShapeWelcome } from '../mobile-app/src/services/shapeWelcome.mjs';

const NOW = new Date(2026, 9, 30, 15, 0); // a Friday afternoon, local time
const at = (y, m, d, h, mi) => new Date(y, m, d, h, mi).toISOString();

test('today reads the clock, this past week the weekday, older the date, another year with its year', () => {
  const s = (iso, loc, o = {}) => bsChatStamp(iso, loc, { ...o, now: NOW });
  assert.match(s(at(2026, 9, 30, 8, 48), 'en-US'), /^8:48\sAM$/);
  assert.match(s(at(2026, 9, 29, 20, 5), 'en-US'), /^Thu\s8:05\sPM$/);
  assert.match(s(at(2026, 9, 20, 8, 48), 'en-US'), /^Oct 20, 8:48\sAM$/);
  assert.match(s(at(2025, 11, 31, 23, 30), 'en-US'), /^Dec 31, 2025, 11:30\sPM$/);
  // A thread row says the shorter of the two.
  assert.match(s(at(2026, 9, 30, 8, 48), 'en-US', { list: true }), /^8:48\sAM$/);
  assert.equal(s(at(2026, 9, 29, 20, 5), 'en-US', { list: true }), 'Thu');
  assert.equal(s(at(2026, 9, 20, 8, 48), 'en-US', { list: true }), 'Oct 20');
  assert.equal(s(at(2025, 11, 31, 23, 30), 'en-US', { list: true }), 'Dec 31, 2025');
  // Six days back is still a weekday; seven is a date.
  assert.match(s(at(2026, 9, 24, 9, 0), 'en-US', { list: true }), /^Sat$/);
  assert.equal(s(at(2026, 9, 23, 9, 0), 'en-US', { list: true }), 'Oct 23');
  // A sender's clock a little ahead is still today.
  assert.match(s(at(2026, 9, 30, 15, 2), 'en-US'), /^3:02\sPM$/);
});

test('in the app\'s language: German reads its own clock, weekday and date', () => {
  const s = (iso, o = {}) => bsChatStamp(iso, 'de-DE', { ...o, now: NOW });
  assert.equal(s(at(2026, 9, 30, 20, 5)), '20:05');
  assert.equal(s(at(2026, 9, 29, 20, 5)), 'Do., 20:05');
  assert.equal(s(at(2026, 9, 20, 8, 48), { list: true }), '20. Okt.');
});

test('no stamp, a bad stamp or a locale Intl refuses never throws', () => {
  for (const iso of [null, undefined, '', 'not a date']) assert.equal(bsChatStamp(iso, 'en-US', { now: NOW }), '');
  assert.ok(bsChatStamp(at(2026, 9, 30, 8, 48), 'xx-!!', { now: NOW }).includes('8:48'));
});

// ── The data layer ──────────────────────────────────────────────────────────────────────────────
const SRC = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const fnSrc = (name) => {
  const plain = SRC.indexOf(`function ${name}(`);
  const at = SRC.slice(plain - 6, plain) === 'async ' ? plain - 6 : plain;
  let depth = 0, i = SRC.indexOf(') {', plain) + 2;
  for (; i < SRC.length; i++) { if (SRC[i] === '{') depth++; else if (SRC[i] === '}' && --depth === 0) break; }
  return SRC.slice(at, i + 1);
};
const load = (name, deps) => new Function(...Object.keys(deps), `${fnSrc('chatTimeOf')}; ${fnSrc(name)}; return ${name};`)(...Object.values(deps));
const ROWS = [
  { id: 'm1', sender_id: 'u-ana', author_name: 'Ana', body: 'Six tomorrow?', created_at: at(2026, 9, 27, 18, 30) },
  { id: 'm2', sender_id: 'u-me', author_name: 'Me', body: 'In', created_at: at(2026, 9, 30, 9, 15) },
];
// The query listChannelMessages makes: from → select → eq → order → limit.
const fakeSupabase = (rows) => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
  return { from: () => q };
};

test('a channel\'s messages keep their stamp and read a time, not SYNCED', async () => {
  const listChannelMessages = load('listChannelMessages', { state: { user: { id: 'u-me' } }, supabase: fakeSupabase(ROWS), bsChatStamp, bsReplyFromMetadata });
  const { data } = await listChannelMessages('ch-1');
  assert.deepEqual(data.map((m) => m.at), ROWS.map((r) => r.created_at));
  for (const m of data) {
    assert.notEqual(m.time, 'synced');
    assert.equal(m.time, bsChatStamp(m.at, undefined));
  }
  assert.deepEqual(data.map((m) => [m.who, m.me]), [['Ana', false], ['You', true]]);
  // Each keeps its sender's account, as a realtime message does: the thread keys runs and faces by it
  // (Copilot on #2556: two members sharing a name were one run).
  assert.deepEqual(data.map((m) => m.userId), ['u-ana', 'u-me']);
});

test('coach and member threads keep the last message\'s stamp, and a thread with none reads now', () => {
  const state = { user: { id: 'u-me' } };
  const deps = { state, isShapeWelcome, bsGroceryFromMetadata, bsReplyFromMetadata, bsChatStamp };
  const conversationToThread = load('conversationToThread', deps);
  const memberThreadFromRow = load('memberThreadFromRow', deps);
  const msgs = [{ id: 'a', sender_id: 'u-coach', body: 'Hi', metadata: {}, created_at: ROWS[0].created_at }];
  const coach = conversationToThread({ id: 'c1', provider_role: 'trainer', client_id: 'u-me', title: 'Tom', last_message: 'Hi', last_message_at: ROWS[0].created_at }, msgs);
  const member = memberThreadFromRow({ conversation_id: 'c2', other_name: 'Ana', last_message: 'Hi', last_message_at: ROWS[0].created_at }, msgs);
  for (const th of [coach, member]) {
    assert.equal(th.at, ROWS[0].created_at);
    assert.equal(th.time, bsChatStamp(ROWS[0].created_at, undefined));
    assert.deepEqual(th.messages.map((m) => [m.at, m.time]), [[ROWS[0].created_at, bsChatStamp(ROWS[0].created_at, undefined)]]);
  }
  const fresh = memberThreadFromRow({ conversation_id: 'c3', other_name: 'Ana' }, []);
  assert.equal(fresh.time, 'now');
  assert.equal(fresh.at, null);
  assert.doesNotMatch(SRC, /time: [^,\n]*'synced'/, 'no chat mapper writes synced');
});

// ── The thread and the team list ───────────────────────────────────────────────────────────────
const { loadBroadsheet, drive } = await import('./helpers/broadsheet-mount.mjs');
const { BSChatThread } = await loadBroadsheet(['BSChatThread']);

test('a channel opened in German says each message\'s time in German', async () => {
  const listChannelMessages = load('listChannelMessages', { state: { user: { id: 'u-me' } }, supabase: fakeSupabase(ROWS), bsChatStamp, bsReplyFromMetadata });
  const { data } = await listChannelMessages('ch-1');
  const had = globalThis.ShapeI18n;
  globalThis.ShapeI18n = { intlLocale: () => 'de-DE', current: () => 'de', t: () => undefined };
  try {
    const text = drive(BSChatThread, { thread: { who: 'Run club', group: true, channelId: 'ch-1', messages: data }, eyebrow: 'CHANNEL', onBack() {} }).text;
    // Each day is said once, over its messages, and each message its clock (the day dividers, owner,
    // 2026-11-01): the German day and the German clock.
    for (const m of data) {
      const day = bsChatDayLabel(m.at, 'de-DE');
      if (day.text) assert.ok(text.includes(day.text), `${m.t}: ${day.text} in ${text.slice(0, 160)}`);
      assert.ok(text.includes(bsChatClock(m.at, 'de-DE')), `${m.t}: ${bsChatClock(m.at, 'de-DE')} in ${text.slice(0, 160)}`);
    }
    assert.doesNotMatch(text, /synced/i);
  } finally { globalThis.ShapeI18n = had; }
});

// Codex P2 on 671fa08: the one place that opens a thread built it without the row's stamp, so a thread
// opened before its history loaded (or whose history failed) showed its preview as "now".
test('a thread opened on its preview alone says the preview\'s time', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const open = client.slice(client.indexOf('<BSChatThread'), client.indexOf('<BSChatThread') + 900);
  assert.match(open, /last: openChat\.last, time: '', at: openChat\.at \|\| null,/);
  const stamp = ROWS[0].created_at;
  const had = globalThis.ShapeI18n;
  globalThis.ShapeI18n = { intlLocale: () => 'de-DE', current: () => 'de', t: () => undefined };
  try {
    const text = drive(BSChatThread, { thread: { who: 'Ana', last: 'Six tomorrow?', time: '', at: stamp, messages: [], conversationId: 'c-9' }, eyebrow: 'DM', onBack() {} }).text;
    // Its day over it and its clock under it (the day dividers, 2026-11-01).
    const day = bsChatDayLabel(stamp, 'de-DE');
    assert.ok(text.includes('Six tomorrow?') && text.includes(bsChatClock(stamp, 'de-DE')) && (!day.text || text.includes(day.text)), text.slice(0, 160));
    assert.ok(!/now/i.test(text.slice(text.indexOf('Six tomorrow?'))), 'not "now"');
  } finally { globalThis.ShapeI18n = had; }
});

test('the team list and a live message use the stamp too', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  // The row's time is the last message's (the thread's, with none loaded), in the list's shorter form.
  assert.match(client, /const stampAt = \(lastM \? lastM\.at : f\.at\) \|\| null;\s+const time = f\.time \|\| \(stampAt && bsChatStamp\(stampAt, bsDateLocale\(\), \{ list: true \}\)\) \|\| \(lastM && lastM\.time\) \|\| '';/);
  // The coach and member rows carry the stamps through (Codex P2 on 0c65f77: the coach rows rebuilt each
  // message without its `at`, so the list fell back to the bubble's long form).
  const rows = client.slice(client.indexOf('const threadRows = (coachThreads || [])'), client.indexOf('const startDm = async (m) =>'));
  assert.equal((rows.match(/at: th\.at \|\| null,/g) || []).length, 2, 'both row kinds keep the thread\'s stamp');
  assert.match(rows, /time: m\.time \|\| '', at: m\.at \|\| null, me:/, 'a coach row\'s messages keep theirs');
  assert.match(rows, /messages: th\.messages \|\| \[\],/, 'a member row keeps its messages as they are');
  // A message that arrives while the thread is open carries its row's stamp.
  const live = client.slice(client.indexOf('// Realtime: new messages from others drop into the open thread live.'));
  assert.equal((live.slice(0, 3000).match(/at: row\.created_at \|\| null/g) || []).length, 3);
});
