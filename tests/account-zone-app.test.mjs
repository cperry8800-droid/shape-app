// One time zone per account, the app half (P9, owner 2026-11-05): "all time zones should be set by
// user"; the device's zone is only a default on first sign-in, and a device on another clock later
// is offered as a switch, never made one.
//
// Driven, not read: the open-time flow (services/accountZone.mjs) over a scripted /api/me/timezone
// behind the same two calls shapeBackend.js puts on window.ShapeProfile, then BSTimezone.jsx mounted
// in jsdom inside the real broadsheet chrome: the Settings row, the travel prompt and the shell's
// check. The source pins at the end hold the wiring a mount can't see (the shell mounts the check
// over every role, Settings renders the row under Language, sign-out forgets the zone).
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
// pretendToBeVisual: a plain jsdom document is 'prerender', so a foreground return would never read
// as visible and the re-check tests would pass by seeing nothing.
const dom = new JSDOM('<!doctype html><html><body><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
const IMF = require_('intl-messageformat');
const IntlMessageFormat = IMF.IntlMessageFormat || IMF.default;
// i18next-icu formats the catalog string with the call's values; this is that over the en catalog,
// so a key the code asks for and en lacks shows up as the raw key.
const EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/settings.json'), 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = key.split(':');
    const s = ns === 'settings' ? EN[k] : undefined;
    return s == null ? key : new IntlMessageFormat(s, 'en').format(opts);
  },
};

const zone = await import('../mobile-app/src/services/shapeZone.mjs');
const { bsReadAccountZone, bsWriteAccountZone, bsZoneOnOpen, bsZoneSwitch, bsZoneKeep } = await import('../mobile-app/src/services/accountZone.mjs');
const { bumpSignOutGen, signOutEnded } = await import('../mobile-app/src/services/signOutGen.mjs');

// ── A scripted /api/me/timezone, behind the calls shapeBackend.js makes ───────────────────────────
// `get` and `put` are { status, body } or functions of the call; an Error is a network failure.
function server({ get = { status: 200, body: { timezone: null, ready: true } }, put } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, auth: init.headers && init.headers.Authorization };
    calls.push(call);
    const h = call.method === 'PUT' ? (put || ((c) => ({ status: 200, body: { timezone: c.body.timezone, changed: true } }))) : get;
    const r = typeof h === 'function' ? await h(call) : h;
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  // shapeBackend.js's getAccountTimezone / setAccountTimezone, with the base and token it passes.
  const api = {
    getAccountTimezone: () => bsReadAccountZone(fetchFn, { base: 'https://api.shape.test', token: 'tok-1' }),
    setAccountTimezone: (tz, { onlyIfUnset = false } = {}) => bsWriteAccountZone(fetchFn, tz, { base: 'https://api.shape.test', token: 'tok-1', onlyIfUnset: onlyIfUnset === true }),
  };
  return { api, calls, puts: () => calls.filter((c) => c.method === 'PUT') };
}

function fresh(deviceTz = 'Asia/Tokyo') {
  process.env.TZ = deviceTz;
  zone.clearAccountZone();
  localStorage.clear();
}

// ── The open-time flow ───────────────────────────────────────────────────────────────────────────

test('first sign-in: no zone set, so this device\'s becomes the default (only if still unset), and nothing is asked', async () => {
  fresh('Asia/Tokyo');
  const s = server({ get: { status: 200, body: { timezone: null, ready: true } } });
  const out = await bsZoneOnOpen({ api: s.api, device: zone.deviceZone() });
  assert.equal(out.state, 'set');
  assert.equal(out.account, 'Asia/Tokyo');
  assert.equal(out.ask, false);
  assert.deepEqual(s.calls.map((c) => [c.method, c.url, c.auth]), [
    ['GET', 'https://api.shape.test/api/me/timezone', 'Bearer tok-1'],
    ['PUT', 'https://api.shape.test/api/me/timezone', 'Bearer tok-1'],
  ]);
  assert.deepEqual(s.puts()[0].body, { timezone: 'Asia/Tokyo', onlyIfUnset: true });
  assert.equal(zone.getAccountZone(), 'Asia/Tokyo', 'the zone that stands is not remembered');
  assert.equal(zone.viewerZone(), 'Asia/Tokyo');
});

test('first sign-in raced by another device: the zone that stands wins, and this device asks', async () => {
  fresh('Asia/Tokyo');
  const s = server({ put: { status: 200, body: { timezone: 'America/New_York', changed: false } } });
  const out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
  assert.equal(out.account, 'America/New_York');
  assert.equal(zone.getAccountZone(), 'America/New_York');
  assert.equal(out.ask, true);
});

