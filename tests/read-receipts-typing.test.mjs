// Read receipts and the typing indicator (owner, 2026-11-02: "build read receipts and typing indicator
// next"). The pure rules (services/chatSignals.mjs), the wire (shapeBackend.js's thread signals and
// conversation_seen()), the thread drawn with the shipping module, and the migration's shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  BS_TYPING, BS_SIGNALS_EMPTY, bsTypingFromPayload, bsTypingNext, bsTypingLive, bsTypingSend, bsTypingWho,
  bsSeenFromRpc, bsReceiptFor, createThreadSignalStore, bsMergeThreadHistory,
} from '../mobile-app/src/services/chatSignals.mjs';
import { loadBroadsheet, drive, textOf, ROOT, SHIM } from './helpers/broadsheet-mount.mjs';

const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const MIGRATION = readFileSync(join(ROOT, 'supabase-migrations/2026-11-02-read-receipts.sql'), 'utf8');

// ── The rules ──────────────────────────────────────────────────────────────────────────────────
test('a typing signal keeps an account id and a short, plain name, and never your own', () => {
  assert.deepEqual(bsTypingFromPayload({ u: 'u-ari', n: 'Ari', on: true }), { userId: 'u-ari', name: 'Ari', on: true });
  assert.deepEqual(bsTypingFromPayload({ u: 'u-ari' }), { userId: 'u-ari', name: '', on: true }, 'on unless it says off');
  assert.equal(bsTypingFromPayload({ u: 'u-ari', on: false }).on, false);
  for (const bad of [null, 'u-ari', ['u-ari'], {}, { u: '' }, { u: 7 }, { u: 'x'.repeat(BS_TYPING.ID_MAX + 1) }]) {
    assert.equal(bsTypingFromPayload(bad), null, JSON.stringify(bad));
  }
  assert.equal(bsTypingFromPayload({ u: 'u-me', n: 'Me' }, { myId: 'u-me' }), null, 'your own (a second tab) is dropped');
  const dressed = bsTypingFromPayload({ u: 'u-x', n: '  Ma‮ya​ \n Chen\u0007  ' });
  assert.equal(dressed.name, 'Maya Chen', 'bidi, zero-width and control marks go; spaces collapse');
  assert.equal(bsTypingFromPayload({ u: 'u-x', n: 'n'.repeat(90) }).name.length, BS_TYPING.NAME_MAX);
  assert.equal(bsTypingFromPayload({ u: 'u-x', n: 5 }).name, '');
});

test('who is typing: an "on" holds them EXPIRE_MS, an "off" takes them off at once', () => {
  let map = bsTypingNext({}, { userId: 'a', name: 'Ari', on: true }, 1000);
  assert.deepEqual(map, { a: { name: 'Ari', until: 1000 + BS_TYPING.EXPIRE_MS } });
  map = bsTypingNext(map, { userId: 'a', name: '', on: true }, 2000);
  assert.equal(map.a.name, 'Ari', 'a later signal without a name keeps the name');
  assert.deepEqual(bsTypingLive(map, 2000 + BS_TYPING.EXPIRE_MS - 1), [{ userId: 'a', name: 'Ari' }]);
  assert.deepEqual(bsTypingLive(map, 2000 + BS_TYPING.EXPIRE_MS), [], 'gone at its expiry');
  assert.deepEqual(bsTypingNext(map, { userId: 'a', on: false }, 2001), {});
  assert.deepEqual(bsTypingNext(map, null, 3), map, 'nothing to apply');
});

test('the composer sends an "on" every SEND_EVERY_MS while there are words, and one "off" when they go', () => {
  assert.equal(bsTypingSend(0, 'h', 10_000), 'on');
  assert.equal(bsTypingSend(10_000, 'he', 10_000 + BS_TYPING.SEND_EVERY_MS - 1), null);
  assert.equal(bsTypingSend(10_000, 'hel', 10_000 + BS_TYPING.SEND_EVERY_MS), 'on');
  assert.equal(bsTypingSend(10_000, '   ', 10_001), 'off', 'spaces are no words');
  assert.equal(bsTypingSend(0, '', 10_001), null, 'nothing was said, so no "off"');
  assert.equal(bsTypingSend(0, null, 1), null);
});

test('the typing line: one name, two, or several', () => {
  assert.deepEqual(bsTypingWho([]), { kind: 'none' });
  assert.deepEqual(bsTypingWho([{ name: 'Ari' }]), { kind: 'one', a: 'Ari' });
  assert.deepEqual(bsTypingWho([{ name: 'Ari' }, { name: 'Sam' }]), { kind: 'two', a: 'Ari', b: 'Sam' });
  assert.deepEqual(bsTypingWho([{ name: 'A' }, { name: 'B' }, { name: 'C' }]), { kind: 'many' });
  assert.deepEqual(bsTypingWho(null), { kind: 'none' });
});

test('conversation_seen()\'s answer: the others\' latest read times, or null when none may show', () => {
  const seen = bsSeenFromRpc({ on: true, seen: [
    { user_id: 'u-maya', last_read_at: '2026-11-02T10:05:00+00:00' },
    { user_id: 'u-maya', last_read_at: '2026-11-02T09:00:00+00:00' },
    { user_id: 'u-me', last_read_at: '2026-11-02T11:00:00+00:00' },
    { user_id: 'u-bad', last_read_at: 'not a time' },
    { user_id: 7, last_read_at: '2026-11-02T10:00:00Z' },
    null,
  ] }, { myId: 'u-me' });
  assert.deepEqual(seen, { 'u-maya': '2026-11-02T10:05:00.000Z' });
  assert.deepEqual(bsSeenFromRpc({ on: true, seen: [] }), {}, 'on, nobody has read: Sent');
  for (const off of [{ on: false, seen: [] }, { on: 'true', seen: [] }, { on: true }, { on: true, seen: {} }, [], null, 'x']) {
    assert.equal(bsSeenFromRpc(off), null, JSON.stringify(off));
  }
});

const mine = (id, at, extra = {}) => ({ id, who: 'You', t: 'Mine', at, me: true, ...extra });
const theirs = (id, at) => ({ id, who: 'Maya', userId: 'u-maya', t: 'Theirs', at, me: false });
test('the receipt: your stored last message reads Seen once they read past it, else Sent', () => {
  const msgs = [theirs('a', '2026-11-02T09:00:00Z'), mine('b', '2026-11-02T10:00:00Z')];
  assert.deepEqual(bsReceiptFor(msgs, {}), { index: 1, state: 'sent', count: 0 });
  assert.deepEqual(bsReceiptFor(msgs, { 'u-maya': '2026-11-02T09:59:59Z' }), { index: 1, state: 'sent', count: 0 });
  assert.deepEqual(bsReceiptFor(msgs, { 'u-maya': '2026-11-02T10:00:00Z' }), { index: 1, state: 'seen', count: 1 }, 'at the same instant counts');
  assert.deepEqual(bsReceiptFor(msgs, { a: '2026-11-02T11:00:00Z', b: '2026-11-02T12:00:00Z' }).count, 2);
  assert.equal(bsReceiptFor(msgs, null), null, 'receipts can\'t show');
  assert.equal(bsReceiptFor([...msgs, theirs('c', '2026-11-02T11:00:00Z')], {}), null, 'their word is last');
  assert.equal(bsReceiptFor([theirs('a', '2026-11-02T09:00:00Z'), mine(null, '2026-11-02T10:00:00Z')], {}), null, 'still sending');
  assert.equal(bsReceiptFor([mine('b', 'whenever')], {}), null);
  const noted = [...msgs, { shape: { body: 'note' }, me: false }];
  assert.equal(bsReceiptFor(noted, {}).index, 1, 'Shape\'s note is from neither side');
  assert.equal(bsReceiptFor('x', {}), null);
});

