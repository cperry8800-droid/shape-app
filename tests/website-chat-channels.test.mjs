// The website chat bubble's Channels place, wired to the real channels (owner, 2026-11-10: "yes
// wire up the real channels next"). public/newdesign/chatWidget.jsx is mounted for real in jsdom
// against a fake database client that answers the app's own reads and writes: the visible
// channels, their members and the caller's unread counts; a channel's messages; joining, posting,
// creating and pinning. Each test drives the panel the way a member would.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const React = require('react');
// ⚠ react-dom decides at load whether there is a DOM, and without one it never listens for
// `input`: typing into the composer would change nothing. It is loaded with one present.
const boot = new JSDOM('<!doctype html><body></body>');
globalThis.window = boot.window; globalThis.document = boot.window.document;
const ReactDOMClient = require('react-dom/client');
delete globalThis.window; delete globalThis.document;

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SRC = read('public/newdesign/chatWidget.jsx');
const SHELL_CONSTS = read('public/newdesign/pageShell.jsx').split('\n').filter((l) => /^const [A-Za-z_]+ = ("[^"]*"|'[^']*');/.test(l)).join('\n');
const WIDGET = babel.transformSync(`${SHELL_CONSTS}\n${SRC}`, {
  presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script',
}).code;

const settle = async (n = 8) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };

// A query builder that records what it was asked and answers from `tables` when awaited.
// `maxRows`: the API's ceiling on one answer (PostgREST's max-rows, 1,000 on Supabase); `ignoreRange`: a
// server that answers every page with the first one.
// `failConversations`: the coach inbox read is refused; `gate`: a promise the account read waits on,
// so a test can type before the reads land.
function fakeDb({ tables, log, failChannels = false, insertError = null, maxRows = 1000, ignoreRange = false, failConversations = false, gate = null }) {
  const answer = (state) => {
    const ops = state.ops;
    const has = (k) => ops.find((o) => o[0] === k);
    if (has('insert')) {
      const row = has('insert')[1][0];
      log.push(['insert', state.table, row]);
      if (insertError && insertError[state.table]) return { data: null, error: insertError[state.table] };
      if (state.table === 'channel_members') tables.channel_members.push(row);
      if (state.table === 'channel_messages') tables.channel_messages.push({ id: 'm' + tables.channel_messages.length, created_at: new Date(Date.now() + 1000).toISOString(), ...row });
      return { data: null, error: null };
    }
    if (has('update')) {
      const row = has('update')[1][0];
      const id = has('eq') ? has('eq')[1][1] : null;
      log.push(['update', state.table, row, id]);
      const target = (tables[state.table] || []).find((r) => r.id === id);
      if (target) Object.assign(target, row);
      return { data: null, error: null };
    }
    log.push(['select', state.table, ops.map((o) => o[0]).join('.')]);
    if (state.table === 'channels') return failChannels ? { data: null, error: { message: 'down' } } : { data: tables.channels, error: null };
    if (state.table === 'conversations' && failConversations) return { data: null, error: { message: 'refused' } };
    if (state.table === 'channel_members') {
      const ids = (has('in') || [, [, []]])[1][1];
      const who = ops.find((o) => o[0] === 'eq' && o[1][0] === 'user_id');
      let rows = tables.channel_members.filter((m) => ids.includes(m.channel_id) && (!who || m.user_id === who[1][1]));
      if (has('order')) rows = rows.slice().sort((a, b) => (a.channel_id + '|' + a.user_id).localeCompare(b.channel_id + '|' + b.user_id));
      const range = has('range');
      const at = range && !ignoreRange ? range[1][0] : 0;
      const to = range && !ignoreRange ? range[1][1] : at + maxRows - 1;
      return { data: rows.slice(at, Math.min(to + 1, at + maxRows)), error: null };
    }
    if (state.table === 'channel_messages') {
      const ch = has('eq')[1][1];
      const gt = has('gt') ? has('gt')[1][1] : null;
      const desc = has('order') && has('order')[1][1] && has('order')[1][1].ascending === false;
      const lim = has('limit') ? has('limit')[1][0] : 1e9;
      let rows = tables.channel_messages.filter((m) => m.channel_id === ch && (!gt || m.created_at > gt));
      rows = rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (desc) rows.reverse();
      return { data: rows.slice(0, lim), error: null };
    }
    return { data: [], error: null };
  };
  const from = (table) => {
    const state = { table, ops: [] };
    const q = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'then') return (res, rej) => Promise.resolve(answer(state)).then(res, rej);
        return (...args) => { state.ops.push([k, args]); return q; };
      },
    });
    return q;
  };
  const rpc = (name, args) => {
    log.push(['rpc', name, args || null]);
    if (name === 'channel_unread') return Promise.resolve({ data: tables.unread || [], error: null });
    if (name === 'create_channel') {
      const id = 'ch-new';
      tables.channels.push({ id, name: args.p_name, description: args.p_description, created_by: 'u1', visibility: 'public' });
      tables.channel_members.push({ channel_id: id, user_id: 'u1', role: 'host', pinned: false });
      return Promise.resolve({ data: id, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  const user = { id: 'u1', email: 'ann@shape.test', user_metadata: { full_name: 'Ann Lee' } };
  const storage = {
    from: (bucket) => ({
      upload: async (path, file, opts) => { log.push(['upload', bucket, path, opts && opts.contentType]); return { data: { path }, error: null }; },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
    }),
  };
  return {
    getSession: async () => ({}),
    getUserGoals: async () => null,
    getProfile: async () => ({ full_name: 'Ann Lee' }),
    client: { auth: { getUser: async () => { if (gate) await gate; return { data: { user } }; } }, from, rpc, storage },
  };
}

async function mount({ signedIn = true, db = null } = {}) {
  const vc = new VirtualConsole();
  vc.forwardTo(console, { jsdomErrors: 'none' });
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: 'https://shape.test/newdesign/ClientApp.html', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const before = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  w.React = React;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollTo = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = w.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/api/stripe/subscription')) return answer(200, { active: true });
    if (u.includes('/api/nora/thread')) return answer(signedIn ? 200 : 401, { messages: [], account: signedIn ? 'u1' : null });
    return answer(200, {});
  };
  if (db) w.shapeEnsureDb = async () => { w.shapeDb = db; return db; };
  const readMe = () => Promise.resolve(signedIn ? { user: { id: 'u1', email: 'ann@shape.test' } } : { user: null });
  new Function('React', 'ReactDOM', 'shapeReadPortalMe', WIDGET)(React, ReactDOMClient, readMe);
  const tabs = [
    { id: 'community', label: 'Channels', eyebrow: 'SHAPE COMMUNITY', title: 'Channels', canCreate: true, threads: [
      { who: '# shape-community', role: '41,208 members · 2,104 online · Everyone on Shape', last: 'Nina O: welcome', time: '4m', unread: 12, group: true, pinned: true, messages: [{ who: 'Nina O.', t: 'welcome everyone', time: '4m', me: false }] },
      { who: '# sample-two', role: '12 members', last: 'Morning', time: '1h', unread: 0, group: true, messages: [{ who: 'Ivy', t: 'Morning', time: '1h', me: false }] },
    ] },
    { id: 'support', label: 'Help', title: 'Help', support: true, threads: [{ who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }] }] },
  ];
  const root = ReactDOMClient.createRoot(w.document.getElementById('r'));
  await React.act(async () => root.render(React.createElement(w.ChatWidget, { tabs })));
  await settle();
  await React.act(async () => { w.__openChat(null, 'community'); });
  await settle(12);
  const doc = w.document;
  const rows = () => [...doc.querySelectorAll('.chw-row')].map((r) => r.textContent);
  const row = (name) => [...doc.querySelectorAll('.chw-row')].find((r) => r.textContent.includes(name));
  const click = async (el) => { await React.act(async () => { el.click(); }); await settle(); };
  const button = (text) => [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const type = async (text) => {
    const ta = doc.querySelector('.cw-composer textarea');
    const set = Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set;
    await React.act(async () => { set.call(ta, text); ta.dispatchEvent(new w.Event('input', { bubbles: true })); });
  };
  const done = async () => {
    await React.act(async () => root.unmount());
    w.close();
    Object.assign(globalThis, { window: before.window, document: before.document, localStorage: before.localStorage, IS_REACT_ACT_ENVIRONMENT: before.act, fetch: before.fetch });
    if (before.navigator) Object.defineProperty(globalThis, 'navigator', before.navigator); else delete globalThis.navigator;
  };
  return { w, doc, rows, row, click, button, type, done };
}

const world = () => ({
  channels: [
    // As the table reads once the migration has run: every row carries `official`.
    { id: 'ch-run', name: 'sunday-run-club', description: 'Long runs', created_by: 'u9', official: false, visibility: 'public', last_message: 'See you at 6', last_message_at: '2026-11-10T09:00:00Z' },
    { id: 'ch-pr', name: 'PR Wall', description: 'Every public member’s new personal records, automatically.', created_by: null, official: true, visibility: 'public', last_message: 'New PRs land here.', last_message_at: '2026-06-14T21:22:06Z' },
    { id: 'ch-mine', name: 'macro-mondays', description: '', created_by: 'u1', official: false, visibility: 'public', last_message: '', last_message_at: null, picture_path: 'ch-mine/a.jpg' },
    { id: 'ch-hq', name: 'Shape HQ', description: 'The official Shape channel: product news, drops and events.', created_by: null, official: true, visibility: 'public', read_only: true, last_message: 'Welcome to Shape HQ.', last_message_at: '2026-11-10T06:00:00Z' },
    // A member's channel named after Shape's: not Shape's, so not pinned and not marked as Shape's.
    { id: 'ch-fake', name: 'PR Wall', description: '', created_by: 'u5', official: false, visibility: 'public', last_message: '', last_message_at: '2026-11-01T00:00:00Z' },
    // A deleted member's channel: created_by is ON DELETE SET NULL, so it has no owner, and it is
    // still not Shape's.
    { id: 'ch-orphan', name: 'Shape HQ', description: '', created_by: null, official: false, visibility: 'public', last_message: '', last_message_at: '2026-10-01T00:00:00Z' },
  ],
  channel_members: [
    { channel_id: 'ch-run', user_id: 'u9', role: 'host', pinned: false },
    { channel_id: 'ch-mine', user_id: 'u1', role: 'host', pinned: true },
  ],
  channel_messages: [
    { id: 'a', channel_id: 'ch-run', sender_id: 'u9', author_name: 'Diego', body: 'Saturday 6am long run', created_at: '2026-11-10T08:00:00Z' },
    { id: 'b', channel_id: 'ch-run', sender_id: 'u8', author_name: 'Priya', body: 'In. 8:00 pace', created_at: '2026-11-10T08:30:00Z' },
    // A channel with history, so a message sent here is followed by an incremental read
    // (after the last one seen) rather than another first read.
    { id: 'c', channel_id: 'ch-mine', sender_id: 'u7', author_name: 'Owen', body: 'Fiber is the forgotten macro', created_at: '2026-11-10T07:00:00Z' },
  ],
  unread: [{ channel_id: 'ch-run', unread: 2 }],
});

test('a member sees the real channels, in the app\'s order, and not the sample', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    const r = m.rows();
    assert.equal(r.length, 6, 'six real channels: ' + r.join(' | '));
    assert.ok(!r.some((x) => /shape-community|sample-two/.test(x)), 'a sample channel is still listed');
    assert.match(r[0], /Shape HQ/, 'Shape HQ is pinned first, for everyone');
    assert.match(r[1], /PR Wall/, 'then the PR Wall');
    assert.match(r[0], /SHAPE/, 'marked as Shape\'s own');
    assert.match(r[1], /SHAPE/);
    assert.match(r[2], /macro-mondays/, 'then the member\'s own pin');
    assert.ok(r.slice(3).some((x) => /sunday-run-club/.test(x)));
    // The impostor is listed as the member's channel it is.
    const fake = [...m.doc.querySelectorAll('.chw-row')].slice(3).find((x) => /PR Wall/.test(x.textContent));
    assert.ok(fake, 'a member\'s channel named PR Wall is missing');
    assert.doesNotMatch(fake.textContent, /SHAPE/, 'a member\'s channel is marked as Shape\'s');
    assert.equal(fake.querySelector('[data-channel-mark]').getAttribute('data-channel-mark'), 'initials', 'a member\'s channel wears Shape\'s trophy');
    const orphan = [...m.doc.querySelectorAll('.chw-row')].slice(3).find((x) => /Shape HQ/.test(x.textContent));
    assert.ok(orphan, 'a deleted member\'s channel named Shape HQ is missing, or pinned as Shape\'s');
    assert.doesNotMatch(orphan.textContent, /SHAPE/, 'a deleted member\'s channel is marked as Shape\'s');
    assert.equal(orphan.querySelector('[data-channel-mark]').getAttribute('data-channel-mark'), 'initials', 'a deleted member\'s channel wears Shape\'s triangles');
    assert.equal(m.row('Shape HQ').querySelector('[data-channel-mark]').getAttribute('data-channel-mark'), 'shape', 'Shape HQ does not wear the triangles');
    const pic = m.row('macro-mondays').querySelector('[data-channel-mark="picture"] img');
    assert.ok(pic, 'the host\'s picture is not drawn');
    assert.equal(pic.getAttribute('src'), 'https://cdn.test/channel-pictures/ch-mine/a.jpg', 'the address is not built from the stored path');
    assert.match(m.row('sunday-run-club').textContent, /JOIN/, 'a channel you are not in says Join');
    assert.match(m.row('sunday-run-club').textContent, /2/, 'its unread count comes from channel_unread');
    assert.ok(!m.row('PR Wall').querySelector('.chw-pin'), 'Shape\'s own channel cannot be unpinned');
  } finally { await m.done(); }
});