test('before the migration (ready:false): no write, nothing remembered, no question', async () => {
  fresh('Asia/Tokyo');
  const s = server({ get: { status: 200, body: { timezone: null, ready: false } } });
  const out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
  assert.equal(out.state, 'not_ready');
  assert.equal(out.ask, false);
  assert.equal(s.puts().length, 0, 'wrote a zone before the migration ran');
  assert.equal(zone.getAccountZone(), null);
});

test('a set zone is remembered as it is; the same zone or the same clock asks nothing', async () => {
  fresh('America/Detroit');
  const same = server({ get: { status: 200, body: { timezone: 'America/Detroit', ready: true } } });
  let out = await bsZoneOnOpen({ api: same.api, device: 'America/Detroit' });
  assert.deepEqual([out.state, out.account, out.ask], ['set', 'America/Detroit', false]);
  assert.equal(same.puts().length, 0, 'a set zone was written over');
  // Detroit and New York show the same clock: nothing to switch.
  const clock = server({ get: { status: 200, body: { timezone: 'America/New_York', ready: true } } });
  out = await bsZoneOnOpen({ api: clock.api, device: 'America/Detroit' });
  assert.deepEqual([out.account, out.ask], ['America/New_York', false]);
  assert.equal(clock.puts().length, 0);
});

test('travel: a device on another clock asks, and never switches by itself', async () => {
  fresh('Asia/Tokyo');
  const s = server({ get: { status: 200, body: { timezone: 'America/New_York', ready: true } } });
  const out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
  assert.deepEqual([out.state, out.account, out.device, out.ask], ['set', 'America/New_York', 'Asia/Tokyo', true]);
  assert.equal(s.puts().length, 0, 'the flow moved a set zone without asking');
  assert.equal(zone.getAccountZone(), 'America/New_York');
});

test('"Switch": the device\'s zone is written (not only-if-unset) and remembered, and listeners hear it', async () => {
  fresh('Asia/Tokyo');
  zone.setAccountZone('America/New_York');
  const heard = [];
  const off = zone.onZoneChange((z) => heard.push(z));
  const s = server();
  const out = await bsZoneSwitch({ api: s.api, to: 'Asia/Tokyo' });
  off();
  assert.deepEqual(out, { ok: true, account: 'Asia/Tokyo' });
  assert.deepEqual(s.puts()[0].body, { timezone: 'Asia/Tokyo' });
  assert.equal(zone.getAccountZone(), 'Asia/Tokyo');
  assert.deepEqual(heard, ['Asia/Tokyo']);
});

test('"Switch" that fails keeps the zone that was there', async () => {
  fresh('Asia/Tokyo');
  zone.setAccountZone('America/New_York');
  for (const put of [{ status: 500, body: { code: 'write_failed' } }, { status: 401, body: {} }, new Error('offline')]) {
    const s = server({ put });
    const out = await bsZoneSwitch({ api: s.api, to: 'Asia/Tokyo' });
    assert.equal(out.ok, false);
    assert.equal(zone.getAccountZone(), 'America/New_York', 'a failed switch changed the zone');
  }
});

test('"Keep": not asked again for this device zone, asked again when the device moves on', async () => {
  fresh('Asia/Tokyo');
  const s = server({ get: { status: 200, body: { timezone: 'America/New_York', ready: true } } });
  bsZoneKeep('Asia/Tokyo');
  let out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
  assert.equal(out.ask, false, 'asked again after "Keep"');
  assert.equal(zone.declinedZone(), 'Asia/Tokyo');
  out = await bsZoneOnOpen({ api: s.api, device: 'Europe/London' });
  assert.equal(out.ask, true, 'a new clock was not asked about');
  assert.equal(s.puts().length, 0);
});

test('a failed read is not "no zone": no default is written over it, and the remembered zone stands', async () => {
  for (const get of [{ status: 503, body: { code: 'unavailable' } }, { status: 401, body: {} }, { status: 200, body: '<html>' }, new Error('offline'), { status: 200, body: { timezone: 'Not/AZone', ready: true } }]) {
    fresh('Asia/Tokyo');
    zone.setAccountZone('Europe/Paris');
    const s = server({ get });
    const out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
    assert.equal(out.state, 'failed', JSON.stringify(get));
    assert.equal(out.ask, false);
    assert.equal(s.puts().length, 0, `a default was written over an unread zone (${JSON.stringify(get)})`);
    assert.equal(zone.getAccountZone(), 'Europe/Paris');
  }
});