test('the store: reading never creates, a change publishes a new snapshot, a typer runs out by timer', () => {
  let clock = 1000;
  const timers = [];
  // A fired timer is gone, as a cleared one is.
  const setTimer = (fn, ms) => { const i = timers.length; timers.push({ fn: () => { timers[i] = null; fn(); }, ms }); return i + 1; };
  const store = createThreadSignalStore({ now: () => clock, setTimer, clearTimer: (h) => { timers[h - 1] = null; } });
  assert.equal(store.get('dm:c1'), BS_SIGNALS_EMPTY);
  assert.equal(store.get(null), BS_SIGNALS_EMPTY);
  let calls = 0;
  const off = store.subscribe('dm:c1', () => { calls += 1; });
  store.typing('dm:c1', { userId: 'u-maya', name: 'Maya', on: true });
  const snap = store.get('dm:c1');
  assert.deepEqual(snap.typing, [{ userId: 'u-maya', name: 'Maya' }]);
  assert.equal(calls, 1);
  assert.equal(store.get('dm:c1'), snap, 'the same snapshot until something changes');
  const live = timers.filter(Boolean);
  assert.equal(live.length, 1);
  assert.equal(live[0].ms, BS_TYPING.EXPIRE_MS + 20);
  clock += BS_TYPING.EXPIRE_MS;
  live[0].fn();
  assert.deepEqual(store.get('dm:c1').typing, [], 'ran out');
  assert.equal(calls, 2);
  assert.equal(timers.filter(Boolean).length, 0, 'no timer once nobody is typing');
  store.setSeen('dm:c1', { 'u-maya': '2026-11-02T10:00:00.000Z' });
  assert.deepEqual(store.get('dm:c1').seen, { 'u-maya': '2026-11-02T10:00:00.000Z' });
  store.setSeen('dm:c1', ['nope']);
  assert.equal(store.get('dm:c1').seen, null);
  store.typing('dm:c1', { userId: 'u-maya', on: true });
  store.clear('dm:c1');
  assert.equal(store.get('dm:c1'), BS_SIGNALS_EMPTY, 'a thread left forgets its typers and reads');
  assert.equal(timers.filter(Boolean).length, 0, 'and its timer');
  off();
  store.typing('dm:c2', { userId: 'x', on: true });
  store.clearAll();
  assert.equal(store.get('dm:c2'), BS_SIGNALS_EMPTY);
  assert.doesNotThrow(() => store.typing('', { userId: 'x', on: true }));
});