test('opening a channel reads its newest messages and marks it read', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    await m.click(m.row('sunday-run-club'));
    await settle(10);
    // The thread, after its head (the row above carries the last line as its preview).
    const text = m.doc.querySelector('[data-chat-panel]').textContent;
    const thread = text.slice(text.indexOf('1 member \u00b7 Long runs'));
    assert.ok(thread.indexOf('Saturday 6am long run') >= 0 && thread.indexOf('Saturday 6am long run') < thread.indexOf('In. 8:00 pace'), 'oldest first on screen');
    const read = log.find((x) => x[0] === 'select' && x[1] === 'channel_messages');
    assert.match(read[2], /eq\.order\.limit/, 'the first read is newest-first with a limit');
    assert.ok(log.some((x) => x[0] === 'rpc' && x[1] === 'mark_channel_read' && x[2].p_channel_id === 'ch-run'), 'opening it marks it read');
  } finally { await m.done(); }
});

test('a channel you are not in offers Join, and joining writes your own member row', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    await m.click(m.row('sunday-run-club'));
    assert.ok(m.doc.querySelector('[data-channel-join]'), 'no Join bar');
    assert.ok(!m.doc.querySelector('.cw-composer'), 'the composer shows before joining');
    await m.click(m.button('Join'));
    const ins = log.find((x) => x[0] === 'insert' && x[1] === 'channel_members');
    assert.deepEqual(ins[2], { channel_id: 'ch-run', user_id: 'u1', role: 'member' }, 'joined as someone else, or as host');
    assert.ok(!m.doc.querySelector('[data-channel-join]'), 'still asked to join');
    assert.ok(m.doc.querySelector('.cw-composer'), 'no composer once joined');
    assert.match(m.doc.querySelector('[data-chat-panel]').textContent, /2 members · Long runs/, 'the member count did not move');
    assert.doesNotMatch(m.row('sunday-run-club').textContent, /JOIN/, 'the row still says Join');
  } finally { await m.done(); }
});

