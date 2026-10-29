// Where people tap (owner, 2026-10-28: "add to admin page where user/members click on
// website/app"): the rules (src/lib/click-capture.mjs) and their classic-script copy
// (public/click-capture.js) held equal, the consent gate, the route that stores a batch, the
// Overview's Clicks view and its shaping (src/lib/admin-clicks.mjs), the migration, and the wiring on the
// website and in the app.
// Run: node --test tests/click-capture.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as C from '../src/lib/click-capture.mjs';
import * as A from '../src/lib/admin-clicks.mjs';
import * as overview from '../src/lib/admin-overview.mjs';
import * as levels from '../src/lib/staff-levels.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
// The page compiles to React.createElement, as the console's own tests run it.
globalThis.React = React;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── A small DOM: enough of an element for the rules (tagName, attributes, parent, children) ──
function el(tag, attrs = {}, ...children) {
  const node = {
    nodeType: 1,
    tagName: tag,
    attrs: { ...attrs },
    parentElement: null,
    childNodes: [],
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
  };
  for (const c of children) {
    if (typeof c === 'string') node.childNodes.push({ nodeType: 3, nodeValue: c, parentElement: node });
    else {
      c.parentElement = node;
      node.childNodes.push(c);
    }
  }
  return node;
}
const text = (node, i = 0) => node.childNodes.filter((c) => c.nodeType === 3)[i];
// The cursor is inherited: an element shows the pointing hand when it or an ancestor sets it.
const pointer = (e) => {
  for (let n = e; n; n = n.parentElement) if (n.attrs && n.attrs.style === 'cursor:pointer') return true;
  return false;
};

// Shape's own copy, as `known` vouches for it: the app's catalogs (a translation counts under its
// English words) or the website's list. Anything else on a control is data, never a label.
const COPY = new Map([
  ['Start session', 'Start session'], ['Coaches', 'Coaches'], ['Close', 'Close'], ['Settings', 'Settings'],
  ['# new messages', '# new messages'], ['Book # · $#', 'Book # · $#'], ['Train', 'Train'], ['Entrenar', 'Train'],
  ['Send #', 'Send #'], ['Breakfast', 'Breakfast'], ['Email me news', 'Email me news'], ['Message', 'Message'],
  ['Log meal', 'Log meal'],
]);
const known = (label) => COPY.get(label) || null;

// Each case: a tree, the node the tap lands on, and what it is counted as ('' for nothing).
function cases() {
  const out = [];
  const add = (name, root, start, want) => out.push({ name, root, start, want });
  {
    const arrow = el('span', { 'aria-hidden': 'true' }, '→');
    const b = el('button', {}, 'Start session ', arrow);
    add('copy written without the arrow still names the button', b, arrow, 'Start session');
  }
  {
    const s = el('span', {}, 'Coaches');
    add('a link by its text, from a tap on the text itself', el('a', { href: '/newdesign/Coaches.html' }, s), text(s), 'Coaches');
  }
  add('aria-label before the text', el('button', { 'aria-label': 'Close' }, '×'), null, 'Close');
  add('data-track before aria-label', el('button', { 'data-track': 'Open profile', 'aria-label': 'Open Jane Smith’s profile' }, '›'), null, 'Open profile');
  add('title when there is no other name', el('button', { title: 'Settings' }, el('svg', {}, el('title', {}, 'gear'))), null, 'Settings');
  add('digits read as #', el('button', {}, '3 new messages'), null, '# new messages');
  add('a time and a price read as #', el('button', {}, 'Book 12:30 · $1,200.50'), null, 'Book # · $#');
  add('a name with an address in it is data: the kind', el('button', { 'aria-label': 'Email jane@example.com' }, '✉'), null, '[button]');
  add('a habit in an aria-label is data: the kind (Codex on #2493)', el('button', { 'aria-label': 'Options for Call mom' }, '⋯'), null, '[button]');
  add('a client’s name in a title is passed over for the copy under it', el('button', { title: 'Message Jane Smith' }, 'Message'), null, 'Message');
  add('a button showing only a name is the kind', el('button', {}, 'Jane Smith'), null, '[button]');
  add('a link showing only data is the kind', el('a', { href: '/x' }, 'My PR: 140 kg'), null, '[link]');
  add('a translation counts under its English words', el('button', {}, 'Entrenar'), null, 'Train');
  add('a row’s text in two places is the row, never the name in it', el('button', {}, el('div', {}, 'Jane Smith'), el('div', {}, 'See you at 6')), null, '[row]');
  add('text past the label limit is a card', el('a', { href: '/x' }, 'A long paragraph of text that is far too long to be the name of any button'), null, '[row]');
  add('a button with no text is counted by its kind', el('button', {}, el('svg', {}, el('path', {}))), null, '[button]');
  add('a link with no text likewise', el('a', { href: '/' }, el('img', { src: '/x.png' })), null, '[link]');
  add('a tab by its role', el('div', { role: 'tab' }, 'Train'), null, 'Train');
  add('a role that is a prototype key is no control', el('div', { role: 'constructor' }, 'X'), null, '');
  add('an anchor with no href is no control', el('a', {}, 'Nowhere'), null, '');
  add('a submit button by its value', el('input', { type: 'submit', value: 'Send 2' }), null, 'Send #');
  add('a text field is never counted', el('input', { type: 'text', value: 'my secret' }), null, '');
  add('an input with no type is a text field', el('input', {}), null, '');
  add('a textarea is never counted', el('textarea', {}, 'typed words'), null, '');
  add('a select is never counted', el('select', {}, el('option', {}, 'A')), null, '');
  add('an editable area is never counted', el('div', { contenteditable: 'true' }, el('button', {}, 'B')), null, '');
  add('a label is left to the field it opens', el('label', {}, 'Remember me'), null, '');
  {
    const inner = el('button', {}, 'Delete');
    add('anything inside data-no-track is not counted, however far up', el('div', { 'data-no-track': '' }, el('div', {}, el('div', {}, el('div', {}, el('div', {}, el('div', {}, el('div', {}, el('div', {}, el('div', {}, inner))))))))), inner, '');
  }
  {
    const span = el('span', {}, 'Breakfast');
    const row = el('div', { style: 'cursor:pointer' }, el('div', {}, span));
    add('a plain element with a pointing hand is a row, named by its short text', el('main', {}, row), span, 'Breakfast');
  }
  {
    const name = el('span', {}, 'Jane Smith');
    const row = el('div', { style: 'cursor:pointer' }, name, el('span', {}, 'Checked in 2 days ago'));
    add('a pointing-hand row with a name and a status is only a row', el('main', {}, row), name, '[row]');
  }
  {
    const p = el('p', {}, 'Some words');
    add('the page itself showing the hand is nothing', el('body', { style: 'cursor:pointer' }, p), p, '');
  }
  add('a tap on plain text is nothing', el('p', {}, 'Words'), null, '');
  {
    const cb = el('input', { type: 'checkbox' });
    cb.labels = [el('label', {}, 'Email me news')];
    add('a checkbox by its label', cb, null, 'Email me news');
  }
  return out;
}

