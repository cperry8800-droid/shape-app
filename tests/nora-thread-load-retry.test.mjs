// The website's Nora pop-up, mounted for real (public/newdesign/chatWidget.jsx in jsdom, React
// from the repo): the conversation store is loaded at sign-in and, when that load fails, again
// when the panel opens, so a page that missed it still keeps what is said and offers Talk to a
// person. The other thread tests read the source; this one runs it (the trace for the owner,
// 2026-10-17: a single failed GET left a page unsynced for good, and CI could not see it).
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
const ReactDOMClient = require('react-dom/client');

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
// pageShell.jsx's colour and type constants, which the widget reads as globals on the site.
const SHELL_CONSTS = read('public/newdesign/pageShell.jsx').split('\n').filter((l) => /^const [A-Za-z_]+ = ("[^"]*"|'[^']*');/.test(l)).join('\n');
const WIDGET = babel.transformSync(`${SHELL_CONSTS}\n${read('public/newdesign/chatWidget.jsx')}`, {
  presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script',
}).code;

const settle = async (n = 6) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };

// signedIn: what /api/me says; threadGets: the status of each GET /api/nora/thread in turn;
// stored: the account's thread a 200 returns; me: /api/me's read, when a test holds it back;
// db: what window.shapeEnsureDb loads, as on the 25 pages without /supabase.js.
// seed: localStorage entries already on the browser; greeting: GET /api/support/chat's answer.
// A 'hold' in threadGets, or holdAnswer, keeps that answer on its way until release() (stored
// may be a function, read when the request is made).
// teamTab: a second, non-Nora tab beside hers; member: an active subscription (the composer outside Nora's tab).
// conversations: the stored messages GET /api/conversations/<id>/messages returns.
// streamAnswer: each answer streams, as the live route does; held.streams[i] is the i-th, with
// .text(t) to send what she has written so far, .reset() to take it back (a round that turned
// out to be a lookup) and .end(reply) to finish it.
// holdRequest: 'reject' fails the held "Talk to a person" send instead of answering it.
// circleTab: a coaches tab (id 'circle') for the live coach threads the db option can serve.
// serverAs: the account the server reads from the cookie now (read at each request); a write or a
// question that names another one is refused with 409 account_changed, as the routes do.
// busySave: each save answers 409 thread_busy (other devices kept winning the write).
async function mount({ signedIn = true, threadGets = [200], stored = [], me = null, db = null, docked = false, seed = {}, greeting = {}, holdAnswer = false, holdRequest = false, teamTab = false, member = false, conversations = {}, streamAnswer = false, circleTab = false, serverAs = null, busySave = false } = {}) {
  // jsdom cannot reload a page; it says so on its console, and that is where a reload is counted.
  const reloads = [];
  const vc = new VirtualConsole();
  vc.forwardTo(console, { jsdomErrors: 'none' });
  vc.on('jsdomError', (e) => { if (/Not implemented: navigation/.test(String(e && e.message))) reloads.push(e.message); else console.error(e); });
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: 'https://shape.test/newdesign/ClientApp.html', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const before = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  w.React = React;
  for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, JSON.stringify(v));
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollTo = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const calls = [];
  const posts = []; // the bodies sent to /api/nora/thread, /api/support/chat and /api/support/request
  const deletes = []; // each DELETE /api/nora/thread, with its query
  const gets = [...threadGets];
  // By default the server reads the same cookie /api/me does: the account it last named.
  let lastMe = signedIn ? 'u1' : null;
  const caller = () => (serverAs ? serverAs() : lastMe);
  const refusedFor = (named) => (named && named !== caller() ? answer(409, { error: "You're signed in as another account now. Open the conversation again.", code: 'account_changed', account: caller() }) : null);
  const held = {};
  const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = w.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push(`${method} ${u.split('?')[0]}`);
    if (u.includes('/api/nora/thread') && method === 'GET') {
      if (!signedIn) return answer(401, { error: 'Sign in.' });
      const status = gets.length ? gets.shift() : 200;
      const body = { messages: typeof stored === 'function' ? stored() : stored, account: caller() };
      if (status === 'hold') return new Promise((resolve) => { held.get = () => resolve(answer(200, body)); });
      return answer(status, body);
    }
    if (method === 'POST' && (u.includes('/api/nora/thread') || u.includes('/api/support/chat') || u.includes('/api/support/request'))) posts.push([u.split('?')[0], JSON.parse(opts.body)]);
    if (method === 'DELETE' && u.includes('/api/nora/thread')) deletes.push(u);
    if (method === 'POST' && (u.includes('/api/nora/thread') || u.includes('/api/support/chat') || u.includes('/api/support/request'))) {
      const no = refusedFor(JSON.parse(opts.body).account);
      if (no) return no;
      if (busySave && u.includes('/api/nora/thread')) return answer(409, { error: 'Your conversation is busy on another device. Try again.', code: 'thread_busy' });
    }
    if (method === 'DELETE' && u.includes('/api/nora/thread')) {
      const no = refusedFor(new URL(u, 'https://shape.test').searchParams.get('account'));
      if (no) return no;
    }
    if (u.includes('/api/support/chat') && method === 'POST' && streamAnswer) {
      const queue = [];
      let wake = null;
      const push = (v) => { queue.push(v); if (wake) { const f = wake; wake = null; f(); } };
      const sse = (event, data) => ({ value: new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`), done: false });
      (held.streams = held.streams || []).push({ text: (t) => push(sse('text', { text: t })), reset: () => push(sse('reset', {})), end: (reply) => { push(sse('done', { reply })); push({ value: undefined, done: true }); } });
      const reader = { read: () => new Promise((resolve) => { const next = () => resolve(queue.shift()); if (queue.length) next(); else wake = next; }) };
      return { ok: true, status: 200, headers: { get: (k) => (/content-type/i.test(k) ? 'text/event-stream' : null) }, body: { getReader: () => reader }, json: async () => ({}) };
    }
    if (u.includes('/api/support/chat') && method === 'POST') {
      if (holdAnswer) return new Promise((resolve) => { held.answer = () => resolve(answer(200, { reply: 'Tap + on Eat.' })); });
      return answer(200, { reply: 'Tap + on Eat.' });
    }
    if (u.includes('/api/support/chat')) return answer(200, greeting);
    if (u.includes('/api/support/request') && holdRequest) return new Promise((resolve, reject) => { held.request = () => (holdRequest === 'reject' ? reject(new TypeError('Failed to fetch')) : resolve(answer(200, { ok: true }))); });
    if (u.includes('/api/nora/thread')) return answer(200, { ok: true });
    if (u.includes('/api/stripe/subscription')) return answer(200, { active: member });
    const conv = /\/api\/conversations\/([^/]+)\/messages/.exec(u);
    if (conv && method === 'GET') return answer(200, { messages: url.includes('since=') ? [] : (conversations[decodeURIComponent(conv[1])] || []) });
    return answer(200, {});
  };
  if (db) w.shapeEnsureDb = async () => { w.shapeDb = db; return db; };
  const readMe0 = me || (() => Promise.resolve(signedIn ? { user: { id: 'u1', email: 'ann@shape.test' } } : { user: null }));
  let meReads = 0;
  const readMe = (...a) => { meReads += 1; return Promise.resolve(readMe0(...a)).then((j) => { if (j) lastMe = (j.user && j.user.id) || null; return j; }); };
  new Function('React', 'ReactDOM', 'shapeReadPortalMe', WIDGET)(React, ReactDOMClient, readMe);
  // Her seed greeting, with the chips say() taps.
  const tabs = [{ id: 'nora', label: 'Nora', title: 'Nora', support: true, threads: [{ who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }], quick: ['How do I log a meal?', 'Hi'] }] }];
  if (teamTab) tabs.push({ id: 'team', label: 'Team', title: 'Team', threads: [{ who: 'Team channel', messages: [{ who: 'Ann', t: 'Welcome', me: false }] }] });
  // circleTab: the coaches tab, where the live coach threads are installed (by tab id).
  if (circleTab) tabs.push({ id: 'circle', label: 'Coaches', title: 'Coaches', threads: [{ who: 'Sample coach', messages: [{ who: 'Sample coach', t: 'Hi!', me: false }] }] });
  const root = ReactDOMClient.createRoot(w.document.getElementById('r'));
  await React.act(async () => root.render(React.createElement(w.ChatWidget, { tabs, docked })));
  // Draw again with more tabs (the hydrate re-runs when the count changes, as the Feed tab does).
  const addTab = async () => {
    const more = [...tabs, { id: 'team', label: 'Team', title: 'Team', threads: [{ who: 'Team channel', messages: [] }] }];
    await React.act(async () => root.render(React.createElement(w.ChatWidget, { tabs: more, docked })));
    await settle();
  };
  await settle();
  const open = async () => { await React.act(async () => { w.__openChat({ tab: 'nora' }, 'nora'); }); await settle(); };
  const close = async () => { await React.act(async () => { w.__closeChat ? w.__closeChat() : w.document.querySelector('[data-chat-panel] button[aria-label="Close"]')?.click(); }); await settle(); };
  const done = async () => {
    await React.act(async () => root.unmount());
    w.close();
    Object.assign(globalThis, { window: before.window, document: before.document, localStorage: before.localStorage, IS_REACT_ACT_ENVIRONMENT: before.act, fetch: before.fetch });
    if (before.navigator) Object.defineProperty(globalThis, 'navigator', before.navigator); else delete globalThis.navigator;
  };
  const threadGetsSoFar = () => calls.filter((c) => c === 'GET /api/nora/thread').length;
  const personButton = () => w.document.querySelector('[data-nora-person]');
  // Ask Nora by her suggestion chip, which sends through the composer's own send(). (React DOM
  // loads before jsdom here, so it falls back to an input-event polyfill a typed message trips.)
  const say = async (text) => {
    const chip = [...w.document.querySelectorAll('button')].find((b) => b.textContent === text);
    assert.ok(chip, `no chip for ${text}`);
    await React.act(async () => { chip.click(); });
    await settle();
  };
  const appended = () => posts.filter(([u]) => u === '/api/nora/thread').map(([, b]) => b.append);
  const release = async (k) => { await React.act(async () => { held[k](); }); await settle(); };
  return { w, calls, posts, deletes, held, reloads, open, close, done, threadGetsSoFar, personButton, say, appended, addTab, release, meReads: () => meReads };
}

test('a failed first load is tried again when the panel opens, and then Talk to a person shows', async () => {
  const m = await mount({ threadGets: [429, 200] });
  try {
    assert.equal(m.threadGetsSoFar(), 1, 'loaded once at sign-in, and that load failed');
    await m.open();
    assert.equal(m.threadGetsSoFar(), 2, 'opening the panel tried it again');
    assert.ok(m.personButton(), 'synced: Talk to a person is offered');
  } finally {
    await m.done();
  }
});

test('a load that worked is not repeated on open, and a visitor is never asked', async () => {
  const ok = await mount({ threadGets: [200] });
  try {
    assert.equal(ok.threadGetsSoFar(), 1);
    await ok.open();
    // cwPullTeam asks once more on each open for a team reply; the load itself is not repeated.
    assert.ok(ok.calls.filter((c) => c === 'GET /api/nora/thread').length <= 2, 'one pull for team replies at most');
    assert.ok(ok.personButton());
  } finally {
    await ok.done();
  }
  const visitor = await mount({ signedIn: false });
  try {
    await visitor.open();
    assert.equal(visitor.threadGetsSoFar(), 0, 'signed out: no load, at sign-in or on open');
    assert.equal(visitor.personButton(), null);
  } finally {
    await visitor.done();
  }
});

// ── Codex, #2391 ─────────────────────────────────────────────────────────────────
// What is said while the store is down is held, and the retry joins the stored thread at the
// hydrate's point, as the first attempt did: never measured against the thread as drawn.
const waitForRetry = async () => { await React.act(async () => { await new Promise((r) => setTimeout(r, 2300)); }); await settle(); };

test('an exchange held while the store was down is sent once into an empty account', async () => {
  const m = await mount({ threadGets: [429, 429, 200] });
  try {
    await m.open();
    assert.equal(m.threadGetsSoFar(), 2, 'sign-in and open both missed');
    await m.say('How do I log a meal?');
    assert.deepEqual(m.appended(), [], 'held: the store has not answered');
    await waitForRetry();
    assert.equal(m.threadGetsSoFar(), 3, 'a miss while the panel is open is tried again, 2 seconds on');
    const sent = m.appended().flat().map((x) => `${x.role}: ${x.text}`);
    assert.deepEqual(sent, ['user: How do I log a meal?', 'assistant: Tap + on Eat.'], 'once: not migrated as the browser\'s copy and then sent again as held');
    assert.ok(m.personButton());
  } finally {
    await m.done();
  }
});

test('an exchange held while the store was down stays in view after the stored thread', async () => {
  const stored = [{ role: 'user', text: 'Earlier question', at: '2026-10-16T10:00:00Z' }, { role: 'assistant', text: 'Earlier answer', at: '2026-10-16T10:00:05Z' }];
  const m = await mount({ threadGets: [429, 429, 200], stored });
  try {
    await m.open();
    await m.say('How do I log a meal?');
    await waitForRetry();
    const text = m.w.document.body.textContent;
    assert.ok(text.includes('Earlier answer'), 'the stored thread is placed');
    assert.ok(text.indexOf('How do I log a meal?') > text.indexOf('Earlier answer'), 'and what was said here follows it');
    assert.ok(text.includes('Tap + on Eat.'));
    assert.deepEqual(m.appended().flat().map((x) => x.text), ['How do I log a meal?', 'Tap + on Eat.'], 'only the held exchange is sent');
  } finally {
    await m.done();
  }
});

// /api/me down on the first read, answering on the next (it is not cached when it fails).
function flakyMe() {
  const waiting = [];
  let down = true;
  const me = () => (down ? new Promise((_, reject) => { waiting.push(reject); }) : Promise.resolve({ user: { id: 'u1', email: 'ann@shape.test' } }));
  // Fails the reads waiting now; `stayDown` keeps the next ones failing too.
  const fail = ({ stayDown = false } = {}) => { down = stayDown; waiting.splice(0).forEach((reject) => reject(new Error('down'))); };
  return { me, fail };
}

test('with /api/me unanswered nothing loads; it is asked again, and the load follows its answer', async () => {
  const { me, fail } = flakyMe();
  const m = await mount({ me });
  try {
    await m.open();
    assert.equal(m.threadGetsSoFar(), 0, 'nothing to measure against yet');
    await React.act(async () => { fail(); });
    await settle();
    assert.equal(m.threadGetsSoFar(), 0, 'unknown: no load');
    // The panel was open when the read failed, a miss: /api/me is asked again 2 seconds on.
    await waitForRetry();
    assert.equal(m.threadGetsSoFar(), 1, 'loaded once the account is known');
    assert.ok(m.personButton());
  } finally {
    await m.done();
  }
});

test('an unknown identity never writes the account\'s thread under the signed-out key, nor sends that copy up', async () => {
  const ANON = 'shape.chat.v2.anon';
  const anonCopy = { threadsByTab: [[{ who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }, { who: 'You', t: 'Anon question', me: true }, { who: 'Nora', t: 'Anon answer', me: false }] }]], activeByTab: [0] };
  for (const stored of [[], [{ role: 'user', text: 'Private question', at: '2026-10-16T10:00:00Z' }, { role: 'assistant', text: 'Private answer', at: '2026-10-16T10:00:05Z' }]]) {
    const { me, fail } = flakyMe();
    const m = await mount({ me, stored, seed: { [ANON]: anonCopy } });
    try {
      await React.act(async () => { fail(); }); // the first read fails with the panel closed
      await settle();
      assert.equal(m.threadGetsSoFar(), 0, 'unknown: no load');
      await m.open(); // asks /api/me again, which answers: re-keyed, then loaded
      assert.equal(m.threadGetsSoFar(), 1);
      assert.ok(m.personButton());
      const anon = m.w.localStorage.getItem(ANON) || '';
      assert.doesNotMatch(anon, /Private/, 'the account\'s thread never lands under the signed-out key');
      assert.ok(!m.appended().flat().some((x) => /Anon/.test(x.text)), 'the signed-out copy is never sent to the account');
      if (stored.length) assert.ok(m.w.document.body.textContent.includes('Private answer'), 'the account\'s thread is shown');
    } finally {
      await m.done();
    }
  }
});

test('what is said while /api/me is unanswered is kept; the signed-out copy it was said beside is not sent up', async () => {
  const ANON = 'shape.chat.v2.anon';
  const anonCopy = { threadsByTab: [[{ who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }, { who: 'You', t: 'Anon question', me: true }, { who: 'Nora', t: 'Anon answer', me: false }], quick: ['How do I log a meal?'] }]], activeByTab: [0] };
  const { me, fail } = flakyMe();
  const m = await mount({ me, stored: [], seed: { [ANON]: anonCopy } });
  try {
    await React.act(async () => { fail({ stayDown: true }); });
    await settle();
    await m.open(); // asks again at once; that read waits
    await React.act(async () => { fail({ stayDown: true }); }); // and fails: a miss
    await settle();
    await m.say('How do I log a meal?'); // said while unknown: held
    assert.equal(m.threadGetsSoFar(), 0);
    await React.act(async () => { fail(); }); // /api/me answers from here on
    await waitForRetry(); // asked again 2 seconds on: signed in, so it loads
    assert.equal(m.threadGetsSoFar(), 1);
    assert.deepEqual(m.appended().flat().map((x) => x.text), ['How do I log a meal?', 'Tap + on Eat.'], 'only what this person said here');
  } finally {
    await m.done();
  }
});

// The account's own saved copy on this browser, and a signed-out copy beside it.
const MEMBER = 'shape.chat.v2.u1';
const memberCopy = { threadsByTab: [[
  { who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }, { who: 'You', t: 'Member saved question', me: true }, { who: 'Nora', t: 'Member saved answer', me: false }], quick: ['How do I log a meal?'] },
  { who: 'Team channel', messages: [{ who: 'You', t: 'Member channel note', me: true }] },
]], activeByTab: [0] };
const anonCopyWithChips = { threadsByTab: [[{ who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }, { who: 'You', t: 'Anon question', me: true }, { who: 'Nora', t: 'Anon answer', me: false }], quick: ['How do I log a meal?'] }]], activeByTab: [0] };

// /api/me fails at sign-in and again when the panel opens; `between` runs while it is down.
async function unknownThenKnown(m, fail, between) {
  await React.act(async () => { fail({ stayDown: true }); });
  await settle();
  await m.open();
  await React.act(async () => { fail({ stayDown: true }); });
  await settle();
  await between();
  assert.equal(m.threadGetsSoFar(), 0, 'nothing loads while it is unanswered');
  await React.act(async () => { fail(); });
  await waitForRetry();
  assert.equal(m.threadGetsSoFar(), 1, 'loaded once it answers');
}

test('a re-key after typing keeps the account\'s saved copy, adds what was said, and saved nothing meanwhile', async () => {
  const { me, fail } = flakyMe();
  const m = await mount({ me, stored: [], seed: { [MEMBER]: memberCopy, 'shape.chat.v2.anon': anonCopyWithChips } });
  try {
    await unknownThenKnown(m, fail, () => m.say('How do I log a meal?'));
    const mine = JSON.parse(m.w.localStorage.getItem(MEMBER));
    const said = (who) => mine.threadsByTab[0].find((th) => th.who === who).messages.map((x) => x.t);
    assert.deepEqual(said('Nora'), ['Hi, I am Nora.', 'Member saved question', 'Member saved answer', 'How do I log a meal?', 'Tap + on Eat.'], 'the account\'s copy, then what was said meanwhile');
    assert.deepEqual(said('Team channel'), ['Member channel note'], 'its other threads kept');
    assert.deepEqual(JSON.parse(m.w.localStorage.getItem('shape.chat.v2.anon')), anonCopyWithChips, 'nothing saved under the signed-out key while unanswered');
    assert.deepEqual(m.appended().flat().map((x) => x.text), ['Member saved question', 'Member saved answer', 'How do I log a meal?', 'Tap + on Eat.'], 'the account\'s own copy migrates, then what was said');
  } finally {
    await m.done();
  }
});

test('a Clear pressed while /api/me was unanswered clears the account\'s copy too', async () => {
  const { me, fail } = flakyMe();
  const m = await mount({ me, stored: [{ role: 'user', text: 'Private question', at: '2026-10-16T10:00:00Z' }], seed: { [MEMBER]: memberCopy, 'shape.chat.v2.anon': anonCopyWithChips } });
  m.w.confirm = () => true;
  try {
    await unknownThenKnown(m, fail, async () => {
      await React.act(async () => { m.w.document.querySelector('[data-nora-clear]').click(); });
      await settle();
      await m.say('How do I log a meal?');
    });
    assert.ok(m.calls.indexOf('DELETE /api/nora/thread') >= 0, 'the Clear reaches the account once it is known');
    assert.ok(m.calls.indexOf('DELETE /api/nora/thread') < m.calls.lastIndexOf('POST /api/nora/thread'), 'cleared, then what was said after');
    assert.deepEqual(m.appended().flat().map((x) => x.text), ['How do I log a meal?', 'Tap + on Eat.']);
    const text = m.w.document.body.textContent;
    assert.ok(!/Member saved question|Private question/.test(text), 'nothing from before the Clear is drawn');
    assert.ok(text.includes('Tap + on Eat.'));
    assert.doesNotMatch(m.w.localStorage.getItem(MEMBER) || '', /Member saved question/, 'nor kept on this browser');
  } finally {
    await m.done();
  }
});

test('what was opened or said in another tab while /api/me was unanswered joins the account\'s copy', async () => {
  // The hydrate's /api/me read fails; the member check's own read (the composer outside Nora's
  // tab is members-only) answers, so a member can send there meanwhile. Then /api/me answers.
  const { me: flaky, fail } = flakyMe();
  let reads = 0;
  const me = () => (++reads === 2 ? Promise.resolve({ user: { id: 'u1', email: 'ann@shape.test' } }) : flaky());
  const memberWithTeam = { threadsByTab: [memberCopy.threadsByTab[0].slice(0, 1), [{ who: 'Team channel', messages: [{ who: 'Ann', t: 'Welcome', me: false }, { who: 'You', t: 'Member team note', me: true }] }]], activeByTab: [0, 0] };
  const m = await mount({ me, stored: [], teamTab: true, member: true, seed: { [MEMBER]: memberWithTeam } });
  // Open a thread with a draft (the composer is filled without typing) and send it. React DOM
  // loads before jsdom here, so it uses its input polyfill, which needs a focused box to watch
  // before a keydown.
  const sendDraft = async (descriptor) => {
    await React.act(async () => { m.w.__openChat(descriptor, 'team'); });
    await settle();
    const box = m.w.document.querySelector('textarea');
    box.attachEvent = box.detachEvent = () => {}; // the polyfill's old-IE hooks
    await React.act(async () => { box.dispatchEvent(new m.w.FocusEvent('focusin', { bubbles: true })); });
    await React.act(async () => { box.dispatchEvent(new m.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await settle();
    assert.equal(box.value, '', 'sent: the composer is empty');
  };
  try {
    await unknownThenKnown(m, fail, async () => {
      await React.act(async () => { m.w.__openChat({ who: 'Coach Maya', conversationId: 'conv-1', tab: 'team' }, 'team'); });
      await settle();
      await sendDraft({ who: 'Team channel', draft: 'Said while unanswered', tab: 'team' });
    });
    const team = JSON.parse(m.w.localStorage.getItem(MEMBER)).threadsByTab[1];
    assert.ok(team.some((th) => th.conversationId === 'conv-1'), 'the conversation opened meanwhile is kept');
    const channel = team.find((th) => th.who === 'Team channel');
    assert.deepEqual(channel.messages.map((x) => x.t), ['Welcome', 'Member team note', 'Said while unanswered'], 'the account\'s own thread, then what was said in it meanwhile');
  } finally {
    await m.done();
  }
});

test('a conversation opened while /api/me was unanswered replaces, not repeats, the account\'s copy of it', async () => {
  // The account's copy already has conv-1; opened meanwhile, its first read fills it from the
  // server, history and all.
  const { me, fail } = flakyMe();
  const saved = { threadsByTab: [memberCopy.threadsByTab[0].slice(0, 1), [{ who: 'Team channel', messages: [] }, { who: 'Coach Maya', conversationId: 'conv-1', messages: [{ who: 'Coach Maya', t: 'Old hello', time: 'yesterday', me: false }] }]], activeByTab: [0, 0] };
  const conversations = { 'conv-1': [{ body: 'Old hello', created_at: '2026-10-16T09:00:00Z', sender_id: 'coach' }, { body: 'Newer reply', created_at: '2026-10-17T09:00:00Z', sender_id: 'coach' }] };
  const m = await mount({ me, stored: [], teamTab: true, conversations, seed: { [MEMBER]: saved } });
  try {
    await unknownThenKnown(m, fail, async () => {
      await React.act(async () => { m.w.__openChat({ who: 'Coach Maya', conversationId: 'conv-1', tab: 'team' }, 'team'); });
      await settle();
    });
    const team = JSON.parse(m.w.localStorage.getItem(MEMBER)).threadsByTab[1];
    const convs = team.filter((th) => th.conversationId === 'conv-1');
    assert.equal(convs.length, 1, 'one thread for the conversation');
    assert.deepEqual(convs[0].messages.map((x) => x.t), ['Old hello', 'Newer reply'], 'its history once');
  } finally {
    await m.done();
  }
  // Opened meanwhile but not read yet (nothing came back): the account's copy of it stands.
  const again = flakyMe();
  const unread = await mount({ me: again.me, stored: [], teamTab: true, seed: { [MEMBER]: saved } });
  try {
    await unknownThenKnown(unread, again.fail, async () => {
      await React.act(async () => { unread.w.__openChat({ who: 'Coach Maya', conversationId: 'conv-1', tab: 'team' }, 'team'); });
      await settle();
    });
    const conv = JSON.parse(unread.w.localStorage.getItem(MEMBER)).threadsByTab[1].find((th) => th.conversationId === 'conv-1');
    assert.deepEqual(conv.messages.map((x) => x.t), ['Old hello'], 'not emptied by a thread with nothing in it yet');
  } finally {
    await unread.done();
  }
});

test('what was said and opened before the first /api/me read failed is kept once it answers', async () => {
  const { me, fail } = flakyMe();
  const memberWithTeam = { threadsByTab: [memberCopy.threadsByTab[0].slice(0, 1), [{ who: 'Team channel', messages: [{ who: 'Ann', t: 'Welcome', me: false }] }]], activeByTab: [0, 0] };
  const m = await mount({ me, stored: [], teamTab: true, seed: { [MEMBER]: memberWithTeam } });
  try {
    // /api/me has not answered at all yet: a question to Nora, and a conversation opened.
    await m.open();
    await m.say('How do I log a meal?');
    await React.act(async () => { m.w.__openChat({ who: 'Coach Maya', conversationId: 'conv-1', tab: 'team' }, 'team'); });
    await settle();
    await React.act(async () => { fail({ stayDown: true }); }); // the first read fails
    await settle();
    await React.act(async () => { fail(); }); // and the next answers
    await waitForRetry();
    assert.equal(m.threadGetsSoFar(), 1, 'loaded once it answered');
    const copy = JSON.parse(m.w.localStorage.getItem(MEMBER));
    assert.ok(copy.threadsByTab[1].some((th) => th.conversationId === 'conv-1'), 'the conversation opened before is kept');
    assert.deepEqual(copy.threadsByTab[0][0].messages.map((x) => x.t), ['Hi, I am Nora.', 'Member saved question', 'Member saved answer', 'How do I log a meal?', 'Tap + on Eat.'], 'the account\'s thread, then the exchange with Nora');
    assert.deepEqual(m.appended().flat().map((x) => x.text), ['Member saved question', 'Member saved answer', 'How do I log a meal?', 'Tap + on Eat.'], 'the account\'s own copy migrates, then the exchange, once');
  } finally {
    await m.done();
  }
});

test('the account\'s greeting is applied again after a re-key starts the thread afresh', async () => {
  const { me, fail } = flakyMe();
  const m = await mount({ me, stored: [], greeting: { text: 'Welcome back, Ann.', quick: ['Plan my week'] } });
  try {
    await unknownThenKnown(m, fail, async () => {
      assert.ok(m.w.document.body.textContent.includes('Welcome back, Ann.'), 'greeted while unanswered');
    });
    const text = m.w.document.body.textContent;
    assert.ok(text.includes('Welcome back, Ann.'), 'still greeted after the re-key');
    assert.ok(!text.includes('Hi, I am Nora.'), 'not the seed');
  } finally {
    await m.done();
  }
});

test('a switch between two known accounts carries nothing from one copy to the other', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const m = await mount({ me, stored: [] });
  try {
    await m.open();
    await m.say('How do I log a meal?'); // synced as u1: sent to u1's account
    const gets = m.threadGetsSoFar();
    who = 'u2';
    await m.addTab(); // the hydrate re-runs and finds u2
    const u2 = m.w.localStorage.getItem('shape.chat.v2.u2') || '';
    assert.ok(u2, 'u2 has a copy');
    assert.doesNotMatch(u2, /Tap \+ on Eat/, 'u1\'s exchange never lands in u2\'s copy');
    // u1's sync is not u2's (Codex, #2391): u2's own conversation is loaded.
    assert.equal(m.threadGetsSoFar(), gets + 1, 'u2\'s conversation is loaded');
    assert.ok(m.personButton(), 'and u2 is synced');
  } finally {
    await m.done();
  }
});

test('what one account held while its store was down is never sent into the next account', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const m = await mount({ me, stored: [], threadGets: [429, 429, 200] });
  try {
    await m.open(); // u1: sign-in and open both missed
    await m.say('How do I log a meal?'); // held for u1
    who = 'u2';
    await m.addTab(); // u2 is found, and its load works
    assert.equal(m.threadGetsSoFar(), 3);
    assert.ok(m.personButton(), 'u2 is synced');
    assert.deepEqual(m.appended(), [], 'u1\'s held exchange is not u2\'s');
  } finally {
    await m.done();
  }
});

test('a load or an answer on its way when the account changes is not the next account\'s', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const stored = () => (who === 'u1' ? [{ role: 'user', text: 'U1 private', at: '2026-10-16T10:00:00Z' }] : []);
  // u1's sign-in load fails; the retry the panel's open starts is still on its way at the switch
  // (a hydrate's own load is dropped by its cancel; a retry's is not).
  const load = await mount({ me, stored, threadGets: [429, 'hold', 200] });
  try {
    await load.open();
    assert.equal(load.threadGetsSoFar(), 2, 'the retry is on its way');
    who = 'u2';
    await load.addTab();
    await load.release('get'); // u1's thread arrives after the switch: dropped, a miss
    assert.ok(!load.w.document.body.textContent.includes('U1 private'), 'u1\'s thread is not drawn for u2');
    await waitForRetry();
    assert.ok(load.personButton(), 'u2\'s own load ran and worked');
    assert.doesNotMatch(load.w.localStorage.getItem('shape.chat.v2.u2') || '', /U1 private/);
  } finally {
    await load.done();
  }
  who = 'u1';
  const ask = await mount({ me, stored: [], holdAnswer: true });
  try {
    await ask.open();
    await ask.say('How do I log a meal?'); // u1 asks; her answer is on its way
    who = 'u2';
    await ask.addTab();
    await ask.release('answer');
    assert.ok(!ask.w.document.body.textContent.includes('Tap + on Eat.'), 'u1\'s answer is not drawn for u2');
    assert.deepEqual(ask.appended(), [], 'nor sent to u2\'s account');
  } finally {
    await ask.done();
  }
});

test('a team-reply pull or a Talk to a person send on its way when the account changes is not the next account\'s', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const stored = () => (who === 'u1' ? [{ role: 'team', text: 'Team reply for u1', at: '2026-10-16T10:00:00Z' }] : []);
  // u1 loads at sign-in; the pull for team replies the open starts is on its way at the switch.
  const pull = await mount({ me, stored, threadGets: [200, 'hold', 200] });
  try {
    await pull.open();
    who = 'u2';
    await pull.addTab();
    assert.ok(pull.personButton(), 'u2 is synced');
    await pull.release('get');
    assert.ok(!pull.w.document.body.textContent.includes('Team reply for u1'), 'u1\'s team reply is not drawn for u2');
  } finally {
    await pull.done();
  }
  who = 'u1';
  const person = await mount({ me, stored: [], holdRequest: true });
  try {
    await person.open();
    await person.say('How do I log a meal?');
    await React.act(async () => { person.personButton().click(); });
    await settle();
    await React.act(async () => { person.w.document.querySelector('[data-nora-person-send]').click(); });
    await settle();
    who = 'u2';
    await person.addTab();
    await person.release('request');
    assert.ok(!person.w.document.body.textContent.includes('Sent to the Shape team'), 'u1\'s request is not confirmed in u2\'s chat');
    assert.ok(!person.appended().flat().some((x) => /Sent to the Shape team/.test(x.text)), 'nor kept on u2\'s account');
  } finally {
    await person.done();
  }
});

test('another account\'s Nora tone is never kept: it is read again when the account changes', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const db = {
    getSession: async () => ({}),
    // u2's read fails: what stands is the default, never u1's.
    getUserGoals: async (kind) => { if (who !== 'u1') throw new Error('read failed'); return kind === 'nora_voice' ? { tone: 'direct', voice: 'sage' } : null; },
  };
  const m = await mount({ me, stored: [], db });
  try {
    await m.open();
    await m.say('Hi');
    const tones = () => m.posts.filter(([u]) => u === '/api/support/chat').map(([, b]) => b.tone);
    assert.deepEqual(tones(), ['direct'], 'u1\'s tone');
    who = 'u2';
    await m.addTab();
    await m.say('Hi');
    assert.deepEqual(tones(), ['direct', 'supportive'], 'u2\'s could not be read: the default, not u1\'s');
  } finally {
    await m.done();
  }
});

test('a switch between known accounts closes an open Talk to a person form and reads the new account\'s conversations', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const reads = []; // whose conversation list the client was asked for
  const db = {
    getSession: async () => ({}),
    getUserGoals: async () => null,
    client: { auth: { getUser: async () => { reads.push(who); return { data: { user: { id: who } } }; } }, from: () => { throw new Error('no tables here'); } },
  };
  const m = await mount({ me, stored: [], db });
  try {
    await m.open();
    await m.say('How do I log a meal?');
    await React.act(async () => { m.personButton().click(); });
    await settle();
    assert.ok(m.w.document.querySelector('[data-nora-person-send]'), 'u1\'s form is open');
    who = 'u2';
    await m.addTab();
    assert.ok(!m.w.document.querySelector('[data-nora-person-send]'), 'closed: u1\'s question is not u2\'s to send');
    assert.ok(reads.includes('u2'), 'u2\'s conversation list is read');
  } finally {
    await m.done();
  }
});

test('the account\'s Nora settings are read through the loaded client, after the cookie session', async () => {
  const order = [];
  const db = {
    getSession: async () => { order.push('getSession'); return {}; },
    getUserGoals: async (kind) => { order.push(`getUserGoals ${kind}`); return kind === 'nora_voice' ? { tone: 'direct', voice: 'sage' } : null; },
  };
  const m = await mount({ db });
  try {
    assert.deepEqual(order.filter((x) => x === 'getSession' || x === 'getUserGoals nora_voice').slice(0, 2), ['getSession', 'getUserGoals nora_voice']);
    await m.open();
    await m.say('Hi');
    const ask = m.posts.find(([u]) => u === '/api/support/chat');
    assert.equal(ask && ask[1].tone, 'direct', 'the tone chosen in the app\'s Settings shapes her reply here');
  } finally {
    await m.done();
  }
});

test('the docked pop-out is always open: a failed load there is tried again without an open', async () => {
  // chatPopout.html mounts the widget docked: on screen in its own window, with `open` false.
  const m = await mount({ docked: true, threadGets: [429, 200] });
  try {
    assert.ok(m.threadGetsSoFar() >= 1);
    await waitForRetry();
    assert.equal(m.threadGetsSoFar(), 2, 'the miss counted, and the retry ran 2 seconds on');
    assert.ok(m.personButton(), 'synced: Talk to a person is offered');
  } finally {
    await m.done();
  }
});

test('a Talk to a person send that fails after the account changes does not reopen the last one\'s question', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const m = await mount({ me, stored: [], holdRequest: 'reject' });
  try {
    await m.open();
    await m.say('How do I log a meal?');
    await React.act(async () => { m.personButton().click(); });
    await settle();
    await React.act(async () => { m.w.document.querySelector('[data-nora-person-send]').click(); });
    await settle();
    who = 'u2';
    await m.addTab();
    await m.release('request'); // u1's send fails now, under u2
    assert.ok(!m.w.document.querySelector('[data-nora-person-send]'), 'u1\'s question is not reopened for u2');
    assert.ok(!m.w.document.body.textContent.includes('could not be sent'), 'nor its error shown to u2');
  } finally {
    await m.done();
  }
});

test('a reply still being written when the account changes stops showing, and does not cut off the next account\'s', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const m = await mount({ me, stored: [], streamAnswer: true });
  const step = async (f) => { await React.act(async () => { f(); }); await settle(); };
  const shown = (t) => m.w.document.body.textContent.includes(t);
  try {
    await m.open();
    await m.say('How do I log a meal?');
    await step(() => m.held.streams[0].text('U1 private partial'));
    assert.ok(shown('U1 private partial'), 'her words show as she writes them');
    who = 'u2';
    await m.addTab();
    assert.ok(!shown('U1 private partial'), 'what she had written for u1 is gone at the switch');
    await m.say('Hi'); // u2 asks; her answer to u2 is being written
    await step(() => m.held.streams[1].text('U2 partial'));
    await step(() => m.held.streams[0].text('U1 private partial, continued'));
    assert.ok(!shown('U1 private partial, continued'), 'more of u1\'s reply is not drawn in u2\'s panel');
    assert.ok(shown('U2 partial'), 'u2\'s own reply is still showing');
    await step(() => m.held.streams[0].end('U1 private full'));
    assert.ok(!shown('U1 private full'), 'u1\'s finished reply is dropped');
    assert.ok(shown('U2 partial'), 'and its end does not take down u2\'s reply in progress');
    await step(() => m.held.streams[1].end('U2 full answer'));
    assert.ok(shown('U2 full answer'));
  } finally {
    await m.done();
  }
});

test('a Clear while she is writing ends her typing line, and the reply that finishes later is not drawn', async () => {
  const m = await mount({ stored: [], streamAnswer: true });
  const step = async (f) => { await React.act(async () => { f(); }); await settle(); };
  const shown = (t) => m.w.document.body.textContent.includes(t);
  try {
    await m.open();
    await m.say('How do I log a meal?');
    await step(() => m.held.streams[0].text('Before the clear'));
    assert.ok(shown('Before the clear'));
    m.w.confirm = () => true;
    await step(() => m.w.document.querySelector('[data-nora-clear]').click());
    assert.ok(!shown('Before the clear'), 'what she had written goes with the conversation');
    assert.ok(!shown('Nora is typing'), 'and her typing line with it');
    await step(() => m.held.streams[0].end('After the clear'));
    assert.ok(!shown('After the clear'), 'the finished reply belongs to the conversation that went');
    assert.ok(!shown('Nora is typing'), 'nothing is left typing');
  } finally {
    await m.done();
  }
});

test('an old reply taking back its words does not blank the reply being written now', async () => {
  let who = 'u1';
  const me = () => Promise.resolve({ user: { id: who, email: `${who}@shape.test` } });
  const m = await mount({ me, stored: [], streamAnswer: true });
  const step = async (f) => { await React.act(async () => { f(); }); await settle(); };
  const shown = (t) => m.w.document.body.textContent.includes(t);
  try {
    await m.open();
    // After a Clear: the conversation that went takes its words back while the next is written.
    await m.say('How do I log a meal?');
    await step(() => m.held.streams[0].text('Before the clear'));
    m.w.confirm = () => true;
    await step(() => m.w.document.querySelector('[data-nora-clear]').click());
    await m.say('Hi');
    await step(() => m.held.streams[1].text('After the clear, partial'));
    await step(() => m.held.streams[0].reset());
    assert.ok(shown('After the clear, partial'), 'a cleared conversation\'s reset leaves the current reply up');
    await step(() => m.held.streams[1].end('After the clear, full'));
    // After a switch: u1's reply takes its words back while u2's is written.
    await m.say('How do I log a meal?');
    await step(() => m.held.streams[2].text('U1 partial'));
    who = 'u2';
    await m.addTab();
    await m.say('Hi');
    await step(() => m.held.streams[3].text('U2 partial'));
    await step(() => m.held.streams[2].reset());
    assert.ok(shown('U2 partial'), 'the last account\'s reset leaves u2\'s reply up');
  } finally {
    await m.done();
  }
});

test('the page reloads when the signed-in account changes under it, and only then', async () => {
  // A switch from one signed-in account to another, or to signed out: the page is the last
  // account's, so it loads again (Codex on #2391: her voice and the microphone went on across it).
  for (const next of ['u2', 'out']) {
    let who = 'u1';
    const me = () => Promise.resolve(who === 'out' ? { user: null } : { user: { id: who, email: `${who}@shape.test` } });
    const m = await mount({ me, stored: [] });
    try {
      assert.equal(m.reloads.length, 0, 'not on the first load');
      who = next;
      await m.addTab();
      assert.equal(m.reloads.length, 1, 'u1 → ' + next + ' reloads once');
    } finally {
      await m.done();
    }
  }
  // Not a switch: the first answer after an unanswered /api/me, and a visitor who signs in.
  const { me: firstFails, fail } = flakyMe();
  const unknown = await mount({ me: firstFails, stored: [] });
  try {
    await React.act(async () => { fail(); });
    await settle();
    await unknown.addTab();
    assert.equal(unknown.reloads.length, 0, 'unknown → u1 re-keys in place');
  } finally {
    await unknown.done();
  }
  let who = 'out';
  const me = () => Promise.resolve(who === 'out' ? { user: null } : { user: { id: who, email: `${who}@shape.test` } });
  const visitor = await mount({ me, stored: [] });
  try {
    who = 'u1';
    await visitor.addTab();
    assert.equal(visitor.reloads.length, 0, 'a visitor signing in re-keys in place');
  } finally {
    await visitor.done();
  }
});

test('a coach thread only the server has joins the copy even when something was typed first', async () => {
  // /api/me fails, the member asks Nora something (the copy is now "typed in"), then /api/me answers.
  // The live coach list is read for the account and must not be thrown away for that typing.
  const { me, fail } = flakyMe();
  let known = false;
  const rows = (data) => { const q = new Proxy({}, { get: (_t, k) => (k === 'then' ? (res) => res({ data, error: null }) : () => q) }); return q; };
  const db = {
    getSession: async () => ({}),
    getUserGoals: async () => null,
    client: {
      auth: { getUser: async () => ({ data: { user: known ? { id: 'u1' } : null } }) },
      from: () => rows([{ id: 'conv-live', provider_role: 'trainer', provider_id: 3, title: 'Coach Live', last_message: 'Live hello', last_message_at: new Date().toISOString() }]),
      rpc: async () => ({ data: [], error: null }),
    },
  };
  const m = await mount({ me, db, circleTab: true, stored: [] });
  try {
    await m.open();
    await React.act(async () => { fail(); });
    await settle();
    await m.say('How do I log a meal?');
    known = true;
    await m.addTab(); // the hydrate asks /api/me again, which answers now
    await settle();
    const saved = JSON.parse(m.w.localStorage.getItem('shape.chat.v2.u1') || 'null');
    const flat = JSON.stringify(saved);
    assert.match(flat, /Coach Live/, 'the server\'s coach thread is in the account\'s copy');
    assert.match(flat, /Sample coach/, 'and what was here stays');
    assert.match(flat, /How do I log a meal\?/, 'with what was typed');
  } finally {
    await m.done();
  }
});

// ── Codex on #2393: the website's cookie can change account under an open pop-up ─────────────
// Every question, save, Clear and "Talk to a person" names the account the copy belongs to; the
// server refuses one whose caller is someone else now, and the pop-up asks /api/me again, which
// finds the other account and reloads the page for it.
const asCookie = () => {
  const c = { who: 'u1' };
  c.me = () => Promise.resolve(c.who ? { user: { id: c.who, email: `${c.who}@shape.test` } } : { user: null });
  c.serverAs = () => c.who;
  return c;
};
const chatPosts = (m) => m.posts.filter(([u]) => u === '/api/support/chat').map(([, b]) => b);
// The notice that says why clears itself 3.5 seconds on; let it, before the page is taken down.
const noticeGone = async () => { await React.act(async () => { await new Promise((r) => setTimeout(r, 3600)); }); await settle(); };

test('every question, save and Clear names the account the copy belongs to', async () => {
  const m = await mount({ stored: [] });
  try {
    await m.open();
    await m.say('How do I log a meal?');
    assert.deepEqual(chatPosts(m).map((b) => b.account), ['u1'], 'the question');
    assert.deepEqual(m.posts.filter(([u]) => u === '/api/nora/thread').map(([, b]) => b.account), ['u1'], 'the save');
    m.w.confirm = () => true;
    await React.act(async () => { m.w.document.querySelector('[data-nora-clear]').click(); });
    await settle();
    assert.deepEqual(m.deletes, ['/api/nora/thread?account=u1'], 'the Clear');
  } finally {
    await m.done();
  }
  // A visitor's copy names no account.
  const v = await mount({ signedIn: false });
  try {
    await v.open();
    await v.say('How do I log a meal?');
    assert.ok(chatPosts(v).length && chatPosts(v).every((b) => !('account' in b)));
  } finally {
    await v.done();
  }
});

test('the cookie changed account while the pop-up stayed open: refused, nothing kept, and the page reloads for the new account', async () => {
  const c = asCookie();
  const m = await mount({ me: c.me, serverAs: c.serverAs, stored: [] });
  try {
    await m.open();
    await m.say('How do I log a meal?');
    const saved = m.appended().length;
    const reads = m.meReads();
    c.who = 'u2'; // signed in as someone else in another tab
    await m.say('Hi');
    assert.equal(chatPosts(m).at(-1).account, 'u1', 'asked as the account on screen');
    assert.equal(m.appended().length, saved, 'nothing kept');
    assert.ok(m.w.document.body.textContent.includes("You're signed in as another account now."), 'it says why');
    assert.equal(m.meReads(), reads + 1, '/api/me is asked again');
    assert.equal(m.reloads.length, 1, 'and the page reloads for u2');
    assert.doesNotMatch(m.w.localStorage.getItem('shape.chat.v2.u2') || '', /Tap \+ on Eat|"me":true/, 'u1\'s conversation never lands in u2\'s copy');
    await noticeGone();
  } finally {
    await m.done();
  }
});

test('a load or a team-reply pull that answers for another account is not drawn, and /api/me is asked once', async () => {
  // /api/me names u1, the store answers for u2 (a cookie switched between the two reads).
  const stored = [{ role: 'user', text: 'U2 private', at: '2026-10-16T10:00:00Z' }];
  const load = await mount({ serverAs: () => 'u2', stored });
  try {
    await load.open();
    await waitForRetry();
    assert.ok(!load.w.document.body.textContent.includes('U2 private'), 'u2\'s thread is not drawn in u1\'s copy');
    assert.ok(!load.personButton(), 'not synced');
    // Two reads at mount (the hydrate and the member check), and one more for the mismatch.
    assert.equal(load.meReads(), 3, 'asked again once');
    await waitForRetry();
    assert.equal(load.meReads(), 3, 'not on every load');
    assert.doesNotMatch(load.w.localStorage.getItem('shape.chat.v2.u1') || '', /U2 private/);
  } finally {
    await load.done();
  }
  const c = asCookie();
  const team = () => (c.who === 'u2' ? [{ role: 'team', text: 'Team reply for u2', at: '2026-10-16T10:00:00Z' }] : []);
  const pull = await mount({ me: c.me, serverAs: c.serverAs, stored: team });
  try {
    await pull.open();
    assert.ok(pull.personButton(), 'u1 synced');
    await pull.close();
    c.who = 'u2';
    await pull.open(); // the pull for team replies reads u2's
    // (jsdom can't reload, so the widget then carries on as u2, with u2's own copy.)
    assert.doesNotMatch(pull.w.localStorage.getItem('shape.chat.v2.u1') || '', /Team reply for u2/, 'u2\'s team reply never lands in u1\'s copy');
    assert.equal(pull.reloads.length, 1, 'the page reloads for u2');
  } finally {
    await pull.done();
  }
});

test('Talk to a person names the account; refused as another, the form closes and says why', async () => {
  const c = asCookie();
  const m = await mount({ me: c.me, serverAs: c.serverAs, stored: [] });
  const tap = async (sel) => { await React.act(async () => { m.w.document.querySelector(sel).click(); }); await settle(); };
  try {
    await m.open();
    await m.say('How do I log a meal?');
    await tap('[data-nora-person]');
    c.who = 'u2';
    await tap('[data-nora-person-send]');
    const req = m.posts.filter(([u]) => u === '/api/support/request').map(([, b]) => b);
    assert.deepEqual(req.map((b) => b.account), ['u1']);
    assert.ok(!m.w.document.querySelector('[data-nora-person-send]'), 'the form closed');
    assert.ok(!m.w.document.body.textContent.includes('Sent to the Shape team'));
    assert.ok(m.w.document.body.textContent.includes("You're signed in as another account now."));
    await noticeGone();
  } finally {
    await m.done();
  }
});

test('an answer that lands after the cookie switched: its save is refused, and the page reloads for the new account', async () => {
  const c = asCookie();
  const m = await mount({ me: c.me, serverAs: c.serverAs, stored: [], holdAnswer: true });
  try {
    await m.open();
    await m.say('How do I log a meal?'); // asked and answered as u1; the answer is on its way
    c.who = 'u2';
    await m.release('answer');
    const saves = m.posts.filter(([u]) => u === '/api/nora/thread').map(([, b]) => b.account);
    assert.deepEqual(saves, ['u1'], 'the save names u1, so the server refuses it');
    assert.equal(m.reloads.length, 1, 'and the page reloads for u2');
    assert.doesNotMatch(m.w.localStorage.getItem('shape.chat.v2.u2') || '', /Tap \+ on Eat/);
  } finally {
    await m.done();
  }
});

test('a Clear refused as another account reloads for the new account and says nothing failed', async () => {
  const c = asCookie();
  const m = await mount({ me: c.me, serverAs: c.serverAs, stored: [] });
  try {
    await m.open();
    await m.say('How do I log a meal?');
    c.who = 'u2';
    m.w.confirm = () => true;
    await React.act(async () => { m.w.document.querySelector('[data-nora-clear]').click(); });
    await settle();
    assert.deepEqual(m.deletes, ['/api/nora/thread?account=u1']);
    assert.equal(m.reloads.length, 1);
    assert.ok(!m.w.document.body.textContent.includes("Couldn't clear it"), 'not a failed Clear: the page is about to load for u2');
  } finally {
    await m.done();
  }
});

test('a save the store is too busy for is not an account switch: /api/me is not asked again', async () => {
  const m = await mount({ stored: [], busySave: true });
  try {
    await m.open();
    const reads = m.meReads();
    await m.say('How do I log a meal?');
    assert.deepEqual(m.appended().length, 1, 'the save was tried');
    assert.equal(m.meReads(), reads, 'a busy store is not another account');
    assert.equal(m.reloads.length, 0);
  } finally {
    await m.done();
  }
});