test('a failed save of the first default changes nothing (and the migration\'s not_ready reads as not ready)', async () => {
  fresh('Asia/Tokyo');
  let s = server({ put: { status: 500, body: { code: 'write_failed' } } });
  let out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
  assert.equal(out.state, 'failed');
  assert.equal(zone.getAccountZone(), null, 'a zone the server did not take is remembered');
  s = server({ put: { status: 503, body: { code: 'not_ready' } } });
  out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo' });
  assert.equal(out.state, 'not_ready');
  assert.equal(zone.getAccountZone(), null);
});

test('an account that is gone by the answer gets nothing remembered or written for it', async () => {
  fresh('Asia/Tokyo');
  let current = true;
  const s = server({ get: () => { current = false; return { status: 200, body: { timezone: null, ready: true } }; } });
  const out = await bsZoneOnOpen({ api: s.api, device: 'Asia/Tokyo', isCurrent: () => current });
  assert.equal(out.state, 'stale');
  assert.equal(s.puts().length, 0);
  assert.equal(zone.getAccountZone(), null);
});

test('the HTTP half refuses what it can\'t send, and reads the route\'s answers for what they are', async () => {
  const s = server();
  assert.deepEqual(await bsReadAccountZone(async () => { throw new Error('no'); }, { token: null }), { ok: false, reason: 'signed_out', notReady: false, invalid: false });
  const bad = await bsWriteAccountZone(async () => { throw new Error('no'); }, 'Mars/Olympus', { token: 'x' });
  assert.equal(bad.invalid, true);
  assert.equal(s.calls.length, 0);
  const four = await bsWriteAccountZone(async () => ({ ok: false, status: 400, json: async () => ({ code: 'invalid_timezone' }) }), 'Asia/Tokyo', { token: 'x' });
  assert.equal(four.invalid, true);
  const ready = await bsReadAccountZone(async () => ({ ok: true, status: 200, json: async () => ({ timezone: 'UTC', ready: true }) }), { token: 'x' });
  assert.deepEqual(ready, { ok: true, timezone: 'UTC', ready: true });
});