function runCases(rules) {
  return cases().map(({ name, root, start, want }) => {
    const t = rules.clickTarget(start || root, pointer);
    return { name, got: t ? rules.controlLabel(t, known) : '', want };
  });
}

test('rules: what a tap is counted as', () => {
  for (const { name, got, want } of runCases(C)) assert.equal(got, want, name);
});

test('rules: with no copy to vouch, only data-track names a control', () => {
  const t = (node) => C.clickTarget(node, pointer);
  assert.equal(C.controlLabel(t(el('button', {}, 'Coaches'))), '[button]');
  assert.equal(C.controlLabel(t(el('button', { 'aria-label': 'Close' }, '×')), () => { throw new Error('x'); }), '[button]', 'a broken list vouches for nothing');
  assert.equal(C.controlLabel(t(el('button', { 'data-track': 'Open profile' }, 'Jane'))), 'Open profile');
});

test('rules: the app’s copy is its catalogs, each string to its English words, never a placeholder', () => {
  const resources = {
    en: { common: { 'nav.train': 'Train', 'nav.home': 'Home', greet: 'Hi {name}', count: '{n, plural, one {# day} other {# days}}', long: 'Start session' } },
    es: { common: { 'nav.train': 'Entrenar', 'nav.home': 'Inicio', greet: 'Hola {name}', only: 'Solo aquí' } },
  };
  const es = C.copyIndex(resources, 'es');
  assert.equal(es.get('Entrenar'), 'Train');
  assert.equal(es.get('Inicio'), 'Home');
  assert.equal(es.get('Train'), 'Train', 'English is read too, in any language');
  assert.equal(es.get('Solo aquí'), 'Solo aquí', 'a string English lacks keeps its own words');
  assert.ok(![...es.keys()].some((k) => k.includes('{') || k.startsWith('Hola') || k.startsWith('Hi')), 'a placeholder’s words come from data');
  assert.equal(C.copyIndex(null, 'en').size, 0);
  assert.equal(C.copyIndex({ en: { x: null, y: { k: 3 } } }, 'en').size, 0);
});

test('rules: labels and pages are cleaned the same way every time', () => {
  assert.equal(C.cleanLabel('  Save\n\tnow  '), 'Save now');
  assert.equal(C.cleanLabel('x'.repeat(100)).length, C.LABEL_MAX);
  assert.ok(C.cleanLabel('x'.repeat(100)).endsWith('…'));
  assert.equal(C.cleanLabel(C.cleanLabel('Book 12:30')), 'Book #', 'cleaning twice changes nothing');
  assert.equal(C.cleanLabel(null), '');
  assert.equal(C.cleanPage('/newdesign/Coaches.html?u=jane&utm_source=x#top'), '/newdesign/Coaches.html', 'no query: a link’s tags and ids stay out');
  assert.equal(C.cleanPage('/coach/0f9c7a52-8a3e-4b1d-9c55-1d2e3f4a5b6c/book'), '/coach/:id/book');
  assert.equal(C.cleanPage('/u/123/edit'), '/u/:n/edit');
  assert.equal(C.cleanPage('Your mornings'), 'Your mornings', 'an app screen name');
  assert.equal(C.cleanPage('/' + 'a'.repeat(200)).length, C.PAGE_MAX);
});

