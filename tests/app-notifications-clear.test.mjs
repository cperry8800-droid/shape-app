// Clear all in the app's notification list (owner, 2026-10-16: "add clear all to the app too"),
// MOUNTED: BSNotifications (mobile-app/src/broadsheet/BSNotifications.jsx) inside the real
// broadsheet chrome against a scripted ShapeNotifications, and the data layer's clear call
// against a fake fetch.
//
// The rules are the website bell's (#2386): it asks first, it clears what the list showed up to
// its newest notice exactly as the server sent it, a failed clear brings the list back and says
// so, and a read that was already in flight cannot paint the cleared rows back. The app shows
// every type, so its clear sends no `surface`: phone-only reminders are cleared here too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');

// The catalog the app would load, for one locale; a missing key falls back to defaultValue.
let catalog = {};
window.ShapeI18n = { t: (key, opts = {}) => catalog[key.replace(/^common:/, '')] ?? opts.defaultValue ?? key };

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { host, text: () => host.textContent, unmount: () => act(async () => root.unmount()) };
}
const click = (el) => act(async () => { assert.ok(el, 'no such button'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const button = (host, re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));

const chrome = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
void chrome;
// BSDetailHeader lives in the client module; the screen reads it from window at call time.
window.BSDetailHeader = ({ eyebrow, kicker, title }) => React.createElement('header', null, eyebrow, ' ', kicker, ' ', title);
const { BSNotifications, bsNotifNewest } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSNotifications.jsx'), { registry: new Map([['react', React]]) });
const inChrome = (el) => React.createElement(window.BSProvider, { paperMode: 'paper' }, el);

const NEWEST = '2026-10-16T21:00:00.123456+00:00';
const ROWS = [
  { id: 'n2', type: 'message', title: 'Tom replied', body: 'see you at 6', route: 'chat:c-1', data: {}, read: false, createdAt: NEWEST },
  { id: 'n1', type: 'reminder_water', title: 'Hydration check', body: '', route: null, data: {}, read: true, createdAt: '2026-10-15T09:00:00Z' },
];

// A scripted service. `list` answers with the rows unless a read is held; `clear` answers `ok`.
function fakeService({ ok = true, rows = ROWS } = {}) {
  const st = { lists: 0, held: [], clears: [], marks: [], onInsert: null, hold: false };
  window.ShapeNotifications = {
    list: () => {
      st.lists++;
      if (st.hold) return new Promise((r) => st.held.push(r));
      return Promise.resolve({ notifications: rows, unread: rows.filter((r) => !r.read).length });
    },
    markRead: (arg) => { st.marks.push(arg); return Promise.resolve(true); },
    clear: (arg) => { st.clears.push(arg); return Promise.resolve(ok); },
    subscribe: (fn) => { st.onInsert = fn; return () => { st.onInsert = null; }; },
  };
  return st;
}

test('Clear all asks once, then clears every notification shown, up to the newest exactly', async () => {
  catalog = {};
  const st = fakeService();
  const v = await mount(inChrome(React.createElement(BSNotifications, { onBack: () => {} })));
  assert.match(v.text(), /Tom replied/);
  assert.ok(button(v.host, /^Mark all read$/), 'Mark all read is gone');
  await click(button(v.host, /^Clear all$/));
  assert.equal(st.clears.length, 0, 'Clear all wrote before it was confirmed');
  assert.match(v.text(), /Clear all\?/);
  await click(button(v.host, /^Cancel$/));
  assert.equal(st.clears.length, 0);
  assert.match(v.text(), /Tom replied/, 'Cancel cleared the list');

  await click(button(v.host, /^Clear all$/));
  await click(button(v.host, /^Yes$/));
  await flush();
  // The newest row's time as the server sent it, and no `surface`: the app clears every type,
  // the phone-only water reminder included.
  assert.deepEqual(st.clears, [{ before: NEWEST }]);
  assert.match(v.text(), /You’re all caught up\./);
  assert.ok(!/Tom replied|Hydration check/.test(v.text()));
  assert.equal(button(v.host, /^Clear all$/), undefined, 'Clear all is offered on an empty list');
  await v.unmount();
});

test('a clear that fails brings the list back and says so', async () => {
  catalog = {};
  const st = fakeService({ ok: false });
  const v = await mount(inChrome(React.createElement(BSNotifications, { onBack: () => {} })));
  await click(button(v.host, /^Clear all$/));
  await click(button(v.host, /^Yes$/));
  await flush();
  assert.equal(st.clears.length, 1);
  assert.match(v.text(), /Tom replied/, 'the rows were not restored');
  assert.match(v.text(), /Couldn’t clear your notifications\. Try again\./);
  await v.unmount();
});

test('a read in flight when the member clears cannot paint the cleared rows back', async () => {
  catalog = {};
  const st = fakeService();
  const v = await mount(inChrome(React.createElement(BSNotifications, { onBack: () => {} })));
  // A new notice arrives: the list reads again, and that read is held.
  st.hold = true;
  await act(async () => { st.onInsert({ id: 'n3' }); });
  assert.equal(st.held.length, 1);
  st.hold = false;
  await click(button(v.host, /^Clear all$/));
  await click(button(v.host, /^Yes$/));
  await flush();
  await act(async () => { st.held[0]({ notifications: ROWS, unread: 1 }); });
  await flush();
  assert.match(v.text(), /You’re all caught up\./, 'the stale read repainted the cleared rows');
  await v.unmount();
});

test('a notice arriving while the clear is in flight is read once the clear has landed', async () => {
  catalog = {};
  const st = fakeService();
  let release;
  window.ShapeNotifications.clear = (arg) => { st.clears.push(arg); return new Promise((r) => { release = r; }); };
  const v = await mount(inChrome(React.createElement(BSNotifications, { onBack: () => {} })));
  await click(button(v.host, /^Clear all$/));
  await click(button(v.host, /^Yes$/));
  const before = st.lists;
  // The server has cleared the old rows; a newer notice is all that is left.
  const fresh = [{ id: 'n9', type: 'message', title: 'Sam wrote', body: '', route: null, data: {}, read: false, createdAt: '2026-10-16T22:00:00Z' }];
  window.ShapeNotifications.list = () => { st.lists++; return Promise.resolve({ notifications: fresh, unread: 1 }); };
  await act(async () => { st.onInsert({ id: 'n9' }); });
  assert.equal(st.lists, before, 'the list read while the clear was in flight');
  await act(async () => { release(true); });
  await flush();
  assert.equal(st.lists, before + 1, 'the notice that arrived during the clear was never read');
  assert.match(v.text(), /Sam wrote/);
  await v.unmount();
});

test('a notice arriving while a clear fails is still shown (Codex on #2389)', async () => {
  catalog = {};
  const st = fakeService();
  let release;
  window.ShapeNotifications.clear = (arg) => { st.clears.push(arg); return new Promise((r) => { release = r; }); };
  const v = await mount(inChrome(React.createElement(BSNotifications, { onBack: () => {} })));
  await click(button(v.host, /^Clear all$/));
  await click(button(v.host, /^Yes$/));
  // The clear will fail, so the server still holds the old rows, and a new notice lands meanwhile.
  const fresh = { id: 'n9', type: 'message', title: 'Sam wrote', body: '', route: null, data: {}, read: false, createdAt: '2026-10-16T22:00:00Z' };
  window.ShapeNotifications.list = () => { st.lists++; return Promise.resolve({ notifications: [fresh, ...ROWS], unread: 2 }); };
  await act(async () => { st.onInsert({ id: 'n9' }); });
  await act(async () => { release(false); });
  await flush();
  assert.match(v.text(), /Couldn’t clear your notifications\. Try again\./);
  assert.match(v.text(), /Tom replied/, 'the rows were not restored');
  assert.match(v.text(), /Sam wrote/, 'the notice that arrived during the failed clear is invisible');
  await v.unmount();
});

test('the screen speaks the member\'s language', async () => {
  catalog = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/common.json'), 'utf8'));
  fakeService();
  const v = await mount(inChrome(React.createElement(BSNotifications, { onBack: () => {} })));
  assert.match(v.text(), /Benachrichtigungen/);
  assert.ok(button(v.host, /^Alle entfernen$/));
  assert.ok(button(v.host, /^Alle als gelesen markieren$/));
  await v.unmount();
  catalog = {};
});

test('every key the screen reads exists in all 13 locales', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSNotifications.jsx'), 'utf8');
  const keys = [...new Set([...src.matchAll(/'common:(notifications\.[A-Za-z]+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 16, 'keys moved: ' + keys.length);
  for (const l of ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${l}/common.json`), 'utf8'));
    for (const k of keys) assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${l} is missing ${k}`);
  }
  // The English catalog is the default each call carries.
  const en = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/common.json'), 'utf8'));
  for (const [, k, d] of src.matchAll(/'common:(notifications\.[A-Za-z]+)', \{ defaultValue: '([^']*)' \}/g)) {
    assert.equal(en[k], d, k + ': the default and the English catalog disagree');
  }
});

test('the newest bound keeps the server\'s spelling, and an empty list has none', () => {
  assert.equal(bsNotifNewest(ROWS), NEWEST);
  assert.equal(bsNotifNewest([...ROWS].reverse()), NEWEST, 'the bound depends on the order');
  assert.equal(bsNotifNewest([]), null);
  assert.equal(bsNotifNewest([{ id: 'x', createdAt: null }]), null);
});

test('the data layer posts the clear with no surface, and says whether it landed', async () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function clearNotifications('), src.indexOf('// Live subscription on the user\'s notifications'));
  assert.match(src, /clear: clearNotifications,/, 'the window service does not expose clear');
  const calls = [];
  let answer = { ok: true };
  const fetch = async (url, init) => { calls.push([url, init]); if (answer instanceof Error) throw answer; return answer; };
  const clear = new Function('fetch', 'apiBaseUrl', 'sessionsAuthHeaders', fn + '\nreturn clearNotifications;')(
    fetch, 'https://theshapecommunity.com', (h) => ({ Authorization: 'Bearer t', ...h }));
  assert.equal(await clear({ before: NEWEST }), true);
  assert.equal(calls[0][0], 'https://theshapecommunity.com/api/notifications');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), { clear: true, before: NEWEST });
  assert.equal(calls[0][1].headers.Authorization, 'Bearer t', 'the installed app clears without its token');
  answer = { ok: false };
  assert.equal(await clear({ before: NEWEST }), false, 'a refused clear reads as done');
  answer = new Error('offline');
  assert.equal(await clear({ before: NEWEST }), false, 'a network failure throws into the screen');
  calls.length = 0;
  assert.equal(await clear({}), false);
  assert.equal(calls.length, 0, 'a clear with no bound was sent');
});
