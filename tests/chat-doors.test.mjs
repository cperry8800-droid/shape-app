// Nora ⇄ Chat inside the open panel (owner, 2026-11-13: "create option to switch back and forth
// between nora and chat once pop up is opened instead of having to exit out and reopen"). The
// panel is one widget in two modes; the switch in its masthead flips the mode and the tab together,
// and back in Chat it lands on the place it left. ChatWidget is mounted as the pages mount it.
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
const SHELL_CONSTS = read('public/newdesign/pageShell.jsx').split('\n').filter((l) => /^const [A-Za-z_]+ = ("[^"]*"|'[^']*');/.test(l)).join('\n');
const WIDGET = babel.transformSync(`${SHELL_CONSTS}\n${read('public/newdesign/chatWidget.jsx')}`, {
  presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script',
}).code;
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };

async function mount({ docked = false } = {}) {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: 'https://shape.test/newdesign/Pricing.html', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const before = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), act: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  w.React = React;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollTo = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = w.fetch = async (url) => (String(url).includes('/api/nora/thread') ? answer(401, { error: 'Sign in.' }) : answer(200, {}));
  // A signed-out visitor: the places hold the sample cast, whose counts are not live.
  new Function('React', 'ReactDOM', 'shapeReadPortalMe', WIDGET)(React, ReactDOMClient, () => Promise.resolve({ user: null }));
  const tabs = [
    { id: 'nora', label: 'Nora', title: 'Nora', support: true, threads: [{ who: 'Nora', messages: [{ who: 'Nora', t: 'Hi, I am Nora.', me: false }] }] },
    { id: 'team', label: 'Team', title: 'Team', threads: [{ who: 'Team channel', unread: 4, messages: [{ who: 'Ann', t: 'Welcome', me: false }] }] },
    { id: 'community', label: 'Channels', title: 'Channels', threads: [{ who: '# general', unread: 13, group: true, messages: [] }] },
  ];
  const root = ReactDOMClient.createRoot(w.document.getElementById('r'));
  await React.act(async () => root.render(React.createElement(w.ChatWidget, { tabs, docked })));
  await settle();
  const panel = () => w.document.querySelector('[data-chat-panel]');
  const doors = () => w.document.querySelector('[data-cw-doors]');
  const selected = () => (w.document.querySelector('[role="tab"][aria-selected="true"]') || {}).textContent || '';
  const click = async (el) => { await React.act(async () => { el.click(); }); await settle(); };
  const done = async () => {
    await React.act(async () => root.unmount());
    Object.assign(globalThis, { window: before.window, document: before.document, localStorage: before.localStorage, IS_REACT_ACT_ENVIRONMENT: before.act, fetch: before.fetch });
    if (before.navigator) Object.defineProperty(globalThis, 'navigator', before.navigator);
    w.close();
  };
  return { w, panel, doors, selected, click, done };
}

test('the open panel switches from Chat to Nora and back, to the place it left', async () => {
  const m = await mount();
  try {
    await React.act(async () => { m.w.__openChat({ tab: 'community' }, 'community'); });
    await settle();
    assert.equal(m.panel().getAttribute('aria-label'), 'Chat');
    assert.match(m.selected(), /Channels/);
    assert.ok(!!m.doors(), 'no Nora ⇄ Chat switch in the open panel');
    const [nora, chat] = m.doors().querySelectorAll('button');
    assert.equal(chat.getAttribute('aria-pressed'), 'true');
    await m.click(nora);
    assert.equal(m.panel().getAttribute('aria-label'), 'Nora', 'the switch did not open Nora');
    assert.ok(!!m.panel().querySelector('textarea[placeholder="Ask Nora anything…"]'), 'Nora\'s composer is not up');
    // The sample cast's counts are not live: Chat's door carries no number.
    assert.ok(!m.doors().querySelector('.cw-count'), 'a sample count rode on Chat\'s door');
    await m.click(m.doors().querySelectorAll('button')[1]);
    assert.equal(m.panel().getAttribute('aria-label'), 'Chat', 'the switch did not go back to Chat');
    assert.match(m.selected(), /Channels/, 'Chat did not come back to the place it left');
  } finally { await m.done(); }
});

test('opened on Nora, the switch takes Chat to its first place', async () => {
  const m = await mount();
  try {
    await React.act(async () => { m.w.__openChat({ tab: 'nora' }, 'nora'); });
    await settle();
    assert.equal(m.panel().getAttribute('aria-label'), 'Nora');
    assert.equal(m.doors().querySelectorAll('button')[0].getAttribute('aria-pressed'), 'true');
    await m.click(m.doors().querySelectorAll('button')[1]);
    assert.equal(m.panel().getAttribute('aria-label'), 'Chat');
    assert.match(m.selected(), /Team/, 'Chat did not land on its first place');
    assert.ok(!/Nora/.test(m.selected()), 'Chat landed on Nora\'s tab');
  } finally { await m.done(); }
});

test('a popped-out window has no switch: Nora is a tab there', async () => {
  const m = await mount({ docked: true });
  try {
    assert.ok(!!m.panel(), 'the docked window did not render');
    assert.ok(!m.doors(), 'the popped-out window drew the switch');
  } finally { await m.done(); }
});