// ⚠ AN ELEMENT IS NEVER AN ASSERTION'S `actual`: a failing assert.equal(<jsdom node>, null) has the
// reporter inspect the whole jsdom graph, which runs the process out of memory instead of failing.
// Presence is asserted as a boolean.
// ── Mounted ──────────────────────────────────────────────────────────────────────────────────────

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { host, text: () => host.textContent, unmount: () => act(async () => root.unmount()) };
}
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
async function pick(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const byText = (root, sel, re) => [...root.querySelectorAll(sel)].find((b) => re.test(b.textContent));
const surface = () => document.getElementById('bs-phone-surface');

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const { BSTimezoneSetting, BSTimezonePrompt, BSTimezoneCheck } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTimezone.jsx'), { registry: new Map([['react', React]]) });
const inChrome = (el) => React.createElement(window.BSProvider, { paperMode: 'paper' }, el);
const theme = { MONO: 'mono', DISPLAY: 'display', PAPER: '#ffffff', INK: '#111111', INK50: '#777777', INK70: '#555555', RULE: '#cccccc', HAIR: '#dddddd', RUST: '#c0533b', RADIUS_SM: 10, padX: 18, isLight: true };

function signIn(uid = 'u-1') {
  signOutEnded();
  window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
}
function useServer(opts) {
  const s = server(opts);
  window.ShapeProfile = s.api;
  return s;
}

test('Settings row: hidden before the migration, and when signed out', async () => {
  fresh('Asia/Tokyo');
  signIn();
  const s = useServer({ get: { status: 200, body: { timezone: null, ready: false } } });
  let v = await mount(React.createElement(BSTimezoneSetting, { t: theme }));
  assert.equal(v.text(), '', 'a row before the migration ran');
  assert.equal(s.puts().length, 0);
  await v.unmount();
  signIn(null);
  const s2 = useServer({ get: { status: 200, body: { timezone: 'Asia/Tokyo', ready: true } } });
  v = await mount(React.createElement(BSTimezoneSetting, { t: theme }));
  assert.equal(v.text(), '');
  assert.equal(s2.calls.length, 0, 'read a zone with nobody signed in');
  await v.unmount();
});

test('Settings row: a failed read says so with a retry, never a picker; the retry reads again', async () => {
  fresh('Asia/Tokyo');
  signIn();
  let fail = true;
  const s = useServer({ get: () => (fail ? { status: 503, body: { code: 'unavailable' } } : { status: 200, body: { timezone: 'America/New_York', ready: true } }) });
  const v = await mount(React.createElement(BSTimezoneSetting, { t: theme }));
  assert.match(v.text(), /Couldn’t read your time zone\./);
  assert.ok(!v.host.querySelector('select'), 'a picker over an unread value');
  fail = false;
  await click(byText(v.host, 'button', /^Try again$/));
  await flush();
  assert.equal(s.calls.filter((c) => c.method === 'GET').length, 2);
  const sel = v.host.querySelector('select');
  assert.ok(sel, 'no picker after a good read');
  assert.equal(sel.value, 'America/New_York');
  assert.equal(zone.getAccountZone(), 'America/New_York', 'the fresh read is not what screens print on');
  await v.unmount();
});

test('Settings row: the zone selected, the device offered when it differs, a change saved with an honest state', async () => {
  fresh('Asia/Tokyo');
  signIn();
  const s = useServer({ get: { status: 200, body: { timezone: 'America/New_York', ready: true } } });
  const v = await mount(React.createElement(BSTimezoneSetting, { t: theme }));
  const sel = v.host.querySelector('select');
  assert.equal(sel.value, 'America/New_York');
  assert.ok([...sel.options].some((o) => o.value === 'Asia/Tokyo'), 'the device zone is not offered');
  assert.match(v.text(), /This device: Tokyo · GMT\+9/);
  assert.match(v.text(), /Every time on Shape shows on this clock\./);
  assert.ok(!/Your hours stay/.test(v.text()), 'a member reads the coach hours line');
  // the device's zone, by its button
  await click(byText(v.host, 'button', /^Use this device’s time zone$/));
  await flush();
  assert.deepEqual(s.puts().map((c) => c.body), [{ timezone: 'Asia/Tokyo' }]);
  assert.equal(v.host.querySelector('select').value, 'Asia/Tokyo');
  assert.match(v.text(), /Saved/);
  assert.equal(zone.getAccountZone(), 'Asia/Tokyo');
  assert.ok(!/Use this device’s time zone/.test(v.text()), 'offers the device zone it is already on');
  // any zone, by the picker
  await pick(v.host.querySelector('select'), 'Europe/London');
  await flush();
  assert.deepEqual(s.puts().at(-1).body, { timezone: 'Europe/London' });
  assert.equal(zone.getAccountZone(), 'Europe/London');
  await v.unmount();
});

test('Settings row: a failed save says so and keeps the old zone selected', async () => {
  fresh('Asia/Tokyo');
  signIn();
  useServer({ get: { status: 200, body: { timezone: 'America/New_York', ready: true } }, put: { status: 500, body: { code: 'write_failed' } } });
  zone.setAccountZone('America/New_York');
  const v = await mount(React.createElement(BSTimezoneSetting, { t: theme }));
  await pick(v.host.querySelector('select'), 'Europe/London');
  await flush();
  assert.match(v.text(), /Couldn’t save\. Still New York · GMT-[45]\./);
  assert.equal(v.host.querySelector('select').value, 'America/New_York');
  assert.equal(zone.getAccountZone(), 'America/New_York');
  await v.unmount();
});

test('Settings row: no zone yet reads "Not set" over the picker; a coach reads the hours line', async () => {
  fresh('Asia/Tokyo');
  signIn();
  useServer({ get: { status: 200, body: { timezone: null, ready: true } } });
  const v = await mount(React.createElement(BSTimezoneSetting, { t: theme, coach: true }));
  const sel = v.host.querySelector('select');
  assert.equal(sel.value, '');
  assert.equal(sel.selectedOptions[0].textContent, 'Not set');
  assert.match(v.text(), /Your hours stay at the same times on the new clock\. Sessions already booked don’t move\./);
  await v.unmount();
});

test('travel prompt: names both clocks; "Switch" writes and remembers the device\'s zone', async () => {
  fresh('Asia/Tokyo');
  signIn();
  zone.setAccountZone('America/New_York');
  const s = useServer();
  const closed = [];
  const v = await mount(inChrome(React.createElement(BSTimezonePrompt, { account: 'America/New_York', device: 'Asia/Tokyo', onClose: (a) => closed.push(a) })));
  const sheet = surface().querySelector('[data-bs-timezone="ask"]');
  assert.ok(sheet, 'the sheet does not portal into the phone surface');
  assert.match(sheet.textContent, /This device is on another clock/);
  assert.match(sheet.textContent, /Your account\s*New York · GMT-[45]/);
  assert.match(sheet.textContent, /This device\s*Tokyo · GMT\+9/);
  assert.ok(!/Your hours stay/.test(sheet.textContent));
  await click(byText(sheet, 'button', /^Switch to Tokyo$/));
  await flush();
  assert.deepEqual(s.puts().map((c) => c.body), [{ timezone: 'Asia/Tokyo' }]);
  assert.equal(zone.getAccountZone(), 'Asia/Tokyo');
  assert.deepEqual(closed, ['switched']);
  await v.unmount();
});

test('travel prompt: a failed switch says so and keeps the account\'s zone; "Keep" is remembered', async () => {
  fresh('Asia/Tokyo');
  signIn();
  zone.setAccountZone('America/New_York');
  useServer({ put: { status: 500, body: { code: 'write_failed' } } });
  const closed = [];
  const v = await mount(inChrome(React.createElement(BSTimezonePrompt, { account: 'America/New_York', device: 'Asia/Tokyo', coach: true, onClose: (a) => closed.push(a) })));
  const sheet = surface().querySelector('[data-bs-timezone="ask"]');
  assert.match(sheet.textContent, /Your hours stay at the same times on the new clock/);
  await click(byText(sheet, 'button', /^Switch to Tokyo$/));
  await flush();
  assert.match(sheet.textContent, /Couldn’t switch\. Your time zone is still New York\./);
  assert.equal(zone.getAccountZone(), 'America/New_York');
  assert.deepEqual(closed, []);
  await click(byText(sheet, 'button', /^Keep New York$/));
  assert.deepEqual(closed, ['kept']);
  assert.equal(zone.declinedZone(), 'Asia/Tokyo');
  await v.unmount();
});

test('the shell\'s check: asks a traveller once the app is on screen, closes on the answer, asks again on return', async () => {
  fresh('Asia/Tokyo');
  signIn();
  const s = useServer({ get: { status: 200, body: { timezone: 'America/New_York', ready: true } } });
  const el = (canAsk) => inChrome(React.createElement(BSTimezoneCheck, { uid: 'u-1', ready: true, canAsk }));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el(false)); });
  await flush();
  assert.equal(zone.getAccountZone(), 'America/New_York', 'the zone is not learned before the app shows');
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'), 'asked over the splash');
  await act(async () => { root.render(el(true)); });
  await flush();
  let sheet = surface().querySelector('[data-bs-timezone="ask"]');
  assert.ok(sheet, 'a traveller was not asked');
  await click(byText(sheet, 'button', /^Keep New York$/));
  await flush();
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'), '"Keep" left the sheet up');
  // Back in the foreground on the same clock: not asked again.
  await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); });
  await flush();
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'), 'asked again after "Keep"');
  // Back in the foreground somewhere else: asked about the new clock.
  process.env.TZ = 'Europe/London';
  await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); });
  await flush();
  sheet = surface().querySelector('[data-bs-timezone="ask"]');
  assert.ok(sheet, 'the new clock was not asked about');
  assert.match(sheet.textContent, /Switch to London/);
  await click(byText(sheet, 'button', /^Switch to London$/));
  await flush();
  assert.equal(zone.getAccountZone(), 'Europe/London');
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'), 'the sheet stayed up after the switch');
  assert.equal(s.puts().length, 1);
  await act(async () => root.unmount());
});