test('rules: a buffer counts taps per page and label, and a batch carries them once', () => {
  const buf = new Map();
  assert.equal(C.addClick(buf, '/a', 'Save'), true);
  C.addClick(buf, '/a', 'Save');
  C.addClick(buf, '/a?x=1', 'Save', 'the query is not a new page');
  C.addClick(buf, '/b', 'Save');
  assert.equal(C.addClick(buf, '', 'Save'), false, 'no page, nothing counted');
  assert.equal(C.addClick(buf, '/a', '   '), false, 'no label, nothing counted');
  for (let i = 0; i < 100; i += 1) C.addClick(buf, '/c', 'Spam');
  assert.deepEqual(C.takeBatch(buf), [
    { page: '/a', target: 'Save', n: 3 },
    { page: '/b', target: 'Save', n: 1 },
    { page: '/c', target: 'Spam', n: C.COUNT_MAX },
  ]);
  assert.equal(buf.size, 0, 'taking a batch empties the buffer');
  // A batch carries at most TAPS_MAX taps in all (Codex on #2493).
  for (const page of ['/x', '/y']) for (let i = 0; i < 40; i += 1) C.addClick(buf, page, 'Go');
  assert.equal(C.tapsIn(buf), 80);
  assert.deepEqual(C.takeBatch(buf), [{ page: '/x', target: 'Go', n: 40 }, { page: '/y', target: 'Go', n: C.TAPS_MAX - 40 }]);
});

test('rules: the server keeps only a clean batch', () => {
  assert.equal(C.cleanBatch(null), null);
  assert.equal(C.cleanBatch({ surface: 'tv', clicks: [{ page: '/', target: 'x', n: 1 }] }), null, 'a surface is web or app');
  assert.equal(C.cleanBatch({ surface: 'web', clicks: 'x' }), null);
  assert.equal(C.cleanBatch({ surface: 'web', clicks: [{ page: '', target: 'x', n: 1 }, { page: '/', target: 'x', n: 0 }] }), null, 'nothing to count');
  const many = Array.from({ length: 60 }, (_, i) => ({ page: `/p${i}`, target: 'Go', n: 1 }));
  assert.equal(C.cleanBatch({ surface: 'app', clicks: many }).rows.length, C.BATCH_MAX);
  assert.deepEqual(
    C.cleanBatch({
      surface: 'web',
      clicks: [
        { page: '/a?token=secret', target: 'Pay 20', n: 2 },
        { page: '/a', target: 'Pay 30', n: 49 },
        { page: '/b', target: 'Go', n: '3' },
        { page: '/c', target: 'Go', n: 1e9 },
        { page: '/d', target: 'Go', n: -4 },
        'junk',
      ],
    }),
    {
      surface: 'web',
      rows: [
        { page: '/a', target: 'Pay #', n: C.COUNT_MAX },
        { page: '/b', target: 'Go', n: 3 },
        { page: '/c', target: 'Go', n: C.TAPS_MAX - 2 - 49 - 3 },
      ],
    },
    'one row holds at most COUNT_MAX taps, and the batch at most TAPS_MAX in all',
  );
  // A script claiming 40 rows of 50 taps gets TAPS_MAX in all (Codex on #2493).
  const claimed = C.cleanBatch({ surface: 'web', clicks: Array.from({ length: 40 }, (_, i) => ({ page: '/x', target: `Item ${'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'[i]}`, n: 50 })) });
  assert.equal(claimed.rows.reduce((t, r) => t + r.n, 0), C.TAPS_MAX);
});

// ── The website's copy ────────────────────────────────────────────────────────────────────
// The website's copy list, as the deploy writes it to /newdesign/nd/click-vocab.json.
const SITE_COPY = ['Coaches', 'Find a coach', 'Go', 'Pricing'];
function loadCopy({ consent = null, gpc = false, timeZone = 'America/New_York', vocab = SITE_COPY } = {}) {
  const listeners = {};
  const winListeners = {};
  const sent = [];
  const asked = [];
  const timers = [];
  const store = { 'shape.consent.v1': consent };
  const win = {
    document: {
      visibilityState: 'visible',
      addEventListener: (type, fn, opts) => { listeners[type] = { fn, opts }; },
    },
    addEventListener: (type, fn) => { winListeners[type] = fn; },
    localStorage: { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
    navigator: { globalPrivacyControl: gpc },
    location: { pathname: '/newdesign/Coaches.html' },
    getComputedStyle: (e) => ({ cursor: pointer(e) ? 'pointer' : 'auto' }),
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    fetch: (url, init) => {
      if (url === '/newdesign/nd/click-vocab.json') {
        asked.push({ url, init });
        return Promise.resolve(vocab ? { ok: true, json: async () => vocab } : { ok: false });
      }
      sent.push({ url, init, body: JSON.parse(init.body) });
      return Promise.resolve({ ok: true });
    },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) },
    Map,
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(read('public/click-capture.js'), win);
  // The page finishes loading: the copy list is fetched (consent allowing) and read.
  const loaded = async () => {
    if (winListeners.load) winListeners.load();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  return { win, listeners, winListeners, sent, asked, timers, loaded, tap: (target) => listeners.click.fn({ target }) };
}

test('copy: public/click-capture.js counts exactly as the module does', () => {
  const { win } = loadCopy();
  const copy = win.shapeClickCapture;
  assert.deepEqual(runCases(copy), runCases(C), 'every case, the same label');
  for (const k of ['LABEL_MAX', 'PAGE_MAX', 'BATCH_MAX', 'COUNT_MAX', 'TAPS_MAX']) assert.equal(copy[k], C[k], k);
  assert.deepEqual({ ...copy.UNNAMED }, { ...C.UNNAMED });
  for (const v of ['  Save\n now ', 'x'.repeat(100), 'Book 12:30 · $1,200.50', 'mail a@b.co', null]) assert.equal(copy.cleanLabel(v), C.cleanLabel(v), String(v));
  for (const v of ['/a?b#c', '/coach/0f9c7a52-8a3e-4b1d-9c55-1d2e3f4a5b6c/x', '/u/12', 'x'.repeat(200), null]) assert.equal(copy.cleanPage(v), C.cleanPage(v), String(v));
  const a = new Map();
  const b = new Map();
  for (const [p, l] of [['/a', 'Save'], ['/a', 'Save'], ['/b?x', 'Go 2'], ['', 'x']]) {
    assert.equal(copy.addClick(a, p, l), C.addClick(b, p, l));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(copy.takeBatch(a))), C.takeBatch(b));
  for (let i = 0; i < 70; i += 1) {
    copy.addClick(a, `/p${i % 3}`, 'Go');
    C.addClick(b, `/p${i % 3}`, 'Go');
  }
  assert.equal(copy.tapsIn(a), C.tapsIn(b));
  assert.equal(copy.batchFull(a), C.batchFull(b));
  assert.deepEqual(JSON.parse(JSON.stringify(copy.takeBatch(a))), C.takeBatch(b), 'the same TAPS_MAX trim');
});