// ── The wire ───────────────────────────────────────────────────────────────────────────────────
const BLOCK = (() => {
  const start = BACKEND.indexOf('// ── Read receipts and typing (owner, 2026-11-02');
  const exp = BACKEND.indexOf('window.ShapeThreadSignals = {', start);
  assert.ok(start > 0 && exp > start, 'the thread-signals block moved');
  return BACKEND.slice(start, BACKEND.indexOf('\n};\n', exp) + 4);
})();
function fakeSupabase({ rpc } = {}) {
  const sb = {
    channels: [], removed: [], rpcCalls: [],
    channel(topic, opts) {
      const ch = { topic, opts, handlers: {}, sent: [], on(type, filter, fn) { assert.equal(type, 'broadcast'); this.handlers[filter.event] = fn; return this; }, subscribe(cb) { this.cb = cb; return this; }, send(m) { this.sent.push(m); return Promise.resolve('ok'); } };
      sb.channels.push(ch);
      return ch;
    },
    // A removed channel stays in the client's list until the server answers the leave (ack()).
    removeChannel(ch) { sb.removed.push(ch); },
    ack() { sb.removed.forEach((ch) => { ch.gone = true; }); },
    getChannels() { return sb.channels.filter((c) => !c.gone).map((c) => ({ topic: `realtime:${c.topic}` })); },
    rpc(name, args) { sb.rpcCalls.push([name, args]); return rpc ? rpc(name, args) : Promise.resolve({ data: null, error: { code: 'PGRST202' } }); },
  };
  return sb;
}
function loadWire({ rpc, user = { id: 'u-me', email: 'me@example.com', user_metadata: {} }, profile = null, win = {} } = {}) {
  const supabase = fakeSupabase({ rpc });
  const state = { user, profile };
  const timers = [];
  const fakeSetTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const fakeClearTimeout = (h) => { if (h) timers[h - 1] = null; };
  const store = createThreadSignalStore({ now: () => 0, setTimer: () => 0, clearTimer: () => {} });
  const window = { ...win };
  const api = new Function('supabase', 'state', 'window', 'createThreadSignalStore', 'bsTypingFromPayload', 'bsSeenFromRpc', 'setTimeout', 'clearTimeout',
    `${BLOCK}; return { joinThreadSignals, refreshConversationSeen, _teardownThreadSignals, _sigChannels };`)(
    supabase, state, window, () => store, bsTypingFromPayload, bsSeenFromRpc, fakeSetTimeout, fakeClearTimeout);
  const runTimers = () => { timers.splice(0).filter(Boolean).forEach((t) => t.fn()); };
  const pending = () => timers.filter(Boolean).length;
  return { ...api, supabase, state, store, window, runTimers, pending };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('one broadcast channel per thread, shared by every join, closed a beat after the last leave', () => {
  const w = loadWire();
  const a = w.joinThreadSignals('dm:c1');
  const b = w.joinThreadSignals('dm:c1');
  assert.equal(w.supabase.channels.length, 1, 'a remount never subscribes the topic twice');
  const [ch] = w.supabase.channels;
  assert.equal(ch.topic, 'thread-signals:dm:c1');
  assert.deepEqual(ch.opts, { config: { broadcast: { self: false }, private: true } }, 'private: only the thread\'s people are admitted (Codex P1 on #2565)');
  assert.deepEqual(Object.keys(ch.handlers).sort(), ['seen', 'typing']);
  w.store.typing('dm:c1', { userId: 'u-maya', on: true });
  a.leave();
  a.leave();
  assert.equal(w.pending(), 0, 'b is still in: no close is even scheduled, so the grace counts from the last leave');
  w.runTimers();
  assert.equal(w.supabase.removed.length, 0, 'b is still in the thread (and a second leave counts once)');
  b.leave();
  assert.equal(w.supabase.removed.length, 0, 'not at once: a quick return keeps it');
  w.runTimers();
  assert.deepEqual(w.supabase.removed, [ch], 'closed after the grace');
  assert.equal(w.store.get('dm:c1'), BS_SIGNALS_EMPTY, 'its typers go with it');
});

test('back within the grace: the same channel, still joined, and nothing closes', () => {
  const w = loadWire();
  const a = w.joinThreadSignals('dm:c1');
  const [ch] = w.supabase.channels;
  ch.cb('SUBSCRIBED');
  a.leave();
  const b = w.joinThreadSignals('dm:c1');
  w.runTimers();
  assert.equal(w.supabase.channels.length, 1);
  assert.equal(w.supabase.removed.length, 0);
  b.typing(true);
  assert.equal(ch.sent.length, 1, 'joined still, so it sends at once');
});

test('reopened while the old channel is still leaving: it waits for it to go, then joins afresh', () => {
  const w = loadWire();
  w.joinThreadSignals('dm:c1').leave();
  w.runTimers();
  assert.equal(w.supabase.removed.length, 1, 'closing, the server has not answered');
  const h = w.joinThreadSignals('dm:c1');
  assert.equal(w.supabase.channels.length, 1, 'supabase would hand back the leaving one, so no new channel yet');
  h.typing(false);
  w.runTimers();
  assert.equal(w.supabase.channels.length, 1, 'still leaving: still waiting');
  w.supabase.ack();
  w.runTimers();
  assert.equal(w.supabase.channels.length, 2, 'gone: a fresh channel');
  const fresh = w.supabase.channels[1];
  fresh.cb('SUBSCRIBED');
  assert.deepEqual(fresh.sent.map((m) => m.payload.on), [false], 'what was said meanwhile goes out on join');
});

test('a client that throws while opening the channel leaves the thread working, without typing', () => {
  const w = loadWire();
  w.supabase.channel = () => { throw new Error('cannot add callbacks after subscribe()'); };
  const h = w.joinThreadSignals('dm:c1');
  assert.doesNotThrow(() => { h.typing(true); h.seen(); h.leave(); w.runTimers(); });
});

test('signed out, or no backend: a join is a quiet no-op', () => {
  const w = loadWire({ user: null });
  const h = w.joinThreadSignals('dm:c1');
  assert.doesNotThrow(() => { h.typing(true); h.seen(); h.leave(); });
  assert.equal(w.supabase.channels.length, 0);
});

test('typing: held until joined (the newest only), never with an email, and hidden while online is hidden', () => {
  const w = loadWire({ profile: { full_name: 'Quinn Park' } });
  const dm = w.joinThreadSignals('dm:c1');
  const [ch] = w.supabase.channels;
  dm.typing(true);
  dm.typing(false);
  dm.typing(true);
  assert.equal(ch.sent.length, 0, 'not joined yet');
  ch.cb('SUBSCRIBED');
  assert.deepEqual(ch.sent, [{ type: 'broadcast', event: 'typing', payload: { u: 'u-me', n: '', on: true } }], 'the newest, and a direct thread sends no name');
  const room = w.joinThreadSignals('ch:7');
  w.supabase.channels[1].cb('SUBSCRIBED');
  room.typing(true);
  assert.deepEqual(w.supabase.channels[1].sent.at(-1).payload, { u: 'u-me', n: 'Quinn Park', on: true }, 'a channel names who is typing');
  room.typing(false);
  assert.deepEqual(w.supabase.channels[1].sent.at(-1).payload, { u: 'u-me', n: '', on: false });

  const noName = loadWire();
  const r2 = noName.joinThreadSignals('ch:7');
  noName.supabase.channels[0].cb('SUBSCRIBED');
  r2.typing(true);
  assert.equal(noName.supabase.channels[0].sent[0].payload.n, '', 'no full name: no name, never the email');
  assert.ok(!JSON.stringify(noName.supabase.channels[0].sent).includes('example.com'));

  const hidden = loadWire({ win: { ShapeOnlineVisible: false } });
  const h = hidden.joinThreadSignals('dm:c1');
  hidden.supabase.channels[0].cb('SUBSCRIBED');
  h.typing(true);
  assert.equal(hidden.supabase.channels[0].sent.length, 0, 'hidden online, hidden typing');
  h.typing(false);
  assert.equal(hidden.supabase.channels[0].sent[0].payload.on, false, 'an "off" still clears it');
});

test('a typing signal that arrives is read strictly into the thread\'s store', () => {
  const w = loadWire();
  w.joinThreadSignals('ch:7');
  const { typing } = w.supabase.channels[0].handlers;
  typing({ payload: { u: 'u-ari', n: 'Ari', on: true } });
  typing({ payload: { u: 'u-me', n: 'Me', on: true } });
  typing({ payload: ['u-x'] });
  typing(null);
  assert.deepEqual(w.store.get('ch:7').typing, [{ userId: 'u-ari', name: 'Ari' }]);
  typing({ payload: { u: 'u-ari', on: false } });
  assert.deepEqual(w.store.get('ch:7').typing, []);
});

const SEEN_ON = { data: { on: true, seen: [{ user_id: 'u-maya', last_read_at: '2026-11-02T10:05:00+00:00' }] }, error: null };
test('conversation_seen() feeds the thread; off clears it; a failure or a sign-out in between leaves it be', async () => {
  let answer = SEEN_ON;
  const w = loadWire({ rpc: async () => answer });
  assert.deepEqual(await w.refreshConversationSeen('c1'), { 'u-maya': '2026-11-02T10:05:00.000Z' });
  assert.deepEqual(w.supabase.rpcCalls.at(-1), ['conversation_seen', { p_conversation_id: 'c1' }]);
  assert.deepEqual(w.store.get('dm:c1').seen, { 'u-maya': '2026-11-02T10:05:00.000Z' });
  answer = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  await w.refreshConversationSeen('c1');
  assert.deepEqual(w.store.get('dm:c1').seen, { 'u-maya': '2026-11-02T10:05:00.000Z' }, 'a failed read changes nothing');
  answer = { data: { on: false, seen: [] }, error: null };
  await w.refreshConversationSeen('c1');
  assert.equal(w.store.get('dm:c1').seen, null, 'your receipts are off: nothing shows, not even Sent');
  answer = SEEN_ON;
  const p = w.refreshConversationSeen('c2');
  w.state.user = { id: 'u-other' };
  await p;
  assert.equal(w.store.get('dm:c2'), BS_SIGNALS_EMPTY, 'the last account\'s answer never lands');
  assert.equal(await loadWire({ user: null }).refreshConversationSeen('c1'), null);
});

test('"seen" goes out only after this conversation says your receipts are on, and only in a conversation', async () => {
  let answer = SEEN_ON;
  const w = loadWire({ rpc: async () => answer });
  const h = w.joinThreadSignals('dm:c1');
  const [ch] = w.supabase.channels;
  ch.cb('SUBSCRIBED');
  h.seen();
  await tick();
  assert.equal(ch.sent.length, 0, 'no answer about the switch yet: quiet');
  w.refreshConversationSeen('c1');
  h.seen(); // waits on that answer
  await tick(); await tick();
  assert.deepEqual(ch.sent, [{ type: 'broadcast', event: 'seen', payload: { u: 'u-me' } }]);
  answer = { data: { on: false, seen: [] }, error: null };
  await w.refreshConversationSeen('c1');
  h.seen();
  await tick(); await tick();
  assert.equal(ch.sent.length, 1, 'receipts off: never says it read anything');
  const missing = loadWire();
  const m = missing.joinThreadSignals('dm:c1');
  missing.supabase.channels[0].cb('SUBSCRIBED');
  await missing.refreshConversationSeen('c1');
  m.seen();
  await tick(); await tick();
  assert.equal(missing.supabase.channels[0].sent.length, 0, 'before the migration: quiet');
  const room = loadWire({ rpc: async () => SEEN_ON });
  const r = room.joinThreadSignals('ch:7');
  room.supabase.channels[0].cb('SUBSCRIBED');
  r.seen();
  await tick();
  assert.equal(room.supabase.channels[0].sent.length, 0, 'a channel has no receipts');
});

test('a "seen" from them asks conversation_seen() again (once, after a beat); yours does not', async () => {
  const w = loadWire({ rpc: async () => SEEN_ON });
  w.joinThreadSignals('dm:c1');
  const { seen } = w.supabase.channels[0].handlers;
  seen({ payload: { u: 'u-me' } });
  seen({ payload: {} });
  seen({ payload: { u: 7 } });
  w.runTimers();
  assert.equal(w.supabase.rpcCalls.length, 0);
  seen({ payload: { u: 'u-maya' } });
  seen({ payload: { u: 'u-maya' } });
  w.runTimers();
  assert.equal(w.supabase.rpcCalls.length, 1, 'two nudges, one read');
  await tick();
  assert.deepEqual(w.store.get('dm:c1').seen, { 'u-maya': '2026-11-02T10:05:00.000Z' });
});

test('sign-out tears every thread channel down with what it held', () => {
  const w = loadWire();
  w.joinThreadSignals('dm:c1');
  w.joinThreadSignals('ch:7');
  w.store.typing('ch:7', { userId: 'u-ari', on: true });
  w._teardownThreadSignals();
  assert.equal(w.supabase.removed.length, 2);
  assert.equal(w._sigChannels.size, 0);
  assert.equal(w.store.get('ch:7'), BS_SIGNALS_EMPTY);
  assert.match(BACKEND, /_presenceEmit\(\);\n  \} catch \(e\) \{\}\n  \/\/ The open threads' typing and read-receipt channels, and what they hold, are the last account's\.\n  try \{ _teardownThreadSignals\(\); \} catch \(e\) \{\}/);
});