test('a refused join says so and posts nothing', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log, insertError: { channel_members: { code: '42501', message: 'new row violates row-level security policy' } } }) });
  try {
    await m.click(m.row('sunday-run-club'));
    await m.click(m.button('Join'));
    const bar = m.doc.querySelector('[data-channel-join]');
    assert.ok(bar, 'the Join bar went away on a refusal');
    assert.match(bar.textContent, /Couldn.t join/);
    assert.ok(!m.doc.querySelector('.cw-composer'));
  } finally { await m.done(); }
});

test('a message to a channel is stored as the member, then shown once', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    await m.click(m.row('macro-mondays'));
    await m.type('Protein first this week');
    await m.click(m.button('Send'));
    await settle(10);
    const ins = log.find((x) => x[0] === 'insert' && x[1] === 'channel_messages');
    assert.deepEqual(ins[2], { channel_id: 'ch-mine', sender_id: 'u1', author_name: 'Ann Lee', body: 'Protein first this week' });
    assert.ok(m.doc.querySelector('[data-chat-panel]').textContent.includes('Fiber is the forgotten macro'), 'the channel\'s history was not read');
    // The next read finds the stored copy; the page's own copy gives way to it.
    await React.act(async () => { await new Promise((r) => setTimeout(r, 8200)); });
    await settle(6);
    assert.ok(log.some((x) => x[0] === 'select' && x[1] === 'channel_messages' && /gt/.test(x[2])), 'no read after the last one seen');
    const panel = m.doc.querySelector('[data-chat-panel]').textContent;
    assert.equal(panel.split('Protein first this week').length - 1, 2, 'shown once in the thread (and once as the row\'s last line): ' + panel.split('Protein first this week').length);
    assert.doesNotMatch(panel, /Not sent/);
  } finally { await m.done(); }
});