test('copy: taps on a page are sent together, with the page and the session cookie, and only with consent', async () => {
  const site = loadCopy();
  await site.loaded();
  assert.deepEqual(site.asked.map((a) => [a.url, a.init.credentials]), [['/newdesign/nd/click-vocab.json', 'omit']], 'the copy list, once, with no cookie');
  assert.deepEqual({ ...site.listeners.click.opts }, { capture: true, passive: true }, 'it listens without getting in the way');
  const b = el('button', {}, 'Find a coach');
  site.tap(b);
  site.tap(text(b));
  site.tap(el('input', { type: 'text' }));
  assert.equal(site.sent.length, 0, 'nothing is sent per tap');
  assert.equal(site.timers.length, 1, 'one timer for the batch');
  site.winListeners.pagehide();
  assert.equal(site.sent.length, 1, 'leaving the page sends what is waiting');
  const [{ url, init, body }] = site.sent;
  assert.equal(url, '/api/analytics/clicks');
  assert.equal(init.method, 'POST');
  assert.equal(init.keepalive, true, 'it survives the page closing');
  assert.equal(init.credentials, 'same-origin', 'the cookie tells a member from a visitor');
  assert.deepEqual(body, { surface: 'web', clicks: [{ page: '/newdesign/Coaches.html', target: 'Find a coach', n: 2 }] });
  site.winListeners.pagehide();
  assert.equal(site.sent.length, 1, 'an empty buffer sends nothing');

  for (const [opts, why] of [
    [{ consent: 'reject' }, 'a Reject'],
    [{ gpc: true }, 'Global Privacy Control'],
    [{ timeZone: 'Europe/Paris' }, 'the EEA with no choice yet'],
    [{ timeZone: 'Atlantic/Canary' }, 'the EEA outside Europe/*'],
    [{ timeZone: '' }, 'an unknown region'],
  ]) {
    const s = loadCopy(opts);
    await s.loaded();
    s.tap(el('button', {}, 'Go'));
    s.winListeners.pagehide();
    assert.equal(s.sent.length, 0, `nothing counted with ${why}`);
    assert.equal(s.asked.length, 0, `nothing fetched with ${why}`);
  }
  const accepted = loadCopy({ consent: 'accept', timeZone: 'Europe/Paris' });
  await accepted.loaded();
  accepted.tap(el('button', {}, 'Go'));
  accepted.winListeners.pagehide();
  assert.equal(accepted.sent.length, 1, 'the EEA after an Accept');
});

test('copy: a label is the site’s copy or the control’s kind; before the list arrives, the kind', async () => {
  const site = loadCopy();
  site.tap(el('button', {}, 'Find a coach'));
  await site.loaded();
  site.tap(el('button', {}, 'Find a coach'));
  site.tap(el('button', { 'aria-label': 'Open Jane Smith drilldown' }, 'Jane Smith'));
  site.tap(el('a', { href: '/x' }, 'Call mom'));
  site.winListeners.pagehide();
  assert.deepEqual(site.sent[0].body.clicks, [
    { page: '/newdesign/Coaches.html', target: '[button]', n: 2 },
    { page: '/newdesign/Coaches.html', target: 'Find a coach', n: 1 },
    { page: '/newdesign/Coaches.html', target: '[link]', n: 1 },
  ]);
  const local = loadCopy({ vocab: null });
  await local.loaded();
  local.tap(el('button', {}, 'Find a coach'));
  local.winListeners.pagehide();
  assert.deepEqual(local.sent[0].body.clicks, [{ page: '/newdesign/Coaches.html', target: '[button]', n: 1 }], 'no list (a local checkout): kinds only');
});