test('marking a conversation read answers once it is stored, so the nudge follows the read', async () => {
  const start = BACKEND.indexOf('  markConversationRead: (id) => {');
  const src = BACKEND.slice(start, BACKEND.indexOf('\n  },\n', start) + 4).trim().replace(/,$/, '');
  const make = (supabase) => new Function('supabase', '_unread', '_unreadEmit', `return { ${src} }.markConversationRead;`)(supabase, { map: {} }, () => {});
  assert.equal(await make({ rpc: async () => ({ error: null }) })('c1'), true);
  assert.equal(await make({ rpc: async () => ({ error: { message: 'no' } }) })('c1'), false);
  assert.equal(await make({ rpc: async () => { throw new Error('offline'); } })('c1'), false);
  assert.equal(await make(null)('c1'), false);
});

// ── The thread ─────────────────────────────────────────────────────────────────────────────────
// Compiled with a hook shim that keeps its effects, so a test can run the thread's join, its read
// marking and their clean-ups as a mount would.
const EFFECTS = [];
const R = { ...SHIM, useEffect(fn) { EFFECTS.push(fn); } };
const { BSChatThread } = await loadBroadsheet(['BSChatThread'], R);
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');
const FEED_EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/feed.json'), 'utf8'));
globalThis.window.ShapeI18n = {
  t: (key, opts = {}) => {
    const m = /^feed:(.+)$/.exec(key);
    const msg = m ? FEED_EN[m[1]] : null;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
};
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);
const MAYA = 'Maya Chen';
const talk = () => [
  { id: 'm1', who: MAYA, userId: 'u-maya', t: 'Ready for Saturday?', at: '2026-11-02T09:00:00Z', me: false },
  { id: 'm2', who: 'You', t: 'Heavy but good.', at: '2026-11-02T10:00:00Z', me: true },
];
// A fresh store and a recording handle for each mount.
function wire() {
  const store = createThreadSignalStore({ now: () => 0, setTimer: () => 0, clearTimer: () => {} });
  const calls = { join: [], typing: [], seen: 0, leave: 0, refresh: [] };
  window.ShapeThreadSignals = {
    get: store.get, subscribe: store.subscribe, typing: store.typing,
    join: (key) => { calls.join.push(key); return { typing: (on) => calls.typing.push(on), seen: () => { calls.seen += 1; }, leave: () => { calls.leave += 1; } }; },
    refreshSeen: (id) => { calls.refresh.push(id); },
  };
  return { store, calls };
}
function mount(thread) {
  EFFECTS.length = 0;
  const d = drive(BSChatThread, { thread, eyebrow: 'Coach', onBack() {} });
  const effects = EFFECTS.splice(0);
  return { d, effects };
}
const DM = (extra = {}) => ({ who: MAYA, role: 'Trainer', conversationId: 'c-1', userId: 'u-maya', messages: talk(), ...extra });
const composer = (d) => d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer');
const receiptNode = (d) => withAttr(d.nodes(), 'data-thread-receipt')[0] || null;
const statusLine = (d) => d.nodes().find((n) => n && n.props && n.props.role === 'status');

test('your last message reads Sent, then Seen once she has read past it; nothing until receipts may show', () => {
  const { store } = wire();
  let { d } = mount(DM());
  assert.equal(receiptNode(d), null, 'no answer yet: no receipt');
  store.setSeen('dm:c-1', {});
  d.render();
  assert.equal(receiptNode(d).props['data-thread-receipt'], 'sent');
  assert.equal(textOf(receiptNode(d)), 'Sent');
  store.setSeen('dm:c-1', { 'u-maya': '2026-11-02T10:00:05.000Z' });
  d.render();
  assert.equal(receiptNode(d).props['data-thread-receipt'], 'seen');
  assert.equal(textOf(receiptNode(d)), 'Seen');
  // On your last message's stamp, after its clock: under "Heavy but good." and nowhere else.
  const mineRow = d.nodes().find((n) => n && n.props && n.props['data-msg-id'] === 'm2');
  assert.ok(withAttr([mineRow, ...flat(mineRow)], 'data-thread-receipt').length === 1);
  store.setSeen('dm:c-1', { 'u-maya': '2026-11-02T10:00:05.000Z', 'u-tom': '2026-11-02T10:01:00.000Z' });
  d.render();
  assert.equal(textOf(receiptNode(d)), 'Seen by 2', 'a care-team thread counts its readers');
  // Her reply after yours: the reply says it all.
  ({ d } = mount(DM({ messages: [...talk(), { id: 'm3', who: MAYA, userId: 'u-maya', t: 'Nice.', at: '2026-11-02T10:02:00Z', me: false }] })));
  assert.equal(receiptNode(d), null);
});

test('a channel never shows receipts, whatever the store holds', () => {
  const { store } = wire();
  store.setSeen('ch:7', { 'u-ari': '2026-11-02T12:00:00.000Z' });
  const { d } = mount({ who: '# Saturday runs', role: 'Channel', group: true, channelId: 7, messages: talk() });
  assert.equal(receiptNode(d), null);
});

test('she is typing: her face and three dots at the foot, and the line said aloud', () => {
  const { store } = wire();
  const { d } = mount(DM());
  assert.equal(withAttr(d.nodes(), 'data-thread-typing').length, 0);
  assert.ok(statusLine(d), 'the live region is there before anyone types, so its first words are spoken');
  assert.equal(textOf(statusLine(d)), '');
  store.typing('dm:c-1', { userId: 'u-maya', name: 'ignored in a direct thread', on: true });
  d.render();
  const [row] = withAttr(d.nodes(), 'data-thread-typing');
  assert.ok(row, 'the typing row');
  assert.equal(row.props['aria-hidden'], true, 'the dots are for the eyes; the status line speaks');
  assert.equal(flat(row).filter((n) => n.props && n.props.className === 'bs-typing-dot').length, 3);
  assert.equal(textOf(statusLine(d)), `${MAYA} is typing`);
  assert.equal(statusLine(d).props['aria-live'], 'polite');
  store.typing('dm:c-1', { userId: 'u-maya', on: false });
  d.render();
  assert.equal(withAttr(d.nodes(), 'data-thread-typing').length, 0);
});

test('a direct thread that knows its other person takes no one else\'s typing', () => {
  const { store } = wire();
  const { d } = mount(DM());
  store.typing('dm:c-1', { userId: 'u-stranger', name: 'Stranger', on: true });
  d.render();
  assert.equal(withAttr(d.nodes(), 'data-thread-typing').length, 0);
  assert.equal(textOf(statusLine(d)), '');
});