test('a zone picked in Settings away from this device\'s is the answer: the travel question doesn\'t follow it', async () => {
  fresh('Asia/Tokyo');
  signIn();
  const s = useServer({ get: { status: 200, body: { timezone: 'Asia/Tokyo', ready: true } } });
  const check = await mount(inChrome(React.createElement(BSTimezoneCheck, { uid: 'u-1', ready: true, canAsk: true })));
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'), 'asked with the device on the account\'s own zone');
  const row = await mount(React.createElement(BSTimezoneSetting, { t: theme }));
  await pick(row.host.querySelector('select'), 'America/New_York');
  await flush();
  assert.deepEqual(s.puts().map((c) => c.body), [{ timezone: 'America/New_York' }]);
  assert.equal(zone.getAccountZone(), 'America/New_York');
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'), 'asked to switch back to the clock just turned down');
  assert.equal(zone.declinedZone(), 'Asia/Tokyo');
  // The prompt's own "Switch" goes to the device's zone, which declines nothing.
  fresh('Asia/Tokyo');
  zone.setAccountZone('America/New_York');
  await bsZoneSwitch({ api: server().api, to: 'Asia/Tokyo', device: 'Asia/Tokyo' });
  assert.equal(zone.declinedZone(), null);
  await row.unmount();
  await check.unmount();
});

