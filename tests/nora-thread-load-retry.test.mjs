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
const { JSDOM } = require('jsdom');
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

// signedIn: what /api/me says; threadGets: the status of each GET /api/nora/thread in turn.
async function mount({ signedIn = true, threadGets = [200] } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: 'https://shape.test/newdesign/ClientApp.html', pretendToBeVisual: true });
  const w = dom.window;
  const before = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  w.React = React;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollTo = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const calls = [];
  const gets = [...threadGets];
  const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = w.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push(`${method} ${u.split('?')[0]}`);
    if (u.includes('/api/nora/thread') && method === 'GET') {
      if (!signedIn) return answer(401, { error: 'Sign in.' });
      return answer(gets.length ? gets.shift() : 200, { messages: [] });
    }
    if (u.includes('/api/nora/thread')) return answer(200, { ok: true });
    if (u.includes('/api/stripe/subscription')) return answer(200, { active: false });
    return answer(200, {});
  };
  const me = () => Promise.resolve(signedIn ? { user: { id: 'u1', email: 'ann@shape.test' } } : { user: null });
  new Function('React', 'ReactDOM', 'shapeReadPortalMe', WIDGET)(React, ReactDOMClient, me);
  const tabs = [{ id: 'nora', label: 'Nora', title: 'Nora', support: true, threads: [{ who: 'Nora', messages: [] }] }];
  const root = ReactDOMClient.createRoot(w.document.getElementById('r'));
  await React.act(async () => root.render(React.createElement(w.ChatWidget, { tabs })));
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
  return { w, calls, open, close, done, threadGetsSoFar, personButton };
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