test('a channel names who is typing, by the name their messages carry before the signal\'s own', () => {
  const { store } = wire();
  const msgs = [
    { id: 'r1', who: 'Ari', userId: 'u-ari', t: 'Six?', at: '2026-11-02T09:00:00Z', me: false },
    { id: 'r2', who: 'Sam', userId: 'u-sam', t: 'In.', at: '2026-11-02T09:01:00Z', me: false },
  ];
  const { d } = mount({ who: '# Saturday runs', role: 'Channel', group: true, channelId: 7, messages: msgs });
  store.typing('ch:7', { userId: 'u-ari', name: 'Coach Maya', on: true });
  d.render();
  assert.equal(textOf(statusLine(d)), 'Ari is typing', 'a signal cannot rename a member the thread knows');
  store.typing('ch:7', { userId: 'u-sam', name: 'Sam', on: true });
  d.render();
  assert.equal(textOf(statusLine(d)), 'Ari and Sam are typing');
  assert.ok(textOf(withAttr(d.nodes(), 'data-thread-typing')[0]).includes('Ari and Sam are typing'), 'drawn beside the dots');
  store.typing('ch:7', { userId: 'u-new', name: 'Noor', on: true });
  d.render();
  assert.equal(textOf(statusLine(d)), 'Several people are typing');
  store.typing('ch:7', { userId: 'u-sam', on: false });
  store.typing('ch:7', { userId: 'u-ari', on: false });
  d.render();
  assert.equal(textOf(statusLine(d)), 'Noor is typing', 'a newcomer by the name they sent');
  store.typing('ch:7', { userId: 'u-new', on: false });
  store.typing('ch:7', { userId: 'u-anon', name: '', on: true });
  d.render();
  assert.equal(textOf(statusLine(d)), 'Someone is typing');
});

test('mounted: the thread joins its channel, asks for the read times, and announces its stored read', async () => {
  const { calls } = wire();
  let resolveRead;
  window.ShapeUnread = { markConversationRead: () => new Promise((r) => { resolveRead = r; }) };
  try {
    const { effects } = mount(DM());
    const cleanups = effects.map((fn) => fn()).filter((x) => typeof x === 'function');
    assert.deepEqual(calls.join, ['dm:c-1']);
    assert.deepEqual(calls.refresh, ['c-1']);
    assert.equal(calls.seen, 0, 'not before the read is stored');
    resolveRead(true);
    await tick();
    assert.equal(calls.seen, 1, 'announced once stored');
    cleanups.forEach((fn) => fn());
    assert.equal(calls.leave, 1, 'left on unmount');
    assert.deepEqual(calls.typing, [], 'nothing typed, no "off" sent');
  } finally { delete window.ShapeUnread; }
  // A channel joins its own key and asks for no read times.
  const ch = wire();
  mount({ who: '# Saturday runs', role: 'Channel', group: true, channelId: 7, messages: talk() }).effects.forEach((fn) => fn());
  assert.deepEqual(ch.calls.join, ['ch:7']);
  assert.deepEqual(ch.calls.refresh, []);
});

test('mounted: typing sends an "on" every few seconds, an "off" when the field empties, and on send', () => {
  const { calls } = wire();
  const { d, effects } = mount(DM());
  const cleanups = effects.map((fn) => fn()).filter((x) => typeof x === 'function');
  composer(d).props.onChange('H');
  d.render();
  composer(d).props.onChange('He');
  d.render();
  assert.deepEqual(calls.typing, [true], 'one "on" for a burst of keys');
  assert.equal(composer(d).props.value, 'He', 'the words still land');
  composer(d).props.onChange('');
  d.render();
  assert.deepEqual(calls.typing, [true, false]);
  composer(d).props.onChange('Again');
  d.render();
  composer(d).props.onSend();
  d.render();
  assert.deepEqual(calls.typing, [true, false, true, false], 'sending ends the typing');
  composer(d).props.onChange('Half a thought');
  d.render();
  cleanups.forEach((fn) => fn());
  assert.deepEqual(calls.typing.slice(-2), [true, false], 'leaving mid-thought says "off"');
});

test('a message from someone ends their typing at once; a sent message keeps the server\'s time', () => {
  assert.equal((CLIENT.match(/if \(row\.sender_id\) window\.ShapeThreadSignals\?\.typing\?\.\(sigKey, \{ userId: row\.sender_id, on: false \}\);/g) || []).length, 2, 'a channel row and a direct row');
  assert.match(CLIENT, /const at = res && res\.data && res\.data\.created_at; if \(id\) setExtras\(e => e\.map\(x => x\.tmpId === tmpId \? \{ \.\.\.x, id, \.\.\.\(at \? \{ at \} : \{\}\) \} : x\)\);/);
  assert.equal((CLIENT.match(/announceRead\(window\.ShapeUnread\?\.markConversationRead\?\.\(thread\.conversationId\)\)/g) || []).length, 3, 'on open, on the welcome and on every message read while open');
  assert.match(CLIENT, /const read = \(\) => \{ unreadWhileHiddenRef\.current = false; announceRead\(window\.ShapeUnread\?\.markConversationRead\?\.\(id\)\); \};/, 'and on coming back into view');
});

test('mounted: a message that arrives while the app is hidden stays unread (Sent) until the thread is back in view', async () => {
  const { calls } = wire();
  let onRow = null;
  let onVis = null;
  const marks = [];
  const saved = { document: globalThis.document, ShapeMessages: window.ShapeMessages, ShapeUnread: window.ShapeUnread };
  globalThis.document = { visibilityState: 'visible', addEventListener: (type, fn) => { if (type === 'visibilitychange') onVis = fn; }, removeEventListener: () => {} };
  window.ShapeMessages = { subscribeMessages: (fn) => { onRow = fn; return () => {}; } };
  window.ShapeUnread = { markConversationRead: (id) => { marks.push(id); return Promise.resolve(true); } };
  try {
    const { effects } = mount(DM());
    effects.forEach((fn) => fn());
    await tick();
    assert.deepEqual(marks, ['c-1'], 'read on open');
    assert.equal(calls.seen, 1);
    document.visibilityState = 'hidden';
    onRow({ id: 'm9', conversation_id: 'c-1', sender_id: 'u-maya', body: 'You there?', created_at: '2026-11-02T11:00:00Z', metadata: {} });
    await tick();
    assert.deepEqual(marks, ['c-1'], 'not read while no one can see it');
    assert.equal(calls.seen, 1, 'and not announced');
    onVis();
    assert.deepEqual(marks, ['c-1'], 'still hidden');
    document.visibilityState = 'visible';
    onVis();
    await tick();
    assert.deepEqual(marks, ['c-1', 'c-1'], 'read when it comes back into view');
    assert.equal(calls.seen, 2, 'and announced');
    onVis();
    await tick();
    assert.equal(marks.length, 2, 'nothing new since: no second read');
    onRow({ id: 'm10', conversation_id: 'c-1', sender_id: 'u-maya', body: 'Ok!', created_at: '2026-11-02T11:01:00Z', metadata: {} });
    await tick();
    assert.equal(marks.length, 3, 'in view, a message is read as it lands');
  } finally {
    globalThis.document = saved.document;
    window.ShapeMessages = saved.ShapeMessages;
    window.ShapeUnread = saved.ShapeUnread;
  }
});

// A document stand-in whose visibility a test turns, and whose visibilitychange it fires.
function pageStandIn(state = 'visible') {
  const page = { visibilityState: state, onVis: null, addEventListener: (type, fn) => { if (type === 'visibilitychange') page.onVis = fn; }, removeEventListener: () => {} };
  return page;
}
async function withPage(page, globals, run) {
  const saved = { document: globalThis.document };
  for (const k of Object.keys(globals)) saved[k] = window[k];
  globalThis.document = page;
  Object.assign(window, globals);
  try { await run(); } finally {
    globalThis.document = saved.document;
    for (const k of Object.keys(globals)) window[k] = saved[k];
  }
}