test('the shell\'s check: nothing before the session is restored, before the migration, or for a signed-out account', async () => {
  fresh('Asia/Tokyo');
  signIn();
  const s = useServer({ get: { status: 200, body: { timezone: null, ready: false } } });
  let v = await mount(inChrome(React.createElement(BSTimezoneCheck, { uid: 'u-1', ready: false, canAsk: true })));
  assert.equal(s.calls.length, 0, 'read before the session was restored');
  await v.unmount();
  v = await mount(inChrome(React.createElement(BSTimezoneCheck, { uid: 'u-1', ready: true, canAsk: true })));
  assert.equal(s.calls.length, 1);
  assert.equal(s.puts().length, 0);
  assert.ok(!surface().querySelector('[data-bs-timezone="ask"]'));
  await v.unmount();
  v = await mount(inChrome(React.createElement(BSTimezoneCheck, { uid: null, ready: true, canAsk: true })));
  assert.equal(s.calls.length, 1, 'read with nobody signed in');
  await v.unmount();
});

test('the shell\'s check: a sign-out while the read is out remembers nothing for the gone account', async () => {
  fresh('Asia/Tokyo');
  signIn();
  let release;
  const gate = new Promise((r) => { release = r; });
  const s = useServer({ get: async () => { await gate; return { status: 200, body: { timezone: null, ready: true } }; } });
  const v = await mount(inChrome(React.createElement(BSTimezoneCheck, { uid: 'u-1', ready: true, canAsk: true })));
  bumpSignOutGen();
  zone.clearAccountZone();
  release();
  await flush();
  assert.equal(s.puts().length, 0, 'the gone account was given a default');
  assert.equal(zone.getAccountZone(), null);
  await v.unmount();
  signOutEnded();
});

// ── The wiring ───────────────────────────────────────────────────────────────────────────────────
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('wiring: the shell runs the check for every role, before the update gate; the client posts no zone', () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /^import \{ BSTimezoneCheck \} from '\.\/BSTimezone\.jsx';$/m);
  assert.match(main, /<BSTimezoneCheck uid=\{authUserId\} ready=\{authReady\} coach=\{isCoachRole\} canAsk=\{timezoneAsk\} \/>\n\s*\{\/\* Over every stage/);
  // The question waits for the branch that renders <App> for a member or approved coach.
  assert.match(main, /const timezoneAsk = stage === 'app' && !memberGateLoading && !ageBlocked && memberAllowed && !bundleError && !!App && !dobState\.needed;/);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.ok(!/setTimezone|\/api\/client\/timezone/.test(client), 'the client still posts the device zone');
  assert.match(client, /<BSLanguageSetting t=\{t\} \/>\n(\s*\{\/\*[\s\S]*?\*\/\}\n)?\s*<BSTimezoneSetting t=\{t\} coach=\{isCoachRole\} \/>/);
  assert.ok(!/settings:pref\.timeZone/.test(client), 'a second time zone picker in Preferences');
  // The coach apps open the same Settings.
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), /<BSSettings key=/);
});

test('wiring: ShapeProfile reads and writes /api/me/timezone with the live token, and sign-out forgets the zone', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /window\.ShapeProfile = \{ \.\.\.\(window\.ShapeProfile \|\| \{\}\), getAccountTimezone, setAccountTimezone, setLocale \};/);
  assert.match(be, /bsReadAccountZone\(_zoneFetch, \{ base: apiBaseUrl \|\| '', token: await liveAccessToken\(\) \}\)/);
  assert.match(be, /bsWriteAccountZone\(_zoneFetch, tz, \{ base: apiBaseUrl \|\| '', token: await liveAccessToken\(\), onlyIfUnset: onlyIfUnset === true \}\)/);
  assert.ok(!/\/api\/client\/timezone/.test(be), 'the app still posts to the old route');
  const signOut = be.slice(be.indexOf('async function signOut() {'), be.indexOf('return { cookieCleared };'));
  assert.match(signOut, /try \{ clearAccountZone\(\); \} catch \(e\) \{\}/);
});
