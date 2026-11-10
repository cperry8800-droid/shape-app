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
function fakeDb({ tables, log, failChannels = false, insertError = null }) {
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
    log.push(['select', state.table, ops.map((o) => o[0]).join('.')]);
    if (state.table === 'channels') return failChannels ? { data: null, error: { message: 'down' } } : { data: tables.channels, error: null };
    if (state.table === 'channel_members') {
      const ids = (has('in') || [, [, []]])[1][1];
      return { data: tables.channel_members.filter((m) => ids.includes(m.channel_id)), error: null };
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
  return {
    getSession: async () => ({}),
    getUserGoals: async () => null,
    getProfile: async () => ({ full_name: 'Ann Lee' }),
    client: { auth: { getUser: async () => ({ data: { user } }) }, from, rpc },
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
    { id: 'ch-run', name: 'sunday-run-club', description: 'Long runs', created_by: 'u9', visibility: 'public', last_message: 'See you at 6', last_message_at: '2026-11-10T09:00:00Z' },
    { id: 'ch-pr', name: 'PR Wall', description: 'Every public member’s new personal records, automatically.', created_by: null, visibility: 'public', last_message: 'New PRs land here.', last_message_at: '2026-06-14T21:22:06Z' },
    { id: 'ch-mine', name: 'macro-mondays', description: '', created_by: 'u1', visibility: 'public', last_message: '', last_message_at: null },
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
    assert.equal(r.length, 3, 'three real channels: ' + r.join(' | '));
    assert.ok(!r.some((x) => /shape-community/.test(x)), 'the sample channel is still listed');
    assert.match(r[0], /PR Wall/, 'the PR Wall is pinned first, for everyone');
    assert.match(r[0], /SHAPE/, 'and marked as Shape\'s own');
    assert.match(r[1], /macro-mondays/, 'then the member\'s own pin');
    assert.match(r[2], /sunday-run-club/);
    assert.match(m.row('sunday-run-club').textContent, /JOIN/, 'a channel you are not in says Join');
    assert.match(m.row('sunday-run-club').textContent, /2/, 'its unread count comes from channel_unread');
    assert.equal(m.row('PR Wall').querySelector('.chw-pin'), null, 'Shape\'s own channel cannot be unpinned');
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
    assert.equal(m.doc.querySelector('.cw-composer'), null, 'the composer shows before joining');
    await m.click(m.button('Join'));
    const ins = log.find((x) => x[0] === 'insert' && x[1] === 'channel_members');
    assert.deepEqual(ins[2], { channel_id: 'ch-run', user_id: 'u1', role: 'member' }, 'joined as someone else, or as host');
    assert.equal(m.doc.querySelector('[data-channel-join]'), null, 'still asked to join');
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
    assert.equal(m.doc.querySelector('.cw-composer'), null);
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
  const none = S.f([{ id: 'a', name: 'run' }, { id: 'p', name: 'PR Wall' }], [], 'u1', {}, when);
  assert.deepEqual(none.map((t) => t.name), ['PR Wall', 'run'], 'no canned Shape HQ');
  const real = S.f([{ id: 'a', name: 'run' }, { id: 'p', name: 'PR Wall' }, { id: 'h', name: 'Shape HQ' }], [], 'u1', {}, when);
  assert.deepEqual(real.map((t) => t.name), ['Shape HQ', 'PR Wall', 'run'], 'a real HQ goes first');
  assert.ok(real[0].official && real[0].pinned && real[1].official, 'Shape\'s two are pinned and marked');
});