test('opened out of sight (a notification, before the app is in view): read only once it is (Codex P2 on #2565)', async () => {
  const { calls } = wire();
  const page = pageStandIn('hidden');
  const marks = [];
  await withPage(page, {
    ShapeUnread: { markConversationRead: (id) => { marks.push(id); return Promise.resolve(true); } },
    ShapeMessages: { subscribeMessages: () => () => {}, getConversationThread: async (id) => ({ data: { conversation_id: id, messages: talk() } }) },
  }, async () => {
    const { effects } = mount(DM());
    effects.forEach((fn) => fn());
    await tick();
    assert.deepEqual(marks, [], 'not read while hidden');
    assert.equal(calls.seen, 0);
    page.visibilityState = 'visible';
    page.onVis();
    await tick(); await tick();
    assert.deepEqual(marks, ['c-1'], 'read when it comes into view');
    assert.equal(calls.seen, 1);
  });
});

test('back in view after the socket slept: the thread loads what it missed, shows it, and reads it (Codex P1 on #2565)', async () => {
  const { calls } = wire();
  const page = pageStandIn('visible');
  const marks = [];
  let stored = talk();
  let fail = false;
  await withPage(page, {
    ShapeUnread: { markConversationRead: (id) => { marks.push(id); return Promise.resolve(true); } },
    ShapeMessages: {
      subscribeMessages: () => () => {}, // the socket that slept: no row ever arrives
      getConversationThread: async (id) => { if (fail) throw new Error('offline'); return { data: { conversation_id: id, messages: stored } }; },
    },
  }, async () => {
    const { d, effects } = mount(DM());
    effects.forEach((fn) => fn());
    await tick();
    assert.deepEqual(marks, ['c-1'], 'read on open');
    // Nothing new: coming back reads nothing.
    page.onVis();
    await tick(); await tick();
    assert.deepEqual(marks, ['c-1']);
    // While locked she sent one; the socket never heard it.
    page.visibilityState = 'hidden';
    stored = [...talk(), { id: 'm9', who: 'Trainer', userId: 'u-maya', t: 'You there?', at: '2026-11-02T11:00:00Z', me: false }];
    page.onVis();
    assert.deepEqual(marks, ['c-1'], 'still hidden: nothing');
    page.visibilityState = 'visible';
    page.onVis();
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('You there?'), 'the missed message is shown');
    const missed = withAttr(d.nodes(), 'data-thread-theirs').find((n) => textOf(n).includes('You there?'));
    assert.ok(missed, 'as theirs');
    // Bylines are the buttons over their words (not the desk's name, which also shows her role).
    const bylines = d.nodes().filter((n) => n.type === 'button' && !withAttr(flat(n), 'data-thread-name').length && !withAttr(flat(n), 'data-thread-quote').length);
    assert.equal(bylines.filter((b) => textOf(b).includes(MAYA)).length, 2, 'her byline over m1 and over the missed message');
    assert.ok(!bylines.some((b) => textOf(b).includes('Trainer')), 'in the thread\'s name for her, never the history\'s role label');
    assert.deepEqual(marks, ['c-1', 'c-1'], 'and read');
    assert.equal(calls.seen, 2, 'and announced');
    page.onVis();
    await tick(); await tick();
    d.render();
    assert.equal(marks.length, 2, 'shown now, so not missed again');
    assert.equal(d.text.split('You there?').length - 1, 1, 'and shown once');
    // History can't load: only what this view already shows is read.
    fail = true;
    page.onVis();
    await tick(); await tick();
    assert.equal(marks.length, 2, 'nothing was waiting: nothing read');
  });
});

test('two read-time asks in flight: the older answer never lands (Codex P2 on #2565)', async () => {
  const answers = [];
  const w = loadWire({ rpc: () => new Promise((r) => answers.push(r)) });
  const first = w.refreshConversationSeen('c1');
  const second = w.refreshConversationSeen('c1');
  answers[1]({ data: { on: true, seen: [{ user_id: 'u-maya', last_read_at: '2026-11-02T10:05:00+00:00' }] }, error: null });
  await second;
  assert.deepEqual(w.store.get('dm:c1').seen, { 'u-maya': '2026-11-02T10:05:00.000Z' });
  answers[0]({ data: { on: true, seen: [{ user_id: 'u-maya', last_read_at: '2026-11-02T09:00:00+00:00' }] }, error: null });
  assert.equal(await first, null, 'the older answer is dropped');
  assert.deepEqual(w.store.get('dm:c1').seen, { 'u-maya': '2026-11-02T10:05:00.000Z' }, 'Seen never goes back to an older time');
  // ...nor turns a switch that is now off back on.
  const off = loadWire({ rpc: () => new Promise((r) => answers.push(r)) });
  answers.length = 0;
  const a = off.refreshConversationSeen('c1');
  const b = off.refreshConversationSeen('c1');
  const h = off.joinThreadSignals('dm:c1');
  off.supabase.channels[0].cb('SUBSCRIBED');
  answers[1]({ data: { on: false, seen: [] }, error: null });
  await b;
  answers[0]({ data: { on: true, seen: [{ user_id: 'u-maya', last_read_at: '2026-11-02T09:00:00+00:00' }] }, error: null });
  await a;
  assert.equal(off.store.get('dm:c1').seen, null);
  h.seen();
  await tick(); await tick();
  assert.equal(off.supabase.channels[0].sent.length, 0, 'still off: no seen nudge');
});

