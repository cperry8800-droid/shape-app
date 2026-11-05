// Settings › Close account confirms on the page, not through window.confirm and window.prompt
// (2026-11-05). The shipped PxCloseAccount (public/newdesign/dashProfileExtras.jsx) is compiled
// and mounted in a DOM; the browser's dialogs throw if anything calls them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#settings' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const k of ['confirm', 'prompt', 'alert']) dom.window[k] = () => { throw new Error('window.' + k + ' was called'); };
const React = require_('react');
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');

const SRC = readFileSync(join(ROOT, 'public/newdesign/dashProfileExtras.jsx'), 'utf8');
const slice = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to));
const code = babel.transformSync(slice('const PX_CLOSE_WORD', 'function CoachAccountSettings('), { presets: [presetReact], babelrc: false, configFile: false }).code;
const { PxCloseAccount } = new Function('React', 'window', code + '\nreturn { PxCloseAccount };')(React, dom.window);

const btn = () => ({});
async function mount(answers) {
  const calls = [];
  const went = [];
  let signedOut = 0;
  const later = [];
  const deps = {
    fetchImpl: async (url, init) => { calls.push({ url, body: init.body || null }); const a = answers.shift(); return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body || {} }; },
    signOut: async () => { signedOut += 1; },
    go: (href) => went.push(href),
    later: (fn) => later.push(fn),
  };
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => root.render(React.createElement(PxCloseAccount, { btn, note: {}, deps })));
  const q = (sel) => host.querySelector(sel);
  const button = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
  const click = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
  const type = async (value) => {
    const input = q('input');
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  };
  return { host, q, button, click, type, calls, went, later, get signedOut() { return signedOut; }, unmount: () => React.act(async () => root.unmount()) };
}

test('Close account opens a step on the page; nothing is sent until DELETE is typed', async () => {
  const page = await mount([{ status: 428, body: { confirmToken: 'tok-1' } }, { status: 200 }]);
  assert.equal(page.q('input'), null, 'no step until asked');
  await page.click(page.button(/^Close account$/));
  assert.ok(page.q('input'), 'the step is on the page');
  assert.match(page.host.textContent, /cannot be undone/);
  const go = page.button(/Close my account for good/);
  assert.equal(go.disabled, true, 'not before the word');
  await page.type('delet');
  assert.equal(page.button(/Close my account for good/).disabled, true);
  await page.click(page.button(/Close my account for good/));
  assert.equal(page.calls.length, 0, 'a disabled button sends nothing');
  await page.type(' delete ');
  assert.equal(page.button(/Close my account for good/).disabled, false, 'the word, in any case, with spaces');
  await page.click(page.button(/Close my account for good/));
  // The two requests: the first earns the token, the second spends it.
  assert.deepEqual(page.calls.map((c) => c.url), ['/api/account/delete', '/api/account/delete']);
  assert.deepEqual(JSON.parse(page.calls[1].body), { confirmToken: 'tok-1' });
  assert.equal(page.signedOut, 1);
  assert.match(page.host.textContent, /Your account and data have been deleted/);
  assert.equal(page.later.length, 1, 'then home');
  page.later[0]();
  assert.deepEqual(page.went, ['/']);
  await page.unmount();
});

test('Cancel and Escape close the step; a refusal is said on the page and can be tried again', async () => {
  const page = await mount([{ status: 500 }, { status: 428, body: { confirmToken: 'tok-2' } }, { status: 200 }]);
  await page.click(page.button(/^Close account$/));
  await page.click(page.button(/^Cancel$/));
  assert.equal(page.q('input'), null, 'Cancel closes it');
  await page.click(page.button(/^Close account$/));
  await React.act(async () => { page.q('input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(page.q('input'), null, 'Escape closes it');
  await page.click(page.button(/^Close account$/));
  assert.equal(page.q('input').value, '', 'the word is asked for again');
  await page.type('DELETE');
  await page.click(page.button(/Close my account for good/));
  assert.match(page.q('[role="alert"]').textContent, /Could not delete your account right now/);
  assert.equal(page.signedOut, 0);
  await page.click(page.button(/Close my account for good/));
  assert.match(page.host.textContent, /have been deleted/);
  await page.unmount();
});

test('a signed-out answer goes to sign-in; the page names no browser dialog', async () => {
  const page = await mount([{ status: 401 }]);
  await page.click(page.button(/^Close account$/));
  await page.type('DELETE');
  await page.click(page.button(/Close my account for good/));
  assert.deepEqual(page.went, ['/newdesign/Login.html']);
  assert.equal(page.signedOut, 0);
  await page.unmount();
  const code = SRC.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /window\.confirm\(|window\.prompt\(/);
  assert.match(code, /<PxCloseAccount btn=\{btn\} note=\{note\} \/>/);
});