test('creating a channel makes a real one, with you as its host', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    await m.click(m.button('+ NEW CHANNEL'));
    const name = m.doc.querySelector('input[placeholder="channel-name"]');
    const set = Object.getOwnPropertyDescriptor(m.w.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { set.call(name, 'Hill Repeats'); name.dispatchEvent(new m.w.Event('input', { bubbles: true })); });
    await m.click(m.button('Create'));
    await settle();
    const call = log.find((x) => x[0] === 'rpc' && x[1] === 'create_channel');
    assert.deepEqual(call[2], { p_name: 'hill-repeats', p_description: null, p_visibility: 'public' });
    assert.ok(m.row('hill-repeats'), 'the new channel is not listed');
    assert.doesNotMatch(m.row('hill-repeats').textContent, /JOIN/, 'its host is asked to join it');
    assert.ok(m.doc.querySelector('.cw-composer'), 'its host cannot post in it');
  } finally { await m.done(); }
});

test('a pin on a channel you are in is kept on your account', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    await m.click(m.row('macro-mondays').querySelector('.chw-pin'));
    assert.ok(log.some((x) => x[0] === 'rpc' && x[1] === 'set_channel_pinned' && x[2].p_channel_id === 'ch-mine' && x[2].p_pinned === false), 'the unpin was not stored');
  } finally { await m.done(); }
});

test('a channel read that fails leaves the list as it was, and a visitor keeps the sample', async () => {
  const log = [];
  const failing = await mount({ db: fakeDb({ tables: world(), log, failChannels: true }) });
  try {
    assert.ok(failing.rows().some((x) => /shape-community/.test(x)), 'a failed read installed an empty list');
  } finally { await failing.done(); }
  const visitor = await mount({ signedIn: false, db: fakeDb({ tables: world(), log: [] }) });
  try {
    assert.ok(visitor.rows().some((x) => /shape-community/.test(x)), 'a visitor lost the sample');
    assert.ok(!visitor.rows().some((x) => /sunday-run-club/.test(x)), 'a visitor was shown members\' channels');
  } finally { await visitor.done(); }
});

test('Shape HQ is pinned only when it is real', () => {
  const at = SRC.indexOf('function cwChannelThreads(');
  const role = SRC.indexOf('function cwChannelRole(');
  assert.ok(at > 0 && role > 0, 'the channel helpers moved');
  const end = SRC.indexOf('\n}\n', at) + 3;
  const S = {};
  new Function('S', `${SRC.slice(role, SRC.indexOf('\n}\n', role) + 3)}\n${SRC.slice(at, end)}\nS.f = cwChannelThreads;`)(S);
  const when = () => 'now';
  // Before the migration has run: no flag, and the ownerless channel is Shape's, as before.
  const none = S.f([{ id: 'a', name: 'run', created_by: 'u2' }, { id: 'p', name: 'PR Wall' }], [], 'u1', {}, when);
  assert.deepEqual(none.map((t) => t.name), ['PR Wall', 'run'], 'no canned Shape HQ');
  assert.ok(none[0].official && none[0].pinned && !none[1].official, 'before the migration, the ownerless PR Wall is not Shape\'s');
  // After: the flag alone. An ownerless channel without it (a deleted member's) is not Shape's.
  const real = S.f([{ id: 'a', name: 'run', created_by: 'u2', official: false }, { id: 'p', name: 'PR Wall', official: true }, { id: 'o', name: 'Shape HQ', created_by: null, official: false }, { id: 'h', name: 'Shape HQ', official: true }], [], 'u1', {}, when);
  assert.deepEqual(real.map((t) => t.channelId), ['h', 'p', 'a', 'o'], 'the real HQ, then the PR Wall, then the rest');
  assert.ok(real[0].official && real[0].pinned && real[1].official, 'Shape\'s two are pinned and marked');
  assert.ok(!real[3].official && !real[3].pinned, 'a deleted member\'s channel named Shape HQ is taken for Shape\'s');
});