test('copy: loading twice starts one listener', () => {
  const site = loadCopy();
  const first = site.listeners.click.fn;
  vm.runInContext(read('public/click-capture.js'), site.win);
  assert.equal(site.listeners.click.fn, first);
});

// ── The app: the module’s own starter ─────────────────────────────────────────────────────
test('app: the starter counts per screen, asks consent at each tap and sends when hidden', () => {
  const listeners = {};
  const winListeners = {};
  const sent = [];
  let allowed = true;
  let screen = 'Home';
  const win = {
    document: { visibilityState: 'visible', addEventListener: (type, fn) => { listeners[type] = fn; } },
    addEventListener: (type, fn) => { winListeners[type] = fn; },
    getComputedStyle: (e) => ({ cursor: pointer(e) ? 'pointer' : 'auto' }),
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const started = C.startClickCapture({ win, surface: 'app', page: () => screen, allowed: () => allowed, known, send: (b) => sent.push(b) });
  assert.ok(started);
  assert.equal(C.startClickCapture({ win, surface: 'app', page: () => '', allowed: () => true, send: () => {} }), null, 'once per window');
  listeners.click({ target: el('button', {}, 'Log meal') });
  screen = 'Train';
  listeners.click({ target: el('button', {}, 'Log meal') });
  allowed = false;
  listeners.click({ target: el('button', {}, 'Not counted') });
  win.document.visibilityState = 'hidden';
  listeners.visibilitychange();
  assert.deepEqual(sent, [{ surface: 'app', clicks: [{ page: 'Home', target: 'Log meal', n: 1 }, { page: 'Train', target: 'Log meal', n: 1 }] }]);
  const many = { ...win, __shapeClickCapture: false };
  const out = [];
  const l2 = {};
  many.document = { visibilityState: 'visible', addEventListener: (t, fn) => { l2[t] = fn; } };
  C.startClickCapture({ win: many, surface: 'app', page: () => 'Home', allowed: () => true, known: (l) => l, send: (b) => out.push(b) });
  for (let i = 0; i < C.BATCH_MAX; i += 1) l2.click({ target: el('button', {}, `Item ${'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'[i]}`) });
  assert.equal(out.length, 1, 'a full buffer goes at once');
  assert.equal(out[0].clicks.length, C.BATCH_MAX);
  const busy = { ...win, __shapeClickCapture: false };
  const got = [];
  const l3 = {};
  busy.document = { visibilityState: 'visible', addEventListener: (t, fn) => { l3[t] = fn; } };
  C.startClickCapture({ win: busy, surface: 'app', page: () => 'Home', allowed: () => true, known: (l) => l, send: (b) => got.push(b) });
  for (let i = 0; i < C.TAPS_MAX; i += 1) l3.click({ target: el('button', {}, 'Next') });
  assert.deepEqual(got, [{ surface: 'app', clicks: [{ page: 'Home', target: 'Next', n: C.COUNT_MAX }] }], 'one control at COUNT_MAX goes at once, so no tap is lost');
  busy.document.visibilityState = 'hidden';
  l3.visibilitychange();
  assert.deepEqual(got[1], { surface: 'app', clicks: [{ page: 'Home', target: 'Next', n: C.TAPS_MAX - C.COUNT_MAX }] }, 'the rest follow');
  got.length = 0;
  for (let i = 0; i < C.TAPS_MAX; i += 1) l3.click({ target: el('button', {}, `Item ${'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'[i % 30]}`) });
  assert.equal(got.length, 1, 'TAPS_MAX taps across controls go at once');
  assert.equal(got[0].clicks.reduce((t, r) => t + r.n, 0), C.TAPS_MAX);
});

// ── The route ─────────────────────────────────────────────────────────────────────────────
async function loadRoute({ user = null, rpcError = null } = {}) {
  const calls = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/analytics/clicks/route.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/click-capture.mjs', C],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true })],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: 1, error: rpcError }; } }) }],
    ]),
  });
  return { route, calls };
}
const post = (body, headers = {}) =>
  new Request('https://theshapecommunity.com/api/analytics/clicks', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('route: a clean batch is stored with the caller and address, and the answer is always 204', async () => {
  const { route, calls } = await loadRoute({ user: { id: 'u-1' } });
  const res = await route.POST(post({ surface: 'app', clicks: [{ page: 'Home', target: 'Log 2 meals', n: 2 }] }, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }));
  assert.equal(res.status, 204);
  assert.deepEqual(calls, [{
    name: 'record_ui_clicks',
    args: { p_user: 'u-1', p_ip: '203.0.113.9', p_surface: 'app', p_rows: [{ page: 'Home', target: 'Log # meals', n: 2 }], p_tz: process.env.ADMIN_TIMEZONE || 'America/New_York' },
  }]);
  const visitor = await loadRoute();
  await visitor.route.POST(post({ surface: 'web', clicks: [{ page: '/', target: 'Join', n: 1 }] }));
  assert.equal(visitor.calls[0].args.p_user, null, 'no session: a visitor');
});

