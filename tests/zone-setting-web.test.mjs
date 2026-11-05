// The account's time zone on the website (P9, owner 2026-11-05): zoneSettingWeb.jsx, mounted.
//
// "all time zones should be set by user", and the device's zone is only a default on first
// sign-in: a device in another zone later ASKS, it never switches by itself. So this suite drives
// the shipping file against a fake /api/me/timezone and the real shapeZone.mjs, and checks what a
// signed-in viewer sees and what reaches the server:
//   · the first open writes the device's zone onlyIfUnset and adopts the zone the server answers;
//   · `ready: false` (before the migration) shows nothing and writes nothing;
//   · a failed read shows "Couldn't read your time zone" with a Retry, never a picker;
//   · the travel card asks, and both answers do what they say; a failed save keeps the old zone;
//   · the four pages load the module and the two Settings pages render the control.
// Run: node --test tests/zone-setting-web.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ShapeZone from '../public/newdesign/shapeZone.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');

const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const SRC = read('public/newdesign/zoneSettingWeb.jsx');
const CODE = babel.transformSync(SRC, { presets: [presetReact], babelrc: false, configFile: false }).code;

const NY = 'America/New_York';
const LONDON = 'Europe/London';
const TOKYO = 'Asia/Tokyo';
const ME = { user: { id: 'u-1', role: 'client', roles: ['client'] } };
const COACH_ME = { user: { id: 'c-1', role: 'trainer', roles: ['trainer'] } };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const zoneRead = (timezone, ready = true) => reply(200, { timezone, ready });

const settle = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });

// One page load: a jsdom window carrying what the live pages carry (ShapeZone, the shared /api/me
// reading, ReactDOM), then the shipping file evaluated into it, which boots exactly as it does there.
async function openPage({ me = ME, device = LONDON, respond, coachShell, stored, declined, lib = true } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/ClientApp.html#settings' });
  const keep = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, CustomEvent: globalThis.CustomEvent, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
  ShapeZone.clearAccountZone(); // the module's memory is per process; each test is a fresh page
  if (stored) dom.window.localStorage.setItem('shape.tz.account', stored);
  if (declined) dom.window.localStorage.setItem('shape.tz.declined', declined);
  const Z = { ...ShapeZone, deviceZone: () => device };
  if (lib) dom.window.ShapeZone = Z;
  const calls = [];
  const meCalls = [];
  dom.window.ShapePortalSession = { read: async () => { meCalls.push(1); return me; } };
  dom.window.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const out = await respond(method, body, calls.filter((c) => c.method === method).length);
    if (out instanceof Error) throw out;
    return out;
  };
  // The travel card's own root, kept so the page can be torn down whole.
  const roots = [];
  dom.window.ReactDOM = { createRoot: (el) => { const r = createRoot(el); roots.push(r); return r; } };
  if (coachShell) dom.window.__shapeCoachShell = coachShell;
  const events = [];
  dom.window.addEventListener(ShapeZone.ZONE_EVENT, (e) => events.push(e.detail && e.detail.zone));
  let api;
  // The page's own timers, so closing the window ends the card's and the module wait's.
  const timers = [dom.window.setTimeout.bind(dom.window), dom.window.clearTimeout.bind(dom.window)];
  await act(async () => {
    api = new Function('React', 'window', 'document', 'setTimeout', 'clearTimeout', CODE + '\n;return { ZswZoneSetting, zswStore, zswCreateStore };')(React, dom.window, dom.window.document, ...timers);
  });
  await settle();
  const doc = dom.window.document;
  let root = null;
  const renderSetting = async (props = {}) => {
    root = root || createRoot(doc.getElementById('root'));
    await act(async () => root.render(React.createElement(api.ZswZoneSetting, props)));
    await settle();
  };
  const travel = () => doc.querySelector('[data-zone-travel]');
  const setting = () => doc.querySelector('[data-zone-setting]');
  const button = (label, scope = doc) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
  const click = async (label, scope) => {
    const b = button(label, scope);
    assert.ok(b, 'no button "' + label + '" in: ' + (scope || doc.body).textContent);
    await act(async () => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    await settle();
  };
  const choose = async (zone) => {
    const sel = doc.querySelector('select');
    assert.ok(sel, 'no picker');
    await act(async () => { sel.value = zone; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await settle();
  };
  const close = async () => {
    if (root) await act(async () => root.unmount());
    for (const r of roots) await act(async () => r.unmount());
    dom.window.close();
    Object.assign(globalThis, { window: keep.window, document: keep.document, localStorage: keep.localStorage, CustomEvent: keep.CustomEvent, IS_REACT_ACT_ENVIRONMENT: keep.act });
  };
  return { dom, doc, api, Z, calls, meCalls, events, renderSetting, travel, setting, button, click, choose, close, store: () => api.zswStore() };
}

const puts = (m) => m.calls.filter((c) => c.method === 'PUT');
const gets = (m) => m.calls.filter((c) => c.method === 'GET');

// ── the first open ──────────────────────────────────────────────────────────────
test('first open with no zone set: the device zone is written onlyIfUnset, once, and the answer is adopted', async () => {
  const m = await openPage({ device: LONDON, respond: (method) => (method === 'GET' ? zoneRead(null) : reply(200, { timezone: LONDON, changed: true })) });
  try {
    assert.deepEqual(m.calls.map((c) => [c.url, c.method]), [['/api/me/timezone', 'GET'], ['/api/me/timezone', 'PUT']]);
    assert.deepEqual(puts(m)[0].body, { timezone: LONDON, onlyIfUnset: true });
    assert.equal(ShapeZone.getAccountZone(), LONDON);
    assert.deepEqual(m.events, [LONDON], 'the change was not announced to the page');
    assert.equal(m.travel(), null, 'the first default asked a travel question about itself');
    // The Settings control reads the same store: no second read, no second write.
    await m.renderSetting();
    assert.equal(gets(m).length, 1);
    assert.equal(puts(m).length, 1);
    assert.equal(m.doc.querySelector('select').value, LONDON);
  } finally { await m.close(); }
});

test('the first default adopts the zone the server answers, not the one it asked for', async () => {
  // The app set Chicago a moment ago: onlyIfUnset answers the zone that stands.
  const m = await openPage({ device: LONDON, respond: (method) => (method === 'GET' ? zoneRead(null) : reply(200, { timezone: 'America/Chicago', changed: false })) });
  try {
    assert.equal(ShapeZone.getAccountZone(), 'America/Chicago');
    // ...which this London device is not on, so it now asks.
    assert.ok(m.travel(), 'no travel question for a device on another clock');
    assert.match(m.travel().textContent, /Switch to London/);
    assert.match(m.travel().textContent, /Keep Chicago/);
  } finally { await m.close(); }
});

test('an account with a zone: it is adopted and nothing is written', async () => {
  const m = await openPage({ device: NY, respond: () => zoneRead(NY) });
  try {
    assert.equal(puts(m).length, 0);
    assert.equal(ShapeZone.getAccountZone(), NY);
    assert.equal(m.travel(), null);
  } finally { await m.close(); }
});

test('signed out: the zone route is never asked, and nothing renders', async () => {
  const m = await openPage({ me: { user: null }, respond: () => { throw new Error('asked the zone route while signed out'); } });
  try {
    assert.equal(m.calls.length, 0);
    await m.renderSetting();
    assert.equal(m.setting(), null);
    assert.equal(m.travel(), null);
  } finally { await m.close(); }
});

test('an unreadable /api/me falls to the zone route, whose 401 is the reading', async () => {
  const m = await openPage({ me: null, respond: () => reply(401, { error: 'Authentication required.' }) });
  try {
    assert.equal(gets(m).length, 1);
    assert.equal(puts(m).length, 0);
    await m.renderSetting();
    assert.equal(m.setting(), null);
  } finally { await m.close(); }
});

// ── before the migration ────────────────────────────────────────────────────────
test('ready:false shows no picker and no prompt, and changes nothing', async () => {
  const m = await openPage({ device: LONDON, stored: NY, respond: (method) => (method === 'GET' ? zoneRead(null, false) : reply(503, { code: 'not_ready' })) });
  try {
    assert.equal(puts(m).length, 0, 'a first default was written before the migration');
    assert.equal(ShapeZone.getAccountZone(), NY, 'the remembered zone was touched');
    assert.deepEqual(m.events, []);
    assert.equal(m.travel(), null);
    await m.renderSetting({ coach: true });
    assert.equal(m.setting(), null);
    assert.equal(m.doc.body.textContent.trim(), '');
  } finally { await m.close(); }
});

// ── a failed read ───────────────────────────────────────────────────────────────
test('a failed read says so with a Retry, never a picker, and writes no first default', async () => {
  let ok = false;
  const m = await openPage({ respond: (method) => (method === 'GET' ? (ok ? zoneRead(NY) : reply(503, { code: 'unavailable' })) : reply(500, {})) });
  try {
    await m.renderSetting();
    assert.equal(puts(m).length, 0);
    assert.equal(m.setting().getAttribute('data-zone-setting'), 'unreadable');
    assert.match(m.setting().textContent, /Time zone/);
    assert.match(m.setting().textContent, /Couldn't read your time zone\./);
    assert.equal(m.doc.querySelector('select'), null, 'a picker over a value nobody read');
    assert.equal(m.travel(), null);
    ok = true;
    await m.click('Retry');
    assert.equal(gets(m).length, 2);
    assert.equal(m.setting().getAttribute('data-zone-setting'), 'ready');
    assert.equal(m.doc.querySelector('select').value, NY);
  } finally { await m.close(); }
});

test('the module script evaluating after this file is waited for, not read as missing', async () => {
  const m = await openPage({ lib: false, device: NY, respond: () => zoneRead(NY) });
  try {
    await act(async () => { m.dom.window.ShapeZone = m.Z; });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    await m.renderSetting();
    assert.equal(ShapeZone.getAccountZone(), NY);
    assert.equal(m.doc.querySelector('select').value, NY);
  } finally { await m.close(); }
});

test('with no shapeZone.mjs at all, nothing shows and nothing is written', async () => {
  const m = await openPage({ lib: false, respond: () => zoneRead(null) });
  try {
    const st = m.api.zswCreateStore({ lib: () => null, libWaitMs: 0, fetch: m.dom.window.fetch, readMe: async () => ME });
    await st.start();
    assert.equal(st.get().phase, 'off');
    await m.renderSetting({ store: st });
    assert.equal(m.setting(), null);
    assert.equal(puts(m).length, 0);
  } finally { await m.close(); }
});

// ── the travel question ─────────────────────────────────────────────────────────
test('a device on another clock asks, naming both zones; Switch saves the device zone', async () => {
  const m = await openPage({ device: LONDON, respond: (method, body) => (method === 'GET' ? zoneRead(NY) : reply(200, { timezone: body.timezone, changed: true })) });
  try {
    const card = m.travel();
    assert.ok(card, 'no travel question');
    assert.match(card.textContent, /This device is on another clock/);
    assert.ok(card.textContent.includes(ShapeZone.zoneLabel(NY)), 'the account zone is not named');
    assert.ok(card.textContent.includes(ShapeZone.zoneLabel(LONDON)), 'the device zone is not named');
    assert.doesNotMatch(card.textContent, /open hours/, 'a member was told about open hours');
    assert.equal(puts(m).length, 0, 'it switched before anyone answered');
    await m.click('Switch to London');
    assert.deepEqual(puts(m).map((c) => c.body), [{ timezone: LONDON }]);
    assert.equal(ShapeZone.getAccountZone(), LONDON);
    assert.deepEqual(m.events, [NY, LONDON]);
    assert.equal(m.travel().getAttribute('data-zone-travel'), 'notice');
    assert.match(m.travel().textContent, /Times on Shape now show in London\./);
  } finally { await m.close(); }
});

test('Keep is remembered for this device zone: no write, and the next page load does not ask', async () => {
  const m = await openPage({ device: LONDON, respond: () => zoneRead(NY) });
  try {
    await m.click('Keep New York');
    assert.equal(puts(m).length, 0);
    assert.equal(m.travel(), null);
    assert.equal(ShapeZone.declinedZone(), LONDON);
    assert.equal(ShapeZone.getAccountZone(), NY);
  } finally { await m.close(); }
  const again = await openPage({ device: LONDON, declined: LONDON, respond: () => zoneRead(NY) });
  try { assert.equal(again.travel(), null, 'asked again after Keep'); } finally { await again.close(); }
  // ...until the device is somewhere else again.
  const moved = await openPage({ device: TOKYO, declined: LONDON, respond: () => zoneRead(NY) });
  try { assert.match(moved.travel().textContent, /Switch to Tokyo/); } finally { await moved.close(); }
});

test('the × is "not now": gone for this page, nothing written or remembered', async () => {
  const m = await openPage({ device: LONDON, respond: () => zoneRead(NY) });
  try {
    await m.click('Not now');
    assert.equal(m.travel(), null);
    assert.equal(puts(m).length, 0);
    assert.equal(ShapeZone.declinedZone(), null);
  } finally { await m.close(); }
});

test('a coach is told their open hours stay at the same times on the new clock', async () => {
  const m = await openPage({ me: COACH_ME, device: LONDON, respond: () => zoneRead(NY) });
  try { assert.match(m.travel().textContent, /Your open hours stay at the same times on the new clock: 9 to 5 stays 9 to 5\./); } finally { await m.close(); }
  // On a coach page even when the account read carried no roles.
  const page = await openPage({ me: { user: { id: 'c-2' } }, coachShell: 'nutritionist', device: LONDON, respond: () => zoneRead(NY) });
  try { assert.match(page.travel().textContent, /open hours stay at the same times/); } finally { await page.close(); }
});

test('a failed switch says so and keeps the old zone (a 500 is read back, not guessed)', async () => {
  const m = await openPage({ device: LONDON, respond: (method) => (method === 'GET' ? zoneRead(NY) : reply(500, { code: 'write_failed' })) });
  try {
    await m.click('Switch to London');
    assert.equal(puts(m).length, 1);
    assert.equal(gets(m).length, 2, 'the unknown outcome was not read back');
    assert.equal(ShapeZone.getAccountZone(), NY);
    assert.match(m.travel().textContent, /Couldn't switch\. Your times stay in New York\./);
    assert.ok(m.button('Switch to London'), 'the question went away after a failed save');
  } finally { await m.close(); }
});

test('a 500 whose write did land is read back as saved', async () => {
  let landed = false;
  const m = await openPage({ device: LONDON, respond: (method) => {
    if (method === 'PUT') { landed = true; return reply(500, { code: 'write_failed' }); }
    return zoneRead(landed ? LONDON : NY);
  } });
  try {
    await m.click('Switch to London');
    assert.equal(ShapeZone.getAccountZone(), LONDON);
    assert.match(m.travel().textContent, /now show in London/);
  } finally { await m.close(); }
});

test('a dropped save whose read-back also fails stops showing a picker and says it could not confirm', async () => {
  const m = await openPage({ device: LONDON, respond: (method, _b, n) => (method === 'PUT' ? new Error('offline') : n === 1 ? zoneRead(NY) : new Error('offline')) });
  try {
    await m.renderSetting();
    await m.click('Switch to London', m.travel());
    assert.equal(m.setting().getAttribute('data-zone-setting'), 'unreadable');
    assert.equal(m.doc.querySelector('select'), null);
    assert.match(m.travel().textContent, /Couldn't confirm the switch/);
    assert.equal(ShapeZone.getAccountZone(), NY, 'a zone nobody confirmed was adopted');
  } finally { await m.close(); }
});

// ── the Settings control ────────────────────────────────────────────────────────
test('Settings: "Time zone", a picker with the account zone selected, and the device button when it differs', async () => {
  const m = await openPage({ device: LONDON, respond: (method, body) => (method === 'GET' ? zoneRead(NY) : reply(200, { timezone: body.timezone, changed: true })) });
  try {
    await m.renderSetting();
    const box = m.setting();
    assert.equal(box.querySelector('label').textContent, 'Time zone');
    const sel = box.querySelector('select');
    assert.equal(box.querySelector('label').getAttribute('for'), sel.id);
    assert.equal(sel.value, NY);
    const values = [...sel.options].map((o) => o.value);
    assert.ok(values.includes(NY) && values.includes(LONDON) && values.includes(TOKYO), 'the picker is missing zones');
    assert.ok(m.button("Use this device's time zone (" + ShapeZone.zoneLabel(LONDON) + ')'), 'no device button');
    await m.choose(TOKYO);
    assert.deepEqual(puts(m).map((c) => c.body), [{ timezone: TOKYO }]);
    assert.equal(ShapeZone.getAccountZone(), TOKYO);
    assert.equal(m.doc.querySelector('select').value, TOKYO);
    assert.match(m.setting().textContent, /Saved\. Times on Shape show in Tokyo\./);
    // A zone chosen here answers the travel question for this device: no "switch to London?" now.
    assert.equal(m.travel(), null);
    assert.equal(ShapeZone.declinedZone(), LONDON);
  } finally { await m.close(); }
});

test('Settings: the device button saves the device zone, and goes once the zones match', async () => {
  const m = await openPage({ device: LONDON, respond: (method, body) => (method === 'GET' ? zoneRead(NY) : reply(200, { timezone: body.timezone, changed: true })) });
  try {
    await m.renderSetting();
    await m.click("Use this device's time zone (" + ShapeZone.zoneLabel(LONDON) + ')');
    assert.deepEqual(puts(m).map((c) => c.body), [{ timezone: LONDON }]);
    assert.equal(m.doc.querySelector('select').value, LONDON);
    assert.equal([...m.setting().querySelectorAll('button')].length, 0, 'the device button stayed for a matching zone');
  } finally { await m.close(); }
});

test('Settings: a refused save says so and the picker shows the zone that stands', async () => {
  const m = await openPage({ device: NY, respond: (method) => (method === 'GET' ? zoneRead(NY) : reply(400, { code: 'invalid_timezone' })) });
  try {
    await m.renderSetting();
    await m.choose(TOKYO);
    assert.equal(puts(m).length, 1);
    assert.equal(gets(m).length, 1, 'a refusal is not an unknown outcome');
    assert.equal(m.doc.querySelector('select').value, NY);
    assert.equal(ShapeZone.getAccountZone(), NY);
    assert.ok(m.setting().textContent.includes("Shape doesn't know that time zone. Your time zone is still " + ShapeZone.zoneLabel(NY) + '.'));
  } finally { await m.close(); }
});

test('Settings: "Saving…" while the write is out, and the picker holds still', async () => {
  let release;
  const m = await openPage({ device: NY, respond: (method, body) => (method === 'GET' ? zoneRead(NY) : new Promise((r) => { release = () => r(reply(200, { timezone: body.timezone, changed: true })); })) });
  try {
    await m.renderSetting();
    await m.choose(TOKYO);
    assert.match(m.setting().textContent, /Saving…/);
    assert.equal(m.doc.querySelector('select').disabled, true);
    await act(async () => release());
    await settle();
    assert.match(m.setting().textContent, /Saved\./);
    assert.equal(m.doc.querySelector('select').disabled, false);
  } finally { await m.close(); }
});

test('Settings: the hours line is a coach\'s, and an unset zone is "Not set", not a guess', async () => {
  const m = await openPage({ device: null, respond: () => zoneRead(null) });
  try {
    assert.equal(puts(m).length, 0, 'a device that cannot say its zone wrote one');
    await m.renderSetting();
    const sel = m.doc.querySelector('select');
    assert.equal(sel.value, '');
    assert.equal(sel.selectedOptions[0].textContent, 'Not set');
    assert.doesNotMatch(m.setting().textContent, /open hours/);
    await m.renderSetting({ coach: true });
    assert.match(m.setting().textContent, /Your open hours stay at the same times on the new clock/);
  } finally { await m.close(); }
});

// ── the pages ───────────────────────────────────────────────────────────────────
const PAGES = ['TrainerApp.html', 'NutritionistApp.html', 'ClientApp.html', 'ClientMe.html'];
const MODULE_TAG = /<script type="module">import \* as TZ from "\/newdesign\/shapeZone\.mjs\?v=(\d{8}[a-z]*)"; window\.ShapeZone = TZ;<\/script>/;

test('the four Settings pages load shapeZone.mjs as window.ShapeZone, then zoneSettingWeb.jsx after pageShell.jsx', () => {
  const keys = new Set();
  for (const page of PAGES) {
    const html = read('public/newdesign/' + page);
    const mod = MODULE_TAG.exec(html);
    assert.ok(mod, page + ' does not load shapeZone.mjs as window.ShapeZone');
    keys.add(mod[1]);
    const shell = html.indexOf('<script type="text/babel" src="pageShell.jsx');
    const zone = html.indexOf('<script type="text/babel" src="zoneSettingWeb.jsx');
    assert.ok(shell > 0 && zone > shell, page + ' does not load zoneSettingWeb.jsx after pageShell.jsx');
    // ⚠ BEFORE IT IN THE DOCUMENT: at deploy every text/babel tag becomes a deferred script, and
    // deferred and module scripts run in document order, so the module is there when the sync starts.
    assert.ok(mod.index < zone, page + ' loads the zone module after the script that reads it');
    // and the Settings screen that renders the control comes after the control's own script
    const settings = html.search(/src="(clientMeSettings|coachSettings)\.jsx/);
    assert.ok(settings > zone, page + ' renders Settings before the control is defined');
    assert.equal(html.split('src="zoneSettingWeb.jsx').length - 1, 1, page + ' loads the control twice');
  }
  // One key: a page handed an older shapeZone.mjs than its neighbours is a page on another copy.
  assert.equal(keys.size, 1, 'the pages ask for different shapeZone.mjs keys: ' + [...keys].join(', '));
});

test('the member\'s and the coach\'s Settings render the control, read off window at render time', () => {
  const client = stripComments(read('public/newdesign/clientMeSettings.jsx'));
  const body = client.slice(client.indexOf('function ClientMeSettings('), client.indexOf('function HealthProfileCard('));
  assert.match(body, /const ZoneSetting = typeof window\.ShapeZoneSetting === "function" \? window\.ShapeZoneSetting : null;/);
  assert.match(body, /\{ZoneSetting && <ZoneSetting [^>]*wrap=\{\(body\) => <Card>\{body\}<\/Card>\} \/>\}/);
  const coach = stripComments(read('public/newdesign/coachSettings.jsx'));
  const page = coach.slice(coach.indexOf('function CoachSettingsPage('), coach.indexOf('function CoachNotificationCard('));
  assert.match(page, /const ZoneSetting = typeof window\.ShapeZoneSetting === "function" \? window\.ShapeZoneSetting : null;/);
  assert.match(page, /<ZoneSetting coach /, 'the coach page does not tell the control it is a coach\'s');
  // The global the pages read is the one the module sets.
  assert.match(SRC, /Object\.assign\(window, \{\s*ShapeZoneSetting: ZswZoneSetting,/);
});

test('the module talks to /api/me/timezone only, in English, with no colored emoji', () => {
  const code = stripComments(SRC);
  assert.deepEqual([...new Set(code.match(/"\/api\/[^"]+"/g))].sort(), ['"/api/me"', '"/api/me/timezone"']);
  // Colored emoji: a character drawn as an emoji by default, or one asked to be (U+FE0F). The
  // house's typographic symbols (⚠ in comments, × on the card) are neither.
  assert.doesNotMatch(SRC, /\p{Emoji_Presentation}|️/u);
  assert.doesNotMatch(code, /useShapeTr|localStorage/, 'the website has no translation layer, and the zone memory is shapeZone.mjs\'s');
});