test('Shape HQ is read, not posted in: no composer and no Join', async () => {
  const m = await mount({ db: fakeDb({ tables: world(), log: [] }) });
  try {
    await m.click(m.row('Shape HQ'));
    assert.ok(m.doc.querySelector('[data-channel-readonly]'), 'no note that only Shape posts here');
    assert.match(m.doc.querySelector('[data-channel-readonly]').textContent, /Only Shape posts here/);
    assert.ok(!m.doc.querySelector('.cw-composer'), 'a composer in a read-only channel');
    assert.ok(!m.doc.querySelector('[data-channel-join]'), 'Join in a read-only channel');
    assert.ok(!m.doc.querySelector('[data-channel-picture]'), 'Shape\'s channel offers a picture change');
  } finally { await m.done(); }
});

test('the host changes the channel\'s picture: into its folder, then its path onto the channel', async () => {
  const tables = world();
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    await m.click(m.row('sunday-run-club'));
    assert.ok(!m.doc.querySelector('[data-channel-picture]'), 'a channel you do not host offers a picture change');
    await m.click(m.row('macro-mondays'));
    // The old picture fails to load: the circle falls back to the initials…
    const old = m.row('macro-mondays').querySelector('[data-channel-mark="picture"] img');
    assert.ok(old, 'the stored picture is not drawn');
    await React.act(async () => { old.dispatchEvent(new m.w.Event('error')); });
    assert.equal(m.row('macro-mondays').querySelector('[data-channel-mark]').getAttribute('data-channel-mark'), 'initials', 'a picture that failed to load is still drawn');
    const btn = m.doc.querySelector('[data-channel-picture]');
    assert.ok(btn, 'the host is not offered a picture change');
    const input = btn.parentNode.querySelector('input[type="file"]');
    const file = new m.w.File(['png'], 'p.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await React.act(async () => { input.dispatchEvent(new m.w.Event('change', { bubbles: true })); });
    await settle(8);
    const up = log.find((x) => x[0] === 'upload');
    assert.ok(up, 'nothing was uploaded');
    assert.equal(up[1], 'channel-pictures');
    assert.match(up[2], /^ch-mine\/\d+-[a-z0-9]+\.png$/, 'not into the channel\'s own folder: ' + up[2]);
    assert.equal(up[3], 'image/png');
    const upd = log.find((x) => x[0] === 'update' && x[1] === 'channels');
    assert.deepEqual([upd[2], upd[3]], [{ picture_path: up[2] }, 'ch-mine'], 'the path was not stored on the channel');
    // …and the new one gets its own try (Codex P2 on #2676).
    const img = m.row('macro-mondays').querySelector('[data-channel-mark="picture"] img');
    assert.ok(img, 'the new picture is hidden because the old one failed to load');
    assert.equal(img.getAttribute('src'), `https://cdn.test/channel-pictures/${up[2]}`, 'the new picture is not drawn');
  } finally { await m.done(); }
});