test('route: junk is answered 204 and stores nothing; a failed store is still 204', async () => {
  const { route, calls } = await loadRoute();
  for (const body of ['not json', { surface: 'web' }, { surface: 'tv', clicks: [{ page: '/', target: 'x', n: 1 }] }, 'x'.repeat(20000)]) {
    assert.equal((await route.POST(post(body))).status, 204);
  }
  assert.equal(calls.length, 0);
  const failing = await loadRoute({ rpcError: { message: 'function record_ui_clicks does not exist' } });
  const warn = console.warn;
  const warned = [];
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    assert.equal((await failing.route.POST(post({ surface: 'web', clicks: [{ page: '/', target: 'Go', n: 1 }] }))).status, 204);
  } finally {
    console.warn = warn;
  }
  assert.match(warned.join('\n'), /record_ui_clicks does not exist/, 'a dead pipeline is logged');
});

test('route: it reads the caller through request-auth, so the installed app’s Bearer token counts', () => {
  const src = stripComments(read('src/app/api/analytics/clicks/route.ts'));
  assert.match(src, /import \{ currentUser \} from '@\/lib\/request-auth';/);
  assert.doesNotMatch(src, /@\/lib\/supabase\/server/);
});

// ── The page’s shaping ────────────────────────────────────────────────────────────────────
test('admin-clicks: filters, links and the call', () => {
  assert.deepEqual(A.clickFilters({}), { days: 30, surface: 'all', who: 'all' });
  assert.deepEqual(A.clickFilters({ days: '7', surface: 'web', who: 'coach' }), { days: 7, surface: 'web', who: 'coach' });
  assert.deepEqual(A.clickFilters({ days: '9999', surface: 'drop table', who: ['member', 'coach'] }), { days: 30, surface: 'all', who: 'member' });
  const f = A.clickFilters({ days: '90', who: 'visitor' });
  assert.equal(A.clicksHref(f), '/admin?view=clicks&days=90&who=visitor');
  assert.equal(A.clicksHref(f, { days: 30, who: 'all' }), '/admin?view=clicks', 'defaults stay out of the link');
  assert.deepEqual(A.clickStatsArgs(f, 'America/New_York'), { p_days: 90, p_surface: null, p_audience: 'visitor', p_tz: 'America/New_York' });
});

test('admin-clicks: pages and controls are named for people', () => {
  assert.equal(A.pageName('web', '/'), 'Home page');
  assert.equal(A.pageName('web', '/newdesign/index.html'), 'Home page');
  assert.equal(A.pageName('web', '/newdesign/Coaches.html'), 'Coaches');
  assert.equal(A.pageName('web', '/privacy.html'), 'privacy');
  assert.equal(A.pageName('app', 'Your mornings'), 'Your mornings');
  assert.equal(A.pageName('app', ''), 'App');
  assert.deepEqual(A.targetName('[row]'), { text: 'A row or card', unnamed: true });
  assert.deepEqual(A.targetName('[button]'), { text: 'A button without a fixed label', unnamed: true });
  assert.deepEqual(A.targetName('Find a coach'), { text: 'Find a coach', unnamed: false });
  assert.equal(A.shareOf(1, 3), '33%');
  assert.equal(A.shareOf(1, 0), '');
});

const STATS = {
  generated_at: '2026-10-28T15:00:00Z',
  from: '2026-10-22',
  to: '2026-10-28',
  days: 7,
  total: 40,
  by_surface: { web: 30, app: 10 },
  by_audience: { visitor: 25, member: 12, coach: 3 },
  daily: [{ day: '2026-10-27', clicks: 15 }, { day: '2026-10-28', clicks: 25 }],
  pages: [{ surface: 'web', page: '/newdesign/Coaches.html', clicks: 22 }, { surface: 'app', page: 'Home', clicks: 10 }],
  targets: [
    { surface: 'web', page: '/newdesign/Coaches.html', target: 'Find a coach', clicks: 14 },
    { surface: 'app', page: 'Home', target: '[row]', clicks: 6 },
  ],
};

test('admin-clicks: the summary reads what it is given and nothing else', () => {
  const s = A.clickSummary(STATS);
  assert.equal(s.total, 40);
  assert.deepEqual(s.surfaces, { web: 30, app: 10 });
  assert.deepEqual(s.audiences, { visitor: 25, member: 12, coach: 3 });
  assert.deepEqual(s.pages[0], { surface: 'web', page: '/newdesign/Coaches.html', name: 'Coaches', clicks: 22 });
  assert.deepEqual(s.targets[1], { surface: 'app', page: 'Home', target: 'A row or card', unnamed: true, clicks: 6 });
  const empty = A.clickSummary(null);
  assert.equal(empty.total, 0);
  assert.deepEqual([empty.daily, empty.pages, empty.targets], [[], [], []]);
  assert.equal(A.clickSummary({ total: 'NaN', pages: 'x', targets: [null, 3] }).targets.length, 0);
});

// ── The Overview's Clicks view ───────────────────────────────────────────────────────────
async function renderView({ searchParams = {}, result }) {
  const ui = await loadRealModule(join(ROOT, 'src/app/admin/ui.tsx'), { typescript: true });
  const view = await loadRealModule(join(ROOT, 'src/app/admin/ClicksView.tsx'), {
    typescript: true,
    registry: new Map([
      ['next/link', { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) }],
      ['@/lib/admin-overview.mjs', overview],
      ['@/lib/admin-clicks.mjs', A],
      ['./ui', ui],
    ]),
  });
  return renderToStaticMarkup(React.createElement(view.default, { filters: A.clickFilters(searchParams), result }));
}
const shown = (data) => ({ data, missing: false, failed: false });