test('Settings: a Read receipts switch in Privacy, in the document conversation_seen() reads', () => {
  assert.match(CLIENT, /readReceipts:\s+\['On', 'Off'\],/);
  assert.match(CLIENT, /\{ l: tr\('settings:privacy\.readReceipts', \{ defaultValue: 'Read receipts' \}\), key: 'readReceipts', segmented: PREF_OPTIONS\.readReceipts, segLabels: \[tr\('settings:common\.on'/);
  const privacy = CLIENT.slice(CLIENT.indexOf("title: 'Privacy & data',"), CLIENT.indexOf("key: 'shareWorkoutData'"));
  assert.ok(privacy.includes("key: 'onlineVisible'") && privacy.indexOf("key: 'readReceipts'") > privacy.indexOf("key: 'onlineVisible'"), 'beside Show when I\'m online');
  assert.match(MIGRATION, /g\.data ->> 'readReceipts'/, 'the key the switch writes');
});

test('the typing dots hold still under reduced motion', () => {
  const html = readFileSync(join(ROOT, 'mobile-app/index.html'), 'utf8');
  assert.match(html, /@keyframes bsTypingDot \{/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{ \.bs-typing-dot \{ animation: none !important;/);
});

// ── The migration ──────────────────────────────────────────────────────────────────────────────
test('the migration closes the read time to clients and opens one door that honours both switches', () => {
  assert.match(MIGRATION, /^begin;$/m);
  assert.match(MIGRATION, /^commit;$/m);
  assert.match(MIGRATION, /^revoke select on public\.conversation_participants from anon, authenticated;$/m);
  assert.match(MIGRATION, /^grant select \(conversation_id, user_id, role, created_at\) on public\.conversation_participants to authenticated;$/m);
  assert.doesNotMatch(MIGRATION.match(/^grant select \([^)]*\)/m)[0], /last_read_at/);
  assert.match(MIGRATION, /create or replace function public\.conversation_seen\(p_conversation_id uuid\)\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = public, pg_temp/);
  assert.match(MIGRATION, /not public\.can_access_conversation\(p_conversation_id\) then\n\s+return jsonb_build_object\('on', false, 'seen', '\[\]'::jsonb\);/);
  assert.match(MIGRATION, /where g\.user_id = v_me and g\.kind = 'client_settings'\), 'On'\) = 'Off' then\n\s+return jsonb_build_object\('on', false/, 'your own switch, off: nothing');
  assert.match(MIGRATION, /and cp\.user_id <> v_me\n\s+and cp\.last_read_at is not null\n\s+and coalesce\(\(select g\.data ->> 'readReceipts' from public\.user_goals g\n\s+where g\.user_id = cp\.user_id and g\.kind = 'client_settings'\), 'On'\) <> 'Off'/, 'theirs, off: not them');
  assert.match(MIGRATION, /^revoke all on function public\.conversation_seen\(uuid\) from public, anon;$/m);
  assert.match(MIGRATION, /^grant execute on function public\.conversation_seen\(uuid\) to authenticated;$/m);
  assert.match(MIGRATION, /has_column_privilege\('authenticated', 'public\.conversation_participants', 'last_read_at', 'select'\)/);
  assert.match(MIGRATION, /raise exception 'conversation_seen\(uuid\) has the wrong grants'/);
  assert.deepEqual(MIGRATION.match(/^\s*drop .*$/gim).map((l) => l.trim()), [
    'drop policy if exists "thread signals: listen" on realtime.messages;',
    'drop policy if exists "thread signals: speak" on realtime.messages;',
  ], 'nothing is dropped but a policy about to be created again');
});

test('the typing channels are private: only a thread\'s people may listen, and only those who may write in it may speak (Codex P1 on #2565)', () => {
  assert.match(MIGRATION, /create or replace function public\.thread_signal_topic_ok\(p_topic text, p_speak boolean\)\nreturns boolean\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = public, pg_temp/);
  assert.match(MIGRATION, /p_topic !~ '\^thread-signals:\(dm\|ch\):\[0-9a-fA-F\]\{8\}-/, 'a topic of this shape only, so the id cast cannot fail');
  assert.match(MIGRATION, /if auth\.uid\(\) is null or p_topic is null/);
  assert.match(MIGRATION, /if split_part\(p_topic, ':', 2\) = 'dm' then\n\s+return public\.can_access_conversation\(v_id\);/, 'a conversation: whoever may open it');
  assert.match(MIGRATION, /return public\.is_channel_member\(v_id\) or public\.is_channel_host\(v_id\)\n\s+or \(not coalesce\(p_speak, true\) and public\.is_public_channel\(v_id\)\);/, 'a channel: its members and host, and a public one\'s viewers may only listen');
  assert.match(MIGRATION, /create policy "thread signals: listen" on realtime\.messages\n\s+for select to authenticated\n\s+using \(realtime\.messages\.extension = 'broadcast' and public\.thread_signal_topic_ok\(realtime\.topic\(\), false\)\);/);
  assert.match(MIGRATION, /create policy "thread signals: speak" on realtime\.messages\n\s+for insert to authenticated\n\s+with check \(realtime\.messages\.extension = 'broadcast' and public\.thread_signal_topic_ok\(realtime\.topic\(\), true\)\);/);
  assert.match(MIGRATION, /^revoke all on function public\.thread_signal_topic_ok\(text, boolean\) from public, anon;$/m);
  assert.match(MIGRATION, /raise exception 'the thread-signals policies on realtime\.messages are missing or changed'/);
});

test('a history that lands after the thread has moved on is dropped, never added or read (Codex P2 on #2565)', async () => {
  wire();
  const page = pageStandIn('visible');
  const marks = [];
  let release = null;
  await withPage(page, {
    ShapeUnread: { markConversationRead: (id) => { marks.push(id); return Promise.resolve(true); } },
    ShapeMessages: { subscribeMessages: () => () => {}, getConversationThread: (id) => new Promise((r) => { release = () => r({ data: { conversation_id: id, messages: [...talk(), { id: 'late', who: MAYA, userId: 'u-maya', t: 'From the old thread', at: '2026-11-02T11:00:00Z', me: false }] } }); }) },
  }, async () => {
    const { d, effects } = mount(DM());
    const cleanups = effects.map((fn) => fn()).filter((x) => typeof x === 'function');
    await tick();
    marks.length = 0;
    page.onVis();          // its history is on the way...
    cleanups.forEach((fn) => fn()); // ...and the thread moves on (or closes)
    release();
    await tick(); await tick();
    d.render();
    assert.ok(!d.text.includes('From the old thread'), 'nothing added');
    assert.deepEqual(marks, [], 'and nothing read');
  });
});

test('back in view while your own send is still on its way: the stored row is that message, shown once (Codex P2 on #2565)', async () => {
  wire();
  const page = pageStandIn('visible');
  let answerSend = null;
  let sentCid = null;
  const stored = { id: 'm-sent', who: 'You', t: 'On my way', at: '2026-11-02T10:30:00Z', me: true };
  await withPage(page, {
    ShapeUnread: { markConversationRead: () => Promise.resolve(true) },
    ShapeMessages: {
      subscribeMessages: () => () => {},
      sendMessage: (a) => { sentCid = a.metadata && a.metadata.cid; return new Promise((r) => { answerSend = () => r({ data: { id: 'm-sent', created_at: stored.at } }); }); },
      // The stored row carries the id the view sent it with, as the readers map it (cid).
      getConversationThread: async (id) => ({ data: { conversation_id: id, messages: [...talk(), { ...stored, cid: sentCid }] } }),
    },
  }, async () => {
    const { d, effects } = mount(DM());
    effects.forEach((fn) => fn());
    await tick();
    composer(d).props.onChange('On my way');
    d.render();
    composer(d).props.onSend();   // stored at once; its answer is slow
    d.render();
    page.onVis();                 // back in view before the answer lands
    await tick(); await tick();
    d.render();
    const count = () => d.text.split('On my way').length - 1;
    assert.equal(count(), 1, 'once, while the send waits');
    answerSend();
    await tick(); await tick();
    d.render();
    assert.equal(count(), 1, 'and once after it answers');
    assert.equal(withAttr(d.nodes(), 'data-thread-mine').filter((n) => textOf(n).includes('On my way')).length, 1);
  });
});

test('opened with only the list\'s preview and a history that failed: back in view, the stored history replaces the preview (Codex P2 on #2565)', async () => {
  wire();
  const page = pageStandIn('visible');
  const marks = [];
  let calls = 0;
  const stored = [
    { id: 'h1', who: 'Trainer', userId: 'u-maya', t: 'Earlier', at: '2026-11-02T08:00:00Z', me: false },
    { id: 'h2', who: 'Trainer', userId: 'u-maya', t: 'See you at six', at: '2026-11-02T09:00:00Z', me: false },
  ];
  await withPage(page, {
    ShapeUnread: { markConversationRead: (id) => { marks.push(id); return Promise.resolve(true); } },
    ShapeMessages: {
      subscribeMessages: () => () => {},
      getConversationThread: async (id) => { calls += 1; if (calls === 1) throw new Error('suspended'); return { data: { conversation_id: id, messages: stored } }; },
    },
  }, async () => {
    // A notification opens it by id: no messages, only the list's last line.
    const { d, effects } = mount({ who: MAYA, role: 'Trainer', conversationId: 'c-1', userId: 'u-maya', messages: [], last: 'See you at six', time: '1h' });
    effects.forEach((fn) => fn());
    await tick(); await tick();
    d.render();
    assert.equal(calls, 1, 'the first history read failed');
    assert.equal(d.text.split('See you at six').length - 1, 1, 'the preview line alone');
    page.onVis();
    await tick(); await tick();
    d.render();
    assert.equal(calls, 2);
    assert.equal(d.text.split('See you at six').length - 1, 1, 'its stored copy replaces it, never beside it');
    assert.ok(d.text.includes('Earlier'), 'and the rest of the history comes with it');
    const bylines = d.nodes().filter((n) => n.type === 'button' && !withAttr(flat(n), 'data-thread-name').length && !withAttr(flat(n), 'data-thread-quote').length);
    assert.ok(!bylines.some((b) => textOf(b).includes('Trainer')), 'in the thread\'s name for her');
    assert.ok(marks.length >= 1, 'read');
  });
});

test('an older message of yours with the same words is never taken for a pending send (Codex P2 on #2565)', async () => {
  wire();
  const page = pageStandIn('visible');
  let answerSend = null;
  let sentCid = null;
  const older = { id: 'm-old', who: 'You', t: 'On my way', at: '2026-11-02T08:00:00Z', me: true };
  await withPage(page, {
    ShapeUnread: { markConversationRead: () => Promise.resolve(true) },
    ShapeMessages: {
      subscribeMessages: () => () => {},
      sendMessage: (a) => { sentCid = a.metadata && a.metadata.cid; return new Promise((r) => { answerSend = () => r({ data: { id: 'm-new', created_at: '2026-11-02T11:00:00Z' } }); }); },
      // Read back before the new insert is visible: the older one (no cid of this send), and one of hers the
      // socket missed, so the reconcile has something to join and runs its claim.
      getConversationThread: async (id) => ({ data: { conversation_id: id, messages: [...talk(), older, { id: 'h-missed', who: 'Trainer', userId: 'u-maya', t: 'Running late?', at: '2026-11-02T10:59:00Z', me: false }] } }),
    },
  }, async () => {
    const { d, effects } = mount(DM({ messages: [...talk(), older] }));
    effects.forEach((fn) => fn());
    await tick();
    composer(d).props.onChange('On my way');
    d.render();
    composer(d).props.onSend();
    d.render();
    assert.ok(sentCid, 'the send carries its view id');
    page.onVis();
    await tick(); await tick();
    d.render();
    const mineOnMyWay = () => withAttr(d.nodes(), 'data-thread-mine').filter((n) => textOf(n).includes('On my way')).length;
    assert.ok(d.text.includes('Running late?'), 'the missed message joined, so the claim ran');
    assert.equal(mineOnMyWay(), 2, 'the older one and the new one, which never vanishes into the older');
    answerSend();
    await tick(); await tick();
    d.render();
    assert.equal(mineOnMyWay(), 2, 'still both once the send answers');
  });
});

test('both direct-message readers keep the id the sender\'s view gave a message, read strictly', () => {
  assert.equal((BACKEND.match(/\n\s+cid: bsViewIdOf\(message\.metadata\),\n/g) || []).length, 2);
  const at = BACKEND.indexOf('function bsViewIdOf(md) {');
  const bsViewIdOf = new Function(`${BACKEND.slice(at, BACKEND.indexOf('\n}\n', at) + 2)}; return bsViewIdOf;`)();
  assert.equal(bsViewIdOf({ cid: 'tmp-1-abc' }), 'tmp-1-abc');
  for (const bad of [null, {}, { cid: '' }, { cid: 7 }, { cid: ['tmp'] }, { cid: 'x'.repeat(65) }]) assert.equal(bsViewIdOf(bad), null, JSON.stringify(bad));
});

test('two reads of a history merge by id, in either order, so nothing a newer read showed is taken away (Codex P2 on #2565)', () => {
  const a = { id: 'a', t: 'one', at: '2026-11-02T09:00:00Z' };
  const b = { id: 'b', t: 'two', at: '2026-11-02T10:00:00Z' };
  const c = { id: 'c', t: 'three', at: '2026-11-02T11:00:00Z' };
  const newer = bsMergeThreadHistory(null, 'c1', [a, b, c]);
  assert.deepEqual(newer.messages.map((m) => m.id), ['a', 'b', 'c']);
  const thenOlder = bsMergeThreadHistory(newer, 'c1', [a, b]);
  assert.deepEqual(thenOlder.messages.map((m) => m.id), ['a', 'b', 'c'], 'the older snapshot takes nothing away');
  assert.deepEqual(bsMergeThreadHistory(bsMergeThreadHistory(null, 'c1', [a, b]), 'c1', [a, b, c]).messages.map((m) => m.id), ['a', 'b', 'c'], 'and the other order');
  const edited = bsMergeThreadHistory(newer, 'c1', [{ ...b, who: 'Maya' }]);
  assert.equal(edited.messages.find((m) => m.id === 'b').who, 'Maya', 'the latest read of an id wins');
  assert.deepEqual(bsMergeThreadHistory(newer, 'c2', [a]).messages.map((m) => m.id), ['a'], 'another conversation\'s history is not merged in');
  assert.deepEqual(bsMergeThreadHistory(null, 'c1', [c, a, b, null, { t: 'no id' }, { id: '', t: 'empty id' }]).messages.map((m) => m.id), ['a', 'b', 'c'], 'oldest first; no id, no row');
});

test('mounted: an older history read that lands after a newer one never takes the newer message away (Codex P2 on #2565)', async () => {
  wire();
  const page = pageStandIn('visible');
  const answers = [];
  const older = [{ id: 'h1', who: 'Trainer', userId: 'u-maya', t: 'Earlier', at: '2026-11-02T08:00:00Z', me: false }];
  const newer = [...older, { id: 'h2', who: 'Trainer', userId: 'u-maya', t: 'Missed one', at: '2026-11-02T09:00:00Z', me: false }];
  await withPage(page, {
    ShapeUnread: { markConversationRead: () => Promise.resolve(true) },
    ShapeMessages: { subscribeMessages: () => () => {}, getConversationThread: (id) => new Promise((r) => answers.push((msgs) => r({ data: { conversation_id: id, messages: msgs } }))) },
  }, async () => {
    const { d, effects } = mount({ who: MAYA, role: 'Trainer', conversationId: 'c-1', userId: 'u-maya', messages: [], last: 'Missed one', time: '1h' });
    effects.forEach((fn) => fn());   // the opening read starts (slow)
    page.onVis();                    // and the return-to-view read
    assert.equal(answers.length, 2);
    answers[1](newer);               // the newer lands first...
    await tick(); await tick();
    answers[0](older);               // ...the older after it
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('Missed one') && d.text.includes('Earlier'), 'both messages stay');
    assert.equal(d.text.split('Missed one').length - 1, 1, 'once');
  });
});

test('mounted: two quick returns into view answered newest first: the older answer never takes a message away (Codex P2 on #2565)', async () => {
  wire();
  const page = pageStandIn('visible');
  const answers = [];
  const older = [{ id: 'h1', who: 'Trainer', userId: 'u-maya', t: 'Earlier', at: '2026-11-02T08:00:00Z', me: false }];
  const newer = [...older, { id: 'h2', who: 'Trainer', userId: 'u-maya', t: 'Missed one', at: '2026-11-02T09:00:00Z', me: false }];
  await withPage(page, {
    ShapeUnread: { markConversationRead: () => Promise.resolve(true) },
    ShapeMessages: { subscribeMessages: () => () => {}, getConversationThread: (id) => new Promise((r) => answers.push((msgs) => r({ data: { conversation_id: id, messages: msgs } }))) },
  }, async () => {
    const { d, effects } = mount({ who: MAYA, role: 'Trainer', conversationId: 'c-1', userId: 'u-maya', messages: [], last: 'Earlier', time: '2h' });
    effects.forEach((fn) => fn());
    answers[0](older);               // the opening read
    await tick(); await tick();
    page.onVis();                    // back in view...
    page.onVis();                    // ...and again, quickly
    assert.equal(answers.length, 3);
    answers[2](newer);               // the second return's (newer) answer lands first
    await tick(); await tick();
    answers[1](older);               // the first return's (older) answer after it
    await tick(); await tick();
    d.render();
    assert.ok(d.text.includes('Missed one'), 'the newer message stays');
    assert.equal(d.text.split('Earlier').length - 1, 1, 'and nothing shows twice');
  });
});

function flat(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const c of node) flat(c, out); return out; }
  out.push(node);
  if (node.props) flat(node.props.children, out);
  return out;
}