test('a picture that is not an image, or too large, is refused before anything is sent', async () => {
  const log = [];
  const m = await mount({ db: fakeDb({ tables: world(), log }) });
  try {
    await m.click(m.row('macro-mondays'));
    const input = m.doc.querySelector('[data-channel-picture]').parentNode.querySelector('input[type="file"]');
    const pdf = new m.w.File(['%PDF'], 'x.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [pdf], configurable: true });
    await React.act(async () => { input.dispatchEvent(new m.w.Event('change', { bubbles: true })); });
    await settle();
    assert.ok(!log.some((x) => x[0] === 'upload'), 'a PDF was uploaded');
    assert.match(m.doc.querySelector('[data-chat-panel]').textContent, /Use a JPEG, PNG, WebP or GIF/);
    // A picture over 5 MB (the bucket's limit) is refused here, not sent to be refused.
    const big = new m.w.File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    await React.act(async () => { input.dispatchEvent(new m.w.Event('change', { bubbles: true })); });
    await settle();
    assert.ok(!log.some((x) => x[0] === 'upload'), 'a picture over 5 MB was uploaded');
    assert.match(m.doc.querySelector('[data-chat-panel]').textContent, /Use a picture under 5 MB/);
  } finally { await m.done(); }
});

// Every membership row, a page at a time (Codex P2 on #2676): one read past the API's 1,000-row
// ceiling cut the counts short and could drop the member's own row, so a member was shown Join.
test('a channel with more members than one answer holds: the full count, and you are still in it', async () => {
  const tables = world();
  // 2,500 members of sunday-run-club, the member ('u1') sorted last of them.
  for (let i = 0; i < 2500; i++) tables.channel_members.push({ channel_id: 'ch-run', user_id: 'm' + String(i).padStart(4, '0'), role: 'member', pinned: false });
  tables.channel_members.push({ channel_id: 'ch-run', user_id: 'u1', role: 'member', pinned: false });
  const log = [];
  const m = await mount({ db: fakeDb({ tables, log }) });
  try {
    assert.doesNotMatch(m.row('sunday-run-club').textContent, /JOIN/, 'a member past the first answer is asked to join');
    await m.click(m.row('sunday-run-club'));
    const panel = m.doc.querySelector('[data-chat-panel]').textContent;
    assert.match(panel, /2502 members/, 'the count stops at one answer');
    assert.ok(!m.doc.querySelector('[data-channel-join]'), 'a member past the first answer is asked to join');
    assert.ok(m.doc.querySelector('.cw-composer'), 'a member past the first answer gets no composer');
    assert.ok(log.filter((x) => x[0] === 'select' && x[1] === 'channel_members').length >= 3, 'the rows were not read a page at a time');
  } finally { await m.done(); }
});

test('a server that answers every page with the first one: the read stops, and your own rows are read on their own', async () => {
  const at = SRC.indexOf('const CW_MEMBER_PAGE = 1000');
  const end = SRC.indexOf('function cwChannelThreads(');
  assert.ok(at > 0 && end > at, 'the membership read moved');
  const S = {};
  new Function('S', `${SRC.slice(at, end)}\nS.read = cwReadChannelMembers;`)(S);
  const tables = { channel_members: [] };
  for (let i = 0; i < 1500; i++) tables.channel_members.push({ channel_id: 'ch-run', user_id: 'm' + String(i).padStart(4, '0'), role: 'member', pinned: false });
  tables.channel_members.push({ channel_id: 'ch-run', user_id: 'u1', role: 'host', pinned: true });
  const log = [];
  const res = await S.read(fakeDb({ tables, log, ignoreRange: true }).client, ['ch-run'], 'u1');
  const reads = log.filter((x) => x[0] === 'select' && x[1] === 'channel_members');
  assert.equal(reads.length, 101, 'the read does not stop at its last page, then read your own rows once');
  const mine = res.data.filter((x) => x.user_id === 'u1');
  assert.equal(mine.length, 1, 'your own row is missing, or there twice');
  assert.equal(mine[0].role, 'host');
  assert.ok(mine[0].pinned);
});

// Codex P2 on #2676: the channel reads came after the coach inbox read, which returned early on a
// failure, so a refused inbox kept a member on the sample channels for the session.
test('a refused inbox read leaves the coach threads be, and the channels are still the real ones', async () => {
  const m = await mount({ db: fakeDb({ tables: world(), log: [], failConversations: true }) });
  try {
    const r = m.rows();
    assert.ok(!r.some((x) => /shape-community|sample-two/.test(x)), 'the sample channels stayed: ' + r.join(' | '));
    assert.match(r[0], /Shape HQ/, 'the real channels were not read');
  } finally { await m.done(); }
});

// Codex P2 on #2676: with something typed before the reads landed, the merge kept every thread and
// only added the live ones, and the sample channels (no ids) were never replaced.
test('typed before the reads land: the sample channels go, the one you wrote in stays, and stays open', async () => {
  let release;
  const gate = new Promise((res) => { release = res; });
  const m = await mount({ db: fakeDb({ tables: world(), log: [], gate }) });
  try {
    assert.ok(m.rows().some((x) => /sample-two/.test(x)), 'the sample is not what shows before the reads land');
    // The second sample channel, so the first one going moves it up the list.
    await m.click(m.row('sample-two'));
    await m.type('First!');
    await m.click(m.doc.querySelector('.cw-send'));
    await React.act(async () => { release(); });
    await settle(14);
    const r = m.rows();
    assert.ok(r.some((x) => /Shape HQ/.test(x)), 'the real channels did not arrive: ' + r.join(' | '));
    assert.ok(!r.some((x) => /shape-community/.test(x)), 'a sample channel nobody wrote in stayed beside the real ones');
    assert.ok(r.some((x) => /sample-two/.test(x)), 'the channel the member wrote in was taken away');
    assert.match(m.doc.querySelector('[data-chat-panel]').textContent, /First!/, 'the open channel is no longer the one the member wrote in');
  } finally { await m.done(); }
});