test('view: the totals, the days, the pages and the controls, with filters that keep each other', async () => {
  const html = await renderView({ searchParams: { days: '7' }, result: shown(STATS) });
  for (const want of ['Where people tap', 'Taps', 'Website', 'Visitors', 'Coaches', 'Find a coach', 'A row or card', 'Pages with the most taps', 'How taps are counted', '75% of taps']) {
    assert.ok(html.includes(want), want);
  }
  assert.ok(html.includes('href="/admin?view=clicks&amp;days=7&amp;surface=web"'), 'a filter keeps the others');
  assert.ok(html.includes('href="/admin?view=clicks&amp;days=7" aria-current="page"'), 'the open filter is marked');
  assert.match(html, />App<\/span><span class="text-3xl/, 'unfiltered: the App tile');
  assert.ok(html.includes('>Visitors</span><span class="text-3xl'), 'unfiltered: the audience tiles');
  assert.ok(!/NaN|undefined/.test(html));
});

test('view: a filter hides the split it already made; nothing counted yet says so; a missing migration says which', async () => {
  const web = await renderView({ searchParams: { surface: 'web', who: 'member' }, result: shown(STATS) });
  assert.ok(!/>App<\/span><span class="text-3xl/.test(web), 'no App tile when the view shows the website alone');
  assert.ok(!web.includes('>Visitors</span><span class="text-3xl'), 'no audience tiles when one audience is shown');
  const none = await renderView({ result: shown({ ...STATS, total: 0, daily: [], pages: [], targets: [] }) });
  assert.ok(none.includes('No taps counted in these days yet.'));
  const missing = await renderView({ result: { data: null, missing: true, failed: false } });
  assert.ok(missing.includes('2026-10-28-click-counts.sql'));
  assert.ok(!missing.includes('Pages with the most taps'));
  const failed = await renderView({ result: { data: STATS, missing: false, failed: true } });
  assert.ok(failed.includes('could not be loaded') && !failed.includes('Find a coach'), 'a failed read shows nothing it read');
});

test('view: a tab on the Overview, not a page of its own', () => {
  assert.deepEqual(overview.OVERVIEW_VIEWS.find((v) => v.key === 'clicks'), { key: 'clicks', label: 'Clicks', sections: [], blurb: 'Where people tap, on the website and in the app' });
  assert.equal(overview.viewHref('clicks'), '/admin?view=clicks');
  assert.ok(!levels.CONSOLE_PAGES.some((p) => /click/i.test(p.href)), 'no sidebar page');
});

// ── The migration ─────────────────────────────────────────────────────────────────────────
test('migration: daily totals only, the service role’s alone, one transaction, guarded', () => {
  const sql = read('supabase-migrations/2026-10-28-click-counts.sql');
  const code = sql.replace(/--.*$/gm, '');
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /commit;\s*$/);
  const table = /create table if not exists public\.ui_click_counts \(([\s\S]*?)\n\);/.exec(code)[1];
  assert.deepEqual([...table.matchAll(/^\s+(\w+)\s/gm)].map((m) => m[1]), ['day', 'surface', 'audience', 'page', 'target', 'clicks', 'primary'], 'no account, device or address column');
  assert.match(code, /alter table public\.ui_click_counts enable row level security;/);
  assert.doesNotMatch(code, /create policy/, 'no policy: nobody reads it through the API');
  for (const sig of ['ui_click_day\\(text\\)', 'record_ui_clicks\\(uuid, text, text, jsonb, text\\)', 'admin_click_stats\\(integer, text, text, text\\)']) {
    assert.match(code, new RegExp(`revoke all on function public\\.${sig} from public, anon, authenticated;`), sig);
    assert.match(code, new RegExp(`grant execute on function public\\.${sig} to service_role;`), sig);
  }
  assert.match(code, /_rate_limit_bump\(\s*'fn:ui_clicks:'/, 'each caller is capped');
  assert.match(code, /set search_path = public, pg_temp/);
  assert.match(code, /do \$guard\$[\s\S]*raise exception/);
  // The purge drops the counts with the events.
  assert.match(read('src/app/api/cron/analytics-purge/route.ts'), /from\('ui_click_counts'\)\.delete\(\)\.lt\('day', cutoff\.slice\(0, 10\)\)/);
});

test('migration: the follow-up caps a batch at TAPS_MAX taps and 20 a minute, and counts dietitians as coaches', () => {
  const code = read('supabase-migrations/2026-10-29-click-counts-caps.sql').replace(/--.*$/gm, '');
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /commit;\s*$/);
  assert.match(code, /where total\.taps <= 60\n/, 'a batch over 60 taps is refused whole');
  assert.equal(C.TAPS_MAX, 60, 'the route trims to what SQL accepts, so a real batch is never refused');
  assert.match(code, /_rate_limit_bump\(\s*'fn:ui_clicks:'[^;]*\), 20, 60\s*\)/);
  assert.match(code, /array\['trainer', 'nutritionist', 'dietitian'\]/);
  assert.match(code, /p\.role in \('trainer', 'nutritionist', 'dietitian'\)/);
  assert.match(code, /revoke all on function public\.record_ui_clicks\(uuid, text, text, jsonb, text\) from public, anon, authenticated;/);
  assert.match(code, /do \$guard\$[\s\S]*raise exception/);
});

// ── The website's copy list ───────────────────────────────────────────────────────────────
test('copy list: the site’s own strings, cleaned as labels; never data, code or colours', async () => {
  const { buildClickVocab } = await import('../scripts/click-vocab.mjs');
  const list = buildClickVocab();
  assert.deepEqual(list, [...new Set(list)].sort(), 'sorted, each once');
  assert.ok(list.every((l) => l === C.cleanLabel(l) && /\p{L}/u.test(l)), 'each is a label as a tap reads it');
  const has = new Set(list);
  for (const want of ['Coaches', 'Pricing', 'Privacy Policy', 'Accept', 'Open client drilldown']) assert.ok(has.has(want), want);
  for (const never of ['Jane Smith', 'Call mom', '#0a8f87', 'flex-start', 'shape.consent.v1', 'bsMagazine']) assert.ok(!has.has(C.cleanLabel(never)), never);
  assert.ok(list.length > 5000 && JSON.stringify(list).length < 400_000, `${list.length} labels: the whole site, at a size a page can fetch once`);
});

test('copy list: written at deploy beside the compiled pages, read before they are rewritten', () => {
  const build = read('scripts/build-newdesign.mjs');
  assert.match(build, /import \{ buildClickVocab \} from '\.\/click-vocab\.mjs';/);
  const at = build.indexOf('const clickVocab = buildClickVocab(ROOT);');
  assert.ok(at > 0 && at < build.indexOf('const pages = fs.readdirSync(ND)'), 'before the pages’ inline blocks leave the HTML');
  assert.match(build, /if \(!CHECK\) fs\.writeFileSync\(path\.join\(OUT, 'click-vocab\.json'\), JSON\.stringify\(clickVocab\)\);/);
  assert.match(read('.gitignore'), /^\/public\/newdesign\/nd$/m, 'never committed');
  assert.match(read('public/click-capture.js'), /var VOCAB_URL = '\/newdesign\/nd\/click-vocab\.json';/);
});

// ── The wiring ────────────────────────────────────────────────────────────────────────────
test('wiring: every website page counts taps, and the app does, both behind the consent rule', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  assert.match(shell, /\(function shapeClickCaptureLoader\(\) \{[\s\S]*?s\.src = "\/click-capture\.js";/);
  const standalone = ['privacy', 'terms', 'help', 'contact', 'privacy-request', 'code-of-conduct', 'health-data-privacy', 'data-compliance', 'subprocessors'];
  for (const f of ['public/newdesign/ClientPlaylists.html', 'public/newdesign/consultation.html', ...standalone.map((n) => `public/${n}.html`)]) {
    assert.match(read(f), /<script defer src="\/click-capture\.js"><\/script>/, `${f} has no shell, so loads it itself`);
  }
  const app = stripComments(read('mobile-app/src/services/analytics.js'));
  assert.match(app, /import \{ startClickCapture \} from '\.\.\/\.\.\/\.\.\/src\/lib\/click-capture\.mjs';/);
  assert.match(app, /surface: 'app',\s+page: clickScreen,\s+allowed: \(\) => !consentBlocked\(\),/);
  assert.match(app, /known: \(label\) => \(typeof window\.bsClickCopy === 'function' \? window\.bsClickCopy\(label\) : null\),/, 'the app’s copy vouches for a label');
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /import \{ copyIndex \} from '\.\.\/\.\.\/\.\.\/src\/lib\/click-capture\.mjs';/);
  assert.match(main, /window\.bsClickCopy = \(label\) => \{\n\s+const lng = bsI18n\.language \|\| 'en';\n\s+if \(!bsClickCopyIndex \|\| bsClickCopyIndex\.lng !== lng\) bsClickCopyIndex = \{ lng, map: copyIndex\(bsI18n\.store && bsI18n\.store\.data, lng\) \};/, 'from the loaded catalogs, again on a language change');
  assert.match(app, /api\('\/api\/analytics\/clicks', init\)/, 'through ShapeApi.fetch: the API base and the Bearer token');
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx'), /useEffectBSM\(\(\) => \{ window\.bsClickStage = stage; \}, \[stage\]\);/);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /function bsScreenName\(\) \{ return _bsNoraOpen\.page \? String\(_bsNoraOpen\.page\) : ''; \}/);
  assert.match(client, /Object\.assign\(window, \{ bsNoraOpen, [^}]*\bbsScreenName, /, 'on window, for services/analytics.js');
});

test('wiring: a control whose name is a person’s is counted by a fixed label', () => {
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), /onClick=\{\(\) => open\(p\)\} data-track="Open profile" aria-label=\{tr\('common:search\.openProfileAria'/);
  assert.match(read('public/newdesign/dashRoster.jsx'), /aria-label=\{"Open " \+ rec\.profile\.name \+ " drilldown"\}\n\s+data-track="Open client drilldown"/);
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'), /data-track="Remove file" aria-label=\{`Remove \$\{file\.name\}`\}/);
});

test('wiring: the banner says its choice covers the website’s usage stats too', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  const recorded = /var BANNER_COPY = "([^"]+)";/.exec(shell)[1];
  assert.match(recorded, /Shape's first-party usage stats on this site and in the app\./);
});
